// allergens.js — what a customer says they are allergic to, and what each menu item contains.
//
// The POS reads allergy statements itself ("I'm allergic to milk", "I can't have gluten", "I can't
// have spicy food"), so no card ever offers an item that holds what the customer named — even when
// the GPU-side meaning layer or brain is slow or unreachable (the 2026-10-08 pressure test offered a
// milkshake to a customer who had just said they were allergic to milk, with only the exact hot keys).
// The same words and clause rule as the brain's (deploy/gpu-vllm/demopos/demopos_brain.py
// ALLERGEN_WORDS / allergies), so both read a line the same way; a line that declares an allergy
// without naming one in that clause counts the allergen words of the whole line. Paraphrases ("dairy
// gives me hives", "soy makes me break out") come from the meaning layer's allergy keys
// (useAssist.js handleMeaning). An item's allergens come from the
// menu's allergen guide (menu-kb.json): the item's own list, peanuts for fries cooked in peanut oil,
// and "spice" for Cajun seasoning, jalapeños and hot sauce.
import KB from "../data/menu-kb.json"

const ALLERGY_RX = /\b(?:allergic to|allergy to|allergies to|(?:an? )?(\w+) allergy|can(?:'t| ?not) (?:have|eat|do|handle|take)|intolerant to|sensitive to|celiac|coeliac)\b/gi
const WORDS = [
  ["milk", /milk|dairy|lactose|cheese/i], ["eggs", /eggs?\b|mayo/i], ["wheat", /wheat|gluten|celiac|coeliac|bread/i],
  ["peanuts", /peanuts?|\bnuts?\b/i], ["tree_nuts", /tree nuts?|\bnuts?\b|almonds?|walnuts?/i], ["soy", /\bsoy\b|soya/i],
  ["sesame", /sesame/i], ["mustard", /mustard/i], ["fish", /\bfish\b/i], ["crustaceans_mollusks", /shellfish|shrimp|crab|lobster/i],
  ["sulphites", /sulph?ites?|sulfites?/i], ["spice", /spic(?:e|es|y)|cajun|jalape(?:ñ|n)os?|chil(?:l)?is?|hot sauce/i],
]
const SPICY = /cajun|jalape|hot sauce/i

// A line that declares an allergy without naming one in that clause ("No sesame please, I'm allergic"): the
// allergen words of the whole line count, as whole words, so "cheeseburger" is not cheese.
const DECLARE = /\ballerg(?:y|ic|ies)\b|\bintoleran(?:t|ce)\b/i
const WHOLE = [
  ["milk", /\b(?:milk|dairy|lactose|cheese)\b/i], ["eggs", /\b(?:eggs?|mayo)\b/i], ["wheat", /\b(?:wheat|gluten|bread)\b/i],
  ["peanuts", /\b(?:peanuts?|nuts?)\b/i], ["tree_nuts", /\bnuts?\b/i], ["soy", /\bsoy\b/i], ["sesame", /\bsesame\b/i],
  ["mustard", /\bmustard\b/i], ["spice", /\b(?:spicy|spice|jalape(?:ñ|n)os?|hot sauce)\b/i],
]

// "Gluten and I don't get along", "dairy and me are not friends", "soy and my stomach don't mix": an allergen word,
// then "and I / me / my …", then how they get on. Only those idioms, so "extra cheese and I don't need a drink" is no allergy.
const JOINED = /\b(milk|dairy|lactose|cheese|eggs?|mayo|wheat|gluten|bread|peanuts?|nuts?|soy|sesame|mustard|spic(?:e|y)(?: food)?|hot sauce|jalape(?:ñ|n)os?)\b(?: \w+)? and (?:i|me|my \w+)\b[^.?!,;]*?\b(?:(?:do|does|did|just|really)?\s*(?:n'?t|not|never) (?:get along|get on|mix|agree)|(?:are|is|'re)\s*(?:not|n'?t) (?:friends|on good terms|a good mix|a good match)|are enemies|(?:have|'ve) never got(?:ten)? along|don'?t do well together)/i
const JOINED_OF = [["milk", /milk|dairy|lactose|cheese/i], ["eggs", /egg|mayo/i], ["wheat", /wheat|gluten|bread/i], ["peanuts", /peanut|nut/i],
  ["tree_nuts", /\bnuts?\b/i], ["soy", /soy/i], ["sesame", /sesame/i], ["mustard", /mustard/i], ["spice", /spic|hot sauce|jalape/i]]

/** The allergens a line names in the clause of an allergy phrase ("I'm allergic to eggs, can I get a cheeseburger" is eggs). */
export function allergiesSaid(text) {
  const t = String(text || "")
  const found = new Set()
  for (const m of t.matchAll(ALLERGY_RX)) {
    const clause = t.slice(m.index).split(/[.,;!?]|\bbut\b|\bcan i\b|\bi'?ll\b/i)[0]
    for (const [key, rx] of WORDS) if (rx.test(clause)) found.add(key)
  }
  if (!found.size && DECLARE.test(t)) for (const [key, rx] of WHOLE) if (rx.test(t)) found.add(key)
  const j = JOINED.exec(t)
  if (j) for (const [key, rx] of JOINED_OF) if (rx.test(j[1])) found.add(key)
  return found
}

const BY_NAME = new Map()
for (const [name, it] of Object.entries(KB.items || {})) {
  const a = new Set(it.allergens || [])
  if ((it.cautions || []).some((c) => /peanut oil/i.test(c))) a.add("peanuts")
  BY_NAME.set(name, a)
}
for (const t of [...(KB.toppings || []), ...(KB.mixins || [])]) BY_NAME.set(t.name, new Set(t.allergens || []))

/** What a menu item contains (an unknown item: nothing known, so nothing is ruled out by name). */
export function allergensOf(name) {
  const a = new Set(BY_NAME.get(name) || [])
  if (SPICY.test(name)) a.add("spice")
  return a
}

// The meaning layer's keys that stand for an allergen (deploy/gpu-vllm/demopos/meaning_bank.json `allergen`):
// a hit adds them to the visit's allergens. Dairy-free is a hot key too, and counts as milk.
export const MEANING_ALLERGENS = {
  dairy_free: ["milk"], allergy_milk: ["milk"], allergy_wheat: ["wheat"], allergy_sesame: ["sesame"], allergy_eggs: ["eggs"],
  allergy_soy: ["soy"], allergy_nuts: ["peanuts", "tree_nuts"], allergy_spice: ["spice"], allergy_mustard: ["mustard"],
}
// An exact Dairy-free hot key counts as milk only when the line says so: its patterns also fire on "soy",
// "oat" and "almond" (milk alternatives at Starbucks), which name no allergy to milk.
export const DAIRY_SAID = /\b(milk|dairy|lactose|vegan)\b|dairy[- ]free|non[- ]dairy/i

/** Whether the item holds any of the allergens the customer named. */
export const holdsAllergen = (name, allergens) => !!allergens?.size && [...allergensOf(name)].some((a) => allergens.has(a))
