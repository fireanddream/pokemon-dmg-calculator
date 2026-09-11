// Verify the multi-hit (2-5) model. Two independent checks:
//   A. exact convolution weights (synthetic rolls) + the Sash/Sturdy flag;
//   B. per-hit damage and each n-hit TOTAL against @smogon/calc driven with an
//      explicit hit count (`new Move(gen, name, { hits: n })`).
// Dev tool only: npm run verify:multihit
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calcDamage, calcStats, buildTypeChart, koAnalysis } from "../dist/index.js";
import { multiHitDistribution, calcSingle, calcCombo } from "./calc.mjs";
import pkg from "@smogon/calc";
const { calculate, Pokemon: OPokemon, Move: OMove, Field: OField } = pkg;

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => readFile(path.join(here, "..", "data", f), "utf8").then(JSON.parse);

const { pokemon: dexPokemon } = await read("xy-pokemon.json");
const { moves: dexMoves } = await read("moves-xy.json");
const { natures } = await read("natures-xy.json");
const { types: typeEntries } = await read("types-xy.json");
const chart = buildTypeChart(typeEntries);
const neutral = natures.find((n) => n.summary === "");
const IVS31 = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

const mon = (name) => dexPokemon.find((p) => p.name.toLowerCase() === name.toLowerCase());
const mv = (name) => dexMoves.find((m) => m.name.toLowerCase() === name.toLowerCase());

