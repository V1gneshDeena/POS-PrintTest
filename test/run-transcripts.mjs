// Runs the counter transactions in transcripts.js (60) through the real Vavoom Assist engine
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
//   • --set edits runs test/order-edits.js instead: order changes said 60 ways (take it off, swap it,
//     lines that only sound like a change) and auto-picked orders; report test/order-edits-results.md.
//   • how it decided (reasoning.js): each customer's reasoning (what it weighed at payment and the
//     timeline of steps, including the visit going into memory) is recorded and printed under the
//     transaction in the report.
//   • the meaning layer, with --meaning FILE: every line's meaning_request is answered 120 ms
//     later with the hits the GPU box's meaning layer actually gave for that line
//     (deploy/gpu-vllm/demopos/eval/meaning_eval.py writes FILE as meaning-demo.json, keyed by
//     "previous line␞line"); without it the POS sends no meaning requests, as on Gregory's menu.
//       npm run test:transcripts -- --meaning test/meaning-demo.json
//     writes test/transcript-results-meaning.md.
//   • --set pressure runs test/pressure.js: 100 generated transactions across the board, each checked
//     against rules that must always hold (nothing rung up that nobody ordered, no card for what is on
//     the ticket, taken off, out or holding a stated allergen, the card setting obeyed…); report
//     test/pressure-results.md.
//   • --live URL sends the POS's brain and meaning requests to the real demopos gateway (an SSH tunnel to
//     gpu-setup's :8024, e.g. ssh -N -L 18124:127.0.0.1:8024 …) with curl, and delivers each answer 550 ms
//     (brain) or 60 ms (meaning) later in simulated time; the real round trips are reported.
//   • the spotlight (useAssist.js THE SPOTLIGHT): each spotlight opened is recorded (its items, the states it
//     went through with their times, its chain, when it closed), and each card notes whether it went up inside
//     one. A transaction's setup.view picks the upsell view; --view spotlight runs a whole set in the Spotlight
//     view and holds every transaction to the spotlight's own rules too (SPOT_RULES); its report gets
//     "-spotlight" in its name.
// Not simulated: the microphone, the speech bridge and whisper itself (lines arrive as text),
// whisper's own AI pick, the GPU-box brain's own decision (tested on the box), and the screen.

import "./shim.mjs"
import { readFileSync, writeFileSync } from "node:fs"
import { createEngine } from "../src/assist/useAssist.js"
import { INDEX, defaultSize } from "../src/assist/menuIndex.js"
import { TRANSCRIPTS as MAIN } from "./transcripts.js"
import { TRANSCRIPTS as EDITS } from "./order-edits.js"
import { TRANSCRIPTS as PRESSURE } from "./pressure.js"
import { execFileSync } from "node:child_process"

const ARGS = process.argv.slice(2)
const MEANING_FILE = ARGS.includes("--meaning") ? ARGS[ARGS.indexOf("--meaning") + 1] : ""
const MEANING = MEANING_FILE ? JSON.parse(readFileSync(MEANING_FILE, "utf8")) : null
const SET = ARGS.includes("--set") ? ARGS[ARGS.indexOf("--set") + 1] : "main"
const LIVE = ARGS.includes("--live") ? ARGS[ARGS.indexOf("--live") + 1].replace(/\/+$/, "") : ""
const VIEW = ARGS.includes("--view") ? ARGS[ARGS.indexOf("--view") + 1] : ""
const TRANSCRIPTS = SET === "edits" ? EDITS : SET === "pressure" ? PRESSURE : MAIN
const OUT = ARGS.find((a, i) => !a.startsWith("--") && !["--meaning", "--set", "--live", "--view"].includes(ARGS[i - 1]))
  || `test/${SET === "edits" ? "order-edits-results" : SET === "pressure" ? "pressure-results" : "transcript-results"}${MEANING ? "-meaning" : ""}${LIVE ? "-live" : ""}${VIEW === "spotlight" ? "-spotlight" : ""}.md`
