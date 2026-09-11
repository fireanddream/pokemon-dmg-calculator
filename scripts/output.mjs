// output.mjs — result-card rendering stage (OUTPUT-FORMAT.md).
// Input:  a raw result bag from calc.mjs (fed by the input-converter -> fill -> calc chain).
// Output: the exact result-screen text. No calculation happens here — this file
// only turns computed numbers into the pinned layout.
//
// Row contract (see OUTPUT-FORMAT.md): 2-space indent + label padded to 8 chars
// + 2 spaces (value starts at column 12). Continuations indent 12 spaces.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wrapBlock } from "./echo.mjs";

const fmtStages = (c) => {
  const parts = [];
  const b = c.boosts ?? {};
  for (const k of ["atk", "def", "spa", "spd", "spe"]) {
    const v = b[k];
    if (v) parts.push(`${v > 0 ? "+" : ""}${v} ${k}`);
  }
  const acc = c.accStage ?? 0;
  const eva = c.evaStage ?? 0;
  if (acc) parts.push(`${acc > 0 ? "+" : ""}${acc} acc`);
  if (eva) parts.push(`${eva > 0 ? "+" : ""}${eva} eva`);
  return parts.length ? `  [${parts.join(" / ")}]` : "";
};

// EV spreads display canonical stat-first: "HP 252", "ATK 252".
const fmtSpread = (evs) => {
  const parts = ["hp", "atk", "def", "spa", "spd", "spe"]
    .filter((k) => (evs[k] ?? 0) > 0)
    .map((k) => `${k.toUpperCase()} ${evs[k]}`);
  return parts.length ? parts.join(" / ") : "";
};

const itemOf = (c) => (c.item ? ` @ ${c.item}` : c.noItem ? " @ no item" : "");

const STATUS_WORD = {
  brn: "burned", par: "paralyzed", psn: "poisoned", tox: "badly poisoned",
  slp: "asleep", frz: "frozen",
};

const buildCard = (c) =>
  `${c.name}${itemOf(c)}  ${c.nature}${fmtSpread(c.evs) ? ` | ${fmtSpread(c.evs)}` : ""}` +
  `  ${c.ability}${c.status ? ` (${STATUS_WORD[c.status] ?? c.status})` : ""}` +
  fmtStages(c);

const WEATHER_WORD = {
  sun: "Sun", rain: "Rain", sand: "Sandstorm", hail: "Hail",
  desolate: "Harsh Sunshine", primordial: "Heavy Rain", delta: "Strong Winds",
};
const TERRAIN_WORD = {
  electric: "Electric Terrain", grassy: "Grassy Terrain",
  misty: "Misty Terrain", psychic: "Psychic Terrain",
};

const arenaParts = (b) => {
  const parts = [];
  if (b.weather) {
    parts.push((WEATHER_WORD[b.weather] ?? b.weather) + (b.suppressWeather ? " (suppressed)" : ""));
  }
  if (b.terrain) parts.push(TERRAIN_WORD[b.terrain] ?? b.terrain);
  if (b.stealthRock) parts.push("Stealth Rock");
  if (b.spikes) parts.push(`Spikes x${b.spikes}`);
  return parts;
};

// Smogon-style percent: round to 1 decimal but clamp to 99.9 so a sub-100%
// share never displays as 100 (imitate @smogon/calc roundChance); whole
// percentages drop the ".0" (100 -> "100%").
const fmtPct = (x) => {
  const v = Math.min(Math.round(x * 1000), 999) / 10;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
};

const accPct = (c) => {
  const v = Math.round(c * 1000) / 10;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
};

const isGuaranteed = (x) => x >= 1 - 1e-9;

// Truncate (not round) to one decimal, matching Smogon's damage-percent display.
const pct = (hp) => (n) => `${Math.floor((n / hp) * 1000) / 10}`;

