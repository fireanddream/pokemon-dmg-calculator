// Accuracy spike: assert the gen-6 hit-chance formula produces the expected
// chances. Damage itself stays identical to @smogon/calc (which never rolls
// accuracy), so these are the canonical formula values, not a diff oracle.
//   npm run verify:acc
import { hitChance } from "../dist/accuracy.js";
import { reportChecks } from "./verify-util.mjs";

let pass = 0;
const failures = [];

function T(name, expected, params) {
  const r = hitChance(params);
  const ok = Math.abs(r.chance - expected) < 1e-9;
  const exp = `${(expected * 100).toFixed(2)}%`;
  const got = `${(r.chance * 100).toFixed(2)}%`;
  const marker = ok ? "PASS" : "FAIL";
  const why = ok ? "" : ` (wanted ${exp})`;
  console.log(`  ${marker}  ${name}: ${got}${why}`);
  if (ok) pass++;
  else failures.push({ name, expected, got: r.chance, notes: r.notes });
}

const S = (ability, item, stage) => ({ ability, item, stage });
// accuracy side shorthand: ability / item / acc-or-eva stage

function TI(name, params) {
  const r = hitChance(params);
  const ok = r.chance === 0 && !!r.impossible;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}: ${ok ? `impossible (${r.impossible})` : "expected an impossible miss but got a chance"}`);
  if (ok) pass++;
  else failures.push({ name, expected: 0, got: r.chance, notes: r.notes });
}

console.log("accuracy spike");
console.log("== stages ==");
// base 80 Stone Edge, nothing else
T("stone edge, neutral", 0.8, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("", "", 0), defender: S("", "", 0) });
// 80 * 3/4 = 60
T("stone edge vs +1 eva", 0.6, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("", "", 0), defender: S("", "", 1) });
// 80 * 4/3 = 106.67 -> capped at 100%
T("stone edge at +1 acc caps at 100%", 1, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("", "", 1), defender: S("", "", 0) });
// 100 * 3/5 = 60
T("earthquake vs +2 eva", 0.6, { moveName: "Earthquake", baseAccuracy: 100, category: "Physical", attacker: S("", "", 0), defender: S("", "", 2) });
// 100 * 3/9 = 33.33 (stage floor)
T("earthquake vs +6 eva sits at the 33% floor", 1 / 3, { moveName: "Earthquake", baseAccuracy: 100, category: "Physical", attacker: S("", "", 0), defender: S("", "", 6) });
// 80 * 3/9 = 26.67 -> floored up to 33%
T("stone edge vs +6 eva floored to 33%", 1 / 3, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("", "", 0), defender: S("", "", 6) });
// acc +1 cancels eva +1 exactly
T("+1 acc cancels +1 eva", 0.8, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("", "", 1), defender: S("", "", 1) });

console.log("== never-miss / weather / No Guard ==");
T("aerial ace (no acc check) vs +6 eva always hits", 1, { moveName: "Aerial Ace", baseAccuracy: 0, category: "Physical", attacker: S("", "", 0), defender: S("", "", 6) });
T("thunder in rain always hits", 1, { moveName: "Thunder", baseAccuracy: 70, category: "Special", attacker: S("", "", 0), defender: S("", "", 0), weather: "rain" });
T("blizzard in hail always hits", 1, { moveName: "Blizzard", baseAccuracy: 70, category: "Special", attacker: S("", "", 0), defender: S("", "", 0), weather: "hail" });
T("thunder neutral is 70%", 0.7, { moveName: "Thunder", baseAccuracy: 70, category: "Special", attacker: S("", "", 0), defender: S("", "", 0) });
T("hurricane in harsh sun drops to 50%", 0.5, { moveName: "Hurricane", baseAccuracy: 70, category: "Special", attacker: S("", "", 0), defender: S("", "", 0), weather: "desolate" });
T("thunder in harsh sun drops to 50%", 0.5, { moveName: "Thunder", baseAccuracy: 70, category: "Special", attacker: S("", "", 0), defender: S("", "", 0), weather: "desolate" });
T("no guard attacker forces 100%", 1, { moveName: "Focus Blast", baseAccuracy: 70, category: "Special", attacker: S("No Guard", "", 0), defender: S("", "", 2) });
T("no guard defender forces 100%", 1, { moveName: "Focus Blast", baseAccuracy: 70, category: "Special", attacker: S("", "", 0), defender: S("No Guard", "", 3) });

console.log("== items ==");
T("wide lens: 80 * 1.1", 0.88, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("", "Wide Lens", 0), defender: S("", "", 0) });
T("zoom lens when moving last: 80 * 1.2", 0.96, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("", "Zoom Lens", 0), defender: S("", "", 0), movedAfterTarget: true });
T("zoom lens not moving last: no boost", 0.8, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("", "Zoom Lens", 0), defender: S("", "", 0) });
T("bright powder: 80 * 0.9", 0.72, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("", "", 0), defender: S("", "Bright Powder", 0) });
T("lax incense same as bright powder", 0.72, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("", "", 0), defender: S("", "Lax Incense", 0) });
T("micle berry only at <=1/4 HP", 0.8, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("", "Micle Berry", 0), defender: S("", "", 0) });
T("micle berry at low HP: 80 * 1.2", 0.96, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: { ...S("", "Micle Berry", 0), atLowHp: true }, defender: S("", "", 0) });

console.log("== attacker abilities ==");
T("compound eyes: 80 * 1.3 caps at 100%", 1, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("Compound Eyes", "", 0), defender: S("", "", 0) });
T("victory star: 80 * 1.1", 0.88, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("Victory Star", "", 0), defender: S("", "", 0) });
T("hustle physical: 80 * 0.8", 0.64, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("Hustle", "", 0), defender: S("", "", 0) });
T("hustle leaves special accuracy alone (fire blast 85)", 0.85, { moveName: "Fire Blast", baseAccuracy: 85, category: "Special", attacker: S("Hustle", "", 0), defender: S("", "", 0) });

console.log("== defender abilities ==");
T("sand veil in sand: 80 * 0.8", 0.64, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("", "", 0), defender: S("Sand Veil", "", 0), weather: "sand" });
T("sand veil with no sand: no effect", 0.8, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("", "", 0), defender: S("Sand Veil", "", 0) });
T("snow cloak in hail: 100 * 0.8", 0.8, { moveName: "Earthquake", baseAccuracy: 100, category: "Physical", attacker: S("", "", 0), defender: S("Snow Cloak", "", 0), weather: "hail" });
T("tangled feet (confused): 100 * 0.5", 0.5, { moveName: "Earthquake", baseAccuracy: 100, category: "Physical", attacker: S("", "", 0), defender: { ...S("Tangled Feet", "", 0), confused: true } });
T("tangled feet not confused: no effect", 1, { moveName: "Earthquake", baseAccuracy: 100, category: "Physical", attacker: S("", "", 0), defender: S("Tangled Feet", "", 0) });
T("mold breaker ignores sand veil", 0.8, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("Mold Breaker", "", 0), defender: S("Sand Veil", "", 0), weather: "sand" });
T("sand veil + bright powder + eva+1: 80*3/4*0.9*0.8", 0.432, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("", "", 0), defender: { ...S("Sand Veil", "Bright Powder", 1), confused: false }, weather: "sand" });

console.log("== gravity ==");
T("gravity: stone edge 80 * 5/3 caps at 100%", 1, { moveName: "Stone Edge", baseAccuracy: 80, category: "Physical", attacker: S("", "", 0), defender: S("", "", 0), gravity: true });
T("gravity: zap cannon 50 * 5/3 = 83.33", 5 / 6, { moveName: "Zap Cannon", baseAccuracy: 50, category: "Special", attacker: S("", "", 0), defender: S("", "", 0), gravity: true });

console.log("== OHKO ==");
T("fissure is flat 30%, ignores +3 eva", 0.3, { moveName: "Fissure", baseAccuracy: 30, category: "Physical", attacker: S("", "", 0), defender: S("", "", 3) });
T("sheer cold is flat 30%, ignores sand veil + bright powder", 0.3, { moveName: "Sheer Cold", baseAccuracy: 30, category: "Special", attacker: S("", "", 0), defender: { ...S("Sand Veil", "Bright Powder", 0) }, weather: "sand" });
T("no guard makes fissure always hit", 1, { moveName: "Fissure", baseAccuracy: 30, category: "Physical", attacker: S("No Guard", "", 0), defender: S("", "", 3) });
TI("horn drill cannot touch a ghost", { moveName: "Horn Drill", baseAccuracy: 30, category: "Physical", attacker: S("", "", 0), defender: S("", "", 0), defenderTypes: ["Ghost"] });
TI("guillotine vs a ghost is impossible even with no guard", { moveName: "Guillotine", baseAccuracy: 30, category: "Physical", attacker: S("No Guard", "", 0), defender: S("", "", 0), defenderTypes: ["Ghost"] });
TI("sheer cold fails vs an ice type", { moveName: "Sheer Cold", baseAccuracy: 30, category: "Special", attacker: S("", "", 0), defender: S("", "", 0), defenderTypes: ["Ice"] });
TI("fissure fails vs a flying type", { moveName: "Fissure", baseAccuracy: 30, category: "Physical", attacker: S("", "", 0), defender: S("", "", 0), defenderTypes: ["Flying"] });
T("guillotine vs a normal type is 30%", 0.3, { moveName: "Guillotine", baseAccuracy: 30, category: "Physical", attacker: S("", "", 0), defender: S("", "", 0), defenderTypes: ["Normal"] });
T("no guard horn drill vs a steel target always hits", 1, { moveName: "Horn Drill", baseAccuracy: 30, category: "Physical", attacker: S("No Guard", "", 0), defender: S("", "", 0), defenderTypes: ["Steel"] });

reportChecks("accuracy", pass, failures, {
  onFail: (fs) => {
    for (const f of fs) {
      console.log(`FAIL ${f.name}: wanted ${(f.expected * 100).toFixed(2)}%, got ${(f.got * 100).toFixed(2)}%`);
      console.log(`     notes: ${f.notes.join("; ")}`);
    }
  },
});
