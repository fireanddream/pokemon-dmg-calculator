import path from "node:path";
import { fileURLToPath } from "node:url";
import { Statdex, calcStats, buildTypeChart, calcDamage } from "./index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(here, "..", "data", "xy-pokemon.json");

const dex = await Statdex.fromFile(dataPath);
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`ok: ${msg}`);
  }
};

assert(dex.size === dex.meta.counts.total, `loaded ${dex.size} pokemon`);
assert(dex.size === 503, "dataset has 503 entries");

const venusaur = dex.get("Venusaur");
assert(venusaur?.tier === "RU", "Venusaur is RU");
assert(venusaur?.baseStats.spa === 100, "Venusaur SpA = 100");
assert(dex.get("venusaur-mega")?.tier === "OU", "case-insensitive get() finds Venusaur-Mega");

assert(dex.getByNationalDex(6).length === 3, "dex #6 has 3 entries (Charizard + 2 megas)");
assert(dex.byTier("AG").map((m) => m.name).join() === "Rayquaza-Mega", "AG tier is Rayquaza-Mega");

const dragonFlying = dex.hasAllTypes("Dragon", "Flying");
assert(dragonFlying.length >= 5, `hasAllTypes(Dragon,Flying) -> ${dragonFlying.length} results`);
assert(dragonFlying.some((m) => m.name === "Rayquaza-Mega"), "Rayquaza-Mega is Dragon/Flying");

const typesValid = dex.pokemon.every((m) => m.types.length >= 1 && m.types.length <= 2);
assert(typesValid, "all entries have 1-2 types");

// ---- stat calc: default IV 31, EV 0, neutral nature at L100 sanity ----
import { readFile } from "node:fs/promises";
import type { Move, Nature, TypeChartEntry, TypeName } from "./index.js";
const readJson = async <T>(f: string): Promise<T> =>
  JSON.parse(await readFile(path.join(here, "..", "data", f), "utf8")) as T;
interface NatureDump { natures: Nature[] }
interface TypeDump { types: TypeChartEntry[] }
interface MoveDump { moves: Move[] }
const natures = (await readJson<NatureDump>("natures-xy.json")).natures;
const neutral = natures.find((n) => n.summary === "");

// ---- damage calc: Weavile Knock Off vs Aggron (hand-verified 33-39) ----
const weavile = dex.get("Weavile")!;
const aggron = dex.get("Aggron")!;
const statsOf = (entry: typeof weavile, level: number) =>
  calcStats(entry.baseStats, { level, nature: neutral, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, evs: {} });
const chart = buildTypeChart((await readJson<TypeDump>("types-xy.json")).types);
const knockOff = (await readJson<MoveDump>("moves-xy.json")).moves.find((m) => m.name === "Knock Off")!;
const toTypes = (names: string[]): TypeName[] => names as TypeName[];

const dmg = calcDamage({
  attacker: { name: weavile.name, types: toTypes(weavile.types), level: 78, stats: statsOf(weavile, 78), ability: "Pressure" },
  defender: { name: aggron.name, types: toTypes(aggron.types), level: 97, stats: statsOf(aggron, 97), ability: "Sturdy" },
  move: knockOff,
  chart,
});
assert(dmg.min === 33 && dmg.max === 39, `Weavile Knock Off on Aggron = 33-39 (got ${dmg.min}-${dmg.max})`);

console.log(`\nChecked ${dex.size} pokemon.`);
