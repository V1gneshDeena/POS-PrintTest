// reasoning.js — what Vavoom Assist is weighing, in plain sentences, for the full bar's "How it's
// deciding" view (David, 2026-10-08: show investors what the engine considers for each upsell).
//
// Nothing here calls a model or delays a card. Every sentence is built on the POS from numbers the
// engine already has, at the moment it has them: the hot key and its meaning, the voice print's
// match, the screen's behaviours, the ticket's calories and allergens (menu-kb.json), the upsell
// brain's trace (ranked options with their history / fit / bestseller / price scores, and the
// model's own one-line read) and the answers to each card. useAssist.js calls these and publishes
//   { now: { memory, health, history, plan }, timeline: [{ at, kind, text }], last }
// (`plan` is when it pitches next: pitchNote(); there is no set number of upsells)
// where `now` is what it is weighing at this moment (updated in place), `timeline` is what happened
// this visit, and `last` is the previous visit's, kept on screen after payment.
import KB from "../data/menu-kb.json"
import { INDEX, roleOf } from "./menuIndex.js"

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`
const list = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`)
const lower1 = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s)

/** Calories and allergens of one ticket line, from the menu knowledge base (burger menu only). */
function kbLine(name, size) {
  const it = KB.items?.[name]
  if (it) {
    const s = it.sizes?.[size] || Object.values(it.sizes || {})[0]
    return { kcal: s?.calories ?? null, allergens: it.allergens || [] }
  }
  const t = [...(KB.toppings || []), ...(KB.mixins || [])].find((x) => x.name === name)
  return t ? { kcal: t.calories ?? null, allergens: t.allergens || [] } : null
}

const HEALTHY_ITEM = /water|veggie|lettuce wrap/i

/**
 * The ingredients and calories judgement for the ticket: what the meal adds up to, what it contains,
 * and whether anything points to a health-minded customer. Returns null on a menu without a
 * knowledge base (Gregory's) or an empty ticket.
 */
export function healthNote(cart, { constraints = [], brainHealth = null } = {}) {
  if (!cart.length || !KB.items) return null
  let kcal = 0
  const parts = []
  const allergens = new Set()
  for (const l of cart) {
    const k = kbLine(l.item.name, l.size)
    if (!k) continue
    if (k.kcal != null) {
      kcal += k.kcal * l.count
      parts.push(`${l.count > 1 ? `${l.count}× ` : ""}${l.item.name}${l.size && l.size !== "each" ? ` (${l.size})` : ""} ${(k.kcal * l.count).toLocaleString()} cal`)
    }
    for (const a of k.allergens) allergens.add(a)
  }
  if (!parts.length) return null
  const band = kcal < 600 ? "a light meal" : kcal < 1200 ? "a moderate meal" : "a heavy meal"
  const signs = []
  if (cart.some((l) => HEALTHY_ITEM.test(l.item.name))) signs.push("a lighter item on the ticket")
  if (cart.some((l) => String(l.size).toLowerCase() === "little")) signs.push("a Little size")
  if (constraints.includes("health")) signs.push("they said something health-minded")
  if (constraints.includes("sugar_aware")) signs.push("they are watching sugar")
  if (constraints.includes("dairy_free")) signs.push("they avoid dairy")
  const verdict = signs.length
    ? `Health signals: ${list(signs)}, so lighter add-ons come first (water before a shake, no upsize)${constraints.includes("dairy_free") ? " and nothing with milk or cheese" : ""}.`
    : "Nothing on the ticket or in what was said points to health, so indulgent add-ons are allowed."
  const brain = brainHealth != null ? ` The upsell brain scores health at ${Number(brainHealth).toFixed(2)} on a 0 (indulgent) to 1 (health-first) scale.` : ""
  return `Looked at calories and ingredients: ${list(parts)}, ${kcal.toLocaleString()} cal in all, ${band}. Contains ${list([...allergens].sort()) || "no listed allergens"}. ${verdict}${brain}`
}

