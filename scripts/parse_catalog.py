#!/usr/bin/env python3
"""Parse ~/workspace/jad_price_list.md into structured catalog JSON.

Output: data/catalog.json — list of items:
  {id, section, name, size, sizeLabel, unit, price, insulated, kind, laborKey, greenPrice}
Sections: gasket (جوان PPH), ppr (بولي PPR), white (أبيض uPVC), other (منتجات أخرى)
kind: pipe | fitting | valve | crank | other
unit: meter | piece
laborKey: pipe_25 | pipe_32 | pipe_50 | fit_weld_25 | fit_weld_32 | fit_weld_50
          | fit_weld_63 | fit_thread | valve_concealed | crank | percent | none
"""
import json, re, os, unicodedata

SRC = os.path.expanduser("~/workspace/jad_price_list.md")
DST = os.path.expanduser("~/workspace/jad-therm-standalone/data/catalog.json")

SECTION_MAP = {
    "قسم الجوان": "gasket",
    "قسم البولي": "ppr",
    "قسم الأبيض": "white",
    "منتجات أخرى": "other",
}

def num(s):
    s = str(s).strip().replace(",", "").replace("٬", "")
    try:
        return float(s)
    except Exception:
        return None

def clean_size(s):
    """Normalize a size cell to (size_value, size_label)."""
    s = str(s).strip()
    # "م. ماسورة 25 ض 20" -> 25 ; "20 * 1/2" -> "20*1/2" ; "2*3" stays
    m = re.search(r"ماسورة\s+(\d+)", s)
    if m:
        return m.group(1), m.group(1)
    s2 = s.replace(" ", "")
    return s2, s2

def size_mm(section, size_label):
    """Convert a size label to mm number when possible (PPR sizes are mm already;
    white/gasket sizes are inches as listed -> keep as inch number)."""
    s = str(size_label).strip()
    if re.fullmatch(r"\d+(\.\d+)?", s):
        return float(s)
    return None

def kind_of(section, name):
    n = name
    if "ماسورة" in n or "مواسير" in n or "ياردة" in n:
        return "pipe"
    if "كرنك" in n:
        return "crank"
    if "محبس" in n:
        return "valve"
    if any(w in n for w in ["أفيز", "عازل", "غراء", "شحم", "مثبت"]):
        return "other"
    return "fitting"

def labor_key(section, name, size_label, insulated):
    """Map item -> labor rule key (per Rony's rates)."""
    kind = kind_of(section, name)
    mm = size_mm(section, size_label)
    is_ppr = section == "ppr"
    if kind == "pipe":
        if is_ppr and mm in (25.0,):
            return "pipe_25"
        if is_ppr and mm in (32.0,):
            return "pipe_32"
        if is_ppr and mm in (50.0,):
            return "pipe_50"
        if section in ("white", "gasket"):
            return "percent"
        return "none"
    if kind == "crank":
        return "crank"
    if kind == "valve":
        if "دفن" in name:
            return "valve_concealed"
        return "none"
    if kind == "fitting":
        if section in ("white", "gasket"):
            return "percent"
        if "بسن" in name:
            return "fit_thread"
        if "لحام" in name or name in ("كوع لحام", "جلبة لحام", "تي لحام", "طبة لحام"):
            if mm == 25.0:
                return "fit_weld_25"
            if mm == 32.0:
                return "fit_weld_32"
            if mm == 50.0:
                return "fit_weld_50"
            if mm == 63.0:
                return "fit_weld_63"
            return "none"
        if is_ppr and mm in (25.0, 32.0, 50.0, 63.0):
            # generic PPR fittings (تي مسلوب، جلبة مسلوب...) count as weld fittings
            return {25.0: "fit_weld_25", 32.0: "fit_weld_32",
                    50.0: "fit_weld_50", 63.0: "fit_weld_63"}[mm]
        return "none"
    return "none"

items = []
section = None
item_name = None
seen = set()

def add(section, name, size_label, price, insulated, unit):
    if price is None or price == 0:
        return
    key = (section, name, size_label, insulated)
    if key in seen:
        return
    seen.add(key)
    kind = kind_of(section, name)
    items.append({
        "section": section,
        "name": name.strip(),
        "size": size_label,
        "unit": unit,
        "price": price,
        "insulated": bool(insulated),
        "kind": kind,
        "laborKey": labor_key(section, name, size_label, insulated),
    })

