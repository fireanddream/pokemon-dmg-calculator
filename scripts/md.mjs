// md.mjs — the ONE reader for the doc-as-code markdown tables (aliases.md,
// auto-fill-defaults.md). Both the converter and fill.mjs parse those stores;
// this module owns the section/table/cell helpers so the parsing rules live in
// one place.
//
// `mdSection` has two heading conventions in the wild, kept behind
// `opts.anyLevel`:
//   - default (false): match a `## <heading>` line and stop at the next `## ` —
//     fill.mjs's convention (its stores use level-2 headings only).
//   - anyLevel (true): match any `#`..`######` heading and stop at the next
//     heading of any level — input-converter.mjs's convention.

/** The text from a heading line to the next heading (see `opts.anyLevel`). */
export function mdSection(doc, heading, opts = {}) {
  if (!doc) return "";
  const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (opts.anyLevel) {
    const re = new RegExp(`^#{1,6}\\s+${esc}\\s*$`, "gm");
    const m = re.exec(doc);
    if (!m) return "";
    const tail = doc.slice(m.index + m[0].length);
    const next = /^#{1,6}\s/m.exec(tail);
    return tail.slice(0, next ? next.index : tail.length);
  }
  const re = new RegExp(`(^|\\n)## ${esc}(?=\\s|$)`);
  const m = re.exec(doc);
  if (!m) return "";
  const i = m.index + (m[0].startsWith("\n") ? 1 : 0);
  const j = doc.indexOf("\n## ", i + 2);
  return doc.slice(i, j === -1 ? doc.length : j);
}

/** Cell arrays of the rows in the first `|...|` table of a section (skips the
 *  column header and the `|---|` separator line). */
export function mdTableRows(section) {
  return section
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"))
    .slice(2) // skip the column header and the |---|---| separator
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
    .filter((cells) => cells.length >= 2);
}

/** Strip markdown bold and parentheticals from a table cell. */
export const stripMdCell = (s) =>
  s.replace(/\*\*/g, "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();

/** First integer in a cell, or null. */
export const firstInt = (s) => { const m = /\d+/.exec(s ?? ""); return m ? Number(m[0]) : null; };
