// Order changes and auto-picked orders, said many ways (David, 2026-10-08: "test the auto picked
// orders and orders removed from cart if customer says they want something else and want it
// removed (different ways a customer could say this so meaning is key here)").
//
// Run with run-transcripts.mjs:  npm run test:transcripts -- --set edits [--meaning FILE]
// Written before the meaning layer's change_order examples (meaning_bank.json), so the layer is
// not scored on its own examples. Each case starts from the same ticket unless it says otherwise:
// the cashier taps a Regular Cheeseburger, then the customer orders a regular fries and a regular
// drink (rung up from speech). Then the customer says the line, and the ticket is checked.
//   remove   the named item comes off, whether speech or the cashier put it on
//   replace  the named item comes off and the new one goes on, in the old one's size when it has it
//   keep     nothing comes off (the line sounds like a change but is not one)
//   order    an empty ticket; the line alone should ring up exactly these items, and an item that
//            comes in sizes said without one waits for its size instead (listed as waiting)
//   intent   only an intentional order rings anything up (questions, praise, "maybe later" do not)
//   size     an item waiting for its size goes on when the size is said, picked on the size
//            prompt or tapped, and a size-up can follow
//   quantity an item said once is rung up once (repeats, whisper's count, a cashier tap, "also")

const BASE = [
  { at: 0, who: "O", say: "Hi, welcome in! What can I get you?" },
  { at: 3, tap: "Cheeseburger", size: "Regular" },
  { at: 5, who: "C", say: "And a regular fries and a regular drink please" },
]
const START = ["Cheeseburger (Regular)", "Fries (Regular)", "Fountain Drink (Regular)"]
const items = (r) => r.c.ticket.map((l) => l.replace(/^\d+× /, "")).sort()
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

function edit(id, kind, say, expect, extra = {}) {
  const steps = [...(extra.base || BASE), { at: 10, who: "C", say }, { at: 16, pay: true }]
  return {
    id, title: `${kind}: “${say}”`, kind, say,
    steps,
    checks: [[`ticket is ${expect.join(", ") || "empty"}`, (r) => same(items(r), expect)]],
  }
}
const without = (...names) => START.filter((l) => !names.some((n) => l.startsWith(`${n} (`)))

