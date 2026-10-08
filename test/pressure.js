// The pressure test: 100 generated counter transactions across the board (David, 2026-10-08: "Pressure
// test the system after your changes and deployment, create 100 different transactions testing it
// across the board and flag and fix inconsistencies, bugs and issues").
//
//   npm run test:transcripts -- --set pressure                 the POS engine on its own
//   npm run test:transcripts -- --set pressure --live URL      with the real brain and meaning layer
//
// Twenty kinds of visit, five of each, varied by a seeded random generator (the same 100 every run):
// spoken orders with and without sizes, taps, questions and praise that are not orders, hot words,
// allergies (with and without a substitute), items taken off and swapped, the three card settings,
// menu sections, a returning voice, Clear, "no thanks, and…", two-of-an-item, ordering for others,
// closing, out of stock, two customers in a row, whisper's own order list, the cashier saying the card,
// and two no's in a row. Instead of one expected outcome each, every transaction is held to the same
// rules (RULES below), each one a promise the system makes whatever the conversation; a broken rule is a
// bug to fix. `meta` is what the generator knows the customer meant (ordered, tapped, mentioned only,
// taken off, allergic to, which card setting), which the rules are judged against.
import KB from "../src/data/menu-kb.json"

// ── the menu, as a customer says it ──
const SIZED = {
  Hamburger: ["Little", "Regular"], Cheeseburger: ["Little", "Regular"], "Bacon Burger": ["Little", "Regular"],
  "Bacon Cheeseburger": ["Little", "Regular"], Fries: ["Little", "Regular", "Large"], "Cajun Fries": ["Little", "Regular", "Large"],
  "Fountain Drink": ["Regular", "Large"],
}
const SAY = {
  Hamburger: ["hamburger", "burger"], Cheeseburger: ["cheeseburger"], "Bacon Burger": ["bacon burger"],
  "Bacon Cheeseburger": ["bacon cheeseburger"], Fries: ["fries"], "Cajun Fries": ["cajun fries"],
  "Fountain Drink": ["drink", "coke", "pop"], "Bottled Water": ["water", "bottled water"],
  "Hand-Spun Milkshake": ["milkshake", "shake"], "Hot Dog": ["hot dog"], "Cheese Dog": ["cheese dog"],
  Poutine: ["poutine"], "Grilled Cheese": ["grilled cheese"], "Veggie Sandwich": ["veggie sandwich"], BLT: ["BLT"],
  "Patty Melt": ["patty melt"],
}
const MAINS = ["Hamburger", "Cheeseburger", "Bacon Burger", "Bacon Cheeseburger", "Hot Dog", "Cheese Dog", "Grilled Cheese", "Veggie Sandwich", "BLT", "Patty Melt"]
const SIDES = ["Fries", "Cajun Fries", "Poutine"]
const DRINKS = ["Fountain Drink", "Bottled Water"]
const CATEGORY = { Burgers: MAINS.slice(0, 4), Drinks: DRINKS, Shakes: ["Hand-Spun Milkshake"], Fries: SIDES, Sandwiches: ["Grilled Cheese", "Veggie Sandwich", "BLT", "Patty Melt"] }

// ── a seeded random source (mulberry32), so the 100 are the same every run ──
let seed = 20261008
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const pick = (a) => a[Math.floor(rnd() * a.length)]
const chance = (p) => rnd() < p

const GREETINGS = ["Hi, welcome in! What can I get you?", "Hey there, what can I get started for you?", "Welcome! What would you like today?", "Hi, what can I get for you today?"]
const CUES = ["Can I get {x}", "I'll have {x}", "I'd like {x} please", "{X} please", "Let me get {x}", "Could I get {x}", "I want {x}", "Can I have {x}", "I'll take {x}", "Lemme get {x}"]
const NUMS = { 1: "a", 2: "two", 3: "three" }

