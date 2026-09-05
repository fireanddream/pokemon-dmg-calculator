import type { MoveCategory, TypeName } from "./types.js";
import type { Weather } from "./damage-calc.js";

/**
 * Gen-6 hit-chance engine (accuracy + evasion).
 *
 * `@smogon/calc` never rolls accuracy, so this is validated against the
 * canonical game formula (stage table, item/ability/field multipliers,
 * 33% floor / 100% cap) in scripts/verify-accuracy.mjs. The damage pipeline
 * treats a non-impossible move as always connecting, which keeps damage
 * byte-identical to the @smogon/calc oracle.
 */

export interface AccuracySide {
  ability: string;
  item?: string;
  /** accuracy stage (attacker) or evasion stage (defender), -6..6 */
  stage?: number;
  /** defender is confused (activates Tangled Feet) */
  confused?: boolean;
  /** attacker at <= 1/4 HP with Micle Berry (next move x1.2) */
  atLowHp?: boolean;
}

export interface HitChanceParams {
  /** move name (needed for OHKO / weather always-hit special cases) */
  moveName: string;
  /** move base accuracy; 0 = never misses (does not check accuracy) */
  baseAccuracy: number;
  category: MoveCategory;
  attacker: AccuracySide;
  defender: AccuracySide;
  /** target's types, only needed to gate OHKO type blocks (Normal vs Ghost ...) */
  defenderTypes?: TypeName[];
  weather?: Weather;
  /** Gravity active: accuracy x5/3 */
  gravity?: boolean;
  /** attacker ability is Mold Breaker / Teravolt / Turboblaze */
  ignoresAbilities?: boolean;
  /** attacker acted after the target (Zoom Lens x1.2) */
  movedAfterTarget?: boolean;
}

export interface HitChanceResult {
  /** final probability to hit, 0..1 (never-miss/OHKO bypass the [33%,100%] band) */
  chance: number;
  /** move cannot miss (never-miss base, weather always-hit, or No Guard) */
  always: boolean;
  /** human-readable list of what was applied, in application order */
  notes: string[];
  /** set when the move can never connect (e.g. a Normal OHKO vs a Ghost) */
  impossible?: string;
}

const OHKO_MOVES = new Set(["Fissure", "Guillotine", "Horn Drill", "Sheer Cold"]);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Type-based OHKO blocks: these moves can never connect vs that typing. */
function ohkoTypeBlock(moveName: string, defenderTypes: TypeName[]): TypeName | undefined {
  if ((moveName === "Guillotine" || moveName === "Horn Drill") && defenderTypes.includes("Ghost")) return "Ghost";
  if (moveName === "Fissure" && defenderTypes.includes("Flying")) return "Flying";
  if (moveName === "Sheer Cold" && defenderTypes.includes("Ice")) return "Ice";
  return undefined;
}

