// useAssist.js — Vavoom Assist on the POS: the in-store demo's brain.
//
// Inputs
//   • microphone → speech bridge → whisper (sttClient.js): live transcript, whisper's
//     parsed order (order_update), whisper's AI upsell (ai_prompt), a captured name
//   • camera → counter presence (presence.js), optional, switched on from the panel
//   • the cashier's screen activity (activity.js) → behaviour estimates (behaviour.js)
//
// Customer session (mirrors the in-store tablet: warm microphone, session per customer)
//   standby → active  on: counter presence arriving, a greeting ("welcome", "hello"),
//                         an order spoken with an order cue, the cashier's first tap,
//                         or the Start button. Lines spoken in the 20 s before the
//                         session opened are replayed into it, so the first words count.
//   active → standby  on: payment completed (the receipt is the session boundary, as
//                         in a store), the End button, or presence leaving while the
//                         ticket is empty. Presence leaving with items on the ticket
//                         keeps the order open. Whisper gets a fresh visit each time.
//
// Where it shows: the POS keeps two small floating pieces on screen (AssistOverlay.jsx:
// the upsell square and the transcript). The whole state is also published as a
// snapshot (assistSync.js) for the FULL BAR page, which shows everything else and can
// send commands back (start / end customer, Add / No thanks, the pairing's Add, a typed line,
// camera, clear out-of-stock, forget voices).
//
// Outputs while a customer is active
//   • STATED ORDER → TICKET: every item heard (POS-side parser on each line, plus
//     whisper's order_update) is rung up, raising the ticket to the heard quantity and
//     never above it. Items the cashier already rang count; an item the cashier removes
//     is not re-added until the customer names it again; "no fries" removes fries that
//     speech added.
//   • ONE UPSELL CARD at a time (upsellEngine.js). It is ACCEPTED by the Add button, a
//     spoken yes (acceptance.js), or the item reaching the ticket some other way, and
//     accepted items are added to the ticket automatically. A spoken or tapped no
//     declines it; 25 s without an answer lets it lapse. Then the next card. An
//     unanswered card holds its place until a card from a strictly higher-priority source
//     is available (hot key > the upsell brain > basket completion / upsize > the AI's pick
//     > behaviour); an allergy answer replaces any card that is not itself one.
//   • HOT KEYS (hotkeys.json) are the upsell's guidelines: a line that says an item is
//     out, asks about an item, complains (too sweet, too bitter, doesn't like it, took
//     forever, an order problem), states a dietary need, wants food, orders for others,
//     is in a hurry, feels hot or cold or wants something cold or hot, mentions the season,
//     or closes the order releases the card on screen and re-picks at once with that
//     context (upsellEngine.js ctx.hot). An
//     item the operator says is out, or the customer only asks about, is never rung up
//     from that line. An out-of-stock item is never offered again THAT DAY in this demo
//     room (kept in localStorage per demo and date; the full bar can clear it), and its
//     menu tile on the POS says "Out today".
//   • THE MEANING LAYER (burger menu = tenant demopos): every finished line also goes,
//     through the speech bridge, to the demopos gateway on the GPU box (`meaning_request`),
//     which reads what the line MEANS (demopos_meaning.py: BGE embeddings against written
//     examples of each hot key, with rules for negation, offers, questions and fragments).
//     Its `meaning` answer (~0.1 s) fires the same hot keys the exact words would, labelled
//     "by meaning" with the clause it read, for lines the exact patterns missed ("it's like an
//     oven out there"). A complaint, dislike or order problem read this way also takes back
//     what speech rang up from that line, as the exact words would have kept it off.
//   • ORDERING AN ITEM THAT IS OUT: a customer who orders it gets its closest substitute
//     (tagged "Closest substitute") and the item is not rung up. A cashier who taps it
//     still rings it up (the cashier has the last word), the substitute pops up all the
//     same, and Add swaps the substitute in for it.
//   • NOT PATIENT: the customer's first order line within 3 s of the session opening
//     (hotkeys.json timing_rules) fires the "quick" effect: no upsizes, cheap items.
//   • THE UPSELL BRAIN (the demopos tenant on the GPU box, reached through the speech bridge):
//     after every finished line and every ticket change the POS asks it for one decision
//     (scheduleBrain), sending the ticket, the last lines, constraints, hot-word effects,
//     behaviours, this visit's offers and today's out-of-stock list; the bridge adds the
//     voice print. Its pick arrives as `brain_upsell` (~0.5 s) and becomes a card ranked
//     above basket completion (upsellEngine.js ctx.brain).
//   • VOICE PRINT: each finished line is marked as the customer's or the employee's
//     (voiceLine), so the bridge can send the customer's speech to ECAPA on the GPU box. A
//     returning voice (`voice_match`) brings its visits and last order; no name is stored.
//   • RECEIPT: at payment the visit is captured (receiptRecord) and sent to the brain's store,
//     tagged by voice print: the order, the conversation with who said each line, and every
//     upsell with why it was shown, whether the employee said it and its outcome. The same
//     record goes on the printed receipt (assistReceipt.js).

import { useEffect, useRef, useState } from "react"
import { BRAND, MENU_KEY } from "../data/catalog.js"
import { resolveAssistEnabled, getDemoId } from "./demoContext.js"
import { loadAssistAuth, clearAssistAuth, signInAssist } from "./vavoomAuth.js"
import { SttClient } from "./sttClient.js"
import { CounterPresence } from "./presence.js"
import { onActivity } from "./activity.js"
import { BehaviourTracker } from "./behaviour.js"
import { parseUtterance, isGreeting } from "./orderParser.js"
import { classifyReply, pitches } from "./acceptance.js"
import { pickUpsell, cardKey } from "./upsellEngine.js"
import { detectHotkeys, TIMING_RULES, HOTKEYS } from "./hotkeys.js"
import { INDEX, findEntry, defaultSize } from "./menuIndex.js"
import { startAssistPublisher } from "./assistSync.js"
import { setAssistReceipt } from "./assistReceipt.js"

