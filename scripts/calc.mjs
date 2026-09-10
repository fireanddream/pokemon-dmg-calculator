// calc.mjs — pure damage calculation stage. Does NOT look anything up.
//
// The caller (input-converter -> fill, the front stages) has already resolved every name to its record:
// attacker/defender are Combatants with stats computed, move(s) are full dex
// Move records, `chart` is the built type chart, and arena flags/notes are set.
// calc only runs the engine math (calcDamage, ko sim, Skill Link/berry rolls,
// hazard chip, hitChance) and returns one raw result bag. No printing here.
//
// Standalone CLI (only when run directly, e.g. `node scripts/calc.mjs`):
// reads a resolved matchup JSON (file arg or stdin) and writes the result bag
// JSON to stdout. The chart is NOT part of the JSON input (a Map); this CLI
// rebuilds it from types-xy.json for the run. Library importers (damage.mjs)
// pass their own chart and never trigger this.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calcDamage,
  koAnalysis,
  resistBerryActivates,
  hitChance,
  buildTypeChart,
} from "../dist/index.js";

// Gen-6 damaging moves that hit 2-5 times (Skill Link raises them to 5 hits).
// Operates on an already-resolved move record's name (a game rule, not a
// user-input lookup — the move object itself is the trusted input).
const MULTIHIT_MOVES = new Set([
  "Arm Thrust", "Barrage", "Bone Rush", "Bullet Seed", "Comet Punch",
  "Double Slap", "Fury Attack", "Fury Swipes", "Icicle Spear", "Pin Missile",
  "Rock Blast", "Spike Cannon", "Tail Slap", "Water Shuriken",
]);

/**
 * Distribution of a Skill Link 5-hit action: sum of 5 independent draws from
 * the per-hit 16 damage rolls (each roll equally likely). Returns sorted sums
 * plus their probabilities (weights total 1).
 */
function fiveHitDistribution(rolls) {
  let dist = new Map([[0, 1]]);
  for (let hit = 0; hit < 5; hit++) {
    const next = new Map();
    for (const [dmg, count] of dist) {
      for (const r of rolls) {
        next.set(dmg + r, (next.get(dmg + r) ?? 0) + count);
      }
    }
    dist = next;
  }
  const total = 16 ** 5;
  const sums = [...dist.keys()].sort((a, b) => a - b);
  const weights = sums.map((s) => dist.get(s) / total);
  return { sums, weights };
}

// Cloud Nine / Air Lock nullify ALL weather effects for the calculation only.
const isSuppressor = (c) => c?.ability === "Air Lock" || c?.ability === "Cloud Nine";

/**
 * Entry hazards hit the defender once at switch-in, before the first attack.
 * They also drop it below full HP, so full-HP gates (Multiscale, Sturdy,
 * Focus Sash) stop applying for this matchup.
 */
function hazardDamage(defender, chart, { stealthRock, spikes }) {
  const hp = defender.stats.hp;
  let hazardTotal = 0;
  const magicGuard = defender.ability === "Magic Guard";
  const rockEff = defender.types.reduce((a, t) => a * (chart.get("Rock")?.get(t) ?? 1), 1);
  if (stealthRock && !magicGuard) hazardTotal += Math.floor((hp * rockEff) / 8);
  if (spikes && !magicGuard && !(defender.types.includes("Flying") || defender.ability === "Levitate")) {
    const div = spikes === 3 ? 4 : spikes === 2 ? 6 : 8;
    hazardTotal += Math.floor(hp / div);
  }
  const initialHp = Math.max(1, hp - hazardTotal);
  return { hp, hazardTotal, initialHp };
}

/**
 * Raw calculation for one move landing repeatedly (the normal card). Inputs are
 * trusted resolved records; the bag carries everything the output stage needs.
 */
