// Help-topic regression checks: the three CLI topics (-help / -grammar /
// -limits) render, recognize their commands, project live from their source
// docs (aliases.md, auto-fill-defaults.md, DESIGN-RECORDS.md §10), and wrap
// through the shared `wrapBlock` rule at any width.
//   npm run verify:help
import { helpTopic, isHelpCommand } from "./help.mjs";

let pass = 0;
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`);
  if (ok) pass++;
  else failures.push(name);
};

console.log("help topics");

// --- command recognition ---
check("-help maps to help", isHelpCommand("-help") === "help");
check("-grammar maps to grammar", isHelpCommand("-grammar") === "grammar");
check("-limits maps to limits", isHelpCommand("-limits") === "limits");
check("case-insensitive", isHelpCommand("-HELP") === "help");
check("accepts a double dash", isHelpCommand("--grammar") === "grammar");
check("trims surrounding space", isHelpCommand("  -limits  ") === "limits");
check("rejects a query", isHelpCommand("Garchomp EQ vs Heatran") === null);
check("rejects bare help", isHelpCommand("help") === null);
check("rejects --width", isHelpCommand("--width") === null);
check("rejects a near-miss", isHelpCommand("-limit") === null);

// --- rendering ---
const help = helpTopic("help");
const grammar = helpTopic("grammar");
const limits = helpTopic("limits");
check("help renders", help.length > 0);
check("grammar renders", grammar.length > 0);
check("limits renders", limits.length > 0);
check("topics end in a newline", help.endsWith("\n") && grammar.endsWith("\n") && limits.endsWith("\n"));

check("help names all three commands", ["-help", "-grammar", "-limits"].every((c) => help.includes(c)));
check("help shows a worked query", help.includes("vs"));
check("help stresses any token order", /ANY order/.test(help));
check(
  "help shows an order-independent example",
  help.includes("Earthquake Life Orb 252 Atk Jolly Garchomp vs 252 HP Heatran"),
);
check(
  "help points at both editable docs",
  help.includes("aliases.md") && help.includes("auto-fill-defaults.md"),
);
check("help shows the assumed defaults", help.includes("Assumed when you leave it out:"));
check("help shows the held-item default", help.includes("has item, no effect"));
check("help shows the ability default example", help.includes("Scizor -> Technician"));
check("help shows an engine expansion", help.includes("max atk -> 252 Atk EVs + Adamant"));
check("help shows the arena ability example", help.includes("Drizzle -> Rain"));

for (const label of ["Grammar", "LEXEMES", "Species", "Move", "Item", "Nature", "Ability", "Status", "Weather", "Terrain", "Hazard"]) {
  check(`grammar lists "${label}"`, grammar.includes(label));
}
check(
  "grammar credits both source files",
  grammar.includes("aliases.md") && grammar.includes("auto-fill-defaults.md"),
);
check("grammar draws a hand-made species example", grammar.includes("chomp -> Garchomp"));
check("grammar draws a hand-made move example", grammar.includes("eq -> Earthquake"));
check("grammar notes hand-made examples", grammar.includes("hand-made"));
check("grammar shows the plate phrase", grammar.includes('"fairy plate" = Pixie Plate'));
check("grammar shows the short terrain word", grammar.includes("e terrain -> Electric Terrain"));
check("grammar shows the stealth rock example", grammar.includes("rock -> Stealth Rock"));
check("grammar keeps the level forms", grammar.includes("lv100 / lv 100 / level 100"));
check("grammar has no raw markdown", !/\*\*|`/.test(grammar));
check("grammar does not mention @", !grammar.includes("@"));
check("limits has no raw markdown", !/\*\*|`/.test(limits));

for (const label of ["Abilities", "Items", "Moves", "Curated-out variant formes"]) {
  check(`limits groups "${label}"`, limits.includes(label));
}
check("limits lists a known gap", limits.includes("Metronome") && limits.includes("Analytic"));
check("limits drops `done` rows", !limits.includes("Focus Sash") && !limits.includes("Skill Link"));
check("limits points at the full inventory", limits.includes("DESIGN-RECORDS.md"));

// --- wrapping via the shared rule ---
for (const width of [40, 100]) {
  for (const [name, text] of [["help", helpTopic("help", { width })], ["grammar", helpTopic("grammar", { width })], ["limits", helpTopic("limits", { width })]]) {
    const over = text.split("\n").filter((ln) => ln.length > width);
    check(`${name} wraps at ${width}`, over.length === 0, over[0] ?? "");
  }
}

console.log("");
console.log(`${pass}/${pass + failures.length} help checks passed`);
if (failures.length > 0) {
  console.log(`FAIL: ${failures.join("; ")}`);
  process.exit(1);
}
