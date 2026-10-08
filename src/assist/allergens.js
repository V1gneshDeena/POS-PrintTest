// allergens.js — what a customer says they are allergic to, and what each menu item contains.
//
// The POS reads allergy statements itself ("I'm allergic to milk", "I can't have gluten", "I can't
// have spicy food"), so no card ever offers an item that holds what the customer named — even when
// the GPU-side meaning layer or brain is slow or unreachable (the 2026-10-08 pressure test offered a
// milkshake to a customer who had just said they were allergic to milk, with only the exact hot keys).
// The same words and clause rule as the brain's (deploy/gpu-vllm/demopos/demopos_brain.py
// ALLERGEN_WORDS / allergies), so both read a line the same way. An item's allergens come from the
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

/** The allergens a line names in the clause of an allergy phrase ("I'm allergic to eggs, can I get a cheeseburger" is eggs). */
export function allergiesSaid(text) {
  const t = String(text || "")
  const found = new Set()
  for (const m of t.matchAll(ALLERGY_RX)) {
    const clause = t.slice(m.index).split(/[.,;!?]|\bbut\b|\bcan i\b|\bi'?ll\b/i)[0]
    for (const [key, rx] of WORDS) if (rx.test(clause)) found.add(key)
  }
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

/** Whether the item holds any of the allergens the customer named. */
export const holdsAllergen = (name, allergens) => !!allergens?.size && [...allergensOf(name)].some((a) => allergens.has(a))