// Chip/heal tokens for the passives line + turn tables (shared rule set).
function passiveTokens(b) {
  const defender = b.defender;
  const chip = [];
  const heal = [];
  const mg = defender.ability === "Magic Guard";
  const oc = defender.ability === "Overcoat";
  const effWeather = b.suppressWeather ? undefined : b.weather;
  if (!mg && (defender.status === "psn" || defender.status === "tox")) {
    if (defender.ability === "Poison Heal") heal.push("Poison Heal 1/8");
    else chip.push(defender.status === "psn" ? "poison 1/8" : "toxic n/16");
  } else if (!mg && defender.status === "brn") {
    chip.push("burn 1/8");
  }
  if (!mg) {
    const sandHail = effWeather === "sand" || effWeather === "hail";
    const chipped = effWeather === "sand"
      ? !defender.types.some((t) => ["Rock", "Ground", "Steel"].includes(t))
      : effWeather === "hail" && !defender.types.includes("Ice");
    if (sandHail && chipped) {
      if (oc) {
        // Overcoat: weather chip skipped
      } else if (effWeather === "hail" && defender.ability === "Ice Body") {
        heal.push("Ice Body 1/16");
      } else {
        chip.push("weather 1/16");
      }
    }
  }
  if (defender.item === "Leftovers") heal.push("Leftovers 1/16");
  if (defender.item === "Black Sludge") {
    if (defender.types.includes("Poison")) heal.push("Black Sludge 1/16");
    else if (!mg) chip.push("Black Sludge 1/16");
  }
  if (defender.item === "Sitrus Berry" && !(b.attacker?.ability === "Unnerve")) {
    heal.push("Sitrus 1/4 once at <=50%");
  }
  if (!mg && (effWeather === "sun" || effWeather === "desolate") && defender.ability === "Solar Power") {
    chip.push("Solar Power 1/8");
  }
  return { chip, heal };
}

/** Rows for the passives + per-turn table of a single-move sim (turn by turn). */
function turnTableLines(b, trun = "turn") {
  const hp = b.hp;
  const out = [];
  const { chip, heal } = passiveTokens(b);
  if (chip.length || heal.length) {
    out.push(`            passives: chip ${chip.join(" | ") || "none"}   heal ${heal.join(" | ") || "none"}`);
  }
  const turnCol = trun.length;
  out.push(`            turn-by-turn (one hit per turn, 16 rolls):`);
  out.push(`            ${trun.padStart(turnCol)} |`);
  for (const l of b.ko.lines) {
    // KO masses are relative to the starting population; normalize to the share
    // still in play when this turn begins so each row sums to ~100%.
    const alreadyGone = l.cumulative - (l.hit + l.endOfTurn);
    const entering = Math.max(1e-9, 1 - alreadyGone);
    const hitShare = l.hit / entering;
    const eotShare = l.endOfTurn / entering;
    const survShare = l.survivors / entering;
    const row = [];
    const hasHit = hitShare >= 0.0005;
    const hasEot = eotShare >= 0.0005;
    const hasSurv = survShare >= 0.0005;
    if (hasHit) row.push(isGuaranteed(hitShare) ? "guaranteed KO'd by move" : `${fmtPct(hitShare)} KO'd by move`);
    if (hasEot) row.push(isGuaranteed(eotShare) ? "guaranteed KO'd by indirect dmg" : `${fmtPct(eotShare)} KO'd by indirect dmg`);
    if (hasSurv) {
      const p = `${Math.round((l.surviveHp / hp) * 100)}`;
      if (hasHit || hasEot) row.push(`${fmtPct(survShare)} live with ${p}% HP left`);
      else row.push(`${p}% HP left`);
    }
    out.push(`            ${String(l.turn).padStart(turnCol)} | ${row.length ? row.join(" · ") : "-"}`);
  }
  return out;
}

/** KO verdict text for a single-move sim. */
function koVerdict(b) {
  const ko = b.ko;
  const maxTurns = b.maxTurns ?? 10;
  const cumul = (c) => (c >= 0.9995 ? "100%" : `${(c * 100).toFixed(1)}%`);
  const koTokens = [];
  let prev = 0;
  for (const l of ko.lines) {
    const delta = l.cumulative - prev;
    prev = l.cumulative;
    if (delta < 0.0005) continue;
    const eot = l.endOfTurn > 0.0005 ? " (+EoT)" : "";
    if (l.cumulative < 0.9995) koTokens.push(`${l.turn}HKO ${cumul(l.cumulative)}${eot}`);
  }
  if (ko.cannotKO) return `no guaranteed KO in ${maxTurns} hits (${koTokens.join(", ")})`;
  if (ko.guaranteedTurn === 1) return "guaranteed OHKO";
  return `guaranteed ${ko.guaranteedTurn}HKO${koTokens.length ? ` (${koTokens.join(", ")})` : ""}`;
}

