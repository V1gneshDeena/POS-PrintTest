// 49 full counter transactions for the In-Store demo POS (burger menu), each with what Vavoom
// Assist should do. run-transcripts.mjs feeds them, line by line and at their timing, through
// the real Assist engine (useAssist.js createEngine + upsellEngine + hot keys + order parser),
// as if each line were a final from whisper, and checks the outcome.
//
// Steps (at = seconds from the start of the transaction):
//   { at, who: "O" | "C", say }     a transcript line (O = operator, C = customer; the engine
//                                   does not know who spoke, exactly as with one counter mic)
//   { at, tap, size? }              the cashier taps a menu item (and a size, if it has several)
//   { at, press: "add" | "no" | "pair" }  the cashier presses Add / No thanks / the pairing's Add
//   { at, presence: true }          counter presence: the customer walks up
//   { at, pay: true }               payment completed (ends the customer session)
//   { at, brain: {...} }            the upsell brain's answer (brain_upsell) to the POS's latest request
//   { at, voice: {...} }            the voice print's answer (voice_match)
//   { at, whisper: [{ name, quantity }] }  whisper's running order (order_update)
//   { at, choose: [name, size] }    the cashier picks a size on the upsell square's size prompt
//   { at, clear: true }             the cashier presses Clear (the ticket empties; the visit ends)
//   { at, section: "Drinks" }       the cashier opens a menu section (category_view)
//   { at, meaning: [{ key, score }] }  the meaning layer's answer to the latest line (allergy keys, hot keys)
//
// checks: [description, (r) => boolean]. `r` is what happened (see run-transcripts.mjs):
//   r.customers[i] = { cards, ticket, fired }, with r.c = r.customers[0] for one-customer runs.
//   fired: the hot keys fired, in order (firedFull: with the phrase each fired on).
//   cards: [{ title, tag, source, reason, outcome, via, back, memory, pitchedSec }] in the order shown;
//   back = brought back by the context window, memory = the remembered titles shown under it,
//   pitchedSec = when the cashier said it. sections: the "Best in <section>" hints shown.
//   ticket: what was on the ticket when it was paid ["2× Cheeseburger (Regular)", ...].
//   waiting: items heard without a size and still waiting for one at payment ["Cheeseburger"].
//   receipt: the visit's record (voice, transcript with roles, upsells with why / said / outcome);
//   roles: whose each line was, as marked for the voice print; brainRequests: how many were sent.
//   reasoning: how it decided (reasoning.js), the steps [{ kind, text }]; reasoningNow: { memory,
//   health, history, plan } as weighed at payment.

const card = (c, title, outcome) => c.cards.find((x) => x.title === title && (!outcome || x.outcome === outcome))
const tagged = (c, tag) => c.cards.find((x) => x.tag === tag)
const has = (c, line) => c.ticket.includes(line)
const fired = (c, key) => c.fired.includes(key)
const none = (c, re) => !c.cards.some((x) => re.test(x.title))

const LAST_TIME = { voice_id: "V1dabbd0c", matched: true, score: 0.915, tier: 0.9, visits: 2,
  last_order: [{ name: "Bacon Cheeseburger", size: "Regular", qty: 1 }, { name: "Cajun Fries", size: "Regular", qty: 1 }] }

