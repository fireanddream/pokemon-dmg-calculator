import type { TypeChartEntry, TypeName } from "./types.js";

/** Build a Map: attacking type -> (defending type -> multiplier). */
export function buildTypeChart(entries: TypeChartEntry[]): Map<TypeName, Map<TypeName, number>> {
  const chart = new Map<TypeName, Map<TypeName, number>>();
  for (const entry of entries) {
    const row = new Map<TypeName, number>();
    for (const [defType, mult] of entry.atk_effectives) {
      row.set(defType, mult);
    }
    chart.set(entry.name, row);
  }
  return chart;
}

/**
 * Overall effectiveness of an attacking type against a list of defending types.
 * Returns 0 when immune. Multipliers of the defender's types are multiplied.
 */
export function typeEffectiveness(
  chart: Map<TypeName, Map<TypeName, number>>,
  attacking: TypeName,
  defending: readonly TypeName[]
): number {
  const row = chart.get(attacking);
  if (!row) return 1;
  let result = 1;
  for (const def of defending) {
    result *= row.get(def) ?? 1;
  }
  return result;
}
