// Help-topic regression checks: the three CLI topics (-help / -tokens /
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
check("-tokens maps to tokens", isHelpCommand("-tokens") === "tokens");
check("-limits maps to limits", isHelpCommand("-limits") === "limits");
check("case-insensitive", isHelpCommand("-HELP") === "help");
check("accepts a double dash", isHelpCommand("--tokens") === "tokens");
check("trims surrounding space", isHelpCommand("  -limits  ") === "limits");
check("rejects a query", isHelpCommand("Garchomp EQ vs Heatran") === null);
check("rejects bare help", isHelpCommand("help") === null);
check("rejects --width", isHelpCommand("--width") === null);
check("rejects a near-miss", isHelpCommand("-limit") === null);

// --- rendering ---
const help = helpTopic("help");
const tokens = helpTopic("tokens");
const limits = helpTopic("limits");
check("help renders", help.length > 0);
check("tokens renders", tokens.length > 0);
check("limits renders", limits.length > 0);
check("topics end in a newline", help.endsWith("\n") && tokens.endsWith("\n") && limits.endsWith("\n"));

check("help names all three commands", ["-help", "-tokens", "-limits"].every((c) => help.includes(c)));
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

for (const label of ["Species aliases", "Move acronyms", "Item acronyms", "Weather setters", "EV / nature shorthand"]) {
  check(`tokens lists "${label}"`, tokens.includes(label));
}
check(
  "tokens credits both source files",
  tokens.includes("aliases.md") && tokens.includes("auto-fill-defaults.md"),
);
check("tokens draws a live example", /rotom -> Rotom/.test(tokens));
check("tokens shows the plate alias phrase", tokens.includes("Fairy plate -> Pixie Plate"));
check("tokens shows the full terrain word", tokens.includes("e terrain -> electric terrain"));
check("tokens shows the full aura word", tokens.includes("Fairy Aura -> Fairy Aura"));
check("tokens has no raw markdown", !/\*\*|`/.test(tokens));
check("limits has no raw markdown", !/\*\*|`/.test(limits));

for (const label of ["Abilities", "Items", "Moves", "Curated-out variant formes"]) {
  check(`limits groups "${label}"`, limits.includes(label));
}
check("limits lists a known gap", limits.includes("Metronome") && limits.includes("Analytic"));
check("limits drops `done` rows", !limits.includes("Focus Sash") && !limits.includes("Skill Link"));
check("limits points at the full inventory", limits.includes("DESIGN-RECORDS.md"));

// --- wrapping via the shared rule ---
for (const width of [40, 100]) {
  for (const [name, text] of [["help", helpTopic("help", { width })], ["tokens", helpTopic("tokens", { width })], ["limits", helpTopic("limits", { width })]]) {
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
