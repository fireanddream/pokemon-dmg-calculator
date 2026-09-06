# TODO.md — future-session backlog

Standing to-do list for sessions on the loose-English → variables (fuzzy
parse) work and parser grammar cleanups. Read at session start; tick items off
as they land.

## Done (2026-09-06)

- **Type+Plate spellings → real plate item (was `## 1`).** `aliases.md`'s
  "Type plates" table is now the doc-as-code source, parsed at startup by
  `scripts/input-converter.mjs` (first slice of the planned aliases.md parser;
  built-in table + startup warning as fallback when the md is broken, mirroring
  auto-fill-defaults.md). Each row drives both needs: (a) the bare-`plate`
  keyword picks by the move's **effective** type, and (b) a `<Type> plate`
  phrase alias is consumed by the **item-name pass** (before the ACRO `plate`
  keyword pass), so `@ Fairy Plate` and `@ Pixie Plate` bind the same Pixie
  Plate item and a literal plate never falls through to move-type resolution.
  Normal row added → **Silk Scarf** (18/18 types covered), closing the earlier
  "Normal plate = no item" question. Agreed behavior honored: bare `plate`
  consumes nothing after it; `<Type> plate` is type-first and contiguous.
  Verified: verify:damage 63/63, verify:acc 44/44; end-to-end (Fairy/Water/Fire/
  Steel/Normal plates, Pixilate effective-type, defender + combo anchoring).
  Session notes: `session-tools-archive/SESSION-NOTES-20260906-PLATE-ALIASES.md`.

## Done (2026-09-05)

- **Front split: `filler.mjs` → `input-converter.mjs` + `fill.mjs`.** The single
  natural-language front became two stages upstream of `calc.mjs`:
  `input-converter.mjs` (offline extractor: line → spec JSON, stated variables
  only) and `fill.mjs` (defaults+resolve: spec JSON → calc-input JSON, reads
  `auto-fill-defaults.md` at startup). Both the offline route and the agent
  route (loose English + `aliases.md` + `data/*.json`) emit the SAME spec JSON
  and converge on `fill.mjs` — identical stated variables ⇒ byte-identical
  cards. `damage.mjs` re-glued (compat card CLI); `calc.mjs` / `output.mjs`
  untouched. `auto-fill-defaults.md` stays the human-editable rule store.
  Docs updated (AGENTS.md dual-route section, README, OUTPUT-FORMAT.md,
  aliases.md, ENGINE-GAPS.md, TODO pointers). Verified: corpus + chaincheck
  byte-identical to the old filler chain, `verify:damage` 63/63,
  `verify:acc` 44/44. Session notes:
  `session-tools-archive/SESSION-NOTES-20260905-FRONT-SPLIT.md`.

- **Multi-move separators narrowed.** The move slot now chains exactly two
  moves with `then`, `+`, or `and` only; `,` and `;` were removed from chain
  detection (`parseMoveChain`, `scripts/input-converter.mjs`). `,`/`;` in the
  move slot now fall into single-move lookup and error (`Unknown move: EQ,
  Outrage`). Grammar sentence updated in `AGENTS.md`, `README.md`,
  `OUTPUT-FORMAT.md`. `npm run verify:damage` still 63/63.

---

## 2a. Converter redesign — arena syntax: signal word + arena-only phrase (2026-09-05, in progress)

Arena effects are MARKED, not bare words: one of the signal words `in` / `under`
/ `after` introduces an arena phrase. Collision audit against moves / abilities /
species / natures / items: `in` clean, `under` clean, `after` collides only
with the move `After You` — acceptable to mangle (never calculated; fine if it
breaks). The 1–2 words AFTER a signal word are checked ONLY against the arena
lexicon — never against move/species/ability names. That exclusivity is what
makes the dual-role words safe in the arena slot (`rain dance`, `sandstorm`,
`spikes`, `rock` mean arena things after a signal, and only there).

Arena-lexicon contents after a signal:
- Simple weather conditions: rain, sun, sand, hail (user also said "snow" —
  map per gen-6: hail; confirm during implementation).
