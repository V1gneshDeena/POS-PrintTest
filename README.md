# Gregory's Coffee POS — Vavoom Demo

A drive-thru point-of-sale system built on the Vavoom design system for the Gregory's Coffee pilot at Old Bridge Drive-Thru.

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
- **Stated order → ticket**: items the customer names are rung up (marked 🎙 heard), up to the quantity said; "no fries" takes off fries that speech added.
- **Upsell**, in this order: what a hot key calls for; basket completion (Five Guys: upsize the food item, then fries, then a drink, then a shake, then the rest); whisper's AI pick once the basket is complete (only items on this menu); then a behaviour-driven pick. A spoken yes or Add puts it on the ticket (marked ★ upsell).
- **Hot keys** are the upsell's guidelines: words that force it to be re-picked the moment they are heard. An item the operator says is out is never offered again that day, its menu tile says "Out today", and its closest substitute pops up tagged "Closest substitute" (also when a customer orders it, when it is not rung up, and when the cashier taps it, when Add swaps the substitute in); "too sweet" / "too bitter" get a counter; "I don't like it" gets an alternative; "took forever" gets a free souvenir if the menu has merchandise; "do you have X?" pitches X with a complementary item below it, or the closest substitute; ordering within 3 s of arriving marks the customer as not patient. The list, its evidence from real Starbucks speech, and what each one does: [`docs/HOT-KEYS.md`](docs/HOT-KEYS.md). The full bar shows each one as it fires, and today's out-of-stock list with a Clear button.
- **Counter presence**: "Camera on" runs an on-device face detector; a close face for 1.5 s opens the customer, 6 s without one closes it if the ticket is empty. Frames never leave the device.
- **Session**: opens on counter presence, a greeting ("welcome", "hello"), a spoken order, the cashier's first tap, or Start customer; closes on payment, End customer, or presence leaving an empty ticket.

How the screen activity is read, behaviour by behaviour: [`docs/BEHAVIOUR-MODEL.md`](docs/BEHAVIOUR-MODEL.md).

Local test without production speech: run `demo-config-service/dev/mockWhisper.js` and the config service with `WHISPER_WS_URL=ws://127.0.0.1:8799/ws/transcribe WHISPER_API_KEY=mock-key`, create an In-Store demo, open the POS with `?demo=<id>`, and `POST http://127.0.0.1:8799/say {"text": "..."}` to play lines (see the mock's header).

---

## Menu Data

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

| Token         | Value       |
|---------------|-------------|
| Base navy     | `#0B0E14`   |
| Card surface  | `#1A2130`   |
| Lime accent   | `#CFFF2F`   |
| Font          | Plus Jakarta Sans |
| Tax rate      | 13%         |

---

Built by Vavoom · Gregory's Coffee Pilot · June 2026
