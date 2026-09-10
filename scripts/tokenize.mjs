// tokenize.mjs — ONE shared line tokenizer for the converter front and the
// recognition echo (TODO step 7). Normalize ONCE, then hand both consumers the
// same case-preserving display atoms so `_sideLog` indices and echo ruler
// columns can never drift:
//
//   - the master hyphen rule runs first (every typed hyphen becomes a space,
//     except a minus glued to a boost/stage number) — so a hyphenated spelling
//     shows up as plain spaced words;
//   - `@` and quotes become spaces; the hard-boundary punctuation `,.;/\|`
//     becomes a non-space sentinel so no phrase ever matches across it;
//   - split into atoms: each keeps the user's `raw` text (case preserved) for
//     display plus a lowercased `match` form `t`, an absolute index `gi`, and
//     `hardBefore` (a sentinel sits between it and the previous atom).
//
// Display is the normalize-once result (option B): the echo top line prints
// these atoms, so the user sees exactly the words the scanner saw. Data-starved
// consumers (verify:echo, unit tests) may tokenize a line standalone; the
// converter tokenizes the whole line once and slices it per side, so `gi` is
// the global echo atom index.
const PUNCT_BOUNDARY = /[,.;/\\|]/g;
export const PUNCT_SENT = "\u0001";

/** Master hyphen rule (idea-note-3): every hyphen in the INPUT is a word
 *  separator — it becomes a space — with ONE exception: a minus sign glued to a
 *  boost/stage number ("-2 atk", "atk -2") is a signed stage token and stays a
 *  minus. Runs BEFORE tokenization so no later pass special-cases a hyphen. */
export const hyphenToSpace = (s) =>
  s.replace(/-/g, (h, i) => {
    const before = i > 0 ? s[i - 1] : "";
    const after = s[i + 1] ?? "";
    return !/[A-Za-z0-9]/.test(before) && /[0-9]/.test(after) ? h : " ";
  });

/** Normalize + split one line into `{ raw, t, gi, hardBefore }` atoms. */
export function tokenizeLine(line) {
  const normed = hyphenToSpace(String(line));
  const marked = normed.replace(/[@'"]/g, " ").replace(PUNCT_BOUNDARY, PUNCT_SENT);
  const atoms = [];
  let prevEnd = -1;
  const re = /[^\s\u0001]+/g;
  let m;
  while ((m = re.exec(marked)) !== null) {
    const hardBefore = prevEnd >= 0 && marked.slice(prevEnd, m.index).includes(PUNCT_SENT);
    atoms.push({ raw: m[0], t: m[0].toLowerCase(), gi: atoms.length, hardBefore });
    prevEnd = m.index + m[0].length;
  }
  return { normed, atoms };
}
