// data.mjs — the ONE DIST-FREE loader for the generated dex datasets and the
// norm-folded name lookup maps shared by the front stages. Pure data: no alias
// parsing, no warnings (those stay with their owning module), and no `dist/`
// import (the built type chart lives in typechart.mjs) — so a stage (or a
// lightweight CLI like lookup.mjs) can import the data without a build.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./paths.mjs";

export { DATA_DIR };

const readJson = async (file) =>
  JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8"));

export const dexData = await readJson("xy-pokemon.json");
export const movesData = await readJson("moves-xy.json");
export const naturesData = await readJson("natures-xy.json");
export const typesData = await readJson("types-xy.json");

// norm() folds punctuation and hyphens for GLUED LOOKUPS, so a typed
// "Mr. Mime" ("mr. mime"), "Mr Mime", or "mrmime" all fold to the same lookup
// key (species claims match on it; a `.` is a hard boundary and splits the
// claim because tokenize marks it). The dex canon keys themselves are
// hyphenated ("Rotom-Wash", "Venusaur-Mega"), so norm() keeps folding hyphens
// for lookups regardless of the master hyphen rule.
export const norm = (s) => s.toLowerCase().replace(/[\s',.;/\\|-]/g, "");

export const natureByName = new Map(naturesData.natures.map((n) => [n.name.toLowerCase(), n]));
export const moveByName = new Map(movesData.moves.map((m) => [norm(m.name), m]));
export const monByName = new Map(dexData.pokemon.map((p) => [norm(p.name), p]));

/** Deterministic name sort shared by the lookup CLI and the verify suites (all
 *  shipped names start uppercase, so a plain code-unit compare is stable). */
export const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
