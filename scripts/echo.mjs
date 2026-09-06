// echo.mjs — shared recognition-echo renderer (TODO backlog ## 2).
//
// Renders the two-line echo block a producer prepends to a result card: the
// user's query line (words verbatim, spacing re-laid out) with a class ruler
// underneath — one short label per recognized token. Producer = the agent route
// today; the offline converter (## 8) wires in later. AGENTS.md adoption is
// pending user confirmation after implementation + verify.
//
// Layout contract (agreed in TODO ## 2):
//   - top line keeps the user's words in order, spelling and punctuation as
//     typed; inter-token spacing is single by default and widened only when a
//     label needs room (the line is NOT byte-verbatim),
//   - every label starts exactly at its token's first column (never centered),
//   - a label may overhang right past its word, but the next labeled token is
//     pushed so no label sits within one column of the previous label's text,
//   - multi-word bindings render glued with single spaces; the label anchors to
//     the binding's FIRST word,
//   - atoms with no span ("@", "vs", bare punctuation) get no label.
//
//   node scripts/echo.mjs --line "<raw query>" --spans '<json>' [--chat]
//
// --spans is a JSON array of bindings; each is an atom-index range into the
// whitespace-split raw line plus a label:
//   [{"atoms":[0,0],"label":"species"},{"atoms":[2,3],"label":"item"},...]
// Spans must be contiguous atom ranges and must not overlap. A token the
// producer could not place is labeled "???" (feedback, not a blocker).
import { pathToFileURL } from "node:url";

/** Split the raw line into whitespace atoms (spelling preserved). */
function atomize(line) {
  const text = line.trim();
  return text ? text.split(/\s+/) : [];
}

/** Build the two-line echo block for a raw line + labeled atom spans. */
export function renderEcho(line, spans) {
  const atoms = atomize(line);
  const n = atoms.length;
  const sorted = [...spans].sort(
    (a, b) => a.atoms[0] - b.atoms[0] || a.atoms[1] - b.atoms[1],
  );
  for (const s of sorted) {
    const [a, b] = s.atoms;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b >= n || a > b) {
      throw new Error(`echo: span "${s.label}" atoms [${a}, ${b}] out of range (line has ${n} atoms)`);
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].atoms[0] <= sorted[i - 1].atoms[1]) {
      throw new Error(
        `echo: overlapping spans "${sorted[i - 1].label}" [${sorted[i - 1].atoms}] ` +
          `and "${sorted[i].label}" [${sorted[i].atoms}]`,
      );
    }
  }

  // Build units: a labeled span glues its atoms into one unit; an uncovered
  // atom stands alone.
  const units = [];
  const byStart = new Map(sorted.map((s) => [s.atoms[0], s]));
  let i = 0;
  while (i < n) {
    const s = byStart.get(i);
    if (s) {
      units.push({ text: atoms.slice(i, s.atoms[1] + 1).join(" "), label: s.label });
      i = s.atoms[1] + 1;
    } else {
      units.push({ text: atoms[i] });
      i++;
    }
  }

  // Lay out: single space between units; before a labeled unit, widen the gap
  // so its label starts no earlier than two columns past the previous label's
  // text end (guarantees >= 1 blank column between label texts).
  let top = "";
  const placements = [];
  let prevLabEnd = -2;
  for (const u of units) {
    if (top.length) top += " ";
    if (u.label) {
      const want = prevLabEnd + 2;
      if (top.length < want) top += " ".repeat(want - top.length);
      const start = top.length;
      placements.push({ start, label: u.label });
      prevLabEnd = start + u.label.length - 1;
    }
    top += u.text;
  }

  const width = Math.max(
    top.length,
    ...placements.map((p) => p.start + p.label.length),
  );
  const ruler = new Array(width).fill(" ");
  for (const p of placements) {
    for (let k = 0; k < p.label.length; k++) ruler[p.start + k] = p.label[k];
  }
  return `${top.trimEnd()}\n${ruler.join("").trimEnd()}`;
}

const USAGE = `usage:
  node scripts/echo.mjs --line "<raw query>" --spans '<json>' [--chat]`;

function cli(argv) {
  const args = argv.slice(2);
  const chat = args.includes("--chat");
  const pick = (flag) => {
    const k = args.indexOf(flag);
    return k >= 0 ? args[k + 1] : undefined;
  };
  const line = pick("--line");
  const spansRaw = pick("--spans");
  if (line === undefined || spansRaw === undefined) {
    console.error(USAGE);
    process.exit(1);
  }
  let spans;
  try {
    spans = JSON.parse(spansRaw);
  } catch {
    console.error(`echo: --spans is not valid JSON: ${spansRaw}`);
    process.exit(1);
  }
  try {
    const block = renderEcho(line, spans);
    process.stdout.write(chat ? `\`\`\`\n${block}\n\`\`\`\n` : `${block}\n`);
  } catch (err) {
    console.error(`echo: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv);
}
