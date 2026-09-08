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
> `OVERHAUL-PLAN.md` WS1. The **Type plates** table is the exception: it is
> parsed at startup, so an edit there changes plate resolution immediately.
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
| `landorust` / `landorustherian` / `landot` | Landorus-Therian |
| `lando` | Landorus |
| `landorusi` / `landorusincarnate` | Landorus |
| `thundurust` / `thundurustherian` | Thundurus-Therian |
| `thundurusi` / `thundurusincarnate` | Thundurus |
| `tornadust` / `tornadustherian` | Tornadus-Therian |
| `tornadusi` / `tornadusincarnate` | Tornadus |

Usage: `chomp uses EQ vs lando` — both sides resolve before damage is computed.

## Move acronyms

| You type | Resolves to |
|---|---|
| `bb` | Brave Bird |
| `eq` | Earthquake |
| `blitz` | Flare Blitz |
| `draco` | Draco Meteor |

Usage: `Garchomp uses EQ vs Skarmory`. Full move names (`Earthquake`,
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

| You type | Engine token |
|---|---|
| `sandstorm` / `sand storm` / `permanent sandstorm` / `sand` | sand |
| `harsh sunlight` / `harsh sunshine` / `extremely harsh sunlight` / `sunny day` / `permanent sun` / `sunny` / `sun` | sun |
| `permanent rain` / `rain dance` / `rain` | rain |
| `hail storm` / `hailstorm` / `permanent hail` / `hail` | hail |
| `desolate land` | desolate (primal) |
| `primordial sea` / `heavy rain` | primordial (primal) |
| `delta stream` / `strong winds` | delta (primal) |

## Terrain words

| You type | Engine token |
|---|---|
| `electric terrain` | electric |
| `grassy terrain` | grassy |
| `misty terrain` | misty |
| `psychic terrain` | psychic |
