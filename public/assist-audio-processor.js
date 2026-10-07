/**
 * assist-audio-processor.js — AudioWorklet for Vavoom Assist's microphone.
 *
 * Same wire format as the operator tablet's audio-chunk-processor.js: mono Float32
 * samples from an AudioContext running at 16 kHz, posted to the main thread every
 * 4096 samples (~256 ms). The main thread (src/assist/sttClient.js) sends each chunk
 * as one binary WebSocket frame to the demo speech bridge, which passes it to whisper.
 * It also reports the chunk's RMS level so the POS can draw a mic meter.
 */
class AssistAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buf = new Float32Array(4096)
    this._n = 0
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch || ch.length === 0) return true
    for (let i = 0; i < ch.length; i++) {
      this._buf[this._n++] = ch[i]
      if (this._n === this._buf.length) {
        let sum = 0
        for (let j = 0; j < this._buf.length; j++) sum += this._buf[j] * this._buf[j]
        const chunk = this._buf
        this.port.postMessage({ chunk, rms: Math.sqrt(sum / chunk.length) }, [chunk.buffer])
        this._buf = new Float32Array(4096)
        this._n = 0
      }
    }
    return true
  }
}

registerProcessor("assist-audio-processor", AssistAudioProcessor)
