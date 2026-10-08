# Upsell hot keys

Hot keys are words and phrases that, the moment they are heard, force the upsell to be re-evaluated: the card on screen is released and the next pick takes what was said into account. On the demo POS they are the upsell engine's guidelines (David, 2026-10-07: "those texts are what dictate decisions by the upsell engine"): what was just said decides first, and basket completion, the AI's pick and screen behaviour fill in after. They complement the signals the upsell already uses (time of day, weather, the store's best sellers, the 86 list, the order so far) with what the customer and the operator actually say.

The list is one file, [`src/assist/hotkeys.json`](../src/assist/hotkeys.json). The demo POS's Vavoom Assist acts on it (`hotkeys.js`, `upsellEngine.js`, `useAssist.js`), and the full bar shows every hot key that fires, the exact words, and what it did. The patterns use regex syntax that JavaScript and Python share, so whisper can load the same file when hot keys go live.

## Where the list comes from

Real Starbucks Downtown speech on this machine: 143 full conversations from 2026-08-13 to 08-17 (`C:\vavoom-data\cues\captures_raw.jsonl`) and 1,730 short voice clips from 2026-09-08 to 10-03 (`voice-audio-local/voice-tags-2026-10-06/data.json`). "Share of orders" below is the August figure, since those are whole conversations; the clip figure is per 5–10 s clip and so lower. Every pattern was replayed over all 2,103 August lines and tightened where it misfired (see "Tuned on real lines").

The speaker labels in that data bleed: the same sentence often appears under both Customer and Operator. So no hot key depends on who said it; the wording carries that ("we're out of" is the operator, "can I use my stars" is the customer).

## How the POS demo's engine decides

1. **Hot keys first.** The responses David set (below) come with a tag across the top of the upsell: **Closest substitute**, **Counter: too sweet**, **Counter: too bitter**, **Alternative**, **Complimentary**, **You asked about it**, and for temperature **Something cold** / **Something warm**. Each is offered once per time it is said, so a declined substitute is not followed by a second one.
2. **Basket completion**, in this menu's order. With sides (the burger menu): upsize the food item, then fries, then a drink, then a shake, then a fries upsize, then food, then a drink upsize. Without sides (Gregory's): upsize the drink, then a treat, then food.
3. **The production AI's pick** (whisper), once the basket is complete or when it names the same item. Only items on this POS's menu, never one the customer's needs rule out or one reasoned from an item that is out.
4. **Screen behaviour** ([BEHAVIOUR-MODEL.md](BEHAVIOUR-MODEL.md)).

An unanswered card stays until a card from a higher step is available, and every hot key releases it at once.

## The hot keys

