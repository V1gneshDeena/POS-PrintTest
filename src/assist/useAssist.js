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
//                         in a store), the End button, the cashier's Clear (the order
//                         starts over, so this visit's offers stop blocking the next
//                         one's), or presence leaving while the ticket is empty.
//                         Presence leaving with items on the ticket keeps the order
//                         open. Whisper gets a fresh visit each time.
//
// Where it shows: the POS keeps two small floating pieces on screen (AssistOverlay.jsx:
// the upsell square and the transcript). The whole state is also published as a
// snapshot (assistSync.js) for the FULL BAR page, which shows everything else and can
// send commands back (start / end customer, Add / No thanks, the pairing's Add, a typed line,
// camera, clear out-of-stock, forget voices).
//
// Outputs while a customer is active
//   • STATED ORDER → TICKET: every item the customer orders (POS-side parser on each line,
//     plus whisper's order_update) is rung up, raising the ticket to the heard quantity and
//     never above it. Only an intentional order counts (orderParser.js: "can I get", "a
//     cheeseburger please", a bare item list, an answer to "what can I get you"); asking
//     whether an item is there, what it costs, or praising it rings nothing up, and whisper's
//     order adds a new item only within 10 s of such a line. An item that comes in sizes
//     waits in the heard order until a size is said ("a regular cheeseburger", or "Regular."
//     after it) or the cashier taps it with its size; it is never rung up at a guessed size.
//     Items the cashier already rang count; an item the cashier removes is not re-added
//     until the customer names it again; "no fries" removes fries that speech added.
//   • ASK FOR THE SIZE: while an item waits for its size, the upsell square asks the cashier
//     to ask for it ("Cheeseburger: Little or Regular?") with a button per size; a button, the
//     size said, or the cashier's tap puts it on the ticket, and a size-up follows when a
//     bigger size is left (David, 2026-10-08).
//   • WHAT A CARD IS ABOUT: basket completion, size-ups and the brain's ladder work from the
//     ticket (the Order section, the order as picked; items waiting for a size are not on it
//     yet), and what was said still steers the pick: hot words, alternatives, allergies and
//     specific needs (hot keys, the brain).
//   • ONE UPSELL CARD at a time (upsellEngine.js). It is ACCEPTED by the Add button, a
//     spoken yes (acceptance.js), or the item reaching the ticket some other way, and
//     accepted items are added to the ticket automatically. A spoken or tapped no
//     declines it; 25 s without an answer lets it lapse. Then the next card. An
//     unanswered card holds its place until a card from a strictly higher-priority source
//     is available (hot key > the upsell brain > basket completion / upsize > the AI's pick
//     > behaviour); an allergy answer replaces any card that is not itself one. The card
//     follows the ticket: one the cashier has not said yet gives way to the pick for the
//     ticket as it is now when an item is tapped or rung up (not in Until accepted or declined), and in
//     every setting a card comes down when the ticket already has what it offers (another
//     side tapped while "Fries" is up) or the item it upsizes or swaps is taken off.
//   • THE CONTEXT WINDOW (David, 2026-10-08): a card a hot word or a better pick replaced before it
//     was answered is remembered for the whole visit (the last MEMORY_MAX), shown under the new card as
//     "Earlier", and comes back once the new card is answered, unless something that outranks it
//     is up by then or it no longer fits the ticket. An allergy answer clears it (those cards were
//     picked before the allergy was known). "Until accepted or declined" never replaces a card, so
//     nothing is remembered there.
//   • TAKEN OFF STAYS OFF: an item the customer had taken off ("take off the fries") is not pitched
//     back that visit, nor, taken off outright, another item of its kind from the basket.
//   • LONG DEMO VISITS (David, 2026-10-08: "there will be times i will be explaining the features so
//     the transaction will be longer. it should."): nothing ends a visit but payment, End, Clear or
//     the customer walking away; the context window lasts the whole visit; a hot word's response
//     stays usable for 10 minutes behind a held card (never delaying one); and a line that explains the system ("if a
//     customer says…", "for example…", "as you can see…"; orderParser.js isExplaining) is shown in
//     the transcript and never read as the conversation. A brain answer to an earlier request is
//     used when the ticket has not changed since, so talking on does not hold the brain's card back.
//   • BEST IN THIS SECTION: when the cashier opens a menu section, the upsell square says which
//     item in it is best for this customer (upsellEngine.js bestInSection). A hint, not a card.
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
//   • WHEN THE CARD CHANGES (CARD_MODES, the operator's choice on this device): Dynamic (after 25 s
//     of silence or a new trigger), On new trigger (no silence timeout), or Until accepted or
//     declined (key "hold": not replaced or timed out until the customer accepts or declines it,
//     and until the cashier says it the upsell square asks "Please voice the upsell"). A card the customer's words rule out, or the
//     ticket has overtaken, comes down in every mode, and an allergy answer still takes the screen.
//   • QUANTITIES: an item said once is rung up once, however often speech-to-text repeats it ("can I
//     get a cheeseburger? cheeseburger"). More than one sticks only when a number is said ("two
//     burgers", "another fries"); whisper's own count is capped to that; whisper naming the same item
//     differently ("Bacon Cheeseburger" for the heard Cheeseburger) is not rung up as a second item;
//     and a cashier tap on an item speech rang up in the last 8 s confirms that unit, not a second.
//   • ORDER CHANGES (orderEdits.js): "take the fries off", "never mind the drink", "swap the fries
//     for a poutine", "can I get a bacon cheeseburger instead" change the ticket at once, whoever
//     rang the item up, and the new item keeps the old one's size. What the grammar misses, the
//     meaning layer reads as `change_order` ("I'm good on fries actually") and the same happens.
//   • THE MEANING LAYER (burger menu = tenant demopos): every finished line also goes,
//     through the speech bridge, to the demopos gateway on the GPU box (`meaning_request`),
//     which reads what the line MEANS (demopos_meaning.py: BGE embeddings against written
//     examples of each hot key, with rules for negation, offers, questions and fragments).
//     Its `meaning` answer (~0.1 s) fires the same hot keys the exact words would, labelled
//     "by meaning" with the clause it read, for lines the exact patterns missed ("it's like an
//     oven out there"). A complaint, dislike or order problem read this way also takes back
//     what speech rang up from that line, as the exact words would have kept it off. Its allergy
//     keys ("dairy gives me hives", "I'm celiac", "sesame makes my throat swell"; and Dairy-free,
//     as milk) add their allergen to the visit's, so no card holds it and the brain is told.
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
//   • HOW IT'S DECIDING (reasoning.js): every step above also writes a plain sentence for the
//     full bar, for investors: the hot word and what it means, the voice print trying to remember
//     the customer (remembered / new / added to memory), screen taps and behaviours, the ticket's
//     calories and ingredients, how previous orders weigh, why each card went up, each answer, and
//     when it pitches next (no set number: the conversation decides). Built from the engine's own
//     numbers as they happen: no model call, and no card waits for it. The last visit's stays on
//     screen after payment.
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
import { parseUtterance, isGreeting, sizeAnswer, isExplaining } from "./orderParser.js"
import { classifyReply, pitches } from "./acceptance.js"
import { pickUpsell, cardKey, allowedBy, bestInSection } from "./upsellEngine.js"
import { detectHotkeys, TIMING_RULES, HOTKEYS } from "./hotkeys.js"
import { INDEX, findEntry, defaultSize, sizeFromWord } from "./menuIndex.js"
import { startAssistPublisher } from "./assistSync.js"
import { setAssistReceipt } from "./assistReceipt.js"
import { healthNote, historyNote, memoryNote, openSlots, pickNote, pitchNote, savedNote } from "./reasoning.js"
import { detectOrderEdits } from "./orderEdits.js"
import { allergiesSaid, holdsAllergen, MEANING_ALLERGENS, DAIRY_SAID } from "./allergens.js"

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
// When the card on screen changes (David, 2026-10-08), chosen by the operator on the upsell square
// or the full bar and kept on this device. In every mode a card that what the customer said rules
// out comes down, and an allergy answer still takes the screen.
export const CARD_MODES = {
  dynamic: { label: "Dynamic", short: "Dynamic", says: "changes after 25 s of silence or when something new comes up" },
  trigger: { label: "On new trigger", short: "New trigger", says: "stays through silence and changes only when something new comes up (a hot word, an item, a better pick)" },
  hold: { label: "Until accepted or declined", short: "Until answered", says: "changes only when the customer accepts or declines it (or the ticket already has what it offers); until the cashier says it, the screen asks to voice it" },
}
const CARD_MODE_KEY = "vavoom-assist-card-mode"
function loadCardMode() {
  try { const m = localStorage.getItem(CARD_MODE_KEY); return CARD_MODES[m] ? m : "dynamic" } catch { return "dynamic" }
}
// Quantities (David, 2026-10-08: an order said once must not appear twice). Only a number said for
// an item makes more than one stick; whisper's own count is capped to it.
const NUMBER_SAID = /\b(two|three|four|five|six|seven|eight|nine|ten|couple|pair|\d+)\b/i
const TAP_CONFIRM_MS = 8000 // a cashier tap this soon after speech rang the item up confirms that unit
// Whisper's order list adds a new item only this soon after a line that ordered (orderParser.js
// `intent`): an item named in "do you have veggie sandwiches?" is not an order.
const WHISPER_INTENT_MS = 10000
// The line before counts as the question a reply answers only this soon before it.
const PREV_LINE_MS = 20000
// The context window: how many replaced cards a visit remembers (for the whole visit, however long:
// a demo with explanations runs for minutes).
const MEMORY_MAX = 3
// A brain answer to an earlier request is still used this long after it was asked, when the ticket has
// not changed since (a customer talking on sends newer requests; their answers come later).
const BRAIN_FRESH_MS = 4000
// "No thanks, and take off the fries": a refusal that opens a line which also changes the order. It
// declines the card only when the cashier has said it (David, 2026-10-08); the change is made too.
// Not "No fries" or "I'm good on the fries": there the no belongs to the change.
const REFUSAL_FIRST = /^\s*(?:no thanks|no thank you|nah|nope|no|i'?m good|i'?m fine)(?:\s*(?:thanks|thank you))?\s*(?:[,.!;]|\band\b|\bbut\b)/i
const SIZE_WORDS_RX = /\b(little|small|regular|medium|large|big|tall|grande|venti|trenta|\d+ ?oz)\b/g
const nameWords = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(SIZE_WORDS_RX, " ").split(" ").filter(Boolean)
// One name inside the other ("Cheeseburger" / "Bacon Cheeseburger", "Fries" / "Cajun Fries").
const sameItemNames = (a, b) => { const [s1, s2] = a.length <= b.length ? [a, b] : [b, a]; return s1.length > 0 && s1.every((w) => s2.includes(w)) }
const lowerFirst = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t)
// A meaning answer older than this is for a line long gone and is dropped.
const MEANING_STALE_MS = 10000
const BRAIN_DEBOUNCE_MS = 150
// After a ticket change, a brain card on screen waits this long for the brain's answer about the new
// ticket before the POS's own pick may take its place (no flicker brain → basket → brain).
const BRAIN_WAIT_MS = 2000
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
  allergens: new Set(), // what the customer said they are allergic to (allergens.js): no card holds any of it
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
    brainWaitUntil: 0,
    brainReqs: new Map(), // req_id → { sig: the ticket it was asked about, at }
    memory: [], // the context window: replaced cards, oldest first
    removed: new Map(), // entry id → "remove" | "replace": what the customer had taken off this visit
    section: "", // the menu section the cashier last opened (kept across visits: it is the screen's)
    sectionSig: "",
    behavioursNow: [],
    visit: 0,           // counts customers, so a meaning answer for an earlier one is dropped
    meaningSeq: 0,
    meaningReqs: new Map(), // req_id → { t, text, ids rung up from that line, visit, convo entry }
    // How it's deciding (reasoning.js): what it weighs now, what happened this visit, and the last visit's.
    reasonNow: { memory: "", health: "", history: "", plan: "" },
    timeline: [],
    lastReasoning: null,
    brainMeta: null,      // the brain's latest trace, read and framer, for the pick notes
    screenSeen: new Set(), // behaviours already explained this visit
    saidEffects: new Set(), // every hot-key effect this visit (the plan reads them after cards consume them)
    listening: false,
    cardMode: loadCardMode(),
  }
  st.hot = newHot(st.outToday)
  const now = () => Date.now()
  const log = (text) => set.events((prev) => [{ at: now(), text }, ...prev].slice(0, 40))
  const publishReasoning = () => set.reasoning?.({ now: { ...st.reasonNow }, timeline: st.timeline.slice(), last: st.lastReasoning })
  /** One step of how it's deciding, for the full bar's timeline. */
  function explain(kind, text) {
    if (!text) return
    st.timeline.push({ at: now(), kind, text })
    if (st.timeline.length > 80) st.timeline.shift()
    publishReasoning()
  }
  /** What it is weighing at this moment: memory, health, previous orders, the upsell plan. */
  function refreshReasoning() {
    const brainHealth = st.brainMeta?.trace?.health ?? null
    const next = {
      memory: memoryNote(st.voice, { listening: st.listening }),
      health: healthNote(cart(), { constraints: [...st.hot.constraints], brainHealth }) || "",
      history: historyNote(st.voice, st.brainMeta),
      plan: pitchNote({ cart: cart(), offers: st.offers, effects: st.saidEffects, constraints: [...st.hot.constraints],
        lastOpeningAt: Math.max(st.lastAddedAt || 0, st.hot.fired[0]?.at || 0), pausedUntil: st.hot.pausedUntil, t: now(), brainHealth })
        + ` Card setting: ${CARD_MODES[st.cardMode].label} (the card ${CARD_MODES[st.cardMode].says}).`,
    }
    if (Object.keys(next).some((k) => next[k] !== st.reasonNow[k])) { st.reasonNow = next; publishReasoning() }
  }
  const cart = () => posRef.current?.cart || []
  const countOf = (id, size) => cart().filter((e) => e.item.id === id && (!size || e.size === size)).reduce((s, e) => s + e.count, 0)
  const publishHeard = () => set.heard([...st.heard.values()].map((h) => ({
    id: h.entry.id, name: h.entry.name, size: h.size ? h.size[0] : "", qty: h.qty, added: h.added, locked: h.locked,
    sources: [...h.sources], needsSize: !!h.needsSize, sizes: h.entry.sizes.map(([l]) => l),
  })))
  const publishCard = () => set.card(st.card ? { ...st.card, memory: st.memory.map((m) => m.title) } : null)
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
    st.timeline = []
    st.reasonNow = { memory: "", health: "", history: "", plan: "" }
    st.brainMeta = null
    st.screenSeen = new Set()
    st.saidEffects = new Set()
    st.listening = false
    st.memory = []
    st.removed = new Map()
    st.sectionSig = ""
    st.justSized = null
    publishReasoning()
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
    explain("visit", `New customer at the counter (${trigger}).`)
    refreshReasoning()
    // Replay what was said just before the session opened (the first words count).
    const replay = st.standbyLines.filter((l) => now() - l.at < STANDBY_REPLAY_MS)
    st.standbyLines = []
    for (const l of replay) handleFinal(l.text, { replay: true })
  }

  function endCustomer(reason, stt) {
    if (st.phase !== "active") return
    const accepted = st.offers.filter((o) => o.outcome === "accepted").length
    log(`Session ended — ${reason} · ${st.offers.length} upsell(s) offered, ${accepted} accepted`)
    explain("visit", `Visit ended (${reason}): ${st.offers.length} upsell${st.offers.length === 1 ? "" : "s"} shown, ${accepted} accepted.`)
    st.lastReasoning = { endedAt: now(), now: { ...st.reasonNow }, timeline: st.timeline.slice() }
    st.phase = "standby"
    st.tracker.reset()
    resetCustomer()
    set.phase("standby")
    set.trigger("")
    stt?.newCustomer()
  }

  // ── Heard order → ticket ──────────────────────────────────────────────────
  /** The cashier picked the size on the upsell square's size prompt (its button for `label`). */
  function chooseSize(entryId, label) {
    const h = st.heard.get(entryId)
    const size = h && h.entry.sizes.find(([l]) => l === label)
    if (size) giveSize(h, size)
  }

  /** The size said for a heard item that was waiting for one: syncTicket rings it up now. */
  function giveSize(h, size) {
    if (!h || !h.needsSize || !size) return
    h.size = size
    st.justSized = { id: h.entry.id, at: now() } // its size-up comes next (upsellEngine.js ctx.justSized)
    log(`Size for ${h.entry.name}: ${size[0]}`)
    explain("order", `The size for ${h.entry.name}: ${size[0]}, so it goes on the ticket.`)
    syncTicket()
    publishHeard()
  }

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
      let qty = it.qty
      if (source === "whisper") {
        // Whisper's count sticks only up to a number the customer said.
        const said = h.saidQty || (NUMBER_SAID.test(st.convo.slice(-3).map((l) => l.text).join(" ")) ? qty : 1)
        qty = Math.min(qty, Math.max(1, said))
      }
      h.qty = it.more ? h.qty + qty : Math.max(h.qty, qty)
      if (source === "speech" && (it.explicit || it.more)) h.saidQty = Math.max(h.saidQty || 0, h.qty)
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
      if (toAdd <= 0) { h.needsSize = false; continue }
      // An item that comes in sizes waits for one (David, 2026-10-08: "Orders should not yet be
      // automatically added to cart when voiced until there's a size attached"): the size said
      // later, or the cashier's tap with its size, puts it on. It is never rung up at a guess.
      if (!h.size && h.entry.sizes.length > 1) {
        if (!h.needsSize) {
          h.needsSize = true
          log(`Heard ${h.entry.name} — waiting for its size (${h.entry.sizes.map(([l]) => l).join(" / ")})`)
          explain("order", `Heard ${h.entry.name}, but no size yet: it waits for the size (${h.entry.sizes.map(([l]) => l).join(" or ")}) before going on the ticket.`)
        }
        continue
      }
      h.needsSize = false
      const [size, price] = h.size || defaultSize(h.entry)
      // Book the units BEFORE adding: addToCart emits an activity event that re-enters
      // recompute(), and the re-entry must already see them as added.
      h.added += toAdd
      h.expect = have + toAdd
      h.cartAtAdd = c
      for (let n = 0; n < toAdd; n++) p.addToCart(h.entry.item, size, price, h.entry.category, "voice")
      log(`Added from what was said: ${toAdd}× ${size !== "each" ? `${size} ` : ""}${h.entry.name}`)
      explain("order", `Heard the order: rang up ${toAdd}× ${size !== "each" ? `${size} ` : ""}${h.entry.name} from what the customer said.`)
    }
    publishHeard()
  }

  // ── Upsell card ───────────────────────────────────────────────────────────
  /** Until accepted or declined: the card on screen stays until it is answered (resolveCard). */
  const cardHeld = () => st.cardMode === "hold"
  /** A card the customer's words have ruled out since it went up (a dietary need, out of stock). */
  const cardStillValid = (c) => !c.entry || c.kind === "notice" || (allowedBy(st.hot.constraints, c.entry) && (!st.hot.blocked.has(c.entry.id) || c.kind === "upsize")
    && (c.alsoEntry || !holdsAllergen(c.entry.name, st.hot.allergens)))

  /** The operator's choice of when the card changes (CARD_MODES), kept on this device. */
  function setCardMode(mode) {
    if (!CARD_MODES[mode] || mode === st.cardMode) return
    st.cardMode = mode
    try { localStorage.setItem(CARD_MODE_KEY, mode) } catch { /* private mode: this session only */ }
    set.cardMode?.(mode)
    log(`Upsell card setting: ${CARD_MODES[mode].label}`)
    explain("visit", `Card setting is now “${CARD_MODES[mode].label}”: the card ${CARD_MODES[mode].says}.`)
    refreshReasoning()
    recompute()
  }

  // The item whose size was just given, for 30 s: its size-up is pitched first.
  const justSizedId = () => (st.justSized && now() - st.justSized.at < 30000 ? st.justSized.id : null)
  // The ticket as a card saw it: which items, sizes and counts (a card follows changes to it).
  const ticketSig = (c) => c.map((l) => `${l.item.id}:${l.size}:${l.count}`).join("|")
  // How many items of a role (side, drink, treat, main) are on the ticket.
  const roleCount = (role) => cart().reduce((n, l) => n + (BY_ID.get(l.item.id)?.role === role ? l.count : 0), 0)
  const MEAL_ROLES = new Set(["main", "side", "drink", "treat"])
  /**
   * Whether the ticket has overtaken the card, in any card setting: "filled" when an add card's
   * place in the meal now holds another item (Cajun Fries tapped while "Fries" is up), "gone" when
   * the item an upsize or swap card is about is off the ticket. Null otherwise. A hot-key card answers
   * what was said or tapped (the substitute for an item that is out sits beside that item), so only
   * its own item leaving the ticket overtakes it.
   */
  /** The context window: keep a card that is being replaced before it was answered. */
  function remember(c, by) {
    if (!c?.entry) return
    st.memory = [...st.memory.filter((m) => m.key !== c.key), { ...c, state: "pending", pitched: false, back: false, rememberedAt: now() }].slice(-MEMORY_MAX)
    explain("pick", `Remembered “${c.title}”: it comes back once “${by}” is answered.`)
  }

  /** The newest remembered card that still fits: not answered since, still allowed, not overtaken. */
  function recall() {
    st.memory = st.memory.filter((m) => cardStillValid(m) && !cardOvertaken(m)
      && !st.offers.some((o) => o.key === m.key && o.outcome)
      && (m.kind !== "add" || m.again || countOf(m.entry.id) === 0)
      && (m.kind !== "upsize" || countOf(m.entry.id, m.fromSize) > 0))
    return st.memory[st.memory.length - 1] || null
  }

  function cardOvertaken(c) {
    if (!c.entry) return null
    if (c.source === "hotkey") return c.kind !== "add" && countOf((c.fromEntry || c.entry).id) === 0 ? "gone" : null
    if (c.kind === "add" && !c.again) {
      const role = BY_ID.get(c.entry.id)?.role
      if (MEAL_ROLES.has(role) && c.baseRole != null && roleCount(role) > c.baseRole) return "filled"
      return null
    }
    if ((c.kind === "upsize" || c.kind === "notice") && countOf(c.entry.id) === 0) return "gone"
    if (c.kind === "swap" && c.fromEntry && countOf(c.fromEntry.id) === 0 && countOf(c.entry.id) === 0) return "gone"
    return null
  }

  function cardSatisfied(c) {
    if (c.kind === "notice") return false // nothing to ring up: it is answered by the cashier's Got it
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
    if (o) { o.outcome = outcome; o.via = via; o.pitched = !!c.pitched; o.answeredAt = now() }
    log(`Upsell ${outcome}: ${c.title}${via ? ` (${via})` : ""}`)
    explain("outcome", `Customer ${{ accepted: "said yes to", declined: "turned down", lapsed: "let pass" }[outcome] || outcome} “${c.title}”${via ? ` (${via})` : ""}.`)
    publishCard(); publishOffers()
    clearTimeout(st.resultTimer)
    st.resultTimer = setTimeout(() => recompute(), CARD_RESULT_MS + 50)
  }

  function acceptCard(via) {
    const c = st.card
    if (!c || c.state !== "pending") return
    if (c.kind === "notice") { resolveCard("noted", via); return } // "no substitute": nothing to add
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
      // An allergy swap that needs the lettuce wrap too ("a Hamburger in a lettuce wrap").
      if (c.alsoEntry && !countOf(c.alsoEntry.id)) {
        const [size, price] = defaultSize(c.alsoEntry)
        p.addToCart(c.alsoEntry.item, size, price, c.alsoEntry.category, "upsell")
      }
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

  // A notice ("no substitute") is noted, not declined: it never counts toward two no's in a row.
  const declineCard = (via) => resolveCard(st.card?.kind === "notice" ? "noted" : "declined", via)

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
    if (st.phase === "active") { refreshReasoning(); refreshSection() }
  }

  /** Best in this section: the hint for the menu section the cashier has open (upsellEngine.js). */
  function refreshSection() {
    if (!st.section) return
    const best = bestInSection(st.section, { cart: cart(), hot: st.hot, voice: st.voice })
    const next = best ? { category: st.section, name: best.title, price: best.price, why: best.why } : null
    const sig = JSON.stringify(next)
    if (sig === st.sectionSig) return
    const opened = !st.sectionSig || JSON.parse(st.sectionSig)?.category !== st.section
    st.sectionSig = sig
    set.section?.(next)
    if (best && opened) explain("screen", `Opened ${st.section}: the best one for this customer is the ${best.title} (${best.why}).`)
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
    if (st.phase === "active") {
      for (const b of behaviours) {
        const k = `${b.key}|${b.category || ""}`
        if (st.screenSeen.has(k)) continue
        st.screenSeen.add(k)
        explain("screen", `Screen: ${b.label}. ${b.meaning}${b.action ? `. So: ${lowerFirst(b.action)}` : ""}.`)
      }
    }
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
    let pending = cur && cur.state === "pending"
    // Hold the card (sticky) until it is answered, except that a card from a strictly
    // higher-priority source takes its place (SOURCE_RANK: hot key > basket / upsize >
    // AI > behaviour). Strictly higher only, so two cards can never swap back and forth.
    // One exception follows the ticket: a card picked for an older ticket (an item tapped or rung
    // up since) and not yet said by the cashier gives way to the pick for the ticket as it is now,
    // whatever its source, in the Dynamic and On new trigger settings (David, 2026-10-08: "it's
    // also not suggesting based on clicked order"). A brain card first waits up to BRAIN_WAIT_MS
    // for the brain's own answer about the new ticket. A hot-key card answers what was said or tapped
    // (out of stock, a complaint, an allergy), not the basket, so it does not give way to a ticket change.
    // This also covers timing: the order, whisper's parsed order and its AI pick can all
    // land before the ticket redraws, so the first pick may be made on an empty ticket.
    const sig = ticketSig(c)
    if (pending) {
      if (cardSatisfied(cur)) { resolveCard("accepted", "rung up"); return }
      if (st.cardMode === "dynamic" && t - cur.shownAt > CARD_TIMEOUT_MS) { resolveCard("lapsed", "no answer"); return }
      const overtaken = cardOvertaken(cur)
      // Said, and the customer took another of the same kind ("Fries?" "Cajun fries instead"): taken.
      if (overtaken === "filled" && cur.pitched) { resolveCard("accepted", `rung up another ${BY_ID.get(cur.entry.id)?.role || "item"}`); return }
      if (!cardStillValid(cur) || overtaken) {
        // What the customer said rules it out now (a dietary need, out of stock), or the ticket has
        // overtaken it: down in every mode, out of the offer log (never answered), and a new pick below.
        st.offers = st.offers.filter((x) => !(x.key === cur.key && !x.outcome))
        st.card = null
        publishCard(); publishOffers()
        explain("pick", `Took down “${cur.title}”: ${overtaken === "filled" ? `the ticket has a ${BY_ID.get(cur.entry.id)?.role} now`
          : overtaken === "gone" ? "its item is off the ticket" : "what the customer said rules it out now"}.`)
        pending = false
      }
    } else if (cur && t - cur.resolvedAt < CARD_RESULT_MS) {
      return
    }
    // Re-picking while a card is up: leave that card out of the offer log for the pick,
    // so the engine may choose it again (then nothing changes).
    const offers = pending ? st.offers.filter((x) => !(x.key === cur.key && !x.outcome)) : st.offers
    st.behavioursNow = behaviours
    let next = pickUpsell({ cart: c, lastAdded: st.lastAdded, behaviours: [...behaviours, ...spoken], ai: st.ai, brain: st.brain, offers, hot: { ...st.hot, now: t },
      lastOpeningAt: Math.max(st.lastAddedAt || 0, st.hot.fired[0]?.at || 0), justSized: justSizedId(), removed: st.removed })
    // The context window: with no card up, the card a hot word or a better pick replaced comes back,
    // unless the fresh pick outranks it (a hot key over a basket card, an allergy answer).
    if (!pending) {
      const back = recall()
      const outranked = next && ((SOURCE_RANK[next.source] || 0) > (SOURCE_RANK[back?.source] || 0) || /^Allergy/.test(next.tag || ""))
      if (back && (!next || next.key === back.key || !outranked)) next = { ...back, back: true } // a fresh AI or brain pick stays for later
    }
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
      const stale = cur.ticket !== sig && !cur.pitched && !cardHeld(cur) && cur.source !== "hotkey" && !(cur.source === "brain" && t < st.brainWaitUntil)
      if (cur.key === key) { cur.ticket = sig; return } // still the pick for the ticket as it is now
      if (!allergyFirst && !stale && (SOURCE_RANK[next.source] || 0) <= (SOURCE_RANK[cur.source] || 0)) return
      if (!allergyFirst && cardHeld(cur)) return // Until accepted or declined: not replaced before it is answered
      // The displaced card leaves the offer log: it was never answered, so it must not
      // block that item from being offered again later. One a hot word or a better pick
      // replaced is remembered (the context window); one the ticket moved past is not.
      st.offers = offers
      if (!allergyFirst && (SOURCE_RANK[next.source] || 0) > (SOURCE_RANK[cur.source] || 0)) remember(cur, next.title)
      log(`Upsell replaced (${next.source}): ${cur.title}`)
      explain("pick", `Took down “${cur.title}”: ${allergyFirst ? "an allergy answer comes first" : stale && (SOURCE_RANK[next.source] || 0) <= (SOURCE_RANK[cur.source] || 0) ? "the ticket changed before it was said" : `the ${next.source} pick ranks higher`}.`)
    }
    st.memory = st.memory.filter((m) => m.key !== key) // on screen now: no longer only remembered
    // An allergy answer: every remembered card was picked before the allergy was known (a Bacon
    // Cheeseburger's bun has sesame too), so none of them comes back.
    if (/^Allergy/.test(next.tag || "") && st.memory.length) {
      explain("pick", `Forgot ${st.memory.map((m) => `“${m.title}”`).join(", ")}: picked before the allergy was known.`)
      st.memory = []
    }
    st.card = { ...next, key, shownAt: t, state: "pending", ticket: sig, baseRole: MEAL_ROLES.has(BY_ID.get(next.entry.id)?.role) ? roleCount(BY_ID.get(next.entry.id).role) : null, baseCount: countOf(next.entry.id, next.kind === "upsize" || next.kind === "swap" ? next.size : undefined) }
    st.offers.push({ key, entryId: next.entry.id, kind: next.kind, again: !!next.again, source: next.source, title: next.title, outcome: null, atCheckout: !!next.atCheckout, at: t,
      tag: next.tag || "", why: next.why || next.reason || "", line: next.reason || "", pitched: false })
    if (next.source === "ai" && !next.back) st.ai = null // consumed
    if (next.source === "brain" && !next.back) st.brain = null // consumed; the next decision asks again
    // A hot-key response is offered once per time it is said (upsellEngine.js `origin`).
    if (next.origin) {
      if (next.origin.effect) st.hot.effects.delete(next.origin.effect)
      else next.origin.offered = true
    }
    log(`Upsell shown (${next.source}${next.back ? ", back from earlier" : ""}): ${next.title} — ${next.reason}`)
    explain("pick", next.back ? `Back to “${next.title}”, the upsell from before the change.` : pickNote(next, next.source === "brain" ? st.brainMeta : null))
    publishCard(); publishOffers()
  }

  // ── Transcript ──────────────────────────────────────────────────────────────
  function handleFinal(text, { replay = false, typed = false } = {}) {
    const t = now()
    // Someone explaining the system (orderParser.js isExplaining): shown, never read. No order, hot key,
    // greeting, meaning or brain request comes from it, it is not the customer's voice, and it is not
    // the line the next one answers.
    if (isExplaining(text)) {
      if (!replay) set.lines((prev) => [...prev, { text, kind: "explaining", at: t, typed }].slice(-12))
      set.voiceLine?.("operator")
      log(`Explaining — not read as the conversation: “${text.slice(0, 90)}”`)
      return
    }
    // The line before, as the question this one may answer ("What can I get you?" "Cheeseburger").
    const lineBefore = st.phase === "active" ? st.prevLine : st.standbyLines[st.standbyLines.length - 1]
    const parsed = parseUtterance(text, { prev: lineBefore && t - lineBefore.at < PREV_LINE_MS ? lineBefore.text : "" })
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
    if (parsed.intent) st.lastIntentAt = t
    // The customer changing the order (orderEdits.js): "I don't want the fries anymore" is not an
    // answer to the card on screen unless it names the card's own item.
    const before = new Set(cart().map((l) => l.item.id))
    const edit = detectOrderEdits(text, cart())
    const changing = edit.skip.size > 0 && !(cur?.entry && edit.skip.has(cur.entry.id))
    let declined = null
    if (!replay && !changing && cur && cur.state === "pending" && t - cur.shownAt >= REPLY_MIN_MS) {
      // Read in context (acceptance.js): the line before, if it came after the card, and
      // whether the cashier has pitched the card yet.
      const r = classifyReply(text, { prev: prev && prev.at >= cur.shownAt ? prev.text : "", card: cur })
      if (r === "yes") acceptCard("spoken yes")
      else if (r === "no") { declineCard("spoken no"); declined = cur }
      else if (pitches(text, cur)) { cur.pitched = true; publishCard() } // the upsell square stops asking to voice it
    } else if (!replay && changing && cur && cur.state === "pending" && cur.pitched && REFUSAL_FIRST.test(text)) {
      // "No thanks, and take off the fries" after the cashier said the card: both happen.
      declineCard("spoken no")
      declined = cur
    }
    const hits = detectHotkeys(text)
    // An allergy said ("I'm allergic to milk"): from now on no card holds it, whatever the GPU side does.
    const allergyNamed = allergiesSaid(text)
    if (hits.some((h) => h.key === "dairy_free") && DAIRY_SAID.test(text)) allergyNamed.add("milk")
    const newly = [...allergyNamed].filter((a) => !st.hot.allergens.has(a))
    if (newly.length) {
      for (const a of newly) st.hot.allergens.add(a)
      log(`Allergy heard: ${newly.join(", ")} — no card with it from now on`)
      explain("health", `Heard an allergy (${newly.join(", ").replace(/_/g, " ")}): no upsell that contains it from now on.`)
    }
    // "No thanks, that's it": the card just declined was the last chance, so no more cards
    // after it (upsellEngine.js stops once a checkout offer has been made).
    if (declined && hits.some((h) => h.key === "closing")) {
      const o = st.offers.find((x) => x.key === declined.key)
      if (o) o.atCheckout = true
    }
    // The order change is applied at once. Nothing it names is rung up again from this line, and
    // neither are items the line says are out, only asks about, doesn't like, or complains about
    // ("the shake was too sweet", "I was missing my fries").
    if (edit.edits.length) applyOrderEdits(edit.edits, text, t)
    const notOrdered = new Set([...hits.filter((h) => NOT_ORDER.has(h.effect)).flatMap((h) => h.items.map((e) => e.id)), ...edit.skip])
    let rungUp = []
    // A size for an item heard without one: the item named with it ("make the cheeseburger a
    // regular") or the size alone ("Regular."), never from a question ("little or regular?").
    for (const i of parsed.items) if (i.size && !i.ordered && i.clauseKind !== "offer") giveSize(st.heard.get(i.entry.id), i.size)
    if (!parsed.items.length) {
      const word = sizeAnswer(text)
      const waiting = word && [...st.heard.values()].filter((h) => h.needsSize && sizeFromWord(h.entry, word)).sort((a, b) => b.at - a.at)[0]
      if (waiting) giveSize(waiting, sizeFromWord(waiting.entry, word))
    }
    if (parsed.kind === "order") {
      const items = parsed.items.filter((i) => i.ordered && !notOrdered.has(i.entry.id))
      if (items.length) mergeHeard(items, "speech")
      rungUp = items.filter((i) => !i.negated).map((i) => i.entry.id)
      // An item that is out today is not rung up (mergeHeard skips it); its closest
      // substitute is offered instead.
      const out = items.filter((i) => !i.negated && st.hot.blocked.has(i.entry.id)).map((i) => i.entry)
      if (out.length) {
        hits.push({ ...ORDERED_OUT, label: "Ordered an item that's out", items: out, phrase: text.slice(0, 90),
          action: "Not rung up (out today) — the closest substitute instead" })
      }
      // Not patient: the first order line within the window of the customer walking up (counter
      // presence). Not judged for a visit the cashier's greeting, a tap, Start or the order itself
      // opened: answering "what can I get you?" within 3 s is the normal pace, not a hurry (the
      // 2026-10-08 pressure test: it fired on almost every greeted visit).
      const rule = TIMING_RULES.impatient
      if (items.length && !st.firstOrderAt) {
        st.firstOrderAt = t
        if (rule && st.trigger === "counter presence" && t - st.sessionStart <= rule.window_ms) {
          hits.push({ key: rule.key, label: rule.label, effect: rule.effect, action: rule.action, items: [], asked: "",
            phrase: `ordered ${((t - st.sessionStart) / 1000).toFixed(1)} s after the session opened` })
        }
      }
    }
    if (hits.length) applyHotkeys(hits, t)
    // Whose line was it? The customer orders, answers the card or says a customer hot word; the
    // employee greets, offers or pitches. Lines that are neither stay unassigned.
    const customer = parsed.kind === "order" || parsed.asks || !!declined || cur?.state === "accepted"
      || hits.some((h) => CUSTOMER_KEYS.has(h.key)) || /^\s*(yes|yeah|no|nope|sure|okay|ok)\b/i.test(text)
    const operator = !customer && (isGreeting(text) || parsed.kind === "offer" || (cur && pitches(text, cur)) || /\?\s*$/.test(text))
    const role = customer ? "customer" : operator ? "operator" : ""
    const said = { at: t, text, role }
    st.convo.push(said)
    if (role) set.voiceLine?.(role)
    if (role === "customer" && !st.voice && !st.listening && set.voiceLine) {
      st.listening = true
      explain("voice", memoryNote(null, { listening: true }))
    }
    recompute()
    scheduleBrain()
    // The meaning layer reads the same line on the GPU box (handleMeaning applies its answer).
    if (set.requestMeaning) {
      st.meaningSeq += 1
      const edited = edit.edits.length > 0 || edit.skip.size > 0
      st.meaningReqs.set(st.meaningSeq, { t, text, ids: rungUp, visit: st.visit, said, before, edited })
      for (const [id, r] of st.meaningReqs) if (t - r.t > MEANING_STALE_MS) st.meaningReqs.delete(id)
      set.requestMeaning({ req_id: st.meaningSeq, text, prev: prev ? prev.text : "", exact: [...hits.map((h) => h.key), ...(edited ? ["change_order"] : [])] })
    }
  }

  // ── Order changes (orderEdits.js) ──────────────────────────────────────────
  /** Take items off the ticket, or swap them, as the customer said. `byMeaning` is the meaning
   *  layer's hit when it, not the grammar, read the line. */
  function applyOrderEdits(edits, text, t, byMeaning) {
    const p = posRef.current
    const said = []
    st.applying = true // the ticket changes below must not pick a card mid-line
    try {
      for (const ed of edits) {
        const x = ed.type === "replace" ? ed.from : ed.entry
        const lines = cart().filter((l) => l.item.id === x.id && (!ed.size || l.size === ed.size))
        const total = lines.reduce((n, l) => n + l.count, 0)
        if (!total) continue
        // What the customer had taken off is not pitched back this visit, nor (taken off outright)
        // another item of its kind from the basket (upsellEngine.js ctx.removed).
        if (!ed.qty) st.removed.set(x.id, ed.type)
        let n = 0
        let fromSize = null
        for (const line of lines) {
          const k = ed.qty ? Math.min(ed.qty - n, line.count) : line.count
          for (let i = 0; i < k; i++) p.decrementFromCart(line.key, "voice")
          n += k
          fromSize = fromSize || line.size
          if (ed.qty && n >= ed.qty) break
        }
        // Speech must not put it back: its heard entry is marked as taken off (a later line that
        // asks for it again re-opens it).
        const left = total - n
        const h = st.heard.get(x.id) || { entry: x, qty: 0, size: null, added: 0, expect: 0, locked: false, cancelled: false, at: t, sources: new Set() }
        h.qty = left
        h.added = Math.min(h.added, left)
        h.expect = left
        h.locked = true
        h.cancelled = left === 0
        st.heard.set(x.id, h)
        const what = `${ed.qty ? `${n}× ` : ""}${fromSize && fromSize !== "each" ? `${fromSize} ` : ""}${x.name}`
        if (ed.type === "replace") {
          const size = ed.toSize ? ed.to.sizes.find(([l]) => l === ed.toSize) : null
          mergeHeard([{ entry: ed.to, qty: n, size, negated: false, more: true }], "speech")
          said.push(`swapped the ${what} for ${n > 1 ? `${n}× ` : "a "}${size ? `${size[0]} ` : ""}${ed.to.name}`)
          log(`Order change: swapped ${what} for ${ed.to.name}`)
        } else {
          said.push(`took the ${what} off`)
          log(`Order change: took ${what} off the ticket`)
        }
      }
    } finally {
      st.applying = false
    }
    if (!said.length) return
    publishHeard()
    explain("order", byMeaning
      ? `Heard “${text}”: no change-order words, but it means the customer wants it off the order (similarity ${Number(byMeaning.score).toFixed(2)}), so it ${said.join(" and ")}.`
      : `Heard “${text}”: the customer is changing the order, so it ${said.join(" and ")}.`)
    // A line's own edits are re-picked with the rest of the line (handleFinal); the meaning
    // layer's answer arrives on its own and re-picks here.
    if (byMeaning) { recompute(); scheduleBrain() }
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
    const heardAllergy = []
    for (const m of msg.hits || []) {
      if (m.key === "change_order") {
        // The line means the customer wants something off the order, in words the grammar does not
        // know. Take off what it names that was already on the ticket; if it named only what this
        // line itself rang up, take that back off.
        if (req.edited) continue
        const named = parseUtterance(req.text).items.map((i) => i.entry)
        const was = named.filter((e) => req.before.has(e.id))
        const targets = was.length ? was : named.filter((e) => req.ids.includes(e.id))
        if (targets.length) applyOrderEdits(targets.map((e) => ({ type: "remove", entry: e, qty: null, size: null })), req.text, now(), m)
        continue
      }
      // An allergy said in other words ("dairy gives me hives", "soy makes me break out"): its allergen is
      // added to the visit's, so no card holds it and the brain is told. Dairy-free carries on as a hot key.
      const allergens = MEANING_ALLERGENS[m.key]
      if (allergens) {
        const fresh = allergens.filter((a) => !st.hot.allergens.has(a))
        for (const a of fresh) st.hot.allergens.add(a)
        if (fresh.length) heardAllergy.push(`${fresh.join(", ").replace(/_/g, " ")} (“${m.clause}”, ${Number(m.score).toFixed(2)})`)
        if (m.key !== "dairy_free") continue
      }
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
        action: h.action, meaning: h.meaning, phrase: m.clause, items, asked: "", via: "meaning", score: m.score, baseLabel: h.label })
    }
    if (heardAllergy.length) {
      log(`Allergy heard by meaning: ${heardAllergy.join("; ")} — no card with it from now on`)
      explain("health", `Heard an allergy in other words: ${heardAllergy.join("; ")}. No upsell that contains it from now on.`)
    }
    if (!fired.length && !heardAllergy.length) return
    // The line said something about the customer (a hot word, an allergy), so it was the customer's.
    if (!req.said.role && (heardAllergy.length || fired.some((h) => CUSTOMER_KEYS.has(h.key)))) {
      req.said.role = "customer"
      set.voiceLine?.("customer")
    }
    if (fired.length) applyHotkeys(fired, now())
    recompute()
    scheduleBrain()
  }

  // ── The upsell brain (demopos tenant) ──────────────────────────────────────
  /** Ask the brain for one decision, coalescing a line and the ticket changes it causes. */
  function scheduleBrain() {
    if (!set.requestBrain || st.phase !== "active") return
    clearTimeout(st.brainTimer)
    st.brainWaitUntil = now() + BRAIN_DEBOUNCE_MS + BRAIN_WAIT_MS
    st.brainTimer = setTimeout(() => {
      if (st.phase !== "active") return
      st.brainSeq += 1
      st.brainReqs.set(st.brainSeq, { sig: ticketSig(cart()), at: now() })
      for (const [id, r] of st.brainReqs) if (now() - r.at > BRAIN_FRESH_MS) st.brainReqs.delete(id)
      set.requestBrain({
        req_id: st.brainSeq,
        transcript: st.convo.length ? st.convo[st.convo.length - 1].text : "",
        context: {
          ticket: cart().map((l) => ({ name: l.item.name, size: l.size, qty: l.count, price: l.price, upsold: (l.via?.upsell || 0) >= l.count })),
          lines: st.convo.slice(-6).map((l) => l.text),
          constraints: [...st.hot.constraints],
          effects: [...st.hot.effects.keys()],
          behaviours: st.behavioursNow.map((b) => ({ key: b.key, category: b.category })),
          offers: st.offers.map((o) => ({ title: o.title, kind: o.kind, outcome: o.outcome })),
          out_today: [...st.outToday].map((id) => BY_ID.get(id)?.name).filter(Boolean),
          allergens: [...st.hot.allergens], // said exactly or by meaning: the brain's swaps and notices answer them
          just_sized: justSizedId() ? BY_ID.get(justSizedId())?.name || null : null,
          removed: [...st.removed].map(([id, how]) => ({ name: BY_ID.get(id)?.name, how })).filter((r) => r.name),
          hour: new Date(now()).getHours(),
        },
      })
    }, BRAIN_DEBOUNCE_MS)
  }

  /** The brain's answer (brain_upsell): the newest request's pick becomes a candidate card. */
  function handleBrain(msg) {
    if (!msg) return
    // The newest request's answer, or an earlier one's while the ticket is as it was asked about: the
    // customer talking on sends newer requests, and dropping every answer but the newest held the
    // brain's card back until they stopped (David, 2026-10-08: "why is the brain taking 6 seconds?").
    const asked = st.brainReqs.get(msg.req_id)
    if (msg.req_id !== st.brainSeq && !(asked && asked.sig === ticketSig(cart()) && now() - asked.at < BRAIN_FRESH_MS)) return
    st.brainWaitUntil = 0 // answered (or failed): a card picked for an older ticket need not wait any longer
    if (msg.error) { log(`Upsell brain unavailable: ${msg.error}`); return }
    set.brain?.({ ...msg, at: now() })
    st.brainMeta = { trace: msg.trace || null, read: msg.read || "", framer: msg.framer || "" }
    if (!msg.name) { st.brain = null; return }
    const entry = findEntry(msg.name)
    if (!entry) { log(`Upsell brain suggested "${msg.name}" — not on this POS menu, skipped`); return }
    const fromEntry = msg.from ? findEntry(msg.from) : null
    const fromLine = fromEntry && cart().find((l) => l.item.id === fromEntry.id)
    const kind = msg.kind === "upgrade" || msg.kind === "swap" ? "swap" : msg.kind === "upsize" ? "upsize" : msg.kind === "notice" ? "notice" : "add"
    st.brain = {
      entry, kind, size: msg.size, price: msg.price, fromSize: msg.from_size || fromLine?.size || "", fromEntry,
      alsoEntry: msg.also ? findEntry(msg.also) : null, // an allergy swap's lettuce wrap
      tag: msg.tag || "", framing: msg.framing || "", why: msg.reason || "", at: now(), title: kind === "notice" ? msg.item : undefined,
    }
    log(`Upsell brain (${msg.step || "?"}, ${msg.latency_ms ?? "?"} ms${msg.round_trip_ms != null ? `, ${msg.round_trip_ms} ms round trip` : ""}): ${msg.item} — ${msg.framing}`)
    recompute()
  }

  /** The voice print (voice_match): a returning voice brings its history; a new one is anonymous. */
  function handleVoice(msg) {
    if (!msg || msg.error) { if (msg?.error) log(`Voice print unavailable: ${msg.error}`); return }
    st.voice = msg
    st.listening = true
    explain("voice", memoryNote(msg, { listening: true }))
    refreshReasoning()
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
        st.saidEffects.add(h.effect)
        const plan = String(h.action || "").replace(/[.\s]+$/, "")
        explain(h.via === "meaning" ? "meaning" : "hotkey", h.via === "meaning"
          ? `Heard “${h.phrase}”: no exact hot word, but it means ${lowerFirst(h.meaning || h.baseLabel)} (similarity ${Number(h.score).toFixed(2)} to how customers say that), so it counts as “${h.baseLabel}”. ${plan}.`
          : `Heard “${h.phrase}”: hot word “${h.label}”${h.meaning ? `, which means ${lowerFirst(h.meaning)}` : ""}${named}. ${plan}.`)
      }
    } finally {
      st.applying = false
    }
    hot.fired = hot.fired.slice(0, 30)
    // Force the re-evaluation: an unanswered card leaves the screen (and the offer log,
    // so it may be picked again if it is still the best answer) and recompute re-picks.
    const cur = st.card
    if (cur && cur.state === "pending" && !cardHeld(cur)) {
      st.offers = st.offers.filter((x) => !(x.key === cur.key && !x.outcome))
      st.card = null
      remember(cur, `the hot word (${hits.map((h) => h.baseLabel || h.label).join(", ")})`)
      publishCard(); publishOffers()
    }
    publishHot()
  }

  function handleWhisperOrder(items) {
    if (st.phase !== "active") return
    const t = now()
    const mapped = []
    for (const it of items || []) {
      const entry = findEntry(it.name)
      if (!entry) continue
      // A new item only shortly after a line that ordered: whisper's list also picks up items the
      // customer only asked about ("do you have veggie sandwiches?").
      if (!st.heard.has(entry.id) && t - (st.lastIntentAt || -Infinity) > WHISPER_INTENT_MS) {
        log(`Whisper's “${it.name}” not rung up — nobody ordered it in the last ${WHISPER_INTENT_MS / 1000} s`)
        continue
      }
      // Whisper naming an item speech just rang up by another name is the same item, not a second one.
      if (!st.heard.has(entry.id)) {
        const w = nameWords(entry.name)
        const same = [...st.heard.values()].find((h) => h.sources.has("speech") && h.added > 0 && now() - h.at < 20000 && sameItemNames(w, nameWords(h.entry.name)))
        if (same) { log(`Whisper's “${it.name}” is the ${same.entry.name} already heard — not rung up twice`); continue }
      }
      mapped.push({ entry, qty: Number(it.quantity) || 1, size: null, negated: false, more: false })
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
    if (e.type === "category_view") { st.section = e.category; st.sectionSig = "" }
    if (e.type === "item_added" && e.source === "cashier" && st.phase === "active") {
      // The cashier tapped what speech just rang up: the tap confirms that unit, not a second one.
      const h = st.heard.get(e.item.id)
      if (h && h.added > 0 && now() - h.at < TAP_CONFIRM_MS && countOf(e.item.id) + 1 > (h.saidQty || 1)) {
        h.added -= 1
        h.expect = Math.max(0, (h.expect || 0) - 1)
        const spoken = cart().find((l) => l.item.id === e.item.id && (l.via?.voice || 0) > 0)
        if (spoken) queueMicrotask(() => posRef.current?.decrementFromCart(spoken.key, "voice"))
        log(`Cashier tapped the ${e.item.name} speech had just rung up — kept one, not two`)
        explain("order", `Cashier tapped the ${e.item.name} that speech had just rung up from what the customer said, so it counts once.`)
      }
      const slots = openSlots([...cart(), { item: e.item, category: e.category, size: e.size, count: 1 }])
      explain("screen", `Cashier tapped ${e.item.name}${e.size && e.size !== "each" ? ` (${e.size})` : ""}.${slots === null ? "" : slots.length ? ` Still open in the meal: ${slots.join(", ")}.` : " The meal is complete."}`)
    }
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

  /** Payment: the visit going into memory (called before endCustomer). */
  function noteSaving(record) { explain("memory", savedNote(record)) }
  /** The brain's store confirmed the visit (arrives after the session ended): onto the last visit's reasoning. */
  function noteSaved(msg) {
    if (!st.lastReasoning) return
    st.lastReasoning.timeline.push({ at: now(), kind: "memory", text: msg.error
      ? `The visit was not saved to memory: ${msg.error}.`
      : `Saved to memory${msg.voice_id ? `: visit ${msg.visits} for voice ${msg.voice_id}` : " (not linked to a voice)"}.` })
    publishReasoning()
  }

  return { st, beginCustomer, endCustomer, handleFinal, handleWhisperOrder, handleAi, handleBrain, handleVoice, handleMeaning, receiptRecord,
    acceptCard, declineCard, addPair, clearOutToday, recompute, onActivityEvent, log, noteSaving, noteSaved, setCardMode, chooseSize }
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
  // How it's deciding (reasoning.js): { now, timeline, last } for the full bar.
  const [reasoning, setReasoning] = useState(null)
  const [cardMode, setCardModeState] = useState(() => loadCardMode())
  // Best in this section: the hint for the menu section the cashier has open.
  const [section, setSection] = useState(null)

  const posRef = useRef(pos)
  posRef.current = pos
  const engineRef = useRef(null)
  const sttRef = useRef(null)
  if (!engineRef.current) {
    engineRef.current = createEngine({
      events: setEvents, heard: setHeard, card: setCard, offers: setOffers, phase: setPhase,
      trigger: setTrigger, lines: setLines, behaviours: setBehaviours, aiNote: setAiNote, customerName: setCustomerName,
      hot: setHot, voice: setVoice, brain: setBrain, reasoning: setReasoning, cardMode: setCardModeState, section: setSection,
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
        E.noteSaving(record)
        E.endCustomer("paid", sttRef.current)
      }
      // Clear starts the order over: a new visit, so this one's offers and declines stop blocking it.
      if (e.type === "clear") E.endCustomer("ticket cleared", sttRef.current)
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
          case "receipt_saved":
            E.log(msg.error ? `Receipt not saved to the brain's store: ${msg.error}` : `Receipt saved to the brain's store${msg.voice_id ? ` (voice ${msg.voice_id}, visit ${msg.visits})` : ""}`)
            E.noteSaved(msg)
            break
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
    setCardMode: (mode) => E.setCardMode(mode),
    chooseSize: (entryId, label) => E.chooseSize(entryId, label),
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
        case "card_mode": a.setCardMode(cmd.mode); break
        default:
      }
    })
    pubRef.current = pub
    return () => { pub.close(); pubRef.current = null }
  }, [enabled])

  const snapshot = enabled ? {
    demoId: getDemoId(), brand: BRAND.name, restaurant: RESTAURANT, signedIn: !!auth?.ticket, operator: auth?.name || "",
    status, level, phase, trigger, partial, lines, heard, offers, behaviours, customerName, events, aiNote,
    presenceOn, present, backend, hot, voice, reasoning, cardMode, brain: brain && {
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
    customerName, events, aiNote, presenceOn, present, camStream, backend, hot, voice, brain, reasoning, cardMode, section,
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
