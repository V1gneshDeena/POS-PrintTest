// posSync.js — leader/follower mirror for the POS. Cross-device via the demo
// screen-sync relay (wss://demo-api.vavoom.io/sync): the real POS (leader)
// broadcasts its live order; a POS opened with ?sync=follower (the /screens viewer
// iframe) renders that order read-only instead of the operator-login gate.
//
// Was a same-origin BroadcastChannel (same-browser only). Now goes through the relay
// so the viewer mirrors the cashier's POS even when they run on separate devices.
// The exported API is unchanged — usePos.js and PosMirror.jsx are untouched.

import { connectLeader, connectFollower, isFollower } from "./relaySync.js"

export function isPosFollower() {
  return isFollower()
}

// One lazily-created leader connection for this POS tab. readyCb re-sends the last
// snapshot whenever the relay (re)connects, so a fresh follower or a relay restart
// re-primes the mirror (the relay also caches the latest for late joiners).
let leader = null
let readyCb = null
function leaderConn() {
  if (!leader) leader = connectLeader("pos", { onReady: () => readyCb && readyCb() })
  return leader
}

// Leader → broadcast the current order snapshot.
export function broadcastOrder(snapshot) {
  leaderConn().send(snapshot)
}

// Leader → run handler whenever the relay (re)connects: the cross-device analogue of
// a follower "hello", used to re-broadcast the current order. Returns a cleanup fn.
export function onHello(handler) {
  readyCb = handler
  leaderConn()
  return () => { if (readyCb === handler) readyCb = null }
}

// Follower → receive order snapshots. Returns a cleanup fn.
export function onOrder(handler) {
  const conn = connectFollower("pos", handler)
  return () => conn.close()
}