/** One spoken item: "a regular cheeseburger", "two cokes", "a large fries". */
function phrase(name, { size = null, qty = 1 } = {}) {
  const word = pick(SAY[name])
  const plural = qty > 1 && !/s$/.test(word) ? `${word}s` : word
  return `${NUMS[qty] || qty} ${size ? `${size.toLowerCase()} ` : ""}${qty > 1 ? plural : word}`
}
const list = (parts) => (parts.length < 2 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`)

/** A visit under construction: its steps and what the customer meant (meta). */
function visit(id, title, opts = {}) {
  const v = {
    id, title, setup: { cardMode: opts.mode || pick(["dynamic", "dynamic", "trigger", "hold"]), ...(opts.setup || {}) }, steps: [], t: 0,
    meta: { ordered: new Map(), tapped: new Map(), unsized: new Set(), mentioned: new Set(), removed: new Map(), allergens: new Map(), out: new Set(opts.setup?.outToday || []), cleared: [] },
  }
  v.meta.mode = v.setup.cardMode
  v.at = (dt = 2) => (v.t += dt)
  v.say = (who, say, dt) => { v.steps.push({ at: v.at(dt), who, say }); return v }
  v.order = (items, { form = null, dt } = {}) => {
    // items: [{ name, size?, qty? }]; a size is given only when the item has sizes and `size` is set.
    const parts = items.map((it) => phrase(it.name, it))
    const x = list(parts)
    const line = form === "bare" ? x.charAt(0).toUpperCase() + x.slice(1) : pick(CUES).replace("{x}", x).replace("{X}", x.charAt(0).toUpperCase() + x.slice(1))
    v.say("C", line, dt)
    for (const it of items) {
      v.meta.ordered.set(it.name, (v.meta.ordered.get(it.name) || 0) + (it.qty || 1))
      if (SIZED[it.name] && !it.size) v.meta.unsized.add(it.name)
    }
    return v
  }
  v.tap = (name, size, dt) => {
    v.steps.push({ at: v.at(dt), tap: name, ...(size ? { size } : {}) })
    v.meta.tapped.set(name, (v.meta.tapped.get(name) || 0) + 1)
    v.meta.unsized.delete(name)
    return v
  }
  v.sizeSaid = (name, size, dt) => { v.say("C", pick([`${size}`, `${size} please`, `Make it a ${size.toLowerCase()}`, `The ${size.toLowerCase()} one`]), dt); v.meta.unsized.delete(name); return v }
  v.choose = (name, size, dt) => { v.steps.push({ at: v.at(dt), choose: [name, size] }); v.meta.unsized.delete(name); return v }
  v.mention = (name, dt) => {
    const w = pick(SAY[name])
    v.say("C", pick([`Do you have ${w}?`, `How much is the ${w}?`, `Is the ${w} any good?`, `The ${w} here is amazing`, `I might get a ${w} later`, `Could I come in and get a ${w} tomorrow?`]), dt)
    v.meta.mentioned.add(name)
    return v
  }
  v.remove = (name, dt) => {
    const w = pick(SAY[name])
    v.say("C", pick([`Actually, take off the ${w}`, `Never mind the ${w}`, `I don't want the ${w} anymore`, `Can you take the ${w} off?`, `Scratch the ${w}`]), dt)
    v.meta.removed.set(name, v.t)
    return v
  }
  v.allergy = (allergen, phraseText, dt) => { v.say("C", phraseText, dt); v.meta.allergens.set(allergen, v.t); return v }
  v.push = (step, dt) => { v.steps.push({ at: v.at(dt), ...step }); return v }
  v.pay = (dt = 6) => { v.steps.push({ at: v.at(dt), pay: true }); return v }
  v.done = () => {
    const meta = v.meta
    return { id: v.id, title: v.title, setup: v.setup, steps: v.steps, meta, checks: RULES.map(([what, fn]) => [what, (r) => fn(r, meta)]) }
  }
  return v
}

// ── allergens, from the menu's own allergen guide (menu-kb.json), plus spice ──
const SPICY = /cajun|jalape|hot sauce/i
function allergensOf(name) {
  const it = KB.items[name] || KB.toppings?.[name] || KB.mixins?.[name]
  const a = new Set(it?.allergens || [])
  if (SPICY.test(name)) a.add("spice")
  return a
}

