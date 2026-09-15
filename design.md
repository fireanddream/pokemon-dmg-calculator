# design.md — gen-6 damage calculator: design

Purpose: a fully offline Gen 6 (XY/ORAS) damage calculator. A free-word query
line becomes a spec, then a resolved calc-input, then a result card. This
document records how each stage is built and which functions own it.

Source-of-truth stores (parsed; win on conflict with this file):

- `auto-fill-defaults.md` — default rules, parsed by `fill.mjs`.
- `aliases.md` — name / acronym / shorthand lexicons.
- `OUTPUT-FORMAT.md` — result-card layout.
- `scripts/echo.mjs` header — recognition-echo layout + span schema.
- `scripts/tokenize.mjs` — the shared line tokenizer.

## 1. Pipeline & entry points

| Stage | File | Key functions |
|---|---|---|
| extract | `scripts/input-converter.mjs` | `parseQuery`, `parseCombatant`, `claimSlot`, `speciesKeyAt` |
| defaults + resolve | `scripts/fill.mjs` | `resolve`, `buildStats`, `fillWeather`, `weatherFromSetters`, `foldBoostSignals` |
| math | `scripts/calc.mjs` | `calcSingle`, `calcCombo`, `moveUseDistribution`, `multiHitDistribution` |
| render | `scripts/output.mjs` | `render`, `renderSingle`, `renderCombo` |
| echo | `scripts/echo.mjs` | `renderEcho`, `spansFromLogs`, `wrapBlock` |
| agent route | `scripts/route.mjs` → `damage.mjs` | `runQuery` |

```
query line
  → spec JSON        input-converter.mjs   extract only; no defaults
  → calc-input JSON  fill.mjs              defaults + resolve
  → result bag       calc.mjs              pure engine math
  → card             output.mjs            layout
```

`src/*.ts` is the engine, compiled to `dist/`; the front imports
`calcStats`, `calcDamage`, `koAnalysis`, `hitChance`, `RESIST_BERRIES` from it.
`data/` is the generated dex. The offline converter and `route.mjs` emit the
same spec JSON and converge on `fill.mjs`.

## 2. Query grammar — free-order `vs` frame

- One query = two sides split by exactly one `vs`: left attacker, right
  defender. No `vs` → error; two → error.
- `uses` / `use` is inert: never required, never added.
- Words bind to their own side's species, in any order. A move is claimed only
  on the attacker side; a move word on the defender side is dropped.
- Comma and `, . ; / \ |` are hard separators — no phrase crosses one.
- Hyphen rule: `hyphenToSpace` runs first in `parseQuery` and
  `parseCombatant`. Every typed hyphen becomes a space, except a hyphen that
  starts a word and is followed by a digit (`-2 atk` stays a minus). Dex keys
  still fold hyphens through `norm`.

## 3. Converter tokenizer

Purpose: turn one side's words into typed claims. Entry point
`parseCombatant` (`input-converter.mjs`) runs a single left-to-right
**longest-fit claim sweep** — no regex passes.

**Sweep.** Walk the side's words once. At each unconsumed word the longest
matching claim wins; its span is marked and skipped. `CLAIM_MAP` phrases match
only over originally adjacent words, so length ordering is the only guard.

**Claim sources (longest-first per word):**
- `CLAIM_MAP` — natures, abilities, items, `<type> plate` aliases, acronyms,
  statuses, weather, terrain, hazards, `no item`;
- moves — an exact damaging/boost phrase, only when `opts.claimMoves` is set
  (attacker side). Other Non-Damaging moves never take the slot;
- shapes — glued/split level, `max <stat>`, EV, stat stage, acc/eva, stat-less
  `±N`, spikes layers.

**Species** — claimed in the same sweep by `speciesKeyAt`: exact glued-run
match (≤3 contiguous words, `norm`-folded) against `monByName`, then
`SPECIES_ALIASES`. No residue, permutation, fuzzy, or ends-junk pass. Unknown
→ `missing species`; two on one side → conflict.

**Moves** — validated in-parse before species resolution: 1 distinct → single
card; 2 → fixed two-move sequence, left-to-right; 0 or >2 → error. Re-claiming
the same move collapses. `then` / `+` / `and` / commas are inert.

**Consume-and-mark** — claims are marked, never deleted. `parseCombatant`
writes `spec._sideLog` (slot → word indexes); this is the recognition-echo
span source (§4).

**Dedupe vs conflict** — `claimSlot` collapses identical same-slot values and
throws `conflict on <slot>` on different ones. Per side, so a repeated species
across a mirror match is valid.

## 4. Recognition echo

Purpose: show what the parser bound, before the card. Entry `renderEcho`
(`echo.mjs`); spans come from `spansFromLogs` over `spec._sideLog`. Every
answer is two blocks, in order:

