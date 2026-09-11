import type { TypeName } from "./types.js";
import type { StatusName, Terrain, Weather } from "./damage-calc.js";

export interface DefenderPassives {
  status?: StatusName;
  /** defender's held item (Leftovers / Sitrus Berry recognised for recovery) */
  item?: string;
  /** defender's ability (Magic Guard / Overcoat / Poison Heal change chip) */
  ability?: string;
  types: TypeName[];
  /** weather damage applied to the defender at end of turn */
  weather?: Weather;
  terrain?: Terrain;
  /** attacker holds Unnerve: defender's Sitrus Berry won't trigger */
  foeUnnerve?: boolean;
}

export interface KOTurnSet {
  /** 16 damage rolls (85-100%) for one hit of THIS move */
  rolls: number[];
  /** optional probabilities parallel to `rolls` (Skill Link sum distribution etc.) */
  weights?: number[];
  /** first-use rolls for this move when a resist berry triggers on it (any turn) */
  firstHitRolls?: number[];
  /** probabilities parallel to `firstHitRolls` (a weighted first-use distribution) */
  firstHitWeights?: number[];
  /** true when this turn's damage comes from a multi-hit move: Sash / Sturdy can't save */
  multiHit?: boolean;
}

export interface KOOptions {
  /** 16 damage rolls (85-100%) for one hit (normal, after berry consumed) */
  rolls: number[];
  /**
   * Optional: probabilities parallel to `rolls` when they are not uniform
   * (e.g. a Skill Link 5-hit sum distribution). Defaults to 1/rolls.length each.
   */
  weights?: number[];
  /**
   * Optional: rolls for the first hit when a damage-reducing berry (Occa, Passho, etc.)
   * is present and triggers. Halves damage once then consumed.
   */
  firstHitRolls?: number[];
  /** probabilities parallel to `firstHitRolls` (a weighted first-use distribution) */
  firstHitWeights?: number[];
  /** true when the attack is multi-hit (2-5): Focus Sash / Sturdy cannot save it. */
  multiHit?: boolean;
  maxHp: number;
  /**
   * Optional: starting HP for the simulation (defaults to maxHp). Entry hazards
   * (Stealth Rock / Spikes) reduce this once, before turn 1's attack.
   */
  initialHp?: number;
  passives?: DefenderPassives;
  /** hard cap on turns simulated; default 10 */
  maxTurns?: number;
  /**
   * Optional: per-turn damage distributions for a fixed move sequence (combo).
   * Turn i uses `turnSets[i-1]` (its own rolls/weights, first-hit rolls apply
   * only on turn 1). Overrides `rolls`/`weights` per turn; `maxTurns` then
   * defaults to the sequence length.
   */
  turnSets?: KOTurnSet[];
}

export interface KOLine {
  turn: number;
  /** probability (0..1) the defender is KOed by the hit this turn */
  hit: number;
  /** probability (0..1) the defender survives the hit but dies to end-of-turn passive damage */
  endOfTurn: number;
  /** cumulative KO probability through this turn */
  cumulative: number;
  /** probability (0..1) the defender is still alive after this turn's chip/heals */
  survivors: number;
  /** average remaining HP (absolute) across survivors, or null if none */
  surviveHp: number | null;
  /** lowest remaining HP (absolute) across survivors, or null if none */
  surviveHpMin?: number | null;
  /** highest remaining HP (absolute) across survivors, or null if none */
  surviveHpMax?: number | null;
}

export interface KOResult {
  lines: KOLine[];
  /** KO guaranteed by this turn (>=99.95%), or null if not within maxTurns */
  guaranteedTurn: number | null;
  /** KO never reached 100% within the cap */
  cannotKO: boolean;
}

const FRAC = (maxHp: number, denom: number) => Math.floor(maxHp / denom);

/**
 * KO probability analysis: attacker lands one hit per turn using `rolls`.
 *
 * Per-turn order:
 *   1. hit lands (may KO instantly)
 *   2. if still alive at <=50% HP and holding Sitrus Berry (not yet eaten) -> heal 25% now
 *   3. end of turn: passive DAMAGE first (burn/poison/toxic/weather), then passive HEALS
 *      (Leftovers). Dying to step 3 is an "end of turn" KO.
 *
 * All amounts are floored fractions of max HP (gen6): burn 1/8, poison 1/8,
 * toxic (counter n)/16, weather 1/16, Leftovers 1/16, Sitrus 1/4.
 */
