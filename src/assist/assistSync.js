// assistSync.js — Vavoom Assist's state, out to the full bar page; commands back in.
//
// The POS keeps only two small floating pieces of Assist on screen (the upsell square
// and the transcript). Everything else — inputs, behaviour reading, heard order, offer
// history, whisper's raw messages, the event log — is the FULL BAR, a separate page of
// the same POS build (?demo=<id>&view=assist, AssistFullBar.jsx).
//
//   POS (useAssist) ──state──▶ BroadcastChannel  ──▶ full bar on the SAME device (controls work)
//                   ──state──▶ demo relay /sync   ──▶ full bar on ANY device (view only)
//   full bar ──commands──▶ BroadcastChannel only ──▶ POS
//
// Commands (start / end customer, Add / No thanks, a typed line, camera on/off) travel
// only over the same-browser BroadcastChannel, never over the open demo relay, so a
// screen elsewhere can watch a demo POS but cannot drive it. No ?demo= → no-op.

import { connectLeader, connectFollower } from "../relaySync.js"
import { getDemoId } from "./demoContext.js"

const SURFACE = "assist"
const channelName = () => `vavoom-assist-${getDemoId()}`

function openChannel() {
  if (!getDemoId() || typeof BroadcastChannel === "undefined") return null
  try { return new BroadcastChannel(channelName()) } catch { return null }
}

/** POS side. Returns { publish(state), close() }; onCommand(cmd) gets the full bar's commands. */
export function startAssistPublisher(onCommand) {
  if (!getDemoId()) return { publish() {}, close() {} }
  const bc = openChannel()
  let last = null
  const relay = connectLeader(SURFACE, { onReady: (api) => { if (last) api.send(last) } })
  if (bc) {
    bc.onmessage = (e) => {
      const m = e.data || {}
      if (m.kind === "hello" && last) bc.postMessage({ kind: "state", state: JSON.parse(last) })
      if (m.kind === "command" && m.command) onCommand(m.command)
    }
  }
  return {
    publish(state) {
      last = JSON.stringify(state)
      relay.send(last)
      if (bc) bc.postMessage({ kind: "state", state })
    },
    close() { relay.close(); if (bc) bc.close() },
  }
}

/**
 * Full-bar side. onState(state, { local }) for every state the POS publishes; `local`
 * is true when it came over the same-browser channel (so commands will reach the POS).
 * Returns { send(command), close() }.
 */
export function startAssistViewer(onState) {
  const bc = openChannel()
  const relay = connectFollower(SURFACE, (state) => onState(state, { local: false }))
  if (bc) {
    bc.onmessage = (e) => { if (e.data?.kind === "state") onState(e.data.state, { local: true }) }
    bc.postMessage({ kind: "hello" })
  }
  return {
    send(command) { if (bc) bc.postMessage({ kind: "command", command }) },
    close() { relay.close(); if (bc) bc.close() },
  }
}

/** The full bar's URL for this demo room (same POS build, ?view=assist). */
export function fullBarUrl() {
  const u = new URL(window.location.href)
  const keep = new URLSearchParams()
  for (const k of ["demo", "menu"]) { const v = u.searchParams.get(k); if (v) keep.set(k, v) }
  keep.set("view", "assist")
  return `${u.origin}${u.pathname}?${keep}`
}

/** The POS for this demo room: where the full bar's "Back to POS" goes when it has no POS window to return to. */
export function posUrl() {
  const u = new URL(window.location.href)
  const keep = new URLSearchParams()
  for (const k of ["demo", "menu"]) { const v = u.searchParams.get(k); if (v) keep.set(k, v) }
  const q = keep.toString()
  return `${u.origin}${u.pathname}${q ? `?${q}` : ""}`
}

export const isFullBarView = () => {
  try { return new URLSearchParams(window.location.search).get("view") === "assist" } catch { return false }
}
