# pokemon-dmg-calculator

A **Gen 6 (XY/ORAS) Pokemon damage calculator** that runs fully offline. You
type a natural-language matchup at the command line and get back a damage /
KO / accuracy result card. No internet, no LLM in the loop — the whole engine,
the dex data, and the rendering all ship in this repo.

## Setup

Requires Node.js. From the repo root:

```
npm install
npm run build       # compiles src/ → dist/ (needed once, and after any src change)
```

## Quick start

Ask for a matchup. The minimal accepted calc query names **three things**:

> **A calc query must carry the attacker, the move it uses, and the defender**
> — `A uses M vs B` (e.g. `Garchomp uses Earthquake vs Heatran`).

The front (`input-converter.mjs` → `fill.mjs`) auto-fills every other variable
for you from `auto-fill-defaults.md` (level 50, Serious nature, 31 IVs, 0 EVs,
no item, +0 stages, no status / weather / terrain / hazards, auto-picked
ability), so you only need to spell out the three names and anything you want
to override.

A general question that does not carry all three — e.g. `what if Garchomp has
Life Orb`, `does X beat Y`, `how strong is X` — is **not an accepted calc
query**; supply the attacker / move / defender (and any specifics) instead.

One-shot card, quick look:

```
node scripts/damage.mjs "Garchomp @ Life Orb Jolly 252 Atk uses Earthquake vs Heatran 252 HP"
```

