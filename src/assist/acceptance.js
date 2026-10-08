// acceptance.js — did the customer take the upsell on screen?
//
// Read from the final transcript lines after the card appears. Decline is checked FIRST,
// the way whisper reads a customer's reply, so "yeah, no thanks" is a decline and not a
// "yeah". A line that is itself an offer ("would you like a shake?") is the cashier
// pitching, not the customer answering, and is ignored.
//
// One counter microphone hears both sides, so a reply is read in context (the 20-transaction
// test, test/transcripts.js, found both of these):
//   • A yes or no right after a QUESTION THAT IS NOT THE UPSELL answers that question, not
//     the card: "Do you have the rewards app with us?" "No I don't", "Is that everything?"
//     "Yes". A line that closes the order ("no, that's it") still declines the card.
//   • A bare acknowledgement ("okay", "alright") accepts the card only once the cashier has
//     pitched it (pitches(), marked on the card as `pitched`): "We don't carry onion rings."
//     "Hmm okay, then a cheeseburger" is not a yes to the substitute.
//   • "Sure" inside "make sure", "be sure" or "not sure" is not a yes (the order-change test,
//     test/order-edits.js, found "Make sure the fries are hot" accepting a shake card).
//   • A line that changes the order ("I don't want the fries anymore") is not read as a reply
//     unless it names the card's own item (useAssist.js, with orderEdits.js).

const NO = /\b(no|nope|nah|no thanks|no thank you|i('m| am) (good|fine|okay|ok|all set)|not today|not this time|that('s| is| will be|'ll be) (all|it|everything)|nothing else|just (that|the)|maybe next time|i('ll| will) pass|pass on|not really|don('t| not) (want|need))\b/
const CLOSING = /\b(that('s| is| will be|'ll be) (all|it|everything)|nothing else)\b/
const YES = /\b(yes|yeah|yep|yup|sure|sounds (good|great)|let('s| us) do (it|that)|why not|go for it|please do|i('ll| will) (take|have|try|do) (it|that|one|them)|add (it|that|one)|that works|perfect|absolutely|definitely|of course|go on then)\b/
const WEAK_YES = /\b(ok|okay|alright|all right)\b/
// "Sure" that is not a yes: "make sure the fries are hot", "be sure", "I'm not sure".
const NOT_A_YES = /\b(make|be|not|unsure) sure\b/g
const OFFERING = /\b(would you like|do you want|how about|can i (get|interest) you|want to (add|try|make)|(want|like) (some|a|an|the)?\s?\w+ (with that|instead|too))\b/
const QUESTION = /\?\s*$|^\W*(do|does|did|is|are|was|were|can|could|would|will|what|which|who|how|anything|any|for here|name)\b/
// Words that tie a pitch to the part of the meal the card is from.
const ROLE_WORDS = { side: /\b(fries|side|sides)\b/, drink: /\b(drink|drinks|soda|pop|coke|water)\b/, treat: /\b(shake|milkshake|dessert|treat|something sweet)\b/, main: /\b(burger|sandwich|dog|melt)\b/ }
const UPSIZE_WORDS = /\b(regular|large|bigger|upsize|size up|make (it|that) a)\b/
const STOP = new Set(["the", "and", "with", "style", "each", "hand", "spun"])

const lower = (s) => String(s || "").toLowerCase()

/** Whether `text` pitches this card: an offer, the item's name, its part of the meal, or (for an upsize) a size. */
export function pitches(text, card) {
  const t = lower(text)
  if (!t || !card?.entry) return false
  if (OFFERING.test(t)) return true
  if (card.kind === "upsize" && UPSIZE_WORDS.test(t)) return true
  const words = lower(card.entry.name).split(/[^a-z]+/).filter((w) => w.length >= 3 && !STOP.has(w))
  if (words.some((w) => new RegExp(`\\b${w}s?\\b`).test(t))) return true
  const role = ROLE_WORDS[card.entry.role]
  return !!(role && role.test(t))
}

/**
 * 'yes' | 'no' | null for one transcript line, as a reply to `card`.
 * `prev` is the line heard just before it (since the card appeared), if any.
 */
export function classifyReply(text, { prev = "", card = null } = {}) {
  const t = lower(text)
  if (!t || OFFERING.test(t)) return null
  if (CLOSING.test(t)) return "no"
  if (prev && card && QUESTION.test(lower(prev).trim()) && !pitches(prev, card)) return null
  if (NO.test(t)) return "no"
  const y = t.replace(NOT_A_YES, " ")
  if (YES.test(y)) return "yes"
  if (WEAK_YES.test(y)) return card && !card.pitched ? null : "yes"
  return null
}
