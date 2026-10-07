// Shared POS theme + helpers, used by both the modern and legacy views.
import { MENU, BRAND } from "../data/catalog.js"

export const C = {
  navy: "#0B0E14",
  navyMid: "#141920",
  navyCard: "#1A2130",
  navyBorder: "#252E3D",
  lime: "#CFFF2F",
  limeText: "#0B0E14",
  text: "#F0F4FF",
  textSec: "#7B8BAD",
  textMuted: "#4A566B",
  success: "#22C55E",
  danger: "#EF4444",
}

export const fmt = (n) => `$${(n || 0).toFixed(2)}`
export const fmtOrderId = (n) => `${BRAND.orderPrefix}${String(n).padStart(5, "0")}`
export const CATEGORIES = Object.keys(MENU)
export const TAX_RATE = 0.13

// Colour-coded category buttons for the legacy terminal grid.
export const CAT_COLORS = {
  "Drinks": "#2563EB",
  "Food": "#D97706",
  "Bakery & Sweets": "#DB2777",
  "Extras & Merch": "#7C3AED",
  // Five Guys categories
  "Burgers": "#DC2626",
  "Hot Dogs": "#EA580C",
  "Sandwiches": "#CA8A04",
  "Fries": "#D97706",
  "Shakes": "#DB2777",
  "Breakfast": "#0891B2",
}
export const catColor = (cat) => CAT_COLORS[cat] || "#475569"
