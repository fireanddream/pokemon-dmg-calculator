# Damage CLI Output Format (pokemon-dmg-calculator)

This file is the single source of truth for the **result screen** printed by
`scripts/output.mjs`. If the CLI's output is ever changed, update this document
in the same change. The behavior rules live in `auto-fill-defaults.md` (defaults, incl.
how a default ability is chosen); this file only describes how the answer is
printed.

## Invocation

```
node scripts/damage.mjs <matchup.json>
node scripts/damage.mjs "<attacker side ...> vs <defender side ...>"
node scripts/damage.mjs "<atk>" "<move>" "<def>"
node scripts/damage.mjs                  # interactive prompt ("calc> ")
```

Staged (offline) pipeline — the same card, split into its four stages:

```
node scripts/input-converter.mjs "<attacker side ...> vs <defender side ...>"    # 1. extract -> spec JSON
node scripts/fill.mjs <spec.json>                                # 2. fill + resolve -> calc input JSON
node scripts/calc.mjs <resolved.json>                            # 3. calculate -> result bag JSON
node scripts/output.mjs <result.json>                            # 4. render the card (terminal text)
node scripts/output.mjs <result.json> --chat                     #    ...or the card in a markdown code block
```

Each of `input-converter.mjs` / `fill.mjs` / `calc.mjs` / `output.mjs` reads its
JSON from a file argument or from stdin when given `-` / no argument, so the
stages pipe:
`node scripts/input-converter.mjs "<query>" | node scripts/fill.mjs - | node scripts/calc.mjs - | node scripts/output.mjs -`.
`input-converter.mjs` extracts the stated variables into the spec JSON (no
defaults); `fill.mjs` fills defaults (rules parsed from `auto-fill-defaults.md`)
and resolves every name to its record but prints the calc input instead of the
card; the result bag that `output.mjs` renders is byte-identical to what a
card-printing CLI (`damage.mjs`, which glues input-converter → fill → calc →
output) prints directly. `--chat` wraps that exact text in a fenced code block
so the fixed-width alignment survives markdown (for LLM chat windows); it never
changes the card text itself.

A matchup JSON / query has: attacker, defender, move, plus optional arena state
(weather, terrain, entry hazards, screens) and a `turn by turn` flag.

## Layout grid

Each run echoes the caller's request on its own line (2-space indent) at the
very top, followed by one blank line, then the result card — so a mistake in the
typed request is visible next to the answer:

```
  <the request as typed>

  Attacker  <value>
  ...
```

The echo is the exact query line (including `turn by turn`, status words, etc.).
In the three-argument form (`"<atk>" "<move>" "<def>"`) the echo is
reconstructed as `"<atk> <move> vs <def>"` (never a manufactured `uses` word);
JSON-file runs have no echo.

One run prints one card block. Blocks are separated by a blank line (a newline
leads each block). Rows appear in a fixed order and may be omitted as noted:

| Row label | Always? | Contents |
|---|---|---|
| `Attacker` | yes | card (below) |
| `Defender` | yes | card (below) |
| `Arena` | no | see Arena row — omitted when empty |
| `Move` | yes | move name + optional flags |
| `Damage` | yes | roll range + HP% (or `--` for non-damaging) |
| `KO` | yes | KO verdict |
| turn-by-turn | only with `turn by turn` | passives + per-turn table |

Every labeled row uses a fixed indent: **2 spaces + label padded to 8 chars +
2 spaces**, so the value always starts at column 12. Continuation lines (notes,
turn-by-turn rows) are indented a flat **12 spaces** to line up under the value.

```
  Attacker  <value>
  Defender  <value>
  Arena     <value>        (label is padded: "Arena" + 3 spaces + 2 spaces)
  Move      <value>
  Damage    <value>
  KO        <value>
            <continuation lines start at column 12>
```

## Wrapping

The whole card block (including its request-echo line) wraps at **100 columns by
default**, using the SAME rule as the recognition echo (`wrapBlock` in
`scripts/echo.mjs`): a line breaks only at a space, so a word is never split;
continuation lines keep the source line's leading indent (2 or 12 spaces); a
line whose single word exceeds the width is left whole. `--width N` overrides
the width on both `damage.mjs` and `output.mjs`; `--width 0` (any value `<= 0`)
never wraps. Both entry points default to 100 so the direct and staged pipelines
stay byte-identical.

## Cards (Attacker / Defender)

One card per line, built left to right as:

```
<Species>[ @ <item>]  <Nature>[ | <EV spread>]  <Ability>[ (<status>)]
```

Field rules:

- **Species** — the resolved pokemon name (specs are normalized, e.g. `Mega
  Venusaur` prints as `Venusaur-Mega`).
