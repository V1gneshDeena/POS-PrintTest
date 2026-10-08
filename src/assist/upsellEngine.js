// upsellEngine.js — the one upsell Assist puts on the POS screen right now.
//
// Hot keys are the guidelines (David, 2026-10-07: "those texts are what dictate decisions
// by the upsell engine"). What was just said decides first (scores 86–110: every hot-key
// card outranks basket completion, which tops out at 82); the rest fills in after.
//
// Candidates, each scored, best one wins:
//   hotkey     from what was just said (hotkeys.json, ctx.hot), each with a tag shown at the
//              top of the card:
//                "took forever"        → a free souvenir, if the menu has one (Complimentary)
//                item out of stock     → the closest substitute at once (Closest substitute);
//                                        the item is never offered again that day. The same
//                                        card answers a customer ordering an item that is
//                                        out, or the cashier tapping one (useAssist.js)
//                "too sweet"/"too bitter" → something to counter it (Counter: too sweet / bitter)
//                "I don't like it"     → an alternative from the same category (Alternative)
//                "do you have X?"      → X, with a complementary item below it (You asked about
//                                        it); if X is out or not on the menu, the closest
//                                        substitute
//                "something cold" / "I'm so hot" → the most-ordered cold item (Something cold);
//                "something hot" / "I'm freezing" → the most-ordered warm item (Something warm)
//                and food when they want food, a second item when ordering for others, a
//                seasonal pairing
//   brain      the demopos tenant's upsell brain on the GPU box (demopos_brain.py in glm-upsell):
//              the ladder (allergy, upsize, cheese / bacon, side, drink, shake) scored by the
//              voice print's history, the order's calories and health, temperature and
//              behaviour, picked and worded by Qwen3-14B from SQLite facts. Its card (95; an
//              allergy answer 108) ranks above basket completion and the AI pick and below the
//              tagged hot-key answers this POS gives instantly. Kinds: add, upsize, and swap (the
//              item replaces one on the ticket: a cheese / bacon upgrade or an allergy swap)
//   ai         whisper's live upsell (the production engine, from the conversation), used
//              only when its item is on THIS POS's menu, not on the ticket, allowed by what
//              the customer said, and not reasoned from an item that is out. It ranks BELOW
//              basket completion (David: "follow the basket completion"), so on this POS it
//              fills in once the basket is complete, or names the same item as the basket
//   basket     basket completion, in this menu's order. With sides (the burger menu), David's order
//              (2026-10-08 precedence picks): size up the main, then add a side and a drink, then
//              size up the fries and the drink, then a shake, then a main; without sides (Gregory's)
//              upsize the drink and the food, then a treat, then food
//   behaviour  from the screen-activity estimates (behaviour.js): a treat when the customer
//              is in a treat mood, the category they looked at and left, the bestseller when
//              undecided, "make it two" on a second round
// Gates: nothing for a minute after an order complaint; nothing right after the cashier
// removes something; a health-minded customer gets a size-up only of an item that is itself
// healthy (healthyItem: water, diet, tea… or 150 kcal or less in the bigger size; David,
// 2026-10-08), none once a size-up was declined this visit (a hurried or price-conscious one
// still gets it, said as "only $X more"), and not for an item that was itself just upsold; only
// one small add-on at checkout or once the order is closing; dairy-free / sugar / caffeine /
// health / drink-only constraints drop every candidate that breaks them, the AI's pick
// included; weather, hurry, energy, routine and seasonal interest re-rank what is left.
// Nothing already on the ticket, declined, or already offered this customer is offered
// again; after a declined add-on no other item of the same role is offered by the basket
// or behaviour rules. There is no set number of cards: the conversation decides. Two no's in
// a row close the door until the customer opens a new one (orders something, or says
// something a hot key answers: ctx.lastOpeningAt).

import { INDEX, bestOf, MENU_ROLES, norm } from "./menuIndex.js"
import KB from "../data/menu-kb.json"

