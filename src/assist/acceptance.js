// acceptance.js — did the customer take the upsell on screen?
//
// Read from the first final transcript lines after the card appears. Decline is checked
// FIRST, the way whisper reads a customer's reply, so "yeah, no thanks" is a decline
// and not a "yeah". A line that is itself an offer ("would you like a shake?") is the
// cashier pitching, not the customer answering, and is ignored.

const NO = /\b(no|nope|nah|no thanks|no thank you|i('m| am) (good|fine|okay|ok|all set)|not today|not this time|that('s| is) (all|it|everything)|just (that|the)|maybe next time|i('ll| will) pass|pass on|not really|don('t| not) (want|need))\b/
const YES = /\b(yes|yeah|yep|yup|sure|ok|okay|alright|all right|sounds (good|great)|let('s| us) do (it|that)|why not|go for it|please do|i('ll| will) (take|have|try) (it|that|one|them)|add (it|that|one)|that works|perfect|absolutely|definitely|of course|go on then)\b/
const OFFERING = /\b(would you like|do you want|how about|can i (get|interest) you|want to (add|try|make))\b/

/** 'yes' | 'no' | null for one transcript line. */
export function classifyReply(text) {
  const t = String(text || "").toLowerCase()
  if (!t || OFFERING.test(t)) return null
  if (NO.test(t)) return "no"
  if (YES.test(t)) return "yes"
  return null
}