| Hot key | Listen for | Share of orders | Real example | What the upsell does |
|---|---|---|---|---|
| **Item out of stock** | we're out of, we just ran out, we don't have any / the, not available, sold out, unfortunately we | 4.9% | "And we're out of Pike Place." / "Don't have any protein powder, but we can just make you a regular mocha." | Never offered again **that day** in this demo room (the full bar's "Clear out-of-stock" resets it); taken off the ticket if speech rang it up; the closest substitute pops up at once, tagged **Closest substitute**; an AI pick reasoned from the missing item is dropped |
| **Asked if we have something** | do you have, do you still have, do you carry, is there any. Never the loyalty question: "do you have the rewards app", "…the Starbucks app", and the forms STT writes for it ("do you have your words up with us?", "…your wood up with us?") | 14.0% | "Okay. What kind of syrup do you have that's…" | Pitches the item, tagged **You asked about it**, with a complementary item below it (the next part of the meal in basket order) that has its own Add; if it's out today or not on the menu, the closest substitute (**Closest substitute**: "We don't carry 'onion rings' — the closest is the Cheese Fries"); never rung up from the question itself |
| **Too sweet** | too sweet, too sugary, sickly sweet | 0.7% | "Nothing too sweet." | Something to counter it, tagged **Counter: too sweet**: a salty side where the menu has sides (fries), else a plain drink (cold brew, Americano) |
| **Too bitter** | too bitter, too strong, so bitter, tastes burnt, burnt | 0.0% | — | Something to counter it, tagged **Counter: too bitter**: a treat (shake, croissant), else a sweet drink |
| **Doesn't like it** | I don't like it / this / the …, I didn't like the …, not a fan of | 2.8% | "I do, but I don't like it." | An alternative from the same category, tagged **Alternative**, for the item named or else the last one ordered; that item is never rung up from the line |
| **Took forever** | took forever / so long / ages, taking forever, long wait, been waiting | 0.0% | — | A free souvenir, tagged **Complimentary**, if the menu has merchandise (Gregory's: from Extras & Merch, added at $0); the burger menu has none, so it is only logged |
| **Complaint (order problem)** | got it wrong, wrong order / drink / size, missing my, didn't get my, forgot my, remake, messed up, not happy | 0.7% | "We didn't get the right part." | Stop pitching for 60 s; fix the order first |
| **Dairy-free** | oat milk, almond, soy, coconut, lactose, dairy-free, non-dairy, vegan | 21.7% | "…a grande caramel macchiato with almond milk?" / "I'll do lactose free, actually." | Drop every milk, cream, cheese and shake pitch, the AI's included |
| **Watching sugar** | sugar-free, no sugar, half sweet, less sweet, not too sweet, skinny, unsweetened | 11.2% | "Can you do sugar free vanilla?" | Drop sweet treats and syrup-heavy drinks |
| **No caffeine** | decaf, caffeine-free, half-caf | 2.1% | "Can I get a large black decaf coffee?" | Drop espresso, cold brew and extra-shot pitches |
| **Health-minded** | protein, healthy, nonfat, skim, low-cal | 2.8% | "…the protein matcha." | Drop indulgent pitches (shakes, cookies, fries, bacon) |
| **Going large** | venti, trenta, large, extra/double shot, triple, quad (not the operator's "would you like to upsize to a venti?") | 30.1% | "Venti white mocha." / "Trenta iced coffee." | Premium add-ons welcome; an upsize ranks higher |
| **Price-conscious** | how much, expensive, price, cheap, coupon, discount | 3.5% | "I got the discount coupon for three dollars." | No upsizes; cheaper add-ons rank higher |
| **Paying with stars or a card** | use my stars / points, my stars, gift card | 2.8% | "Can I use 60 of my stars?" | Pitch a paid food item alongside the redeemed drink |
| **Ordering for others** | both, another, two of these, for my / her / him, she wants, same thing, one for her | 12.6% | "…can I please get two these will both be the same?" / "I'll just do one for her." | A second of the main item for the other person, ahead of basket completion |
| **Regular order** | usual, same as always / last time, always get, every day | 1.4% | "I personally always get a caramel mocha." | Don't swap the drink; an add-on ranks above an upsize |
| **Seasonal interest** | pumpkin, pecan, seasonal, brand new, new drink, fall, holiday, peppermint, gingerbread, apple crisp | 4.9% (12.9% of Sept–Oct clips) | "Also grab a grande iced pecan crunch latte?" / "…the orange cream chai is our new chai right now." | Pitch a seasonal item when the menu has one, ahead of basket completion |
| **Wants food** | breakfast, lunch, hungry, starving, something to eat, sandwich, pastry, snack | 9.8% | "I'll see how hungry I am after." | Food first: the most-ordered main, ahead of basket completion |
| **Drink only** | no food, just the drink, just a coffee, not hungry, already ate | 1.4% | "Just a drink? Yeah. Venti white mocha." | No food pitches at all |
| **In a hurry** | quick, in a rush, running late, I'm late, no time, on my way to | 0.7% | "I'm gonna have a quick grande nitro cold brew." | No upsizes for 5 min; only cheap, ready items rank |
| **Needs a boost** | tired, exhausted, need my caffeine, long day, wake me up, rough morning | 1.4% | "It's morning. I need my caffeine." | An upsize or an extra-shot item ranks higher |
| **Feeling hot / hot weather** | I'm (so) hot, I'm sweating / boiling / melting, so hot, hot out / outside / in here, it's hot today, sweaty, sunny, heat wave, feeling hot | 2.8% | "Sweating. Sorry. I'm just so hot right now." | The most-ordered cold item pops up, tagged **Something cold** (a drink first; not when a cold drink or shake is already on the ticket); iced and cold items rank higher, hot ones lower |
| **Feeling cold / cold or wet weather** | I'm (so) cold / freezing / chilly / shivering, cold out / outside / in here, it's cold today, freezing, chilly, raining, snowing, feeling cold | 1.4% | "Is it raining today?" | The most-ordered warm item pops up, tagged **Something warm** (a hot drink first, else warm food such as fries; not when a hot drink is already on the ticket); hot drinks and warm food rank higher |
| **Wants something cold** | something cold / cool / iced / refreshing / frozen, a cold drink, cool (me) down / off, refreshing, thirsty | 0.0% (0.2% of Sept–Oct clips) | "I probably just want something refreshing. Just cold." | The most-ordered cold item pops up, tagged **Something cold** (not when a cold drink or shake is already on the ticket: "something cold to drink" rings up the drink itself); cold items rank well above hot ones |
| **Wants something hot** | something hot / warm, a hot / warm drink, warm me up, something to warm, heat me up | 0.7% | "And then I think I might get a hot drink this time." | The most-ordered warm item pops up, tagged **Something warm** (not when a hot drink is already on the ticket); hot items rank well above cold ones |
| **Undecided** | not sure, can't decide, what do you recommend, what's good, what's popular, take your time, surprise me | 3.5% | "I'm not able to decide." | One clear recommendation: the bestseller, for 30 s |
| **Order closing** | that's it, that's all, that's everything, that'll be it, nothing else | 32.9% | "That's everything." | One last small add-on now, then no more cards |

**Ordering an item that's out** is a rule, not a phrase. When the customer orders an item on today's out-of-stock list, the item is not rung up and its closest substitute pops up, tagged **Closest substitute**. When the cashier taps one, the POS still rings it up (the cashier has the last word), the same substitute pops up, and Add swaps the substitute in for it. Items on the list carry an "Out today" mark on the POS's menu tiles. The full bar lists it with the hot keys as "Ordered an item that's out" or "Tapped an item that's out".

**Not patient** is a timing rule, not a phrase (`timing_rules` in the JSON): when the customer's first order line comes within 3 s of the customer session opening (counter presence, a greeting, the cashier's first tap, or Start), the customer is treated as in a hurry: no upsizes, cheap ready items first. It is not judged when the order line itself opened the session, since there is no earlier moment to measure from.

## Deliberately not hot keys

- **Size words on their own** ("tall", "small", "grande"). They are the size being ordered, said in most orders; basket completion already handles upsizes. "Going large" counts only the big sizes and extra shots.
- **Drink modifiers** ("light ice", "extra hot", "no ice", "warmed up"; 11% of orders). They change how the item is made, not what else the customer might buy.
- **Very common filler** ("sorry", "okay", "um", "sure"). They carry no buying signal and would fire on nearly every order. "Yes" and "no" to the card on screen are handled separately as accept and decline.
- **The operator's loyalty question** in any of its forms (see "Asked if we have something"). Only redeeming stars or a gift card is a hot key.

## Tuned on real lines

Replaying the patterns over the 2,103 August lines found these misfires, now fixed:

- "Can I get that with oat milk" counted as an availability question; that form was removed (it is an order modifier).
- The operator's "Would you like to upsize to a venti?" counted as the customer going large; a line that is an upsize offer no longer fires it.
- "Hot or iced?", "a hot one", "extra hot", "iced" and "warmed up" are the drink being ordered, not a feeling, and were never made temperature hot keys (they are in about half of all orders). "Hot today" on its own was dropped too: STT writes it in garbled greetings ("can I just get a hot potential today").
- "What's wrong with me?" counted as a complaint, which would have paused upsells for a minute. Order complaints now need a complaint shape ("got it wrong", "wrong order", "missing my").
- The loyalty question, as STT writes it ("Do you have your words up with us?"), counted as asking about an item. Excluding it brought "Asked if we have something" from 16.8% to 14.0% of orders.

And in the engine: "Bottled Water" matched the souvenir name list through "bottle", so the burger menu would have handed out free water; souvenirs now come only from merchandise.

Still possible and accepted: "breakfast" fires on the operator's own mention of breakfast sandwiches, and "another" on "try another one". Both only nudge food or a second item; neither blocks or pauses anything.

## Taking it live (Starbucks, through whisper)

Nothing below is built. It needs whisper's code, a deploy to gpu-setup, and your OK.

1. Copy `hotkeys.json` into whisper (`app/ai/`) and run the same detection on every final line from the operator mic and, where there is one, the customer mic.
2. **Out of stock is a spoken 86**: add the item to the store's blocked items for the day and run the same recompute the tablet's `inventory_update` already triggers (`_compute_upsell("inventory_change")`), which emits a replacement card.
3. Every other hot key clears the sticky hold (`held_item`) and recomputes with the hot key passed to glm-upsell as context, alongside the dormant customer-cue path (`CUE_UPSELL_TENANTS`), which handles meaning-based cues these phrases don't cover (a customer who says "brr, it's brutal out there" rather than "I'm freezing"). The tablet would show the same tags.
4. Ship it in shadow first, logging "hot key X would re-pick A → B" without changing the card, the way `CUE_UPSELL_MODE=shadow` was planned, and compare against receipts before switching it on.
