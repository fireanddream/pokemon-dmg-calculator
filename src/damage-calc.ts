import type { BaseStats, Move, MoveCategory, TypeName } from "./types.js";

export type Weather =
  | "sun" | "rain" | "sand" | "hail"      // ordinary weather (chips sand/hail)
  | "desolate" | "primordial" | "delta";  // Primal Groudon / Primal Kyogre / Mega Rayquaza
export type Terrain = "electric" | "grassy" | "misty" | "psychic";
export type StatusName = "brn" | "par" | "slp" | "frz" | "psn" | "tox";
export type StatStageKey = "atk" | "def" | "spa" | "spd" | "spe";
export type Gender = "M" | "F" | "N";

export interface Combatant {
  name: string;
  types: TypeName[];
  level: number;
  /** final stats at level (pre-boost, i.e. nature/EV/IV applied) */
  stats: BaseStats;
  ability: string;
  /** empty string = no item */
  item?: string;
  status?: StatusName;
  /** stat stage changes, -6..6 */
  boosts?: Partial<Record<StatStageKey, number>>;
  /** current HP / max HP, 0..1 (default 1 = full HP) */
  hpFraction?: number;
  gender?: Gender;
  weightKg?: number;
  /** "turned on" transient abilities (Flash Fire, Slow Start, Unburden...) */
  abilityOn?: boolean;
}

export interface DamageParams {
  attacker: Combatant;
  defender: Combatant;
  move: Move;
  chart: Map<TypeName, Map<TypeName, number>>;
  crit?: boolean;
  weather?: Weather;
  terrain?: Terrain;
  /** screens on the DEFENDER's side */
  screens?: "reflect" | "light";
  /** whether the target actually holds an item (Knock Off) */
  targetHoldsItem?: boolean;
  /** attacker moved after the target (Analytic); never auto-inferred from speed */
  movedAfterTarget?: boolean;
  /** attacker has already been hit by Fire (Flash Fire boost) */
  flashFireBoosted?: boolean;
  /**
   * HP already lost before this attack (e.g. Stealth Rock/Spikes at
   * switch-in). Used for full-HP checks like Multiscale.
   */
  damageTakenBefore?: number;
  /** attacker's moves ignore defender abilities (Mold Breaker etc.) */
  ignoresAbilities?: boolean;
  doubles?: boolean;
  powerOverride?: number;
}

