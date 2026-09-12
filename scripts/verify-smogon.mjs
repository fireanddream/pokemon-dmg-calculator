// Compare our engine vs @smogon/calc (gen 6) across a broad modifier matrix.
// Only a dev/diagnostic tool: npm run verify:smogon
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calcStats, buildTypeChart } from "../dist/index.js";
import pkg from "@smogon/calc";
const { calculate, Pokemon: OPokemon, Move: OMove, Field: OField } = pkg;

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "..", "data");
const read = (f) => readFile(path.join(DATA_DIR, f), "utf8").then(JSON.parse);

const { pokemon: dexPokemon } = await read("xy-pokemon.json");
const { moves: dexMoves } = await read("moves-xy.json");
const { natures } = await read("natures-xy.json");
const { types: typeEntries } = await read("types-xy.json");
const chart = buildTypeChart(typeEntries);
const neutralNature = natures.find((n) => n.summary === "");

const mon = (name) => dexPokemon.find((p) => p.name.toLowerCase() === name.toLowerCase());
const mv = (name) => dexMoves.find((m) => m.name.toLowerCase() === name.toLowerCase());

// All cases are L100, 31 IV, 0 EV, neutral nature unless overridden.
const CASES = [];

function addCase(label, { atk, def, move, params = {} }) {
  CASES.push({ label, atk, def, move, params });
}

const W = { species: "Weavile", level: 100 };
const AG = { species: "Aggron", level: 100 };
const PIS = { species: "Pinsir", level: 100 }; // Aerilate
const CHA = { species: "Charizard", level: 100 }; // Blaze/adapt
const SCEP = { species: "Sceptile", level: 100 };
const TAU = { species: "Tauros", level: 100 };
const GAR = { species: "Gengar", level: 100 };
const SNE = { species: "Snorlax", level: 100 };
const BLIS = { species: "Blissey", level: 100 };
const MAMP = { species: "Mamoswine", level: 100 };
const AGM = { species: "Aggron-Mega", level: 100 };
const ROTW = { species: "Rotom-Wash", level: 100 };
const ELEK = { species: "Electrode", level: 100 };

const base = { ivs: {}, evs: {}, nature: neutralNature.name };