export const TRANSCRIPTS = [
  // ── remove ──
  edit(1, "remove", "Actually, take the fries off", without("Fries")),
  edit(2, "remove", "Can you take off the fries?", without("Fries")),
  edit(3, "remove", "Remove the drink please", without("Fountain Drink")),
  edit(4, "remove", "I don't want the fries anymore", without("Fries")),
  edit(5, "remove", "Never mind the drink", without("Fountain Drink")),
  edit(6, "remove", "Forget the fries", without("Fries")),
  edit(7, "remove", "Scratch the fries", without("Fries")),
  edit(8, "remove", "Cancel the drink", without("Fountain Drink")),
  edit(9, "remove", "No fries actually", without("Fries")),
  edit(10, "remove", "Hold the drink", without("Fountain Drink")),
  edit(11, "remove", "Get rid of the fries", without("Fries")),
  edit(12, "remove", "Skip the drink", without("Fountain Drink")),
  edit(13, "remove", "Lose the fries", without("Fries")),
  edit(14, "remove", "Drop the drink", without("Fountain Drink")),
  edit(15, "remove", "I'll pass on the fries", without("Fries")),
  edit(16, "remove", "On second thought, no drink", without("Fountain Drink")),
  edit(17, "remove", "I changed my mind about the fries", without("Fries")),
  edit(18, "remove", "The fries can go", without("Fries")),
  edit(19, "remove", "I'm good without the drink", without("Fountain Drink")),
  edit(20, "remove", "No need for the fries", without("Fries")),
  edit(21, "remove", "Let's not do the fries", without("Fries")),
  edit(22, "remove", "Just the burger and drink, no fries", without("Fries")),
  edit(23, "remove", "Take out the cheeseburger", without("Cheeseburger")),
  edit(24, "remove", "You know what, I don't need the drink", without("Fountain Drink")),
  edit(25, "remove", "Actually no pickles", ["Cheeseburger (Regular)"], {
    base: [{ at: 0, who: "O", say: "Hi, welcome in! What can I get you?" }, { at: 3, tap: "Cheeseburger", size: "Regular" }, { at: 5, tap: "Pickles" }],
  }),
  // ── replace ──
  edit(26, "replace", "Can I change the fries to cajun fries?", [...without("Fries"), "Cajun Fries (Regular)"]),
  edit(27, "replace", "Swap the fries for a poutine", [...without("Fries"), "Poutine"]),
  edit(28, "replace", "Actually make that a poutine instead of the fries", [...without("Fries"), "Poutine"]),
  edit(29, "replace", "I'd rather have cajun fries than the regular fries", [...without("Fries"), "Cajun Fries (Regular)"]),
  edit(30, "replace", "Instead of the drink, can I get a shake?", [...without("Fountain Drink"), "Hand-Spun Milkshake"]),
  edit(31, "replace", "Change my drink to a water", [...without("Fountain Drink"), "Bottled Water"]),
  edit(32, "replace", "Actually can I get a bacon cheeseburger instead", [...without("Cheeseburger"), "Bacon Cheeseburger (Regular)"]),
  edit(33, "replace", "Switch the cheeseburger to a hamburger", [...without("Cheeseburger"), "Hamburger (Regular)"]),
  edit(34, "replace", "Replace the fries with a poutine", [...without("Fries"), "Poutine"]),
  edit(35, "replace", "Let's do a shake instead of the drink", [...without("Fountain Drink"), "Hand-Spun Milkshake"]),
  // ── keep: sounds like a change, is not one ──
  edit(36, "keep", "Can I also get a shake?", [...START, "Hand-Spun Milkshake"]),
  edit(37, "keep", "The fries are really good here", START),
  edit(38, "keep", "No, that's it", START),
  edit(39, "keep", "No thanks", START),
  edit(40, "keep", "Don't forget my drink", START),
  edit(41, "keep", "I don't want ketchup on the burger", START),
  edit(42, "keep", "Is the drink a large?", START),
  edit(43, "keep", "Without onions please", START),
  edit(44, "keep", "Fries are fine, thanks", START),
  edit(45, "keep", "No, I want the fries", START),
  edit(46, "keep", "Do you have onion rings instead of fries?", START),
  edit(47, "keep", "Make sure the fries are hot", START),
  edit(48, "keep", "Can I get extra napkins with the fries", START),
  edit(49, "keep", "I can't wait for these fries", START),
  edit(50, "keep", "No rush on the drink", START),
]

// ── removals said with no removal words: only the meaning layer (change_order) can read these, so
// they pass only with --meaning (the layer's real answers for these lines from the GPU box) ──
TRANSCRIPTS.push(
  edit(61, "remove (meaning)", "I'm good on the fries actually", without("Fries")),
  edit(62, "remove (meaning)", "Let's leave the drink", without("Fountain Drink")),
  edit(63, "remove (meaning)", "The fries aren't needed", without("Fries")),
  edit(64, "remove (meaning)", "Kill the fries", without("Fries")),
  edit(65, "remove (meaning)", "Fries are a no for me", without("Fries")),
  edit(66, "remove (meaning)", "Take the fries away", without("Fries")),
  edit(67, "remove (meaning)", "You can keep the drink", without("Fountain Drink")),
  edit(68, "remove (meaning)", "I think I'll do without fries today", without("Fries")),
  edit(69, "remove (meaning)", "Ehh, the drink's too much, I'm fine", without("Fountain Drink")),
  edit(70, "remove (meaning)", "We can leave the fries out of it", without("Fries")),
)