with open(SRC, encoding="utf-8") as f:
    lines = f.read().splitlines()

i = 0
while i < len(lines):
    line = lines[i]
    # section headers
    m = re.match(r"##\s+\d+\)\s+(.*)", line)
    if m:
        for k, v in SECTION_MAP.items():
            if k in m.group(1):
                section = v
                break
        i += 1
        continue
    # item headers
    m = re.match(r"####\s+(.*)", line)
    if m and section:
        item_name = m.group(1).strip()
        i += 1
        continue
    # tables
    if line.strip().startswith("|") and section and item_name:
        # collect table block
        tbl = []
        while i < len(lines) and lines[i].strip().startswith("|"):
            tbl.append(lines[i].strip())
            i += 1
        if len(tbl) < 3:
            continue
        header = [c.strip() for c in tbl[0].strip("|").split("|")]
        rows = []
        for r in tbl[2:]:
            rows.append([c.strip() for c in r.strip("|").split("|")])

        def col(keyword):
            for j, h in enumerate(header):
                if keyword in h:
                    return j
            return None

        gi = col("أخضر")
        ii = col("معزول")
        pi = col("السعر")
        si = col("المقاس")
        # detect table shape
        if gi is not None and ii is not None:
            for r in rows:
                if len(r) <= max(si, gi, ii):
                    continue
                sv, sl = clean_size(r[si])
                add(section, item_name, sl, num(r[gi]), False,
                    "meter" if kind_of(section, item_name) == "pipe" else "piece")
                add(section, item_name, sl, num(r[ii]), True,
                    "meter" if kind_of(section, item_name) == "pipe" else "piece")
        elif len(header) >= 3 and si == 0 and all(
                re.fullmatch(r"[\d./*]+", h) for h in header[1:]):
            # size columns, single price row
            for r in rows:
                if not r or "السعر" not in r[0]:
                    continue
                for j, h in enumerate(header[1:], start=1):
                    if j < len(r):
                        add(section, item_name, h, num(r[j]), False,
                            "meter" if kind_of(section, item_name) == "pipe" else "piece")
        elif pi is not None:
            # pipe tables: unit meter
            unit = "meter" if kind_of(section, item_name) == "pipe" else "piece"
            ins = "معزول" in item_name
            ti = col("النوع")
            thi = col("السمك")
            for r in rows:
                if len(r) <= pi:
                    continue
                if si is not None and len(r) > si:
                    sv, sl = clean_size(r[si])
                else:
                    sl = ""
                nm = item_name
                if ti is not None and len(r) > ti and r[ti]:
                    nm = item_name + " " + r[ti]
                if thi is not None and len(r) > thi and r[thi]:
                    sl = sl + " سمك " + r[thi] if sl else "سمك " + r[thi]
                add(section, nm, sl, num(r[pi]), ins, unit)
        continue
    i += 1

# greenPrice for insulated items: match same section+name+size green twin
index = {}
for it in items:
    if not it["insulated"]:
        index[(it["section"], it["name"], it["size"])] = it["price"]
# also match insulated pipes to green pipes of same size (names differ by ضغط)
for it in items:
    if it["insulated"]:
        key = (it["section"], it["name"], it["size"])
        if key in index:
            it["greenPrice"] = index[key]
        else:
            # pipe fallback: any green pipe same section+size
            for o in items:
                if (not o["insulated"] and o["section"] == it["section"]
                        and o["kind"] == "pipe" and o["size"] == it["size"]):
                    it["greenPrice"] = o["price"]
                    break

# ids
for n, it in enumerate(items, 1):
    it["id"] = n

with open(DST, "w", encoding="utf-8") as f:
    json.dump(items, f, ensure_ascii=False, indent=1)

from collections import Counter
print("total items:", len(items))
print(Counter((it["section"], it["kind"]) for it in items))
print(Counter(it["laborKey"] for it in items))
print("sample:", json.dumps(items[:3], ensure_ascii=False))
