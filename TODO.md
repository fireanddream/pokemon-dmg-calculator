# TODO.md — future-session backlog

Standing to-do list for the loose-English → variables (fuzzy parse) work and
the tokenizer/grammar build-out. Read at session start. **Design records and
engine-coverage inventory live in `DESIGN-RECORDS.md`** — this file only
carries open work + status. Per-session verbatim narrative lives in
`session-tools-archive/SESSION-NOTES-*.md` (`INDEX.md` catalogs them).

**State 2026-09-10:** steps 1–7 are DONE (step 7 = converter-side echo / shared
tokenizer, second pass same day). Step 5's weather model was revised
2026-09-10 (second pass): weather is now ONE plain explicit slot (two
different explicit weathers error); weather-setting ABILITY names are
ordinary ability claims that `fill.mjs` resolves (primal beats regular
regardless of Speed, else slower wins, tie → attacker); a typed weather
always beats the ability. `snow` → hail added; fabricated spellings
(`permanent *`, `harsh sunshine`, `hail storm`/`hailstorm`, `sand storm`)
removed. Error messages consolidated 2026-09-10 to `missing <var>` +
`conflict on <slot>` + `unbound EV` (keeping moves/EV/no-Mega bespoke) —
`DESIGN-RECORDS.md` §8. Payback after-target doubling removed (flat 50; out
of scope like Avalanche, oracle intentionally diverges) and attacker-side
`no item` now drives Acrobatics doubling (`attackerHoldsItem`) — §9/§10.
Second pass same day: conditional BP clauses unified into the
`CONDITIONAL_POWER` table; the result card (Block 2) now wraps through the
echo's `wrapBlock` rule; Facade is exempted from burn's Attack drop (mirrors
`@smogon/calc`), an explicit item/`plate` on a Mega now hard-errors, and
`powerOverride` is gone from the engine API. Working tree green:
`verify:damage` 65/65, `verify:acc` 44/44, `verify:echo` 7/7, corpus
chaincheck "all identical".

---

## Build order — what remains of the tokenizer overhaul

Steps 1–8 are done (step 9 remains); the design contract for each open step
lives in the `DESIGN-RECORDS.md` section cited. Each step lands with
`verify:damage` 65/65, `verify:acc` 44/44, `verify:echo` 7/7 green, no TS build
errors, and the corpus chaincheck "all identical". Record of done steps: step 1
→ `SESSION-NOTES-20260909-TOKENIZER-STEP1-SWEEP.md`, step 3 →
`SESSION-NOTES-20260909-SPECIES-AS-CLAIMS.md`, step 4 →
`SESSION-NOTES-20260909-MEGA-EXACT-SHAPE.md`, steps 5 (partial) + 6 →
`SESSION-NOTES-20260910-BARE-ARENA-AND-SEAM-C.md`, step 7 →
`SESSION-NOTES-20260910-CONVERTER-ECHO.md`.

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
7. ✅ **Converter-side echo** (was `## 8`) — DONE 2026-09-10. `scripts/tokenize.mjs`
   is the ONE shared line tokenizer (normalize-once: hyphen rule, `@`/punct
   handling, case-preserving display atoms with global `gi`); `parseCombatant`
   logs EVERY claim as `{label, from, len}` (echo labels: `ev:<stat>`, `arena`,
   `item`, `boost`, ...) with GLOBAL atom indices; a throw carries the live
   partial log via `opts.capture` → `err.sideLogs`; `echo.mjs` gains
   `spansFromLogs`. Presentation is the single-process `damage.mjs` `runQuery`
   (echo + card, or echo + error "scanned so far"; `--no-echo`, `--chat`);
   converter stays data-only. Contract: `DESIGN-RECORDS.md` §4. Agent-route
   prose/echo retirement moved to step 8.
8. ✅ **One-shot route** (was `## 10`) — DONE 2026-09-11. `scripts/route.mjs`
   is a thin alias of `damage.mjs`'s `runQuery`: one line argument, always
   fenced (converter → echo → fill → calc → output in one process).
   `damage.mjs` entry points are `isMain`-guarded so `runQuery` is importable.
   Agent-route prose rewritten: AGENTS.md rules 1–3 and the
   `pokemon-damage-calc` skill now say "find the `vs` line → run `route.mjs` →
   paste verbatim". Shared tokenizer now treats `?`/`!` as hard boundaries so a
   natural-sentence line ("... vs Heatran?") keeps its last token. Contract:
   `DESIGN-RECORDS.md` §11.