- Full official weather names: harsh sunlight, etc.
- The moves that set weather: Rain Dance, Sandstorm, Sunny Day, Hail, etc.
- Weather-setting ability names: Drizzle, Drought, Sand Stream, Snow Warning, etc.
- Hazards: Spikes and Stealth Rock.
- Terrains: electric / grassy / misty / psychic.

Hazard + terrain forms that must resolve identically:
- Spikes layers: `"1 spike(s)"` / `"1spike(s)"` / `"spike(s)1"` / `"spike(s) 1"`
  all mean the same (1 layer); number variants 1–3.
- Stealth Rock: `"stealth rock"` or `"rock"` → same effect.
- Terrains: full name (`"electric terrain"`) or first-letter forms `"E terrain"` /
  `"Eterrain"` / `"e-terrain"` → all resolve to `electric terrain` (same for
  G/Grassy, M/Misty, P/Psychic).

Full acronym/alias expansion for arena tokens (the doc-as-code table behind the
above) is DEFERRED to a dedicated session for this piece of work.

## 3. Tokenizer recognizes every boosting move and converts it to stat boosts directly

Goal (user 2026-09-05, "implement the boost move rule"): review EVERY boosting
move in the gen-6 dex, teach the tokenizer to recognize each as a whole phrase
and convert it straight into stat-boost deltas — exactly like a stage token.
Example: "Dragon Dance Garchomp EQ vs Heatran" ⇒ Garchomp at +1 atk +1 spe
using Earthquake; Dragon Dance is a BOOST SIGNAL, never the damage move.

Where the mapping comes from: `data/moves-xy.json` — qualifying moves are
`category: "Non-Damaging"` with `target: "Self"`. CAVEAT (verified 2026-09-05):
the dex has NO structured stat-change field; the deltas live only in free-text
`description`s with inconsistent phrasing ("Raises the user's Attack and Speed
by 1." vs "Raises user's Attack, Defense, accuracy by 1." vs "Raises the user's
evasiveness by 1."). So do NOT regex the prose — curate a table (repo pattern:
doc-as-code, `aliases.md`-style) listing move → per-stat stage deltas, hand-
reviewed against the full Self/Non-Damaging move list once.

Scope rules to settle while curating:
- Include every non-damaging self-stat raiser: Swords Dance (+2 atk), Nasty
  Plot (+2 spa), Dragon Dance (+1 atk/+1 spe), Quiver Dance (+1 spa/+1 spd/
  +1 spe), Bulk Up, Calm Mind, Agility, Rock Polish, Autotomize, Shift Gear,
  Shell Smash, Hone Claws, Coil, Iron Defense, Cotton Guard, Amnesia, Tail
  Glow, Growth (note sun doubling), etc.
- Accuracy/evasion raisers map to the ACC/EVA channels the engine already
  separates: Double Team / Minimize ⇒ +eva, Coil / Hone Claws' accuracy half
  ⇒ +acc — acc/eva never change damage/KO numbers.
- EXCLUDE / decide: Acupressure (random — unmodelable), Belly Drum (max atk at
  half-HP cost — modelable as +6 atk + hpFraction ½? decide), damaging moves
  that only boost as a side effect (Power-Up Punch, Fell Stinger — real attack
  moves, stay in the damage slot), Stockpile (multi-turn), Charge / wish-y
  effects, and any move whose boost is conditional.
- A boost signal may coexist with the real move, but a query whose only move is
  a pure boost (no damaging move on the attacker side anywhere) is a hard error.

Integration (matches the redesign grammar): the boost-move phrase is consumed
like a stage boost wherever it appears in the attacker side — writes the
attacker's `boosts` (and `accStage`/`evaStage`) on the spec — and never claims
the move slot; the real attack move is recovered from the attacker side's
survivor words (extraction precedence still deferred). The phrase guard from
## 2b concern 1 still protects boost-move names that share words with other
lexicons (e.g. `Calm Mind` vs the nature `calm`).

## 2b. Converter redesign — rest of the work: free-order side tokenizer (move-safe phrase sweeps, side attribution, consume-and-MARK mechanics) — held LAST: large project

