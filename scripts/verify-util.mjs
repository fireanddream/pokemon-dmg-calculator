// verify-util.mjs — shared helpers for the verify suites: the exact canonical
// name lookups the oracle cases use, plus the two tally printers the suites
// share. Each suite keeps its own case list; only the copy-pasted plumbing
// lives here. Depends on data.mjs only (no build), so it stays usable by the
// engine-free suites.
import { norm, monByName, moveByName } from "./data.mjs";

/** Exact dex entry for a canonical name (case/hyphen folded). */
export const mon = (name) => monByName.get(norm(name));

/** Exact move record for a canonical name (case/hyphen folded). */
export const mv = (name) => moveByName.get(norm(name));

/** Print the "<pass> passed, <fail> failed" tally; set the exit code on any
 *  failure unless `exitOnFail` is false. */
export function reportCounts(pass, fail, { exitOnFail = true } = {}) {
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail && exitOnFail) process.exitCode = 1;
}

/** Print the "<pass>/<total> <label> checks passed" tally, then the failure
 *  details via `onFail`; always exits 1 on any failure. */
export function reportChecks(label, pass, failures, { onFail } = {}) {
  console.log("");
  console.log(`${pass}/${pass + failures.length} ${label} checks passed`);
  if (failures.length > 0) {
    if (onFail) onFail(failures);
    process.exit(1);
  }
}
