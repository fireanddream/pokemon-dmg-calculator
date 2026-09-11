// input-converter.mjs — OFFLINE EXTRACTOR stage: words -> spec JSON.
//
// Pipeline: input-converter (offline word-scan) OR an agent (loose English,
// typo-tolerant, reads aliases.md + data/*.json) both extract the SAME spec
// JSON: the variables the user stated (species resolved to canonical dex
// names, shorthand like `max atk` kept as intent flags). NO defaults filled,
// NO records built — that is fill.mjs's job:
//
//   node scripts/input-converter.mjs "<query>"      -> spec JSON
//   ... | node scripts/fill.mjs - | node scripts/calc.mjs - | node scripts/output.mjs -
//
// This module also hosts the shared front lexicon (data loads, lookup maps,
// alias tables, PLATE_BY_TYPE, resolveMoveName, claimMoves) that fill.mjs
// imports — one source for both extractor routes and the defaults stage.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTypeChart, RESIST_BERRIES } from "../dist/index.js";
import { tokenizeLine, hyphenToSpace } from "./tokenize.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "..", "data");

const dexData = JSON.parse(await readFile(path.join(DATA_DIR, "xy-pokemon.json"), "utf8"));
const movesData = JSON.parse(await readFile(path.join(DATA_DIR, "moves-xy.json"), "utf8"));
const naturesData = JSON.parse(await readFile(path.join(DATA_DIR, "natures-xy.json"), "utf8"));
const typesData = JSON.parse(await readFile(path.join(DATA_DIR, "types-xy.json"), "utf8"));

