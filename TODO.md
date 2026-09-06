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

- **No-"uses" declaration landed (docs).** Project-wide (and matching the
  accepted grammar contract in ## 3 below): a query is TWO free-order SIDES
  split by `vs` — users are NEVER assumed to type `uses`/`use`, and agents must
  not add or require it. `AGENTS.md` rule 2 / rule 3 / the Agent-route
  paragraph were rewritten: the agent route (free-word query → spec JSON →
  `fill | calc | output --chat`) is now the DEFAULT; the literal
  `<atk> uses <move> vs <def>` frame is only a compat input for the
  `input-converter.mjs` / `damage.mjs` canned lines. Reference-index rows that
  pointed at a since-archived README were re-pointed at the living docs. Root
  cause of the old habit: rule 2 hard-coded the "uses" chain invocation AND
  `parseQuery` (input-converter.mjs) uses `uses` as its only delimiter, so
  every example taught the frame.

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

## 2. Agent-side recognition echo (user 2026-09-06; FIRST unfinished item)

Show the user exactly what was understood BEFORE the result card or error: echo
the inquiry input verbatim, and annotate each recognized token with its class
via an alignment ruler line underneath. Goal: the user instantly sees which
token confused the agent/converter. Implements the agent half only (the agent
already knows what it bound — it annotates the user's line while authoring the
spec; no dependency on the ## 3 tokenizer). The converter half is ## 8.

Presentation (chosen 2026-09-06 — option b, alignment ruler, one label per
token, short class-only labels):

```
Garchomp  Jolly  252 Atk   Blitz   frie  vs  Heatran
 species  nature  ev:atk   move    ???        species
```

- Echo is the input reproduced verbatim (top line) with a ruler under it: each
  recognized token gets one short label (`species` / `nature` / `ev:atk` /
  `move` / `item` / `status` / `ability` / `boost` / `level` / `arena` /
  `mega`); a token nothing could place gets `???`. EV labels include the target
  stat (`ev:atk`). Colored in real terminals (class → fixed color); the ruler
  form above is the chat-safe / code-block rendering.
- The ruler column-per-token must stay aligned to the verbatim line; tokens are
  separated so each label sits under its own token.
- Order in output: echo first, then the result card — or on a hard error, echo
  first then the error message, so what-WAS-recognized is visible before the
  confusing part (same spirit as the converter's "I did recognize:" message).
- Agent contract: emit the span map (`_spans` or equivalent: text slice + class
  + canonical value) for every token it actually bound; NEVER fabricate a
  binding — anything the agent could not place is labeled `???`. Unbound junk is
  exactly the feedback this feature exists to surface.
- What the ruler shows is per-side attribution as the agent resolved it (attacker
  tokens, move, defender tokens, plus `vs` as an unannotated separator).

## 3. Converter redesign — free-order side tokenizer (move-safe phrase sweeps, side attribution, consume-and-MARK mechanics) — large project

**STATUS: design closed 2026-09-06 → implementation in a FUTURE session** (not
started). The architecture below (## 3 "Resolved architecture") supersedes the
still-rolling phrasing in the older subsections where they contradict it; the
older text stays as the design record.

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

### Resolved architecture — two layers (agreed 2026-09-06; implement this)

The converter runs TWO layers over each side. Common words like `attack` /
`power` / `hidden` are NOT a problem: the move is bound by exact match in layer
1, and the fuzzy layer never has to guess it out of common-word residue.

**Layer 1 — exact tokenizer pass** (binds ONLY exact matches; never a guess):
- Walk the side's words; at each position try **current word + next word as the
  longest known exact phrase FIRST** (phrase-first / longest fit), then the
   single word, consume-and-MARK the winning span (## 3 consume-and-MARK
   mechanics below).
- Binds: level / `max` / EV / stat-stage / `+N` boost tokens, arena words
  (weather / terrain / hazards), **aliases** (species / move / item / stat /
  status / weather short forms), and **exact other variables by full name** —
  items, statuses, natures, abilities — **and the MOVE**: an exact alias or
  exact full move name (e.g. `eq`, `blitz`, `earthquake`) updates the move
  variable immediately.
- Single-word consumption is guarded: a word is consumed as a mod token only
  when it does NOT begin a longer known species / move / ability / alias phrase
  contiguous in the side (this is the phrase-first rule — `calm` is not a
  nature when `Calm Mind` is present, `sand` not arena when `Sand Stream` is).
  This resolves the concern-1 decapitation cases (`Brave Bird`, `Calm Mind`,
  `Sand Stream`, `Rock Slide`).
- **Multi-word / hyphen species special cases:** dex names that span more than
  one typed word or a hyphen / space forme separator resolve here by
  species-specific handling (e.g. `rotom wash` → Rotom-Wash, `landorus therian`
  → Landorus-Therian — the spaced/hyphen forme patterns generally) — NOT left to
  the fuzzy layer.
- **The tokenizer MAY fail to fill a necessary variable — that is OK and
  expected.** A missing variable is not itself an error; the residue layer below
  exists exactly to fill the gaps.

**Layer 2 — regex over the marked residue** (no deleted gaps; the residue is the
words no exact phrase claimed):
- Fuzzy recovery of what layer 1 missed: a **misspelled species name**, leftover
  words, junk-at-ends, order permutations (e.g. `Mega Venusaur`-style
  reorderings).
- Survivor precedence when layer 1 did not claim a class: **ability → item →
  move → species** (the species match claims LAST). Reasoning: the ability /
  item / move claims in layer 2 are exact phrase lookups — reliable, they take
  their words first — while the species matcher is the typo-tolerant/fuzzy one
  (species is the class users misspell most), so its guess only fills what no
  exact phrase claimed. A move is bound in layer 1 whenever an exact alias/full
  name matches, so layer 2 only reaches a move through this residue precedence;
  on the defender side the zero-move-survivor rule still fires before any move
  claim.

Rules carried over from the older notes below and still binding: full-name
contiguity (a phrase matches only over originally adjacent words), consume-and-
MARK with the side log, per-side dedupe-vs-conflict reconciliation, defender
side yields ZERO move survivors (hard error), multi-move requires a chain token,
and the mega-upgrade exact-shape rules. Layer 1's exact-move binding does NOT
undo the concern-2 resolution: a word that is a pure-status or boosting move
name (e.g. `toxic`, later `dragon dance` per ## 5) is consumed by its status /
boost-signal class, never as the queried move — the exact-move match only fires
for words no higher class claims.

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
with move/ability/species names consulted as a guard set. Arena-effect
recognition is its own backlog item — **## 4** (signals are OPTIONAL sugar,
bare arena words win-by-guard, same-slot conflicts error, explicit-beats-auto),
queued AFTER this work so it does not bloat it. Still open in this design
thread: the exact phase order of the sweeps once those land.
Extraction precedence among survivors (species→ability→move, tie rules) is
deliberately DEFERRED until the tokenizer works as intended (user 2026-09-05).
> SUPERSEDED 2026-09-06 — precedence is now **ability → item → move → species**
> inside the two-layer architecture (see "Resolved architecture" above); the
> move binds by exact alias/full-name match in layer 1 and never reaches the
> fuzzy residue as a common-word guess; the species match is the fuzzy,
> typo-tolerant claim and runs last.

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
**## 5 below**.

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
> SUPERSEDED 2026-09-06 — layer separation + survivor precedence are settled
> (see "Resolved architecture" above): layer 1 exact phrase-first tokenizer,
> layer 2 regex over the marked residue for fuzzy recovery; precedence ability →
> item → move → species (species's fuzzy, typo-tolerant claim runs last).
> Defender-side zero-move-survivor rule still binding.

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

### Mega upgrade signal: exact-shape rule + decisions (agreed 2026-09-06)

A tokenizer / species resolver must read `mega` (standalone), `mega-<base>`
(hyphen prefix), or `<base>-mega` (hyphen suffix) as an "upgrade this side's
pokemon to its Mega forme" command. Design decisions recorded in session
(2026-09-06), converter implementation NOT started:

- **Scope.** The signal binds only to the species of the side it appears in and
  is read ONLY on the combatant's leftover species words — i.e. after every
  phrase pass (nature / ability / item / status / weather). Move-slot words
  never reach species resolution, so `Mega Punch` / `Mega Kick` / `Mega Drain`
  / `Megahorn` in the move slot can never be misread as an upgrade (verified).
  Conflict inventory: ability `Mega Launcher` (two-word, space form) is
  consumed by the ability pass FIRST — its `mega` never leaks to the signal
  (verified `with Mega Launcher`). No other "mega"-containing token exists in
  the side lexicons.
- **Exact shapes only.** Standalone word `mega`, hyphen-glued `mega-` prefix,
  hyphen-glued `-mega` suffix. NO bare-substring or word-edge regex: that is
  what protects the species `Meganium` / `Yanmega` (and single-word move
  `Megahorn`) — they contain edge-adjacent "mega" with no hyphen and must keep
  resolving as themselves.
- **`mega- <x>` / `<x> -mega` with a space let it error.** The non-empty-base
  guard means a stray `mega-` / `-mega` token (nothing glued after/before the
  hyphen) is not un-glued, stays junk, and falls into the existing hard
  "could not identify a pokemon" error. Users would never type these; no
  special handling.
- **Implementation shape (proposed):** in `parseCombatant`'s species-words
  step (currently `scripts/input-converter.mjs` ~L485–565, which already hosts
  the standalone-`mega` upgrade at L554), un-glue the two exact hyphen shapes
  into space words (`mega-<x>` → `mega <x>`, `<x>-mega` → `<x> mega`) and let
  the EXISTING permutation + alias-fallback + mega rule do the rest — full
  names resolve to the forme directly, aliases resolve to the base and upgrade
  (`ttar-mega`, `mega-chomp`). No new matching code.
- **Upgrade signal on a species with NO mega forme = HARD ERROR.** Replaces the
  earlier silent no-op ("Mega Clawitzer" today resolves to base Clawitzer with
  `mega` ignored). A signal that names no existing `-Mega` forme fails loud.
- **`-X`/`-Y` formes stay explicit.** Charizard / Mewtwo have no plain
  `<base>-Mega`; the upgrade must not fabricate one. `Mega Charizard X`,
  `Charizard-Mega-X` (and same for Y) already resolve; a bare `Mega Charizard`
  keeps today's dex-order pick — unchanged, out of scope.
- **No-forme idempotence.** A token already resolving to a `-Mega` / `-Mega-X`
  / `-Mega-Y` dex entry is never re-upgraded (existing `!name.endsWith("-Mega")`
  guard covers this; keep it).

## 4. Arena grammar — bare words + OPTIONAL signals (agreed 2026-09-06; queued AFTER ## 3)

Arena words resolve to their arena condition whether typed BARE or right after
an optional signal word (`in` / `under` / `after`). Supersedes the earlier
signal-REQUIRED arena design (2026-09-05; see the historical note below) and
owns the arena lexicon, forms, guard, conflicts, and precedence. Deliberately
NOT folded into ## 3 — that section's scope is the free-order tokenizer. Queue:
AFTER ## 3; implementation lands inside / on top of ## 3's unified
longest-phrase matcher, where the guard set already lives.

Historical note — why signals are OPTIONAL, not required: signals were first
designed as REQUIRED. A 2026-09-06 review (one-liners like `charizard sun 252
atk blitz vs landot`) found the collision signals guarded against is mostly
phantom: weather/hazard/terrain-setting moves and setter abilities converge to
the same arena state, and no damaging move / species / item is named by a bare
arena word. The real ambiguities are bare arena words that prefix a longer
move/ability name (`rock` → `rock slide`, `sand` → `sand stream`) — solved by
phrase-first matching, i.e. **win by guard**, never by signal scope. Do not
resurrect the signal-REQUIRED grammar.

### Agreed semantics (user 2026-09-06)

- **Optional signal.** `in` / `under` / `after` are sugar, never required: an
  arena word is recognized with or without one, in the same pass.
- **Exclusive arena scope right after a signal.** The word (or word+nextword)
  immediately after a signal resolves ONLY against the arena lexicons — never a
  move / species / ability name. Greedy phrase-first within the lexicon: try
  the 2-word phrase (`rain dance`, `stealth rock`, `electric terrain`,
  `spikes 2`), then the single word (`sun`, `rock`). Consume signal + phrase;
  the next word starts its own resolution. A signal followed by nothing
  arena-like is INERT (consumes nothing; the signal stays junk), not an error.
- **Bare arena words win by guard, never by ordering.** A bare arena single
  word is consumed only when it does NOT begin a longer known move/species/
  ability phrase present in that side (## 3 concern-1 guard / phrase-first
  across all lexicons). That keeps `rock slide` (the move) and `sand stream`
  (the ability) intact while a lone `rock` / `sand` is arena. Ordering alone
  cannot do this — the arena pass must run BEFORE the nature/ability/item
  sweeps so `in sand stream` is arena, yet bare `sand stream` must still reach
  the ability pass. Guard resolves both; ordering is not the mechanism
  ("win by guard is the intended design").
- **Same-slot conflicts ERROR.** weather / terrain / spikes-layers are
  independent slots; two DIFFERENT explicitly typed values claiming one slot —
  within a side or across sides at the arena hoist — is a hard error naming the
  slot and both values (e.g. `weather: sun vs rain`). Duplicate same-value
  claims collapse (user redundancy). Stealth Rock is a boolean and cannot
  conflict. (Contradicts today's silent first-/last-wins behavior; must replace
  it, and the within-side second-claim overwrite.)
- **Explicit beats ability-auto (never an error).** An explicitly typed arena
  condition wins over the weather an auto-picked setter ability would set —
  already true in fill (`fillWeather` returns early when weather is typed);
  keep the setter auto-ability pick unchanged (`rain` + a Drought holder ⇒
  Arena Rain, ability still Drought).

### Arena lexicon (unchanged from the 2026-09-05 design)

- Simple weather: rain, sun, sand, hail — plus `snow` → hail (gen-6; confirmed
  2026-09-06).
- Full / official weather names: harsh sunlight, sandstorm, permanent forms,
  primal weathers (desolate / primordial / delta), etc.
- Weather-setting moves (Rain Dance, Sandstorm, Sunny Day, Hail, ...) and
  weather-setting abilities (Drizzle, Drought, Sand Stream, Snow Warning, ...)
  as arena words.
- Hazards: Stealth Rock and Spikes.
- Terrains: electric / grassy / misty / psychic.

### Forms that must resolve identically

- Spikes layers 1–3: `1 spike(s)` / `1spike(s)` / `spike(s)1` / `spike(s) 1`.
  A number-less `spikes` in an arena position = 3 layers (keeps today's
  default, now signal-independent). >3 errors as a stray number.
- Stealth Rock: `stealth rock` or `rock` → same effect.
- Terrains: full name (`electric terrain`) or first-letter forms
  (`E terrain` / `Eterrain` / `e-terrain`) → electric; same for G/M/P.

### Recorded examples

- `charizard sun 252 atk blitz vs landot` → weather sun (bare `sun`, no signal).
- `in sun rock` → `sun` via exclusive scope after `in`, then `rock` bare =
  Stealth Rock.

Full acronym/alias expansion for arena tokens (doc-as-code table) stays
DEFERRED to its own session. Collision audit of the signal words themselves
(2026-09-05): `in` / `under` clean across moves/abilities/species/natures/
items; `after` collides only with the move `After You` — acceptable to mangle
(never calculated).

## 5. Tokenizer recognizes every boosting move and converts it to stat boosts directly

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
## 3 concern 1 still protects boost-move names that share words with other
lexicons (e.g. `Calm Mind` vs the nature `calm`).

## 6. Mega upgrade token recognition (user 2026-09-06)

The tokenizer recognizes an OPTIONAL signal that upgrades a side's pokemon to
its Mega forme. Behavior contract:

- **Signal present + the side's pokemon HAS a Mega forme → silently accept** the
  upgrade (use the Mega forme).
- **Signal present + the side's pokemon is ALREADY its Mega forme → silent
  accept** (no-op; no error, no double upgrade).
- **Signal present + the side's pokemon has NO possible Mega forme → error
  message** (fail loud; do not silently fall back to the base forme).

Tracked as its own backlog item here so it is not lost; the detailed shape /
scope record lives in ## 3 "Mega upgrade signal: exact-shape rule + decisions
(agreed 2026-09-06)".

## 7. Boost additive (user 2026-09-06)

Design item: boosts are ADDITIVE — distinct recognized boost sources that
target the same stat add up rather than overwriting or multiplying. The
recorded scope of "sources" is open (stage tokens, boost-move signals per
## 5, dynamic `+N` move boosts, etc.); the exact stacking boundaries,
overflow at ±6, and interaction with the once-per-category / dedupe-vs-conflict
stat rules are to be settled in a later session.

## 8. Converter-side recognition echo (user 2026-09-06; queued LAST)

The converter's half of the recognition-echo feature (agent half = ## 2).
Queued AFTER every tokenizer / regex optimization (## 3–## 7), because its
faithful token→variable spans come from the consume-and-MARK side log that the
## 3 tokenizer rewrite introduces — building it now on today's
`stripMatches`-deletes parser means instrumenting code that is about to be
rewritten. Same presentation contract as ## 2; this item only covers wiring
the offline converter (`input-converter.mjs` / `damage.mjs`) into it once the
side log exists.


