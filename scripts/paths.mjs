// paths.mjs — the ONE home for on-disk roots shared by the data loader and the
// data-gen scripts. Deliberately dependency-free (no dataset parsing, no engine
// import) so a generator can import the path without triggering data.mjs's
// eager reads of files it has not written yet.
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = path.join(here, "..", "data");