- **Item segment** — omitted entirely for the default inert item; ` @ no item`
  for an explicitly itemless mon; ` @ <Item Name>` for a real held item.
- **Nature** — always printed. Unspecified nature defaults to neutral and
  prints `Serious`.
- **EV spread** — shown only when at least one EV is nonzero: each stat with
  EVs in canonical order (HP, ATK, DEF, SPA, SPD, SPE), each as `STAT N`
  (stat-first, e.g. `HP 252`), joined with ` / ` and prefixed by ` | `.
  `0 EV` stats are never listed.
- **Ability** — always printed, including one that was auto-defaulted, so a
  wrong guess is visible.
- **Status** — only when statused: ` (burned)` / ` (poisoned)` /
  ` (badly poisoned)` / ` (paralyzed)` / ` (asleep)` / ` (frozen)`.
- **Stage changes** — appended as `  [<change> / <change> ...]` when any stage
  is nonzero. Stat-stage boosts first in canonical order (`atk`, `def`, `spa`,
  `spd`, `spe`), then any accuracy/evasion stage (`acc`, `eva`). Each is signed:
  `[-1 atk / +2 spa / +1 acc]`. Omitted when there are no stages.

Example card value:
`Machamp  Adamant | ATK 252  Guts (burned)`

## Arena row

Placed between Defender and Move. **Omitted entirely when empty** (no weather,
terrain, or hazards). Parts, in order, joined with ` + `:

1. Weather, using Smogon words: `Sun`, `Rain`, `Sandstorm`, `Hail`,
   `Harsh Sunshine`, `Heavy Rain`, `Strong Winds`. If Cloud Nine / Air Lock is
   suppressing it, append ` (suppressed)`.
2. Terrain: `Electric Terrain`, `Grassy Terrain`, `Misty Terrain`,
   `Psychic Terrain`.
3. `Stealth Rock` (when set).
4. `Spikes xN` where N is the layer count 1-3 (when set).

Examples: `Sandstorm`, `Harsh Sunshine (suppressed)`, `Sandstorm + Stealth Rock + Spikes x2`.

No damage numbers are shown here — hazard damage is applied once at switch-in
and the KO sim starts from the reduced HP.

## Move row

```
  Move      <Move Name>[  [flag, flag, ...]]
```