// base STAB
addCase("base physical STAB (Weavile Knock Off vs Aggron)", {
  atk: { ...W, ability: "Pressure", item: undefined, ...base },
  def: { ...AG, ability: "Sturdy", item: undefined, ...base },
  move: "Knock Off",
});
// non-STAB, 4x weakness: Charizard stone edge (physical special mix not needed; use special for SPA)
addCase("non-STAB neutral special", {
  atk: { ...CHA, ability: "Blaze", item: undefined, ...base },
  def: { ...TAU, ability: "Intimidate", item: undefined, ...base },
  move: "Flamethrower",
});
// weather sun boosts fire
addCase("sun: fire x1.5", {
  atk: { ...CHA, ability: "Blaze", ...base },
  def: { ...TAU, ability: "Intimidate", ...base },
  move: "Flamethrower",
  params: { weather: "sun" },
});
// rain cuts fire
addCase("rain: fire x0.5", {
  atk: { ...CHA, ability: "Blaze", ...base },
  def: { ...TAU, ability: "Intimidate", ...base },
  move: "Flamethrower",
  params: { weather: "rain" },
});
// desolate land boosts fire like harsh sunlight
addCase("desolate land: fire x1.5", {
  atk: { ...CHA, ability: "Blaze", ...base },
  def: { ...TAU, ability: "Intimidate", ...base },
  move: "Flamethrower",
  params: { weather: "desolate" },
});
// crit
addCase("crit x1.5", {
  atk: { ...W, ability: "Pressure", ...base },
  def: { ...AG, ability: "Sturdy", ...base },
  move: "Knock Off",
  params: { crit: true },
});
// stat boost on attacker
addCase("atk +2 stage", {
  atk: { ...W, ability: "Pressure", ...base, boosts: { atk: 2 } },
  def: { ...AG, ability: "Sturdy", ...base },
  move: "Knock Off",
});
// defender +def stage
addCase("def +2 stage on defender", {
  atk: { ...W, ability: "Pressure", ...base },
  def: { ...AG, ability: "Sturdy", ...base, boosts: { def: 2 } },
  move: "Knock Off",
});
// crit ignores defender's positive def boost
addCase("crit ignores defender +def", {
  atk: { ...W, ability: "Pressure", ...base },
  def: { ...AG, ability: "Sturdy", ...base, boosts: { def: 2 } },
  move: "Knock Off",
  params: { crit: true },
});
// screens (reflect for physical)
addCase("reflect", {
  atk: { ...W, ability: "Pressure", ...base },
  def: { ...AG, ability: "Sturdy", ...base },
  move: "Knock Off",
  params: { screens: "reflect" },
});
// life orb
addCase("life orb", {
  atk: { ...W, ability: "Pressure", item: "Life Orb", ...base },
  def: { ...AG, ability: "Sturdy", ...base },
  move: "Knock Off",
});
// choice band
addCase("choice band", {
  atk: { ...W, ability: "Pressure", item: "Choice Band", ...base },
  def: { ...AG, ability: "Sturdy", ...base },
  move: "Knock Off",
});
// expert belt on SE (Sceptile rock? use Charizard? use Sceptile X-Scissor vs Blissey? need SE). Use Mamoswine Icicle Crash vs Blissey? Actually Expert belt needs >1 eff. Use Charizard Flamethrower vs Sceptile (Grass 2x) w/ Sceptile no item.
addCase("expert belt super-effective", {
  atk: { ...CHA, ability: "Blaze", item: "Expert Belt", ...base },
  def: { ...SCEP, ability: "Overgrow", ...base },
  move: "Flamethrower",
});
// charcoal type item
addCase("charcoal type-boost item", {
  atk: { ...CHA, ability: "Blaze", item: "Charcoal", ...base },
  def: { ...TAU, ability: "Intimidate", ...base },
  move: "Flamethrower",
});
// technician
addCase("technician boost", {
  atk: { ...SCEP, ability: "Technician", ...base },
  def: { ...TAU, ability: "Intimidate", ...base },
  move: "Aerial Ace",
});
// huge power
addCase("huge power", {
  atk: { ...W, ability: "Huge Power", ...base },
  def: { ...AG, ability: "Sturdy", ...base },
  move: "Knock Off",
});
// guts + burn
addCase("guts attack (burned, no burn penalty)", {
  atk: { ...W, ability: "Guts", status: "brn", ...base },
  def: { ...AG, ability: "Sturdy", ...base },
  move: "Knock Off",
});
// burned normal physical penalty
addCase("burn halves physical", {
  atk: { ...W, ability: "Pressure", status: "brn", ...base },
  def: { ...AG, ability: "Sturdy", ...base },
  move: "Knock Off",
});
// Blaze low HP
addCase("blaze at <=1/3 hp", {
  atk: { ...CHA, ability: "Blaze", hpFraction: 0.33, ...base },
  def: { ...TAU, ability: "Intimidate", ...base },
  move: "Flamethrower",
});
// Aerilate + contact? pinsir return flying
addCase("aerilate type change + boost", {
  atk: { ...PIS, ability: "Aerilate", ...base },
  def: { ...TAU, ability: "Intimidate", ...base },
  move: "Return",
});
// Multiscale full HP
addCase("multiscale full hp halves", {
  atk: { ...W, ability: "Pressure", ...base },
  def: { ...AG, ability: "Multiscale", hpFraction: 1, ...base },
  move: "Knock Off",
});
// Filter super-effective reduction
addCase("filter reduces super-effective", {
  atk: { ...W, ability: "Pressure", ...base },
  def: { ...AG, ability: "Filter", ...base }, // knock off neutral, so use fire move? Instead use Mamoswine EQ vs Heatproof? For Filter we need SE & resist ability; choose Sceptile (Grass) taking Flamethrower = 2x *0.75
  move: "Knock Off",
});
addCase("filter vs super effective fire", {
  atk: { ...CHA, ability: "Blaze", ...base },
  def: { ...SCEP, ability: "Filter", ...base },
  move: "Flamethrower",
});
// Thick Fat vs fire
addCase("thick fat fire halved", {
  atk: { ...CHA, ability: "Blaze", ...base },
  def: { ...SNE, ability: "Thick Fat", ...base },
  move: "Flamethrower",
});
// Tough Claws contact
addCase("tough claws contact", {
  atk: { ...W, ability: "Tough Claws", ...base },
  def: { ...AG, ability: "Sturdy", ...base },
  move: "Knock Off",
});
// Adaptability STAB x2
addCase("adaptability stab x2", {
  atk: { ...W, ability: "Adaptability", ...base },
  def: { ...AG, ability: "Sturdy", ...base },
  move: "Knock Off",
});
// Tinted lens neutral-> still neutral? Need NVE move. Use Gengar (Ghost) with Bug? no NVE... use SNE (Normal) vs GAR (Ghost): ghost immune. Pick resist case: Blissey vs Gengar Shadow Ball is immune? no ghost vs normal immune? Normal types immune to ghost. Need NVE: e.g., Tauros (Normal) vs GAR (Ghost/Poison): normal moves immune ghost. Not NVE. Instead Fire vs Rock/... simpler: Charizard (Fire) vs Blissey (Normal) neutral. Hmm.
// NVE: Ice vs Water? Let's use Sceptile using Bullet Seed (Grass) vs SNE (Normal) neutral. Use Tauros vs SNE? both normal, resist nothing...
// easy NVE: Water move vs Fire type. Use SCEPTILE? has no water. Use GAR (Ghost/Poison) with Sludge? Let's use Mamoswine (Ice/Ground) vs Blissey using Stone Edge (Rock) => NVE (rock vs normal is 1x? rock vs normal 1). Hmm.
// Use special: CHA (Fire) using Focus Blast vs GAR (Ghost/Poison) = neutral...
// simplest NVE: GAR (Ghost/Poison) with Shadow Ball vs normal Blissey => 0 immune not NVE.
// Ice Beam vs Water/Fire? Fire resists ice 0.5. CHA(Fire) gets Ice Beam? not in dex move set but ability irrelevant. Let's use SNE (normal) using Ice Beam? SNE special low but fine. Actually just use Ice Beam from a water/grass mon.
// Use SCEP (Grass) Ice Beam vs CHA (Fire/Flying) => ice vs fire 0.5 (and vs flying neutral) NVE. SCEP has no ice beam but calc doesn't require learnset. good.
addCase("tinted lens on not-very-effective", {
  atk: { ...SCEP, ability: "Tinted Lens", ...base },
  def: { ...CHA, ability: "Blaze", ...base },
  move: "Ice Beam",
});
// Protean STAB
addCase("protean grants stab", {
  atk: { ...GAR, ability: "Protean", ...base }, // becomes ghost
  def: { ...AG, ability: "Sturdy", ...base },
  move: "Shadow Ball",
});
// Levitate ground immune
addCase("levitate immune ground", {
  atk: { ...SNE, ability: "Thick Fat", ...base },
  def: { ...GAR, ability: "Levitate", ...base },
  move: "Earthquake",
});
// Mold Breaker ignores levitate
addCase("mold breaker bypasses levitate", {
  atk: { ...SNE, ability: "Mold Breaker", ...base },
  def: { ...GAR, ability: "Levitate", ...base },
  move: "Earthquake",
});
// special, screens light
addCase("light screen special", {
  atk: { ...CHA, ability: "Blaze", ...base },
  def: { ...TAU, ability: "Intimidate", ...base },
  move: "Flamethrower",
  params: { screens: "light" },
});
// assault vest
addCase("assault vest", {
  atk: { ...CHA, ability: "Blaze", ...base },
  def: { ...TAU, ability: "Intimidate", item: "Assault Vest", ...base },
  move: "Flamethrower",
});
// knock off target item boost
addCase("knock off +50% vs item holder", {
  atk: { ...W, ability: "Pressure", ...base },
  def: { ...AG, ability: "Sturdy", item: "Leftovers", ...base },
  move: "Knock Off",
  params: { targetHoldsItem: true },
});
// sturdy no damage effect on rolls but survives; compare fine.
// parental bond
addCase("parental bond double", {
  atk: { ...W, ability: "Parental Bond", ...base },
  def: { ...AG, ability: "Sturdy", ...base },
  move: "Knock Off",
});
// terrain: electric
addCase("electric terrain boost", {
  atk: { ...TAU, ability: "Intimidate", ...base },
  def: { ...AG, ability: "Sturdy", ...base },
  move: "Thunderbolt", // not STAB, fine
  params: { terrain: "electric" },
});
// facade doubled when statused (normal STAB)
addCase("facade doubled when statused", {
  atk: { ...SNE, ability: "Immunity", status: "psn", ...base },
  def: { ...TAU, ability: "Intimidate", ...base },
  move: "Facade",
});
// facade ignores burn's Attack drop while still doubling
addCase("facade ignores burn attack drop", {
  atk: { ...SNE, ability: "Immunity", status: "brn", ...base },
  def: { ...TAU, ability: "Intimidate", ...base },
  move: "Facade",
});
// unaware attacker ignores defender boosts
addCase("unaware attacker ignores def boosts", {
  atk: { ...W, ability: "Unaware", ...base },
  def: { ...AG, ability: "Sturdy", ...base, boosts: { def: 4 } },
  move: "Knock Off",
});
// sand force ground in sand (Sand Force is gen5/6: not our data? ability Sand Force exists)
addCase("sand force ground in sand", {
  atk: { ...MAMP, ability: "Sand Force", ...base },
  def: { ...TAU, ability: "Intimidate", ...base },
  move: "Earthquake",
  params: { weather: "sand" },
});
// rain water (special STAB, water move on grass/ground sceptile) neutral
addCase("rain water boost", {
  atk: { ...SCEP, ability: "Torrent", ...base },
  def: { ...AG, ability: "Sturdy", ...base },
  move: "Surf",
  params: { weather: "rain" },
});
// burn does not reduce special attacks
addCase("burn does not affect special", {
  atk: { ...CHA, ability: "Blaze", status: "brn", ...base },
  def: { ...TAU, ability: "Intimidate", ...base },
  move: "Flamethrower",
});
// misty terrain halves dragon damage (no fly/levitate on aggron -> grounded)
addCase("misty terrain halves dragon", {
  atk: { ...SNE, ability: "Immunity", ...base },
  def: { ...AG, ability: "Sturdy", ...base },
  move: "Dragon Claw",
  params: { terrain: "misty" },
});
// Occa Berry halves super-effective fire hit on Sceptile (one-time)
addCase("Occa Berry halves SE fire", {
  atk: { ...CHA, ability: "Blaze", ...base },
  def: { ...SCEP, ability: "Overgrow", item: "Occa Berry", ...base },
  move: "Flamethrower",
});
// Colbur Berry halves SE dark hit on Blissey (Normal type, Dark SE, Colbur halves)
addCase("Colbur Berry halves SE dark", {
  atk: { ...W, ability: "Pressure", ...base },
  def: { ...BLIS, ability: "Natural Cure", item: "Colbur Berry", ...base },
  move: "Knock Off",
  params: { targetHoldsItem: true },
});
// Yache Berry halves SE ice hit on Sceptile (Grass, Ice 2x SE)
addCase("Yache Berry halves SE ice", {
  atk: { ...MAMP, ability: "Thick Fat", ...base },
  def: { ...SCEP, ability: "Overgrow", item: "Yache Berry", ...base },
  move: "Ice Beam",
});
// Chilan Berry halves Normal moves on Aggron (not SE, special case)
addCase("Chilan Berry halves normal moves", {
  atk: { ...SNE, ability: "Immunity", ...base },
  def: { ...AG, ability: "Sturdy", item: "Chilan Berry", ...base },
  move: "Return",
});
// Berry should NOT activate if move is wrong type (Occa vs Dark)
addCase("Occa Berry does not activate vs non-fire", {
  atk: { ...W, ability: "Pressure", ...base },
  def: { ...SCEP, ability: "Overgrow", item: "Occa Berry", ...base },
  move: "Knock Off",
  params: { targetHoldsItem: true },
});

