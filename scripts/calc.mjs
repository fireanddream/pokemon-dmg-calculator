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
import {
  calcDamage,
  koAnalysis,
  resistBerryActivates,
  hitChance,
} from "../dist/index.js";
import { isMain, readInput } from "./cli.mjs";

// Gen-6 damaging moves that hit 2-5 times (Skill Link raises them to 5 hits).
// Operates on an already-resolved move record's name (a game rule, not a
// user-input lookup — the move object itself is the trusted input).
const MULTIHIT_MOVES = new Set([
  "Arm Thrust", "Barrage", "Bone Rush", "Bullet Seed", "Comet Punch",
  "Double Slap", "Fury Attack", "Fury Swipes", "Icicle Spear", "Pin Missile",
  "Rock Blast", "Spike Cannon", "Tail Slap", "Water Shuriken",
]);

// Gen-6 probability of each hit total for a 2-5 move (Skill Link forces 5).
const MULTIHIT_COUNTS = [
  { hits: 2, prob: 3 / 8 }, { hits: 3, prob: 3 / 8 },
  { hits: 4, prob: 1 / 8 }, { hits: 5, prob: 1 / 8 },
];
const SKILL_LINK_COUNTS = [{ hits: 5, prob: 1 }];

/**
 * Weighted distribution of the TOTAL damage of one multi-hit use.
 *
 * `perHitFull` are the 16 per-hit rolls with the resist berry NOT applying.
 * When `firstRolls` is given (resist berry triggers), hit 1 draws from it and
 * every later hit from `perHitFull`. Each entry in `counts` is convolved
 * exactly (independent per-hit rolls) and combined into one distribution whose
 * weights sum to 1 sorted by total. Returns { sums, weights }.
 */
export function multiHitDistribution(perHitFull, firstRolls, counts) {
  const dist = new Map();
  for (const { hits, prob } of counts) {
    let sub = new Map([[0, 1]]);
    let denom = 1;
    for (let h = 0; h < hits; h++) {
      const rolls = h === 0 && firstRolls ? firstRolls : perHitFull;
      const next = new Map();
      for (const [dmg, count] of sub) {
        for (const r of rolls) next.set(dmg + r, (next.get(dmg + r) ?? 0) + count);
      }
      sub = next;
      denom *= rolls.length;
    }
    for (const [dmg, count] of sub) dist.set(dmg, (dist.get(dmg) ?? 0) + (count / denom) * prob);
  }
  const sums = [...dist.keys()].sort((a, b) => a - b);
  const weights = sums.map((s) => dist.get(s));
  return { sums, weights };
}

/**
 * One-use damage distribution for a single move, plus the card markers.
 *
 * A plain move is just `counts = [{ hits: 1, prob: 1 }]`; a 2-5 move is the
 * weighted hit-count table (Skill Link forces 5). The resist berry's
 * first-hit-only halving is the SAME `firstRolls` path in every case, so the
 * single-hit berry is the 1-hit special case, not separate code.
 *
 * `berryAvailable` is false for a combo move landing after the berry was
 * already eaten. `multiHit` tells the KO sim Focus Sash / Sturdy cannot save
 * the attack. `marker` is the row suffix used by the combo renderer.
 */
