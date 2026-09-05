export const TIER_LADDER = [
  "AG",
  "Uber",
  "OU",
  "UUBL",
  "UU",
  "RUBL",
  "RU",
  "NUBL",
  "NU",
  "PUBL",
  "PU",
  "ZUBL",
  "ZU",
] as const;

export type Tier = (typeof TIER_LADDER)[number];

export const STAT_NAMES = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
export type StatName = (typeof STAT_NAMES)[number];

export type BaseStats = Record<StatName, number>;

export interface Nature {
  name: string;
  multipliers: BaseStats;
  summary: string;
}

export interface StatDumpData {
  meta: { source: string; generation: string; scope: string; count: number; generatedAt: string };
  natures: Nature[];
}

export interface IVs extends BaseStats {}
export interface EVs extends BaseStats {}

export interface Pokemon {
  name: string;
  baseForme: string;
  nationalDex: number;
  types: string[];
  abilities: string[];
  baseStats: BaseStats;
  bst: number;
  weightKg: number;
  tier: Tier;
  isFullyEvolved: boolean;
  evolvesTo: string[];
  alternateFormes: string[];
}

export interface StatdexMeta {
  source: string;
  generation: string;
  tierLadder: Tier[];
  rule: string[];
  counts: {
    step1Tiered: number;
    fullyEvolved: number;
    unevolvedInLadder: number;
    readdedRUOrAbove: number;
    total: number;
  };
  generatedAt: string;
}

export interface StatdexData {
  meta: StatdexMeta;
  pokemon: Pokemon[];
}

export const TYPES = [
  "Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting",
  "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost",
  "Dragon", "Dark", "Steel", "Fairy",
] as const;
export type TypeName = (typeof TYPES)[number];

export type MoveCategory = "Physical" | "Special" | "Non-Damaging";

export interface Move {
  name: string;
  type: TypeName;
  category: MoveCategory;
  power: number;
  accuracy: number;
  priority: number;
  pp: number;
  target: string;
  flags: string[];
  description: string;
}

/** Gen-6 type chart entry: attacking type -> [defending type, multiplier][]. */
export interface TypeChartEntry {
  name: TypeName;
  atk_effectives: [TypeName, number][];
}

export interface TypeChartData {
  meta: { source: string; generation: string; scope: string; count: number; generatedAt: string };
  types: TypeChartEntry[];
}

export type TypeEffectiveness = Map<TypeName, number>;