export function calcSingle(input) {
  const { attacker, defender, move, chart } = input;
  const suppressWeather = isSuppressor(attacker) || isSuppressor(defender);
  const effWeather = suppressWeather ? undefined : input.weather;

  // Accuracy / evasion: the attacker's acc stage vs the defender's eva stage
  // (plus items/abilities/weather via hitChance). Damage is NEVER gated on this
  // — moves are assumed to connect unless they literally cannot (impossible).
  const acc = hitChance({
    moveName: move.name,
    baseAccuracy: move.accuracy,
    category: move.category,
    attacker: { ability: attacker.ability, item: attacker.item, stage: attacker.accStage },
    defender: { ability: defender.ability, item: defender.item, stage: defender.evaStage },
    defenderTypes: defender.types,
    weather: effWeather,
    ignoresAbilities: input.ignoresAbilities,
    movedAfterTarget: input.movedAfterTarget,
  });

  const { hp, hazardTotal, initialHp } = hazardDamage(defender, chart, input);

  const baseParams = {
    attacker,
    defender,
    move,
    chart,
    crit: input.crit,
    weather: effWeather,
    terrain: input.terrain,
    screens: input.screens,
    targetHoldsItem: input.targetHoldsItem ?? (!defender.noItem && !defender.mega),
    attackerHoldsItem: input.attackerHoldsItem ?? !attacker.noItem,
    movedAfterTarget: input.movedAfterTarget,
    flashFireBoosted: false,
    ignoresAbilities: input.ignoresAbilities,
    damageTakenBefore: hazardTotal,
  };
  const result = calcDamage(baseParams);

  // Skill Link: multi-hit moves always land 5 hits (weighted sum-of-5 rolls).
  const skillLink = attacker.ability === "Skill Link" && MULTIHIT_MOVES.has(move.name);
  const berryHalved = !skillLink && resistBerryActivates(move.type, defender.types, defender.item);
  let rolls = result.rolls;
  let rollWeights;
  let firstHitRolls;
  if (skillLink) {
    const five = fiveHitDistribution(result.rolls);
    rolls = five.sums;
    rollWeights = five.weights;
  } else if (berryHalved) {
    // Resist berry halves the first hit; later hits are full after it is eaten.
    const normalResult = calcDamage({ ...baseParams, defender: { ...defender, item: undefined }, targetHoldsItem: false });
    rolls = normalResult.rolls;
    firstHitRolls = result.rolls;
  }

  const ko = koAnalysis({
    rolls,
    firstHitRolls,
    weights: rollWeights,
    maxHp: hp,
    initialHp,
    passives: {
      status: defender.status,
      item: defender.item,
      ability: defender.ability,
      types: defender.types,
      weather: effWeather,
      terrain: input.terrain,
      foeUnnerve: attacker?.ability === "Unnerve",
    },
    maxTurns: input.maxTurns ?? 10,
  });

  return {
    kind: "single",
    attacker,
    defender,
    moveName: move.name,
    flags: input.flags ?? [],
    damageNotes: result.notes,
    weather: input.weather,
    suppressWeather,
    terrain: input.terrain,
    stealthRock: input.stealthRock,
    spikes: input.spikes,
    hp,
    acc,
    // Rolls actually shown on the Damage row (halved-first-hit or Skill Link
    // set when applicable), plus markers for the row suffix.
    displayRolls: firstHitRolls ?? rolls,
    berryHalved: !!firstHitRolls,
    skillLink,
    ko,
    maxTurns: input.maxTurns ?? 10,
    showTurns: input.showTurns,
    query: input.query,
  };
}

/**
 * Raw calculation for a fixed two-move chain ("EQ then Outrage"): move 1 lands
 * turn 1, move 2 lands turn 2 from the surviving HP distribution. Inputs are
 * trusted resolved records; returns a bag the output stage renders.
 */
