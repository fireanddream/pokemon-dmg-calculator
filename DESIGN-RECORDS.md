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
  class phrases from the module-scope `CLAIM_MAP` (natures, abilities, item
  full names + `<type> plate` aliases + acronyms with side-sensitive LO,
  statuses, weather, terrain, stealth rock, `no item` spellings); (2) an exact damaging
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

**No open build step remains.** Every former `TODO.md` step is DONE
(2026-09-11): the forme-word collision set (§10 "Curated-out variant formes"),
arena grammar (§5), the seam-C startup guard, converter-side echo (§4 tail),
and one-shot `route.mjs` (§11). `TODO.md` now tracks only the front-refactor
work order.

## 4. Recognition echo — the two-block answer (converter-side LIVE 2026-09-10; agent prose RETIRED 2026-09-11)

**Every answer is TWO blocks, in order** (the offline converter / `damage.mjs` /
`route.mjs` route; the agent's hand-authored spec+echo prose was retired by step
8 — the agent now just runs `route.mjs` and pastes):

1. **Block 1 — recognition echo.** The user's input line with the normalize-once
   words (case preserved; see the shared tokenizer below) and a class ruler
   underneath: one short label per token bound **so far**. The top line is
   **word-exact, spacing free** — words never change or reorder, but inter-token
   spacing widens so crowded labels don't collide (the renderer re-lays the
   gaps, it does NOT re-space words). On success the ruler covers every bound
   token; **on a hard error it covers only the claims made before the throw**,
   the un-scanned tail left bare — so the player sees exactly where the scan
   stopped. The error then prints as the line directly under the ruler (line 3;
   further messages, if any ever exist, continue on line 4).
2. **Block 2 — the result.** Exactly one of:
   - the **output card** (`output.mjs`, pasted verbatim — card layout is owned
     there; see `OUTPUT-FORMAT.md`), or
   - the **error message** (the consolidated taxonomy, §8).
   Never both, never a hand-composed substitute.

**Shared tokenizer (one source: `scripts/tokenize.mjs`).** The converter and the
echo tokenize with the same function, so `_sideLog` indices and ruler columns
can never drift. Normalize ONCE, then split into case-preserving display atoms:
the master hyphen rule runs first (`rotom-wash` → `rotom wash`), `@` and quotes
become spaces, the hard-boundary punctuation `,.;/\|` becomes a non-space
sentinel (so no phrase matches across it). Display prints those atoms — so the
input is *word-exact* but NOT byte-exact: `@`/punctuation glyphs vanish and
hyphens show as spaces (option "normalize once, user sees how it was handled";
user 2026-09-10). Each atom carries `{raw, t (lowercase), gi (global index),
hardBefore}`. The converter tokenizes the WHOLE line and slices per side around
the one `vs` atom, so `gi` is the global echo atom index.

**Producer contract (`_sideLog`).** One entry per token actually bound:
`{label, from, len}` where `label` is the final ECHO label (see below) and
`from` is a GLOBAL atom index. The converter is data-only and NEVER prints;
every side parse hands its live log to `opts.capture`, and a throw attaches the
accumulated logs as `err.sideLogs` so `parseQuery` can render "scanned so far".
Scan-stop semantics: an attacker-side error throws BEFORE the defender is
scanned (defender bare); a defender-side error shows attacker-complete +
defender-partial; a cross-side `mergeArena` error is only knowable after both
sides scanned, so the WHOLE line is labeled, then the error.

**Layout contract, span schema, CLI**: `scripts/echo.mjs` header (owns the live
renderer). Binding rules:

- Each label starts exactly at its token's first column; a label may overhang
  right but the next labeled token is pushed so no two labels sit within one
  column. Multi-word bindings (`Life Orb`) glue with single spaces and anchor
  their label under the FIRST word.
- Atoms with no span (`vs`, junk words, un-scanned tail) get no label.
- Label set: `species` / `nature` / `ev:<stat>` / `move` / `item` / `status`
  / `ability` / `boost` / `level` / `arena` / `mega`. `max <stat>` echoes as
  that stat's `ev:` label (`max atk` → `ev:atk`; there is NO `max` class),
  one unit spanning the phrase, anchored under its first word. Mapping:
  item / plate / `no item` → `item`; weather + terrain + spikes + stealth rock
  all → `arena`; acc/eva stages and stat-less `±N` dynamic and boost moves →
  `boost`; `252 HP`/`max atk` → `ev:hp`/`ev:atk` (lowercase `hp`/`atk`/`def`/
  `spa`/`spd`/`spe`). `???` is retired for junk (T2, §8) and reserved only for
  honest cannot-place feedback; an un-scanned error tail is BARE, not `???`.
- Wrapping: blocks wider than `--width` (default 100) wrap into row groups; a
  word, a glued binding, and a ruler label are never split across a row.
  `--width <= 0` never wraps.
- Span schema: `{atoms:[first,last], label}` with `[first,last]` GLOBAL atom
  indices into the shared tokenizer; spans are contiguous, non-overlapping,
  never fabricated. `spansFromLogs(logs)` maps `_sideLog` → spans.

**Error echo — "scanned so far" (SHIPPED).** The converter attaches its live
`_sideLog` to `opts.capture`; `parseQuery` catches and sets `err.sideLogs`;
`damage.mjs`'s `runQuery` renders Block 1 via the same `renderEcho` and then
Block 2's error message. Scan-stop semantics (above) make the ruler show
exactly how far the scan got.

**Emit path (SHIPPED).** The converter stays data-only (stdout = spec JSON for
the `| fill | calc | output` pipe). Presentation lives in the single-process
runner: `damage.mjs` `runQuery` prints echo+card/error on stdout, `--no-echo`
for the card alone (used by the corpus chaincheck), `--chat` fences both blocks,
and `--resolved` stays a pure JSON data path. `route.mjs` (step 8, SHIPPED
2026-09-11) is a thin alias of `runQuery`: one line argument, always fenced.
Card wrap (Block 2) SHIPPED 2026-09-10: `output.mjs` pipes the
card through the same `wrapBlock` rule as the echo (default 100 columns,
`--width N`, `<= 0` never), so `damage.mjs` and `output.mjs` agree byte for
byte (`OUTPUT-FORMAT.md` "Wrapping").

## 5. Arena grammar — bare words only, NO signals (bare-only + weather model DONE 2026-09-10)

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
- **Weather is ONE plain slot (no tiers).** A weather word binds an arena value
  exactly like any other class token: identical values collapse, a different
  value on the same side HARD-ERRORS (`conflicting weather: sun vs rain`).
  Weather-setting ABILITY names are NOT weather words — they are ordinary
  ability claims (see the primal note below).
- **Cross-side weather resolution.**
    - two different explicit weather values ERROR (`weather: sun vs rain`);
    - the same value collapses;
    - a typed weather always beats a weather-setting ability (below).
- **Terrain / spikes are plain same-slot values.** Different cross-side values
  error, never add (`spike 1` on the attacker + `spike 2` on the defender is a
  conflict, NOT 3 layers). Same values collapse. Stealth Rock is a boolean and
  cannot conflict.
- **Explicit beats ability (never an error).** A typed weather/terrain wins over
  what an auto-picked or explicitly named setter ability would set; fill only
  fills the arena from abilities when nothing was typed (`fillWeather` returns
  early).

