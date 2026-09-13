// typechart.mjs — the built type chart (a Map). Split out of data.mjs so the
// dist-free datasets (data.mjs) can be imported by lightweight, engine-free
// consumers (lookup.mjs, verify:lookup) without pulling in the TypeScript build.
import { buildTypeChart } from "../dist/index.js";
import { typesData } from "./data.mjs";

export const chart = buildTypeChart(typesData.types);