1. the input line, words unchanged, spacing re-laid so labels do not collide,
   with one label per bound span under its first word;
2. exactly one of the card (`output.mjs`) or the error message (§8).

**Shared tokenizer** — `tokenize.mjs`. Normalize once, then split into
case-preserving words: `hyphenToSpace` first, `@`/quotes → spaces, the hard
boundaries `,.;/\|` → a non-space sentinel so no phrase matches across them.
Each word carries `{raw, t, gi, hardBefore}`; `gi` is the global word index.

**`_sideLog`** — one `{label, from, len}` per claim (`from` = global word
index). Each side parse hands its log to `opts.capture`; a throw attaches the
accumulated logs as `err.sideLogs`, so `parseQuery` can render "scanned so
far": an attacker error leaves the defender bare, a defender error leaves it
partial, and a cross-side `mergeArena` error labels the whole line.

**Labels** — `species` / `nature` / `ev:<stat>` / `move` / `item` / `status` /
`ability` / `boost` / `level` / `arena` / `mega`. `max <stat>` echoes as
`ev:<stat>`. `???` is reserved for unplaceable input; an un-scanned error tail
is bare.

**Wrap** — `wrapBlock`, width `--width` (default 100, `<= 0` off); a word, a
glued binding, and a label are never split.

**Span** — `{atoms:[first,last], label}`; `atoms` are global word indexes,
contiguous and non-overlapping.

## 5. Arena

Purpose: resolve weather, terrain and hazards from bare words and setter
abilities (`fill.mjs`).

- Arena words bind bare anywhere on either side. There are no
  `in` / `under` / `after` signals; those are junk. Phrase beats single word
  (`rock` → `rock slide`, `sand` → `sand stream`).
- Same-slot values dedupe/conflict through `claimSlot`. Cross-side `mergeArena`
  throws on two different values (weather, terrain, spikes layers), collapses
  equal values; Stealth Rock is a boolean.
- Weather is one plain slot. An explicit typed weather beats a setter ability;
  `fillWeather` returns early when a weather was typed.
- Setter abilities — `weatherFromSetters` decides from both sides' resolved
  abilities: one setter → its weather; two regular setters → the slower sets
  last (tie → attacker); primal beats regular; primal vs primal → slower; same
  → collapse.
- Primal — `desolate` / `primordial` / `delta` are permanent. `desolate` makes
  a Water move fail, `primordial` makes a Fire move fail; they act as sun/rain,
  and `delta` removes Flying's Rock/Electric/Ice weaknesses. Weather Ball maps
  `desolate`→Fire, `primordial`→Water, `sand`→Rock, `hail`→Ice, none/`delta`→
  Normal 50. Cloud Nine / Air Lock null the effects for the calc (the row shows
  `(suppressed)`). The primal condition words are ordinary explicit weather,
  not synced to the primal abilities.
- Spikes — 1–3, either order or `xN` / `2x`; bare `spike` = 1, `spikes` = 3,
  a typed count wins. Glued digit forms and `N layers of` are noise.
- Terrains — full name only (`electric terrain`). Bare `psychic` is the move.

## 6. Boost signals

Purpose: a self-boost move in the move slot becomes attacker stat stages, never
damage. `foldBoostSignals` (`fill.mjs`) folds the `aliases.md`
`## Boosting moves` table (fallback `BUILTIN_BOOST_MOVES`).

- Additive with typed stages and stat-less `±N`, capped ±6 per stat.
- Acc/eva signals land on acc/eva: Coil / Hone Claws, Double Team / Minimize.
- Not signals (conditional/random): Charge, Stockpile, Geomancy, Power Trick,
  Acupressure, Focus Energy. Acronyms: `dd` → Dragon Dance, `sd` → Swords Dance.
- Simplified costs (not modeled): Belly Drum's HP, Growth's sun, Autotomize's
  weight.

## 7. Mega upgrade

Purpose: `mega` upgrades a side's species to its Mega forme. `claimSpecies`
(`input-converter.mjs`) applies it and logs the span as `mega`.

- Shapes: standalone `mega` adjacent to the species, prefix or suffix
  (`mega-<base>` / `<base>-mega` fold through the hyphen rule). Exact standalone
  word only — no substring/edge regex, so `Meganium`, `Yanmega`, `Megahorn` are
  unaffected.
- Has a Mega forme → use it; already Mega → no-op; no Mega forme →
  `missing species mega`.
- `-X` / `-Y` bases (Charizard, Mewtwo) keep the base pick; aliases `zardx`,
  `charizard x`, etc. reach the formes.
- `Mega <move>` and `Mega Launcher` win by longer phrase, so `Venusaur Mega
  Drain` splits back to base + move.

## 8. Errors

Purpose: one shape per failure. `scripts/errors.mjs` is the only builder, so
the shape is fixed by construction.

