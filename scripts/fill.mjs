// fill.mjs — DEFAULTS + RESOLVE stage: spec JSON -> calc-input JSON.
//
// The single deterministic stage BOTH extractor routes feed. Consumes the spec
// JSON (offline input-converter output OR agent-authored) that states the
// variables the user typed; fills every MISSING variable from
// auto-fill-defaults.md (parsed at startup — level/nature/IV/EV fill defaults,
// max-shorthand expansion, orb->status, weather setters, ability pick order),
// validates every name against the dex (fails loud on unknowns), computes the
// level-N stats, and emits the calc-input JSON calc.mjs consumes:
//
//   node scripts/fill.mjs <spec.json>   (or stdin "-")
//
// The shared front lexicon (data loads, lookup maps, PLATE_BY_TYPE,
// resolveMoveName, claimMoves) lives in input-converter.mjs and is
// imported here — one source for both extractor routes and this stage.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calcStats, SHEER_FORCE_MOVES, remapMoveType, resolveWeatherBall } from "../dist/index.js";
import {
  norm, chart, natureByName, moveByName, monByName,
  resolveMoveName, claimMoves, PLATE_BY_TYPE, BOOST_MOVES,
} from "./input-converter.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// --- default-rule data, read from auto-fill-defaults.md at startup
// (doc-as-code). The built-in tables below are ONLY fallbacks if the doc can't
// be parsed; defaults are meant to be edited in that file, not here. ---
let DEFAULT_DOC = "";
try {
  DEFAULT_DOC = await readFile(path.join(here, "..", "auto-fill-defaults.md"), "utf8");
} catch { /* missing/unreadable: fall back to the built-in tables */ }

/** A section is the text from a `## <heading>` line to the next `## ` heading.
 *  The heading match is anchored to the start of a line so prose references
 *  like "(see ## X below)" elsewhere in the doc cannot hijack the lookup. */
function mdSection(doc, heading) {
  if (!doc) return "";
  const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|\\n)## ${esc}(?=\\s|$)`);
  const m = re.exec(doc);
  if (!m) return "";
  const i = m.index + (m[0].startsWith("\n") ? 1 : 0);
  const j = doc.indexOf("\n## ", i + 2);
  return doc.slice(i, j === -1 ? doc.length : j);
}

function mdTableRows(section) {
  return section
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"))
    .slice(2) // skip the column header and the |---|---| separator
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
    .filter((cells) => cells.length >= 2);
}

