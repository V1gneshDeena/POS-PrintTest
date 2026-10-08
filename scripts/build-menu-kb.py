"""Build the burger menu's knowledge base (src/data/menu-kb.json) from the Five Guys Canada
Nutrition, Ingredient & Allergen Guide (PDF: page 1 "CA 12-2023" nutrition + allergen table,
page 2 "CA 10-2024" ingredient listing).

    python -I scripts/build-menu-kb.py <path to five-guys-canada-ingredient--allergen-guide-english.pdf>

What it writes, per POS item: a description (our own words, from fiveguys.ca), the parts it is
made of per size (bun, patties, cheese slices, bacon...), calories and the other nutrition
summed from those parts, the union of the parts' allergens, the parts' ingredient lists,
cautions (peanut oil, cross-contact), and the Canadian price per size with its source. Plus
the 15 free toppings, the lettuce wrap, the shake mix-ins and the extras, each with
calories and allergens. The POS (menuKnowledge.js) and the voice-print store's SQLite copy
both read this file.

Composition marked "estimated" is ours where the guide gives only the parts (Patty Melt,
Grilled Cheese, BLT, the dogs' bun, Poutine). Prices are from one store's online menu and
vary by franchise. The PDF is read as untrusted input; run with python -I.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import fitz  # PyMuPDF

PDF = sys.argv[1]
OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "menu-kb.json"
NUTRI = ["serving_g", "calories", "fat_calories", "fat_g", "sat_fat_g", "trans_fat_g", "cholesterol_mg",
         "sodium_mg", "carbs_g", "fiber_g", "sugars_g", "protein_g"]
ALLERGENS = ["crustaceans_mollusks", "eggs", "fish", "milk", "mustard", "peanuts", "sesame", "soy",
             "sulphites", "tree_nuts", "wheat"]
COLS = NUTRI + ALLERGENS

doc = fitz.open(PDF)


def num(s):
    s = str(s).replace("<", "").strip()
    try:
        return float(s) if "." in s else int(s)
    except ValueError:
        return None


# ── Page 1: the nutrition + allergen table (rotated column headers; rows by position) ──
p = doc[0]
W = p.get_text("words")
hdr = [w for w in W if 140 < w[1] < 216 and w[0] > 125 and w[3] - w[1] > w[2] - w[0]]
cols = []
for w in sorted(hdr, key=lambda w: w[0]):
    cx = (w[0] + w[2]) / 2
    if cols and abs(cols[-1] - cx) < 7:
        continue
    cols.append(cx)
merged = []
for cx in cols:  # "Calories from / Fat" and "Wheat & / Triticale" are two header words each
    if merged and cx - merged[-1] < 10:
        merged[-1] = (merged[-1] + cx) / 2
    else:
        merged.append(cx)
assert len(merged) == len(COLS), f"expected {len(COLS)} columns, found {len(merged)}"
first = merged[0] - 14
lines = {}
for w in W:
    if w[1] < 216:
        continue
    y = round((w[1] + w[3]) / 2)
    key = next((k for k in lines if abs(k - y) <= 2), y)
    lines.setdefault(key, []).append(w)
table = {}
for y in sorted(lines):
    ws = sorted(lines[y], key=lambda w: w[0])
    label = " ".join(w[4] for w in ws if w[2] < first).strip()
    vals = {}
    for w in ws:
        if w[2] < first:
            continue
        cx = (w[0] + w[2]) / 2
        i = min(range(len(merged)), key=lambda j: abs(merged[j] - cx))
        vals[COLS[i]] = w[4]
    if not label or not any(c in vals for c in NUTRI):
        continue
    table[label] = {
        "nutrition": {c: num(vals[c]) for c in NUTRI if c in vals and num(vals[c]) is not None},
        "allergens": [a for a in ALLERGENS if vals.get(a) == "•"],
    }

# ── Page 2: ingredient listing, plus the rows added in the 10-2024 revision ──
text = doc[1].get_text("text")
NAMES2 = ["Bacon", "Hamburger Patty", "Hot Dog", "Bun", "Five Guys Style", "Cajun Style (Supplier M)",
          "Cajun Style (Supplier R)", "BBQ Sauce", "Cheese", "Green Peppers", "Grilled Mushrooms", "Hot Sauce",
          "HP Sauce", "Jalapeño Peppers", "Ketchup", "Lettuce", "Mayonnaise", "Mustard", "Onions / Grilled Onions",
          "Pickles", "Relish", "Tomatoes", "Vanilla Shake Base", "Whipped Cream", "Banana", "Candy Cane Crunch",
          "Chocolate", "Oreo® Cookie Pieces", "Peanut Butter", "Reese’s® Peanut Butter Cup", "Salted Caramel",
          "Strawberry", "Peanuts", "Poutine Gravy", "Cheese Curd", "Malt Vinegar", "Sea Salt", "White Vinegar"]
SKIP = re.compile(r"^(MEAT|BUN|FRIES|TOPPINGS|MILKSHAKES|MIX-INS|OTHER ITEMS|INGREDIENT LISTING|NUTRITION/ALLERGEN.*|[0-9.<•]+)$")
letters = lambda s: re.sub(r"[^a-z]", "", s.lower())  # noqa: E731 — "Reese’s ® Peanut Butter Cup" vs "Reese’s® ..."
BY_LETTERS = {letters(n): n for n in NAMES2}
BY_LETTERS[letters("Malt Vinegar (1tbs)")] = None  # a nutrition row label on page 2, not an ingredient entry
ingredients = {}
cur = None
raw_lines = [x.strip() for x in text.splitlines()]
skip_next = False
for i, line in enumerate(raw_lines):
    if skip_next:
        skip_next = False
        continue
    if not line or SKIP.match(line):
        continue
    nxt = raw_lines[i + 1] if i + 1 < len(raw_lines) else ""
    if letters(line + nxt) in BY_LETTERS and letters(line) not in BY_LETTERS:
        # A name the PDF breaks over two lines ("Oreo" / "® Cookie Pieces").
        cur = BY_LETTERS[letters(line + nxt)]
        ingredients.setdefault(cur, "")
        skip_next = True
        continue
    if letters(line) in BY_LETTERS:
        cur = BY_LETTERS[letters(line)]
        if cur:
            ingredients.setdefault(cur, "")
        continue
    if cur is None:
        continue
    if cur and not ingredients[cur].endswith(line):
        ingredients[cur] = (ingredients[cur] + " " + line).strip()
# Nutrition rows printed on page 2 (cheese curd, vinegars): name followed by its 12 values.
tokens = [t.strip() for t in text.splitlines() if t.strip()]
for name in ("Cheese Curd", "Malt Vinegar (1tbs)", "White Vinegar"):
    for i in range(len(tokens) - 12):
        if tokens[i] == name and all(num(t) is not None for t in tokens[i + 1:i + 13]):
            table[name] = {"nutrition": dict(zip(NUTRI, [num(t) for t in tokens[i + 1:i + 13]])), "allergens": []}


def contains(name):
    m = re.search(r"Contains?:\s*([^.]+)", ingredients.get(name, ""))
    if not m:
        return []
    words = m.group(1).lower()
    out = [a for a, pat in [("eggs", r"egg"), ("milk", r"milk"), ("sesame", r"sesame"), ("soy", r"soy"),
                            ("wheat", r"wheat|gluten"), ("mustard", r"mustard"), ("peanuts", r"peanut"),
                            ("sulphites", r"sulphite"), ("tree_nuts", r"tree nut"), ("fish", r"\bfish"),
                            ("barley", r"barley")] if re.search(pat, words)]
    return out


# ── Parts: page-1 rows (and page-2 rows) under one key each, with their ingredient lists ──
PARTS = {
    "bun": ("Bun", "Bun"), "patty": ("Hamburger Patty", "Hamburger Patty"), "bacon": ("Bacon (2 pieces)", "Bacon"),
    "hot_dog": ("Hot Dog", "Hot Dog"), "cheese": ("Cheese (1 slice)", "Cheese"),
    "fries_little": ("Little Five Guys Style", "Five Guys Style"), "fries_regular": ("Regular Five Guys Style", "Five Guys Style"),
    "fries_large": ("Large Five Guys Style", "Five Guys Style"), "cajun_little": ("Little Cajun Style", "Cajun Style (Supplier M)"),
    "cajun_regular": ("Regular Cajun Style", "Cajun Style (Supplier M)"), "cajun_large": ("Large Cajun Style", "Cajun Style (Supplier M)"),
    "shake_base": ("Vanilla Shake Base", "Vanilla Shake Base"), "whipped_cream": ("Whipped Cream", "Whipped Cream"),
    "cheese_curd": ("Cheese Curd", "Cheese Curd"), "poutine_gravy": ("Poutine Gravy", "Poutine Gravy"),
    "peanuts": ("Bulk Peanuts (1oz.)", "Peanuts"), "malt_vinegar": ("Malt Vinegar (1tbs)", "Malt Vinegar"),
}
TOPPINGS = [  # the 15 free toppings (Canada guide: HP Sauce, where fiveguys.ca's page shows A1)
    ("Mayo", "Mayonnaise"), ("Lettuce", "Lettuce"), ("Pickles", "Pickles"), ("Tomatoes", "Tomatoes"),
    ("Grilled Onions", "Onions / Grilled Onions"), ("Raw Onions", "Onions / Grilled Onions"),
    ("Grilled Mushrooms", "Grilled Mushrooms"), ("Ketchup", "Ketchup"), ("Mustard", "Mustard"), ("Relish", "Relish"),
    ("Jalapeño Peppers", "Jalapeño Peppers"), ("Green Peppers", "Green Peppers"), ("BBQ Sauce", "BBQ Sauce"),
    ("Hot Sauce", "Hot Sauce"), ("HP Sauce", "HP Sauce"),
]
# The bacon mix-in is named "Bacon (shake mix-in)" so "with bacon" on a burger never reads as it.
MIXINS = [("Bacon (shake mix-in)", "Bacon", "Bacon"), ("Bananas", "Banana", "Banana"), ("Chocolate", "Chocolate", "Chocolate"),
          ("Oreo Cookie Pieces", "Oreo® Cookie Pieces", "Oreo® Cookie Pieces"), ("Peanut Butter", "Peanut Butter", "Peanut Butter"),
          ("Reese's Peanut Butter Cup", "Reese’s® Peanut Butter Cup", "Reese’s® Peanut Butter Cup"),
          ("Salted Caramel", "Salted Caramel", "Salted Caramel"), ("Strawberries", "Strawberry", "Strawberry"),
          ("Candy Cane Crunch", "Candy Cane Crunch", "Candy Cane Crunch")]


def slug(name):
    a = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]+", "_", a.lower()).strip("_")


def table_row(label):
    # Page-1 labels can carry stray characters (®, ’); match on letters only.
    key = re.sub(r"[^a-z]", "", label.lower())
    for k, v in table.items():
        if re.sub(r"[^a-z]", "", k.lower()) == key:
            return v
    raise KeyError(label)


parts = {}
for key, (row, ing) in PARTS.items():
    r = table_row(row)
    parts[key] = {"name": row, "nutrition": r["nutrition"], "allergens": sorted(set(r["allergens"]) | set(contains(ing))),
                  "ingredients": ingredients.get(ing, "")}
for name, ing in TOPPINGS:
    r = table_row(ing if ing != "Mayonnaise" else "Mayonnaise")
    parts["top_" + slug(name)] = {
        "name": name, "nutrition": r["nutrition"], "allergens": sorted(set(r["allergens"]) | set(contains(ing))), "ingredients": ingredients.get(ing, "")}
for name, row, ing in MIXINS:
    mixrows = [k for k in table if re.sub(r"[^a-z]", "", k.lower()) == re.sub(r"[^a-z]", "", row.lower())]
    r = table[mixrows[-1]]  # the MIX-INS row (Bacon also appears under MEAT, same values)
    parts["mix_" + slug(name)] = {
        "name": name, "nutrition": r["nutrition"], "allergens": sorted(set(r["allergens"]) | set(contains(ing))), "ingredients": ingredients.get(ing, "")}

# ── POS items: what each is made of, per size, and its Canadian price ──
PRICE_SOURCE = "Five Guys, 770 Gardiners Rd, Kingston ON — online menu (order.online), read 2026-10-08; prices vary by franchise"
B = lambda **kw: kw  # noqa: E731
ITEMS = {
    "Hamburger": dict(cat="Burgers", desc="Fresh, hand-formed beef patties off the grill on a toasted sesame seed bun, with any of the free toppings. Little = one patty, Regular = two.",
                      sizes={"Little": (B(bun=1, patty=1), 10.20), "Regular": (B(bun=1, patty=2), 13.64)}),
    "Cheeseburger": dict(cat="Burgers", desc="American-style cheese melted over fresh beef patties on a toasted sesame seed bun, with any free toppings. One slice per patty.",
                         sizes={"Little": (B(bun=1, patty=1, cheese=1), 11.92), "Regular": (B(bun=1, patty=2, cheese=2), 16.10)}),
    "Bacon Burger": dict(cat="Burgers", desc="Fresh beef patties layered with crispy applewood-smoked bacon on a toasted sesame seed bun, with any free toppings.",
                         sizes={"Little": (B(bun=1, patty=1, bacon=1), 11.92), "Regular": (B(bun=1, patty=2, bacon=1), 15.98)}),
    "Bacon Cheeseburger": dict(cat="Burgers", desc="Beef patties with American-style cheese and applewood-smoked bacon on a toasted sesame seed bun, with any free toppings.",
                               sizes={"Little": (B(bun=1, patty=1, cheese=1, bacon=1), 13.64), "Regular": (B(bun=1, patty=2, cheese=2, bacon=1), 17.21)}),
    "Hot Dog": dict(cat="Hot Dogs", desc="All-beef hot dog, split and grilled lengthwise for a caramelized outside, with any free toppings.",
                    sizes={"each": (B(bun=1, hot_dog=1), 7.98)}, estimated="bun assumed to be the guide's sesame bun"),
    "Cheese Dog": dict(cat="Hot Dogs", desc="The grilled all-beef hot dog with a layer of American-style cheese, with any free toppings.",
                       sizes={"each": (B(bun=1, hot_dog=1, cheese=1), 9.09)}, estimated="bun assumed to be the guide's sesame bun"),
    "Bacon Dog": dict(cat="Hot Dogs", desc="The grilled all-beef hot dog with a layer of applewood-smoked bacon, with any free toppings.",
                      sizes={"each": (B(bun=1, hot_dog=1, bacon=1), 9.21)}, estimated="bun assumed to be the guide's sesame bun"),
    "Bacon Cheese Dog": dict(cat="Hot Dogs", desc="The grilled all-beef hot dog with American-style cheese and applewood-smoked bacon, with any free toppings.",
                             sizes={"each": (B(bun=1, hot_dog=1, cheese=1, bacon=1), 10.32)}, estimated="bun assumed to be the guide's sesame bun"),
    "Patty Melt": dict(cat="Sandwiches", desc="Beef patties and melted American-style cheese with grilled onions on a grilled, inside-out sesame seed bun.",
                       sizes={"each": (B(bun=1, patty=2, cheese=2, top_grilled_onions=1), 12.29)}, estimated="composition is ours: two patties, two slices, grilled onions"),
    "Grilled Cheese": dict(cat="Sandwiches", desc="American-style cheese melted on an inside-out sesame seed bun, grilled until golden, with any free toppings.",
                           sizes={"each": (B(bun=1, cheese=2), 7.37)}, estimated="two slices of cheese assumed"),
    "Veggie Sandwich": dict(cat="Sandwiches", desc="Grilled onions, mushrooms and green peppers with lettuce and tomatoes on a toasted sesame seed bun. Not a veggie burger.",
                            sizes={"each": (B(bun=1, top_grilled_onions=1, top_grilled_mushrooms=1, top_green_peppers=1, top_lettuce=1, top_tomatoes=1), 7.37)},
                            price_note="not on the Kingston online menu; priced like the Grilled Cheese"),
    "Cheese Veggie Sandwich": dict(cat="Sandwiches", desc="The Veggie Sandwich with slices of American-style cheese. Not a veggie burger.",
                                   sizes={"each": (B(bun=1, cheese=2, top_grilled_onions=1, top_grilled_mushrooms=1, top_green_peppers=1, top_lettuce=1, top_tomatoes=1), 8.60)},
                                   price_note="not on the Kingston online menu; priced like the BLT with Cheese"),
    "BLT": dict(cat="Sandwiches", desc="Crispy applewood-smoked bacon, fresh tomato slices, mayo and hand-shredded lettuce on a toasted sesame seed bun.",
                sizes={"each": (B(bun=1, bacon=2, top_lettuce=1, top_tomatoes=1, top_mayo=1), 7.37)}, estimated="four strips of bacon assumed"),
    "Fries": dict(cat="Fries", desc="Five Guys Style: fresh-cut boardwalk fries, cooked twice in 100% refined peanut oil, firm outside and soft inside.",
                  sizes={"Little": (B(fries_little=1), 6.14), "Regular": (B(fries_regular=1), 7.74), "Large": (B(fries_large=1), 9.09)}),
    "Cajun Fries": dict(cat="Fries", desc="The same fresh-cut fries, cooked in 100% refined peanut oil and finished with plenty of Cajun seasoning.",
                        sizes={"Little": (B(cajun_little=1), 6.14), "Regular": (B(cajun_regular=1), 7.74), "Large": (B(cajun_large=1), 9.09)}),
    "Poutine": dict(cat="Fries", desc="Fresh-cut fries topped with Canadian cheese curds and poutine gravy.",
                    sizes={"each": (B(fries_regular=1, cheese_curd=1, poutine_gravy=1), 13.03)}, estimated="regular fries + 100 g cheese curd + one gravy serving"),
    "Hand-Spun Milkshake": dict(cat="Shakes", desc="Hand-spun vanilla milkshake with whipped cream; mix in any of the shake mix-ins.",
                                sizes={"each": (B(shake_base=1, whipped_cream=1), 9.26)}),
    "Fountain Drink": dict(cat="Drinks", desc="Coca-Cola products from the fountain.",
                           sizes={"Regular": ({}, 3.59), "Large": ({}, 4.29)}, price_note="Regular priced like a 500 mL bottle; Large is an estimate",
                           calories_note="depends on the drink chosen; not in the guide"),
    "Bottled Water": dict(cat="Drinks", desc="DASANI bottled water.", sizes={"each": ({}, 3.29)}, calories_fixed=0),
}
CAUTIONS = {
    "fries": "Fries are cooked in 100% refined peanut oil.",
    "cross": "Five Guys warns that cross-contact is possible in its kitchens (bulk peanuts are served in store).",
}


def total(comp):
    out = {}
    for k, n in comp.items():
        for c, v in parts[k]["nutrition"].items():
            if c == "serving_g" or v is None:
                continue
            out[c] = round(out.get(c, 0) + v * n, 1)
    return out


items = {}
for name, it in ITEMS.items():
    sizes = {}
    allergens = set()
    for size, (comp, price) in it["sizes"].items():
        for k in comp:
            allergens |= set(parts[k]["allergens"])
        nut = total(comp) if comp else {}
        if "calories_fixed" in it:
            nut = {"calories": it["calories_fixed"]}
        sizes[size] = {"price": price, "parts": comp, "nutrition": nut, "calories": nut.get("calories")}
    cautions = []
    if any(k.startswith(("fries_", "cajun_")) for s in it["sizes"].values() for k in s[0]):
        cautions.append(CAUTIONS["fries"])
    if it["cat"] not in ("Drinks",):
        cautions.append(CAUTIONS["cross"])
    items[name] = {
        "category": it["cat"], "description": it["desc"], "sizes": sizes, "allergens": sorted(allergens),
        "cautions": cautions, "estimated": it.get("estimated", ""), "price_note": it.get("price_note", ""),
        "calories_note": it.get("calories_note", ""),
        "lettuce_wrap": bool(any("bun" in s[0] for s in it["sizes"].values())),
        "ingredients": {parts[k]["name"]: parts[k]["ingredients"] for s in it["sizes"].values() for k in s[0]},
    }

toppings = [{"name": n, "key": "top_" + slug(n), "price": 0.0, "free": True,
             "calories": parts["top_" + slug(n)]["nutrition"].get("calories"),
             "allergens": parts["top_" + slug(n)]["allergens"]} for n, _ in TOPPINGS]
toppings.append({"name": "Lettuce Wrap (no bun)", "key": "lettuce_wrap", "price": 0.0, "free": True, "calories": -parts["bun"]["nutrition"]["calories"],
                 "allergens": [], "replaces": "bun", "note": "the bun swapped for lettuce: removes the bun's eggs, milk, sesame, soy and wheat"})
mixins = [{"name": n, "key": "mix_" + slug(n), "price": 0.0, "free": True,
           "calories": parts["mix_" + slug(n)]["nutrition"].get("calories"),
           "allergens": parts["mix_" + slug(n)]["allergens"],
           "seasonal": n == "Candy Cane Crunch"} for n, _, _ in MIXINS]

kb = {
    "_doc": "Burger-menu knowledge base for Vavoom Assist (RAG): built by scripts/build-menu-kb.py from the Five Guys Canada "
            "Nutrition, Ingredient & Allergen Guide (page 1 CA 12-2023, page 2 CA 10-2024) and one Ontario store's online prices. "
            "Do not edit by hand; rerun the script. Allergens are the guide's 11 columns plus barley (malt vinegar).",
    "source": {"guide": "Five Guys Canada Nutrition, Ingredient & Allergen Guide (fiveguys.ca, accurate as of 12-2023 / 10-2024)",
               "prices": PRICE_SOURCE, "descriptions": "written for Vavoom from fiveguys.ca menu pages (2026-10-08)"},
    "allergens": ALLERGENS + ["barley"],
    "cautions": CAUTIONS,
    "items": items, "toppings": toppings, "mixins": mixins,
    "parts": parts,
}
OUT.write_text(json.dumps(kb, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {OUT} — {len(items)} items, {len(toppings)} toppings, {len(mixins)} mix-ins, {len(parts)} parts")
for n, it in items.items():
    print(f"  {n:24} {', '.join(f'{s} ${v['price']:.2f} {v['calories']} cal' for s, v in it['sizes'].items())} | {','.join(it['allergens'])}")
