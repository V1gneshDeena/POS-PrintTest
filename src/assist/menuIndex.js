// menuIndex.js — the active POS menu (catalog.js) as something speech can be matched to.
//
// Every item becomes an entry { id, name, category, role, sizes, tag, rank, item }:
//   role  — the item's part of a meal, from its category: main | side | drink | treat |
//           other. Upsell pairing (upsellEngine.js) works in roles, so one rule set
//           covers the burger menu (Burgers → Fries → Drinks → Shakes) and Gregory's
//           (Drinks → Bakery & Sweets → Food) alike.
//   rank  — popularity order: bestseller, popular, signature tags first, then the
//           menu's own order (Gregory's menu is already sorted by units sold).
// Spoken names are matched through aliases: each item's own name, simple variants
// ("cheese burger", plurals), and a short per-brand list of what customers actually
// say ("shake", "coke", "hot dog").

import { MENU, MENU_KEY } from "../data/catalog.js"

export const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

const ROLE_RULES = [
  [/shake|bakery|sweet|dessert|treat|pastr/, "treat"],
  [/drink|coffee|tea|beverage|juice/, "drink"],
  [/fries|side/, "side"],
  [/burger|hot dog|sandwich|breakfast|food|entree|main|bowl|wrap/, "main"],
  [/extra|merch|retail/, "other"],
]

export function roleOf(category) {
  const c = norm(category)
  for (const [re, role] of ROLE_RULES) if (re.test(c)) return role
  return "other"
}

// What customers say → the menu item they mean, per menu (MENU_KEY in catalog.js).
const MENU_ALIASES = {
  burgers: {
    "shake": "Hand-Spun Milkshake", "milkshake": "Hand-Spun Milkshake", "milk shake": "Hand-Spun Milkshake",
    "soda": "Fountain Drink", "coke": "Fountain Drink", "pop": "Fountain Drink", "soft drink": "Fountain Drink",
    "pepsi": "Fountain Drink", "sprite": "Fountain Drink", "drink": "Fountain Drink", "fountain": "Fountain Drink",
    "water": "Bottled Water", "dasani": "Bottled Water", "hotdog": "Hot Dog", "dog": "Hot Dog",
    "burger": "Hamburger", "veggie": "Veggie Sandwich", "five guys style fries": "Fries", "regular fries": "Fries",
    "cajun": "Cajun Fries", "gravy fries": "Poutine",
    // Free toppings and shake mix-ins (rung up at $0)
    "lettuce wrap": "Lettuce Wrap (no bun)", "no bun": "Lettuce Wrap (no bun)", "bunless": "Lettuce Wrap (no bun)",
    "mayonnaise": "Mayo", "tomato": "Tomatoes", "pickle": "Pickles", "onions": "Raw Onions", "raw onion": "Raw Onions",
    "grilled onion": "Grilled Onions", "mushrooms": "Grilled Mushrooms", "mushroom": "Grilled Mushrooms",
    "jalapenos": "Jalapeño Peppers", "jalapeno": "Jalapeño Peppers", "green pepper": "Green Peppers",
    "bbq": "BBQ Sauce", "barbecue sauce": "BBQ Sauce", "bbq sauce": "BBQ Sauce", "hp": "HP Sauce",
    "banana": "Bananas", "strawberry": "Strawberries", "oreo": "Oreo Cookie Pieces", "oreos": "Oreo Cookie Pieces",
    "reeses": "Reese's Peanut Butter Cup", "reese's": "Reese's Peanut Butter Cup", "caramel": "Salted Caramel",
    "candy cane": "Candy Cane Crunch",
  },
  gregorys: {
    "coffee": "Brewed Coffee", "drip": "Brewed Coffee", "iced coffee": "Iced Coffee",
  },
}

const TAG_SCORE = { bestseller: 3, popular: 2, signature: 1 }

