// help.mjs — user help topics for the interactive / one-shot CLI.
//
//   node scripts/damage.mjs -help     quickstart + assumed defaults
//   node scripts/damage.mjs -grammar  token grammar + one example per name type
//   node scripts/damage.mjs -limits   what the calculator does not model
//
// Content is PROJECTED from the docs that already own it, so help cannot drift
// from the front:
//   - -grammar authors the GRAMMAR here (fixed spellings, human-readable) and
//     auto-derives one example per LEXEME type from aliases.md /
//     auto-fill-defaults.md (the same doc-as-code stores the front parses);
//   - -help gives the quickstart plus an auto-derived defaults block read from
//     auto-fill-defaults.md;
//   - -limits reads the Status column of DESIGN-RECORDS.md §10 and drops every
//     `done` row, so a new gap appears here the moment it is recorded there.
// Only the short intro prose and the worked query examples are authored here.
// Layout wraps through echo.mjs's `wrapBlock`, exactly like the echo and card.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wrapBlock } from "./echo.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");

async function readDoc(name) {
  try {
    return await readFile(path.join(ROOT, name), "utf8");
  } catch {
    return "";
  }
}

const [ALIASES, DEFAULTS, RECORDS] = await Promise.all([
  readDoc("aliases.md"),
  readDoc("auto-fill-defaults.md"),
  readDoc("DESIGN-RECORDS.md"),
]);