// ── auto-picked orders: an empty ticket, one line. An item that comes in sizes, said without one,
// waits for its size (David, 2026-10-08: "Orders should not yet be automatically added to cart when
// voiced until there's a size attached") ──
function order(id, say, expect, waiting = []) {
  return {
    id, title: `order: “${say}”`, kind: "order", say,
    steps: [{ at: 0, who: "O", say: "Hi, welcome in! What can I get you?" }, { at: 4, who: "C", say }, { at: 7, pay: true }],
    checks: [[`ticket is ${expect.join(", ") || "empty"}${waiting.length ? `; waiting for a size: ${waiting.join(", ")}` : ""}`,
      (r) => same(r.c.ticket, expect) && same(r.c.waiting, waiting)]],
  }
}
TRANSCRIPTS.push(
  order(51, "Lemme get a cheeseburger", [], ["Cheeseburger"]),
  order(52, "I'll do two hot dogs", ["2× Hot Dog"]),
  order(53, "Can I grab a little bacon burger", ["1× Bacon Burger (Little)"]),
  order(54, "Gimme a shake and a large fries", ["1× Hand-Spun Milkshake", "1× Fries (Large)"]),
  order(55, "One cheeseburger, one poutine and a water", ["1× Poutine", "1× Bottled Water"], ["Cheeseburger"]),
  order(56, "Could I get the patty melt please", ["1× Patty Melt"]),
  order(57, "A grilled cheese and a pop", ["1× Grilled Cheese"], ["Fountain Drink"]),
  order(58, "I'm gonna get a BLT", ["1× BLT"]),
  order(59, "Two regular cheeseburgers and two cokes", ["2× Cheeseburger (Regular)"], ["Fountain Drink"]),
  order(60, "Just a hamburger with no pickles", [], ["Hamburger"]),
)

// ── intent: an item goes on the ticket only when the customer says they want it (David, 2026-10-08:
// "for an order to be added there has to be a full intentional statement from the customer saying i
// want to buy this item"). Asking whether it is available, asking about it, praising it or musing
// about it later rings nothing up ──
function intent(id, prev, say, expect, extra = []) {
  return {
    id, title: `intent: “${say}”`, kind: "intent", say,
    steps: [{ at: 0, who: "O", say: prev }, { at: 4, who: "C", say }, ...extra, { at: 8, pay: true }],
    checks: [[`ticket is ${expect.join(", ") || "empty"}`, (r) => same(r.c.ticket, expect)]],
  }
}
const HELLO = "Hi, welcome in!"
const WHAT = "Hi, welcome in! What can I get you?"
TRANSCRIPTS.push(
  intent(78, HELLO, "Do you have veggie sandwiches?", []),
  intent(79, HELLO, "Could I come in and get a burger?", []),
  intent(80, HELLO, "Is the poutine good here?", []),
  intent(81, HELLO, "The fries here are amazing", []),
  intent(82, HELLO, "How much is the bacon cheeseburger?", []),
  intent(83, HELLO, "I might get a shake later", []),
  intent(84, HELLO, "Do you have veggie sandwiches?", [], [{ at: 5, whisper: [{ name: "Veggie Sandwich", quantity: 1 }] }]),
  intent(85, HELLO, "I want a regular bacon cheeseburger", ["1× Bacon Cheeseburger (Regular)"]),
  intent(86, HELLO, "A regular cheeseburger please", ["1× Cheeseburger (Regular)"]),
  intent(87, HELLO, "Just a little hamburger", ["1× Hamburger (Little)"]),
  intent(88, WHAT, "A hot dog and a poutine", ["1× Hot Dog", "1× Poutine"]),
  intent(89, HELLO, "I'll take a hot dog. Do you have poutine?", ["1× Hot Dog"]),
  intent(90, WHAT, "I think a hot dog", ["1× Hot Dog"]),
  intent(91, HELLO, "I think a hot dog", []),
  intent(92, HELLO, "Do you have poutine? I'll take one", ["1× Poutine"], [{ at: 5, whisper: [{ name: "Poutine", quantity: 1 }] }]),
)

