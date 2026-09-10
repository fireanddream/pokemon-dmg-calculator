// damage.mjs — one-shot query CLI (the two-block answer).
//
// The FRONT is two stages: input-converter.mjs extracts the user's words into
// the spec JSON (no defaults), then fill.mjs applies auto-fill-defaults.md and
// resolves every name to its record. This file GLUES the whole staged pipeline
// together for interactive / one-shot use and prints the answer as TWO blocks:
// Block 1 the recognition echo (echo.mjs, built from the converter's
// `_sideLog` spans) and Block 2 the card (output.mjs) or, on a hard error, the
// error message under the "scanned so far" ruler.
//
//   node scripts/damage.mjs "<attacker side ...> vs <defender side ...>"   echo+card
//   node scripts/damage.mjs "<query>" --no-echo            card only
//   node scripts/damage.mjs "<query>" --chat               echo+card, fenced
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
import { renderEcho, spansFromLogs } from "./echo.mjs";
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
function runResolved(input, width) {
  return input.kind === "combo"
    ? render(calcCombo({ ...input, chart }), { width })
    : render(calcSingle({ ...input, chart }), { width });
}

/** A spec-dict matchup JSON file is still RAW: resolve it via fill.mjs first. */
function runMatchup(matchup, width) {
  return runResolved(resolveMatchup(matchup), width);
}

/** Recognition echo (Block 1) from converter logs, or "" when there is nothing
 *  to lay out. Never throws — a bad echo must not hide the card/error. */
function echoBlock(line, logs, width) {
  if (!logs.length) return "";
  try {
    return renderEcho(line, spansFromLogs(logs), width) + "\n";
  } catch {
    return "";
  }
}

/** One-shot query: parse -> echo -> fill -> calc -> output, in one process. On
 *  a hard error the echo shows the claims made before the throw ("scanned so
 *  far") and Block 2 is the engine's error message. */
export function runQuery(line, { chat = false, echo: wantEcho = true, width = 100 } = {}) {
  let logs = [];
  let body;
  try {
    const spec = parseQuery(line);
    logs = [...(spec.attacker?._sideLog ?? []), ...(spec.defender?._sideLog ?? [])];
    if (spec.attacker) delete spec.attacker._sideLog;
    if (spec.defender) delete spec.defender._sideLog;
    body = runResolved(resolveMatchup(spec), width);
  } catch (err) {
    // A converter throw carries its live partial log; a later-stage (fill/calc)
    // throw has no sideLogs, so keep the claims the converter already made.
    logs = err.sideLogs ?? logs;
    body = `${err.message}\n`;
  }
  const echo = wantEcho ? echoBlock(line, logs, width) : "";
  if (chat) {
    const e = echo.replace(/\n+$/, "");
    const b = body.replace(/\n+$/, "");
    return `${e ? `\`\`\`\n${e}\n\`\`\`\n` : ""}\`\`\`\n${b}\n\`\`\`\n`;
  }
  return echo + body;
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
  the echo+card (feed it to: node scripts/calc.mjs | node scripts/output.mjs)
  add --no-echo    to print only the card (no recognition echo)
  add --chat       to wrap the echo and the card in fenced code blocks
  add --width N    to wrap the echo and the card at N columns (default 100;
                   N <= 0 never wraps)

  specs: "Species [@ Item] [Nature] [N Stat EVs] [Ability] [L50]"`;

function repl() {
  console.log(USAGE.replace(/^/gm, "  "));
  console.log("\n  example: Garchomp @ Life Orb Jolly 252 Atk Earthquake vs Heatran 252 HP");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => rl.question("calc> ", (line) => {
    line = line.trim();
    if (line === "" || /^(q|quit|exit)$/i.test(line)) return rl.close();
    process.stdout.write(runQuery(line));
    prompt();
  });
  prompt();
}

let args = process.argv.slice(2);
const wantResolved = args.includes("--resolved");
const wantChat = args.includes("--chat") || args.includes("-c");
const noEcho = args.includes("--no-echo");
const wIdx = args.indexOf("--width");
const widthRaw = wIdx >= 0 ? args[wIdx + 1] : undefined;
const width = widthRaw === undefined ? 100 : Number(widthRaw);
if (!Number.isFinite(width)) {
  console.error(`--width must be a number, got "${widthRaw}"`);
  process.exit(1);
}
args = args.filter((a, i) => a !== "--resolved" && a !== "--chat" && a !== "-c" &&
  a !== "--no-echo" && a !== "--width" && (wIdx < 0 || i !== wIdx + 1));
const runOpts = { chat: wantChat, echo: !noEcho, width };

if (args.length === 0) {
  if (wantResolved) {
    console.error("--resolved needs a query or a matchup json argument");
    process.exit(1);
  }
  repl();
} else if (args.length === 1 && args[0].endsWith(".json") && existsSync(args[0])) {
  const matchup = JSON.parse(await readFile(path.resolve(args[0]), "utf8"));
  process.stdout.write(wantResolved ? emitResolvedJson(matchup) : runMatchup(matchup, width));
} else if (args.length === 1) {
  // --resolved stays a pure data path (no echo); plain queries get Block 1 + 2.
  process.stdout.write(wantResolved
    ? JSON.stringify(resolveQuery(args[0]), null, 2) + "\n"
    : runQuery(args[0], runOpts));
} else if (args.length >= 3) {
  // Explicit <atk> <move> <def> compat form; NEVER manufactures a "uses" word
  // (2026-09-08 ruling) — the canonical line is the free-order vs form.
  const line = `${args[0]} ${args.slice(1, args.length - 1).join(" ")} vs ${args[args.length - 1]}`;
  process.stdout.write(wantResolved
    ? JSON.stringify(resolveQuery(line), null, 2) + "\n"
    : runQuery(line, runOpts));
} else {
  console.error(USAGE);
  process.exit(1);
}