export function koAnalysis(opts: KOOptions): KOResult {
  const { rolls, maxHp, firstHitRolls } = opts;
  const weights = opts.weights;
  const turnSets = opts.turnSets;
  // a combo (fixed move sequence) runs exactly its own length; otherwise honor maxTurns
  const maxTurns = turnSets ? Math.min(opts.maxTurns ?? turnSets.length, turnSets.length) : (opts.maxTurns ?? 10);
  const p = opts.passives;
  const lines: KOLine[] = [];

  if (!p) {
    // no passives: simple cumulative distribution of hits
    return noPassiveKO({ rolls, weights, maxHp, initialHp: opts.initialHp, maxTurns, firstHitRolls, firstHitWeights: opts.firstHitWeights });
  }

  // Magic Guard nullifies ALL indirect damage (status chip, weather chip,
  // hazards are applied upstream); Overcoat nullifies weather chip only.
  // Check both before their respective damage sources.
  const magicGuard = p.ability === "Magic Guard";
  const overcoat = p.ability === "Overcoat";
  const poisonHeal = (p.status === "psn" || p.status === "tox") && p.ability === "Poison Heal";
  // Sturdy / Focus Sash: survive ONE lethal *attack* at 1 HP, only while at
  // full HP. They never protect against indirect damage (end-of-turn chip).
  const sash = p.item === "Focus Sash";
  const sturdy = p.ability === "Sturdy";
  const fullStart = (opts.initialHp ?? maxHp) === maxHp;
  const survivesAttack = (sash || sturdy) && fullStart;

  let weatherDamage = 0;
  let burnDmg = 0;
  let psnDmg = 0;
  let toxic = false;
  if (!magicGuard) {
    // Poison Heal replaces poison/toxic damage with a 1/8 heal (no chip).
    burnDmg = p.status === "brn" ? FRAC(maxHp, 8) : 0;
    psnDmg = !poisonHeal && p.status === "psn" ? FRAC(maxHp, 8) : 0;
    toxic = !poisonHeal && p.status === "tox";
    if (!overcoat) {
      weatherDamage =
        p.weather === undefined
          ? 0
          : p.weather === "sand" && p.types.some((t) => t === "Rock" || t === "Ground" || t === "Steel")
            ? 0
            : p.weather === "hail" && p.types.includes("Ice")
              ? 0
              : p.weather === "sand" || p.weather === "hail"
                ? FRAC(maxHp, 16)
                : 0;
    }
    // Solar Power chips 1/8 in harsh sun; Black Sludge chips non-Poison types.
    if ((p.weather === "sun" || p.weather === "desolate") && p.ability === "Solar Power") {
      weatherDamage += FRAC(maxHp, 8);
    }
  }
  // Black Sludge heals a Poison-type holder like Leftovers; chips everyone else.
  const blackSludge = p.item === "Black Sludge";
  const poisonHolder = p.types.includes("Poison");
  const leftovers = p.item === "Leftovers" ? FRAC(maxHp, 16) : 0;
  const sludgeHeal = blackSludge && poisonHolder ? FRAC(maxHp, 16) : 0;
  const sludgeChip = !magicGuard && blackSludge && !poisonHolder ? FRAC(maxHp, 16) : 0;
  const poisonHealAmt = poisonHeal ? FRAC(maxHp, 8) : 0;
  const sitrus = p.item === "Sitrus Berry" && !p.foeUnnerve;

  const floorHp = (h: number) => Math.min(maxHp, Math.max(0, h));

  // entry hazards (Stealth Rock / Spikes) hit once at switch-in, before turn 1
  const startHp = Math.min(maxHp, Math.max(0, opts.initialHp ?? maxHp));

  // state: "hp:sitrusUsed:resistBerryUsed" -> probability
  let dist = new Map<string, number>();
  dist.set(`${startHp}:0:0`, 1);

  let cumulative = 0;

  for (let turn = 1; turn <= maxTurns; turn++) {
    const next = new Map<string, number>();
    let koHit = 0;
    let koEot = 0;
    // per-turn roll set (fixed move sequence); falls back to the shared rolls
    const set = turnSets ? turnSets[turn - 1] : undefined;
    const turnRolls = set?.rolls ?? rolls;
    const turnWeights = set?.weights ?? weights;
    // A combo turn carries its own first-hit set (the berry move may not be
    // turn 1); a single repeating move applies its first-hit set on turn 1.
    const firstForTurn = set ? set.firstHitRolls : turn === 1 ? firstHitRolls : undefined;
    const firstWeightsForTurn = set ? set.firstHitWeights : turn === 1 ? opts.firstHitWeights : undefined;
    // Focus Sash / Sturdy cannot save a multi-hit attack: the later hits finish it.
    const allowSave = survivesAttack && !(set ? set.multiHit : opts.multiHit);

    for (const [key, prob] of dist) {
      const parts = key.split(":");
      const hp = Number(parts[0]);
      const sitrusUsed = parts[1] === "1";
      const resistBerryUsed = parts[2] === "1";
      if (hp <= 0) continue;

      // choose rolls: first hit uses first-hit rolls if a resist berry still active
      const useFirstHit = !resistBerryUsed && !!firstForTurn;
      const hitRolls = useFirstHit ? firstForTurn! : turnRolls;
      const hitWeights = useFirstHit ? firstWeightsForTurn : turnWeights;

      for (let i = 0; i < hitRolls.length; i++) {
        const d = hitRolls[i]!;
        const weight = hitWeights
          ? hitWeights[i] ?? 1 / hitRolls.length
          : 1 / hitRolls.length;
        const after = hp - d;
        if (after <= 0) {
          // Sturdy / Focus Sash save the mon at 1 HP — but only from the
          // attack itself, never from indirect damage (handled below), and
          // never from a multi-hit attack (allowSave is false for those).
          if (allowSave && hp === maxHp) {
            // fall through with h = 1 (Sash consumed / Sturdy broken by the damage)
          } else {
            koHit += prob * weight;
            continue;
          }
        }
        let h = after <= 0 ? 1 : after;
        let sitrusNow = sitrusUsed;
        let resistNow = resistBerryUsed || (useFirstHit ? true : false);

        // Sitrus Berry: eaten immediately when <=50% after the hit
        if (sitrus && !sitrusNow && h * 2 <= maxHp) {
          h = floorHp(h + FRAC(maxHp, 4));
          sitrusNow = true;
        }
        // end of turn: damage first
        const toxicDmg = toxic ? FRAC(maxHp * Math.min(turn, 15), 16) : 0;
        const dmg = burnDmg + psnDmg + toxicDmg + weatherDamage + sludgeChip;
        const afterDmg = h - dmg;
        if (afterDmg <= 0) {
          koEot += prob * weight;
          continue;
        }
        // end of turn: heals after damage
        let hpNext = floorHp(afterDmg + leftovers + sludgeHeal + poisonHealAmt);
        if (hpNext <= 0) {
          koEot += prob * weight;
          continue;
        }
        const nk = `${hpNext}:${sitrusNow ? 1 : 0}:${resistNow ? 1 : 0}`;
        next.set(nk, (next.get(nk) ?? 0) + prob * weight);
      }
    }

    dist = next;
    cumulative += koHit + koEot;
    let sp = 0;
    let sHp = 0;
    let sMin = Infinity;
    let sMax = -1;
    for (const [key, prob] of dist) {
      const hpLeft = Number(key.split(":")[0]);
      sp += prob;
      sHp += prob * hpLeft;
      if (hpLeft < sMin) sMin = hpLeft;
      if (hpLeft > sMax) sMax = hpLeft;
    }
    lines.push({
      turn,
      hit: koHit,
      endOfTurn: koEot,
      cumulative,
      survivors: sp,
      surviveHp: sp > 0.0005 ? sHp / sp : null,
      surviveHpMin: sp > 0.0005 ? sMin : null,
      surviveHpMax: sp > 0.0005 ? sMax : null,
    });
    if (cumulative >= 0.9995) break;
  }

  const guaranteed = cumulative >= 0.9995 ? (lines.at(-1)?.turn ?? null) : null;
  return { lines, guaranteedTurn: guaranteed, cannotKO: guaranteed === null };
}

