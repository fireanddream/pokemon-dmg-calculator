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

**Status: DONE.** Implemented as `scripts/md.mjs`, `scripts/cli.mjs`, and
`scripts/data.mjs`; existing importers untouched.

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
**Status: NOT IMPLEMENTED (decided 2026-09-13).** Only the two side-finds were
fixed: the duplicate Hidden Power illegal-type set is gone (`fill.mjs` now
imports `HP_ILLEGAL` from `input-converter.mjs`) and the duplicate
`Leftovers` / `Life Orb` rows were dropped from `ITEM_NAMES`. The `rules.mjs`
consolidation and the doc-as-code migration are deliberately not done.

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
**Status: DEFERRED (decided 2026-09-13).** The 2-5 multi-hit moves do not
change; the hand-maintained list stays.

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
**Status: DONE (2026-09-13).** Implemented `scripts/errors.mjs` with nine pure
string builders — `missing`, `missingSpeciesMega`, `missingSplit`, `conflict`,
`unboundEv`, `illegalHpType`, `evOverMax`, `tooManyMoves`, `tooManyEvs`. All 27
throw sites (17 `input-converter.mjs` + 10 `fill.mjs`) route through a builder;
the old `unboundEvError` moved out of `input-converter.mjs`. Decisions: strings
(not Error objects) with the literal `throw` kept at each site; messages only,
no shape metadata. Hints added — `-search` on the whole missing-variable group,
`-help`/`-grammar` on `missing split`; mega folded into the missing group as
`missing species mega "<name>"`. `DESIGN-RECORDS.md` §8 rewritten. Byte-safe:
build + verify:damage 78/78, acc 44/44, multihit 34/34, echo 7/7, lookup 48/48,
help 59/59, corpus chaincheck `all identical`.

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

## Untouched-scripts pass (2026-09-13)

The scripts phases 1–3 left unexamined got a follow-up pass for the same goal
(fewer hard exceptions, more modular, easier to expand). Byte-identical where
the output is pinned; the gate was the full verify suite + corpus chaincheck
(every suite `IDENTICAL`, chaincheck `all identical`).

**Done:**

- **One dist-free loader.** `scripts/data.mjs` no longer imports `dist/`; it
  reads only the datasets + maps and re-exports `DATA_DIR`. The built type chart
  moved to `scripts/typechart.mjs`, and the on-disk root to
  `scripts/paths.mjs` (so generators can import the path without triggering
  eager reads). `lookup.mjs`, all five `verify-*`, `random-stats.mjs`,
  `audit-abilities.mjs` now import the shared data instead of re-rolling
  `DATA_DIR` + `readFile` + `JSON.parse`. `lookup.mjs`/`verify:lookup` stay
  engine-free (no build needed).
- **One rule-table home.** `scripts/rules.mjs` owns `RECOIL_MOVES`,
  `BOOST_PREDS`, `MB_RELEVANCE`, `typeEffVs` (moved verbatim out of `fill.mjs`)
  plus the human-readable `BOOST_ABILITY_NOTES` / `BOOST_ABILITY_NAMES` /
  `MITIGATION_ABILITY_NAMES` catalogs. `fill.mjs` imports the predicates;
  `audit-abilities.mjs` imports the catalogs (its hand-copied `BOOST`/`DEF`
  mirrors are gone) and warns if a `BOOST_PREDS` key lacks a catalog note.
- **Shared verify helpers.** `scripts/verify-util.mjs` holds `mon`/`mv` and the
  two tally printers (`reportCounts`, `reportChecks`); `byName` moved into
  `data.mjs`. Removed the duplicated runners/comparators/lookups.
- **CLI guard applied.** `fetch-xy-dex.mjs` and `gen-move-ability-data.mjs` use
  `cli.mjs`'s `isMain` (the latter had no guard at all).
- **Archived.** `_derive-sf.mjs` (one-off oracle derivation) moved to
  `session-tools-archive/20260913-derive-sf.mjs`.

**Remaining surface (still no known problem):**

- `tokenize.mjs` — small and self-contained; nothing found.
- `route.mjs` — thin `runQuery` alias; no logic.
- `output.mjs` — **frozen** (layout owned here, pinned by `OUTPUT-FORMAT.md`).
- `help.mjs` + `verify-help.mjs` — **frozen** (AGENTS.md rule 5).
- `lookup.mjs` — `-search` CLI; deliberately off the damage path (rule 6).
- `src/` — the TypeScript engine, out of scope.

## Untouched scripts (original inventory 2026-09-13)

Kept for history; superseded by the pass above. The original list named the
data-gen / dev tools (`fetch-xy-dex.mjs`, `gen-move-ability-data.mjs`,
`audit-abilities.mjs`, `_derive-sf.mjs`, `random-stats.mjs`), `lookup.mjs`, the
frozen `help.mjs`, the five `verify-*` suites, and `tokenize.mjs` / `route.mjs`
/ `output.mjs` / `src/`.
