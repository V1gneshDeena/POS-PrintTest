#!/usr/bin/env python3
"""Generate gregory-pos/src/data/menu.js from the real trained-MLP product catalog.

The POS menu is kept in lock-step with the catalog the upsell ranker trains on, so
POS line-items match what the ranker scores. Source of truth = products_real.json:
the cleaned 584-item Gregory's catalog built from the migrated vavoom_clean order
data (see the ranker-retrain notes). Item names are kept verbatim; items are grouped
by the catalog's own `category` field (reliable) rather than name-keyword guessing.

Usage:  python scripts/build-menu.py [path/to/products_real.json]
Default SRC is the local vtrain working copy.
"""
import json, re, io, sys, os

SRC = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\Shadow\vtrain\products_real.json"
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "menu.js")

items = json.load(open(SRC, encoding="utf-8"))

# Drop pure price-token pseudo-items ("$1", "$2 happy hour", "$3") — order-line
# discount rows, not real products.
JUNK = re.compile(r"^\$?\s*\d+(\.\d+)?(\s+happy\s+hour)?$", re.I)

SEASONAL_KW = ["pumpkin", "fall", "peppermint", "cherry blossom", "maple", "holiday",
               "gingerbread", "summer", "winter", "blue dream", "elderberry"]

# Group by the catalog's category field (from the ETL) — reliable. The real names
# carry sizes/flavors not clean hot/cold tags, and menu_group is null for ~76%.
SECTION_BY_CAT = {"drink": "Drinks", "main": "Food", "dessert": "Bakery & Sweets", "addon": "Extras & Merch"}
SECTION_ORDER = ["Drinks", "Food", "Bakery & Sweets", "Extras & Merch"]

def section_for(it):
    return SECTION_BY_CAT.get(it["category"], "Extras & Merch")

kept = [it for it in items if it["name"].strip() and not JUNK.match(it["name"].strip())]

# popularity threshold for the "popular" tag (top decile by real order frequency)
orders = sorted(it["n_orders"] for it in kept)
pop_cut = orders[int(len(orders) * 0.90)] if orders else 0

def tag_for(it):
    name = it["name"].lower()
    if it.get("seasonal_relevance", 0) >= 0.85 and any(k in name for k in SEASONAL_KW):
        return "seasonal"
    if it.get("is_premium_item"):
        return "signature"
    if it["n_orders"] >= pop_cut and pop_cut > 0:
        return "popular"
    return None

def size_label(it):
    return "bottle" if "water" in it["name"].lower() else "each"

menu = {s: [] for s in SECTION_ORDER}
seen = {}  # (section, name.lower()) -> index, dedupe keeping higher n_orders
for it in kept:
    sec = section_for(it)
    key = (sec, it["name"].strip().lower())
    entry = {
        "id": it["product_id"],
        "name": it["name"].strip(),
        "sizes": {size_label(it): round(float(it["price"]), 2)},
        "tag": tag_for(it),
        "_n": it["n_orders"],
    }
    if key in seen:
        prev = menu[sec][seen[key]]
        if it["n_orders"] > prev.get("_n", 0):
            menu[sec][seen[key]] = entry
        continue
    seen[key] = len(menu[sec])
    menu[sec].append(entry)

# sort each section by popularity (n_orders desc) then name; strip helper field
for sec in menu:
    menu[sec].sort(key=lambda e: (-e["_n"], e["name"].lower()))
    for e in menu[sec]:
        e.pop("_n", None)

total = sum(len(v) for v in menu.values())
print("sections:", {s: len(menu[s]) for s in SECTION_ORDER})
print("total POS items:", total, "(from", len(items), "raw,", len(kept), "after junk filter)")

ICONS = {
    "Drinks": "☕",              # coffee
    "Food": "\U0001F373",            # cooking
    "Bakery & Sweets": "\U0001F9C1", # cupcake
    "Extras & Merch": "\U0001F6CD️",  # shopping bags
}

TAGS = {
    "bestseller": {"label": "Bestseller", "color": "#CFFF2F", "bg": "#CFFF2F18"},
    "popular":    {"label": "Popular",    "color": "#60A5FA", "bg": "#3B82F618"},
    "signature":  {"label": "Signature",  "color": "#C084FC", "bg": "#A855F718"},
    "seasonal":   {"label": "Seasonal",   "color": "#FB923C", "bg": "#F9731618"},
    "classic":    {"label": "Classic",    "color": "#94A3B8", "bg": "#94A3B818"},
}

def jdump(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2)

header = (
    "// Gregory's Coffee — FULL menu, generated from the real trained-MLP catalog.\n"
    "// Source: the cleaned 584-item Gregory's product catalog (products_real.json,\n"
    "// built from the migrated vavoom_clean order data the MLP upsell ranker trains on).\n"
    "// Item names are kept verbatim so POS line-items match the ranker's catalog.\n"
    "// Regenerate via scripts/build-menu.py. Prices = median real order-line price.\n\n"
)

out_path = os.path.normpath(OUT)
with io.open(out_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(header)
    f.write("export const MENU = " + jdump(menu) + "\n\n")
    f.write("export const CATEGORY_ICONS = " + jdump(ICONS) + "\n\n")
    f.write("export const TAG_CONFIG = " + jdump(TAGS) + "\n")

print("wrote", out_path)
