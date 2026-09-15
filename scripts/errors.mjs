// errors.mjs — one builder per error shape for the front stages
// (input-converter.mjs / fill.mjs). Every hard failure routes through one of
// these so a message lives in exactly one place and the design.md §8
// shape taxonomy is enforced by construction: the only way to build a front
// error is to call a builder. Pure string functions — the caller keeps the
// literal `throw` at the same point, so throw timing (e.g. claimSlot throwing
// before its log so the echo stops correctly) and control flow are unchanged.
//
// Shapes:
//   missing   — a token/name could not be resolved (points at -search)
//   conflict  — two distinct values claimed for one slot
//   domain    — a resolved value is outside its allowed set
//   cap       — a count exceeds its limit
//   unboundEv — leftover stat/number with no adjacent partner

/** Lookup miss: an input variable could not be resolved. `what` is the variable
 *  ("side", "species", "move", "hidden power type"); `detail` is the already
 *  quoted or already worded value. Points at the `-search` lookup CLI. */
export const missing = (what, detail) => `missing ${what}: ${detail} — see -search`;

/** A `<species> mega` token whose base has no Mega forme. Reads as a lookup miss
 *  for the missing forme and points at `-search` like the rest. */
export const missingSpeciesMega = (name) => `missing species mega "${name}" — see -search`;

/** No `vs` in the line: there is no attacker/defender split. Points at the two
 *  commands that document the query frame. */
export const missingSplit = () =>
  'missing split: a query needs one "vs" between the attacker and the defender — see -help and -grammar';

/** Same-slot conflict: `values` are the distinct values claimed for `slot`. */
export const conflict = (slot, values) => `conflict on ${slot}: ${values.join(" vs ")}`;

/** R4 stray: stat word(s) / number(s) with no adjacent partner. */
export const unboundEv = (tokens) => `unbound EV: ${tokens.map((t) => `"${t}"`).join(", ")}`;

/** Hidden Power type the engine cannot roll (Normal / Fairy). `word` is passed
 *  exactly as the caller spells it (raw or lowercased). */
export const illegalHpType = (word) => `"hidden power ${word}" is not a legal Hidden Power type`;

/** One EV value over the gen-6 per-stat cap. */
export const evOverMax = (word, value) => `"${word} ${value}" is not an EV: gen 6 caps EVs at 252`;

/** More than two distinct moves in a combo; `detail` renders the moves. */
export const tooManyMoves = (detail) => `too many moves in a combo — capped at 2 (${detail})`;

/** The EV total exceeds the 510 cap. */
export const tooManyEvs = (total) => `too many EVs: ${total} (> 510 cap)`;
