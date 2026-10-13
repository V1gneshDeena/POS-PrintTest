"""Add the demo menu's own items (David, 2026-10-12: more sides, drinks, desserts and chicken, so the upsell
has real options and real alternatives) to the burger menu's knowledge base, src/data/menu-kb.json.

    python -I scripts/add-demo-items.py

Run it after scripts/build-menu-kb.py, which rebuilds the file from the Five Guys Canada guide and would
leave these out. These items are not on that guide: their descriptions, prices, calories and allergens
are our own estimates from standard recipes, marked "estimated" on every item, and a franchise would
replace them with its own. Each fried item carries the same peanut-oil caution as the fries (one fryer
oil), which the POS and the brain both read as peanuts. Re-running replaces these items and changes
nothing else. The POS's catalogue (src/data/menu-fiveguys.js) lists the same items with the same prices.
"""
import json
from pathlib import Path

KB_PATH = Path(__file__).resolve().parent.parent / "src" / "data" / "menu-kb.json"
FRYER = "Fried in the same 100% refined peanut oil as the fries."
EST = "demo addition (2026-10-12): our own standard-recipe estimate, not from the guide"

# name: (category, description, {size: (price, calories)}, allergens, cautions, calories_note)
ITEMS = {
    "Chicken Sandwich": ("Chicken", "Crispy fried chicken breast with pickles and mayo on a toasted sesame bun.",
                         {"each": (11.49, 640)}, ["eggs", "milk", "sesame", "soy", "wheat"], [FRYER], ""),
    "Chicken Tenders": ("Chicken", "Hand-breaded chicken tenders, three (Regular) or five (Large), with a dipping sauce.",
                        {"Regular": (9.49, 420), "Large": (13.29, 700)}, ["eggs", "milk", "soy", "wheat"], [FRYER], ""),
    "Onion Rings": ("Sides", "Thick-cut onion rings in a crispy batter.",
                    {"Regular": (6.99, 480), "Large": (8.49, 720)}, ["milk", "soy", "wheat"], [FRYER], ""),
    "Sweet Potato Fries": ("Sides", "Fresh-cut sweet potato fries with a pinch of salt.",
                           {"Little": (6.49, 290), "Regular": (7.99, 430), "Large": (9.49, 620)}, [], [FRYER], ""),
    "Side Salad": ("Sides", "Mixed greens, tomato and cucumber with buttermilk ranch dressing.",
                   {"each": (5.49, 190)}, ["eggs", "milk"], [], ""),
    "Lemonade": ("Drinks", "Fresh-squeezed lemonade over ice.",
                 {"Regular": (3.99, 220), "Large": (4.79, 320)}, [], [], ""),
    "Iced Tea": ("Drinks", "Lightly sweetened black iced tea with lemon.",
                 {"Regular": (3.79, 120), "Large": (4.49, 170)}, [], [], ""),
    "Coffee": ("Drinks", "Fresh-brewed hot coffee.",
               {"Regular": (2.49, 5), "Large": (2.99, 10)}, [], [], "black; milk and cream on request"),
    "Sundae": ("Desserts", "Vanilla and chocolate ice cream with hot fudge.",
               {"each": (5.99, 380)}, ["milk", "soy"], [], ""),
    "Chocolate Chip Cookie": ("Desserts", "A big, soft-baked chocolate chip cookie.",
                              {"each": (2.49, 220)}, ["eggs", "milk", "soy", "wheat"], [], ""),
    "Apple Pie": ("Desserts", "A slice of apple pie with a lattice crust.",
                  {"each": (3.49, 290)}, ["milk", "soy", "wheat"], [], ""),
}


def main():
    kb = json.loads(KB_PATH.read_text(encoding="utf-8"))
    for name, (cat, desc, sizes, allergens, cautions, cal_note) in ITEMS.items():
        kb["items"][name] = {
            "category": cat,
            "description": desc,
            "sizes": {s: {"price": p, "parts": {}, "nutrition": {"calories": c}, "calories": c} for s, (p, c) in sizes.items()},
            "allergens": sorted(allergens),
            "cautions": cautions,
            "estimated": EST,
            "price_note": "demo price (estimate)",
            "calories_note": cal_note,
            "lettuce_wrap": False,
            "ingredients": {},
        }
    note = " Demo additions (2026-10-12, scripts/add-demo-items.py): " + ", ".join(ITEMS) + " — estimated values, not from the guide."
    if "Demo additions" not in kb["_doc"]:
        kb["_doc"] += note
    KB_PATH.write_text(json.dumps(kb, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(ITEMS)} demo items in {KB_PATH.name}; {len(kb['items'])} items in all")


if __name__ == "__main__":
    main()