**Weather-setting abilities (incl. primal).** Drought / Drizzle / Sand Stream /
Snow Warning and the primal Desolate Land / Primordial Sea / Delta Stream are
ordinary ability claims. Once both sides' abilities are resolved, fill decides
the arena from them (`weatherFromSetters`):

- one setter → its weather;
- two different regular setters → the SLOWER side sets last (an exact Speed tie
  keeps the attacker);
- primal vs regular → the PRIMAL wins regardless of Speed;
- primal vs primal (different) → the slower wins (Speed tie keeps the attacker);
- both set the same weather → collapse.

**Primal weather behavior.** `desolate` / `primordial` / `delta` are permanent
(no turn expiry) and dominant over regular weather:

- `desolate` + a Water move → the move FAILS; `primordial` + a Fire move → the
  move FAILS.
- `desolate` acts as sun for Fire/Water power; `primordial` acts as rain;
  `delta` removes Flying's Rock/Electric/Ice weaknesses.
- Weather Ball: `desolate`→Fire, `primordial`→Water, `delta`→Normal 50 (as if
  no weather), `sand`→Rock, `hail`→Ice.
- Cloud Nine / Air Lock null every effect for the calc only (the arena row
  still shows the weather, marked `(suppressed)`).
- The primal CONDITION words (`extremely harsh sunlight` / `heavy rain` /
  `strong winds`) are deliberately **NOT synced** with the primal abilities: an
  explicit primal condition is an ordinary explicit weather, so it errors
  against a different explicit weather, while the primal ABILITY beats a
  regular ABILITY. (User 2026-09-10: keep the two categories separate.)

Lexicon — explicit weather arena words: simple weather (`sun`, `rain`, `sand`,
`hail`, plus `snow` → hail; gen-6), weather-setting moves / adjectives
(`sunny day`, `sunny`, `rain dance`, `sandstorm`, `hail`, `harsh sunlight`),
the primal condition words (`extremely harsh sunlight`, `heavy rain`,
`strong winds`); hazards (Stealth Rock, Spikes); terrains (electric / grassy /
misty / psychic). Weather-setting ability names are NOT arena words.

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
(bare); `sand stream vs rain` → rain (a typed weather beats the ability);
`sun vs rain` → error; `drought vs sand stream` → the slower side's weather;
`heavy rain vs sun` → error (two explicit weathers, never synced with the
primal abilities).

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

## 8. Error & junk philosophy — R4 / T2 rulings (2026-09-07/08; taxonomy 2026-09-10)

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
- **R4 — unbound EV tokens are a hard error.** A stat word with no adjacent
  number (a lone `hp`, `defense`) and a number with no adjacent stat word (a
  lone `252`, `252 special defense`) raise the SAME terse message:
  `unbound EV: "<token>"`. The echo shows the offending token in place; `???`
  never substitutes for R4 (`???` ≠ "will corrupt your numbers"). Stat
  lexicons carry SHORT aliases only — `special`→spa / `spdefense`→spd /
  `hit point` were removed; `atk / def / spe / accuracy / evasion` keep
  one-word names.
- **T2 — plain junk words are SILENTLY DROPPED.** `then` / `and` / `with` /
  `uses` / misspellings: no error, no `_ignored`, no `ignored:` flag, no
  label, no `???`. The `???` echo class is RETIRED for junk (reserved for
  honest cannot-place feedback).
