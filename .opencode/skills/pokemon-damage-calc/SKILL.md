---
name: pokemon-damage-calc
description: Use for Pokemon damage / KO / accuracy / chip calculations in the pokemon-dmg-calculator repo. Triggers on queries like "Garchomp Dragon Claw vs Heatran", "does X one-shot Y", "how many hits to KO Y", "what % does Z do", or any damage-query sentence containing "vs". Owns the one-shot procedure, form the vs line → run scripts/route.mjs → paste the fenced echo+card verbatim; the repo engine and data are the ONLY source of truth. Use ONLY when a damage calc between two sides is being asked.
---

# Pokemon damage calc — how to answer a damage query

The agent is a **conversational wrapper**. Recognition, extraction, defaulting,
calculation, and card layout all live in the repo tooling. Your entire job is:

1. find the query (a sentence with `vs`),
2. run ONE tool call,
3. paste its output verbatim.

Run every command from the repo root (the directory containing `scripts/`,
`data/`, `AGENTS.md`).

## 0. Trigger (MUST OBEY)

An inquiry is a **damage query** when it asks for damage / KO / accuracy / chip
numbers between two sides ("Garchomp Dragon Claw vs Heatran", "does X one-shot
Y", "how many hits to KO Y", "what % does Z do"), phrased with `vs` splitting an
attacker side from a defender side.

- **MUST** answer with the one-shot tool: `node scripts/route.mjs "<line>"` →
  paste its fenced output verbatim.
- **MUST NOT** look up information, recall memorized stats, or import knowledge
  from other gens. The engine, scripts, data files, and docs in this repo are
  the ONLY source of truth for numbers.
- **MUST NOT** author spec JSON, echo spans, or bind tokens. Never strip filler,
  reorder, translate, expand, add, or drop a word — the converter does all of
  that.
- If the message has no `vs`, there is no answerable side split: ask the user to
  restate it as `<attacker side> vs <defender side>`.
- If a calc can't be modeled, report the limit (`DESIGN-RECORDS.md`) — never
  improvise numbers.

## 1. Find the query line

Take the user's own words — the sentence containing `vs` — and pass it
**verbatim**. Users are NOT assumed to type `uses`/`use`; `use(s)` is inert
junk, so leave it in if it is there. `input-converter.mjs` binds the tokens
(species, move, item, nature, EVs, boosts, status, weather, hazards, abilities,
`Mega`, ...) and `fill.mjs` fills every unspecified variable from
`auto-fill-defaults.md`.

Do not clean the sentence up. This is fine and expected:

- `How much does Garchomp's Dragon Claw do vs Heatran?` → passed as-is.
- `hey route this: Garchomp Earthquake vs Heatran` → passed as-is.

The echo in Block 1 shows every token the scanner bound (unbound filler simply
gets no label, and a token it cannot place shows `???`); that display is
feedback, not an error.

## 2. Run the one-shot tool

```
node scripts/route.mjs "<the query line, verbatim>"
```

This is a thin alias of `damage.mjs`'s `runQuery` — converter → echo → fill →
calc → output in ONE process. It prints one fenced block:

- **Block 1 — recognition echo:** the converter's own bindings under the tokens.
- **Block 2 — the result card** (layout owned by `scripts/output.mjs`), or on a
  hard error the echo then the error message.

There is nothing else to call. No `echo.mjs`, no spec JSON, no `fill | calc |
output` chain by hand.

## 3. Paste — verbatim, byte for byte

Paste the tool's fenced output block **exactly as printed**. Never summarize,
restate, reformat, hand-write, re-wrap, or substitute your own numbers. If a
stage errors, paste the output as-is (echo + error) — do not invent a number.

## 4. Routing notes

- `route.mjs` is THE agent route: one line in, the two-block answer out, no
  compat modes.
- `damage.mjs` is the compat card CLI (adds a `.json` matchup file path, an
  `<atk> <move> <def>` form, a REPL, and `--resolved`/`--no-echo`/`--width`);
  prefer `route.mjs` for answering queries.
- Card layout is owned by `output.mjs` and pinned in `OUTPUT-FORMAT.md` — never
  restyle a card.
- A pure name/move lookup (which pokemon have a typing, or which attacking moves
  are of a type / power / category) is NOT a damage query: use the CLI lookup
  `node scripts/damage.mjs -search pokemon <type> [type2]` /
  `node scripts/damage.mjs -search move <type> [power] [phys|special]` and paste
  its comma-separated line (or `none found`) as-is, instead of the web or memory.
  Never use a lookup to resolve or rewrite tokens on a damage line.

## Worked example

Query: `what % does Garchomp's Life Orb Dragon Claw do to Heatran?`

1. Find the line: `what % does Garchomp's Life Orb Dragon Claw do to Heatran?`
2. Run: `node scripts/route.mjs "what % does Garchomp's Life Orb Dragon Claw do to Heatran?"`
3. Paste the fenced block it prints (echo, then card).