function buildIndex() {
  const entries = []
  for (const [category, items] of Object.entries(MENU)) {
    items.forEach((item, i) => {
      const sizes = Object.entries(item.sizes || {}).sort((a, b) => a[1] - b[1])
      entries.push({
        id: item.id, name: item.name, category, role: roleOf(category), sizes,
        tag: item.tag || "", menuOrder: i, item,
      })
    })
  }
  // Popularity rank within each category: tag first, then menu order.
  const byCat = {}
  for (const e of entries) (byCat[e.category] ||= []).push(e)
  for (const list of Object.values(byCat)) {
    list.sort((a, b) => (TAG_SCORE[b.tag] || 0) - (TAG_SCORE[a.tag] || 0) || a.menuOrder - b.menuOrder)
    list.forEach((e, i) => { e.rank = i })
  }

  const aliases = new Map() // normalized phrase → entry
  const add = (phrase, entry) => {
    const k = norm(phrase)
    if (k && !aliases.has(k)) aliases.set(k, entry)
  }
  const byName = new Map(entries.map((e) => [norm(e.name), e]))
  for (const e of entries) {
    const k = norm(e.name)
    add(k, e)
    if (/\Sburger/.test(k)) add(k.replace(/(\S)burger/, "$1 burger"), e)
    if (!k.endsWith("s")) add(`${k}s`, e)
  }
  for (const [said, name] of Object.entries(MENU_ALIASES[MENU_KEY] || {})) {
    const e = byName.get(norm(name))
    if (!e) continue
    add(said, e)
    if (!norm(said).endsWith("s")) add(`${norm(said)}s`, e) // "two hot dogs", "two shakes"
  }
  const maxWords = Math.max(1, ...[...aliases.keys()].map((k) => k.split(" ").length))
  return { entries, aliases, byName, byCat, maxWords }
}

export const INDEX = buildIndex()

/** The entry a free-text item name refers to (whisper's or the upsell engine's), or null. */
export function findEntry(name) {
  const k = norm(name)
  if (!k) return null
  if (INDEX.aliases.has(k)) return INDEX.aliases.get(k)
  // Strip a leading size word ("large fries", "venti latte").
  const stripped = k.replace(/^(small|little|medium|regular|large|big|grande|venti|tall|single|double)\s+/, "")
  if (INDEX.aliases.has(stripped)) return INDEX.aliases.get(stripped)
  // Longest alias contained in the name.
  let best = null
  for (const [alias, e] of INDEX.aliases) {
    if (alias.length > 3 && (` ${k} `).includes(` ${alias} `) && (!best || alias.length > best[0].length)) best = [alias, e]
  }
  return best ? best[1] : null
}

/** Default size when nobody said one: Regular if the item has it, else its only size, else the smallest. */
export function defaultSize(entry) {
  const reg = entry.sizes.find(([label]) => /^regular$/i.test(label))
  return reg || entry.sizes[0]
}

/** The size a spoken word means for this item ("large" → its biggest), or null. */
export function sizeFromWord(entry, word) {
  if (!word || entry.sizes.length < 2) return null
  const w = word.toLowerCase()
  const exact = entry.sizes.find(([label]) => label.toLowerCase() === w)
  if (exact) return exact
  if (/^(small|little|single|kid|kids)$/.test(w)) return entry.sizes[0]
  if (/^(large|big|biggest|double)$/.test(w)) return entry.sizes[entry.sizes.length - 1]
  // Middle size of three; the smaller of two (burger-menu drinks: Regular / Large).
  if (/^(medium|regular)$/.test(w)) return entry.sizes[Math.floor((entry.sizes.length - 1) / 2)]
  return null
}

/** The most-ordered entries of a role (or one category), best first, skipping excluded ids. */
export function bestOf({ role, category, exclude = new Set() }) {
  const pool = INDEX.entries.filter((e) =>
    (category ? e.category === category : e.role === role) && !exclude.has(e.id))
  return pool.sort((a, b) =>
    (TAG_SCORE[b.tag] || 0) - (TAG_SCORE[a.tag] || 0) || a.rank - b.rank)
}

/** Roles this menu actually has (Gregory's has no "side", the burger menu no bakery). */
export const MENU_ROLES = new Set(INDEX.entries.map((e) => e.role))