// The tenant whisper and the brain know this menu as (its `restaurant` context, never shown).
// The burger menu is its own tenant, `demopos`: whisper only transcribes for it (MEAL_LADDER_TENANTS,
// no upsell of its own), and the upsell comes from the demopos brain through the speech bridge.
const RESTAURANT = MENU_KEY === "burgers" ? "demopos" : "gregorys"
const CARD_TIMEOUT_MS = 25000
const CARD_RESULT_MS = 1800   // how long "Added ✓" / "Declined" stays before the next card
const REPLY_MIN_MS = 800      // a reply must come after the card was on screen this long
const STANDBY_REPLAY_MS = 20000
const BY_ID = new Map(INDEX.entries.map((e) => [e.id, e]))
const COMPLAINT_PAUSE_MS = 60000
// Which card source may replace an unanswered card of another (strictly higher wins).
const SOURCE_RANK = { hotkey: 4, brain: 3.5, basket: 3, upsize: 3, ai: 2, behaviour: 1 }
// Which hot keys are the customer talking (hotkeys.json `family`), for marking whose line it was.
const CUSTOMER_KEYS = new Set(HOTKEYS.filter((h) => h.family === "customer").map((h) => h.key))
const HOTKEY_BY_KEY = new Map(HOTKEYS.map((h) => [h.key, h]))
// A meaning answer older than this is for a line long gone and is dropped.
const MEANING_STALE_MS = 10000
const BRAIN_DEBOUNCE_MS = 150
// How long a spoken signal keeps acting as a behaviour for the upsell engine.
const SPOKEN_UNDECIDED_MS = 30000
const SPOKEN_CLOSING_MS = 30000

// Items the operator said are out, kept for the rest of the day per demo room.
const outKey = () => {
  const d = new Date()
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  return `vavoom-assist-out-${getDemoId()}-${day}`
}
function loadOutToday() {
  try { return new Set(JSON.parse(localStorage.getItem(outKey()) || "[]")) } catch { return new Set() }
}
function saveOutToday(ids) {
  try { localStorage.setItem(outKey(), JSON.stringify([...ids])) } catch { /* private mode: this session only */ }
}

// Per-customer hot-key state (see upsellEngine.js ctx.hot). `blocked` starts as today's
// out-of-stock list, so a new customer is never offered those either.
const newHot = (outToday) => ({
  effects: new Map(), blocked: new Set(outToday || []), outOfStock: [], interest: [], disliked: [], temperature: [],
  constraints: new Set(), pausedUntil: 0, fired: [],
})
// Hot-key effects whose items are not an order: out, only asked about, disliked, complained about.
const NOT_ORDER = new Set(["block_item", "interest_item", "alternative", "counter_sweet", "counter_bitter", "pause"])
const HAS_SOUVENIR = INDEX.entries.some((e) => /merch|souvenir|gift/i.test(e.category))
// Ordering an item that is out today is a rule, not a phrase (like "not patient"): it is
// recorded with the hot keys and answered with the item's closest substitute.
const ORDERED_OUT = { key: "ordered_out", effect: "ordered_out", asked: "" }
// Temperature hot keys: feeling hot or cold, or wanting something cold or hot. Each line that
// says one adds a record the upsell engine answers once (Something cold / Something warm).
const TEMPERATURE = {
  weather_hot: { cold: true, wanted: false }, want_cold: { cold: true, wanted: true },
  weather_cold: { cold: false, wanted: false }, want_hot: { cold: false, wanted: true },
}

