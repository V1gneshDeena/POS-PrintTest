# Vavoom demo POS

A point-of-sale system for Vavoom demos, in vavoom.io's design (General Sans, the dark page with a lime glow, white pill buttons with a lime arrow; `src/components/posTheme.js` and `ui.jsx`), with a photo on every burger-menu item. It opens on a burger menu under generic "Demo Restaurant" branding (the default, or `?menu=burgers`; the older `?menu=fiveguys` still works). `?menu=gregorys` loads the Gregory's Coffee menu, built for the Gregory's Coffee pilot at Old Bridge Drive-Thru. In a demo room (`?demo=`) the POS shows the room's own menu (its config's `menu`), not the last menu this device used; `?menu=` in the link still wins.

---

## Quick Start (Terminal)

```bash
# 1. Clone the repo (or drop this folder in an existing repo)
git clone https://github.com/your-org/gregory-pos.git
cd gregory-pos

# 2. Install dependencies
npm install

# 3. Run locally
npm run dev
```

Then open **http://localhost:5173** in your browser.

---

## Demo Credentials

| Role    | Username  | Password     |
|---------|-----------|--------------|
| Staff   | server1   | vavoom2026   |
| Staff   | server2   | vavoom2026   |
| Manager | manager   | gregory2026  |

---

## Build for Production

```bash
npm run build
# Output goes to /dist — ready to deploy
```

Preview the production build locally:
```bash
npm run preview
# Opens at http://localhost:4173
```

---

## Deploy to GitHub Pages

1. Install the deploy package:
   ```bash
   npm install --save-dev gh-pages
   ```

2. Add to `package.json` scripts:
   ```json
   "deploy": "gh-pages -d dist"
   ```

3. Add `base` to `vite.config.js`:
   ```js
   export default defineConfig({
     plugins: [react()],
     base: '/gregory-pos/', // match your repo name
   })
   ```

4. Build and deploy:
   ```bash
   npm run build
   npm run deploy
   ```

5. Go to **Settings → Pages** in your GitHub repo and set source to `gh-pages` branch.

Your POS will be live at: `https://your-org.github.io/gregory-pos/`

---

## Push to an Existing GitHub Repo

```bash
# Inside the gregory-pos folder
git init
git add .
git commit -m "feat: add Gregory's Coffee POS demo"
git remote add origin https://github.com/your-org/your-repo.git
git push -u origin main
```

---

## Project Structure

```
gregory-pos/
├── index.html              # Entry HTML
├── vite.config.js          # Vite config
├── package.json
├── README.md
└── src/
    ├── main.jsx            # React root
    ├── App.jsx             # Auth gate + routing
    ├── data/
    │   ├── menu.js         # Full Gregory's Coffee menu (real SKUs + prices)
    │   └── auth.js         # Demo credential store + session helpers
    ├── components/
    │   ├── AuthScreen.jsx  # Staff sign-in screen
    │   ├── POSLayout.jsx   # Main POS interface
    │   ├── SizePicker.jsx  # Size selection modal
    │   ├── PaymentModal.jsx# Payment method + charge flow
    │   └── SuccessScreen.jsx # Post-payment confirmation
    └── assist/             # Vavoom Assist — In-Store demo rooms only (see below)
        ├── useAssist.js    # Session lifecycle, heard order → ticket, upsell cards
        ├── AssistOverlay.jsx  # The draggable upsell square + transcript on the POS
        ├── AssistFullBar.jsx  # The full bar page (?view=assist)
        ├── assistSync.js   # POS → full bar state; full bar → POS commands
        ├── sttClient.js    # Microphone → demo speech bridge → whisper
        ├── presence.js     # Counter presence on the POS camera (on-device face detector)
        ├── activity.js     # POS screen actions as events
        ├── behaviour.js    # What the screen activity says about the customer
        ├── upsellEngine.js # The one upsell to show
        ├── reasoning.js    # "How it's deciding": the engine's reasoning in plain sentences (full bar)
        ├── orderParser.js  # Spoken lines → POS menu items
        ├── acceptance.js   # Spoken yes / no to the upsell
        ├── hotkeys.json    # Upsell hot keys (shared list; whisper can load it too)
        ├── hotkeys.js      # Detects hot keys in a transcript line
        └── menuIndex.js    # The active menu as matchable aliases + meal roles
```

---

## Vavoom Assist (In-Store demo rooms)

In a demo room the console created as **In-Store** (`?demo=<id>`, config `productType: "instore"`; `?assist=1` forces it on, `?assist=0` off), the POS runs Vavoom Assist. Outside a demo room none of it loads.

- **On the POS screen**: two draggable boxes. The **upsell square** shows the upsell when one pops up (Add / No thanks), with dots for microphone, speech-to-text and camera, and a **Full bar** link. The **transcript** box shows what is being heard. Positions are remembered per device.
- **Full bar**: the same build at `?demo=<id>&view=assist`. It shows the session, inputs, the upsell and every card shown, what the screen activity says about the customer, the heard order, the live ticket, the transcript, and behind the scenes every message whisper and the speech bridge sent. Opened from the POS's link on the same device it can also start/end the customer, answer the card, switch the camera and type a line; on any other screen (the console lists it as its own surface) it is view only. Its **← Back to POS** button closes the full bar and brings the POS forward, or reloads the POS in the same tab when the browser opened the full bar there.
- **Speech**: sign in with a Vavoom account in the upsell square. The microphone streams to the demo config service's `/stt` bridge, which adds the whisper key server-side and pins the session to the room's own locId.
- **Stated order → ticket**: items the customer names are rung up (marked 🎙 heard), up to the quantity said. **Order changes** (`src/assist/orderEdits.js`) come off at once, whoever rang the item up: "take the fries off", "never mind the drink", "I'm good on the fries", "you can keep the drink"; swaps keep the old item's size ("change the fries to cajun fries", "can I get a bacon cheeseburger instead"); what the grammar misses, the meaning layer reads (`change_order`). `npm run test:transcripts -- --set edits` runs 60 ways of saying it plus 10 auto-picked orders (`test/order-edits.js`).
- **Upsell**, in this order: what a hot key calls for (answered instantly on the POS); the **upsell brain's** pick; basket completion (burger menu, David's order (2026-10-08): size up the main, then a side and a drink, then size up the fries and the drink, then a shake, the rest; the item whose size was just given is sized up first); whisper's AI pick (Gregory's only); then a behaviour-driven pick. A size-up is offered to a hurried or price-conscious customer too ("only $X more"), to a health-minded one only for a healthy item, not again once one was turned down, and not on an item that was itself just upsold. A card a hot word or a better pick replaced comes back once the new one is answered (the context window; an allergy answer clears it), and what the customer had taken off is not pitched back. Opening a menu section shows "Best in <section>" under the card: the best item there for this customer. An allergy with no safe substitute says so on the card ("No substitute for the …", one Got it button). No set number of cards: two no's in a row wait for the customer to open a new door. A spoken yes or Add puts it on the ticket (marked ★ upsell); a swap card (cheese / bacon, an allergy swap) replaces the item it names.
- **The upsell brain** (burger menu = tenant `demopos`): after every line and ticket change the POS asks it, through the speech bridge, for one decision on the GPU box. It runs the ladder (allergy, or "no substitute" when nothing on the menu is safe → the size-up of an item whose size was just given → main size-up → fries → drink → cheese / bacon → fries and drink size-ups → shake → last visit's toppings), scores it by the voice print's history, the order's calories and health, temperature and behaviour, and Qwen3-14B picks one of the top three and words it (prices and allergy lines come from templates). About 0.5 s; tags "Last time", "Topping", "Allergy: no …". Architecture: `deploy/gpu-vllm/demopos/README.md` in the monorepo.
- **Meaning layer** (burger menu): each finished line also goes, through the speech bridge, to the `demopos` gateway on the GPU box, which reads what it means (BGE sentence embeddings against written examples of 21 hot keys and of the customer changing the order, with rules for negation, offers, questions and speech fragments). Hot keys the exact words missed come back in about 0.05 s and fire the same way, labelled "by meaning" in the full bar ("it's like an oven out there" → Feeling hot → Something cold). Tested on existing transcripts before going live: `deploy/gpu-vllm/demopos/eval/RESULTS-2026-10-08.md` in the monorepo.
- **Quantities**: an item said once is rung up once, however often speech-to-text repeats it. More than one sticks only when a number is said ("two burgers", "another fries"); whisper's own count is capped to it, whisper naming the same item differently is not a second item, and a cashier tap on an item speech rang up in the last 8 s confirms that unit instead of adding one.
- **When the card changes** (the operator's setting, on the upsell square next to Camera and in the full bar's Controls, kept on the device): *Dynamic* (after 25 s of silence or when something new comes up), *On new trigger* (no silence timeout), or *Until accepted or declined* (changes only when the customer accepts or declines it; until the cashier says it, the upsell square shows "Please voice the upsell"). In every mode a card the customer's words rule out, or the ticket has overtaken (another side tapped while "Fries" is up), comes down, and an allergy answer still takes the screen. In the first two, a card the cashier has not said yet follows the ticket: a tapped or rung-up item brings the pick for the ticket as it is now.
- **Voice print**: each line is marked as the customer's or the employee's; the customer's speech goes to ECAPA on the GPU box once there are 2.5 s of it. A returning voice (matched in tiers from 1.0 down to 0.5, against the prints of every demo room) shows "Returning voice · heard n× before · last time: …" on the upsell square; no name is ever stored. A visit ends at payment, End customer or Clear, and the next one is identified afresh. The full bar shows the match and has "Forget voices in this room" (the prints made in that room).
- **Receipt**: at payment the visit is saved to the brain's store under the voice print and printed on the receipt: the order, the conversation with who said each line, and every upsell with why it was shown, whether the employee said it, and whether it was accepted, declined or let lapse (`src/assist/assistReceipt.js`).
- **How it's deciding** (top of the full bar; `src/assist/reasoning.js`): what the engine is weighing now and why it did each thing, for investors. Memory: trying to remember the customer, customer remembered (with their last order), or a new anonymous voice and the visit added to memory at payment. Health and ingredients: the ticket's calories and allergens from the menu knowledge base, and the brain's health score. Previous orders: which options rank higher because the customer had them before. When it pitches: there is no set number of upsells; pitching follows the conversation (open, with the next opening named; quiet after two no's in a row until the customer orders something or says something a hot word answers; paused after a complaint; done once the order is closed). The timeline: each hot word and what it means, meaning-layer readings with their similarity, the heard order, screen taps and behaviours, every card shown with its source and reasons (for the brain's cards, the ranked options with their history / fit / bestseller / price scores and the model's own read), and every answer. Built from the engine's own numbers as they happen: no model call, and no card waits for it. After payment it shows the last visit.
- **Tests**: `npm run test:transcripts` runs 28 full counter transactions through the engine (`test/transcripts.js`, 81 checks, each visit's reasoning printed) and writes `test/transcript-results.md`; `-- --set edits` runs the order-change, auto-picked-order and quantity cases (`test/order-edits.js`, 77) into `test/order-edits-results.md`. `npm run test:transcripts -- --meaning test/meaning-demo.json` runs them again with the meaning layer's real answers for those lines (from the GPU box) and writes `test/transcript-results-meaning.md`.
- **Hot keys** are the upsell's guidelines: words that force it to be re-picked the moment they are heard. An item the operator says is out is never offered again that day, its menu tile says "Out today", and its closest substitute pops up tagged "Closest substitute" (also when a customer orders it, when it is not rung up, and when the cashier taps it, when Add swaps the substitute in); "too sweet" / "too bitter" get a counter; "I don't like it" gets an alternative; "took forever" gets a free souvenir if the menu has merchandise; "do you have X?" pitches X with a complementary item below it, or the closest substitute; feeling hot or cold, or asking for something cold or hot, gets the most-ordered item of that temperature tagged "Something cold" / "Something warm"; ordering within 3 s of arriving marks the customer as not patient. The list, its evidence from real Starbucks speech, and what each one does: [`docs/HOT-KEYS.md`](docs/HOT-KEYS.md). The full bar shows each one as it fires, and today's out-of-stock list with a Clear button.
- **Counter presence**: "Camera on" runs an on-device face detector; a close face for 1.5 s opens the customer, 6 s without one closes it if the ticket is empty. Frames never leave the device.
- **Session**: opens on counter presence, a greeting ("welcome", "hello"), a spoken order, the cashier's first tap, or Start customer; closes on payment, End customer, or presence leaving an empty ticket.

How the screen activity is read, behaviour by behaviour: [`docs/BEHAVIOUR-MODEL.md`](docs/BEHAVIOUR-MODEL.md).

Local test without production speech: run `demo-config-service/dev/mockWhisper.js` and the config service with `WHISPER_WS_URL=ws://127.0.0.1:8799/ws/transcribe WHISPER_API_KEY=mock-key`, create an In-Store demo, open the POS with `?demo=<id>`, and `POST http://127.0.0.1:8799/say {"text": "..."}` to play lines (see the mock's header).

---

## Menu Data

Every burger-menu item, topping and mix-in has a photo: `public/menu/<item id>.jpg`, 480×360 crops from Unsplash (free licence, no brand in any photo; photographers in `public/menu/CREDITS.md`), listed in `src/data/menuPhotos.js`. Gregory's menu has none yet; its tiles show the item's initials.

The burger menu (the default, `src/data/menu-fiveguys.js`) is the Canadian line-up with Canadian prices (2026-10-08): burgers (Little / Regular), dogs, sandwiches, fries and poutine, the shake, drinks, plus the 15 free toppings, the lettuce wrap and the shake mix-ins as $0 items. Its knowledge base, `src/data/menu-kb.json` (descriptions, parts, calories, allergens, ingredients, prices), is built by `scripts/build-menu-kb.py` from the Five Guys Canada nutrition, ingredient and allergen guide; keep the two in step.

`src/data/menu.js` contains the full Gregory's Coffee menu pulled from current sources (May 2026):

- ☕ Hot Coffee (13 items with size/price variants)
- 🧊 Cold Coffee (13 items incl. Honey Badger, Flower Power, Hall & Oats)
- 🍵 Hot Drinks (7 items)
- 🥤 Cold Drinks (8 items)
- 🍳 Hot Food (11 items)
- 🧁 Baked by Us (12 items)
- 🥤 Smoothies (2 items)

> Confirm active SKUs and prices with the Old Bridge location before go-live.

---

## Design System

vavoom.io's, shared with the TV and the brand pages (`src/components/posTheme.js`):

| Token         | Value       |
|---------------|-------------|
| Page          | `#0b0e14` with a soft lime glow |
| Card surface  | `#12161f`, hairline border `rgba(255,255,255,0.086)` |
| Accent        | `#cfff2f` (lime) |
| Font          | General Sans (Fontshare), weights 400–600, tight tracking |
| Main action   | white pill with a lime arrow (`ui.jsx` ArrowPill) |
| Tax rate      | 13%         |

---

Built by Vavoom · Gregory's Coffee Pilot · June 2026