- **Error taxonomy (2026-09-10; one builder per shape 2026-09-13).**
  Every converter/fill failure collapses to a few shapes, each produced by ONE
  pure string builder in `scripts/errors.mjs` — the only way to build a front
  error, so the shape is fixed by construction and the wording lives in one
  place. The caller keeps the literal `throw` at the same point, so throw
  timing (e.g. `claimSlot` throwing before its log) is unchanged:
    - `missing <var>: "<detail>" — see -search` — a variable could not be
      resolved: `missing side` (empty combatant), `missing species` (nothing
      recognizable), `missing move` (no damaging move — the old "only boosting
      moves" lecture is gone), `missing hidden power type`. `-search` is the
      lookup hint.
    - `missing species mega "<name>" — see -search` — a `<species> mega` token
      whose base has no Mega forme.
    - `missing split: a query needs one "vs" between the attacker and the
      defender — see -help and -grammar` — no `vs`; the query frame is
      documented by `-help`/`-grammar`.
    - `conflict on <slot>: A vs B` — every same-slot dedupe-vs-conflict,
      including terrain, weather, spikes layers, and the max-shorthand EV
      collisions (`conflict on ev:atk: 252 vs 120`).
    - domain — a resolved value outside its allowed set: `"hidden power <type>"
      is not a legal Hidden Power type` (Normal/Fairy), `"X 400" is not an EV:
      gen 6 caps EVs at 252`.
    - cap — `too many moves in a combo — capped at 2 (...)`,
      `too many EVs: N (> 510 cap)`.
    - `unbound EV: "<token>"` — the R4 stray.
  Echo-on-error ("scanned so far") is a separate, unbuilt piece — see §4 tail.

## 9. `no item` semantics

`no item` / `itemless` (and, since the hyphen rule, `no-item`) sets
`spec.noItem` per side; `fill.mjs` passes `noItem` through. `calc.mjs` derives
two item-presence booleans, both defaulting to "an inert held item is assumed":
`targetHoldsItem = !defender.noItem && !defender.mega` (Knock Off's +50% vs an
itemless target) and `attackerHoldsItem = !attacker.noItem` (Acrobatics doubles
only when this is explicitly false). So attacker-side `noItem` is **not**
display-only: it is what makes a genuinely itemless Acrobatics user double, and
an untyped attacker holds an inert item so it does not. A **Mega always holds
its Mega Stone**: `fill.mjs` `resolve()` (the defaults stage, before the calc)
clears `noItem` on a Mega, so a stray `no item` on a Mega cannot make it read as
itemless — the stone is set first and Acrobatics stays at 55 BP. An **explicit
item name or the `plate` keyword on a Mega is a HARD ERROR** (`conflict on item:
<item> vs Mega Stone`): the stone is fixed, so a typed item is a contradiction,
not a silent override. Same-slot
conflict (an item/plate name AND `no item` on one side) is handled by the
universal dedupe-vs-conflict pass; the echo shows `no item` as an `item`-class
binding (step 7).

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

**2026-09-11 — open engine rows closed.** The user decided the remaining
open engine-coverage items are not being built: **Metronome**, **Future
Sight / Doom Desire**, and **Minimize-target doubles (Stomp / Steamroller /
Dragon Rush)** are re-statused `won't implement`. **Hidden Power + IVs landed
the same day** (§10 Moves / ### IVs); with that, no engine gap remains open.

### Abilities

| Ability | Status | Notes |
|---|---|---|
| Fairy Aura / Dark Aura | done | Gen-6 FIELD condition: while the holder is in play, Fairy/Dark moves from **both** battlers deal x4/3. Xerneas (Fairy Aura) / Yveltal (Dark Aura). Resolved by the front into the field `auras` like a weather setter (see the note below); the Arena row names the active aura(s). Covered by `verify-smogon.mjs`. |
| Aura Break | done | Zygarde. While present, inverts every active Fairy/Dark Aura so matching moves deal x3/4 instead of x4/3 (field `auraBreak`). |
| Sheer Force | done | x1.3 on the 133 gen-6 damaging moves whose chance-based secondary is suppressed (`SHEER_FORCE_MOVES` in `src/damage-calc.ts`, derived from @smogon/calc; covered by `verify-smogon.mjs`). |
| Analytic | **not implemented (intentionally)** | Engine hook exists (`params.movedAfterTarget` → x1.3), but nothing sets it and the project deliberately does **not** infer "moved after the target" from a speed comparison. See the move-order note below. |
| Flash Fire (attacker) | **not implemented (intentionally)** | Boost hook exists (`params.flashFireBoosted` / `abilityOn`) but nothing sets it; there is no "already fire-boosted" context token. |
| Rivalry | done | x1.25 same gender / x0.75 opposite (engine; needs both sides' `gender` set, which the CLI does not parse yet). |
| Shell Armor / Battle Armor | done | Block a requested `crit` against the holder (Mold Breaker does not bypass). Covered by `verify-smogon.mjs`. |
| Skill Link | done | Forces a 2-5 move to land exactly 5 hits (a weighted 5-hit total distribution, the same model as the Multi-hit row). |
| Unnerve | done | Disables the defender's Sitrus Berry in the KO sim (resist berries already gated in `calcDamage`). |
| Infiltrator | done | Attacker's moves ignore Reflect/Light Screen. Covered by `verify-smogon.mjs`. |
| Solar Power (defender chip) | done | End-of-turn 1/8 sun chip for a Solar Power holder in sun is in the KO sim and the turn table. |
| Scrappy | done | Normal/Fighting moves connect against Ghost-types. Covered by `verify-smogon.mjs`. |
| Sturdy (KO survival) | done | Full-HP Sturdy/Focus Sash holder survives a lethal **single-hit** attack at 1 HP; a **multi-hit** attack is never saved; indirect chip can still KO it. See Items / Focus Sash. |
| Download / Intimidate / Defiant / Competitive / Moxie / stat-stage entries | `won't implement` | Stat-stage abilities are never auto-applied by design (see AGENTS.md). |

### Items

| Item | Status | Notes |
|---|---|---|
| Focus Sash | done | Full-HP holder survives one lethal **single-hit** attack at 1 HP in the KO sim; a **multi-hit** attack is never saved (the later hits finish it); never protects against indirect damage. Inactive if entry hazards already took HP. |
| Air Balloon | done | Holder is immune to Ground while the balloon is intact (not an ability, so Mold Breaker does not bypass it). |
| Iron Ball | done | Holder is grounded: Ground moves connect against a Flying-type and Levitate stops working. |
| Ring Target | done | Negates the holder's typing immunities (Normal hits a Ring Target Ghost, Ground hits a Flying, etc.). |
| Black Sludge | done | Heals a Poison-type holder 1/16 and chips non-Poison holders 1/16 in the KO sim / turn table. |
| Soul Dew / Thick Club / Light Ball / Deep Sea Tooth / Deep Sea Scale | done | Species stat multipliers (Latios/Latias, Marowak/Cubone, Pikachu, Clamperl). |
| Plates | done | All 17 plates parse by name AND by the `<Type> plate` spelling (`@ Fairy Plate` → Pixie Plate — source of truth: aliases.md "Type plates" table, parsed at startup). A bare `plate` picks by the move's **effective** type (a Pixilate Hyper Voice gets Pixie Plate); Normal has no plate, so `normal plate` / `plate` + a Normal move → Silk Scarf. |
| Metronome | **won't implement** | Consecutive-use power ramp (multi-turn). Closed 2026-09-11: the user decided the item is not being built, so it is no longer open work. |
| Self stat-raisers in the move slot (Dragon Dance, Swords Dance, ...) | done (boost signals) | A boosting move typed as the attack move is **never** the damage move: it converts to attacker stat stages (table source: aliases.md "## Boosting moves", doc-as-code; additive with typed stages, each stat capped ±6) and never occupies a combo slot. Pure status moves (Toxic, Will-O-Wisp) can't be the queried move either. See the contributor note below. |

### Moves

| Mechanic | Status | Notes |
|---|---|---|
| Multi-hit moves (2-5) | done | Each use convolves the per-hit 16 rolls by hit count with the gen-6 odds (2:3/8, 3:3/8, 4:1/8, 5:1/8; Skill Link forces 5). Technician applies per hit (BP ≤ 60), a resist berry halves ONLY the first hit, and Focus Sash / Sturdy cannot save the attack. End-of-turn chip/heal applies ONCE after the whole action, never between strikes. The Damage row shows the total range `[2-5 hits]`; the KO sim runs the exact weighted total distribution. `multiHitDistribution` + the shared `moveUseDistribution` helper in `scripts/calc.mjs`; covered by `verify:multihit`. |
| Fixed-count multi-hit (Bonemerang 2, Double Kick 2, Twineedle 2, Double Hit 2, Dual Chop 2, Gear Grind 2, Triple Kick 3) | not implemented | Still print as one hit. Same Sash/Sturdy property as the 2-5 set; Triple Kick additionally escalates 10/20/30 BP and checks accuracy per hit. |
| Hidden Power (type from IVs) | done (2026-09-11) | The type is typed explicitly — `hidden power <type>` or the `hp <type>` alias, adjacent — never derived from IVs. 16 legal types (Normal/Fairy rejected: gen 6 cannot roll them); no type word is a hard error `missing hidden power type`. `fill.mjs` clones the dex move to the named type (never mutates the shared entry) so STAB/effectiveness/immunities/resist berries/plate pick/defender ability pick all follow it; the whole phrase is ONE `move` echo span. `hp fire` additionally forces attacker SpA IV 30 (shown on the card). Contract: the "Hidden Power" note below. |
| Aerilate / Pixilate / Refrigerate / Normalize (type remap) | **done** | STAB, type effectiveness, immunities and the x1.3 all key off the remapped type (Flying/Fairy/Ice). |
| Scrappy | done | (Ability row above; listed here for move-type completeness.) |
| Freeze-Dry | done | x2 vs Water handled. |
| Foul Play | done (2026-09-11) | Uses the **defender's current Atk** as the attack stat (see IVs section); all attacker-side modifiers and burn still apply. |
| Avalanche / "moved-after-target" powers | **not implemented (intentionally)** | Avalanche (doubles if the user was hit this turn) is not modeled. Electro Ball and Gyro Ball keep their documented **stat-based** power scaling (current Speed stat), but the engine never infers *who actually moved first*. Payback is its own case — see Dynamic-power moves. See the move-order note below. |
| Future Sight / Doom Desire-style delay | **won't implement** | (Not gen-6 damage-number relevant in the single-hit view.) Closed 2026-09-11: the user decided the item is not being built, so it is no longer open work. |

**Hidden Power (design choice).** The dex holds ONE `Hidden Power` (Normal,
60 BP, Special); gen 6 instead picks the type from the user's IVs, so the front
takes the type from the query — never derived from IVs. Contract:
- **Spelling:** `hidden power <type>` or the `hp <type>` alias, with the type
  word **adjacent** to the phrase. The whole phrase is ONE `move` echo span
  (no separate type label).
- **Legality:** 16 types. **Normal and Fairy hard-error** (gen 6 cannot roll
  them); a missing type word hard-errors `missing hidden power type`.
- **`hp` vs the HP stat:** the one overloaded token. `hp <number>` is still the
  HP EV (the EV branch is number-led); `hp <type>` is Hidden Power. `252 HP fire`
  is **not** double-duty — the number-led EV branch consumes `252 HP` first, so
  `fire` is silently dropped and the line errors `missing move` if that was the
  only move. Write `252 HP hidden power fire` to combine them.
- **Type override:** `fill.mjs` clones the move to the named type (never mutates
  the shared dex entry) before the ability pick / plate pick / calc, so STAB,
  effectiveness, immunities, resist berries and the defender's ability pick all
  follow the real type.
- **HP Fire's SpA IV:** `hp fire` (in move 0 or move 1) forces the **attacker's
  SpA IV to 30** — the only damage-relevant "even IV" of the standard HP Fire
  spread (BP is a fixed 60 in gen 6). Shown on the card as `SPA IV 30`. Other
  types get the type override with no IV side effect; the full per-type IV
  spreads are out of scope.

#### Dynamic-power (variable BP) moves

Statuses here reflect what a single-hit calc can express. The out-of-scope
groups below are not modeled; **Weather Ball** is in-scope and implemented;
**Payback** is modeled as its flat 50 BP — its after-target doubling is out of
scope, the same class as Avalanche.

| Move(s) | Status | Why / notes |
|---|---|---|
| Heavy Slam, Heat Crash (weight ratio); Low Kick, Grass Knot (target weight); Electro Ball, Gyro Ball (Speed stat) | done | BP resolved from current stats in `resolveTypeAndPower` (`src/damage-calc.ts`). |
| Eruption, Water Spout, Flail, Reversal (user HP); Crush Grip, Wring Out (target HP) | done | HP-fraction powers. |
| Stored Power, Punishment (stat-stage counts) | done | Scales off the typed stage boosts. |
| Return / Frustration | done | Fixed at 102 (max happiness) — no happiness tracking. |
| Knock Off, Acrobatics, Facade, Venoshock, Hex, Wake-Up Slap, Smelling Salts (item/status condition doublers) | done | Conditional **raw** multipliers (`CONDITIONAL_POWER` table, below): conditions a query can express (`@ item`, `no item`, status words). |
| **Payback** | **not implemented (intentionally)** | Modeled as its flat **50 BP**; the after-target doubling is out of scope (order/state inference the project avoids, same class as Avalanche). `@smogon/calc` doubles it from a Speed comparison, so the slower-user case intentionally diverges and is absent from the `verify-smogon` matrix. |
| **Weather Ball** | done | Base 50 → **100** and a type shift with weather (sun/desolate → Fire, rain/primordial → Water, hail → Ice, sand → Rock; none/Delta → Normal 50). `resolveWeatherBall` in `src/damage-calc.ts`; the type feeds the shared `effType` (STAB / effectiveness / immunities / resist berries) and the CLI plate picker. Air Lock/Cloud Nine null the weather first, so suppressed weather reads Normal 50. |
| Pursuit, Assurance, Avalanche, Revenge (hit-this-turn / switch / damaged) | not implemented | Need a "took a hit this turn / opponent acted" state the CLI can't express. Intentional. |
| Fury Cutter, Echoed Voice, Rollout, Ice Ball (consecutive-turn scaling) | not implemented | Multi-turn state. Intentional. |
| Spit Up, Trump Card, Present, Natural Gift, Magnitude | not implemented | Need Stockpile count / PP left / random roll / berry — out of scope. |
| Brine (double at ≤50% target HP) | not implemented (intentional) | Kept flat 65 BP. |
| Stomp / Steamroller / Dragon Rush (double vs a Minimize target) | **won't implement** | Minimize isn't modeled (its +2 evasion stage is all that applies). Closed 2026-09-11: the user decided the item is not being built, so it is no longer open work. |
| Last Resort | not implemented (intentional) | "Always works": flat 140 BP, no availability condition. |

**Conditional-power clauses (design choice).** Single-clause raw multipliers
that key off engine-known state live in ONE table,
`CONDITIONAL_POWER: Record<moveName, { mult, when(ctx) }[]>` in
`src/damage-calc.ts`, applied in list order as `power *= mult` BEFORE the
ability/item `bpMods` chain (so the two rounding regimes never mix). This
replaced the former per-move inline `if (named(move, …) && cond) power *= …`
branches, so a new conditional-BP move is a table row, not new control flow
(Knock Off ×1.5; Acrobatics / Facade / Venoshock / Hex / Wake-Up Slap / Smelling
Salts ×2; the table is also where Wake-Up Slap and Smelling Salts moved in from
the dynamic-power chain). The table is **TS in the engine, not doc-as-code**: a
condition is a predicate over engine state, and `aliases.md` / the other stores
hold names, not logic. A move whose condition needs state the engine does not
track (Payback "moved last", Avalanche "hit this turn") stays unmodeled rather
than gaining a clause that can never fire. One companion rule lives in the
damage formula, not the table: **Facade also ignores burn's Attack halving**
(`isBurned` exempts Guts and Facade, mirroring `@smogon/calc` gen56 `applyBurn`),
so a burned Facade user gets the doubled BP with no penalty.

**Multi-hit model (design choice).** A 2-5 hit move is ONE turn/use whose total
damage is the exact convolution of independent per-hit rolls over the hit
counts, weighted by the gen-6 odds (2:3/8, 3:3/8, 4:1/8, 5:1/8; Skill Link
forces 5). The helper is `multiHitDistribution(perHitFull, firstRolls, counts)`
in `scripts/calc.mjs`, wrapped by `moveUseDistribution` (used by both
`calcSingle` and `calcCombo`, with `counts = [{hits:1}]` for a plain move, so
single-hit is the 1-hit special case and the berry path is shared). The
weighted total (plus `multiHit: true`, which disables the Focus Sash / Sturdy
save in `src/ko.ts`) is what the KO sim consumes. A resist berry halves **only
the first hit** (`firstRolls` replaces hit 1), so the first use's total is a
separate weighted distribution from later uses. Because it is ONE use,
end-of-turn chip/heal (sand, Leftovers, …) applies once **after** the whole
action, never between strikes — a two-move combo is two turns and does apply it
between moves (`verify:multihit` asserts the exact one-chip shift in each).
Per-hit damage already carries Technician (BP ≤ 60) straight from `calcDamage`.
This intentionally diverges from `@smogon/calc`, which models a 2-5 move as
exactly **3** hits unless given an explicit count; `verify:multihit` compares our
per-hit and each fixed n-hit total against the oracle driven with `{ hits: n }`,
and checks the convolution weights and the Sash/Sturdy flag directly.

### IVs

**No manual IV input.** Every stat is IV 31 unless a mechanic forces it. There
is no IV spec token (the `Defaults at a glance` row stays "31"). Two forced
values exist, both rendered on the card in the same `| ...` spread slot as EVs
(e.g. `Timid | HP 252 / SPA IV 30`):

- **Hidden Power Fire → attacker SpA IV 30** (see the Hidden Power note above).
- **Foul Play → defender Atk IV 0**, only when the defender's base Atk < base
  SpA. Foul Play is the ONLY mechanic that reads the defender's Attack, so this
  rule is scoped to a Foul Play query — a defender's Atk IV is irrelevant in
  every other matchup, so nothing else ever changes it.

**Foul Play (implemented 2026-09-11).** `calcDamage` uses the **defender's
current Attack** (stat + its own boosts) as the attack stat; everything else
keys off the attacker (Hustle, Guts/Huge Power/Choice Band, burn halving), and
defense still comes from the defender — mirrors `@smogon/calc` gen56
`var attackSource = move.named('Foul Play') ? defender : attacker`. The IV rule
above (defender Atk IV 0 for a special-oriented defender) is applied in
`fill.mjs` and is the only place the defender's Atk is IV-modified. Covered by
`verify-smogon` (defender attack source, defender boosts, crit, burn, defender
Unaware, attacker Huge Power).

### KO sim

| Mechanic | Status | Notes |
|---|---|---|
| Poison Heal + toxic | done | Poison Heal *replaces* poison/toxic damage with a 1/8 heal (no chip); low-HP Gliscor @ Toxic Orb no longer dies to end-of-turn poison. |
| Sturdy / Focus Sash survival | done | Survive a lethal full-HP **single-hit** attack at 1 HP only; a **multi-hit** attack is never saved; indirect end-of-turn chip (weather, burn/poison, hazards, Black Sludge, Solar Power) can still KO right after. |
| Multiscale vs entry hazards | done | Hazards take HP before the attack, so the x1/2 Multiscale (and Sturdy/Focus Sash) check is inactive once the defender is below full HP (`damageTakenBefore`). |

### Intentional simplifications (do not "fix")

Neutral nature by default, EVs default 0, an inert held item is always
assumed unless `no item`, megas always hold their Mega Stone (their stone is
resolved in `fill.mjs` before the calc, so a Mega is never itemless: Knock Off
does not get its boost vs a Mega and Acrobatics never doubles for one), no auto
stat-stage abilities, status
tokens ignore typing (Fire-types can be "burned" if typed), Flame Orb / Toxic
Orb default their holder to burned / badly poisoned with the gen-6 type
restriction (Fire can't be burned, Steel/Poison can't be badly poisoned).

**Auras (Fairy Aura / Dark Aura / Aura Break) are a FIELD condition, not an
ability check in the engine.** `fill.mjs` resolves the active aura types from
both sides' final abilities (explicit OR auto-defaulted — Xerneas → Fairy Aura
— via the `## Aura setters` table in `auto-fill-defaults.md`) into the field
`auras` / `auraBreak`, exactly like a weather setter, except auras STACK: the
two auras coexist and coexist with any weather/terrain (nothing overrides).
`calcDamage` applies 4/3 (Showdown's `5448`, deliberately not the `5325` used
by Ate/Mega Launcher) to a move whose effective type matches an active aura, or
3/4 under Aura Break, in the base-power chain; Mold Breaker cannot suppress a
field aura. `output.mjs` names the active aura(s) on the Arena row. Covered by
`verify-smogon.mjs`.

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

### Curated-out variant formes (one entry per species)

`scripts/fetch-xy-dex.mjs` exports `curate()`, applied to the generated dex so
each species resolves one way (472 entries ship; 31 variants filtered). Keeping
a single entry per species removes forme-word collisions that would otherwise
need special parsing.

| Variant group | Status | Notes |
|---|---|---|
| Arceus type formes (`Arceus-Rock`, `-Fire`, `-Water`, … 17 total) | **not implemented** | Type-changing formes (Multitype) are not modeled; only base Normal **Arceus** remains. A query naming a type forme does not resolve to a distinct entry. |
| Genesect drive formes (`Genesect-Burn`, `-Chill`, `-Douse`, `-Shock`) | **not implemented** | Drive-based Techno Blast type changes are not modeled; only base **Genesect** remains. |
| Darmanitan-Zen | **not implemented** (dropped) | The in-battle Zen forme is not modeled; its `zen` forme word collided with the move **Zen Headbutt** (`darmanitan zen headbutt` silently became Darmanitan-Zen + Headbutt). Only base **Darmanitan** remains. |
| Pikachu cosplay formes (`Belle`, `Cosplay`, `Libre`, `PhD`, `Pop-Star`, `Rock-Star`) | removed (cosmetic) | No plain `Pikachu` entry exists upstream, so `Pikachu-Belle` is renamed to base **Pikachu**; the other five are dropped. |
| Basculin-Blue-Striped | removed (cosmetic) | Base **Basculin** kept. |
| Keldeo-Resolute | removed (cosmetic) | Base **Keldeo** kept. |
| Vivillon patterns (`Fancy`, `Pokeball`) | removed (cosmetic) | Base **Vivillon** kept. |

### Open forme-word collisions (not implemented)

A species run whose trailing word is also the first word of a longer move /
arena phrase still wins at its position, so the forme word is consumed and the
move is stranded. The `-Mega` path guards this with `longerPhraseAt` +
split-back (§7), but ordinary forme runs do **not** — this is a known,
**intentionally not implemented** limitation (accepted as `missing move`,
never a silent wrong number). The single-letter aliases (`giratina o`,
`kyurem b`, …) are the escape hatch; spelling the forme suffix short avoids the
collision (`giratina o origin pulse` resolves correctly).

| Typed | Currently | Intended |
|---|---|---|
| `giratina origin pulse` | Giratina-Origin, `pulse` stranded → `missing move` | Giratina + Origin Pulse |
| `rotom heat wave` / `rotom heat crash` | Rotom-Heat, trailing word stranded | Rotom + Heat Wave / Heat Crash |
| `rotom frost breath` | Rotom-Frost, `breath` stranded | Rotom + Frost Breath |
| `shaymin sky drop` | Shaymin-Sky, `drop` stranded | Shaymin + Sky Drop |
| `castform sunny day` | Castform-Sunny, `day` stranded | Castform + Sunny Day |

(Darmanitan-Zen, the previous worst case — it silently produced a *wrong* move,
"Headbutt" — is no longer reachable: the variant is dropped above.) The fix, if
ever wanted, is generalizing the mega split-back guard to every species run.

## 11. One-liner → converter route (SHIPPED 2026-09-11; TODO step 8)

The agent is ONLY a conversational wrapper: find the sentence with `vs` and hand
it to the converter AS-IS. All extraction + defaulting = converter + `fill.mjs`;
the agent authors NO spec JSON and computes NO echo spans. One-shot
`scripts/route.mjs "<line>"` = converter → echo → fill → calc → output in one
node process (data loaded once), so a query is one tool call; it always fences
the two-block answer for pasting. The converter's parse owns the spans, so its
echo is the ONLY echo (the agent-side hand-built echo path is gone). AGENTS.md
rules 1–3 and the `pokemon-damage-calc` skill were rewritten to this contract.

## 12. Verification baseline (gate for every change)

`verify:damage` 78/78, `verify:acc` 44/44, `verify:echo` 7/7,
`verify:multihit` 34/34, `verify:lookup` 48/48, `verify:help` 59/59, and the
corpus chaincheck "all identical" (@smogon/calc = devDependency oracle only).
Corpus + capture tooling:
`session-tools-archive/20260904-pipeline-corpus.json`,
`session-tools-archive/20260904-capture-goldens.mjs`,
`session-tools-archive/20260904-chaincheck.mjs`.

## 13. CLI name / move lookup (`-search`)

`-search` is a CLI-only convenience of `scripts/damage.mjs` (argv and the
`calc>` prompt), implemented in `scripts/lookup.mjs`. It is NOT part of the
damage-query front: it never enters the converter / route / echo / card path,
and its output is a single unwrapped, comma-separated line sorted by name
(`none found` when empty).

- `-search pokemon <type> [type2]` — exact typing-set lookup, 1 or 2 **full**
  type names (no aliases), order-insensitive. A mono type deliberately does NOT
  match a dual typing. Source is the curated `data/xy-pokemon.json` exactly as
  the calc sees it: kept variants (megas, Primal, forme entries) are returned,
  and the 31 curated-out variant formes (Arceus / Genesect formes, the dropped
  in-battle Zen forme, Pikachu cosplay, Basculin-Blue-Striped, Keldeo-Resolute,
  Vivillon patterns — see "Curated-out variant formes") are already absent, so
  nothing must be filtered at lookup time.
- `-search move <type> [power] [phys|special]` — attacking moves of a **full**
  type name; exact `power` and category are optional and order-free. Category
  accepts `physical` / `special` plus `phy` / `spe` / `atk` / `spa`; `attack`
  and `special attack` are rejected. Non-attacking moves (source category
  `Non-Damaging`) are never returned.
- `-search stats <name>` — base stats + tier for one pokemon from the curated
  `data/xy-pokemon.json`. The name folds case / spaces / hyphens / punctuation
  through the shared `norm()` map (so "Mr. Mime" / "mr mime" / "mrmime" and
  "Rotom-Wash" all hit); no species aliases, no mega reordering, no fuzzy
  matching. Output is:
  1. a header line `Name Type1 [Type2] <abilities> Tier`, where `<abilities>`
     is the dex `abilities` array `/`-joined in order. That array carries no
     hidden-ability flag (the Smogon `dump-basics` source flattens it), but the
     order is slot 0, slot 1, then the hidden ability last — so a length-1
     array has no HA, and a length≥2 array's last entry is the HA. It is shown
     plainly (no `(HA)` tag),
  2. a blank line,
  3. one `LABEL value xxxx` row per stat in the order HP / Atk / Def / SpA /
     SpD / Spe: the value right-aligned to width 3 and the bar one `x` per 5
     base points rounded up, uncapped (HP 255 → 51 blocks, a 59-column line),
  4. a blank line,
  5. a `Lv50 Speed:` line with the gen-6 level-50, IV 31 Speed for the three
     benchmark spreads the team speed sheet uses — `0 EV`, `252 EV neutral`,
     `252 EV +Spe` (the values match `myteam/speed.tsv`, e.g. base 102 →
     122 / 154 / 169).

  A miss prints `none found`. The three speed scenarios are a design detail and
  are deliberately NOT spelled out in `-help` / `-grammar` / the banner.

`npm run verify:lookup` pins all of the above, and `-help` advertises the
command.

## 14. Completed-work history — migrated from `TODO.md` (2026-09-13)

`TODO.md` held only completed backlog + status notes — all "old news." It was
wiped and repurposed as the front-refactor work order (phases 1–3); everything
it carried is preserved below (headings demoted one level under this section).
Verbatim per-session narrative remains in `session-tools-archive/`.

**State 2026-09-12:** the three aura abilities (**Fairy Aura / Dark Aura /
Aura Break**) shipped as a FIELD condition — resolved by `fill.mjs` from the
battlers' abilities (explicit or auto-defaulted) into `auras` / `auraBreak`,
like a weather setter but stacking, and named on the Arena row. No open build
step remains.

**Also 2026-09-12:** CLI help topics redesigned — the old `-tokens` is now
**`-grammar`**: an authored, human-readable GRAMMAR block plus one auto-derived
LEXEME example per name type (read from `aliases.md` / `auto-fill-defaults.md`).
`-help` now carries an auto-derived defaults block (level/nature/IVs/EVs/held
item/ability + engine expansions) read from `auto-fill-defaults.md`;
`verify:help` 57/57. Help scripts stay FROZEN per AGENTS.md rule 5 until asked.

**State 2026-09-11:** steps 8 (one-shot route) and 9 (forme-word collision
curation) are DONE, the 2-5 multi-hit model shipped (`verify:multihit`
34/34), and **Hidden Power + IVs (HP Fire → SpA IV 30; Foul Play →
defender Atk IV 0) shipped**. The tokenizer overhaul and the engine gap list
have NO open build step. The two small output-card threads (card no longer
repeats the query line; no empty `()` in the no-KO verdict) are also DONE — no
open thread remains.

**State 2026-09-10:** steps 1–7 are DONE (step 7 = converter-side echo / shared
tokenizer, second pass same day). Step 5's weather model was revised
2026-09-10 (second pass): weather is now ONE plain explicit slot (two
different explicit weathers error); weather-setting ABILITY names are
ordinary ability claims that `fill.mjs` resolves (primal beats regular
regardless of Speed, else slower wins, tie → attacker); a typed weather
always beats the ability. `snow` → hail added; fabricated spellings
(`permanent *`, `harsh sunshine`, `hail storm`/`hailstorm`, `sand storm`)
removed. Error messages consolidated 2026-09-10 to `missing <var>` +
`conflict on <slot>` + `unbound EV` (keeping moves/EV/no-Mega bespoke) —
`DESIGN-RECORDS.md` §8. Payback after-target doubling removed (flat 50; out
of scope like Avalanche, oracle intentionally diverges) and attacker-side
`no item` now drives Acrobatics doubling (`attackerHoldsItem`) — §9/§10.
Second pass same day: conditional BP clauses unified into the
`CONDITIONAL_POWER` table; the result card (Block 2) now wraps through the
echo's `wrapBlock` rule; Facade is exempted from burn's Attack drop (mirrors
`@smogon/calc`), an explicit item/`plate` on a Mega now hard-errors, and
`powerOverride` is gone from the engine API. Working tree green:
`verify:damage` 65/65, `verify:acc` 44/44, `verify:echo` 7/7, corpus
chaincheck "all identical".

### Build order — tokenizer overhaul (all steps DONE)

Steps 1–8 are done (step 9 remains); the design contract for each open step
lives in the `DESIGN-RECORDS.md` section cited. Each step lands with
`verify:damage` 65/65, `verify:acc` 44/44, `verify:echo` 7/7 green, no TS build
errors, and the corpus chaincheck "all identical". Record of done steps: step 1
→ `SESSION-NOTES-20260909-TOKENIZER-STEP1-SWEEP.md`, step 3 →
`SESSION-NOTES-20260909-SPECIES-AS-CLAIMS.md`, step 4 →
`SESSION-NOTES-20260909-MEGA-EXACT-SHAPE.md`, steps 5 (partial) + 6 →
`SESSION-NOTES-20260910-BARE-ARENA-AND-SEAM-C.md`, step 7 →
`SESSION-NOTES-20260910-CONVERTER-ECHO.md`.

1. ✅ **Layer-1 unified sweep** (was "build step 1") — DONE 2026-09-09.
2. ✅ **Seam-B guard** — DONE 2026-09-09 (closed by step 1; no trie built).
3. ✅ **Species claim in the sweep** (was "residue resolution", SUPERSEDED) —
   DONE 2026-09-09: exact glued-run literals, no residue layer/fuzzy.
4. ✅ **Mega exact-shape signal** (was `## 6` scope) — DONE 2026-09-09:
   standalone `mega` upgrades an adjacent species to `-Mega` (prefix or
   suffix); no-forme bases HARD-ERROR; `-X`/`-Y` bases keep the base pick;
   already-`-Mega` never re-upgraded; `Mega Punch/Kick/Drain` moves and
   `Mega Launcher` win by longer phrase. Contract: `DESIGN-RECORDS.md` §7.
5. ✅ **Arena grammar inside the sweep** (was `## 4`, bare-only). DONE
   2026-09-10; weather model revised the same day (second pass). Bare arena
   words only — NO `in`/`under`/`after` signals. Weather is ONE plain slot:
   two different explicit weathers across sides error, identical collapse;
   weather-setting ABILITY names are ordinary ability claims that fill
   resolves (primal beats regular regardless of Speed, else slower, tie →
   attacker) and a typed weather always beats the ability. `snow` → hail
   added; fabricated forms removed. Terrain/spikes cross-side different
   values error (never add); hazards hoist from either side. Contract:
   `DESIGN-RECORDS.md` §5.
6. **Seam-C startup warning + guard** — DONE 2026-09-10 (option A): warn at
   startup if any key, ANY word count, is registered in two class lexicons
   (the startup check in `input-converter.mjs` doubles as the smoke — it runs
   on every converter/fill/damage start since fill imports the lexicon).
   No behavior change when clean.
7. ✅ **Converter-side echo** (was `## 8`) — DONE 2026-09-10. `scripts/tokenize.mjs`
   is the ONE shared line tokenizer (normalize-once: hyphen rule, `@`/punct
   handling, case-preserving display atoms with global `gi`); `parseCombatant`
   logs EVERY claim as `{label, from, len}` (echo labels: `ev:<stat>`, `arena`,
   `item`, `boost`, ...) with GLOBAL atom indices; a throw carries the live
   partial log via `opts.capture` → `err.sideLogs`; `echo.mjs` gains
   `spansFromLogs`. Presentation is the single-process `damage.mjs` `runQuery`
   (echo + card, or echo + error "scanned so far"; `--no-echo`, `--chat`);
   converter stays data-only. Contract: `DESIGN-RECORDS.md` §4. Agent-route
   prose/echo retirement moved to step 8.
8. ✅ **One-shot route** (was `## 10`) — DONE 2026-09-11. `scripts/route.mjs`
   is a thin alias of `damage.mjs`'s `runQuery`: one line argument, always
   fenced (converter → echo → fill → calc → output in one process).
   `damage.mjs` entry points are `isMain`-guarded so `runQuery` is importable.
   Agent-route prose rewritten: AGENTS.md rules 1–3 and the
   `pokemon-damage-calc` skill now say "find the `vs` line → run `route.mjs` →
   paste verbatim". Shared tokenizer now treats `?`/`!` as hard boundaries so a
   natural-sentence line ("... vs Heatran?") keeps its last token. Contract:
   `DESIGN-RECORDS.md` §11.
9. **Forme-word collision set** — CLOSED 2026-09-11. Curation drops the
   colliding variants (`pikachu rock star`, `arceus` type formes,
   `genesect burn`, `darmanitan zen`; `DESIGN-RECORDS.md` §10 "Curated-out
   variant formes") and the single-letter / glued aliases cover the rest
   (`giratina o`, `kyurem b`, `deoxys a`, …). The residual collisions a shorter
   spelling works around (`giratina origin pulse`, `rotom heat wave`,
   `shaymin sky drop`, `castform sunny day`, …) are documented as
   **intentionally not implemented** in §10 "Open forme-word collisions" — no
   open build step remains.

### Engine — no open build step (all closed)

**State 2026-09-11:** the user decided the remaining engine-coverage items are
**not being built**, so the engineer-open `not implemented` rows are closed in
`DESIGN-RECORDS.md` §10:

- **Multi-hit without Skill Link** — DONE 2026-09-11: exact weighted 2-5 hit
  convolution (Technician per hit, berry first hit only, Sash/Sturdy never
  save), `multiHitDistribution` in `scripts/calc.mjs` + `multiHit` flag in
  `src/ko.ts`; card shows the total range `[2-5 hits]`; `verify:multihit`
  34/34. Fixed-count multi-hit moves (Bonemerang, Double Kick, Twineedle,
  Double Hit, Dual Chop, Gear Grind, Triple Kick) are documented **not
  implemented** (§10) — they still print as one hit.
- **Metronome** — **won't implement** (closed 2026-09-11).
- **Future Sight / Doom Desire** — **won't implement** (closed 2026-09-11).
- **Minimize-target doubles** (Stomp / Steamroller / Dragon Rush) —
  **won't implement** (closed 2026-09-11).

Hidden Power + IVs **shipped the same day** (next section) — no engine gap is
open now.

### Hidden Power + IVs — DONE 2026-09-11

- **Hidden Power type** — DONE. `hidden power <type>` / the `hp <type>` alias
  (adjacent type word) sets the move type; `fill.mjs` clones the dex move so
  STAB/effectiveness/immunities/berries/plate/defender ability pick follow it.
  16 legal types; **Normal/Fairy hard-error**; a missing type is
  `missing hidden power type`. No derive-from-IVs path. The whole phrase is one
  `move` echo span. `hp <number>` is still the HP EV — `252 HP fire` is EV +
  dropped `fire` (no double-duty), by design. Contract: `DESIGN-RECORDS.md` §10
  Moves "Hidden Power".
- **IVs** — DONE (scope: forced values only). No manual IV input; every stat is
  31 except **Hidden Power Fire → attacker SpA IV 30** and **Foul Play →
  defender Atk IV 0** (base Atk < base SpA), both shown on the card. Contract:
  `DESIGN-RECORDS.md` §10 "### IVs".
- **Foul Play — DONE 2026-09-11.** `calcDamage` uses the **defender's current
  Atk** as the attack stat (attacker-side modifiers and burn still apply);
  `fill.mjs` sets the defender's **Atk IV = 0** when the defender's base Atk <
  base SpA (shown on the card). Only Foul Play reads the defender's Atk, so
  nothing else changes it. Covered by `verify-smogon`. Contract:
  `DESIGN-RECORDS.md` §10 Moves / "### IVs".

### Small open threads (all closed)

- **Result card repeats the query line** — DONE 2026-09-11: the card no longer
  prints `b.query`; `renderSingle` / `renderCombo` start directly at `Attacker`
  and the leading blank line is gone. The request is shown only by the Block-1
  recognition echo. `OUTPUT-FORMAT.md` "Layout grid" + "Wrapping" updated; card
  wrap unchanged (`verify:echo` 7/7, chaincheck "all identical").
- **Empty `()` when there are no KO tokens** — DONE 2026-09-11: `koVerdict`
  drops the trailing `(...)` when `koTokens` is empty, so a move that can never
  KO within the cap prints `no guaranteed KO in 10 hits` (no empty parens),
  matching the combo `Result` wording. Documented in `OUTPUT-FORMAT.md` "KO row".
- **Error-message consolidation** — DONE 2026-09-10 (`DESIGN-RECORDS.md` §8):
  taxonomy collapsed to `missing <var>` + `conflict on <slot>` + `unbound EV`;
  `too many moves` / EV-cap (252 & 510) / `no Mega forme` kept bespoke. The
  echo-on-error half shipped in step 7 (`err.sideLogs` → "scanned so far").
- **`no item` attacker-side semantics** (`DESIGN-RECORDS.md` §9) — DONE
  2026-09-10: attacker itemlessness is not display-only. `calc.mjs` derives
  `attackerHoldsItem = !attacker.noItem` and Acrobatics doubles only when it is
  false (the default inert held item suppresses the double). Auto-ability picks
  stay item-blind. `no item` echoes as `item` (step 7).
- **Alias-list hyphen cleanup** (idea note 3 tail) — CLOSED 2026-09-10:
  `aliases.md` has zero hyphenated alias KEYS, and the master hyphen rule
  (`hyphenToSpace`) folds every typed hyphen to a space, so a hyphenated key
  would be unreachable anyway. Nothing to prune.
- **Payback flat-50** (`DESIGN-RECORDS.md` §10) — DONE 2026-09-10: the
  speed-based doubling branch is gone (flat 50 BP) and the move is documented
  as out of scope, same class as Avalanche. `@smogon/calc` still doubles from
  Speed, so the slower-user case is intentionally absent from `verify-smogon`
  (64/64 now includes two Acrobatics item-presence rows, §9).
- **Boost-signal recognition on the free-order attacker side** — CLOSED by
  step 1 (move/boost claims ride `spec._claim` in the sweep). No further work
  beyond step 7's echo spans for converted signals.
- **Conditional-power clause table** — DONE 2026-09-10 (`DESIGN-RECORDS.md`
  §10): one `CONDITIONAL_POWER` table (`src/damage-calc.ts`) replaces the
  per-move inline `if` branches; Wake-Up Slap / Smelling Salts folded in.
- **Card (Block 2) wrap** — DONE 2026-09-10: `output.mjs` wraps through the
  echo's exported `wrapBlock` (default 100, `--width N`, `<= 0` never);
  `damage.mjs` and `output.mjs` agree byte-for-byte (`OUTPUT-FORMAT.md`).
- **Facade vs burn** — DONE 2026-09-10: `isBurned` exempts Facade (with Guts),
  mirroring `@smogon/calc` gen56 `applyBurn`; oracle row added.
- **Explicit item on a Mega** — DONE 2026-09-10: `fill.mjs` throws
  `conflict on item: <item> vs Mega Stone` for a typed item or `plate`; a
  stray `no item` is silently cleared (§9).
- **`powerOverride` removal** — DONE 2026-09-10: deleted from `DamageParams`
  and `resolveTypeAndPower` (no caller used it).

### New idea notes (user 2026-09-06)

1. **Agent skill optimization** (ties into step 8 / §11): the agent route
   simply calls `damage.mjs` — recognize a calc ask, pull the one-liner out of
   the message, and hand it to the tool; the agent authors NO spec JSON and NO
   echo spans. Revisit only if the route work stalls.
2. **`max` vs explicit-EV collision** — RESOLVED 2026-09-06 (user):
   same-stat `max <stat>` + explicit EV error (`max atk` then `120 atk` → hard
   error, both claims named); duplicate `max atk max atk` collapses; max on
   different stats coexist; the `max` auto-nature is only a default — an
   explicit nature wins, never collides.
3. **Master hyphen rule** — IMPLEMENTED 2026-09-07 (`hyphenToSpace`); minus
   glued to a boost/stage number is the only exception. See the alias-cleanup
   thread above for the leftover tail.

### Done — quick pointers (full detail in each session note)

| When | What | Record |
| --- | --- | --- |
| 2026-09-12 | Help redesign: `-tokens` → **`-grammar`** (authored human-readable GRAMMAR + one auto-derived lexeme example per type); `-help` auto-derived defaults block; held-item default cell reworded to "has item, no effect"; `verify:help` 57/57 | OUTPUT-FORMAT.md "Help topics" · `scripts/help.mjs` · `scripts/verify-help.mjs` · AGENTS.md rule 5 |
| 2026-09-12 | Fairy/Dark Aura + Aura Break as a field condition (`fill.mjs` resolves `auras`/`auraBreak` like a setter, stacking with weather/each other; engine 4/3 (`5448`) / Aura Break 3/4; Arena row names active aura(s); `verify-smogon` rows) | DESIGN-RECORDS.md §10 Abilities · `auto-fill-defaults.md` "Aura setters" |
| 2026-09-11 | Hidden Power (`hidden power <type>` / `hp <type>`, 16 types, Normal/Fairy rejected, no-type error) + forced IVs (HP Fire → attacker SpA 30; Foul Play → defender Atk 0 shown on card); Foul Play uses defender's Atk | DESIGN-RECORDS.md §10 Moves · "### IVs" |
| 2026-09-11 | Multi-hit 2-5 model: exact weighted convolution, Technician per hit, berry first-hit only, Sash/Sturdy never save; card total range `[2-5 hits]`; `verify:multihit` | DESIGN-RECORDS.md §10 |
| 2026-09-10 | Converter-side echo (step 7): shared tokenizer, `_sideLog` labels, "scanned so far" `err.sideLogs`, `damage.mjs` `runQuery` | `SESSION-NOTES-20260910-CONVERTER-ECHO.md` |
| 2026-09-09 | Mega exact-shape upgrade: prefix/suffix `mega`, no-forme hard error, `Mega X` move + `Mega Launcher` guards | `SESSION-NOTES-20260909-MEGA-EXACT-SHAPE.md` |
| 2026-09-09 | Species claim IN the sweep; residue resolver deleted (step 3) | `SESSION-NOTES-20260909-SPECIES-AS-CLAIMS.md` |
| 2026-09-09 | Tokenizer step-1 unified sweep + step 2 closed | `SESSION-NOTES-20260909-TOKENIZER-STEP1-SWEEP.md` |
| 2026-09-08 | Free-order `vs` frame (uses inert), junk silent-drop, max-flag expansion | `SESSION-NOTES-20260908-FREE-ORDER-RULINGS.md` |
| 2026-09-08 | Boost moves → boost signals (## 5 first slice) | `SESSION-NOTES-20260908-BOOST-SIGNALS.md` |
| 2026-09-08 | Seam F R1–R4 (stat-less `±N` dynamic; stray stat/number errors) | `SESSION-NOTES-20260908-SEAM-F.md` |
| 2026-09-07 | Seams A–C review (3-word sweep, guard, 1-word ties, spikes, comma) | `SESSION-NOTES-20260907-SWEEP-REVIEW-AI.md` |
| 2026-09-07 | Master hyphen rule | `SESSION-NOTES-20260907-HYPHEN-RULE.md` |
| 2026-09-06 | Echo renderer + wrap; `max`/EV collision rule | DESIGN-RECORDS.md §4 · notes 1–2 above |
| 2026-09-06 | Type+Plate spellings → real plate items (was `## 1`) | `SESSION-NOTES-20260906-PLATE-ALIASES.md` |
| 2026-09-06 | No-"uses" declaration (grammar contract, docs) | AGENTS.md rule 2/3 · DESIGN-RECORDS.md §2 |
| 2026-09-05 | Front split: `input-converter.mjs` + `fill.mjs` | `SESSION-NOTES-20260905-FRONT-SPLIT.md` |
| 2026-09-05 | Converter redesign design session (grammar, arenas, tokenizer) | `SESSION-NOTES-20260905-CONVERTER-REDESIGN.md` · `SESSION-NOTES-20260905-FUZZY-TOKENIZER.md` |
| earlier | Engine, defaults, accuracy sessions | `SESSION-NOTES.md`, `SESSION-NOTES-FILLER-DEFAULTS.md`, `SESSION-NOTES-FUZZY-RULES-ALIASES.md`, `SESSION-NOTES-ACCURACY-WEATHER.md`, `SESSION-NOTES-PIPELINE-OVERHAUL.md` |

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
