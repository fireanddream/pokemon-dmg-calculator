---
name: pokemon-damage-calc
description: Use for Pokemon damage / KO / accuracy / chip calculations in the pokemon-dmg-calculator repo. Triggers on queries like "Garchomp Dragon Claw vs Heatran", "does X one-shot Y", "how many hits to KO Y", "what % does Z do", or any damage-query sentence containing "vs". Owns the full extraction → spec JSON → echo → fill|calc|output --chat → paste-verbatim procedure; the repo engine and data are the ONLY source of truth. Use ONLY when a damage calc between two sides is being asked.
---

# Pokemon damage calc (agent route) — how to answer a damage query

Operational manual for the DEFAULT (agent) route of the gen-6 damage
calculator in this repo. Work through it end to end BEFORE answering any
inquiry identified as a pokemon damage calc. It owns the extraction → spec →
echo → chain → paste procedure that `AGENTS.md` deliberately keeps as short
obligations.

Run every command from the repo root (the directory containing `scripts/`,
`data/`, `AGENTS.md`).

This guide is procedural glue. The LEXICONS and RULE STORES it points at are
the authoritative content (`aliases.md`, `auto-fill-defaults.md`); never copy
their tables here. Engine limits / unmodeled effects: `DESIGN-RECORDS.md`.

## 0. Trigger + do-not clause (MUST OBEY)

An inquiry is a **damage query** when the user asks for damage / KO /
accuracy / chip numbers between two sides: "Garchomp Dragon Claw vs Heatran",
"does X one-shot Y", "how many hits to KO Y", "what % does Z do". The tell is
`vs` splitting attacker (left) from defender (right) plus a move on the
attacker side — but the calc can also be phrased without a visible move shape
("how many hits to KO"). A query WITHOUT `vs` is not answerable yet — ask for
the other side rather than inventing one.

- **MUST** work through this guide end to end: extract → spec JSON → echo →
  `fill | calc | output --chat` → paste verbatim.
- **MUST NOT** go look up information, recall memorized stats, or import
  knowledge from other gens. The engine, staged scripts, data files, and docs
  in this repo are the ONLY source of truth for numbers.
- If a calc can't be modeled (dynamic-power moves, unmodelable effects), say
  so — see `DESIGN-RECORDS.md` — never improvise numbers.

## 1. Extract — user words → spec JSON

**The agent's only job is EXTRACTION: recognize tokens and bind them to
canonical values. It never fills a value the user did not state.**

The user is NOT assumed to type `uses`/`use`; never expect, add, or require
it. `use(s)` is INERT everywhere: the offline converter dropped the `uses`
frame entirely (2026-09-08) — a typed `use(s)` is silently ignored junk. Read
the query as TWO FREE-ORDER SIDES split by `vs`; every token binds to the
species in its own side.

1. **Split sides.** Text left of `vs` = attacker side, right = defender side.
2. **Bind tokens.** Walk each side's words and bind each recognized token to a
   canonical value. Resolve each class from its lexicon:
   | Token class | Where to resolve |
   | --- | --- |
   | species / move / item / stat / status / weather / type plates (names, acronyms, shorthand) | `aliases.md` tables + `data/*.json` |
   | investment (`max atk`, `252 Atk`, `188 HP`, `L50`), stat stages, `+N` dynamic-boost tokens, EV tokens | shapes & ownership: step 3 below; `max` expansions: `auto-fill-defaults.md` "EV / nature shorthand" |
   | items / `@ Item` / `plate` / `<Type> plate` / `no item`, orbs | `aliases.md` + `auto-fill-defaults.md` |
   | arena words (weather / hazards / terrain) | `auto-fill-defaults.md` (arena section, once it lands; until then `input-converter.mjs` behavior) |
   You MAY and SHOULD consult `aliases.md` (and the dex data) for anything not
   immediately apparent — acronyms and shorthand (`LO` → Life Orb, `eq` →
   Earthquake, forme short forms, name spellings). That name lookup is
   EXTRACTION, not filling.
   Keep shorthand the user typed as INTENT TOKENS (`max atk`, `plate`) — the
   EXPANSION of those is a fill rule, not yours. The card prints what got
   resolved (nature/EVs/item/ability) — wrong assumptions are visible there.
   A **self-stat-raising move** name (Dragon Dance, Swords Dance, Belly Drum,
   ... — see `aliases.md` "## Boosting moves") is a BOOST SIGNAL, never the
   move: author its per-stat stages on the attacker's `boosts` and leave the
   move slot to the damaging attack ("Dragon Dance Garchomp EQ vs Heatran" ⇒
   `boosts: { atk: 1, spe: 1 }`, `move: "Earthquake"`). Pure status words
   (`toxic`, `burned`, ...) on a side are that mon's status, never a move.
