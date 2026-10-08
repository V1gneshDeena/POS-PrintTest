// orderEdits.js — the customer changing the order: taking an item off, or swapping it for another
// (David, 2026-10-08: "orders removed from cart if customer says they want something else and
// want it removed … it should automatically remove").
//
//   detectOrderEdits(text, ticket) → { edits, skip }
//     edits  [{ type: "remove", entry, qty, size } | { type: "replace", from, to, toSize, qty }]
//            only for items that are on the ticket (`ticket`: the POS's cart lines)
//     skip   ids of items this line names as taken off, swapped out or merely referred to ("just
//            the burger, no fries"): the order parser must not ring them up from this line
//
// Removal is read per clause (split at punctuation, "but" and dashes):
//   before the item  take off / take out, remove, cancel, scratch, skip, drop, lose, ditch, forget
//                    (not "don't forget"), never mind, get rid of, leave off / out, pass on, no need
//                    for, changed my mind about, don't / no longer want or need, let's not do, kill,
//                    take away; and right before it: no, without, hold, minus ("no fries", "hold the
//                    drink"), "I'm good / fine on", and "you can keep / leave" when nothing follows
//                    the item ("you can keep the drink"; "leave the fries in" is not a removal)
//   after the item   off / out / away ("take the fries off"), can go, is a no, 's too much, isn't
//                    needed
// The idioms after "kill" were added when test/order-edits.js (61-70) showed the meaning layer
// missing them; those cases are regression tests for the grammar now.
// Swapping is read on the whole line: "change / swap / switch / replace / make X to / for / with /
// into Y", "Y instead of X" and "instead of X, … Y", "rather have Y than X", and "Y instead" or
// "make it a Y" with no X named, which swaps the newest item of Y's kind (a main for a main). The
// new item keeps the old one's size when it has it. A question about availability ("do you have
// onion rings instead of fries?") is never a swap. useAssist.js applies the edits at once, before
// the line's order is rung up; what this grammar misses, the meaning layer's change_order key reads.
import { INDEX, norm, sizeFromWord } from "./menuIndex.js"

const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }
const BEFORE = new RegExp([
  "\\b(?:take|took|taking) (?:off|out)\\b", "\\b(?:remove|cancel|scratch|skip|drop|lose|ditch|nix|delete)\\b",
  "(?<!\\b(?:dont|do not|never) )\\bforget(?: about)?\\b", "\\bnever ?mind\\b", "\\bget rid of\\b", "\\bleave (?:off|out)\\b",
  "\\bpass on\\b", "\\bno need for\\b", "\\bchanged? my mind (?:about|on)\\b", "\\b(?:dont|do not|no longer|wont) (?:want|need)\\b",
  "\\bnot (?:do|get|have) (?:the|any|my)\\b", "\\bkill\\b", "\\btake away\\b",
].join("|"))
// Right before the item only, so "no rush on the drink" and "hold on, the fries" are not removals.
const JUST_BEFORE = /\b(?:no|without|hold|minus|(?:im|i am|were|we are) (?:good|fine|ok|okay|all set) (?:on|with no|without))(?: (?:the|my|any|more))?\s*$/
// "You can keep the drink", "let's leave the fries": a removal only when nothing follows the item.
const KEEP_LEAVE = /\b(?:keep|leave)(?: (?:the|my))?\s*$/
const AFTER = /^(?:off|out|away|can go|could go|(?:is|are) a no|(?:s |is |are )?too much|(?:isnt|arent|is not|are not) needed)\b/
const SWAP_VERB = /\b(?:swap|switch|change|replace|make|turn|trade)\b/
const CONNECT = /^(?:to|for|with|into)$/
const AVAILABILITY = /\bdo (?:you|ya) (?:guys )?(?:have|carry|got|sell)\b|\bis there\b|\bdo they have\b/
const REFERENCE = /\b(?:the|my|that|this|those)\s*$/

/** Menu items in a list of normalised tokens, longest alias first (as orderParser.js reads them). */
function itemsIn(tokens) {
  const out = []
  let i = 0
  while (i < tokens.length) {
    let hit = null
    for (let len = Math.min(INDEX.maxWords, tokens.length - i); len >= 1; len--) {
      const e = INDEX.aliases.get(tokens.slice(i, i + len).join(" "))
      if (e) { hit = { entry: e, start: i, end: i + len }; break }
    }
    if (!hit) { i += 1; continue }
    out.push(hit)
    i = hit.end
  }
  return out
}

/** A quantity and a size said right before an item ("one of the", "the large"). */
function qtyAndSize(entry, before) {
  const w = before.split(" ").filter(Boolean)
  let qty = null
  let size = null
  for (let j = w.length - 1; j >= Math.max(0, w.length - 4); j--) {
    if (size == null) { const s = sizeFromWord(entry, w[j]); if (s) { size = s[0]; continue } }
    if (qty == null && (NUM[w[j]] || /^\d{1,2}$/.test(w[j])) && w[j] !== "a" && w[j] !== "an") qty = NUM[w[j]] || parseInt(w[j], 10)
  }
  return { qty, size }
}