// Exported for the transcript tests (test/run-transcripts.mjs), which drive it with a
// simulated POS and clock; the app only uses it through useAssist().
export function createEngine(set, posRef) {
  const st = {
    phase: "standby",
    sessionStart: 0,
    heard: new Map(),     // entryId → { entry, qty, size, added, expect, cartAtAdd, locked, cancelled, at, sources:Set }
    card: null,
    offers: [],
    ai: null,
    lastAdded: null,
    lastAddedAt: 0,
    standbyLines: [],
    tracker: new BehaviourTracker(),
    resultTimer: null,
    outToday: loadOutToday(),
    trigger: "",
    firstOrderAt: 0,
    hot: null,
    convo: [],        // this visit's lines: { at, text, role: customer | operator | "" }
    voice: null,      // the bridge's voice_match for this visit
    brain: null,      // the brain's latest pick (upsellEngine.js ctx.brain)
    brainSeq: 0,
    brainTimer: null,
    behavioursNow: [],
    visit: 0,           // counts customers, so a meaning answer for an earlier one is dropped
    meaningSeq: 0,
    meaningReqs: new Map(), // req_id → { t, text, ids rung up from that line, visit, convo entry }
  }
  st.hot = newHot(st.outToday)
  const now = () => Date.now()
  const log = (text) => set.events((prev) => [{ at: now(), text }, ...prev].slice(0, 40))
  const cart = () => posRef.current?.cart || []
  const countOf = (id, size) => cart().filter((e) => e.item.id === id && (!size || e.size === size)).reduce((s, e) => s + e.count, 0)
  const publishHeard = () => set.heard([...st.heard.values()].map((h) => ({
    id: h.entry.id, name: h.entry.name, size: h.size ? h.size[0] : "", qty: h.qty, added: h.added, locked: h.locked,
    sources: [...h.sources],
  })))
  const publishCard = () => set.card(st.card ? { ...st.card } : null)
  const publishOffers = () => set.offers(st.offers.map((o) => ({ ...o })))
  const publishHot = () => set.hot({
    fired: st.hot.fired.slice(), pausedUntil: st.hot.pausedUntil, constraints: [...st.hot.constraints],
    outToday: [...st.outToday].map((id) => BY_ID.get(id)?.name || id),
    outIds: [...st.outToday], // the POS marks these menu tiles "Out today"
  })

  function resetCustomer() {
    st.heard = new Map()
    st.card = null
    st.offers = []
    st.ai = null
    st.lastAdded = null
    st.lastAddedAt = 0
    st.firstOrderAt = 0
    st.prevLine = null
    st.convo = []
    st.voice = null
    st.brain = null
    st.visit += 1
    st.meaningReqs.clear()
    clearTimeout(st.brainTimer)
    set.voice?.(null)
    set.brain?.(null)
    st.hot = newHot(st.outToday)
    clearTimeout(st.resultTimer)
    publishHeard(); publishCard(); publishOffers(); publishHot()
    set.aiNote(null)
    set.customerName("")
  }

  function beginCustomer(trigger) {
    if (st.phase === "active") return
    st.phase = "active"
    st.sessionStart = now()
    st.trigger = trigger
    resetCustomer()
    set.phase("active")
    set.trigger(trigger)
    log(`Customer session started — ${trigger}`)
    // Replay what was said just before the session opened (the first words count).
    const replay = st.standbyLines.filter((l) => now() - l.at < STANDBY_REPLAY_MS)
    st.standbyLines = []
    for (const l of replay) handleFinal(l.text, { replay: true })
  }

  function endCustomer(reason, stt) {
    if (st.phase !== "active") return
    const accepted = st.offers.filter((o) => o.outcome === "accepted").length
    log(`Session ended — ${reason} · ${st.offers.length} upsell(s) offered, ${accepted} accepted`)
    st.phase = "standby"
    st.tracker.reset()
    resetCustomer()
    set.phase("standby")
    set.trigger("")
    stt?.newCustomer()
  }

  // ── Heard order → ticket ──────────────────────────────────────────────────
  function mergeHeard(items, source) {
    const p = posRef.current
    for (const it of items) {
      const id = it.entry.id
      let h = st.heard.get(id)
      if (it.negated) {
        if (h && h.added > 0) {
          const line = cart().find((e) => e.item.id === id && (e.via?.voice || 0) > 0) || cart().find((e) => e.item.id === id)
          if (line) for (let n = 0; n < Math.min(h.added, line.count); n++) p.decrementFromCart(line.key, "voice")
          log(`Heard "no ${it.entry.name}" — removed what speech had added`)
        }
        if (h) { h.qty = 0; h.added = 0; h.locked = true; h.cancelled = true }
        continue
      }
      // Whisper re-sends its whole running order after every line, and can still list an
      // item the customer just cancelled or the cashier took off. Only a fresh spoken
      // mention (this POS's own parser, source "speech") can bring such an item back.
      if (source === "whisper" && h && (h.cancelled || h.locked)) continue
      if (st.hot.blocked.has(id)) continue // out today: never rung up from speech (handleFinal offers the substitute)
      if (!h) {
        h = { entry: it.entry, qty: 0, size: null, added: 0, expect: 0, locked: false, cancelled: false, at: 0, sources: new Set() }
        st.heard.set(id, h)
      }
      h.qty = it.more ? h.qty + it.qty : Math.max(h.qty, it.qty)
      h.at = now()
      h.sources.add(source)
      if (source === "speech") { h.locked = false; h.cancelled = false } // a new mention re-opens it
      if (it.size && (!h.size || h.size[0] !== it.size[0])) {
        // "make the fries large": swap what speech added to the new size.
        if (h.size && h.added > 0) {
          const line = cart().find((e) => e.item.id === id && e.size === h.size[0])
          const n = line ? Math.min(h.added, line.count) : 0
          for (let k = 0; k < n; k++) p.decrementFromCart(line.key, "voice")
          h.added -= n
          if (n) log(`Changed ${it.entry.name} to ${it.size[0]}`)
        }
        h.size = it.size
      }
    }
    publishHeard()
  }

  function syncTicket() {
    const p = posRef.current
    if (!p) return
    const c = cart()
    for (const h of st.heard.values()) {
      const have = countOf(h.entry.id)
      // The cashier removed some of what speech added. Only judged once the ticket has
      // re-rendered since our add (a different cart array): within the same tick the
      // cart still reads as it was before the add.
      if (h.added > 0 && c !== h.cartAtAdd && have < h.expect) { h.locked = true; h.expect = have }
      if (h.locked || h.qty <= 0) continue
      const toAdd = h.qty - Math.max(h.added, have)
      if (toAdd <= 0) continue
      const [size, price] = h.size || defaultSize(h.entry)
      // Book the units BEFORE adding: addToCart emits an activity event that re-enters
      // recompute(), and the re-entry must already see them as added.
      h.added += toAdd
      h.expect = have + toAdd
      h.cartAtAdd = c
      for (let n = 0; n < toAdd; n++) p.addToCart(h.entry.item, size, price, h.entry.category, "voice")
      log(`Added from what was said: ${toAdd}× ${size !== "each" ? `${size} ` : ""}${h.entry.name}`)
    }
    publishHeard()
  }

  // ── Upsell card ───────────────────────────────────────────────────────────
  function cardSatisfied(c) {
    if (c.kind === "upsize" || c.kind === "swap") return countOf(c.entry.id, c.size) > c.baseCount
    if (c.again) return countOf(c.entry.id) > c.baseCount
    return countOf(c.entry.id) > 0
  }

  function resolveCard(outcome, via) {
    const c = st.card
    if (!c || c.state !== "pending") return
    c.state = outcome
    c.via = via
    c.resolvedAt = now()
    const o = st.offers.find((x) => x.key === c.key && !x.outcome)
    if (o) { o.outcome = outcome; o.via = via; o.pitched = !!c.pitched }
    log(`Upsell ${outcome}: ${c.title}${via ? ` (${via})` : ""}`)
    publishCard(); publishOffers()
    clearTimeout(st.resultTimer)
    st.resultTimer = setTimeout(() => recompute(), CARD_RESULT_MS + 50)
  }

  function acceptCard(via) {
    const c = st.card
    if (!c || c.state !== "pending") return
    const p = posRef.current
    if (!cardSatisfied(c)) {
      if (c.kind === "upsize") {
        const line = cart().find((e) => e.item.id === c.entry.id && e.size === c.fromSize)
        if (line) p.decrementFromCart(line.key, "voice")
      }
      if (c.kind === "swap" && c.fromEntry) {
        // A cheese / bacon upgrade or an allergy swap: the new item takes the old one's place.
        const line = cart().find((e) => e.item.id === c.fromEntry.id && (!c.fromSize || e.size === c.fromSize))
          || cart().find((e) => e.item.id === c.fromEntry.id)
        if (line) { p.decrementFromCart(line.key, "upsell"); log(`Swapped ${line.item.name} for the ${c.entry.name}`) }
      }
      p.addToCart(c.entry.item, c.size, c.price, c.entry.category, "upsell")
    }
    // A substitute takes the place of the item that is out: if that item is on the ticket
    // (the cashier tapped it), it comes off.
    const outId = c.tag === "Closest substitute" ? c.origin?.entry?.id : null
    if (outId) {
      for (const line of cart().filter((l) => l.item.id === outId)) {
        for (let n = 0; n < line.count; n++) p.decrementFromCart(line.key, "upsell")
        log(`Swapped out ${line.item.name} (out today) for the ${c.entry.name}`)
      }
    }
    resolveCard("accepted", via)
  }

  const declineCard = (via) => resolveCard("declined", via)

  /** Add the complementary item shown under an asked-about card. */
  function addPair() {
    const c = st.card
    if (!c?.pair || c.pairAdded) return
    const { entry, size, price } = c.pair
    posRef.current.addToCart(entry.item, size, price, entry.category, "upsell")
    c.pairAdded = true
    log(`Added the pairing: ${entry.name}`)
    publishCard()
  }

  /** Forget today's out-of-stock list (a new demo, or the item is back). */
  function clearOutToday() {
    for (const id of st.outToday) st.hot.blocked.delete(id)
    st.outToday = new Set()
    saveOutToday(st.outToday)
    log("Out-of-stock list for today cleared")
    publishHot()
    recompute()
  }

  // recompute() can be re-entered (adding to the ticket emits an activity event that
  // calls it). A nested call is deferred to a microtask instead of running inside the
  // outer one. It is also deferred while a line's hot keys are being applied
  // (st.applying), so no card is picked from half of what the line said.
  function recompute() {
    if (st.busy || st.applying) { st.again = true; return }
    st.busy = true
    try { recomputeNow() } finally { st.busy = false }
    if (st.again) { st.again = false; queueMicrotask(recompute) }
  }

  function recomputeNow() {
    const t = now()
    const c = cart()
    const roles = new Set(c.map((e) => BY_ID.get(e.item.id)?.role).filter(Boolean))
    const cats = new Set(c.map((e) => e.category))
    const recentlyHeard = [...st.heard.values()].map((h) => ({ entry: h.entry, at: h.at }))
    const behaviours = st.tracker.estimate(t, {
      cartRoles: roles, cartCategories: cats, sessionActive: st.phase === "active",
      sessionAge: t - st.sessionStart, recentlyHeard,
    })
    set.behaviours(behaviours)
    // What was said counts like screen behaviour for the engine's gates.
    const fx = st.hot.effects
    const spoken = []
    if (fx.has("value")) spoken.push({ key: "value_seeking" })
    if (fx.has("large")) spoken.push({ key: "going_large" })
    if (fx.has("undecided") && t - fx.get("undecided") < SPOKEN_UNDECIDED_MS) spoken.push({ key: "undecided" })
    if (fx.has("closing") && t - fx.get("closing") < SPOKEN_CLOSING_MS) spoken.push({ key: "checkout" })
    if (st.phase !== "active") return
    syncTicket()

    const cur = st.card
    const pending = cur && cur.state === "pending"
    // Hold the card (sticky) until it is answered, except that a card from a strictly
    // higher-priority source takes its place (SOURCE_RANK: hot key > basket / upsize >
    // AI > behaviour). Strictly higher only, so two cards can never swap back and forth.
    // This also covers timing: the order, whisper's parsed order and its AI pick can all
    // land before the ticket redraws, so the first pick may be made on an empty ticket.
    if (pending) {
      if (cardSatisfied(cur)) { resolveCard("accepted", "rung up"); return }
      if (t - cur.shownAt > CARD_TIMEOUT_MS) { resolveCard("lapsed", "no answer"); return }
    } else if (cur && t - cur.resolvedAt < CARD_RESULT_MS) {
      return
    }
    // Re-picking while a card is up: leave that card out of the offer log for the pick,
    // so the engine may choose it again (then nothing changes).
    const offers = pending ? st.offers.filter((x) => !(x.key === cur.key && !x.outcome)) : st.offers
    st.behavioursNow = behaviours
    const next = pickUpsell({ cart: c, lastAdded: st.lastAdded, behaviours: [...behaviours, ...spoken], ai: st.ai, brain: st.brain, offers, hot: { ...st.hot, now: t } })
    // An AI pick that can no longer be offered (on the ticket, already offered, or out) is
    // stale; drop it. One that only lost this round to the basket is kept: it ranks below
    // basket completion and fills in once the basket is complete.
    if (st.ai && next?.source !== "ai") {
      const id = st.ai.entry.id
      if (countOf(id) > 0 || st.offers.some((o) => o.entryId === id) || st.hot.blocked.has(id)) st.ai = null
    }
    if (!next) {
      if (cur && !pending) { st.card = null; publishCard() }
      return
    }
    const key = cardKey(next)
    if (pending) {
      // An allergy answer is about safety: it replaces any card that is not itself an allergy answer.
      const allergyFirst = /^Allergy/.test(next.tag || "") && !/^Allergy/.test(cur.tag || "")
      if (cur.key === key || (!allergyFirst && (SOURCE_RANK[next.source] || 0) <= (SOURCE_RANK[cur.source] || 0))) return
      // The displaced card leaves the offer log: it was never answered, so it must not
      // block that item from being offered again later.
      st.offers = offers
      log(`Upsell replaced (${next.source}): ${cur.title}`)
    }
    st.card = { ...next, key, shownAt: t, state: "pending", baseCount: countOf(next.entry.id, next.kind === "upsize" || next.kind === "swap" ? next.size : undefined) }
    st.offers.push({ key, entryId: next.entry.id, kind: next.kind, again: !!next.again, source: next.source, title: next.title, outcome: null, atCheckout: !!next.atCheckout, at: t,
      tag: next.tag || "", why: next.why || next.reason || "", line: next.reason || "", pitched: false })
    if (next.source === "ai") st.ai = null // consumed
    if (next.source === "brain") st.brain = null // consumed; the next decision asks again
    // A hot-key response is offered once per time it is said (upsellEngine.js `origin`).
    if (next.origin) {
      if (next.origin.effect) st.hot.effects.delete(next.origin.effect)
      else next.origin.offered = true
    }
    log(`Upsell shown (${next.source}): ${next.title} — ${next.reason}`)
    publishCard(); publishOffers()
  }

  // ── Transcript ──────────────────────────────────────────────────────────────
  function handleFinal(text, { replay = false, typed = false } = {}) {
    const t = now()
    const parsed = parseUtterance(text)
    if (!replay) set.lines((prev) => [...prev, { text, kind: parsed.kind, at: t, typed }].slice(-12))
    if (st.phase !== "active") {
      if (isGreeting(text) || parsed.kind === "order") {
        st.standbyLines.push({ text, at: t })
        beginCustomer(isGreeting(text) ? "greeting heard" : "order heard")
        return // beginCustomer replayed this line
      }
      st.standbyLines.push({ text, at: t })
      st.standbyLines = st.standbyLines.filter((l) => t - l.at < STANDBY_REPLAY_MS)
      return
    }
    const cur = st.card
    const prev = st.prevLine
    st.prevLine = { text, at: t }
    let declined = null
    if (!replay && cur && cur.state === "pending" && t - cur.shownAt >= REPLY_MIN_MS) {
      // Read in context (acceptance.js): the line before, if it came after the card, and
      // whether the cashier has pitched the card yet.
      const r = classifyReply(text, { prev: prev && prev.at >= cur.shownAt ? prev.text : "", card: cur })
      if (r === "yes") acceptCard("spoken yes")
      else if (r === "no") { declineCard("spoken no"); declined = cur }
      else if (pitches(text, cur)) cur.pitched = true
    }
    const hits = detectHotkeys(text)
    // "No thanks, that's it": the card just declined was the last chance, so no more cards
    // after it (upsellEngine.js stops once a checkout offer has been made).
    if (declined && hits.some((h) => h.key === "closing")) {
      const o = st.offers.find((x) => x.key === declined.key)
      if (o) o.atCheckout = true
    }
    // Items the line says are out, only asks about, doesn't like, or complains about ("the
    // shake was too sweet", "I was missing my fries") are not an order.
    const notOrdered = new Set(hits.filter((h) => NOT_ORDER.has(h.effect)).flatMap((h) => h.items.map((e) => e.id)))
    let rungUp = []
    if (parsed.kind === "order") {
      const items = parsed.items.filter((i) => !notOrdered.has(i.entry.id))
      if (items.length) mergeHeard(items, "speech")
      rungUp = items.filter((i) => !i.negated).map((i) => i.entry.id)
      // An item that is out today is not rung up (mergeHeard skips it); its closest
      // substitute is offered instead.
      const out = items.filter((i) => !i.negated && st.hot.blocked.has(i.entry.id)).map((i) => i.entry)
      if (out.length) {
        hits.push({ ...ORDERED_OUT, label: "Ordered an item that's out", items: out, phrase: text.slice(0, 90),
          action: "Not rung up (out today) — the closest substitute instead" })
      }
      // Not patient: the first order line within the window of the session opening. Not
      // judged when the order line itself opened the session (there is no earlier moment).
      const rule = TIMING_RULES.impatient
      if (items.length && !st.firstOrderAt) {
        st.firstOrderAt = t
        if (rule && st.trigger !== "order heard" && t - st.sessionStart <= rule.window_ms) {
          hits.push({ key: rule.key, label: rule.label, effect: rule.effect, action: rule.action, items: [], asked: "",
            phrase: `ordered ${((t - st.sessionStart) / 1000).toFixed(1)} s after the session opened` })
        }
      }
    }
    if (hits.length) applyHotkeys(hits, t)
    // Whose line was it? The customer orders, answers the card or says a customer hot word; the
    // employee greets, offers or pitches. Lines that are neither stay unassigned.
    const customer = parsed.kind === "order" || !!declined || cur?.state === "accepted"
      || hits.some((h) => CUSTOMER_KEYS.has(h.key)) || /^\s*(yes|yeah|no|nope|sure|okay|ok)\b/i.test(text)
    const operator = !customer && (isGreeting(text) || parsed.kind === "offer" || (cur && pitches(text, cur)) || /\?\s*$/.test(text))
    const role = customer ? "customer" : operator ? "operator" : ""
    const said = { at: t, text, role }
    st.convo.push(said)
    if (role) set.voiceLine?.(role)
    recompute()
    scheduleBrain()
    // The meaning layer reads the same line on the GPU box (handleMeaning applies its answer).
    if (set.requestMeaning) {
      st.meaningSeq += 1
      st.meaningReqs.set(st.meaningSeq, { t, text, ids: rungUp, visit: st.visit, said })
      for (const [id, r] of st.meaningReqs) if (t - r.t > MEANING_STALE_MS) st.meaningReqs.delete(id)
      set.requestMeaning({ req_id: st.meaningSeq, text, prev: prev ? prev.text : "", exact: hits.map((h) => h.key) })
    }
  }

  // ── The meaning layer (demopos tenant) ─────────────────────────────────────
  /** The gateway's reading of a line (`meaning`): hot keys the exact words missed, fired the same way. */
  function handleMeaning(msg) {
    const req = msg && st.meaningReqs.get(msg.req_id)
    if (!req) return
    st.meaningReqs.delete(msg.req_id)
    if (msg.error) { log(`Meaning layer unavailable: ${msg.error}`); return }
    if (st.phase !== "active" || req.visit !== st.visit || now() - req.t > MEANING_STALE_MS) return
    const fired = []
    for (const m of msg.hits || []) {
      const h = HOTKEY_BY_KEY.get(m.key)
      if (!h || st.hot.fired.some((f) => f.at === req.t && f.key === m.key)) continue
      let items = []
      if (NOT_ORDER.has(h.effect)) {
        // A complaint about an item is not an order: what speech rang up from this line before
        // its meaning was known comes back off, as the exact words would have kept it off.
        items = parseUtterance(req.text).items.filter((i) => !i.negated).map((i) => i.entry)
        const undo = items.filter((e) => req.ids.includes(e.id))
        if (undo.length) mergeHeard(undo.map((e) => ({ entry: e, qty: 1, size: null, negated: true, more: false })), "speech")
      }
      fired.push({ key: h.key, label: `${h.label} — by meaning (${Number(m.score).toFixed(2)})`, effect: h.effect,
        action: h.action, meaning: h.meaning, phrase: m.clause, items, asked: "" })
    }
    if (!fired.length) return
    // The line said something about the customer, so it was the customer's.
    if (!req.said.role && fired.some((h) => CUSTOMER_KEYS.has(h.key))) {
      req.said.role = "customer"
      set.voiceLine?.("customer")
    }
    applyHotkeys(fired, now())
    recompute()
    scheduleBrain()
  }

  // ── The upsell brain (demopos tenant) ──────────────────────────────────────
  /** Ask the brain for one decision, coalescing a line and the ticket changes it causes. */
  function scheduleBrain() {
    if (!set.requestBrain || st.phase !== "active") return
    clearTimeout(st.brainTimer)
    st.brainTimer = setTimeout(() => {
      if (st.phase !== "active") return
      st.brainSeq += 1
      set.requestBrain({
        req_id: st.brainSeq,
        transcript: st.convo.length ? st.convo[st.convo.length - 1].text : "",
        context: {
          ticket: cart().map((l) => ({ name: l.item.name, size: l.size, qty: l.count, price: l.price })),
          lines: st.convo.slice(-6).map((l) => l.text),
          constraints: [...st.hot.constraints],
          effects: [...st.hot.effects.keys()],
          behaviours: st.behavioursNow.map((b) => ({ key: b.key, category: b.category })),
          offers: st.offers.map((o) => ({ title: o.title, outcome: o.outcome })),
          out_today: [...st.outToday].map((id) => BY_ID.get(id)?.name).filter(Boolean),
          hour: new Date(now()).getHours(),
        },
      })
    }, BRAIN_DEBOUNCE_MS)
  }

  /** The brain's answer (brain_upsell): the newest request's pick becomes a candidate card. */
  function handleBrain(msg) {
    if (!msg || msg.req_id !== st.brainSeq) return // an answer to an older ticket
    if (msg.error) { log(`Upsell brain unavailable: ${msg.error}`); return }
    set.brain?.({ ...msg, at: now() })
    if (!msg.name) { st.brain = null; return }
    const entry = findEntry(msg.name)
    if (!entry) { log(`Upsell brain suggested "${msg.name}" — not on this POS menu, skipped`); return }
    const fromEntry = msg.from ? findEntry(msg.from) : null
    const fromLine = fromEntry && cart().find((l) => l.item.id === fromEntry.id)
    const kind = msg.kind === "upgrade" || msg.kind === "swap" ? "swap" : msg.kind === "upsize" ? "upsize" : "add"
    st.brain = {
      entry, kind, size: msg.size, price: msg.price, fromSize: msg.from_size || fromLine?.size || "", fromEntry,
      tag: msg.tag || "", framing: msg.framing || "", why: msg.reason || "", at: now(),
    }
    log(`Upsell brain (${msg.step || "?"}, ${msg.latency_ms ?? "?"} ms${msg.round_trip_ms != null ? `, ${msg.round_trip_ms} ms round trip` : ""}): ${msg.item} — ${msg.framing}`)
    recompute()
  }

  /** The voice print (voice_match): a returning voice brings its history; a new one is anonymous. */
  function handleVoice(msg) {
    if (!msg || msg.error) { if (msg?.error) log(`Voice print unavailable: ${msg.error}`); return }
    st.voice = msg
    set.voice?.({ ...msg })
    const last = (msg.last_order || []).map((x) => x.name).join(", ")
    log(msg.matched
      ? `Voice print: returning voice ${msg.voice_id} (score ${msg.score}, tier ${msg.tier}, ${msg.visits} visit(s)) — last time: ${last || "nothing recorded"}`
      : `Voice print: new voice ${msg.voice_id} (${msg.seconds} s of speech)`)
    scheduleBrain()
  }

  /** The paid visit, for the brain's store and the printed receipt. */
  function receiptRecord() {
    const c = cart()
    return {
      voice: st.voice ? { voice_id: st.voice.voice_id, matched: !!st.voice.matched, score: st.voice.score, tier: st.voice.tier,
        visits: st.voice.visits } : null,
      items: c.map((l) => ({ name: l.item.name, size: l.size, qty: l.count, price: l.price })),
      total: Math.round(c.reduce((sum, l) => sum + l.price * l.count, 0) * 100) / 100,
      transcript: st.convo.map((l) => ({ at: l.at, role: l.role || "unknown", text: l.text })),
      upsells: st.offers.map((o) => ({ title: o.title, source: o.source, tag: o.tag || "", why: o.why || "", line: o.line || "",
        pitched_by_employee: !!o.pitched, outcome: o.outcome || "not answered", via: o.via || "", at: o.at })),
    }
  }

  /** Apply a line's hot keys, then force the card on screen to be re-picked. */
  function applyHotkeys(hits, t) {
    const hot = st.hot
    st.applying = true // taking items off the ticket below must not pick a card mid-line
    try {
      for (const h of hits) {
        if (h.effect.startsWith("constrain:")) hot.constraints.add(h.effect.slice("constrain:".length))
        hot.effects.set(h.effect, t)
        if (h.effect === "pause") hot.pausedUntil = t + COMPLAINT_PAUSE_MS
        if (h.effect === "block_item") {
          for (const e of h.items) {
            hot.blocked.add(e.id)
            st.outToday.add(e.id)
            saveOutToday(st.outToday)
            hot.outOfStock.push({ entry: e, at: t })
            // Speech may already have rung it up: take that back off, like "no fries".
            const heard = st.heard.get(e.id)
            if (heard && heard.added > 0) mergeHeard([{ entry: e, qty: 1, size: null, negated: true, more: false }], "speech")
          }
        }
        if (h.effect === "ordered_out") for (const e of h.items) hot.outOfStock.push({ entry: e, at: t })
        if (TEMPERATURE[h.effect]) {
          // One record per temperature per line; "I'm so hot, something cold please" is one want.
          const { cold, wanted } = TEMPERATURE[h.effect]
          const same = hot.temperature.find((r) => r.at === t && r.cold === cold)
          if (same) same.wanted = same.wanted || wanted
          else hot.temperature.push({ cold, wanted, at: t })
        }
        if (h.effect === "interest_item") {
          for (const e of h.items) hot.interest.push({ entry: e, asked: "", at: t })
          if (!h.items.length && h.asked) hot.interest.push({ entry: null, asked: h.asked, at: t })
        }
        if (h.effect === "alternative") {
          // The item they don't like: the one named, else the last one ordered.
          const e = h.items[0] || (st.lastAdded && BY_ID.get(st.lastAdded.item.id))
          if (e) hot.disliked.push({ entry: e, at: t })
        }
        if (h.effect === "souvenir" && !HAS_SOUVENIR) log("Took forever — this menu has no souvenir to give, so no complimentary card")
        const named = h.items.length ? ` (${h.items.map((e) => e.name).join(", ")})` : h.asked ? ` (“${h.asked}”)` : ""
        hot.fired.unshift({ at: t, key: h.key, label: h.label, phrase: h.phrase, items: h.items.length ? h.items.map((e) => e.name) : h.asked ? [`“${h.asked}”`] : [], action: h.action })
        log(`Hot key — ${h.label}: “${h.phrase}”${named} → ${h.action}`)
      }
    } finally {
      st.applying = false
    }
    hot.fired = hot.fired.slice(0, 30)
    // Force the re-evaluation: an unanswered card leaves the screen (and the offer log,
    // so it may be picked again if it is still the best answer) and recompute re-picks.
    const cur = st.card
    if (cur && cur.state === "pending") {
      st.offers = st.offers.filter((x) => !(x.key === cur.key && !x.outcome))
      st.card = null
      publishCard(); publishOffers()
    }
    publishHot()
  }

  function handleWhisperOrder(items) {
    if (st.phase !== "active") return
    const mapped = []
    for (const it of items || []) {
      const entry = findEntry(it.name)
      if (entry) mapped.push({ entry, qty: Number(it.quantity) || 1, size: null, negated: false, more: false })
    }
    if (mapped.length) { mergeHeard(mapped, "whisper"); recompute() }
  }

  function handleAi(vvm1) {
    const item = vvm1?.topCandidate?.item
    if (!item) return
    const entry = findEntry(item)
    if (!entry) {
      set.aiNote({ item, grounded: false })
      log(`Vavoom AI suggested "${item}" — not on this POS menu, skipped`)
      return
    }
    set.aiNote({ item: entry.name, grounded: true })
    st.ai = { entry, reason: (vvm1.topCandidate.reasons || []).filter(Boolean)[0] || "Suggested from the conversation", at: now() }
    if (st.phase === "active") recompute()
  }

  function onActivityEvent(e) {
    st.tracker.record(e)
    if (e.type === "item_added") {
      st.lastAdded = { item: e.item, category: e.category, size: e.size, price: e.price }
      st.lastAddedAt = e.at
    }
    // The item the pairing follows was taken off: pair with the newest other line instead.
    if (e.type === "item_removed" && st.lastAdded?.item.id === e.item.id
        && countOf(e.item.id) <= 1) {
      const other = [...cart()].reverse().find((l) => l.item.id !== e.item.id)
      st.lastAdded = other ? { item: other.item, category: other.category, size: other.size, price: other.price } : null
    }
    if (st.phase !== "active" && (e.type === "item_click" || (e.type === "item_added" && e.source === "cashier"))) beginCustomer("cashier started ringing")
    if (e.type === "item_added" || e.type === "item_removed") scheduleBrain()
    // The cashier tapped an item that is out today. The POS still rings it up; the
    // closest substitute pops up, and Add swaps it in (acceptCard).
    const tapped = e.type === "item_click" && st.phase === "active" && st.outToday.has(e.item.id) && BY_ID.get(e.item.id)
    if (tapped) {
      applyHotkeys([{ ...ORDERED_OUT, label: "Tapped an item that's out", items: [tapped], phrase: "tapped on the POS",
        action: "Still rung up — the closest substitute is offered, and Add swaps it in" }], now())
    }
    recompute()
  }

  return { st, beginCustomer, endCustomer, handleFinal, handleWhisperOrder, handleAi, handleBrain, handleVoice, handleMeaning, receiptRecord,
    acceptCard, declineCard, addPair, clearOutToday, recompute, onActivityEvent, log }
}