// With --view spotlight, the promises the spotlight makes, on top of each transaction's own checks.
const SPOT_RULES = [
  ["spotlight: every card went up inside an open spotlight", (r) => r.customers.every((c) => c.cards.every((x) => x.inSpot))],
  ["spotlight: every spotlight was opened by an item said or tapped", (r) => r.customers.every((c) => c.spots.every((s) => s.items.length > 0))],
  ["spotlight: one with nothing more to offer closed by itself within 3 s", (r) => r.customers.every((c) => c.spots.every((s) => {
    const done = s.states.filter((x) => x.state === "done").at(-1)
    return !done || s.states.at(-1).state !== "done" || (s.closedSec != null && s.closedSec - done.atSec <= 3)
  }))],
]
// The live gateway, synchronously (curl), so the simulated clock stays in charge; real milliseconds kept.
const liveLatency = { brain: [], meaning: [] }
function live(path, body, kind) {
  const t0 = performance.now()
  try {
    const out = execFileSync("curl", ["-s", "-m", "8", "-X", "POST", "-H", "content-type: application/json", "--data-binary", "@-", `${LIVE}${path}`],
      { input: JSON.stringify(body), encoding: "utf8" })
    liveLatency[kind].push(performance.now() - t0)
    return JSON.parse(out)
  } catch (e) {
    return { error: String(e.message || e).slice(0, 100) }
  }
}
const meaningFor = (prev, text) => MEANING[`${prev}␞${text}`]
  || Object.entries(MEANING).find(([k]) => k.endsWith(`␞${text}`))?.[1] || []
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
      rec = { key: c.key, shownAt: c.shownAt, atSec: sec(), title: c.title, tag: c.tag || "", source: c.source, reason: c.reason, pair: c.pair?.entry?.name || "", outcome: null, via: "",
        back: !!c.back, memory: [], entry: c.entry?.name || "", kind: c.kind, size: c.size || "", fromSize: c.fromSize || "",
        from: c.fromEntry?.name || "", also: c.alsoEntry?.name || "", mode: E_ref.E?.st.cardMode || "", ticketAtShow: (base_ref.cart || []).map((l) => l.item.name),
        inSpot: !!E_ref.E?.st.spot, spot: spots.length }
      cards.push(rec)
    }
    if (c.pitched && !rec.pitchedSec) rec.pitchedSec = sec() // when the cashier said it (the square stops asking to voice it)
    for (const m of c.memory || []) if (!rec.memory.includes(m)) rec.memory.push(m) // the context window shown under it
    if (c.state && c.state !== "pending" && rec.outcome == null) { rec.outcome = c.state; rec.via = c.via || ""; rec.endSec = sec() }
    lastCard = rec
  }
  const set = {}
  const brainRequests = []
  const roles = []
  const errors = []
  const LIVE_ROOM = `probe-pressure-${tr.id}`
  set.requestBrain = (req) => {
    brainRequests.push(req)
    if (!LIVE) return
    const ans = live("/v1/upsell", { demo: LIVE_ROOM, transcript: req.transcript, context: { ...req.context, voice: engineRef.E.st.voice || null } }, "brain")
    setTimeout(() => engineRef.E.handleBrain({ req_id: req.req_id, round_trip_ms: Math.round(liveLatency.brain.at(-1) || 0), ...ans }), 550)
  }
  // Without --meaning or --live, meaning requests are only recorded; a `meaning` step answers the latest.
  const meaningRequests = []
  if (!MEANING && !LIVE) set.requestMeaning = (req) => meaningRequests.push(req)
  if (LIVE) {
    set.requestMeaning = (req) => {
      const ans = live("/v1/meaning", { demo: LIVE_ROOM, text: req.text, prev: req.prev, exact: req.exact }, "meaning")
      setTimeout(() => engineRef.E.handleMeaning({ req_id: req.req_id, ...ans }), 60)
    }
  }
  set.voiceLine = (role) => roles.push(role)
  if (MEANING) {
    set.requestMeaning = (req) => {
      const hits = meaningFor(req.prev, req.text)
      setTimeout(() => engineRef.E.handleMeaning({ req_id: req.req_id, hits, near: [], ms: 3, round_trip_ms: 120 }), 120)
    }
  }
  let sections = [] // the "Best in <section>" hints shown, in order
  // The spotlights opened: { openedSec, items: ["Little Cheeseburger (tapped)"], states: [{ state, atSec }], trail, closedSec }.
  let spots = []
  const recordSpot = (v) => {
    let last = spots.at(-1)
    if (!v) { if (last && last.closedSec == null) last.closedSec = sec(); return }
    if (!last || last.closedSec != null || last.openedAt !== v.openedAt) {
      last = { openedAt: v.openedAt, openedSec: sec(), items: [], states: [], trail: [], closedSec: null }
      spots.push(last)
    }
    last.items = v.items.map((i) => `${i.size ? `${i.size} ` : ""}${i.name} (${i.how})`)
    if (last.states.at(-1)?.state !== v.state) last.states.push({ state: v.state, atSec: sec() })
    last.trail = v.trail.map((x) => `${x.title} (${x.outcome})`)
  }
  for (const k of Object.keys(state).concat(["phase", "trigger", "aiNote", "customerName", "voice", "brain", "reasoning", "section", "view", "spot"])) {
    set[k] = (v) => {
      state[k] = typeof v === "function" ? v(state[k]) : v
      if (k === "section" && state.section) sections.push({ ...state.section, atSec: sec() })
      if (k === "spot") recordSpot(state.spot)
      if (k === "card") recordCard(state.card)
      if (k === "events") note(state.events[0].text)
    }
  }

  // The POS.
  const engineRef = {}
  const E_ref = engineRef
  const pos = { cart: [] }
  const base_ref = pos
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
  if (tr.setup?.cardMode) E.setCardMode(tr.setup.cardMode)
  if (tr.setup?.view || VIEW) E.setView(tr.setup?.view || VIEW)

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
  const steps = tr.steps
  for (const step of steps) {
    try { await runStep(step) } catch (e) { errors.push(`${step.at}s: ${String(e.stack || e).split("\n").slice(0, 3).join(" | ")}`); note(`ENGINE ERROR: ${e.message}`) }
  }
  async function runStep(step) {
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
      // The latest request's answer, or, with `answer: n`, the n-th request's (an answer that arrives late).
      const req = step.answer ? brainRequests[step.answer - 1] : brainRequests[brainRequests.length - 1]
      note(`Upsell brain answers: ${step.brain.item || step.brain.name} — ${step.brain.framing || ""}`, "line")
      E.handleBrain({ req_id: req ? req.req_id : -1, latency_ms: 480, round_trip_ms: 530, framer: "qwen3-14b", ...step.brain })
    } else if (step.pitch) {
      // The cashier says the card on screen (or, with none, asks if there is anything else).
      const c = E.st.card
      const text = c && c.state === "pending" ? `Would you like ${c.kind === "upsize" ? `to make it a ${c.size}` : `the ${c.entry?.name || c.title}`}?` : "Anything else for you today?"
      note(`Operator: “${text}”`, "line")
      E.handleFinal(text)
    } else if (step.meaning) {
      // The meaning layer's answer to the latest line: [{ key, score, clause }].
      const req = meaningRequests.at(-1)
      note(`Meaning layer: ${step.meaning.map((h) => `${h.key} ${h.score}`).join(", ")}`, "line")
      if (req) E.handleMeaning({ req_id: req.req_id, hits: step.meaning.map((h) => ({ need: 0.82, neg: 0.5, kind: "clause", clause: req.text, ...h })), near: [], ms: 3, round_trip_ms: 60 })
    } else if (step.back) {
      note("Cashier taps Back to the order (closes the spotlight)", "line")
      E.closeSpot()
    } else if (step.view) {
      note(`Cashier switches the upsell view to ${step.view}`, "line")
      E.setView(step.view)
    } else if (step.section) {
      note(`Cashier opens ${step.section}`, "line")
      E.onActivityEvent({ type: "category_view", category: step.section, at: NOW })
    } else if (step.clear) {
      // The POS's Clear: the ticket empties and, as useAssist's listener does, the visit ends.
      note("Cashier presses Clear", "line")
      pos.cart = []
      pending = null
      E.onActivityEvent({ type: "clear", at: NOW })
      E.endCustomer("ticket cleared", null)
    } else if (step.choose) {
      const [name, size] = step.choose
      note(`Cashier picks ${size} for ${name} on the size prompt`, "line")
      E.chooseSize(byName(name).id, size)
    } else if (step.whisper) {
      note(`Whisper's order: ${step.whisper.map((i) => `${i.quantity}× ${i.name}`).join(", ")}`, "line")
      E.handleWhisperOrder(step.whisper)
    } else if (step.voice) {
      note(`Voice print: ${step.voice.matched ? `returning ${step.voice.voice_id} (score ${step.voice.score})` : `new ${step.voice.voice_id}`}`, "line")
      E.handleVoice({ seconds: 3.2, embed_ms: 9, round_trip_ms: 40, ...step.voice })
    } else if (step.presence) {
      note("Counter presence: a customer walks up", "line")
      E.beginCustomer("counter presence")
    } else if (step.pay) {
      await flush()
      const fired = (E.st.hot.fired || []).map((f) => f.key)
      const waiting = [...E.st.heard.values()].filter((h) => h.needsSize).map((h) => h.entry.name) // before the visit resets
      const firedFull = (E.st.hot.fired || []).map((f) => ({ key: f.key, phrase: f.phrase || "" }))
      for (const c of cards) if (c.outcome == null) c.outcome = "unanswered"
      const receipt = E.receiptRecord()
      const reasoningNow = { ...E.st.reasonNow }
      note(`Paid — ticket: ${pos.cart.map(lineText).join(", ") || "(empty)"}`, "line")
      E.onActivityEvent({ type: "payment_complete", at: NOW })
      E.noteSaving(receipt) // as useAssist does at payment
      E.endCustomer("paid", null)
      const brainAllergens = brainRequests.at(-1)?.context?.allergens || []
      customers.push({ cards, sections: sections.splice(0), spots: spots.splice(0), ticket: pos.cart.map(lineText), waiting, fired, firedFull, brainAllergens, receipt, roles: roles.splice(0),
        brainRequests: brainRequests.length, reasoningNow,
        reasoning: (E.st.lastReasoning?.timeline || []).map((x) => ({ ...x, atSec: (x.at - T0) / 1000 })) })
      pos.cart = []
      pending = null
      E.onActivityEvent({ type: "new_order", at: NOW })
      cards = []
      lastCard = null
    }
    await flush()
  }
  const r = { customers, c: customers[0], errors, tr, live: !!LIVE }
  const checks = [...tr.checks, ...(VIEW === "spotlight" ? SPOT_RULES : [])].map(([what, fn]) => {
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
if (VIEW === "spotlight") out.push("Run in the Spotlight view (--view spotlight): every transaction is also held to the spotlight's own rules.", "")
if (MEANING) out.push(`With the meaning layer on: each line's meaning request is answered 120 ms later with what the GPU box's meaning layer gave for that line (${MEANING_FILE}, ${Object.keys(MEANING).length} lines with a hit).`, "")
out.push("| # | Transaction | Checks | Cards shown (outcome) | Ticket at payment |", "|---|---|---|---|---|")
for (const { tr, r, checks } of results) {
  const ok = checks.filter((c) => c.ok).length
  const cs = r.customers.map((c) => c.cards.map((x) => `${x.tag ? `[${x.tag}] ` : ""}${x.title} (${x.outcome})`).join("; ") || "—").join(" ‖ ")
  const tk = r.customers.map((c) => c.ticket.join(", ") || "—").join(" ‖ ")
  out.push(`| ${tr.id} | ${tr.title} | ${ok === checks.length ? "✅" : "❌"} ${ok}/${checks.length} | ${cs} | ${tk} |`)
}
out.push("")
for (const { tr, r, timeline, checks } of results) {
  out.push(`## ${tr.id}. ${tr.title}`, "")
  if (tr.setup?.outToday) out.push(`Before it starts: out of stock today — ${tr.setup.outToday.join(", ")}.`, "")
  out.push("```")
  for (const t of timeline) out.push(t.kind === "line" ? `${fmtSec(t.at)}  ${t.text}` : `${" ".repeat(9)}→ ${t.text}`)
  out.push("```", "")
  for (const c of checks) out.push(`- ${c.ok ? "✅" : "❌"} ${c.what}`)
  out.push("")
  r.customers.forEach((c, i) => {
    for (const s of c.spots || []) {
      out.push(`- Spotlight at ${s.openedSec.toFixed(1)} s for ${s.items.join(", ")}: ${s.states.map((x) => `${x.state} (${x.atSec.toFixed(1)} s)`).join(" → ")}${s.trail.length ? `; chain: ${s.trail.join(" → ")}` : ""}; closed ${s.closedSec != null ? `at ${s.closedSec.toFixed(1)} s` : "—"}`)
    }
    if ((c.spots || []).length) out.push("")
    out.push(`**How it decided${r.customers.length > 1 ? ` (customer ${i + 1})` : ""}** — weighing at payment:`, "")
    for (const [k, label] of [["memory", "Memory"], ["health", "Health and ingredients"], ["history", "Previous orders"], ["plan", "When it pitches"]]) {
      if (c.reasoningNow[k]) out.push(`- *${label}:* ${c.reasoningNow[k]}`)
    }
    out.push("", "Steps:", "")
    for (const x of c.reasoning) out.push(`- ${fmtSec(x.atSec).trim()} · ${x.kind} · ${x.text}`)
    out.push("")
  })
}
writeFileSync(OUT, out.join("\n"))
for (const { tr, checks } of results) {
  const bad = checks.filter((c) => !c.ok)
  console.log(`${bad.length ? "FAIL" : "PASS"}  ${String(tr.id).padStart(2)}. ${tr.title}${bad.length ? `\n        ✗ ${bad.map((c) => c.what).join("\n        ✗ ")}` : ""}`)
}
if (LIVE) {
  const stat = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? `n=${s.length}, median ${Math.round(s[Math.floor(s.length / 2)])} ms, p95 ${Math.round(s[Math.floor(s.length * 0.95)])} ms, max ${Math.round(s.at(-1))} ms` : "none" }
  const line = `Live round trips through ${LIVE}: brain ${stat(liveLatency.brain)}; meaning ${stat(liveLatency.meaning)}.`
  writeFileSync(OUT, readFileSync(OUT, "utf8").replace("\n\n| # |", `\n\n${line}\n\n| # |`))
  console.log(line)
}
console.log(`\n${passed}/${total} checks passed — report: ${OUT}`)
