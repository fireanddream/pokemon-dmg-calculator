# DESIGN-RECORDS.md — gen-6 damage calculator: architecture, grammar contracts, coverage

Living home for (a) the **binding design contracts** of the loose-English →
calc front and (b) the **known-coverage inventory** of the gen-6 engine. It is
the file this project's docs point to for "how the front is designed" and
"what the engine does and does not model", and it is written to read like
project documentation (a candidate to become the README once the project
settles).

This file deliberately does NOT duplicate the doc-as-code rule stores — those
are parsed at startup and win on conflict:

- `auto-fill-defaults.md` — defaults / EV–nature shorthand / "only times the
  agent adds to the spec".
- `aliases.md` — lexicons: names, acronyms, type plates, boosting moves.
- `OUTPUT-FORMAT.md` — the result-card layout.
- `AGENTS.md` — session rules (always-on) + reference index.
- `pokemon-damage-calc` skill (`.opencode/skills/pokemon-damage-calc/SKILL.md`)
  — operational procedure for answering a damage query.
- `scripts/echo.mjs` header — recognition-echo CLI + span schema + layout.

Verbatim per-session narrative and adjudications live in dated
`session-tools-archive/SESSION-NOTES-*.md` files (`INDEX.md` catalogs them);
this document is the consolidated, current-state record.

---

## 1. Overview & pipeline