export function calcCombo(input) {
  const { attacker, defender, moves, chart } = input;
  const suppressWeather = isSuppressor(attacker) || isSuppressor(defender);
  const effWeather = suppressWeather ? undefined : input.weather;

  // Combined chance every attack in the chain connects (display-only).
  const chainChance = moves.reduce((prod, m) => {
    const a = hitChance({
      moveName: m.name,
      baseAccuracy: m.accuracy,
      category: m.category,
      attacker: { ability: attacker.ability, item: attacker.item, stage: attacker.accStage },
      defender: { ability: defender.ability, item: defender.item, stage: defender.evaStage },
      defenderTypes: defender.types,
      weather: effWeather,
      ignoresAbilities: input.ignoresAbilities,
      movedAfterTarget: input.movedAfterTarget,
    });
    return prod * (a.always || a.impossible ? 1 : a.chance);
  }, 1);

  const { hp, hazardTotal, initialHp } = hazardDamage(defender, chart, input);

  const baseParams = {
    attacker, defender, chart,
    crit: input.crit, weather: effWeather, terrain: input.terrain,
    screens: input.screens,
    targetHoldsItem: input.targetHoldsItem ?? (!defender.noItem && !defender.mega),
    attackerHoldsItem: input.attackerHoldsItem ?? !attacker.noItem,
    movedAfterTarget: input.movedAfterTarget, flashFireBoosted: false,
    ignoresAbilities: input.ignoresAbilities, damageTakenBefore: hazardTotal,
  };

  // Per-move rolls. Each move lands exactly once in a chain, so the first move
  // whose type matches a held resist berry gets that (halved) hit and the berry
  // is gone — no full-damage "later hits" set needed.
  const firstBerry = moves.findIndex((m) => resistBerryActivates(m.type, defender.types, defender.item));
  const seqTurns = moves.map((m, i) => {
    const skillLink = attacker.ability === "Skill Link" && MULTIHIT_MOVES.has(m.name);
    const result = calcDamage({ ...baseParams, move: m });
    let rolls = result.rolls;
    let weights;
    const marker = [];
    if (skillLink) {
      const five = fiveHitDistribution(result.rolls);
      rolls = five.sums;
      weights = five.weights;
      marker.push("Skill Link x5");
    }
    if (i === firstBerry) marker.push("resist berry");
    return { name: m.name, rolls, weights, notes: result.notes, marker, noDmg: rolls.length === 0 };
  });

  const turnSets = seqTurns.map((t) =>
    t.noDmg ? { rolls: [0], weights: [1] } : { rolls: t.rolls, weights: t.weights }
  );

  const ko = koAnalysis({
    maxHp: hp,
    initialHp,
    passives: {
      status: defender.status, item: defender.item, ability: defender.ability,
      types: defender.types, weather: effWeather, terrain: input.terrain,
      foeUnnerve: attacker?.ability === "Unnerve",
    },
    maxTurns: seqTurns.length,
    turnSets,
  });

  return {
    kind: "combo",
    attacker,
    defender,
    flags: input.flags ?? [],
    weather: input.weather,
    suppressWeather,
    terrain: input.terrain,
    stealthRock: input.stealthRock,
    spikes: input.spikes,
    hp,
    seqTurns,
    ko,
    chainChance,
    query: input.query,
  };
}

// --- standalone CLI (only when run directly: node scripts/calc.mjs) ---
// Reads a resolved matchup JSON (file arg, or stdin when "-" / no arg) and
// writes the result bag JSON to stdout. The chart is rebuilt from types-xy.json
// because it is a Map and cannot ride in the JSON input.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const DATA_DIR = path.join(here, "..", "data");
  const inputPath = process.argv[2] && process.argv[2] !== "-" ? path.resolve(process.argv[2]) : null;

  let raw;
  if (inputPath) {
    raw = await readFile(inputPath, "utf8");
  } else {
    raw = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) raw += chunk;
  }
  const matchup = JSON.parse(raw);
  const typesData = JSON.parse(await readFile(path.join(DATA_DIR, "types-xy.json"), "utf8"));
  const chart = buildTypeChart(typesData.types);

  const isCombo = matchup.kind === "combo"
    || (Array.isArray(matchup.moves) && matchup.moves.length >= 2);
  const bag = isCombo
    ? calcCombo({ ...matchup, chart })
    : calcSingle({ ...matchup, move: matchup.move ?? matchup.moves?.[0], chart });
  process.stdout.write(JSON.stringify(bag, null, 2) + "\n");
}
