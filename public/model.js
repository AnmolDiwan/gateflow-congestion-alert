// Browser-side model: runs the exported HistGradientBoosting trees (model.json) and rebuilds the
// same features as features.py, so manual entry and CSV upload need no Python server.
// Parity with sklearn is checked by tests/parity.test.mjs.

const HOUR = 3600 * 1000;
const TARGET_HOURS = [8, 9];
const WEATHER_GROUPS = {
  Clear: "Clear", Clouds: "Clouds", Rain: "Rain", Drizzle: "Rain", Thunderstorm: "Rain", Squall: "Rain",
  Snow: "Snow", Mist: "Fog/Mist", Fog: "Fog/Mist", Haze: "Fog/Mist", Smoke: "Fog/Mist", "Fog/Mist": "Fog/Mist",
};
const SEVERITY = { Clear: 0, Clouds: 1, "Fog/Mist": 2, Rain: 3, Snow: 4 };

export function predictProba(M, x) {
  const raw = M.baseline.slice();
  for (const perClass of M.trees) {
    for (let k = 0; k < perClass.length; k++) {
      const t = perClass[k];
      let n = 0;
      while (!t.leaf[n]) {
        const v = x[t.f[n]];
        const left = v === null || v === undefined || Number.isNaN(v) ? t.m[n] : v <= t.t[n];
        n = left ? t.l[n] : t.r[n];
      }
      raw[k] += t.v[n];
    }
  }
  const mx = Math.max(...raw);
  const e = raw.map((r) => Math.exp(r - mx));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

export function levelOf(M, volume) {
  if (volume === null || volume === undefined || Number.isNaN(volume)) return null;
  const [lo, hi] = M.level_bins;
  return volume < lo ? "Low" : volume < hi ? "Moderate" : "High";
}

// Change in P(High) when each factor group is reset to the "calm" reference (see features.py).
export function contributions(M, x) {
  const idx = Object.fromEntries(M.features.map((f, i) => [f, i]));
  const pHigh = predictProba(M, x)[2];
  const out = Object.entries(M.factor_groups).map(([name, cols]) => {
    const xr = x.slice();
    for (const c of cols) xr[idx[c]] = M.reference[c];
    if (name === "Recent volume & trend") xr[idx.vol_trend] = xr[idx.vol_now] - xr[idx.vol_prev];
    return { factor: name, delta: pHigh - predictProba(M, xr)[2] };
  });
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// ---------- time helpers (naive local clock times stored as UTC milliseconds) ----------
export function parseTime(s) {
  const m = String(s).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2})(?::(\d{1,2}))?/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], 0);
}
export const dayStart = (t) => t - (t % (24 * HOUR));
export const hourOf = (t) => new Date(t).getUTCHours();
export const dowOf = (t) => (new Date(t).getUTCDay() + 6) % 7; // Mon=0
export function fmtTime(t, opts = {}) {
  return new Date(t).toLocaleString("en-GB", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short",
    year: "numeric", ...opts });
}

