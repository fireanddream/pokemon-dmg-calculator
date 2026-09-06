# AGENTS.md — pokemon-dmg-calculator

Gen 6 (XY/ORAS) Pokemon **damage calculator**; the whole engine, dex data, and
docs ship in this repo. This file is injected whole at every session start, so
it deliberately holds only the **always-on rules** (MUST OBEY below) plus an
**index**. The deep reference prose lives in the repo docs — read the index,
then the doc you need; never try to memorize it all.

Pipeline: an **agent** (free-word query → spec JSON — users are NOT assumed to
type `uses`/`use`) or `input-converter.mjs` (compat extractor that only accepts
the literal `<atk> uses <move> vs <def>` frame, kept for canned / corpus lines)
→ `scripts/fill.mjs` (defaults + resolve: spec JSON → calc-input JSON; rules
parsed from `auto-fill-defaults.md`) → `scripts/calc.mjs` (pure math) →
`scripts/output.mjs` (result card; OWNS the layout). `damage.mjs` is a thin
compat card CLI gluing the same chain.

## MUST OBEY — identity, answering a query, defaults policy

**1. This is a Pokemon damage calculator, and all the tools are here.** The
engine, staged scripts, data files, and docs are the ONLY source of truth for
damage / KO / accuracy / chip numbers. Do NOT go off doing your own research
(no web lookups, no memorized stats, no knowledge from other gens). If a calc
can be modeled, run the staged pipeline; if it can't, report that limit rather
than improvising numbers.

**2. A damage input is answered from the output script — paste its code block
verbatim, no thinking, no reformatting.** Whenever the user gives a damage /
KO / accuracy / chip calc ("Garchomp Dragon Claw vs Heatran", "does X one-shot
Y", "how many hits to KO", "what % does Z do"):

1. Read the query as two SIDES split by `vs`: text left of `vs` is the
   attacker, text right is the defender, and the move is a word/phrase on the
   attacker side. The user does NOT type `uses`/`use` — never expect it, add
   it, or require it. The literal `<atk> uses <move> vs <def>` frame exists
   only as a compat input for the `input-converter.mjs` / `damage.mjs` canned
   lines. A query without `vs` is not answerable yet — ask for the other side
   rather than inventing one.
2. Author the spec JSON yourself — the same record `input-converter.mjs`
   would emit — from ONLY what the user said: canonical dex names via
   `aliases.md` + `data/*.json`, shorthand kept as intent tokens (`max atk`,
   `plate`, `LO`, a lone `+N` as `boosts`). Do not invent or fill anything
   they didn't type; if the wording can't be carried to a spec, ask instead
   of guessing. Tokens and defaults: `auto-fill-defaults.md` → "The only times
   the agent adds to the spec".
3. Run the staged chain on that JSON (one chain per distinct query):

   ```
   <spec JSON> | node scripts/fill.mjs - | node scripts/calc.mjs - | node scripts/output.mjs - --chat
   ```

   `--chat` wraps the OUTPUT-FORMAT card in a fenced code block — that block is
   the deliverable. Canned/compat equivalent for a literal frame line: `node
   scripts/input-converter.mjs "<atk> uses <move> vs <def>"` feeding the same
   `fill | calc | output --chat` tail; `node scripts/damage.mjs "<atk> uses
   <move> vs <def>"` prints the same card for a quick local look. Use the
   staged `--chat` form whenever the result goes into a chat window.
4. Paste the returned code block back **verbatim, byte for byte**. Never
   summarize, restate, reformat, hand-write, or re-wrap a card, and never
   substitute your own numbers for the output. If a stage errors, report the
   error — never substitute your own numbers.

**3. Defaults policy: `fill.mjs` fills the defaults — you never do.**
`fill.mjs` resolves every unspecified variable itself (level, nature, IVs, EVs,
held item, status, stages, ability, weather, ...). Therefore:

- **Pass the user's words through unchanged.** Never add EVs, natures, items,
  boosts, status, or weather the user didn't type — that double-applies a
  default or invents an assumption. "Garchomp Dragon Claw vs Heatran" ⇒
  attacker Garchomp, move Dragon Claw, defender Heatran — nothing added.
- The card prints what was resolved (nature, EVs, item, ability) — a wrong
  assumption is visible there, so don't pre-empt the front by guessing.
- The only time you add to the spec is when the user's intent contradicts a
  default and their wording can't carry it (e.g. a truly itemless mon needs the
  `no item` token). **`auto-fill-defaults.md` → "The only times the agent adds
  to the spec"** lists these cases.
- If a query can't be translated, or needs a choice the front can't infer, ask
  the user instead of guessing.

**Agent route — the DEFAULT route.** Users speak free-order sides split by `vs`
and never type `uses`; so for every query, resolve names to canonical dex
entries via `aliases.md` + `data/*.json`, keep shorthand as intent tokens
(`max atk`, `plate`), and author the SAME spec JSON the converter would emit.
You may read a lone `+N`/`-N` (e.g. `Ferrothorn +1`) as an explicit
`boosts.{stat}` on the first move's stat — the offline converter rejects a
stat-less signed number, so this is agent-only. Pipe the spec JSON through
`fill.mjs | calc.mjs | output.mjs`; never hand-compose a resolved calc-input
record for `calc.mjs`. `fill.mjs` is the shared deterministic stage: identical
stated variables ⇒ byte-identical cards. If the wording can't be carried to a
spec, or needs a choice the front can't infer, ask the user instead of guessing.

## Reference index

Read the section you need from the file that owns it; never memorize these.

| Topic | Where it lives |
| --- | --- |
| Query tokens & side shapes: word/phrase lexicons live in `input-converter.mjs` passes; name/acronym tables (species, move, item, stat, status, weather, type plates) in **`aliases.md`** (doc-as-code); investment/stat-stage/arena token rules + "only times the agent adds to the spec" in **`auto-fill-defaults.md`** | `aliases.md` · `auto-fill-defaults.md` · `input-converter.mjs` |
| Defaults the engine applies, EV/nature shorthands, orbs, weather setters, ability pick order, the only times the agent adds to the spec | **`auto-fill-defaults.md`** (doc-as-code, parsed by `fill.mjs`) |
| Two-move combos · turn-by-turn sim | **`OUTPUT-FORMAT.md`** "Two-move combos (fixed sequence)" · "Turn-by-turn block" |
| Accuracy/evasion: modeled SEPARATELY from damage — acc tokens never change damage/KO numbers (`verify:damage` stays byte-identical to the oracle); engine `src/accuracy.ts`, `npm run verify:acc` | **`OUTPUT-FORMAT.md`** "Chance to hit all attacks" + `src/accuracy.ts` |
| Dynamic-power (variable BP) moves + what the CLI can/can't model | **`ENGINE-GAPS.md`** |
| Result-card contract (layout owned by `output.mjs`) | **`OUTPUT-FORMAT.md`** |
| Backlog / approved work / open threads | **`TODO.md`** |
| Repo layout, team DB, tools | "Project layout" below · `myteam/` · `teams_tools/` |

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