A Gen 6 (XY/ORAS) Pokemon **damage calculator**. The whole engine, dex data,
and docs ship in this repo. Users type natural-ish damage queries ("Garchomp
Dragon Claw vs Heatran", "does X one-shot Y", "how many hits to KO Z"); the
tool answers with a result card (damage roll, KO/chip odds, accuracy where
asked) whose layout is owned by one renderer and pinned by the oracle suites.

The engine is deterministic and fully offline:

```
query line
  →  spec JSON                (input-converter.mjs offline extractor; or agent route)
  →  calc-input JSON          (fill.mjs: defaults + resolve, reads auto-fill-defaults.md)
  →  card                     (calc.mjs pure math → output.mjs renderer)
```

`scripts/echo.mjs` renders the recognition echo (what the producer
understood) ahead of the card. `damage.mjs` is a thin compat card CLI gluing
the same chain. Both the offline converter route and the agent route emit the
SAME spec JSON and converge on `fill.mjs` — identical stated variables ⇒
byte-identical cards. `src/` holds the TypeScript library (statdex, stat-calc,
type-chart, damage-calc, accuracy, ko), compiled to `dist/`; `data/` holds
generated Smogon XY datasets.

## 2. Query grammar contract — free-order `vs` frame (agreed 2026-09-05/08)

- A query is TWO free-order SIDES split by exactly one `vs`: left =
  attacker, right = defender. No `vs` = hard error; more than one `vs` =
  error.
- `uses` / `use` is DEAD end to end — never an anchor, never manufactured,
  inert junk if typed. Users are never assumed to type it; agents never add
  it.
- Tokens on a side may appear in ANY order; attribution is structural (every
  token binds to the species of its own side). The move is claimed on the
  ATTACKER side only; the defender NEVER claims a move (a damaging-move word
  on the defender side is plain junk, silently dropped).
- **Comma is a GLOBAL hard separator**: `,` (and `.` `;` `/` `\` `|`) breaks
  every claim / phrase / adjacency — no token of any kind spans one.
- **Hyphen master rule** (`hyphenToSpace`, applied at the top of both
  `parseQuery` and `parseCombatant` before any tokenization): every hyphen in
  a TYPED line becomes a space, with ONE exception — a hyphen that starts a
  token and is followed by a digit stays a minus (a boost/stage sign: `-2
  atk`, `atk -2`). No ranges (`+2-1`), no other digit-adjacent hyphen is
  protected. Dex canon keys are untouched (`norm()` still folds hyphens).

## 3. Converter tokenizer — unified longest-fit claim sweep (steps 1–3 DONE 2026-09-09)

`parseCombatant`'s regex passes are GONE, replaced by ONE per-position
longest-fit claim walk over each side's atoms:

- **Claim sources, longest-first at each unconsumed atom:** (1) literal /
  class phrases from the module-scope `CLAIM_MAP` (natures, abilities with
  the primal-weather phrases excluded → they register as weather, item full
  names + `<type> plate` aliases + acronyms with side-sensitive LO, statuses,
  weather, terrain, stealth rock, `no item` spellings); (2) an exact damaging
  or boost move phrase (only with `opts.claimMoves` = the `parseQuery`
  attacker; seam G: Non-Damaging non-boost moves never claim the slot, so
  `toxic` still falls to status); (3) shape phrases (glued/split level,
  `max <stat>`, EV / stage / acc-eva / stat-less `±N` dynamic, spikes layers).
  Phrases match only over ORIGINALLY ADJACENT words (full-name contiguity);
  the guard falls out of the length ordering — a single word claims only when
  no longer claimable phrase starts at it.
- **Move claim folded into the sweep.** The old move pre-pass and
  `stripMatches` deletion are gone. Claims are validated in-parse before
  species resolution (1 distinct → single card; 2 → the fixed two-move
  sequence in claimed/left-to-right order; 0 or >2 → hard error). Re-naming
  the same move collapses. No delimiter grammar — `then` / `+` / `and` /
  commas are inert noise, never chains.
- **Species claim IN the sweep** (user 2026-09-09): an exact GLUED-RUN match
  (≤3 contiguous words, `norm`-folded) against `monByName` then
  `SPECIES_ALIASES` claims SPECIES as an ordinary literal via `speciesKeyAt`.
  NO residue layer, NO permutations, NO fuzzy lookup, NO ends-junk fallback.
  A misspelling is the "could not identify a pokemon" hard error. Two
  different species on one side hard-error (`conflicting species`). Free-order
  junk around a species is silently dropped on BOTH sides.
- **Consume-and-MARK.** Claimed spans are marked, never deleted; a per-side
  side log (claim slot → atom indexes) is kept on `spec._sideLog` — the
  converter-echo span source (see §4).
- **Dedupe-vs-conflict per slot, universal.** Identical same-slot claims
  collapse silently (user redundancy); different values HARD-ERROR naming the
  slot and every candidate (`conflicting atk stage: 2 vs 1`, `conflicting
  item: Leftovers vs Choice Band`) — never a silent overwrite or pick. All
  checks are per side (a species repeats legitimately across sides in a mirror
  match). Same canonical move claimed twice (`EQ then Earthquake`) collapses
  to a single-move card.

Open scope, in implementation order — see `TODO.md` build-order steps 5–9:
arena grammar (§5, bare-only), seam-C startup warning (option A — no key, any
word count, in two class lexicons), converter-side echo (§4 tail),
one-shot `route.mjs` (§11), forme-word collision set (§3).

## 4. Recognition echo (agent half live; converter half = TODO step 7)

Show what was understood BEFORE the result card or error: the user's query
line verbatim with a class ruler underneath, one short label per bound token.
Unbound tokens are `???` (feedback, never fabricated; NEVER a blocker — the
query still runs). Order: echo block first, then the card / error message.

**Layout contract, span schema, CLI**: `scripts/echo.mjs` header (owns the
renderer). Binding rules:

- Top line keeps the user's WORDS in order, spelling + punctuation as typed;
  inter-token spacing is single by default, widened only so a label fits. The
  line is NOT byte-verbatim.
- Each label starts exactly at its token's first column; a label may overhang
  right but the next labeled token is pushed so no two labels sit within one
  column. Multi-word bindings (`Life Orb`) glue with single spaces and anchor
  their label under the FIRST word.
- Atoms with no span (`@`, `vs`, punctuation) get no label.
- Label set: `species` / `nature` / `ev:<stat>` / `move` / `item` / `status`
  / `ability` / `boost` / `level` / `arena` / `mega`. `max <stat>` echoes as
  that stat's `ev:` label (`max atk` → `ev:atk`; there is NO `max` class),
  one unit spanning the phrase, anchored under its first word. Any leftover
  token the shorthand displaced (a redundant bare `252`) is an unbound junk
  atom: `???`.
- Wrapping: blocks wider than `--width` (default 100) wrap into row groups; a
  word, a glued binding, and a ruler label are never split across a row.
  `--width <= 0` never wraps.
- Producer contract: one span per token actually bound, `[firstAtom,
  lastAtom]` indexes into the whitespace-split line plus a label; spans are
  contiguous, non-overlapping, never fabricated.
- Route difference (accepted): the agent route echoes today; the offline
  converter route (`input-converter.mjs` / `damage.mjs`) does not until the
  converter-side echo (TODO step 7) wires it to the same renderer.

## 5. Arena grammar — bare words only, NO signals (contract for TODO step 5)

Arena words resolve to their arena condition typed BARE, anywhere on either
side. There are NO `in` / `under` / `after` signals (a former optional-signal
design is dead — the collision it guarded against is phantom; the real
ambiguities — `rock`→`rock slide`, `sand`→`sand stream` — are solved by
phrase-first matching, i.e. **win by guard**). `in` / `under` / `after` are
plain junk words. Agreed semantics:

- **Arena words are a normal class lexicon: no key, ANY word count, may bind
  two class tokens** (seam-C, option A — enforced by the startup guard).
  Move names are NOT class tables, so intentional overlaps (`rain dance`,
  `stealth rock`, `hail`, the four terrains — all non-damaging moves) never
  trip it; seam G + phrase-first resolve those.
- **Weather tiers — HARD vs SOFT.** A direct weather word (`sun`, `rain`,
  `sand`, `hail`, `sandstorm`, `sunny day`, `harsh sunshine`, ...) is HARD.
  A weather-setting ABILITY name used as an arena word (`drought`, `drizzle`,
  `sand stream`, `snow warning`, `desolate land`, `primordial sea`, `delta
  stream`) is SOFT: it binds the weather directly but is weaker than a hard
  word, and never claims the ability slot — the mon's ability comes from
  another explicit token or the default.
- **Cross-side weather resolution.**
    - hard beats soft, never a conflict (`sand stream` is overridden by
      `rain`);
    - two different HARD values ERROR (`weather: sun vs rain`);
    - two different SOFT values settle by Speed — the SLOWER side sets last
      (a primal weather beats a regular one regardless of Speed; an exact
      Speed tie keeps the attacker), mirroring fill's setter auto;
    - same-value claims collapse.
- **Within a side, different values for one slot hard-error** (the sweep's
  claimSlot): `drought rain` on one side is `conflicting weather: sun vs
  rain`.
- **Terrain / spikes are plain same-slot values.** Different cross-side values
  error, never add (`spike 1` on the attacker + `spike 2` on the defender is a
  conflict, NOT 3 layers). Same values collapse. Stealth Rock is a boolean and
  cannot conflict.
- **Explicit beats ability-auto (never an error).** A typed weather/terrain
  wins over what an auto-picked setter ability would set; fill only fills the
  arena when nothing was typed (`fillWeather` returns early).

Lexicon: simple weather (rain / sun / sand / hail, plus `snow` → hail;
gen-6), full/official weather names incl. primal (desolate / primordial /
delta), weather-setting moves as arena words (`rain dance`, `sandstorm`,
`hail`, ...), weather-setting ABILITY names as SOFT arena words, hazards
(Stealth Rock, Spikes), terrains (electric / grassy / misty / psychic).

Forms that must resolve identically:

- **Spikes layers 1–3** (IMPLEMENTED 2026-09-08): space-separated count
  either order (`2 spikes` / `spikes 2` / `spike 1`), or x-notation (`spikes
  x2` / `x2 spikes` / `spikes 2x` / `2x spikes`, `×`). BARE `spike` = 1
  layer, `spikes` = 3; a typed count wins over the word's own number. Glued
  digit forms (`1spike`, `spikes2`) and `N layers of …` are NOISE, not
  recognized. Counts value-gate 1–3 (`4 spikes` strands → bare-number
  error). Comma breaks every phrase. `spike(s)` is never a move.
- **Stealth Rock:** `stealth rock` or bare `rock` → same effect.
- **Terrains:** full name (`electric terrain`) only — no first-letter or bare
  `psychic` shorthand. Bare `psychic` is the damaging move Psychic on the
  attacker side (seam-C rule: a damaging move wins over the same-word class
  token); terrain `psychic` is reachable only as the 2-word `psychic terrain`.

Recorded examples: `charizard sun 252 atk blitz vs landot` → weather sun
(bare); `sand stream vs rain` → rain (hard beats setter); `sun vs rain` →
error; `drought vs sand stream` → the slower side's weather.

## 6. Boosting moves = boost signals (slot path DONE 2026-09-08, side path closed by the sweep)

A self-stat-raising move typed in the move slot is NEVER the damage move. The
claim sweep gates on dex category: damaging moves claim as before; moves in
the **Boosting moves** doc-as-code table (`aliases.md` `## Boosting moves`,
parsed at startup; `BUILTIN_BOOST_MOVES` fallback) become **boost signals**;
any other Non-Damaging move (Toxic, Will-O-Wisp, hazards, weather setters,
Protect…) is a class token and never occupies a slot. 0 damaging claims →
hard error (no "uses Bulk Up → no damage" card).

- `fill.mjs` folds signals onto the attacker via `foldBoostSignals` —
  ADDITIVE with each other and with typed stages and the stat-less dynamic
  boost, each stat capped ±6 (`-1` + DD + SD + EQ → `+2 atk / +1 spe` EQ;
  `+5 atk` + SD clamps at `+6`).
- Acc/eva signals (Coil / Hone Claws → acc; Double Team / Minimize → eva)
  land on the acc/eva channels (never damage).
- Excluded moves (not in the signal table): conditional/random ones (Charge,
  Stockpile, Geomancy, Power Trick, Acupressure, Focus Energy).
- Move acronyms: `dd` → Dragon Dance, `sd` → Swords Dance.
- **Intended simplifications** (costs deliberately not modeled — the tool
  answers "how much damage", not "what does this setup cost"): Belly Drum's
  50%-HP cost ignored (flat +6 atk), Growth's sun doubling ignored (always
  +1 atk/+1 spa), Autotomize's weight cut ignored (+2 spe only). If these
  are ever wanted, the cleanest place is `foldBoostSignals` plus a way to
  express the HP/weight/sun context on the attacker spec.

