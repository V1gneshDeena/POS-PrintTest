// Variety test of the POS's own upsell pick (David, 2026-10-13: "test that it's not just spewing one upsell all
// the time"): every order in ORDERS with every kind of remark in REMARKS, through the real hot keys and
// upsellEngine.js pickUpsell, as the first card of a visit. Reports how spread out the first card is, overall,
// for each remark and for each order; fails (exit 1) when one item is the first card of more than MAX_TOP of the
// conversations, or of more than MAX_TOP_QUIET of the ones where the customer said nothing.
//
//   npm run test:variety
//
// The same grid goes to the live brain with deploy/gpu-vllm/demopos/eval/variety_live.py (monorepo).
import { pickUpsell } from "../src/assist/upsellEngine.js"
import { detectHotkeys } from "../src/assist/hotkeys.js"
import { INDEX } from "../src/assist/menuIndex.js"

const MAX_TOP = 0.35
const MAX_TOP_QUIET = 0.4
const E = (n) => INDEX.entries.find((x) => x.name === n)
const line = (name, size) => { const e = E(name); const s = e.sizes.find(([l]) => l === size) || e.sizes[0]; return { item: e.item, size: s[0], price: s[1], count: 1, category: e.category } }
const ORDERS = [
  ["Regular Cheeseburger", [line("Cheeseburger", "Regular")]],
  ["Little Hamburger", [line("Hamburger", "Little")]],
  ["Hot Dog", [line("Hot Dog")]],
  ["Chicken Sandwich", [line("Chicken Sandwich")]],
  ["Regular Chicken Tenders", [line("Chicken Tenders", "Regular")]],
  ["Patty Melt", [line("Patty Melt")]],
  ["Bacon Cheeseburger + Fries", [line("Bacon Cheeseburger", "Regular"), line("Fries", "Regular")]],
  ["Cheeseburger + Fountain Drink", [line("Cheeseburger", "Regular"), line("Fountain Drink", "Regular")]],
  ["Veggie Sandwich", [line("Veggie Sandwich")]],
  ["Grilled Cheese + Water", [line("Grilled Cheese"), line("Bottled Water")]],
  ["Cheeseburger, Large Fries, Large Drink", [line("Cheeseburger", "Regular"), line("Fries", "Large"), line("Fountain Drink", "Large")]],
  ["Regular Fries only", [line("Fries", "Regular")]],
]
const REMARKS = [
  ["nothing said", ""], ["spicy", "I love spicy food."], ["starving", "I'm starving."], ["light", "Something light please."],
  ["thirsty", "I'm so thirsty."], ["tired", "Long day, I'm so tired."], ["sweet tooth", "I've got a sweet tooth today."],
  ["hot day", "It's so hot out today."], ["cold day", "I'm freezing out there."], ["in a rush", "I'm in a bit of a rush."],
  ["healthy", "I'm trying to eat healthy."], ["no beef", "I don't eat beef."],
]
const TEMP = { weather_hot: [true, false], want_cold: [true, true], weather_cold: [false, false], want_hot: [false, true] }

function firstCard(cart, remark) {
  const now = Date.now()
  const hot = { now, effects: new Map(), blocked: new Set(), constraints: new Set(), outOfStock: [], interest: [], disliked: [], temperature: [], allergens: new Set(), fired: [] }
  for (const h of detectHotkeys(remark)) {
    hot.effects.set(h.effect, now)
    if (h.effect.startsWith("constrain:")) hot.constraints.add(h.effect.slice(10))
    if (TEMP[h.effect]) hot.temperature.push({ cold: TEMP[h.effect][0], wanted: TEMP[h.effect][1], at: now })
  }
  return pickUpsell({ cart, said: remark, hot, lastOpeningAt: now })
}

const spread = (picks) => {
  const c = new Map()
  for (const p of picks) c.set(p, (c.get(p) || 0) + 1)
  const sorted = [...c].sort((a, b) => b[1] - a[1])
  return { n: picks.length, distinct: c.size, top: sorted[0]?.[0], share: (sorted[0]?.[1] || 0) / picks.length, fries: (c.get("Fries") || 0) / picks.length, counts: sorted }
}
const rows = []
for (const [order, cart] of ORDERS) for (const [key, remark] of REMARKS) rows.push({ order, remark: key, item: firstCard(cart, remark)?.title || "(none)" })
const pct = (x) => `${Math.round(x * 100)}%`
const all = spread(rows.map((r) => r.item))
console.log(`${all.n} conversations: ${all.distinct} different first cards; most common ${JSON.stringify(all.top)} ${pct(all.share)}; Fries ${pct(all.fries)}`)
console.log("  " + all.counts.map(([i, n]) => `${i} ${n}`).join(", "))
console.log("by remark (12 orders each):")
const byRemark = {}
for (const [key] of REMARKS) {
  const s = (byRemark[key] = spread(rows.filter((r) => r.remark === key).map((r) => r.item)))
  console.log(`  ${key.padEnd(14)} ${String(s.distinct).padStart(2)} different, top ${JSON.stringify(s.top)} ${pct(s.share)}, Fries ${pct(s.fries)}`)
}
console.log("by order (12 remarks each):")
for (const [order] of ORDERS) {
  const s = spread(rows.filter((r) => r.order === order).map((r) => r.item))
  console.log(`  ${order.padEnd(40)} ${String(s.distinct).padStart(2)} different: ${s.counts.map(([i, n]) => `${i} ${n}`).join(", ")}`)
}
const quiet = byRemark["nothing said"]
const ok = all.share <= MAX_TOP && quiet.share <= MAX_TOP_QUIET
console.log(`\n${ok ? "PASS" : "FAIL"}: the most common first card is ${pct(all.share)} of all (at most ${pct(MAX_TOP)}) and ${pct(quiet.share)} when nothing is said (at most ${pct(MAX_TOP_QUIET)})`)
process.exit(ok ? 0 : 1)
