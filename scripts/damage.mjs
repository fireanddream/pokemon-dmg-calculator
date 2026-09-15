// damage.mjs — one-shot query CLI (the two-block answer).
//
// The FRONT is two stages: input-converter.mjs extracts the user's words into
// the spec JSON (no defaults), then fill.mjs applies auto-fill-defaults.md and
// resolves every name to its record. This file GLUES the whole staged pipeline
// together for interactive / one-shot use and prints the answer as TWO blocks:
// Block 1 the recognition echo (echo.mjs, built from the converter's
// `_sideLog` spans) and Block 2 the card (output.mjs) or, on a hard error, the
// error message under the "scanned so far" ruler. Run with no args for USAGE.
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { chart } from "./typechart.mjs";
import { isMain } from "./cli.mjs";
import { runCalc } from "./calc.mjs";
import { render } from "./output.mjs";
import { renderEcho, spansFromLogs } from "./echo.mjs";
import { parseQuery } from "./input-converter.mjs";
import { resolveMatchup } from "./fill.mjs";
import { helpTopic, isHelpCommand } from "./help.mjs";
import { isSearchCommand, searchCommand } from "./lookup.mjs";

/** Full-width solid-block rule that heads every section (echo, banner, helpers). */
const sectionRule = (width = 100) =>
  "█".repeat(Number.isFinite(width) && width > 0 ? Math.floor(width) : 100);

/** Resolve (fill defaults) + calculate + render a raw spec-dict matchup. */
function renderMatchup(matchup, width) {
  return render(runCalc({ ...resolveMatchup(matchup), chart }), { width });
}

/** The resolved calc-input JSON (converter -> fill), for --resolved. */
function resolvedJson(matchup) {
  return JSON.stringify(resolveMatchup(matchup), null, 2) + "\n";
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
    body = render(runCalc({ ...resolveMatchup(spec), chart }), { width });
  } catch (err) {
    // A converter throw carries its live partial log; a later-stage (fill/calc)
    // throw has no sideLogs, so keep the claims the converter already made.
    logs = err.sideLogs ?? logs;
    body = `${err.message}\n`;
  }
  const rawEcho = wantEcho ? echoBlock(line, logs, width) : "";
  const echo = rawEcho ? sectionRule(width) + "\n" + rawEcho : "";
  if (chat) {
    const e = echo.replace(/\n+$/, "");
    const b = body.replace(/\n+$/, "");
    return `${e ? `\`\`\`\n${e}\n\`\`\`\n\n` : ""}\`\`\`\n${b}\n\`\`\`\n`;
  }
  // The separating blank line belongs only between the echo and the card; a
  // card/error with no echo (`--no-echo`) must not gain a leading blank line.
  return echo ? `${echo}\n${body}` : body;
}

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

  -help / -grammar / -limits  quickstart / token grammar / calculator limits
                              (from the prompt or as an argument)

  -search pokemon <type> [type2]
                      list pokemon whose FULL typing is exactly those types
                      (1 or 2, any order; names only, comma-separated)
  -search move <type> [power] [phys|special]
                      list attacking moves of a type; exact power and category
                      (physical/special, or phy/spe/atk/spa) are optional and
                      may appear in either order
  -search stats <name>
                      show base stats, abilities, tier and speed at lv50

  tokens can go in ANY order on a side (item, nature, EVs, ability and the move
  may come before or after the species); only "vs" is fixed — it splits the
  sides. specs: "Species [Item] [Nature] [N Stat EVs] [Ability] [L50]"`;

/** Compact banner shown when the interactive prompt starts. */
const BANNER = `Pokemon damage calculator by Winking Wizard

Defaults   gen 6 mechanics · Level 50 · IVs 31 · Serious nature ·
           0 EVs (a typed offensive nature fills a spread) · relevant ability

Input      <attacker side>  <move>  vs  <defender side>
           item, nature, EVs, ability and the move may sit anywhere on a side;
           only "vs" is fixed — it splits the sides.

