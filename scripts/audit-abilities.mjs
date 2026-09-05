// Audit: list pokemon whose ability options overlap the damage-modifier rules.
// Usage: node scripts/audit-abilities.mjs [--attackers|--defenders|--all]
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(await readFile(path.join(here, "..", "data", "xy-pokemon.json"), "utf8"));

// Attacker-side damage boosts (mirrors BOOST_PREDS in damage.mjs).
const BOOST = {
  Adaptability: "STAB x2", Aerilate: "Normal->Flying x1.3 + STAB", Analytic: "x1.3 if moving last",
  Blaze: "Fire x1.5 at <=1/3 HP", Download: "+1 Atk/SpA on switch-in vs lower def",
  "Flare Boost": "SpA x1.5 while burned", Guts: "Atk x1.5 while statused",
  "Huge Power": "Atk x2", Hustle: "Atk x1.5 (physical)", "Iron Fist": "Punch x1.2",
  "Mega Launcher": "Pulse x1.5", Overgrow: "Grass x1.5 at <=1/3 HP",
  Pixilate: "Normal->Fairy x1.3 + STAB", Protean: "STAB on every move", "Pure Power": "Atk x2",
  Reckless: "recoil moves x1.2", Refrigerate: "Normal->Ice x1.3 + STAB",
  "Sand Force": "Rock/Ground/Steel x1.3 in sand", "Sheer Force": "x1.3 (no secondary)",
  Sniper: "crit x1.5", "Solar Power": "SpA x1.5 in sun", "Strong Jaw": "Bite x1.5",
  Swarm: "Bug x1.5 at <=1/3 HP", Technician: "<=60 BP x1.5",
  "Tinted Lens": "x2 on not-very-effective", Torrent: "Water x1.5 at <=1/3 HP",
  "Tough Claws": "contact x1.3", "Toxic Boost": "Atk x1.5 while poisoned",
};

// Defender-side mitigations (mirrors mitigatorAbility in damage.mjs).
const DEF = new Set([
  "Levitate", "Sap Sipper", "Flash Fire", "Heatproof", "Thick Fat",
  "Dry Skin", "Storm Drain", "Water Absorb", "Lightning Rod", "Motor Drive",
  "Volt Absorb", "Bulletproof", "Soundproof", "Wonder Guard", "Fur Coat",
  "Marvel Scale", "Grass Pelt", "Multiscale", "Filter", "Solid Rock",
  "Magic Guard", "Poison Heal", "Overcoat", "Ice Body", "Magic Bounce",
  "Unaware", "Cloud Nine", "Air Lock",
]);

const flag = process.argv[2] ?? "--all";
const showA = flag === "--all" || flag === "--attackers";
const showD = flag === "--all" || flag === "--defenders";

const byTier = (rows) => rows.sort((a, b) => (a.tier === b.tier ? a.name.localeCompare(b.name) : a.tier.localeCompare(b.tier)));

if (showA) {
  const rows = [];
  for (const p of data.pokemon) {
    if (p.abilities.length < 2) continue;
    const boosted = p.abilities.filter((a) => BOOST[a]);
    if (boosted.length) rows.push({ name: p.name, tier: p.tier, def: boosted.map((a) => `${a} [${BOOST[a]}]`).join(", "), all: p.abilities.join(" | ") });
  }
  console.log(`== Attacker damage-boost options (2+ abilities, >=1 boost): ${rows.length}`);
  for (const r of byTier(rows)) console.log(`${r.name}  (${r.tier})  boost: ${r.def}`);
  console.log();
}

if (showD) {
  const rows = [];
  for (const p of data.pokemon) {
    const def = p.abilities.filter((a) => DEF.has(a));
    if (def.length < 2) continue;
    rows.push({ name: p.name, tier: p.tier, def: def.join(" / "), all: p.abilities.join(" | ") });
  }
  console.log(`== Defender mitigation options (2+ defensive abilities, hand-pick these): ${rows.length}`);
  for (const r of byTier(rows)) console.log(`${r.name}  (${r.tier})  defensive: ${r.def}`);
}
