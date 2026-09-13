# AGENTS.md — pokemon-dmg-calculator

Gen 6 (XY/ORAS) Pokemon **damage calculator**; the whole engine, dex data, and
docs ship in this repo. This file is injected whole at every session start, so
it deliberately holds only the **always-on rules** (MUST OBEY below) plus an
**index**. The deep reference prose lives in the repo docs — read the index,
then the doc you need; never try to memorize it all. **The full how-to for
answering a damage query is the `pokemon-damage-calc` skill (project skill,
`.opencode/skills/pokemon-damage-calc/SKILL.md`) — load it when a query
fires.**

Pipeline: an **agent** (free-word query — users are NOT assumed to type
`uses`/`use`; `use(s)` is inert everywhere) or `input-converter.mjs`
(offline extractor: `vs` splits two free-order sides, NO `uses` syntax)
→ `scripts/fill.mjs` (defaults + resolve: spec JSON → calc-input JSON; rules
parsed from `auto-fill-defaults.md`) → `scripts/calc.mjs` (pure math) →
`scripts/output.mjs` (result card; OWNS the layout). The agent's ONE tool call
is `scripts/route.mjs` (converter → echo → fill → calc → output in one
process); `damage.mjs` is a thin compat card CLI gluing the same chain.

## MUST OBEY — routing, tool-only truth, defaults, verbatim output

**1. Identified damage queries go through the `pokemon-damage-calc` skill —
never ad hoc.** If an inquiry is identified as a pokemon damage calc — damage /
KO / accuracy / chip numbers between sides ("Garchomp Dragon Claw vs Heatran",
"does X one-shot Y", "how many hits to KO Y", "what % does Z do") — you MUST
load the skill and answer it with its ONE tool call:
`node scripts/route.mjs "<the user's query, verbatim>"`, then paste the output
verbatim. Do NOT go look up info or improvise: the engine, staged scripts, data
files, and docs are the ONLY source of truth for numbers — no web research, no
memorized stats, no knowledge from other gens. If a calc can't be modeled,
report the limit (`DESIGN-RECORDS.md`) rather than inventing numbers. A message
with no `vs` has no answerable side split yet — ask the user to restate it as
`<attacker side> vs <defender side>`.

**2. Answer shape: recognition echo, then the card — both pasted verbatim.**
`route.mjs` takes the user's line AS-IS (throw the whole vs-sentence at it; do
NOT strip filler, reorder, translate, expand, or author spec JSON/spans) and
prints ONE fenced block: Block 1 the recognition echo (the converter's own
bindings, `???` for tokens it could not place) then Block 2 the result card —
or, on a stage error, the echo then the error message. Paste that block
**verbatim, byte for byte** — never summarize, restate, reformat, hand-write,
or substitute your own numbers. Details: the `pokemon-damage-calc` skill.

**3. Extraction and defaults are the tool's job — never do them by hand.**
`input-converter.mjs` binds the tokens and `fill.mjs` fills every unspecified
variable from `auto-fill-defaults.md` (level, nature, IVs, EVs, ability pick,
orb→status, weather setters, `max atk` expansion, boost placement). Slide the
user's words straight through; never add, drop, reorder, or rewrite a token,
and never pre-compute a default ("Garchomp Dragon Claw vs Heatran" ⇒ that line
exactly, nothing added). The card prints what got resolved, so a wrong
assumption is visible there. The only times the agent may add a NON-DEFAULT
token the user's intent requires (e.g. a genuinely itemless mon needs
`no item`) are listed in `auto-fill-defaults.md` → "The only times the agent
adds to the spec". If the line can't be translated or needs a choice the front
can't infer, ask the user instead of guessing.

**4. Card layout is not the agent's job.** The result-card layout is
implemented once in `scripts/output.mjs` and pinned in `OUTPUT-FORMAT.md`. The
agent never composes, restyles, reformats, or explains a card's layout — answer
a query by pasting the output script's block verbatim (rule 2). When output
rules change, edit `output.mjs` and `OUTPUT-FORMAT.md` together, never AGENTS.md.

**5. Help scripts are FROZEN until asked.** `scripts/help.mjs` (and its
`verify:help`) must NOT be edited to chase minor changes in the scripts/docs it
projects from — don't touch them after every small change elsewhere. Leave them
untouched unless the user explicitly asks, or at a stable release-ready point.
When help content needs to change before then, stage it in a scratch preview
(e.g. under `tmp/`) and wait for the go-ahead to implement.

