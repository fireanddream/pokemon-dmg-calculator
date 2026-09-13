// echo.mjs — shared recognition-echo renderer (DESIGN-RECORDS.md "Recognition echo").
//
// Renders the two-line echo block a producer prepends to a result card: the
// user's query line (words verbatim, spacing re-laid out) with a class ruler
// underneath — one short label per recognized token. Producer = the agent route
// today; the offline converter (## 8) wires in later. AGENTS.md adoption is
// pending user confirmation after implementation + verify.
//
// Layout contract (agreed in DESIGN-RECORDS.md "Recognition echo"):
//   - top line keeps the user's words in order, spelling and punctuation as
//     typed; inter-token spacing is single by default and widened only when a
//     label needs room (the line is NOT byte-verbatim),
//   - every label starts exactly at its token's first column (never centered),
//   - a label may overhang right past its word, but the next labeled token is
//     pushed so no label sits within one column of the previous label's text,
//   - multi-word bindings render glued with single spaces; the label anchors to
//     the binding's FIRST word,
//   - atoms with no span ("@", "vs", bare punctuation) get no label,
//   - WRAPPING: renderEcho(line, spans, wrapWidth) breaks a too-long block into
//     row groups, each with its words and labels kept directly adjacent. Break
//     columns are chosen only where BOTH lines are blank (inside a widened gap),
//     so the ruler never splits a label and the top line never splits a word;
//     each emitted row group is <= wrapWidth columns. Only blocks wider than
//     wrapWidth wrap (wrapWidth <= 0 = never). The shared renderer means the
//     offline converter route gets the same wrap for free when ## 8 wires in.
//
//   node scripts/echo.mjs --line "<raw query>" --spans '<json>' [--chat] [--width N]
//
// --spans is a JSON array of bindings; each is an atom-index range into the
// whitespace-split raw line plus a label:
//   [{"atoms":[0,0],"label":"species"},{"atoms":[2,3],"label":"item"},...]
// Spans must be contiguous atom ranges and must not overlap. A token the
// producer could not place is labeled "???" (feedback, not a blocker).
// --width sets the wrap width in columns (default 100; rows that fit stay on
// one line).
import { tokenizeLine } from "./tokenize.mjs";
import { isMain } from "./cli.mjs";

/** Display atoms for the echo top line, from the ONE shared tokenizer: the
 *  normalize-once words the scanner saw (hyphen rule + punctuation/@ handling
 *  applied, case preserved). Spans index this same atom space. */
function atomize(line) {
  return tokenizeLine(line).atoms.map((a) => a.raw);
}

/** Convert converter `_sideLog` entries (`{label, from, len}` with GLOBAL atom
 *  indices) into echo spans (`{atoms:[first,last], label}`). */
export function spansFromLogs(logs) {
  return logs.map((l) => ({ atoms: [l.from, l.from + l.len - 1], label: l.label }));
}

// Break two same-length aligned lines (words line + ruler line) into row
// groups, each <= wrapWidth columns, cutting only at gap columns that lie
// OUTSIDE every unit's text span and are blank in BOTH lines, so no word, no
// glued multi-word binding (Life Orb, Sludge Wave) and no ruler label is ever
// split across a row. Rows are emitted as word-line then ruler-line pairs, so
// a group keeps its labels directly under its words; a group side that is all
// blank is dropped. A single unit longer than wrapWidth (no gap to cut at) is
// cut hard at the width limit rather than dropped.
function wrapAligned(top, ruler, wrapWidth, units) {
  const total = top.length;
  const insideUnit = (c) => units.some((u) => u.start <= c && c < u.end);
  const safe = [];
  for (let c = 1; c < total; c++) {
    if (top[c] === " " && ruler[c] === " " && !insideUnit(c)) safe.push(c);
  }
  const segs = [];
  let s = 0;
  while (s < total) {
    const lim = Math.min(s + wrapWidth, total);
    if (lim >= total) {
      segs.push([s, total]);
      break;
    }
    let b = -1;
    for (const c of safe) {
      if (c <= s) continue;
      if (c > lim) break;
      b = c;
    }
    segs.push([s, b < 0 ? lim : b]);
    s = b < 0 ? lim : b;
  }
  const lines = [];
  for (const [a, b] of segs) {
    const t = top.slice(a, b);
    const r = ruler.slice(a, b);
    const lead = t.length - t.trimStart().length;
    const ts = t.slice(lead).trimEnd();
    const rs = r.slice(lead).trimEnd();
    if (ts) lines.push(ts);
    if (rs) lines.push(rs);
  }
  return lines.join("\n");
}

/** Wrap a plain multi-line text block at wrapWidth columns under the SAME rule
 *  as the echo renderer: break only at whitespace (a word is never split),
 *  keep each line's leading indent on continuations, and wrap nothing when
 *  wrapWidth <= 0. Used by output.mjs for the result card (Block 2) so the
 *  card and the echo wrap identically. */
export function wrapBlock(text, wrapWidth) {
  if (!(wrapWidth > 0)) return text;
  const out = [];
  for (const line of text.split("\n")) {
    if (line.length <= wrapWidth) {
      out.push(line);
      continue;
    }
    const indent = line.match(/^ */)[0];
    let rest = line;
    while (rest.length > wrapWidth) {
      const cut = rest.lastIndexOf(" ", wrapWidth);
      if (cut <= indent.length) break; // no breakable space: leave the word whole
      out.push(rest.slice(0, cut));
      rest = indent + rest.slice(cut + 1);
    }
    out.push(rest);
  }
  return out.join("\n");
}

/** Build the echo block for a raw line + labeled atom spans. */
export function renderEcho(line, spans, wrapWidth = 0) {
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
  // text end (guarantees >= 1 blank column between label texts). Each unit's
  // absolute text span is recorded so a wrap never cuts through it.
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
    u.start = top.length;
    top += u.text;
    u.end = top.length;
  }

  const width = Math.max(
    top.length,
    ...placements.map((p) => p.start + p.label.length),
  );
  const ruler = new Array(width).fill(" ");
  for (const p of placements) {
    for (let k = 0; k < p.label.length; k++) ruler[p.start + k] = p.label[k];
  }
  const topPadded = top.padEnd(width);
  const rulerStr = ruler.join("");
  if (!(wrapWidth > 0) || width <= wrapWidth) {
    return `${topPadded.trimEnd()}\n${rulerStr.trimEnd()}`;
  }
  return wrapAligned(topPadded, rulerStr, wrapWidth, units);
}

const USAGE = `usage:
  node scripts/echo.mjs --line "<raw query>" --spans '<json>' [--chat] [--width N]
  --width N   wrap rows wider than N columns (default 100; N <= 0 = never)`;

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
  const widthRaw = pick("--width");
  const wrapWidth = widthRaw === undefined ? 100 : Number(widthRaw);
  if (!Number.isFinite(wrapWidth)) {
    console.error(`echo: --width must be a number, got "${widthRaw}"`);
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
    const block = renderEcho(line, spans, wrapWidth);
    process.stdout.write(chat ? `\`\`\`\n${block}\n\`\`\`\n` : `${block}\n`);
  } catch (err) {
    console.error(`echo: ${err.message}`);
    process.exit(1);
  }
}

if (isMain(import.meta.url)) {
  cli(process.argv);
}
