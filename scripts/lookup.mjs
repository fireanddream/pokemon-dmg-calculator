// lookup.mjs — `-search` CLI lookups (the damage.mjs command line only).
//
//   -search pokemon <type> [type2]        mons whose FULL typing is exactly
//                                         those types (1 or 2, any order)
//   -search move <type> [power] [phys|special]
//                                         attack moves of <type>; exact power
//                                         and category optional, any order
//
// Data is the Smogon XY dex this repo already ships. `pokemon` reads the
// curated `data/xy-pokemon.json` AS THE CALCULAOR SEES IT: one entry per
// species, the 31 curated-out variant formes (Arceus / Genesect formes, the
// dropped in-battle Zen forme, Pikachu cosplay, Basculin-Blue-Striped,
// Keldeo-Resolute, Vivillon patterns) are already absent — see
// DESIGN-RECORDS.md "Curated-out variant formes". Kept variants (megas,
// Primal, Deoxys, Rotom, Giratina-Origin, the Therians, Kyurem-B/W, …) ship as
// flat entries with their own types, so they are returned too. `move` reads
// `data/moves-xy.json` and keeps only attacking moves (category Physical /
// Special; the data's status category is spelled "Non-Damaging").
//
// Output is names only, comma-separated, sorted by name; an empty result is
// the literal "none found". Everything here is CLI-only: it never touches the
// damage-query converter / route / card path.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "..", "data");

const POKEMON = JSON.parse(readFileSync(path.join(DATA_DIR, "xy-pokemon.json"), "utf8")).pokemon;
const MOVES = Object.values(
  JSON.parse(readFileSync(path.join(DATA_DIR, "moves-xy.json"), "utf8")).moves,
);
const TYPES = JSON.parse(readFileSync(path.join(DATA_DIR, "types-xy.json"), "utf8")).types;

const TYPE_NAMES = new Set(TYPES.map((t) => t.name.toLowerCase()));
const ATTACK_CATEGORIES = new Set(["Physical", "Special"]);

/** `physical` / `special` plus the accepted short forms; keyed lower-case. */
const CATEGORY_ALIASES = new Map([
  ["physical", "Physical"],
  ["phy", "Physical"],
  ["atk", "Physical"],
  ["special", "Special"],
  ["spe", "Special"],
  ["spa", "Special"],
]);

/** Deterministic name sort (all shipped names start uppercase). */
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const normType = (s) => String(s).trim().toLowerCase();
const isTypeName = (s) => TYPE_NAMES.has(normType(s));

/** Case-insensitive exact-set match: order and casing do not matter, and a
 *  mono query never matches a dual typing. Unknown type names never match. */
export function findPokemon(types) {
  const wanted = types.map(normType);
  if (wanted.length === 0 || !wanted.every((t) => TYPE_NAMES.has(t))) return [];
  const key = [...new Set(wanted)].sort().join("|");
  return POKEMON
    .filter((p) => [...p.types].map(normType).sort().join("|") === key)
    .map((p) => p.name)
    .sort(byName);
}

/** Attack moves of an exact type, optionally narrowed by exact power and/or
 *  category. `type` must be a full type name; non-attacking moves (category
 *  "Non-Damaging") are never returned. */
export function findMoves({ type, power, category } = {}) {
  if (!isTypeName(type)) return [];
  const wantType = normType(type);
  return MOVES
    .filter((m) => normType(m.type) === wantType && ATTACK_CATEGORIES.has(m.category))
    .filter((m) => category === undefined || m.category === category)
    .filter((m) => power === undefined || m.power === power)
    .map((m) => m.name)
    .sort(byName);
}

const parsePower = (tok) => {
  if (!/^\d+$/.test(tok)) return null;
  return Number(tok);
};

const parseCategory = (tok) => CATEGORY_ALIASES.get(normType(tok)) ?? null;

const format = (names) => (names.length ? names.join(", ") : "none found") + "\n";

const USAGE = `usage:
  -search pokemon <type> [type2]
      pokemon whose FULL typing is exactly those types (1 or 2, any order;
      a mono type returns no dual-types). Full type names only, no aliases,
      e.g. "dragon ground".
  -search move <type> [power] [phys|special]
      attacking moves of <type>. Power (exact) and category are optional and
      may appear in either order. category: physical / special, or the short
      forms phy / spe / atk / spa.
  results are names only, comma-separated and sorted by name; an empty result
  prints "none found".`;

/** Search subcommands: `pokemon` and `move` (case-insensitive). */
export function isSearchCommand(token) {
  return /^--?search$/i.test(String(token).trim());
}

/** Run a `-search` command from its argument words (everything after -search)
 *  and return the block to print, newline-terminated. */
export function searchCommand(args, { width = 100 } = {}) {
  void width; // results are emitted as one unwrapped line (copy/paste friendly)
  const words = (args ?? []).map((a) => String(a).trim()).filter((a) => a !== "");
  if (words.length === 0) return USAGE + "\n";

  const sub = words[0].toLowerCase();
  const rest = words.slice(1);

  if (sub === "pokemon") {
    if (rest.length === 0) return USAGE + "\n";
    return format(findPokemon(rest));
  }

  if (sub === "move") {
    if (rest.length === 0) return USAGE + "\n";
    let type = null;
    let power;
    let category;
    for (const tok of rest) {
      if (isTypeName(tok) && type === null) type = tok;
      else if (parseCategory(tok) !== null && category === undefined) category = parseCategory(tok);
      else if (parsePower(tok) !== null && power === undefined) power = parsePower(tok);
      else return format([]); // unknown / duplicate / "attack" / "special attack"
    }
    if (type === null) return format([]);
    return format(findMoves({ type, power, category }));
  }

  return USAGE + "\n";
}
