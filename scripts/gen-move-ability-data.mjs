import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "..", "data");
const RAW = path.join(DATA_DIR, "_raw-xy-basics.json");

const NO_EFFECT = "No direct effect on damage calculation.";

// Hand-authored notes (gen 6) describing how each ability affects damage.
// Missing entries default to NO_EFFECT and are reported at generation time.
const ABILITY_DAMAGE_NOTES = {
  "Adaptability": "STAB multiplier is 2x instead of 1.5x.",
  "Aerilate": "Normal-type moves become Flying-type and deal 1.3x power.",
  "Aftermath": "No effect on the user's damage. Foes that KO this Pokemon with a contact move lose 1/4 of their max HP.",
  "Air Lock": "Negates all weather effects (none of the weather damage/type modifiers apply).",
  "Analytic": "Deals 1.3x damage if the user moves after its target.",
  "Anger Point": "Indirect: taking a critical hit raises Attack to +6 stages.",
  "Anticipation": "No damage effect (reveals whether a foe has a damaging or super-effective move).",
  "Arena Trap": "No damage effect. Prevents grounded foes from switching out.",
  "Aroma Veil": "No damage effect.",
  "Aura Break": "Inverts Dark Aura and Fairy Aura: affected types deal 0.75x instead of 1.33x.",
  "Bad Dreams": "No effect on attack damage. Sleeping foes lose 1/8 max HP each turn.",
  "Battle Armor": "Blocks critical hits against this Pokemon.",
  "Big Pecks": "No damage effect.",
  "Blaze": "Fire-type moves deal 1.5x damage while at 1/3 or less of max HP.",
  "Bulletproof": "Immune to ball and bomb moves (no damage taken from them).",
  "Cheek Pouch": "No damage effect.",
  "Chlorophyll": "No damage multiplier; Speed is doubled in harsh sunlight.",
  "Clear Body": "No damage effect.",
  "Cloud Nine": "No damage effect; negates all weather.",
  "Color Change": "No damage effect.",
  "Competitive": "Indirect: +2 SpA when a stat is lowered.",
  "Compound Eyes": "Accuracy of the user's moves is 1.3x (affects accuracy checks, not raw damage).",
  "Contrary": "Stat stage changes are inverted.",
  "Cursed Body": "No damage effect.",
  "Cute Charm": "No damage effect.",
  "Damp": "No damage effect; prevents self-destructing moves.",
  "Dark Aura": "Dark-type moves used by all Pokemon on the field deal 4/3x (1.33x) damage.",
  "Defeatist": "Attack and SpA are halved while at 1/2 or less of max HP.",
  "Defiant": "Indirect: +2 Atk when a stat is lowered.",
  "Delta Stream": "Strong winds are active: Flying-type weaknesses are removed (affects type effectiveness).",
  "Desolate Land": "Harsh sunlight is active: Fire boosted, and Water-type moves fail entirely.",
  "Download": "On switch-in, compares foe's Defense to SpD: +1 Atk if foe's Def is lower, otherwise +1 SpA.",
  "Drizzle": "Summons rain on switch-in (Water x1.5, Fire x0.5).",
  "Drought": "Summons harsh sunlight on switch-in (Fire x1.5, Water x0.5).",
  "Dry Skin": "Water-type moves against this Pokemon heal it 1/4 max HP; Fire-type moves deal 1.25x damage. Rain heals 1/8 per turn; sun damages 1/8 per turn.",
  "Early Bird": "No damage effect.",
  "Effect Spore": "No damage effect.",
  "Fairy Aura": "Fairy-type moves used by all Pokemon on the field deal 4/3x (1.33x) damage.",
  "Filter": "Super-effective hits against this Pokemon deal 0.75x damage.",
  "Flame Body": "No damage effect.",
  "Flare Boost": "SpA is 1.5x while the user is burned.",
  "Flash Fire": "Immune to Fire-type moves; after being hit by one, the user's Fire moves deal 1.5x.",
  "Flower Gift": "In harsh sunlight, Attack and SpD of the user and its allies are 1.5x.",
  "Flower Veil": "No damage effect.",
  "Forecast": "Castform's type changes with the weather (no damage multiplier by itself).",
  "Forewarn": "No damage effect.",
  "Friend Guard": "All damage taken by allies is x0.75.",
  "Frisk": "No damage effect.",
  "Fur Coat": "Physical damage taken is halved (x0.5).",
  "Gale Wings": "No power change; Flying-type moves gain +1 priority while at full HP.",
  "Gluttony": "No damage effect.",
  "Gooey": "No damage effect.",
  "Grass Pelt": "Defense is 1.5x while Grassy Terrain is active (reduces incoming physical damage).",
  "Guts": "Attack is 1.5x while afflicted by a major status condition.",
  "Harvest": "No damage effect.",
  "Healer": "No damage effect.",
  "Heatproof": "Fire-type damage against this Pokemon is x0.5.",
  "Heavy Metal": "No damage effect (doubles weight, matters only for weight-based moves).",
  "Honey Gather": "No damage effect.",
  "Huge Power": "Attack is doubled (x2).",
  "Hustle": "Attack is 1.5x, but physical move accuracy is x0.8.",
  "Hydration": "No damage effect.",
  "Hyper Cutter": "No damage effect.",
  "Ice Body": "No damage effect.",
  "Illuminate": "No damage effect.",
  "Illusion": "No damage effect.",
  "Immunity": "No damage effect.",
  "Imposter": "No damage effect (transforms into the target).",
  "Infiltrator": "Ignores the target's Substitute, Light Screen, and Reflect.",
  "Inner Focus": "No damage effect.",
  "Insomnia": "No damage effect.",
  "Intimidate": "Indirect: lowers the Attack of adjacent foes by one stage on switch-in.",
  "Iron Barbs": "No effect on user's damage; contact attackers lose 1/8 max HP.",
  "Iron Fist": "Punching moves deal 1.2x damage.",
  "Justified": "Indirect: +1 Atk when hit by a Dark-type move.",
  "Keen Eye": "No damage effect.",
  "Klutz": "No damage effect.",
  "Leaf Guard": "No damage effect.",
  "Levitate": "Immune to Ground-type moves.",
  "Light Metal": "No damage effect (halves weight, matters only for weight-based moves).",
  "Lightning Rod": "Draws Electric moves (immune to them) and gains +1 SpA.",
  "Limber": "No damage effect.",
  "Liquid Ooze": "No effect on the user's damage; draining moves against this Pokemon damage the attacker instead.",
  "Magic Bounce": "No damage effect.",
  "Magic Guard": "No effect on attack damage; the user takes no indirect damage (weather, status, hazards, recoil).",
  "Magician": "No damage effect.",
  "Magma Armor": "No damage effect.",
  "Magnet Pull": "No damage effect.",
  "Marvel Scale": "Defense is 1.5x while afflicted by a major status condition (reduces incoming physical damage).",
  "Mega Launcher": "Aura and Pulse moves deal 1.5x damage.",
  "Minus": "No damage effect.",
  "Mold Breaker": "The user's moves ignore the target's ability.",
  "Moody": "No damage effect (random stat stage changes each turn).",
  "Motor Drive": "Immune to Electric-type moves; each hit raises Speed by one stage.",
  "Moxie": "Indirect: +1 Atk after knocking out a foe.",
  "Multiscale": "Damage taken is x0.5 while at full HP.",
  "Multitype": "No damage effect.",
  "Mummy": "No damage effect.",
  "Natural Cure": "No damage effect.",
  "No Guard": "Both the user's and its target's moves never miss.",
  "Normalize": "All of the user's moves become Normal-type (affects STAB and type effectiveness).",
  "Oblivious": "No damage effect.",
  "Overcoat": "No damage effect.",
  "Overgrow": "Grass-type moves deal 1.5x damage while at 1/3 or less of max HP.",
  "Own Tempo": "No damage effect.",
  "Parental Bond": "Attacks hit twice; the second hit deals 0.5x power.",
  "Pickpocket": "No damage effect.",
  "Pickup": "No damage effect.",
  "Pixilate": "Normal-type moves become Fairy-type and deal 1.3x power.",
  "Plus": "No damage effect.",
  "Poison Heal": "No damage effect (heals 1/8 max HP per turn while poisoned).",
  "Poison Point": "No damage effect.",
  "Poison Touch": "No damage effect.",
  "Prankster": "No effect on damaging moves; status moves gain +1 priority.",
  "Pressure": "No damage effect.",
  "Primordial Sea": "Heavy rain is active: Water boosted, and Fire-type moves fail entirely.",
  "Protean": "The user becomes the type of the move it uses (grants STAB on that move).",
  "Pure Power": "Attack is doubled (x2).",
  "Quick Feet": "No damage multiplier; Speed is doubled while afflicted by a major status condition.",
  "Rain Dish": "No damage effect.",
  "Rattled": "No damage effect.",
  "Reckless": "Moves that have recoil damage deal 1.2x power.",
  "Refrigerate": "Normal-type moves become Ice-type and deal 1.3x power.",
  "Regenerator": "No damage effect.",
  "Rivalry": "Moves deal 1.25x vs a same-gender foe and 0.75x vs an opposite-gender foe.",
  "Rock Head": "No power change; the user takes no recoil damage.",
  "Rough Skin": "No effect on user's damage; contact attackers lose 1/8 max HP.",
  "Run Away": "No damage effect.",
  "Sand Force": "Ground/Rock/Steel moves deal 1.3x while sandstorm is active.",
  "Sand Rush": "No damage multiplier; Speed is doubled in sandstorm.",
  "Sand Stream": "Summons sandstorm on switch-in.",
  "Sand Veil": "No damage effect.",
  "Sap Sipper": "Immune to Grass-type moves; each hit raises Attack by one stage.",
  "Scrappy": "The user can hit Ghost-types with Normal- and Fighting-type moves.",
  "Serene Grace": "No damage effect (doubles secondary-effect chances).",
  "Shadow Tag": "No damage effect.",
  "Shed Skin": "No damage effect.",
  "Sheer Force": "Moves with a secondary effect deal 1.3x damage but lose the secondary effect.",
  "Shell Armor": "Blocks critical hits against this Pokemon.",
  "Shield Dust": "No damage effect.",
  "Simple": "Stat stage changes applied to this Pokemon are doubled.",
  "Skill Link": "No power change; multi-hit moves always hit the maximum number of times.",
  "Slow Start": "Attack and Speed are halved for the user's first 5 turns on the field.",
  "Sniper": "Critical hits deal 3x damage instead of 2x.",
  "Snow Cloak": "No damage effect.",
  "Snow Warning": "Summons hail on switch-in.",
  "Solar Power": "SpA is 1.5x in harsh sunlight, but the user loses 1/8 max HP each turn in sun.",
  "Solid Rock": "Super-effective hits against this Pokemon deal 0.75x damage.",
  "Soundproof": "Immune to sound-based moves.",
  "Speed Boost": "No damage multiplier; Speed rises one stage each turn.",
  "Stall": "No damage effect (user moves last within its priority bracket).",
  "Stance Change": "Aegislash-specific: in Shield Forme, Def/SpD are 150 each; when using a damaging move it changes to Blade Forme (Atk/SpA 150 each).",
  "Static": "No damage effect.",
  "Steadfast": "No damage effect.",
  "Stench": "No damage effect.",
  "Sticky Hold": "No damage effect.",
  "Storm Drain": "Draws Water-type moves (immune to them) and gains +1 SpA.",
  "Strong Jaw": "Biting moves deal 1.5x damage.",
  "Sturdy": "No power change; survives a KO hit from full HP with 1 HP.",
  "Suction Cups": "No damage effect.",
  "Super Luck": "Critical hit rate is +1 stage.",
  "Swarm": "Bug-type moves deal 1.5x damage while at 1/3 or less of max HP.",
  "Sweet Veil": "No damage effect.",
  "Swift Swim": "No damage multiplier; Speed is doubled in rain.",
  "Symbiosis": "No damage effect.",
  "Synchronize": "No damage effect.",
  "Tangled Feet": "No damage effect.",
  "Technician": "Moves with base power 60 or less deal 1.5x damage.",
  "Telepathy": "No damage effect.",
  "Teravolt": "The user's moves ignore the target's ability.",
  "Thick Fat": "Fire- and Ice-type damage against this Pokemon is x0.5.",
  "Tinted Lens": "Not-very-effective moves deal 2x damage (i.e. a 0.5x move deals 1x).",
  "Torrent": "Water-type moves deal 1.5x damage while at 1/3 or less of max HP.",
  "Tough Claws": "Contact moves deal 1.3x damage.",
  "Toxic Boost": "Attack is 1.5x while the user is poisoned.",
  "Trace": "No damage effect (copies the target's ability).",
  "Truant": "No direct multiplier; the user cannot move every other turn.",
  "Turboblaze": "The user's moves ignore the target's ability.",
  "Unaware": "Ignores the target's stat stage changes when attacking or being attacked.",
  "Unburden": "No damage multiplier; Speed doubles once the held item is consumed.",
  "Unnerve": "No damage effect.",
  "Victory Star": "The user and its allies' move accuracy is x1.1.",
  "Vital Spirit": "No damage effect.",
  "Volt Absorb": "Immune to Electric-type moves; each one heals 1/4 of max HP.",
  "Water Absorb": "Immune to Water-type moves; each one heals 1/4 of max HP.",
  "Water Veil": "No damage effect.",
  "Weak Armor": "No damage effect.",
  "White Smoke": "No damage effect.",
  "Wonder Guard": "Only super-effective moves deal damage to this Pokemon.",
  "Wonder Skin": "No damage effect.",
  "Zen Mode": "At 1/2 or less max HP, Darmanitan transforms into Zen Mode (Fire/Psychic, lower Atk, higher Def/SpD/SpA).",
};

