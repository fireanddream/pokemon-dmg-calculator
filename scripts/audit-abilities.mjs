// Audit: list pokemon whose ability options overlap the damage-modifier rules.
// Usage: node scripts/audit-abilities.mjs [--attackers|--defenders|--all]
//
// The ability catalogs come from rules.mjs (the engine's canonical tables), so
// this report can never drift from what the engine actually models — no
// hand-copied mirror.
import { dexData as data } from "./data.mjs";
import {
  BOOST_ABILITY_NOTES, BOOST_ABILITY_NAMES, MITIGATION_ABILITY_NAMES, BOOST_PREDS,
} from "./rules.mjs";

const flag = process.argv[2] ?? "--all";
const showA = flag === "--all" || flag === "--attackers";
const showD = flag === "--all" || flag === "--defenders";

const byTier = (rows) => rows.sort((a, b) => (a.tier === b.tier ? a.name.localeCompare(b.name) : a.tier.localeCompare(b.tier)));

// Every auto-pick predicate must be documented in the boost catalog.
const undocumented = Object.keys(BOOST_PREDS).filter((a) => !BOOST_ABILITY_NAMES.has(a));
if (undocumented.length) {
  console.warn(`WARNING: no boost description for: ${undocumented.join(", ")}`);
}

if (showA) {
  const rows = [];
  for (const p of data.pokemon) {
    if (p.abilities.length < 2) continue;
    const boosted = p.abilities.filter((a) => BOOST_ABILITY_NAMES.has(a));
    if (boosted.length) rows.push({ name: p.name, tier: p.tier, def: boosted.map((a) => `${a} [${BOOST_ABILITY_NOTES[a] ?? "damage boost"}]`).join(", "), all: p.abilities.join(" | ") });
  }
  console.log(`== Attacker damage-boost options (2+ abilities, >=1 boost): ${rows.length}`);
  for (const r of byTier(rows)) console.log(`${r.name}  (${r.tier})  boost: ${r.def}`);
  console.log();
}

if (showD) {
  const rows = [];
  for (const p of data.pokemon) {
    const def = p.abilities.filter((a) => MITIGATION_ABILITY_NAMES.has(a));
    if (def.length < 2) continue;
    rows.push({ name: p.name, tier: p.tier, def: def.join(" / "), all: p.abilities.join(" | ") });
  }
  console.log(`== Defender mitigation options (2+ defensive abilities, hand-pick these): ${rows.length}`);
  for (const r of byTier(rows)) console.log(`${r.name}  (${r.tier})  defensive: ${r.def}`);
}
