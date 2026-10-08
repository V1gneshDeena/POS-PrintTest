// The burger menu — the POS's default demo menu, shown under GENERIC branding (BRAND below:
// "Demo Restaurant"; David, 2026-10-07: no Five Guys branding on the POS). The items and
// prices were modelled on Five Guys for the scripted Five Guys pilot, which is why the notes
// below cite it; nothing on screen or on the receipt names it.
// Same shape as menu.js (the Gregory's catalog): MENU keyed by category, each
// item { id, name, sizes: {label: price}, tag }, plus CATEGORY_ICONS + TAG_CONFIG.
//
// Prices are representative U.S. averages (from five_guys_menu_research, July 2026);
// Five Guys sets prices per franchise so these are directional, not store-exact.
// Breakfast prices are estimates (Five Guys does not publish them). Free toppings and
// free shake mix-ins are modifiers, not line items. Keep the item list IN SYNC with
// demo-assets/five-guys-menu-board.html.
//
// Burgers: "Little" = single patty, "Regular" = double patty (modeled as sizes).

export const MENU = {
  "Burgers": [
    { id: "fgprod_0001", name: "Hamburger",          sizes: { "Little": 4.59, "Regular": 6.39 }, tag: "classic" },
    { id: "fgprod_0002", name: "Cheeseburger",       sizes: { "Little": 5.29, "Regular": 7.19 }, tag: "popular" },
    { id: "fgprod_0003", name: "Bacon Burger",       sizes: { "Little": 5.59, "Regular": 7.19 } },
    { id: "fgprod_0004", name: "Bacon Cheeseburger", sizes: { "Little": 6.19, "Regular": 7.79 }, tag: "bestseller" },
  ],
  "Hot Dogs": [
    { id: "fgprod_0011", name: "Kosher Style Hot Dog", sizes: { "each": 4.59 }, tag: "classic" },
    { id: "fgprod_0012", name: "Cheese Dog",           sizes: { "each": 5.19 } },
    { id: "fgprod_0013", name: "Bacon Dog",            sizes: { "each": 5.39 } },
    { id: "fgprod_0014", name: "Bacon Cheese Dog",     sizes: { "each": 5.99 }, tag: "popular" },
  ],
  "Sandwiches": [
    { id: "fgprod_0021", name: "Patty Melt",             sizes: { "each": 7.49 }, tag: "popular" },
    { id: "fgprod_0022", name: "Grilled Cheese",         sizes: { "each": 4.49 } },
    { id: "fgprod_0023", name: "Veggie Sandwich",        sizes: { "each": 4.49 } },
    { id: "fgprod_0024", name: "Cheese Veggie Sandwich", sizes: { "each": 4.59 } },
    { id: "fgprod_0025", name: "BLT",                    sizes: { "each": 5.79 } },
  ],
  "Fries": [
    { id: "fgprod_0031", name: "Fries",       sizes: { "Little": 2.79, "Regular": 3.39, "Large": 5.59 }, tag: "bestseller" },
    { id: "fgprod_0032", name: "Cajun Fries", sizes: { "Little": 2.79, "Regular": 3.39, "Large": 5.59 }, tag: "popular" },
    { id: "fgprod_0033", name: "Cheese Fries", sizes: { "Little": 3.49, "Regular": 4.09, "Large": 6.29 } },
  ],
  "Shakes": [
    { id: "fgprod_0041", name: "Hand-Spun Milkshake", sizes: { "each": 5.19 }, tag: "signature" },
  ],
  "Drinks": [
    { id: "fgprod_0051", name: "Fountain Drink", sizes: { "Regular": 2.39, "Large": 2.49 } },
    { id: "fgprod_0052", name: "Bottled Water",  sizes: { "each": 0.99 } },
  ],
  "Breakfast": [
    { id: "fgprod_0061", name: "Egg Sandwich",        sizes: { "each": 4.49 }, tag: "seasonal" },
    { id: "fgprod_0062", name: "Egg & Cheese",        sizes: { "each": 5.29 }, tag: "seasonal" },
    { id: "fgprod_0063", name: "Egg & Bacon",         sizes: { "each": 5.59 }, tag: "seasonal" },
    { id: "fgprod_0064", name: "Bacon, Egg & Cheese", sizes: { "each": 5.99 }, tag: "seasonal" },
  ],
}

export const CATEGORY_ICONS = {
  "Burgers": "🍔",
  "Hot Dogs": "🌭",
  "Sandwiches": "🥪",
  "Fries": "🍟",
  "Shakes": "🥤",
  "Drinks": "🧃",
  "Breakfast": "🍳",
}

// Same tag styling as the Gregory's catalog so both look native in the POS.
export const TAG_CONFIG = {
  "bestseller": { "label": "Bestseller", "color": "#CFFF2F", "bg": "#CFFF2F18" },
  "popular":    { "label": "Popular",    "color": "#60A5FA", "bg": "#3B82F618" },
  "signature":  { "label": "Signature",  "color": "#C084FC", "bg": "#A855F718" },
  "seasonal":   { "label": "Breakfast",  "color": "#FB923C", "bg": "#F9731618" },
  "classic":    { "label": "Classic",    "color": "#94A3B8", "bg": "#94A3B818" },
}

// Free toppings and mix-ins (the pilot's menu board) — not charged on the POS, and not shown
// by it.
export const FREE_TOPPINGS = [
  "Mayo", "Lettuce", "Pickles", "Tomatoes", "Grilled Onions", "Raw Onions",
  "Grilled Mushrooms", "Jalapeños", "Green Peppers", "Ketchup", "Mustard",
  "Relish", "Bar-B-Que Sauce", "Hot Sauce", "A.1. Steak Sauce",
]
export const FREE_MIXINS = [
  "Bananas", "Strawberries", "Blackberry", "Oreo Cookies", "Oreo Crème",
  "Peanut Butter", "Bacon", "Salted Caramel", "Reese's Cups", "Chocolate", "Coffee",
]

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