const SORT_BY_NAME = (a, b) => a.name.localeCompare(b.name);

async function main() {
  const dump = JSON.parse(await readFile(RAW, "utf8"));

  // --- Abilities: Standard, XY-scoped ---
  const abilities = dump.abilities
    .filter((a) => a.isNonstandard === "Standard")
    .map((a) => {
      const damageEffect = ABILITY_DAMAGE_NOTES[a.name] ?? NO_EFFECT;
      return { name: a.name, description: a.description, damageEffect };
    })
    .sort(SORT_BY_NAME);

  const missingNotes = dump.abilities
    .filter((a) => a.isNonstandard === "Standard")
    .filter((a) => !ABILITY_DAMAGE_NOTES[a.name])
    .map((a) => a.name);

  // --- Moves: Standard, XY-scoped (all categories; damaging = Physical/Special) ---
  const moves = dump.moves
    .filter((m) => m.isNonstandard === "Standard")
    .map((m) => ({
      name: m.name,
      type: m.type,
      category: m.category,
      power: m.power,
      accuracy: m.accuracy,
      priority: m.priority,
      pp: m.pp,
      target: m.target,
      flags: [...m.flags],
      description: m.description,
    }))
    .sort(SORT_BY_NAME);

  const writeJson = (file, data) =>
    writeFile(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));

  await writeJson("types-xy.json", {
    meta: {
      source: "https://www.smogon.com/dex/xy/ (RPC: dump-basics)",
      generation: "xy",
      scope: "Gen-6 type chart: for each attacking type, its effectiveness vs every defending type",
      count: dump.types.length,
      generatedAt: new Date().toISOString(),
    },
    types: dump.types.map((t) => ({
      name: t.name,
      atk_effectives: t.atk_effectives,
    })),
  });

  await writeJson("natures-xy.json", {
    meta: {
      source: "https://www.smogon.com/dex/xy/ (RPC: dump-basics)",
      generation: "xy",
      scope: "The 25 natures with their stat multipliers",
      count: dump.natures.length,
      generatedAt: new Date().toISOString(),
    },
    natures: dump.natures.map((n) => ({
      name: n.name,
      multipliers: {
        hp: n.hp, atk: n.atk, def: n.def, spa: n.spa, spd: n.spd, spe: n.spe,
      },
      summary: n.summary,
    })),
  });

  await writeJson("abilities-xy.json", {
    meta: {
      source: "https://www.smogon.com/dex/xy/ (RPC: dump-basics)",
      generation: "xy",
      scope: "All Standard abilities legal in XY",
      count: abilities.length,
      fieldNotes: {
        damageEffect: "Hand-authored summary (gen 6) of how the ability changes damage dealt or taken.",
      },
      generatedAt: new Date().toISOString(),
    },
    abilities,
  });

  await writeJson("moves-xy.json", {
    meta: {
      source: "https://www.smogon.com/dex/xy/ (RPC: dump-basics)",
      generation: "xy",
      scope: "All Standard moves legal in XY (includes Non-Damaging; filter category to keep Physical/Special for damage)",
      count: moves.length,
      generatedAt: new Date().toISOString(),
    },
    moves,
  });

  const damaging = moves.filter((m) => m.category !== "Non-Damaging").length;
  console.log(`abilities-xy.json: ${abilities.length} abilities`);
  console.log(`moves-xy.json: ${moves.length} moves (${damaging} damaging)`);
  if (missingNotes.length > 0) {
    console.warn(`WARNING: no authored note for ${missingNotes.length} abilities (defaulted to NO_EFFECT):`);
    console.warn(missingNotes.join(", "));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
