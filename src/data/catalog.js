// Catalog switch — one POS build, two menus.
// Default is the burger menu (menu-fiveguys.js) under generic "Demo Restaurant" branding;
// ?menu=burgers selects it explicitly (?menu=fiveguys, the older name, still works).
// ?menu=gregorys (or ?tenant=gregorys) loads Gregory's Coffee. The choice is remembered in
// localStorage so follower/mirror windows opened without the param stay on the same menu.
//
// Every POS module imports the catalog from HERE (not from menu.js directly), so a
// single selector drives the item grid, category tabs, brand strings and receipt.
import * as gregorys from "./menu.js"
import * as fiveguys from "./menu-fiveguys.js"

// Any value other than these is the burger menu.
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
// Which menu this is, for code (never shown): "burgers" or "gregorys".
export const MENU_KEY = active === gregorys ? "gregorys" : "burgers"
