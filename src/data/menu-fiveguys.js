// The burger menu — the POS's default demo menu, shown under GENERIC branding (BRAND below:
// "Demo Restaurant"; David, 2026-10-07: no Five Guys branding on the POS). The items and
// prices were modelled on Five Guys for the scripted Five Guys pilot, which is why the notes
// below cite it; nothing on screen or on the receipt names it.
// Same shape as menu.js (the Gregory's catalog): MENU keyed by category, each
// item { id, name, sizes: {label: price}, tag }, plus CATEGORY_ICONS + TAG_CONFIG.
//
// The line-up and prices are Canadian (2026-10-08): items from fiveguys.ca, prices from one
// Ontario store's online menu (Kingston, order.online), so directional — franchises set their
// own. The Veggie Sandwiches and the Large fountain drink are not on that store's online menu
// and are estimated. Generated from the menu knowledge base (src/data/menu-kb.json, built by
// scripts/build-menu-kb.py from the Five Guys Canada allergen guide), which also carries every
// item's description, parts, calories and allergens; keep the two in step. The 15 free
// toppings, the lettuce wrap and the shake mix-ins are real $0 items, so the ticket and the
// receipt carry them.
//
// Burgers: "Little" = single patty, "Regular" = double patty (modeled as sizes).
//
// The demo's own items (David, 2026-10-12: more options for the upsell and its alternatives): the
// Chicken section, the Sides section, the Desserts section and three more drinks (ids dmprod_*). They
// are not Five Guys items; their prices, calories and allergens are our estimates, in menu-kb.json by
// scripts/add-demo-items.py. Chicken Tenders: Regular = three, Large = five.

