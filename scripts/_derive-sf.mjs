import pkg from "@smogon/calc";
import { readFile } from "node:fs/promises";
const { calculate, Pokemon: OPokemon, Move: OMove, Field: OField } = pkg;

const dexMoves = JSON.parse(
  await readFile(new URL("../data/moves-xy.json", import.meta.url), "utf8")
).moves;

const B = { level: 100, nature: "Serious", ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, evs: {} };
const atk = new OPokemon(6, "Nidoking", { ...B, ability: "Poison Point" });
const atkSF = new OPokemon(6, "Nidoking", { ...B, ability: "Sheer Force" });
const def = new OPokemon(6, "Blissey", { ...B, ability: "Natural Cure" });
const field = new OField({});

const boosted = [];
const skipped = [];
for (const m of dexMoves) {
  if (m.category === "Non-Damaging" || !m.power) continue;
  let om;
  try {
    om = new OMove(6, m.name);
  } catch {
    skipped.push(m.name);
    continue;
  }
  let r1, r2;
  try {
    r1 = calculate(6, atk, def, om, field);
    r2 = calculate(6, atkSF, def, om, field);
  } catch {
    skipped.push(m.name);
    continue;
  }
  const max1 = Math.max(...r1.range());
  const max2 = Math.max(...r2.range());
  if (max1 > 0 && max2 > max1 * 1.2) boosted.push({ name: m.name, power: m.power, desc: m.description });
}
boosted.sort((a, b) => a.name.localeCompare(b.name));
console.log("SF-BOOSTED COUNT:", boosted.length);
for (const b of boosted) console.log(`${b.name}\t${b.power}\t${b.desc}`);
console.log("\nskipped (not in oracle gen6 or unrollable):", skipped.length, skipped.join(", "));