// Basket completion order (see the header). Each step is "up:<role>" (upsize the line of
// that role, if it has a bigger size) or "add:<role>" (add the most-ordered item of a role
// the ticket doesn't have yet).
const LADDER = MENU_ROLES.has("side")
  ? ["up:main", "add:side", "add:drink", "up:side", "up:drink", "add:treat", "add:main"]
  : ["up:drink", "up:main", "add:treat", "add:main"]

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`

// Name tests for the hot-key constraints and re-ranks. Menus carry no dietary data, so
// these read item names; they err towards dropping a candidate rather than pitching
// something the customer just ruled out.
const DAIRY = /milk|shake|cream|cheese|latte|mocha|macchiato|cappuccino|frapp|butter|yogurt|custard|flat white/i
const SWEET = /shake|cookie|cake|donut|doughnut|brownie|muffin|cinnamon|sweet|caramel|chocolate|frapp|candy|pie|scone|danish|loaf|syrup|mocha|lemonade|refresher/i
const CAFFEINE = /espresso|cold brew|coffee|americano|latte|shot|nitro|macchiato|cappuccino|mocha|matcha|chai|black tea|\btea\b/i
const INDULGENT = /shake|cookie|cake|donut|doughnut|brownie|fries|bacon|frapp|cinnamon roll|cheese fries/i
const SEASONAL = /pumpkin|pecan|apple|peppermint|gingerbread|maple|spice|cranberry|eggnog/i
const COLD_ITEM = /iced|cold|frapp|shake|lemonade|refresher|smoothie|frozen|fountain|soda|\bwater\b|sparkling|ice cream|slush/i
const HOT_ITEM = /\bhot\b|latte|\btea\b|chocolate|soup|cappuccino|americano|mocha|chai|warm|coffee|sandwich|melt/i
// Warm food, for "something warm" on a menu without hot drinks (the burger menu).
const HOT_FOOD = /burger|fries|hot dog|sandwich|melt|grilled|\begg|bacon|soup|panini|toast/i
const isColdItem = (e) => COLD_ITEM.test(e.name)
// A healthy item: one a health-minded customer may still be offered a bigger size of. By name
// (water, diet, tea, salad, fruit, a veggie item without cheese), or 150 kcal or less in that size
// by the menu's nutrition data (menu-kb.json).
const HEALTHY_NAME = /\b(water|diet|zero|unsweet|sparkling|tea|salad|fruit|apple)\b|veggie(?!.*cheese)/i
export function healthyItem(e, size) {
  if (HEALTHY_NAME.test(e.name)) return true
  const cal = KB.items?.[e.name]?.sizes?.[size || ""]?.calories
  return typeof cal === "number" && cal <= 150
}
const isHotItem = (e) => !COLD_ITEM.test(e.name) && (HOT_ITEM.test(e.name) || HOT_FOOD.test(e.name))
// Which part of the meal a temperature card comes from first: a drink, then a side or treat.
const TEMP_ROLE_ORDER = ["drink", "side", "treat", "main"]
const ENERGY = /shot|espresso|cold brew|nitro/i
// Counters: plain / savoury against "too sweet", sweet against "too bitter".
const PLAIN = /water|americano|black|brewed|drip|unsweet|cold brew|espresso|fries|salt|pretzel|bagel|plain|grilled cheese|veggie|egg|hot dog|burger/i
const SWEETENER = /shake|chocolate|caramel|vanilla|mocha|cookie|cake|donut|muffin|sweet|syrup|cream|honey|croissant|loaf|lemonade/i
// Souvenirs: merchandise only — the menu's "other" items (Extras & Merch), by category or
// by a merchandise name. Never food or drink ("Bottled Water" is not a souvenir).
const SOUVENIR_CAT = /merch|souvenir|gift/i
const SOUVENIR_NAME = /\b(?:mug|tumbler|tote|shirt|t-shirt|hoodie|hat|cap|sticker|keychain|key chain|beanie)\b/i
// What an asked-for item that isn't on the menu probably is.
const ROLE_HINTS = [
  ["side", /fries|rings|tots|wedges|chips|side|salad|poutine/i],
  ["treat", /shake|ice cream|sundae|cookie|cake|dessert|pie|donut|muffin|pastry|brownie|sweet|scone|croissant/i],
  ["drink", /soda|coke|pop|juice|tea|coffee|water|lemonade|drink|latte|smoothie|espresso|frapp|cappuccino|refresher/i],
  ["main", /burger|sandwich|wrap|nugget|chicken|hot ?dog|sub|pizza|bowl|taco|melt|breakfast|bagel|egg/i],
]
const isFood = (e) => e.role === "main" || e.role === "side" || (e.role === "treat" && !/shake|drink|beverage/i.test(e.category))
const words = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 2))

/** Does this entry respect every constraint the customer has stated? */
export function allowedBy(constraints, e) {
  if (!constraints || !constraints.size) return true
  const n = e.name
  if (constraints.has("dairy_free") && DAIRY.test(n) && !/oat|almond|soy|coconut|dairy[- ]free/i.test(n)) return false
  if (constraints.has("sugar_aware") && SWEET.test(n) && !/sugar[- ]free|unsweet/i.test(n)) return false
  if (constraints.has("decaf") && CAFFEINE.test(n) && !/decaf|herbal/i.test(n)) return false
  if (constraints.has("health") && INDULGENT.test(n)) return false
  if (constraints.has("no_food") && isFood(e)) return false
  return true
}

const defaultSizeOf = (entry) => entry.sizes.find(([l]) => /^regular$/i.test(l)) || entry.sizes[0]

function addCard(entry, { source, score, reason, tag = "", pair = null }) {
  const [size, price] = defaultSizeOf(entry)
  return { kind: "add", entry, size, price, source, score, reason, title: entry.name, tag, pair }
}

/**
 * The menu item closest to `target`: an entry, or { name } for something asked for that
 * the menu doesn't carry. Same category first, then same part of the meal, then shared
 * name words, then popularity and nearest price.
 */
export function closestTo(target, { exclude = new Set(), constraints = null } = {}) {
  const tWords = words(target.name)
  let role = target.role
  if (!role) for (const [r, re] of ROLE_HINTS) if (re.test(target.name)) { role = r; break }
  const tPrice = target.sizes ? defaultSizeOf(target)[1] : null
  let best = null
  for (const e of INDEX.entries) {
    if (e.id === target.id || exclude.has(e.id) || e.role === "other" || !allowedBy(constraints, e)) continue
    let s = 0
    if (target.category && e.category === target.category) s += 40
    if (role && e.role === role) s += 20
    for (const w of words(e.name)) if (tWords.has(w)) s += 15
    s += ({ bestseller: 3, popular: 2, signature: 1 }[e.tag] || 0) - e.rank * 0.3
    if (tPrice != null) s -= Math.abs(defaultSizeOf(e)[1] - tPrice)
    if (!best || s > best.s) best = { e, s }
  }
  return best && best.s > 0 ? best.e : null
}

/**
 * ctx = { cart: [{item, size, price, count, category}], lastAdded: {item, category, size, price} | null,
 *         behaviours: [...estimate()], ai: {entry, reason} | null,
 *         offers: [{key, entryId, kind, again, outcome, atCheckout}],   (key = cardKey(card))
 *         hot: { now, effects: Map(effect → last fired ms), blocked: Set(entryId) (today's and this
 *                customer's), outOfStock: [{entry, at}], interest: [{entry|null, asked, at}],
 *                disliked: [{entry, at}], temperature: [{cold, wanted, at}], constraints: Set,
 *                pausedUntil } | null }
 * ctx.justSized = the id of the item whose size was just given (its size-up comes first), or null.
 * ctx.removed = Map(entry id → "remove" | "replace"): what the customer had taken off this visit.
 * ctx.brain = { entry, kind: 'add'|'upsize'|'swap', size, price, fromSize?, fromEntry?, alsoEntry? (an
 *               allergy swap's lettuce wrap, rung up with it), tag,
 *               framing, why, at } | null — the upsell brain's latest pick (useAssist.handleBrain).
 * Returns the best card { kind: 'add'|'upsize'|'swap', entry, size, price, fromSize?, fromEntry?,
 * source, reason, title, tag, pair? } or null. `pair` (asked-about items) is { entry, size, price }.
 */
export function pickUpsell(ctx) {
  const { cart = [], lastAdded = null, behaviours = [], ai = null, brain = null, offers = [], hot = null } = ctx
  const has = (key) => behaviours.find((b) => b.key === key)
  const now = hot?.now || Date.now()
  const fired = (effect, withinMs = Infinity) => !!hot?.effects?.has(effect) && now - hot.effects.get(effect) < withinMs
  if (hot?.pausedUntil > now) return null
  if (has("changed_mind")) return null
  // Two no's in a row: quiet until the conversation opens a new door (useAssist passes when the
  // customer last ordered something or said something a hot key answered).
  const answered = offers.filter((o) => o.outcome === "accepted" || o.outcome === "declined")
  const lastTwo = answered.slice(-2)
  if (lastTwo.length === 2 && lastTwo.every((o) => o.outcome === "declined")
      && (ctx.lastOpeningAt || 0) <= Math.max(...lastTwo.map((o) => o.answeredAt || 0))) return null

  const entryOf = (id) => INDEX.entries.find((x) => x.id === id)
  const inCart = new Set(cart.map((e) => e.item.id))
  const cartRoles = new Set(cart.map((e) => entryOf(e.item.id)?.role).filter(Boolean))
  const offeredKeys = new Set(offers.map((o) => o.key))
  const blocked = new Set([...inCart, ...(hot?.blocked || []), ...offers.filter((o) => o.kind === "add" && !o.again).map((o) => o.entryId)])
  const outToday = hot?.blocked || new Set()
  const constraints = hot?.constraints
  // A "no" to one side / drink / treat is a no to that part of the meal: the basket and the
  // behaviour rules don't offer another item of a declined role.
  // What the customer had taken off this visit (useAssist.js ctx.removed: id → "remove" | "replace") is
  // not pitched back; taken off outright, its part of the meal counts as declined for the basket too.
  const removed = ctx.removed || new Map()
  for (const id of removed.keys()) blocked.add(id)
  const declinedRoles = new Set([...offers.filter((o) => o.outcome === "declined" && o.kind === "add").map((o) => o.entryId),
    ...[...removed].filter(([, how]) => how === "remove").map(([id]) => id)].map((id) => entryOf(id)?.role).filter(Boolean))
  const priceLed = !!has("value_seeking")
  const quick = fired("quick", 5 * 60000)
  const upsizeDeclined = offers.some((o) => o.kind === "upsize" && o.outcome === "declined")
  const healthMinded = !!constraints?.has?.("health")
  const checkout = !!has("checkout")
  if (checkout && offers.some((o) => o.atCheckout)) return null

  const cands = []
  // Free toppings and mix-ins (role "other") are never pitched by the basket, behaviour or AI rules;
  // only a hot-key answer or the brain (an allergy lettuce wrap, last visit's toppings) offers one.
  const consider = (card) => {
    if (card && allowedBy(constraints, card.entry)
        && (card.entry.role !== "other" || card.source === "hotkey" || card.source === "brain")) cands.push(card)
  }
  const pickFrom = (opts) => bestOf(opts).find((e) => allowedBy(constraints, e))
  const recent = (list, ms = 2 * 60000) => (list || []).filter((x) => now - x.at < ms)

  // 1. Hot keys — what was just said decides first. Each response is offered once per time
  // it is said: a card carries its `origin` (the hot-key record, or { effect }) and
  // useAssist marks it used when the card is shown, so a declined substitute is not
  // followed by a second one. Items that are out stay blocked all day regardless.
  if (hot) {
    if (fired("souvenir", 5 * 60000)) {
      const gift = INDEX.entries.filter((e) => e.role === "other" && (SOUVENIR_CAT.test(e.category) || SOUVENIR_NAME.test(e.name)) && !blocked.has(e.id))
        .sort((a, b) => a.rank - b.rank)[0]
      if (gift) {
        cands.push({ kind: "add", entry: gift, size: "Complimentary", price: 0, source: "hotkey", score: 110, tag: "Complimentary",
          reason: "Sorry for the wait — this one is on the house", title: `Free ${gift.name}`, origin: { effect: "souvenir" } })
      }
    }
    for (const o of recent(hot.outOfStock)) {
      if (o.offered) continue
      const pick = closestTo(o.entry, { exclude: blocked, constraints })
      if (pick) consider({ ...addCard(pick, { source: "hotkey", tag: "Closest substitute", score: now - o.at < 20000 ? 105 : 92,
        reason: `${o.entry.name} is out today — the closest is the ${pick.name}` }), origin: o })
    }
    for (const d of recent(hot.disliked)) {
      if (d.offered) continue
      const pick = closestTo(d.entry, { exclude: new Set([...blocked, d.entry.id]), constraints })
      if (pick) consider({ ...addCard(pick, { source: "hotkey", tag: "Alternative", score: 104,
        reason: `Doesn't like the ${d.entry.name} — try the ${pick.name} instead` }), origin: d })
    }
    // Counters come from the part of the meal that balances best: against "too sweet" a
    // salty side where the menu has sides (fries against a sweet shake), else a plain drink
    // (an Americano against a sweet latte); against "too bitter" a treat, then a sweet drink.
    const byRoles = (roles) => (a, b) => (roles.indexOf(a.role) + 1 || 99) - (roles.indexOf(b.role) + 1 || 99) || a.rank - b.rank
    if (fired("counter_sweet", 2 * 60000)) {
      const pick = INDEX.entries.filter((e) => PLAIN.test(e.name) && !SWEET.test(e.name) && !blocked.has(e.id) && e.role !== "other")
        .sort(byRoles(MENU_ROLES.has("side") ? ["side", "drink", "main"] : ["drink", "main"])).find((e) => allowedBy(constraints, e))
      if (pick) consider({ ...addCard(pick, { source: "hotkey", tag: "Counter: too sweet", score: 104, reason: "Too sweet — something plain to balance it" }), origin: { effect: "counter_sweet" } })
    }
    if (fired("counter_bitter", 2 * 60000)) {
      const pick = INDEX.entries.filter((e) => SWEETENER.test(e.name) && !blocked.has(e.id) && e.role !== "other")
        .sort(byRoles(["treat", "drink", "main"])).find((e) => allowedBy(constraints, e))
      if (pick) consider({ ...addCard(pick, { source: "hotkey", tag: "Counter: too bitter", score: 104, reason: "Too bitter — something sweet to balance it" }), origin: { effect: "counter_bitter" } })
    }
    for (const q of recent(hot.interest)) {
      if (q.offered || (q.entry && inCart.has(q.entry.id))) continue
      if (!q.entry || outToday.has(q.entry.id)) {
        const target = q.entry || { name: q.asked }
        const pick = target.name ? closestTo(target, { exclude: blocked, constraints }) : null
        // 106: a question just asked is newer than an earlier out-of-stock line that may
        // point to the same substitute, so its explanation wins.
        if (pick) consider({ ...addCard(pick, { source: "hotkey", tag: "Closest substitute", score: 106,
          reason: q.entry ? `We're out of the ${q.entry.name} today — the closest is the ${pick.name}` : `We don't carry “${q.asked}” — the closest is the ${pick.name}` }), origin: q })
        continue
      }
      // Pitch what they asked about, with a complementary item below it: the next part of
      // the meal in basket order that is neither on the ticket nor the item itself.
      const pairRole = LADDER.filter((s) => s.startsWith("add:")).map((s) => s.slice(4))
        .find((r) => r !== q.entry.role && !cartRoles.has(r) && MENU_ROLES.has(r))
      const pe = pairRole ? pickFrom({ role: pairRole, exclude: new Set([...blocked, q.entry.id]) }) : null
      const pair = pe ? { entry: pe, size: defaultSizeOf(pe)[0], price: defaultSizeOf(pe)[1] } : null
      consider({ ...addCard(q.entry, { source: "hotkey", tag: "You asked about it", score: 102, pair,
        reason: `Asked whether we have the ${q.entry.name}${pe ? ` — it goes well with the ${pe.name}` : ""}` }), origin: q })
    }
    if (fired("group") && cart.length) {
      const same = [...cart].sort((a, b) => b.price - a.price)[0]
      const entry = entryOf(same.item.id)
      if (entry) consider({ kind: "add", again: true, entry, size: same.size, price: same.price, source: "hotkey", score: 90, tag: "",
        reason: "Ordering for someone else too — a second one for them?", title: `Another ${entry.name}` })
    }
    // Wants food pitches a main only when the ticket has none; with a main on it the basket is
    // completed instead (food still ranks first in the re-rank below: the side before the drink).
    if (fired("food") && !cartRoles.has("main")) {
      const pick = INDEX.entries.filter((e) => isFood(e) && !blocked.has(e.id))
        .sort((a, b) => (a.role === "main" ? 0 : 1) - (b.role === "main" ? 0 : 1) || a.rank - b.rank)
        .find((e) => allowedBy(constraints, e))
      if (pick) consider(addCard(pick, { source: "hotkey", score: 86, reason: "Said they want food — our most-ordered" }))
    }
    if (fired("seasonal")) {
      const pick = INDEX.entries.filter((e) => SEASONAL.test(e.name) && !blocked.has(e.id)).sort((a, b) => a.rank - b.rank).find((e) => allowedBy(constraints, e))
      if (pick) consider(addCard(pick, { source: "hotkey", score: 88, reason: "Asked for something seasonal — it pairs with the season's menu" }))
    }
    // Temperature (hot.temperature, newest record per temperature only, once per time it is
    // said): wanting something cold or hot gets the most-ordered item of that temperature, a
    // drink first (Something cold / Something warm); feeling hot or cold gets the same card a
    // little lower. Neither when the ticket already has a drink or treat of that temperature
    // ("something cold to drink" rings up the drink itself; a shake already answers "I'm hot").
    for (const cold of [true, false]) {
      const r = recent(hot.temperature).filter((x) => x.cold === cold).pop()
      if (!r || r.offered) continue
      const isTemp = cold ? isColdItem : isHotItem
      if (cart.some((l) => { const e = entryOf(l.item.id); return e && (e.role === "drink" || e.role === "treat") && isTemp(e) })) continue
      const pick = INDEX.entries.filter((e) => isTemp(e) && !blocked.has(e.id) && e.role !== "other")
        .sort((a, b) => (TEMP_ROLE_ORDER.indexOf(a.role) + 1 || 9) - (TEMP_ROLE_ORDER.indexOf(b.role) + 1 || 9) || a.rank - b.rank)
        .find((e) => allowedBy(constraints, e))
      if (!pick) continue
      const reason = cold
        ? (r.wanted ? "Asked for something cold — our most-ordered cold one" : "Feeling the heat — something cold to cool down")
        : (r.wanted ? "Asked for something hot — our most-ordered warm one" : "Feeling the cold — something warm")
      consider({ ...addCard(pick, { source: "hotkey", tag: cold ? "Something cold" : "Something warm", score: r.wanted ? 89 : 87, reason }), origin: r })
    }
  }

  // 1b. The upsell brain's pick (see the header). Dropped when stale: older than 20 s, an item now
  // on the ticket or out, or the line it upsizes / replaces has left the ticket.
  if (brain?.entry && now - (brain.at || 0) < 20000) {
    const fromLine = (id, size) => cart.some((l) => l.item.id === id && (!size || l.size === size))
    const score = /^Allergy/.test(brain.tag || "") ? 108 : 95
    const base = { entry: brain.entry, size: brain.size, price: brain.price, source: "brain", score, tag: brain.tag || "",
      reason: brain.framing || brain.why || "", why: brain.why || "" }
    if (brain.kind === "upsize" && fromLine(brain.entry.id, brain.fromSize)) {
      consider({ ...base, kind: "upsize", fromSize: brain.fromSize, title: `${brain.size} ${brain.entry.name}` })
    } else if (brain.kind === "swap" && brain.fromEntry && fromLine(brain.fromEntry.id) && !blocked.has(brain.entry.id)) {
      consider({ ...base, kind: "swap", fromEntry: brain.fromEntry, fromSize: brain.fromSize, alsoEntry: brain.alsoEntry || null,
        title: brain.alsoEntry ? `${brain.entry.name} in a lettuce wrap` : brain.entry.name })
    } else if (brain.kind === "add" && !blocked.has(brain.entry.id)) {
      consider({ ...base, kind: "add", title: brain.entry.name })
    } else if (brain.kind === "notice" && cart.some((l) => l.item.id === brain.entry.id)) {
      // An allergy with no substitute (demopos_brain.py): the screen says so. Nothing to add, so not
      // through consider(): the item it is about is ruled out by the very constraint it reports.
      cands.push({ ...base, kind: "notice", price: 0, title: brain.title || `No substitute for the ${brain.entry.name}` })
    }
  }

  // 2. The production AI's pick, grounded on this menu. A pick whose reason names an item
  // that is out ("Pairs with the Fries") was reasoned from a stale order.
  const outNames = [...outToday].map((id) => (entryOf(id)?.name || "").toLowerCase()).filter(Boolean)
  const staleAi = outNames.some((n) => String(ai?.reason || "").toLowerCase().includes(n))
  if (ai?.entry && !blocked.has(ai.entry.id) && !staleAi) {
    // 50: below every basket step (82 down to 52), above nothing the hot keys decide.
    consider(addCard(ai.entry, { source: "ai", score: 50, reason: ai.reason || "Suggested from the conversation" }))
  }

  // 3. Basket completion, in this menu's order (see LADDER).
  if (cart.length) {
    let step = 0
    for (const s of LADDER) {
      const [op, role] = s.split(":")
      const score = 82 - step * 5
      if (op === "up") {
        if (upsizeDeclined) continue
        // An item that was itself just upsold is not pitched a size-up straight after (two
        // pitches on one item); what the customer ordered is. A health-minded customer is offered
        // a bigger size only of a healthy item.
        const line = cart.filter((l) => entryOf(l.item.id)?.role === role && !((l.via?.upsell || 0) >= l.count))
          .map((l) => ({ l, e: entryOf(l.item.id) }))
          .filter(({ l, e }) => { const i = e.sizes.findIndex(([x]) => x === l.size); return i >= 0 && i < e.sizes.length - 1
            && (!healthMinded || healthyItem(e, e.sizes[i + 1][0])) })
          .sort((a, b) => b.l.price - a.l.price)[0]
        if (!line) continue
        const { l, e } = line
        const [toSize, toPrice] = e.sizes[e.sizes.findIndex(([x]) => x === l.size) + 1]
        consider({
          kind: "upsize", entry: e, size: toSize, price: toPrice, delta: toPrice - l.price, fromSize: l.size, source: "upsize", tag: "",
          // The item whose size the customer just gave is sized up first (David, 2026-10-08: "if
          // there's a size ahead of it, it can upsize"), ahead of the side and drink.
          score: score + (has("going_large") ? 10 : 0) + (fired("energy") ? 15 : 0) - (fired("routine") ? 10 : 0) + (ctx.justSized === e.id ? 30 : 0),
          reason: priceLed ? `Only ${fmt(toPrice - l.price)} more to make the ${e.name} a ${toSize}` : `Make the ${e.name} a ${toSize} for ${fmt(toPrice - l.price)} more`,
          title: `${toSize} ${e.name}`,
        })
        step += 1
      } else {
        if (cartRoles.has(role) || declinedRoles.has(role) || !MENU_ROLES.has(role)) continue
        const pick = pickFrom({ role, exclude: blocked })
        if (!pick) continue
        consider(addCard(pick, { source: "basket", score, reason: `Completes the basket — no ${role} on the ticket yet` }))
        step += 1
      }
    }
  }

  // 4. Behaviour-driven.
  const treat = has("treat_mood")
  if (treat && !cartRoles.has("treat")) {
    const pick = pickFrom({ category: treat.category, exclude: blocked })
    if (pick) consider(addCard(pick, { source: "behaviour", score: 75, reason: `Looking at ${treat.category} — treat mood` }))
  }
  const considered = has("considered_not_taken")
  if (considered) {
    const pick = pickFrom({ category: considered.category, exclude: blocked })
    if (pick) consider(addCard(pick, { source: "behaviour", score: checkout ? 85 : 62, reason: `Looked at ${considered.category} earlier and took nothing` }))
  }
  const browse = has("focused_browse")
  if (browse && !cart.some((e) => e.category === browse.category)) {
    const pick = pickFrom({ category: browse.category, exclude: blocked })
    if (pick) consider(addCard(pick, { source: "behaviour", score: 60, reason: `Most ordered in ${browse.category}` }))
  }
  if (has("undecided")) {
    const pick = pickFrom({ role: MENU_ROLES.has("main") ? "main" : "drink", exclude: blocked })
    if (pick) consider(addCard(pick, { source: "behaviour", score: 72, reason: "Undecided — our bestseller" }))
  }
  const second = has("second_round")
  if (second) {
    const same = cart.filter((e) => e.category === second.category).sort((a, b) => b.price - a.price)[0]
    if (same) {
      const entry = entryOf(same.item.id)
      if (entry) consider({ kind: "add", again: true, entry, size: same.size, price: same.price, source: "behaviour", score: 55, tag: "",
        reason: "Back in the same category — one for someone else too?", title: `Another ${entry.name}` })
    }
  }

  const fresh = cands.filter((c) => !offeredKeys.has(cardKey(c))
    && (c.source === "ai" || c.source === "hotkey" || c.source === "brain" || c.kind !== "add" || c.again || !declinedRoles.has(c.entry.role)))
  if (!fresh.length) return null
  for (const c of fresh) {
    if ((c.source === "hotkey" && c.tag) || c.source === "brain") continue // direct answers and the brain's pick are not re-ranked
    if (priceLed && c.kind === "add") c.score -= c.price * 3
    if (checkout && c.kind === "add") c.score -= c.price * 2 // a small last add-on, not a big one
    if (!hot) continue
    const n = c.entry.name
    if (quick) c.score -= (c.kind === "upsize" ? c.delta : c.price) * 4 // not patient: only something cheap and ready (a size-up costs its difference)
    if (fired("food") && isFood(c.entry)) c.score += 15
    if (fired("seasonal") && SEASONAL.test(n)) c.score += 20
    if (fired("energy") && ENERGY.test(n)) c.score += 10
    if (fired("weather_hot")) c.score += isColdItem(c.entry) ? 12 : isHotItem(c.entry) ? -10 : 0
    if (fired("weather_cold")) c.score += isHotItem(c.entry) ? 12 : isColdItem(c.entry) ? -10 : 0
    if (fired("want_cold")) c.score += isColdItem(c.entry) ? 20 : isHotItem(c.entry) ? -20 : 0
    if (fired("want_hot")) c.score += isHotItem(c.entry) ? 20 : isColdItem(c.entry) ? -20 : 0
    // A re-rank never lifts a basket, AI or behaviour card past a tagged hot-key response
    // (86 and up): what was just said still decides first.
    if (c.source !== "hotkey" && c.source !== "brain") c.score = Math.min(c.score, 85)
  }
  fresh.sort((a, b) => b.score - a.score)
  return { ...fresh[0], atCheckout: checkout }
}

