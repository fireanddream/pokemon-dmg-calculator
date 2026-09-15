# auto-fill-defaults.md — default auto-fill rules (doc-as-code)

The defaults stage (`scripts/fill.mjs`) auto-fills every variable a query does not
specify (level, nature, EVs, held-item behavior, ability pick order, orb→
status, weather setters, ...). **All of those auto-fill rules live in the
tables in this file**, which the script parses at startup — so changing a
default is an edit to a table cell here, never to the script. If a table is
missing or cannot be parsed, the script falls back to its built-in values and
prints a warning, so a broken edit shows up loudly instead of silently.

Name *aliases / acronyms* (species, move, item shorthand) are NOT default
rules — they live in `aliases.md`, the hand-editable names-lookup registry.

This file absorbed the former `ABILITY-DEFAULTS.md` (ability pick rules are now
the sections below); that file no longer exists.

Machine-read tables (each in its own `##` section, one table per section):

| Section | What it defines |
|---|---|
| `## Defaults at a glance` | Pure fill defaults (level, nature, IVs, EVs, ...) |
| `## EV / nature shorthand` | The `max atk/spa/def/spd` expansions |
| `## Nature EV defaults` | The `Adamant/Modest/Jolly/Timid` spread a typed nature implies |
| `## Orb defaults` | Flame Orb / Toxic Orb → status (gen-6 restrictions) |
| `## Weather setters` | Weather-setting ability → arena weather |
| `## Status first (top priority)` | Statused mon → interacting ability |
| `## Fixed attacker defaults` | Attacker per-species default abilities |
| `## Fixed defender defaults` | Defender per-species default abilities |

**Rules for human editors:** keep one table per `##` section (extra tables in a
section break parsing); keep the column order; put exact canonical names
(abilities, items, pokemon) in species/item/ability cells. Values use plain
numbers/words — see each table's header.

**How extraction works:** the front binds only the tokens it recognizes and
never fills a value the user did not state. Name / acronym / shorthand lookup
belongs in `aliases.md` (extraction); every EXPANSION and default below is
applied by the front automatically, so nothing is ever pre-computed. Consult
this file only to predict or explain what the front assumed. Every resolved
assumption prints on the result card (nature, EVs, item, ability, arena), so a
wrong guess is visible.

## Defaults at a glance

The `Default` column is machine-read for the pure fill defaults. An unlisted
variable defaults to its "nothing" state (`+0` stages, no status, no weather,
no terrain, no hazards, no screens). Changing a cell changes the default the
next time the front runs.

