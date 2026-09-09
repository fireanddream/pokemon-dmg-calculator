"""
Convert teams.xlsx back into the master teams.tsv so hand edits in Excel
(sheets Mega/Uber/OU/UU/RU/MISC) are reflected in the TSV.

Rules:
  - Data sheets = Uber, OU, UU, RU, MISC (each row's Tier column is trusted).
  - 'Speed' is a lookup sheet and is ignored.
  - 'Mega' is a derived view; rows there are only added if the same
    (Pokemon + Tags + EV) combo is not already present from the tier sheets,
    so duplicates are kept but copies are not.
  - The existing TSV comment/definition header is preserved.
  - Tags are normalized to canonical order SetUp/Fast/Breaker/Utility/Wall
    joined by ' / '. Stats become plain integers. Row sort matches the master
    file: tier order, megas first, then name.

Usage:
  python xlsx2tsv.py [teams.xlsx] [teams.tsv]
"""
import csv, io, sys
from openpyxl import load_workbook
from _paths import tsv_path, xlsx_path

HEADER = ["Pokemon", "Typing", "Ability", "Tier", "Tags", "EV", "HP", "ATK", "DEF", "SPA", "SPD", "SPE"]
TIER_ORDER = ["AG", "Uber", "OU", "UUBL", "UU", "RUBL", "RU", "below RU", "MISC"]
TAG_ORDER = ["SetUp", "Fast", "Breaker", "Utility", "Wall"]

TIER_TABS = ["Uber", "OU", "UU", "RU", "MISC"]  # canonical source tabs
MEGA_TAB = "Mega"
SKIP_TABS = {"Speed"}


def read_sheet(ws):
    rows = []
    for r in ws.iter_rows(min_row=2):
        vals = [c.value for c in r]
        if vals and vals[0] not in (None, ""):
            rows.append(vals)
    return rows


def normalize_tags(val):
    if val is None:
        return ""
    txt = str(val)
    tokens = [t.strip() for t in txt.replace(",", "/").split("/") if t.strip()]
    tokens = [t for t in tokens if t]
    return " / ".join(sorted(tokens, key=lambda t: TAG_ORDER.index(t) if t in TAG_ORDER else len(TAG_ORDER)))


def clean_row(vals):
    row = list(vals[: len(HEADER)])
    # right-pad to header length; drop values in trailing junk columns beyond header
    row = ["" if v is None else (str(v).strip() if i != 0 else str(v).strip()) for i, v in enumerate(row)]
    while len(row) < len(HEADER):
        row.append("")
    row[HEADER.index("Tags")] = normalize_tags(row[HEADER.index("Tags")])
    # tier: keep the Tier cell value, but guard
    tier = row[HEADER.index("Tier")]
    if tier not in TIER_ORDER:
        print(f"  !! unknown tier {tier!r} for {row[0]!r}")
    # stats as ints-as-strings
    for stat in ("HP", "ATK", "DEF", "SPA", "SPD", "SPE"):
        i = HEADER.index(stat)
        v = row[i]
        row[i] = str(int(float(v))) if str(v).replace(".", "", 1).isdigit() else "0"
    return row


def main():
    xlsx = xlsx_path(sys.argv[1] if len(sys.argv) > 1 else None)
    tsv = tsv_path(sys.argv[2] if len(sys.argv) > 2 else None)

    old_lines = open(tsv, encoding="utf-8").read().splitlines()
    comments = [l for l in old_lines if l.startswith("#")]

    wb = load_workbook(xlsx, data_only=False)
    tier_rows = []
    for tab in TIER_TABS:
        if tab in wb.sheetnames:
            for vals in read_sheet(wb[tab]):
                tier_rows.append(clean_row(vals))
                # ensure a row's own tier matches the tab it lives in
    print(f"tier-tab rows: {len(tier_rows)}")

    # merge Mega tab: keep rows whose (Pokemon, Tags, EV) not already present
    added = 0
    if MEGA_TAB in wb.sheetnames:
        existing = {(r[0], r[4], r[5]) for r in tier_rows}
        for vals in read_sheet(wb[MEGA_TAB]):
            row = clean_row(vals)
            if "Mega" not in row[0]:
                print(f"  !! non-mega {row[0]!r} found in Mega tab")
            if (row[0], row[4], row[5]) not in existing:
                tier_rows.append(row)
                existing.add((row[0], row[4], row[5]))
                added += 1
    print(f"mega-tab additions: {added}")

    def sort_key(r):
        return (
            0 if "Mega" in r[0] else 1,
            TIER_ORDER.index(r[3]) if r[3] in TIER_ORDER else len(TIER_ORDER),
            r[0].lower(),
        )

    tier_rows.sort(key=sort_key)

    out = io.StringIO()
    w = csv.writer(out, delimiter="\t", lineterminator="\n")
    w.writerow(HEADER)
    w.writerows(tier_rows)
    open(tsv, "w", encoding="utf-8", newline="").write("\n".join(comments) + "\n" + out.getvalue())
    print(f"wrote {tsv}: {len(tier_rows)} rows")


if __name__ == "__main__":
    main()
