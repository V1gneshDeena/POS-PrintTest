// presence.js — counter presence from the POS device's own camera, for the demo.
//
// In a store, counter presence comes from the GPU detector (YOLO + depth on gpu-setup),
// fed by the store tablet under that store's login. A demo room has no store login and
// no store camera, so the demo POS runs a face detector in the browser instead
// (MediaPipe Tasks BlazeFace short-range, loaded from jsDelivr / Google's model store)
// and applies the same latch shape as the store's counter-presence detector:
//
//   • a face counts only when it is CLOSE: its box is at least MIN_FACE_FRAC of the
//     frame width (≈ within 1.5 m on a laptop webcam). Someone walking past further
//     back never counts, the same job the store's 1.4 m depth gate does.
//   • ARRIVE when at least ENTER_FRACTION of the samples in the last ENTER_WINDOW_MS
//     saw a close face (store detector v2: 1.5 s window, 70%).
//   • LEAVE after VACATE_MS with no close face at all.
//
// Frames never leave the device. If the model can't load (offline, blocked CDN, no
// camera) the status says so and the operator uses the manual button instead.

const TASKS_VERSION = "0.10.14"
const TASKS_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}`
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"

const SAMPLE_MS = 250
const ENTER_WINDOW_MS = 1500
const ENTER_FRACTION = 0.7
const VACATE_MS = 6000

function minFaceFrac() {
  const p = parseFloat(new URLSearchParams(window.location.search).get("presenceMinFace") || "")
  return Number.isFinite(p) && p > 0 && p < 1 ? p : 0.12
}

export class CounterPresence {
  constructor({ onChange, onStatus }) {
    this.onChange = onChange || (() => {})
    this.onStatus = onStatus || (() => {})
    this.video = null
    this.stream = null
    this.detector = null
    this.timer = null
    this.samples = [] // [{t, hit}]
    this.lastHit = 0
    this.present = false
    this.minFace = minFaceFrac()
  }

  async start() {
    this.onStatus({ presence: "starting", presenceError: "" })
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: "user" }, audio: false })
    } catch (err) {
      this.onStatus({ presence: "unavailable", presenceError: err?.name === "NotAllowedError" ? "Camera permission denied" : "No camera" })
      return false
    }
    this.video = document.createElement("video")
    this.video.muted = true
    this.video.playsInline = true
    this.video.srcObject = this.stream
    await this.video.play().catch(() => {})

    try {
      const vision = await import(/* @vite-ignore */ `${TASKS_BASE}/vision_bundle.mjs`)
      const files = await vision.FilesetResolver.forVisionTasks(`${TASKS_BASE}/wasm`)
      this.detector = await vision.FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.5,
      })
    } catch (err) {
      this.onStatus({ presence: "unavailable", presenceError: `Detector failed to load (${err?.message || "network"})` })
      this.stopCamera()
      return false
    }
    this.onStatus({ presence: "watching", presenceError: "" })
    this.timer = setInterval(() => this.tick(), SAMPLE_MS)
    return true
  }

  /** The live camera stream, for an on-screen preview. */
  getStream() { return this.stream }

  tick() {
    if (!this.detector || !this.video || this.video.readyState < 2) return
    const now = performance.now()
    let hit = false
    let best = 0
    try {
      const res = this.detector.detectForVideo(this.video, now)
      const w = this.video.videoWidth || 320
      for (const d of res?.detections || []) {
        const frac = (d.boundingBox?.width || 0) / w
        if (frac > best) best = frac
        if (frac >= this.minFace) hit = true
      }
    } catch { return }
    this.samples.push({ t: now, hit })
    while (this.samples.length && now - this.samples[0].t > ENTER_WINDOW_MS) this.samples.shift()
    if (hit) this.lastHit = now
    this.onStatus({ faceFrac: best })

    if (!this.present) {
      const n = this.samples.length
      const hits = this.samples.filter((s) => s.hit).length
      const spanned = n && now - this.samples[0].t >= ENTER_WINDOW_MS - SAMPLE_MS * 1.5
      if (spanned && hits / n >= ENTER_FRACTION) this.setPresent(true)
    } else if (now - this.lastHit >= VACATE_MS) {
      this.setPresent(false)
    }
  }

  setPresent(v) {
    if (this.present === v) return
    this.present = v
    this.onChange(v)
  }

  stopCamera() {
    try { this.stream && this.stream.getTracks().forEach((t) => t.stop()) } catch { /* gone */ }
    this.stream = null
    this.video = null
  }

  stop() {
    clearInterval(this.timer)
    this.timer = null
    try { this.detector && this.detector.close() } catch { /* gone */ }
    this.detector = null
    this.stopCamera()
    this.samples = []
    this.setPresent(false)
    this.onStatus({ presence: "off", faceFrac: 0 })
  }
}
