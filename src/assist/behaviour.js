// behaviour.js — what the cashier's activity on the POS says about the customer.
//
// At a counter the cashier's screen follows the customer: the category they open is
// the part of the menu the customer is talking about, how long they stay is how settled
// the customer is, what they remove or downsize is price pressure. This module keeps a
// short history of the POS activity stream (activity.js) and estimates which of the
// BEHAVIOURS below are happening right now, each with a confidence between 0 and 1.
//
// The estimates are heuristics with hand-set thresholds, not a trained model: every
// threshold is named in BEHAVIOURS so it can be tuned (or later learned from receipts,
// the way the upsell ranker is). upsellEngine.js turns the estimates into a pitch, and
// docs/BEHAVIOUR-MODEL.md is the same table written out for people.

import { roleOf } from "./menuIndex.js"

export const T = {
  DWELL_BROWSE_MS: 4000,     // on a category this long without adding → browsing
  QUICK_PICK_MS: 4000,       // added within this long of opening a category → knew it
  CONSIDER_MS: 3000,         // left a category after this long with nothing added → considered it
  SWITCH_WINDOW_MS: 20000,   // undecided: this many switches within this window...
  SWITCHES_UNDECIDED: 4,     // ...with nothing added
  REMOVAL_COOLDOWN_MS: 10000,
  LISTENING_IDLE_MS: 10000,  // no screen activity this long while the mic session runs
  HEARD_LOOKUP_MS: 15000,    // the current category holds an item heard this recently
  RECENT_MS: 60000,          // considered / moved-on signals fade after this long
}

/**
 * The behaviour model. key → what triggers it, what it most likely means about the
 * customer, and what Assist does about it. `action` names the upsell move the engine
 * makes (upsellEngine.js reads `key`, the text here is for the screen and the doc).
 */
export const BEHAVIOURS = {
  focused_browse: {
    label: "Browsing {cat}",
    trigger: `Stays on one category ${T.DWELL_BROWSE_MS / 1000}s+ without adding anything`,
    meaning: "The customer is choosing a {role} and hasn't settled on one",
    action: "Suggest the most-ordered item in {cat}",
  },
  quick_pick: {
    label: "Knew what they wanted",
    trigger: `Adds an item within ${T.QUICK_PICK_MS / 1000}s of opening its category`,
    meaning: "A decided order — the customer named it and the cashier rang it straight in",
    action: "Don't offer alternatives in that category; pitch what goes with it",
  },
  moved_on: {
    label: "{cat} settled",
    trigger: "Leaves a category after adding from it",
    meaning: "That part of the meal is done",
    action: "Move the pitch to the next part of the meal",
  },
  considered_not_taken: {
    label: "Looked at {cat}, took nothing",
    trigger: `Spent ${T.CONSIDER_MS / 1000}s+ in a category and left with nothing from it`,
    meaning: "Interest without commitment — often price or 'not right now'",
    action: "Hold that category as the closing upsell",
  },
  undecided: {
    label: "Undecided",
    trigger: `${T.SWITCHES_UNDECIDED}+ category switches in ${T.SWITCH_WINDOW_MS / 1000}s with nothing added`,
    meaning: "The customer is exploring the menu and wants a recommendation",
    action: "Recommend the bestseller instead of an add-on",
  },
  second_round: {
    label: "Second {role}",
    trigger: "Returns to a category whose kind of item is already on the ticket",
    meaning: "Ordering for someone else too, or a bigger appetite",
    action: "Offer to make it two / a sharing-size side",
  },
  value_seeking: {
    label: "Watching the price",
    trigger: "Picks the smallest size where bigger exist, removes an item, or applies a discount",
    meaning: "Price matters to this customer",
    action: "No upsizes; suggest a low-priced add-on",
  },
  going_large: {
    label: "Going large",
    trigger: "Picks the largest of three sizes, or a size called Large",
    meaning: "Not price-led; a big appetite",
    action: "A premium add-on (shake, dessert) is welcome",
  },
  treat_mood: {
    label: "Treat mood",
    trigger: "Opens a treat category (shakes, bakery, sweets)",
    meaning: "The customer is thinking about something sweet",
    action: "Pitch the treat now",
  },
  checkout: {
    label: "Closing the order",
    trigger: "Opens payment",
    meaning: "The order is about to close",
    action: "One last small add-on, then stop",
  },
  second_thoughts: {
    label: "Second thoughts at pay",
    trigger: "Opens payment, then backs out",
    meaning: "Hesitating — about to add or drop something",
    action: "Re-offer the strongest upsell once",
  },
  changed_mind: {
    label: "Changed their mind",
    trigger: `Removed an item in the last ${T.REMOVAL_COOLDOWN_MS / 1000}s`,
    meaning: "The customer is reconsidering",
    action: "Pause suggestions for a moment",
  },
  listening: {
    label: "Cashier listening",
    trigger: `No screen activity for ${T.LISTENING_IDLE_MS / 1000}s while the microphone session runs`,
    meaning: "The order is being spoken, not browsed",
    action: "Let the heard order fill the ticket",
  },
  looking_up_heard_item: {
    label: "Finding what was said",
    trigger: `The open category holds an item heard in the last ${T.HEARD_LOOKUP_MS / 1000}s`,
    meaning: "The cashier is looking for the item the customer just named",
    action: "Add the heard item for them",
  },
}