/** Render one single-move card (echo + Attacker/Defender/Arena/Move/Damage/KO).
 *  Returns the full text block including its trailing newline. */
export function renderSingle(b) {
  const lines = [];
  if (b.query) lines.push(`  ${b.query}`);
  lines.push("");
  lines.push(`  Attacker  ${buildCard(b.attacker)}`);
  lines.push(`  Defender  ${buildCard(b.defender)}`);
  const arena = arenaParts(b);
  if (arena.length) lines.push(`  Arena     ${arena.join(" + ")}`);
  lines.push(`  Move      ${b.moveName}${b.flags.length ? `  [${b.flags.join(", ")}]` : ""}`);

  // A move that literally cannot connect — an OHKO type block — deals nothing.
  if (b.acc.impossible) {
    lines.push(`  Damage    --  (no damage)`);
    lines.push(`            ${b.acc.impossible}`);
    return lines.join("\n") + "\n";
  }

  if (b.displayRolls.length === 0) {
    lines.push(`  Damage    --  (no damage)`);
    for (const note of b.damageNotes) lines.push(`            ${note}`);
    return lines.join("\n") + "\n";
  }

  const fmt = pct(b.hp);
  const lo = Math.min(...b.displayRolls);
  const hi = Math.max(...b.displayRolls);
  const markers = [];
  if (b.berryHalved) markers.push("resist berry");
  if (b.skillLink) markers.push("Skill Link x5");
  else if (b.multiHit) markers.push("2-5 hits");
  lines.push(`  Damage    ${fmt(lo)}% - ${fmt(hi)}%  (${lo}-${hi})${markers.length ? ` [${markers.join(", ")}]` : ""}`);
  for (const note of b.damageNotes) lines.push(`            ${note}`);

  lines.push(`  KO        ${koVerdict(b)}`);

  // Accuracy is display-only: the sim assumes every attack connects. When the
  // move could miss, show the chance all a guaranteed KO's attacks land — each
  // hit of an NHKO is an independent accuracy roll (80% at a 3HKO -> 80%^3).
  const accTurn = b.ko.guaranteedTurn;
  if (accTurn && !b.acc.always && b.acc.chance < 1 - 1e-9) {
    const allHits = b.acc.chance ** accTurn;
    const breakdown = accTurn > 1 ? ` (${accPct(b.acc.chance)} x${accTurn})` : "";
    lines.push(`            ${accPct(allHits)} chance to hit all attacks${breakdown}`);
  }

  if (b.showTurns) lines.push(...turnTableLines(b));
  return lines.join("\n") + "\n";
}