9. **Forme-word collision set** — CLOSED 2026-09-11. Curation drops the
   colliding variants (`pikachu rock star`, `arceus` type formes,
   `genesect burn`, `darmanitan zen`; `DESIGN-RECORDS.md` §10 "Curated-out
   variant formes") and the single-letter / glued aliases cover the rest
   (`giratina o`, `kyurem b`, `deoxys a`, …). The residual collisions a shorter
   spelling works around (`giratina origin pulse`, `rotom heat wave`,
   `shaymin sky drop`, `castform sunny day`, …) are documented as
   **intentionally not implemented** in §10 "Open forme-word collisions" — no
   open build step remains.

## Engine — safe open work (`not implemented`, §10)

These `DESIGN-RECORDS.md` §10 rows carry the legend's `not implemented` status
("open, safe to implement" — as opposed to `(intentionally)` / `won't
implement`), so each can be picked up on its own:

- **Multi-hit without Skill Link** — the 2–5 hit weighted distribution
  (Bullet Seed et al. still print as a single hit).
- **Metronome** — consecutive-use power ramp.
- **Future Sight / Doom Desire** — delayed-hit modeling.
- **Minimize-target doubles** — Stomp / Steamroller / Dragon Rush.

## Small open threads

- **Error-message consolidation** — DONE 2026-09-10 (`DESIGN-RECORDS.md` §8):
  taxonomy collapsed to `missing <var>` + `conflict on <slot>` + `unbound EV`;
  `too many moves` / EV-cap (252 & 510) / `no Mega forme` kept bespoke. The
  echo-on-error half shipped in step 7 (`err.sideLogs` → "scanned so far").
- **`no item` attacker-side semantics** (`DESIGN-RECORDS.md` §9) — DONE
  2026-09-10: attacker itemlessness is not display-only. `calc.mjs` derives
  `attackerHoldsItem = !attacker.noItem` and Acrobatics doubles only when it is
  false (the default inert held item suppresses the double). Auto-ability picks
  stay item-blind. `no item` echoes as `item` (step 7).
- **Alias-list hyphen cleanup** (idea note 3 tail) — CLOSED 2026-09-10:
  `aliases.md` has zero hyphenated alias KEYS, and the master hyphen rule
  (`hyphenToSpace`) folds every typed hyphen to a space, so a hyphenated key
  would be unreachable anyway. Nothing to prune.
- **Payback flat-50** (`DESIGN-RECORDS.md` §10) — DONE 2026-09-10: the
  speed-based doubling branch is gone (flat 50 BP) and the move is documented
  as out of scope, same class as Avalanche. `@smogon/calc` still doubles from
  Speed, so the slower-user case is intentionally absent from `verify-smogon`
  (64/64 now includes two Acrobatics item-presence rows, §9).
- **Boost-signal recognition on the free-order attacker side** — CLOSED by
  step 1 (move/boost claims ride `spec._claim` in the sweep). No further work
  beyond step 7's echo spans for converted signals.
- **Conditional-power clause table** — DONE 2026-09-10 (`DESIGN-RECORDS.md`
  §10): one `CONDITIONAL_POWER` table (`src/damage-calc.ts`) replaces the
  per-move inline `if` branches; Wake-Up Slap / Smelling Salts folded in.
- **Card (Block 2) wrap** — DONE 2026-09-10: `output.mjs` wraps through the
  echo's exported `wrapBlock` (default 100, `--width N`, `<= 0` never);
  `damage.mjs` and `output.mjs` agree byte-for-byte (`OUTPUT-FORMAT.md`).
- **Facade vs burn** — DONE 2026-09-10: `isBurned` exempts Facade (with Guts),
  mirroring `@smogon/calc` gen56 `applyBurn`; oracle row added.
- **Explicit item on a Mega** — DONE 2026-09-10: `fill.mjs` throws
  `conflict on item: <item> vs Mega Stone` for a typed item or `plate`; a
  stray `no item` is silently cleared (§9).
- **`powerOverride` removal** — DONE 2026-09-10: deleted from `DamageParams`
  and `resolveTypeAndPower` (no caller used it).

## New idea notes (user 2026-09-06; still TO DISCUSS — do not implement from these alone)

1. **Agent skill optimization** (ties into step 8 / §11): the agent route
   simply calls `damage.mjs` — recognize a calc ask, pull the one-liner out of
   the message, and hand it to the tool; the agent authors NO spec JSON and NO
   echo spans. Revisit only if the route work stalls.
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
| 2026-09-10 | Converter-side echo (step 7): shared tokenizer, `_sideLog` labels, "scanned so far" `err.sideLogs`, `damage.mjs` `runQuery` | `SESSION-NOTES-20260910-CONVERTER-ECHO.md` |
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