export function useAssist(pos) {
  const [enabled, setEnabled] = useState(false)
  const [auth, setAuth] = useState(() => loadAssistAuth())
  const [status, setStatus] = useState({ mic: "off", stt: "off", presence: "off" })
  const [level, setLevel] = useState(0)
  const [phase, setPhase] = useState("standby")
  const [trigger, setTrigger] = useState("")
  const [partial, setPartial] = useState("")
  const [lines, setLines] = useState([])
  const [heard, setHeard] = useState([])
  const [card, setCard] = useState(null)
  const [offers, setOffers] = useState([])
  const [behaviours, setBehaviours] = useState([])
  const [customerName, setCustomerName] = useState("")
  const [events, setEvents] = useState([])
  const [aiNote, setAiNote] = useState(null)
  const [presenceOn, setPresenceOn] = useState(false)
  const [present, setPresent] = useState(false)
  const [camStream, setCamStream] = useState(null)
  // What whisper and the bridge actually sent, newest first (partials and "silence" heartbeats left out): the
  // full bar's "behind the scenes" view.
  const [backend, setBackend] = useState([])
  // Hot keys fired for this customer and what they currently constrain (full bar).
  const [hot, setHot] = useState({ fired: [], pausedUntil: 0, constraints: [], outToday: [], outIds: [] })
  // The voice print of this visit and the brain's latest answer (full bar, upsell square).
  const [voice, setVoice] = useState(null)
  const [brain, setBrain] = useState(null)

  const posRef = useRef(pos)
  posRef.current = pos
  const engineRef = useRef(null)
  const sttRef = useRef(null)
  if (!engineRef.current) {
    engineRef.current = createEngine({
      events: setEvents, heard: setHeard, card: setCard, offers: setOffers, phase: setPhase,
      trigger: setTrigger, lines: setLines, behaviours: setBehaviours, aiNote: setAiNote, customerName: setCustomerName,
      hot: setHot, voice: setVoice, brain: setBrain,
      voiceLine: (role) => sttRef.current?.voiceLine(role),
      requestBrain: (req) => sttRef.current?.requestUpsell(req),
      // The meaning layer's examples and menu masking are the burger menu's (tenant demopos).
      requestMeaning: RESTAURANT === "demopos" ? (req) => sttRef.current?.requestMeaning(req) : undefined,
    }, posRef)
  }
  const E = engineRef.current
  const presRef = useRef(null)

  useEffect(() => { resolveAssistEnabled().then(setEnabled) }, [])

  // Screen activity + a 1 s tick (dwell-time behaviours and card timeouts move with time).
  useEffect(() => {
    if (!enabled) return undefined
    const off = onActivity((e) => {
      E.onActivityEvent(e)
      if (e.type === "payment_complete") {
        // Capture the visit before it resets: to the brain's store (tagged by voice print) and
        // to the receipt printer, which runs right after in the same click.
        const record = E.receiptRecord()
        setAssistReceipt(record)
        sttRef.current?.sendReceipt(record)
        E.endCustomer("paid", sttRef.current)
      }
    })
    const tick = setInterval(() => E.recompute(), 1000)
    return () => { off(); clearInterval(tick) }
  }, [enabled, E])

  // Re-check the ticket whenever it changes (heard items, card satisfied by a tap).
  useEffect(() => { if (enabled) E.recompute() }, [enabled, pos.cart, E])

  // Microphone + speech bridge, once signed in.
  useEffect(() => {
    if (!enabled || !auth?.ticket) return undefined
    let lastLevel = 0
    const client = new SttClient({
      ticket: auth.ticket,
      restaurant: RESTAURANT,
      franchiseName: BRAND.name,
      onStatus: (patch) => {
        setStatus((s) => ({ ...s, ...patch }))
        if (patch.sttError === "sign_in_required") { clearAssistAuth(); setAuth(null) }
      },
      onLevel: (rms) => {
        const t = performance.now()
        if (t - lastLevel > 120) { lastLevel = t; setLevel(Math.min(1, rms * 6)) }
      },
      onMessage: (msg) => {
        // Partials and whisper's per-chunk "silence" heartbeats would flood the list.
        if (msg.type !== "partial" && msg.type !== "silence") {
          setBackend((prev) => [{ at: Date.now(), type: msg.type, summary: summarize(msg) }, ...prev].slice(0, 60))
        }
        switch (msg.type) {
          case "partial": setPartial(msg.text || ""); break
          case "final": setPartial(""); if (msg.text) E.handleFinal(msg.text); break
          case "order_update": E.handleWhisperOrder(msg.items); break
          case "ai_prompt": if (msg.vvm1) E.handleAi(msg.vvm1); break
          case "brain_upsell": E.handleBrain(msg); break
          case "voice_match": E.handleVoice(msg); break
          case "meaning": E.handleMeaning(msg); break
          case "receipt_saved": E.log(msg.error ? `Receipt not saved to the brain's store: ${msg.error}` : `Receipt saved to the brain's store${msg.voice_id ? ` (voice ${msg.voice_id}, visit ${msg.visits})` : ""}`); break
          case "voice_forgotten": E.log(msg.error ? `Forget voices failed: ${msg.error}` : `Voice prints forgotten: ${msg.voices} voice(s), ${msg.receipts} receipt(s)`); break
          case "state_transition":
            if (msg.transition === "NAME_CAPTURED" && msg.data?.name) setCustomerName(msg.data.name)
            if (msg.vvm1) E.handleAi(msg.vvm1)
            break
          default:
        }
      },
    })
    sttRef.current = client
    client.start()
    return () => { client.stop(); if (sttRef.current === client) sttRef.current = null }
  }, [enabled, auth, E])

  // Counter presence on the POS camera, when switched on.
  useEffect(() => {
    if (!enabled || !presenceOn) return undefined
    const pres = new CounterPresence({
      onStatus: (patch) => setStatus((s) => ({ ...s, ...patch })),
      onChange: (isHere) => {
        setPresent(isHere)
        if (isHere) {
          E.log("Counter presence: customer arrived")
          E.beginCustomer("counter presence")
        } else if ((posRef.current?.cart || []).length === 0) {
          E.log("Counter presence: customer left")
          E.endCustomer("customer left the counter", sttRef.current)
        } else {
          E.log("Counter presence: customer stepped away — order kept open")
        }
      },
    })
    presRef.current = pres
    pres.start().then((ok) => setCamStream(ok ? pres.getStream() : null))
    return () => { pres.stop(); setCamStream(null); setPresent(false); presRef.current = null }
  }, [enabled, presenceOn, E])

  const actions = {
    signIn: async (u, p) => { const r = await signInAssist(u, p); if (r.ok) setAuth(r.auth); return r },
    signOut: () => { clearAssistAuth(); setAuth(null) },
    setPresenceOn,
    startCustomer: () => E.beginCustomer("started by cashier"),
    endCustomer: () => E.endCustomer("ended by cashier", sttRef.current),
    accept: (via = "tapped Add") => E.acceptCard(via),
    decline: (via = "tapped No thanks") => E.declineCard(via),
    say: (text) => { if (String(text || "").trim()) E.handleFinal(String(text).trim(), { typed: true }) },
    addPair: () => E.addPair(),
    clearOutToday: () => E.clearOutToday(),
    forgetVoices: () => sttRef.current?.forgetVoices(),
  }
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  // Full-bar link: publish a snapshot on every change (coalesced to ~5 per second), and
  // run the commands it sends back over the same-browser channel.
  const pubRef = useRef(null)
  useEffect(() => {
    if (!enabled) return undefined
    const pub = startAssistPublisher((cmd) => {
      const a = actionsRef.current
      switch (cmd.type) {
        case "start": a.startCustomer(); break
        case "end": a.endCustomer(); break
        case "accept": a.accept("full bar: Add"); break
        case "decline": a.decline("full bar: No thanks"); break
        case "say": a.say(cmd.text); break
        case "camera": a.setPresenceOn(!!cmd.on); break
        case "pair": a.addPair(); break
        case "clear_out": a.clearOutToday(); break
        case "forget_voices": a.forgetVoices(); break
        default:
      }
    })
    pubRef.current = pub
    return () => { pub.close(); pubRef.current = null }
  }, [enabled])

  const snapshot = enabled ? {
    demoId: getDemoId(), brand: BRAND.name, restaurant: RESTAURANT, signedIn: !!auth?.ticket, operator: auth?.name || "",
    status, level, phase, trigger, partial, lines, heard, offers, behaviours, customerName, events, aiNote,
    presenceOn, present, backend, hot, voice, brain: brain && {
      item: brain.item, framing: brain.framing, tag: brain.tag, step: brain.step, kind: brain.kind, framer: brain.framer,
      latency_ms: brain.latency_ms, round_trip_ms: brain.round_trip_ms, error: brain.error || "", trace: brain.trace || null,
    },
    card: card && {
      kind: card.kind, title: card.title, price: card.price, size: card.size, fromSize: card.fromSize || "",
      fromPrice: card.kind === "upsize" ? (card.entry.sizes.find(([l]) => l === card.fromSize)?.[1] || 0) : 0,
      reason: card.reason, source: card.source, state: card.state, via: card.via || "", tag: card.tag || "",
      pair: card.pair ? { title: card.pair.entry.name, price: card.pair.price, added: !!card.pairAdded } : null,
    },
    ticket: pos.cart.map((e) => ({ name: e.item.name, size: e.size, count: e.count, price: e.price, via: e.via || {} })),
  } : null
  const snapRef = useRef(null)
  snapRef.current = snapshot
  const timerRef = useRef(null)
  useEffect(() => {
    if (!enabled || timerRef.current) return
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (snapRef.current) pubRef.current?.publish(snapRef.current)
    }, 200)
  })
  useEffect(() => () => clearTimeout(timerRef.current), [])

  return {
    enabled, auth, status, level, phase, trigger, partial, lines, heard, card, offers, behaviours,
    customerName, events, aiNote, presenceOn, present, camStream, backend, hot, voice, brain,
    ...actions,
  }
}

