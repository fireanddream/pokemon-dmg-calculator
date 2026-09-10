# TODO.md — future-session backlog

Standing to-do list for the loose-English → variables (fuzzy parse) work and
the tokenizer/grammar build-out. Read at session start. **Design records and
engine-coverage inventory live in `DESIGN-RECORDS.md`** — this file only
carries open work + status. Per-session verbatim narrative lives in
`session-tools-archive/SESSION-NOTES-*.md` (`INDEX.md` catalogs them).

**State 2026-09-10:** steps 1–6 are DONE. Step 5's weather model was revised
2026-09-10 (second pass): weather is now ONE plain explicit slot (two
different explicit weathers error); weather-setting ABILITY names are
ordinary ability claims that `fill.mjs` resolves (primal beats regular
regardless of Speed, else slower wins, tie → attacker); a typed weather
always beats the ability. `snow` → hail added; fabricated spellings
(`permanent *`, `harsh sunshine`, `hail storm`/`hailstorm`, `sand storm`)
removed. Working tree green: `verify:damage` 63/63,
`verify:acc` 44/44, `verify:echo` 6/6, corpus chaincheck "all identical".

---

## Build order — what remains of the tokenizer overhaul

Steps 1–4 are done; the design contract for each open step lives in the
`DESIGN-RECORDS.md` section cited. Each step lands with `verify:damage` 63/63,
`verify:acc` 44/44, `verify:echo` 6/6 green and the corpus chaincheck "all
identical". Record of done steps: step 1 →
`SESSION-NOTES-20260909-TOKENIZER-STEP1-SWEEP.md`, step 3 →
`SESSION-NOTES-20260909-SPECIES-AS-CLAIMS.md`, step 4 →
`SESSION-NOTES-20260909-MEGA-EXACT-SHAPE.md`, steps 5 (partial) + 6 →
`SESSION-NOTES-20260910-BARE-ARENA-AND-SEAM-C.md`.

1. ✅ **Layer-1 unified sweep** (was "build step 1") — DONE 2026-09-09.
2. ✅ **Seam-B guard** — DONE 2026-09-09 (closed by step 1; no trie built).
3. ✅ **Species claim in the sweep** (was "residue resolution", SUPERSEDED) —
   DONE 2026-09-09: exact glued-run literals, no residue layer/fuzzy.
4. ✅ **Mega exact-shape signal** (was `## 6` scope) — DONE 2026-09-09:
   standalone `mega` upgrades an adjacent species to `-Mega` (prefix or
   suffix); no-forme bases HARD-ERROR; `-X`/`-Y` bases keep the base pick;
   already-`-Mega` never re-upgraded; `Mega Punch/Kick/Drain` moves and
   `Mega Launcher` win by longer phrase. Contract: `DESIGN-RECORDS.md` §7.
5. ✅ **Arena grammar inside the sweep** (was `## 4`, bare-only). DONE
   2026-09-10; weather model revised the same day (second pass). Bare arena
   words only — NO `in`/`under`/`after` signals. Weather is ONE plain slot:
   two different explicit weathers across sides error, identical collapse;
   weather-setting ABILITY names are ordinary ability claims that fill
   resolves (primal beats regular regardless of Speed, else slower, tie →
   attacker) and a typed weather always beats the ability. `snow` → hail
   added; fabricated forms removed. Terrain/spikes cross-side different
   values error (never add); hazards hoist from either side. Contract:
   `DESIGN-RECORDS.md` §5.
6. **Seam-C startup warning + guard** — DONE 2026-09-10 (option A): warn at
   startup if any key, ANY word count, is registered in two class lexicons
   (the startup check in `input-converter.mjs` doubles as the smoke — it runs
   on every converter/fill/damage start since fill imports the lexicon).
   No behavior change when clean.
7. **Converter-side echo** (was `## 8`). Wire the offline converter route into
   `scripts/echo.mjs` using the step-1 side log's claim→atom spans
   (`spec._sideLog`). Per the T2 ruling, plain junk words render as
   unannotated atoms (NO `???` label); R4 strays and Tier-1 errors keep their
   messages. `no item` should carry an `item`-class binding. Drop the agent's
   hand-built echo path once this owns spans. Contract: `DESIGN-RECORDS.md` §4.
8. **One-shot route** (was `## 10`). `route.mjs "<line>" --chat` = converter →
   fill → calc → output in one node process (data loaded once), so a one-liner
   query is one tool call. Then retire the agent-route prose in AGENTS.md
   rule 2/3 and the `pokemon-damage-calc` skill step 1 (agents stop authoring
   spec JSON/spans; AGENTS.md rule 2's echo becomes the converter's echo).
   Direction: `DESIGN-RECORDS.md` §11.
9. **Forme-word collision set** (post-tokenizer review). Once the sweep works,
   revisit `pikachu rock star`, `arceus rock`, `arceus poison`, `arceus
   electric/psychic` (terrain interaction), `genesect burn`, `arc-rock`; at-worst
   alias escape (`<forme spelling>` → canonical dex name). Do NOT touch before
   steps 1–3 land (they have).