const sizeLike = (entry, label) => (label && entry.sizes.some(([l]) => l === label) ? label : null)

export function detectOrderEdits(text, ticket) {
  const edits = []
  const skip = new Set()
  const raw = String(text || "")
  const onTicket = (id) => ticket.some((l) => l.item.id === id)
  const line = norm(raw)
  const tokens = line ? line.split(" ") : []
  const found = itemsIn(tokens)
  const at = (k) => tokens.slice(0, k).join(" ")

  // ── Swaps (whole line) ──
  let swap = null
  if (!AVAILABILITY.test(line) && found.length) {
    const ioTok = tokens.findIndex((w, k) => w === "instead" && tokens[k + 1] === "of")
    if (ioTok >= 0) {
      const x = found.find((f) => f.start >= ioTok + 2 && f.start <= ioTok + 5)
      const y = x && (found.find((f) => f.end <= ioTok && f.entry.id !== x.entry.id) || found.find((f) => f.start >= x.end && f.entry.id !== x.entry.id))
      if (x && y) swap = { x, y }
    }
    if (!swap) {
      const r = /\b(?:rather|prefer) (?:have |get |do )?/.exec(line)
      const than = line.search(/\b(?:than|over)\b/)
      if (r && than > r.index) {
        const cut = line.slice(0, than).split(" ").filter(Boolean).length
        const y = found.find((f) => f.start < cut)
        const x = found.find((f) => f.start >= cut)
        if (x && y && x.entry.id !== y.entry.id) swap = { x, y }
      }
    }
    if (!swap) {
      for (const v of found) {
        const pre = at(v.start)
        if (!SWAP_VERB.test(pre.split(" ").slice(-4).join(" "))) continue
        const conn = tokens.slice(v.end, v.end + 2).findIndex((w) => CONNECT.test(w))
        if (conn < 0) continue
        const y = found.find((f) => f.start > v.end + conn && f.start <= v.end + conn + 4)
        if (y && y.entry.id !== v.entry.id) { swap = { x: v, y }; break }
      }
    }
    if (!swap && (/\binstead\b(?! of)/.test(line) || /\bmake (?:it|that|this) (?:a |an )?/.test(line)) && found.length === 1) {
      // "Y instead" / "make it a Y": the newest item of Y's kind on the ticket is the one to swap.
      const y = found[0]
      const x = [...ticket].reverse().find((l) => l.item.id !== y.entry.id && roleOfId(l.item.id) === y.entry.role && y.entry.role !== "other")
      if (x) swap = { x: { entry: INDEX.entries.find((e) => e.id === x.item.id), start: -1, end: -1, line: x }, y }
    }
  }
  if (swap && onTicket(swap.x.entry.id) && (swap.y.entry.role !== "other" || swap.x.entry.role === "other")) {
    const from = ticket.find((l) => l.item.id === swap.x.entry.id)
    const toSize = sizeLike(swap.y.entry, from?.size) || null
    edits.push({ type: "replace", from: swap.x.entry, to: swap.y.entry, toSize, qty: null })
    skip.add(swap.x.entry.id)
    skip.add(swap.y.entry.id)
  }

  // ── Removals (per clause) ──
  for (const part of raw.split(/[.!?;,]+|\s[-–—]\s|\bbut\b/i)) {
    const ctoks = norm(part).split(" ").filter(Boolean)
    const its = itemsIn(ctoks)
    let prevEnd = 0
    for (const it of its) {
      const before = ctoks.slice(prevEnd, it.start).join(" ")
      const after = ctoks.slice(it.end, it.end + 3).join(" ")
      prevEnd = it.end
      if (swap && (it.entry.id === swap.x.entry.id || it.entry.id === swap.y.entry.id)) continue
      const keepLeave = KEEP_LEAVE.test(before) && /^(?:please|thanks|thank you|for now|actually)?$/.test(after.trim())
      if (!(BEFORE.test(before) || JUST_BEFORE.test(before) || AFTER.test(after) || keepLeave)) continue
      skip.add(it.entry.id)
      if (!onTicket(it.entry.id) || edits.some((e) => e.type === "remove" && e.entry.id === it.entry.id)) continue
      const { qty, size } = qtyAndSize(it.entry, before)
      edits.push({ type: "remove", entry: it.entry, qty, size })
    }
  }

  // An item the line only refers to while changing the order ("just the burger and drink, no
  // fries") is the one already there, not a new order.
  if (edits.length || skip.size) {
    for (const f of found) {
      if (skip.has(f.entry.id) || !REFERENCE.test(at(f.start))) continue
      if (onTicket(f.entry.id) || ticket.some((l) => roleOfId(l.item.id) === f.entry.role)) skip.add(f.entry.id)
    }
  }
  return { edits, skip }
}

const ROLE_BY_ID = new Map(INDEX.entries.map((e) => [e.id, e.role]))
const roleOfId = (id) => ROLE_BY_ID.get(id)