- `missing <var>: "<detail>" — see -search` — `side`, `species`, `move`,
  `hidden power type`.
- `missing species mega "<name>" — see -search`.
- `missing split: ... one "vs" ... — see -help and -grammar`.
- `conflict on <slot>: A vs B`.
- domain — illegal Hidden Power type, EV over 252.
- cap — `too many moves in a combo — capped at 2`, `too many EVs: N (> 510 cap)`.
- `unbound EV: "<token>"` — a stat word with no number, or a number with no
  stat word (R4).
- R1 / R2 — a stat-less signed `±N` is the dynamic boost; `+N` plus a stageable
  stat word is a stage; `+N hp` needs an EV number or it errors.
- T2 — unknown words are silently dropped (no `???`, no error).

## 9. `no item`

- `no item` / `itemless` / `no-item` sets `spec.noItem` per side; `fill.mjs`
  passes it through.
- `calc.mjs` derives `targetHoldsItem = !defender.noItem && !defender.mega`
  (Knock Off) and `attackerHoldsItem = !attacker.noItem` (Acrobatics doubles
  only when this is false). An unmentioned mon is assumed to hold an inert item.
- A Mega always holds its stone: `resolve()` clears `noItem` on a Mega, and an
  explicit item or `plate` on a Mega throws `conflict on item: <item> vs Mega
  Stone`.

## 10. Limits — what is not modeled

Living inventory of mechanics the engine does not fully model. The tool prints
a single-hit roll plus a defender KO/chip simulation; effects that only change
accuracy, crit rate, priority, PP, flinch, or post-hit stages are out of scope.

Status legend: `not implemented` — open · `not implemented (intentionally)` —
deliberately left open · `won't implement` — intentional design decision ·
`partial` — a path exists but nothing reaches it.

### Abilities

| Ability | Status | Notes |
|---|---|---|
| Analytic | **not implemented (intentionally)** | Hook `params.movedAfterTarget` → x1.3 exists; nothing sets it. The engine never infers "moved after" from a Speed comparison. |
| Flash Fire (attacker) | **not implemented (intentionally)** | Hook `params.flashFireBoosted` / `abilityOn` exists; no "already fire-boosted" token. |
| Download / Intimidate / Defiant / Competitive / Moxie / stat-stage entries | `won't implement` | Stat-stage abilities are never auto-applied. |

### Items

| Item | Status | Notes |
|---|---|---|
| Metronome | **won't implement** | Consecutive-use power ramp (multi-turn). |

### Moves

| Mechanic | Status | Notes |
|---|---|---|
| Fixed-count multi-hit (Bonemerang 2, Double Kick 2, Twineedle 2, Double Hit 2, Dual Chop 2, Gear Grind 2, Triple Kick 3) | not implemented | Print as one hit. Triple Kick also escalates 10/20/30 BP. |
| Avalanche / "moved-after-target" powers | **not implemented (intentionally)** | Avalanche not modeled. Electro Ball / Gyro Ball use stat-based scaling, but the engine never infers who moved first. Payback is separate (below). |
| Future Sight / Doom Desire-style delay | **won't implement** | Not relevant in the single-hit view. |

#### Dynamic-power (variable BP) moves

| Move(s) | Status | Notes |
|---|---|---|
| **Payback** | **not implemented (intentionally)** | Flat 50 BP; after-target doubling out of scope. |
| Pursuit, Assurance, Avalanche, Revenge | not implemented | Need a "took a hit this turn / opponent acted" state. |
| Fury Cutter, Echoed Voice, Rollout, Ice Ball | not implemented | Consecutive-turn state. |
| Spit Up, Trump Card, Present, Natural Gift, Magnitude | not implemented | Need Stockpile count / PP / random roll / berry. |
| Brine | not implemented (intentional) | Kept flat 65 BP. |
| Stomp / Steamroller / Dragon Rush | **won't implement** | Minimize is not modeled (+2 evasion only). |
| Last Resort | not implemented (intentional) | Flat 140 BP, no availability condition. |

### Curated-out variant formes (one entry per species)

`fetch-xy-dex.mjs` exports `curate()`: 472 entries ship, 31 variants filtered,
so each species resolves one way.

| Variant group | Status | Notes |
|---|---|---|
| Arceus type formes (`Arceus-Rock`, `-Fire`, … 17 total) | **not implemented** | Multitype not modeled; only base Normal Arceus remains. |
| Genesect drive formes (`Genesect-Burn`, `-Chill`, `-Douse`, `-Shock`) | **not implemented** | Techno Blast type changes not modeled; only base Genesect remains. |
| Darmanitan-Zen | **not implemented** (dropped) | The `zen` forme word collided with Zen Headbutt. Only base Darmanitan remains. |
| Pikachu cosplay formes (`Belle`, `Cosplay`, `Libre`, `PhD`, `Pop-Star`, `Rock-Star`) | removed (cosmetic) | `Pikachu-Belle` renamed to base Pikachu; the other five dropped. |
| Basculin-Blue-Striped | removed (cosmetic) | Base Basculin kept. |
| Keldeo-Resolute | removed (cosmetic) | Base Keldeo kept. |
| Vivillon patterns (`Fancy`, `Pokeball`) | removed (cosmetic) | Base Vivillon kept. |

