# OVERHAUL-PLAN.md — local-first overhaul (draft for review)

Status: **proposal** — no code changes yet. Review, edit, then approve per-phase.

Goal: stop depending on an agentic (LLM-in-the-loop) middle layer for the
damage workflow, so the whole tool is usable offline with plain local scripts.
End state: the user types a natural-ish damage query at a local REPL / CLI and
gets the OUTPUT-FORMAT card back, with rules enforced by code, not by reading
`.md` files.

---

## 1. What is agentic today (and what is already local)

The damage **engine** is already fully local and offline:

- `scripts/damage.mjs` reads `data/*.json` + `ABILITY-DEFAULTS.md`, imports the
  compiled `src/` library from `dist/`, and touches **no network**.
- Spec → card is one deterministic pipeline:
  `parseQuery` → `parseCombatant` (~20 regex passes) → `resolve` / `runMatchup`
  → inline `console.log` printing (the OUTPUT-FORMAT contract).
- `@smogon/calc` is only a **devDependency** oracle for `verify-*` scripts.

What is still agentic / needs an LLM in the loop:

| Activity | Today | Why it needs the agent |
|---|---|---|
| User words → spec line | `damage.mjs` runs, but *translating* free English to the grammar is done by the agent | Parser grammar is strict: mostly requires the `<atk> uses <move> vs <def>` frame; a hardcoded ~4-move alias table (`MOVE_ALIASES` L52) and ~10 species aliases (`SPECIES_ALIASES` L36) |
| "Answer" formatting | CLI prints the card, but the agent is relied on to know the output contract and paste verbatim | Rules live in prose (`OUTPUT-FORMAT.md`, `auto-fill-defaults.md`, `ABILITY-DEFAULTS.md`); the agent must *know* them |
| Compound / follow-up questions | Agent chains separate CLI runs ("what if it has LO", "now turn by turn") | REPL (`repl()` L1616) is stateless: no defender memory, no history |
| Data regeneration | `fetch-xy-dex.mjs` hits the Smogon RPC over the network | Rebuilding data requires internet |
| Deferred ability defaults | `ABILITY-DEFAULTS.md` is parsed at runtime (L106) | This one is already doc-as-code — keep it |

The main idea: **push translation and rule-application down into code** so the
agent becomes optional (and eventually only needed for questions the local
engine cannot model at all).

---

## 2. Target architecture

```
 User query text  (one line, "natural-ish")
        │
        ▼
┌───────────────────────────────┐
│  scripts/calc.mjs  (REPL or   │   the single local front door
│  1-shot / batch file)         │   - history, defender memory
└───────────────┬───────────────┘
                ▼
┌───────────────────────────────────────────────┐
│  src/  (TypeScript library, compiled → dist)   │
│   parse/     query grammar → spec   ← NEW      │
│   defaults/  ability/weather/EV rules ← NEW    │
│   damage/    existing calc + sim               │
│   print/     OUTPUT-FORMAT renderer    ← NEW   │
└───────────────┬───────────────────────────────┘
                ▼
          data/*.json  (checked-in snapshot)
          ABILITY-DEFAULTS.md  (doc-as-code, unchanged)
```

Principles:
1. **No network at runtime or for data regen** (vendored raw seed, §4).
2. **The output contract is one renderer** — not ~200 duplicated lines in
   `runMatchup` + `runCombo` (currently re-declare `buildCard`, `itemOf`,
   `STATUS_WORD`, arena parts, chip/heal, hazard math twice).
3. **Rules are code + generated data, not agent memory.** Every default the
   agent is currently told to "know" (nature/EV shorthand expansion, ability
   pick order, KO wording, HP rounding) gets a test.
4. **Fuzzy parse, fail loud.** Unknown words → ranked suggestions, not silent
   drops.

---

## 3. Workstreams (each independently shippable)

### WS1 — Local query grammar + parser hardening

Replace the strict one-frame parse with a deterministic grammar module
(`src/parse/`) that `damage.mjs` and the new REPL both use.

- **Word-order free combatants** (already mostly true per side) but relax the
  top frame so it accepts more than `X uses M vs Y`:
  - `does X one-shot Y with M` / `X vs Y M` / `X M vs Y`
  - `X uses M` alone (Y implicit: "vs the current defender" in REPL)
- **Data-driven alias expansion** instead of hardcoded tables:
  - Moves: generate from `moves-xy.json` (so `EQ`/`bb`/`blitz`/`draco` stay,
    and we add a normalization pass — strip punctuation, common suffixes).
  - Species: generate from `xy-pokemon.json`; keep `SPECIES_ALIASES`, add fuzzy
    prefix/substring ranking with **suggestions on ambiguity** (e.g. "landorus"
    → "Landorus / Landorus-Therian / ..."). Choose silently only when unique.
- **Question frames** map to flags the engine already supports (`turn by turn`,
  combo moves, status words, `no item`), so "does X ohko Y" still runs the same
  card — the KO row already answers it.