// weight-based power: Heavy Slam (huge weight advantage = 120 BP)
addCase("heavy slam high weight ratio (Aggron-Mega vs Rotom-Wash)", {
  atk: { ...AGM, ability: "Filter", ...base },
  def: { ...ROTW, ability: "Levitate", ...base },
  move: "Heavy Slam",
});
// low weight advantage = 40 BP floor
addCase("heavy slam low weight ratio (Aggron vs Aggron-Mega)", {
  atk: { ...AG, ability: "Sturdy", ...base },
  def: { ...AGM, ability: "Filter", ...base },
  move: "Heavy Slam",
});
// speed-based power
addCase("electro ball: much faster attacker (Electrode vs Snorlax)", {
  atk: { ...ELEK, ability: "Soundproof", ...base },
  def: { ...SNE, ability: "Immunity", ...base },
  move: "Electro Ball",
});
addCase("gyro ball: slow attacker vs fast target (Snorlax vs Electrode)", {
  atk: { ...SNE, ability: "Immunity", ...base },
  def: { ...ELEK, ability: "Soundproof", ...base },
  move: "Gyro Ball",
});
// remaining deterministic dynamic base powers
// Payback's after-target doubling is intentionally NOT modeled (out of scope,
// same class as Avalanche): the engine treats it as its flat 50 BP. @smogon
// doubles it from the speed comparison (gen56.js), so only the faster-user
// branch agrees and is kept here; the slower-user case is deliberately absent.
addCase("payback flat on faster user (Electrode vs Snorlax)", {
  atk: { ...ELEK, ability: "Soundproof", ...base },
  def: { ...SNE, ability: "Immunity", ...base },
  move: "Payback",
});
// Acrobatics doubles only when the user is genuinely itemless; the default
// "inert held item" assumption suppresses the double (leftovers stands in).
addCase("acrobatics flat with an assumed held item (Snorlax @ Leftovers)", {
  atk: { ...SNE, ability: "Immunity", item: "Leftovers", ...base },
  def: { ...AG, ability: "Sturdy", ...base },
  move: "Acrobatics",
  params: { attackerHoldsItem: true },
});
addCase("acrobatics doubles on a genuinely itemless user (Snorlax)", {
  atk: { ...SNE, ability: "Immunity", ...base },
  def: { ...AG, ability: "Sturdy", ...base },
  move: "Acrobatics",
  params: { attackerHoldsItem: false },
});
addCase("wake-up slap doubles on sleeping target", {
  atk: { ...W, ability: "Pressure", ...base },
  def: { ...AG, ability: "Sturdy", status: "slp", ...base },
  move: "Wake-Up Slap",
});
addCase("eruption scales down with user hp (Charizard at 40%)", {
  atk: { ...CHA, ability: "Blaze", hpFraction: 0.4, ...base },
  def: { ...TAU, ability: "Intimidate", ...base },
  move: "Eruption",
});
addCase("reversal hits 150 bp at very low hp", {
  atk: { ...SNE, ability: "Immunity", hpFraction: 0.08, ...base },
  def: { ...TAU, ability: "Intimidate", ...base },
  move: "Reversal",
});
addCase("stored power scales with user boosts", {
  atk: { ...GAR, ability: "Levitate", boosts: { spa: 3 }, ...base },
  def: { ...TAU, ability: "Intimidate", ...base },
  move: "Stored Power",
});
addCase("punishment scales with defender boosts", {
  atk: { ...W, ability: "Pressure", ...base },
  def: { ...SNE, ability: "Immunity", boosts: { atk: 1, def: 2 }, ...base },
  move: "Punishment",
});
addCase("crush grip scales with target hp (Blissey at 50%)", {
  atk: { ...MAMP, ability: "Oblivious", ...base },
  def: { ...BLIS, ability: "Natural Cure", hpFraction: 0.5, ...base },
  move: "Crush Grip",
});
// Sheer Force: x1.3 on moves whose secondary is suppressed
addCase("sheer force boosts secondary move (Earth Power)", {
  atk: { species: "Nidoking", level: 100, ability: "Sheer Force", ...base },
  def: { ...BLIS, ability: "Natural Cure", ...base },
  move: "Earth Power",
});
// Sheer Force: no boost when the move has no suppressible secondary
addCase("sheer force no boost without secondary (Earthquake)", {
  atk: { species: "Nidoking", level: 100, ability: "Sheer Force", ...base },
  def: { ...BLIS, ability: "Natural Cure", ...base },
  move: "Earthquake",
});
// Scrappy lets Normal moves hit Ghost-types
addCase("scrappy hits ghost with normal move", {
  atk: { species: "Lopunny-Mega", level: 100, ability: "Scrappy", ...base },
  def: { ...GAR, ability: "Levitate", ...base },
  move: "Return",
});
// Shell Armor blocks a requested crit
addCase("shell armor blocks crit", {
  atk: { ...W, ability: "Pressure", ...base },
  def: { species: "Slowbro-Mega", level: 100, ability: "Shell Armor", ...base },
  move: "Knock Off",
  params: { crit: true },
});
// Infiltrator ignores Reflect
addCase("infiltrator ignores reflect", {
  atk: { species: "Crobat", level: 100, ability: "Infiltrator", ...base },
  def: { ...SNE, ability: "Immunity", ...base },
  move: "Brave Bird",
  params: { screens: "reflect" },
});