export const TRANSCRIPTS = [
  {
    id: 1, title: "Little cheeseburger: upsize accepted, fries declined",
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in! What can I get for you today?" },
      { at: 5, who: "C", say: "Can I get a little cheeseburger please" },
      { at: 10, who: "O", say: "Would you like to make that a regular for a couple bucks more?" },
      { at: 13, who: "C", say: "Yeah sure" },
      { at: 22, who: "C", say: "No thanks, that's it" },
      { at: 30, pay: true },
    ],
    checks: [
      ["the upsize to a Regular is offered first and accepted", (r) => card(r.c, "Regular Cheeseburger", "accepted")],
      ["the ticket has one Regular Cheeseburger, no Little", (r) => has(r.c, "1× Cheeseburger (Regular)") && !r.c.ticket.some((l) => /Little/.test(l))],
      ["fries are offered next and declined", (r) => card(r.c, "Fries", "declined")],
      ["how it decided: when it pitches (no set number), each card explained, the visit added to memory", (r) => /^Pitching follows the conversation, with no set number/.test(r.c.reasoningNow.plan)
        && r.c.reasoning.filter((x) => x.kind === "pick").length >= 2 && r.c.reasoning.some((x) => x.kind === "memory" && /Adding this transaction to memory/.test(x.text))],
      ["\"No thanks, that's it\" ends the upselling: no card after it", (r) => !r.c.cards.some((x) => x.atSec >= 22)],
    ],
  },
  {
    id: 2, title: "Full basket built through upsells: fries yes, drink yes, shake no",
    steps: [
      { at: 0, who: "O", say: "Hey there, what can I get started for you?" },
      { at: 4, who: "C", say: "I'll have a regular bacon cheeseburger" },
      { at: 9, who: "O", say: "Want fries with that?" },
      { at: 11, who: "C", say: "Yes please" },
      { at: 17, who: "O", say: "And a drink?" },
      { at: 19, who: "C", say: "Sure" },
      { at: 26, who: "O", say: "How about a shake to finish it off?" },
      { at: 28, who: "C", say: "No thank you" },
      { at: 35, pay: true },
    ],
    checks: [
      ["Fries accepted", (r) => card(r.c, "Fries", "accepted")],
      ["Fountain Drink accepted", (r) => card(r.c, "Fountain Drink", "accepted")],
      ["shake declined", (r) => card(r.c, "Hand-Spun Milkshake", "declined")],
      ["ticket = burger + fries + drink", (r) => has(r.c, "1× Bacon Cheeseburger (Regular)") && r.c.ticket.some((l) => /× Fries/.test(l)) && r.c.ticket.some((l) => /Fountain Drink/.test(l))],
    ],
  },
  {
    id: 3, title: "Operator says fries are out: closest substitute, accepted",
    steps: [
      { at: 0, who: "O", say: "Welcome! What can I get for you?" },
      { at: 4, who: "C", say: "Can I get a regular hamburger and fries" },
      { at: 9, who: "O", say: "Sorry, we're out of fries right now — want cajun fries instead?" },
      { at: 14, who: "C", say: "Oh okay, sure" },
      { at: 24, who: "C", say: "That's all" },
      { at: 30, pay: true },
    ],
    checks: [
      ["Fries come off the ticket", (r) => !r.c.ticket.some((l) => /× Fries \(/.test(l))],
      ["the closest substitute is offered, tagged Closest substitute, and accepted", (r) => { const x = tagged(r.c, "Closest substitute"); return x && x.outcome === "accepted" }],
      ["the out-of-stock hot key fired", (r) => fired(r.c, "out_of_stock")],
      ["only fries are marked out (the cajun fries offered in the same line are not)", (r) => r.c.ticket.some((l) => /Cajun Fries/.test(l))],
    ],
  },
  {
    id: 4, title: "Out of stock stays out: the next customer orders fries",
    steps: [
      { at: 0, who: "O", say: "Hi, what can I get you?" },
      { at: 4, who: "C", say: "Just a regular cheeseburger" },
      { at: 8, who: "O", say: "Heads up, we just ran out of fries" },
      { at: 12, who: "C", say: "No problem, that's it" },
      { at: 18, pay: true },
      { at: 40, who: "O", say: "Hello, welcome in!" },
      { at: 44, who: "C", say: "Can I get a bacon burger and a large fries" },
      { at: 52, who: "C", say: "No that's fine" },
      { at: 58, pay: true },
    ],
    checks: [
      ["customer 2: fries are not rung up", (r) => !r.customers[1].ticket.some((l) => /× Fries \(/.test(l))],
      ["customer 2: the closest substitute pops up, tagged", (r) => !!tagged(r.customers[1], "Closest substitute")],
      ["customer 2: 'Ordered an item that's out' recorded", (r) => fired(r.customers[1], "ordered_out")],
    ],
  },
  {
    id: 5, title: "Cashier taps an out-of-stock item: substitute, Add swaps it in",
    setup: { outToday: ["Fries"] },
    steps: [
      { at: 0, presence: true },
      { at: 2, who: "O", say: "Hi there, what can I get you?" },
      { at: 6, who: "C", say: "A hot dog please" },
      { at: 9, tap: "Fries", size: "Regular" },
      { at: 12, press: "add" },
      { at: 20, who: "C", say: "That's everything" },
      { at: 26, pay: true },
    ],
    checks: [
      ["the substitute is offered after the tap", (r) => !!tagged(r.c, "Closest substitute")],
      ["Add swapped it in: no Fries, substitute on the ticket", (r) => { const x = tagged(r.c, "Closest substitute"); return x && !r.c.ticket.some((l) => /× Fries \(/.test(l)) && r.c.ticket.some((l) => l.includes(x.title)) }],
    ],
  },
  {
    id: 6, title: "\"Do you have onion rings?\": not on the menu, closest substitute",
    steps: [
      { at: 0, who: "O", say: "Welcome, what can I get for you today?" },
      { at: 4, who: "C", say: "Do you have onion rings?" },
      { at: 8, who: "O", say: "We don't, sorry" },
      { at: 11, who: "C", say: "Hmm okay, then a regular cheeseburger" },
      { at: 20, who: "C", say: "No thanks" },
      { at: 30, pay: true },
    ],
    checks: [
      ["a Closest substitute card for onion rings (a side) is shown", (r) => r.c.cards.some((x) => x.tag === "Closest substitute" && /onion rings/i.test(x.reason))],
      ["the cheeseburger is rung up", (r) => has(r.c, "1× Cheeseburger (Regular)")],
      ["\"Hmm okay\" (to \"We don't\") does not take the substitute", (r) => r.c.ticket.length === 1],
    ],
  },
  {
    id: 7, title: "\"Do you guys have cajun fries?\": pitched with a complementary item, pairing added",
    steps: [
      { at: 0, who: "O", say: "Hi, what can I get you?" },
      { at: 4, who: "C", say: "Can I get a regular bacon burger" },
      { at: 9, who: "C", say: "Oh and do you guys have cajun fries?" },
      { at: 13, who: "O", say: "We do!" },
      { at: 15, press: "add" },
      { at: 16, press: "pair" },
      { at: 24, who: "C", say: "That's it" },
      { at: 30, pay: true },
    ],
    checks: [
      ["Cajun Fries pitched, tagged You asked about it", (r) => { const x = card(r.c, "Cajun Fries"); return x && x.tag === "You asked about it" }],
      ["the complementary item is shown under it", (r) => card(r.c, "Cajun Fries")?.pair],
      ["both are on the ticket", (r) => r.c.ticket.some((l) => /Cajun Fries/.test(l)) && r.c.ticket.length >= 3],
    ],
  },
  {
    id: 8, title: "\"Too sweet\": a counter to it",
    steps: [
      { at: 0, who: "O", say: "Welcome in, what are we having?" },
      { at: 4, who: "C", say: "A cheese dog please" },
      { at: 8, who: "C", say: "Last time the shake was way too sweet for me" },
      { at: 18, who: "C", say: "Nah I'm good" },
      { at: 26, pay: true },
    ],
    checks: [
      ["a Counter: too sweet card is shown", (r) => !!tagged(r.c, "Counter: too sweet")],
      ["it is not the shake", (r) => !/shake/i.test(tagged(r.c, "Counter: too sweet")?.title || "shake")],
      ["the shake complained about is not rung up", (r) => !r.c.ticket.some((l) => /Shake/.test(l))],
    ],
  },
  {
    id: 9, title: "\"Too bitter\": something sweet to counter it",
    steps: [
      { at: 0, who: "O", say: "Hi! What can I get for you?" },
      { at: 4, who: "C", say: "A regular hamburger and a fountain drink" },
      { at: 9, who: "C", say: "The iced tea in the machine was way too bitter last time though" },
      { at: 15, who: "C", say: "Sure, why not" },
      { at: 24, who: "C", say: "That's everything" },
      { at: 30, pay: true },
    ],
    checks: [
      ["a Counter: too bitter card is shown and accepted", (r) => tagged(r.c, "Counter: too bitter")?.outcome === "accepted"],
      ["it is something sweet (the shake)", (r) => /shake/i.test(tagged(r.c, "Counter: too bitter")?.title || "")],
    ],
  },
  {
    id: 10, title: "\"I don't like the cajun fries\": an alternative",
    steps: [
      { at: 0, who: "O", say: "Hey, welcome, what can I get you?" },
      { at: 4, who: "C", say: "Regular cheeseburger please" },
      { at: 9, who: "C", say: "I don't like the cajun fries, they're too spicy for me" },
      { at: 14, who: "C", say: "Yeah okay" },
      { at: 22, who: "C", say: "That'll be it" },
      { at: 28, pay: true },
    ],
    checks: [
      ["an Alternative card from the fries is shown", (r) => { const x = tagged(r.c, "Alternative"); return x && /fries/i.test(x.title) && x.title !== "Cajun Fries" }],
      ["cajun fries are never rung up", (r) => !r.c.ticket.some((l) => /Cajun/.test(l))],
      ["\"That'll be it\" declines the card on screen", (r) => card(r.c, "Fountain Drink", "declined")],
    ],
  },
  {
    id: 11, title: "\"That took forever\": no souvenir on this menu, basket carries on",
    steps: [
      { at: 0, who: "O", say: "Sorry about the wait, what can I get you?" },
      { at: 4, who: "C", say: "Honestly that took forever. A regular bacon cheeseburger" },
      { at: 14, who: "C", say: "No thanks" },
      { at: 22, who: "C", say: "That's it" },
      { at: 28, pay: true },
    ],
    checks: [
      ["the slow-service hot key fired", (r) => fired(r.c, "slow_service")],
      ["no Complimentary card (the burger menu has no merchandise)", (r) => !tagged(r.c, "Complimentary")],
      ["a basket card is still offered", (r) => r.c.cards.length > 0],
    ],
  },
  {
    id: 12, title: "Order complaint: upsells pause, the order still goes in",
    steps: [
      { at: 0, who: "O", say: "Hi, what can I get you?" },
      { at: 4, who: "C", say: "You guys got my order wrong yesterday, I was missing my fries" },
      { at: 9, who: "O", say: "I'm really sorry about that" },
      { at: 13, who: "C", say: "Anyway, just a regular cheeseburger" },
      { at: 40, who: "C", say: "That's all" },
      { at: 46, pay: true },
    ],
    checks: [
      ["the complaint hot key fired", (r) => fired(r.c, "complaint")],
      ["the order is rung up", (r) => has(r.c, "1× Cheeseburger (Regular)")],
      ["the fries complained about are not rung up", (r) => !r.c.ticket.some((l) => /Fries/.test(l))],
      ["no upsell card in the minute after the complaint", (r) => r.c.cards.every((x) => x.atSec >= 64)],
    ],
  },
  {
    id: 13, title: "Undecided, then the rewards-app question (must not fire)",
    steps: [
      { at: 0, who: "O", say: "Welcome! What can I get for you?" },
      { at: 4, who: "C", say: "Um, I'm not sure, what's good here?" },
      { at: 8, who: "O", say: "The bacon cheeseburger is our most popular" },
      { at: 11, who: "C", say: "Okay I'll take that, a regular" },
      { at: 20, who: "O", say: "Do you have the rewards app with us?" },
      { at: 23, who: "C", say: "No I don't" },
      { at: 30, who: "C", say: "That's it" },
      { at: 36, pay: true },
    ],
    checks: [
      ["the undecided customer gets the bestseller", (r) => card(r.c, "Bacon Cheeseburger")],
      ["the cashier's recommendation is not rung up by itself; \"I'll take that\" accepts the card", (r) => card(r.c, "Bacon Cheeseburger", "accepted")?.via === "spoken yes"],
      ["the rewards question is not an availability question", (r) => !fired(r.c, "availability_question")],
      ["the Bacon Cheeseburger is on the ticket once", (r) => has(r.c, "1× Bacon Cheeseburger (Regular)")],
      ["\"No I don't\" (to the rewards question) does not decline the card on screen", (r) => !r.c.cards.some((x) => x.endSec === 23)],
    ],
  },
  {
    id: 14, title: "Not patient: orders 1.5 s after walking up",
    steps: [
      { at: 0, presence: true },
      { at: 1.5, who: "C", say: "Little hamburger and a water please" },
      { at: 10, who: "C", say: "Nope" },
      { at: 18, pay: true },
    ],
    checks: [
      ["Not patient fired", (r) => fired(r.c, "impatient")],
      ["a quick size-up is still offered first (upsize most of the time), and the no is taken", (r) => r.c.cards[0]?.source === "upsize" && r.c.cards[0]?.outcome === "declined"],
    ],
  },
  {
    id: 15, title: "Ordering for someone else: \"my son wants the same thing\"",
    steps: [
      { at: 0, who: "O", say: "Hi there, what can I get you?" },
      { at: 4, who: "C", say: "A regular cheeseburger, and my son wants the same thing" },
      { at: 9, who: "C", say: "Yes" },
      { at: 18, who: "C", say: "No that's it thanks" },
      { at: 24, pay: true },
    ],
    checks: [
      ["Another Cheeseburger is offered and accepted", (r) => card(r.c, "Another Cheeseburger", "accepted")],
      ["two cheeseburgers on the ticket", (r) => has(r.c, "2× Cheeseburger (Regular)")],
    ],
  },
  {
    id: 16, title: "Dairy-free: no cheese or shake pitches",
    steps: [
      { at: 0, who: "O", say: "Welcome, what can I get you?" },
      { at: 4, who: "C", say: "I'm lactose intolerant, so a regular hamburger with no cheese" },
      { at: 12, who: "C", say: "No" },
      { at: 20, who: "C", say: "No thanks" },
      { at: 28, who: "C", say: "That's all" },
      { at: 34, pay: true },
    ],
    checks: [
      ["dairy-free fired", (r) => fired(r.c, "dairy_free")],
      ["nothing with cheese or milk is pitched", (r) => none(r.c, /cheese|shake|milk/i)],
    ],
  },
  {
    id: 17, title: "Drink only: no food pitches",
    steps: [
      { at: 0, who: "O", say: "Hi, what can I get for you?" },
      { at: 4, who: "C", say: "Just a drink today, a large fountain drink" },
      { at: 10, who: "O", say: "Is that everything?" },
      { at: 12, who: "C", say: "Yes" },
      { at: 18, pay: true },
    ],
    checks: [
      ["drink-only fired", (r) => fired(r.c, "no_food")],
      ["no food card", (r) => none(r.c, /burger|fries|dog|sandwich|melt|egg|blt|grilled/i)],
      ["\"Is that everything?\" \"Yes\" does not accept the card on screen", (r) => !r.c.cards.some((x) => x.outcome === "accepted") && r.c.ticket.length === 1],
    ],
  },
  {
    id: 18, title: "In a hurry: the size-up is still offered first",
    steps: [
      { at: 0, who: "O", say: "Hey, welcome in" },
      { at: 3, who: "C", say: "I'm in a rush, just a little hamburger" },
      { at: 10, who: "C", say: "No" },
      { at: 16, pay: true },
    ],
    checks: [
      ["the hurry hot key fired", (r) => fired(r.c, "time_pressure")],
      ["the size-up is offered first even in a hurry (upsize most of the time)", (r) => r.c.cards[0]?.source === "upsize"],
    ],
  },
  {
    id: 19, title: "Hot out, wants something cold",
    steps: [
      { at: 0, who: "O", say: "Hi, welcome, what can I get you?" },
      { at: 4, who: "C", say: "A regular patty melt please" },
      { at: 8, who: "C", say: "It's so hot out today, I need something cold" },
      { at: 12, who: "C", say: "Yeah that sounds good" },
      { at: 22, who: "C", say: "That's it" },
      { at: 28, pay: true },
    ],
    checks: [
      ["a Something cold card is shown and accepted", (r) => tagged(r.c, "Something cold")?.outcome === "accepted"],
      ["how it decided: the hot words are explained with what they mean, and the meal's calories are weighed", (r) => r.c.reasoning.some((x) => x.kind === "hotkey" && /which means the customer feels hot/i.test(x.text))
        && /Looked at calories and ingredients: .*Patty Melt/.test(r.c.reasoningNow.health)],
      ["the hot-weather / wants-cold hot keys fired", (r) => fired(r.c, "weather_hot") && fired(r.c, "want_cold")],
    ],
  },
  {
    id: 20, title: "Freezing and raining: something warm",
    steps: [
      { at: 0, who: "O", say: "Hi there, what can I get for you?" },
      { at: 4, who: "C", say: "I'm freezing, it's raining out. Can I get a bacon dog" },
      { at: 9, who: "C", say: "Sure" },
      { at: 18, who: "C", say: "That's it" },
      { at: 24, pay: true },
    ],
    checks: [
      ["a Something warm card is shown and accepted", (r) => tagged(r.c, "Something warm")?.outcome === "accepted"],
      ["it is not a cold item", (r) => !/shake|drink|water/i.test(tagged(r.c, "Something warm")?.title || "shake")],
    ],
  },
  {
    id: 21, title: "Returning voice: the brain offers last visit's side",
    steps: [
      { at: 0, who: "O", say: "Hi, welcome back! What can I get you?" },
      { at: 4, who: "C", say: "Can I get a regular bacon cheeseburger" },
      { at: 6, voice: LAST_TIME },
      { at: 7, brain: { name: "Cajun Fries", item: "Cajun Fries", kind: "add", size: "Regular", price: 7.74, tag: "Last time",
        step: "side", framing: "Same Cajun Fries as last time?", reason: "Returning voice — ladder step: side" } },
      { at: 10, who: "O", say: "Same Cajun Fries as last time?" },
      { at: 12, who: "C", say: "Yes please" },
      { at: 20, who: "C", say: "That's it" },
      { at: 26, pay: true },
    ],
    checks: [
      ["the brain's card is shown tagged Last time and accepted", (r) => tagged(r.c, "Last time")?.outcome === "accepted" && tagged(r.c, "Last time")?.source === "brain"],
      ["Cajun Fries are on the ticket", (r) => r.c.ticket.some((l) => /Cajun Fries/.test(l))],
      ["the receipt carries the voice print", (r) => r.c.receipt.voice?.voice_id === "V1dabbd0c" && r.c.receipt.voice.matched],
      ["how it decided: the customer was remembered and their last order looked at", (r) => r.c.reasoning.some((x) => x.kind === "voice" && /Customer remembered/.test(x.text) && /Bacon Cheeseburger/.test(x.text))
        && /Previous orders: Bacon Cheeseburger/.test(r.c.reasoningNow.history)],
      ["the brain was asked after the lines", (r) => r.c.brainRequests >= 2],
    ],
  },
  {
    id: 22, title: "Allergic to milk: the brain offers the lettuce wrap",
    steps: [
      { at: 0, who: "O", say: "Hi there, what can I get you?" },
      { at: 4, who: "C", say: "A regular hamburger please. I'm allergic to milk" },
      { at: 6, brain: { name: "Lettuce Wrap (no bun)", item: "Lettuce Wrap (no bun)", kind: "add", size: "each", price: 0, tag: "Allergy: no milk",
        step: "allergy", framing: "I can make the Hamburger a lettuce wrap — no bun. Want that?", reason: "ladder step: allergy" } },
      { at: 9, who: "C", say: "Yes, do that" },
      { at: 18, who: "C", say: "That's all" },
      { at: 24, pay: true },
    ],
    checks: [
      ["the allergy card outranks everything and is accepted", (r) => tagged(r.c, "Allergy: no milk")?.outcome === "accepted"],
      ["the lettuce wrap is on the ticket", (r) => r.c.ticket.some((l) => /Lettuce Wrap/.test(l))],
    ],
  },
  {
    id: 23, title: "Topping done right: the brain's cheese upgrade swaps the burger",
    steps: [
      { at: 0, who: "O", say: "Welcome! What can I get for you?" },
      { at: 4, who: "C", say: "A regular hamburger" },
      { at: 6, brain: { name: "Cheeseburger", item: "Cheeseburger", kind: "upgrade", from: "Hamburger", size: "Regular", price: 16.10, delta: 2.46,
        tag: "Topping", step: "topping", framing: "Make it a Cheeseburger for $2.46 more?", reason: "ladder step: topping" } },
      { at: 9, press: "add" },
      { at: 18, who: "C", say: "That's it" },
      { at: 24, pay: true },
    ],
    checks: [
      ["the swap card is shown tagged Topping", (r) => !!tagged(r.c, "Topping")],
      ["the ticket has the Cheeseburger instead of the Hamburger", (r) => has(r.c, "1× Cheeseburger (Regular)") && !r.c.ticket.some((l) => /Hamburger/.test(l))],
    ],
  },
  {
    id: 24, title: "The receipt record: who said what, and every upsell with why and its outcome",
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in, what can I get you?" },
      { at: 4, who: "C", say: "Can I get a little cheeseburger" },
      { at: 9, who: "O", say: "Would you like to make that a regular?" },
      { at: 12, who: "C", say: "No thanks" },
      { at: 16, who: "O", say: "Want fries with that?" },
      { at: 19, who: "C", say: "Sure" },
      { at: 26, who: "C", say: "That's all" },
      { at: 32, pay: true },
    ],
    checks: [
      ["customer and employee lines are told apart", (r) => r.c.receipt.transcript.some((l) => l.role === "customer") && r.c.receipt.transcript.some((l) => l.role === "operator")],
      ["the declined upsize is on the record, said by the employee", (r) => r.c.receipt.upsells.some((u) => /Regular Cheeseburger/.test(u.title) && u.outcome === "declined" && u.pitched_by_employee)],
      ["the accepted fries are on the record with why", (r) => r.c.receipt.upsells.some((u) => u.title === "Fries" && u.outcome === "accepted" && u.why)],
      ["only customer lines were sent for the voice print as the customer's", (r) => r.c.roles.filter((x) => x === "customer").length >= 3],
    ],
  },
  {
    id: 25, title: "An allergy answer replaces a hot-key card already on screen",
    setup: { outToday: ["Fries"] },
    steps: [
      { at: 0, who: "O", say: "Hi, what can I get you?" },
      { at: 4, who: "C", say: "A regular cheeseburger and fries please" },
      { at: 8, who: "C", say: "Oh wait, I'm allergic to milk" },
      { at: 9, brain: { name: "Lettuce Wrap (no bun)", item: "Lettuce Wrap (no bun)", kind: "add", size: "each", price: 0, tag: "Allergy: no milk",
        step: "allergy", framing: "I can make the Cheeseburger a lettuce wrap — no bun. Want that?", reason: "ladder step: allergy" } },
      { at: 20, pay: true },
    ],
    checks: [
      ["the out-of-stock substitute was on screen first", (r) => !!tagged(r.c, "Closest substitute")],
      ["the allergy card replaced it", (r) => tagged(r.c, "Closest substitute")?.outcome === "replaced" && !!tagged(r.c, "Allergy: no milk")],
    ],
  },
  {
    id: 29, title: "Ordering a Veggie Sandwich completes the basket, not another food item",
    // David, 2026-10-08 (live): "ordered a veggie sandwich and it offered me another food item instead
    // of drink … it should be looking at the basket and trying to complete whatever's in the cart".
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in! What can I get you?" },
      { at: 4, who: "C", say: "Can I get a veggie sandwich" },
      { at: 12, pay: true },
    ],
    checks: [
      ["\"sandwich\" in the order does not fire Wants food", (r) => !fired(r.c, "food_intent")],
      ["the first card completes the basket (a side, a drink or a size-up), not another main", (r) => r.c.cards[0] && !/sandwich|burger|dog|melt|grilled cheese|blt/i.test(r.c.cards[0].title)],
    ],
  },
  // ── Tapped orders drive the cards the same way spoken ones do (David, 2026-10-08 live: "it's also not
  // suggesting based on clicked order as well, only voiced orders") ──
  {
    id: 30, title: "Tap only, nothing said: the tap opens the visit and a card follows",
    steps: [
      { at: 2, tap: "Cheeseburger", size: "Regular" },
      { at: 20, pay: true },
    ],
    checks: [
      ["a card is shown within a second of the tap", (r) => r.c.cards[0] && r.c.cards[0].atSec <= 3],
      ["the brain is asked about the tapped order", (r) => r.c.brainRequests >= 1],
    ],
  },
  {
    id: 31, title: "Greeting, then the cashier taps the order: a card follows the tap",
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in! What can I get you?" },
      { at: 6, tap: "Bacon Cheeseburger", size: "Regular" },
      { at: 9, tap: "Cajun Fries", size: "Regular" },
      { at: 30, pay: true },
    ],
    checks: [
      ["a card is shown within a second of the first tap", (r) => r.c.cards[0] && r.c.cards[0].atSec >= 6 && r.c.cards[0].atSec <= 7],
      ["tapping another side (Cajun Fries) takes the Fries card down at once, not after 25 s of silence", (r) => r.c.cards[0]?.title === "Fries" && ["replaced", "taken down"].includes(r.c.cards[0].outcome) && r.c.cards.some((x) => x.atSec >= 9 && x.atSec <= 10)],
    ],
  },
  {
    id: 32, title: "Clear starts a new visit: what was declined before no longer blocks the new order",
    steps: [
      { at: 2, tap: "Cheeseburger", size: "Regular" },
      { at: 4, press: "no" },
      { at: 8, clear: true },
      { at: 10, tap: "Hamburger", size: "Regular" },
      { at: 20, pay: true },
    ],
    checks: [
      ["Fries is offered again for the new order", (r) => r.c.cards.some((x) => x.title === "Fries" && x.atSec >= 10)],
    ],
  },
  {
    id: 41, title: "Allergic with no substitute: the square says so, and Got it notes it (not a decline)",
    // David, 2026-10-08: "If a customer says he is allergic to a specific item but there are no substitutes
    // … say you don't have a substitute on the modal".
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in! What can I get you?" },
      { at: 4, who: "C", say: "A milkshake please, but I'm allergic to dairy" },
      { at: 6, brain: { name: "Hand-Spun Milkshake", item: "No substitute for the Hand-Spun Milkshake", kind: "notice", size: "each", price: 0,
        tag: "Allergy: no substitute", framing: "Sorry, we don't have a Hand-Spun Milkshake without milk, and nothing like it that's safe for you." } },
      { at: 9, press: "no" },
      { at: 20, pay: true },
    ],
    checks: [
      ["the notice is on the square", (r) => tagged(r.c, "Allergy: no substitute")?.title === "No substitute for the Hand-Spun Milkshake"],
      ["Got it notes it, it is not declined", (r) => tagged(r.c, "Allergy: no substitute")?.outcome === "noted"],
      ["the milkshake stays on the ticket (the cashier decides)", (r) => r.c.ticket.some((l) => /Milkshake/.test(l))],
    ],
  },
  // ── A long demo visit (David, 2026-10-08: "there will be times i will be explaining the features so the
  // transaction will be longer. it should.") ──
  {
    id: 42, title: "A 5-minute demo visit with explanations: nothing explained is read, and the visit keeps working",
    setup: { cardMode: "hold" },
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in! What can I get you?" },
      { at: 3, who: "C", say: "Can I get a regular cheeseburger please" },
      { at: 10, who: "O", say: "So what you're seeing here is the upsell engine reading the conversation." },
      { at: 40, who: "O", say: "If a customer says it's so hot out today, it suggests something cold." },
      { at: 90, who: "O", say: "For example, when someone says can I get a large fries, it waits for the order." },
      { at: 120, who: "O", say: "As you can see, the card waits until the cashier says it." },
      { at: 150, who: "C", say: "It's so hot out today" },
      { at: 290, pitch: true },
      { at: 292, who: "C", say: "No thanks" },
      { at: 310, pay: true },
    ],
    checks: [
      ["the explained \"large fries\" was not rung up", (r) => r.c.ticket.length === 1 && has(r.c, "1× Cheeseburger (Regular)")],
      ["the explained \"it's so hot out today\" fired nothing; the customer's own line fired it once", (r) => r.c.fired.filter((k) => k === "weather_hot").length === 1],
      ["the card was held for almost five minutes and then declined", (r) => r.c.cards[0]?.title === "Fries" && r.c.cards[0].outcome === "declined" && r.c.cards[0].endSec >= 292],
      ["the hot word from 2½ minutes earlier still brings something cold after the answer", (r) => tagged(r.c, "Something cold")?.atSec >= 292],
      ["explanations are not the customer's voice", (r) => r.c.roles.filter((x) => x === "customer").length <= 3],
    ],
  },
  {
    id: 43, title: "The brain's answer arrives after the customer said more: it is still used (the ticket did not change)",
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in! What can I get you?" },
      { at: 4, who: "C", say: "A regular cheeseburger please" },
      { at: 4.6, who: "C", say: "Oh and how has your day been?" },
      { at: 5.2, brain: { name: "Bacon Cheeseburger", item: "Bacon Cheeseburger", kind: "upgrade", from: "Cheeseburger", size: "Regular", price: 17.21,
        framing: "Make it a Bacon Cheeseburger for $1.11 more?", reason: "topping upgrade" }, answer: 2 }, // 1 = the greeting's, 2 = the order's
      { at: 12, pay: true },
    ],
    checks: [
      ["the answer to the first request shows at once, though a newer request was out", (r) => r.c.cards.some((x) => x.source === "brain" && x.atSec <= 5.3)],
    ],
  },
  {
    id: 44, title: "On new trigger: the card a hot word replaced comes back after four minutes",
    setup: { cardMode: "trigger" },
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in!" },
      { at: 4, who: "C", say: "A regular cheeseburger please" },
      { at: 8, who: "C", say: "It's so hot out today" },
      { at: 250, press: "no" },
      { at: 262, pay: true },
    ],
    checks: [
      ["Fries comes back four minutes later", (r) => r.c.cards.some((x) => x.title === "Fries" && x.back && x.atSec >= 250)],
    ],
  },
  {
    id: 45, title: "Allergic to milk, with only the POS's own reading: no milkshake, no cheese, no milk size-up",
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in! What can I get you?" },
      { at: 4, who: "C", say: "A little hamburger and a regular fries please" },
      { at: 6, who: "C", say: "I'm allergic to milk" },
      { at: 8, press: "no" },
      { at: 10, press: "no" },
      { at: 30, pay: true },
    ],
    checks: [
      ["no card after the allergy holds milk", (r) => r.c.cards.filter((x) => x.atSec >= 6).every((x) => !/Milkshake|Cheese|Hamburger/.test(x.entry))],
    ],
  },
  {
    id: 48, title: "A hot word stays usable for 10 minutes behind a held card, and no longer",
    setup: { cardMode: "hold" },
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in!" },
      { at: 4, who: "C", say: "A regular cheeseburger please" },
      { at: 8, who: "C", say: "It's so hot out today" },
      { at: 670, pitch: true },
      { at: 672, who: "C", say: "No thanks" },
      { at: 690, pay: true },
    ],
    checks: [
      ["the held card is answered after eleven minutes", (r) => r.c.cards[0]?.title === "Fries" && r.c.cards[0].outcome === "declined"],
      ["the eleven-minute-old hot word brings no Something cold", (r) => !tagged(r.c, "Something cold")],
    ],
  },
  {
    id: 49, title: "A hot word seven minutes old still brings its card after a held card",
    setup: { cardMode: "hold" },
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in!" },
      { at: 4, who: "C", say: "A regular cheeseburger please" },
      { at: 8, who: "C", say: "It's so hot out today" },
      { at: 430, pitch: true },
      { at: 432, who: "C", say: "No thanks" },
      { at: 450, pay: true },
    ],
    checks: [
      ["Something cold follows the answer", (r) => tagged(r.c, "Something cold")?.atSec >= 432],
    ],
  },
  {
    id: 46, title: "An allergy said in other words, read by the meaning layer: no card holds it, and the brain is told",
    // David, 2026-10-08: "correct the allergen meaning layer to not miss these" (milk in burger buns, sesame, gluten, spice).
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in! What can I get you?" },
      { at: 4, who: "C", say: "A regular hot dog and a regular fries please" },
      { at: 6, who: "C", say: "Gluten and I really do not get along" },
      { at: 6.1, meaning: [{ key: "allergy_wheat", score: 0.88 }] },
      { at: 9, press: "no" },
      { at: 12, press: "no" },
      { at: 20, pay: true },
    ],
    checks: [
      ["no card after it holds wheat (buns, hot dogs, burgers)", (r) => r.c.cards.filter((x) => x.atSec >= 6.1).every((x) => !/Burger|Dog|Melt|Grilled|BLT|Sandwich/.test(x.entry))],
      ["the brain's next request carries the wheat allergy", (r) => r.c.brainAllergens.includes("wheat")],
    ],
  },
  {
    id: 47, title: "Dairy-free by meaning counts as milk: no bigger burger (the bun has milk), no shake",
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in! What can I get you?" },
      { at: 4, who: "C", say: "A little cheeseburger please" },
      { at: 6, who: "C", say: "Dairy and me are not friends" },
      { at: 6.1, meaning: [{ key: "dairy_free", score: 0.9 }] },
      { at: 9, press: "no" },
      { at: 12, press: "no" },
      { at: 20, pay: true },
    ],
    checks: [
      ["no card after it holds milk", (r) => r.c.cards.filter((x) => x.atSec >= 6.1).every((x) => !/Burger|Cheese|Milkshake|Dog|Melt/.test(x.entry))],
      ["the brain is told about milk", (r) => r.c.brainAllergens.includes("milk")],
    ],
  },
  // ── When the card changes: the operator's setting (useAssist.js CARD_MODES) ──
  // Each setting proved to change the engine's behaviour, not only the menu (David, 2026-10-08: "ensure
  // the model actually follows it and it is not for show"), and the context window: a card a hot word
  // replaced comes back once the new one is answered (David: "it remembers the original upsell").
  {
    id: 33, title: "Dynamic: a hot word replaces the card, and the original comes back after it is answered",
    setup: { cardMode: "dynamic" },
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in!" },
      { at: 4, who: "C", say: "A regular cheeseburger please" },
      { at: 8, who: "C", say: "It's so hot out today" },
      { at: 12, press: "no" },
      { at: 24, pay: true },
    ],
    checks: [
      ["Fries is up first, then the hot word's card replaces it", (r) => r.c.cards[0]?.title === "Fries" && tagged(r.c, "Something cold")?.atSec >= 8],
      ["the hot word's card shows Fries as remembered", (r) => (tagged(r.c, "Something cold")?.memory || []).includes("Fries")],
      ["after the no, Fries comes back", (r) => r.c.cards.some((x) => x.title === "Fries" && x.back && x.atSec >= 12)],
    ],
  },
  {
    id: 34, title: "On new trigger: the same, and no 25 s silence timeout in between",
    setup: { cardMode: "trigger" },
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in!" },
      { at: 4, who: "C", say: "A regular cheeseburger please" },
      { at: 8, who: "C", say: "It's so hot out today" },
      { at: 50, press: "no" },
      { at: 60, pay: true },
    ],
    checks: [
      ["the hot word's card stays through 40 s of silence", (r) => tagged(r.c, "Something cold")?.outcome === "declined" && tagged(r.c, "Something cold")?.endSec >= 50],
      ["after the no, Fries comes back", (r) => r.c.cards.some((x) => x.title === "Fries" && x.back && x.atSec >= 50)],
    ],
  },
  {
    id: 35, title: "Until accepted or declined: hot words and taps wait, the card asks to be voiced until it is said",
    setup: { cardMode: "hold" },
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in!" },
      { at: 4, who: "C", say: "A regular cheeseburger please" },
      { at: 8, who: "C", say: "It's so hot out today" },
      { at: 10, section: "Shakes" },
      { at: 40, who: "O", say: "Do you want fries with that?" },
      { at: 42, who: "C", say: "No thanks" },
      { at: 50, pay: true },
    ],
    checks: [
      ["Fries stays up through the hot word and 36 s of silence, then is declined", (r) => r.c.cards[0]?.title === "Fries" && r.c.cards[0].outcome === "declined" && r.c.cards[0].endSec >= 42],
      ["it counted as said only when the cashier said it", (r) => r.c.cards[0]?.pitchedSec >= 40],
      ["nothing was remembered (nothing was replaced)", (r) => !r.c.cards.some((x) => x.back || (x.memory || []).length)],
    ],
  },
  {
    id: 36, title: "Dynamic: the brain's card replaced by a hot word comes back after it",
    setup: { cardMode: "dynamic" },
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in! What can I get you?" },
      { at: 4, who: "C", say: "A regular cheeseburger please" },
      { at: 6, brain: { name: "Bacon Cheeseburger", item: "Bacon Cheeseburger", kind: "upgrade", from: "Cheeseburger", size: "Regular", price: 17.21,
        framing: "Make it a Bacon Cheeseburger for $1.11 more?", reason: "topping upgrade" } },
      { at: 9, who: "C", say: "It's so hot out today" },
      { at: 12, press: "no" },
      { at: 24, pay: true },
    ],
    checks: [
      ["the brain's Bacon Cheeseburger is up first", (r) => r.c.cards.find((x) => x.source === "brain")?.title === "Bacon Cheeseburger"],
      ["after the hot word's card is declined, the Bacon Cheeseburger comes back", (r) => r.c.cards.some((x) => x.title === "Bacon Cheeseburger" && x.back && x.atSec >= 12)],
    ],
  },
  {
    id: 40, title: "An allergy answer clears the context window: what was picked before it does not come back",
    setup: { cardMode: "dynamic" },
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in! What can I get you?" },
      { at: 4, who: "C", say: "A regular cheeseburger please" },
      { at: 6, brain: { name: "Bacon Cheeseburger", item: "Bacon Cheeseburger", kind: "upgrade", from: "Cheeseburger", size: "Regular", price: 17.21,
        framing: "Make it a Bacon Cheeseburger for $1.11 more?", reason: "topping upgrade" } },
      { at: 9, brain: { name: "Lettuce Wrap (no bun)", item: "Lettuce Wrap (no bun)", kind: "add", size: "each", price: 0, tag: "Allergy: no sesame",
        framing: "I can do it in a lettuce wrap so there's no sesame. Want that?", reason: "sesame allergy" } },
      { at: 12, press: "no" },
      { at: 24, pay: true },
    ],
    checks: [
      ["the Bacon Cheeseburger does not come back after the allergy answer", (r) => !r.c.cards.some((x) => x.back)],
    ],
  },
  {
    id: 37, title: "\"No thanks, and take off the fries\" after the cashier said the card: declined, and the fries come off",
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in! What can I get you?" },
      { at: 4, who: "C", say: "A regular cheeseburger and a regular fries please" },
      { at: 8, who: "O", say: "Would you like a drink with that?" },
      { at: 10, who: "C", say: "No thanks, and take off the fries" },
      { at: 20, pay: true },
    ],
    checks: [
      ["the drink card is declined", (r) => r.c.cards.some((x) => /drink/i.test(x.title) && x.outcome === "declined")],
      ["the fries came off", (r) => !r.c.ticket.some((l) => /Fries/.test(l))],
      ["no side is pitched back after it", (r) => !r.c.cards.some((x) => x.atSec >= 10 && /Fries|Poutine/.test(x.title))],
    ],
  },
  {
    id: 38, title: "The same line before the cashier said the card: only the fries come off",
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in! What can I get you?" },
      { at: 4, who: "C", say: "A regular cheeseburger and a regular fries please" },
      { at: 10, who: "C", say: "No thanks, and take off the fries" },
      { at: 20, pay: true },
    ],
    checks: [
      ["the card is not declined", (r) => !r.c.cards.some((x) => x.outcome === "declined")],
      ["the fries came off", (r) => !r.c.ticket.some((l) => /Fries/.test(l))],
      ["no side is pitched back after it", (r) => !r.c.cards.some((x) => x.atSec >= 10 && /Fries|Poutine/.test(x.title))],
    ],
  },
  {
    id: 39, title: "Best in this section: the cashier opens Drinks for a returning customer who had water last time",
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in! What can I get you?" },
      { at: 4, who: "C", say: "A regular cheeseburger please" },
      { at: 6, voice: { voice_id: "V0water1", matched: true, score: 0.91, tier: 0.9, visits: 3, last_order: [{ name: "Bottled Water", size: "each", qty: 1 }] } },
      { at: 8, section: "Drinks" },
      { at: 12, section: "Shakes" },
      { at: 20, pay: true },
    ],
    checks: [
      ["Drinks: the Bottled Water, what they had last time", (r) => r.c.sections.some((x) => x.category === "Drinks" && x.name === "Bottled Water" && /last time/.test(x.why))],
      ["Shakes: the milkshake", (r) => r.c.sections.some((x) => x.category === "Shakes" && /Milkshake/.test(x.name))],
    ],
  },
  {
    id: 26, title: "Card setting Dynamic: silence lets the card lapse",
    setup: { cardMode: "dynamic" },
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in!" },
      { at: 4, who: "C", say: "A regular cheeseburger please" },
      { at: 40, pay: true },
    ],
    checks: [
      ["the first card lapses after 25 s of silence", (r) => r.c.cards[0]?.outcome === "lapsed"],
      ["the next card follows it", (r) => r.c.cards.length >= 2 && r.c.cards[1].atSec > 29],
    ],
  },
  {
    id: 27, title: "Card setting On new trigger: silence keeps the card, a hot word changes it",
    setup: { cardMode: "trigger" },
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in!" },
      { at: 4, who: "C", say: "A regular cheeseburger please" },
      { at: 34, who: "C", say: "It's so hot out today" },
      { at: 40, pay: true },
    ],
    checks: [
      ["30 s of silence does not change the card", (r) => r.c.cards[0]?.outcome !== "lapsed" && !r.c.cards.some((x) => x.atSec > 5 && x.atSec < 34)],
      ["the hot word brings Something cold", (r) => tagged(r.c, "Something cold")?.atSec >= 34],
    ],
  },
  {
    id: 28, title: "Card setting Until accepted or declined: a hot word waits until the card is answered",
    setup: { cardMode: "hold" },
    steps: [
      { at: 0, who: "O", say: "Hi, welcome in!" },
      { at: 4, who: "C", say: "A regular cheeseburger please" },
      { at: 8, who: "C", say: "It's so hot out today" },
      { at: 12, who: "O", say: "Want fries with that?" },
      { at: 14, who: "C", say: "No thanks" },
      { at: 20, pay: true },
    ],
    checks: [
      ["the first card is held through the hot word and answered", (r) => card(r.c, "Fries", "declined")],
      ["Something cold comes after the answer, not before", (r) => tagged(r.c, "Something cold")?.atSec >= 14],
    ],
  },
]