const stripMdCell = (s) => s.replace(/\*\*/g, "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
const firstInt = (s) => { const m = /\d+/.exec(s ?? ""); return m ? Number(m[0]) : null; };

// Built-in fallbacks, identical to the current engine defaults.
// auto-fill-defaults.md tables override these when present.
const BUILTIN_FILL_DEFAULTS = { level: 50, nature: "Serious", ivs: 31, evs: 0 };
const BUILTIN_WEATHER_SETTER = {
  Drought: "sun", "Desolate Land": "desolate", Drizzle: "rain",
  "Primordial Sea": "primordial", "Sand Stream": "sand", "Snow Warning": "hail",
  "Delta Stream": "delta",
};
const BUILTIN_SHORTHAND = {
  "max atk": { evs: { atk: 252 }, low: "Adamant", high: "Adamant" },
  "max spa": { evs: { spa: 252 }, low: "Modest", high: "Modest" },
  "max def": { evs: { hp: 252, def: 252 }, low: "Bold", high: "Impish" },
  "max spd": { evs: { hp: 252, spd: 252 }, low: "Calm", high: "Careful" },
  // spe/hp (2026-09-08): natures handled in code, not via low/high — max spe is
  // Timid/Jolly by the side's move (base-Atk-vs-SpA fallback), max hp sets none.
  "max spe": { evs: { spe: 252 }, low: "Jolly", high: "Jolly" },
  "max hp": { evs: { hp: 252 }, low: "", high: "" },
};
const BUILTIN_ORB = {
  "Flame Orb": { status: "brn", blocked: ["Fire"] },
  "Toxic Orb": { status: "tox", blocked: ["Steel", "Poison"] },
};

/** Pure fill defaults from the "## Defaults at a glance" table (Variable rows:
 *  Level / Nature / IVs / EVs). Falls back per-key to BUILTIN_FILL_DEFAULTS. */
function parseFillDefaults(doc) {
  const section = mdSection(doc, "Defaults at a glance");
  if (!section) return { ...BUILTIN_FILL_DEFAULTS };
  const out = { ...BUILTIN_FILL_DEFAULTS };
  for (const cells of mdTableRows(section)) {
    const key = cells[0].toLowerCase();
    const val = stripMdCell(cells[1]);
    if (key === "level" || key === "ivs" || key === "evs") {
      const n = firstInt(val);
      if (n != null) out[key] = n;
    } else if (key === "nature") {
      const word = /^[A-Za-z]+/.exec(val)?.[0];
      if (word) out.nature = word;
    }
  }
  return out;
}

/** Weather setters from the "## Weather setters" table. */
function parseWeatherSetters(doc) {
  const section = mdSection(doc, "Weather setters");
  if (!section) return { ...BUILTIN_WEATHER_SETTER };
  const out = { ...BUILTIN_WEATHER_SETTER };
  for (const cells of mdTableRows(section)) {
    const ability = stripMdCell(cells[0]);
    const weather = stripMdCell(cells[1]).toLowerCase();
    if (ability && BUILTIN_WEATHER_SETTER[ability] !== undefined && weather) out[ability] = weather;
  }
  return out;
}

/** `max atk/spa/def/spd` -> { evs, low, high } from the shorthand table. The
 *  table's nature columns are: (base Atk <= SpA) and (base Atk > SpA). */
function parseShorthand(doc) {
  const section = mdSection(doc, "EV / nature shorthand");
  if (!section) return { ...BUILTIN_SHORTHAND };
  const out = { ...BUILTIN_SHORTHAND };
  for (const cells of mdTableRows(section)) {
    if (cells.length < 8) continue;
    const token = stripMdCell(cells[0]).toLowerCase();
    if (!/^max (atk|spa|def|spd|spe|hp)$/.test(token) || !BUILTIN_SHORTHAND[token]) continue;
    const names = ["hp", "atk", "def", "spa", "spd", "spe"];
    const evs = {};
    for (let i = 0; i < 6; i++) {
      const n = firstInt(stripMdCell(cells[1 + i]));
      if (n) evs[names[i]] = n;
    }
    out[token] = { evs, low: stripMdCell(cells[7]), high: stripMdCell(cells[8]) };
  }
  return out;
}

/** Orb -> { status, blocked } from the "## Orb defaults" table. */
function parseOrbs(doc) {
  const section = mdSection(doc, "Orb defaults");
  if (!section) return { ...BUILTIN_ORB };
  const statusWord = { burned: "brn", "badly poisoned": "tox" };
  const out = { ...BUILTIN_ORB };
  for (const cells of mdTableRows(section)) {
    const orb = stripMdCell(cells[0]);
    if (!BUILTIN_ORB[orb]) continue;
    const status = statusWord[stripMdCell(cells[1]).toLowerCase()];
    const blocked = stripMdCell(cells[2]).split(/[\/,]/).map((s) => s.trim()).filter(Boolean);
    if (status && blocked.length) out[orb] = { status, blocked };
  }
  return out;
}

const FILL_DEFAULTS = parseFillDefaults(DEFAULT_DOC);

// --- default-ability data, also from auto-fill-defaults.md (doc-as-code). The
// built-in
// tables below are only a fallback if the doc can't be parsed. ---

// "## Status first" table -> { brn: [ability,...], psn: [...], ... }. Row order
// is kept: the earliest ability on a row wins when a mon has several.
function parseStatusFirstTable(doc) {
  const section = mdSection(doc, "Status first");
  if (!section) return null;
  const statusCode = {
    burnt: "brn", burned: "brn", poisoned: "psn", "badly poisoned": "tox",
    paralyzed: "par", asleep: "slp", sleeping: "slp", frozen: "frz", freeze: "frz",
  };
  const out = {};
  for (const cells of mdTableRows(section)) {
    const abilities = stripMdCell(cells[1]).split(",").map((s) => s.trim()).filter(Boolean);
    if (!abilities.length) continue;
    for (const raw of cells[0].split("/")) {
      const code = statusCode[raw.trim().toLowerCase()];
      if (code) out[code] = [...new Set([...(out[code] ?? []), ...abilities])];
    }
  }
  return Object.keys(out).length ? out : null;
}

// "Pokemon | Default ability" tables -> Map<canonical species name, ability>.
function parseSpeciesTable(doc, heading) {
  const section = mdSection(doc, heading);
  if (!section) return null;
  const map = new Map();
  for (const cells of mdTableRows(section)) {
    const ability = stripMdCell(cells[1]);
    if (!ability) continue;
    for (const raw of cells[0].split("/")) {
      const name = raw.trim();
      if (name) map.set(name, ability);
    }
  }
  return map.size ? map : null;
}

const STATUS_FIRST = parseStatusFirstTable(DEFAULT_DOC);

// Fixed default ability for ATTACKERS (user exceptions to the auto-boost rule).
const FIXED_ABILITY = parseSpeciesTable(DEFAULT_DOC, "Fixed attacker defaults")
  ?? new Map([
    ["Hippowdon", "Sand Stream"], ["Magnezone", "Magnet Pull"], ["Magneton", "Magnet Pull"],
    ["Scizor", "Technician"], ["Serperior", "Contrary"], ["Starmie", "Natural Cure"],
    ["Blaziken", "Speed Boost"], ["Greninja", "Protean"], ["Landorus", "Sheer Force"],
    ["Conkeldurr", "Guts"], ["Scolipede", "Speed Boost"], ["Togekiss", "Serene Grace"],
    ["Chesnaught", "Bulletproof"], ["Entei", "Pressure"], ["Feraligatr", "Sheer Force"],
    ["Galvantula", "Compound Eyes"], ["Heliolisk", "Dry Skin"], ["Infernape", "Blaze"],
    ["Machamp", "No Guard"], ["Porygon2", "Download"], ["Roserade", "Natural Cure"],
    ["Ambipom", "Technician"], ["Braviary", "Defiant"], ["Cinccino", "Skill Link"],
    ["Druddigon", "Rough Skin"], ["Emboar", "Reckless"], ["Escavalier", "Overcoat"],
    ["Hitmontop", "Intimidate"], ["Rhyperior", "Solid Rock"], ["Sigilyph", "Magic Guard"],
    ["Togetic", "Serene Grace"], ["Durant", "Hustle"], ["Kingdra", "Swift Swim"],
    ["Tyrantrum", "Rock Head"],
  ]);

// Fixed default ability for DEFENDERS (user picks; run AFTER the attacker table).
const DEFENDER_FIXED = parseSpeciesTable(DEFAULT_DOC, "Fixed defender defaults")
  ?? new Map([
    ["Azumarill", "Huge Power"], ["Clefable", "Magic Guard"], ["Reuniclus", "Magic Guard"],
    ["Bronzong", "Levitate"], ["Mr. Mime", "Soundproof"], ["Quagsire", "Unaware"],
    ["Dewgong", "Thick Fat"], ["Gogoat", "Sap Sipper"], ["Maractus", "Water Absorb"],
    ["Walrein", "Thick Fat"],
  ]);

if (!STATUS_FIRST && FIXED_ABILITY.size === 0 && DEFENDER_FIXED.size === 0) {
  console.warn("WARNING: auto-fill-defaults.md ability tables not found; using built-in default-ability fallbacks.");
}

// Doc-driven default maps (fallbacks above). Weather setters feed the
// auto-default AND the arena-weather decision.
const WEATHER_SETTER = parseWeatherSetters(DEFAULT_DOC);
const SHORTHAND = parseShorthand(DEFAULT_DOC);
const ORB = parseOrbs(DEFAULT_DOC);
// Primal weathers (Desolate Land / Primordial Sea / Delta Stream) beat regular
// sand/hail/sun/rain regardless of Speed; among themselves (or among two
// regular setters) the slower pokemon's weather wins.
const PRIMAL_WEATHER = new Set(["desolate", "primordial", "delta"]);

const RECOIL_MOVES = new Set([
  "Brave Bird", "Double-Edge", "Flare Blitz", "Head Charge", "Head Smash",
  "Light of Ruin", "Submission", "Take Down", "Volt Tackle", "Wild Charge",
  "Wood Hammer", "Struggle",
]);

// Damage-boosting ability predicates used for the auto default on the ATTACKER.
// ctx = { move, entry (the mon), spec, weather, crit }
const BOOST_PREDS = {
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
const MB_RELEVANCE = {
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

function typeEffVs(defEntry, atkType) {
  const row = chart.get(atkType);
  return defEntry.types.reduce((a, t) => a * (row?.get(t) ?? 1), 1);
}

/** Which of the defender's abilities mitigates this matchup? Groups inside run
 * 1. reduce damage (immediate + indirect) -> 2. evasion -> 3. healing. */
function mitigatorAbility(entry, spec, move, matchup) {
  const types = entry.types;
  const typeEff = typeEffVs(entry, move.type);
  // Ability picking ignores Cloud Nine / Air Lock (defaults see the arena
  // weather); the suppressor only nulls weather for post-pick calculations.
  const effWeather = matchup.weather;
  const abSet = new Set(entry.abilities);
  const firstOf = (names) => entry.abilities.find((a) => names.includes(a)) ?? null;
  const t = move.type;
  const isDmg = move.category !== "Non-Damaging";

  // Priority groups, highest first:
  //   1. reduce damage — immediate (the incoming move, incl. Sturdy's delay-the
  //      -KO at full HP) OR indirect (entry hazards, weather chip, poison chip)
  //   2. evasion boost — Sand Veil / Snow Cloak when the weather is right
  //   3. increase healing — Ice Body auto-healing each hail turn

  // 1a. immediate damage of the incoming move
  if (isDmg) {
    const g1Candidates = [];
    const add = (ok, ...names) => { if (ok) g1Candidates.push(...names); };
    if (t === "Ground") add(abSet.has("Levitate"), "Levitate");
    if (t === "Grass") add(abSet.has("Sap Sipper"), "Sap Sipper");
    if (t === "Fire") {
      add(abSet.has("Flash Fire"), "Flash Fire");
      add(abSet.has("Heatproof"), "Heatproof");
      add(abSet.has("Thick Fat"), "Thick Fat");
    }
    if (t === "Water") add(abSet.has("Dry Skin") || abSet.has("Storm Drain") || abSet.has("Water Absorb"), "Dry Skin", "Storm Drain", "Water Absorb");
    if (t === "Electric") add(abSet.has("Lightning Rod") || abSet.has("Motor Drive") || abSet.has("Volt Absorb"), "Lightning Rod", "Motor Drive", "Volt Absorb");
    if (move.flags.includes("Bullet")) add(abSet.has("Bulletproof"), "Bulletproof");
    if (move.flags.includes("Sound")) add(abSet.has("Soundproof"), "Soundproof");
    if (typeEff <= 1) add(abSet.has("Wonder Guard"), "Wonder Guard");
    if ((t === "Fire" || t === "Ice") && abSet.has("Thick Fat")) add(true, "Thick Fat");
    if (t === "Fire" && abSet.has("Heatproof")) add(true, "Heatproof");
    if (move.category === "Physical") {
      add(abSet.has("Fur Coat"), "Fur Coat");
      if (matchup.terrain === "grassy") add(abSet.has("Grass Pelt"), "Grass Pelt");
    }
    if ((spec.hpFraction ?? 1) >= 1) add(abSet.has("Multiscale"), "Multiscale");
    // Sturdy delays the KO (survives at full HP), so it counts as reducing
    // immediate damage and belongs in this group, above evasion and healing.
    if ((spec.hpFraction ?? 1) >= 1) add(abSet.has("Sturdy"), "Sturdy");
    if (typeEff > 1) add(abSet.has("Filter") || abSet.has("Solid Rock"), "Filter", "Solid Rock");
    const found = firstOf(g1Candidates);
    if (found) return found;
  }

  // 1b. indirect damage — poison chip first: Poison Heal removes the chip AND
  // heals, so it counts as reducing indirect damage and outranks evasion even
  // when the weather would let Sand Veil / Snow Cloak dodge.
  if (spec.status === "psn" || spec.status === "tox") {
    if (abSet.has("Poison Heal")) return "Poison Heal";
  }

  // 1c. entry-hazard damage (already-set hazards: only Magic Guard negates;
  //     Magic Bounce only reflects hazard-setting moves, so it does NOT count)
  const hazardMitigators = [];
  if (matchup.stealthRock && abSet.has("Magic Guard")) hazardMitigators.push("Magic Guard");
  if (matchup.spikes && !types.includes("Flying")) {
    if (abSet.has("Magic Guard")) hazardMitigators.push("Magic Guard");
    if (abSet.has("Levitate")) hazardMitigators.push("Levitate");
  }
  if (hazardMitigators.length) {
    const found = firstOf([...new Set(hazardMitigators)]);
    if (found) return found;
  }

  // 1d. weather chip damage
  if (effWeather === "sand" || effWeather === "hail") {
    const chipped = effWeather === "sand"
      ? !types.some((x) => ["Rock", "Ground", "Steel"].includes(x))
      : !types.includes("Ice");
    if (chipped) {
      if (abSet.has("Overcoat")) return "Overcoat";
      if (abSet.has("Magic Guard")) return "Magic Guard";
    }
  }

  // 2. evasion boost — dodging beats healing but not damage reduction
  if (effWeather === "sand" && abSet.has("Sand Veil")) return "Sand Veil";
  if (effWeather === "hail" && abSet.has("Snow Cloak")) return "Snow Cloak";

  // 3. increase healing (auto-heal each hail turn)
  if (effWeather === "hail" && abSet.has("Ice Body")) return "Ice Body";
  return null;
}

/** Resolve a spec's current Speed stat (level/nature/EVs, default IVs) so
 * weather setter ordering can compare who is slower. Mirrors resolve()'s stat
 * build. */
function specSpeed(spec) {
  const entry = monByName.get(norm(spec?.name ?? ""));
  if (!entry) return 0;
  const nature = natureByName.get((spec.nature ?? FILL_DEFAULTS.nature).toLowerCase()) ?? natureByName.get("serious");
  const stats = calcStats(entry.baseStats, {
    level: spec.level ?? FILL_DEFAULTS.level,
    nature,
    ivs: spec.ivs ?? { hp: FILL_DEFAULTS.ivs, atk: FILL_DEFAULTS.ivs, def: FILL_DEFAULTS.ivs, spa: FILL_DEFAULTS.ivs, spd: FILL_DEFAULTS.ivs, spe: FILL_DEFAULTS.ivs },
    evs: spec.evs ?? {},
  });
  return stats.spe;
}

/** Decide the arena weather from both sides' weather-setting abilities when
 * none was typed. Resolution order:
 *   - a single setter -> its weather;
 *   - both set weather: a PRIMAL weather (desolate/primordial/delta) beats a
 *     regular one (sun/rain/sand/hail) REGARDLESS of Speed; otherwise the
 *     SLOWER pokemon wins (its ability activates last), and an exact Speed tie
 *     keeps the attacker's weather (the original preference). */
function weatherFromSetters(matchup) {
  const wA = WEATHER_SETTER[matchup.attacker?.ability];
  const wD = WEATHER_SETTER[matchup.defender?.ability];
  if (wA && wD && wA !== wD) {
    const aPri = PRIMAL_WEATHER.has(wA);
    const dPri = PRIMAL_WEATHER.has(wD);
    if (aPri !== dPri) return aPri ? wA : wD;
    const spdA = specSpeed(matchup.attacker);
    const spdD = specSpeed(matchup.defender);
    if (spdD < spdA) return wD;
    if (spdA < spdD) return wA;
    return wA;
  }
  return wA ?? wD;
}

function defaultAbilityName(spec, move, matchup, isAttacker) {
  const entry = monByName.get(norm(spec.name));
  if (!entry) return undefined;
  const hpFraction = spec.hpFraction ?? 1;
  // Ability picking ignores Cloud Nine / Air Lock: defaults always see the
  // arena weather as typed/inferred. Suppression only nulls weather for the
  // damage/accuracy/chip calculations AFTER the ability is chosen.
  const weather = matchup.weather;

  // 0. STATUS FIRST (top priority; sourced from auto-fill-defaults.md): a statused mon
  // that has an ability reacting to that status (Poison Heal when poisoned,
  // Guts when burned, Toxic/Flare Boost, Marvel Scale, Magic Guard) defaults to
  // it before every other rule, including the fixed tables below.
  if (spec.status && STATUS_FIRST) {
    const candidates = STATUS_FIRST[spec.status];
    if (candidates) {
      for (const ab of candidates) {
        if (entry.abilities.includes(ab)) return ab;
      }
    }
  }

  // 0.5 WEATHER SETTER (right after status-first): a mon able to set weather
  // defaults to that ability — Drought (sun), Drizzle (rain), Sand Stream
  // (sand), Snow Warning (hail), Desolate Land / Primordial Sea / Delta Stream.
  // Covers first-slot setters (Tyranitar, Hippowdon, Abomasnow), hidden or
  // second-slot ones (Ninetales, Politoed, Aurorus) and single-ability setters
  // (Mega Charizard Y Drought, Mega Rayquaza Delta Stream). Runs before the
  // fixed tables. Whether this weather reaches the Arena is decided later:
  // a typed weather always wins; otherwise the slower of two setters sets it.
  for (const ab of entry.abilities) {
    if (WEATHER_SETTER[ab]) return ab;
  }

  // 1. fixed attacker defaults
  if (isAttacker) {
    const aFixed = FIXED_ABILITY.get(entry.name);
    if (aFixed) return entry.abilities.includes(aFixed) ? aFixed : entry.abilities[0];
  }

  // 2. fixed defender defaults
  if (!isAttacker) {
    const dFixed = DEFENDER_FIXED.get(entry.name);
    if (dFixed) return entry.abilities.includes(dFixed) ? dFixed : entry.abilities[0];
  }

  // 3. ability special rules (universal: apply for attackers AND defenders)
  // sand: any mon with both Sand Rush + Sand Force always uses Sand Rush
  if (weather === "sand" && entry.abilities.includes("Sand Rush") && entry.abilities.includes("Sand Force")) {
    return "Sand Rush";
  }
  // sun -> Chlorophyll, rain -> Swift Swim (harsh sun / heavy rain count too)
  if ((weather === "sun" || weather === "desolate") && entry.abilities.includes("Chlorophyll")) {
    return "Chlorophyll";
  }
  if ((weather === "rain" || weather === "primordial") && entry.abilities.includes("Swift Swim")) {
    return "Swift Swim";
  }

  // 4. attacker auto rule: default to the ability that boosts the current move.
  // Mold Breaker is part of this step — it boosts by breaking the defender's
  // ability (Levitate, Flash Fire, Thick Fat, absorbs, Multiscale, ...).
  if (isAttacker) {
    if (entry.abilities.includes("Mold Breaker")) {
      const defEntry = monByName.get(norm(matchup.defender?.name ?? ""));
      const defAbility = matchup.defender?.ability;
      const rel = defEntry && defAbility ? MB_RELEVANCE[defAbility] : null;
      if (rel && rel(move, defEntry)) return "Mold Breaker";
    }
    for (const ab of entry.abilities) {
      const pred = BOOST_PREDS[ab];
      if (pred && pred({ move, entry, spec, weather, crit: matchup.crit, hpFraction })) {
        return ab;
      }
    }
  }

  // 5. defender auto rule (mirror): mitigatorAbility picks by group priority
  //    1. reduce damage (immediate + indirect) -> 2. evasion -> 3. healing.
  if (!isAttacker) {
    const mit = mitigatorAbility(entry, spec, move, matchup);
    if (mit) return mit;
  }
  // 6. fallback
  return entry.abilities[0];
}

/** Apply the max atk/spa/def/spd/spe/hp shorthands. RULES (user 2026-09-08,
 *  SESSION-NOTES-20260908-FREE-ORDER-RULINGS.md T3):
 *  - EVERY set max flag expands (fixes the old else-if that dropped one of
 *    `max atk max spa`); identical re-claims collapse.
 *  - Same-stat conflict: an explicit EV on the stat a max NAMES errors when it
 *    differs (dedupe-vs-conflict) and collapses when equal. The implied HP
 *    component of max def / max spd does NOT conflict — an explicit HP EV
 *    overrides it (explicit beats auto).
 *  - Total EVs after expansion + explicit EVs must be <= 510 (max def / max spd
 *    carry HP 252, so e.g. max atk + max def = 756 and errors).
 *  - Auto-nature (only when none typed): the FIRST-typed max's nature wins;
 *    explicit nature always beats any auto. max atk/spa/def/spd use the
 *    shorthand's low/high (dropSpa picks); max spe is Timid (special move) /
 *    Jolly (physical move), base-Atk-vs-SpA fallback when no move (defender);
 *    max hp sets NO auto-nature.
 *  The EV spreads come from auto-fill-defaults.md's shorthand table. */
function applyMaxFlags(spec, move, side) {
  if (!spec) return;
  const MAP = { _maxAtk: "atk", _maxSpa: "spa", _maxDef: "def", _maxSpd: "spd", _maxSpe: "spe", _maxHp: "hp" };
  const flags = Object.keys(MAP).filter((f) => spec[f]);
  if (!flags.length) return;
  const entry = monByName.get(norm(spec.name ?? ""));
  const dropSpa = entry && entry.baseStats.atk > entry.baseStats.spa;

  // merge every shorthand's EVs; same stat twice with the same value collapses
  // (max def + max spd both carry hp 252), different values would be a conflict.
  const merged = {};
  for (const f of flags) {
    const named = MAP[f];
    const def = SHORTHAND["max " + named];
    if (!def) continue;
    const val = def.evs[named];
    const explicit = spec.evs?.[named];
    if (explicit != null && explicit !== val) {
      throw new Error(`conflict on ev:${named}: ${val} vs ${explicit}`);
    }
    for (const [st, v] of Object.entries(def.evs)) {
      if (merged[st] != null && merged[st] !== v) {
        throw new Error(`conflict on ev:${st}: ${merged[st]} vs ${v}`);
      }
      merged[st] = v;
    }
  }
  // explicit EVs win over a max shorthand's implied components (e.g. hp inside
  // max def / max spd); named-stat conflicts already errored above.
  spec.evs = { ...merged, ...(spec.evs ?? {}) };
  const total = Object.values(spec.evs).reduce((a, b) => a + b, 0);
  if (total > 510) {
    throw new Error(`too many EVs: ${total} (> 510 cap)`);
  }

  // auto-nature: first-typed max wins (spec._maxOrder from the converter);
  // agent-authored specs without an order fall back to the old priority.
  if (!spec.nature) {
    const order = (spec._maxOrder ?? []).filter((f) => flags.includes(f));
    const fallback = ["_maxDef", "_maxSpd", "_maxSpa", "_maxAtk", "_maxSpe", "_maxHp"];
    const setter = (order.length ? order : fallback).find((f) => flags.includes(f));
    let nature = null;
    if (setter) {
      const named = MAP[setter];
      if (named === "spe") {
        if (side === "attacker" && move?.category === "Special") nature = "Timid";
        else if (side === "attacker" && move?.category === "Physical") nature = "Jolly";
        else nature = dropSpa ? "Jolly" : "Timid";
      } else if (named === "hp") {
        nature = null; // no nature raises HP — leave the neutral / explicit default
      } else {
        const def = SHORTHAND["max " + named];
        nature = def ? (dropSpa ? def.high : def.low) : null;
      }
    }
    if (nature) spec.nature = nature;
  }

  for (const f of flags) delete spec[f];
  delete spec._maxOrder;
}

/**
 * Flame Orb / Toxic Orb default their holder to burned / badly poisoned
 * (gen-6 type restrictions respected: Fire can't be burned, Steel/Poison
 * can't be badly poisoned — the orb does nothing there). Runs before ability
 * defaulting so the status-first rule sees the orb-induced status. An explicit
 * typed status always wins over the orb. The mapping comes from
 * auto-fill-defaults.md's Orb defaults table (ORB).
 */
function inferOrbStatus(spec) {
  if (!spec || spec.status || !spec.item) return;
  const orb = ORB[spec.item];
  if (!orb) return;
  const entry = monByName.get(norm(spec.name ?? ""));
  if (!entry) return;
  const blocked = orb.blocked.some((t) => entry.types.includes(t));
  if (blocked) {
    spec._orbNote = `${spec.item} does nothing: ${entry.name} can't be ${orb.status === "brn" ? "burned" : "badly poisoned"}`;
    return;
  }
  spec.status = orb.status;
}

// --- default fill (the front stage's "make every variable explicit" step) ---

/** Turn one combatant's parse spec into the fully-variable form calc needs:
 *  expand max-flag shorthands, apply orb->status, resolve a dynamic boost onto
 *  the stat it follows, and pick a default ability when none was named. */
function fillCombatant(spec, move, matchup, side) {
  if (!spec) return;
  applyMaxFlags(spec, move, side);
  inferOrbStatus(spec);
  if (spec._plusBoost && move?.category) {
    // dynamic boost: on the attacker it hits the stat the move uses; on the
    // defender the stat the move targets
    const moveStat = side === "attacker"
      ? move.category === "Physical" ? "atk" : "spa"
      : move.category === "Physical" ? "def" : "spd";
    const b = spec.boosts ?? {};
    spec.boosts = { ...b, [moveStat]: Math.max(-6, Math.min(6, (b[moveStat] ?? 0) + spec._plusBoost)) };
  }
  delete spec._plusBoost;
  if (!spec.ability) {
    spec.ability = defaultAbilityName(spec, move, matchup, side === "attacker");
    spec._autoAbility = true;
  }
}

/** Decide arena weather when none was typed (either side may set it via
 *  Drought/Drizzle/Sand Stream/Snow Warning/Desolate Land/...). Auto-picked
 *  abilities re-run after the weather is known so they see it. */
function fillWeather(matchup, move) {
  if (matchup.weather) return;
  const w = weatherFromSetters(matchup);
  if (!w) return;
  matchup.weather = w;
  if (matchup.defender?._autoAbility) {
    matchup.defender.ability = defaultAbilityName(matchup.defender, move, matchup, false);
  }
  if (matchup.attacker?._autoAbility) {
    matchup.attacker.ability = defaultAbilityName(matchup.attacker, move, matchup, true);
  }
}

// --- pipeline glue ---

/** Resolve a parsed combatant spec into a full Combatant record (stats, types,
 *  ability/item/status, stage fields). All dex/nature lookups happen here — the
 *  calc stage receives only the finished record. Default level/IV/EV/nature
 *  come from auto-fill-defaults.md's Defaults-at-a-glance table (FILL_DEFAULTS). */
function resolve(spec) {
  const entry = monByName.get(norm(spec.name));
  if (!entry) throw new Error(`missing species: "${spec.name}"`);
  const nature = natureByName.get((spec.nature ?? FILL_DEFAULTS.nature).toLowerCase()) ?? natureByName.get("serious");
  const evs = spec.evs ?? {};
  const ivFloor = FILL_DEFAULTS.ivs;
  const evFloor = FILL_DEFAULTS.evs;
  const stats = calcStats(entry.baseStats, {
    level: spec.level ?? FILL_DEFAULTS.level,
    nature,
    ivs: spec.ivs ?? { hp: ivFloor, atk: ivFloor, def: ivFloor, spa: ivFloor, spd: ivFloor, spe: ivFloor },
    evs: evFloor > 0 ? { hp: evFloor, atk: evFloor, def: evFloor, spa: evFloor, spd: evFloor, spe: evFloor, ...evs } : evs,
  });
  const isMega = entry.name.endsWith("-Mega");
  // A Mega must hold its Mega Stone, so an explicitly typed item (or the
  // `plate` keyword) contradicts it — fail loud instead of silently dropping
  // it (DESIGN-RECORDS §9).
  if (isMega && (spec.item || spec.plate)) {
    throw new Error(`conflict on item: ${spec.item ?? "plate"} vs Mega Stone`);
  }
  return {
    name: entry.name,
    types: entry.types,
    level: spec.level ?? FILL_DEFAULTS.level,
    stats,
    nature: nature.name,
    evs,
    ability: spec.ability ?? entry.abilities[0],
    item: spec.item,
    // A Mega always holds its Mega Stone. That stone is the default item, set
    // here in the defaults stage BEFORE any power calc, so a stray `no item`
    // on a Mega can never make it look itemless (Acrobatics) or Knock Off-able.
    noItem: !!spec.noItem && !isMega,
    mega: isMega,
    weightKg: entry.weightKg,
    status: spec.status,
    boosts: spec.boosts,
    accStage: spec.accStage ?? spec._accStage,
    evaStage: spec.evaStage ?? spec._evaStage,
    hpFraction: spec.hpFraction,
    gender: spec.gender,
  };
}

/** Cloud Nine / Air Lock nullify ALL weather effects for the calculation only
 *  (move boosts, end-of-turn sand/hail chip, weather abilities, primal weathers). */
function suppressWeather(attacker, defender) {
  const isSuppressor = (c) => c && (c.ability === "Air Lock" || c.ability === "Cloud Nine");
  return isSuppressor(attacker) || isSuppressor(defender);
}

/** Resolve a `plate` spec token into a held item on the resolved attacker using
 *  the move's EFFECTIVE type (Pixilate Hyper Voice -> Pixie Plate, Aerilate
 *  Return -> Sky Plate, Weather Ball in sun -> the Fire plate, ...). Returns a
 *  note when no plate boosts that type, else empty. */
function resolvePlate(attacker, move, effWeather) {
  const effType = move.name === "Weather Ball"
    ? resolveWeatherBall(effWeather).type
    : remapMoveType(attacker, move).type;
  const plate = PLATE_BY_TYPE[effType];
  if (plate) {
    attacker.item = plate;
    return "";
  }
  attacker.item = undefined;
  return `no plate boosts ${effType}`;
}

/** Build the Move-row flag list for a single card (crit / screens / plate +
 *  orb notes) from the parsed specs and resolved context. */
function cardFlags(matchup, spec, plateNote) {
  const flags = [];
  if (matchup.crit) flags.push("crit");
  if (matchup.screens) flags.push(matchup.screens);
  if (plateNote) flags.push(plateNote);
  if (spec.attacker?._plateNote) flags.push(spec.attacker._plateNote);
  if (spec.defender?._plateNote) flags.push(spec.defender._plateNote);
  if (spec.attacker?._orbNote) flags.push(spec.attacker._orbNote);
  if (spec.defender?._orbNote) flags.push(spec.defender._orbNote);
  return flags;
}

/** Single-move query: fill defaults and resolve everything calc needs. Returns
 *  the calc input object (attacker/defender records, the Move record, arena
 *  fields, flags, query). JSON-serializable — chart is NOT included (a Map);
 *  the caller supplies it (library path) or the calc CLI rebuilds it. */
function resolveSingleInput(matchup) {
  const canonical = resolveMoveName(matchup.move);
  const move = moveByName.get(norm(canonical ?? matchup.move));
  if (!move) throw new Error(`missing move: "${matchup.move}"`);
  matchup.move = move.name;

  fillCombatant(matchup.defender, move, matchup, "defender");
  fillCombatant(matchup.attacker, move, matchup, "attacker");
  fillWeather(matchup, move);

  const attacker = resolve(matchup.attacker);
  const defender = resolve(matchup.defender);
  const effWeather = suppressWeather(attacker, defender) ? undefined : matchup.weather;
  const plateNote = matchup.attacker?.plate ? resolvePlate(attacker, move, effWeather) : "";
  const flags = cardFlags(matchup, matchup, plateNote);

  return {
    kind: "single",
    attacker,
    defender,
    move,
    weather: matchup.weather,
    terrain: matchup.terrain,
    crit: matchup.crit,
    screens: matchup.screens,
    stealthRock: matchup.stealthRock,
    spikes: matchup.spikes,
    targetHoldsItem: matchup.targetHoldsItem,
    movedAfterTarget: matchup.movedAfterTarget,
    ignoresAbilities: matchup.ignoresAbilities,
    maxTurns: matchup.maxTurns,
    showTurns: matchup.showTurns,
    flags,
    query: matchup._query,
  };
}

/** Two-move combo: fill defaults anchored on the first move and resolve
 *  everything calc needs. Returns the calc input object (JSON-serializable). */
function resolveComboInput(matchup) {
  const moveEntries = matchup.moves.map((nm) => {
    const m = moveByName.get(norm(nm));
    if (!m) throw new Error(`missing move: "${nm}"`);
    return m;
  });
  const anchor = moveEntries[0];

  fillCombatant(matchup.defender, anchor, matchup, "defender");
  fillCombatant(matchup.attacker, anchor, matchup, "attacker");
  fillWeather(matchup, anchor);

  const attacker = resolve(matchup.attacker);
  const defender = resolve(matchup.defender);
  const effWeather = suppressWeather(attacker, defender) ? undefined : matchup.weather;
  const plateNote = matchup.attacker?.plate ? resolvePlate(attacker, anchor, effWeather) : "";
  const flags = cardFlags(matchup, matchup, plateNote);

  return {
    kind: "combo",
    attacker,
    defender,
    moves: moveEntries,
    weather: matchup.weather,
    terrain: matchup.terrain,
    crit: matchup.crit,
    screens: matchup.screens,
    stealthRock: matchup.stealthRock,
    spikes: matchup.spikes,
    targetHoldsItem: matchup.targetHoldsItem,
    movedAfterTarget: matchup.movedAfterTarget,
    ignoresAbilities: matchup.ignoresAbilities,
    flags,
    query: matchup._query,
  };
}

/** Detect the move shape on the matchup; returns "single" or "combo". Mutates
 *  matchup.moves/matchup.move so the resolvers below see the decided form. */
function classifyMatchup(matchup) {
  // Move slot has NO delimiter grammar: claim exact moves from the slot text
  // (1 = single, 2 distinct = the fixed two-move sequence in claimed order,
  // 0 or >2 = hard error from claimMoves). The free-order converter route
  // (parseQuery) pre-claims and attaches parsed.signals + move/moves itself —
  // fold any pre-claimed signals, then only claim when no moves array exists.
  if (matchup.signals) {
    foldBoostSignals(matchup.attacker, matchup.signals);
    delete matchup.signals;
  }
  if (!matchup.moves) {
    const parsed = claimMoves(matchup.move ?? "");
    if (parsed.signals) foldBoostSignals(matchup.attacker, parsed.signals);
    if (parsed?.chain) matchup.moves = parsed.chain;
    else if (parsed?.single) matchup.move = parsed.single;
  }
  if (Array.isArray(matchup.moves) && matchup.moves.length >= 2) {
    if (matchup.moves.length > 2) throw new Error(`too many moves in a combo — capped at 2 (${matchup.moves.join(" then ")})`);
    return "combo";
  }
  return "single";
}

const clampStage = (n) => Math.max(-6, Math.min(6, n));

/** Fold BOOST-SIGNAL moves (aliases.md "## Boosting moves", doc-as-code) onto
 *  the ATTACKER as stat stages. A boosting move in the move slot is never the
 *  damage move: claimMoves returns its canonical name in `signals`, and each
 *  converts to its per-stat stage deltas here. Multiple signals coexist and are
 *  ADDITIVE with each other and with any typed stages / the stat-less dynamic
 *  boost — e.g. `-1` + Dragon Dance + Swords Dance + EQ = +2 atk/+1 spe EQ —
 *  and every stat clamps to the ±6 stage range. Acc/eva signals (Coil, Hone
 *  Claws, Double Team, Minimize) land on the acc/eva channels (never damage). */
function foldBoostSignals(spec, signals) {
  if (!spec || !Array.isArray(signals) || !signals.length) return;
  for (const name of signals) {
    const d = BOOST_MOVES.get(name);
    if (!d) continue;
    for (const k of ["atk", "def", "spa", "spd", "spe"]) {
      if (!d[k]) continue;
      spec.boosts = spec.boosts ?? {};
      const v = clampStage((spec.boosts[k] ?? 0) + d[k]);
      if (v) spec.boosts[k] = v;
      else delete spec.boosts[k];
    }
    if (d.acc) spec._accStage = clampStage((spec._accStage ?? 0) + d.acc);
    if (d.eva) spec._evaStage = clampStage((spec._evaStage ?? 0) + d.eva);
  }
}

/** Emit the resolved calc-input object for a parsed matchup. */
export function resolveMatchup(matchup) {
  return classifyMatchup(matchup) === "combo"
    ? resolveComboInput(matchup)
    : resolveSingleInput(matchup);
}

// --- standalone CLI (only when run directly) ---
// Reads a spec JSON (file arg, or stdin when "-" / no arg) and writes the
// resolved calc-input JSON that calc.mjs consumes.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const inputArg = process.argv[2];
  let raw;
  if (inputArg && inputArg !== "-") {
    raw = await readFile(path.resolve(inputArg), "utf8");
  } else {
    raw = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) raw += chunk;
  }
  const spec = JSON.parse(raw);
  process.stdout.write(JSON.stringify(resolveMatchup(spec), null, 2) + "\n");
}