### Open forme-word collisions

A species run whose trailing word is also the first word of a longer phrase
consumes the forme word and strands the move → `missing move` (never a wrong
number). The `-Mega` path guards this with `longerPhraseAt` + split-back (§7);
ordinary forme runs do not. Short aliases are the escape hatch (`giratina o`).

| Typed | Currently | Intended |
|---|---|---|
| `giratina origin pulse` | Giratina-Origin, `pulse` stranded | Giratina + Origin Pulse |
| `rotom heat wave` / `rotom heat crash` | Rotom-Heat, trailing word stranded | Rotom + Heat Wave / Heat Crash |
| `rotom frost breath` | Rotom-Frost, `breath` stranded | Rotom + Frost Breath |
| `shaymin sky drop` | Shaymin-Sky, `drop` stranded | Shaymin + Sky Drop |
| `castform sunny day` | Castform-Sunny, `day` stranded | Castform + Sunny Day |

### Intentional simplifications

Neutral nature by default, EVs 0 by default, an inert held item assumed unless
`no item`, Megas always hold their Mega Stone, no auto stat-stage abilities, and
status words ignore typing (Fire can be "burned" if typed; Flame Orb / Toxic Orb
still apply their status with the gen-6 type restriction).

### Move-order-dependent mechanics

Analytic, Avalanche, Flash Fire's attacker boost, and "attacker was hit last
turn" are not implemented, and the project does not infer turn order from a
Speed comparison — priority, Trick Room and switch timing make that guesswork.
The intended shape is an explicit context token feeding `movedAfterTarget` /
`flashFireBoosted`, with rows in `verify-smogon.mjs`.

## 11. Agent route

Purpose: one call turns a natural-language line into the two-block answer, so
an assistant does no parsing, defaulting, or formatting. The assistant judges
whether a message is a damage calc; if so it routes the `vs` line here, or asks
for one when the `vs` is missing. A non-calc question is answered by the
assistant directly.

`scripts/route.mjs` is a thin alias of `damage.mjs` `runQuery`: one line
argument → converter → echo → fill → calc → output in one process (data loaded
once), always fenced for pasting.

**How a user lets an agent answer:** give the assistant the sentence containing
`vs` (`Garchomp Dragon Claw vs Heatran`). The agent extracts nothing itself — it
does not pick out the species, move, item, or EVs, does not expand shorthand,
and does not fill defaults; it only finds that sentence and runs

```
node scripts/route.mjs "<the user's sentence, verbatim>"
```

and pastes the fenced block back unchanged — Block 1 the recognition echo,
Block 2 the card (or the error). Nothing is reworded or recomputed. The
`pokemon-damage-calc` skill (`skills/pokemon-damage-calc/SKILL.md`) documents
this procedure for agents; copy it under `.opencode/skills/` to load it in
opencode.

`damage.mjs` is the compat card CLI; it also takes `--no-echo` (card only),
`--chat` (fence both blocks), and `--resolved` (calc-input JSON only).

## 12. Verification

`verify:damage` 78/78, `verify:acc` 44/44, `verify:echo` 7/7,
`verify:multihit` 34/34, `verify:lookup` 81/81, `verify:help` 59/59, plus the
corpus chaincheck "all identical". `@smogon/calc` is a devDependency oracle
only; the engine never depends on it at runtime.

## 13. CLI lookup (`-search`)

`scripts/lookup.mjs`, CLI-only and out of the damage path: `searchCommand`,
`findPokemon`, `findMoves`, `findStats`, `formatStats`, `benchmarkSpeed`. Output
is one comma-separated line, or `none found`.

- `-search pokemon <type> [type2]` — exact typing set (full type names, 1–2, any
  order; a mono type never matches a dual).
- `-search move <type> [power] [phys|special]` — attacking moves of a full type;
  category `physical` / `special` or `phy` / `spe` / `atk` / `spa`.
- `-search stats <name>` — header `Name Type1 [Type2] <abilities> Tier`, blank,
  six stat rows (value right-aligned to 3, one `x` per 5 base points), blank,
  then `Lv50 Speed: 0 EV / 252 EV neutral / 252 EV +Spe`. Name folds through
  `norm`; a miss prints `none found`. The Speed line delegates to the engine's
  `calcStats`, so it cannot drift from the calc.
