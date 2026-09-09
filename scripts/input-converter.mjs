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

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "..", "data");

const dexData = JSON.parse(await readFile(path.join(DATA_DIR, "xy-pokemon.json"), "utf8"));
const movesData = JSON.parse(await readFile(path.join(DATA_DIR, "moves-xy.json"), "utf8"));
const naturesData = JSON.parse(await readFile(path.join(DATA_DIR, "natures-xy.json"), "utf8"));
const typesData = JSON.parse(await readFile(path.join(DATA_DIR, "types-xy.json"), "utf8"));

// Punctuation chars `, . ; / \ |` act as hard TOKEN BOUNDARIES everywhere: a
// "+2," must not reach over its comma and bind "ATK 252" as a stage, and
// "HP, 252" is two separate tokens. During scanning they are kept as a
// non-space sentinel so no phrase regex crosses one.
const PUNCT_BOUNDARY = /[,.;/\\|]/g;
const PUNCT_SENT = "\u0001";
// norm() also folds those punctuation chars away, so a typed "Mr. Mime"
// ("mr. mime"), "Mr Mime", or "mrmime" all fold to the same glued lookup key
// (species claims match on it; "Mr Mime" typed across a real space still
// folds, but a `.` between the words is a hard boundary and splits the claim).
// The dex canon keys themselves are hyphenated ("Rotom-Wash", "Venusaur-Mega"),
// so norm() keeps folding hyphens for LOOKUPS regardless of the master hyphen
// rule below — that rule only normalizes the TYPED line, never the canon data.
const norm = (s) => s.toLowerCase().replace(/[\s',.;/\\|-]/g, "");

// --- Master hyphen rule (idea-note-3): every hyphen in the INPUT is a word
// separator — it becomes a space — with ONE exception: a minus sign glued to a
// boost/stage number ("-2 atk", "atk -2") is a signed stage token and stays a
// minus. No other hyphen survives the rule, so hyphenated formes, spellings,
// and glues all reduce to plain spaced words before any pass sees them:
//   "mega-aggron" / "aggron-mega" -> "mega aggron" / "aggron mega" (mega signal)
//   "2-spikes" -> "2 spikes" (spikes layers)      "no-item" -> "no item"
//   "life-orb" -> "life orb" (item)               "Porygon-2" -> "Porygon 2"
// Runs BEFORE tokenization so no later pass special-cases a hyphenated form.
const hyphenToSpace = (s) =>
  s.replace(/-/g, (h, i) => {
    const before = i > 0 ? s[i - 1] : "";
    const after = s[i + 1] ?? "";
    return !/[A-Za-z0-9]/.test(before) && /[0-9]/.test(after) ? h : " ";
  });
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
  ["landorust", "Landorus-Therian"], ["landorustherian", "Landorus-Therian"],
  ["landot", "Landorus-Therian"], ["lando", "Landorus"],
  ["landorusi", "Landorus"], ["landorusincarnate", "Landorus"],
  ["thundurust", "Thundurus-Therian"], ["thundurustherian", "Thundurus-Therian"],
  ["thundurusi", "Thundurus"], ["thundurusincarnate", "Thundurus"],
  ["tornadust", "Tornadus-Therian"], ["tornadustherian", "Tornadus-Therian"],
  ["tornadusi", "Tornadus"], ["tornadusincarnate", "Tornadus"],
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



// Human list of the tokens parseCombatant recognized so far, so a hard error
// shows the user what was understood before the confusing bit.
const STAT_ORDER = ["hp", "atk", "def", "spa", "spd", "spe"];
const sig = (v) => `${v > 0 ? "+" : ""}${v}`;
function describeSpec(spec, name) {
  const parts = [];
  if (name) parts.push(name);
  const stage = [];
  for (const k of ["atk", "def", "spa", "spd", "spe"]) {
    if (spec.boosts?.[k]) stage.push(`${sig(spec.boosts[k])} ${k}`);
  }
  if (spec._accStage) stage.push(`${sig(spec._accStage)} acc`);
  if (spec._evaStage) stage.push(`${sig(spec._evaStage)} eva`);
  const evL = [];
  for (const k of STAT_ORDER) if (spec.evs?.[k]) evL.push(`${k.toUpperCase()} ${spec.evs[k]}`);
  if (spec._plusBoost) parts.push(`${sig(spec._plusBoost)} (on the move's stat)`);
  for (const s of stage) parts.push(s);
  for (const e of evL) parts.push(e);
  return parts;
}

/** Hard error for digit/stat tokens nothing claimed: list what WAS recognized,
 *  quote the strays, and explain in plain words what the converter expected.
 *  An unbound stat WORD and an unbound unsigned NUMBER are both mistakes —
 *  signed numbers never strand (a stat-less +N/-N is always the dynamic
 *  boost). */
function strayTokenError(raw, side, spec, name, stats, digits) {
  const rec = describeSpec(spec, name);
  const quoted = [...stats, ...digits].map((t) => `"${t}"`).join(", ");
  const lines = [
    `I couldn't place ${quoted} on the ${side}.`,
    rec.length ? `I did recognize: ${rec.join(" · ")}.` : "",
  ];
  if (digits.length) {
    lines.push(`A bare number needs a stat right next to it to be an EV ("252 atk" / "atk 252", "188 HP" / "HP 188"). "${digits[0]}" had none, so nothing bound it.`);
  }
  if (stats.length) {
    const w = stats[0];
    const statHint = w === "hp"
      ? `"hp" is a stat word with nothing bound to it. HP can't take a stage, so a lone "hp" (as in "+2 hp") binds nothing — write the boost as "+2" alone, or give hp its own EV ("+2 hp 252").`
      : `"${w}" is a stat word with nothing bound to it — an EV needs a number right next to it ("252 hp" / "hp 252") and a stage needs a +/- sign ("+2 atk").`;
    lines.push(statHint);
  }
  return lines.filter(Boolean).join("\n");
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
const WEATHER_MAP = [
  ["permanent sandstorm", "sand"], ["harsh sunlight", "sun"], ["permanent rain", "rain"],
  ["permanent sun", "sun"], ["permanent hail", "hail"], ["sand storm", "sand"],
  ["sandstorm", "sand"], ["hail storm", "hail"], ["hailstorm", "hail"],
  ["rain dance", "rain"], ["sunny day", "sun"],
  ["desolate land", "desolate"], ["harsh sunshine", "desolate"], ["extremely harsh sunlight", "desolate"],
  ["primordial sea", "primordial"], ["heavy rain", "primordial"],
  ["delta stream", "delta"], ["strong winds", "delta"],
  ["sunny", "sun"], ["sand", "sand"], ["rain", "rain"], ["hail", "hail"], ["sun", "sun"],
];
const TERRAIN_MAP = [
  ["electric terrain", "electric"], ["grassy terrain", "grassy"],
  ["misty terrain", "misty"], ["psychic terrain", "psychic"],
];
const STEALTH_ROCK_PHRASES = ["stealth rock", "stealthrock", "sr", "stealth rocks", "rock"];
const NO_ITEM_PHRASES = ["no item", "noitem", "itemless"];

// The primal weather phrases are arena words in queries, never the ability.
const WEATHER_ABILITIES = new Set(["desolate land", "primordial sea", "delta stream"]);

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
ABILITY_NAMES.forEach((lower, i) => {
  if (!WEATHER_ABILITIES.has(lower)) registerClaim(lower, "ability", ABILITY_CANON[i]);
});
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
  if (typeof raw !== "string" || !raw.trim()) throw new Error("empty combatant spec");
  raw = hyphenToSpace(raw);
  const s = ` ${raw.toLowerCase().replace(/[@'"]/g, " ").replace(PUNCT_BOUNDARY, PUNCT_SENT)} `;
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
      throw new Error(`conflicting ${labelOf(slot)}: ${[...list, value].join(" vs ")}`);
    }
    seen.set(slot, [value]);
    return true;
  };
  const sideLog = [];
  const log = (slot, from, len) => sideLog.push({ slot, from, len });

  const atoms = [...s.matchAll(/[^\s\u0001]+/g)].map((m) => ({ t: m[0], a: m.index, b: m.index + m[0].length }));
  const n = atoms.length;
  const used = new Uint8Array(n);
  const eat = (i, count = 1) => { for (let k = i; k < i + count; k++) used[k] = 1; };
  const gapToNext = (i) => (atoms[i + 1] ? s.slice(atoms[i].b, atoms[i + 1].a) : null);
  const adjacent = (i) => atoms[i + 1] != null && gapToNext(i) != null && !/\u0001/.test(gapToNext(i));
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

  function applyClassEntry(entry) {
    switch (entry.kind) {
      case "nature": if (claimSlot("nature", entry.value)) spec.nature = entry.value; break;
      case "ability": if (claimSlot("ability", entry.value)) spec.ability = entry.value; break;
      case "item": if (claimSlot("item", entry.value)) spec.item = entry.value; break;
      case "lo": {
        const item = side === "defender" ? "Leftovers" : "Life Orb";
        if (claimSlot("item", item)) spec.item = item;
        break;
      }
      case "plate": spec.plate = true; break;
      case "status": if (claimSlot("status", entry.value)) spec.status = entry.value; break;
      case "weather": if (claimSlot("weather", entry.value)) spec.weather = entry.value; break;
      case "terrain": if (claimSlot("terrain", entry.value)) spec.terrain = entry.value; break;
      case "sr": spec.stealthRock = true; break;
      case "noitem": spec.noItem = true; break;
    }
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
        if (claimSlot("species", sp)) spec.name = sp;
        log("species", i, len);
        return len;
      }
      const entries = CLAIM_MAP.get(key);
      if (entries) {
        for (const entry of entries) applyClassEntry(entry);
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
      log("max", i, 2);
      return 2;
    }
    if (isSigned(tok)) {
      const nxt = atoms[i + 1];
      if (adjacent(i) && nxt && STAGE_ALIAS[nxt.t]) { addStage(nxt.t, tok[0], tok.slice(1)); log("boost", i, 2); return 2; }
      if (adjacent(i) && nxt && ACC_EVA_ALIAS[nxt.t]) { addAccEva(nxt.t, tok[0], tok.slice(1)); log("acc", i, 2); return 2; }
      setPlus(tok[0], tok.slice(1)); log("boost", i, 1); return 1;
    }
    if (STAGE_ALIAS[tok]) {
      const nxt = atoms[i + 1];
      if (adjacent(i) && nxt && isSigned(nxt.t)) { addStage(tok, nxt.t[0], nxt.t.slice(1)); log("boost", i, 2); return 2; }
      if (adjacent(i) && nxt && isNumber(nxt.t)) { takeEv(tok, nxt.t); log("ev", i, 2); return 2; }
      return 0; // bare stat word: not investment, leave it for species residue
    }
    if (tok === "hp") {
      const nxt = atoms[i + 1];
      if (adjacent(i) && nxt && isNumber(nxt.t)) { takeEv("hp", nxt.t); log("ev", i, 2); return 2; }
      return 0;
    }
    if (ACC_EVA_ALIAS[tok]) {
      const nxt = atoms[i + 1];
      if (adjacent(i) && nxt && isSigned(nxt.t)) { addAccEva(tok, nxt.t[0], nxt.t.slice(1)); log("acc", i, 2); return 2; }
      return 0;
    }
    if (isNumber(tok) || COUNT_X.test(tok)) {
      const nxt = atoms[i + 1];
      if (isNumber(tok) && adjacent(i) && nxt && EV_ALIAS[nxt.t]) { takeEv(nxt.t, tok); log("ev", i, 2); return 2; }
      const count = spikeClaimAt(i);
      if (count) { log("spikes", i, count.len); return count.len; }
      return 0;
    }
    if (tok === "spike" || tok === "spikes") {
      const count = spikeClaimAt(i);
      if (count) { log("spikes", i, count.len); return count.len; }
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
    const rest = words.join(" ");
    throw new Error(`could not identify a pokemon in: "${raw}" (leftover: "${rest}")`);
  }
  // T2 junk ruling (2026-09-08): R4 hard errors stand for a digit/stat token no
  // claim bound (fail loud, show what WAS understood). PLAIN junk words (the
  // rest of the leftover) are SILENTLY DROPPED — no _ignored, no "ignored:"
  // card flag, no echo label or `???`.
  const STAT_WORD = new Set([...Object.keys(EV_ALIAS), ...Object.keys(ACC_EVA_ALIAS)]);
  const strayStats = words.filter((w) => STAT_WORD.has(w));
  const strayNumbers = words.filter((t) => /\d/.test(t) && !STAT_WORD.has(t));
  if (strayStats.length || strayNumbers.length) {
    throw new Error(strayTokenError(raw, side, spec, spec.name, strayStats, strayNumbers));
  }
  return spec;
}


