// Runs the counter transactions in transcripts.js (24) through the real Vavoom Assist engine
// (useAssist.js createEngine, with upsellEngine, the hot keys, the order parser and the reply
// classifier), on the burger menu, and writes what happened to transcript-results.md.
//
//   npm run test:transcripts
//
// What is simulated, and how it matches the app:
//   • each transcript line goes in as a whisper `final` (handleFinal), at its time;
//   • the POS (usePos.js): addToCart / decrementFromCart with the same cart lines and `via`
//     counts, emitting the same activity events BEFORE the cart re-renders, as React does;
//     a cashier tap is item_click then item_added, like handleItemClick + the size picker;
//   • the clock: Date.now and setTimeout are replaced by a simulated clock, and the hook's
//     1-second tick (recompute) runs every simulated second, so card timeouts, the 3-second
//     patience rule and the 60-second complaint pause behave as they do live;
//   • payment: payment_complete ends the customer session (as useAssist does), then the
//     ticket is cleared (new_order).
//   • the upsell brain and voice prints: a `brain` step answers the POS's latest request with a
//     brain_upsell message and a `voice` step delivers a voice_match, exactly as the speech bridge
//     would; the requests the POS sends and the line roles it marks are recorded.
// Not simulated: the microphone, the speech bridge and whisper itself (lines arrive as text),
// whisper's own AI pick, the GPU-box brain's own decision (tested on the box), and the screen.

import "./shim.mjs"
import { writeFileSync } from "node:fs"
import { createEngine } from "../src/assist/useAssist.js"
import { INDEX, defaultSize } from "../src/assist/menuIndex.js"
import { TRANSCRIPTS } from "./transcripts.js"

const OUT = process.argv[2] || "test/transcript-results.md"
const T0 = Date.UTC(2026, 9, 8, 16, 0, 0)
let NOW = T0
Date.now = () => NOW
let timers = []
let timerId = 0
globalThis.setTimeout = (fn, ms = 0) => { const id = ++timerId; timers.push({ id, at: NOW + ms, fn }); return id }
globalThis.clearTimeout = (id) => { timers = timers.filter((t) => t.id !== id) }
const flush = () => new Promise((r) => setImmediate(r))

