# TODO.md — front-refactor work order (phases 1–3)

Approved 2026-09-13. Goal: **fewer hard exceptions, more modular, easier to
expand, reuse functions where possible** — with **zero behavior change**. This
file now tracks that refactor. The completed pre-refactor backlog it used to
hold (all "old news") was migrated verbatim to `DESIGN-RECORDS.md` §14.

Pipeline under review (scripts only; the `src/` TypeScript engine is out of
scope):

```
input-converter.mjs → fill.mjs → calc.mjs → output.mjs
         └── echo.mjs / tokenize.mjs / damage.mjs / route.mjs
```

## Ground rules (apply to every phase)

- **Byte-identical output.** No behavior, message, card, or echo change. A
  phase that alters a byte is wrong — revert it.
- **Verify gate after each phase:** `npm run build`, then
  `node scripts/verify-smogon.mjs`, `node scripts/verify-accuracy.mjs`,
  `node scripts/verify-multihit.mjs`, `node scripts/verify-echo.mjs`,
  `node scripts/verify-lookup.mjs`, and the corpus chaincheck
  ("all identical"). Baseline: `DESIGN-RECORDS.md` §12.
- **Frozen:** `scripts/help.mjs` + `verify-help.mjs` (AGENTS.md rule 5), the
  `output.mjs` card layout, the doc-as-code semantics, and the loud-error
  philosophy (§8).
- **One phase at a time**, verified before starting the next.
- **Not trimming tests.** The suites stay whole (the ~78-case `verify:damage`
  oracle runs in ~0.2s; the cost is the repeated `tsc` build, not the cases).

## Phase 1 — shared low-level modules

Objective: remove copy-pasted plumbing. No logic changes.

1. **`scripts/md.mjs`** — one home for the doc-as-code markdown helpers:
   `mdSection(doc, heading, opts)`, `mdTableRows(section)`, `stripMdCell(s)`,
   `firstInt(s)`. `input-converter.mjs` (lines ~57–79) and `fill.mjs`
   (lines ~39–61) each carry their own `mdSection`/`mdTableRows`; keep BOTH
   heading behaviors behind an option (fill anchors `## ` only; the converter
   allows `#{1,6}`). Replace both copies with imports.
2. **`scripts/cli.mjs`** — shared CLI plumbing: `isMain(importMetaUrl)`,
   `readStdin()`, `readInput(arg)` (file-or-stdin; `-` = stdin). Apply in
   `calc.mjs`, `fill.mjs`, `output.mjs`, `input-converter.mjs`, `damage.mjs`
   (and the `echo.mjs` main guard, which uses a different pattern).
3. **`scripts/data.mjs`** — one loader exporting `DATA_DIR`, the parsed
   datasets, `chart`, and `natureByName` / `moveByName` / `monByName`. Point
   `input-converter.mjs` (loads 4 files today), `damage.mjs` and `calc.mjs`
   (both rebuild the chart) at it; re-export from `input-converter.mjs` so
   existing importers are untouched.

Risk: **low**. Watch the two `mdSection` variants and the `isMain` guard.

## Phase 2 — dedupe duplicated logic

**Status: DONE (2026-09-13).** Implemented as `buildStats(spec, entry)` (2a —
both it and `resolve` read the IV/EV floors from `FILL_DEFAULTS`),
`buildBaseParams(input, effWeather, hazardTotal)` (2b), and `resolveAfterMoves(
matchup, moveEntries, kind)` (2c — `anchor` derived internally from
`moveEntries[0]`; single/combo shape via `kind`). Byte-identical: `npm run
build` + verify:damage/acc/multihit/echo/lookup + corpus chaincheck (`all
identical`) + corpus resolved-JSON/card diff all pass.

Rationale archived below so the reasoning stays available.

### 2a. `fill.mjs` — one `buildStats(spec, entry)`
- **Change:** `specSpeed` (`fill.mjs:414`) is a hand-copied version of
  `resolve`'s stat build (`fill.mjs:699`) — its comment literally says "Mirrors
  resolve()'s stat build." They are NOT identical: `resolve` applies the IV/EV
  floors from `FILL_DEFAULTS`, while `specSpeed` hardcodes IV 31 and
  `spec.evs ?? {}`. One helper reads `FILL_DEFAULTS` for both.
- **Why good:** the two disagree the moment `auto-fill-defaults.md` changes a
  default, silently making the weather-order Speed comparison disagree with the
  stats used for damage. One source of truth.
- **Risk:** low/medium — numbers must be identical; the gate asserts it.

### 2b. `calc.mjs` — one `buildBaseParams(input, effWeather, hazardTotal)`
- **Change:** `calcSingle` (`calc.mjs:164-181`) and `calcCombo`
  (`calc.mjs:264-273`) build the same `baseParams` bag field by field. Extract
  one builder both call.