/** Stable identity of a card, for the offer log ("add:<id>", "upsize:<id>", "add:<id>:again"). */
export const cardKey = (c) => `${c.kind}:${c.entry.id}${c.again ? ":again" : ""}${c.price === 0 && c.size === "Complimentary" ? ":free" : ""}`

/**
 * The best item in one menu section for this customer, for the hint under the upsell square when
 * the cashier opens that section (David, 2026-10-08: "any section they get to … simply says what the
 * best item in that section for the customer should be"). Not a card: nothing is logged or offered.
 * Weighs, in order: what this customer ordered last time (a returning voice), what was said (cold or
 * warm, health), then the section's own popularity; leaves out what is out today, what the
 * customer's words rule out (allergies, dairy-free, health…) and what is already on the ticket.
 * Returns { entry, title, price, why } or null.
 */
export function bestInSection(category, { cart = [], hot = null, voice = null } = {}) {
  const constraints = hot?.constraints
  const out = hot?.blocked || new Set()
  const effects = hot?.effects || new Map()
  const inCart = new Set(cart.map((l) => l.item.id))
  const pool = INDEX.entries.filter((e) => e.category === category && !out.has(e.id) && allowedBy(constraints, e))
  const open = pool.filter((e) => !inCart.has(e.id))
  if (!open.length) return null
  const last = new Set((voice?.matched ? voice.last_order || [] : []).map((x) => norm(x.name)))
  const cold = effects.has("want_cold") || effects.has("weather_hot")
  const warm = effects.has("want_hot") || effects.has("weather_cold")
  const health = !!constraints?.has?.("health")
  const why = (e) => last.has(norm(e.name)) ? "what they had last time"
    : cold && isColdItem(e) ? "something cold, from what they said"
    : warm && isHotItem(e) ? "something warm, from what they said"
    : health && healthyItem(e, (e.sizes[0] || [])[0]) ? "the lighter choice"
    : "the most ordered here"
  const score = (e) => -e.rank
    + (last.has(norm(e.name)) ? 50 : 0)
    + (cold ? (isColdItem(e) ? 15 : isHotItem(e) ? -15 : 0) : 0)
    + (warm ? (isHotItem(e) ? 15 : isColdItem(e) ? -15 : 0) : 0)
    + (health ? (healthyItem(e, (e.sizes[0] || [])[0]) ? 20 : INDULGENT.test(e.name) ? -20 : 0) : 0)
  const best = [...open].sort((a, b) => score(b) - score(a))[0]
  const [size, price] = defaultSizeOf(best)
  return { entry: best, title: size && size !== "each" ? `${best.name} (${size})` : best.name, price, why: why(best) }
}