// Foul Play uses the DEFENDER's current Attack as the attack stat (Dark move).
addCase("foul play uses defender Atk (vs special mon)", {
  atk: { species: "Sableye", level: 100, ability: "Keen Eye", ...base },
  def: { species: "Alakazam", level: 100, ability: "Synchronize", ...base },
  move: "Foul Play",
});
addCase("foul play vs a physical mon", {
  atk: { species: "Sableye", level: 100, ability: "Keen Eye", ...base },
  def: { species: "Machamp", level: 100, ability: "Guts", ...base },
  move: "Foul Play",
});
addCase("foul play: defender Atk +2", {
  atk: { species: "Sableye", level: 100, ability: "Keen Eye", ...base },
  def: { species: "Machamp", level: 100, ability: "Guts", ...base, boosts: { atk: 2 } },
  move: "Foul Play",
});
addCase("foul play: crit ignores defender -Atk", {
  atk: { species: "Sableye", level: 100, ability: "Keen Eye", ...base },
  def: { species: "Machamp", level: 100, ability: "Guts", ...base, boosts: { atk: -2 } },
  move: "Foul Play",
  params: { crit: true },
});
addCase("foul play: attacker burn halves", {
  atk: { species: "Sableye", level: 100, ability: "Keen Eye", status: "brn", ...base },
  def: { species: "Machamp", level: 100, ability: "Guts", ...base },
  move: "Foul Play",
});
addCase("foul play: defender Unaware ignores its +Atk", {
  atk: { species: "Sableye", level: 100, ability: "Keen Eye", ...base },
  def: { species: "Quagsire", level: 100, ability: "Unaware", ...base, boosts: { atk: 2 } },
  move: "Foul Play",
});
addCase("foul play: attacker Huge Power still applies", {
  atk: { species: "Azumarill", level: 100, ability: "Huge Power", ...base },
  def: { species: "Machamp", level: 100, ability: "Guts", ...base },
  move: "Foul Play",
});