- **Why good:** every field (`targetHoldsItem`, `attackerHoldsItem`,
  `auraBreak`, `ignoresAbilities`, `damageTakenBefore`, …) is listed twice; a
  new ancestor-side parameter added to one and not the other is a silent
  divergence bug.
- **Risk:** low/medium — no field changes; byte output must match.

### 2c. `fill.mjs` — one `resolveCommon(matchup, moveEntries, anchor, kind)`
- **Change:** `resolveSingleInput` (`fill.mjs:826`) and `resolveComboInput`
  (`fill.mjs:871`) are ~95% identical (canonicalize moves, `applyHiddenPowerIV`,
  `hiddenPowerMove`, `applyFoulPlayIV`, `fillCombatant` x2, `fillWeather`,
  `fillAura`, `resolve`, `suppressWeather`, plate, `cardFlags`, return bag).
  Share the core; each wrapper resolves only its own move shape + return `kind`.
- **Why good:** new resolution steps (Hidden Power and Foul Play both did this)
  must currently be added to both in the right order — the concrete "harder to
  expand" problem. Shrinks where the two card shapes can drift.
- **Risk:** medium (biggest single dedupe here) — ordering and the `flags` /
  `query` fields must match exactly.

## Phase 3 — centralize rules & errors

Objective: one home for game-rule tables and one builder per error shape.
Rationale archived here so the work can be pulled later.

### 3a. Rule-table home
- **Change:** game-rule constants live in three files — `calc.mjs`
  `MULTIHIT_MOVES`; `fill.mjs` `RECOIL_MOVES`, `BOOST_PREDS`, `MB_RELEVANCE`,
  `PRIMAL_WEATHER`, `HP_ILLEGAL_TYPES`, `FIXED_ABILITY`, `DEFENDER_FIXED`;
  `input-converter.mjs` `HP_ILLEGAL`, `ITEM_NAMES`, `STEALTH_ROCK_PHRASES`,
  `NO_ITEM_PHRASES`. Collect them.
- **The real decision — two species of table:**
  - **Data lists** (`RECOIL_MOVES`, `PRIMAL_WEATHER`, `HP_ILLEGAL`,
    `ITEM_NAMES`, `STEALTH_ROCK_PHRASES`, `NO_ITEM_PHRASES`, `MULTIHIT_MOVES`)
    could move into `aliases.md` / `auto-fill-defaults.md` with code fallbacks,
    like the plate and boost tables.
  - **Predicate maps** (`BOOST_PREDS`, `MB_RELEVANCE`) are LOGIC (they take a
    move/entry and return a decision), so they cannot be markdown rows — the
    `CONDITIONAL_POWER` design note already makes this argument. They stay in
    code, ideally one `scripts/rules.mjs`.
  - Low-risk half: consolidate into `scripts/rules.mjs`. Higher-risk half: move
    the data lists to doc-as-code.
- **Why good:** discoverability ("where do I add a recoil move?"), one edit to
  add a rule, consistency with the doc-as-code idiom.
- **Risk:** medium — markdown parsing is more fragile; code consolidation is
  the safe option.

### 3b. Derive `MULTIHIT_MOVES` from dex data (optional)
- **Change:** replace the hand-maintained 14-name Set (`calc.mjs:28`) with a
  structured `multihit` field emitted by `scripts/gen-move-ability-data.mjs`.
- **Why good:** the list is derivable game data and could never go stale; it is
  also the natural home for the fixed-count multi-hit moves the engine
  documents as unmodeled.
- **The catch:** the dex has no such field today — only the prose
  `"Hits 2-5 times in one turn."` — so the generator must encode that rule, and
  mis-marking a move is the risk. If the derivation isn't airtight, keep the
  explicit list.
- **Risk:** medium — data regen must leave `verify:damage` and
  `verify:multihit` untouched.

### 3c. `scripts/errors.mjs` — one builder per error shape
- **Change:** 27 hand-written `throw new Error(...)` strings (17 in
  `input-converter.mjs`, 10 in `fill.mjs`) become builders: `missing(var,
  quote)`, `conflict(slot, values)`, `unboundEv(tokens)`, plus the kept
  bespoke ones (`too many moves`, EV caps, `no Mega forme`).
- **Why good:** §8 defines a deliberate three-shape taxonomy; builders make it
  enforceable instead of convention, and give one place to change wording.
- **Constraint:** throw TIMING matters — `claimSlot` throws before logging so
  the "scanned so far" echo stops correctly — so builders must be pure string
  functions called at the same points, not a control-flow change.
- **Risk:** medium — message bytes are pinned by the echo fixtures.

## Out of scope (decided 2026-09-13)

- **No** splitting `input-converter.mjs` / `fill.mjs` into submodules
  (the dropped "Phase 4").
- **No** merging the two move-claim implementations (the sweep's
  `literalClaimAt` vs the standalone `scanMoveWords`).
- **No** trimming of the verify suites.