// Line tokenization (hyphen rule, punctuation boundaries, `@`/quote handling,
// case-preserving display atoms) lives in the ONE shared `tokenize.mjs` so the
// converter's `_sideLog` indices and the recognition echo's ruler columns are
// the same atom space. `hyphenToSpace` is re-exported below for callers that
// imported it from here historically.
//
// norm() folds punctuation and hyphens for GLUED LOOKUPS, so a typed
// "Mr. Mime" ("mr. mime"), "Mr Mime", or "mrmime" all fold to the same lookup
// key (species claims match on it; a `.` is a hard boundary and splits the
// claim because tokenize marks it). The dex canon keys themselves are
// hyphenated ("Rotom-Wash", "Venusaur-Mega"), so norm() keeps folding hyphens
// for lookups regardless of the master hyphen rule.
const norm = (s) => s.toLowerCase().replace(/[\s',.;/\\|-]/g, "");
const chart = buildTypeChart(typesData.types);
const natureByName = new Map(naturesData.natures.map((n) => [n.name.toLowerCase(), n]));
const moveByName = new Map(movesData.moves.map((m) => [norm(m.name), m]));
const monByName = new Map(dexData.pokemon.map((p) => [norm(p.name), p]));

// --- doc-as-code rule store: aliases.md. The Type plates table is parsed at
// startup so the plate map (and the `<type> plate` item phrases built from it)
// follow edits to aliases.md; the built-in table is only a fallback if the file
// can't be read or parsed (mirrors how fill.mjs treats auto-fill-defaults.md).
let ALIAS_DOC = "";
try {
  ALIAS_DOC = await readFile(path.join(here, "..", "aliases.md"), "utf8");
} catch { /* missing/unreadable: fall back to the built-in table below */ }

/** The text from a `#{1,6} <heading>` line to the next heading (any level). */
function mdSection(doc, heading) {
  if (!doc) return "";
  const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^#{1,6}\\s+${esc}\\s*$`, "gm");
  const m = re.exec(doc);
  if (!m) return "";
  const tail = doc.slice(m.index + m[0].length);
  const next = /^#{1,6}\s/m.exec(tail);
  return tail.slice(0, next ? next.index : tail.length);
}

/** Cell arrays of the rows in the first `|...|` table of a section (skips the
 *  column header and the `|---|` separator line). */
function mdTableRows(section) {
  return section
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"))
    .slice(2)
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
    .filter((cells) => cells.length >= 2);
}

const NATURE_NAMES = [...natureByName.keys()];
const ABILITY_CANON = [...new Set(dexData.pokemon.flatMap((p) => p.abilities))];
const ABILITY_NAMES = ABILITY_CANON.map((a) => a.toLowerCase());
const SPECIES_ALIASES = new Map([
  ["rotom", "Rotom"], ["rotomw", "Rotom-Wash"], ["rotomwash", "Rotom-Wash"],
  ["mr", "Mr. Mime"], ["mrmime", "Mr. Mime"],
  ["rotomh", "Rotom-Heat"], ["rotomheat", "Rotom-Heat"],
  ["rotomc", "Rotom-Frost"], ["rotomfrost", "Rotom-Frost"],
  ["rotomf", "Rotom-Fan"], ["rotomfan", "Rotom-Fan"],
  ["rotomm", "Rotom-Mow"], ["rotommow", "Rotom-Mow"],
  ["chomp", "Garchomp"], ["ttar", "Tyranitar"], ["tar", "Tyranitar"],
  ["zard", "Charizard"], ["zardx", "Charizard-Mega-X"], ["zardy", "Charizard-Mega-Y"],
  ["charizardx", "Charizard-Mega-X"], ["charizardy", "Charizard-Mega-Y"],
  ["landorust", "Landorus-Therian"], ["landorustherian", "Landorus-Therian"],
  ["landot", "Landorus-Therian"], ["lando", "Landorus"],
  ["landorusi", "Landorus"], ["landorusincarnate", "Landorus"],
  ["thundurust", "Thundurus-Therian"], ["thundurustherian", "Thundurus-Therian"],
  ["thundurusi", "Thundurus"], ["thundurusincarnate", "Thundurus"],
  ["tornadust", "Tornadus-Therian"], ["tornadustherian", "Tornadus-Therian"],
  ["tornadusi", "Tornadus"], ["tornadusincarnate", "Tornadus"],
  // Forme short aliases. Keys are the GLUED norm, so "deoxys a", "deoxys-a",
  // and "deoxysa" all fold to the same key (spaces/punctuation ignored).
  ["deoxysa", "Deoxys-Attack"], ["deoxysd", "Deoxys-Defense"], ["deoxyss", "Deoxys-Speed"],
  ["giratinao", "Giratina-Origin"],
  ["kyuremb", "Kyurem-Black"], ["kyuremw", "Kyurem-White"],
  ["meloettap", "Meloetta-Pirouette"],
  ["meowsticf", "Meowstic-F"], ["meowsticm", "Meowstic-M"],
  ["aegislashb", "Aegislash-Blade"], ["aegislashs", "Aegislash"],
  ["hoopau", "Hoopa-Unbound"],
]);
// move acronyms (resolved when the whole move field normalizes to the key)
const MOVE_ALIASES = new Map([
  ["bb", "Brave Bird"], ["eq", "Earthquake"], ["blitz", "Flare Blitz"],
  ["draco", "Draco Meteor"], ["dd", "Dragon Dance"], ["sd", "Swords Dance"],
]);
/** Resolve a typed move string (incl. acronyms) to its canonical dex name, or null. */
function resolveMoveName(text) {
  const canon = MOVE_ALIASES.get(norm(text)) ?? text;
  return moveByName.get(norm(canon))?.name ?? null;
}

// type -> 20% type-boost item. The "plate" keyword picks by the move's
// *effective* type (after Aerilate/Pixilate/Refrigerate remaps). Normal has no
// plate item, so its row is Silk Scarf (Normal's 20% type-boost item). The
// table comes from aliases.md ("Type plates", doc-as-code); BUILTIN_PLATES is
// only the fallback when the md can't be read or parsed.
const BUILTIN_PLATES = {
  Bug: "Insect Plate", Dark: "Dread Plate", Dragon: "Draco Plate", Electric: "Zap Plate",
  Fairy: "Pixie Plate", Fighting: "Fist Plate", Fire: "Flame Plate", Flying: "Sky Plate",
  Ghost: "Spooky Plate", Grass: "Meadow Plate", Ground: "Earth Plate", Ice: "Icicle Plate",
  Normal: "Silk Scarf", Poison: "Toxic Plate", Psychic: "Mind Plate",
  Rock: "Stone Plate", Steel: "Iron Plate", Water: "Splash Plate",
};
const TYPE_BY_LOWER = new Map(typesData.types.map((t) => [t.name.toLowerCase(), t.name]));

/** Parse the aliases.md "Type plates" table into { type -> item }. Each row
 *  also yields a `<type> plate` phrase alias (see ITEM_ALIAS below), so the one
 *  table drives both the bare-`plate` keyword and the type-first spellings.
 *  Returns null when the section is missing, a cell is unreadable, or the table
 *  doesn't cover all 18 types (the caller warns and falls back to
 *  BUILTIN_PLATES, mirroring fill.mjs's handling of a broken
 *  auto-fill-defaults.md). */
function parsePlateTable(doc) {
  const section = mdSection(doc, "Type plates");
  if (!section) return null;
  const rows = new Map();
  for (const cells of mdTableRows(section)) {
    const type = TYPE_BY_LOWER.get(cells[0].toLowerCase());
    if (!type || !cells[1]) return null;
    rows.set(type, cells[1]);
  }
  return rows.size === TYPE_BY_LOWER.size ? Object.fromEntries(rows) : null;
}

let PLATE_BY_TYPE = parsePlateTable(ALIAS_DOC);
if (!PLATE_BY_TYPE) {
  console.warn("WARNING: aliases.md \"Type plates\" table not found or unparseable; using built-in plate fallback.");
  PLATE_BY_TYPE = { ...BUILTIN_PLATES };
}

// --- Boosting moves: gen-6 self-stat-raising moves that act as BOOST SIGNALS.
// A boosting move typed in the move slot is NEVER the damage move: it converts
// to attacker stat stages (see fill.mjs foldBoostSignals) instead of claiming a
// move slot. Doc-as-code table in aliases.md "## Boosting moves" (parsed at
// startup, mirroring the Type plates table); BUILTIN_BOOST_MOVES is only the
// fallback when the file can't be read or the table is broken.
const BUILTIN_BOOST_MOVES = new Map(Object.entries({
  "Acid Armor": { def: 2 }, Agility: { spe: 2 }, Amnesia: { spd: 2 },
  Autotomize: { spe: 2 }, Barrier: { def: 2 }, "Belly Drum": { atk: 6 },
  "Bulk Up": { atk: 1, def: 1 }, "Calm Mind": { spa: 1, spd: 1 },
  Coil: { atk: 1, def: 1, acc: 1 }, "Cosmic Power": { def: 1, spd: 1 },
  "Cotton Guard": { def: 3 }, "Defend Order": { def: 1, spd: 1 },
  "Defense Curl": { def: 1 }, "Double Team": { eva: 1 },
  "Dragon Dance": { atk: 1, spe: 1 }, Growth: { atk: 1, spa: 1 },
  Harden: { def: 1 }, "Hone Claws": { atk: 1, acc: 1 }, Howl: { atk: 1 },
  "Iron Defense": { def: 2 }, Meditate: { atk: 1 }, Minimize: { eva: 2 },
  "Nasty Plot": { spa: 2 }, "Quiver Dance": { spa: 1, spd: 1, spe: 1 },
  "Rock Polish": { spe: 2 }, Sharpen: { atk: 1 },
  "Shell Smash": { atk: 2, def: -1, spa: 2, spd: -1, spe: 2 },
  "Shift Gear": { atk: 1, spe: 2 }, "Swords Dance": { atk: 2 },
  "Tail Glow": { spa: 3 }, Withdraw: { def: 1 }, "Work Up": { atk: 1, spa: 1 },
}));

/** Parse the aliases.md "Boosting moves" table into a Map<canonical move name,
 *  stage deltas>. Rows: Move | atk | def | spa | spd | spe | acc | eva (blank
 *  = 0). Every move name must resolve in the dex, or the table is treated as
 *  broken (the caller warns and falls back to BUILTIN_BOOST_MOVES). */
function parseBoostMoves(doc) {
  const section = mdSection(doc, "Boosting moves");
  if (!section) return null;
  const cols = ["atk", "def", "spa", "spd", "spe", "acc", "eva"];
  const out = new Map();
  for (const cells of mdTableRows(section)) {
    if (cells.length < 8) return null;
    const entry = moveByName.get(norm(cells[0]));
    if (!entry) return null;
    const d = {};
    for (let i = 0; i < cols.length; i++) {
      const n = Number(cells[1 + i]);
      if (Number.isFinite(n) && n !== 0) d[cols[i]] = n;
    }
    out.set(entry.name, d);
  }
  return out.size ? out : null;
}

let BOOST_MOVES = parseBoostMoves(ALIAS_DOC);
if (!BOOST_MOVES) {
  console.warn("WARNING: aliases.md \"Boosting moves\" table not found or unparseable; using built-in boost-move fallback.");
  BOOST_MOVES = BUILTIN_BOOST_MOVES;
}

const ITEM_NAMES = [
  "Leftovers", "Life Orb", "Choice Band", "Choice Scarf", "Choice Specs",
  "Expert Belt", "Assault Vest", "Focus Sash", "Rocky Helmet", "Air Balloon",
  "Eviolite", "Black Sludge", "Sitrus Berry", "Lum Berry", "Weakness Policy",
  "Thick Club", "Deep Sea Tooth", "Deep Sea Scale", "Light Ball", "Stick",
  "Leek", "Soul Dew", "Adamant Orb", "Lustrous Orb", "Griseous Orb", "Iron Ball",
  "Ring Target", "Toxic Orb", "Flame Orb", "White Herb", "Power Herb", "Mental Herb",
  "Charcoal", "Mystic Water", "Magnet", "Miracle Seed", "Never-Melt Ice",
  "Black Belt", "Black Glasses", "Hard Stone", "Poison Barb", "Sharp Beak",
  "Silver Powder", "Soft Sand", "Spell Tag", "Twisted Spoon", "Metal Coat",
  "Dragon Fang", "Silk Scarf", "Muscle Band", "Wise Glasses", "Scope Lens",
  "Razor Claw", "Kings Rock", "Metronome", "Life Orb", "Focus Band", "BrightPowder",
  "Leftovers", "Heat Rock", "Damp Rock", "Smooth Rock", "Icy Rock", "Light Clay",
  ...Object.values(PLATE_BY_TYPE),
  ...Object.keys(RESIST_BERRIES),
].sort((a, b) => b.length - a.length);

// Item lookup is phrase-first: canonical item names PLUS the `<type> plate`
// aliases (fairy plate -> Pixie Plate, normal plate -> Silk Scarf, ...) derived
// from the same aliases.md table that PLATE_BY_TYPE comes from. The item-name
// pass consumes these phrases BEFORE the bare-`plate` keyword pass, so a typed
// "Fairy Plate" binds that exact item and never falls through to the move-type
// resolution — "@ Fairy Plate" with a Ground move is Pixie Plate, not Earth.
const ITEM_ALIAS = new Map();
for (const name of ITEM_NAMES) ITEM_ALIAS.set(name.toLowerCase(), name);
for (const [type, item] of Object.entries(PLATE_BY_TYPE)) {
  ITEM_ALIAS.set(`${type.toLowerCase()} plate`, item);
}
const ITEM_PHRASES = [...ITEM_ALIAS.keys()].sort((a, b) => b.length - a.length);

const USAGE = `usage:
  node scripts/input-converter.mjs "<attacker side ...> vs <defender side ...>"   (spec JSON)
  node scripts/input-converter.mjs <atk> <move> <def>                              (explicit args)

  input-converter is the OFFLINE extractor. It converts one natural-language
  line into the spec JSON (the variables the user stated; defaults NOT filled).
  "vs" is the mandatory splitter; sides are free-order (the move is claimed by
  exact name anywhere on the attacker side). There is NO "uses" syntax. An
  agent route produces the same spec JSON. Either feeds fill.mjs, which applies
  auto-fill-defaults.md and resolves to the calc-input JSON calc.mjs consumes:
    node scripts/input-converter.mjs "<query>" | node scripts/fill.mjs - | node
    scripts/calc.mjs - | node scripts/output.mjs -

  specs: "Species [@ Item] [Nature] [N Stat EVs] [Ability] [L50]"`;



/** Hard error for an EV token nothing claimed: a stat word with no adjacent
 *  number, or a number with no adjacent stat word. One shape for both; the
 *  echo shows the offending token in place. */
function unboundEvError(tokens) {
  return `unbound EV: ${tokens.map((t) => `"${t}"`).join(", ")}`;
}


// ===========================================================================
// ## 3 layer-1 UNIFIED SWEEP — claim lexicons (replaces parseCombatant's
// regex passes). Every claimable LITERAL phrase (class tokens + shape words)
// is registered below; SPECIES are claimed from the same sweep by exact
// glued-run lookup against monByName + SPECIES_ALIASES (see speciesKeyAt) —
// no class word inside a multi-word species name is ever consumed because a
// longer species phrase claims first. Claim keys are the phrase's words
// lowercased and space-joined — a phrase matches only over ORIGINALLY
// ADJACENT words (comma / `.;/\|` hard-boundary sentinels break adjacency).
// The per-position walk lives in parseCombatant below.

// Stat-stage / EV / acc-eva vocab. SHORT forms only: the two special stats
// keep spa/spd one-word aliases, no English full-name words (seam F).
const STAGE_ALIAS = {
  atk: "atk", attack: "atk", def: "def", defense: "def",
  spa: "spa", spatk: "spa", spc: "spa",
  spd: "spd", spdef: "spd", sdef: "spd", spe: "spe", speed: "spe",
};
const EV_ALIAS = { hp: "hp", ...STAGE_ALIAS };
const ACC_EVA_ALIAS = { acc: "acc", accuracy: "acc", eva: "eva", evasion: "eva" };
// "max atk/spa/def/spd/spe/hp" shorthands. Claim order is recorded so the
// first-typed max wins the auto-nature war (fill.mjs applyMaxFlags).
const MAX_ALIAS = {
  atk: "_maxAtk", attack: "_maxAtk", phys: "_maxAtk",
  spa: "_maxSpa", spatk: "_maxSpa", spc: "_maxSpa",
  def: "_maxDef", defense: "_maxDef",
  spd: "_maxSpd", spdef: "_maxSpd", sdef: "_maxSpd",
  spe: "_maxSpe", speed: "_maxSpe",
  hp: "_maxHp",
};

const STATUS_MAP = [
  ["badly poisoned", "tox"], ["bad poison", "tox"], ["toxic", "tox"],
  ["paralyzed", "par"], ["paralysis", "par"], ["poisoned", "psn"],
  ["asleep", "slp"], ["sleeping", "slp"], ["frozen", "frz"],
  ["burned", "brn"], ["burnt", "brn"], ["poison", "psn"],
  ["burn", "brn"], ["sleep", "slp"], ["freeze", "frz"],
  ["brn", "brn"], ["par", "par"], ["psn", "psn"], ["tox", "tox"],
  ["slp", "slp"], ["frz", "frz"],
];
// Explicit weather arena words. Each binds one arena code like any other class
// token (identical collapse, different same-side values error). Weather-setting
// ABILITY names are NOT here — they are ordinary ability claims; fill resolves
// their arena weather from the resolved abilities (`weatherFromSetters`).
const WEATHER_MAP = [
  ["harsh sunlight", "sun"], ["sunny day", "sun"], ["sunny", "sun"], ["sun", "sun"],
  ["rain dance", "rain"], ["rain", "rain"],
  ["sandstorm", "sand"], ["sand", "sand"],
  ["hail", "hail"], ["snow", "hail"],
  ["extremely harsh sunlight", "desolate"],
  ["heavy rain", "primordial"], ["strong winds", "delta"],
];
const TERRAIN_MAP = [
  ["electric terrain", "electric"], ["grassy terrain", "grassy"],
  ["misty terrain", "misty"], ["psychic terrain", "psychic"],
];
const STEALTH_ROCK_PHRASES = ["stealth rock", "stealthrock", "sr", "stealth rocks", "rock"];
const NO_ITEM_PHRASES = ["no item", "noitem", "itemless"];

// Item acronyms + the bare-`plate` keyword. LO is side-sensitive: Life Orb on
// the attacker, Leftovers on the defender. `<type> plate` aliases and full
// item names register separately from ITEM_ALIAS below.
const ITEM_ACRO = [
  ["banded", "Choice Band"], ["specs", "Choice Specs"], ["scarf", "Choice Scarf"],
  ["band", "Choice Band"], ["cb", "Choice Band"], ["spec", "Choice Specs"],
  ["belt", "Expert Belt"], ["sash", "Focus Sash"], ["lo", null], ["plate", null],
];

// kind: nature / ability / item / lo / plate / status / weather / terrain /
// sr / noitem. `value` is the canonical claim: natures store the lowercase
// word, ability/item the canonical dex name, status/weather/terrain the code.
const CLAIM_MAP = new Map();
function registerClaim(key, kind, value) {
  const arr = CLAIM_MAP.get(key) ?? [];
  arr.push(value === undefined ? { kind } : { kind, value });
  CLAIM_MAP.set(key, arr);
}
for (const name of natureByName.keys()) registerClaim(name, "nature", name);
ABILITY_NAMES.forEach((lower, i) => registerClaim(lower, "ability", ABILITY_CANON[i]));
for (const [key, item] of ITEM_ALIAS) registerClaim(key, "item", item);
for (const [word, item] of ITEM_ACRO) {
  if (item === null) registerClaim(word, word === "lo" ? "lo" : "plate");
  else registerClaim(word, "item", item);
}
for (const [word, code] of STATUS_MAP) registerClaim(word, "status", code);
for (const [phrase, code] of WEATHER_MAP) registerClaim(phrase, "weather", code);
for (const [phrase, code] of TERRAIN_MAP) registerClaim(phrase, "terrain", code);
for (const phrase of STEALTH_ROCK_PHRASES) registerClaim(phrase, "sr");
for (const phrase of NO_ITEM_PHRASES) registerClaim(phrase, "noitem");

// --- Seam-C guard (TODO step 6, option A): class lexicons stay disjoint.
// A claimable key must bind exactly ONE class — no key, ANY word count, may
// appear in two class tables (natures / abilities / items / status / weather /
// terrain / stealth rock / no-item). Move names are NOT class tables, so
// intentional move overlaps (`rain dance`, `stealth rock`, `hail`, ...) never
// trip this — seam G + phrase-first resolve those. Warn loudly at startup
// when an aliases.md / table edit creates a tie; no behavior change when clean.
const dualClass = [];
for (const [key, entries] of CLAIM_MAP) {
  const kinds = [...new Set(entries.map((e) => e.kind))];
  if (kinds.length > 1) dualClass.push(`  "${key}" -> [${kinds.join(", ")}]`);
}
if (dualClass.length) {
  console.warn(`WARNING: seam-C violation — a key binds tokens in two class lexicons:\n${dualClass.join("\n")}`);
}

/** Turn a combatant's word chunk — a full free-order SIDE ("max atk LO
 *  Dragon Claw Garchomp") or a bare "Species [@ Item] [Nature] [N Stat EVs]
 *  [Ability] [L50]" chunk — into a resolve()-style spec, via the ## 3
 *  layer-1 unified sweep.
 *
 *  One per-position longest-fit walk replaces the old regex passes. Walk the
 *  atoms left→right; at each unconsumed position claim the LONGEST known
 *  claimable phrase that starts there — a ≤3-word literal/class phrase
 *  (CLAIM_MAP: natures / abilities / item names + acronyms / status /
 *  weather / terrain / stealth rock / no-item spellings) or an exact
 *  damaging / boost move phrase (opts.claimMoves, the parseQuery attacker;
 *  seam G keeps Non-Damaging non-boost moves out of the slot) — else a SHAPE
 *  phrase (glued or split level, `max <stat>`, EV / stage / acc-eva /
 *  stat-less ±N dynamic boost, spikes layers incl. x-notation and number-led
 *  forms). A single word claims only when no longer claimable phrase starts
 *  at that position — the seam-B guard falls straight out of the length
 *  ordering. Claimed spans are MARKED (a side log, never deleted) so leftover
 *  words keep their layout. Species claim in the same sweep as exact
 *  glued-run matches (canon dex names + species aliases; no fuzzy/typo
 *  recovery). Same-slot claims collapse when identical and hard-error
 *  when different (dedupe-vs-conflict). Attacker move claims are validated
 *  (1 or 2 distinct) and ride back on spec._claim for parseQuery to lift. */
function parseCombatant(raw, side = "attacker", opts = {}) {
  if (typeof raw !== "string" || !raw.trim()) throw new Error(`missing side: empty ${side}`);
  // Tokenized by the shared tokenizer. parseQuery hands the whole-line atoms
  // (sliced per side) so `gi` is the GLOBAL echo atom index; a bare string is
  // tokenized locally for the explicit-args path. `opts.capture` receives the
  // live side log so parseQuery can render "scanned so far" even if we throw.
  const atoms = opts.atoms ?? tokenizeLine(raw).atoms;
  const spec = {};
  const claimMovesHere = !!opts.claimMoves;

  const labelOf = (slot) => ({
    plus: "dynamic boost", nature: "nature", ability: "ability", item: "item",
    status: "status", weather: "weather", terrain: "terrain",
    spikes: "spikes layers", noItem: "no item", stealthRock: "stealth rock",
    plate: "plate", level: "level", acc: "acc stage", eva: "eva stage",
  }[slot] ?? (slot.startsWith("boost:")
    ? `${slot.slice(6)} stage`
    : slot.startsWith("ev:")
      ? `${slot.slice(3).toUpperCase()} EV`
      : slot));
  const seen = new Map();
  const claimSlot = (slot, value) => {
    const list = seen.get(slot);
    if (list) {
      if (list.includes(value)) return false;
      throw new Error(`conflict on ${labelOf(slot)}: ${[...list, value].join(" vs ")}`);
    }
    seen.set(slot, [value]);
    return true;
  };
  const sideLog = [];
  if (opts.capture) opts.capture.log = sideLog;
  // `label` is the final ECHO label (ev:<stat>, arena, item, ...); `from` is
  // the GLOBAL atom index (atoms[from].gi) so spansFromLogs maps straight into
  // the echo ruler's atom space.
  const log = (label, from, len) => sideLog.push({ label, from: atoms[from].gi, len });

  const n = atoms.length;
  const used = new Uint8Array(n);
  const eat = (i, count = 1) => { for (let k = i; k < i + count; k++) used[k] = 1; };
  const adjacent = (i) => atoms[i + 1] != null && !atoms[i + 1].hardBefore;
  const contiguous = (i, len) => { for (let k = i; k < i + len - 1; k++) if (!adjacent(k)) return false; return true; };
  const keyAt = (i, len) => atoms.slice(i, i + len).map((x) => x.t).join(" ");
  // Species look up by the GLUED norm of the run (same key space monByName
  // and SPECIES_ALIASES use): "rotom wash", "rotom-wash", and "rotomwash"
  // all fold to "rotomwash". Exact match only — a run resolves when its
  // glued form IS a dex canon name or a species alias, nothing fuzzier.
  const speciesKeyAt = (i, len) => {
    const glue = norm(atoms.slice(i, i + len).map((x) => x.t).join(" "));
    const hit = monByName.get(glue);
    if (hit) return hit.name;
    const alias = SPECIES_ALIASES.get(glue);
    return alias && monByName.has(norm(alias)) ? monByName.get(norm(alias)).name : null;
  };

  // --- mega exact-shape upgrade (DESIGN-RECORDS §7, TODO step 4) ---
  // A standalone `mega` word binds to its side's species ONLY as an adjacent
  // prefix ("Mega Garchomp") or suffix ("Blissey Mega"). Suffix `-Mega` formes
  // are normally claimed by the glued-run species lookup above ("Garchomp
  // Mega" -> Garchomp-Mega); the standalone-suffix path here fires only when
  // that run DIDN'T match, i.e. the base has no `-Mega` forme, and is what
  // raises the no-forme hard error.
  const isMegaForme = (name) => name.includes("-Mega");
  const megaNameAt = (base) => {
    const name = `${base}-Mega`;
    return monByName.has(norm(name)) ? name : null;
  };
  const hasXYForme = (base) =>
    monByName.has(norm(`${base}-Mega-X`)) || monByName.has(norm(`${base}-Mega-Y`));
  // A longer known phrase starting at `j` wins over the upgrade signal:
  // "Mega Punch/Kick/Drain" (move), "Mega Launcher" (ability), "X-Scissor"
  // (move, for the `charizard x` alias). True = "a longer claimable phrase
  // starts here", false = "`j` is a bare word".
  const longerPhraseAt = (j) => {
    for (let len = 2; len <= Math.min(3, n - j); len++) {
      if (!contiguous(j, len)) break;
      const key = keyAt(j, len);
      if (resolveMoveName(key)) return true;
      if (CLAIM_MAP.has(key)) return true;
    }
    return false;
  };

  const clamp6 = (x) => Math.max(-6, Math.min(6, x));
  const evs = {};
  const specBoosts = () => (spec.boosts = spec.boosts ?? {});
  const addStage = (word, sign, mag) => {
    const v = clamp6(sign === "-" ? -Number(mag) : Number(mag));
    if (!v) return;
    const st = STAGE_ALIAS[word];
    if (claimSlot("boost:" + st, v)) specBoosts()[st] = v;
  };
  const addAccEva = (word, sign, mag) => {
    const v = clamp6(sign === "-" ? -Number(mag) : Number(mag));
    if (!v) return;
    const ch = ACC_EVA_ALIAS[word];
    const slot = ch === "acc" ? "acc" : "eva";
    if (claimSlot(slot, v)) { if (ch === "acc") spec._accStage = v; else spec._evaStage = v; }
  };
  const takeEv = (word, amount) => {
    const v = Number(amount);
    if (v > 252) throw new Error(`"${word} ${v}" is not an EV: gen 6 caps EVs at 252`);
    const st = EV_ALIAS[word];
    if (claimSlot("ev:" + st, v)) evs[st] = v;
  };
  const setLevel = (num) => {
    const v = Math.min(100, Math.max(1, num));
    if (claimSlot("level", v)) spec.level = v;
  };
  const setPlus = (sign, mag) => {
    const v = clamp6(sign === "-" ? -Number(mag) : Number(mag));
    if (claimSlot("plus", v)) spec._plusBoost = v;
  };
  const claimSpikes = (layers) => { if (claimSlot("spikes", layers)) spec.spikes = layers; };

  const moveNames = [];
  const signalNames = [];

  const isSigned = (t) => /^[+-]\d{1,2}$/.test(t);
  const isNumber = (t) => /^\d{1,3}$/.test(t);
  const COUNT_TOK = /^[123]$/;
  const COUNT_X = /^(?:[123][x×]|[x×][123])$/;

  // Every successful class claim logs its ECHO label at the claimed atom run.
  // A conflicting claim throws inside claimSlot BEFORE its log, so the
  // offending token stays unlabeled in the "scanned so far" echo.
  function applyClassEntry(entry, i, len) {
    switch (entry.kind) {
      case "nature": if (claimSlot("nature", entry.value)) { spec.nature = entry.value; log("nature", i, len); } break;
      case "ability": if (claimSlot("ability", entry.value)) { spec.ability = entry.value; log("ability", i, len); } break;
      case "item": if (claimSlot("item", entry.value)) { spec.item = entry.value; log("item", i, len); } break;
      case "lo": {
        const item = side === "defender" ? "Leftovers" : "Life Orb";
        if (claimSlot("item", item)) { spec.item = item; log("item", i, len); }
        break;
      }
      case "plate": spec.plate = true; log("item", i, len); break;
      case "status": if (claimSlot("status", entry.value)) { spec.status = entry.value; log("status", i, len); } break;
      case "weather": if (claimSlot("weather", entry.value)) { spec.weather = entry.value; log("arena", i, len); } break;
      case "terrain": if (claimSlot("terrain", entry.value)) { spec.terrain = entry.value; log("arena", i, len); } break;
      case "sr": spec.stealthRock = true; log("arena", i, len); break;
      case "noitem": spec.noItem = true; log("item", i, len); break;
    }
  }

  /** Species claim with the §7 mega exact-shape upgrade. Returns the claim
   *  length (from `i`) or 0 when the mega signal is out of scope. Rules:
   *  - adjacent standalone `mega`, prefix or suffix, upgrades to `-Mega` when
   *    that forme exists (silent, span logged as `mega`);
   *  - a base with only `-Mega-X`/`-Mega-Y` formes (Charizard/Mewtwo) keeps
   *    the base pick, mega stays junk — out of scope, never fabricated;
   *  - a base with NO mega forme at all is a HARD ERROR (never fall back);
   *  - an already-`-Mega` token is never re-upgraded, and when its run's
   *    trailing word also starts a longer phrase ("Garchomp Mega Punch" = the
   *    move Mega Punch, "Charizard X-Scissor" = the move X-Scissor) the run
   *    splits back to the base species so the move claims its words. */
  function claimSpecies(sp, i, len) {
    const left = i > 0 && !used[i - 1] && atoms[i - 1].t === "mega" && adjacent(i - 1) ? i - 1 : -1;
    const right = i + len < n && !used[i + len] && atoms[i + len].t === "mega" && adjacent(i + len - 1) ? i + len : -1;
    const upgrade = left !== -1 ? left : right;
    if (upgrade !== -1 && !isMegaForme(sp) && !longerPhraseAt(upgrade)) {
      const megaName = megaNameAt(sp);
      if (megaName) {
        if (claimSlot("species", megaName)) spec.name = megaName;
        log("species", i, len);
        log("mega", upgrade, 1);
        if (left !== -1) eat(left, 1);
        eat(i, len);
        return len;
      }
      if (hasXYForme(sp)) {
        if (claimSlot("species", sp)) spec.name = sp;
        log("species", i, len);
        return len;
      }
      throw new Error(`"${sp}" has no Mega forme`);
    }
    if (isMegaForme(sp)) {
      const base = speciesKeyAt(i, len - 1);
      if (base && !isMegaForme(base) && longerPhraseAt(i + len - 1)) {
        if (claimSlot("species", base)) spec.name = base;
        log("species", i, len - 1);
        return len - 1;
      }
    }
    if (claimSlot("species", sp)) spec.name = sp;
    log("species", i, len);
    return len;
  }

  function literalClaimAt(i) {
    const maxL = Math.min(3, n - i);
    for (let len = maxL; len >= 1; len--) {
      if (len > 1 && !contiguous(i, len)) continue;
      const key = keyAt(i, len);
      let name = null;
      if (claimMovesHere) name = resolveMoveName(key);
      if (name) {
        const move = moveByName.get(norm(name));
        if (move && move.category !== "Non-Damaging") {
          moveNames.push(name); log("move", i, len); return len;
        }
        if (move && BOOST_MOVES.has(name)) {
          signalNames.push(name); log("boost", i, len); return len;
        }
      }
      const sp = speciesKeyAt(i, len);
      if (sp) {
        const upgrade = claimSpecies(sp, i, len);
        if (upgrade) return upgrade;
      }
      const entries = CLAIM_MAP.get(key);
      if (entries) {
        for (const entry of entries) applyClassEntry(entry, i, len);
        return len;
      }
    }
    return 0;
  }

  function spikeClaimAt(i) {
    const t0 = atoms[i].t;
    const spikeWord = (t) => (t === "spike" ? 1 : t === "spikes" ? 3 : 0);
    const digitOf = (t) => (COUNT_TOK.test(t) || COUNT_X.test(t) ? Number(t.match(/[123]/)[0]) : 0);
    const sd = spikeWord(t0);
    const nxt = atoms[i + 1];
    if (sd) {
      if (adjacent(i) && nxt && digitOf(nxt.t)) { claimSpikes(digitOf(nxt.t)); return { len: 2 }; }
      claimSpikes(sd); return { len: 1 };
    }
    if (adjacent(i) && nxt && spikeWord(nxt.t) && digitOf(t0)) { claimSpikes(digitOf(t0)); return { len: 2 }; }
    return null;
  }

  function shapeClaimAt(i) {
    const tok = atoms[i].t;
    const glued = /^l(?:v|evel)?(\d{1,3})$/.exec(tok);
    if (glued) { setLevel(Number(glued[1])); log("level", i, 1); return 1; }
    if ((tok === "level" || tok === "lv" || tok === "l") && adjacent(i) && isNumber(atoms[i + 1].t)) {
      setLevel(Number(atoms[i + 1].t)); log("level", i, 2); return 2;
    }
    if (tok === "max" && adjacent(i) && MAX_ALIAS[atoms[i + 1].t]) {
      const key = MAX_ALIAS[atoms[i + 1].t];
      if (!spec[key]) (spec._maxOrder = spec._maxOrder ?? []).push(key);
      spec[key] = true;
      log(`ev:${key.slice(4).toLowerCase()}`, i, 2);
      return 2;
    }
    if (isSigned(tok)) {
      const nxt = atoms[i + 1];
      if (adjacent(i) && nxt && STAGE_ALIAS[nxt.t]) { addStage(nxt.t, tok[0], tok.slice(1)); log("boost", i, 2); return 2; }
      if (adjacent(i) && nxt && ACC_EVA_ALIAS[nxt.t]) { addAccEva(nxt.t, tok[0], tok.slice(1)); log("boost", i, 2); return 2; }
      setPlus(tok[0], tok.slice(1)); log("boost", i, 1); return 1;
    }
    if (STAGE_ALIAS[tok]) {
      const nxt = atoms[i + 1];
      if (adjacent(i) && nxt && isSigned(nxt.t)) { addStage(tok, nxt.t[0], nxt.t.slice(1)); log("boost", i, 2); return 2; }
      if (adjacent(i) && nxt && isNumber(nxt.t)) { takeEv(tok, nxt.t); log(`ev:${EV_ALIAS[tok]}`, i, 2); return 2; }
      return 0; // bare stat word: not investment, leave it for species residue
    }
    if (tok === "hp") {
      const nxt = atoms[i + 1];
      if (adjacent(i) && nxt && isNumber(nxt.t)) { takeEv("hp", nxt.t); log("ev:hp", i, 2); return 2; }
      return 0;
    }
    if (ACC_EVA_ALIAS[tok]) {
      const nxt = atoms[i + 1];
      if (adjacent(i) && nxt && isSigned(nxt.t)) { addAccEva(tok, nxt.t[0], nxt.t.slice(1)); log("boost", i, 2); return 2; }
      return 0;
    }
    if (isNumber(tok) || COUNT_X.test(tok)) {
      const nxt = atoms[i + 1];
      if (isNumber(tok) && adjacent(i) && nxt && EV_ALIAS[nxt.t]) { takeEv(nxt.t, tok); log(`ev:${EV_ALIAS[nxt.t]}`, i, 2); return 2; }
      const count = spikeClaimAt(i);
      if (count) { log("arena", i, count.len); return count.len; }
      return 0;
    }
    if (tok === "spike" || tok === "spikes") {
      const count = spikeClaimAt(i);
      if (count) { log("arena", i, count.len); return count.len; }
    }
    return 0;
  }

  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    const lit = literalClaimAt(i);
    if (lit) { eat(i, lit); i += lit - 1; continue; }
    const shape = shapeClaimAt(i);
    if (shape) { eat(i, shape); i += shape - 1; continue; }
  }
  if (Object.keys(evs).length) spec.evs = evs;

  // Attacker move claims fold in here: validate (1 or 2 distinct) before the
  // species-missing check so the move errors keep their old precedence.
  if (claimMovesHere) {
    spec._claim = finishMoveClaim(moveNames, signalNames, raw);
  }

  // Species were claimed DURING the sweep (speciesKeyAt, exact glued-run
  // match against monByName + SPECIES_ALIASES). No residue resolver, no
  // permutations, no fuzzy/typo recovery — a correctly spelled canon name or
  // alias claims, anything else is junk or a missing-species error. The side
  // log (T6) keeps the claim→atom spans the ## 8 echo needs.
  spec._sideLog = sideLog;
  const words = atoms.filter((_, k) => !used[k]).map((x) => x.t);
  if (!spec.name) {
    throw new Error(`missing species: "${raw}"`);
  }
  // T2 junk ruling (2026-09-08): R4 hard errors stand for a digit/stat token no
  // claim bound (fail loud). PLAIN junk words are SILENTLY DROPPED — no
  // _ignored, no "ignored:" card flag, no echo label or `???`.
  const STAT_WORD = new Set([...Object.keys(EV_ALIAS), ...Object.keys(ACC_EVA_ALIAS)]);
  const strayStats = words.filter((w) => STAT_WORD.has(w));
  const strayNumbers = words.filter((t) => /\d/.test(t) && !STAT_WORD.has(t));
  if (strayStats.length || strayNumbers.length) {
    throw new Error(unboundEvError([...strayStats, ...strayNumbers]));
  }
  return spec;
}


/** Pull side-level weather/terrain/hazards up to the matchup level. Weather is
 *  a plain same-slot value: two different explicit values across sides ERROR
 *  (`weather: sun vs rain`); the same value collapses. Weather-setting
 *  ABILITIES are not arena claims — fill resolves them from the resolved
 *  abilities after this (`fillWeather`/`weatherFromSetters`), and a typed
 *  weather always wins over them.
 *  Terrain and spikes are plain same-slot values: different cross-side values
 *  error, never add. Hazards sit on the field the defender switches into but
 *  EITHER side may declare them (a typed hazard is a statement about the
 *  field, not the mon); Stealth Rock is a boolean and cannot conflict. */
function mergeArena(matchup) {
  const weather = [];
  const terrain = [];
  for (const side of ["attacker", "defender"]) {
    const s = matchup[side];
    if (!s) continue;
    if (s.weather != null) weather.push(s.weather);
    if (s.terrain) terrain.push(s.terrain);
    delete s.weather;
    delete s.terrain;
  }
  const tCodes = [...new Set(terrain)];
  if (tCodes.length > 1) throw new Error(`conflict on terrain: ${tCodes.join(" vs ")}`);
  if (tCodes.length === 1) matchup.terrain = tCodes[0];

  const wCodes = [...new Set(weather)];
  if (wCodes.length > 1) throw new Error(`conflict on weather: ${wCodes.join(" vs ")}`);
  if (wCodes.length === 1) matchup.weather = wCodes[0];
  // hazards sit on the field the defender switches into; either side may
  // declare them (a typed hazard is a statement about the field, not the mon)
  let spikes = undefined;
  let stealthRock = false;
  for (const side of ["attacker", "defender"]) {
    const s = matchup[side];
    if (!s) continue;
    if (s.spikes != null) {
      if (spikes != null && s.spikes !== spikes) throw new Error(`conflict on spikes layers: ${spikes} vs ${s.spikes}`);
      spikes = s.spikes;
    }
    if (s.stealthRock) stealthRock = true;
    delete s.spikes;
    delete s.stealthRock;
  }
  if (spikes != null) matchup.spikes = spikes;
  if (stealthRock) matchup.stealthRock = true;
  return matchup;
}

/**
 * Claim the moves out of a move-slot text — NO delimiter grammar. Chain words
 * (`then` / `and` / `+` / commas) are inert noise; only exact move phrases
 * matter. Walk the slot's word atoms left→right, take the longest known
 * contiguous move phrase/alias at each position (dex moves are ≤3 words), and
 * collect the claims in order. The distinct canonical count decides:
 *   1 distinct → { single }; 2 distinct → { chain: [m0, m1] } in claimed
 *   order (move 1 lands turn 1, move 2 lands turn 2); 0 moves or >2 distinct
 *   → hard error (stops the parse).
 * A comma (or the other punctuation boundaries `.;/\|`) is a HARD LOOKAHEAD
 * STOP: no phrase may span one, so "Shadow, Ball" never reads as Shadow Ball.
 * The marker atom is stepped over, so single-word claims on either side still
 * proceed — "EQ, Outrage" / "eq,outrage" still claim both moves.
 *
 * NON-DAMAGING moves never occupy the slot. A self-stat-raising move (in the
 * BOOST_MOVES table — aliases.md "## Boosting moves", doc-as-code) is a BOOST
 * SIGNAL: it is returned in `signals` (deduped canonical names) for the caller
 * to fold onto the attacker as stat stages, and is NOT counted as a move. Any
 * other Non-Damaging move (Toxic, Will-O-Wisp, Protect, a hazard/weather
 * setter, ...) is a class token, never the queried attack move — it is
 * consumed and dropped. A slot with no damaging move at all hard-errors. */
/** Tokenize text the way move claiming does (punctuation -> \u0001 sentinel
 *  atoms, everything else non-alnum -> space) and return the word list. */
function moveTokenize(text) {
  const raw = String(text).toLowerCase();
  // Mark punctuation boundaries so no phrase lookahead ever crosses them.
  const marked = raw.replace(/[,.;/\\|]+/g, " \u0001 ");
  return marked.replace(/[^a-z0-9\u0001 ]+/g, " ").split(/\s+/).filter(Boolean);
}

/** Longest-fit exact move scan over word atoms. Returns the claimed DAMAGING
 *  move names, the boost-signal names, and the word indexes each consumed (a
 *  damaging phrase and a boost signal consume their words; a dropped
 *  Non-Damaging class move consumes nothing so a side pass can still claim it
 *  as its class token). */
function scanMoveWords(words) {
  const claimed = [];
  const signals = [];
  const usedIdx = [];
  for (let i = 0; i < words.length; i++) {
    let name = null;
    let len = 0;
    for (let k = Math.min(3, words.length - i); k >= 1 && !name; k--) {
      const slice = words.slice(i, i + k);
      if (slice.includes("\u0001")) continue;
      const hit = resolveMoveName(slice.join(" "));
      if (hit) { name = hit; len = k; }
    }
    if (name) {
      const move = moveByName.get(norm(name));
      if (move?.category !== "Non-Damaging") {
        claimed.push(name);
        for (let j = i; j < i + len; j++) usedIdx.push(j);
      } else if (BOOST_MOVES.has(name)) {
        signals.push(name); // boost signal: attacker stages, never a move
        for (let j = i; j < i + len; j++) usedIdx.push(j);
      }
      i += len - 1;
    }
  }
  return { claimed, signals, usedIdx };
}

/** Dedupe + enforce the 1-or-2-move rule. Throws naming `quote` on 0 / >2. */
function finishMoveClaim(claimed, signals, quote) {
  const seen = new Set();
  const distinct = claimed.filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
  const sseen = new Set();
  const boostSignals = signals.filter((n) => (sseen.has(n) ? false : (sseen.add(n), true)));
  if (distinct.length === 0) {
    throw new Error(`missing move: "${quote}"`);
  }
  if (distinct.length > 2) throw new Error(`too many moves in a combo — capped at 2 ("${quote}")`);
  const result = distinct.length === 2 ? { chain: distinct } : { single: distinct[0] };
  if (boostSignals.length) result.signals = boostSignals;
  return result;
}

function claimMoves(text) {
  const words = moveTokenize(text);
  const { claimed, signals } = scanMoveWords(words);
  return finishMoveClaim(claimed, signals, text);
}

/** Parse a free-order damage line. `vs` is the MANDATORY splitter — a query
 *  without one is a hard error; text left of `vs` is the attacker side, right
 *  is the defender. There is NO `uses` syntax: `use`/`uses` are inert and
 *  silently dropped like any junk word. Tokens within a side are free-order;
 *  the side sweep (parseCombatant) claims the damaging move / boost signal by
 *  exact phrase wherever it appears on the ATTACKER side (opts.claimMoves) and
 *  returns the claim on spec._claim for lifting here. The defender NEVER runs a
 *  move claim (a stray move-ish word there is silent junk). "turn by turn"
 *  asks for the per-turn table. */
function parseQuery(line) {
  // Tokenize the WHOLE line once; the two sides are atom ranges around the one
  // `vs` atom, so every claim's `_sideLog.from` is a global echo atom index.
  const { normed, atoms } = tokenizeLine(line);
  const showTurns = /\bturn\s*by\s*turn\b/i.test(normed);
  const vsAt = [];
  for (let i = 0; i < atoms.length; i++) if (atoms[i].t === "vs") vsAt.push(i);
  if (vsAt.length !== 1) {
    throw new Error('missing split: a query needs one "vs" between the attacker and the defender');
  }
  const v = vsAt[0];
  const aAtoms = atoms.slice(0, v);
  const dAtoms = atoms.slice(v + 1);
  const aRaw = aAtoms.map((x) => x.raw).join(" ");
  const dRaw = dAtoms.map((x) => x.raw).join(" ");
  // Live logs captured per side so a throw can still render "scanned so far":
  // attacker-complete + defender-partial (or attacker-only when the attacker
  // itself throws, which happens BEFORE the defender is ever scanned).
  const aCtx = {};
  const dCtx = {};
  try {
    const attacker = parseCombatant(aRaw, "attacker", { claimMoves: true, atoms: aAtoms, capture: aCtx });
    const defender = parseCombatant(dRaw, "defender", { atoms: dAtoms, capture: dCtx });
    const out = mergeArena({ attacker, defender, showTurns });
    const claim = attacker._claim;
    delete attacker._claim;
    if (claim) {
      if (claim.single) out.move = claim.single;
      else out.moves = claim.chain;
      if (claim.signals) out.signals = claim.signals;
    }
    out._query = line.trim();
    return out;
  } catch (err) {
    err.sideLogs = [...(aCtx.log ?? []), ...(dCtx.log ?? [])];
    throw err;
  }
}

export {
  norm, hyphenToSpace, chart, natureByName, moveByName, monByName,
  resolveMoveName, claimMoves, PLATE_BY_TYPE, BOOST_MOVES,
  parseCombatant, mergeArena, parseQuery,
};

// --- standalone CLI (only when run directly) ---
// Reads one natural-language line (or explicit atk/move/def args) and writes
// the SPEC JSON to stdout for the chain:
//   input-converter "<line>" | fill.mjs - | calc.mjs - | output.mjs -
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const writeSpec = (mc) => process.stdout.write(JSON.stringify(mc, null, 2) + "\n");
  if (args.length === 1) {
    writeSpec(parseQuery(args[0]));
  } else if (args.length >= 3) {
    // Explicit <atk> <move> <def> compat form. NEVER manufactures a "uses"
    // word (2026-09-08): the canonical line is the free-order vs form.
    const mc = mergeArena({
      attacker: parseCombatant(args[0], "attacker"),
      move: args.slice(1, args.length - 1).join(" "),
      defender: parseCombatant(args[args.length - 1], "defender"),
    });
    mc._query = args[0] + " " + args.slice(1, args.length - 1).join(" ") + " vs " + args[args.length - 1];
    writeSpec(mc);
  } else {
    console.error(USAGE);
    process.exit(1);
  }
}
