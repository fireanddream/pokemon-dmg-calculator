// help.mjs — user help topics for the interactive / one-shot CLI.
//
//   node scripts/damage.mjs -help     quickstart
//   node scripts/damage.mjs -tokens   accepted input words (+ examples)
//   node scripts/damage.mjs -limits   what the calculator does not model
//
// Content is PROJECTED from the docs that already own it, so help cannot drift
// from the front:
//   - -tokens reads the category headings + FIRST table row of aliases.md and
//     auto-fill-defaults.md (the same doc-as-code stores the front parses);
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

/** For each `##`/`###` heading, the first table's column count + first data row. */
function firstExamples(md) {
  const out = [];
  const captured = new Set();
  const lines = md.split("\n");
  let heading = null;
  for (let i = 0; i < lines.length; i++) {
    const hm = /^(#{2,3})\s+(.*?)\s*$/.exec(lines[i]);
    if (hm) {
      heading = shortLabel(hm[2]);
      continue;
    }
    if (!heading || captured.has(heading)) continue;
    if (!isTableRow(lines[i]) || isSeparator(lines[i])) continue;
    if (i + 1 >= lines.length || !isSeparator(lines[i + 1])) continue;
    const dataIdx = i + 2;
    if (dataIdx >= lines.length || !isTableRow(lines[dataIdx]) || isSeparator(lines[dataIdx])) {
      continue;
    }
    const header = splitCells(lines[i]);
    const data = splitCells(lines[dataIdx]);
    if (!data.length || data[0] === "") continue;
    captured.add(heading);
    out.push({
      heading,
      value: clean(data[0]),
      resolved: header.length <= 3 && data.length > 1 ? clean(data[1]) : null,
    });
  }
  return out;
}

// --- -tokens -------------------------------------------------------------

function renderExampleList(entries, pad) {
  return entries.map((e) => {
    const label = e.heading.padEnd(pad);
    // Type plates is the one category whose alias is a phrase built from the
    // key (`<type> plate`), not the bare key — show the spelling the user types.
    const isTerrain = e.heading === "Terrain words";
    const isAura = e.heading === "Aura setters";
    const value = isTerrain && e.resolved
      ? `${e.resolved[0]} terrain`
      : e.heading === "Type plates"
        ? `${e.value} plate`
        : e.value;
    // Terrain's / an aura's engine token is a bare fragment ("electric",
    // "Fairy"); show the full word the user types rather than that fragment.
    const resolved = isTerrain && e.resolved
      ? `${e.resolved} terrain`
      : isAura && e.resolved
        ? `${e.resolved} Aura`
        : e.resolved;
    const ex = resolved ? `${value} -> ${resolved}` : value;
    return `  ${label}  ${ex}`;
  });
}

function renderTokens() {
  const alias = firstExamples(ALIASES);
  const defaults = firstExamples(DEFAULTS);
  const pad = Math.min(
    28,
    Math.max(...[...alias, ...defaults].map((e) => e.heading.length), 0),
  );
  const lines = [
    "Input tokens — one live example per category (the full lists live in the source files)",
    "",
    "From aliases.md — names / acronyms / shorthand (human-editable):",
    ...renderExampleList(alias, pad),
    "",
    "From auto-fill-defaults.md — what the engine assumes or expands",
    "(human-editable):",
    ...renderExampleList(defaults, pad),
    "",
    "Read either file for the complete lists; add your own aliases there.",
  ];
  return lines.join("\n");
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
    "Anything you leave out uses the engine's defaults (level, nature, EVs, item,",
    "ability, arena); the result card shows what was assumed.",
    "",
    "    -help      this quickstart",
    "    -tokens    accepted input words, one example per category",
    "    -limits    what the calculator does not model",
    "",
    "The token lists are human-editable:",
    "    aliases.md             names / acronyms / shorthand",
    "    auto-fill-defaults.md  what the engine assumes when you say nothing",
  ].join("\n");
}

// --- public API ----------------------------------------------------------

const TOPICS = new Set(["help", "tokens", "limits"]);

/** Canonical topic for a `-help` / `-tokens` / `-limits` line, else null. */
export function isHelpCommand(line) {
  const m = /^--?(help|tokens|limits)$/i.exec(String(line).trim());
  return m ? m[1].toLowerCase() : null;
}

/** Render one help topic, wrapped through the shared card/echo rule. */
export function helpTopic(name, { width = 100 } = {}) {
  const key = String(name).replace(/^--?/, "").toLowerCase();
  const text =
    key === "tokens" ? renderTokens() : key === "limits" ? renderLimits() : renderHelp();
  return wrapBlock(text, width) + "\n";
}

export { TOPICS };
