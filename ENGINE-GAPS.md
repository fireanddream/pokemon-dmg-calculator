# Known Coverage Gaps (pokemon-dmg-calculator)

This is a living inventory of mechanics that the Gen-6 damage engine does **not**
fully model, so contributors know what is open and what is intentional. It is
not a bug list to be fixed blindly: each entry says whether it is planned,
intentional, or left open for someone to pick up.

Scope note: this tool prints a single-hit damage roll plus a defender KO/chip
simulation. "Covered" means the printed number is right for what a query can
express. Effects that only change accuracy, crit rate, priority, PP, flinch, or
post-hit stat stages are generally out of scope and not listed here.

Status legend:
- `not implemented` — open, safe to implement.
- `not implemented (intentionally)` — deliberately left open, like the auras.
- `won't implement` — intentional design decision (see AGENTS.md).
- `partial` — some path exists but nothing reaches it in practice.
- `done` — implemented.

## Abilities

| Ability | Status | Notes |
|---|---|---|
| Fairy Aura / Dark Aura | **not implemented (intentionally)** | Gen-6: while the holder is in play, Fairy/Dark moves from **all** battlers deal x4/3. Affects Xerneas (Fairy Aura) and Yveltal (Dark Aura) as attackers and as defenders. See the contributor note below. |
| Aura Break | **not implemented (intentionally)** | Zygarde. While present, reverses Aura abilities so matching-type moves deal x3/4 instead of x4/3. Only meaningful once the Auras above exist. |
| Sheer Force | done | x1.3 on the 133 gen-6 damaging moves whose chance-based secondary is suppressed (see `SHEER_FORCE_MOVES` in `src/damage-calc.ts`, derived from @smogon/calc via `scripts/_derive-sf.mjs`; covered by `verify-smogon.mjs`). |
| Analytic | **not implemented (intentionally)** | Engine hook exists (`params.movedAfterTarget` -> x1.3), but nothing sets it and the project deliberately does **not** infer "moved after the target" from a speed comparison. See the move-order note below. |
| Flash Fire (attacker) | **not implemented (intentionally)** | Boost hook exists (`params.flashFireBoosted` / `abilityOn`) but nothing sets it; there is no "already fire-boosted" context token. |
| Rivalry | done | x1.25 same gender / x0.75 opposite (engine; needs both sides' `gender` set, which the CLI does not parse yet). |
| Shell Armor / Battle Armor | done | Block a requested `crit` against the holder (Mold Breaker does not bypass). Covered by `verify-smogon.mjs`. |
| Skill Link | done | Multi-hit moves land the guaranteed maximum 5 hits as a weighted 5-hit distribution (see Multi-hit row for the remaining gap). |
| Unnerve | done | Disables the defender's Sitrus Berry in the KO sim (resist berries were already gated in `calcDamage`). |
| Infiltrator | done | Attacker's moves ignore Reflect/Light Screen. Covered by `verify-smogon.mjs`. |
| Solar Power (defender chip) | done | End-of-turn 1/8 sun chip for a Solar Power holder in sun is in the KO sim and the turn table. |
| Scrappy | done | Normal/Fighting moves connect against Ghost-types. Covered by `verify-smogon.mjs`. |
| Sturdy (KO survival) | done | Full-HP Sturdy/Focus Sash holder survives a lethal **attack** at 1 HP; indirect chip can still KO it. See Items / Focus Sash. |
| Download / Intimidate / Defiant / Competitive / Moxie / stat-stage entries | `won't implement` | Stat-stage abilities are never auto-applied by design (see AGENTS.md). |

## Items

| Item | Status | Notes |
|---|---|---|
| Focus Sash | done | Full-HP holder survives one lethal attack at 1 HP in the KO sim; never protects against indirect damage. Inactive if entry hazards already took HP. |
| Air Balloon | done | Holder is immune to Ground while the balloon is intact (not an ability, so Mold Breaker does not bypass it). |
| Iron Ball | done | Holder is grounded: Ground moves connect against a Flying-type and Levitate stops working. |
| Ring Target | done | Negates the holder's typing immunities (Normal hits a Ring Target Ghost, Ground hits a Flying, etc.). |
| Black Sludge | done | Heals a Poison-type holder 1/16 and chips non-Poison holders 1/16 in the KO sim / turn table. |
| Soul Dew / Thick Club / Light Ball / Deep Sea Tooth / Deep Sea Scale | done | Species stat multipliers (Latios/Latias, Marowak/Cubone, Pikachu, Clamperl). |
| Plates | done | All 17 plates parse by name AND by the `<Type> plate` spelling (`@ Fairy Plate` → Pixie Plate — source of truth: aliases.md "Type plates" table, parsed at startup). A bare `plate` picks by the move's **effective** type (a Pixilate Hyper Voice gets Pixie Plate); Normal has no plate, so `normal plate` / `plate` + a Normal move → Silk Scarf. |
| Metronome | not implemented | Consecutive-use power ramp (multi-turn; low priority). |

## Moves

| Mechanic | Status | Notes |
|---|---|---|
| Multi-hit moves (no Skill Link) | not implemented | Only the Skill Link guaranteed-5-hit case is modeled (as a weighted sum distribution). Non-Skill-Link 2-5 hit moves (Bullet Seed without Skill Link, etc.) still print as one hit. |
| Aerilate / Pixilate / Refrigerate / Normalize (type remap) | **done** | STAB, type effectiveness, immunities and the x1.3 all key off the remapped type (Flying/Fairy/Ice). |
| Scrappy | done | (Ability row above; listed here for move-type completeness.) |
| Freeze-Dry | done | x2 vs Water handled. |
| Avalanche / "moved-after-target" powers | **not implemented (intentionally)** | Avalanche (doubles if the user was hit this turn) is not modeled. Electro Ball and Gyro Ball keep their documented **stat-based** power scaling (current Speed stat, see AGENTS.md), but the engine never infers *who actually moved first*. Payback is its own case — see Dynamic-power (variable BP) moves. See the move-order note below. |
| Future Sight / Doom Desire-style delay | not implemented | (Not gen-6 damage-number relevant in the single-hit view.) |

### Dynamic-power (variable BP) moves

Statuses here reflect what a single-hit calc can express. Decided 2026-09-04:
the **out-of-scope** groups below are not modeled; **Weather Ball** was agreed
in-scope and is now implemented (2026-09-04); **Payback → flat 50** is agreed
but NOT yet implemented — pick it up if you want it.

| Move(s) | Status | Why / notes |
|---|---|---|
| Heavy Slam, Heat Crash (weight ratio); Low Kick, Grass Knot (target weight); Electro Ball, Gyro Ball (Speed stat) | done | BP resolved from current stats in `resolveTypeAndPower` (`src/damage-calc.ts`). |
| Eruption, Water Spout, Flail, Reversal (user HP); Crush Grip, Wring Out (target HP) | done | HP-fraction powers. |
| Stored Power, Punishment (stat-stage counts) | done | Scales off the typed stage boosts. |
| Return / Frustration | done | Fixed at 102 (max happiness) — no happiness tracking. |
| Knock Off, Acrobatics, Facade, Venoshock, Hex, Wake-Up Slap, Smelling Salts (item/status condition doublers) | done | Doublers that a query can express (`@ item`, `no item`, status words). |
| **Payback** | **partial — wrong** | Engine currently doubles it from a **Speed comparison** (`currentStat`), which is order inference the project avoids. Agreed scope: treat as a flat **50 BP** (no doubling). NOT yet applied — remove the special-case branch in `resolveTypeAndPower`. |
| **Weather Ball** | done | Base 50 → **100** and a type shift with weather (sun/desolate → Fire, rain/primordial → Water, hail → Ice, sand → Rock; none/Delta → Normal 50). `resolveWeatherBall` in `src/damage-calc.ts`; the type feeds the shared `effType` (STAB / effectiveness / immunities / resist berries) and the CLI plate picker. Air Lock/Cloud Nine null the weather first, so suppressed weather reads Normal 50. |
| Pursuit, Assurance, Avalanche, Revenge (hit-this-turn / switch / damaged) | not implemented | Need a "took a hit this turn / opponent acted" state the CLI can't express. Intentional. |
| Fury Cutter, Echoed Voice, Rollout, Ice Ball (consecutive-turn scaling) | not implemented | Multi-turn state. Intentional. |
| Spit Up, Trump Card, Present, Natural Gift, Magnitude | not implemented | Need Stockpile count / PP left / random roll / berry — out of scope. |
| Brine (double at ≤50% target HP) | not implemented (intentional) | Kept flat 65 BP. |
| Stomp / Steamroller / Dragon Rush (double vs a Minimize target) | not implemented | Minimize isn't modeled (its +2 evasion stage is all that applies). |
| Last Resort | not implemented (intentional) | "Always works": flat 140 BP, no availability condition. |

**If you pick up the Payback flat-50 change:** delete the `named(move,
"Payback")` branch in `resolveTypeAndPower`; data already stores 50 BP.

## KO sim

| Mechanic | Status | Notes |
|---|---|---|
| Poison Heal + toxic | done | Poison Heal *replaces* poison/toxic damage with a 1/8 heal (no chip); low-HP Gliscor @ Toxic Orb no longer dies to end-of-turn poison. |
| Sturdy / Focus Sash survival | done | Survive a lethal full-HP **attack** at 1 HP only; indirect end-of-turn chip (weather, burn/poison, hazards, Black Sludge, Solar Power) can still KO right after. |
| Multiscale vs entry hazards | done | Hazards take HP before the attack, so the x1/2 Multiscale (and Sturdy/Focus Sash) check is inactive once the defender is below full HP (`damageTakenBefore`). |

## Intentional simplifications (do not "fix")

See AGENTS.md: neutral nature by default, EVs default 0, an inert held item is
always assumed unless `no item`, megas always hold their Mega Stone (so Knock
Off does not get its boost vs a mega), no auto stat-stage abilities, status
tokens ignore typing (Fire-types can be "burned" if typed), Flame Orb / Toxic
Orb default their holder to burned / badly poisoned with the gen-6 type
restriction (Fire can't be burned, Steel/Poison can't be badly poisoned).

Auras (Fairy Aura / Dark Aura / Aura Break) are **intentionally not
implemented**. If you want to take them on, the cleanest place is a shared
helper in `src/damage-calc.ts` that, given the matchup, computes the aura
multiplier for the effective move type and feeds both the attacker and defender
   sides; wire auto-defaulting in `scripts/fill.mjs` and add coverage rows to
`scripts/verify-smogon.mjs`.

**Move-order-dependent mechanics** (Analytic, Avalanche, Flash Fire's attacker
boost, "attacker was hit last turn") are **intentionally not implemented**, and
that decision extends to *inferring turn order from a speed comparison*: speed
ties, priority, Trick Room and switch-in timing make such inference guesswork
rather than a real answer. Do **not** "fix" these by comparing attacker/defender
Speed in `calcDamage` or by auto-picking an ability from it. If a contributor
wants them, the right shape is an explicit, user-typed context token in the CLI
that maps to the existing `movedAfterTarget` / `flashFireBoosted` hooks, with
coverage rows in `scripts/verify-smogon.mjs`.