const num = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// records: [{time, volume, weather, tempK, rain, snow, clouds, holiday}] (one or more per hour)
export function hourly(records) {
  const byHour = new Map();
  for (const r of records) {
    if (r.time === null) continue;
    if (!byHour.has(r.time)) byHour.set(r.time, []);
    byHour.get(r.time).push(r);
  }
  const hours = new Map();
  const holidayDays = new Set();
  for (const [t, rs] of byHour) {
    rs.forEach((r) => { r.group = WEATHER_GROUPS[r.weather] || "Clouds"; });
    rs.sort((a, b) => SEVERITY[b.group] - SEVERITY[a.group]); // worst weather first, like features.load
    const mean = (k) => { const v = rs.map((r) => r[k]).filter((x) => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const max = (k) => { const v = rs.map((r) => r[k]).filter((x) => x !== null); return v.length ? Math.max(...v) : null; };
    let tempK = mean("tempK");
    if (tempK !== null && tempK < 200) tempK = null;
    const rain = max("rain");
    hours.set(t, { volume: rs[0].volume, weather: rs[0].group, tempK, rain: rain === null ? null : Math.min(rain, 60),
      snow: max("snow"), clouds: mean("clouds") });
    if (rs.some((r) => r.holiday)) holidayDays.add(dayStart(t));
  }
  return { hours, holidayDays };
}

// One forecast row per weekday target hour (08:00, 09:00) that has the readings it needs,
// including the next target hours after the last reading. Mirrors features.build_features.
export function forecastRows(M, records) {
  const { hours, holidayDays } = hourly(records);
  if (!hours.size) return [];
  const lead = M.lead_h;
  const times = [...hours.keys()];
  const first = dayStart(Math.min(...times));
  const last = dayStart(Math.max(...times));
  const vol = (t) => (hours.has(t) ? hours.get(t).volume : null);
  const rows = [];
  for (let d = first; d <= last; d += 24 * HOUR) {
    if (dowOf(d) > 4) continue;
    for (const h of TARGET_HOURS) {
      const T = d + h * HOUR;
      const obs = hours.get(T - (lead + 1) * HOUR);
      const volNow = vol(T - (lead + 1) * HOUR);
      if (!obs || volNow === null) continue;
      const volPrev = vol(T - (lead + 2) * HOUR);
      const f = {
        target_hour: h, dow: dowOf(T), month: new Date(T).getUTCMonth() + 1,
        vol_now: volNow, vol_prev: volPrev, vol_trend: volPrev === null ? null : volNow - volPrev,
        vol_yday: vol(T - 24 * HOUR), vol_lastweek: vol(T - 168 * HOUR),
        temp_c: obs.tempK === null ? null : obs.tempK - 273.15, rain_mm: obs.rain, snow_mm: obs.snow,
        clouds: obs.clouds, holiday_event: holidayDays.has(d) ? 1 : 0,
      };
      for (const w of M.weathers) f[`w_${w}`] = obs.weather === w ? 1 : 0;
      const actualVol = vol(T);
      rows.push({ time: T, x: M.features.map((c) => f[c]), weather: obs.weather, volume: actualVol,
        actual: levelOf(M, actualVol), holiday: holidayDays.has(d) ? "Holiday / event" : null });
    }
  }
  return rows;
}

// ---------- CSV ----------
function splitCSVLine(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const CSV_DEFAULTS = { weather_main: "Clear", temp: 288.15, rain_1h: 0, snow_1h: 0, clouds_all: 0, holiday: "None" };

// Returns {records, filled, error}. Columns as in the original dataset.
export function parseCSV(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return { error: "The file has no data rows." };
  const head = splitCSVLine(lines[0]).map((h) => h.toLowerCase());
  const missing = ["date_time", "traffic_volume"].filter((c) => !head.includes(c));
  if (missing.length) return { error: `Missing required column(s): ${missing.join(", ")}` };
  const filled = Object.keys(CSV_DEFAULTS).filter((c) => !head.includes(c));
  const col = (row, name) => (head.includes(name) ? row[head.indexOf(name)] : CSV_DEFAULTS[name]);
  const records = [];
  let bad = 0;
  for (const line of lines.slice(1)) {
    const row = splitCSVLine(line);
    const time = parseTime(col(row, "date_time"));
    const volume = num(col(row, "traffic_volume"));
    if (time === null || volume === null) { bad++; continue; }
    const hol = String(col(row, "holiday") ?? "").trim();
    records.push({ time, volume, weather: String(col(row, "weather_main")).trim(), tempK: num(col(row, "temp")),
      rain: num(col(row, "rain_1h")), snow: num(col(row, "snow_1h")), clouds: num(col(row, "clouds_all")),
      holiday: hol !== "" && hol !== "None" && hol.toLowerCase() !== "nan" });
  }
  if (!records.length) return { error: "No readable rows: check date_time (YYYY-MM-DD HH:MM) and traffic_volume." };
  return { records, filled, skipped: bad };
}