The same line through the staged pipeline (use this form in chat windows —
`--chat` wraps the card so markdown can't collapse its alignment):

```
node scripts/input-converter.mjs "Garchomp @ Life Orb Jolly 252 Atk uses Earthquake vs Heatran 252 HP" |
  node scripts/fill.mjs - |
  node scripts/calc.mjs - |
  node scripts/output.mjs - --chat
```

`input-converter.mjs` extracts the stated variables into the spec JSON;
`fill.mjs` applies the `auto-fill-defaults.md` defaults and resolves every name
to its record; `calc.mjs` computes the numbers; `output.mjs` renders the card.

## How a query becomes a card: the dual converter / agent route

Everything upstream of `calc.mjs` is one spec-JSON contract with **two ways to
build it**. The offline route is a plain script (works with no LLM); the agent
route is for loose, typo-ridden English the strict grammar can't parse. Both
emit the SAME spec JSON, and one shared deterministic stage (`fill.mjs`)
completes it — so identical stated variables produce byte-identical cards.

```
  user words
     │
     ├─ (a) OFFLINE: node scripts/input-converter.mjs "<query>"   → spec JSON
     │        word-scan + regex passes + alias/dex lookup
     │
     └─ (b) AGENT:  extract variables from understanding + aliases.md +
              data/*.json (typo-tolerant, loose English like "garcomp")  → spec JSON
     │
     ▼
  scripts/fill.mjs   spec JSON → calc-input JSON
     │   fills every MISSING variable from auto-fill-defaults.md,
     │   validates names against the dex (fails loud), computes level-N stats
     ▼
  scripts/calc.mjs → scripts/output.mjs   (pure math → the card)
```

- **The spec JSON** carries only what the user stated: canonical species/move
  names, EVs, nature, item, status, boosts, hazards/weather, plus shorthand kept
  as intent tokens (`max atk`, `plate`, bare `+1`). No defaults applied.
- **`fill.mjs` is the shared deterministic stage.** Neither route fills defaults
  or computes stats itself — both write spec JSON and let `fill.mjs` complete
  it. That single point of truth is what makes the two routes interchangeable.
- **`input-converter.mjs`** parses the strict grammar (`<atk> uses <move> vs
  <def>`) with word-scan + regex passes; it ships so the whole tool runs with no
  LLM. A bare run prints usage.
- **The agent route** resolves loose names to canonical dex entries (via
  `aliases.md` + `data/*.json`), keeps shorthand as intent tokens, and writes
  the same spec JSON. It never computes level-N stats on its own — `fill.mjs`
  does that. Run it through the same tail:
  `node scripts/fill.mjs spec.json | node scripts/calc.mjs - | node scripts/output.mjs - --chat`.
- **Never hand-compose a resolved calc-input record** for `calc.mjs` — the
  staged front (converter or agent → `fill.mjs`) always produces it.

## The spec grammar

### Side spec

`Species [@ Item] [Nature] [N Stat EVs] [Ability] [L50]` — order-free:

```
node scripts/input-converter.mjs "Garchomp @ Life Orb Jolly 252 Atk uses Earthquake vs Heatran 252 HP" | node scripts/fill.mjs -
node scripts/input-converter.mjs "Heatran 252 Spa uses Lava Plume vs Mamoswine Thick Fat @ Occa Berry" | node scripts/fill.mjs -
node scripts/input-converter.mjs "Garchomp" "Earthquake" "Heatran"        # explicit args
```

- `Mega Venusaur` resolves to `Venusaur-Mega` (word order tried both ways);
  `Mega Charizard` picks the longest/most-specific forme (Charizard-Mega-X).
- Species / move acronyms: `chomp` = Garchomp, `ttar`/`tar` = Tyranitar,
  rotom/lando/thundurus/tornadus short forms; move slot `EQ` = Earthquake,
  `BB` = Brave Bird, `blitz` = Flare Blitz, `draco` = Draco Meteor.
- Item acronyms: `LO` = Life Orb on the attacker, **Leftovers** on the
  defender; `CB`/`band(ed)` = Choice Band, `spec(s)` = Choice Specs,
  `scarf` = Choice Scarf, `belt` = Expert Belt, `sash` = Focus Sash,
  `plate` = the type plate matching the move's type.
- Investment shorthands (a named nature always overrides):
  - `max atk` = 252 Atk, Adamant · `max spa` = 252 SpA, Modest
  - `max def` = 252 HP + 252 Def (Bold if base Atk ≤ SpA, else Impish)
  - `max spd` = 252 HP + 252 SpD (Calm if base Atk ≤ SpA, else Careful)
- Stat-stage tokens, capped −6..+6, either order: `-1 atk`, `+2 spa`,
  `+3 def`... A bare `+N` (e.g. `Ferrothorn +1`) means +N on the stat the move
  uses — attacker `atk`/`spa`, defender `def`/`spd` by move category.
- Accuracy / evasion stages: `-2 acc`, `+1 eva` (only the attacker's acc and
  the defender's eva feed hit chance).
- Status: `burned`, `poisoned`, `toxic`, `paralyzed`, `asleep`, `frozen`.
- Weather: `sun`, `rain`, `sand`, `hail`, `permanent sandstorm`, `harsh
  sunlight`, `heavy rain`, `strong winds`, ...
- Entry hazards sit on the defender's field: `rock` = Stealth Rock,
  `spike1/2/3`, `spikes x2`, `2 spikes`, `1 layer of spikes`.
- Terrain: `electric / grassy / misty / psychic terrain`.
- `no item` for a genuinely itemless mon.

### Question intent vs. the card

Damage / KO / accuracy questions are answered by the same result card — the
card already prints the damage range and the KO verdict, so phrase the query
as `A uses M vs B` regardless of how you ask it in conversation.

## Two-move combos

Chain exactly two moves in the move slot with `then`, `+`, or `and`:

```
node scripts/input-converter.mjs "Garchomp uses EQ then Outrage vs Skarmory max def" | node scripts/fill.mjs -
```

Move 1 lands turn 1, move 2 lands turn 2 from the defender's surviving HP
(chip/heal between turns counts — not a flat sum of two ranges). Capped at two
moves. Anchors the default ability/weather on move 1.

## Turn-by-turn sim

Append `turn by turn` for the per-turn status table (each turn shows status
after the hit plus all end-of-turn effects — chip, Sitrus at ≤50% HP,
Leftovers):

```
node scripts/input-converter.mjs "Garchomp uses Outrage vs Skarmory max def in sandstorm turn by turn" | node scripts/fill.mjs -
```

## More

- What every default is and how to override it → **`auto-fill-defaults.md`** (doc-as-code
  default rules — edit a table cell there to change a default).
- The exact result-card contract → **`OUTPUT-FORMAT.md`**.
- What the engine can and can't model → **`ENGINE-GAPS.md`**.
- Sample matchup JSON files → `examples/`.
- The parser/CLI usage summary: `node scripts/input-converter.mjs` (bare) prints
  usage; `node scripts/damage.mjs` starts the interactive card prompt.

## Verification

```
npm run build        # tsc → dist
npm run check        # build + library sanity check
npm run verify:damage  # damage/KO numbers vs the @smogon/calc oracle
npm run verify:acc     # accuracy engine checks
```

`@smogon/calc` is only a devDependency used by the verify scripts; the runtime
pipeline never touches the network.

---

# AGENTS.md (raw dump — to be cleaned up later)

> The working rules/instructions for this repo, dumped verbatim here for now.

Gen 6 (XY/ORAS) Pokemon **damage calculator**. The whole engine ships in this
repo. AGENTS.md is injected whole at session start, so the **MUST OBEY** block
below is kept compact on purpose — treat it as always-in-memory rules. The
rest is **reference**: read the index, then the section you need; never try to
memorize it all.

> **Rebuild status (transitional).** The single monolithic `damage.mjs` is being
> split into a staged pipeline so everything runs locally with no LLM in the
> middle:
> `scripts/input-converter.mjs` (offline extractor: natural-language line →
> spec JSON) OR an **agent** (loose-English extraction) → `scripts/fill.mjs`
> (defaults + resolve: spec JSON → calc-input JSON; default rules parsed from
> `auto-fill-defaults.md` at startup) → `scripts/calc.mjs` (pure calculation on
> resolved records, no lookups, no printing) → `scripts/output.mjs` (renders the
> result card from the calc bag).
> `output.mjs` OWNS the card layout — the agent never composes or restyles it.
> `damage.mjs` is a thin compat card CLI that glues the same pipeline
> (input-converter → fill → calc → output).

## MUST OBEY — identity, answering a query, defaults policy

**1. This is a Pokemon damage calculator, and all the tools are already here.**
The complete damage engine, the staged scripts (`damage.mjs` → `calc.mjs` →
`output.mjs`), the data files, and the docs all ship in this repo — it is the
ONLY source of truth for damage / KO / accuracy / chip numbers. Do NOT go off
doing your own research (no web lookups, no memorized stats, no knowledge from
other gens — that data is for a different game state or simply wrong). If a
calc can be modeled, run the staged pipeline; if it cannot handle it, report
that limit rather than improvising numbers.

**2. A damage input is answered from the output script — paste its code block
verbatim, no thinking, no reformatting.** Whenever the user gives a damage /
KO / accuracy / chip calc ("<attacker> uses <move> vs <defender>", "does X
one-shot Y", "how many hits to KO", "what % does Z do"):

1. Translate the user's words into the spec line(s) using only what they said
   (see **Spec grammar** below for tokens). Do not invent or fill anything they
   didn't type.
2. Run the staged chain (one chain per distinct query):

   ```
   node scripts/input-converter.mjs "<atk> uses <move> vs <def>" | node scripts/fill.mjs - | node scripts/calc.mjs - | node scripts/output.mjs - --chat
   ```

   `input-converter.mjs` extracts the stated variables into the spec JSON;
   `fill.mjs` fills defaults and resolves every name to its record;
   `calc.mjs` computes the numbers; `output.mjs` renders the card. The `--chat`
   flag wraps the OUTPUT-FORMAT card in a fenced code block so chat markdown
   can't collapse its alignment — that block is the deliverable.
3. Paste the returned code block back **verbatim, byte for byte**. Never
   summarize, restate, reformat, hand-write, or re-wrap a card, and never
   substitute your own numbers for the output. If a stage errors, report the
   error — never substitute your own numbers.

> `node scripts/damage.mjs "<spec>"` alone prints the identical card text (the
> same renderer, same input-converter → fill front) for a quick local look; use the
> staged `input-converter | fill --chat` form whenever the result goes into a chat
> window. Never hand-feed calc.mjs a matchup JSON you composed — let
> `fill.mjs` produce it.

**3. Defaults policy: the fill stage fills the defaults — you never do.**
`fill.mjs` resolves every unspecified variable itself before calculating
(level, nature, IVs, EVs, held item, status, stages, ability, weather, ...).
See **`auto-fill-defaults.md`** for the authoritative list. Therefore:

- **Pass the user's words through unchanged.** Never add EVs, natures, items,
  boosts, status, or weather the user didn't type — that either double-applies
  a default or invents an assumption. If the request says only "Garchomp vs
  Heatran", the query is "Garchomp uses <move> vs Heatran" with nothing added.
- The card prints what was resolved (nature, EVs, item, ability) — a wrong
  assumption is visible there, so don't pre-empt the front by guessing.
- The only time you add to the spec is when the user's intent contradicts a
  default and their wording can't carry it (e.g. a truly itemless mon needs
  the `no item` token). `auto-fill-defaults.md` lists these cases.
- If a query can't be translated, or needs a choice the front can't infer,
  ask the user instead of guessing.

Consult `auto-fill-defaults.md` to predict or explain what the front assumed. The card
layout is owned by `output.mjs` + `OUTPUT-FORMAT.md` — you never need to know
it to answer; just paste the output script's block.

---

## Reference index

- Defaults the engine applies / how to override → **`auto-fill-defaults.md`**
- Plain damage query → **Spec grammar**; the card comes from the output script
- EVs / nature shorthands, stat stages → **Investment shorthands** · **Stat-stage tokens**
- Accuracy/evasion → **Accuracy / evasion** (tokens + engine)
- Hazards, status chip, per-turn sim → **Entry hazards** · **Turn by turn**
- Two chained moves → **Two-move combos**
- What the CLI can/can't model → `ENGINE-GAPS.md`
- Repo layout, team DB, tools → **Project layout** · **myteam** · **teams_tools**

## Spec grammar

Preferred CLI forms (one command, ~0.07s; prefer these over writing a JSON
file) — the front is `input-converter.mjs` + `fill.mjs` (card-printing compat
alias: `damage.mjs`):

```
node scripts/input-converter.mjs "<atk> uses <move> vs <def>" | node scripts/fill.mjs -
node scripts/input-converter.mjs "<atk>" "<move>" "<def>"     # explicit args, then fill
node scripts/input-converter.mjs                              # emits the spec JSON
node scripts/fill.mjs <spec.json>                             # fills + resolves a spec JSON
node scripts/damage.mjs                                       # interactive card prompt
```

A side spec is `Species [@ Item] [Nature] [N Stat EVs] [Ability] [L50]`,
order-free:
`"Garchomp @ Life Orb Jolly 252 Atk uses Earthquake vs Heatran 252 HP"`
`"Heatran 252 Spa uses Lava Plume vs Mamoswine Thick Fat @ Occa Berry"`
`"Mega Venusaur"` resolves to `Venusaur-Mega` (word order tried both ways).

- **Mega prefix** upgrades the resolved pokemon to its Mega forme
  (`Mega Chomp` → Garchomp-Mega); with several megas the longest/most-specific
  dex name wins (e.g. `Mega Charizard` → Charizard-Mega-X). No Mega forme ⇒ the
  `Mega` token is ignored (flagged).

### Item acronyms (resolved item shows on the card)

- `LO` = **Life Orb** on the attacker, **Leftovers** on the defender.
- `CB` / `band` / `banded` = Choice Band; `spec` / `specs` = Choice Specs;
  `scarf` = Choice Scarf; `belt` = Expert Belt; `sash` = Focus Sash.
- `plate` = the type plate boosting the used move's damage by 20% — look up by
  the move's type (Flame Plate for Fire, Splash Plate for Water, Earth Plate
  for Ground, ...). No plate boosts Normal, so `plate` + a Normal move resolves
  to no item (note it).

### Move & species acronyms

- Move slot (between `uses` and `vs`): `BB` = Brave Bird, `EQ` = Earthquake,
  `blitz` = Flare Blitz, `draco` = Draco Meteor.
- Species (either side): `chomp` = Garchomp, `ttar`/`tar` = Tyranitar, plus
  the rotom/landorus/thundurus/tornadus short forms.

### Investment shorthands

EV + nature defaults; an explicitly named nature always overrides:

- `max atk` = 252 Atk, default **Adamant**. `max spa` = 252 SpA, default
  **Modest**.
- `max def` = 252 HP + 252 Def (physical). `max spd` = 252 HP + 252 SpD.
- Defensive nature by base stats: if ATK <= SpA drop Atk → **Bold**
  (max def) / **Calm** (max spd); if ATK > SpA drop SpA → **Impish**
  (max def) / **Careful** (max spd).
- e.g. `Jolly max atk Garchomp` = 252 Atk **with Jolly** (no Adamant), since
  Jolly was named.
- Do **not** auto-apply ability stat changes (Intimidate, Download, Defiant,
  Moxie, ...). Every mon starts at +0. `Garchomp max atk Dragon Claw LO vs
  Landorus-T max def LO` starts at +0 Atk even though Landorus-T has Intimidate.

### Stat-stage tokens

Typed explicitly, capped -6..+6, as `+/- N` first then the stat:
`-1 atk`, `+2 spa`, `-3 def`, `+1 spe`. A bare `+N` with no stat (e.g.
`Ferrothorn +1`) means +N on the stat the move uses — attacker `atk` (physical)
or `spa` (special); defender `def` (physical) or `spd` (special).

### Dynamic-power moves

Gyro Ball, Electro Ball, Payback, Low Kick, Heavy Slam, Eruption, Stored
Power, ... compute their power from **current stats**: the level/nature/EV stat
plus any typed stage boost (speed stages feed Gyro/Electro/Payback).
Item/status speed modifiers are not modeled. Full modeled/unmodeled coverage
(incl. the Payback flat-50 TODO) is inventoried in `ENGINE-GAPS.md` →
"Dynamic-power (variable BP) moves".

### Default ability pick order (defender)

`auto-fill-defaults.md` (ability-default sections) chooses; `mitigatorAbility` (in
`scripts/fill.mjs`) picks by group priority — **1. reduce damage** (immediate move damage — incl. Sturdy's
delay-the-KO at full HP — OR indirect: hazards, weather chip, poison chip) ->
**2. evasion boost** (Sand Veil in sand, Snow Cloak in hail) ->
**3. increase healing** (Ice Body in hail). So Mamoswine vs a Fire/Ice hit
defaults Thick Fat over Snow Cloak; Poison Heal (reduces poison chip AND heals)
beats Sand Veil even in sand; Donphan at full HP defaults Sturdy over Sand
Veil; Glaceon in hail defaults Snow Cloak, never Ice Body.

## Entry hazards

Hazards sit on the defender's field. Tokens: `rock` (Stealth Rock),
`spike1`/`spike2`/`spike3` (also `spikes`, `spikes x2`, `2 spikes`, `1 layer
of spikes`). Stealth Rock = `floor(HP * Rock effectiveness / 8)`; Spikes =
1/8/1/6/1/4 max HP by layer, skipping Flying/Levitate. Both apply once at
switch-in before the first attack, so the KO sim starts from the reduced HP.

## Turn by turn

Append `turn by turn` to a query for the per-turn status table (layout is
owned by `output.mjs` / `OUTPUT-FORMAT.md`): each row covers only the Pokemon
still in play that turn and shows its status after the hit + all end-of-turn
effects. The turn sim verifies chip/heal ordering (damage, Sitrus at <=50%,
then chip, then Leftovers). Status words (`burned`, `poisoned`, `toxic`,
`paralyzed`, `asleep`, `frozen`) set a side's status; gen-6 burn/poison chip is
1/8 max HP per turn.

## Two-move combos

A query may chain **exactly two** moves in the move slot with `then`, `+`, or
`and` (e.g. `"Garchomp uses EQ then Outrage vs Skarmory"`). Move 1 lands turn
1, move 2 lands turn 2 starting from the defender's surviving HP, then the sim
ends (the combined card + per-turn table + `Result` row layout is owned by
`output.mjs` / `OUTPUT-FORMAT.md`). The sim carries the defender's HP
distribution between turns, so end-of-turn chip/heal (Leftovers, Sitrus, toxic
ramp) counts — not a flat sum of the two damage ranges.

Rules / limits:
- Capped at **2 moves**; 3+ throws `too many moves in a combo`.
- A separator with only one real move (e.g. a trailing `+` or `and`) falls
  back to a regular single-move calc. A plain single-move query is unchanged
  (repeat sim, "guaranteed N HKO").
- Default ability and weather anchor to **move 1** (one ability on the card;
  a wrong guess is visible). Name an ability to override, e.g.
  `vs Mamoswine @ Occa Berry Thick Fat`.
- A resist berry halves the first move whose type matches — exact, since each
  move lands once (no full-roll follow-up set).
- Focus Sash / Sturdy only save while the defender is at full HP (typically
  turn 1) and are consumed the turn they trigger — so a turn-2 lethal hit gets
  no second save. If turn 1 dealt no damage (e.g. an immunity), the Sash is
  still intact for turn 2. Entry hazards before turn 1 disable them entirely.
- Not modeled between the two turns: mid-chain state changes (move 1 status /
  self-boosts / item loss) and HP-scaled BPs (Eruption, Wring Out, Flail, ...);
  move 2's rolls use full-state stats.

## Accuracy / evasion

`@smogon/calc` (the damage oracle) never rolls accuracy — it assumes every move
connects. So accuracy is modeled SEPARATELY and must never change the damage /
KO numbers: keep the damage pipeline treating a non-impossible move as a hit so
results stay byte-identical to the oracle (`npm run verify:damage`). The engine
is `src/accuracy.ts` (`hitChance`); `npm run verify:acc` checks it. The rules
below affect only the "chance to hit all attacks" note the output script shows,
never the damage or KO numbers.

### CLI spec tokens (wired in `scripts/input-converter.mjs`)

Stage tokens for accuracy and evasion work in the damage query, same shape as
the existing stat boosts (capped ±6, either word order): `-2 acc`, `+1 eva`
(also `accuracy` / `evasion`), order-free per combatant clause. `acc` is that
combatant's accuracy stage, `eva` its evasion stage; only the ATTACKER's acc
and the DEFENDER's eva feed `hitChance` (`AccuracySide.stage`). Examples:
`"Garchomp max atk -1 acc uses Stone Edge vs Skarmory max def +2 eva"` → 48%.

They are parsed in their own regex in `parseCombatant` (NOT via the `STAT_ALIAS`
map used for the five battle stats) and stored on the spec as `_accStage` /
`_evaStage` (resolved mon fields `accStage` / `evaStage`) — never inside
`spec.boosts`, so they stay out of the stat-stage damage math (Stored Power
etc.) and out of the card's stat boosts. A bare `+N` with no stat still resolves
to the move-used stat, never to accuracy.

## Output formatting is not the agent's job

The result-card layout (row order/indents, fields, rounding, KO wording, tables)
is implemented once in **`scripts/output.mjs`** and pinned in
**`OUTPUT-FORMAT.md`** for maintainers. The agent never composes, restyles,
reformats, or explains a card's layout — answer a query by pasting the output
script's block verbatim (MUST OBEY rule 2). When output rules change, edit
`output.mjs` and `OUTPUT-FORMAT.md` together, never AGENTS.md.

## Project layout

- `data/` — generated JSON datasets (all derived from the Smogon XY dex via `npm run fetch:data` / `gen:aux`):
  - `xy-pokemon.json` — 503 Pokemon (name, dex, types, abilities, baseStats, bst, tier, evolvesTo, alternateFormes)
  - `moves-xy.json`, `abilities-xy.json`, `natures-xy.json`, `types-xy.json`
  - `_raw-xy-basics.json` — raw Smogon dump (regenerate, don't hand-edit)
- `src/` — TypeScript library: `types.ts`, `statdex.ts` (loader/lookups), `stat-calc.ts` (stats at level), `type-chart.ts`, `damage-calc.ts` (gen-6 damage engine)
- `scripts/` — staged pipeline + Node data/CLI scripts:
  - `input-converter.mjs` — offline EXTRACTOR stage: word-scan + regex passes + alias/dex lookup (line → spec JSON; NO defaults filled). Also hosts the shared front lexicon (data loads, lookup maps, PLATE_BY_TYPE, resolveMoveName, parseMoveChain) that fill.mjs imports.
  - `fill.mjs` — DEFAULTS + RESOLVE stage: spec JSON → calc-input JSON (fills every missing variable from `auto-fill-defaults.md`, validates names against the dex, computes level-N stats). The single deterministic stage both the offline converter and the agent route feed.
  - `damage.mjs` — thin compat card CLI: input-converter → fill → calc → output (`--resolved` emits the calc input JSON, identical to the converter→fill chain output)
  - `calc.mjs` — pure calculation stage (resolved records → result bag; no lookups, no printing; CLI: JSON in → JSON out)
  - `output.mjs` — result-card renderer (bag → OUTPUT-FORMAT text; `--chat` wraps it for chat windows)
  - `fetch-xy-dex.mjs`, `gen-move-ability-data.mjs`, `random-stats.mjs`, `audit-abilities.mjs`, verify scripts
- `auto-fill-defaults.md` — **doc-as-code default rules** (fill defaults, EV/nature shorthand, orbs, weather setters, ability defaults); parsed by `fill.mjs` at startup
- `OUTPUT-FORMAT.md` — the exact result-screen contract, implemented by `output.mjs`
- `examples/` — sample case JSON files for the damage CLI (`.resolved.json` = calc-stage input)
- `myteam/` — the user's **custom team database** (see below). NOT consumed by the statdex or damage-calc code.
- `teams_tools/` — Python scripts to maintain `myteam/` files (see below)

## myteam/ — user's competitive team database (manual, user-authored)

`myteam/teams.tsv` is the **master source** for the user's custom XY teams. `myteam/teams.xlsx` is a derived Excel view generated from it. **Do not treat `myteam` data as official Smogon data** — it is hand-curated by the user (roles, tiers, EVs, benchmarks) and may disagree with `data/xy-pokemon.json` (e.g. tier labels like `below RU` / `MISC`, names like `Mega Rayquaza` instead of `Rayquaza-Mega`).

Format (`teams.tsv`):
- Header row (tab-separated): `Pokemon<TAB>Typing<TAB>Ability<TAB>Tier<TAB>Tags<TAB>EV<TAB>HP<TAB>ATK<TAB>DEF<TAB>SPA<TAB>SPD<TAB>SPE`
- Lines starting with `#` are the file's own tag/schema definitions — do not drop them.
- `Tier` ∈ `AG Uber OU UUBL UU RUBL RU below RU MISC` (canonical order, strong → weak; `below RU` is below RU).
- `Tags` ∈ `SetUp / Fast / Breaker / Utility / Wall` (role tags, may combine).
- `EV` is free text like `[Nature] STAT EV / STAT EV (benchmark note)`, e.g. `Bold DEF 188 (M.Swarmpert ice punch 6.3% 2HKO)` or `HP 156 (general bulk)`.
- The HP/ATK/DEF/SPA/SPD/SPE columns are base stats (ints).

The xlsx splits the TSV across sheets by tier (`Mega`, `Uber`, `OU`, `UU`, `RU`, `MISC`) plus a `Speed` lookup sheet. Round-trip is maintained by `teams_tools/`.

## teams_tools/ — Python maintainers for myteam data

- `tsv2xlsx.py` — regenerate `teams.xlsx` from `teams.tsv` (splits into tier sheets, colors tags/tiers). Optional CLI: `python tsv2xlsx.py [src.tsv] [dst.xlsx]`
- `xlsx2tsv.py` — merge Excel sheet edits back into the master `teams.tsv`. Optional CLI: `python xlsx2tsv.py [src.xlsx] [dst.tsv]`
- `add-row.py` — append Pokemon rows to `teams.tsv` (duplicates allowed) then re-sort.
- `rebuild-file.py` — re-sort / normalize `teams.tsv` in place.

Path handling: **no hardcoded absolute paths.** `_paths.py` resolves defaults relative to the repo (`<repo>/myteam/teams.tsv` and `<repo>/myteam/teams.xlsx`, since the tools live in `<repo>/teams_tools/`). Override per-run with env vars `TEAMS_TSV` / `TEAMS_XLSX`, or pass an explicit path argument where the CLI supports it (tsv2xlsx, xlsx2tsv). Run from the `teams_tools/` directory (scripts import the sibling `_paths.py`).

---

# Known Coverage Gaps (ENGINE-GAPS.md raw dump — to be cleaned up later)

> Unimplemented-feature inventory (auras, move-order / Payback, etc.), dumped
> verbatim here for now.

This is a living inventory of mechanics that the Gen-6 damage engine does **not**
fully model, so contributors know what is open and what is intentional. It is
not a bug list to be fixed blindly: each entry says whether it is planned,
intentional, or left open for someone to pick up.

Scope note: this tool prints a single-hit damage roll plus a defender KO/chip
simulation. "Covered" means the printed number is right for what a query can
express. Effects that only change accuracy, crit rate, priority, PP, flinch, or
post-hit stat stages are generally out of scope and not listed here.

Status legend:
- `not implemented` — open, safe to implement.
- `not implemented (intentionally)` — deliberately left open, like the auras.
- `won't implement` — intentional design decision (see AGENTS.md).
- `partial` — some path exists but nothing reaches it in practice.
- `done` — implemented.

## Abilities

| Ability | Status | Notes |
|---|---|---|
| Fairy Aura / Dark Aura | **not implemented (intentionally)** | Gen-6: while the holder is in play, Fairy/Dark moves from **all** battlers deal x4/3. Affects Xerneas (Fairy Aura) and Yveltal (Dark Aura) as attackers and as defenders. See the contributor note below. |
| Aura Break | **not implemented (intentionally)** | Zygarde. While present, reverses Aura abilities so matching-type moves deal x3/4 instead of x4/3. Only meaningful once the Auras above exist. |
| Sheer Force | done | x1.3 on the 133 gen-6 damaging moves whose chance-based secondary is suppressed (see `SHEER_FORCE_MOVES` in `src/damage-calc.ts`, derived from @smogon/calc via `scripts/_derive-sf.mjs`; covered by `verify-smogon.mjs`). |
| Analytic | **not implemented (intentionally)** | Engine hook exists (`params.movedAfterTarget` -> x1.3), but nothing sets it and the project deliberately does **not** infer "moved after the target" from a speed comparison. See the move-order note below. |
| Flash Fire (attacker) | **not implemented (intentionally)** | Boost hook exists (`params.flashFireBoosted` / `abilityOn`) but nothing sets it; there is no "already fire-boosted" context token. |
| Rivalry | done | x1.25 same gender / x0.75 opposite (engine; needs both sides' `gender` set, which the CLI does not parse yet). |
| Shell Armor / Battle Armor | done | Block a requested `crit` against the holder (Mold Breaker does not bypass). Covered by `verify-smogon.mjs`. |
| Skill Link | done | Multi-hit moves land the guaranteed maximum 5 hits as a weighted 5-hit distribution (see Multi-hit row for the remaining gap). |
| Unnerve | done | Disables the defender's Sitrus Berry in the KO sim (resist berries were already gated in `calcDamage`). |
| Infiltrator | done | Attacker's moves ignore Reflect/Light Screen. Covered by `verify-smogon.mjs`. |
| Solar Power (defender chip) | done | End-of-turn 1/8 sun chip for a Solar Power holder in sun is in the KO sim and the turn table. |
| Scrappy | done | Normal/Fighting moves connect against Ghost-types. Covered by `verify-smogon.mjs`. |
| Sturdy (KO survival) | done | Full-HP Sturdy/Focus Sash holder survives a lethal **attack** at 1 HP; indirect chip can still KO it. See Items / Focus Sash. |
| Download / Intimidate / Defiant / Competitive / Moxie / stat-stage entries | `won't implement` | Stat-stage abilities are never auto-applied by design (see AGENTS.md). |

## Items

| Item | Status | Notes |
|---|---|---|
| Focus Sash | done | Full-HP holder survives one lethal attack at 1 HP in the KO sim; never protects against indirect damage. Inactive if entry hazards already took HP. |
| Air Balloon | done | Holder is immune to Ground while the balloon is intact (not an ability, so Mold Breaker does not bypass it). |
| Iron Ball | done | Holder is grounded: Ground moves connect against a Flying-type and Levitate stops working. |
| Ring Target | done | Negates the holder's typing immunities (Normal hits a Ring Target Ghost, Ground hits a Flying, etc.). |
| Black Sludge | done | Heals a Poison-type holder 1/16 and chips non-Poison holders 1/16 in the KO sim / turn table. |
| Soul Dew / Thick Club / Light Ball / Deep Sea Tooth / Deep Sea Scale | done | Species stat multipliers (Latios/Latias, Marowak/Cubone, Pikachu, Clamperl). |
| Plates | done | All 17 plates parse by name, and the `plate` keyword picks by the move's **effective** type (a Pixilate Hyper Voice gets Pixie Plate). |
| Metronome | not implemented | Consecutive-use power ramp (multi-turn; low priority). |

## Moves

| Mechanic | Status | Notes |
|---|---|---|
| Multi-hit moves (no Skill Link) | not implemented | Only the Skill Link guaranteed-5-hit case is modeled (as a weighted sum distribution). Non-Skill-Link 2-5 hit moves (Bullet Seed without Skill Link, etc.) still print as one hit. |
| Aerilate / Pixilate / Refrigerate / Normalize (type remap) | **done** | STAB, type effectiveness, immunities and the x1.3 all key off the remapped type (Flying/Fairy/Ice). |
| Scrappy | done | (Ability row above; listed here for move-type completeness.) |
| Freeze-Dry | done | x2 vs Water handled. |
| Avalanche / "moved-after-target" powers | **not implemented (intentionally)** | Avalanche (doubles if the user was hit this turn) is not modeled. Electro Ball and Gyro Ball keep their documented **stat-based** power scaling (current Speed stat, see AGENTS.md), but the engine never infers *who actually moved first*. Payback is its own case — see Dynamic-power (variable BP) moves. See the move-order note below. |
| Future Sight / Doom Desire-style delay | not implemented | (Not gen-6 damage-number relevant in the single-hit view.) |

### Dynamic-power (variable BP) moves

Statuses here reflect what a single-hit calc can express. Decided 2026-09-04:
the **out-of-scope** groups below are not modeled; **Weather Ball** was agreed
in-scope and is now implemented (2026-09-04); **Payback → flat 50** is agreed
but NOT yet implemented — pick it up if you want it.

| Move(s) | Status | Why / notes |
|---|---|---|
| Heavy Slam, Heat Crash (weight ratio); Low Kick, Grass Knot (target weight); Electro Ball, Gyro Ball (Speed stat) | done | BP resolved from current stats in `resolveTypeAndPower` (`src/damage-calc.ts`). |
| Eruption, Water Spout, Flail, Reversal (user HP); Crush Grip, Wring Out (target HP) | done | HP-fraction powers. |
| Stored Power, Punishment (stat-stage counts) | done | Scales off the typed stage boosts. |
| Return / Frustration | done | Fixed at 102 (max happiness) — no happiness tracking. |
| Knock Off, Acrobatics, Facade, Venoshock, Hex, Wake-Up Slap, Smelling Salts (item/status condition doublers) | done | Doublers that a query can express (`@ item`, `no item`, status words). |
| **Payback** | **partial — wrong** | Engine currently doubles it from a **Speed comparison** (`currentStat`), which is order inference the project avoids. Agreed scope: treat as a flat **50 BP** (no doubling). NOT yet applied — remove the special-case branch in `resolveTypeAndPower`. |
| **Weather Ball** | done | Base 50 → **100** and a type shift with weather (sun/desolate → Fire, rain/primordial → Water, hail → Ice, sand → Rock; none/Delta → Normal 50). `resolveWeatherBall` in `src/damage-calc.ts`; the type feeds the shared `effType` (STAB / effectiveness / immunities / resist berries) and the CLI plate picker. Air Lock/Cloud Nine null the weather first, so suppressed weather reads Normal 50. |
| Pursuit, Assurance, Avalanche, Revenge (hit-this-turn / switch / damaged) | not implemented | Need a "took a hit this turn / opponent acted" state the CLI can't express. Intentional. |
| Fury Cutter, Echoed Voice, Rollout, Ice Ball (consecutive-turn scaling) | not implemented | Multi-turn state. Intentional. |
| Spit Up, Trump Card, Present, Natural Gift, Magnitude | not implemented | Need Stockpile count / PP left / random roll / berry — out of scope. |
| Brine (double at ≤50% target HP) | not implemented (intentional) | Kept flat 65 BP. |
| Stomp / Steamroller / Dragon Rush (double vs a Minimize target) | not implemented | Minimize isn't modeled (its +2 evasion stage is all that applies). |
| Last Resort | not implemented (intentional) | "Always works": flat 140 BP, no availability condition. |

**If you pick up the Payback flat-50 change:** delete the `named(move,
"Payback")` branch in `resolveTypeAndPower`; data already stores 50 BP.

## KO sim

| Mechanic | Status | Notes |
|---|---|---|
| Poison Heal + toxic | done | Poison Heal *replaces* poison/toxic damage with a 1/8 heal (no chip); low-HP Gliscor @ Toxic Orb no longer dies to end-of-turn poison. |
| Sturdy / Focus Sash survival | done | Survive a lethal full-HP **attack** at 1 HP only; indirect end-of-turn chip (weather, burn/poison, hazards, Black Sludge, Solar Power) can still KO right after. |
| Multiscale vs entry hazards | done | Hazards take HP before the attack, so the x1/2 Multiscale (and Sturdy/Focus Sash) check is inactive once the defender is below full HP (`damageTakenBefore`). |

## Intentional simplifications (do not "fix")

See AGENTS.md: neutral nature by default, EVs default 0, an inert held item is
always assumed unless `no item`, megas always hold their Mega Stone (so Knock
Off does not get its boost vs a mega), no auto stat-stage abilities, status
tokens ignore typing (Fire-types can be "burned" if typed), Flame Orb / Toxic
Orb default their holder to burned / badly poisoned with the gen-6 type
restriction (Fire can't be burned, Steel/Poison can't be badly poisoned).

Auras (Fairy Aura / Dark Aura / Aura Break) are **intentionally not
implemented**. If you want to take them on, the cleanest place is a shared
helper in `src/damage-calc.ts` that, given the matchup, computes the aura
multiplier for the effective move type and feeds both the attacker and defender
   sides; wire auto-defaulting in `scripts/fill.mjs` and add coverage rows to
`scripts/verify-smogon.mjs`.

**Move-order-dependent mechanics** (Analytic, Avalanche, Flash Fire's attacker
boost, "attacker was hit last turn") are **intentionally not implemented**, and
that decision extends to *inferring turn order from a speed comparison*: speed
ties, priority, Trick Room and switch-in timing make such inference guesswork
rather than a real answer. Do **not** "fix" these by comparing attacker/defender
Speed in `calcDamage` or by auto-picking an ability from it. If a contributor
wants them, the right shape is an explicit, user-typed context token in the CLI
that maps to the existing `movedAfterTarget` / `flashFireBoosted` hooks, with
coverage rows in `scripts/verify-smogon.mjs`.