## Small open threads

- **Error-message consolidation** (route-related, `DESIGN-RECORDS.md` §8):
  once the converter echo shows unbound tokens, does the bespoke converter
  error zoo still earn its keep? Lean: one master "unrecognized input" error
  carried by the echo, KEEPING same-slot conflicts and the bare-EV-number
  error. Shape at the step-8 session.
- **`no item` attacker-side semantics** (`DESIGN-RECORDS.md` §9): confirm
  nothing should gate on attacker itemlessness (auto-ability picks are
  item-blind today). Echo binding of `no item` folds into step 7.
- **Alias-list hyphen cleanup** (idea note 3 tail): prune the hyphen/spaced
  duplicate forms the hyphen rule makes redundant. No hyphenated alias KEYS
  exist today; low priority.
- **Payback flat-50** (`DESIGN-RECORDS.md` §10, dynamic-power table): agreed
  scope is flat 50 BP — delete the `named(move,"Payback")` branch in
  `resolveTypeAndPower` (data already stores 50). Optional pick-up.
- **Boost-signal recognition on the free-order attacker side** — CLOSED by
  step 1 (move/boost claims ride `spec._claim` in the sweep). No further work
  beyond step 7's echo spans for converted signals.

## New idea notes (user 2026-09-06; still TO DISCUSS — do not implement from these alone)

1. **Faster agent extraction on one-liners** (ties into step 8 / §11): on a
   short one-liner, recognize "this is a calc ask" and jump straight to the
   `vs` sentence. Resolved upstream by the route direction — revisit only if
   the route work stalls.
2. **`max` vs explicit-EV collision** — RESOLVED 2026-09-06 (user):
   same-stat `max <stat>` + explicit EV error (`max atk` then `120 atk` → hard
   error, both claims named); duplicate `max atk max atk` collapses; max on
   different stats coexist; the `max` auto-nature is only a default — an
   explicit nature wins, never collides.
3. **Master hyphen rule** — IMPLEMENTED 2026-09-07 (`hyphenToSpace`); minus
   glued to a boost/stage number is the only exception. See the alias-cleanup
   thread above for the leftover tail.

---

## Done — quick pointers (full detail in each session note)

| When | What | Record |
| --- | --- | --- |
| 2026-09-09 | Mega exact-shape upgrade: prefix/suffix `mega`, no-forme hard error, `Mega X` move + `Mega Launcher` guards | `SESSION-NOTES-20260909-MEGA-EXACT-SHAPE.md` |
| 2026-09-09 | Species claim IN the sweep; residue resolver deleted (step 3) | `SESSION-NOTES-20260909-SPECIES-AS-CLAIMS.md` |
| 2026-09-09 | Tokenizer step-1 unified sweep + step 2 closed | `SESSION-NOTES-20260909-TOKENIZER-STEP1-SWEEP.md` |
| 2026-09-08 | Free-order `vs` frame (uses inert), junk silent-drop, max-flag expansion | `SESSION-NOTES-20260908-FREE-ORDER-RULINGS.md` |
| 2026-09-08 | Boost moves → boost signals (## 5 first slice) | `SESSION-NOTES-20260908-BOOST-SIGNALS.md` |
| 2026-09-08 | Seam F R1–R4 (stat-less `±N` dynamic; stray stat/number errors) | `SESSION-NOTES-20260908-SEAM-F.md` |
| 2026-09-07 | Seams A–C review (3-word sweep, guard, 1-word ties, spikes, comma) | `SESSION-NOTES-20260907-SWEEP-REVIEW-AI.md` |
| 2026-09-07 | Master hyphen rule | `SESSION-NOTES-20260907-HYPHEN-RULE.md` |
| 2026-09-06 | Echo renderer + wrap; `max`/EV collision rule | DESIGN-RECORDS.md §4 · TODO notes 1–2 above |
| 2026-09-06 | Type+Plate spellings → real plate items (was `## 1`) | `SESSION-NOTES-20260906-PLATE-ALIASES.md` |
| 2026-09-06 | No-"uses" declaration (grammar contract, docs) | AGENTS.md rule 2/3 · DESIGN-RECORDS.md §2 |
| 2026-09-05 | Front split: `input-converter.mjs` + `fill.mjs` | `SESSION-NOTES-20260905-FRONT-SPLIT.md` |
| 2026-09-05 | Converter redesign design session (grammar, arenas, tokenizer) | `SESSION-NOTES-20260905-CONVERTER-REDESIGN.md` · `SESSION-NOTES-20260905-FUZZY-TOKENIZER.md` |
| earlier | Engine, defaults, accuracy sessions | `SESSION-NOTES.md`, `SESSION-NOTES-FILLER-DEFAULTS.md`, `SESSION-NOTES-FUZZY-RULES-ALIASES.md`, `SESSION-NOTES-ACCURACY-WEATHER.md`, `SESSION-NOTES-PIPELINE-OVERHAUL.md` |
