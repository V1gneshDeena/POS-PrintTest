// Shared POS theme + helpers, used by every POS screen (modern and classic views, the modals,
// sign-in, success) and by Vavoom Assist's overlay and full bar.
//
// The look is vavoom.io's (David, 2026-10-08: "change the POS design to vavoom.io design"): the
// #0b0e14 page with a soft lime glow, #12161f cards with a hairline border, General Sans (loaded in
// index.html from Fontshare) at light weights with tight tracking, small uppercase eyebrows, lime
// for what is selected, and a white pill with a lime arrow for the main action (ui.jsx). The same
// palette as the TV (Vavoom's UI/src/tv.css) and the /BrandManagement pages.
//
// The older key names (navy, navyCard, lime …) are kept so every screen picked the new palette up
// at once; the vavoom.io names (bg, surface, raised, line …) are the ones to use in new code.
import { MENU, BRAND } from "../data/catalog.js"

const V = {
  bg: "#0b0e14",
  surface: "#12161f",
  inset: "#0e1219",
  raised: "#181d28",
  line: "rgba(255,255,255,0.086)",
  line2: "rgba(255,255,255,0.15)",
  white: "#ffffff",
  text: "#e9edf3",
  muted: "#a7afbe",
  soft: "#8a93a3",
  faint: "#5d6574",
  accent: "#cfff2f",
  accentInk: "#0b0e14",
  accentSoft: "rgba(207,255,47,0.12)",
  accentLine: "rgba(207,255,47,0.34)",
  accentGlow: "rgba(207,255,47,0.07)",
  success: "#4ade80",
  danger: "#ff8a6b",
  dangerSoft: "rgba(255,107,69,0.1)",
}

export const C = {
  ...V,
  // older names → the vavoom.io palette
  navy: V.bg,
  navyMid: V.inset,
  navyCard: V.surface,
  navyBorder: V.line,
  lime: V.accent,
  limeText: V.accentInk,
  textSec: V.muted,
  textMuted: V.faint,
}

export const FONT = '"General Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
// The page background: the vavoom.io glow over the base colour.
export const PAGE_BG = `radial-gradient(60rem 30rem at 92% -12%, ${V.accentGlow}, transparent 62%), radial-gradient(50rem 28rem at -6% -6%, rgba(120,150,255,0.05), transparent 60%), ${V.bg}`

export const fmt = (n) => `$${(n || 0).toFixed(2)}`
// Toppings and mix-ins are $0 items: they read as "Free" on tiles and the ticket.
export const fmtPrice = (n) => (n ? fmt(n) : "Free")
export const fmtOrderId = (n) => `${BRAND.orderPrefix}${String(n).padStart(5, "0")}`
export const CATEGORIES = Object.keys(MENU)
export const TAX_RATE = 0.13

// Colour-coded category buttons for the classic terminal grid (LegacyView), which keeps its
// coloured keys by design.
export const CAT_COLORS = {
  "Drinks": "#2563EB",
  "Food": "#D97706",
  "Bakery & Sweets": "#DB2777",
  "Extras & Merch": "#7C3AED",
  // Burger menu categories
  "Burgers": "#DC2626",
  "Hot Dogs": "#EA580C",
  "Sandwiches": "#CA8A04",
  "Fries": "#D97706",
  "Shakes": "#DB2777",
  "Breakfast": "#0891B2",
}
export const catColor = (cat) => CAT_COLORS[cat] || "#475569"
