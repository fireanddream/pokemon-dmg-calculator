# aliases.md — name aliases & acronyms (hand-edited lookup)

This file is the **human registry of every shorthand the damage query accepts**:
species nicknames, move acronyms, item acronyms, stat abbreviations, and the
status / weather / terrain words that map to engine tokens. It is written to be
read and **edited by people** — add your own aliases here so they are recorded
in one place.

> **Status: registry / documentation.** Species / move / item / stat / status /
> weather tables below mirror the built-in lookup tables in
> `scripts/input-converter.mjs` (the offline extractor), which is what the
> parser actually reads today. Wiring those tables into the parser (so an edit
> here changes what the front accepts) is planned future work — see
> `OVERHAUL-PLAN.md` WS1. The **Type plates** and **Boosting moves** tables are
> the exceptions: both are parsed at startup, so an edit there changes plate /
> boost-signal resolution immediately.
>
> Full canonical names (species, moves, items, abilities, natures) come from
> the dex data in `data/` and are accepted as-is without an alias. This file
> only lists the **short forms** on top of those.

## How to add an alias

1. Pick the right table (species / move / item / stat / status / weather).
2. Add a row. **Key** = what the user types (lowercase; punctuation and spaces
   are ignored when matching, so `lando t` and `landot` are the same key).
   **Resolves to** = the exact canonical name from the dex data (`data/`).
3. Keep keys short and unambiguous. If two keys overlap, the longest one wins
   at match time, so put the more specific alias first in your mind when you
   write it.

## Species aliases

| You type | Resolves to |
|---|---|
| `rotom` | Rotom |
| `rotomw` / `rotomwash` | Rotom-Wash |
| `rotomh` / `rotomheat` | Rotom-Heat |
| `rotomc` / `rotomfrost` | Rotom-Frost |
| `rotomf` / `rotomfan` | Rotom-Fan |
| `rotomm` / `rotommow` | Rotom-Mow |
| `chomp` | Garchomp |
| `ttar` / `tar` | Tyranitar |
| `zard` | Charizard |
| `zardx` / `zard x` | Charizard-Mega-X |
| `zardy` / `zard y` | Charizard-Mega-Y |
| `charizardx` / `charizard x` | Charizard-Mega-X |
| `charizardy` / `charizard y` | Charizard-Mega-Y |
| `landorust` / `landorustherian` / `landot` | Landorus-Therian |
| `lando` | Landorus |
| `landorusi` / `landorusincarnate` | Landorus |
| `thundurust` / `thundurustherian` | Thundurus-Therian |
| `thundurusi` / `thundurusincarnate` | Thundurus |
| `tornadust` / `tornadustherian` | Tornadus-Therian |
| `tornadusi` / `tornadusincarnate` | Tornadus |

Usage: `chomp EQ vs lando` — both sides resolve before damage is computed
(the move is claimed anywhere on the attacker side; no `uses` word).

## Move acronyms

| You type | Resolves to |
|---|---|
| `bb` | Brave Bird |
| `eq` | Earthquake |
| `blitz` | Flare Blitz |
| `draco` | Draco Meteor |
| `dd` | Dragon Dance |
| `sd` | Swords Dance |

Usage: `Garchomp EQ vs Skarmory`. Full move names (`Earthquake`,
`Hidden Power`) and most multi-word move names work without an acronym.

## Item acronyms

`You type` is what appears in a side spec (`@ item` or after the species).

| You type | Resolves to | Notes |
|---|---|---|
| `lo` | **Life Orb** on the attacker · **Leftovers** on the defender | context-dependent, see below |
| `cb` / `band` / `banded` | Choice Band | |
| `spec` / `specs` | Choice Specs | |
| `scarf` | Choice Scarf | |
| `belt` | Expert Belt | |
| `sash` | Focus Sash | |
| `plate` | the type plate matching the move | bare keyword or `<Type> plate`, see below |

`lo` is the only two-way acronym: on the **attacker** it is Life Orb, on the
**defender** it is Leftovers.

### Type plates

This table is **machine-parsed at startup** (`scripts/input-converter.mjs`) — an
edit here changes what the front accepts. Each row serves both needs:

- (a) the `plate` keyword resolves to the 20% type-boost item for the **move's
  effective type** (Flame Plate for a Fire move, ...);
- (b) the type-first phrase `<Type> plate` is an item alias for that row's item
  (`fairy plate` → Pixie Plate, `psychic plate` → Mind Plate, ...). A plate's
  own name works too, so `@ Fairy Plate`, `@ Pixie Plate`, and a bare `plate`
  with a Fairy move all give the same item.

Normal has no plate item, so its row is **Silk Scarf** (Normal's 20% type-boost
item): `normal plate` — or a bare `plate` with a Normal move — resolves to
Silk Scarf.

| Move type | Plate |
|---|---|
| Bug | Insect Plate |
| Dark | Dread Plate |
| Dragon | Draco Plate |
| Electric | Zap Plate |
| Fairy | Pixie Plate |
| Fighting | Fist Plate |
| Fire | Flame Plate |
| Flying | Sky Plate |
| Ghost | Spooky Plate |
| Grass | Meadow Plate |
| Ground | Earth Plate |
| Ice | Icicle Plate |
| Normal | Silk Scarf |
| Poison | Toxic Plate |
| Psychic | Mind Plate |
| Rock | Stone Plate |
| Steel | Iron Plate |
| Water | Splash Plate |

