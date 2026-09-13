import { calcStats, STAT_NAMES } from "../dist/index.js";
import { dexData, naturesData } from "./data.mjs";

const natures = naturesData.natures;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const pool = [...dexData.pokemon];
const picked = [];
while (picked.length < 5 && pool.length) {
  const i = randInt(0, pool.length - 1);
  picked.push(pool.splice(i, 1)[0]);
}

for (const mon of picked) {
  const level = randInt(1, 100);
  const nature = natures[randInt(0, natures.length - 1)];
  const stats = calcStats(mon.baseStats, {
    level,
    nature,
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    evs: {},
  });
  console.log(`\n${mon.name}  (${mon.types.join("/")})  tier ${mon.tier}`);
  console.log(`level ${level} | nature ${nature.name} ${nature.summary ? `(${nature.summary})` : "(neutral)"} | IV 31 | EV 0`);
  console.log(`base: HP ${mon.baseStats.hp} / Atk ${mon.baseStats.atk} / Def ${mon.baseStats.def} / SpA ${mon.baseStats.spa} / SpD ${mon.baseStats.spd} / Spe ${mon.baseStats.spe}`);
  const line = STAT_NAMES.map((s) => `${s.toUpperCase()} ${stats[s]}`).join(" | ");
  console.log(`actual: ${line}`);
}
