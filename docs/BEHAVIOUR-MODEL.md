# What the POS screen says about the customer

This is the behaviour model behind Vavoom Assist on the demo POS. At a counter the cashier's screen follows the customer: the category the cashier opens is the part of the menu the customer is talking about, how long the cashier stays there is how settled the customer is, and what gets removed or downsized is price pressure. Assist reads the POS activity stream and estimates which of the behaviours below are happening, each with a confidence between 0 and 1. The estimates steer which upsell pops up and when.

The code is `src/assist/behaviour.js` (the table and the estimator), `src/assist/activity.js` (the events the POS emits) and `src/assist/upsellEngine.js` (how the estimates become a pitch). The thresholds are hand-set starting points, named in `behaviour.js` as `T`, so they can be tuned. They are not learned yet.

## The events the POS emits

Every screen action in `usePos.js` emits one event: a category opened, an item tapped, an item added (by the cashier, from speech, or from an accepted upsell), an item removed, the ticket cleared, a discount, payment opened, payment cancelled, payment completed, and a new order. Only the cashier's own taps count as screen behaviour; items Assist adds or removes (from speech, an accepted upsell, or an item the operator said is out) do not.

## The behaviours

| Behaviour | How it is detected | What it most likely means | What Assist does | Confidence |
|---|---|---|---|---|
| Browsing a category | Stays on one category 4 s or more without adding anything | The customer is choosing that kind of item and hasn't settled | Suggests that category's most-ordered item | 0.45, rising with time on the category |
| Knew what they wanted | Adds an item within 4 s of opening its category | A decided order: the customer named it and the cashier rang it in | No alternatives in that category; pitches what goes with the item | 0.80 |
| Category settled | Leaves a category after adding from it | That part of the meal is done | Moves the pitch to the next part of the meal | 0.70 |
| Looked, took nothing | Spent 3 s or more in a category and left with nothing from it | Interest without commitment, often price or "not right now" | Holds that category as the closing upsell (it ranks higher at checkout) | 0.55, rising with time spent |
| Undecided | 4 or more category switches in 20 s with nothing added | Exploring the menu; wants a recommendation | Recommends the bestseller instead of an add-on | 0.75 |
| Second round | Back in a category whose kind of item is already on the ticket | Ordering for someone else too, or a bigger appetite | Offers to make it two | 0.60 |
| Watching the price | Picks the smallest size where bigger exist, removes an item, or applies a discount | Price matters to this customer | No upsizes; cheaper add-ons rank higher | 0.60 (0.80 with a discount) |
| Going large | Picks the largest of three sizes, or a size called Large | Not price-led; a big appetite | A premium add-on (shake, dessert) ranks higher | 0.65 |
| Treat mood | Opens a treat category (shakes, bakery, sweets) | Thinking about something sweet | Pitches the treat now | 0.60, rising with time on the category |
| Closing the order | Opens payment | The order is about to close | One last small add-on, then no more cards | 0.90 |
| Second thoughts at pay | Opens payment, then backs out | Hesitating: about to add or drop something | Re-offers the strongest upsell once | 0.70 |
| Changed their mind | Removed an item in the last 10 s | Reconsidering | Pauses new cards for a moment | 0.80 |
| Cashier listening | No screen activity for 10 s while the microphone session runs | The order is being spoken, not browsed | Lets the heard order fill the ticket | 0.60 |
| Finding what was said | The open category holds an item heard in the last 15 s | The cashier is looking for the item the customer just named | The heard item is added to the ticket for them | 0.85 |

The full bar page shows every behaviour active right now with its confidence, meaning and action. The POS screen itself shows only the upsell square and the transcript.

## How behaviour combines with clicks, speech and the AI

One upsell is on screen at a time. Hot keys are the guidelines (what was said decides first); the candidates, best first:

1. **Hot keys** ([HOT-KEYS.md](HOT-KEYS.md)): the closest substitute for an item that is out (said by the operator, ordered by the customer, or tapped by the cashier), a counter for "too sweet" or "too bitter", an alternative to an item the customer doesn't like, a free souvenir after a long wait, an item the customer asked about with a complementary item below it, food, a second item for someone else, a seasonal pairing. Each carries a tag at the top of the card. Hot keys also constrain and re-rank everything below (dietary needs, drink only, hurry, weather), and an order complaint pauses cards for a minute.
2. **Basket completion**, in the menu's order. Five Guys: upsize the food item, then fries, then a drink, then a shake, then the rest. Gregory's: upsize the drink, then a treat, then food. Upsizes are skipped for a customer who is watching the price or is not patient.
3. **The production AI's pick.** Whisper's live upsell from the conversation, once the basket is complete or when it names the same item; only items on this POS's menu and not already on the ticket.
4. **Behaviour-driven picks**: a treat in treat mood, the category looked at and left, the bestseller when undecided, another of the same on a second round, the most-ordered item of the category being browsed.

A card holds its place until it is answered or a card from a higher step is available, and every hot key releases it at once. A "no" to one side, drink or treat stops the basket and behaviour rules from offering another item of the same kind. Nothing on the ticket, declined, or already offered is offered again, and a customer gets at most four cards. A card is accepted by the Add button, a spoken yes, or its item reaching the ticket some other way, and accepted items go on the ticket automatically.

## Limits

- **One microphone hears both people.** The order parser tells a cashier's offer ("would you like fries with that?") from a customer's order by its wording and question form, and never adds items from an offer. It can still be fooled by unusual phrasing.
- **The thresholds are guesses.** They come from how counter service usually flows, not from measured POS logs. The natural next step is to log the activity stream next to receipts and learn which behaviours actually precede an accepted upsell, the same way the upsell ranker was trained on receipts.
- **The cashier is the proxy.** The model reads the cashier's screen, not the customer, so a cashier who browses out of habit looks like an undecided customer.