export interface DamageResult {
  min: number;
  max: number;
  rolls: number[];
  maxHpPctOfDefender: number;
  applied: string[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// fixed-point helpers from the Showdown damage engine (gen 4+)
// ---------------------------------------------------------------------------
export function pokeRound(num: number): number {
  return num % 1 > 0.5 ? Math.ceil(num) : Math.floor(num);
}
function OF16(n: number): number {
  return n > 65535 ? n % 65536 : n;
}
function OF32(n: number): number {
  return n > 4294967295 ? n % 4294967296 : n;
}

/** Chain a list of 4096-based mods into one fixed-point number. */
function chainMods(mods: number[], lowerBound: number, upperBound: number): number {
  let M = 4096;
  for (const mod of mods) {
    if (mod !== 4096) M = (M * mod + 2048) >> 12;
  }
  return Math.max(Math.min(M, upperBound), lowerBound);
}

const MODERN_BOOST_TABLE: readonly [number, number][] = [
  [2, 8], [2, 7], [2, 6], [2, 5], [2, 4], [2, 3], [2, 2],
  [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2],
];

/** stat value after a -6..+6 stage boost (gen4+ formula) */
export function getModifiedStat(stat: number, boost: number): number {
  const row = MODERN_BOOST_TABLE[6 + boost] ?? MODERN_BOOST_TABLE[6]!;
  let s = OF16(stat * row[0]);
  s = Math.floor(s / row[1]);
  return s;
}

export function statStageMultiplier(stage: number): number {
  if (stage >= 0) return (2 + stage) / 2;
  return 2 / (2 - stage);
}

export function getBaseDamage(level: number, basePower: number, attack: number, defense: number): number {
  return Math.floor(
    OF32(Math.floor(OF32(OF32(Math.floor((2 * level) / 5 + 2) * basePower) * attack) / defense) / 50 + 2)
  );
}

/** Per-roll damage (85%..100% indexed by rollIndex) applying STAB/type/burn/final mods. */
export function getFinalDamage(
  baseDamage: number, rollIndex: number, typeEff: number, isBurned: boolean,
  stabMod: number, finalMod: number
): number {
  let damageAmount = Math.floor(OF32(baseDamage * (85 + rollIndex)) / 100);
  if (stabMod !== 4096) damageAmount = OF32(damageAmount * stabMod) / 4096;
  damageAmount = Math.floor(OF32(pokeRound(damageAmount) * typeEff));
  if (isBurned) damageAmount = Math.floor(damageAmount / 2);
  return OF16(pokeRound(Math.max(1, OF32(damageAmount * finalMod) / 4096)));
}

function getStabMod(attacker: Combatant, type: TypeName): number {
  let stabMod = 4096;
  if (hasType(attacker, type)) {
    stabMod += 2048;
  } else if (hasAbility(attacker, "Protean")) {
    stabMod += 2048;
  }
  if (hasAbility(attacker, "Adaptability") && hasType(attacker, type)) {
    stabMod += 2048;
  }
  return stabMod;
}

/**
 * Type change from Normal-remap abilities: Aerilate -> Flying, Pixilate ->
 * Fairy, Refrigerate -> Ice (all only on Normal-type moves), Normalize -> the
 * move becomes Normal. Judgment / Nature Power / Techno Blast / Natural Gift /
 * Weather Ball / Struggle are never remapped.
 */
export function remapMoveType(attacker: Combatant, move: Move): { type: TypeName; ate: boolean } {
  let type = move.type as TypeName;
  if (!named(move, "Judgment", "Nature Power", "Techno Blast", "Natural Gift", "Weather Ball", "Struggle")) {
    const normal = type === "Normal";
    if (normal && hasAbility(attacker, "Aerilate")) { type = "Flying"; return { type, ate: true }; }
    if (normal && hasAbility(attacker, "Pixilate")) { type = "Fairy"; return { type, ate: true }; }
    if (normal && hasAbility(attacker, "Refrigerate")) { type = "Ice"; return { type, ate: true }; }
    if (hasAbility(attacker, "Normalize")) { type = "Normal"; return { type, ate: false }; }
  }
  return { type, ate: false };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function hasType(c: Combatant, t: TypeName): boolean {
  return c.types.includes(t);
}
function hasAbility(c: Combatant, ...names: string[]): boolean {
  return c.ability.length > 0 && names.includes(c.ability);
}
function hasItem(c: Combatant, ...names: string[]): boolean {
  const it = c.item ?? "";
  return it.length > 0 && names.includes(it);
}
function hasFlag(move: Move, flag: string): boolean {
  return move.flags.includes(flag);
}
function named(move: Move, ...names: string[]): boolean {
  return names.includes(move.name);
}
function statBoost(c: Combatant, key: StatStageKey): number {
  return c.boosts?.[key] ?? 0;
}

/** Current stat value after level/nature/EVs (in c.stats) AND stat-stage boosts. */
function currentStat(c: Combatant, key: StatStageKey): number {
  return getModifiedStat(c.stats[key], statBoost(c, key));
}

/** Sum of positive stat-stage boosts across atk/def/spa/spd/spe (no HP). */
function countPositiveBoosts(c: Combatant): number {
  let sum = 0;
  for (const s of ["atk", "def", "spa", "spd", "spe"] as StatStageKey[]) {
    const b = c.boosts?.[s] ?? 0;
    if (b > 0) sum += b;
  }
  return sum;
}
function hpMax(c: Combatant): number {
  return c.stats.hp;
}
function curHp(c: Combatant): number {
  return Math.max(0, Math.floor((c.hpFraction ?? 1) * hpMax(c)));
}
function isStatused(c: Combatant): boolean {
  return c.status !== undefined;
}

// fixed-point factors
const M2 = 8192;
const M1_5 = 6144;
const M1_3 = 5325;
const M1_2 = 4915;
const M1_1 = 4505;
const M1_25 = 5120;
const M0_75 = 3072;
const M0_5 = 2048;

const TYPE_BOOST_ITEMS: Record<string, TypeName> = {
  "Adamant Orb": "Dragon", "Black Belt": "Fighting", "Black Glasses": "Dark",
  "Charcoal": "Fire", "Dragon Fang": "Dragon", "Hard Stone": "Rock",
  "Magnet": "Electric", "Metal Coat": "Steel", "Miracle Seed": "Grass",
  "Mystic Water": "Water", "Never-Melt Ice": "Ice", "Poison Barb": "Poison",
  "Sharp Beak": "Flying", "Silk Scarf": "Normal", "Silver Powder": "Bug",
  "Soft Sand": "Ground", "Spell Tag": "Ghost", "Twisted Spoon": "Psychic",
  "Pixie Plate": "Fairy", "Dread Plate": "Dark", "Draco Plate": "Dragon",
  "Earth Plate": "Ground", "Fist Plate": "Fighting", "Flame Plate": "Fire",
  "Icicle Plate": "Ice", "Insect Plate": "Bug", "Iron Plate": "Steel",
  "Meadow Plate": "Grass", "Mind Plate": "Psychic", "Sky Plate": "Flying",
  "Splash Plate": "Water", "Spooky Plate": "Ghost", "Stone Plate": "Rock",
  "Toxic Plate": "Poison", "Zap Plate": "Electric",
};

/** one-time damage-reducing berries: halve a super-effective hit of their type (gen 6). */
export const RESIST_BERRIES: Record<string, TypeName> = {
  "Chilan Berry": "Normal", "Occa Berry": "Fire", "Passho Berry": "Water",
  "Wacan Berry": "Electric", "Rindo Berry": "Grass", "Yache Berry": "Ice",
  "Chople Berry": "Fighting", "Kebia Berry": "Poison", "Shuca Berry": "Ground",
  "Coba Berry": "Flying", "Payapa Berry": "Psychic", "Tanga Berry": "Bug",
  "Charti Berry": "Rock", "Kasib Berry": "Ghost", "Haban Berry": "Dragon",
  "Colbur Berry": "Dark", "Babiri Berry": "Steel", "Roseli Berry": "Fairy",
};

/** Check if a resist berry triggers on a given move type vs defender types. */
export function resistBerryActivates(
  moveType: TypeName,
  defenderTypes: TypeName[],
  defenderItem: string | undefined,
): boolean {
  const berryType = RESIST_BERRIES[defenderItem ?? ""];
  if (!berryType) return false;
  if (berryType !== moveType) return false;
  // Chilan Berry activates on any Normal-type move; others only when super-effective
  if (berryType === "Normal") return true;
  // compute type effectiveness of moveType vs defenderTypes
  // simplified: check if moveType is SE against any single defender type
  // (defensive dual-type chart would need full multiplier; use a simplified check)
  const sePairs: [TypeName, TypeName][] = [
    ["Fire", "Grass"], ["Fire", "Ice"], ["Fire", "Bug"], ["Fire", "Steel"],
    ["Water", "Fire"], ["Water", "Ground"], ["Water", "Rock"],
    ["Electric", "Water"], ["Electric", "Flying"],
    ["Grass", "Water"], ["Grass", "Ground"], ["Grass", "Rock"],
    ["Ice", "Grass"], ["Ice", "Ground"], ["Ice", "Flying"], ["Ice", "Dragon"],
    ["Fighting", "Normal"], ["Fighting", "Rock"], ["Fighting", "Ice"], ["Fighting", "Steel"], ["Fighting", "Dark"],
    ["Poison", "Grass"], ["Poison", "Fairy"],
    ["Ground", "Fire"], ["Ground", "Electric"], ["Ground", "Poison"], ["Ground", "Rock"], ["Ground", "Steel"],
    ["Flying", "Grass"], ["Flying", "Fighting"], ["Flying", "Bug"],
    ["Psychic", "Fighting"], ["Psychic", "Poison"],
    ["Bug", "Grass"], ["Bug", "Psychic"], ["Bug", "Dark"],
    ["Rock", "Fire"], ["Rock", "Ice"], ["Rock", "Flying"], ["Rock", "Bug"],
    ["Ghost", "Psychic"], ["Ghost", "Ghost"],
    ["Dragon", "Dragon"],
    ["Dark", "Psychic"], ["Dark", "Ghost"],
    ["Steel", "Ice"], ["Steel", "Rock"], ["Steel", "Fairy"],
    ["Fairy", "Fighting"], ["Fairy", "Dragon"], ["Fairy", "Dark"],
  ];
  return defenderTypes.some((dt) => sePairs.some(([a, b]) => a === moveType && b === dt));
}

/** Move name -> boosted-by-Reckless check is handled in calcBasePower via flags? We approximate via name list below. */

// ---------------------------------------------------------------------------
// main calculation
// ---------------------------------------------------------------------------
export function calcDamage(params: DamageParams): DamageResult {
  const notes: string[] = [];
  const { attacker, defender, move } = params;
  // Shell Armor / Battle Armor block critical hits outright (Mold Breaker
  // does NOT bypass them - they are not damage-mitigating for MB).
  let isCrit = (params.crit ?? false) && !hasAbility(defender, "Shell Armor", "Battle Armor");
  const doubles = params.doubles ?? false;

  if (move.category === "Non-Damaging") {
    return empty(notes, "Non-damaging move.");
  }

  // Air Lock / Cloud Nine remove weather
  let weather = params.weather;
  if (hasAbility(attacker, "Air Lock", "Cloud Nine") || hasAbility(defender, "Air Lock", "Cloud Nine")) {
    weather = undefined;
  }

  const sunLike = weather === "sun" || weather === "desolate";
  const rainLike = weather === "rain" || weather === "primordial";

  // primal weather: the opposing element's moves fail outright
  if (weather === "desolate" && (move.type as TypeName) === "Water") {
    return empty(notes, `${move.name}: Water-type moves fail under Harsh Sunshine.`);
  }
  if (weather === "primordial" && (move.type as TypeName) === "Fire") {
    return empty(notes, `${move.name}: Fire-type moves fail under Heavy Rain.`);
  }

  // ---- type effectiveness ----
  // Normal-remap abilities (Aerilate/Pixilate/Refrigerate) change the move's
  // actual type, so effectiveness, immunities and STAB all key off the
  // remapped type, not the original Normal typing. Weather Ball changes type
  // with the weather instead (its stored typing is Normal).
  const effType = named(move, "Weather Ball")
    ? resolveWeatherBall(weather).type
    : remapMoveType(attacker, move).type;
  let typeEff = 1;
  for (const defType of defender.types) {
    let v: number;
    if (named(move, "Freeze-Dry") && defType === "Water") v = 2;
    else v = params.chart.get(effType)?.get(defType) ?? 1;
    // Delta Stream: Flying's Rock/Electric/Ice weaknesses are neutralised
    if (weather === "delta" && defType === "Flying" && (
      effType === "Rock" || effType === "Electric" || effType === "Ice"
    )) {
      v = 1;
    }
    // Iron Ball grounds the holder: Ground moves connect against a grounded Flying
    if (effType === "Ground" && defType === "Flying" && hasItem(defender, "Iron Ball")) {
      v = 1;
    } else if (v === 0) {
      // Typing immunities are negated by Ring Target on the holder, or by
      // Scrappy when the attacker's Normal/Fighting move hits a Ghost.
      if (hasItem(defender, "Ring Target")) v = 1;
      else if (hasAbility(attacker, "Scrappy") && (effType === "Normal" || effType === "Fighting") && defType === "Ghost") v = 1;
    }
    typeEff *= v;
  }
  if (typeEff === 0) return empty(notes, `${move.name}: type immunity vs ${defender.types.join("/")}.`);
  // Air Balloon makes the holder immune to Ground until it is hit (single-hit
  // view: intact for this Ground attack). Not an ability, so Mold Breaker and
  // Iron Ball (attacker) do not bypass it.
  if (effType === "Ground" && hasItem(defender, "Air Balloon")) {
    return empty(notes, "Air Balloon: Ground immunity while intact.");
  }

  // ---- immunity abilities ----
  const ignores = params.ignoresAbilities || hasAbility(attacker, "Mold Breaker", "Teravolt", "Turboblaze");
  const canUseDefAbility = !ignores;
  if (canUseDefAbility) {
    if (hasAbility(defender, "Wonder Guard") && typeEff <= 1) return empty(notes, "Wonder Guard.");
    if (hasFlag(move, "Bullet") && hasAbility(defender, "Bulletproof")) return empty(notes, "Bulletproof.");
    if (hasFlag(move, "Sound") && hasAbility(defender, "Soundproof")) return empty(notes, "Soundproof.");
    if (effType === "Grass" && hasAbility(defender, "Sap Sipper")) return empty(notes, "Sap Sipper.");
    if (effType === "Fire" && hasAbility(defender, "Flash Fire")) return empty(notes, "Flash Fire.");
    if (effType === "Water" && hasAbility(defender, "Dry Skin", "Storm Drain", "Water Absorb")) return empty(notes, `${defender.ability} absorbed the Water move.`);
    if (effType === "Electric" && hasAbility(defender, "Lightning Rod", "Motor Drive", "Volt Absorb")) return empty(notes, `${defender.ability} absorbed the Electric move.`);
    // Iron Ball grounds the holder, so Levitate no longer protects it
    if (effType === "Ground" && !hasItem(defender, "Iron Ball") && hasAbility(defender, "Levitate")) return empty(notes, "Levitate.");
  }

  // ---- type-changing abilities + power resolution ----
  const typeCtx = resolveTypeAndPower(params, weather);
  if (typeCtx.power <= 0) {
    return empty(notes, `${move.name}: no base power (fixed-damage/utility moves not rolled here).`);
  }

  // ---- effective attack / defense ----
  const attackStat: StatStageKey = move.category === "Physical" ? "atk" : "spa";
  const defenseStat: StatStageKey = move.category === "Physical" ? "def" : "spd";

  let atkBoost = statBoost(attacker, attackStat);
  let defBoost = statBoost(defender, defenseStat);
  if (isCrit) {
    atkBoost = Math.max(0, atkBoost);
    defBoost = Math.min(0, defBoost);
  }

  const attack =
    hasAbility(defender, "Unaware") && !ignores
      ? attacker.stats[attackStat]
      : getModifiedStat(attacker.stats[attackStat], atkBoost);
  let defense =
    hasAbility(attacker, "Unaware")
      ? defender.stats[defenseStat]
      : getModifiedStat(defender.stats[defenseStat], defBoost);

  // Hustle
  let attackFinal = attack;
  if (hasAbility(attacker, "Hustle") && move.category === "Physical") {
    attackFinal = pokeRound((attackFinal * 3) / 2);
  }

  // attacker attack modifiers (gen5/6 constants)
  const atMods: number[] = [];
  if (hasAbility(defender, "Thick Fat") && !ignores && (typeCtx.type === "Fire" || typeCtx.type === "Ice")) {
    atMods.push(M0_5);
  }
  if (
    (hasAbility(attacker, "Guts") && isStatused(attacker) && move.category === "Physical") ||
    (curHp(attacker) <= Math.floor(hpMax(attacker) / 3) &&
      ((hasAbility(attacker, "Overgrow") && typeCtx.type === "Grass") ||
        (hasAbility(attacker, "Blaze") && typeCtx.type === "Fire") ||
        (hasAbility(attacker, "Torrent") && typeCtx.type === "Water") ||
        (hasAbility(attacker, "Swarm") && typeCtx.type === "Bug")))
  ) {
    atMods.push(M1_5);
  } else if (hasAbility(attacker, "Flash Fire") && (attacker.abilityOn || params.flashFireBoosted) && typeCtx.type === "Fire") {
    atMods.push(M1_5);
  } else if (hasAbility(attacker, "Solar Power") && sunLike && move.category === "Special") {
    atMods.push(M1_5);
  } else if (
    (hasAbility(attacker, "Defeatist") && curHp(attacker) <= Math.floor(hpMax(attacker) / 2)) ||
    (hasAbility(attacker, "Slow Start") && attacker.abilityOn)
  ) {
    atMods.push(M0_5);
  } else if (hasAbility(attacker, "Huge Power", "Pure Power") && move.category === "Physical") {
    atMods.push(M2);
  }
  // species-locked stat-multiplier items (gen 6)
  if (move.category === "Physical" && hasItem(attacker, "Thick Club") && (attacker.name === "Marowak" || attacker.name === "Cubone")) atMods.push(M2);
  if (hasItem(attacker, "Light Ball") && attacker.name === "Pikachu") atMods.push(M2); // Atk & SpA (gen 4-6)
  if (move.category === "Special" && hasItem(attacker, "Deep Sea Tooth") && attacker.name === "Clamperl") atMods.push(M2);
  if (move.category === "Special" && hasItem(attacker, "Soul Dew") && (attacker.name === "Latios" || attacker.name === "Latias")) atMods.push(M1_5);
  // Rivalry: same gender x1.25, opposite x0.75; nothing vs a genderless side
  if (hasAbility(attacker, "Rivalry") && attacker.gender && defender.gender &&
      attacker.gender !== "N" && defender.gender !== "N") {
    atMods.push(attacker.gender === defender.gender ? M1_25 : M0_75);
  }
  if (hasItem(attacker, "Choice Band") && move.category === "Physical") atMods.push(M1_5);
  if (hasItem(attacker, "Choice Specs") && move.category === "Special") atMods.push(M1_5);
  attackFinal = OF16(Math.max(1, pokeRound((attackFinal * chainMods(atMods, 410, 131072)) / 4096)));

  // defender defense modifiers
  const dfMods: number[] = [];
  if (hasAbility(defender, "Marvel Scale") && !ignores && isStatused(defender) && move.category === "Physical") dfMods.push(M1_5);
  if (hasItem(defender, "Assault Vest") && move.category === "Special") dfMods.push(M1_5);
  if (hasItem(defender, "Eviolite")) dfMods.push(M1_5);
  if (hasAbility(defender, "Fur Coat") && !ignores && move.category === "Physical") dfMods.push(M2);
  if (hasAbility(defender, "Grass Pelt") && !ignores && params.terrain === "grassy" && move.category === "Physical") dfMods.push(M1_5);
  if (hasItem(defender, "Deep Sea Scale") && defender.name === "Clamperl" && move.category === "Special") dfMods.push(M2);
  if (hasItem(defender, "Soul Dew") && (defender.name === "Latios" || defender.name === "Latias") && move.category === "Special") dfMods.push(M1_5);
  defense = OF16(Math.max(1, pokeRound((defense * chainMods(dfMods, 410, 131072)) / 4096)));

  // ---- base damage ----
  let baseDamage = getBaseDamage(attacker.level, typeCtx.power, attackFinal, defense);
  if ((sunLike && typeCtx.type === "Fire") || (rainLike && typeCtx.type === "Water")) {
    baseDamage = pokeRound(OF32((baseDamage * M1_5) / 4096));
  } else if ((sunLike && typeCtx.type === "Water") || (rainLike && typeCtx.type === "Fire")) {
    baseDamage = pokeRound(OF32((baseDamage * M0_5) / 4096));
  }
  if (isCrit) baseDamage = Math.floor(OF32(baseDamage * 1.5));

  // ---- final mods ----
  const finalMods: number[] = [];
  const ignoreScreens = hasAbility(attacker, "Infiltrator");
  if (params.screens === "reflect" && move.category === "Physical" && !isCrit && !ignoreScreens) finalMods.push(doubles ? 2732 : M0_5);
  if (params.screens === "light" && move.category === "Special" && !isCrit && !ignoreScreens) finalMods.push(doubles ? 2732 : M0_5);
  // Multiscale only at full HP: hazards/prior damage taken before the attack
  // (params.damageTakenBefore) mean the defender is no longer full.
  const multiscaleFull =
    !(params.damageTakenBefore ?? 0) && curHp(defender) === hpMax(defender);
  if (hasAbility(defender, "Multiscale") && !ignores && multiscaleFull) finalMods.push(M0_5);
  if (hasAbility(attacker, "Tinted Lens") && typeEff < 1) finalMods.push(M2);
  if (hasAbility(attacker, "Sniper") && isCrit) finalMods.push(M1_5);
  if (hasAbility(defender, "Solid Rock", "Filter") && !ignores && typeEff > 1) finalMods.push(M0_75);

  // One-time damage-reducing berries: halve super-effective hit of matching type
  const resistBerry = RESIST_BERRIES[defender.item ?? ""];
  if (resistBerry === typeCtx.type && !hasAbility(attacker, "Unnerve") &&
      (typeEff > 1 || resistBerry === "Normal")) {
    finalMods.push(M0_5);
  }

  if (hasItem(attacker, "Expert Belt") && typeEff > 1) finalMods.push(M1_2);
  else if (hasItem(attacker, "Life Orb")) finalMods.push(5324);
  const finalMod = chainMods(finalMods, 41, 131072);

  // Parental Bond: two hits, second at half power
  const parent = hasAbility(attacker, "Parental Bond");
  let childBase = baseDamage;
  if (parent) {
    // second hit uses half base power
    const childParams = params;
    void childParams;
    const childBaseDamage = getBaseDamage(attacker.level, typeCtx.power, attackFinal, defense);
    childBase = pokeRound(OF32((childBaseDamage * M0_5) / 4096));
    if (isCrit) childBase = Math.floor(OF32(childBase * 1.5));
  }

  const stabMod = getStabMod(attacker, effType);
  const isBurned = attacker.status === "brn" && move.category === "Physical" && !hasAbility(attacker, "Guts");

  const makeRolls = (bd: number) => {
    const out: number[] = [];
    for (let i = 0; i < 16; i++) out.push(getFinalDamage(bd, i, typeEff, isBurned, stabMod, finalMod));
    return out;
  };

  let finalRolls = makeRolls(baseDamage);
  if (parent) {
    const second = makeRolls(childBase);
    finalRolls = finalRolls.map((r, i) => r + second[i]!);
    notes.push("Parental Bond: two hits (second at half power).");
  }

  const min = Math.min(...finalRolls);
  const max = Math.max(...finalRolls);
  const maxHp = defender.stats.hp;
  return {
    min, max, rolls: finalRolls,
    maxHpPctOfDefender: maxHp > 0 ? Math.round((max / maxHp) * 1000) / 10 : 0,
    applied: [],
    notes,
  };
}

interface TypePowerCtx {
  type: TypeName;
  power: number;
}

function resolveTypeAndPower(params: DamageParams, weather: Weather | undefined): TypePowerCtx {
  const { attacker, defender, move } = params;
  let type = move.type as TypeName;
  let power = params.powerOverride ?? move.power;

  // weight/speed/state-based power (data stores some of these as 0 BP)
  if (params.powerOverride === undefined) {
    if (named(move, "Heavy Slam", "Heat Crash")) {
      power = heavySlamPower(attacker.weightKg ?? 0, defender.weightKg ?? 0);
    } else if (named(move, "Low Kick", "Grass Knot")) {
      power = lowKickPower(defender.weightKg ?? 0);
    } else if (named(move, "Electro Ball")) {
      power = electroBallPower(currentStat(attacker, "spe"), currentStat(defender, "spe"));
    } else if (named(move, "Gyro Ball")) {
      power = gyroBallPower(currentStat(attacker, "spe"), currentStat(defender, "spe"));
    } else if (named(move, "Weather Ball")) {
      // 50 BP Normal normally; 100 BP of the weather's type while weather is up
      power = resolveWeatherBall(weather).power;
    } else if (named(move, "Payback")) {
      // doubles when the user moves after the target (current-speed ordering)
      power = move.power * (currentStat(attacker, "spe") <= currentStat(defender, "spe") ? 2 : 1);
    } else if (named(move, "Wake-Up Slap") && defender.status === "slp") {
      power = move.power * 2;
    } else if (named(move, "Smelling Salts") && defender.status === "par") {
      power = move.power * 2;
    } else if (named(move, "Eruption", "Water Spout")) {
      power = Math.max(1, Math.floor((150 * curHp(attacker)) / hpMax(attacker)));
    } else if (named(move, "Flail", "Reversal")) {
      const p = Math.floor((48 * curHp(attacker)) / hpMax(attacker));
      power = p <= 1 ? 200 : p <= 4 ? 150 : p <= 9 ? 100 : p <= 16 ? 80 : p <= 32 ? 40 : 20;
    } else if (named(move, "Crush Grip", "Wring Out")) {
      const f = Math.floor((curHp(defender) * 4096) / Math.max(hpMax(defender), 1));
      power = Math.max(1, Math.floor(Math.floor((120 * (f * 100) + 2047) / 4096) / 100));
    } else if (named(move, "Stored Power", "Power Trip")) {
      power = 20 + 20 * countPositiveBoosts(attacker);
    } else if (named(move, "Punishment")) {
      power = Math.min(200, 60 + 20 * countPositiveBoosts(defender));
    }
  }
  if (power === 0) {
    if (named(move, "Return", "Frustration")) power = 102; // max happiness
  }
  let ate = false;
  ({ type, ate } = remapMoveType(attacker, move));
  // Weather Ball's type tracks the weather (Fire/Water/Ice/Rock), not its
  // stored Normal typing — this drives the STAB/type-mod checks below.
  if (named(move, "Weather Ball")) type = resolveWeatherBall(weather).type;

  // conditional move power
  if (named(move, "Knock Off") && params.targetHoldsItem) power *= 1.5;
  if (named(move, "Acrobatics") && !attacker.item) power *= 2;
  if (named(move, "Facade") && attacker.status !== undefined &&
    ["brn", "par", "psn", "tox"].includes(attacker.status)) power *= 2;
  if (named(move, "Venoshock") && (defender.status === "psn" || defender.status === "tox")) power *= 2;
  if (named(move, "Hex") && defender.status !== undefined) power *= 2;

  const bpMods: number[] = [];
  if (
    (hasAbility(attacker, "Technician") && power <= 60) ||
    (hasAbility(attacker, "Flare Boost") && attacker.status === "brn" && move.category === "Special") ||
    (hasAbility(attacker, "Toxic Boost") && (attacker.status === "psn" || attacker.status === "tox") && move.category === "Physical")
  ) {
    bpMods.push(M1_5);
  } else if (hasAbility(attacker, "Analytic") && params.movedAfterTarget) {
    bpMods.push(M1_3);
  } else if (hasAbility(attacker, "Sand Force") && weather === "sand" &&
    (type === "Rock" || type === "Ground" || type === "Steel")) {
    bpMods.push(M1_3);
  } else if (hasAbility(attacker, "Reckless") && RECOIL_NAMES.has(move.name)) {
    bpMods.push(M1_2);
  } else if (hasAbility(attacker, "Iron Fist") && hasFlag(move, "Punch")) {
    bpMods.push(M1_2);
  }

  if (hasAbility(defender, "Heatproof") && type === "Fire") bpMods.push(M0_5);
  else if (hasAbility(defender, "Dry Skin") && type === "Fire") bpMods.push(M1_25);

  if (hasAbility(attacker, "Sheer Force") && SHEER_FORCE_MOVES.has(move.name)) bpMods.push(M1_3);

  // attacker item type boost / band
  const boostType = TYPE_BOOST_ITEMS[attacker.item ?? ""];
  if (boostType === type) {
    bpMods.push(M1_2);
  } else if ((hasItem(attacker, "Muscle Band") && move.category === "Physical") ||
    (hasItem(attacker, "Wise Glasses") && move.category === "Special")) {
    bpMods.push(M1_1);
  }

  if (ate) bpMods.push(M1_3);
  else if ((hasAbility(attacker, "Mega Launcher") && hasFlag(move, "Pulse")) ||
    (hasAbility(attacker, "Strong Jaw") && hasFlag(move, "Bite"))) {
    bpMods.push(M1_5);
  } else if (hasAbility(attacker, "Tough Claws") && hasFlag(move, "Contact")) {
    bpMods.push(M1_3);
  }

  // terrain boosts
  if (params.terrain === "electric" && type === "Electric") bpMods.push(M1_5);
  if (params.terrain === "grassy" && type === "Grass") bpMods.push(M1_5);
  if (params.terrain === "grassy" && named(move, "Bulldoze", "Earthquake")) bpMods.push(M0_5);
  if (params.terrain === "misty" && type === "Dragon") bpMods.push(M0_5);

  power = OF16(Math.max(1, pokeRound((power * chainMods(bpMods, 41, 2097152)) / 4096)));
  void defender;
  return { type, power };
}

const RECOIL_NAMES = new Set([
  "Brave Bird", "Double-Edge", "Flare Blitz", "Head Charge", "Head Smash",
  "Light of Ruin", "Submission", "Take Down", "Volt Tackle", "Wild Charge",
  "Wood Hammer", "Struggle",
]);

/**
 * Gen-6 moves whose chance-based secondary effect Sheer Force suppresses
 * (giving x1.3 and dropping the effect). Derived from @smogon/calc gen 6 via
 * scripts/_derive-sf.mjs — keep in sync with that oracle (verify-smogon.mjs).
 */
export const SHEER_FORCE_MOVES = new Set([
  "Acid", "Acid Spray", "Air Slash", "Ancient Power", "Aurora Beam", "Bite",
  "Blaze Kick", "Blizzard", "Blue Flare", "Body Slam", "Bolt Strike", "Bone Club",
  "Bounce", "Bubble", "Bubble Beam", "Bug Buzz", "Bulldoze", "Charge Beam",
  "Chatter", "Confusion", "Constrict", "Cross Poison", "Crunch", "Crush Claw",
  "Dark Pulse", "Diamond Storm", "Discharge", "Dizzy Punch", "Dragon Breath",
  "Dragon Rush", "Dynamic Punch", "Earth Power", "Electroweb", "Ember",
  "Energy Ball", "Extrasensory", "Fake Out", "Fiery Dance", "Fire Blast",
  "Fire Fang", "Fire Punch", "Flame Charge", "Flame Wheel", "Flamethrower",
  "Flare Blitz", "Flash Cannon", "Focus Blast", "Force Palm", "Freeze Shock",
  "Freeze-Dry", "Glaciate", "Gunk Shot", "Headbutt", "Heart Stamp", "Heat Wave",
  "Hurricane", "Hyper Fang", "Ice Beam", "Ice Burn", "Ice Fang", "Ice Punch",
  "Icicle Crash", "Icy Wind", "Inferno", "Iron Head", "Iron Tail", "Lava Plume",
  "Leaf Tornado", "Low Sweep", "Luster Purge", "Metal Claw", "Meteor Mash",
  "Mirror Shot", "Mist Ball", "Moonblast", "Mud Bomb", "Mud Shot", "Mud-Slap",
  "Muddy Water", "Mystical Fire", "Needle Arm", "Night Daze", "Nuzzle",
  "Octazooka", "Play Rough", "Poison Fang", "Poison Jab", "Poison Sting",
  "Poison Tail", "Powder Snow", "Power-Up Punch", "Psybeam", "Psychic",
  "Razor Shell", "Relic Song", "Rock Climb", "Rock Slide", "Rock Smash",
  "Rock Tomb", "Rolling Kick", "Sacred Fire", "Scald", "Searing Shot",
  "Secret Power", "Seed Flare", "Signal Beam", "Silver Wind", "Sky Attack",
  "Sludge", "Sludge Bomb", "Sludge Wave", "Smog", "Snarl", "Snore", "Spark",
  "Steam Eruption", "Steamroller", "Steel Wing", "Stomp", "Struggle Bug",
  "Thunder", "Thunder Fang", "Thunder Punch", "Thunder Shock", "Thunderbolt",
  "Tri Attack", "Twineedle", "Twister", "Volt Tackle", "Water Pulse",
  "Waterfall", "Zap Cannon", "Zen Headbutt",
]);

/** Heavy Slam / Heat Crash BP from the attacker:defender weight ratio (gen 5+). */
export function heavySlamPower(attackerKg: number, defenderKg: number): number {
  const ratio = attackerKg / Math.max(defenderKg, 0.0001);
  if (ratio >= 5) return 120;
  if (ratio >= 4) return 100;
  if (ratio >= 3) return 80;
  if (ratio >= 2) return 60;
  return 40;
}

/** Low Kick / Grass Knot BP from the target's weight (gen 5+). */
export function lowKickPower(targetKg: number): number {
  if (targetKg >= 200) return 120;
  if (targetKg >= 100) return 100;
  if (targetKg >= 50) return 80;
  if (targetKg >= 25) return 60;
  if (targetKg >= 10) return 40;
  return 20;
}

/** Electro Ball BP from the raw speed ratio attacker:defender (gen 5+). */
export function electroBallPower(atkSpe: number, defSpe: number): number {
  const r = Math.floor(atkSpe / Math.max(defSpe, 1));
  if (r >= 4) return 150;
  if (r >= 3) return 120;
  if (r >= 2) return 80;
  if (r >= 1) return 60;
  return 40;
}

/** Gyro Ball BP from defender:attacker raw speed, capped at 150 (gen 5+). */
export function gyroBallPower(atkSpe: number, defSpe: number): number {
  return Math.min(150, Math.floor((25 * defSpe) / Math.max(atkSpe, 1)) + 1);
}

/** Weather Ball (gen 6): while weather is up it is 100 BP with a matching type
 * — sun/desolate -> Fire, rain/primordial -> Water, hail -> Ice, sand -> Rock.
 * No weather (or Delta Stream) keeps Normal 50. Callers pass the already
 * Air-Lock/Cloud-Nine-suppressed weather so a nulled weather reads as Normal. */
export function resolveWeatherBall(weather: Weather | undefined): { type: TypeName; power: number } {
  if (weather === "sun" || weather === "desolate") return { type: "Fire", power: 100 };
  if (weather === "rain" || weather === "primordial") return { type: "Water", power: 100 };
  if (weather === "hail") return { type: "Ice", power: 100 };
  if (weather === "sand") return { type: "Rock", power: 100 };
  return { type: "Normal", power: 50 };
}

function empty(notes: string[], note: string): DamageResult {
  notes.push(note);
  return { min: 0, max: 0, rolls: [], maxHpPctOfDefender: 0, applied: [], notes };
}
