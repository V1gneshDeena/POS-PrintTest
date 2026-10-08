// orderParser.js — what the customer just said, as POS menu items.
//
// Runs on each final transcript line from whisper. Matches the longest menu alias at
// each position (menuIndex.js), then reads the few words before it for a quantity
// ("two", "a", "3"), a size ("large", "little") and a negation ("no", "without",
// "cancel"). Grounded on the POS's own menu, so every match is an item the POS can
// ring up; whisper's own order_update is merged in by useAssist as a second opinion.
//
// One microphone hears both the cashier and the customer, and the cashier's pitch
// ("would you like fries with that?") names items too. An item is rung up only from an
// intentional order (David, 2026-10-08: "for an order to be added there has to be a full
// intentional statement from the customer saying i want to buy this item"). Each clause of
// the line (split at . ? ! , ;) is read on its own, and its items are `ordered` only when it is
//   • an order cue: "can I get", "I'll have", "I'd like", "I want", "let me get", "add a"…
//   • a polite request that asks nothing: "a regular cheeseburger please"
//   • a bare item list: nothing but items, numbers, sizes and filler ("cheeseburger and fries")
//   • the answer to the cashier's order question ("what can I get you?"), with soft words
//     allowed ("I think a cheeseburger")
// and never when it asks whether something is there or what it costs ("do you have",
// "how much is", "could I come in and get"). The line's kind:
//   order   — at least one clause ordered
//   offer   — the cashier offering, asking or recommending ("would you like", "anything
//             else", "the bacon cheeseburger is our most popular"), or any question with no
//             order cue: its items are never added
//   mention — items named but not ordered ("the fries here are amazing", "I might get a
//             shake later"): nothing rung up
//   other   — no menu items
// `intent` is true when the line orders, has an order cue even without a menu item ("I'll
// take one"), or says yes to the cashier's offer; whisper's own order list may add an item
// only shortly after such a line (useAssist.js handleWhisperOrder). `asks` is true when a clause
// asks about an item the way a customer does ("do you have poutine?", "how much is the shake",
// "is the poutine good?"), so the line is marked as the customer's for the voice print.

import { INDEX, norm, sizeFromWord } from "./menuIndex.js"

// "to"/"too"/"for" are deliberately absent: STT writes them for two/four, but "I'd like
// to have fries" would then read as two fries.
const NUM = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, couple: 2, pair: 2,
}
const SIZE_WORDS = /^(small|little|medium|regular|large|big|single|double|kids?)$/
const NEGATE = /^(no|without|not|hold|cancel|remove|minus|skip|scratch)$/
// Words that add to what is already on the ticket ("another cheeseburger", "one more fries").
// Not "also" or "extra": speech-to-text repeats lines ("and also a fries"), and a customer means a
// second unit only when they say so (David, 2026-10-08: "in most cases the item will simply be
// said with 2 cups of or 2 burgers").
const MORE = /^(another|more)$/

// An adverb may sit inside the cue ("can I also get", "I'll just have", "could we actually get").
const A = "(?:(?:also|just|please|actually|maybe|then|still|now) )?"
const ORDER_CUE = new RegExp("\\b(can (i|we) " + A + "(get|have|grab|do)|could (i|we) " + A + "(get|have|grab|do)|may (i|we) " + A + "(get|have)"
  + "|i('ll| will) " + A + "(have|get|take|do|go with|go for|try)|i('d| would) " + A + "(like|love|want|take)|i " + A + "(want|wanna)|i need|we need|we want"
  + "|give me|gimme|get me|get us|do me"
  + "|let me " + A + "(get|have|grab|do)|lemme (get|have|grab|do)|let'?s (do|get|go with|have)"
  + "|i('m| am) " + A + "(getting|gonna get|gonna have|gonna do|gonna go with|going to get|going with)"
  + "|we('ll| will) " + A + "(have|get|take|do)|we('d| would) like|add (a|an|some|another)|throw in|make (it|that) (a|two))\\b")