/** One line per whisper / bridge message for the full bar's backend view. */
function summarize(msg) {
  switch (msg.type) {
    case "final": return `“${msg.text || ""}”${msg.confidence != null ? ` (confidence ${Number(msg.confidence).toFixed(2)})` : ""}`
    case "order_update": return (msg.items || []).map((i) => `${i.quantity || 1}× ${i.name}`).join(", ") + (msg.total != null ? ` · $${Number(msg.total).toFixed(2)}` : "")
    case "ai_prompt": {
      const t = msg.vvm1?.topCandidate
      return t ? `upsell ${t.item}${t.price ? ` $${t.price}` : ""} · ${msg.intent || ""} · ${msg.source || msg.vvm1?.upsell_source || ""}${msg.latency_ms ? ` · ${msg.latency_ms} ms` : ""}` : "(no upsell)"
    }
    case "state_transition": return `${msg.transition}${msg.data?.name ? ` (${msg.data.name})` : ""} · ${msg.source || ""}`
    case "bridge_status": return `${msg.state}${msg.error ? ` · ${msg.error}` : ""}${msg.sessionId ? ` · session ${String(msg.sessionId).slice(0, 8)}` : ""}${msg.code ? ` · code ${msg.code}` : ""}`
    case "customer_profile": return msg.returning ? `returning: ${msg.customerName || ""}` : "new customer"
    case "voice_match": return msg.error ? `voice print error: ${msg.error}` : `${msg.matched ? "returning" : "new"} voice ${msg.voice_id} · score ${msg.score ?? "—"}${msg.tier ? ` · tier ${msg.tier}` : ""} · ${msg.seconds} s · ${msg.round_trip_ms} ms`
    case "brain_upsell": return msg.error ? `brain error: ${msg.error}` : `${msg.item || "(no pick)"} · ${msg.step || ""} · ${msg.framer || ""} · ${msg.latency_ms} ms brain / ${msg.round_trip_ms} ms round trip`
    case "receipt_saved": return msg.error ? `receipt error: ${msg.error}` : `receipt saved · voice ${msg.voice_id || "—"} · visit ${msg.visits}`
    default: return JSON.stringify(msg).slice(0, 160)
  }
}