## 7. Mega upgrade token — exact-shape rules (IMPLEMENTED 2026-09-09, TODO step 4)

`mega` (standalone), `mega-<base>`, or `<base>-mega` reads as "upgrade this
side's pokemon to its Mega forme". Behavior contract:

- Signal + side's pokemon HAS a Mega forme → silently use the Mega forme.
- Signal + pokemon ALREADY its Mega forme → silent no-op.
- Signal + pokemon has NO Mega forme → HARD ERROR (fail loud; never fall back
  to the base forme; replaces the old silent no-op, e.g. "Mega Clawitzer").

Design decisions (verified against the current lexicons):

- **Scope.** The signal binds only to its side's species and is read only on
  leftover species words. The master hyphen rule folds `mega-<base>` and
  `<base>-mega` into the same two-word space forms as `Mega <base>` and
  `<base> Mega`, so ALL shapes are the two adjacency orders above.
- **Exact shapes only.** Standalone word `mega`, adjacent to the species word,
  either side. NO bare-substring or word-edge regex — that is what protects
  `Meganium` / `Yanmega` (and single-word move `Megahorn`): they contain
  edge-adjacent "mega" with no standalone word and keep resolving as
  themselves.
- **`mega- <x>` / `<x> -mega` with a space** (nothing glued across the
  hyphen) stays junk and falls into the existing "could not identify a
  pokemon" hard error. No special handling.
