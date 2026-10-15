#!/bin/bash
# pos-deploy-receive — the ONLY command the POS deploy key may run on vavoom-station (the demo POS's host,
# which is also the production backend VM). It is the forced command of the `pos-deploy` user's single key:
#
#   ~pos-deploy/.ssh/authorized_keys:
#   restrict,command="/usr/local/bin/pos-deploy-receive" ssh-ed25519 AAAA… pos-deploy@github-actions
#
# so whatever the client asks for, sshd runs this script, with the client's words in $SSH_ORIGINAL_COMMAND:
#
#   deploy     (default) read a gzip tarball of the built POS (`tar -czf - -C dist .`) on stdin, check it, back up
#              /opt/vavoom/pos, then unpack it there: the assets first and index.html last, so a page loading
#              mid-deploy never points at a file that is not there yet. Old assets are kept, as the manual
#              deploys always did, so a page loaded before the deploy keeps working.
#   rollback   put back the newest backup (the POS as it was before the last deploy).
#   status     print the bundle pos.vavoom.io serves and the backups kept.
#
# It cannot run anything else, write anywhere but /opt/vavoom/pos and its own state directory, or use sudo.
# Installed by deploy/README.md's setup steps (as root: install -o root -g root -m 755 this file
# /usr/local/bin/pos-deploy-receive). The GitHub workflow that calls it is .github/workflows/deploy.yml.
set -euo pipefail
umask 022

POS=${POS_DEPLOY_TARGET:-/opt/vavoom/pos}          # the env overrides are for testing only: sshd passes no
STATE=${POS_DEPLOY_STATE:-/var/lib/pos-deploy}     # client environment to a forced command
MAX_BYTES=$((50 * 1024 * 1024))                    # a build is about 1 MB; anything near this is not a build
KEEP=20                                            # backups kept

served() { grep -o 'index-[A-Za-z0-9_-]*\.js' "$POS/index.html" 2>/dev/null | head -1 || true; }
log() { echo "pos-deploy: $*"; }

backup() {
  mkdir -p "$STATE/backups"
  local f="$STATE/backups/pos-$(date -u +%Y%m%d-%H%M%S).tgz"
  tar -czf "$f" -C "$POS" .
  ls -1t "$STATE/backups"/pos-*.tgz | tail -n +$((KEEP + 1)) | xargs -r rm -f
  echo "$f"
}

case "${SSH_ORIGINAL_COMMAND:-deploy}" in
  status)
    log "serving $(served)"
    ls -1t "$STATE/backups" 2>/dev/null | head -5 | sed 's/^/backup /'
    ;;
  rollback)
    last=$(ls -1t "$STATE/backups"/pos-*.tgz 2>/dev/null | head -1)
    [ -n "$last" ] || { log "no backup to roll back to"; exit 1; }
    before=$(served)
    tar -xzf "$last" -C "$POS" --no-same-owner --no-same-permissions
    log "rolled back to $(basename "$last"): $before -> $(served)"
    ;;
  deploy)
    mkdir -p "$STATE/incoming"
    work=$(mktemp -d "$STATE/incoming/release-XXXXXX")
    trap 'rm -rf "$work"' EXIT
    head -c $((MAX_BYTES + 1)) > "$work/build.tgz"
    [ "$(stat -c %s "$work/build.tgz")" -le "$MAX_BYTES" ] || { log "refused: the upload is over $MAX_BYTES bytes"; exit 1; }
    # Every entry must be a plain relative path inside the build (no absolute path, no "..", no link).
    tar -tzvf "$work/build.tgz" > "$work/list" || { log "refused: not a gzip tarball"; exit 1; }
    if grep -qvE '^[-d]' "$work/list"; then log "refused: the tarball holds a link or a special file"; exit 1; fi
    if tar -tzf "$work/build.tgz" | grep -qE '(^/|(^|/)\.\.(/|$))'; then log "refused: a path leaves the build"; exit 1; fi
    mkdir "$work/new"
    tar -xzf "$work/build.tgz" -C "$work/new" --no-same-owner --no-same-permissions
    [ -f "$work/new/index.html" ] || { log "refused: the build has no index.html"; exit 1; }
    bundle=$(grep -o 'index-[A-Za-z0-9_-]*\.js' "$work/new/index.html" | head -1)
    [ -n "$bundle" ] && [ -f "$work/new/assets/$bundle" ] || { log "refused: index.html names no bundle in assets/"; exit 1; }
    before=$(served)
    saved=$(backup)
    # Everything but index.html, then index.html.
    (cd "$work/new" && find . -mindepth 1 -type d -print0 | xargs -0 -r -I{} mkdir -p "$POS/{}")
    (cd "$work/new" && find . -type f ! -path ./index.html -print0 | xargs -0 -r -I{} cp -f "{}" "$POS/{}")
    cp -f "$work/new/index.html" "$POS/index.html.next" && mv -f "$POS/index.html.next" "$POS/index.html"
    log "deployed $bundle (was $before); backup $(basename "$saved")"
    ;;
  *)
    log "refused: unknown command"
    exit 2
    ;;
esac
