# TODO.md — future-session backlog

Standing to-do list for sessions on the loose-English → variables (fuzzy
parse) work and parser grammar cleanups. Read at session start; tick items off
as they land.

## Done (2026-09-08)

- **Seam F RESOLVED + IMPLEMENTED (rules set one-by-one 2026-09-08; session
  notes: SESSION-NOTES-20260908-SEAM-F.md).** The stat-less signed-number /
  dynamic-boost rules were re-adjudicated because earlier days left
  contradicting designs. Locked:
  - **R1 — any stat-less signed `+N`/`-N` is the dynamic boost** (`_plusBoost`,
    resolved onto the move's stat by fill). The converter no longer hard-errors
    on `Garchomp +2 uses …`; a signed number only fails to be dynamic when it
    combines with an adjacent stageable stat (`+2 atk` stage). The `+N hp`
    anchor spelling is dead.
  - **R2 — `+N` force-combines with the next stat word.** Stageable stat
    (`atk/def/spa/spd/spe`, acc/eva) → stage. HP is never stageable, so `+N hp`
    survives ONLY when hp is doing EV duty (`+2 hp 252` = dynamic `+2` + EV 252
    HP); `+2 hp` with no EV number after `hp` — and the mirror `hp +2` — HARD
    ERROR (never the old `[ignored: hp]` leak, never a silent dynamic fallback).
  - **R3 — the `+N ,` punctuation-boundary branch is DELETED** (dead once R1 +
    the global comma rule made every stat-less `+N` dynamic).
  - **R4 — unbound stat WORD and unbound unsigned NUMBER are both hard errors**
    (`Garchomp hp uses …`, `Garchomp 252 uses …`). This supersedes the older
    "redundant bare 252 → `???`" echo convention (AGENT-GUIDE step 3 example
    fixed) and the `needStat` signed-number error text. Errors name every stray
    and per-kind hint; `strayNumberError` → `strayTokenError`.
  - **R4 collateral — stat lexicons carry SHORT aliases only.** Removed
    `special`→spa and `spdefense`→spd from the stat/max maps (user: "we should
    not even have the full names in lookup" for the two special stats, and HP
    has no `hit point`); `special attack`/`special defense` two-word phrases
    were never added. `252 special defense` no longer silently binds SPA — it
    errors like any unbound number. `atk/def/spe/accuracy/evasion` keep their
    one-word names. aliases.md stat table updated.
  - Regression: corpus 31/31 + the 16-case smoke above, verify:damage 63/63,
    verify:acc 44/44, verify:echo 6/6.

- **Seam E RESOLVED + IMPLEMENTED: spikes lexicon locked, comma = GLOBAL hard
  separator, dedupe confirmed GLOBAL (all user-confirmed 2026-09-08).** The
  number-led arena claim is exactly the spikes lexicon. Final grammar: bare
  `spike` = 1 layer / `spikes` = 3; a SPACE-separated count either order wins
  (`2 spikes` / `spikes 2` / `spike 1`); x-notation both orders both spellings
  (`spikes x2` / `x2 spikes` / `spikes 2x` / `2x spikes`, `×`); counts
  value-gate 1-3 (`4 spikes` strands → bare-number error, never a claim);
  **glued digit forms (`1spike`, `spikes2`) are noise, NOT recognized**; the
  `N layers of (to) spikes` spelling is OUT OF SCOPE (closes the seam-A
  4-word tension; the sweep stays bound-3). **Comma breaks EVERY recognition
  rule** — no claim/phrase/adjacency of any kind may span one (generalized
  from the claimMoves/EV decision). **Dedupe is global:** same slot + same
  value from several scans = silent collapse; different values = hard error
  naming the slot and every candidate (`conflicting spikes layers: 2 vs 3`).
  `spike`/`spikes` is never a move (hazard-setting move, seam G / ## 4).
  IMPLEMENTED in `input-converter.mjs` `spikePass` (rewritten: space/x forms,
  bare singular=1/plural=3, value gate, dedupe reconcile; old glued+layers
  regex removed). Docs: ## 4 forms bullet SUPERSEDED, auto-fill-defaults
  hazard row. Verified: 20-case smoke + verify:damage 63/63, verify:acc 44/44,
  verify:echo 6/6. Seam E verbatim: SWEEP-REVIEW session notes. (Seam F done
  above; the seams A–I sweep is now fully resolved.)

## Done (2026-09-07)

- **Comma adjacency RESOLVED: comma = hard lookahead stop; `claimMoves`
  patched.** The boost/EV-review open thread is closed (user-confirmed): a `,`
  is ALWAYS an adjacency-breaker, never inert whitespace — `+2, atk 252` is a
  stat-less dynamic `+2` + a fresh EV `252 atk` (no strand; the no-comma
  `+2 atk 252` still errors). `claimMoves` (`scripts/input-converter.mjs`) now
  marks `,.;/\|` as `\u0001` boundaries so no ≤3-word phrase slice can span
  one: `Shadow, Ball` / `Focus, Punch` no longer resolve (0 claims → error);
  the walk still steps over markers, so `EQ, Outrage` / `eq,outrage` /
  `eq then Outrage` / `eq+outrage` chains are byte-unchanged. Regression:
  verify:damage 63/63, verify:acc 44/44, verify:echo 6/6. Recorded in
  `session-tools-archive/SESSION-NOTES-20260907-SWEEP-REVIEW-AI.md` (the
  pre-C thread).

- **Master hyphen rule IMPLEMENTED (idea note 3) — minus exception + deferrals.**
  `scripts/input-converter.mjs` gains `hyphenToSpace()` (exported), applied at
  the top of both `parseCombatant` and `parseQuery` (before ANY tokenization /
  pass / `uses`-frame split). Every hyphen in the input becomes a space with ONE
  exception — a minus sign glued to a boost/stage number (`-2 atk`, `atk -2`)
  stays a minus (a hyphen starting a token whose next char is a digit is kept;
  nothing else survives). No ranges (`+2-1`) or other digit-adjacent hyphens are
  protected — user-confirmed: "minus AND a single 1-6 number. No other case."
  What it fixes, verified by smoke + suites: `mega-Aggron`/`Aggron-Mega`,
  `Ho-Oh`, `Porygon-2`, `Rotom-Wash` all resolve as species; `X-Scissor` as a
  move; `@ Life-Orb` binds the item; **`no-item` → `no item`** (closes ## 9's
  spelling-breadth gap for free); `2-spikes` → `spikes 2` layers;
  `turn-by-turn` still detected (normalized before the flag test). Dex canon
  lookup keys are untouched — `norm()` still folds hyphens; the rule only
  normalizes TYPED lines. Regression: `verify:echo` 6/6, `verify:damage` 63/63,
  `verify:acc` 44/44. DEFERRED (not part of this slice): (a) the alias-list
  cleanup idea note 3 describes (hyphen/spaced duplicate forms) — audit later,
  no hyphenated alias KEYS exist today; (b) the 2-word sweep × EV/boost ×
  guard interactions are a separate session — see the review below.

- **EV/boost bidirectional review recorded (thought-1 review).** Against the
  ## 3 free-order sweep, the both-orders EV/stage binding is NOT obsolete — it
  is a 2-word shape phrase recognized from whichever word sits leftmost. Four
  implementation notes to honor when the tokenizer lands: (1) `+N hp` dynamic
  half-eats its phrase today (`hp` leaks into `_ignored`) — consume the whole
  phrase; (2) the `+N ,` punctuation-dynamic rule is obsolete — in free-order
  grammar ANY stat-less signed number is the dynamic token (`AGENT-GUIDE` step
  5), `+N hp` stays only as the explicit converter spelling; (3) stray
  stat-less numbers: converter hard-errors today while the agent grammar says
  `???` junk — reconcile under ## 10 junk-tolerance, and NEVER let a number
  reach the fuzzy species regex; (4) EV/boost should be ONE phrase lexicon in
  the longest-fit matcher, not a higher-priority pre-pass (`2 spikes` shows the
  phrase must win from the number's position). Also found: `fill.mjs`
  `applyMaxFlags` expands only ONE max flag (`else-if`), so `max atk max spa`
  silently drops `max atk` — contradicts idea-note-2 "max on different stats
  coexist"; parser also lacks `max spe`/`max hp`. Session notes:
  `session-tools-archive/SESSION-NOTES-20260907-HYPHEN-RULE.md`.
  > Notes (1) and (2) SUPERSEDED 2026-09-08 by seam F (see Done 2026-09-08):
  > the `+N hp` phrase is NOT kept — the spelling is dead and unbound `hp`
  > after a boost HARD-ERRORS (never leaks, never "eat the whole phrase"); and
  > the "`+N hp` = explicit converter spelling" premise is gone because stat-less
  > `+N` alone is dynamic everywhere (R1). Notes (3) and (4) still stand for
  > the ## 3 tokenizer session.

- **2-word sweep review begun — seams A, B, & C RESOLVED; pre-C thread
  complete.** Seam-by-seam review of the ## 3 layer-1 sweep (resume point: the
  **boost-vs-EV sweep review**, before seam C) recorded VERBATIM in
  `session-tools-archive/SESSION-NOTES-20260907-SWEEP-REVIEW-AI.md`. Seam A
  (window length) settled: dex fits a 3-word window — longest recognized
  phrase ≡ **"the 3-word sweep"**, no unbounded matcher; species stay on the
  residue/permutation resolver. Seam B (guard) settled: guard = same-position
  longest-fit, single-word class claims only when no 2–3-word phrase starts
  there (one depth-3 first-word trie; EV/boost/level/`max` fold into the same
  fit — no separate first pass; no lookbehind). Species join NEITHER the sweep
  NOR the guard: the full 503-species scan shows the only interior collisions
  are the deferred forme-word set (`pikachu rock star` hard-errors today;
  `arceus rock`/`arceus poison`/`genesect burn` silently mis-resolve;
  `arceus electric`/`arceus psychic` work today but break once bare terrain
  claims land) — documented, revisit post-tokenizer, at-worst alias escape.
  Seam C (1-word cross-lexicon ties) RESOLVED: the full 1-word scan finds
  exactly 6 colliding words, ALL class-token × full-move-name (`toxic`→status,
  `hail`/`sandstorm`→weather, `spikes`→hazard, `metronome`→item via existing
  grammar; `psychic` the only damaging-move tie). Rule: attacker-side bare
  `psychic` = move Psychic (a user never means bare `psychic` as terrain); the
  damaging-move name wins over the same-word class token, guard-shaped, no
  cross-class priority list needed. Invariant adopted: class lexicons must
  stay 1-word-disjoint — warn loudly at startup if an aliases.md edit creates
  a tie (implement in the tokenizer session).

- **Two-move delimiter grammar ABOLISHED (2026-09-07; design decision).** The
  `then` / `+` / `and` chain syntax is gone, replaced by **move claiming with
  no delimiter**: `parseMoveChain` → `claimMoves` (`scripts/input-converter.mjs`).
  Walk the move slot's atoms left→right, longest contiguous exact move
  phrase/alias (≤3 words) at each position, collect distinct canonical claims.
  1 distinct = single-move card; 2 distinct = the fixed two-move sequence in
  claimed order (turn 1 then turn 2); **0 moves or >2 distinct = hard error,
  stop reading**. Re-naming the same move (incl. alias pairs like `EQ
  earthquake`) collapses to a single card. Connector words (`then` / `and` /
  standalone `+` / commas) are inert noise — `rock + spikes`, `in sun and
  spikes` can no longer be misread as chains. Rationale (user): players use
  `and`/`+` as ordinary connectors, so the delimiter grammar invited
  confusion. Verified: `EQ then Outrage` and `EQ Outrage` cards byte-identical;
  move order = left→right as typed (`Outrage EQ` flips the turns); `EQ,
  Outrage` now combos (was an unknown-move error); `eq+outrage` still chains;
  3+ distinct (`EQ Fire Blast Ice Beam`) errors. Docs: OUTPUT-FORMAT two-move
  section. **SUPERSEDES**: the 2026-09-05 "Multi-move separators narrowed"
  item below; the ## 3 dedupe-vs-conflict chain-syntax bullets; seam D's
  "chain atoms claimed in the sweep" wording (the seam D `+2`-glue rule —
  digit-glued `+N` is always a boost — still stands).

## Done (2026-09-06)

- **Recognition echo: wrap-to-new-line for too-long lines (agent route).**
  `scripts/echo.mjs` `renderEcho(line, spans, wrapWidth)` now wraps a block
  wider than the width into word-line/ruler-line row groups, cutting only at
  gap columns that are blank in BOTH lines and outside every unit's text span —
  a word, a glued multi-word binding (`Life Orb`, `Sludge Wave`) and a ruler
  label are never split across a row. CLI gains `--width N` (default 100;
  `<= 0` never wraps); top line stays NOT byte-exact (extra space fine).
  Regression: `verify:echo` extended 4/4 → 6/6 (wrap-at-width + width-0
  cases). Short queries byte-identical to before. Shared renderer ⇒ the
  offline converter route (## 8) gets the same wrap for free later. Also
  codified the `max <stat>` span convention (echoes as that stat's `ev:` label
  anchored under the phrase's first word — NO `max` label class — and any
  token the shorthand leaves unbound, e.g. a redundant bare `252`, is `???`).
  Docs: AGENT-GUIDE step 2 bullets; TODO ## 2 layout rules + label set; "New
  idea notes" 1 marked RESOLVED.

- **Backlog: four new idea notes recorded + `max`/EV collision rule
  CORRECTED (user).** TODO top gains a "New idea notes (to discuss)" section:
  (1) echo-too-long → resolved by the wrap item above; (2) `max <stat>` +
  explicit EV on the same stat ERROR (`max atk` then `120 atk` → hard error);
  duplicate `max atk max atk` collapses silently; max on different stats
  coexist; the `max` auto-nature (adamant) never collides — explicit nature
  overrides. (3) master rule: hyphen in input = space, then prune the alias
  list. (4) faster agent extraction on one-liners (ties into ## 10).

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
  > SUPERSEDED 2026-09-07 — delimiter grammar ABOLISHED; see the top-of-day
  > "Two-move delimiter grammar ABOLISHED" bullet. Two moves are claimed by
  > exact name with no separator; `,`/`;` are inert noise like `then`/`and`.

---

## New idea notes (user 2026-09-06; TO DISCUSS — not yet shaped, do not implement from these alone)

Rough captures before they were lost. Expand each into a real design / numbered
backlog item at the discussion session; where noted they touch an existing item.

1. **Echo printout too long? → RESOLVED 2026-09-06: wrapping implemented.**
   `renderEcho` now wraps a block wider than a wrap width into row groups (each
   top line followed by its ruler line), cutting only at gap columns outside
   every unit's text and blank in both lines — a word, a glued multi-word
   binding (`Life Orb`, `Sludge Wave`) and a ruler label are never split across
   rows. CLI: `--width N` (default 100; `N <= 0` = never). Top line was agreed
   NOT byte-exact (extra space fine). Shared renderer ⇒ the offline converter
   route (## 8) gets the same wrap for free later.

2. **`max` vs explicit-EV collision (ties into ## 10 / auto-fill-defaults /
   ## 3 dedupe-vs-conflict) — CORRECTED 2026-09-06 (user).** `max <stat>` and an
   explicit EV on the SAME stat DO collide and ERROR (`max atk` then `120 atk`
   → hard error, both claims named — same-slot conflict per ## 3, never an
   overwrite). But: identical duplicate claims collapse silently (`max atk max
   atk` → one max, tolerated user redundancy); max on DIFFERENT stats coexist
   freely (`max atk` + `max spe` both bind). The `max` AUTO-nature (adamant) is
   only a default: an explicit nature typed in the query (`max atk jolly`)
   overrides it with no error — explicit nature wins, auto nature never collides.

3. **Master rule: hyphen in input = space.** Normalize every hyphen in the
   input to a space before anything binds (one master normalization rule), THEN
   clean the alias list of the hyphen/spaced duplicate forms the rule makes
   redundant.
   > IMPLEMENTED 2026-09-07 (`hyphenToSpace` in `scripts/input-converter.mjs`,
   > applied at the top of `parseCombatant` and `parseQuery`). Exception
   > (user-confirmed): a minus glued to a boost/stage number (`-2 atk`) stays a
   > minus — a hyphen that starts a token and is followed by a digit is kept;
   > NO other case survives (no `+2-1` ranges). Alias-list cleanup still TODO.

4. **Faster agent extraction on one-liners (ties into ## 10).** On a short
   one-liner inquiry, the agent should recognize "this is a calc ask" and jump
   straight to the sentence containing `vs` — minimal deliberation. Note from
   user: "don't think too much, we will discuss later."

5. **Error-message consolidation after the echo (user 2026-09-07).** Once the
   recognition echo renders `???` for every unbound token, the player already
   sees exactly where the converter stopped — do we still need the current zoo
   of bespoke converter errors ("could not identify a pokemon in ...",
   "I couldn't place ...", "needs a stat right after it", caps, unknown-move)?
   Lean: one master "unrecognized input" error whose detail is carried by the
   echo, while KEEPING a few high-value specific errors the echo cannot show:
   semantic same-slot conflicts (slot + candidates: `max atk` vs `120 atk`,
   boost `+2` vs `+1`, item vs `no item`) and the bare-EV-number error
   (`max atk 252` — an EV-magnitude number with no stat = likely spread typo,
   errors loud, confirmed 2026-09-07; supersedes the earlier "redundant bare
   252 → ???" echo convention). Open: where the split lands for move/species
   not-found (echo `???` vs a message naming the missing slot). Shape at the
   ## 10 session.
   > **R4 REVISIT POINT (2026-09-08 seam F):** R4 generalized the bare-number
   > error above to *unbound stat WORDS* too — a lone `hp`, a lone `atk`, or a
   > stranded number is a HARD ERROR in the converter (never `???`, never
   > `[ignored: …]`; see the seam-F Done bullet + SESSION-NOTES-20260908-SEAM-F).
   > If this session relaxes errors toward `???` junk tolerance, R4 is the
   > first rule to re-examine: is a stray stat word "very likely a spread typo"
   > (hard error, as ruled) or honest junk the echo should just surface? The
   > two camps map to the converter route (strict today) vs the future agent /
   > echo route (## 8 / ## 10). Deliberate, don't silently inherit either way.

---

## 2. Agent-side recognition echo (user 2026-09-06; FIRST unfinished item)

**STATUS: agent half IMPLEMENTED + verified 2026-09-06** — shared renderer
`scripts/echo.mjs` (exports `renderEcho(line, spans, wrapWidth)`; CLI with
`--line` / `--spans` / `--chat` / `--width`), regression guard
`scripts/verify-echo.mjs` (`npm run verify:echo`, 6/6 incl. wrap). The agent
route now echoes via the renderer before pasting the result card. The always-on
echo rule was adopted into `AGENTS.md` rule 2 (user-confirmed 2026-09-06).
Wrap-to-new-line (too-long echo) added for the agent route 2026-09-06 (see
"New idea notes" 1). STILL OPEN: converter half = ## 8 (offline
`input-converter.mjs` / `damage.mjs` route does not echo yet; "labels so far"
on a converter error is fine to defer).

Show the user exactly what was understood BEFORE the result card or error: echo
the inquiry input verbatim, and annotate each recognized token with its class
via an alignment ruler line underneath. Goal: the user instantly sees which
token confused the agent/converter. Implements the agent half only (the agent
already knows what it bound — it annotates the user's line while authoring the
spec; no dependency on the ## 3 tokenizer). The converter half is ## 8.

Presentation (chosen 2026-09-06, finalized 2026-09-06 — option b, alignment
ruler, one label per token, short class-only labels):

```
Garchomp @ Life Orb Jolly  252 Atk Blitz vs Heatran
species    item     nature ev:atk  move     species
```

**Layout rules (agreed 2026-09-06; shared renderer = `scripts/echo.mjs`):**
- The top line is the user's WORDS in order with original spelling and
  punctuation (`@`, `vs`, commas, hyphens all kept as typed); inter-token
  spacing is re-laid out — single space by default, widened only when a label
  needs room. It is NOT byte-verbatim: `Jolly  252` above shows the one extra
  space inserted so `ev:atk` can sit exactly under `252`.
- Each label starts EXACTLY at its word's first column (left-aligned / leveled,
  never centered, never drifted).
- A label may overhang right past its word, but a following label-bearing word
  is pushed right (by widening the top-line gap) so it never sits within 1
  column of the previous label's text → at least one blank column between
  consecutive labels. A label wider than its word must NOT eat that blank.
- Multi-word bindings (`Life Orb`, `252 Atk`) render as one unit glued with
  single spaces; the label anchors to the unit's FIRST word.
- Unannotated atoms (`@`, `vs`, bare punctuation) get no label and keep
  single-space separation.
- Label set: `species` / `nature` / `ev:atk` (EV labels include the target
  stat) / `move` / `item` / `status` / `ability` / `boost` / `level` / `arena`
  / `mega`; a token the producer could not place gets `???` and is laid out
  like any other label. Colored in real terminals (class → fixed color); the
  ruler form above is the chat-safe / code-block rendering.
- `max <stat>` shorthand echoes as that stat's EV label (`max atk` → `ev:atk`,
  `max spa` → `ev:spa` — the label set has NO `max` class), one unit spanning
  the whole phrase, anchored under its FIRST word. Any leftover token the
  shorthand displaced (e.g. a redundant bare `252` beside `max spa`, which the
  parse never binds as an EV) is an unbound junk atom and gets `???`.
- `???` is FEEDBACK, not a blocker: the query still runs to the card. It shows
  the player exactly which token was not understood.
- Order in output: echo (top line + ruler, its own fenced block) first, then
  the result card — or on a hard error, echo first then the error message, so
  what-WAS-recognized is visible before the confusing part (same spirit as the
  converter's "I did recognize:" message).
- Producer contract (agent now, converter in ## 8): emit one span per token it
  actually bound — as `[firstAtom, lastAtom]` indexes into the whitespace-split
  line plus a label (agent-side; an internal `_spans` on the spec is NOT sent
  through the fill|calc|output chain). NEVER fabricate a binding — anything the
  producer could not place is labeled `???`. Unbound junk is exactly the
  feedback this feature exists to surface.
- What the ruler shows is per-side attribution as the producer resolved it
  (attacker tokens, move, defender tokens, plus `vs` as an unannotated
  separator).
- ROUTE DIFFERENCE (accepted): the agent route echoes today; the offline
  converter route (`input-converter.mjs` / `damage.mjs`) does NOT until ## 8
  wires it to the same `scripts/echo.mjs` renderer. Feature is not "done" until
  ## 8 lands. The agent-half rule is adopted in `AGENTS.md` (confirmed
  2026-09-06); the converter half is ## 8.

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
  > SUPERSEDED 2026-09-07 — the chain grammar is ABOLISHED (see the top-of-day
  > "Two-move delimiter grammar ABOLISHED" bullet). Two distinct claimed moves
  > ARE the two-move calc (no token needed); same-move re-names collapse to
  > single; the "no chain token" hard error is gone.
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

- Spikes layers 1–3: a SPACE-separated count in either order (`2 spikes` /
  `spikes 2` / `spike 1`), or x-notation (`spikes x2` / `x2 spikes` /
  `2x spikes` / `×2 spikes`); the word's own number never matters when a
  count is typed. A BARE `spike` = 1 layer, `spikes` = 3. Glued digit forms
  (`1spike`, `spikes2`) and the `N layers of …` spelling are NOT recognized
  (noise). Counts are 1–3 only; a >3 number beside `spikes` strands and hits
  the bare-number error. Comma = hard separator (breaks every spike phrase).
  Same-value claims from several scans collapse; different values error.
  > Forms IMPLEMENTED 2026-09-08 in `input-converter.mjs` `spikePass` (this
  > supersedes the earlier `1spike(s)` / `spike(s)1` glued-forms requirement —
  > glued forms are now noise, user-confirmed).
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

## 9. Converter `no item` handling — same-slot conflict + spelling sweep (user 2026-09-06)

Context (verified 2026-09-06): `input-converter.mjs` strips the phrase
`no\s*item|itemless` (regex pass BEFORE the nature/ability/item phrase passes)
and sets `spec.noItem = true` per side; `fill.mjs` passes it through as
`noItem`; `calc.mjs` uses `!defender.noItem && !defender.mega` to default
`targetHoldsItem` (so e.g. Knock Off's +50% vs an itemless target is modeled);
`output.mjs` renders `@ no item` when no item was named. Default is
inert-held, so `no item` is how a genuinely itemless mon is expressed on both
routes. Agent token rule: `auto-fill-defaults.md` → "The only times the agent
adds to the spec".

Gaps to refine (converter-only now; ## 3 generalizes):
- **Same-slot conflict is SILENT today:** naming an item (or `plate`) AND
  `no item` on the same side sets both `spec.item`/plate and `spec.noItem`;
  output shows the item while calc still flips `targetHoldsItem` off. Should
  be a hard error naming the slot and both claims, mirroring ## 3
  dedupe-vs-conflict. (Explicit item name + noItem on the same side is
  contradictory user input; never a silent first/last-wins pick.)
- **Spelling breadth:** `no-item` is NOT matched (hyphen collapses to the
  punctuation sentinel before the regex). Decide the accepted spellings
  (`no item` / `noitem` / `itemless` / `no held item` / hyphen forms).
- **Attacker-side semantics:** `noItem` on the attacker only affects display;
  calc's `targetHoldsItem` is defender-only. Confirm nothing should gate on
  attacker itemlessness (auto-ability picks are item-blind today).
- Agent/echo: `no item` should carry an `item` class binding (`no item` →
  label under both words) rather than vanishing — the echo must show the
  negation was understood. Coordinate with ## 2 span classes when ## 8 lands.
- For ## 3: `no item` becomes a consumed claim reconciled by the
  dedupe-vs-conflict pass (an item phrase and `no item` in one side = conflict).

## 10. One-liner → converter route: kill LLM extraction (user 2026-09-06; design agreed, implement next session)

Agreed direction: the agent is ONLY a conversational wrapper. It pulls the
damage-query ONE-LINER out of the user's message — stripping filler like
"let's do a quick calc" — and hands it to the converter. All extraction and
defaulting is the converter + `fill.mjs`; the agent authors NO spec JSON and
computes NO echo spans. Everything is essentially the converter now; the agent
route and the offline converter route converge on the SAME parser
(byte-identical by construction). This supersedes today's agent-route prose in
`AGENTS.md` rule 2/3 and `AGENT-GUIDE.md` step 1 (hand-written "extract → spec
JSON") once it lands.

Rationale (2026-09-06): hand LLM extraction is the slow + error-prone part of
a query — canonical dex names (`Aggron-Mega`), private spec keys (`_maxSpa`),
echo atom-index counting. Removing it makes a single-line query ≈ one tool
call, and the recognition echo is only as fast as the parse that backs it.

Prerequisites / concerns to settle before building:
- **Free-order parser (first slice of ## 3).** `input-converter.mjs` today
  only parses the literal `<atk> uses <move> vs <def>` frame. It must accept
  sides split by `vs` with NO `uses`: find the move phrase (exact alias / full
  name, contiguous) in the attacker side, parse each side with the existing
  `parseCombatant`. User lines like `max spa 252 gengar shadow ball vs max def
  mega aggron` must work as typed.
- **Junk tolerance.** The converter hard-errors on stat-less stray numbers
  (e.g. a redundant `252` beside `max spa`). Decide: converter errors loudly
  (agent relays / asks the user) vs the agent deletes obvious redundancy before
  hand-over. Agent edits must otherwise stay limited to conversational filler —
  reordering and move-finding are converter work, never agent work.
- **One-shot route script.** `route.mjs "<line>" --chat` = converter → fill →
  calc → output in one node process (data loaded once), so a query is one tool
  call with no cold-start tax.
- **Echo wiring.** Once the free-order parse owns spans, the converter-side
  recognition echo (## 8) becomes the ONLY echo; drop the agent-side
  hand-built echo path.


