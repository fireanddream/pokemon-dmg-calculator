"""
Add a pokemon row to teams.tsv. Duplicates are allowed (same name, different
build/set/EV). Re-sorts the file by (tier order, mega first, name, original order).

Usage:
  python add-row.py "Name" "Typing" "Ability" "Tier" "Tags" "EV" HP ATK DEF SPA SPD SPE
  python add-row.py --file rows.tsv     # append every line in rows.tsv
Fields after Tags/EV may be empty strings "".
Tier must be one of: AG Uber OU UUBL UU RUBL RU "below RU" MISC
"""
import csv, io, sys
from _paths import tsv_path

path = tsv_path()

TIER_ORDER = ["AG", "Uber", "OU", "UUBL", "UU", "RUBL", "RU", "below RU", "MISC"]
HEADER = ["Pokemon", "Typing", "Ability", "Tier", "Tags", "EV", "HP", "ATK", "DEF", "SPA", "SPD", "SPE"]


def load():
    lines = open(path, encoding="utf-8").read().splitlines()
    cmts = [l for l in lines if l.startswith("#")]
    rows = list(csv.reader([l for l in lines if not l.startswith("#")], delimiter="\t"))
    return cmts, rows[0], rows[1:]


def save(cmts, header, body):
    body = sort_rows(body)
    o = io.StringIO()
    w = csv.writer(o, delimiter="\t", lineterminator="\n")
    w.writerow(header)
    w.writerows(body)
    open(path, "w", encoding="utf-8", newline="").write("\n".join(cmts) + "\n" + o.getvalue())


def tier_rank(t):
    return TIER_ORDER.index(t) if t in TIER_ORDER else len(TIER_ORDER)


def sort_rows(rows):
    return sorted(rows, key=lambda r: (0 if "Mega" in r[0] else 1, tier_rank(r[3]), r[0].lower()))


def normalize(row):
    assert len(row) == len(HEADER), f"expected {len(HEADER)} fields, got {len(row)}: {row}"
    assert row[3] in TIER_ORDER, f"bad tier {row[3]!r}; must be in {TIER_ORDER}"
    assert len(row[1]) > 0, "typing required"
    for c in range(7, 12):
        assert row[c] == "" or str(row[c]).isdigit(), f"stat {HEADER[c]} must be int or empty: {row[c]}"
    # typing like Fire/Dragon, no spaces inside types (strip outer spaces)
    row = list(row)
    row[0] = row[0].strip()
    return row


def main(argv):
    cmts, header, body = load()
    assert header == HEADER, f"unexpected header {header}"

    added = 0
    if argv and argv[0] == "--file":
        srcf = argv[1]
        for raw in open(srcf, encoding="utf-8").read().splitlines():
            raw = raw.strip()
            if not raw or raw.startswith("#"):
                continue
            row = next(csv.reader([raw], delimiter="\t"))
            body.append(normalize(row))
            added += 1
    else:
        row = argv
        body.append(normalize(row))
        added += 1

    save(cmts, header, body)
    print(f"added {added}; total rows now {len(body)}")


if __name__ == "__main__":
    main(sys.argv[1:])