// ── the rules every transaction is held to ──
// A ticket line's item name: the count and the size come off ("2× Fries (Large)" → "Fries"); a bracket that is
// part of the name stays ("Lettuce Wrap (no bun)").
const names = (ticket) => ticket.map((l) => l.replace(/^\d+× /, "").replace(/ \((Little|Regular|Large|Small|Medium)\)$/, ""))
const COLD = /shake|fountain|water|iced|cold/i
const RULES = [
  ["the engine raised no error", (r) => !r.errors.length],
  ["nothing was rung up that nobody ordered, tapped or accepted", (r, m) => r.customers.every((c) => {
    const ok = new Set([...m.ordered.keys(), ...m.tapped.keys()])
    for (const x of c.cards) if (x.outcome === "accepted") { ok.add(x.entry); if (x.also) ok.add(x.also) }
    return names(c.ticket).every((n) => ok.has(n))
  })],
  ["an item only asked about or praised was never rung up", (r, m) => r.customers.every((c) => {
    const meant = new Set([...m.ordered.keys(), ...m.tapped.keys(), ...c.cards.filter((x) => x.outcome === "accepted").map((x) => x.entry)])
    return [...m.mentioned].filter((n) => !meant.has(n)).every((n) => !names(c.ticket).includes(n))
  })],
  ["every order with a size is on the ticket (unless taken off or swapped)", (r, m) => {
    if (m.cleared.length || r.customers.length > 1) return true
    const c = r.c
    const swapped = new Set(c.cards.filter((x) => x.outcome === "accepted" && x.kind === "swap").map((x) => x.from))
    return [...m.ordered.keys()].filter((n) => !m.unsized.has(n) && !m.removed.has(n) && !swapped.has(n) && !m.out.has(n)).every((n) => names(c.ticket).includes(n))
  }],
  ["an order without a size waits for it, and is not on the ticket", (r, m) => {
    if (m.cleared.length || r.customers.length > 1) return true
    return [...m.unsized].filter((n) => !m.removed.has(n)).every((n) => !names(r.c.ticket).includes(n) && r.c.waiting.includes(n))
  }],
  ["no card offered something already on the ticket", (r) => r.customers.every((c) => c.cards.every((x) => x.kind !== "add" || x.tag === "Closest substitute" || /^Another /.test(x.title) || !x.ticketAtShow.includes(x.entry)))],
  ["no card offered what the customer had taken off", (r, m) => r.customers.every((c) => c.cards.every((x) => !(m.removed.has(x.entry) && x.atSec >= m.removed.get(x.entry) && x.kind === "add")))],
  ["no card offered an item with an allergen the customer named", (r, m) => r.customers.every((c) => c.cards.every((x) => {
    if (x.kind === "notice" || x.also || !x.entry) return true
    for (const [a, at] of m.allergens) if (x.atSec >= at + 1 && allergensOf(x.entry).has(a)) return false
    return true
  }))],
  ["no card offered an item that is out today", (r, m) => r.customers.every((c) => c.cards.every((x) => !m.out.has(x.entry)))],
  ["the card setting was obeyed (no silence timeout outside Dynamic; Until answered only gives way to an allergy)", (r, m) => r.customers.every((c) => c.cards.every((x, i) => {
    if (m.mode !== "dynamic" && x.outcome === "lapsed") return false
    if (m.mode === "hold" && x.outcome === "replaced") return /^Allergy/.test(c.cards[i + 1]?.tag || "")
    return true
  }))],
  ["a card answered once was not shown again (within one visit: Clear starts a new one)", (r, m) => r.customers.every((c) => {
    let answered = new Set()
    let clears = [...m.cleared]
    for (const x of c.cards) {
      if (clears.length && x.atSec >= clears[0]) { answered = new Set(); clears = clears.slice(1) }
      if (answered.has(x.key) && !/:again/.test(x.key)) return false
      if (x.outcome === "accepted" || x.outcome === "declined") answered.add(x.key)
    }
    return true
  })],
  ["a size-up card was for an item on the ticket", (r) => r.customers.every((c) => c.cards.every((x) => x.kind !== "upsize" || x.ticketAtShow.includes(x.entry)))],
  ["no card called a cold item hot", (r) => r.customers.every((c) => c.cards.every((x) => !(COLD.test(x.entry) && /\b(hot|warm)\b(?! (dog|sauce))/i.test(x.reason || ""))))],
]

