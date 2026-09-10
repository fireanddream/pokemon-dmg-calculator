// Recognition-echo regression checks: assert the shared renderer
// (scripts/echo.mjs) lays out the echo + class ruler exactly as agreed in
// DESIGN-RECORDS.md "Recognition echo" — labels start at their word's column and keep >= 1 blank column
// between label texts (top-line spacing widens, never drifts a label).
//   npm run verify:echo
import { renderEcho } from "./echo.mjs";

const CASES = [
  {
    name: "demo (item + widen + multi-word ev; shared tokenizer drops @)",
    line: "Garchomp @ Life Orb Jolly 252 Atk Blitz vs Heatran",
    spans: [
      { atoms: [0, 0], label: "species" },
      { atoms: [1, 2], label: "item" },
      { atoms: [3, 3], label: "nature" },
      { atoms: [4, 5], label: "ev:atk" },
      { atoms: [6, 6], label: "move" },
      { atoms: [8, 8], label: "species" },
    ],
    expected: [
      "Garchomp Life Orb Jolly  252 Atk Blitz vs Heatran",
      "species  item     nature ev:atk  move     species",
    ],
  },
  {
    name: "hyphen rule shows spaced words (word-exact display)",
    line: "Garchomp Life-Orb Jolly 252 Atk Blitz vs Heatran",
    spans: [
      { atoms: [0, 0], label: "species" },
      { atoms: [1, 2], label: "item" },
      { atoms: [3, 3], label: "nature" },
      { atoms: [4, 5], label: "ev:atk" },
      { atoms: [6, 6], label: "move" },
      { atoms: [8, 8], label: "species" },
    ],
    expected: [
      "Garchomp Life Orb Jolly  252 Atk Blitz vs Heatran",
      "species  item     nature ev:atk  move     species",
    ],
  },
  {
    name: "junk token stays ??? and still aligns",
    line: "Garchomp 252 Atk Blitz frie vs Heatran",
    spans: [
      { atoms: [0, 0], label: "species" },
      { atoms: [1, 2], label: "ev:atk" },
      { atoms: [3, 3], label: "move" },
      { atoms: [4, 4], label: "???" },
      { atoms: [6, 6], label: "species" },
    ],
    expected: [
      "Garchomp 252 Atk Blitz frie vs Heatran",
      "species  ev:atk  move  ???     species",
    ],
  },
  {
    name: "single spaces untouched when labels fit",
    line: "Garchomp Blitz vs Heatran",
    spans: [
      { atoms: [0, 0], label: "species" },
      { atoms: [1, 1], label: "move" },
      { atoms: [3, 3], label: "species" },
    ],
    expected: [
      "Garchomp Blitz vs Heatran",
      "species  move     species",
    ],
  },
  {
    name: "free-order mega + multi-word item/move spans",
    line: "Mega Garchomp Jolly 252 Atk Life Orb Dragon Claw vs Heatran",
    spans: [
      { atoms: [0, 1], label: "species" },
      { atoms: [2, 2], label: "nature" },
      { atoms: [3, 4], label: "ev:atk" },
      { atoms: [5, 6], label: "item" },
      { atoms: [7, 8], label: "move" },
      { atoms: [10, 10], label: "species" },
    ],
    expected: [
      "Mega Garchomp Jolly  252 Atk Life Orb Dragon Claw vs Heatran",
      "species       nature ev:atk  item     move           species",
    ],
  },
  {
    name: "wrap at width: unit stays intact, ruler follows its words",
    line: "Max SpA 252 Timid Life Orb Gengar Shadow Ball Sludge Wave vs Calm Mega Blissey",
    width: 60,
    spans: [
      { atoms: [0, 1], label: "ev:spa" },
      { atoms: [2, 2], label: "???" },
      { atoms: [3, 3], label: "nature" },
      { atoms: [4, 5], label: "item" },
      { atoms: [6, 6], label: "species" },
      { atoms: [7, 8], label: "move" },
      { atoms: [9, 10], label: "move" },
      { atoms: [12, 12], label: "nature" },
      { atoms: [13, 14], label: "species" },
    ],
    expected: [
      "Max SpA 252 Timid  Life Orb Gengar  Shadow Ball Sludge Wave",
      "ev:spa  ??? nature item     species move        move",
      "vs Calm   Mega Blissey",
      "   nature species",
    ],
  },
  {
    name: "wrap disabled (width 0): stays two lines even when long",
    line: "Max SpA 252 Timid Life Orb Gengar Shadow Ball Sludge Wave vs Calm Mega Blissey",
    width: 0,
    spans: [
      { atoms: [0, 1], label: "ev:spa" },
      { atoms: [2, 2], label: "???" },
      { atoms: [3, 3], label: "nature" },
      { atoms: [4, 5], label: "item" },
      { atoms: [6, 6], label: "species" },
      { atoms: [7, 8], label: "move" },
      { atoms: [9, 10], label: "move" },
      { atoms: [12, 12], label: "nature" },
      { atoms: [13, 14], label: "species" },
    ],
    expected: [
      "Max SpA 252 Timid  Life Orb Gengar  Shadow Ball Sludge Wave vs Calm   Mega Blissey",
      "ev:spa  ??? nature item     species move        move           nature species",
    ],
  },
];

let pass = 0;
const failures = [];
console.log("recognition echo");
for (const c of CASES) {
  const got = renderEcho(c.line, c.spans, c.width ?? 0).split("\n");
  const ok = got.length === c.expected.length && got.every((ln, i) => ln === c.expected[i]);
  if (ok) pass++;
  const marker = ok ? "PASS" : "FAIL";
  console.log(`  ${marker}  ${c.name}`);
  if (!ok) {
    failures.push(c.name);
    console.log(`       wanted:`);
    for (const ln of c.expected) console.log(`       [${ln}]`);
    console.log(`       got:`);
    for (const ln of got) console.log(`       [${ln}]`);
  }
}

console.log("");
console.log(`${pass}/${CASES.length} echo checks passed`);
if (failures.length > 0) {
  console.log(`FAIL: ${failures.join("; ")}`);
  process.exit(1);
}
