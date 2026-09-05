import type { BaseStats, EVs, IVs, Nature, StatName } from "./types.js";

export interface StatCalcOptions {
  /** Defaults to 50. */
  level?: number;
  /** Defaults to 31 IV for every stat. */
  ivs?: Partial<IVs>;
  /** Defaults to 0 EV for every stat. */
  evs?: Partial<EVs>;
  /** Defaults to a neutral nature (no multipliers). */
  nature?: Nature;
}

const NEUTRAL: Nature = {
  name: "Neutral",
  multipliers: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
  summary: "",
};

function floorDiv(x: number, d: number): number {
  return Math.floor(x / d);
}

interface CalcOneOptions {
  level: number;
  iv: number;
  ev: number;
  nature: Nature;
}

/** Actual stat of a single stat (see stat-calc.ts docs). */
export function calcStat(base: number, stat: StatName, opts: CalcOneOptions): number {
  const l = Math.min(100, Math.max(1, opts.level));
  const inner = 2 * base + opts.iv + floorDiv(opts.ev, 4);
  if (stat === "hp") {
    return floorDiv(inner * l, 100) + l + 10;
  }
  const preNature = floorDiv(inner * l, 100) + 5;
  const mult = opts.nature.multipliers[stat];
  return Math.floor(preNature * mult);
}

/** Actual stats for a Pokemon at a given level with IVs/EVs/nature. */
export function calcStats(
  base: BaseStats,
  opts: StatCalcOptions = {}
): BaseStats {
  const level = Math.min(100, Math.max(1, opts.level ?? 50));
  const nature = opts.nature ?? NEUTRAL;
  const ivs: IVs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31, ...opts.ivs };
  const evs: EVs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...opts.evs };
  const out = {} as BaseStats;
  for (const stat of ["hp", "atk", "def", "spa", "spd", "spe"] as StatName[]) {
    out[stat] = calcStat(base[stat], stat, { level, iv: ivs[stat], ev: evs[stat], nature });
  }  return out;
}

export { NEUTRAL };