3. **Token shapes & ownership — bind numbers and boosts by SHAPE, not
   position.** A boost and an EV are both a NUMBER + a STAT WORD, adjacent, in
   EITHER order (`+2 atk`/`atk +2`, `252 hp`/`hp 252`); stat words are
   hp/atk/def/spa/spd/spe + their aliases (`aliases.md`).
   - Signed `+N`/`-N` + stat word → stat STAGE on that stat (cap ±6);
     `+N acc` / `+N eva` → accuracy / evasion stage.
   - Unsigned number + stat word → EV in that stat (cap 252). A number with NO
     adjacent stat word is NOT an EV and never becomes one — do not invent a
     stat, do not attach it to a species word, do not read it as a boost.
   - Stat-less signed `+N`/`-N` → the DYNAMIC-boost token (step 5).
   - Ownership is per SIDE, not per position: a side's numbers and boosts bind
     to that side's species no matter where the species sits in the side.
   - The echo is your self-check: every bound boost/EV gets a labeled column; a
     number you could not place shows `???` — leave it unbound, ask if it
     matters. This grammar mirrors `input-converter.mjs` (the converter and the
     agent must agree on the same token shapes).
   Worked example — `+2 atk 252 hp 252 garchomp` on a side: `+2 atk` = stage
   +2 atk on Garchomp · `252 hp` = EV 252 HP on Garchomp · the trailing `252`
   has no stat word → a HARD ERROR (an EV-magnitude number with no stat to
   assign is "very likely an EV spread missing its stat"; never guessed as
   atk/spe, never silent `???`).
4. **Author the spec JSON** — the same record `input-converter.mjs` emits.
   Shape:
   ```json
   {
     "attacker": { "name": "Garchomp", "item": "Life Orb", "nature": "Jolly",
                   "evs": { "atk": 252 } },
     "defender": { "name": "Heatran", "evs": { "hp": 252 } },
     "move": "Dragon Claw"
   }
   ```
   Include ONLY what the user said. NEVER add EVs, natures, items, status,
   stages, weather, abilities, or boosts the user didn't type, and never
   pre-compute what a default would be — `fill.mjs` consults
   `auto-fill-defaults.md` and fills every unspecified variable itself (level,
   nature, IVs, EVs, ability pick, orb→status, weather setters, `max atk`
   expansion, boost placement). The ONLY times the agent may add a NON-DEFAULT
   token the user's intent requires (e.g. a genuinely itemless mon needs
   `no item`) are listed in `auto-fill-defaults.md` → "The only times the agent
   adds to the spec".
   If a token can't be carried to a spec, or a choice the front can't infer is
   needed — ASK the user instead of guessing.
5. **Stat-less `+N`/`-N` is a dynamic-boost token, not a stat choice.** A lone
   `+1`/`-2` on a side (e.g. "Ferrothorn +1") means "boost the move's stat /
   the stat the move targets". Transcribe it as the spec's `_plusBoost` token
   (bare `+N`/`-N` — the converter reads a stat-less signed number as dynamic
   anywhere; there is no `+N hp` spelling);
   `fill.mjs` decides WHICH stat (attacker: the move's stat; defender: the stat
   the move targets). NEVER pick the stat yourself — that is a fill rule.
   An unbound stat word (e.g. a lone `hp`) or an unbound unsigned EV-magnitude
   number (e.g. a lone `252`) is a HARD ERROR — HP can't take a stage, so
   `+2 hp` without an EV number after `hp` fails loud.

## 2. Recognition echo (MUST, before any card or error)