- **`-X` / `-Y` formes stay explicit.** Charizard / Mewtwo have no plain
  `<base>-Mega`; the upgrade must not fabricate one. `Charizard-Mega-X` /
  `Mewtwo-Mega-Y` (and the same suffix glued runs) resolve as themselves, and
  the reorder spellings `zard X` / `zardx` / `charizard x` / `charizardx`
  (plus the Y mirrors `zardy` / `charizard y`) are species aliases to the
  `-Mega-X` / `-Mega-Y` entries. A bare `Mega Charizard` / `Mega Mewtwo`
  keeps the base dex-order pick with the `mega` as junk — unchanged, out of
  scope (no hard error).
- **No-forme idempotence.** A token already resolving to a `-Mega` /
  `-Mega-X` / `-Mega-Y` dex entry is never re-upgraded.
- **"Mega X" moves and "Mega Launcher" win by longer phrase.** A `mega` word
  that starts a known 2–3 word phrase (`Mega Punch` / `Mega Kick` / `Mega
  Drain` moves, ability `Mega Launcher`) is never an upgrade signal. This
  resolves the pre-step-4 collisions where a mega-capable base directly
  preceded one: `Venusaur Mega Drain` = base Venusaur + the move Mega Drain
  (the `base mega` glued run SPLITS back to base + move), and `Clawitzer Mega
  Launcher ...` keeps the ability. `Megahorn` is single-word, so it never
  interacts with a `base mega` run at all. The split-back is GENERAL: a
  `-Mega`-forme run whose trailing word starts a longer phrase splits back to
  base, so `Charizard X-Scissor` (via the `charizard x` alias) reads as base
  Charizard + the move X-Scissor.