// Fairy/Dark Aura: a field condition raised by an ability on EITHER side, and
// Aura Break inverts it. The front resolves these into the field `auras`.
addCase("Fairy Aura attacker boosts a Fairy move", {
  atk: { species: "Xerneas", level: 100, ability: "Fairy Aura", ...base },
  def: { species: "Tauros", level: 100, ability: "Intimidate", ...base },
  move: "Moonblast",
});
addCase("Fairy Aura on the DEFENDER still boosts a Fairy move", {
  atk: { species: "Sylveon", level: 100, ability: "Cute Charm", ...base },
  def: { species: "Xerneas", level: 100, ability: "Fairy Aura", ...base },
  move: "Dazzling Gleam",
});
addCase("Dark Aura boosts a Dark move", {
  atk: { species: "Yveltal", level: 100, ability: "Dark Aura", ...base },
  def: { species: "Tauros", level: 100, ability: "Intimidate", ...base },
  move: "Dark Pulse",
});
addCase("Aura Break inverts an active aura", {
  atk: { species: "Xerneas", level: 100, ability: "Fairy Aura", ...base },
  def: { species: "Zygarde", level: 100, ability: "Aura Break", ...base },
  move: "Moonblast",
});
addCase("aura present but the move type does not match (no boost)", {
  atk: { species: "Yveltal", level: 100, ability: "Dark Aura", ...base },
  def: { species: "Tauros", level: 100, ability: "Intimidate", ...base },
  move: "Oblivion Wing",
});
addCase("Pixilate remap rides a defender's Fairy Aura", {
  atk: { species: "Altaria-Mega", level: 100, ability: "Pixilate", ...base },
  def: { species: "Xerneas", level: 100, ability: "Fairy Aura", ...base },
  move: "Hyper Voice",
});