/** What the ticket is still missing, as meal parts, for the plan and the tap notes. */
export function openSlots(cart) {
  const roles = new Set(cart.map((l) => roleOf(l.category || "")))
  if (!roles.has("main")) return null
  const out = []
  if (!roles.has("side")) out.push("a side")
  if (!roles.has("drink")) out.push("a drink")
  if (!roles.has("treat")) out.push("a shake")
  return out
}

/**
 * When it pitches (David, 2026-10-08: no set number, "let it just be triggered on the
 * conversation"; "always attempt to upsize most of the time"). Pitching stays open while the
 * conversation gives openings; it is paused after a complaint, quiet after two no's in a row until
 * the customer opens a new door (orders something, or says something a hot key answers), and done
 * once the order is closed and the last small offer answered. The next opening is a size-up of
 * something the customer ordered, then the open parts of the meal.
 */
export function pitchNote({ cart, offers, effects, constraints, lastOpeningAt, pausedUntil, t, brainHealth }) {
  const answered = offers.filter((o) => o.outcome === "accepted" || o.outcome === "declined")
  const yes = answered.filter((o) => o.outcome === "accepted").length
  const lastTwo = answered.slice(-2)
  const quiet = lastTwo.length === 2 && lastTwo.every((o) => o.outcome === "declined")
    && (lastOpeningAt || 0) <= Math.max(...lastTwo.map((o) => o.answeredAt || 0))
  const closed = effects.has("closing") && offers.some((o) => o.atCheckout && o.outcome)
  let status
  if (pausedUntil > t) status = "Paused for a minute after a complaint: the order gets fixed first."
  else if (closed) status = "Done: the customer closed the order and answered the last small offer."
  else if (quiet) status = "Quiet: two no's in a row, so it waits for the customer to open a new door (order something, or say something a hot word answers)."
  else {
    const healthMinded = constraints.includes("health") || (brainHealth != null && brainHealth >= 0.6)
    const upsizeNo = offers.some((o) => o.kind === "upsize" && o.outcome === "declined")
    const up = healthMinded || upsizeNo ? null : cart.find((l) => {
      const e = INDEX.entries.find((x) => x.id === l.item.id)
      const i = e ? e.sizes.findIndex(([x]) => x === l.size) : -1
      return i >= 0 && i < e.sizes.length - 1 && !((l.via?.upsell || 0) >= l.count) && e.role !== "other"
    })
    const slots = openSlots(cart)
    const next = up ? `the size-up of the ${up.size} ${up.item.name}, the lowest-hanging fruit`
      : slots === null ? "the order itself, once the customer names a main"
      : slots.length ? `${list(slots)}${upsizeNo ? " (no more size-ups: one was turned down)" : healthMinded ? " (no size-ups: health-minded)" : ""}`
      : "nothing on the ladder; only something the customer says opens a new pitch"
    status = `Open: next is ${next}.`
  }
  return `Pitching follows the conversation, with no set number: ${offers.length} shown so far, ${yes} accepted. ${status}`
}

const SOURCE_SAYS = {
  hotkey: "answering what the customer said",
  brain: "the upsell brain's pick",
  basket: "basket completion",
  upsize: "a size up",
  ai: "whisper's AI pick",
  behaviour: "reading the screen",
}