const OFFER_CUE = /\b(would you like|do you want|you want|want to (add|try|make|get)|can i (get|interest) you|anything else|what can i get|what would you like|what('ll| will) it be|how about|would you care|care for|interested in|make it a (large|regular)|upgrade|try our|have you tried|is that (all|it)|for here or|your total|our (most popular|best ?sellers?|favou?rites?|specials?)|(is|are) (really |pretty |very |so )?(popular|good|great|amazing|delicious)|i('d)? recommend|you should (try|get)|people (love|like)|we('ve)? (also )?(got|have)|comes with|with (that|it|your (order|meal|burger))\?|on special)\b/

// Asking whether something is there, or about it, is not ordering it (matched on norm() text).
const AVAIL = /\b((do|does) (you|u|yall|they) (guys )?(still )?(have|got|sell|carry|make|serve|do)|(is|are) there|how much|whats (in|on)|what (is|are) (in|on)|wonder(ing)? if|know if|any chance|(is|are) (it|they|that|those) (still )?available|(could|can) (i|we) (come|stop|swing) (in|by)|how (long|big))\b/
// A clause that asks: ends in "?" or opens with a question word (speech-to-text drops "?").
const QUESTION_START = /^(do|does|did|is|are|was|were|how|what|whats|which|where|when|why|who|could|can|would|will|should|have|has)\b/
const LEADING_FILLER = /^((um|uh|umm|uhh|er|erm|hmm|oh|so|and|well|hey|ok|okay|yeah|alright) )+/
const POLITE = /\b(please|thanks|thank you)\b/
// How a customer asks about an item (not the cashier's offer): "is the poutine good", "does the shake…".
const CUSTOMER_ASK = /^(is|are|does|do) (the|your|it|they|that|those)\b|^(whats|what is|what are|which)\b/
// The cashier asking for the order: a reply to it that names items is an answer, not a mention.
const ORDER_QUESTION = /\b(what can i get|what would you like|what('ll| will) (it be|you have|you be having)|what are you (having|getting)|anything else|what else|ready to order|go ahead|what can i do for you|what('s| is) your order|what can we get)\b/
// A yes to the cashier's offer ("would you like fries?" "yes please"): the customer wants it.
const YES_START = /^\s*(yes|yeah|yep|yup|sure|ok|okay|please|definitely|absolutely|sounds good|go ahead)\b/i

// Words that may sit around items in a bare list ("uh, two cheeseburgers and a large fries, that's
// it"). The soft words count too only when the line answers the cashier's order question.
const FILLER = new Set(("a an the and with plus also just please thanks thank you um uh umm uhh er erm hmm yeah yes yep "
  + "ok okay so then oh of order orders one ones some too as well thats it all for here to go now today actually extra "
  + "no without hold side on meal each alright right sure cool great perfect hi hey hello again another more "
  + "small little medium regular large big single double kid kids").split(" "))
const SOFT = new Set("i ill id im think guess suppose maybe probably lets see go get have take do gonna will would like can me we well".split(" "))

/**
 * Parse one transcript line. Returns { kind: 'order'|'offer'|'mention'|'other', intent, asks, items }, where
 * items = [{ entry, qty, size: [label, price] | null, negated, more, explicit, ordered, clauseKind }]. `ordered`:
 * the clause it is in orders it (see the header); only those are rung up. `clauseKind` is that clause's own
 * kind (an item in a question is never given a size from it). `explicit` is a number said for
 * it ("two", "3"; not "a"): only that makes a quantity above one stick (useAssist.js). `prev` is the
 * line before (the cashier's question, when there was one).
 */
export function parseUtterance(text, { prev = "" } = {}) {
  const raw = String(text || "")
  const before = String(prev || "")
  const answering = ORDER_QUESTION.test(before.toLowerCase())
  const items = []
  const kinds = new Set()
  let cue = false
  let asks = false
  // Each clause with the punctuation that ended it ("?" marks a question).
  const parts = raw.split(/([.?!,;]+)/)
  for (let k = 0; k < parts.length; k += 2) {
    const clause = parts[k]
    const ender = parts[k + 1] || ""
    const lower = clause.toLowerCase()
    const clauseCue = ORDER_CUE.test(lower)
    cue = cue || clauseCue
    const found = itemsIn(clause)
    if (!found.length) continue
    const n = norm(clause)
    const avail = AVAIL.exec(n)
    const question = ender.includes("?") || QUESTION_START.test(n.replace(LEADING_FILLER, ""))
    if (!OFFER_CUE.test(lower) && (avail || (question && CUSTOMER_ASK.test(n.replace(LEADING_FILLER, ""))))) asks = true
    let kind
    if (avail && !(clauseCue && cueAfter(lower, avail.index))) kind = question || OFFER_CUE.test(lower) ? "offer" : "mention"
    else if (clauseCue) kind = "order"
    else if (OFFER_CUE.test(lower) || question) kind = "offer"
    else if (POLITE.test(lower)) kind = "order"
    else if (onlyItems(n, found, FILLER)) kind = "order"
    else if (answering && onlyItems(n, found, FILLER, SOFT)) kind = "order"
    else kind = "mention"
    kinds.add(kind)
    for (const it of found) items.push({ ...it, ordered: kind === "order", clauseKind: kind })
  }
  const kind = !items.length ? "other" : kinds.has("order") ? "order" : kinds.has("offer") ? "offer" : "mention"
  const yes = YES_START.test(raw) && (OFFER_CUE.test(before.toLowerCase()) || /\?\s*$/.test(before))
  return { kind, intent: kind === "order" || cue || yes, asks, items }
}

/** Whether the clause's order cue comes after its availability question (norm() offsets). */
function cueAfter(lower, availAt) {
  const m = ORDER_CUE.exec(lower)
  return !!m && norm(lower.slice(0, m.index)).length > availAt
}

/** Nothing in the clause but its items, numbers and `words` (and `extra` words, when given). */
function onlyItems(n, found, words, extra) {
  const tokens = n ? n.split(" ") : []
  const inItem = new Set()
  for (const it of found) for (let j = it.start; j < it.end; j++) inItem.add(j)
  return tokens.every((w, j) => inItem.has(j) || words.has(w) || (extra && extra.has(w)) || NUM[w] != null || /^\d{1,2}$/.test(w) || NEGATE.test(w))
}

/** The menu items named in one clause, with the quantity, size and negation said for each. */
function itemsIn(clause) {
  const t = norm(clause)
  const tokens = t ? t.split(" ") : []
  const items = []
  let i = 0
  let lastEnd = 0
  while (i < tokens.length) {
    let hit = null
    for (let len = Math.min(INDEX.maxWords, tokens.length - i); len >= 1; len--) {
      const phrase = tokens.slice(i, i + len).join(" ")
      const e = INDEX.aliases.get(phrase)
      if (e) { hit = { entry: e, start: i, end: i + len }; break }
    }
    if (!hit) { i += 1; continue }
    // Read up to 3 words back (not into the previous item) for qty / size / negation.
    let qty = null
    let size = null
    let negated = false
    let more = false
    let explicit = false
    for (let j = hit.start - 1; j >= Math.max(lastEnd, hit.start - 3); j--) {
      const w = tokens[j]
      if (qty == null && /^\d{1,2}$/.test(w)) { qty = parseInt(w, 10); explicit = true }
      else if (qty == null && NUM[w] != null) { qty = NUM[w]; explicit = w !== "a" && w !== "an" }
      else if (!size && SIZE_WORDS.test(w)) size = sizeFromWord(hit.entry, w)
      else if (NEGATE.test(w)) negated = true
      else if (MORE.test(w)) more = true
    }
    // A size word right after the item ("fries large") counts too, and so does one inside the name
    // the line matched ("a regular fries" matches the menu name "regular fries").
    if (!size && tokens[hit.end] && SIZE_WORDS.test(tokens[hit.end])) size = sizeFromWord(hit.entry, tokens[hit.end])
    if (!size) for (let j = hit.start; j < hit.end && !size; j++) if (SIZE_WORDS.test(tokens[j])) size = sizeFromWord(hit.entry, tokens[j])
    items.push({ entry: hit.entry, qty: qty || 1, size, negated, more, explicit, start: hit.start, end: hit.end })
    lastEnd = hit.end
    i = hit.end
  }
  return items
}

/**
 * The size word a line answers with, for an item waiting for its size ("Regular.", "make it a
 * large", "the little one please"), or null when the line names none, several ("little or
 * regular?") or asks.
 */
export function sizeAnswer(text) {
  const raw = String(text || "")
  if (/\?\s*$/.test(raw)) return null
  const words = [...new Set(norm(raw).split(" ").filter((w) => SIZE_WORDS.test(w)))]
  return words.length === 1 ? words[0] : null
}

// Greeting that opens a customer session from standby — the same brand-agnostic words
// the in-store tablet listens for ("welcome", "hello"), plus "hi there" and "good morning".
const GREETING = /\b(welcome|hello|hi there|hey there|good (morning|afternoon|evening))\b/
export const isGreeting = (text) => GREETING.test(String(text || "").toLowerCase())