export function hitChance(params: HitChanceParams): HitChanceResult {
  const { attacker, defender, baseAccuracy, category, moveName } = params;
  const notes: string[] = [];
  const isOhko = OHKO_MOVES.has(moveName);

  const atkAbility = attacker.ability;
  const defAbility = defender.ability;

  // ---- hard "cannot connect" gates first: a type-blocked OHKO fails even
  // under No Guard (Normal still can't touch Ghost) ----
  if (isOhko) {
    const blockedBy = ohkoTypeBlock(moveName, params.defenderTypes ?? []);
    if (blockedBy) {
      return {
        chance: 0,
        always: false,
        notes: [`${moveName}: OHKO has no effect on ${blockedBy}-types`],
        impossible: `${moveName} cannot hit the ${blockedBy}-type target`,
      };
    }
  }

  // ---- forced hits, resolved before any accuracy math ----
  const rainLike = params.weather === "rain" || params.weather === "primordial";
  const weatherAlways =
    (params.weather === "hail" && moveName === "Blizzard") ||
    (rainLike && (moveName === "Thunder" || moveName === "Hurricane"));
  const noGuard = atkAbility === "No Guard" || defAbility === "No Guard";
  if (noGuard) notes.push("No Guard");
  if (weatherAlways) notes.push(`${params.weather} makes ${moveName} always hit`);
  if (baseAccuracy === 0) notes.push(`${moveName} does not check accuracy`);
  if (noGuard || weatherAlways || baseAccuracy === 0) {
    return { chance: 1, always: true, notes };
  }

  // ---- one-hit KO moves: flat 30%, always. Calcs are only ever run at equal
  // level (50v50 / 100v100), so there is no level-diff term. OHKO moves ignore
  // every evasion / accuracy multiplier (stages, items, abilities) and also the
  // 33% floor — 30% is the true in-game chance. No Guard is already handled
  // above (it forces these to connect too). ----
  if (isOhko) {
    notes.push(`${moveName}: OHKO accuracy 30%, ignores all modifiers`);
    return { chance: 0.3, always: false, notes };
  }

  // ---- ordinary accuracy chain ----
  // In harsh sunlight Thunder/Hurricane drop to 50% (weather overrides base)
  let base = baseAccuracy;
  if (params.weather === "desolate" && (moveName === "Thunder" || moveName === "Hurricane")) {
    base = 50;
    notes.push("harsh sun: Thunder/Hurricane accuracy drops to 50%");
  }
  let p = base / 100;

  // 1. accuracy (attacker) vs evasion (defender) stat stages. Each is capped
  //    +/-6, the net is capped +/-6, then the 3/(3+net) table applies.
  const accStage = clamp(attacker.stage ?? 0, -6, 6);
  const evaStage = clamp(defender.stage ?? 0, -6, 6);
  const net = clamp(accStage - evaStage, -6, 6);
  if (net !== 0) {
    const factor = net > 0 ? (3 + net) / 3 : 3 / (3 - net);
    p *= factor;
    notes.push(`stage +${net > 0 ? net : -net}${net > 0 ? " (favor attacker)" : " (favor defender)"}: x${factor}`);
  }

  // 2. attacker items
  if (attacker.item === "Wide Lens") { p *= 1.1; notes.push("Wide Lens x1.1"); }
  if (attacker.item === "Zoom Lens") {
    if (params.movedAfterTarget) { p *= 1.2; notes.push("Zoom Lens x1.2 (moved last)"); }
    else notes.push("Zoom Lens (no boost: did not move last)");
  }
  if (attacker.item === "Micle Berry") {
    if (attacker.atLowHp) { p *= 1.2; notes.push("Micle Berry x1.2 (<=1/4 HP)"); }
    else notes.push("Micle Berry (no boost: HP above 1/4)");
  }

  // 3. defender items
  if (defender.item === "Bright Powder" || defender.item === "Lax Incense") {
    p *= 0.9;
    notes.push(`${defender.item} x0.9`);
  }

  // 4. attacker abilities
  if (atkAbility === "Compound Eyes") { p *= 1.3; notes.push("Compound Eyes x1.3"); }
  else if (atkAbility === "Victory Star") { p *= 1.1; notes.push("Victory Star x1.1"); }
  if (atkAbility === "Hustle" && category === "Physical") {
    p *= 0.8;
    notes.push("Hustle x0.8 (physical)");
  }

  // 5. defender abilities (bypassed by Mold Breaker / Teravolt / Turboblaze)
  const mbFamily = ["Mold Breaker", "Teravolt", "Turboblaze"];
  const useDefAbility = !(params.ignoresAbilities || mbFamily.includes(atkAbility));
  if (useDefAbility) {
    if (defAbility === "Sand Veil" && params.weather === "sand") { p *= 0.8; notes.push("Sand Veil x0.8 (sandstorm)"); }
    if (defAbility === "Snow Cloak" && params.weather === "hail") { p *= 0.8; notes.push("Snow Cloak x0.8 (hail)"); }
    if (defAbility === "Tangled Feet" && defender.confused) { p *= 0.5; notes.push("Tangled Feet x0.5 (confused)"); }
  } else if (defAbility === "Sand Veil" || defAbility === "Snow Cloak" || defAbility === "Tangled Feet") {
    notes.push(`${defAbility} bypassed (Mold Breaker family)`);
  }

  // 6. Gravity
  if (params.gravity) {
    p *= 5 / 3;
    notes.push("Gravity x5/3");
  }

  // hard band: never below 33%, never above 100%
  const raw = p;
  const chance = clamp(p, 1 / 3, 1);
  if (raw < 1 / 3) notes.push("floor: chance clamped to 33%");
  if (raw > 1) notes.push("cap: chance clamped to 100%");

  return { chance, always: false, notes };
}
