// -search regression checks: pokemon typing lookup (exact set, mono vs dual,
// kept variants in / curated-out variants out, sorted, comma-separated) and
// attack-move lookup (type + exact power + category aliases, attack-only), plus
// command recognition and the usage fallback.
//   npm run verify:lookup
import { findPokemon, findMoves, findStats, formatStats, benchmarkSpeed, isSearchCommand, searchCommand } from "./lookup.mjs";
import { dexData, movesData, byName } from "./data.mjs";
import { reportChecks } from "./verify-util.mjs";

const POKEMON = dexData.pokemon;
const MOVES = movesData.moves;
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

console.log("\n-search stats");

// --- layout: header / blank / six rows / blank / Lv50 Speed ---
// (Garchomp 108/130/95/80/85/102; Speed 102 -> 122 / 154 / 169)
check("stats with no name prints usage", /usage:/.test(searchCommand(["stats"])));
const garchomp = searchCommand(["stats", "garchomp"]);
const gLines = garchomp.split("\n");
check("stats header is name/typing/tier", gLines[0] === "Garchomp Dragon Ground OU");
check("stats blank line after the header", gLines[1] === "");
check("stats HP row: value right-3, 22 blocks", /^ HP 108 x{22}$/m.test(garchomp));
check("stats ATK row: 26 blocks", /^ATK 130 x{26}$/m.test(garchomp));
check("stats DEF row: 19 blocks", /^DEF  95 x{19}$/m.test(garchomp));
check("stats SPA row: 16 blocks", /^SPA  80 x{16}$/m.test(garchomp));
check("stats SPD row: 17 blocks", /^SPD  85 x{17}$/m.test(garchomp));
check("stats SPE row: 21 blocks", /^SPE 102 x{21}$/m.test(garchomp));
check("stats blank line after the six rows", gLines[8] === "");
check(
  "stats ends with the Lv50 Speed line",
  gLines[9] === "Lv50 Speed: 0 EV 122  ·  252 EV neutral 154  ·  252 EV boosted 169",
);
check("stats output ends in a newline", garchomp.endsWith("\n"));
const blissey = searchCommand(["stats", "blissey"]);
check("stats uncapped at max (HP 255 -> 51 blocks)", /^ HP 255 x{51}$/m.test(blissey));
check(
  "stats Lv50 Speed tracks the base stat (Blissey 55 -> 75 / 107 / 117)",
  /^Lv50 Speed: 0 EV 75  ·  252 EV neutral 107  ·  252 EV boosted 117$/m.test(blissey),
);

// --- Lv50 Speed formula pinned to myteam/speed.tsv values ---
check("speed 102 no EV = 122", benchmarkSpeed(102, 0) === 122);
check("speed 102 neutral = 154", benchmarkSpeed(102, 252) === 154);
check("speed 102 boosted = 169", benchmarkSpeed(102, 252, true) === 169);
check("speed 61 no EV = 81", benchmarkSpeed(61, 0) === 81);
check("speed 70 neutral = 122", benchmarkSpeed(70, 252) === 122);
check("speed 70 boosted = 134", benchmarkSpeed(70, 252, true) === 134);
check("speed 130 boosted = 200", benchmarkSpeed(130, 252, true) === 200);
check("speed 150 neutral = 202", benchmarkSpeed(150, 252) === 202);
check("speed 150 boosted = 222", benchmarkSpeed(150, 252, true) === 222);

// --- folded names (spaces / hyphens / punctuation) ---
check("stats folds Mr. Mime across words", searchCommand(["stats", "Mr.", "Mime"]).startsWith("Mr. Mime"));
check("stats folds mrmime", searchCommand(["stats", "mrmime"]).startsWith("Mr. Mime"));
check("stats folds a hyphenated forme", searchCommand(["stats", "Rotom-Wash"]).startsWith("Rotom-Wash"));
check("stats casing is ignored", eq(searchCommand(["stats", "GARCHOMP"]), garchomp));

// --- helpers / misses ---
check("findStats resolves a folded name", findStats("garchomp")?.name === "Garchomp");
check("findStats misses cleanly", findStats("definitely-not-a-mon") === null);
check("formatStats returns the block for a miss-free entry", formatStats(findStats("Garchomp")).startsWith("Garchomp"));
check("stats unknown name prints none found", /none found/.test(searchCommand(["stats", "definitely-not-a-mon"])));

reportChecks("lookup", pass, failures, {
  onFail: (fs) => console.log(`FAIL: ${fs.join("; ")}`),
});
