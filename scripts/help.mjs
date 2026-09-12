// help.mjs — user help topics for the interactive / one-shot CLI.
//
//   node scripts/damage.mjs -help     quickstart + assumed defaults
//   node scripts/damage.mjs -grammar  token grammar + one example per name type
//   node scripts/damage.mjs -limits   what the calculator does not model
//
// -help and -grammar are AUTHORED here (hand-made, human-readable) and
// decoupled from the doc stores, so a doc edit does not silently change what
// these guides say:
//   - -help and -grammar are static text (fixed spellings + hand-made examples);
//   - -limits reads the Status column of DESIGN-RECORDS.md §10 and drops every
//     `done` row, so a new gap appears here the moment it is recorded there.
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

const RECORDS = await readDoc("DESIGN-RECORDS.md");

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

// --- -grammar ------------------------------------------------------------

// GRAMMAR and LEXEMES are both authored here (fixed spellings + hand-made
// examples, human-readable); they are not derived from the doc stores.
const GRAMMAR = [
  '  Query split        <attacker side> vs <defender side>      exactly one "vs"; sides free-order',
  "  Level              lv100 / lv 100 / level 100              glued or spaced; 1-100",
  "  Stat words         hp",
  "                     atk / attack",
  "                     def / defense",
  "                     spa / spatk",
  "                     spd / spdef",
  "                     spe / speed",
  "  Accuracy stage     acc / accuracy",
  "  Evasion stage      eva / evasion",
  "  EVs                a value 0-252 and a stat word, either order",
  '                     "252 atk" / "atk 252"',
  "  Stat stage         a stat word and a signed stage, either order",
  '                     "+2 spa" / "spa +2"; clamped +-6',
  "                     hp cannot have stages",
  "  Boost, no stat     +1 / -2            applies to the stat the attack uses",
  "  Max shorthand      max <stat>         assumes 252 ev in category; defaults to boosted natures",
  "  Hidden Power       hidden power ice / hp ice               16 types; Normal & Fairy rejected",
  "  Spikes layers      spike (1 layer) / spikes (3) / 2 spikes / spikes 2 / spikes x2",
  '  Two-move calc      two attack moves on attacker side: "Garchomp EQ Outrage vs Skarmory"',
];

// LEXEMES are hand-made examples, not auto-derived — a custom edit to
// aliases.md / auto-fill-defaults.md may not be reflected in this guide.
const LEXEMES = [
  "  Species           chomp -> Garchomp",
  "  Move              eq -> Earthquake",
  "  Item              lo -> Life Orb (attacker) / Leftovers (defender)",
  "  Type plate        plate -> the attacking move's type item (\"fairy plate\" = Pixie Plate)",
  "  Nature            Jolly",
  "  Ability           Levitate",
  "  Status            burned -> burn",
  "  Weather           rain -> Rain",
  "  Terrain           e terrain -> Electric Terrain",
  "  Hazard            rock -> Stealth Rock",
];

function renderGrammar() {
  return [
    "Grammar — every token type and the syntax the front accepts",
    "",
    ...GRAMMAR,
    "",
    "LEXEMES (one common example each; full lists live in the source files)",
    "",
    ...LEXEMES,
    "",
    "Full lists:",
    "aliases.md (names/acronyms),",
    "auto-fill-defaults.md",
    "Run -help for what the engine assumes when optional input variables are missing.",
    "Examples in this guide are hand-made; custom edits to the files above may not be reflected.",
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

function renderHelp() {
  return `Help — a quick guide

REQUIRED: one "vs" between the two sides. The minimum query is:

    <attacker> <attack move> vs <defender>

    Garchomp Earthquake vs Heatran

Everything else is optional and may appear in ANY order on either side —
item, nature, EVs, ability and the move can come before or after the
species:

    Garchomp Life Orb Jolly 252 Atk Earthquake vs Heatran 252 HP
    Earthquake Life Orb 252 Atk Jolly Garchomp vs 252 HP Heatran

Assumed when you leave it out:

  Level        50
  Nature       Serious
  IVs          31
  EVs          0
  Held item    has item, no effect
  Ability      auto-picked (e.g. Scizor -> Technician; a statused mon -> its
               status ability; a weather setter -> its weather). Card prints the pick.

Engine expansions:
  boost moves are auto-converted to stat boosts           sd -> Swords Dance (not an attacking move)
  max <stat> assumes a boosted nature                     max atk -> 252 Atk EVs + Adamant
  flame orb / toxic orb assumes the corresponding status               flame orb -> burned
  arena ability assumes the corresponding arena condition              Drizzle -> Rain

(Defaults are the engine's built-in assumptions; -grammar lists the token grammar.)

Look up function (CLI only):

    -search pokemon dragon ground
        pokemon whose exact typing is Dragon/Ground (1 or 2 types,
        any order)
    -search move 80 fighting
        attacking Fighting moves of power 80
    -search move fighting special
        ... by category (physical / special, or phy / spe / atk / spa)

    full type names, no aliases; results are comma-separated names
    sorted by name, or "none found"

    -search    look up pokemon by typing / attacking moves by type
    -help      this quickstart
    -grammar   the token grammar + one example per name type
    -limits    what the calculator does not model, auto-derived from DESIGN-RECORDS.md

The token lists are human-editable:
    aliases.md             names / acronyms / shorthand
    auto-fill-defaults.md  what the engine assumes when optional inputs are missing

Examples in this guide are hand-made; custom edits to the files above may not be reflected.`;
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