| Variable | Default | Override in the spec |
|---|---|---|
| Level | 50 | `Lv100` / `level 100` / `Lv 75` (clamped 1–100) |
| Nature | Serious | any nature word: `Jolly`, `Adamant`, ... |
| IVs | 31 | no spec token. Only forced values change: **Hidden Power Fire → attacker SpA IV 30**; **Foul Play → defender Atk IV 0** when its base Atk < base SpA (Foul Play is the only move that reads the defender's Atk). Shown on the card. |
| EVs | 0 | named `N <stat>` tokens and `max <stat>`; a typed offensive nature also fills a spread (see `## Nature EV defaults`) |
| Held item | has item, no effect | name an item / acronym, or `no item` |
| Status | none | `burned`, `poisoned`, `toxic`, `paralyzed`, `asleep`, `frozen` |
| Stat stages | +0 on all five stats | `-1 atk`, `+2 spa`, `-3 def`, `+1 spe` (cap ±6) |
| Accuracy / evasion stages | +0 / +0 | `-2 acc`, `+1 eva` (cap ±6) |
| Ability | auto-picked (see the ability sections below) | name any ability |
| Weather | none | `sand`, `sun`, `rain`, `hail`, `snow`, `harsh sunlight`, ... |
| Terrain | none | `electric / grassy / misty / psychic terrain` |
| Entry hazards | none | `rock`; Spikes: `spike` = 1 layer, `spikes` = 3, or a spaced count either order (`2 spikes` / `spikes 2` / `spikes x2`) |
| Screens / other conditions | none | not modeled unless typed |
| Ability stat changes | never auto-applied (Intimidate, Download, ...) | type the stage explicitly |

Where these are applied: level/IV/EV/nature feed the stat build (`resolve()` in
the front, `calcStats` in `src/stat-calc.ts`); the "none"/inert states are the
absent/empty representation. Do not re-derive them per call, and do not write
them back into a spec.

## Held-item rules

- No item named ⇒ **has item, no effect**: the mon still "holds" something with
  no effect, so Knock Off gets its damage boost and the mon is never treated as
  truly itemless. Nothing is shown on the card.
- Real items (berries, Leftovers, Life Orb, Choice items, ...) apply **only
  when named** (full name or acronym — see the spec grammar).
- **`no item` / `itemless`** = genuinely no held item (e.g. already knocked
  off): Knock Off gets no boost and nothing is held.
- **Megas always hold their Mega Stone** — it cannot be knocked off or
  consumed, a mega is never itemless, and Knock Off does **not** get its boost
  against one. Named items on a mega are ignored (caller must override).
- Flame Orb / Toxic Orb are **not** the default — they only apply when named,
  and then set a status (see `## Orb defaults` below).

## Orb defaults

A named orb sets its holder's status **before** ability defaulting, so
status-first abilities (Guts, Poison Heal, ...) react to it. An **explicitly
typed status always overrides** the orb. Gen-6 type restrictions are honored:
the orb does nothing on the blocked types (a note is shown, no status is set).

| Orb | Status it sets | Does nothing on |
|---|---|---|
| Flame Orb | burned | Fire |
| Toxic Orb | badly poisoned | Steel / Poison |

## EV / nature shorthand (engine-resolved expansions)

`max X` tokens expand to a fixed EV spread **plus a default nature**. The
nature depends on the species' base stats when the EV spread drops one attacking
stat: if base Atk ≤ base SpA the nature lowers **Atk** (Bold / Calm); if base
Atk > base SpA it lowers **SpA** (Impish / Careful). When several `max` tokens
are typed, every one expands (different stats coexist); if no explicit nature is
typed the FIRST-typed `max`'s nature wins, and the merged EVs must not exceed
the 510 total cap (an over-total is a hard error).

A nature the user **types** is strict against the shorthands: each `max <stat>`
carries the nature it would auto-pick, and naming any other nature is a **hard
conflict**, not a silent override. The implied sets are `max atk` → Adamant,
`max spa` → Modest, `max def` → Bold/Impish, `max spd` → Calm/Careful,
`max spe` → Jolly/Timid, and `max hp` → none (so any typed nature is allowed
alongside `max hp`). So `max def Adamant`, `max atk Jolly` and `max spe Adamant`
all error.

| Token | HP | ATK | DEF | SPA | SPD | SPE | Nature if base Atk ≤ SpA | Nature if base Atk > SpA |
|---|---|---|---|---|---|---|---|---|
| `max atk` | 0 | 252 | 0 | 0 | 0 | 0 | Adamant | Adamant |
| `max spa` | 0 | 0 | 0 | 252 | 0 | 0 | Modest | Modest |
| `max def` | 252 | 0 | 252 | 0 | 0 | 0 | Bold | Impish |
| `max spd` | 252 | 0 | 0 | 0 | 252 | 0 | Calm | Careful |
| `max spe` | 0 | 0 | 0 | 0 | 0 | 252 | Timid (special move) | Jolly (physical move) |
| `max hp` | 252 | 0 | 0 | 0 | 0 | 0 | none | none |

`max spe` / `max speed` picks its auto-nature by the side's move: Timid for a
special move, Jolly for a physical one (fallback: Jolly when base Atk > SpA,
else Timid — e.g. the defender, which has no move). `max hp` carries NO
auto-nature (no nature boosts HP).

Shorthands and plain `N <stat>` EV tokens merge (e.g. `max atk` + `252 HP` sets
Atk 252 and HP 252), except an explicit EV on the stat a `max` NAMES conflicts
with it when the values differ (same value collapses). An explicit HP EV
overrides the HP that `max def` / `max spd` imply. Plain nature/EV defaults
remain in force for every stat not covered by a token. A typed offensive
nature's implied spread (next section) merges the same way: a stat the
shorthands already set is left alone, and an attempt that would break the 510
total is dropped rather than erroring.

## Nature EV defaults

A typed offensive nature alone implies a standard EV spread — the inverse of the
`max` shorthands. Only these four natures do it, and only when the nature is
**typed by the user** (a Jolly/Timid the `max spe` shorthand auto-picks never
triggers it). Each row's attempts run in order, and for each attempt:

1. a stat that already has an EV (a typed `N <stat>` or a `max` expansion) is
   left as-is — the existing value wins;
2. otherwise the EV is set, but only if it keeps the side's total at or under
   510;
3. an attempt that would break 510 is **dropped**, leaving room for later
   attempts (it is not an error).

| Nature | Attempt 1 | Attempt 2 |
|---|---|---|
| Adamant | atk 252 | — |
| Modest | spa 252 | — |
| Jolly | spe 252 | atk 252 |
| Timid | spe 252 | spa 252 |

So `Jolly 100 Spe` → 100 Spe + 252 Atk; `Jolly 252 HP` → 252 HP + 252 Spe (the
Atk attempt is dropped: 756 > 510); `Jolly 252 HP 252 Def` → no nature EVs at
all. Any nature not in the table sets no EVs.

## Weather setters

A weather-setting ability on **either side** sets the Arena condition when no
explicit weather was typed. An explicitly typed weather always overrides the
ability's weather. The primal ability names (`Desolate Land` / `Primordial
Sea` / `Delta Stream`) are typed as **abilities**; their *condition* words
(`extremely harsh sunlight` / `heavy rain` / `strong winds`) are ordinary
explicit weather, deliberately not synced with the abilities.

| Ability | Weather |
|---|---|
| Drought | sun |
| Desolate Land | desolate |
| Drizzle | rain |
| Primordial Sea | primordial |
| Sand Stream | sand |
| Snow Warning | hail |
| Delta Stream | delta |

When two setters face off: a **primal** weather (desolate / primordial / delta)
beats a regular one (sun / rain / sand / hail) regardless of Speed; otherwise
the **slower** pokemon's weather wins (its ability activates last), and an
exact Speed tie keeps the attacker's weather.

## Aura setters

An aura ability on **either side** raises a field aura condition — like a
weather setter, except the two auras can be active at once and coexist with any
weather/terrain (nothing overrides anything). While an aura is active, every
move of its matching type, from **either** battler, is affected. `Aura Break`,
held by either side, inverts every active aura instead. The Arena row names the
active aura(s); an explicit ability always wins, and the auto ability default
(e.g. Xerneas → Fairy Aura) feeds this same condition.

| Ability | Aura |
|---|---|
| Fairy Aura | Fairy |
| Dark Aura | Dark |

## Ability defaulting (overview)

When no ability is named, the front picks one in this order — each step is
expanded in its own section below, and the chosen ability always prints on the
pokemon line:

0. **Status first** (top priority) — see `## Status first (top priority)`.
1. **Weather setter** — see `## Weather setters`; runs right after status-first.
2. **Fixed attacker defaults** — see `## Fixed attacker defaults` (only when
   that mon attacks).
3. **Fixed defender defaults** — see `## Fixed defender defaults` (only when
   that mon defends).
4. **Special rules (universal)** — Sand Rush when in sand (if it also has Sand
   Force), Chlorophyll in sun, Swift Swim in rain.
5. **Attacker auto-boost** — pick the attacker ability that boosts the current
   move/context (includes Mold Breaker when it breaks the defender's ability);
   see `## Attacker auto-boost`.
6. **Defender auto-mitigate** — pick the ability that mitigates immediate →
   hazard → status → weather damage; see `## Defender default ability`.
7. Otherwise the first ability in the dex data.

An **explicitly named ability always overrides** any default, including the
status-first rule. Abilities never apply on-entry stat changes (Intimidate,
Download, Defiant, Moxie, ...) — every mon starts at +0 stages.

## Status first (top priority)

Applies to attackers AND defenders, before every other default (fixed tables,
weather rules, auto-boost, defender mitigation). If the pokemon has a status
effect and any of its abilities interacts with that status, that ability is
used:

| Status | Abilities that react to it |
|---|---|
| burnt | **Guts** (Atk x1.5), Flare Boost (SpA x1.5), Marvel Scale (Def x1.5), Magic Guard (no burn chip) |
| poisoned / badly poisoned | **Poison Heal** (heals 1/8 max HP/turn), Toxic Boost (Atk x1.5), Guts (Atk x1.5), Magic Guard (no poison chip) |
| paralyzed | Guts |
| asleep | Guts |
| frozen | Guts |

Guts reacts to any status (burn, poison, paralysis, sleep, freeze); Marvel
Scale, Flare Boost and Magic Guard only to burn; Poison Heal, Toxic Boost and
Magic Guard only to poison. If a pokemon has several abilities reacting to the
same status, the earliest on that row wins (e.g. burnt Conkeldurr → Guts,
poisoned Zangoose → Toxic Boost, burnt physical wall Milotic → Marvel Scale,
poisoned Gliscor → Poison Heal).

An **explicitly named ability always overrides this rule**, exactly like every
other default.

## Fixed attacker defaults

Applies when the pokemon is the **attacker** (before the defender table).

| Pokemon | Default ability |
|---|---|
| Hippowdon | Sand Stream |
| Magnezone / Magneton | Magnet Pull |
| Scizor | Technician |
| Serperior | Contrary |
| Starmie | Natural Cure |
| Blaziken | Speed Boost |
| Greninja | Protean |
| Landorus | Sheer Force |
| Conkeldurr | Guts |
| Scolipede | Speed Boost |
| Togekiss / Togetic | Serene Grace |
| Chesnaught | Bulletproof |
| Entei | Pressure |
| Feraligatr | Sheer Force |
| Galvantula | Compound Eyes |
| Heliolisk | Dry Skin |
| Infernape | Blaze |
| Machamp | No Guard |
| Porygon2 | Download |
| Roserade | Natural Cure |
| Ambipom | Technician |
| Braviary | Defiant |
| Cinccino | Skill Link |
| Druddigon | Rough Skin |
| Emboar | Reckless |
| Escavalier | Overcoat |
| Hitmontop | Intimidate |
| Rhyperior | Solid Rock |
| Sigilyph | Magic Guard |
| Durant | Hustle |
| Kingdra | Swift Swim |
| Tyrantrum | Rock Head |

## Fixed defender defaults

Applies when the pokemon is the **defender**; runs **after** the attacker table.

| Pokemon | Default ability |
|---|---|
| Azumarill | Huge Power |
| Clefable | Magic Guard |
| Reuniclus | Magic Guard |
| Bronzong | Levitate |
| Mr. Mime | Soundproof |
| Quagsire | Unaware |
| Dewgong | Thick Fat |
| Gogoat | Sap Sipper |
| Maractus | Water Absorb |
| Walrein | Thick Fat |

(These sit below the **status-first rule** and the fixed attacker table, and
above the universal special rules and the generic auto-boost /
defender-mitigation defaults. So a statused mon that reacts to that status
still beats this table — e.g. a burned Clefable attacker keeps Magic Guard, but
a burned Pokemon with a Guts-type reaction wins over a fixed pick. An
explicitly named ability always wins over all of them.)

## Conditional ability defaults

- **Sand Rush vs Sand Force**: any pokemon with both abilities uses **Sand
  Rush** while sandstorm is active (never Sand Force unless explicitly
  stated). Outside sand there is no special case: Mold Breaker is picked via
  the Mold Breaker rule below when it helps, otherwise the auto/first-ability
  fallback applies.
- **Mold Breaker** (part of the attacker auto-boost step): if the attacker has
  Mold Breaker and the defender's ability would reduce or block the current
  move (Levitate vs Ground, Thick Fat/Heatproof vs Fire/Ice, Flash Fire vs
  Fire, Sap Sipper vs Grass, Water/Electric absorbs, Fur Coat/Marvel Scale vs
  Physical, Multiscale, Filter/Solid Rock when super effective, Wonder Guard,
  Bulletproof/Soundproof), pick Mold Breaker — it deals more damage. Because it
  runs in the auto-boost step it comes after the fixed tables, so a fixed
  species default (e.g. Druddigon -> Rough Skin) still wins over Mold Breaker.
  Explicitly naming an ability always wins.
- **Status-triggered abilities**: handled by the **status-first rule** at the
  top (Guts, Toxic Boost, Flare Boost, Poison Heal, Marvel Scale, Magic Guard),
  which runs before the fixed tables — not by the auto-boost step below. The
  rule picks the interacting ability for any statused mon regardless of the
  move used.

## Weather (arena) rules

- **Cloud Nine / Air Lock (top priority):** if either side has Air Lock or
  Cloud Nine, ALL weather effects are nullified — move power boosts/halves,
  end-of-turn sand/hail chip, weather-damage immunities, water/fire fail
  conditions under primal weathers, and weather abilities (Chlorophyll,
  Swift Swim, Sand Rush, Solar Power, ...). The Arena row still names the
  weather but marks it `(suppressed)`.
- **Weather-setting abilities**: see `## Weather setters`.
- The Arena row uses Smogon's weather names: **Sun**, **Rain**, **Sandstorm**,
  **Hail**, **Harsh Sunshine**, **Heavy Rain**, **Strong Winds**. Both the
  ability names and the Smogon names are accepted as input tokens.

The engine honors Mold Breaker (and `ignoresAbilities`) against defensive
abilities: it cancels Thick Fat, Marvel Scale, Fur Coat, Grass Pelt,
Multiscale, Filter/Solid Rock, Unaware, and the type immunity/absorb
abilities.

## Attacker auto-boost

Only picked when the ability's boost actually applies to the move being used.
Status-triggered boosts (Guts, Toxic Boost, Flare Boost) are resolved by the
status-first rule at the top and never reach this step.

- Huge Power / Pure Power: Physical move
- Adaptability: move matches the pokemon's own type (STAB)
- Technician: move BP is 1-60
- Tough Claws: contact move
- Iron Fist: punch move
- Strong Jaw: bite move
- Mega Launcher: pulse move
- Reckless: recoil move (Brave Bird, Double-Edge, Flare Blitz, ...)
- Blaze / Overgrow / Torrent / Swarm: matching type + attacker at <=1/3 HP
- Solar Power: sun + Special move
- Sand Force: sand + Rock/Ground/Steel move
- Sniper: crit
- Aerilate / Pixilate / Refrigerate: Normal-type move

Everything else (Flash Fire, Sap Sipper, Download-style boosts, ...) is never
auto-selected; those need the ability named or the relevant context given.

## Defender default ability (mirror of the attacker rule)

When a defender's ability is not named, after the fixed per-species table, pick
the ability that mitigates this matchup, by priority:

1. **Immediate move damage** (Levitate vs Ground, Sap Sipper vs Grass, Flash
   Fire/Heatproof/Thick Fat vs Fire, Water/Electric absorbs, Bulletproof,
   Soundproof, Wonder Guard, Fur Coat vs Physical, Grass Pelt, Multiscale at
   full HP, Filter/Solid Rock when super effective).
2. **Entry hazard damage** (Magic Guard negates already-set Stealth Rock and
   Spikes; Levitate vs Spikes). Magic Bounce does **not** count — it only
   reflects hazard-setting moves, it doesn't stop existing hazards or other
   indirect damage.
3. **Weather damage** (Magic Guard and Overcoat nullify sand/hail chip; Ice
   Body heals in hail).

(Status-conditioned mitigations — Marvel Scale vs a Physical move while burnt,
Magic Guard / Poison Heal vs burn/poison chip — are resolved by the status-first
rule at the top, before this section, whenever the defender is statused.)

Within the chosen priority, the first such ability in the dex order is used.
Chip handling in the KO sim mirrors this: Magic Guard is checked first and
skips status and weather chip; Overcoat is checked before weather and skips
weather chip only; Magic Guard also negates the entry-hazard hit at switch-in.

## Weather / arena defaulting (fill rules)

No weather by default. Weather appears only when:
- an explicit weather word is typed (`sand`, `rain`, `sun`, `hail`, `snow`,
  `harsh sunlight`, or the primal condition words `extremely harsh sunlight`,
  `heavy rain`, `strong winds`), or
- a weather-setter ability is named **or auto-defaulted** (see
  `## Weather setters`).

In a two-move combo, the default ability and weather anchor to **move 1**.

## The only times an extra token is required

The front handles everything it can from the user's own words. An extra token
is needed only when the user's intent contradicts a default and their wording
cannot carry it through — chiefly:

- genuinely **itemless** → the spec needs `no item` (an unmentioned item would
  otherwise default to has-item-no-effect);
- a **named item / nature / ability / boost / weather** the user stated but
  wrote loosely (translate to the token form; see the spec grammar).

If the front still cannot infer something the user must decide, ask the user
rather than guessing.