export const MENU = {
  "Burgers": [
    { id: "fgprod_0001", name: "Hamburger", sizes: { "Little": 10.20, "Regular": 13.64 }, tag: "classic" },
    { id: "fgprod_0002", name: "Cheeseburger", sizes: { "Little": 11.92, "Regular": 16.10 }, tag: "popular" },
    { id: "fgprod_0003", name: "Bacon Burger", sizes: { "Little": 11.92, "Regular": 15.98 } },
    { id: "fgprod_0004", name: "Bacon Cheeseburger", sizes: { "Little": 13.64, "Regular": 17.21 }, tag: "bestseller" },
  ],
  "Hot Dogs": [
    { id: "fgprod_0011", name: "Hot Dog", sizes: { "each": 7.98 }, tag: "classic" },
    { id: "fgprod_0012", name: "Cheese Dog", sizes: { "each": 9.09 } },
    { id: "fgprod_0013", name: "Bacon Dog", sizes: { "each": 9.21 } },
    { id: "fgprod_0014", name: "Bacon Cheese Dog", sizes: { "each": 10.32 }, tag: "popular" },
  ],
  "Sandwiches": [
    { id: "fgprod_0021", name: "Patty Melt", sizes: { "each": 12.29 }, tag: "popular" },
    { id: "fgprod_0022", name: "Grilled Cheese", sizes: { "each": 7.37 } },
    { id: "fgprod_0023", name: "Veggie Sandwich", sizes: { "each": 7.37 } },
    { id: "fgprod_0024", name: "Cheese Veggie Sandwich", sizes: { "each": 8.60 } },
    { id: "fgprod_0025", name: "BLT", sizes: { "each": 7.37 } },
  ],
  "Chicken": [
    { id: "dmprod_0081", name: "Chicken Sandwich", sizes: { "each": 11.49 }, tag: "popular" },
    { id: "dmprod_0082", name: "Chicken Tenders", sizes: { "Regular": 9.49, "Large": 13.29 } },
  ],
  "Fries": [
    { id: "fgprod_0031", name: "Fries", sizes: { "Little": 6.14, "Regular": 7.74, "Large": 9.09 }, tag: "bestseller" },
    { id: "fgprod_0032", name: "Cajun Fries", sizes: { "Little": 6.14, "Regular": 7.74, "Large": 9.09 }, tag: "popular" },
    { id: "fgprod_0034", name: "Poutine", sizes: { "each": 13.03 }, tag: "signature" },
  ],
  "Sides": [
    { id: "dmprod_0061", name: "Onion Rings", sizes: { "Regular": 6.99, "Large": 8.49 }, tag: "popular" },
    { id: "dmprod_0062", name: "Sweet Potato Fries", sizes: { "Little": 6.49, "Regular": 7.99, "Large": 9.49 } },
    { id: "dmprod_0063", name: "Side Salad", sizes: { "each": 5.49 } },
  ],
  "Shakes": [
    { id: "fgprod_0041", name: "Hand-Spun Milkshake", sizes: { "each": 9.26 }, tag: "signature" },
  ],
  "Desserts": [
    { id: "dmprod_0071", name: "Sundae", sizes: { "each": 5.99 } },
    { id: "dmprod_0072", name: "Chocolate Chip Cookie", sizes: { "each": 2.49 } },
    { id: "dmprod_0073", name: "Apple Pie", sizes: { "each": 3.49 } },
  ],
  "Drinks": [
    { id: "fgprod_0051", name: "Fountain Drink", sizes: { "Regular": 3.59, "Large": 4.29 } },
    { id: "fgprod_0052", name: "Bottled Water", sizes: { "each": 3.29 } },
    { id: "dmprod_0053", name: "Lemonade", sizes: { "Regular": 3.99, "Large": 4.79 } },
    { id: "dmprod_0054", name: "Iced Tea", sizes: { "Regular": 3.79, "Large": 4.49 } },
    { id: "dmprod_0055", name: "Coffee", sizes: { "Regular": 2.49, "Large": 2.99 } },
  ],
  // Free: the 15 toppings, the lettuce wrap (no bun) and the shake mix-ins, rung up at $0 so the
  // ticket, the kitchen and the receipt carry them.
  "Toppings": [
    { id: "fgtop_01", name: "Mayo", sizes: { "each": 0.00 } },
    { id: "fgtop_02", name: "Lettuce", sizes: { "each": 0.00 } },
    { id: "fgtop_03", name: "Pickles", sizes: { "each": 0.00 } },
    { id: "fgtop_04", name: "Tomatoes", sizes: { "each": 0.00 } },
    { id: "fgtop_05", name: "Grilled Onions", sizes: { "each": 0.00 } },
    { id: "fgtop_06", name: "Raw Onions", sizes: { "each": 0.00 } },
    { id: "fgtop_07", name: "Grilled Mushrooms", sizes: { "each": 0.00 } },
    { id: "fgtop_08", name: "Ketchup", sizes: { "each": 0.00 } },
    { id: "fgtop_09", name: "Mustard", sizes: { "each": 0.00 } },
    { id: "fgtop_10", name: "Relish", sizes: { "each": 0.00 } },
    { id: "fgtop_11", name: "Jalape\u00f1o Peppers", sizes: { "each": 0.00 } },
    { id: "fgtop_12", name: "Green Peppers", sizes: { "each": 0.00 } },
    { id: "fgtop_13", name: "BBQ Sauce", sizes: { "each": 0.00 } },
    { id: "fgtop_14", name: "Hot Sauce", sizes: { "each": 0.00 } },
    { id: "fgtop_15", name: "HP Sauce", sizes: { "each": 0.00 } },
    { id: "fgtop_16", name: "Lettuce Wrap (no bun)", sizes: { "each": 0.00 } },
  ],
  "Mix-ins": [
    { id: "fgmix_01", name: "Bacon (shake mix-in)", sizes: { "each": 0.00 } },
    { id: "fgmix_02", name: "Bananas", sizes: { "each": 0.00 } },
    { id: "fgmix_03", name: "Chocolate", sizes: { "each": 0.00 } },
    { id: "fgmix_04", name: "Oreo Cookie Pieces", sizes: { "each": 0.00 } },
    { id: "fgmix_05", name: "Peanut Butter", sizes: { "each": 0.00 } },
    { id: "fgmix_06", name: "Reese's Peanut Butter Cup", sizes: { "each": 0.00 } },
    { id: "fgmix_07", name: "Salted Caramel", sizes: { "each": 0.00 } },
    { id: "fgmix_08", name: "Strawberries", sizes: { "each": 0.00 } },
    { id: "fgmix_09", name: "Candy Cane Crunch", sizes: { "each": 0.00 }, tag: "seasonal" },
  ],
}

export const CATEGORY_ICONS = {
  "Burgers": "🍔",
  "Hot Dogs": "🌭",
  "Sandwiches": "🥪",
  "Chicken": "🍗",
  "Fries": "🍟",
  "Sides": "🧅",
  "Shakes": "🥤",
  "Desserts": "🍨",
  "Drinks": "🧃",
  "Toppings": "🥬",
  "Mix-ins": "🍓",
}

// Same tag styling as the Gregory's catalog so both look native in the POS.
export const TAG_CONFIG = {
  "bestseller": { "label": "Bestseller", "color": "#CFFF2F", "bg": "#CFFF2F18" },
  "popular":    { "label": "Popular",    "color": "#60A5FA", "bg": "#3B82F618" },
  "signature":  { "label": "Signature",  "color": "#C084FC", "bg": "#A855F718" },
  "seasonal":   { "label": "Seasonal",   "color": "#FB923C", "bg": "#F9731618" },
  "classic":    { "label": "Classic",    "color": "#94A3B8", "bg": "#94A3B818" },
}

// Generic on purpose: what the header, sign-in screen, receipt, order numbers and page title show.
export const BRAND = {
  name: "Demo Restaurant",
  location: "Drive-Thru",
  footer: "Demo menu",
  receiptHeader: "DEMO RESTAURANT",
  receiptSub: "Drive-Thru",
  thankYou: "Enjoy! 🍔",
  orderPrefix: "ord_",
}
