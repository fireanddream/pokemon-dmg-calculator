// damage.mjs — card-printing CLI (compat entry point).
//
// The FRONT is now two stages: input-converter.mjs extracts the user's words
// into the spec JSON (no defaults), then fill.mjs applies auto-fill-defaults.md
// and resolves every name to its record. This file only GLUES the staged
// pipeline together for interactive / one-shot use:
// front (input-converter -> fill) -> calc (calc.mjs) -> render (output.mjs).
//
//   node scripts/damage.mjs "<attacker side ...> vs <defender side ...>"   card
//   node scripts/damage.mjs "<query>" --resolved           emits the calc-input
//       JSON (identical to the converter->fill chain output) for the chain:
//       damage --resolved | calc - | output -   (or input-converter | fill | calc | output)
//   node scripts/damage.mjs <matchup.json>                 spec-dict JSON file
//   node scripts/damage.mjs                                interactive prompt
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTypeChart } from "../dist/index.js";
import { calcSingle, calcCombo } from "./calc.mjs";
import { render } from "./output.mjs";
import { parseQuery } from "./input-converter.mjs";
import { resolveMatchup } from "./fill.mjs";

/** Line -> resolved calc-input: converter (extract) then fill (defaults+resolve). */
function resolveQuery(line) {
  return resolveMatchup(parseQuery(line));
}

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "..", "data");

const typesData = JSON.parse(await readFile(path.join(DATA_DIR, "types-xy.json"), "utf8"));
const chart = buildTypeChart(typesData.types);

/** Calculate + render an ALREADY-RESOLVED calc input (from fill.mjs). */
function runResolved(input) {
  return input.kind === "combo"
    ? render(calcCombo({ ...input, chart }))
    : render(calcSingle({ ...input, chart }));
}

/** A spec-dict matchup JSON file is still RAW: resolve it via fill.mjs first. */
function runMatchup(matchup) {
  return runResolved(resolveMatchup(matchup));
}

function emitResolvedJson(matchup) {
  return JSON.stringify(resolveMatchup(matchup), null, 2) + "\n";
}

// --- entry points ---
const USAGE = `usage:
  node scripts/damage.mjs <matchup.json>
  node scripts/damage.mjs "<attacker side ...> vs <defender side ...>"
  node scripts/damage.mjs "<atk>" "<move>" "<def>"
  (no args)           interactive prompt
  add --resolved to any query to emit the resolved calc-input JSON instead of
  the card (feed it to: node scripts/calc.mjs | node scripts/output.mjs)

  specs: "Species [@ Item] [Nature] [N Stat EVs] [Ability] [L50]"`;

function repl() {
  console.log(USAGE.replace(/^/gm, "  "));
  console.log("\n  example: Garchomp @ Life Orb Jolly 252 Atk Earthquake vs Heatran 252 HP");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => rl.question("calc> ", (line) => {
    line = line.trim();
    if (line === "" || /^(q|quit|exit)$/i.test(line)) return rl.close();
    try {
      process.stdout.write(runResolved(resolveQuery(line)));
    } catch (err) {
      console.log(`\n  error: ${err.message}`);
    }
    prompt();
  });
  prompt();
}

let args = process.argv.slice(2);
const wantResolved = args.includes("--resolved");
args = args.filter((a) => a !== "--resolved");

if (args.length === 0) {
  if (wantResolved) {
    console.error("--resolved needs a query or a matchup json argument");
    process.exit(1);
  }
  repl();
} else if (args.length === 1 && args[0].endsWith(".json") && existsSync(args[0])) {
  const matchup = JSON.parse(await readFile(path.resolve(args[0]), "utf8"));
  process.stdout.write(wantResolved ? emitResolvedJson(matchup) : runMatchup(matchup));
} else if (args.length === 1) {
  const input = resolveQuery(args[0]);
  process.stdout.write(wantResolved ? JSON.stringify(input, null, 2) + "\n" : runResolved(input));
} else if (args.length >= 3) {
  // Explicit <atk> <move> <def> compat form; NEVER manufactures a "uses" word
  // (2026-09-08 ruling) — the canonical line is the free-order vs form.
  const line = `${args[0]} ${args.slice(1, args.length - 1).join(" ")} vs ${args[args.length - 1]}`;
  const input = resolveQuery(line);
  process.stdout.write(wantResolved ? JSON.stringify(input, null, 2) + "\n" : runResolved(input));
} else {
  console.error(USAGE);
  process.exit(1);
}