function moveUseDistribution(attacker, defender, move, result, baseParams, berryAvailable = true) {
  const isMulti = MULTIHIT_MOVES.has(move.name);
  const skillLink = attacker.ability === "Skill Link" && isMulti;
  const berryCandidate = berryAvailable && resistBerryActivates(move.type, defender.types, defender.item);
  const fullResult = berryCandidate
    ? calcDamage({ ...baseParams, move, defender: { ...defender, item: undefined }, targetHoldsItem: false })
    : result;
  const berryHalved = berryCandidate && fullResult.rolls.some((r, i) => r !== result.rolls[i]);
  const perHitFull = berryHalved ? fullResult.rolls : result.rolls;
  const perHitFirst = berryHalved ? result.rolls : undefined;

  const counts = isMulti
    ? skillLink ? SKILL_LINK_COUNTS : MULTIHIT_COUNTS
    : [{ hits: 1, prob: 1 }];
  const full = multiHitDistribution(perHitFull, undefined, counts);
  const first = berryHalved ? multiHitDistribution(perHitFull, perHitFirst, counts) : null;

  const marker = [];
  if (berryHalved) marker.push("resist berry");
  if (isMulti) marker.push(skillLink ? "Skill Link x5" : "2-5 hits");

  return {
    rolls: full.sums,
    weights: full.weights,
    firstHitRolls: first?.sums,
    firstHitWeights: first?.weights,
    multiHit: isMulti,
    berryHalved,
    skillLink,
    marker,
  };
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

/** The calcDamage parameter bag shared by the single and combo paths. `move` is
 *  NOT part of it — a single sets it once, a combo overrides it per move — so a
 *  field added here is added to BOTH paths by construction. */
function buildBaseParams(input, effWeather, hazardTotal) {
  const { attacker, defender, chart } = input;
  return {
    attacker,
    defender,
    chart,
    crit: input.crit,
    weather: effWeather,
    auras: input.auras,
    auraBreak: input.auraBreak,
    terrain: input.terrain,
    screens: input.screens,
    targetHoldsItem: input.targetHoldsItem ?? (!defender.noItem && !defender.mega),
    attackerHoldsItem: input.attackerHoldsItem ?? !attacker.noItem,
    movedAfterTarget: input.movedAfterTarget,
    flashFireBoosted: false,
    ignoresAbilities: input.ignoresAbilities,
    damageTakenBefore: hazardTotal,
  };
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

  const baseParams = { ...buildBaseParams(input, effWeather, hazardTotal), move };
  const result = calcDamage(baseParams);

  // One-use distribution: multi-hit convolution + the resist berry's first hit.
  const use = moveUseDistribution(attacker, defender, move, result, baseParams);

  const ko = koAnalysis({
    rolls: use.rolls,
    firstHitRolls: use.firstHitRolls,
    firstHitWeights: use.firstHitWeights,
    weights: use.weights,
    multiHit: use.multiHit,
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
    auras: input.auras,
    auraBreak: input.auraBreak,
    suppressWeather,
    terrain: input.terrain,
    stealthRock: input.stealthRock,
    spikes: input.spikes,
    hp,
    acc,
    // Rolls actually shown on the Damage row (the berry first use or the full
    // multi-hit total when applicable), plus markers for the row suffix.
    displayRolls: use.firstHitRolls ?? use.rolls,
    berryHalved: use.berryHalved,
    skillLink: use.skillLink,
    multiHit: use.multiHit,
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

  const baseParams = buildBaseParams(input, effWeather, hazardTotal);

  // Per-move rolls. Each move lands exactly once in a chain, so only the first
  // move whose type matches a held resist berry draws a halved FIRST hit (for a
  // multi-hit move the later hits are full — the berry is eaten after hit 1).
  const firstBerry = moves.findIndex((m) => resistBerryActivates(m.type, defender.types, defender.item));
  const seqTurns = moves.map((m, i) => {
    const result = calcDamage({ ...baseParams, move: m });
    const use = moveUseDistribution(attacker, defender, m, result, baseParams, i === firstBerry);
    return { name: m.name, ...use, notes: result.notes, noDmg: use.rolls.length === 0 };
  });

  const turnSets = seqTurns.map((t) =>
    t.noDmg
      ? { rolls: [0], weights: [1] }
      : { rolls: t.rolls, weights: t.weights, firstHitRolls: t.firstHitRolls, firstHitWeights: t.firstHitWeights, multiHit: t.multiHit }
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
    auras: input.auras,
    auraBreak: input.auraBreak,
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

/**
 * Dispatch a resolved calc input to the single or combo calculator — the ONE
 * place that decides which. `kind` is set by fill.mjs; the moves[] length check
 * covers hand-written resolved JSON that carries no kind. The caller attaches
 * `chart` (a Map, so it cannot ride in the JSON input).
 */
export function runCalc(input) {
  const isCombo = input.kind === "combo" || (Array.isArray(input.moves) && input.moves.length >= 2);
  return isCombo
    ? calcCombo(input)
    : calcSingle({ ...input, move: input.move ?? input.moves?.[0] });
}

// --- standalone CLI (only when run directly: node scripts/calc.mjs) ---
// Reads a resolved matchup JSON (file arg, or stdin when "-" / no arg) and
// writes the result bag JSON to stdout. The chart is loaded from the shared
// data module (it is a Map and cannot ride in the JSON input); the dynamic
// import keeps it out of the library-import path.
if (isMain(import.meta.url)) {
  const matchup = JSON.parse(await readInput(process.argv[2]));
  const { chart } = await import("./data.mjs");
  const bag = runCalc({ ...matchup, chart });
  process.stdout.write(JSON.stringify(bag, null, 2) + "\n");
}