// ── sizes: an item waiting for its size goes on once the size is known, and a size-up can follow ──
function sized(id, title, steps, expect, extra = []) {
  return {
    id, title: `size: ${title}`, kind: "size", say: "",
    steps: [{ at: 0, who: "O", say: "Hi, welcome in! What can I get you?" }, ...steps, { at: 14, pay: true }],
    checks: [[`ticket is ${expect.join(", ")}`, (r) => same(r.c.ticket, expect) && !r.c.waiting.length], ...extra],
  }
}
TRANSCRIPTS.push(
  sized(93, "the size said after it", [{ at: 4, who: "C", say: "Can I get a cheeseburger" }, { at: 6, who: "C", say: "Regular" }], ["1× Cheeseburger (Regular)"]),
  sized(94, "the cashier's \"little or regular?\" does not pick one", [{ at: 4, who: "C", say: "Can I get a cheeseburger" }, { at: 6, who: "O", say: "Little or regular?" },
    { at: 8, who: "C", say: "Little please" }], ["1× Cheeseburger (Little)"]),
  sized(95, "the cashier taps it with its size", [{ at: 4, who: "C", say: "Can I get a cheeseburger" }, { at: 6, tap: "Cheeseburger", size: "Regular" }], ["1× Cheeseburger (Regular)"]),
  sized(96, "the cashier picks it on the size prompt", [{ at: 4, who: "C", say: "Can I get fries" }, { at: 6, choose: ["Fries", "Large"] }], ["1× Fries (Large)"]),
  sized(97, "two said, the size after", [{ at: 4, who: "C", say: "Two cheeseburgers please" }, { at: 6, who: "C", say: "Regular" }], ["2× Cheeseburger (Regular)"]),
  sized(98, "one sized, one not", [{ at: 4, who: "C", say: "A cheeseburger and a large fries" }, { at: 8, who: "C", say: "Little" }],
    ["1× Cheeseburger (Little)", "1× Fries (Large)"]),
  sized(99, "a size-up follows once the size is in", [{ at: 4, who: "C", say: "Can I get fries" }, { at: 6, who: "C", say: "Regular" }], ["1× Fries (Regular)"],
    [["the next card is the Large Fries size-up", (r) => r.c.cards.some((x) => x.title === "Large Fries" && x.atSec >= 6)]]),
)

// ── quantities: an item said once is rung up once (David, 2026-10-08: "i say an order and it appears
// twice … the system should accurately judge that i was simply requesting for one item") ──
function qty(id, title, steps, expect) {
  return {
    id, title: `quantity: ${title}`, kind: "quantity", say: "",
    steps: [{ at: 0, who: "O", say: "Hi, welcome in! What can I get you?" }, ...steps, { at: 14, pay: true }],
    checks: [[`ticket is ${expect.join(", ")}`, (r) => same(r.c.ticket, expect)]],
  }
}
TRANSCRIPTS.push(
  qty(71, "speech-to-text repeats the item", [{ at: 4, who: "C", say: "Can I get a regular cheeseburger? Cheeseburger." }], ["1× Cheeseburger (Regular)"]),
  qty(72, "whisper counts 2 for one said", [{ at: 4, who: "C", say: "Can I get a regular cheeseburger" }, { at: 5, whisper: [{ name: "Cheeseburger", quantity: 2 }] }], ["1× Cheeseburger (Regular)"]),
  qty(73, "two said, two rung up", [{ at: 4, who: "C", say: "Can I get two regular cheeseburgers" }, { at: 5, whisper: [{ name: "Cheeseburger", quantity: 2 }] }], ["2× Cheeseburger (Regular)"]),
  qty(74, "said, then the cashier taps it", [{ at: 4, who: "C", say: "Can I get a regular cheeseburger" }, { at: 6, tap: "Cheeseburger", size: "Regular" }], ["1× Cheeseburger (Regular)"]),
  qty(75, "\"and also a fries\" repeats the fries", [{ at: 4, who: "C", say: "A regular cheeseburger and a regular fries" }, { at: 7, who: "C", say: "And also a regular fries" }],
    ["1× Cheeseburger (Regular)", "1× Fries (Regular)"]),
  qty(76, "whisper names the same burger differently", [{ at: 4, who: "C", say: "Can I get a regular cheeseburger" }, { at: 5, whisper: [{ name: "Bacon Cheeseburger", quantity: 1 }] }], ["1× Cheeseburger (Regular)"]),
  qty(77, "\"one more\" adds a second", [{ at: 4, who: "C", say: "Can I get a regular cheeseburger" }, { at: 8, who: "C", say: "Actually one more cheeseburger" }], ["2× Cheeseburger (Regular)"]),
)