let pass = 0;
let fail = 0;
const T = (label, cond, extra = "") => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL: ${label}${extra ? `  ${extra}` : ""}`);
  }
};
const close = (a, b) => Math.abs(a - b) < 1e-12;
const COUNTS = [
  { hits: 2, prob: 3 / 8 }, { hits: 3, prob: 3 / 8 },
  { hits: 4, prob: 1 / 8 }, { hits: 5, prob: 1 / 8 },
];

// ---- A. exact convolution of independent per-hit rolls ----
{
  const perHit = [4, 6];
  const full = multiHitDistribution(perHit, undefined, COUNTS);
  T("weights sum to 1", close(full.weights.reduce((a, b) => a + b, 0), 1));
  T("full min = 2 x min hit", full.sums[0] === 8, `got ${full.sums[0]}`);
  T("full max = 5 x max hit", full.sums.at(-1) === 30, `got ${full.sums.at(-1)}`);
  T("P(2 hits, both min) = 3/32", close(full.weights[full.sums.indexOf(8)], 3 / 32));

  // resist berry: only hit 1 is halved (drawn from `firstRolls`)
  const first = [2, 2];
  const berry = multiHitDistribution(perHit, first, COUNTS);
  T("berry weights sum to 1", close(berry.weights.reduce((a, b) => a + b, 0), 1));
  T("berry min = halved first + 2-hit min", berry.sums[0] === 6, `got ${berry.sums[0]}`);
  T("berry max = halved first + 5-hit max", berry.sums.at(-1) === 26, `got ${berry.sums.at(-1)}`);
}

// ---- A2. multiHit disables the Focus Sash / Sturdy save ----
{
  const survived = (multiHit, extra) =>
    koAnalysis({
      rolls: [200], maxHp: 100, initialHp: 100, multiHit,
      passives: { types: ["Normal"], ...extra },
    }).guaranteedTurn;
  T("Sturdy saves a single lethal hit (2HKO)", survived(false, { ability: "Sturdy" }) === 2);
  T("Sturdy cannot save a multi-hit (OHKO)", survived(true, { ability: "Sturdy" }) === 1);
  T("Focus Sash saves a single lethal hit (2HKO)", survived(false, { item: "Focus Sash" }) === 2);
  T("Focus Sash cannot save a multi-hit (OHKO)", survived(true, { item: "Focus Sash" }) === 1);
}

// ---- B. per-hit + n-hit total vs @smogon/calc (explicit hit count) ----
const CASES = [
  { atk: { species: "Breloom", ability: "Technician" }, def: { species: "Heatran", ability: "Flash Fire" }, move: "Bullet Seed" },
  { atk: { species: "Cinccino", ability: "Skill Link" }, def: { species: "Snorlax", ability: "Immunity" }, move: "Tail Slap" },
  { atk: { species: "Cloyster", ability: "Shell Armor" }, def: { species: "Salamence", ability: "Intimidate" }, move: "Icicle Spear" },
  { atk: { species: "Greninja", ability: "Torrent" }, def: { species: "Garchomp", ability: "Rough Skin" }, move: "Water Shuriken" },
  { atk: { species: "Mamoswine", ability: "Oblivious" }, def: { species: "Vaporeon", ability: "Water Absorb" }, move: "Rock Blast" },
];
for (const t of CASES) {
  const aEntry = mon(t.atk.species);
  const dEntry = mon(t.def.species);
  const move = mv(t.move);
  const statsOf = (e) => calcStats(e.baseStats, { level: 50, nature: neutral, ivs: IVS31, evs: {} });
  const ours = calcDamage({
    attacker: { name: aEntry.name, types: aEntry.types, level: 50, stats: statsOf(aEntry), ability: t.atk.ability },
    defender: { name: dEntry.name, types: dEntry.types, level: 50, stats: statsOf(dEntry), ability: t.def.ability },
    move,
    chart,
  });
  const oAtk = new OPokemon(6, t.atk.species, { level: 50, nature: neutral.name, ivs: IVS31, evs: {}, ability: t.atk.ability });
  const oDef = new OPokemon(6, t.def.species, { level: 50, nature: neutral.name, ivs: IVS31, evs: {}, ability: t.def.ability });
  for (const n of [2, 3, 4, 5]) {
    const oracle = calculate(6, oAtk, oDef, new OMove(6, t.move, { hits: n }), new OField()).range();
    T(`${t.move} n=${n} (${t.atk.species} vs ${t.def.species})`,
      ours.min * n === oracle[0] && ours.max * n === oracle[1],
      `oracle ${oracle.join("-")} ours ${ours.min * n}-${ours.max * n}`);
  }
}

// ---- C. end-of-turn timing ----
// A 2-5 hit move is ONE use: sand/Leftovers apply ONCE after the whole action,
// never between strikes. A two-move combo is TWO turns: EoT applies between the
// moves. Both show up as an exact one-chip shift in the turn-1 survivors.
{
  const aEntry = mon("Breloom");
  const dEntry = mon("Vaporeon");
  const move = mv("Bullet Seed");
  const move2 = mv("Mach Punch");
  const statsOf = (e) => calcStats(e.baseStats, { level: 50, nature: neutral, ivs: IVS31, evs: {} });
  const atk = { name: aEntry.name, types: aEntry.types, level: 50, stats: statsOf(aEntry), ability: "Technician", hpFraction: 1 };
  const def = { name: dEntry.name, types: dEntry.types, level: 50, stats: statsOf(dEntry), ability: "Water Absorb", hpFraction: 1 };
  const chip = Math.floor(def.stats.hp / 16);
  const minSurv = (bag) => bag.ko.lines[0].surviveHpMin;

  const singleDry = calcSingle({ attacker: atk, defender: def, move, chart });
  const singleSand = calcSingle({ attacker: atk, defender: def, move, chart, weather: "sand" });
  T("multi-hit feeds a convolved total, not 16 single rolls", singleDry.displayRolls.length > 16, `len ${singleDry.displayRolls.length}`);
  T("multi-hit EoT applies once per use (one chip, not per strike)",
    minSurv(singleDry) - minSurv(singleSand) === chip,
    `shift ${minSurv(singleDry) - minSurv(singleSand)} chip ${chip}`);

  const comboDry = calcCombo({ attacker: atk, defender: def, moves: [move, move2], chart });
  const comboSand = calcCombo({ attacker: atk, defender: def, moves: [move, move2], chart, weather: "sand" });
  T("combo EoT applies between the two moves (one chip per turn)",
    minSurv(comboDry) - minSurv(comboSand) === chip,
    `shift ${minSurv(comboDry) - minSurv(comboSand)} chip ${chip}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