/** Render a two-move combo: shared card header + per-turn table + Result row. */
export function renderCombo(b) {
  const lines = [];
  if (b.query) lines.push(`  ${b.query}`);
  lines.push("");
  lines.push(`  Attacker  ${buildCard(b.attacker)}`);
  lines.push(`  Defender  ${buildCard(b.defender)}`);
  const arena = arenaParts(b);
  if (arena.length) lines.push(`  Arena     ${arena.join(" + ")}`);

  const { chip, heal } = passiveTokens(b);
  if (chip.length || heal.length) {
    lines.push(`            passives: chip ${chip.join(" | ") || "none"}   heal ${heal.join(" | ") || "none"}`);
  }

  const turnCol = "turn".length;
  const fmt = pct(b.hp);
  lines.push(`            ${"turn".padStart(turnCol)} |`);
  for (const l of b.ko.lines) {
    const t = b.seqTurns[l.turn - 1];
    const rangeTxt = t.noDmg
      ? `--  (${t.notes.join(" ") || "no damage"})`
      : `${fmt(Math.min(...t.rolls))}% - ${fmt(Math.max(...t.rolls))}%  (${Math.min(...t.rolls)}-${Math.max(...t.rolls)})`;
    const markerTxt = t.marker.length ? ` [${t.marker.join(", ")}]` : "";
    const alreadyGone = l.cumulative - (l.hit + l.endOfTurn);
    const entering = Math.max(1e-9, 1 - alreadyGone);
    const eotShare = l.endOfTurn / entering;
    const out = [];
    // Turn rows carry no KO-chance numbers (the Result verdict reports those).
    // The one exception: a guaranteed *indirect* KO is annotated so the
    // sash/chip story (saved at 1 HP, then chipped) stays visible.
    if (eotShare >= 0.0005 && isGuaranteed(eotShare)) out.push("guaranteed KO'd by indirect dmg");
    const fateTxt = out.length ? `: ${out.join(" · ")}` : "";
    lines.push(`            ${String(l.turn).padStart(turnCol)} | ${t.name} ${rangeTxt}${markerTxt}${fateTxt}`);
  }

  // Final verdict: combined survival chance over both hits.
  const ko = b.ko;
  const gTurn = ko.guaranteedTurn;
  if (gTurn === 1) {
    lines.push(`  Result    guaranteed KO on turn 1`);
  } else if (gTurn !== null) {
    lines.push(`  Result    guaranteed KO on turn ${gTurn}`);
  } else {
    const last = ko.lines[ko.lines.length - 1];
    const koChance = last.cumulative;
    // HP range among the surviving paths: whole percents, each bound rounded.
    const hpTxt = (() => {
      const a = last.surviveHpMin;
      const b2 = last.surviveHpMax;
      if (a == null || b2 == null) return "";
      const p1 = Math.round((a / b.hp) * 100);
      const p2 = Math.round((b2 / b.hp) * 100);
      const range = p1 === p2 ? `${p1}%` : `${p1}-${p2}%`;
      return `, HP left ${range}`;
    })();
    if (koChance >= 0.0005) {
      lines.push(`  Result    KO chance ${fmtPct(koChance)}${hpTxt ? ` · if it survives${hpTxt}` : ""}`);
    } else {
      lines.push(`  Result    survives both moves: 100%${hpTxt ? ` · ${hpTxt.replace(", ", "")}` : ""}`);
    }
  }

  // Display-only combined chance both attacks connect.
  if (b.chainChance < 1 - 1e-9) {
    lines.push(`            ${accPct(b.chainChance)} chance to hit all attacks`);
  }
  return lines.join("\n") + "\n";
}

/** Dispatch on the calc bag's kind, then wrap the card to `width` columns.
 *  Default 100; `width <= 0` never wraps (same rule as the recognition echo). */
export function render(bag, { width = 100 } = {}) {
  const text = bag.kind === "combo" ? renderCombo(bag) : renderSingle(bag);
  return wrapBlock(text, width);
}

// --- standalone CLI (only when run directly: node scripts/output.mjs) ---
// Reads one result bag JSON (file arg, or stdin when "-" / no arg) and prints
// the OUTPUT-FORMAT card. Default = terminal text; --chat = the identical card
// wrapped in a fenced code block so fixed-width alignment survives markdown;
// --width N sets the card wrap width (default 100; N <= 0 = never).
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const isChat = argv.includes("--chat") || argv.includes("-c");
  const wIdx = argv.indexOf("--width");
  const widthRaw = wIdx >= 0 ? argv[wIdx + 1] : undefined;
  const width = widthRaw === undefined ? 100 : Number(widthRaw);
  if (!Number.isFinite(width)) {
    console.error(`output: --width must be a number, got "${widthRaw}"`);
    process.exit(1);
  }
  const inputArg = argv.find(
    (a, i) => a !== "--chat" && a !== "-c" && a !== "--width" && (wIdx < 0 || i !== wIdx + 1),
  );

  let raw;
  if (inputArg && inputArg !== "-") {
    raw = await readFile(path.resolve(inputArg), "utf8");
  } else {
    raw = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) raw += chunk;
  }
  const bag = JSON.parse(raw);
  const text = render(bag, { width });
  process.stdout.write(isChat ? `\`\`\`\n${text}\`\`\`\n` : text);
}
