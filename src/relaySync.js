// relaySync.js — cross-device leader/follower transport over the demo screen-sync
// relay (wss://demo-api.vavoom.io/sync). This is the cross-device counterpart to the
// same-browser BroadcastChannel mirror: BroadcastChannel only reaches tabs in the
// same browser, so it can't mirror screens that run on separate devices.
//
// A LEADER is a real surface opened in a demo (?demo= present, NO sync=follower): it
// pushes its display snapshot on every change. A FOLLOWER (?sync=follower — e.g. the
// /screens viewer iframe) receives the cached latest snapshot the instant it
// connects, then every subsequent push, and renders it read-only.
//
// No ?demo= → no-op, so real (non-demo) locations are completely unaffected.

const RECONNECT_MS = 1500;

function getDemoId() {
  try { return new URLSearchParams(window.location.search).get('demo') || ''; }
  catch { return ''; }
}

export function isFollower() {
  try { return new URLSearchParams(window.location.search).get('sync') === 'follower'; }
  catch { return false; }
}

function relayBase() {
  const h = window.location.hostname;
  const local = h === 'localhost' || h === '127.0.0.1' || h === '::1';
  return local ? 'ws://localhost:8095/sync' : 'wss://demo-api.vavoom.io/sync';
}

function connect(surface, role, { onMessage, onReady } = {}) {
  const demo = getDemoId();
  if (!demo || typeof WebSocket === 'undefined') return { send() {}, close() {} };
  const url = `${relayBase()}?demo=${encodeURIComponent(demo)}&surface=${encodeURIComponent(surface)}&role=${role}`;
  let ws = null;
  let closed = false;
  let timer = null;
  const api = {
    send(obj) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
      }
    },
    close() { closed = true; clearTimeout(timer); try { ws && ws.close(); } catch { /* ignore */ } },
  };
  const open = () => {
    try { ws = new WebSocket(url); } catch { timer = setTimeout(open, RECONNECT_MS); return; }
    ws.onopen = () => { if (onReady) onReady(api); };
    ws.onmessage = (e) => { if (onMessage) onMessage(e.data); };
    ws.onclose = () => { if (!closed) timer = setTimeout(open, RECONNECT_MS); };
    ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
  };
  open();
  return api;
}

// Leader: returns { send, close }. onReady(api) fires on each (re)connect — re-send
// the current snapshot there so a reconnect (or a relay restart) re-primes followers.
export function connectLeader(surface, opts = {}) {
  return connect(surface, 'leader', { onReady: opts.onReady });
}

// Follower: onState(snapshot) for the cached latest snapshot + every subsequent push.
export function connectFollower(surface, onState) {
  return connect(surface, 'follower', {
    onMessage: (data) => { try { onState(JSON.parse(data)); } catch { /* ignore malformed */ } },
  });
}
