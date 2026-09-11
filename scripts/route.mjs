// route.mjs — the AGENT one-shot route: one query line in, the two-block answer
// out. A thin alias of damage.mjs's `runQuery` (converter -> echo -> fill ->
// calc -> output in one process).
//
//   node scripts/route.mjs "<attacker side ...> vs <defender side ...>"
//
// No compat modes: exactly one line argument, output always fenced for pasting
// (Block 1 the recognition echo, then Block 2 the card or the error). The line
// is passed through verbatim; the converter binds the tokens and fill.mjs fills
// the defaults. `--chat`/`-c` is accepted as a no-op alias for the contract in
// DESIGN-RECORDS.md §11.
import { runQuery } from "./damage.mjs";

const USAGE = 'usage: node scripts/route.mjs "<attacker side ...> vs <defender side ...>"';

const args = process.argv.slice(2).filter((a) => a !== "--chat" && a !== "-c");
if (args.length !== 1) {
  console.error(USAGE);
  process.exit(1);
}

process.stdout.write(runQuery(args[0], { chat: true }));
