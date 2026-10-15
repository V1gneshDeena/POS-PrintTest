# Deploying the demo POS (pos.vavoom.io)

The demo POS is a static site: `npm run build` writes `dist/`, and vavoom-station (the GCP VM 34.130.167.150, which is
also the production backend VM) serves `/opt/vavoom/pos` as pos.vavoom.io. Since 2026-10-15 GitHub builds, tests and
deploys it.

## CI (`.github/workflows/ci.yml`)

Every pull request, and every push to `main`, `dev` and `live/**`: `npm ci`, `npm run build`, then every offline test
suite (the 73 counter transactions, the order changes, the 100-visit pressure test in the card view and in the Spotlight
view, and the variety test). A failed check fails the run. The build and the reports are kept as artifacts.

## Deploy (`.github/workflows/deploy.yml`)

By hand only (David, 2026-10-15: "Button only"; merging never deploys):

1. GitHub → Actions → **Deploy POS (pos.vavoom.io)** → **Run workflow**.
2. Pick the branch to deploy, type `deploy`, leave action on `deploy`, Run.
3. The tests run on that branch. If they pass, the run waits for **David's approval** (the `demo-pos` environment
   has him as required reviewer): open the run, **Review deployments** → `demo-pos` → **Approve and deploy**.
4. The tested build goes to vavoom-station: the server backs up `/opt/vavoom/pos`, then unpacks the new build (the
   assets first and `index.html` last; old assets are kept so a page loaded before the deploy keeps working).
5. The job checks that pos.vavoom.io serves the new bundle and writes before → after in the run's summary.

**Roll back:** the same button with action `rollback` (no tests, still approved): it puts back the POS as it was
before the last deploy. The server keeps the 20 newest backups in `/var/lib/pos-deploy/backups/`.

## How GitHub reaches vavoom-station

GitHub holds one SSH key, in the `demo-pos` environment's secret `POS_DEPLOY_KEY`. It belongs to the user
`pos-deploy` on vavoom-station, whose `authorized_keys` allows that key exactly one program:

```
restrict,command="/usr/local/bin/pos-deploy-receive" ssh-ed25519 AAAA… pos-deploy@github-actions
```

`/usr/local/bin/pos-deploy-receive` is `deploy/pos-deploy-receive.sh` (root-owned). It runs `deploy` (read a tarball
on stdin, check it, back up, unpack), `rollback` or `status`, and refuses anything else: no shell, no sudo, no port
forwarding, and an upload with a link, a path leaving the build, no `index.html` or over 50 MB is refused. The user
owns only `/opt/vavoom/pos` and `/var/lib/pos-deploy`. The environment's variables `POS_DEPLOY_HOST`
(34.130.167.150) and `POS_DEPLOY_KNOWN_HOSTS` (vavoom-station's ed25519 host key) pin the server, so a different host
answering on that address is refused.

## Setting it up (done 2026-10-15; repeat for a new server)

On vavoom-station, as a sudo user:

```bash
sudo useradd --system --create-home --home-dir /var/lib/pos-deploy --shell /bin/sh pos-deploy
sudo install -o root -g root -m 755 pos-deploy-receive.sh /usr/local/bin/pos-deploy-receive
sudo install -d -o pos-deploy -g pos-deploy -m 700 /var/lib/pos-deploy/.ssh
echo 'restrict,command="/usr/local/bin/pos-deploy-receive" <public key>' | sudo tee /var/lib/pos-deploy/.ssh/authorized_keys
sudo chown pos-deploy:pos-deploy /var/lib/pos-deploy/.ssh/authorized_keys && sudo chmod 600 /var/lib/pos-deploy/.ssh/authorized_keys
sudo chown -R pos-deploy:pos-deploy /opt/vavoom/pos
```

On a PC with `gh` (repo admin): make a key pair with `ssh-keygen -t ed25519 -N "" -C pos-deploy@github-actions -f k`,
put `k.pub` in the `authorized_keys` line above, then

```bash
gh secret set POS_DEPLOY_KEY --env demo-pos --repo Vavoom-Technologies-codebase/vavoom-pos < k
gh variable set POS_DEPLOY_HOST --env demo-pos --repo Vavoom-Technologies-codebase/vavoom-pos --body 34.130.167.150
gh variable set POS_DEPLOY_KNOWN_HOSTS --env demo-pos --repo Vavoom-Technologies-codebase/vavoom-pos --body "$(ssh-keyscan -t ed25519 34.130.167.150)"
```

and delete `k` (GitHub keeps the only copy; it cannot be read back out).

**Rotate the key:** make a new pair, replace the `authorized_keys` line and the secret, delete the local copy.
**Turn CD off:** delete the secret (the workflow then refuses), or remove the `authorized_keys` line on the server.
**Undo the server side:** `sudo userdel -r pos-deploy && sudo rm /usr/local/bin/pos-deploy-receive`, then give
`/opt/vavoom/pos` back to its previous owner (`sudo chown -R Shadow:Shadow /opt/vavoom/pos`).

Manual deploys from a PC (`tar -czf - -C dist . | ssh … "sudo tar xzf - -C /opt/vavoom/pos"`, with a backup in
`/opt/vavoom/backups/`) still work and keep the folder's owner.
