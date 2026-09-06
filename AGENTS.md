# AGENTS.md — pokemon-dmg-calculator

Gen 6 (XY/ORAS) Pokemon **damage calculator**; the whole engine, dex data, and
docs ship in this repo. This file is injected whole at every session start, so
it deliberately holds only the **always-on rules** (MUST OBEY below) plus an
**index**. The deep reference prose lives in the repo docs — read the index,
then the doc you need; never try to memorize it all. **The full how-to for
answering a damage query lives in `AGENT-GUIDE.md` — read it when a query
fires.**

Pipeline: an **agent** (free-word query → spec JSON — users are NOT assumed to
type `uses`/`use`) or `input-converter.mjs` (compat extractor that only accepts
the literal `<atk> uses <move> vs <def>` frame, kept for canned / corpus lines)
→ `scripts/fill.mjs` (defaults + resolve: spec JSON → calc-input JSON; rules
parsed from `auto-fill-defaults.md`) → `scripts/calc.mjs` (pure math) →
`scripts/output.mjs` (result card; OWNS the layout). `damage.mjs` is a thin
compat card CLI gluing the same chain.

## MUST OBEY — routing, tool-only truth, defaults, verbatim output

**1. Identified damage queries go through `AGENT-GUIDE.md` — never ad hoc.**
If an inquiry is identified as a pokemon damage calc — damage / KO / accuracy /
chip numbers between sides ("Garchomp Dragon Claw vs Heatran", "does X one-shot
Y", "how many hits to KO Y", "what % does Z do") — you MUST answer it through
the staged pipeline per `AGENT-GUIDE.md` (extract → spec JSON → echo → `fill |
calc | output --chat` → paste verbatim). Do NOT go look up info or improvise:
the engine, staged scripts, data files, and docs are the ONLY source of truth
for numbers — no web research, no memorized stats, no knowledge from other
gens. If a calc can't be modeled, report the limit (`ENGINE-GAPS.md`) rather
than inventing numbers. A query without `vs` is not answerable yet — ask for
the other side.

**2. Answer shape: recognition echo, then the card — both pasted verbatim.**
Before any card or error, show what you understood: render
`node scripts/echo.mjs --line "<query verbatim>" --spans '<spans>' --chat`
(one span per token you bound, unbound tokens `???` — never fabricate) and
paste that fenced block verbatim. Then paste the output script's card block
**verbatim, byte for byte** — never summarize, restate, reformat, hand-write,
or substitute your own numbers; on a stage error, report the error. Details,
span schema, and token lexicons: `AGENT-GUIDE.md` steps 1–2.

**3. Defaults policy: `fill.mjs` fills the defaults — you never do.** Your job
is EXTRACTION: bind every token you recognize (consulting `aliases.md` for
acronyms/shorthand is extraction, not filling) and pass the stated variables
to `fill.mjs`, which consults `auto-fill-defaults.md` and fills every
unspecified variable itself — level, nature, IVs, EVs, ability pick,
orb→status, weather setters, `max atk` expansion, boost placement. Never add
EVs, natures, items, status, stages, weather, or boosts the user didn't type,
and never pre-compute what a default would be ("Garchomp Dragon Claw vs
Heatran" ⇒ attacker Garchomp, move Dragon Claw, defender Heatran — nothing
added). The card prints what was resolved, so a wrong assumption is visible
there. The only times the agent may add a NON-DEFAULT token the user's intent
requires (e.g. a genuinely itemless mon needs `no item`), plus all token
rules: `auto-fill-defaults.md`. If a query can't be translated or needs a
choice the front can't infer, ask the user instead of guessing.

**4. Card layout is not the agent's job.** The result-card layout is
implemented once in `scripts/output.mjs` and pinned in `OUTPUT-FORMAT.md`. The
agent never composes, restyles, reformats, or explains a card's layout — answer
a query by pasting the output script's block verbatim (rule 2). When output
rules change, edit `output.mjs` and `OUTPUT-FORMAT.md` together, never AGENTS.md.

## Reference index

Read the section you need from the file that owns it; never memorize these.

| Topic | Where it lives |
| --- | --- |
| **How to answer a damage query end to end** (extract → spec JSON → echo → chain → paste; worked example) | **`AGENT-GUIDE.md`** |
| Query tokens & side shapes: word/phrase lexicons in `input-converter.mjs` passes; name/acronym tables (species, move, item, stat, status, weather, type plates) in **`aliases.md`** (doc-as-code); investment/stat-stage/arena token rules + "only times the agent adds to the spec" in **`auto-fill-defaults.md`** | `aliases.md` · `auto-fill-defaults.md` · `input-converter.mjs` |
| Defaults the engine applies, EV/nature shorthands, orbs, weather setters, ability pick order, the only times the agent adds to the spec | **`auto-fill-defaults.md`** (doc-as-code, parsed by `fill.mjs`) |
| Recognition echo: layout contract + span schema + CLI | `scripts/echo.mjs` header · `TODO.md` ## 2 (design record) |
| Two-move combos · turn-by-turn sim | **`OUTPUT-FORMAT.md`** "Two-move combos (fixed sequence)" · "Turn-by-turn block" |
| Accuracy/evasion: modeled SEPARATELY from damage — acc tokens never change damage/KO numbers (`verify:damage` stays byte-identical to the oracle); engine `src/accuracy.ts`, `npm run verify:acc` | **`OUTPUT-FORMAT.md`** "Chance to hit all attacks" + `src/accuracy.ts` |
| Dynamic-power (variable BP) moves + what the CLI can/can't model | **`ENGINE-GAPS.md`** |
| Result-card contract (layout owned by `output.mjs`) | **`OUTPUT-FORMAT.md`** |
| Backlog / approved work / open threads | **`TODO.md`** |
| Repo layout, team DB, tools | "Project layout" below · `myteam/` · `teams_tools/` |

## Project layout (short)

- `data/` — generated Smogon XY datasets (`xy-pokemon.json`, `moves-xy.json`,
  `abilities-xy.json`, `natures-xy.json`, `types-xy.json`, `_raw-xy-basics.json`
  = raw dump; regenerate, don't hand-edit).
- `src/` — TypeScript library: `types.ts`, `statdex.ts` (loader/lookups),
  `stat-calc.ts`, `type-chart.ts`, `damage-calc.ts` (gen-6 damage engine).
- `scripts/` — staged pipeline: `input-converter.mjs` (extractor; also hosts the
  shared front lexicon fill.mjs imports) → `fill.mjs` (defaults+resolve) →
  `calc.mjs` (pure calc) → `output.mjs` (card renderer); plus `echo.mjs`
  (recognition-echo renderer), `damage.mjs` (compat card CLI), data-gen and
  verify scripts (`verify:echo`, `verify:damage`, `verify:acc`).
- `auto-fill-defaults.md` · `aliases.md` · `OUTPUT-FORMAT.md` — doc-as-code rule
  stores parsed at startup / by the parser; edit these, not the scripts.
- `examples/` — sample case JSON files (`.resolved.json` = calc-stage input).
- `myteam/` — the user's **custom team database** (manual, user-authored;
  `teams.tsv` master, `teams.xlsx` derived). NOT official Smogon data — may
  disagree with `data/xy-pokemon.json` (tiers like `below RU`/`MISC`, names like
  `Mega Rayquaza`). Format/schema: `myteam/teams.tsv` header + `#` lines.
- `teams_tools/` — Python maintainers for `myteam/`: `tsv2xlsx.py`,
  `xlsx2tsv.py`, `add-row.py`, `rebuild-file.py`, `_paths.py` (no hardcoded
  paths; env `TEAMS_TSV`/`TEAMS_XLSX` override). Run from `teams_tools/`.