Accepted grammar contract (design session 2026-09-05, still rolling): the query
always contains a `vs` separator (a query without one is a hard error) and never
uses the `uses`/`use` word. `vs` splits two SIDES: text left of `vs` is always
the attacker, text right is always the defender. Within a side, tokens — mods,
species, the move, status, arena effects, EVs — are expected to appear in ANY
order (users won't order them; an agent MAY internally convert an inquiry into
canonical form, but that is not assumed of users, offline or online). The move
is NOT pinned to the chunk immediately left of `vs`. Attribution is therefore
structural (every token binds to the species in its own side); the extraction
difficulty is recovering each side's species and the attacker's move out of a
free-order token stream.

### Concern 1 (2026-09-05): longest-phrase precedence over single-word stripping

Solution adopted for concern 1 (single-word mod sweeps must not decapitate move
names): **at every word position, resolve the longest known phrase from any
lexicon first; a single word may only be consumed by a mod sweep (nature /
status / item / arena-word passes) when it does NOT begin a longer known
move / species / ability phrase.** Rationale + cases:
- `brave` / `calm` are only natures when they are not the prefix of the moves
  `Brave Bird` / `Calm Mind` — "Garchomp Calm Mind vs Heatran" must not have its
  move reduced to the orphan `mind`.
- `toxic` must not be eaten by the status sweep when it is the move `Toxic`.
  NOTE: RESOLVED 2026-09-05 — a status move is NEVER the queried move (see
  "Concern 2" resolution): at this point in the design, `toxic` is always a
  status token, never the move. The decapitation case only guards the general
  principle (a word-based sweep must not eat the start of a known move phrase).
- Number-anchored EV / stage stripping is inherently safe and needs no guard:
  `attack` alone (no adjacent digit/sign/`max`) never binds, so
  "Vespiquen Attack Order vs …" is already protected by adjacency.
- This is the same rule as phase 2's "resolve the greedy phrase class last" —
  phrase recognition outranks word recognition, and it must reach back into
  every word-based sweep of phase 1.

Implement as one unified longest-known-phrase matcher across the mod lexicons
with move/ability/species names consulted as a guard set. The arena-effect
marked-token syntax that makes the arena sweep trivially safe is now its own
backlog item — **## 2a** above. Still open in this design thread: the exact
phase order of the sweeps once those land.
Extraction precedence among survivors (species→ability→move, tie rules) is
deliberately DEFERRED until the tokenizer works as intended (user 2026-09-05).

### Concern 2 (agreed 2026-09-05): phase-1 must also sweep the side-bound bare-word classes

The phase-1 "remove nature, boosts, EVs, arena effects" list is not enough on
its own: status words, held items (`Life Orb`, `plate`, `no item`), orbs, and
the rest are side-bound *bare-word* classes. If they are not swept whole-phrase
in phase 1 they survive into phase 2 and pollute the "one chunk left = move"
elimination. Agreed solution: fold them into the SAME unified longest-phrase
matcher (concern 1) — status / item / orb tokens are removed as whole known
phrases, and the guard set (move/ability/species names) still protects any word
that begins a longer move phrase. This closes the gap: after the sweep the only
surviving pre-`vs` words are species + ability + move.

**RESOLVED 2026-09-05 — the `toxic` dual-role ambiguity is defused by a grammar
rule, not a matcher.** The queried move is NEVER a pure status move: the only
non-damaging moves that can appear as the attacker's move are boosting moves,
and those act as BOOST SIGNALS, not attack moves — "Dragon Dance Garchomp EQ vs
Heatran" means Garchomp at +1 atk/+1 spe using Earthquake, not Dragon Dance as
the damage move. Since `toxic` is not a boosting move, whenever the sweep sees
`toxic` it is 100% a status token; it never competes with the move slot. The
matcher therefore needs NO positional tie-break for `toxic`.

Boosting-move → boost-signal recognition is now its own backlog item:
**## 3. above**.

### Concern 3 (resolved 2026-09-05): side attribution under free token order