/** Drop markdown emphasis / code ticks and collapse whitespace for display. */
function clean(s) {
  return s.replace(/\*\*/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim();
}

/** A trailing parenthetical is explanatory, not the label. */
const shortLabel = (s) => clean(s).replace(/\s*\(.*\)\s*$/, "");

/** Split a markdown table line into trimmed cells (edge pipes dropped). */
function splitCells(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

const isTableRow = (line) => line.trim().startsWith("|");
const isSeparator = (line) => {
  const t = line.trim();
  return t.startsWith("|") && t.includes("-") && /^[|\-:\s]+$/.test(t);
};

/** The text from a `#{1,6} <heading>` line to the next heading (any level). The
 *  heading may carry a trailing parenthetical, so it matches by prefix. */
function sectionOf(md, heading) {
  const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^#{1,6}\\s+${esc}(?=\\s|$)`, "gm");
  const m = re.exec(md);
  if (!m) return "";
  const tail = md.slice(m.index + m[0].length);
  const next = /^#{1,6}\s/m.exec(tail);
  return tail.slice(0, next ? next.index : tail.length);
}

/** Cell arrays of the data rows in a section's table (header + separator dropped). */
function rowsOf(section) {
  return section
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"))
    .slice(2)
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
    .filter((cells) => cells.length >= 2);
}

/** First row whose first cell contains `key` (case-insensitive). */
const rowByIncludes = (md, section, key) => {
  const k = key.toLowerCase();
  return rowsOf(sectionOf(md, section)).find((r) => r[0].toLowerCase().includes(k)) ?? null;
};

/** Row whose first cell equals `key` after stripping code ticks. */
const rowByKey = (md, section, key) => {
  const k = key.toLowerCase();
  return rowsOf(sectionOf(md, section)).find((r) => clean(r[0]).toLowerCase() === k) ?? null;
};

const firstVariant = (s) => s.split("/")[0].trim();
const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// --- -grammar ------------------------------------------------------------

// GRAMMAR is authored here (fixed spellings, human-readable). LEXEMES are
// auto-derived: one common example per name type, read from aliases.md /
// auto-fill-defaults.md, so an edit to those docs updates this list.
const GRAMMAR = [
  '  Query split        <attacker side> vs <defender side>      exactly one "vs"; sides free-order',
  "  Level              lv100 / lv 100 / level 100              glued or spaced; 1-100",
  "  Stat words         atk / attack · def / defense · spa / spatk / spc",
  "                     spd / spdef / sdef · spe / speed · hp (EVs only)",
  "  EVs                a value 0-252 and a stat word, either order",
  '                     "252 atk" / "atk 252" / "252 HP"',
  "  Stat stage         a stat word and a signed stage, either order",
  '                     "+2 spa" / "spa +2"; clamped +-6',
  "                     stages use atk / def / spa / spd / spe only; hp has none",
  "  Accuracy stage     -2 acc / acc +2                          acc or accuracy",
  "  Evasion stage      +1 eva / eva -2                           eva or evasion",
  "  Boost, no stat     +1 / -2                                  applies to the stat the attack uses",
  "  Max shorthand      max atk / max spa / max def / max spd / max spe / max hp",
  "  Hidden Power       hidden power ice / hp ice                16 types; Normal & Fairy rejected",
  "  Spikes layers      spike (1) / spikes (3) / 2 spikes / spikes 2 / spikes x2",
  '  Two-move combo     two move names, in order: "Garchomp EQ Outrage vs Skarmory"',
  '  Per-turn table     add "turn by turn" to the query',
];

/** One common example per lexeme type, read live from the two doc stores. */
function renderLexemes() {
  const line = (label, body) => `  ${label.padEnd(18)}${body}`;
  const out = [];

  const species = rowByIncludes(ALIASES, "Species aliases", "chomp");
  out.push(line("Species", `${firstVariant(clean(species[0]))} -> ${clean(species[1])}`));

  const move = rowByIncludes(ALIASES, "Move acronyms", "eq");
  out.push(line("Move", `${firstVariant(clean(move[0]))} -> ${clean(move[1])}`));

  const item = rowByIncludes(ALIASES, "Item acronyms", "lo");
  const itemText = clean(item[1])
    .replace(" on the attacker · ", " (attacker) / ")
    .replace(" on the defender", " (defender)");
  out.push(line("Item", `${firstVariant(clean(item[0]))} -> ${itemText}`));

  const plate = rowByIncludes(ALIASES, "Type plates", "Fairy");
  out.push(line("Type plate", `plate -> the attacking move's type item ("${plate[0].toLowerCase()} plate" = ${clean(plate[1])})`));

  const nature = rowByKey(DEFAULTS, "Defaults at a glance", "Nature");
  out.push(line("Nature", clean(nature[2]).match(/[A-Z][a-z]+/)?.[0] ?? "Jolly"));

  // No alias/default table exists for abilities or hazards — pin their example.
  out.push(line("Ability", "Levitate"));

  const status = rowByIncludes(ALIASES, "Status words", "burned");
  out.push(line("Status", `${firstVariant(clean(status[0]))} -> ${shortLabel(status[1])}`));

  const weather = rowByIncludes(ALIASES, "Weather words", "rain");
  out.push(line("Weather", `${firstVariant(clean(weather[0]))} -> ${capFirst(shortLabel(weather[1]))}`));

  const terrain = rowByIncludes(ALIASES, "Terrain words", "electric terrain");
  out.push(line("Terrain", `${firstVariant(clean(terrain[0]))} -> ${capFirst(shortLabel(terrain[1]))} Terrain`));

  out.push(line("Hazard", "stealth rock -> Stealth Rock"));

  return out;
}

function renderGrammar() {
  return [
    "Input tokens — every token type and the syntax the front accepts",
    "",
    "GRAMMAR (fixed spellings)",
    "",
    ...GRAMMAR,
    "",
    "LEXEMES (one common example each; full lists live in the source files)",
    "",
    ...renderLexemes(),
    "",
    "Full value lists: aliases.md (names/acronyms), auto-fill-defaults.md",
    "(defaults/expansions). Run -help for what the engine assumes when you",
    "say nothing.",
  ].join("\n");
}

// --- -limits -------------------------------------------------------------

function shortStatus(status) {
  if (/won't implement/i.test(status)) return "out of scope";
  if (/intention/i.test(status)) return "intentional";
  if (/dropped/i.test(status)) return "removed";
  if (/removed/i.test(status)) return "removed (cosmetic)";
  if (/partial/i.test(status)) return "partial";
  if (/not implemented/i.test(status)) return "not implemented";
  return status;
}

/** Every §10 table row whose Status is not `done`, in document order. */
function parseLimits(md) {
  const lines = md.split("\n");
  const out = [];
  let inSec = false;
  let area = "";
  let header = null;
  for (const line of lines) {
    if (/^## 10\./.test(line)) {
      inSec = true;
      continue;
    }
    if (inSec && /^## 11\./.test(line)) break;
    if (!inSec) continue;
    const hm = /^#{3,4}\s+(.*)$/.exec(line);
    if (hm) {
      area = shortLabel(hm[1]);
      header = null;
      continue;
    }
    if (!isTableRow(line) || isSeparator(line)) continue;
    const cs = splitCells(line);
    const statusIdx = cs.findIndex((c) => clean(c).toLowerCase() === "status");
    if (statusIdx >= 0) {
      header = { statusIdx };
      continue;
    }
    if (!header) continue;
    const name = shortLabel(cs[0] ?? "");
    const status = clean(cs[header.statusIdx] ?? "");
    if (!name || !status || /^done\b/i.test(status)) continue;
    out.push({ area, name, tag: shortStatus(status) });
  }
  return out;
}

function renderLimits() {
  const rows = parseLimits(RECORDS);
  const lines = ["Calculator limits — what is not modeled (short list)", ""];
  let lastArea = null;
  for (const r of rows) {
    if (r.area !== lastArea) {
      lines.push(`  ${r.area}`);
      lastArea = r.area;
    }
    lines.push(`      ${r.name} — ${r.tag}`);
  }
  lines.push(
    "",
    "Full detail — plus the intentional simplifications and the open forme-word",
    "collisions — is in DESIGN-RECORDS.md section 10.",
  );
  return lines.join("\n");
}

// --- -help ---------------------------------------------------------------

/** The -help defaults block, read live from auto-fill-defaults.md / aliases.md. */
function renderDefaults() {
  const at = (key) => {
    const r = rowByKey(DEFAULTS, "Defaults at a glance", key);
    return r ? clean(r[1]) : "";
  };
  const scizor = rowByKey(DEFAULTS, "Fixed attacker defaults", "Scizor");
  const scizorLine = scizor ? `${clean(scizor[0])} -> ${clean(scizor[1])}` : "Scizor -> Technician";

  const sd = rowByIncludes(ALIASES, "Move acronyms", "sd");
  const swords = rowByKey(ALIASES, "Boosting moves", "Swords Dance");
  const sdLine = `${firstVariant(clean(sd[0]))} -> ${clean(sd[1])} (${swords ? clean(swords[1]) : "+2"} Atk; not the attacking move)`;

  const maxAtk = rowByKey(DEFAULTS, "EV / nature shorthand", "max atk");
  const maxLine = maxAtk
    ? `${clean(maxAtk[0])} -> ${clean(maxAtk[2])} Atk EVs + ${clean(maxAtk[7])}`
    : "max atk -> 252 Atk EVs + Adamant";

  const orb = rowByKey(DEFAULTS, "Orb defaults", "Flame Orb");
  const orbLine = orb ? `flame orb -> ${clean(orb[1])}` : "flame orb -> burned";

  const setter = rowByKey(DEFAULTS, "Weather setters", "Drizzle");
  const setterLine = setter ? `${clean(setter[0])} -> ${capFirst(clean(setter[1]))}` : "Drizzle -> Rain";

  const aura = rowByKey(DEFAULTS, "Aura setters", "Fairy Aura");
  const auraLine = aura ? `${clean(aura[0])} -> ${clean(aura[1])} aura` : "Fairy Aura -> Fairy aura";

  return [
    `  Level        ${at("Level")}`,
    `  Nature       ${at("Nature")}`,
    `  IVs          ${at("IVs")}`,
    `  EVs          ${at("EVs")}`,
    `  Held item    ${at("Held item")}`,
    `  Ability      auto-picked (e.g. ${scizorLine}; a statused mon -> its`,
    "               status ability; a weather setter -> its weather). Card prints the pick.",
    "",
    "Engine expansions:",
    `  ${sdLine}`,
    `  ${maxLine.padEnd(38)}${orbLine}`,
    `  ${setterLine.padEnd(38)}${auraLine}`,
    "",
    "(Defaults come from auto-fill-defaults.md; -grammar lists the token grammar.)",
  ];
}

function renderHelp() {
  return [
    "Pokemon gen-6 damage calculator — help",
    "",
    'REQUIRED: one "vs" between the two sides. The minimum query is:',
    "",
    "    <attacker> <attack move> vs <defender>",
    "",
    "    Garchomp Earthquake vs Heatran",
    "",
    "Everything else is optional and may appear in ANY order on either side —",
    "item, nature, EVs, ability and the move can come before or after the",
    "species:",
    "",
    "    Garchomp Life Orb Jolly 252 Atk Earthquake vs Heatran 252 HP",
    "    Earthquake Life Orb 252 Atk Jolly Garchomp vs 252 HP Heatran",
    "",
    "Assumed when you leave it out:",
    "",
    ...renderDefaults(),
    "",
    "Look up names (CLI only):",
    "",
    "    -search pokemon dragon ground",
    "        pokemon whose exact typing is Dragon/Ground (1 or 2 types,",
    "        any order)",
    "    -search move 80 fighting",
    "        attacking Fighting moves of power 80",
    "    -search move fighting special",
    "        ... by category (physical / special, or phy / spe / atk / spa)",
    "",
    "    full type names, no aliases; results are comma-separated names",
    "    sorted by name, or \"none found\"",
    "",
    "    -search    look up pokemon by typing / attacking moves by type",
    "    -help      this quickstart",
    "    -grammar   the token grammar + one example per name type",
    "    -limits    what the calculator does not model",
    "",
    "The token lists are human-editable:",
    "    aliases.md             names / acronyms / shorthand",
    "    auto-fill-defaults.md  what the engine assumes when you say nothing",
  ].join("\n");
}

// --- public API ----------------------------------------------------------

const TOPICS = new Set(["help", "grammar", "limits"]);

/** Canonical topic for a `-help` / `-grammar` / `-limits` line, else null. */
export function isHelpCommand(line) {
  const m = /^--?(help|grammar|limits)$/i.exec(String(line).trim());
  return m ? m[1].toLowerCase() : null;
}

/** Render one help topic, wrapped through the shared card/echo rule. */
export function helpTopic(name, { width = 100 } = {}) {
  const key = String(name).replace(/^--?/, "").toLowerCase();
  const text =
    key === "grammar" ? renderGrammar() : key === "limits" ? renderLimits() : renderHelp();
  return wrapBlock(text, width) + "\n";
}

export { TOPICS };