- Keep the existing behavior byte-identical for queries the current grammar
  already parses (`verify:damage`, `verify:acc` must stay green).

### WS2 — REPL with memory

Rework `repl()` (L1616) into `scripts/calc.mjs` (keep `damage.mjs` as the
compat one-shot entry):
- persistent "current defender" (query `X uses M` uses it),
- query history (arrow keys), `:help`, `:set` (default defender / level /
  weather), repeat-last (`:`),
- batch mode: `node scripts/calc.mjs file.txt` — one query per line, all cards,
  non-fatal on error (so follow-up chains stop needing an agent at all),
- exit codes for scripting (`0` all parsed, `1` any failed).

### WS3 — Single print renderer

Extract the duplicated card/table printing into `src/print/` (one
implementation shared by single-move and combo paths). Add a **golden-file
test**: the exact `OUTPUT-FORMAT.md` examples + a fixed corpus must byte-match
`tests/golden/*.txt`. This converts "the agent must paste the contract
verbatim" into `npm run verify:format` — a local check.

### WS4 — Offline-first data

- Vendor the raw dump: keep `data/_raw-xy-basics.json` as the canonical seed
  (already present, ~1 MB).
- `fetch-xy-dex.mjs`: split into (a) `fetch:data:online` (rare, refreshes the
  seed) and (b) `gen:aux` that reads **only the vendored raw** — no network.
  Confirm `gen-move-ability-data.mjs` already reads `_raw-xy-basics.json`
  (yes, L7) so the only network touch is the initial seed fetch.
- Document the offline story: fresh checkout needs the seed (checked in) +
  `npm run build`; no internet anywhere in the loop.

### WS5 — Rule consolidation (auto-fill-defaults.md → data)

`auto-fill-defaults.md` prose is currently enforced by code but *understood by the agent*.
Move the decision tables to generated/data form so the engine is the source of
truth and the doc is derived:
- nature/EV shorthand table (`max atk/spa/def/spd`) → a small code table +
  test (already in `applyMaxFlags` L875);
- ability pick order → already doc-as-code via ABILITY-DEFAULTS.md parse —
  extend the same pattern rather than fight it;
- write unit tests asserting each auto-fill-defaults.md row (level 50, IV 31, Serious
  nature, 0 EVs, inert item...) so regressions are caught locally.
- Update `auto-fill-defaults.md` header (L5) to stop instructing *agents* to translate.

---

## 4. Scripts / files summary (add → change → keep)

| Area | New | Changed | Untouched |
|---|---|---|---|
| Front door | `scripts/calc.mjs` (REPL+batch) | `damage.mjs` kept as compat one-shot | — |
| Parse | `src/parse/` (grammar, aliases, suggestions) | `parseQuery`/`parseCombatant` move into it | — |
| Print | `src/print/` renderer | `runMatchup`/`runCombo` call it | OUTPUT-FORMAT.md (source) |
| Tests | `tests/golden/*`, `tests/parse/*`, `tests/defaults/*` | package.json `verify:format` / `verify:parse` | `verify:damage`, `verify:acc` |
| Data | `scripts/fetch:data:online` split | `fetch-xy-dex.mjs` | `_raw-xy-basics.json` seed, `gen-move-ability-data.mjs` |
| Docs | README for local usage | `auto-fill-defaults.md` header note; AGENTS.md "agent optional" | ABILITY-DEFAULTS.md (already parsed) |

---

## 5. Migration order (recommended sequence)

1. **WS4 (data offline)** — zero-risk, removes the only network path today.
2. **WS3 (print renderer + golden tests)** — do before parse changes so the
   output contract is pinned and any refactor is provably byte-identical.
3. **WS1 (grammar)** — swap parser in behind the same interface; run
   `verify:damage` / `verify:acc` / new `verify:parse`.
4. **WS2 (REPL)** — user-facing win last so behavior is stable.
5. **WS5 (rule tests)** — continuous; add a test per defaults row as touched.

Each WS lands with its tests green and `npm run verify:*` passing.

---

## 6. Explicit non-goals / risks

- **Not** free-form NLU (no LLM, no fuzzy "what do I mean by the"). Grammar is
  deterministic and documented; anything it can't parse gets suggestions.
- **Not** re-verifying against Smogon data online in the normal path; the
  vendored seed is trusted. Online fetch only refreshes the seed deliberately.
- Risk: parser/print refactors silently changing rounding or KO wording — the
  golden + verify suites are the guard; if any diff appears, the tests catch it
  before the agent would.
- Open question for the reviewer: should `calc.mjs` REPL keep a *defender
  memory across runs* (persisted to a small state file) or only in-session?
  (Proposal: in-session only for v1.)

## 7. First concrete step once approved

WS1+WS3 kickoff, single PR-sized slice: add `src/parse/` + `src/print/` as
pure functions with unit tests, wire them into `damage.mjs` behind a flag,
run all `verify:*`. Nothing user-visible changes until WS2.