const byName = (n) => INDEX.entries.find((e) => e.name.toLowerCase() === n.toLowerCase())
const lineText = (l) => `${l.count}× ${l.item.name}${l.size && l.size !== "each" ? ` (${l.size})` : ""}`
const day = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` }

async function run(tr) {
  localStorage.clear()
  if (tr.setup?.outToday) {
    localStorage.setItem(`vavoom-assist-out-demo-transcript-test-${day()}`, JSON.stringify(tr.setup.outToday.map((n) => byName(n).id)))
  }
  NOW = T0
  timers = []
  const sec = () => (NOW - T0) / 1000
  const timeline = []
  const note = (text, kind = "react") => timeline.push({ at: sec(), kind, text })

  // useState stand-ins; the card and log setters are where the run is recorded.
  const state = { events: [], lines: [], heard: [], offers: [], behaviours: [], hot: { fired: [] }, card: null }
  let cards = []
  let lastCard = null
  const recordCard = (c) => {
    if (!c) {
      if (lastCard && lastCard.outcome == null) lastCard.outcome = "taken down"
      lastCard = null
      return
    }
    let rec = cards.find((x) => x.key === c.key && x.shownAt === c.shownAt)
    if (!rec) {
      if (lastCard && lastCard.outcome == null) lastCard.outcome = "replaced"
      rec = { key: c.key, shownAt: c.shownAt, atSec: sec(), title: c.title, tag: c.tag || "", source: c.source, reason: c.reason, pair: c.pair?.entry?.name || "", outcome: null, via: "" }
      cards.push(rec)
    }
    if (c.state && c.state !== "pending" && rec.outcome == null) { rec.outcome = c.state; rec.via = c.via || ""; rec.endSec = sec() }
    lastCard = rec
  }
  const set = {}
  const brainRequests = []
  const roles = []
  set.requestBrain = (req) => brainRequests.push(req)
  set.voiceLine = (role) => roles.push(role)
  for (const k of Object.keys(state).concat(["phase", "trigger", "aiNote", "customerName", "voice", "brain"])) {
    set[k] = (v) => {
      state[k] = typeof v === "function" ? v(state[k]) : v
      if (k === "card") recordCard(state.card)
      if (k === "events") note(state.events[0].text)
    }
  }

  // The POS.
  const engineRef = {}
  const pos = { cart: [] }
  let pending = null
  const base = () => pending || pos.cart
  const render = () => {
    if (!pending) return
    pos.cart = pending
    pending = null
    queueMicrotask(() => engineRef.E.recompute()) // useAssist re-checks the ticket on every change
  }
  pos.addToCart = (item, size, price, category, source = "cashier") => {
    const key = `${item.id}::${size}`
    const prev = base()
    const idx = prev.findIndex((e) => e.key === key)
    const via = (v) => (source === "cashier" ? v : { ...v, [source]: (v[source] || 0) + 1 })
    const next = [...prev]
    if (idx >= 0) next[idx] = { ...next[idx], count: next[idx].count + 1, via: via(next[idx].via || {}) }
    else next.push({ key, item, size, price, count: 1, category, via: via({}) })
    pending = next
    queueMicrotask(render)
    engineRef.E.onActivityEvent({ type: "item_added", item, category, size, price, source, at: NOW })
  }
  pos.decrementFromCart = (key, source = "cashier") => {
    const line = pos.cart.find((e) => e.key === key)
    if (line) engineRef.E.onActivityEvent({ type: "item_removed", item: line.item, category: line.category, size: line.size, source, at: NOW })
    const prev = base()
    const idx = prev.findIndex((e) => e.key === key)
    if (idx < 0) return
    let next
    if (prev[idx].count <= 1) next = prev.filter((e) => e.key !== key)
    else {
      next = [...prev]
      const v = { ...(next[idx].via || {}) }
      if (v.upsell) v.upsell -= 1
      else if (v.voice) v.voice -= 1
      next[idx] = { ...next[idx], count: next[idx].count - 1, via: v }
    }
    pending = next
    queueMicrotask(render)
  }
  const posRef = { current: pos }
  const E = createEngine(set, posRef)
  engineRef.E = E

  async function advanceTo(ms) {
    while (NOW < ms) {
      NOW += Math.min(100, ms - NOW)
      const due = timers.filter((t) => t.at <= NOW)
      timers = timers.filter((t) => t.at > NOW)
      for (const t of due) t.fn()
      if ((NOW - T0) % 1000 === 0) E.recompute()
      await flush()
    }
  }

  const customers = []
  for (const step of tr.steps) {
    await advanceTo(T0 + step.at * 1000)
    if (step.say) {
      note(`${step.who === "O" ? "Operator" : "Customer"}: “${step.say}”`, "line")
      E.handleFinal(step.say)
    } else if (step.tap) {
      const e = byName(step.tap)
      const [size, price] = step.size ? e.sizes.find(([l]) => l === step.size) : (e.sizes.length === 1 ? e.sizes[0] : defaultSize(e))
      note(`Cashier taps ${e.name}${size !== "each" ? ` (${size})` : ""}`, "line")
      E.onActivityEvent({ type: "item_click", item: e.item, category: e.category, at: NOW })
      pos.addToCart(e.item, size, price, e.category, "cashier")
    } else if (step.press) {
      note(`Cashier presses ${{ add: "Add", no: "No thanks", pair: "the pairing's Add" }[step.press]}`, "line")
      if (step.press === "add") E.acceptCard("Add")
      else if (step.press === "no") E.declineCard("No thanks")
      else E.addPair()
    } else if (step.brain) {
      const req = brainRequests[brainRequests.length - 1]
      note(`Upsell brain answers: ${step.brain.item || step.brain.name} — ${step.brain.framing || ""}`, "line")
      E.handleBrain({ req_id: req ? req.req_id : -1, latency_ms: 480, round_trip_ms: 530, framer: "qwen3-14b", ...step.brain })
    } else if (step.voice) {
      note(`Voice print: ${step.voice.matched ? `returning ${step.voice.voice_id} (score ${step.voice.score})` : `new ${step.voice.voice_id}`}`, "line")
      E.handleVoice({ seconds: 3.2, embed_ms: 9, round_trip_ms: 40, ...step.voice })
    } else if (step.presence) {
      note("Counter presence: a customer walks up", "line")
      E.beginCustomer("counter presence")
    } else if (step.pay) {
      await flush()
      const fired = (E.st.hot.fired || []).map((f) => f.key)
      for (const c of cards) if (c.outcome == null) c.outcome = "unanswered"
      customers.push({ cards, ticket: pos.cart.map(lineText), fired, receipt: E.receiptRecord(), roles: roles.splice(0),
        brainRequests: brainRequests.length })
      note(`Paid — ticket: ${pos.cart.map(lineText).join(", ") || "(empty)"}`, "line")
      E.onActivityEvent({ type: "payment_complete", at: NOW })
      E.endCustomer("paid", null)
      pos.cart = []
      pending = null
      E.onActivityEvent({ type: "new_order", at: NOW })
      cards = []
      lastCard = null
    }
    await flush()
  }
  const r = { customers, c: customers[0] }
  const checks = tr.checks.map(([what, fn]) => {
    let ok = false
    try { ok = !!fn(r) } catch { ok = false }
    return { what, ok }
  })
  return { tr, r, timeline, checks }
}

const results = []
for (const tr of TRANSCRIPTS) results.push(await run(tr))

// Report
const fmtSec = (s) => `${s.toFixed(1).padStart(5)} s`
const out = []
const passed = results.reduce((n, x) => n + x.checks.filter((c) => c.ok).length, 0)
const total = results.reduce((n, x) => n + x.checks.length, 0)
out.push(`# Vavoom Assist — ${results.length} counter transactions`, "")
out.push(`Generated by \`npm run test:transcripts\` (test/run-transcripts.mjs) from test/transcripts.js, on the burger menu. Each line is fed to the real Assist engine as a whisper final, at its time, with a simulated POS and clock. **${passed} of ${total} checks passed.**`, "")
out.push("| # | Transaction | Checks | Cards shown (outcome) | Ticket at payment |", "|---|---|---|---|---|")
for (const { tr, r, checks } of results) {
  const ok = checks.filter((c) => c.ok).length
  const cs = r.customers.map((c) => c.cards.map((x) => `${x.tag ? `[${x.tag}] ` : ""}${x.title} (${x.outcome})`).join("; ") || "—").join(" ‖ ")
  const tk = r.customers.map((c) => c.ticket.join(", ") || "—").join(" ‖ ")
  out.push(`| ${tr.id} | ${tr.title} | ${ok === checks.length ? "✅" : "❌"} ${ok}/${checks.length} | ${cs} | ${tk} |`)
}
out.push("")
for (const { tr, timeline, checks } of results) {
  out.push(`## ${tr.id}. ${tr.title}`, "")
  if (tr.setup?.outToday) out.push(`Before it starts: out of stock today — ${tr.setup.outToday.join(", ")}.`, "")
  out.push("```")
  for (const t of timeline) out.push(t.kind === "line" ? `${fmtSec(t.at)}  ${t.text}` : `${" ".repeat(9)}→ ${t.text}`)
  out.push("```", "")
  for (const c of checks) out.push(`- ${c.ok ? "✅" : "❌"} ${c.what}`)
  out.push("")
}
writeFileSync(OUT, out.join("\n"))
for (const { tr, checks } of results) {
  const bad = checks.filter((c) => !c.ok)
  console.log(`${bad.length ? "FAIL" : "PASS"}  ${String(tr.id).padStart(2)}. ${tr.title}${bad.length ? `\n        ✗ ${bad.map((c) => c.what).join("\n        ✗ ")}` : ""}`)
}
console.log(`\n${passed}/${total} checks passed — report: ${OUT}`)