Show what was understood BEFORE the result: render the user's query with a
class label under every token you bound, then paste that block verbatim ahead
of the result card — or on a hard error, ahead of the error message.

```
node scripts/echo.mjs --line "<the user's query, verbatim>" --spans '<spans>' --chat
```

- `--spans` is one binding per token you ACTUALLY bound: a whitespace-atom
  range into the raw line plus a short class label (`species`/`nature`/
  `ev:atk`/`move`/`item`/`status`/`ability`/`boost`/`level`/`arena`/`mega`).
  A token you could NOT place is labeled `???` (feedback to the player, not a
  blocker — the query still runs). NEVER fabricate a binding.
  ```json
  [{"atoms":[0,0],"label":"species"},{"atoms":[5,6],"label":"ev:atk"},
   {"atoms":[7,8],"label":"move"}]
  ```
- `max <stat>` shorthand binds as the stat's EV class, one unit spanning the
  phrase, anchored under its first word: `max atk` → `ev:atk`, `Max SpA` →
  `ev:spa`. There is NO `max` label class. A stray token the shorthand leaves
  unbound (a redundant bare `252` beside `max spa`) is `???` — never relabel it
  as an EV.
- `vs` and `@` are unannotated (no span). Multi-word tokens span their atoms;
  the label anchors under the FIRST word (layout handled by the renderer).
- Echoes wider than 100 columns wrap into word-line/ruler-line row groups
  automatically (`--width N` to change; a value <= 0 never wraps). The renderer
  never splits a word, a glued binding, or a label across a row.
- Layout contract, span schema, CLI: the `scripts/echo.mjs` header. Design
  record + full layout rules: `DESIGN-RECORDS.md` "Recognition echo".
  Regression guard: `npm run verify:echo`.

## 3. Calculate + render — run the staged chain (one chain per distinct query)

```
<spec JSON> | node scripts/fill.mjs - | node scripts/calc.mjs - | node scripts/output.mjs - --chat
```

- `fill.mjs` resolves every unspecified variable and validates names against
  the dex (fails loud on unknowns). `calc.mjs` is pure math. `output.mjs`
  renders the result card; `--chat` wraps it in a fenced code block — that
  block is the deliverable.
- NEVER hand-compose a resolved calc-input record for `calc.mjs`; always go
  through `fill.mjs` so identical stated variables ⇒ byte-identical cards.
- Two-move combos, turn-by-turn blocks, accuracy/evasion display: see
  `OUTPUT-FORMAT.md`.

## 4. Paste — verbatim, byte for byte

Echo block first (step 2), then the result-card block (step 3). Never
summarize, restate, reformat, hand-write, or re-wrap a card, and never
substitute your own numbers for the output. If a stage errors, paste the echo
block then report the error message — never substitute your own numbers.

## 5. Routing notes

- The OFFLINE converter route (`input-converter.mjs` / `damage.mjs`) reads the
  same free-order `vs`-split grammar (no `uses` anywhere). It does NOT produce
  the recognition echo yet (accepted; TODO build-order step 7 — converter
  echo). Use the agent route above whenever a query reaches a chat window.
- Card layout is owned by `output.mjs` and pinned in `OUTPUT-FORMAT.md` — never
  restyle a card.

## Worked example

Query: `Garchomp @ Life Orb Jolly 252 Atk Dragon Claw vs Heatran 252 HP`

1. Sides: attacker `Garchomp @ Life Orb Jolly 252 Atk Dragon Claw`, defender
   `Heatran 252 HP`. Tokens: species Garchomp / item Life Orb / nature Jolly /
   EV 252 Atk / move Dragon Claw — species Heatran / EV 252 HP.
2. Spec JSON:
   ```json
   {"attacker":{"name":"Garchomp","item":"Life Orb","nature":"Jolly","evs":{"atk":252}},
    "defender":{"name":"Heatran","evs":{"hp":252}},"move":"Dragon Claw"}
   ```
3. Echo spans: species[0,0] item[2,3] nature[4,4] ev:atk[5,6] move[7,8]
   species[10,10] ev:hp[11,12] → paste `node scripts/echo.mjs ... --chat`
   output.
4. Chain: spec | `fill.mjs` - | `calc.mjs` - | `output.mjs` - `--chat` → paste
   block.
