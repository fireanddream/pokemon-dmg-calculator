// cli.mjs — shared CLI plumbing for the staged scripts: the "am I the entry
// point?" guard and the file-or-stdin reader. Keeps every script's main block
// from re-implementing (and re-diverging on) the same two idioms.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** True when `metaUrl` (pass `import.meta.url`) is the process entry point, so
 *  a module can host a CLI without running it when imported. */
export function isMain(metaUrl) {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return path.resolve(argv1) === fileURLToPath(metaUrl);
  } catch {
    return false;
  }
}

/** Slurp stdin as a UTF-8 string. */
export async function readStdin() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

/** Read a file argument, or stdin when it is missing or "-". */
export async function readInput(arg) {
  if (arg && arg !== "-") return readFile(path.resolve(arg), "utf8");
  return readStdin();
}