**6. Name / move lookups: use `-search`, never the web or memory.** When the
question is *which* pokemon have a typing, or *which* moves are of a type /
power / category, answer it with the CLI lookup instead of doing web research or
recalling data:
`node scripts/damage.mjs -search pokemon <type> [type2]` (exact typing-set;
full type names, 1-2, any order; a mono type never returns duals) and
`node scripts/damage.mjs -search move <type> [power] [phys|special]` (attacking
moves only; exact `power` and category optional, any order; category
`physical`/`special` or `phy`/`spe`/`atk`/`spa`). Output is one comma-separated
line, or `none found` — paste it as-is. It is CLI-only and stays OUT of the
damage path: **never** use it to resolve or rewrite tokens on a damage-query
line (the converter + `fill.mjs` own that, rule 3), and a damage line still goes
to `route.mjs` verbatim (rule 1). Contract: `DESIGN-RECORDS.md` §13;
`npm run verify:lookup`.

## Reference index

Read the section you need from the file that owns it; never memorize these.

| Topic | Where it lives |
| --- | --- |
| **How to answer a damage query end to end** (form the line → `route.mjs` → paste; worked example) | **`pokemon-damage-calc` skill** (`.opencode/skills/pokemon-damage-calc/SKILL.md`) |
| Query tokens & side shapes: word/phrase lexicons in `input-converter.mjs` passes; name/acronym tables (species, move, item, stat, status, weather, type plates) in **`aliases.md`** (doc-as-code); investment/stat-stage/arena token rules + "only times the agent adds to the spec" in **`auto-fill-defaults.md`** | `aliases.md` · `auto-fill-defaults.md` · `input-converter.mjs` |
| Defaults the engine applies, EV/nature shorthands, orbs, weather setters, ability pick order, the only times the agent adds to the spec | **`auto-fill-defaults.md`** (doc-as-code, parsed by `fill.mjs`) |
| Recognition echo: layout contract + span schema + CLI | `scripts/echo.mjs` header · `DESIGN-RECORDS.md` "Recognition echo" |
| Pokemon-typing / attacking-move lookup (`-search`, CLI-only; use it instead of web/memory) | **`DESIGN-RECORDS.md` §13** · `scripts/lookup.mjs` |
| Two-move combos · turn-by-turn sim | **`OUTPUT-FORMAT.md`** "Two-move combos (fixed sequence)" · "Turn-by-turn block" |
| Accuracy/evasion: modeled SEPARATELY from damage — acc tokens never change damage/KO numbers (`verify:damage` stays byte-identical to the oracle); engine `src/accuracy.ts`, `npm run verify:acc` | **`OUTPUT-FORMAT.md`** "Chance to hit all attacks" + `src/accuracy.ts` |
| Design records + engine coverage: grammar/tokenizer/arena/boost/mega contracts, known engine gaps & intentional simplifications | **`DESIGN-RECORDS.md`** |
| Result-card contract (layout owned by `output.mjs`) | **`OUTPUT-FORMAT.md`** |
| Front-refactor work order (approved phases 1–3) | **`TODO.md`** |
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
  (recognition-echo renderer), `route.mjs` (the agent one-shot: line →
  echo+card), `damage.mjs` (compat card CLI, also hosting the CLI-only
  `-search` lookup), `lookup.mjs` (`-search` name/move lookup), data-gen and
  verify scripts (`verify:echo`, `verify:damage`, `verify:acc`, `verify:lookup`).
  Shared modules: `data.mjs` (dist-free dataset loader + name maps) ·
  `typechart.mjs` (built chart) · `paths.mjs` (DATA_DIR) · `rules.mjs` (engine
  damage-rule tables + ability catalogs) · `md.mjs` / `cli.mjs` ·
  `verify-util.mjs` (verify lookups + tallies).
- `auto-fill-defaults.md` · `aliases.md` · `OUTPUT-FORMAT.md` — doc-as-code rule
  stores parsed at startup / by the parser; edit these, not the scripts.
- `DESIGN-RECORDS.md` — binding design contracts (grammar/tokenizer/echo/
  arena/boost/mega) + the engine-coverage inventory & intentional
  simplifications (merges the former `ENGINE-GAPS.md`). Read before touching
  the front; the README-to-be.
- `TODO.md` — the front-refactor work order (approved phases 1–3); the completed
  pre-refactor backlog was migrated to `DESIGN-RECORDS.md` §14. History lives in
  `session-tools-archive/SESSION-NOTES-*.md`.
- `examples/` — sample case JSON files (`.resolved.json` = calc-stage input).
- `myteam/` — the user's **custom team database** (manual, user-authored;
  `teams.tsv` master, `teams.xlsx` derived). NOT official Smogon data — may
  disagree with `data/xy-pokemon.json` (tiers like `below RU`/`MISC`, names like
  `Mega Rayquaza`). Format/schema: `myteam/teams.tsv` header + `#` lines.
- `teams_tools/` — Python maintainers for `myteam/`: `tsv2xlsx.py`,
  `xlsx2tsv.py`, `add-row.py`, `rebuild-file.py`, `_paths.py` (no hardcoded
  paths; env `TEAMS_TSV`/`TEAMS_XLSX` override). Run from `teams_tools/`.
