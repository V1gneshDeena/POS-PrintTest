// Item photos for the menu tiles and the ticket. The burger menu has one per item, toppings and
// mix-ins included: public/menu/<item id>.jpg, 480×360 crops from Unsplash (free licence, no brand
// in any photo; photographers in public/menu/CREDITS.md), chosen 2026-10-08. Gregory's menu has
// none yet, so its tiles show the item's initials instead (ui.jsx ItemThumb).
const IDS = new Set([
  "fgprod_0001", "fgprod_0002", "fgprod_0003", "fgprod_0004",
  "fgprod_0011", "fgprod_0012", "fgprod_0013", "fgprod_0014",
  "fgprod_0021", "fgprod_0022", "fgprod_0023", "fgprod_0024", "fgprod_0025",
  "fgprod_0031", "fgprod_0032", "fgprod_0034", "fgprod_0041", "fgprod_0051", "fgprod_0052",
  "fgtop_01", "fgtop_02", "fgtop_03", "fgtop_04", "fgtop_05", "fgtop_06", "fgtop_07", "fgtop_08",
  "fgtop_09", "fgtop_10", "fgtop_11", "fgtop_12", "fgtop_13", "fgtop_14", "fgtop_15", "fgtop_16",
  "fgmix_01", "fgmix_02", "fgmix_03", "fgmix_04", "fgmix_05", "fgmix_06", "fgmix_07", "fgmix_08", "fgmix_09",
])

// Relative to the page (vite base "./"), so the same build works on pos.vavoom.io and in Electron.
export const photoFor = (item) => (item && IDS.has(item.id) ? `${import.meta.env.BASE_URL}menu/${item.id}.jpg` : null)