// ── the twenty kinds of visit ──
const KINDS = [
  ["spoken order with sizes", (v) => {
    const main = pick(MAINS)
    const items = [{ name: main, size: SIZED[main] ? pick(SIZED[main]) : null }]
    if (chance(0.6)) { const s = pick(SIDES); items.push({ name: s, size: SIZED[s] ? pick(SIZED[s]) : null }) }
    if (chance(0.5)) { const d = pick(DRINKS); items.push({ name: d, size: SIZED[d] ? pick(SIZED[d]) : null }) }
    v.say("O", pick(GREETINGS), 0).order(items, { dt: 4 })
    v.push({ press: pick(["add", "no"]) }, 6)
  }],
  ["spoken order without a size, then the size", (v) => {
    const main = pick(MAINS.slice(0, 4))
    v.say("O", pick(GREETINGS), 0).order([{ name: main }], { dt: 4 })
    const size = pick(SIZED[main])
    const how = pick(["say", "choose", "tap"])
    if (how === "say") v.sizeSaid(main, size, 3)
    else if (how === "choose") v.choose(main, size, 3)
    else v.tap(main, size, 3)
  }],
  ["tapped order only", (v) => {
    const main = pick(MAINS)
    v.tap(main, SIZED[main] ? pick(SIZED[main]) : null, 1)
    if (chance(0.7)) { const s = pick(SIDES); v.tap(s, SIZED[s] ? pick(SIZED[s]) : null, 3) }
    v.push({ press: pick(["add", "no"]) }, 3)
  }],
  ["questions and praise that are not orders, then an order", (v) => {
    v.say("O", pick(GREETINGS), 0)
    const x = pick([...MAINS, ...SIDES, "Hand-Spun Milkshake"])
    v.mention(x, 4)
    if (chance(0.5)) v.push({ whisper: [{ name: x, quantity: 1 }] }, 1)
    if (chance(0.5)) v.mention(pick([...SIDES, "Hand-Spun Milkshake"].filter((n) => n !== x)), 3)
    const main = pick(MAINS.filter((n) => n !== x))
    v.order([{ name: main, size: SIZED[main] ? pick(SIZED[main]) : null }], { dt: 4 })
  }],
  ["hot words", (v) => {
    v.say("O", pick(GREETINGS), 0)
    const main = pick(MAINS)
    v.order([{ name: main, size: SIZED[main] ? pick(SIZED[main]) : null }], { dt: 3 })
    v.say("C", pick(["It's so hot out today", "I'm freezing out there", "I'm in a bit of a rush", "I'm trying to eat healthy", "I'm starving", "It's my cheat day"]), 4)
    v.push({ press: pick(["add", "no"]) }, 4)
  }],
  ["an allergy", (v) => {
    v.say("O", pick(GREETINGS), 0)
    const kind = pick(["milk-cheeseburger", "gluten-hamburger", "spice-cajun", "milk-shake", "sesame-burger"])
    if (kind === "milk-cheeseburger") v.order([{ name: "Cheeseburger", size: "Regular" }], { dt: 3 }).allergy("milk", "Oh wait, I'm allergic to milk", 3)
    if (kind === "gluten-hamburger") v.order([{ name: "Hamburger", size: "Regular" }], { dt: 3 }).allergy("wheat", "I can't have gluten by the way", 3)
    if (kind === "spice-cajun") v.order([{ name: "Hamburger", size: "Little" }, { name: "Cajun Fries", size: "Regular" }], { dt: 3 }).allergy("spice", "Oh, I can't have spicy food", 3)
    if (kind === "milk-shake") v.order([{ name: "Hand-Spun Milkshake" }], { dt: 3 }).allergy("milk", "But I'm allergic to dairy", 3)
    if (kind === "sesame-burger") v.order([{ name: "Bacon Burger", size: "Regular" }], { dt: 3 }).allergy("sesame", "I'm allergic to sesame", 3)
    v.push({ press: pick(["add", "no"]) }, 4)
  }],
  ["taken off or swapped", (v) => {
    v.say("O", pick(GREETINGS), 0)
    const main = pick(MAINS.slice(0, 4))
    const side = pick(["Fries", "Cajun Fries"])
    v.order([{ name: main, size: "Regular" }, { name: side, size: "Regular" }], { dt: 3 })
    if (chance(0.5)) v.remove(side, 4)
    else { v.say("C", `Actually swap the ${pick(SAY[side])} for a poutine`, 4); v.meta.removed.set(side, v.t); v.meta.ordered.set("Poutine", 1) }
  }],
  ["card setting held through silence", (v) => {
    const main = pick(MAINS)
    v.say("O", pick(GREETINGS), 0).order([{ name: main, size: SIZED[main] ? pick(SIZED[main]) : null }], { dt: 3 })
    v.at(30)
    v.say("C", pick(["It's so hot out today", "I'm freezing"]), 1)
    v.push({ pitch: true }, 3)
    v.say("C", pick(["Sure", "No thanks", "Yes please", "I'm good"]), 2)
  }],
  ["menu sections opened", (v) => {
    const main = pick(MAINS)
    v.tap(main, SIZED[main] ? pick(SIZED[main]) : null, 1)
    v.push({ section: pick(Object.keys(CATEGORY)) }, 2)
    v.push({ section: pick(Object.keys(CATEGORY)) }, 2)
  }],
  ["a returning voice", (v) => {
    v.say("O", pick(GREETINGS), 0)
    const main = pick(MAINS)
    v.order([{ name: main, size: SIZED[main] ? pick(SIZED[main]) : null }], { dt: 3 })
    const last = pick([...SIDES, ...DRINKS, "Hand-Spun Milkshake"])
    v.push({ voice: { voice_id: `Vpress${v.id}`, matched: true, score: 0.88, tier: 0.8, visits: 2, seen: 3, last_order: [{ name: last, size: "Regular", qty: 1 }] } }, 2)
    v.push({ section: pick(Object.keys(CATEGORY)) }, 2)
  }],
  ["Clear, then a new order", (v) => {
    const a = pick(MAINS)
    v.tap(a, SIZED[a] ? pick(SIZED[a]) : null, 1)
    v.push({ press: "no" }, 2)
    v.push({ clear: true }, 3)
    v.meta.cleared.push(v.t)
    v.meta.ordered.clear(); v.meta.tapped.clear()
    const b = pick(MAINS.filter((n) => n !== a))
    v.tap(b, SIZED[b] ? pick(SIZED[b]) : null, 2)
  }],
  ["\"no thanks, and take off…\"", (v) => {
    v.say("O", pick(GREETINGS), 0)
    const main = pick(MAINS.slice(0, 4))
    v.order([{ name: main, size: "Regular" }, { name: "Fries", size: "Regular" }], { dt: 3 })
    if (chance(0.5)) v.push({ pitch: true }, 3)
    v.say("C", "No thanks, and take off the fries", 2)
    v.meta.removed.set("Fries", v.t)
  }],
  ["two of an item", (v) => {
    v.say("O", pick(GREETINGS), 0)
    const main = pick(MAINS.slice(0, 4))
    if (chance(0.5)) v.order([{ name: main, size: pick(SIZED[main]), qty: 2 }], { dt: 3 })
    else { v.order([{ name: main, qty: 2 }], { dt: 3 }); v.sizeSaid(main, pick(SIZED[main]), 3) }
  }],
  ["ordering for someone else too", (v) => {
    v.say("O", pick(GREETINGS), 0)
    const main = pick(MAINS)
    v.order([{ name: main, size: SIZED[main] ? pick(SIZED[main]) : null }], { dt: 3 })
    v.say("C", pick(["And it's for my wife too", "I'm getting food for my kids as well"]), 3)
    v.push({ press: pick(["add", "no"]) }, 3)
  }],
  ["closing while a card is up", (v) => {
    v.say("O", pick(GREETINGS), 0)
    const main = pick(MAINS)
    v.order([{ name: main, size: SIZED[main] ? pick(SIZED[main]) : null }], { dt: 3 })
    v.say("C", pick(["No thanks, that's it", "That's everything", "That'll be all"]), 4)
  }],
  ["an item that is out today", (v) => {
    v.say("O", pick(GREETINGS), 0)
    const out = v.setup.outToday[0]
    const main = pick(MAINS.filter((n) => n !== out))
    v.order([{ name: main, size: SIZED[main] ? pick(SIZED[main]) : null }, { name: out, size: SIZED[out] ? "Regular" : null }], { dt: 3 })
    v.meta.ordered.delete(out)
    v.push({ press: pick(["add", "no"]) }, 3)
  }, { outToday: () => [pick(["Fries", "Poutine", "Hand-Spun Milkshake"])] }],
  ["whisper's order list", (v) => {
    v.say("O", pick(GREETINGS), 0)
    const main = pick(MAINS)
    v.order([{ name: main, size: SIZED[main] ? pick(SIZED[main]) : null }], { dt: 3 })
    v.push({ whisper: [{ name: main, quantity: pick([1, 2]) }] }, 1)
    if (chance(0.5)) { const x = pick(SIDES); v.push({ whisper: [{ name: main, quantity: 1 }, { name: x, quantity: 1 }] }, 20); v.meta.mentioned.add(x) }
  }],
  ["the cashier says the card", (v) => {
    v.say("O", pick(GREETINGS), 0)
    const main = pick(MAINS)
    v.order([{ name: main, size: SIZED[main] ? pick(SIZED[main]) : null }], { dt: 3 })
    v.push({ pitch: true }, 3)
    v.say("C", pick(["Sure", "Yes please", "No thanks", "Nah I'm good", "Okay sure", "Make sure it's hot"]), 2)
  }],
  ["two no's in a row, then more ordering", (v) => {
    v.say("O", pick(GREETINGS), 0)
    const main = pick(MAINS)
    v.order([{ name: main, size: SIZED[main] ? pick(SIZED[main]) : null }], { dt: 3 })
    v.push({ press: "no" }, 3)
    v.push({ press: "no" }, 3)
    const d = pick(DRINKS)
    v.order([{ name: d, size: SIZED[d] ? pick(SIZED[d]) : null }], { dt: 4 })
  }],
  ["a mixed visit", (v) => {
    v.say("O", pick(GREETINGS), 0)
    const main = pick(MAINS.slice(0, 4))
    v.order([{ name: main }], { dt: 3 })
    v.mention(pick(SIDES), 2)
    v.choose(main, pick(SIZED[main]), 2)
    v.push({ section: "Drinks" }, 2)
    const d = pick(DRINKS)
    v.tap(d, SIZED[d] ? pick(SIZED[d]) : null, 2)
    v.say("C", pick(["It's so hot out", "I'm in a rush", "I'm allergic to milk"]), 2)
    if (/milk/.test(v.steps.at(-1).say)) v.meta.allergens.set("milk", v.t)
    v.push({ press: pick(["add", "no"]) }, 3)
  }],
]

export const TRANSCRIPTS = []
let n = 0
for (let round = 0; round < 5; round++) {
  for (const [title, build, opts] of KINDS) {
    n += 1
    const setup = opts?.outToday ? { outToday: opts.outToday() } : {}
    const v = visit(n, `${title} (${round + 1})`, { setup })
    build(v)
    v.pay()
    TRANSCRIPTS.push(v.done())
  }
}
