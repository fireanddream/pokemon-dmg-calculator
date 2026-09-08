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
// non-space sentinel so no `\s*` regex crosses one; the sentinel is collapsed
// to a space just before species-name resolution.
const PUNCT_BOUNDARY = /[,.;/\\|]/g;
const PUNCT_SENT = "\u0001";
// norm() also folds those punctuation chars away so a typed "Mr. Mime"
// ("mr. mime"), "Mr Mime", or "mrmime" all resolve to the same dex key. The
// dex canon keys themselves are hyphenated ("Rotom-Wash", "Venusaur-Mega"), so
// norm() keeps folding hyphens for LOOKUPS regardless of the master hyphen
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
  ["draco", "Draco Meteor"],
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
  node scripts/input-converter.mjs "<atk> uses <move> vs <def>"   (spec JSON)
  node scripts/input-converter.mjs <atk> <move> <def>              (explicit args)

  input-converter is the OFFLINE extractor. It converts one natural-language
  line into the spec JSON (the variables the user stated; defaults NOT filled).
  An agent route produces the same spec JSON. Either feeds fill.mjs, which
  applies auto-fill-defaults.md and resolves to the calc-input JSON calc.mjs
  consumes:
    node scripts/input-converter.mjs "<query>" | node scripts/fill.mjs - | node
    scripts/calc.mjs - | node scripts/output.mjs -

  specs: "Species [@ Item] [Nature] [N Stat EVs] [Ability] [L50]"`;

function stripMatches(str, pattern, flags = "gi") {
  const re = new RegExp(pattern, flags);
  const hits = [];
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(str))) {
    hits.push(m);
    out += str.slice(last, m.index);
    last = m.index + m[0].length;
  }
  out += str.slice(last);
  return { text: out, hits };
}

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

/** Hard error for digit/signed tokens nothing claimed: list what WAS recognized,
 *  quote the strays, and explain in plain words what the converter expected. */
function strayNumberError(raw, side, spec, name, strays) {
  const rec = describeSpec(spec, name);
  const quoted = strays.map((t) => `"${t}"`).join(", ");
  const needStat = strays.some((t) => /^[+-]/.test(t));
  return [
    `I couldn't place ${quoted} on the ${side}.`,
    rec.length ? `I did recognize: ${rec.join(" · ")}.` : "",
    needStat
      ? `A +/- number needs its stat right after it: "+2 atk" / "atk +2" for a stage, "+1 acc" for accuracy, or "+N hp" to boost the move's stat. "${strays[0]}" had none, so nothing happened to it.`
      : `A bare number needs a stat to be an EV ("252 atk" / "atk 252", "188 HP" / "HP 188"), or a +/- sign to be a stage. "${strays[0]}" has neither, so nothing happened to it.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Turn "Garchomp @ Life Orb Jolly 252 Atk" into a resolve()-style spec. */
function parseCombatant(raw, side = "attacker") {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("empty combatant spec");
  raw = hyphenToSpace(raw);
  const padded = () =>
    ` ${raw.toLowerCase().replace(/[@'"]/g, " ").replace(PUNCT_BOUNDARY, PUNCT_SENT)} `;
  let s = padded();

  const spec = {};

  // --- Investment tokens: max shorthand, level, stat stages, EVs, dynamic
  // boost. Scanned STRICTLY LEFT TO RIGHT over word atoms. A token's shape
  // decides what phrase it can start, and only the IMMEDIATELY following atom
  // (whitespace between only — a punctuation sentinel breaks adjacency)
  // decides how that phrase completes:
  //
  //   EV       "252 atk" / "atk 252" / "188 HP" / "HP 188"  (0-252, any stat)
  //   stage    a +/- number bound to a battle stat, either order: "+2 atk",
  //            "atk +2"  (HP is NOT stageable) — and "+1 acc"/"+1 eva"
  //   dynamic  "+N hp" (HP can't take the stage) OR "+N" sitting on a
  //            punctuation boundary ("+2, ATK 252" is a list, never a stage):
  //            an attack-move boost resolved onto the move's stat by fill.mjs.
  // Atoms that form no investment phrase (species, nature, "sand", ...) are
  // left in place for the word passes below.
  const STAGE_ALIAS = {
    atk: "atk", attack: "atk", def: "def", defense: "def",
    spa: "spa", spatk: "spa", special: "spa", spc: "spa",
    spd: "spd", spdef: "spd", sdef: "spd", spe: "spe", speed: "spe",
  };
  const EV_ALIAS = { hp: "hp", ...STAGE_ALIAS };
  const ACC_EVA_ALIAS = { acc: "acc", accuracy: "acc", eva: "eva", evasion: "eva" };
  const MAX_ALIAS = {
    atk: "_maxAtk", attack: "_maxAtk", phys: "_maxAtk",
    spa: "_maxSpa", spatk: "_maxSpa", special: "_maxSpa", spc: "_maxSpa",
    def: "_maxDef", defense: "_maxDef",
    spd: "_maxSpd", spdef: "_maxSpd", sdef: "_maxSpd", spdefense: "_maxSpd",
  };
  const evs = {};
  const specBoosts = () => (spec.boosts = spec.boosts ?? {});
  const addStage = (word, sign, mag) => {
    const v = Math.max(-6, Math.min(6, sign === "-" ? -Number(mag) : Number(mag)));
    if (v !== 0) specBoosts()[STAGE_ALIAS[word]] = v;
  };
  const addAccEva = (word, sign, mag) => {
    const v = Math.max(-6, Math.min(6, sign === "-" ? -Number(mag) : Number(mag)));
    if (v === 0) return;
    if (ACC_EVA_ALIAS[word] === "acc") spec._accStage = v;
    else spec._evaStage = v;
  };
  const takeEv = (word, amount) => {
    const v = Number(amount);
    if (v > 252) throw new Error(`"${word} ${v}" is not an EV: gen 6 caps EVs at 252`);
    evs[EV_ALIAS[word]] = v;
  };
  const setPlus = (sign, mag) => {
    spec._plusBoost = Math.max(-6, Math.min(6, sign === "-" ? -Number(mag) : Number(mag)));
  };

  const atoms = [...s.matchAll(/[^\s\u0001]+/g)].map((m) => ({ t: m[0], a: m.index, b: m.index + m[0].length }));
  const consumed = [];
  const eat = (i, count = 1) => { for (let k = i; k < i + count; k++) consumed.push([atoms[k].a, atoms[k].b]); };
  const gapToNext = (i) => (atoms[i + 1] ? s.slice(atoms[i].b, atoms[i + 1].a) : null);
  const adjacent = (i) => atoms[i + 1] != null && gapToNext(i) != null && !/\u0001/.test(gapToNext(i));
  const isSigned = (t) => /^[+-]\d{1,2}$/.test(t);
  const isNumber = (t) => /^\d{1,3}$/.test(t);

  for (let i = 0; i < atoms.length; i++) {
    const tok = atoms[i].t;

    // level, glued ("l50" / "lv50") or split ("level 50" / "lv 50")
    const lvlGlued = /^l(?:v|evel)?(\d{1,3})$/.exec(tok);
    if (lvlGlued) { spec.level = Math.min(100, Math.max(1, Number(lvlGlued[1]))); eat(i); continue; }
    if ((tok === "level" || tok === "lv" || tok === "l") && adjacent(i) && isNumber(atoms[i + 1].t)) {
      spec.level = Math.min(100, Math.max(1, Number(atoms[i + 1].t))); eat(i, 2); i++; continue;
    }

    // "max atk" / "max spa" / "max def" / "max spd" (HP/speed have no shorthand)
    if (tok === "max" && adjacent(i) && MAX_ALIAS[atoms[i + 1].t]) {
      spec[MAX_ALIAS[atoms[i + 1].t]] = true; eat(i, 2); i++; continue;
    }

    // signed number leader: "+N <stat/acc/eva>" stage, "+N hp" dynamic, or
    // "+N" on a punctuation boundary = dynamic list item
    if (isSigned(tok)) {
      const nxt = atoms[i + 1];
      if (adjacent(i) && nxt && STAGE_ALIAS[nxt.t]) { addStage(nxt.t, tok[0], tok.slice(1)); eat(i, 2); i++; continue; }
      if (adjacent(i) && nxt && ACC_EVA_ALIAS[nxt.t]) { addAccEva(nxt.t, tok[0], tok.slice(1)); eat(i, 2); i++; continue; }
      if (adjacent(i) && nxt && nxt.t === "hp") { setPlus(tok[0], tok.slice(1)); eat(i); continue; }
      if (nxt && /\u0001/.test(gapToNext(i))) { setPlus(tok[0], tok.slice(1)); eat(i); continue; }
      continue; // stray signed number: left for the end-of-clause numeric check
    }

    // stat leader: "<stat> +N" stage or "<stat> N" EV (stat-first canonical)
    if (STAGE_ALIAS[tok]) {
      const nxt = atoms[i + 1];
      if (adjacent(i) && nxt && isSigned(nxt.t)) { addStage(tok, nxt.t[0], nxt.t.slice(1)); eat(i, 2); i++; continue; }
      if (adjacent(i) && nxt && isNumber(nxt.t)) { takeEv(tok, nxt.t); eat(i, 2); i++; continue; }
      continue; // bare stat word: not investment, leave it
    }
    if (tok === "hp") {
      const nxt = atoms[i + 1];
      if (adjacent(i) && nxt && isNumber(nxt.t)) { takeEv("hp", nxt.t); eat(i, 2); i++; continue; }
      continue;
    }
    if (ACC_EVA_ALIAS[tok]) {
      const nxt = atoms[i + 1];
      if (adjacent(i) && nxt && isSigned(nxt.t)) { addAccEva(tok, nxt.t[0], nxt.t.slice(1)); eat(i, 2); i++; continue; }
      continue;
    }

    // unsigned number leader: "N <stat>" EV (digit-first). Numbers that lead
    // nowhere (e.g. a "2" before "spikes") stay for the hazard/word passes.
    if (isNumber(tok)) {
      const nxt = atoms[i + 1];
      if (adjacent(i) && nxt && EV_ALIAS[nxt.t]) { takeEv(nxt.t, tok); eat(i, 2); i++; continue; }
      continue;
    }
  }
  if (consumed.length) {
    const kept = [];
    let last = 0;
    for (const [a, b] of consumed.sort((x, y) => x[0] - y[0])) {
      kept.push(s.slice(last, a));
      last = b;
    }
    s = kept.join("") + s.slice(last);
  }
  if (Object.keys(evs).length) spec.evs = evs;

  // "no item" / "itemless": genuinely no held item (else an inert item is assumed)
  const noneItem = stripMatches(s, String.raw`no\s*item|itemless`);
  s = noneItem.text;
  if (noneItem.hits.length) spec.noItem = true;

  // nature: exact known nature word
  const naturePass = stripMatches(s, String.raw`\b(${NATURE_NAMES.join("|")})\b`);
  s = naturePass.text;
  if (naturePass.hits.length) spec.nature = naturePass.hits[0][1];

  // ability: known ability name (but Desolate Land / Primordial Sea / Delta
  // Stream are primal weather phrases in queries, not the ability here)
  const WEATHER_ABILITIES = new Set(["desolate land", "primordial sea", "delta stream"]);
  const abilityLower = [...ABILITY_NAMES].filter((n) => !WEATHER_ABILITIES.has(n)).sort((a, b) => b.length - a.length).join("|");
  const abilPass = stripMatches(s, String.raw`\b(${abilityLower})\b`);
  s = abilPass.text;
  if (abilPass.hits.length) spec.ability = ABILITY_CANON[ABILITY_NAMES.indexOf(abilPass.hits[0][0])];

  // item: known item name or a `<type> plate` phrase alias (both a plate's own
  // name and its type-first spelling resolve to the same item here)
  const itemPass = stripMatches(s, String.raw`\b(${ITEM_PHRASES.join("|")})\b`);
  s = itemPass.text;
  if (itemPass.hits.length) spec.item = ITEM_ALIAS.get(itemPass.hits[0][0]);

  // item acronyms. LO is context-sensitive: Life Orb on the attacker, Leftovers
  // on the defender. A BARE "plate" (no type word ahead of it) is resolved
  // later from the move's type — a "<type> plate" phrase was already consumed
  // as an item above.
  const ACRO = [
    ["choice band", { item: "Choice Band" }], ["choice specs", { item: "Choice Specs" }],
    ["choice scarf", { item: "Choice Scarf" }], ["banded", { item: "Choice Band" }],
    ["specs", { item: "Choice Specs" }], ["scarf", { item: "Choice Scarf" }],
    ["band", { item: "Choice Band" }], ["cb", { item: "Choice Band" }],
    ["spec", { item: "Choice Specs" }], ["belt", { item: "Expert Belt" }],
    ["sash", { item: "Focus Sash" }],
    ["lo", { item: side === "defender" ? "Leftovers" : "Life Orb" }],
    ["plate", { plate: true }],
  ];
  const acroPass = stripMatches(s, String.raw`\b(${ACRO.map(([w]) => w).sort((a, b) => b.length - a.length).join("|")})\b`);
  s = acroPass.text;
  if (acroPass.hits.length) {
    const phrase = acroPass.hits[0][0].toLowerCase();
    const defn = ACRO.find(([w]) => w === phrase)?.[1];
    if (defn?.item) spec.item = defn.item;
    if (defn?.plate) spec.plate = true;
  }

  // status tokens (longest first so "badly poisoned" beats "poison")
  const STATUS_MAP = [
    ["badly poisoned", "tox"], ["bad poison", "tox"], ["toxic", "tox"],
    ["paralyzed", "par"], ["paralysis", "par"], ["poisoned", "psn"],
    ["asleep", "slp"], ["sleeping", "slp"], ["frozen", "frz"],
    ["burned", "brn"], ["burnt", "brn"], ["poison", "psn"],
    ["burn", "brn"], ["sleep", "slp"], ["freeze", "frz"],
    ["brn", "brn"], ["par", "par"], ["psn", "psn"], ["tox", "tox"],
    ["slp", "slp"], ["frz", "frz"],
  ];
  const statusTokens = STATUS_MAP.map(([w]) => w).sort((a, b) => b.length - a.length).join("|");
  const statusPass = stripMatches(s, String.raw`\b(${statusTokens})\b`);
  s = statusPass.text;
  if (statusPass.hits.length) {
    const code = statusPass.hits[0][0].toLowerCase();
    spec.status = STATUS_MAP.find(([w]) => w === code)?.[1];
  }

  // battle weather tokens (endless/"permanent" sandstorm = sand that never ends)
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
  const weatherTokens = WEATHER_MAP.map(([w]) => w).sort((a, b) => b.length - a.length).join("|");
  const weatherPass = stripMatches(s, String.raw`\b(${weatherTokens})\b`);
  s = weatherPass.text;
  if (weatherPass.hits.length) {
    const phrase = weatherPass.hits[0][0].toLowerCase();
    spec.weather = WEATHER_MAP.find(([w]) => w === phrase)?.[1];
  }
  // explicit "no weather" just clears the weather keywords (none is already the default)
  const clearPass = stripMatches(s, String.raw`no\s*weather|clear\s*weather|clear\s*skies`);
  s = clearPass.text;

  // entry hazards: Stealth Rock ("rock") and Spikes layers 1-3. The count is
  // SPACE-separated in either order — "2 spikes" / "spikes 2" / "spike 1" — or
  // in x-notation — "spikes x2" / "x2 spikes" / "2x spikes" / "×2 spikes" — and
  // the word's own number never matters (a count 1-3 wins). A BARE "spike" is
  // 1 layer, "spikes" is 3. Glued digit forms ("1spike", "spikes2") and the
  // "N layers of …" spelling are NOT recognized (noise). Counts are 1-3 only:
  // a >3 number next to spikes stays unbound and hits the bare-number error.
  // The punctuation sentinel breaks every phrase (comma = hard separator).
  // Same value from several scans collapses (dedupe); different values error.
  const srPass = stripMatches(s, String.raw`\b(?:stealth\s*rock|stealthrock|sr|stealth\s*rocks|rock)\b`);
  s = srPass.text;
  if (srPass.hits.length) spec.stealthRock = true;
  const SPIKE_PHRASES = [
    String.raw`spikes?\s+[123]\s*[x×]`, // "spikes 2x"
    String.raw`spikes?\s+[x×]\s*[123]`, // "spikes x2"
    String.raw`spikes?\s+[123]`,        // "spikes 2"
    String.raw`[123]\s*[x×]\s+spikes?`, // "2x spikes"
    String.raw`[x×]\s*[123]\s+spikes?`, // "x2 spikes"
    String.raw`[123]\s+spikes?`,        // "2 spikes"
  ];
  const numberedSpike = stripMatches(s, String.raw`\b(?:${SPIKE_PHRASES.join("|")})\b`);
  s = numberedSpike.text;
  const claims = numberedSpike.hits.map((m) => Number(m[0].match(/\d+/)[0]));
  const bareSpike = stripMatches(s, String.raw`\bspikes?\b`);
  s = bareSpike.text;
  for (const m of bareSpike.hits) claims.push(m[0].toLowerCase().endsWith("s") ? 3 : 1);
  if (claims.length) {
    const first = claims[0];
    if (claims.some((c) => c !== first)) {
      throw new Error(`conflicting spikes layers: ${[...new Set(claims)].join(" vs ")}`);
    }
    spec.spikes = first;
  }

  // terrain tokens
  const TERRAIN_MAP = [
    ["electric terrain", "electric"], ["grassy terrain", "grassy"],
    ["misty terrain", "misty"], ["psychic terrain", "psychic"],
  ];
  const terrainPass = stripMatches(s, String.raw`\b(${TERRAIN_MAP.map(([w]) => w).sort((a, b) => b.length - a.length).join("|")})\b`);
  s = terrainPass.text;
  if (terrainPass.hits.length) spec.terrain = TERRAIN_MAP.find(([w]) => w === terrainPass.hits[0][0].toLowerCase())?.[1];

  // leftover words = species. dex names are "Venusaur-Mega" while players say
  // "Mega Venusaur", so also try reordered/permuted word orders.
  // The punctuation sentinel's boundary job is done — turn it back into spaces
  // so a phrase like "mr. mime" tokenizes to clean words for the name lookup.
  s = s.replace(/\u0001/g, " ");
  const rest = s.replace(/\s+/g, " ").trim();
  const words = rest.split(" ").filter(Boolean);
  const found = [];
  const tryOrder = (arr) => {
    const n = norm(arr.join(" "));
    const hit = monByName.get(n);
    if (hit) found.push({ name: hit.name, words: arr });
  };
  const permutations = (arr) => {
    if (arr.length > 5) return [arr];
    const out = [];
    const go = (a, k) => {
      if (k === a.length) return out.push([...a]);
      for (let i = k; i < a.length; i++) {
        [a[k], a[i]] = [a[i], a[k]];
        go(a, k + 1);
        [a[k], a[i]] = [a[i], a[k]];
      }
    };
    go([...arr], 0);
    return out;
  };
  tryOrder(words);
  for (const perm of permutations(words)) tryOrder(perm);
  let name = null;
  let ignored = [];
  if (!found.length) {
    const alias = SPECIES_ALIASES.get(norm(words.join(" ")));
    if (alias && monByName.has(norm(alias))) found.push({ name: monByName.get(norm(alias)).name, words });
  }
  if (found.length) {
    const seen = new Set();
    const unique = found.filter((f) => {
      const k = norm(f.name);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // prefer the entry that consumed the most tokens (permutations use all, so
    // rank by dex-name length to disambiguate e.g. Charizard-Mega vs -X)
    unique.sort((a, b) => b.name.length - a.name.length);
    name = unique[0].name;
    const used = new Set(unique[0].words.map((w) => w.toLowerCase()));
    ignored = words.filter((w) => !used.has(w.toLowerCase()));
    if (unique.length > 1) {
      const others = [...seen].filter((n) => n !== norm(name));
      name += ` (${others.map((n) => monByName.get(n).name).join(", ")} also matches)`;
    }
  } else {
    // fallback: junk tokens at either end (unlisted item / megastone)
    const tryResolve = (n) => {
    const hit = monByName.get(norm(n));
    if (hit) return hit.name;
    const alias = SPECIES_ALIASES.get(norm(n));
    return alias && monByName.has(norm(alias)) ? monByName.get(norm(alias)).name : null;
  };
    for (let i = words.length - 1; i >= 1 && !name; i--) {
      name = tryResolve(words.slice(0, i).join(" "));
      if (name) ignored = words.slice(i);
    }
    for (let i = 1; i < words.length && !name; i++) {
      name = tryResolve(words.slice(i).join(" "));
      if (name) ignored = words.slice(0, i);
    }
  }
  if (!name) {
    throw new Error(`could not identify a pokemon in: "${raw}" (leftover: "${rest}")`);
  }
  // "Mega <alias/full name>" (e.g. "Mega Chomp"): the base pokemon resolved
  // above; if it has a Mega forme in the dex, use that instead of the base.
  if (words.some((w) => w.toLowerCase() === "mega") && !name.endsWith("-Mega")) {
    const cands = dexData.pokemon
      .filter((p) => p.name.startsWith(`${name}-Mega`))
      .map((p) => p.name)
      .sort((a, b) => b.length - a.length);
    if (cands.length) {
      name = cands[0];
      ignored = ignored.filter((w) => w.toLowerCase() !== "mega");
    }
  }
  spec.name = name;
  // A digit/signed token no pass claimed is a mistake, not flavor: fail loud
  // and show what WAS understood so the user can fix just the bad part.
  const strayNumbers = (ignored ?? []).filter((t) => /\d/.test(t));
  if (strayNumbers.length) {
    throw new Error(strayNumberError(raw, side, spec, name, strayNumbers));
  }
  if (ignored.length) spec._ignored = ignored.join(" ");
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
 *   1 distinct move → { single }; 2 distinct → { chain: [m0, m1] } in claimed
 *   order (move 1 lands turn 1, move 2 lands turn 2); 0 moves or >2 distinct
 *   → hard error (stops the parse).
 * A comma (or the other punctuation boundaries `.;/\|`) is a HARD LOOKAHEAD
 * STOP: no phrase may span one, so "Shadow, Ball" never reads as Shadow Ball.
 * The marker atom is stepped over, so single-word claims on either side still
 * proceed — "EQ, Outrage" / "eq,outrage" still claim both moves.
 */
function claimMoves(text) {
  const raw = String(text).toLowerCase();
  // Mark punctuation boundaries so no phrase lookahead ever crosses them.
  const marked = raw.replace(/[,.;/\\|]+/g, " \u0001 ");
  const words = marked.replace(/[^a-z0-9\u0001 ]+/g, " ").split(/\s+/).filter(Boolean);
  const claimed = [];
  for (let i = 0; i < words.length; i++) {
    let name = null;
    let len = 0;
    for (let k = Math.min(3, words.length - i); k >= 1 && !name; k--) {
      const slice = words.slice(i, i + k);
      if (slice.includes("\u0001")) continue;
      const hit = resolveMoveName(slice.join(" "));
      if (hit) { name = hit; len = k; }
    }
    if (name) { claimed.push(name); i += len - 1; }
  }
  const seen = new Set();
  const distinct = claimed.filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
  if (distinct.length === 0) throw new Error(`could not identify a move in: "${text}"`);
  if (distinct.length > 2) throw new Error(`too many moves in a combo — capped at 2 ("${text}")`);
  return distinct.length === 2 ? { chain: distinct } : { single: distinct[0] };
}

/** Parse "<atk> uses <move> vs <def>"; "turn by turn" asks for the per-turn table. */
function parseQuery(line) {
  const normed = hyphenToSpace(line);
  const flag = /\bturn\s*by\s*turn\b/i.test(normed);
  const clean = normed.replace(/\bturn\s*by\s*turn\b/gi, " ");
  const m = /^(.+?)\s+uses\s+(.+?)\s+vs\s+(.+)$/is.exec(clean.trim());
  if (!m) throw new Error('query must look like: "Garchomp @ Life Orb Jolly 252 Atk uses Earthquake vs Heatran 252 HP"');
  const out = mergeArena({
    attacker: parseCombatant(m[1], "attacker"),
    move: m[2].trim(),
    defender: parseCombatant(m[3], "defender"),
    showTurns: flag,
  });
  out._query = line.trim();
  return out;
}

export {
  norm, hyphenToSpace, chart, natureByName, moveByName, monByName,
  resolveMoveName, claimMoves, PLATE_BY_TYPE,
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
    const mc = mergeArena({
      attacker: parseCombatant(args[0], "attacker"),
      move: args.slice(1, args.length - 1).join(" "),
      defender: parseCombatant(args[args.length - 1], "defender"),
    });
    mc._query = args[0] + " uses " + args.slice(1, args.length - 1).join(" ") + " vs " + args[args.length - 1];
    writeSpec(mc);
  } else {
    console.error(USAGE);
    process.exit(1);
  }
}
