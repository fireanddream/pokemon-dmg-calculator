// -search regression checks: pokemon typing lookup (exact set, mono vs dual,
// kept variants in / curated-out variants out, sorted, comma-separated) and
// attack-move lookup (type + exact power + category aliases, attack-only), plus
// command recognition and the usage fallback.
//   npm run verify:lookup
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findPokemon, findMoves, isSearchCommand, searchCommand } from "./lookup.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, "..", "data");
const POKEMON = JSON.parse(readFileSync(path.join(DATA, "xy-pokemon.json"), "utf8")).pokemon;
const MOVES = Object.values(
  JSON.parse(readFileSync(path.join(DATA, "moves-xy.json"), "utf8")).moves,
);
const monByName = new Map(POKEMON.map((p) => [p.name, p]));
const moveByName = new Map(MOVES.map((m) => [m.name, m]));

let pass = 0;
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`);
  if (ok) pass++;
  else failures.push(name);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sorted = (arr) => [...arr].sort(byName);

console.log("-search command");

// --- recognition ---
check("isSearchCommand -search", isSearchCommand("-search") === true);
check("isSearchCommand --search", isSearchCommand("--search") === true);
check("isSearchCommand case-insensitive", isSearchCommand("-SEARCH") === true);
check("isSearchCommand accepts --", isSearchCommand("--search") === true);
check("isSearchCommand rejects --width", isSearchCommand("--width") === false);
check("isSearchCommand rejects a query", isSearchCommand("Garchomp EQ vs Heatran") === false);
check("isSearchCommand rejects a near-miss", isSearchCommand("-searchx") === false);

// --- usage fallback ---
check("bare -search prints usage", /usage:/.test(searchCommand([])));
check("unknown subcommand prints usage", /usage:/.test(searchCommand(["bogus"])));
check("pokemon with no type prints usage", /usage:/.test(searchCommand(["pokemon"])));
check("move with no type prints usage", /usage:/.test(searchCommand(["move"])));

console.log("\n-search pokemon");

// --- mono never returns dual typings ---
const fire = findPokemon(["fire"]);
check("mono fire is non-empty", fire.length > 0);
check(
  "mono fire is Fire-only (no duals)",
  fire.every((n) => monByName.get(n).types.length === 1 && monByName.get(n).types[0] === "Fire"),
);
check("mono fire excludes a Fire/X dual", !fire.includes("Charizard"));

// --- dual: exact set, order-insensitive ---
const dg1 = findPokemon(["dragon", "ground"]);
const dg2 = findPokemon(["ground", "dragon"]);
check("dual dragon/ground is non-empty", dg1.length > 0);
check("dual order does not matter", eq(dg1, dg2));
check(
  "dual returns exactly the Dragon/Ground set",
  dg1.every((n) => eq([...monByName.get(n).types].sort(), ["Dragon", "Ground"])),
);
check("dual includes a known Dragon/Ground mon", dg1.includes("Garchomp"));

// --- kept variants in, curated-out variants out ---
const fd = findPokemon(["fire", "dragon"]);
check("dual includes the kept Dragon/Fire mega variant", fd.includes("Charizard-Mega-X"));
const ff = findPokemon(["fire", "flying"]);
check("dual excludes the other mega variant of a split forme", !ff.includes("Charizard-Mega-X"));
check("dual includes the matching mega variant", ff.includes("Charizard-Mega-Y"));
const dropped = [
  "Darmanitan-Zen",
  "Arceus-Fire",
  "Genesect-Burn",
  "Pikachu-Belle",
  "Basculin-Blue-Striped",
  "Keldeo-Resolute",
  "Vivillon-Fancy",
  "Vivillon-Pokeball",
];
check("curated-out variants never appear", dropped.every((n) => !monByName.has(n)));

// --- sorting / format / empty ---
check("pokemon results sort by name", eq(fire, sorted(fire)));
const fireLine = searchCommand(["pokemon", "fire"]);
check("pokemon output is names only, comma-separated", fireLine.trim() === fire.join(", "));
check("pokemon output ends in a newline", fireLine.endsWith("\n"));
check("pokemon output is one line", fireLine.split("\n").filter((l) => l !== "").length === 1);
check("unknown type prints none found", /none found/.test(searchCommand(["pokemon", "bogus"])));
check("no exact match prints none found", /none found/.test(searchCommand(["pokemon", "fire", "water", "grass"])));

console.log("\n-search move");

// --- attack-only ---
const fighting = findMoves({ type: "fighting" });
check("move fighting is non-empty", fighting.length > 0);
check(
  "move returns only attacking moves of the type",
  fighting.every((n) => {
    const m = moveByName.get(n);
    return m.type === "Fighting" && (m.category === "Physical" || m.category === "Special");
  }),
);
const normal = findMoves({ type: "normal" });
const statusNormal = MOVES.filter((m) => m.type === "Normal" && m.category === "Non-Damaging").map((m) => m.name);
check("move excludes Non-Damaging moves", statusNormal.length > 0 && statusNormal.every((n) => !normal.includes(n)));

// --- exact power ---
const fire80 = findMoves({ type: "fire", power: 80 });
check("exact power is non-empty", fire80.length > 0);
check("exact power matches precisely", fire80.every((n) => moveByName.get(n).power === 80));
check("non-matching power prints none found", /none found/.test(searchCommand(["move", "fire", "9999"])));

// --- category aliases ---
check("atk alias = physical", eq(findMoves({ type: "fire", category: "atk" }), findMoves({ type: "fire", category: "physical" })));
check("phy alias = physical", eq(findMoves({ type: "fire", category: "phy" }), findMoves({ type: "fire", category: "physical" })));
check("spa alias = special", eq(findMoves({ type: "fire", category: "spa" }), findMoves({ type: "fire", category: "special" })));
check("spe alias = special", eq(findMoves({ type: "fire", category: "spe" }), findMoves({ type: "fire", category: "special" })));
check("category narrows the result", findMoves({ type: "fire", category: "physical" }).length < findMoves({ type: "fire" }).length);

// --- order independence / rejection ---
check(
  "power and type are order-independent",
  eq(searchCommand(["move", "80", "fighting"]), searchCommand(["move", "fighting", "80"])),
);
check(
  "category and type are order-independent",
  eq(searchCommand(["move", "fighting", "special"]), searchCommand(["move", "special", "fighting"])),
);
check("word attack is rejected", /none found/.test(searchCommand(["move", "fighting", "attack"])));
check("special attack is rejected", /none found/.test(searchCommand(["move", "fighting", "special", "attack"])));
check("unknown move type prints none found", /none found/.test(searchCommand(["move", "bogus"])));

// --- sorting / format ---
check("move results sort by name", eq(fighting, sorted(fighting)));
const moveLine = searchCommand(["move", "fighting", "physical"]);
check(
  "move output is names only, comma-separated",
  moveLine.trim() === findMoves({ type: "fighting", category: "Physical" }).join(", "),
);
check("move output ends in a newline", moveLine.endsWith("\n"));
check("move output is one line", moveLine.split("\n").filter((l) => l !== "").length === 1);

console.log("");
console.log(`${pass}/${pass + failures.length} lookup checks passed`);
if (failures.length > 0) {
  console.log(`FAIL: ${failures.join("; ")}`);
  process.exit(1);
}