/** Pull side-level weather/terrain/hazards up to the matchup level. */
function mergeArena(matchup) {
  for (const side of ["attacker", "defender"]) {
    const s = matchup[side];
    if (s?.weather) matchup.weather = s.weather;
    if (s?.terrain) matchup.terrain = s.terrain;
    delete s.weather;
    delete s.terrain;
  }
  // hazards sit on the field the defender switches into
  if (matchup.defender?.stealthRock) matchup.stealthRock = true;
  if (matchup.defender?.spikes) matchup.spikes = matchup.defender.spikes;
  delete matchup.defender?.stealthRock;
  delete matchup.defender?.spikes;
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
    if (boostSignals.length) {
      throw new Error(`only boosting moves (no damaging move) in: "${quote}" - a setup move like Dragon Dance only sets attacker stages (+1 atk/+1 spe); add the attack move, e.g. "Dragon Dance Earthquake"`);
    }
    throw new Error(`could not identify a damaging move in: "${quote}"`);
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
  const normed = hyphenToSpace(line);
  const flag = /\bturn\s*by\s*turn\b/i.test(normed);
  const clean = normed.replace(/\bturn\s*by\s*turn\b/gi, " ").replace(/\s+/g, " ").trim();
  const parts = clean.split(/\bvs\b/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 2) {
    throw new Error('a query needs exactly one "vs" splitting the attacker from the defender, e.g. "Garchomp @ Life Orb Jolly 252 Atk Earthquake vs Heatran 252 HP"');
  }
  const [attackerSide, defenderSide] = parts;
  const attacker = parseCombatant(attackerSide, "attacker", { claimMoves: true });
  const defender = parseCombatant(defenderSide, "defender");
  const out = mergeArena({ attacker, defender, showTurns: flag });
  const claim = attacker._claim;
  delete attacker._claim;
  if (claim) {
    if (claim.single) out.move = claim.single;
    else out.moves = claim.chain;
    if (claim.signals) out.signals = claim.signals;
  }
  out._query = line.trim();
  return out;
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