const TREAT_ROLE = "treat"

export class BehaviourTracker {
  constructor() { this.reset() }

  reset() {
    this.current = null          // { category, since, added }
    this.visits = []             // finished visits: { category, since, leftAt, added }
    this.switches = []           // timestamps of category changes
    this.lastAddAt = 0
    this.lastActivityAt = 0
    this.lastRemoveAt = 0
    this.sizeChoices = []        // { at, smallest, largest }
    this.discount = false
    this.paymentOpenAt = 0
    this.paymentCancelAt = 0
  }

  record(e) {
    this.lastActivityAt = e.at
    switch (e.type) {
      case "category_view": {
        if (this.current && this.current.category === e.category) return
        if (this.current) this.visits.push({ ...this.current, leftAt: e.at })
        this.current = { category: e.category, since: e.at, added: 0 }
        this.switches.push(e.at)
        if (this.visits.length > 40) this.visits.shift()
        if (this.switches.length > 40) this.switches.shift()
        break
      }
      case "item_added": {
        if (e.source && e.source !== "cashier") break // only the cashier's own taps are screen behaviour
        this.lastAddAt = e.at
        if (!this.current || this.current.category !== e.category) {
          if (this.current) this.visits.push({ ...this.current, leftAt: e.at })
          this.current = { category: e.category, since: e.at, added: 0 }
        }
        this.current.added += 1
        this.current.firstAddAt ||= e.at
        const sizes = Object.values(e.item?.sizes || {})
        if (sizes.length > 1) {
          // "Largest" only counts as going large when it is a real step up: the top of
          // three sizes, or a size called Large. The bigger of two (a Regular burger
          // over a Little) is the standard order, not a big appetite.
          const top = e.price >= Math.max(...sizes)
          this.sizeChoices.push({
            at: e.at,
            smallest: e.price <= Math.min(...sizes),
            largest: top && (sizes.length >= 3 || /large/i.test(e.size || "")),
          })
        }
        break
      }
      case "item_removed":
        // Only the cashier's own removals are behaviour; Assist taking off what speech
        // added ("no fries", an item the operator said is out) is not.
        if (!e.source || e.source === "cashier") this.lastRemoveAt = e.at
        break
      case "discount": this.discount = (e.pct || 0) > 0; break
      case "payment_open": this.paymentOpenAt = e.at; break
      case "payment_cancel": this.paymentCancelAt = e.at; this.paymentOpenAt = 0; break
      case "payment_complete":
      case "new_order":
      case "clear":
        this.reset()
        break
      default:
    }
  }

