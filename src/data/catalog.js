// Catalog switch — one POS build, two menus.
// Default is the burger menu (menu-fiveguys.js) under generic "Demo Restaurant" branding;
// ?menu=burgers selects it explicitly (?menu=fiveguys, the older name, still works).
// ?menu=gregorys (or ?tenant=gregorys) loads Gregory's Coffee. Which menu, in this order:
//   1. ?menu= / ?tenant= in the link (also remembered as this device's choice)
//   2. in a demo room (?demo=), the ROOM's menu from its config, remembered per room by
//      syncRoomMenu() below; a device's old choice no longer overrides the room (David,
//      2026-10-08: a burger room showed Gregory's menu on a device that had once opened it)
//   3. this device's last choice, so follower/mirror windows opened without the param match
//
// Every POS module imports the catalog from HERE (not from menu.js directly), so a
// single selector drives the item grid, category tabs, brand strings and receipt.
import * as gregorys from "./menu.js"
import * as fiveguys from "./menu-fiveguys.js"

// Any value other than these is the burger menu.
const GREGORYS = new Set(["gregorys", "gregory", "gregorys-coffee", "coffee"])

const roomKey = (demo) => `vavoom-pos-room-menu-${demo}`

function selectedMenu() {
  try {
    const p = new URLSearchParams(window.location.search)
    let m = p.get("menu") || p.get("tenant")
    if (m) { m = m.toLowerCase(); localStorage.setItem("vavoom-pos-menu", m); return m }
    const demo = p.get("demo")
    const room = demo && localStorage.getItem(roomKey(demo))
    if (room) return room.toLowerCase()
    return (localStorage.getItem("vavoom-pos-menu") || "").toLowerCase()
  } catch {
    return ""
  }
}

/**
 * Keep a demo room's own menu: called with the room's config (demoContext.fetchDemoConfig) when
 * the POS opens with ?demo= and no ?menu= in the link. It remembers the room's menu for the next
 * load and, when this load guessed wrong (a device's old choice, the first visit to the room),
 * reloads once (a per-tab guard stops any loop).
 */
export function syncRoomMenu(demo, cfg) {
  try {
    const p = new URLSearchParams(window.location.search)
    if (!demo || !cfg?.menu || p.get("menu") || p.get("tenant")) return
    localStorage.setItem(roomKey(demo), String(cfg.menu).toLowerCase())
    const want = GREGORYS.has(String(cfg.menu).toLowerCase()) ? "gregorys" : "burgers"
    if (want !== MENU_KEY && sessionStorage.getItem(roomKey(demo)) !== "reloaded") {
      sessionStorage.setItem(roomKey(demo), "reloaded")
      window.location.reload()
    }
  } catch { /* storage blocked: the device's choice stands */ }
}

const active = GREGORYS.has(selectedMenu()) ? gregorys : fiveguys

export const MENU = active.MENU
export const CATEGORY_ICONS = active.CATEGORY_ICONS
export const TAG_CONFIG = active.TAG_CONFIG
export const BRAND = active.BRAND
// Which menu this is, for code (never shown): "burgers" or "gregorys".
export const MENU_KEY = active === gregorys ? "gregorys" : "burgers"