- **Implementation.** `claimSpecies` in `input-converter.mjs` handles the
  upgrade on the species claim: adjacent `mega` (prefix or suffix) upgrades to
  `<base>-Mega` when it exists (span logged as `mega` for the step-7 echo);
  bases with only `-X`/`-Y` formes keep the base pick; bases with NO mega
  forme at all hard-error. Corpus locks: `mega-prefix`, `mega-move-guard`,
  `mega-ability-guard`.

## 8. Error & junk philosophy — R4 / T2 rulings (2026-09-07/08)

- **R1 — any stat-less signed `+N` / `-N` is the dynamic boost** (the
  `_plusBoost` token; `fill.mjs` resolves which stat: attacker = the move's
  stat, defender = the stat the move targets). A signed number only fails to
  be dynamic when it combines with an adjacent stageable stat (`+2 atk` =
  stage).
- **R2 — `+N` force-combines with the next stat word.** Stageable stat
  (atk/def/spa/spd/spe, acc/eva) → stage; HP is never stageable, so `+N hp`
  survives ONLY when hp is doing EV duty (`+2 hp 252` = dynamic +2 + EV 252
  HP). `+2 hp` with no EV number after `hp` — and the mirror `hp +2` — HARD
  ERROR (never an ignored leak, never a silent dynamic fallback). No `+N hp`
  anchor spelling.