  /**
   * Behaviours active now, most confident first: [{ key, confidence, category, role,
   * label, meaning, action }]. ctx = { cartRoles:Set, cartCategories:Set, sessionActive,
   * recentlyHeard:[{entry, at}] }.
   */
  estimate(now, ctx = {}) {
    const out = []
    const push = (key, confidence, category) => {
      const b = BEHAVIOURS[key]
      const role = category ? roleOf(category) : ""
      const fill = (s) => s.replace("{cat}", category || "").replace("{role}", role || "item")
      out.push({ key, confidence: Math.round(Math.min(0.95, confidence) * 100) / 100, category, role, label: fill(b.label), meaning: fill(b.meaning), action: fill(b.action) })
    }
    const cartRoles = ctx.cartRoles || new Set()
    const cur = this.current

    if (this.paymentOpenAt) push("checkout", 0.9)
    if (this.paymentCancelAt && now - this.paymentCancelAt < 30000) push("second_thoughts", 0.7)
    if (this.lastRemoveAt && now - this.lastRemoveAt < T.REMOVAL_COOLDOWN_MS) push("changed_mind", 0.8)

    if (cur) {
      const dwell = now - cur.since
      if (cur.added === 0 && dwell >= T.DWELL_BROWSE_MS) push("focused_browse", 0.45 + dwell / 20000, cur.category)
      if (cur.added > 0 && cur.firstAddAt - cur.since <= T.QUICK_PICK_MS) push("quick_pick", 0.8, cur.category)
      if (roleOf(cur.category) === TREAT_ROLE) push("treat_mood", 0.6 + Math.min(0.25, dwell / 30000), cur.category)
      if (cur.added === 0 && cartRoles.has(roleOf(cur.category)) && roleOf(cur.category) !== "other") push("second_round", 0.6, cur.category)
      const heard = (ctx.recentlyHeard || []).find((h) => now - h.at < T.HEARD_LOOKUP_MS && h.entry.category === cur.category)
      if (heard) push("looking_up_heard_item", 0.85, cur.category)
    }

    const recentVisits = this.visits.filter((v) => now - v.leftAt < T.RECENT_MS)
    const lastVisit = recentVisits[recentVisits.length - 1]
    if (lastVisit && lastVisit.added > 0) push("moved_on", 0.7, lastVisit.category)
    const considered = recentVisits.filter((v) => v.added === 0 && v.leftAt - v.since >= T.CONSIDER_MS
      && !(ctx.cartCategories || new Set()).has(v.category))
    if (considered.length) {
      const v = considered[considered.length - 1]
      push("considered_not_taken", 0.55 + Math.min(0.25, (v.leftAt - v.since) / 20000), v.category)
    }

    const switches = this.switches.filter((t) => now - t < T.SWITCH_WINDOW_MS)
    if (switches.length >= T.SWITCHES_UNDECIDED && now - this.lastAddAt > T.SWITCH_WINDOW_MS) push("undecided", 0.75)

    const recentSizes = this.sizeChoices.filter((s) => now - s.at < 5 * 60000)
    if (this.discount || recentSizes.some((s) => s.smallest) || (this.lastRemoveAt && now - this.lastRemoveAt < 5 * 60000)) {
      push("value_seeking", this.discount ? 0.8 : 0.6)
    }
    if (recentSizes.some((s) => s.largest && !s.smallest)) push("going_large", 0.65)

    if (ctx.sessionActive && this.lastActivityAt && now - this.lastActivityAt >= T.LISTENING_IDLE_MS) push("listening", 0.6)
    if (ctx.sessionActive && !this.lastActivityAt && ctx.sessionAge >= T.LISTENING_IDLE_MS) push("listening", 0.6)

    return out.sort((a, b) => b.confidence - a.confidence)
  }
}
