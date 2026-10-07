// activity.js — what the cashier is doing on the POS, as a stream of events.
//
// usePos.js emits one event per screen action (category opened, item tapped, item
// added, size chosen, item removed, payment opened / cancelled / completed, discount,
// new order). Vavoom Assist subscribes and turns the stream into behaviour estimates
// (behaviour.js) and click-driven upsells (upsellEngine.js). A plain in-memory bus:
// with nobody subscribed (no Assist, e.g. outside a demo) an emit does nothing.
//
// Event shapes (every event also gets `at`, a Date.now() timestamp):
//   { type: "category_view", category }
//   { type: "item_click", item, category }
//   { type: "item_added", item, category, size, price, source }   source: cashier | voice | upsell
//   { type: "item_removed", item, category, size, source }        source: cashier | voice
//   { type: "clear" } · { type: "discount", pct }
//   { type: "payment_open" } · { type: "payment_cancel" } · { type: "payment_complete", total }
//   { type: "new_order" }

const subs = new Set()

export function emitActivity(evt) {
  const e = { ...evt, at: Date.now() }
  for (const fn of subs) {
    try { fn(e) } catch (err) { console.warn("[activity] subscriber failed:", err) }
  }
}

export function onActivity(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}