- **R4 — unbound stat WORD and unbound unsigned NUMBER are both hard errors**
  (a lone `hp`, a lone `252`, `252 special defense`). Stat lexicons carry
  SHORT aliases only — `special`→spa / `spdefense`→spd / `hit point` were
  removed; `atk / def / spe / accuracy / evasion` keep one-word names. (The
  echo's `???` can't substitute for R4 — `???` ≠ "will corrupt your
  numbers".)
- **T2 — plain junk words are SILENTLY DROPPED.** `then` / `and` / `with` /
  `uses` / misspellings: no error, no `_ignored`, no `ignored:` flag, no
  label, no `???`. The `???` echo class is RETIRED for junk (reserved for
  honest cannot-place feedback). R4 strays and semantic same-slot conflicts
  keep their hard-error messages.
- **Open consolidation question** (for the route session): once the echo
  shows unbound tokens, does the converter still need its zoo of bespoke
  errors? Lean: ONE "unrecognized input" master error carried by the echo,
  KEEPING same-slot conflicts and the bare-EV-number error. Re-examine R4
  under junk tolerance only deliberately.

## 9. `no item` semantics

`no item` / `itemless` (and, since the hyphen rule, `no-item`) sets
`spec.noItem` per side; `fill.mjs` passes `noItem` through; `calc.mjs` uses
`!defender.noItem && !defender.mega` to default `targetHoldsItem` (Knock
Off's +50% vs an itemless target). Default is inert-held. Attacker-side
`noItem` only affects display. Same-slot conflict (an item/plate name AND
`no item` on one side) is handled by the universal dedupe-vs-conflict pass.
Still open: confirm nothing should gate on attacker itemlessness; the echo
should show `no item` as an `item`-class binding once the converter echo
lands (never let it vanish).

## 10. Known coverage gaps (engine)

Living inventory of mechanics the gen-6 engine does **not** fully model —
what is open, what is intentional. Not a bug list to fix blindly; each entry
says whether it is planned, intentional, or left open.

Scope note: the tool prints a single-hit damage roll plus a defender KO/chip
simulation. "Covered" means the printed number is right for what a query can
express. Effects that only change accuracy, crit rate, priority, PP, flinch,
or post-hit stat stages are generally out of scope and not listed here.

Status legend: `not implemented` — open, safe to implement · `not implemented
(intentionally)` — deliberately left open · `won't implement` — intentional
design decision · `partial` — some path exists but nothing reaches it in
practice · `done` — implemented.

### Abilities

| Ability | Status | Notes |
|---|---|---|
| Fairy Aura / Dark Aura | **not implemented (intentionally)** | Gen-6: while the holder is in play, Fairy/Dark moves from **all** battlers deal x4/3. Affects Xerneas (Fairy Aura) and Yveltal (Dark Aura) as attackers and as defenders. See the contributor note below. |
| Aura Break | **not implemented (intentionally)** | Zygarde. While present, reverses Aura abilities so matching-type moves deal x3/4 instead of x4/3. Only meaningful once the Auras above exist. |
| Sheer Force | done | x1.3 on the 133 gen-6 damaging moves whose chance-based secondary is suppressed (`SHEER_FORCE_MOVES` in `src/damage-calc.ts`, derived from @smogon/calc; covered by `verify-smogon.mjs`). |
| Analytic | **not implemented (intentionally)** | Engine hook exists (`params.movedAfterTarget` → x1.3), but nothing sets it and the project deliberately does **not** infer "moved after the target" from a speed comparison. See the move-order note below. |
| Flash Fire (attacker) | **not implemented (intentionally)** | Boost hook exists (`params.flashFireBoosted` / `abilityOn`) but nothing sets it; there is no "already fire-boosted" context token. |
| Rivalry | done | x1.25 same gender / x0.75 opposite (engine; needs both sides' `gender` set, which the CLI does not parse yet). |
| Shell Armor / Battle Armor | done | Block a requested `crit` against the holder (Mold Breaker does not bypass). Covered by `verify-smogon.mjs`. |
| Skill Link | done | Multi-hit moves land the guaranteed maximum 5 hits as a weighted 5-hit distribution (see Multi-hit row for the remaining gap). |
| Unnerve | done | Disables the defender's Sitrus Berry in the KO sim (resist berries already gated in `calcDamage`). |
| Infiltrator | done | Attacker's moves ignore Reflect/Light Screen. Covered by `verify-smogon.mjs`. |
| Solar Power (defender chip) | done | End-of-turn 1/8 sun chip for a Solar Power holder in sun is in the KO sim and the turn table. |
| Scrappy | done | Normal/Fighting moves connect against Ghost-types. Covered by `verify-smogon.mjs`. |
| Sturdy (KO survival) | done | Full-HP Sturdy/Focus Sash holder survives a lethal **attack** at 1 HP; indirect chip can still KO it. See Items / Focus Sash. |
| Download / Intimidate / Defiant / Competitive / Moxie / stat-stage entries | `won't implement` | Stat-stage abilities are never auto-applied by design (see AGENTS.md). |

### Items

| Item | Status | Notes |
|---|---|---|
| Focus Sash | done | Full-HP holder survives one lethal attack at 1 HP in the KO sim; never protects against indirect damage. Inactive if entry hazards already took HP. |
| Air Balloon | done | Holder is immune to Ground while the balloon is intact (not an ability, so Mold Breaker does not bypass it). |
| Iron Ball | done | Holder is grounded: Ground moves connect against a Flying-type and Levitate stops working. |
| Ring Target | done | Negates the holder's typing immunities (Normal hits a Ring Target Ghost, Ground hits a Flying, etc.). |
| Black Sludge | done | Heals a Poison-type holder 1/16 and chips non-Poison holders 1/16 in the KO sim / turn table. |
| Soul Dew / Thick Club / Light Ball / Deep Sea Tooth / Deep Sea Scale | done | Species stat multipliers (Latios/Latias, Marowak/Cubone, Pikachu, Clamperl). |
| Plates | done | All 17 plates parse by name AND by the `<Type> plate` spelling (`@ Fairy Plate` → Pixie Plate — source of truth: aliases.md "Type plates" table, parsed at startup). A bare `plate` picks by the move's **effective** type (a Pixilate Hyper Voice gets Pixie Plate); Normal has no plate, so `normal plate` / `plate` + a Normal move → Silk Scarf. |
| Metronome | not implemented | Consecutive-use power ramp (multi-turn; low priority). |
| Self stat-raisers in the move slot (Dragon Dance, Swords Dance, ...) | done (boost signals) | A boosting move typed as the attack move is **never** the damage move: it converts to attacker stat stages (table source: aliases.md "## Boosting moves", doc-as-code; additive with typed stages, each stat capped ±6) and never occupies a combo slot. Pure status moves (Toxic, Will-O-Wisp) can't be the queried move either. See the contributor note below. |

### Moves

| Mechanic | Status | Notes |
|---|---|---|
| Multi-hit moves (no Skill Link) | not implemented | Only the Skill Link guaranteed-5-hit case is modeled (as a weighted sum distribution). Non-Skill-Link 2-5 hit moves (Bullet Seed without Skill Link, etc.) still print as one hit. |
| Aerilate / Pixilate / Refrigerate / Normalize (type remap) | **done** | STAB, type effectiveness, immunities and the x1.3 all key off the remapped type (Flying/Fairy/Ice). |
| Scrappy | done | (Ability row above; listed here for move-type completeness.) |
| Freeze-Dry | done | x2 vs Water handled. |
| Avalanche / "moved-after-target" powers | **not implemented (intentionally)** | Avalanche (doubles if the user was hit this turn) is not modeled. Electro Ball and Gyro Ball keep their documented **stat-based** power scaling (current Speed stat), but the engine never infers *who actually moved first*. Payback is its own case — see Dynamic-power moves. See the move-order note below. |
| Future Sight / Doom Desire-style delay | not implemented | (Not gen-6 damage-number relevant in the single-hit view.) |

#### Dynamic-power (variable BP) moves

Statuses here reflect what a single-hit calc can express. The out-of-scope
groups below are not modeled; **Weather Ball** is in-scope and implemented;
**Payback → flat 50** is agreed but NOT yet applied — pick it up if you want
it.

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

### KO sim

| Mechanic | Status | Notes |
|---|---|---|
| Poison Heal + toxic | done | Poison Heal *replaces* poison/toxic damage with a 1/8 heal (no chip); low-HP Gliscor @ Toxic Orb no longer dies to end-of-turn poison. |
| Sturdy / Focus Sash survival | done | Survive a lethal full-HP **attack** at 1 HP only; indirect end-of-turn chip (weather, burn/poison, hazards, Black Sludge, Solar Power) can still KO right after. |
| Multiscale vs entry hazards | done | Hazards take HP before the attack, so the x1/2 Multiscale (and Sturdy/Focus Sash) check is inactive once the defender is below full HP (`damageTakenBefore`). |

### Intentional simplifications (do not "fix")

Neutral nature by default, EVs default 0, an inert held item is always
assumed unless `no item`, megas always hold their Mega Stone (so Knock Off
does not get its boost vs a mega), no auto stat-stage abilities, status
tokens ignore typing (Fire-types can be "burned" if typed), Flame Orb / Toxic
Orb default their holder to burned / badly poisoned with the gen-6 type
restriction (Fire can't be burned, Steel/Poison can't be badly poisoned).

**Auras (Fairy Aura / Dark Aura / Aura Break) are intentionally not
implemented.** If you want to take them on, the cleanest place is a shared
helper in `src/damage-calc.ts` that, given the matchup, computes the aura
multiplier for the effective move type and feeds both the attacker and
defender sides; wire auto-defaulting in `scripts/fill.mjs` and add coverage
rows to `scripts/verify-smogon.mjs`.

**Move-order-dependent mechanics** (Analytic, Avalanche, Flash Fire's
attacker boost, "attacker was hit last turn") are **intentionally not
implemented**, and that decision extends to *inferring turn order from a
speed comparison*: speed ties, priority, Trick Room and switch-in timing make
such inference guesswork rather than a real answer. Do **not** "fix" these by
comparing attacker/defender Speed in `calcDamage` or by auto-picking an
ability from it. If a contributor wants them, the right shape is an explicit,
user-typed context token in the CLI that maps to the existing
`movedAfterTarget` / `flashFireBoosted` hooks, with coverage rows in
`scripts/verify-smogon.mjs`.

## 11. One-liner → converter route (direction agreed 2026-09-06; TODO step 8)

The agent becomes ONLY a conversational wrapper: pull the one-liner out of the
user's message (strip conversational filler) and hand it to the converter. All
extraction + defaulting = converter + `fill.mjs`; the agent authors NO spec
JSON and computes NO echo spans. One-shot `route.mjs "<line>" --chat` =
converter → fill → calc → output in one node process (data loaded once), so a
query is one tool call. When the converter parse owns spans, its echo becomes
the ONLY echo and the agent-side hand-built echo path is dropped. This
supersedes the agent-route prose in AGENTS.md rule 2/3 and the
`pokemon-damage-calc` skill's step 1 once it lands.

## 12. Verification baseline (gate for every change)

`verify:damage` 63/63, `verify:acc` 44/44, `verify:echo` 6/6, corpus
chaincheck "all identical" (@smogon/calc = devDependency oracle only). Corpus
+ capture tooling:
`session-tools-archive/20260904-pipeline-corpus.json`,
`session-tools-archive/20260904-capture-goldens.mjs`,
`session-tools-archive/20260904-chaincheck.mjs`.

## Provenance

Consolidated 2026-09-09 from `TODO.md` backlog sections and `ENGINE-GAPS.md`
(TODO.md is now a lean backlog; ENGINE-GAPS.md was merged here and deleted).
Verbatim per-session detail and
adjudications live in the dated notes; quick map:

- Free-order `vs` frame, junk silent-drop, max-flag fixes (2026-09-08) →
  `session-tools-archive/SESSION-NOTES-20260908-FREE-ORDER-RULINGS.md`.
- Seams A–I review, spikes/comma/dedupe rulings, seam-F R1–R4 →
  `session-tools-archive/SESSION-NOTES-20260907-SWEEP-REVIEW-AI.md`,
  `session-tools-archive/SESSION-NOTES-20260908-SEAM-F.md`.
- Boost signals → `session-tools-archive/SESSION-NOTES-20260908-BOOST-SIGNALS.md`.
- Tokenizer step-1 sweep + step 2 →
  `session-tools-archive/SESSION-NOTES-20260909-TOKENIZER-STEP1-SWEEP.md`.
- Species claim in the sweep →
  `session-tools-archive/SESSION-NOTES-20260909-SPECIES-AS-CLAIMS.md`.
- Front split / fill convergence →
  `session-tools-archive/SESSION-NOTES-20260905-FRONT-SPLIT.md`.
- Hyphen rule → `session-tools-archive/SESSION-NOTES-20260907-HYPHEN-RULE.md`.
- Plate aliases → `session-tools-archive/SESSION-NOTES-20260906-PLATE-ALIASES.md`.
- Older engine / defaults / accuracy sessions →
  `session-tools-archive/SESSION-NOTES.md`,
  `session-tools-archive/SESSION-NOTES-FILLER-DEFAULTS.md`,
  `session-tools-archive/SESSION-NOTES-FUZZY-RULES-ALIASES.md`,
  `session-tools-archive/SESSION-NOTES-ACCURACY-WEATHER.md`,
  `session-tools-archive/SESSION-NOTES-PIPELINE-OVERHAUL.md`.
