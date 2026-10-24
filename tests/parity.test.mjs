// Checks that the browser model (public/model.js) reproduces sklearn exactly.
// Run: node tests/parity.test.mjs   (after python export_web.py)
import { readFileSync } from "node:fs";
import { forecastRows, parseCSV, predictProba } from "../public/model.js";

const M = JSON.parse(readFileSync(new URL("../public/model.json", import.meta.url)));
const P = JSON.parse(readFileSync(new URL("./parity_rows.json", import.meta.url)));

let worst = 0;
P.x.forEach((x, i) => {
  const p = predictProba(M, x);
  p.forEach((v, k) => { worst = Math.max(worst, Math.abs(v - P.proba[i][k])); });
});
console.log(`predictProba vs sklearn on ${P.x.length} rows: max abs diff ${worst.toExponential(2)}`);
if (worst > 1e-5) throw new Error("JS model disagrees with sklearn");

// Feature pipeline: template CSV -> forecasts must equal the Python test rows for the same hours
const test = JSON.parse(readFileSync(new URL("../public/test_days.json", import.meta.url)));
const { records } = parseCSV(readFileSync(new URL("../public/traffic_template.csv", import.meta.url), "utf8"));
const rows = forecastRows(M, records);
let checked = 0;
for (const r of rows) {
  const iso = new Date(r.time).toISOString().slice(0, 13) + ":00";
  const ref = test.find((t) => t.time === iso);
  if (!ref) continue;
  // the 5-day template has no last-week reading (nor "yesterday" on its first day): skip those lags
  const firstDay = iso.startsWith("2018-09-10");
  M.features.forEach((f, i) => {
    if (f === "vol_lastweek" || (firstDay && f === "vol_yday")) return;
    const a = r.x[i]; const b = ref.x[i];
    if (!((a === null && b === null) || Math.abs(a - b) < 1e-3)) throw new Error(`${iso} ${f}: js=${a} py=${b}`);
  });
  if (r.actual !== ref.actual) throw new Error(`${iso} actual level mismatch`);
  checked++;
}
console.log(`CSV feature pipeline matches Python on ${checked} forecast rows (+${rows.length - checked} future)`);
if (!checked) throw new Error("no rows compared");
