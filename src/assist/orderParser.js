// orderParser.js — what the customer just said, as POS menu items.
//
// Runs on each final transcript line from whisper. Matches the longest menu alias at
// each position (menuIndex.js), then reads the few words before it for a quantity
// ("two", "a", "3"), a size ("large", "little") and a negation ("no", "without",
// "cancel"). Grounded on the POS's own menu, so every match is an item the POS can
// ring up; whisper's own order_update is merged in by useAssist as a second opinion.
//
// One microphone hears both the cashier and the customer, and the cashier's pitch
// ("would you like fries with that?") names items too. So each line is classified:
//   order — a customer ordering: an order cue ("can I get", "I'll have", "I'd like")
//           or items named without an offer pattern
//   offer — the cashier offering, asking or recommending ("would you like", "anything
//           else", "how about", "the bacon cheeseburger is our most popular", "we have
//           cajun fries", a question with no order cue): its items are never added
//   other — no menu items

import { INDEX, norm, sizeFromWord } from "./menuIndex.js"

// "to"/"too"/"for" are deliberately absent: STT writes them for two/four, but "I'd like
// to have fries" would then read as two fries.
const NUM = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, couple: 2, pair: 2,
}
const SIZE_WORDS = /^(small|little|medium|regular|large|big|single|double|kids?)$/
const NEGATE = /^(no|without|not|hold|cancel|remove|minus|skip|scratch)$/
const MORE = /^(another|more|extra|also)$/

const ORDER_CUE = /\b(can (i|we) (get|have|grab)|could (i|we) (get|have)|may (i|we) (get|have)|i('ll| will) (have|get|take|do|go with)|i('d| would) (like|love|want)|i want|i need|give me|get me|let me (get|have|grab)|i('m| am) (getting|gonna get|going to get)|we('ll| will) (have|get|take)|we('d| would) like|add (a|an|some|another)|make (it|that) (a|two))\b/
const OFFER_CUE = /\b(would you like|do you want|you want|want to (add|try|make|get)|can i (get|interest) you|anything else|what can i get|what would you like|what('ll| will) it be|how about|would you care|care for|interested in|make it a (large|regular)|upgrade|try our|have you tried|is that (all|it)|for here or|your total|our (most popular|best ?sellers?|favou?rites?|specials?)|(is|are) (really |pretty |very |so )?(popular|good|great|amazing|delicious)|i('d)? recommend|you should (try|get)|people (love|like)|we('ve)? (also )?(got|have)|comes with|on special)\b/

/**
 * Parse one transcript line. Returns { kind: 'order'|'offer'|'other', items }, where
 * items = [{ entry, qty, size: [label, price] | null, negated, more }].
 */
export function parseUtterance(text) {
  const raw = String(text || "")
  const t = norm(raw)
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
    for (let j = hit.start - 1; j >= Math.max(lastEnd, hit.start - 3); j--) {
      const w = tokens[j]
      if (qty == null && /^\d{1,2}$/.test(w)) qty = parseInt(w, 10)
      else if (qty == null && NUM[w] != null) qty = NUM[w]
      else if (!size && SIZE_WORDS.test(w)) size = sizeFromWord(hit.entry, w)
      else if (NEGATE.test(w)) negated = true
      else if (MORE.test(w)) more = true
    }
    // A size word right after the item ("fries large") counts too.
    if (!size && tokens[hit.end] && SIZE_WORDS.test(tokens[hit.end])) size = sizeFromWord(hit.entry, tokens[hit.end])
    items.push({ entry: hit.entry, qty: qty || 1, size, negated, more })
    lastEnd = hit.end
    i = hit.end
  }
  if (!items.length) return { kind: "other", items }
  const lower = raw.toLowerCase()
  const orderCue = ORDER_CUE.test(lower)
  const offerCue = OFFER_CUE.test(lower) || (/\?\s*$/.test(raw) && !orderCue)
  return { kind: offerCue && !orderCue ? "offer" : "order", items }
}

// Greeting that opens a customer session from standby — the same brand-agnostic words
// the in-store tablet listens for ("welcome", "hello"), plus "hi there" and "good morning".
const GREETING = /\b(welcome|hello|hi there|hey there|good (morning|afternoon|evening))\b/
export const isGreeting = (text) => GREETING.test(String(text || "").toLowerCase())
