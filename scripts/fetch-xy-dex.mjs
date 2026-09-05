import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

const RPC_URL = "https://www.smogon.com/dex/_rpc/dump-basics";
const GEN = "xy";

// Strongest -> weakest. BL tier "XXBL" = banned from XX, so it plays one tier up.
const TIER_LADDER = [
  "AG", "Uber", "OU", "UUBL", "UU", "RUBL", "RU", "NUBL", "NU",
  "PUBL", "PU", "ZUBL", "ZU",
];

// Tiers considered "RU or above" (for re-adding strong unevolved Pokemon).
const TIER_RU_OR_ABOVE = ["AG", "Uber", "OU", "UUBL", "UU", "RUBL", "RU"];

async function fetchBasics(gen) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gen }),
  });
  if (!res.ok) throw new Error(`RPC failed: ${res.status} ${res.statusText}`);
  return res.json();
}

// Forme entries (e.g. Venusaur-Mega, Aegislash-Blade) come back with oob=null;
// their base species is found via another entry's alternateFormes list.
function buildBaseLookup(pokemon) {
  const lookup = new Map();
  for (const p of pokemon) {
    if (!p.oob) continue;
    for (const alt of p.oob.alts) lookup.set(alt, p);
  }
  return lookup;
}

function toDexEntry(p, base) {
  const stats = {
    hp: p.hp, atk: p.atk, def: p.def, spa: p.spa, spd: p.spd, spe: p.spe,
  };
  const isForme = !p.oob;
  const evos = isForme ? base.oob.evos : p.oob.evos;
  const alts = isForme ? [] : p.oob.alts;
  return {
    name: p.name,
    baseForme: isForme ? base.name : p.name,
    nationalDex: isForme ? base.oob.dex_number : p.oob.dex_number,
    types: [...p.types],
    abilities: [...p.abilities],
    baseStats: stats,
    bst: Object.values(stats).reduce((a, b) => a + b, 0),
    weightKg: p.weight,
    tier: p.formats[0],
    isFullyEvolved: evos.length === 0,
    evolvesTo: [...evos],
    alternateFormes: [...alts],
  };
}

async function main() {
  const dump = await fetchBasics(GEN);
  const rawPath = path.join(DATA_DIR, `_raw-${GEN}-basics.json`);
  await writeFile(rawPath, JSON.stringify(dump, null, 2));

  const baseOf = buildBaseLookup(dump.pokemon);
  const resolves = (p) => (p.oob ? p : baseOf.get(p.name));
  const evosOf = (p) => resolves(p).oob.evos;

  const step1 = dump.pokemon.filter(
    (p) =>
      p.isNonstandard === "Standard" &&
      p.formats.length === 1 &&
      TIER_LADDER.includes(p.formats[0])
  );

  const fullyEvolved = step1.filter((p) => evosOf(p).length === 0);
  const unevolvedInLadder = step1.filter((p) => evosOf(p).length > 0);
  const readdedStrong = unevolvedInLadder.filter((p) =>
    TIER_RU_OR_ABOVE.includes(p.formats[0])
  );

  const selected = [...fullyEvolved, ...readdedStrong];
  selected.sort((a, b) => {
    const na = a.oob ? a.oob.dex_number : baseOf.get(a.name).oob.dex_number;
    const nb = b.oob ? b.oob.dex_number : baseOf.get(b.name).oob.dex_number;
    return na - nb || a.name.localeCompare(b.name);
  });

  const out = {
    meta: {
      source: "https://www.smogon.com/dex/xy/pokemon/ (RPC: dump-basics)",
      generation: GEN,
      tierLadder: TIER_LADDER,
      rule: [
        "Keep Standard (non-CAP) Pokemon whose tier is in tierLadder.",
        "Drop unevolved Pokemon (evolvesTo non-empty).",
        "Re-add dropped Pokemon whose tier is RU or above.",
      ],
      counts: {
        step1Tiered: step1.length,
        fullyEvolved: fullyEvolved.length,
        unevolvedInLadder: unevolvedInLadder.length,
        readdedRUOrAbove: readdedStrong.length,
        total: selected.length,
      },
      generatedAt: new Date().toISOString(),
    },
    pokemon: selected.map((p) => toDexEntry(p, resolves(p))),
  };

  const outPath = path.join(DATA_DIR, `${GEN}-pokemon.json`);
  await writeFile(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${out.pokemon.length} Pokemon -> ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