## Boosting moves

This table is **machine-parsed at startup** (`scripts/input-converter.mjs`), like
the Type plates table. It lists the gen-6 **self-stat-raising moves** that act as
**boost signals**, never as the damage move: a boosting move typed in the move
slot (or, later, on the attacker side under the free-order grammar) converts to
attacker stat stages instead of occupying a move slot. `Dragon Dance` +
`Earthquake` means Garchomp at `+1 atk / +1 spe` using Earthquake — never a
"Dragon Dance then Earthquake" combo. Multiple signals coexist additively and
stack with any typed stages, each stat capped at +-6.

Columns are the stage delta per stat (blank = 0). Acc/eva are the
accuracy/evasion stage channels — they never change damage/KO numbers.

| Move | atk | def | spa | spd | spe | acc | eva |
|---|---|---|---|---|---|---|---|
| Acid Armor | | +2 | | | | | |
| Agility | | | | | +2 | | |
| Amnesia | | | | +2 | | | |
| Autotomize | | | | | +2 | | |
| Barrier | | +2 | | | | | |
| Belly Drum | +6 | | | | | | |
| Bulk Up | +1 | +1 | | | | | |
| Calm Mind | | | +1 | +1 | | | |
| Coil | +1 | +1 | | | | +1 | |
| Cosmic Power | | +1 | | +1 | | | |
| Cotton Guard | | +3 | | | | | |
| Defend Order | | +1 | | +1 | | | |
| Defense Curl | | +1 | | | | | |
| Double Team | | | | | | | +1 |
| Dragon Dance | +1 | | | | +1 | | |
| Growth | +1 | | +1 | | | | |
| Harden | | +1 | | | | | |
| Hone Claws | +1 | | | | | +1 | |
| Howl | +1 | | | | | | |
| Iron Defense | | +2 | | | | | |
| Meditate | +1 | | | | | | |
| Minimize | | | | | | | +2 |
| Nasty Plot | | | +2 | | | | |
| Quiver Dance | | | +1 | +1 | +1 | | |
| Rock Polish | | | | | +2 | | |
| Sharpen | +1 | | | | | | |
| Shell Smash | +2 | -1 | +2 | -1 | +2 | | |
| Shift Gear | +1 | | | | +2 | | |
| Swords Dance | +2 | | | | | | |
| Tail Glow | | | +3 | | | | |
| Withdraw | | +1 | | | | | |
| Work Up | +1 | | +1 | | | | |

What is deliberately NOT here (and why): moves whose stat raise is conditional
or multi-turn (Charge, Stockpile, Geomancy, Power Trick), random (Acupressure),
or not a stat stage (Focus Energy raises the crit ratio). The intended
simplifications for the rows that ARE here — Belly Drum's HP cost, Growth's sun
doubling, Autotomize's weight cut — are documented in `DESIGN-RECORDS.md`
("Known coverage gaps" / "Intentional simplifications").

## Stat abbreviations

Used for EVs (`252 atk`) and stat-stage tokens (`-1 atk`, `+2 spa`). Short
forms only — the two special stats and HP have NO English full names in the
lookup (`special`, `special attack`/`special defense`, `hit point(s)` are all
rejected; nobody types them and the fragments create fake partial matches):

| You type | Resolves to |
|---|---|
| `atk` / `attack` | atk |
| `def` / `defense` | def |
| `spa` / `spatk` / `spc` | spa |
| `spd` / `spdef` / `sdef` | spd |
| `spe` / `speed` | spe |
| `acc` / `accuracy` | accuracy stage |
| `eva` / `evasion` | evasion stage |

## Status words

| You type | Engine token |
|---|---|
| `burned` / `burnt` / `burn` / `brn` | burn (`brn`) |
| `poisoned` / `poison` / `psn` | poison (`psn`) |
| `badly poisoned` / `bad poison` / `toxic` / `tox` | toxic (`tox`) |
| `paralyzed` / `paralysis` / `par` | paralysis (`par`) |
| `asleep` / `sleeping` / `sleep` / `slp` | sleep (`slp`) |
| `frozen` / `freeze` / `frz` | freeze (`frz`) |

## Weather words

Arena weather is a plain slot: identical values collapse, and two different
explicit weathers error. Weather-setting **ABILITY** names (`Drought`,
`Drizzle`, `Sand Stream`, `Snow Warning`, and the primal `Desolate Land` /
`Primordial Sea` / `Delta Stream`) are abilities, not weather words — type
them as abilities and `fill.mjs` resolves their arena weather.

| You type | Engine token |
|---|---|
| `sand` / `sandstorm` | sand |
| `sun` / `sunny` / `sunny day` / `harsh sunlight` | sun |
| `rain` / `rain dance` | rain |
| `hail` / `snow` | hail |
| `extremely harsh sunlight` | desolate (primal condition) |
| `heavy rain` | primordial (primal condition) |
| `strong winds` | delta (primal condition) |

## Terrain words

| You type | Engine token |
|---|---|
| `electric terrain` | electric |
| `grassy terrain` | grassy |
| `misty terrain` | misty |
| `psychic terrain` | psychic |