function noPassiveKO(opts: {
  rolls: number[];
  weights?: number[];
  maxHp: number;
  initialHp?: number;
  maxTurns: number;
  firstHitRolls?: number[];
  firstHitWeights?: number[];
}): KOResult {
  const { rolls, weights, maxHp, maxTurns, firstHitRolls } = opts;
  const lines: KOLine[] = [];
  let cumulative = 0;
  const target = Math.min(maxHp, Math.max(0, opts.initialHp ?? maxHp));
  // DP over total damage dealt (pure hits)
  let dist = new Map<number, number>();
  dist.set(0, 1);
  for (let turn = 1; turn <= maxTurns; turn++) {
    const next = new Map<number, number>();
    let ko = 0;
    const useFirstHit = turn === 1 && !!firstHitRolls;
    const hitRolls = useFirstHit ? firstHitRolls! : rolls;
    const hitWeights = useFirstHit ? opts.firstHitWeights : weights;
    for (const [dmg, prob] of dist) {
      for (let i = 0; i < hitRolls.length; i++) {
        const d = hitRolls[i]!;
        const w = hitWeights ? hitWeights[i] ?? 1 / hitRolls.length : 1 / hitRolls.length;
        if (dmg + d >= target) ko += prob * w;
        else next.set(dmg + d, (next.get(dmg + d) ?? 0) + prob * w);
      }
    }
    dist = next;
    cumulative += ko;
    let sp = 0;
    let sDmg = 0;
    let sRemMin = Infinity;
    let sRemMax = -1;
    for (const [dmgDealt, prob] of dist) {
      sp += prob;
      sDmg += prob * dmgDealt;
      const rem = target - dmgDealt;
      if (rem < sRemMin) sRemMin = rem;
      if (rem > sRemMax) sRemMax = rem;
    }
    lines.push({
      turn,
      hit: ko,
      endOfTurn: 0,
      cumulative,
      survivors: sp,
      surviveHp: sp > 0.0005 ? target - sDmg / sp : null,
      surviveHpMin: sp > 0.0005 ? sRemMin : null,
      surviveHpMax: sp > 0.0005 ? sRemMax : null,
    });
    if (cumulative >= 0.9995) break;
  }
  const guaranteed = cumulative >= 0.9995 ? (lines.at(-1)?.turn ?? null) : null;
  return { lines, guaranteedTurn: guaranteed, cannotKO: guaranteed === null };
}
