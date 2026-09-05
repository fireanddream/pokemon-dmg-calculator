# AGENTS.md — pokemon-dmg-calculator

Gen 6 (XY/ORAS) Pokemon **damage calculator**; the whole engine, dex data, and
docs ship in this repo. This file is injected whole at every session start, so
it deliberately holds only the **always-on rules** (MUST OBEY below) plus an
**index**. The deep reference prose lives in the repo docs — read the index,
then the doc you need; never try to memorize it all.

Pipeline: `input-converter.mjs` (natural-language line → spec JSON) OR an
**agent** (loose English → spec JSON) → `scripts/fill.mjs` (defaults + resolve:
spec JSON → calc-input JSON; rules parsed from `auto-fill-defaults.md`) →
`scripts/calc.mjs` (pure math) → `scripts/output.mjs` (result card; OWNS the
layout). `damage.mjs` is a thin compat card CLI gluing the same chain.

## MUST OBEY — identity, answering a query, defaults policy

**1. This is a Pokemon damage calculator, and all the tools are here.** The
engine, staged scripts, data files, and docs are the ONLY source of truth for
damage / KO / accuracy / chip numbers. Do NOT go off doing your own research
(no web lookups, no memorized stats, no knowledge from other gens). If a calc
can be modeled, run the staged pipeline; if it can't, report that limit rather
than improvising numbers.

**2. A damage input is answered from the output script — paste its code block
verbatim, no thinking, no reformatting.** Whenever the user gives a damage /
KO / accuracy / chip calc ("<attacker> uses <move> vs <defender>", "does X
one-shot Y", "how many hits to KO", "what % does Z do"):

1. Translate the user's words into the spec line(s) using only what they said.
   See **README → "The spec grammar"** for the tokens. Do not invent or fill
   anything they didn't type.
2. Run the staged chain (one chain per distinct query):

   ```
   node scripts/input-converter.mjs "<atk> uses <move> vs <def>" | node scripts/fill.mjs - | node scripts/calc.mjs - | node scripts/output.mjs - --chat
   ```

   `--chat` wraps the OUTPUT-FORMAT card in a fenced code block — that block is
   the deliverable. `node scripts/damage.mjs "<spec>"` alone prints the same
   card for a quick local look; use the staged `--chat` form whenever the result
   goes into a chat window.
3. Paste the returned code block back **verbatim, byte for byte**. Never
   summarize, restate, reformat, hand-write, or re-wrap a card, and never
   substitute your own numbers for the output. If a stage errors, report the
   error — never substitute your own numbers.

**3. Defaults policy: `fill.mjs` fills the defaults — you never do.**
`fill.mjs` resolves every unspecified variable itself (level, nature, IVs, EVs,
held item, status, stages, ability, weather, ...). Therefore:

- **Pass the user's words through unchanged.** Never add EVs, natures, items,
  boosts, status, or weather the user didn't type — that double-applies a
  default or invents an assumption. "Garchomp vs Heatran" ⇒
  `"Garchomp uses <move> vs Heatran"` with nothing added.
- The card prints what was resolved (nature, EVs, item, ability) — a wrong
  assumption is visible there, so don't pre-empt the front by guessing.
- The only time you add to the spec is when the user's intent contradicts a
  default and their wording can't carry it (e.g. a truly itemless mon needs the
  `no item` token). **`auto-fill-defaults.md` → "The only times the agent adds
  to the spec"** lists these cases.
- If a query can't be translated, or needs a choice the front can't infer, ask
  the user instead of guessing.

**Agent route (loose English).** For typo-laden, non-grammar input (`garcomp`,
missing `uses`, bare `LO`), resolve names to canonical dex entries via
`aliases.md` + `data/*.json`, keep shorthand as intent tokens (`max atk`,
`plate`), and write the SAME spec JSON the converter would. You may read a lone
`+N`/`-N` (e.g. `Ferrothorn +1`) as an explicit `boosts.{stat}` on the first
move's stat — the offline converter rejects a stat-less signed number, so this
is agent-only. If the wording can't be carried by the grammar, author the spec
JSON directly and pipe it through `fill.mjs | calc.mjs | output.mjs`. Never
hand-compose a resolved calc-input record for `calc.mjs`. `fill.mjs` is the
shared deterministic stage: identical stated variables ⇒ byte-identical cards.

## Reference index

Read the section you need from the file that owns it; never memorize these.

| Topic | Where it lives |
| --- | --- |
| Query grammar: side-spec shape, tokens, item/move/species acronyms, investment shorthands, stat-stage + acc/eva tokens, hazards, status/weather/terrain words | **README → "The spec grammar"** |
| Defaults the engine applies, EV/nature shorthands, orbs, weather setters, ability pick order, the only times the agent adds to the spec | **`auto-fill-defaults.md`** (doc-as-code, parsed by `fill.mjs`) |
| Full alias/acronym tables (species, move, item, stat, status, weather, type plates) | **`aliases.md`** (doc-as-code, hand-editable) |
| Two-move combos · turn-by-turn sim | README sections (same titles) |
| Accuracy/evasion: modeled SEPARATELY from damage — acc tokens never change damage/KO numbers (`verify:damage` stays byte-identical to the oracle); engine `src/accuracy.ts`, `npm run verify:acc` | README + OUTPUT-FORMAT.md "Chance to hit all attacks" |
| Dynamic-power (variable BP) moves + what the CLI can/can't model | **`ENGINE-GAPS.md`** |
| Result-card contract (layout owned by `output.mjs`) | **`OUTPUT-FORMAT.md`** |
| Backlog / approved work / open threads | **`TODO.md`** |
| Repo layout, team DB, tools | README · `myteam/` · `teams_tools/` (below) |

**Card layout is not the agent's job.** The result-card layout is implemented
once in `scripts/output.mjs` and pinned in `OUTPUT-FORMAT.md`. The agent never
composes, restyles, reformats, or explains a card's layout — answer a query by
pasting the output script's block verbatim (rule 2). When output rules change,
edit `output.mjs` and `OUTPUT-FORMAT.md` together, never AGENTS.md.

## Project layout (short)

- `data/` — generated Smogon XY datasets (`xy-pokemon.json`, `moves-xy.json`,
  `abilities-xy.json`, `natures-xy.json`, `types-xy.json`, `_raw-xy-basics.json`
  = raw dump; regenerate, don't hand-edit).
- `src/` — TypeScript library: `types.ts`, `statdex.ts` (loader/lookups),
  `stat-calc.ts`, `type-chart.ts`, `damage-calc.ts` (gen-6 damage engine).
- `scripts/` — staged pipeline: `input-converter.mjs` (extractor; also hosts the
  shared front lexicon fill.mjs imports) → `fill.mjs` (defaults+resolve) →
  `calc.mjs` (pure calc) → `output.mjs` (card renderer); plus `damage.mjs`
  (compat card CLI), data-gen and verify scripts.
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
