// sttClient.js — the POS microphone → demo speech bridge → whisper, and back.
//
// Opens the browser microphone (getUserMedia, echo cancellation and noise suppression
// on), runs it through an AudioContext at 16 kHz and the assist-audio-processor
// worklet, and sends each 4096-sample Float32 chunk as a binary frame to the config
// service's /stt bridge (wss://demo-api.vavoom.io/stt?demo=…&ticket=…). The bridge
// adds the whisper key server-side and pins the session to this demo room's locId.
//
// Session messages follow the operator tablet's protocol (useWhisperSocket.js):
//   arm()            session_start  — the lane is live; whisper transcribes from here
//   newCustomer()    session_reset  — a fresh visit on the same warm socket
//   stop()           closes the socket and releases the microphone
// Whisper's replies (partial, final, order_update, ai_prompt, state_transition) and
// the bridge's own bridge_status messages are handed to onMessage unchanged.
//
// The upsell brain and voice prints (the bridge's demoBrain.js; never sent to whisper):
//   voiceLine(role)      whose line just finished (customer | operator), so the bridge can
//                        collect the customer's speech for the voice print
//   requestUpsell(req)   one decision from the demopos brain on the GPU box -> brain_upsell
//   sendReceipt(r)       the paid order, its conversation and its upsells, tagged by voice
//   forgetVoices()       deletes this demo room's voice prints and receipts
// and the bridge answers with voice_match, brain_upsell, receipt_saved, voice_forgotten.
//
// A dropped socket reconnects with backoff unless the bridge refused for a reason a
// retry can't fix (sign-in required, unknown demo, bridge not configured).

import { sttBridgeUrl, getDemoId } from "./demoContext.js"

const FATAL = new Set(["sign_in_required", "unknown_demo", "not_configured"])

export class SttClient {
  constructor({ ticket, restaurant, franchiseName, onMessage, onStatus, onLevel }) {
    this.ticket = ticket
    this.restaurant = restaurant
    this.franchiseName = franchiseName
    this.onMessage = onMessage || (() => {})
    this.onStatus = onStatus || (() => {})
    this.onLevel = onLevel || (() => {})
    this.ws = null
    this.stream = null
    this.ctx = null
    this.node = null
    this.stopped = true
    this.retry = 0
    this.retryTimer = null
    this.fatal = null
    this.visitId = null
  }

  status(patch) { this.onStatus(patch) }

  async start() {
    this.stopped = false
    this.fatal = null
    await this.openMic()
    this.openSocket()
  }

  async openMic() {
    if (this.stream) return
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (err) {
      this.status({ mic: "blocked", micError: err?.name === "NotAllowedError" ? "Microphone permission denied" : (err?.message || "No microphone") })
      return
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
      if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => {})
      await this.ctx.audioWorklet.addModule(new URL("assist-audio-processor.js", document.baseURI).href)
      const src = this.ctx.createMediaStreamSource(this.stream)
      this.node = new AudioWorkletNode(this.ctx, "assist-audio-processor")
      this.node.port.onmessage = (e) => {
        const { chunk, rms } = e.data || {}
        if (typeof rms === "number") this.onLevel(rms)
        if (chunk && this.ws && this.ws.readyState === WebSocket.OPEN && this.armed) {
          this.ws.send(chunk.buffer)
        }
      }
      src.connect(this.node)
      // The worklet must be pulled by the graph to run; route it to a muted gain so
      // nothing is played back through the speakers.
      const mute = this.ctx.createGain()
      mute.gain.value = 0
      this.node.connect(mute).connect(this.ctx.destination)
      this.status({ mic: "on", micError: "" })
    } catch (err) {
      this.status({ mic: "blocked", micError: `Audio setup failed: ${err?.message || err}` })
    }
  }

  openSocket() {
    if (this.stopped) return
    const q = new URLSearchParams({ demo: getDemoId(), ticket: this.ticket })
    let ws
    try { ws = new WebSocket(`${sttBridgeUrl()}?${q}`) } catch { this.scheduleRetry(); return }
    this.ws = ws
    this.armed = false
    this.status({ stt: "connecting" })
    ws.onmessage = (e) => {
      let msg
      try { msg = JSON.parse(e.data) } catch { return }
      if (msg.type === "bridge_status") {
        if (msg.state === "connected") {
          this.retry = 0
          this.status({ stt: "connected", sttError: "" })
          this.arm()
        } else if (msg.state === "error") {
          if (FATAL.has(msg.error)) this.fatal = msg.error
          this.status({ stt: "error", sttError: msg.error })
        }
      }
      this.onMessage(msg)
    }
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.armed = false
      if (this.stopped) { this.status({ stt: "off" }); return }
      if (this.fatal) { this.status({ stt: "error", sttError: this.fatal }); return }
      this.status({ stt: "reconnecting" })
      this.scheduleRetry()
    }
    ws.onerror = () => { /* onclose follows */ }
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer)
    const wait = Math.min(15000, 1000 * 2 ** Math.min(this.retry, 4))
    this.retry += 1
    this.retryTimer = setTimeout(() => this.openSocket(), wait)
  }

  sendJson(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj))
  }

  payload(type) {
    // locationId / posId are set by the bridge (the demo room's own); sent empty here.
    return {
      type,
      locationId: "",
      posId: "",
      visitId: this.visitId,
      state: "takeOrder",
      context: { restaurant: this.restaurant, franchise_name: this.franchiseName, product: "instore-pos" },
    }
  }

  /** Start the live whisper session on a freshly connected socket. */
  arm() {
    this.visitId = crypto.randomUUID()
    this.sendJson(this.payload("session_start"))
    this.armed = true
  }

  voiceLine(role) { if (this.armed) this.sendJson({ type: "voice_line", role }) }
  requestUpsell(req) { if (this.armed) this.sendJson({ type: "upsell_request", ...req }) }
  sendReceipt(r) { this.sendJson({ type: "receipt", ...r }) }
  forgetVoices() { this.sendJson({ type: "voice_forget" }) }

  /** A new customer on the same warm socket: whisper starts a fresh visit. */
  newCustomer() {
    if (!this.armed) return
    this.visitId = crypto.randomUUID()
    this.sendJson(this.payload("session_reset"))
  }

  stop() {
    this.stopped = true
    this.armed = false
    clearTimeout(this.retryTimer)
    try { this.sendJson({ type: "session_end" }) } catch { /* closing */ }
    try { this.ws && this.ws.close() } catch { /* closed */ }
    this.ws = null
    try { this.node && this.node.disconnect() } catch { /* gone */ }
    try { this.ctx && this.ctx.state !== "closed" && this.ctx.close() } catch { /* gone */ }
    try { this.stream && this.stream.getTracks().forEach((t) => t.stop()) } catch { /* gone */ }
    this.node = null
    this.ctx = null
    this.stream = null
    this.status({ stt: "off", mic: "off" })
  }
}
