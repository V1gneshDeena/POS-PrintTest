// Catalog switch — one POS build, multiple tenant menus.
// Default is Gregory's Coffee (unchanged). Pass ?menu=fiveguys (or ?tenant=fiveguys)
// to load the Five Guys demo catalog; the choice is remembered in localStorage so
// follower/mirror windows opened without the param stay on the same menu.
//
// Every POS module imports the catalog from HERE (not from menu.js directly), so a
// single selector drives the item grid, category tabs, brand strings and receipt.
import * as gregorys from "./menu.js"
import * as fiveguys from "./menu-fiveguys.js"

// Five Guys is the default menu. Gregory's stays available via ?menu=gregorys.
const GREGORYS = new Set(["gregorys", "gregory", "gregorys-coffee", "coffee"])

function selectedMenu() {
  try {
    const p = new URLSearchParams(window.location.search)
    let m = p.get("menu") || p.get("tenant")
    if (m) { m = m.toLowerCase(); localStorage.setItem("vavoom-pos-menu", m); return m }
    return (localStorage.getItem("vavoom-pos-menu") || "").toLowerCase()
  } catch {
    return ""
  }
}

const active = GREGORYS.has(selectedMenu()) ? gregorys : fiveguys

export const MENU = active.MENU
export const CATEGORY_ICONS = active.CATEGORY_ICONS
export const TAG_CONFIG = active.TAG_CONFIG
export const BRAND = active.BRAND