/** Why a card went up: its source, its reason, and for the brain, how the options were ranked. */
export function pickNote(card, brainMeta) {
  const why = String(card.why || card.reason || "").replace(/[.\s]+$/, "")
  const head = `Showing “${card.title}”${card.tag ? ` [${card.tag}]` : ""} (${SOURCE_SAYS[card.source] || card.source})${why ? `. Why: ${lower1(why)}` : ""}`
  if (card.source !== "brain" || !brainMeta?.trace?.ranked?.length) return `${head}.`
  const t = brainMeta.trace
  const ranked = t.ranked.slice(0, 4).map((r) => `${r.title} ${Number(r.score).toFixed(2)}`)
  const top = t.ranked[0]
  const wc = (top.w || 0) * (top.c || 0)
  const hist = wc > 0
    ? ` Previous orders weigh ${wc.toFixed(2)} of each score (${t.visits} visit${t.visits === 1 ? "" : "s"} on this voice, voice confidence ${Number(top.c).toFixed(2)}); history match for ${top.title}: ${Number(top.history).toFixed(2)}.`
    : " No order history for this voice, so options are ranked on fit (half), bestseller (a third) and price fit (a sixth)."
  const temp = t.temperature ? ` Temperature: the customer wants something ${t.temperature}, so ${t.temperature} items rank higher.` : ""
  const by = brainMeta.framer && brainMeta.framer !== "template" ? `${brainMeta.framer} chose from the top 3 and worded it` : "the top option, worded from a template"
  const read = brainMeta.read ? ` The model's read: “${brainMeta.read}”` : ""
  return `${head.replace(/[.\s]+$/, "")}. Ladder step “${t.step}”: ranked ${list(ranked)}.${hist}${temp} ${by[0].toUpperCase()}${by.slice(1)}.${read}`
}

/** What the voice print knows: trying, remembered (with the last order) or new. */
export function memoryNote(voice, { listening }) {
  if (!voice) return listening ? "Trying to remember the customer: listening for about 2.5 s of their speech to make a voice print." : "Waiting for the customer to speak before trying to recognise them."
  if (voice.error) return `Voice print unavailable (${voice.error}); this visit is not linked to anyone.`
  if (voice.matched) {
    const last = (voice.last_order || []).map((x) => `${x.qty > 1 ? `${x.qty}× ` : ""}${x.name}`)
    const seen = voice.seen || (voice.visits || 0) + 1
    return `Customer remembered: their voice matches a stored voice print (similarity ${voice.score}, tier ${voice.tier}). Heard ${seen === 1 ? "once" : `${seen} times`} before, ${voice.visits ? `${voice.visits} paid order${voice.visits === 1 ? "" : "s"}` : "no paid order yet"}. Looking at what they ordered before: ${last.length ? list(last) : "no completed order on record yet"}.`
  }
  return `Don't know who this customer is: no stored voice was close enough${voice.score != null ? ` (best ${voice.score}; a match needs 0.5)` : ""}. Made a new anonymous voice print ${voice.voice_id}; this visit will be added to memory under it. No name is stored.`
}

/** The previous orders line: what the brain's history scores did with this customer's past. */
export function historyNote(voice, brainMeta) {
  if (!voice?.matched) return "No previous orders to draw on yet: picks come from the menu's bestsellers, what fits this order and price."
  const top = brainMeta?.trace?.ranked?.[0]
  const last = (voice.last_order || []).map((x) => x.name)
  const base = `Previous orders: ${last.length ? list(last) : "none recorded"}.`
  if (!top) return `${base} The upsell brain weighs them once it ranks the next option.`
  const liked = brainMeta.trace.ranked.filter((r) => r.history >= 0.6).map((r) => r.title)
  return `${base} ${liked.length ? `Options they had before rank higher: ${list(liked)}.` : "None of the current options were in past orders, so history adds little this time."}`
}

/** The visit going into memory at payment. */
export function savedNote(record) {
  const items = (record.items || []).map((i) => `${i.qty > 1 ? `${i.qty}× ` : ""}${i.name}`)
  const ups = record.upsells || []
  const yes = ups.filter((u) => u.outcome === "accepted").length
  const no = ups.filter((u) => u.outcome === "declined").length
  return `Adding this transaction to memory${record.voice ? ` under voice ${record.voice.voice_id}` : " (no voice print was made, so it is not linked to anyone)"}: ${list(items) || "no items"} (${fmt(record.total)}), ${(record.transcript || []).length} lines of conversation, ${ups.length} upsell${ups.length === 1 ? "" : "s"} (${yes} accepted, ${no} declined).`
}
