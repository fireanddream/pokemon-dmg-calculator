import { readFile } from "node:fs/promises";
import { TIER_LADDER } from "./types.js";
import type { Pokemon, StatdexData, StatdexMeta, Tier } from "./types.js";

function isTier(value: unknown): value is Tier {
  return typeof value === "string" && (TIER_LADDER as readonly string[]).includes(value);
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[\s'-]/g, "");
}

/** Load and validate the dataset JSON from disk. */
export async function loadStatdex(filePath: string): Promise<StatdexData> {
  const raw = await readFile(filePath, "utf8");
  const data: unknown = JSON.parse(raw);
  return validateStatdex(data);
}

/** Validate an already-parsed dataset object. */
export function validateStatdex(data: unknown): StatdexData {
  if (typeof data !== "object" || data === null) {
    throw new Error("Statdex data must be an object");
  }
  const { meta, pokemon } = data as { meta?: unknown; pokemon?: unknown };
  if (typeof meta !== "object" || meta === null) {
    throw new Error("Statdex data is missing a valid `meta` object");
  }
  if (!Array.isArray(pokemon)) {
    throw new Error("Statdex data is missing a `pokemon` array");
  }
  for (const entry of pokemon) {
    validatePokemon(entry);
  }
  const typedMeta = meta as unknown as StatdexMeta;
  return { meta: typedMeta, pokemon: pokemon as unknown as Pokemon[] };
}

function validatePokemon(entry: unknown): void {
  if (typeof entry !== "object" || entry === null) {
    throw new Error("Each pokemon entry must be an object");
  }
  const p = entry as Record<string, unknown>;
  const missing = [
    "name",
    "baseForme",
    "nationalDex",
    "types",
    "abilities",
    "baseStats",
    "bst",
    "weightKg",
    "tier",
    "isFullyEvolved",
    "evolvesTo",
    "alternateFormes",
  ].filter((key) => !(key in p));
  if (missing.length > 0) {
    throw new Error(`Pokemon entry is missing fields: ${missing.join(", ")}`);
  }
  if (!Array.isArray(p.types) || p.types.length === 0) {
    throw new Error(`${p.name}: ` + "`types` must be a non-empty array");
  }
  if (!Array.isArray(p.abilities) || p.abilities.length === 0) {
    throw new Error(`${p.name}: ` + "`abilities` must be a non-empty array");
  }
  if (!isTier(p.tier)) {
    throw new Error(`${p.name}: invalid tier "${String(p.tier)}"`);
  }
}

/** In-memory index over the dataset with convenience lookups. */
export class Statdex {
  private readonly byName = new Map<string, Pokemon>();
  private readonly byDex = new Map<number, Pokemon[]>();

  private constructor(
    public readonly meta: StatdexMeta,
    public readonly pokemon: readonly Pokemon[]
  ) {
    for (const mon of pokemon) {
      this.byName.set(normalizeName(mon.name), mon);
      const list = this.byDex.get(mon.nationalDex) ?? [];
      list.push(mon);
      this.byDex.set(mon.nationalDex, list);
    }
  }

  static from(data: StatdexData): Statdex {
    return new Statdex(data.meta, data.pokemon);
  }

  static async fromFile(filePath: string): Promise<Statdex> {
    return Statdex.from(await loadStatdex(filePath));
  }

  /** Look up a single Pokemon by exact name (case/dash/space-insensitive). */
  get(name: string): Pokemon | undefined {
    return this.byName.get(normalizeName(name));
  }

  /** Look up a single Pokemon by name, returning every matching entry. */
  getAll(name: string): Pokemon[] {
    return this.pokemon.filter(
      (mon) => normalizeName(mon.name) === normalizeName(name)
    );
  }

  /** All Pokemon sharing a national dex number (base + formes). */
  getByNationalDex(dex: number): Pokemon[] {
    return this.byDex.get(dex) ?? [];
  }

  /** All Pokemon in a given tier (or list of tiers). */
  byTier(...tiers: Tier[]): Pokemon[] {
    const wanted = new Set(tiers);
    return this.pokemon.filter((mon) => wanted.has(mon.tier));
  }

  /** All Pokemon whose types include every given type. */
  hasAllTypes(...types: string[]): Pokemon[] {
    const wanted = new Set(types);
    return this.pokemon.filter((mon) =>
      types.every((t) => mon.types.includes(t))
    );
  }

  /** Whether a name exists in the index. */
  has(name: string): boolean {
    return this.byName.has(normalizeName(name));
  }

  get size(): number {
    return this.pokemon.length;
  }
}
