// hotkeys.js — upsell hot keys: words that force the upsell to be re-evaluated at once.
//
// The list itself is hotkeys.json (shared, so whisper can load the same file when hot keys
// go live). This module compiles it and reads one transcript line:
//   detectHotkeys(text) → [{ key, label, effect, action, phrase, items, asked }]
// `items` are the menu entries named after the phrase in the same line, for the hot keys
// that are about an item: out_of_stock (block it), availability_question (pitch it) and
// dislike (offer an alternative to it). The item is read only up to the end of the clause
// (a "but", "instead", an offer such as "want ...?", a dash or punctuation), so in "we don't
// have protein powder, but we can make you a regular matcha" or "we're out of fries — want
// cajun fries instead?" only the first item is blocked. For the complaints (too sweet, too
// bitter, an order problem) `items` are the menu entries named in the clauses that complain
// ("the shake was way too sweet", "I was missing my fries"); useAssist does not ring those up. For an availability question that names nothing on
// the menu, `asked` is what was asked for ("onion rings"), so the engine can look for the
// closest substitute.
//
// What each effect does to the upsell is in upsellEngine.js (ctx.hot) and useAssist.js.
// The 3-second patience rule is a timing rule, not a phrase (hotkeys.json timing_rules);
// useAssist.js applies it.

import LIST from "./hotkeys.json"
import { parseUtterance } from "./orderParser.js"

export const HOTKEYS = LIST.hotkeys.map((h) => ({
  ...h,
  rx: h.patterns.map((p) => new RegExp(p, "i")),
  unlessRx: (h.unless || []).map((p) => new RegExp(p, "i")),
}))

export const TIMING_RULES = Object.fromEntries((LIST.timing_rules || []).map((r) => [r.key, r]))

const ITEM_EFFECTS = new Set(["block_item", "interest_item", "alternative"])
const LEAD_WORDS = /^(?:\s*(?:you|guys|still|have|carry|any|some|the|a|an|your|got|there|is|are|in stock|left)\b)+/i

const COMPLAINT_EFFECTS = new Set(["counter_sweet", "counter_bitter", "pause"])
const CLAUSE_BREAK = /\bbut\b|[.?!,;]|\s[-–—]\s|[–—]/i
const AFTER_BREAK = /\bbut\b|[.?!,;]|\s[-–—]\s|[–—]|\binstead\b|\b(?:want|would you like|how about|can i (?:do|get|offer))\b/i

function clauseAfter(text, index) {
  return text.slice(index).split(AFTER_BREAK)[0]
}

/** The clauses of a line (split at "but", punctuation and dashes). */
const clausesOf = (text) => text.split(CLAUSE_BREAK)

/** Hot keys in one transcript line (each key at most once per line). */
export function detectHotkeys(text) {
  const t = String(text || "")
  if (!t.trim()) return []
  const hits = []
  for (const h of HOTKEYS) {
    if (h.unlessRx.some((r) => r.test(t))) continue
    for (const r of h.rx) {
      const m = r.exec(t)
      if (!m) continue
      let items = []
      let asked = ""
      if (COMPLAINT_EFFECTS.has(h.effect)) {
        items = clausesOf(t).filter((c) => h.rx.some((r) => r.test(c))).flatMap((c) => parseUtterance(c).items.map((i) => i.entry))
      } else if (ITEM_EFFECTS.has(h.effect)) {
        const after = clauseAfter(t, m.index + m[0].length)
        items = parseUtterance(t.slice(m.index, m.index + m[0].length) + after).items.map((i) => i.entry)
        if (!items.length && h.effect === "interest_item") {
          asked = after.replace(LEAD_WORDS, "").replace(/\b(?:today|please|right now|at the moment)\b/gi, "").trim().slice(0, 40)
        }
      }
      // A hot key that names nothing on the menu ("we're out of oat milk") still fires: it
      // is logged and forces a re-evaluation, but blocks nothing.
      hits.push({ key: h.key, label: h.label, effect: h.effect, action: h.action, meaning: h.meaning, phrase: m[0], items, asked })
      break
    }
  }
  return hits
}