Example    Garchomp Life Orb Jolly 252 Atk Earthquake vs Heatran 252 HP
           EQ LO max Atk Jolly Garchomp vs 252 HP Heatran
           Full alias list:        aliases.md
           Full default algorithm: auto-fill-defaults.md

Helpers
  -help                                  quickstart + assumed defaults
  -grammar                               token grammar + one example per name type
  -limits                                what the calculator does not model
  -search pokemon <type> [type2]         list pokemon whose exact typing matches
  -search move <type> [power] [phy/spe]  list attacking moves of a type
  -search stats <name>                   base stats, abilities, tier, Lv50 Speed`;

/** Parse argv into a run plan: flags plus the remaining source words. */
function parseArgs(argv) {
  const plan = { parts: [], resolved: false, chat: false, echo: true, width: 100 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--resolved") plan.resolved = true;
    else if (a === "--chat" || a === "-c") plan.chat = true;
    else if (a === "--no-echo") plan.echo = false;
    else if (a === "--width") {
      const raw = argv[++i];
      plan.width = Number(raw);
      if (!Number.isFinite(plan.width)) {
        console.error(`--width must be a number, got "${raw}"`);
        process.exit(1);
      }
    } else plan.parts.push(a);
  }
  return plan;
}

function repl() {
  console.log(BANNER.replace(/^/gm, "  "));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => rl.question("calc> ", (line) => {
    line = line.trim();
    if (line === "" || /^(q|quit|exit)$/i.test(line)) return rl.close();
    const topic = isHelpCommand(line);
    if (topic) {
      process.stdout.write(sectionRule() + "\n" + helpTopic(topic));
      return prompt();
    }
    const words = line.split(/\s+/);
    if (isSearchCommand(words[0])) {
      process.stdout.write(sectionRule() + "\n" + searchCommand(words.slice(1)));
      return prompt();
    }
    process.stdout.write(runQuery(line));
    prompt();
  });
  prompt();
}

// --- entry points (only when run directly: node scripts/damage.mjs — importing
// this module for `runQuery` must not trigger the CLI) ---
if (isMain(import.meta.url)) {
  const plan = parseArgs(process.argv.slice(2));
  const { parts } = plan;

  const helpCmd = parts.length === 1 ? isHelpCommand(parts[0]) : null;
  if (helpCmd) {
    process.stdout.write(sectionRule(plan.width) + "\n" + helpTopic(helpCmd, { width: plan.width }));
    process.exit(0);
  }

  // -search is CLI-only. Accept both split words and a single quoted line.
  const firstWord = (parts[0] ?? "").trim().split(/\s+/)[0];
  if (isSearchCommand(firstWord)) {
    const searchArgs = parts.length === 1
      ? parts[0].trim().split(/\s+/).slice(1)
      : parts.slice(1);
    process.stdout.write(sectionRule(plan.width) + "\n" + searchCommand(searchArgs, { width: plan.width }));
    process.exit(0);
  }

  if (parts.length === 0) {
    if (plan.resolved) {
      console.error("--resolved needs a query or a matchup json argument");
      process.exit(1);
    }
    repl();
  } else {
    // A single `.json` argument is a raw spec-dict matchup; every other shape
    // is a query line. The compat `<atk> <move> <def>` form joins into a
    // free-order vs line and NEVER manufactures a "uses" word (2026-09-08).
    const fileArg = parts.length === 1 && parts[0].endsWith(".json") && existsSync(parts[0])
      ? parts[0] : null;
    let line = null;
    let matchup = null;
    if (fileArg) matchup = JSON.parse(await readFile(path.resolve(fileArg), "utf8"));
    else if (parts.length === 1) line = parts[0];
    else if (parts.length >= 3) line = `${parts[0]} ${parts.slice(1, -1).join(" ")} vs ${parts[parts.length - 1]}`;
    else { console.error(USAGE); process.exit(1); }

    if (plan.resolved) {
      process.stdout.write(resolvedJson(matchup ?? parseQuery(line)));
    } else if (line !== null) {
      process.stdout.write(runQuery(line, { chat: plan.chat, echo: plan.echo, width: plan.width }));
    } else {
      process.stdout.write(renderMatchup(matchup, plan.width));
    }
  }
}
