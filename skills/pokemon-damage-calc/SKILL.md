---
name: pokemon-damage-calc
description: Use for Pokemon damage / KO / accuracy / chip questions. Triggers on a damage-query sentence, with a `vs` line ("Garchomp Dragon Claw vs Heatran", "how many hits to KO Y") or a calc intent without one ("can Vivillon kill Garchomp with Hurricane?"). A `vs` line goes straight to scripts/route.mjs (paste the fenced echo+card verbatim); a calc intent with no `vs` gets a request to restate it as `<attacker> <move> vs <defender>`. The repo engine and data are the ONLY source of truth for numbers.
---

# Pokemon damage calc — how to answer a damage query

The agent is a **conversational wrapper**. For a message containing `vs`, your
entire job is:

1. find the sentence with `vs`,
2. run ONE tool call,
3. paste its output verbatim.

A message with **no `vs`** follows §0: answer a general question yourself, or
ask for a `vs` line when a damage calc was intended.

Run every command from the repo root (the directory containing `scripts/` and
`data/`).

## 0. Routing (MUST OBEY)

Use your own judgment to decide whether the message is a **damage calc** — a
request for a damage / KO / accuracy number between two sides. A literal `vs` is
a strong signal but not the only one. Then route:

- **`vs` line → the CLI.** A message with `vs` splitting an attacker side from a
  defender side ("Garchomp Dragon Claw vs Heatran") is a damage query. Answer
  with the agent route: `node scripts/route.mjs "<line>"` → paste its fenced
  output verbatim.
- **Calc intent, no `vs` → ask for the `vs`.** If the user asks for a damage /
  KO / accuracy number between two sides but wrote no `vs` ("can Vivillon kill
  Garchomp with Hurricane?"), reply asking them to restate it as
  `<attacker side> <move> vs <defender side>`. Do NOT answer the number from
  memory, and do NOT go research it.
- **Anything else → answer it yourself.** A question that is not a between-two-
  sides damage calc ("does Vivillon learn Hurricane?") is a general question:
  answer it from your own knowledge. Do NOT call `route.mjs`.

For the `vs` path only:

- **MUST NOT** extract, bind, or infer anything yourself — you are NOT the
  parser. Do not identify the species / move / item / nature / EVs / boosts /
  status / weather / ability, do not expand shorthand, and do not fill defaults.
  Do not author spec JSON or echo spans, and never strip filler, reorder,
  translate, expand, add, or drop a word. Locate the sentence containing `vs`
  and hand it to the tool untouched.
- **MUST NOT** look up information, recall memorized stats, or import knowledge
  from other gens. The engine, scripts, data files, and docs in this repo are
  the ONLY source of truth for numbers.
- If a calc can't be modeled, report the limit (`design.md`) — never improvise
  numbers.

## 1. Find the query line (a `vs` message)

No `vs`? Stop here (§0): answer a general question yourself, or ask for a `vs`
line when a damage calc was intended. Otherwise locate the
sentence containing `vs` and pass it straight to `route.mjs` — you extract
nothing. `input-converter.mjs` binds the tokens (species, move, item, nature,
EVs, boosts, status, weather, hazards, abilities, `Mega`, ...) and `fill.mjs`
fills every unspecified variable from `auto-fill-defaults.md`; that work belongs
to the tool, not to you. Users are NOT assumed to type `uses`/`use`; `use(s)` is
inert junk, so leave it in if it is there.

Do not clean the sentence up. This is fine and expected:

- `How much does Garchomp's Dragon Claw do vs Heatran?` → passed as-is.
- `hey route this: Garchomp Earthquake vs Heatran` → passed as-is.

The echo in Block 1 shows every token the scanner bound (unbound filler simply
gets no label, and a token it cannot place shows `???`); that display is
feedback, not an error.

## 2. Run the agent route

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

## Worked examples

**A `vs` line → run the tool.**

`Garchomp Dragon Claw vs Heatran`

1. Find the line: `Garchomp Dragon Claw vs Heatran`.
2. Run: `node scripts/route.mjs "Garchomp Dragon Claw vs Heatran"`.
3. Paste the fenced block it prints (echo, then card).

**Calc intent, no `vs` → ask for the `vs`.**

`can Vivillon kill Garchomp with Hurricane?`

This asks for a KO number between two sides but has no `vs`. Ask the user for
the `vs` line — do NOT run the tool, and do NOT answer from memory or the web:

> Please restate it with `vs`, e.g. `Vivillon Hurricane vs Garchomp`.

**Not a damage calc → answer it yourself.**

`does Vivillon learn Hurricane?`

A general question, not a between-two-sides number. Answer it from your own
knowledge; do not call `route.mjs`.
