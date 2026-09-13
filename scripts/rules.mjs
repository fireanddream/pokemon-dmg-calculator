// rules.mjs — the ONE home for the engine's damage-rule tables (recoil moves,
// the auto-pick ability predicates, Mold Breaker relevance) plus the
// human-readable ability catalogs the audit tool reads. fill.mjs consumes the
// predicates; audit-abilities.mjs consumes the catalogs — neither hand-copies a
// table any more, so a new rule has exactly one edit site.
import { SHEER_FORCE_MOVES } from "../dist/index.js";
import { chart } from "./typechart.mjs";

// Moves whose recoil makes Reckless a damage boost.
export const RECOIL_MOVES = new Set([
  "Brave Bird", "Double-Edge", "Flare Blitz", "Head Charge", "Head Smash",
  "Light of Ruin", "Submission", "Take Down", "Volt Tackle", "Wild Charge",
  "Wood Hammer", "Struggle",
]);

// Damage-boosting ability predicates used for the auto default on the ATTACKER.
// ctx = { move, entry (the mon), spec, weather, crit }
export const BOOST_PREDS = {
  "Huge Power": (c) => c.move.category === "Physical",
  "Pure Power": (c) => c.move.category === "Physical",
  Adaptability: (c) => c.entry.types.includes(c.move.type),
  Technician: (c) => c.move.power > 0 && c.move.power <= 60,
  "Tough Claws": (c) => c.move.flags.includes("Contact"),
  "Iron Fist": (c) => c.move.flags.includes("Punch"),
  "Strong Jaw": (c) => c.move.flags.includes("Bite"),
  "Mega Launcher": (c) => c.move.flags.includes("Pulse"),
  Reckless: (c) => RECOIL_MOVES.has(c.move.name),
  Guts: (c) => !!c.spec.status && c.move.category === "Physical",
  "Flare Boost": (c) => c.spec.status === "brn" && c.move.category === "Special",
  "Toxic Boost": (c) => (c.spec.status === "psn" || c.spec.status === "tox") && c.move.category === "Physical",
  "Sheer Force": (c) => SHEER_FORCE_MOVES.has(c.move.name),
  Blaze: (c) => c.move.type === "Fire" && (c.spec.hpFraction ?? 1) <= 1 / 3,
  Overgrow: (c) => c.move.type === "Grass" && (c.spec.hpFraction ?? 1) <= 1 / 3,
  Torrent: (c) => c.move.type === "Water" && (c.spec.hpFraction ?? 1) <= 1 / 3,
  Swarm: (c) => c.move.type === "Bug" && (c.spec.hpFraction ?? 1) <= 1 / 3,
  "Solar Power": (c) => c.weather === "sun" && c.move.category === "Special",
  "Sand Force": (c) => c.weather === "sand" && ["Rock", "Ground", "Steel"].includes(c.move.type),
  Sniper: (c) => !!c.crit,
  Aerilate: (c) => c.move.type === "Normal",
  Pixilate: (c) => c.move.type === "Normal",
  Refrigerate: (c) => c.move.type === "Normal",
};

// Defensive/blocking abilities Mold Breaker would remove, keyed by "would it
// reduce or stop THIS move". Returns true when Mold Breaker deals more damage.
export const MB_RELEVANCE = {
  Levitate: (m) => m.type === "Ground",
  "Sap Sipper": (m) => m.type === "Grass",
  "Flash Fire": (m) => m.type === "Fire",
  "Dry Skin": (m) => m.type === "Water", "Storm Drain": (m) => m.type === "Water",
  "Water Absorb": (m) => m.type === "Water",
  "Lightning Rod": (m) => m.type === "Electric", "Motor Drive": (m) => m.type === "Electric",
  "Volt Absorb": (m) => m.type === "Electric",
  "Thick Fat": (m) => m.type === "Fire" || m.type === "Ice",
  Heatproof: (m) => m.type === "Fire",
  "Fur Coat": (m) => m.category === "Physical",
  "Marvel Scale": (m) => m.category === "Physical",
  "Grass Pelt": (m) => m.category === "Physical",
  Multiscale: () => true,
  "Wonder Guard": () => true,
  Bulletproof: (m) => m.flags.includes("Bullet"),
  Soundproof: (m) => m.flags.includes("Sound"),
  Filter: (m, defEntry) => typeEffVs(defEntry, m.type) > 1,
  "Solid Rock": (m, defEntry) => typeEffVs(defEntry, m.type) > 1,
};

/** Combined type effectiveness of `atkType` against a dex entry's typing. */
export function typeEffVs(defEntry, atkType) {
  const row = chart.get(atkType);
  return defEntry.types.reduce((a, t) => a * (row?.get(t) ?? 1), 1);
}

// --- Human-readable ability catalogs (documentation, consumed by the audit
// tool). BOOST_ABILITY_NOTES is the descriptive SUPER-set of BOOST_PREDS: it
// also lists engine-modeled boosters the auto-picker never selects (Analytic,
// Download, Hustle, Protean, Tinted Lens). Keep BOOST_PREDS ⊆ its keys; the
// audit warns if a predicate lacks a note. --
export const BOOST_ABILITY_NOTES = {
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

/** Ability names the audit treats as attacker-side damage boosts. */
export const BOOST_ABILITY_NAMES = new Set(Object.keys(BOOST_ABILITY_NOTES));

/** Defender-side mitigations the audit surfaces (union of the immediate
 *  reducers, status/hazard/weather mitigators, evasion and healing the
 *  mitigator picker considers). */
export const MITIGATION_ABILITY_NAMES = new Set([
  "Levitate", "Sap Sipper", "Flash Fire", "Heatproof", "Thick Fat",
  "Dry Skin", "Storm Drain", "Water Absorb", "Lightning Rod", "Motor Drive",
  "Volt Absorb", "Bulletproof", "Soundproof", "Wonder Guard", "Fur Coat",
  "Marvel Scale", "Grass Pelt", "Multiscale", "Filter", "Solid Rock",
  "Magic Guard", "Poison Heal", "Overcoat", "Ice Body", "Magic Bounce",
  "Unaware", "Cloud Nine", "Air Lock",
]);