Side attribution is closed by the grammar contract above: `vs` splits two sides
and every token binds to the species in its own side — nothing floats
cross-side. Because tokens are free-order within a side, the extraction design
is: run a word-by-word TOKENIZER per side that eliminates noise first — natures,
number-anchored EVs/stages, status phrases, items/orbs, arena tokens — using the
unified longest-phrase matcher (concerns 1–2) so no sweep eats the start of a
move/species/ability phrase. What survives in each side is exactly the species
words + ability phrase (+ the move phrase on the attacker side only). The
defender side must yield ZERO move survivors — one appearing there is a hard
error (an early, diagnostic-friendly failure). Extraction of species / ability /
move out of the survivors, and its precedence rules, are DEFERRED until the
tokenizer works as intended (see above).

### Tokenizer mechanics: consume-and-MARK, never delete (agreed 2026-09-05)

When the tokenizer finishes sweeping a variable it must NOT delete the consumed
words (today `stripMatches` does delete). Deleting lets leftovers on both sides
glue into a new atom (e.g. deleting the middle of "rotom wash …" manufactures
the glued alias `rotomwash`, which the user never typed and then wins a species
match), lets phrase regexes bridge the deletion gap via optional whitespace, and
shifts indexes so later passes lose a stable layout. Instead REPLACE each
consumed span with a marker atom. This extends the existing precedent
(`input-converter.mjs` keeps punctuation as the reserved `\u0001` PUNCT_SENT
sentinel so no `\s*` regex crosses a comma, then collapses it to a space before
species resolution) from punctuation to every consumed token.

Refinements (user-approved):
1. Use a SINGLE reserved control char as the marker, not a printable string
   like `****` — one char is one atom, cannot be partially matched inside
   printable patterns, and cannot collide with typed text. Reuse `\u0001` for
   "consumed" or reserve a second control char so consumed ≠ punctuation if the
   two ever need distinguishing.
2. Keep a SIDE LOG mapping each marker → what it consumed (the variable it
   filled). Markers alone are indistinguishable, so without the log the "did
   recognize X" diagnostics (`describeSpec`) and the `_ignored` reconstruction
   lose the ability to say what was swept where.

### Full-name phrases must be contiguous (agreed 2026-09-06)

A full-name phrase — species / ability / move, or any multi-word alias (e.g.
`<Type> plate`) — matches only over ORIGINALLY ADJACENT words. No other token
may sit between the words of a full name; inserting one splits the phrase and
the words can never recombine. A query that would only work by bridging across
an inserted token is a hard error, not a fix-up:
- `focus plate punch` must NEVER resolve to Focus Punch + a plate — after
  `plate` is swept, the orphan words `focus` / `punch` fail extraction (hard
  error). Same for a full species or ability name split by an item / nature /
  other token.
- This makes consume-and-MARK airtight: a marker between two phrase words keeps
  them apart instead of leaving a deletion gap that whitespace-tolerant regexes
  could bridge (see tokenizer mechanics).
- Corollary for item phrases: a `<Type> plate` binding consumes those words for
  good — the same leading word cannot double as part of a move/species/ability
  (`fairy plate wind` can't mean Pixie Plate + Fairy Wind). Put the full name
  elsewhere as its own contiguous phrase.

### Recognition dedupe vs conflict (agreed 2026-09-06)

Independent passes (regex + tokenizer) may recognize the same variable
separately; no first-match-wins ordering or mutual exclusion is needed between
them. Reconciliation runs at the end, per side, per slot, on the post-alias
canonical value:
- Multiple recognitions bound to ONE slot with the SAME canonical value →
  collapse to a single binding, tolerated as user redundancy
  (`EQ garchomp earthquake vs heatran` → move = Earthquake, once).
- Different canonical values claiming the SAME slot → hard error naming the slot
  and every candidate (`EQ Fire Blast vs heatran` → `move: Earthquake vs Fire
  Blast`); never a silent overwrite or a pick. This generalizes the
  once-per-category stat rule: `252 atk 120 atk` errors, `+2 atk +2 atk`
  collapses.
- A multi-move query MUST use the chain syntax (`then` / `+` / `and`): chain
  tokens create distinct move slots, so different values across chain slots are
  legal. Different move values WITHOUT a chain token is a hard error — the
  message should hint the chain tokens.
- Same canonical move on both sides of a chain (`EQ then Earthquake`) collapses
  to a single-move card.
- All checks are per side (a species name repeats legitimately across sides in a
  mirror match); the defender side's zero-move-survivor rule (concern 3) fires
  before any of this.