Optional comma-separated `[...]` flags include `crit`, the screen name
(`reflect` / `light screen`), `ignored: <ability>` (Mold Breaker etc.), and
item/plate resolution notes (e.g. when a bare `plate` resolves to no boosting
item for the move's type).

## Damage row

Damaging moves:

```
  Damage    <pct-min>% - <pct-max>%  (<min>-<max>)
```

- The percent range comes FIRST, with the raw roll numbers in parentheses.
- `<min>`/`<max>` are the lowest/highest of the 16 possible damage rolls.
- Percent is `roll / defender max HP * 100`, **truncated (floored) to one
  decimal** to match Smogon's display — do not round this row.
  (`68 / 202 = 33.66%` prints as `33.6%`, not `33.7%`.)

Non-damaging / fixed-damage utility moves:

```
  Damage    --  (no damage)
```

Then any engine notes, each on its own line indented 12 spaces. When a resist
berry halves the first hit, the `Damage` row shows that actual (halved)
first-hit damage with a `[resist berry]` marker — no separate raw-damage row:

```
  Damage    28.1% - 34%  (52-63) [resist berry]
```

(The berry is consumed on that first hit, so the KO sim treats hit 1 as halved
and subsequent hits as full damage — that is why the KO verdict can still be a
shorter HKO than the displayed first-hit range alone implies.)

## KO row

```
  KO        guaranteed OHKO
  KO        guaranteed 3HKO                 (all 16 rolls KO by hit 3)
  KO        guaranteed 3HKO (2HKO 98.6%)    (some earlier roll chance, incl. +EoT)
  KO        no guaranteed KO in 10 hits (4HKO 12.3%, 5HKO 45.1%)
```

Wording rules (gen-6 KO sim over 16 rolls, one hit per turn, starting at
hazard-reduced HP, capped at `maxTurns` which defaults to 10):

- Each listed turn token is `NHKO <pct>%`, with ` (+EoT)` appended when the
  kill can come from end-of-turn chip rather than the hit. Tokens whose chance
  is below 0.05% and the terminal `100%` turn are not listed.
- KO-token percentages **round** to 1 decimal; `100%` is only used when the
  cumulative chance is effectively all rolls (>= 99.95%). The Damage row
  truncates instead.
- If not all 16 rolls KO within the cap: `no guaranteed KO in <N> hits (tokens)`.

### Chance to hit all attacks (accuracy)

Damage/KO numbers always assume every attack connects — accuracy never changes
them (matching `@smogon/calc`, which never rolls accuracy). When the move could
miss, a note right under the KO verdict gives the effective hit chance from the
gen-6 formula (`src/accuracy.ts` `hitChance`): stages (attacker acc vs defender
eva), items (Wide Lens, Zoom Lens, Bright Powder, Lax Incense, Micle),
abilities (Compound Eyes, Victory Star, Hustle, Sand Veil, Snow Cloak, Tangled
Feet, Mold Breaker bypass), weather and Gravity, after the 33% floor / 100% cap.

Every hit of an NHKO is an independent accuracy roll, so the per-attack chance
is raised to the guaranteed-KO turn count — an 80% move that needs 3 hits is
`80%^3 = 51.2%`:

```
  KO        guaranteed 3HKO
            51.2% chance to hit all attacks (80% x3)
  KO        guaranteed OHKO
            80% chance to hit all attacks
```

The note is omitted when the attacks always connect (100% after modifiers,
never-miss moves, No Guard, weather always-hit) or when there is no
guaranteed-KO summary (`no guaranteed KO in N hits`). Percent rounds to 1
decimal with whole percents printed without the decimal (`51.2%`, `33.3%`,
`1%`). For a two-move combo (each move lands once, so no exponent) the chance
multiplies across both moves — `48%` then `60%` prints
`28.8% chance to hit all attacks` under the `Result` row.

A move that literally cannot connect — an OHKO type block: a Normal OHKO vs a
Ghost, Fissure vs a Flying type, Sheer Cold vs an Ice type — prints a no-damage
card instead (reason as a note):

```
  Move      Sheer Cold
  Damage    --  (no damage)
            Sheer Cold cannot hit the Ice-type target
```

## Turn-by-turn block (only when the query says `turn by turn`)

Printed after the KO row, all lines indented 12 spaces:

```
            passives: chip <a | b>   heal <c | d>      (each side shows none)
            turn-by-turn (one hit per turn, 16 rolls):
            turn |
               1 | 57% HP left
```

The `turn |` header has no column label after the pipe (the "status after turn"
label was dropped). The `|` is aligned: the column is `"turn".length` wide, and
turn numbers are right-padded into it.

The `passives:` line is omitted when the defender has neither chip nor heal
that turn (same rule as the combo block below).

Chip/heal tokens: poison `1/8`, toxic `n/16`, burn `1/8`, weather `1/16`,
`Poison Heal 1/8`, `Ice Body 1/16`, `Leftovers 1/16`,
`Sitrus 1/4 once at <=50%`. Magic Guard shows no chip/heal tokens; Overcoat
skips weather chip only.

Each row describes only the share of Pokemon still in play when that turn
begins (each row therefore sums to ~100%), showing what happens after the hit
and all end-of-turn effects:

- **Survivor-only turn** → the average remaining HP as a whole percent:
  `57% HP left`.
- **Fates mixed** → pieces joined with ` · `, e.g.
  `9.7% KO'd by move · 80.6% KO'd by indirect dmg · 9.7% live with 1% HP left`.
  Fates use Smogon's KO-chance display: a percent rounded to 1 decimal but
  **clamped to 99.9%** (so 99.95% shows as `99.9%`, never `100%`), with whole
  percents shown without a decimal (e.g. `90%`). `guaranteed KO'd by move` /
  `guaranteed KO'd by indirect dmg` is used only when the fate covers 100% of
  the in-play cohort exactly. Survivor shares are written as
  `<share> live with <avg HP>% HP left`.
- The surviving HP percent is rounded to a whole number (`57%`, `1%`); it is
  an average over the rolls that survived that turn.

## Two-move combos (fixed sequence)

A query may name exactly two moves in the move slot with NO delimiter — the
moves are claimed by exact name wherever they appear on the attacker side
(`"Garchomp EQ Outrage vs Skarmory"`). Connector words (`then`, `and`, `+`,
commas, `use`/`uses`) are inert and change nothing. Move 1 lands turn 1, move 2
lands turn 2 starting from the defender's surviving HP, then the sim ends. Move
order = left-to-right as typed. Naming the same move again (or an alias of it)
collapses to a normal single-move card; **3+ distinct moves is an error**; a
side with no recognizable damaging move is an error.

Layout: the shared `Attacker` / `Defender` / `[Arena]` rows, then (only when
the defender has end-of-turn chip or heal) a `passives:` line, and per-turn
rows (always shown; no `turn by turn` keyword needed, and no `Move` /
`Damage` / `KO` rows above them). The status cell for each turn is
`<Move> <pct>% - <pct>%  (<lo>-<hi>) [markers]: <KO fates>` (the `:` fates part
is omitted when nothing KO'd that turn):

```
  Attacker  ...
  Defender  ...
  Arena     Sandstorm
            passives: chip none   heal none
            turn | status after turn
               1 | Flare Blitz 130.8% - 156.2%  (242-289)
               2 | Earthquake 55.6% - 65.9%  (103-122): guaranteed KO'd by move
```

- Turn rows carry no KO numbers — the `Result` verdict reports KO chance. The
  one exception: a guaranteed **indirect** KO is annotated
  (`guaranteed KO'd by indirect dmg`, e.g. Sash saves to 1 HP, then chip
  finishes) so that story stays visible. When nothing of note happened the row
  ends right after the move + damage info (no colon). No HP numbers appear in
  turn rows.
- Markers appear in the row cell: `[resist berry]`, `[Skill Link x5]`.
- Non-damaging / immune hits show `--  (<note>)` for that turn's range.
- If either attack guarantees the KO, the sim stops at that turn (later rows
  are omitted).

After the rows, a `Result` row gives the combined verdict over both hits. The
surviving HP (whole percents, each bound rounded to a whole number) always
describes the paths that did NOT get KO'd. Wording: when the two moves can KO
together, lead with the KO chance and phrase the HP as conditional; only when
no KO is possible does it say "survives both moves":

```
  Result    survives both moves: 100% · HP left 9-23%        (no KO possible)
  Result    KO chance 20.3% · if it survives, HP left 1-12%  (surviving paths only)
  Result    guaranteed KO on turn 2
  Result    guaranteed KO on turn 1
```

HP percents follow the per-turn-table rule (whole, rounded), NOT the 1-decimal /
99.9-clamp rule — that rule applies only to chance numbers (the KO chance).

When turn 1 already guarantees the KO (by the move, or by the move's damage
plus end-of-turn chip — e.g. Focus Sash leaves it at 1 HP and weather chips it),
only turn 1 is shown and the `Result` labels it a turn-1 kill; no turn-2 row is
printed.

The sim keeps the defender's HP **distribution** between turns, and end-of-turn
passives (burn/poison/toxic/weather chip, Leftovers, Sitrus at <=50%, toxic
counter ramp) apply between move 1 and move 2 — so the survival chance is NOT a
flat sum of the two `Damage` ranges. Survival reads as a plain percentage
(100% when nothing can KO); the KO token clamps Smogon-style at 99.9%.

## Examples

Standard (status + weather, with the status-first default in effect):

```
  Attacker  Machamp  Adamant |  ATK 252  Guts (burned)
  Defender  Clefable  Bold |  HP 252 /  DEF 252  Magic Guard
  Arena     Sandstorm
  Move      Bullet Punch
  Damage    33.6% - 39.6%  (68-80)
  KO        guaranteed 3HKO
```

No arena row (same matchup, no weather typed, so the fixed default No Guard shows):
```
  Attacker  Machamp  Adamant |  ATK 252  No Guard
  Defender  Clefable  Bold |  HP 252 /  DEF 252  Magic Guard
  Move      Bullet Punch
  Damage    21.8% - 26.7%  (44-54)
  KO        guaranteed 5HKO (4HKO 17.5%)
```

Resist berry on the defender (actual, halved first-hit damage on the row):
```
  Attacker  Heatran  Serious |  SPA 252  Flash Fire
  Defender  Mamoswine @ Occa Berry  Serious  Thick Fat
  Move      Lava Plume
  Damage    28.1% - 34%  (52-63) [resist berry]
  KO        guaranteed 3HKO (2HKO 2.7%)
```

Non-damaging move:

```
  Attacker  Machamp  Serious  No Guard
  Defender  Clefable  Serious  Magic Guard
  Move      Bulk Up
  Damage    --  (no damage)
            Non-damaging move.
```

With `turn by turn` (weather + hazards present, mixed fates):

```
  Attacker  Machamp  Adamant |  ATK 252  No Guard
  Defender  Clefable  Bold |  HP 252 /  DEF 252  Unaware
  Arena     Sandstorm + Stealth Rock
  Move      Bullet Punch
  Damage    21.7% - 26.7%  (44-54)
  KO        guaranteed 4HKO (3HKO 90.3% (+EoT))
            passives: chip weather 1/16   heal none
            turn-by-turn (one hit per turn, 16 rolls):
            turn | status after turn
               1 | 57% HP left
               2 | 27% HP left
               3 | 9.7% KO'd by move · 80.6% KO'd by indirect dmg · 9.7% live with 1% HP left
               4 | guaranteed KO'd by move
```

Note: examples with generated rolls are illustrative of layout; only the layout,
field rules, rounding behavior, and wording are contractual.