// snapshot for building oracle combatant
const NEUTRAL = neutralNature.name;
const IVS31 = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

let pass = 0, fail = 0;
const { calcDamage } = await import("../dist/index.js");

const WEATHER_KEY = { sun: "Sun", rain: "Rain", sand: "Sand", hail: "Hail", desolate: "Harsh Sunshine", primordial: "Heavy Rain", delta: "Strong Winds" };
const TERRAIN_KEY = { electric: "Electric", grassy: "Grassy", misty: "Misty", psychic: "Psychic" };

for (const t of CASES) {
  const atkEntry = mon(t.atk.species);
  const defEntry = mon(t.def.species);
  const move = mv(t.move);
  const specStats = (entry, s) =>
    calcStats(entry.baseStats, { level: s.level ?? 100, nature: neutralNature, ivs: IVS31, evs: s.evs ?? {} });

  // our engine combatants
  const statsA = specStats(atkEntry, t.atk);
  const statsD = specStats(defEntry, t.def);
  const atkC = {
    name: atkEntry.name, types: atkEntry.types, level: t.atk.level ?? 100,
    stats: statsA, ability: t.atk.ability, item: t.atk.item,
    status: t.atk.status, boosts: t.atk.boosts ?? {}, hpFraction: t.atk.hpFraction ?? 1,
    weightKg: atkEntry.weightKg,
  };
  const defC = {
    name: defEntry.name, types: defEntry.types, level: t.def.level ?? 100,
    stats: statsD, ability: t.def.ability, item: t.def.item,
    status: t.def.status, boosts: t.def.boosts ?? {}, hpFraction: t.def.hpFraction ?? 1,
    weightKg: defEntry.weightKg,
  };

  // Aura field condition derived from the two abilities, the way fill.mjs
  // resolves it (the oracle reads the abilities itself).
  const auraTypeOf = (ab) => (ab === "Fairy Aura" ? "Fairy" : ab === "Dark Aura" ? "Dark" : null);
  const auras = [auraTypeOf(t.atk.ability), auraTypeOf(t.def.ability)].filter(Boolean);
  const auraBreak = t.atk.ability === "Aura Break" || t.def.ability === "Aura Break";

  // oracle combatants at identical params (stat formula identical to ours)
  const oAtk = new OPokemon(6, t.atk.species, {
    level: t.atk.level ?? 100, nature: NEUTRAL, ivs: IVS31, evs: t.atk.evs ?? {},
    ability: t.atk.ability, item: t.atk.item, status: t.atk.status, boosts: t.atk.boosts, gender: "M",
  });
  const oDef = new OPokemon(6, t.def.species, {
    level: t.def.level ?? 100, nature: NEUTRAL, ivs: IVS31, evs: t.def.evs ?? {},
    ability: t.def.ability, item: t.def.item, status: t.def.status, boosts: t.def.boosts, gender: "F",
  });
  // pass current HP when hpFraction < 1 so % HP abilities (Blaze/Multiscale) behave
  if ((t.atk.hpFraction ?? 1) < 1) oAtk.originalCurHP = Math.max(1, Math.floor(oAtk.stats.hp * t.atk.hpFraction));
  if ((t.def.hpFraction ?? 1) < 1) oDef.originalCurHP = Math.max(1, Math.floor(oDef.stats.hp * t.def.hpFraction));
  const oMove = new OMove(6, t.move, { isCrit: !!t.params.crit });
  const field = new OField({ weather: t.params.weather ? WEATHER_KEY[t.params.weather] : undefined });
  if (t.params.terrain) field.terrain = TERRAIN_KEY[t.params.terrain];
  if (t.params.screens === "reflect") field.defenderSide.isReflect = true;
  if (t.params.screens === "light") field.defenderSide.isLightScreen = true;
  if (t.params.targetHoldsItem && !oDef.item) oDef.item = "Leftovers";

  const oracle = calculate(6, oAtk, oDef, oMove, field).range();

  // our engine
  const ours = calcDamage({
    attacker: atkC, defender: defC, move, chart,
    crit: !!t.params.crit, weather: t.params.weather, terrain: t.params.terrain,
    auras, auraBreak,
    screens: t.params.screens, targetHoldsItem: t.params.targetHoldsItem,
    attackerHoldsItem: t.params.attackerHoldsItem,
    ignoresAbilities: t.params.ignoresAbilities,
  });

  const ok = ours.min === oracle[0] && ours.max === oracle[1];
  if (ok) { pass++; }
  else {
    fail++;
    console.log(`MISMATCH: ${t.label}\n  oracle: ${oracle.join("-")}  ours: ${ours.min}-${ours.max}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
