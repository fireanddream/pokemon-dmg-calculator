import csv, io
from _paths import tsv_path

p = tsv_path()
lines = open(p, encoding="utf-8").read().splitlines()

comments = [
    "# TAG DEFINITIONS — role tags for competitive team building (gen 6 / XY & ORAS).",
    "# The tags column holds one or more of these, joined by '/' (e.g. SetUp/Wall).",
    "#",
    "# SetUp: A self-boosting attacker that can set up (Dragon Dance, Swords Dance,",
    "#   Quiver Dance, Calm Mind, Shell Smash, Tail Glow, etc.) and then win the",
    "#   game by snowballing once boosted.",
    "# Fast: A naturally fast attacker that wins late-game by outspeeding and",
    "#   cleaning up weakened teams, without needing to set up first.",
    "# Breaker (aka wall breaker): A powerful attacker that punches holes in the",
    "#   opponent's defensive core so that another teammate can clean up later.",
    "#   Focus is on raw breaking power, not speed or bulk.",
    "# Wall: A defensive Pokemon that reliably absorbs hits and gives the team safe",
    "#   switch-ins. Usually has recovery and/or status; can be physically or",
    "#   specially defensive. Wears the opponent down over time.",
    "# Utility: A support-focused Pokemon not primarily about damage or pure",
    "#   tanking. Examples: hazards setter/remover, pivot (VoltTurn), status",
    "#   spreader, cleric, screen setter, or speed control.",
    "#",
    "# One Pokemon may combine roles, e.g. bulky sweeper = SetUp/Wall,",
    "# defensive pivot = Wall/Utility. Tagging is subjective; keep it consistent.",
    "#",
    "# EV cell format: [Nature] STAT EV / STAT EV (benchmark note). Stats follow the",
    "#   canonical order HP ATK DEF SPA SPD SPE; nature first if specified.",
    "# Adding a row: Pokemon<TAB>Typing<TAB>Ability<TAB>Tier<TAB>Tags<TAB>EV<TAB>",
    "#   HP<TAB>ATK<TAB>DEF<TAB>SPA<TAB>SPD<TAB>SPE. Typing like 'Fire/Dragon',",
    "#   multiple abilities and tags joined with '/'. Tier is one of",
    "#   AG Uber OU UUBL UU RUBL RU 'below RU' MISC.",
]

data = [l for l in lines if not l.startswith("#")]
rows = list(csv.reader(data, delimiter="\t"))

header = ["Pokemon", "Typing", "Ability", "Tier", "Tags", "EV", "HP", "ATK", "DEF", "SPA", "SPD", "SPE"]

# drop any accidental old header row and rows with wrong length.
# Duplicates are allowed (e.g. two Infernape builds), so no name-based dedup.
body = []
for r in rows:
    if not r or r[0] == header[0]:
        continue
    if len(r) != len(header):
        print("skipping malformed:", r[:3], "len", len(r))
        continue
    body.append(r)

# canonical sort: tier order, mega first then name
tier_order = ["AG", "Uber", "OU", "UUBL", "UU", "RUBL", "RU", "below RU", "MISC"]

def key(r):
    t = r[3] if r[3] in tier_order else 99
    return (0 if "Mega" in r[0] else 1, tier_order.index(r[3]) if r[3] in tier_order else 99, r[0].lower())

body.sort(key=key)

o = io.StringIO()
w = csv.writer(o, delimiter="\t", lineterminator="\n")
w.writerow(header)
w.writerows(body)
open(p, "w", encoding="utf-8", newline="").write("\n".join(comments) + "\n" + o.getvalue())
print("rebuilt:", len(body), "data rows")
