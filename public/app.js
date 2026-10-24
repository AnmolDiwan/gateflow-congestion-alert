import { contributions, dayStart, fmtTime, forecastRows, hourOf, levelOf, parseCSV, parseTime, predictProba } from "./model.js";

const $ = (sel) => document.querySelector(sel);
const HOUR = 3600 * 1000;
const STATUS = {
  Low: { color: "var(--good)", ink: "var(--good-ink)", cls: "low" },
  Moderate: { color: "var(--warning)", ink: "var(--warning-ink)", cls: "moderate" },
  High: { color: "var(--critical)", ink: "var(--critical-ink)", cls: "high" },
};
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const hh = (h) => `${String(h).padStart(2, "0")}:00`;
const pct = (p) => `${Math.round(p * 100)}%`;
const fmtInt = (v) => (v === null || v === undefined ? "–" : Math.round(v).toLocaleString("en-US"));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let M, TEST, CASES = [];
const state = { mode: "replay", replayDay: null, replayHour: 8, uploadRows: null, uploadSel: 0, uploadNote: null };

// ---------- tooltip ----------
const tip = $("#tooltip");
function showTip(html, ev) {
  tip.innerHTML = html;
  tip.classList.add("on");
  const pad = 14; const r = tip.getBoundingClientRect();
  let x = ev.clientX + pad; let y = ev.clientY + pad;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
  tip.style.left = `${x}px`; tip.style.top = `${y}px`;
}
const hideTip = () => tip.classList.remove("on");

// ---------- theme ----------
$("#theme-btn").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch (e) { /* storage blocked */ }
});
try { const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* storage blocked */ }

// ---------- forecast rendering ----------
function featureMap(x) { return Object.fromEntries(M.features.map((f, i) => [f, x[i]])); }

function renderForecast(row, { context } = {}) {
  const proba = predictProba(M, row.x);
  const pHigh = proba[2];
  const level = M.levels[proba.indexOf(Math.max(...proba))];
  const f = featureMap(row.x);
  const h = hourOf(row.time);
  const win = `${hh(h)}–${hh(h + 1)}`;
  const madeAt = hh(h - M.lead_h);
  const day = fmtTime(row.time);
  const alertOn = pHigh >= M.alert_threshold;
  const cls = alertOn ? "high" : level === "Moderate" ? "moderate" : "low";
  const icons = {
    high: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.5"/></svg>',
    moderate: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16v.5"/></svg>',
    low: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  };
  const title = alertOn ? `High congestion expected ${win}` : level === "Moderate" ? `Moderate congestion likely ${win}` : `Traffic expected to flow normally ${win}`;
  const actions = alertOn
    ? `<ul><li>Notify students to leave about 20 minutes earlier</li><li>Open alternate Gate 3 and post a marshal at the junction</li><li>Run an extra shuttle from the main stop</li></ul>`
    : level === "Moderate" ? "<p>Dense traffic is likely. Keep an eye on the next forecast. No action needed yet.</p>" : "<p>No action needed.</p>";
  $("#alert").className = `alert ${cls}`;
  $("#alert").innerHTML = `
    <div class="alert-icon" aria-hidden="true">${icons[cls]}</div>
    <div><h2>${title}</h2><p>${esc(day)} · forecast made at ${madeAt}, ${M.lead_h} h ahead</p>${actions}</div>
    <div class="hero"><div class="num">${pct(pHigh)}</div><div class="lbl">chance of High</div></div>`;

  const v = $("#verdict");
  if (row.actual) {
    const ok = row.actual === level;
    v.hidden = false;
    v.innerHTML = `What actually happened: <b style="color:${STATUS[row.actual].ink}">${row.actual}</b> (${fmtInt(row.volume)} veh/h) · ${ok ? "forecast correct ✓" : "forecast missed ✗"}`;
  } else { v.hidden = true; }

  const trend = f.vol_trend === null ? "" : `${f.vol_trend >= 0 ? "▲" : "▼"} ${fmtInt(Math.abs(f.vol_trend))} vs hour before`;
  $("#kpis").innerHTML = `
    <div class="kpi"><div class="k">Forecast ${win}</div><div class="v"><span class="badge"><span class="sw" style="background:${STATUS[level].color}"></span>${level}</span></div><div class="d">${pct(proba[0])} Low · ${pct(proba[1])} Mod · ${pct(proba[2])} High</div></div>
    <div class="kpi"><div class="k">Volume ${hh(h - M.lead_h - 1)}–${hh(h - M.lead_h)}</div><div class="v">${fmtInt(f.vol_now)}<span class="d">veh/h</span></div><div class="d">${trend || "&nbsp;"}</div></div>
    <div class="kpi"><div class="k">Weather now</div><div class="v">${esc(row.weather)}</div><div class="d">${f.temp_c === null ? "" : `${f.temp_c.toFixed(0)} °C`}${f.rain_mm ? ` · rain ${f.rain_mm} mm` : ""}${f.snow_mm ? ` · snow ${f.snow_mm} mm` : ""}</div></div>
    <div class="kpi"><div class="k">Holiday / event</div><div class="v">${f.holiday_event ? "Yes" : "No"}</div><div class="d">${row.holiday ? esc(row.holiday) : "&nbsp;"}</div></div>`;

  renderRoad(f, level, pHigh, win);
  renderFactors(contributions(M, row.x));
  renderProbBar(proba, win);
}

// Neutral state when the inputs can't produce a forecast (so a stale result is never shown)
function renderEmpty(why) {
  $("#alert").className = "alert";
  $("#alert").innerHTML = `<div class="alert-icon" style="background:var(--ink-3)" aria-hidden="true">?</div><div><h2>No forecast yet</h2><p>${esc(why)}</p></div><div></div>`;
  $("#verdict").hidden = true;
  ["#kpis", "#roadmap", "#factors", "#probbar"].forEach((sel) => { $(sel).innerHTML = ""; });
}

// ---------- road view (schematic) ----------
function renderRoad(f, level, pHigh, win) {
  const up = levelOf(M, f.vol_now) || "Low";
  const segC = STATUS[level].color; const upC = STATUS[up].color;
  const pulse = pHigh >= M.alert_threshold ? '<animate attributeName="stroke-opacity" values="1;0.45;1" dur="1.3s" repeatCount="indefinite"/>' : "";
  $("#roadmap").innerHTML = `
  <svg viewBox="0 0 560 270" width="100%" role="img" aria-label="Schematic road: latest volume ${up}, forecast ${level}">
    <rect x="0" y="0" width="560" height="270" rx="12" fill="var(--wash)"/>
    <g opacity="0.55"><rect x="30" y="30" width="60" height="34" rx="5" fill="var(--grid)"/><rect x="110" y="22" width="44" height="42" rx="5" fill="var(--grid)"/><rect x="30" y="190" width="80" height="44" rx="5" fill="var(--grid)"/><rect x="140" y="200" width="50" height="34" rx="5" fill="var(--grid)"/><rect x="225" y="205" width="60" height="30" rx="5" fill="var(--grid)"/></g>
    <rect x="388" y="28" width="150" height="214" rx="14" fill="color-mix(in srgb, var(--good) 12%, var(--surface-1))" stroke="color-mix(in srgb, var(--good) 35%, transparent)"/>
    <text x="463" y="56" text-anchor="middle" class="t-strong" style="font-size:13px;letter-spacing:.08em">CAMPUS</text>
    <rect x="420" y="80" width="40" height="28" rx="4" fill="var(--grid)"/><rect x="470" y="80" width="46" height="40" rx="4" fill="var(--grid)"/><rect x="430" y="170" width="70" height="30" rx="4" fill="var(--grid)"/>
    <path d="M20 132 H200" stroke="var(--axis)" stroke-width="30" stroke-linecap="round" fill="none"/>
    <path d="M20 132 H200" stroke="${upC}" stroke-width="16" stroke-linecap="round" fill="none"/>
    <path d="M214 132 H380" stroke="var(--axis)" stroke-width="34" stroke-linecap="round" fill="none"/>
    <path d="M214 132 H380" stroke="${segC}" stroke-width="20" stroke-linecap="round" fill="none">${pulse}</path>
    <path d="M214 132 H380" stroke="var(--surface-1)" stroke-width="1.5" stroke-dasharray="8 8" fill="none" opacity=".8"/>
    <path d="M207 140 Q 250 228 430 226" stroke="var(--axis)" stroke-width="8" stroke-dasharray="10 7" fill="none" stroke-linecap="round"/>
    <circle cx="207" cy="132" r="10" fill="var(--surface-1)" stroke="var(--ink-3)" stroke-width="2"/>
    <rect x="380" y="114" width="16" height="36" rx="3" fill="var(--ink-2)"/>
    <text x="404" y="137" class="t-strong">Main Gate</text>
    <rect x="430" y="219" width="28" height="14" rx="3" fill="var(--ink-3)"/>
    <text x="466" y="231" class="t-muted">Gate 3 (alt.)</text>
    <text x="110" y="104" text-anchor="middle" class="t-muted">Latest hour</text>
    <text x="110" y="168" text-anchor="middle" class="t-strong">${fmtInt(f.vol_now)} veh/h · ${up}</text>
    <text x="297" y="100" text-anchor="middle" class="t-muted">Approach road ${win}</text>
    <text x="297" y="172" text-anchor="middle" class="t-strong">${level} · ${pct(pHigh)} High</text>
  </svg>
  <div class="legend">
    <span><i class="sq" style="background:var(--good)"></i>Low &lt; ${fmtInt(M.level_bins[0])} veh/h</span>
    <span><i class="sq" style="background:var(--warning)"></i>Moderate</span>
    <span><i class="sq" style="background:var(--critical)"></i>High ≥ ${fmtInt(M.level_bins[1])} veh/h</span>
  </div>`;
}

// ---------- factor contributions (diverging bars, HTML so labels keep their size) ----------
function renderFactors(contrib) {
  const maxAbs = Math.max(0.05, ...contrib.map((c) => Math.abs(c.delta)));
  const rows = contrib.map((c, i) => {
    const w = (Math.abs(c.delta) / maxAbs) * 50;
    const up = c.delta >= 0;
    const val = `${up ? "+" : "−"}${Math.abs(c.delta * 100).toFixed(1)} pt`;
    return `<div class="bar-row hit" data-i="${i}"><div class="bar-label">${esc(c.factor)}</div>
      <div class="dtrack"><span class="dbar ${up ? "up" : "down"}" style="width:${Math.max(w, 0.6)}%"></span></div>
      <div class="bar-val">${val}</div></div>`;
  }).join("");
  $("#factors").innerHTML = `<div class="bars">${rows}
      <div class="bar-row axis"><div></div><div class="dtrack-axis"><span>← lowers risk</span><span>0</span><span>raises risk →</span></div><div></div></div></div>
    <div class="legend"><span><i class="sq" style="background:var(--div-up)"></i>Raises chance of High</span><span><i class="sq" style="background:var(--div-down)"></i>Lowers it</span></div>`;
  $("#factors").querySelectorAll(".hit").forEach((g) => {
    const c = contrib[+g.dataset.i];
    g.addEventListener("mousemove", (ev) => showTip(`<b>${esc(c.factor)}</b><br>${c.delta >= 0 ? "Raises" : "Lowers"} P(High) by ${Math.abs(c.delta * 100).toFixed(1)} points compared with a calm reference value`, ev));
    g.addEventListener("mouseleave", hideTip);
  });
}

function renderProbBar(proba, win) {
  const W = 520; const gap = 2; let x = 0;
  const segs = M.levels.map((l, i) => {
    const w = Math.max(proba[i] * (W - gap * 2), 0); const s = `<rect class="seg-hit" data-i="${i}" x="${x}" y="0" width="${w}" height="16" rx="4" fill="${STATUS[l].color}"/>`;
    x += w + gap; return s;
  }).join("");
  $("#probbar").innerHTML = `
    <div class="field-label" style="margin-bottom:6px">Class probabilities ${win}</div>
    <svg viewBox="0 0 ${W} 16" width="100%" preserveAspectRatio="none" style="height:16px;display:block">${segs}</svg>
    <div class="legend">${M.levels.map((l, i) => `<span><i class="sq" style="background:${STATUS[l].color}"></i>${l} ${pct(proba[i])}</span>`).join("")}</div>`;
  $("#probbar").querySelectorAll(".seg-hit").forEach((r) => {
    const i = +r.dataset.i;
    r.addEventListener("mousemove", (ev) => showTip(`<b>${M.levels[i]}</b>: ${(proba[i] * 100).toFixed(1)}%`, ev));
    r.addEventListener("mouseleave", hideTip);
  });
}

// ---------- timeline (P(High) line + actual-level dots) ----------
function renderTimeline(rows, selTime, onPick) {
  const W = 900; const H = 250; const L = 44; const R = 16; const T = 14; const B = 34;
  if (!rows.length) { $("#timeline").innerHTML = '<p class="hint">No forecasts to show.</p>'; return; }
  const pts = rows.map((r) => ({ r, p: predictProba(M, r.x)[2] }));
  const t0 = rows[0].time; const t1 = rows[rows.length - 1].time;
  const sx = (t) => (t1 === t0 ? (L + W - R) / 2 : L + ((t - t0) / (t1 - t0)) * (W - L - R));
  const sy = (p) => T + (1 - p) * (H - T - B);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((p) => `<line x1="${L}" x2="${W - R}" y1="${sy(p)}" y2="${sy(p)}" class="gridline"/><text x="${L - 8}" y="${sy(p) + 4}" text-anchor="end" class="t-muted">${p * 100}%</text>`).join("");
  const nTicks = Math.min(6, rows.length);
  const ticks = Array.from({ length: nTicks }, (_, i) => rows[Math.round((i * (rows.length - 1)) / Math.max(nTicks - 1, 1))])
    .map((r) => `<text x="${sx(r.time)}" y="${H - 10}" text-anchor="middle" class="t-muted">${new Date(r.time).toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short" })}</text>`).join("");
  const path = pts.map((d, i) => `${i ? "L" : "M"}${sx(d.r.time).toFixed(1)},${sy(d.p).toFixed(1)}`).join("");
  const dots = pts.map((d, i) => {
    const c = d.r.actual ? STATUS[d.r.actual].color : "var(--unknown)";
    const sel = d.r.time === selTime;
    return `<circle cx="${sx(d.r.time)}" cy="${sy(d.p)}" r="${sel ? 7 : 5}" fill="${c}" stroke="var(--surface-1)" stroke-width="2" data-i="${i}"/>`;
  }).join("");
  const selX = selTime !== null && selTime >= t0 && selTime <= t1 ? sx(selTime) : null;
  $("#timeline").innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Forecast probability of High over time" id="tl-svg" style="touch-action:none">
      ${grid}
      <line x1="${L}" x2="${W - R}" y1="${sy(M.alert_threshold)}" y2="${sy(M.alert_threshold)}" stroke="var(--critical)" stroke-width="1.5" stroke-dasharray="6 5"/>
      <text x="${W - R}" y="${sy(M.alert_threshold) - 6}" text-anchor="end" style="fill:var(--critical-ink)">Alert threshold ${pct(M.alert_threshold)}</text>
      ${selX !== null ? `<line x1="${selX}" x2="${selX}" y1="${T}" y2="${H - B}" stroke="var(--ink-3)" stroke-width="1"/>` : ""}
      <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
      <line id="tl-cross" y1="${T}" y2="${H - B}" stroke="var(--ink-3)" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>
      ${dots}
      ${ticks}
      <rect id="tl-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" style="cursor:pointer"/>
    </svg>
    <div class="legend">
      <span><i class="line" style="background:var(--accent)"></i>Forecast P(High)</span>
      <span style="color:var(--ink-3)">Dots = what actually happened:</span>
      <span><i style="background:var(--good)"></i>Low</span><span><i style="background:var(--warning)"></i>Moderate</span><span><i style="background:var(--critical)"></i>High</span>
      ${pts.some((d) => !d.r.actual) ? '<span><i style="background:var(--unknown)"></i>Not known yet</span>' : ""}
      <span><i class="dash"></i>Alert threshold</span>
    </div>`;
  const svg = $("#tl-svg"); const cross = $("#tl-cross");
  const nearest = (ev) => {
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const x = pt.matrixTransform(svg.getScreenCTM().inverse()).x;
    let best = 0; let bd = Infinity;
    pts.forEach((d, i) => { const dd = Math.abs(sx(d.r.time) - x); if (dd < bd) { bd = dd; best = i; } });
    return best;
  };
  $("#tl-hit").addEventListener("mousemove", (ev) => {
    const d = pts[nearest(ev)]; const x = sx(d.r.time);
    cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("opacity", 1);
    showTip(`<b>${esc(fmtTime(d.r.time, { hour: "2-digit", minute: "2-digit" }))}</b>
      <div class="row"><span>Forecast P(High)</span><span>${pct(d.p)}</span></div>
      <div class="row"><span>Actual</span><span>${d.r.actual ? `${d.r.actual} · ${fmtInt(d.r.volume)} veh/h` : "not known yet"}</span></div>
      <div class="row"><span>Weather</span><span>${esc(d.r.weather)}</span></div>${d.r.holiday ? `<div class="row"><span>Event</span><span>${esc(d.r.holiday)}</span></div>` : ""}
      <div style="color:var(--ink-3);margin-top:4px">Click to open this forecast</div>`, ev);
  });
  $("#tl-hit").addEventListener("mouseleave", () => { cross.setAttribute("opacity", 0); hideTip(); });
  $("#tl-hit").addEventListener("click", (ev) => onPick(pts[nearest(ev)].r));
}

// ---------- modes ----------
const MODES = ["replay", "whatif", "manual", "upload", "perf", "about"];
function setMode(mode) {
  state.mode = mode;
  history.replaceState(null, "", `#${mode}`); // deep link to each tab
  document.querySelectorAll(".modes button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === mode)));
  $("#view-forecast").hidden = mode === "perf" || mode === "about";
  $("#view-perf").hidden = mode !== "perf";
  $("#view-about").hidden = mode !== "about";
  $("#table-card").hidden = mode !== "upload";
  $("#timeline-card").hidden = !(mode === "replay" || mode === "upload");
  ({ replay: buildReplay, whatif: buildWhatIf, manual: buildManual, upload: buildUpload, perf: buildPerf, about: buildAbout })[mode]();
}

function seg(name, options, value) {
  return `<div class="seg" data-seg="${name}">${options.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(v) === String(value)}">${l}</button>`).join("")}</div>`;
}
function bindSeg(root, name, cb) {
  root.querySelectorAll(`[data-seg="${name}"] button`).forEach((b) => b.addEventListener("click", () => {
    root.querySelectorAll(`[data-seg="${name}"] button`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    cb(b.dataset.v);
  }));
}
const HOUR_OPTS = [[8, "08:00–09:00"], [9, "09:00–10:00"]];

// Replay ---------------------------------------------------------
function buildReplay() {
  const days = [...new Set(TEST.map((r) => dayStart(r.time)))];
  if (state.replayDay === null) state.replayDay = parseTime("2018-09-12 00:00");
  const picks = [["2018-09-12", "Rainy Wed · alert"], ["2018-01-22", "Snowy Mon"], ["2017-12-25", "Christmas"], ["2018-07-03", "Pre-holiday"]];
  $("#inputs").innerHTML = `
    <h2>Replay a held-out day</h2>
    <div class="field"><label for="r-day">Test day (never seen in training)</label>
      <select id="r-day">${days.map((d) => `<option value="${d}" ${d === state.replayDay ? "selected" : ""}>${esc(fmtTime(d))}</option>`).join("")}</select></div>
    <div class="field"><span class="field-label">Arrival hour to forecast</span>${seg("hour", HOUR_OPTS, state.replayHour)}</div>
    <div class="field"><span class="field-label">Interesting days</span><div class="chips">${picks.map(([d, l]) => `<button class="chip" data-d="${d}">${l}</button>`).join("")}</div></div>
    <p class="hint">${TEST.length} forecasts on ${days.length} held-out weekdays, Oct 2017 – Sep 2018. Pick a day, or click any point on the chart.</p>`;
  const root = $("#inputs");
  root.querySelector("#r-day").addEventListener("change", (e) => { state.replayDay = +e.target.value; showReplay(); });
  bindSeg(root, "hour", (v) => { state.replayHour = +v; showReplay(); });
  root.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => {
    const d = parseTime(`${c.dataset.d} 00:00`);
    if (days.includes(d)) { state.replayDay = d; root.querySelector("#r-day").value = d; showReplay(); }
  }));
  showReplay();
}
function showReplay() {
  let row = TEST.find((r) => r.time === state.replayDay + state.replayHour * HOUR) || TEST.find((r) => dayStart(r.time) === state.replayDay);
  if (!row) return;
  renderForecast(row);
  const h = hourOf(row.time);
  const near = TEST.filter((r) => hourOf(r.time) === h && Math.abs(r.time - row.time) <= 21 * 24 * HOUR);
  $("#timeline-title").textContent = `Forecast vs. actual, ${hh(h)}–${hh(h + 1)} arrivals`;
  $("#timeline-sub").textContent = "Six weeks around the selected day. The vertical line marks the selected forecast.";
  renderTimeline(near, row.time, (r) => {
    state.replayDay = dayStart(r.time); state.replayHour = hourOf(r.time);
    $("#r-day").value = state.replayDay;
    $("#inputs").querySelectorAll('[data-seg="hour"] button').forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.v === state.replayHour)));
    showReplay();
  });
}

// What-if ---------------------------------------------------------
function buildWhatIf() {
  const s = { hour: 8, dow: 1, month: 9, vn: 5800, vp: 2900, vy: 5900, vl: 6000, weather: "Clear", temp: 15, rain: 0, snow: 0, clouds: 40, hol: false };
  const defaults = { 8: [5800, 2900, 5900, 6000], 9: [6300, 5600, 5000, 5000] };
  const slider = (id, label, min, max, step, val, unit = "") => `
    <div class="field"><div class="field-row"><label for="${id}">${label}</label><output id="${id}-o">${fmtInt(val)}${unit}</output></div>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
  const draw = () => {
    const L = M.lead_h;
    $("#inputs").innerHTML = `
      <h2>What-if scenario</h2>
      <div class="field"><span class="field-label">Arrival hour</span>${seg("hour", HOUR_OPTS, s.hour)}</div>
      <div class="field"><span class="field-label">Day of week</span>${seg("dow", DOW.map((d, i) => [i, d]), s.dow)}</div>
      <div class="field"><div class="field-row"><label for="w-month">Month</label><output id="w-month-o">${MONTHS[s.month - 1]}</output></div><input type="range" id="w-month" min="1" max="12" value="${s.month}"></div>
      <div class="divider"></div>
      ${slider("w-vn", `Volume ${hh(s.hour - L - 1)}–${hh(s.hour - L)} (latest)`, 500, 7000, 50, s.vn)}
      ${slider("w-vp", `Volume ${hh(s.hour - L - 2)}–${hh(s.hour - L - 1)}`, 200, 7000, 50, s.vp)}
      ${slider("w-vy", `Same hour yesterday`, 500, 7000, 50, s.vy)}
      ${slider("w-vl", `Same hour last week`, 500, 7000, 50, s.vl)}
      <div class="divider"></div>
      <div class="field"><label for="w-weather">Weather now</label><select id="w-weather">${M.weathers.map((w) => `<option ${w === s.weather ? "selected" : ""}>${w}</option>`).join("")}</select></div>
      ${slider("w-temp", "Temperature", -30, 35, 1, s.temp, " °C")}
      ${slider("w-rain", "Rain last hour", 0, 20, 0.5, s.rain, " mm")}
      ${slider("w-snow", "Snow last hour", 0, 1, 0.05, s.snow, " mm")}
      <label class="check"><input type="checkbox" id="w-hol" ${s.hol ? "checked" : ""}> Holiday / big event day</label>`;
    const root = $("#inputs");
    bindSeg(root, "hour", (v) => { s.hour = +v; [s.vn, s.vp, s.vy, s.vl] = defaults[s.hour]; draw(); });
    bindSeg(root, "dow", (v) => { s.dow = +v; update(); });
    const bindR = (id, key, fmt) => root.querySelector(`#${id}`).addEventListener("input", (e) => { s[key] = +e.target.value; root.querySelector(`#${id}-o`).textContent = fmt(s[key]); update(); });
    bindR("w-month", "month", (v) => MONTHS[v - 1]);
    bindR("w-vn", "vn", fmtInt); bindR("w-vp", "vp", fmtInt); bindR("w-vy", "vy", fmtInt); bindR("w-vl", "vl", fmtInt);
    bindR("w-temp", "temp", (v) => `${v} °C`); bindR("w-rain", "rain", (v) => `${v} mm`); bindR("w-snow", "snow", (v) => `${v} mm`);
    root.querySelector("#w-weather").addEventListener("change", (e) => { s.weather = e.target.value; update(); });
    root.querySelector("#w-hol").addEventListener("change", (e) => { s.hol = e.target.checked; update(); });
    update();
  };
  const update = () => {
    const f = { target_hour: s.hour, dow: s.dow, month: s.month, vol_now: s.vn, vol_prev: s.vp, vol_trend: s.vn - s.vp,
      vol_yday: s.vy, vol_lastweek: s.vl, temp_c: s.temp, rain_mm: s.rain, snow_mm: s.snow, clouds: s.weather === "Clear" ? 10 : 80,
      holiday_event: s.hol ? 1 : 0 };
    M.weathers.forEach((w) => { f[`w_${w}`] = w === s.weather ? 1 : 0; });
    // a representative date with the chosen weekday / month, for the header only
    let t = Date.UTC(2026, s.month - 1, 1, s.hour);
    while ((new Date(t).getUTCDay() + 6) % 7 !== s.dow) t += 24 * HOUR;
    renderForecast({ time: t, x: M.features.map((c) => f[c]), weather: s.weather, actual: null, holiday: s.hol ? "Scenario event" : null });
  };
  draw();
}

// Manual entry ----------------------------------------------------
function buildManual() {
  const next = new Date(); next.setDate(next.getDate() + 1);
  while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
  const ymd = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  const s = { date: ymd, hour: 8, yday: "", lw: "", hol: false, rows: {} };
  const typical = { 5: 2900, 6: 5800, 7: 6300 };
  const draw = () => {
    const hours = []; for (let h = 5; h < s.hour - M.lead_h; h++) hours.push(h);
    hours.forEach((h) => { s.rows[h] = s.rows[h] || { v: typical[h], w: "Clear", t: 15, r: 0, sn: 0 }; });
    $("#inputs").innerHTML = `
      <h2>Enter your readings</h2>
      <div class="field"><label for="m-date">Forecast date (weekday)</label><input type="date" id="m-date" value="${s.date}"></div>
      <div class="field"><span class="field-label">Arrival hour</span>${seg("hour", HOUR_OPTS, s.hour)}</div>
      <div class="field"><span class="field-label">Hourly readings so far</span>
        <table class="entry"><thead><tr><th>Hour</th><th>Veh/h</th><th>Weather</th><th>°C</th><th>Rain</th></tr></thead><tbody>
        ${hours.map((h) => `<tr data-h="${h}"><td>${hh(h)}</td>
          <td><input type="number" data-k="v" min="0" max="8000" step="50" value="${s.rows[h].v}" aria-label="Vehicles ${hh(h)}"></td>
          <td><select data-k="w" aria-label="Weather ${hh(h)}">${M.weathers.map((w) => `<option ${w === s.rows[h].w ? "selected" : ""}>${w}</option>`).join("")}</select></td>
          <td><input type="number" data-k="t" step="1" value="${s.rows[h].t}" aria-label="Temperature ${hh(h)}"></td>
          <td><input type="number" data-k="r" min="0" step="0.5" value="${s.rows[h].r}" aria-label="Rain mm ${hh(h)}"></td></tr>`).join("")}
        </tbody></table>
        <p class="hint">The forecast is made at ${hh(s.hour - M.lead_h)}, so it uses only hours that have finished by then.</p></div>
      <div class="field"><label for="m-yday">Same hour yesterday (optional)</label><input type="number" id="m-yday" min="0" max="8000" placeholder="leave empty if unknown" value="${s.yday}"></div>
      <div class="field"><label for="m-lw">Same hour last week (optional)</label><input type="number" id="m-lw" min="0" max="8000" placeholder="leave empty if unknown" value="${s.lw}"></div>
      <label class="check"><input type="checkbox" id="m-hol" ${s.hol ? "checked" : ""}> Holiday / big event on this day</label>
      <div id="m-msg"></div>`;
    const root = $("#inputs");
    bindSeg(root, "hour", (v) => { s.hour = +v; draw(); });
    root.querySelector("#m-date").addEventListener("change", (e) => { s.date = e.target.value; update(); });
    root.querySelector("#m-yday").addEventListener("input", (e) => { s.yday = e.target.value; update(); });
    root.querySelector("#m-lw").addEventListener("input", (e) => { s.lw = e.target.value; update(); });
    root.querySelector("#m-hol").addEventListener("change", (e) => { s.hol = e.target.checked; update(); });
    root.querySelectorAll(".entry [data-k]").forEach((el) => el.addEventListener("input", () => {
      const h = +el.closest("tr").dataset.h; const k = el.dataset.k;
      s.rows[h][k] = k === "w" ? el.value : el.value === "" ? null : +el.value; update();
    }));
    update();
  };
  const update = () => {
    const day = parseTime(`${s.date} 00:00`);
    const msg = $("#m-msg");
    if (day === null) { msg.innerHTML = '<div class="notice error">Pick a date.</div>'; renderEmpty("Pick a date to get a forecast."); return; }
    const T = day + s.hour * HOUR;
    const recs = [];
    for (let h = 5; h < s.hour - M.lead_h; h++) {
      const r = s.rows[h];
      if (r.v === null || r.v === "") continue;
      recs.push({ time: day + h * HOUR, volume: r.v, weather: r.w, tempK: r.t === null ? null : r.t + 273.15, rain: r.r, snow: 0, clouds: r.w === "Clear" ? 10 : 80, holiday: s.hol });
    }
    if (s.yday !== "") recs.push({ time: T - 24 * HOUR, volume: +s.yday, weather: "Clear", tempK: null, rain: null, snow: null, clouds: null, holiday: false });
    if (s.lw !== "") recs.push({ time: T - 168 * HOUR, volume: +s.lw, weather: "Clear", tempK: null, rain: null, snow: null, clouds: null, holiday: false });
    const row = forecastRows(M, recs).find((r) => r.time === T);
    if (!row) {
      const wk = (new Date(day).getUTCDay() + 6) % 7 > 4;
      const why = wk ? "That's a weekend. The model covers weekday arrivals only." : "Fill in the vehicle count for the latest hour.";
      msg.innerHTML = `<div class="notice error">${why}</div>`;
      renderEmpty(why);
      return;
    }
    msg.innerHTML = "";
    renderForecast(row);
  };
  draw();
}

// Upload CSV ------------------------------------------------------
function buildUpload() {
  $("#inputs").innerHTML = `
    <h2>Upload hourly readings</h2>
    <label class="drop" id="drop"><input type="file" id="u-file" accept=".csv,text/csv" hidden>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>
      <div><b>Drop a CSV here</b> or click to choose</div></label>
    <div style="display:flex;gap:8px;margin-top:10px"><a class="btn" href="traffic_template.csv" download>Download template</a><button class="btn" id="u-sample">Use template data</button></div>
    <div id="u-msg"></div>
    <div class="divider"></div>
    <p class="hint"><b>Required columns:</b> date_time (YYYY-MM-DD HH:MM), traffic_volume.<br><b>Optional:</b> weather_main, temp (Kelvin), rain_1h, snow_1h, clouds_all, holiday.
    Every weekday 08:00 / 09:00 hour with the readings it needs gets a forecast, plus the next one after your last reading. The file stays in your browser and is never uploaded anywhere.</p>`;
  const input = $("#u-file"); const drop = $("#drop");
  input.addEventListener("change", () => input.files[0] && readFile(input.files[0]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); });
  $("#u-sample").addEventListener("click", loadTemplate);
  if (state.uploadRows) showUpload(); else loadTemplate();
}
async function loadTemplate() {
  const text = await (await fetch("traffic_template.csv")).text();
  ingest(text, "Showing the template: real readings from 10–14 Sep 2018.");
}
function readFile(file) {
  const fr = new FileReader();
  fr.onload = () => ingest(String(fr.result), `Loaded ${file.name}.`);
  fr.readAsText(file);
}
function ingest(text, note) {
  const res = parseCSV(text);
  if (res.error) { $("#u-msg").innerHTML = `<div class="notice error">${esc(res.error)}</div>`; return; }
  const rows = forecastRows(M, res.records);
  if (!rows.length) { $("#u-msg").innerHTML = '<div class="notice error">No forecast possible: the file needs weekday readings for the 2–3 hours before 08:00 or 09:00.</div>'; return; }
  state.uploadRows = rows; state.uploadSel = rows.length - 1;
  const extra = [];
  if (res.filled.length) extra.push(`Not in file, so defaults were used: ${res.filled.join(", ")}.`);
  if (res.skipped) extra.push(`${res.skipped} unreadable row(s) skipped.`);
  state.uploadNote = `<div class="notice">${esc(note)} ${rows.length} forecasts.</div>${extra.length ? `<div class="notice warn">${esc(extra.join(" "))}</div>` : ""}`;
  showUpload();
}
function showUpload() {
  const rows = state.uploadRows; const sel = rows[state.uploadSel];
  $("#u-msg").innerHTML = state.uploadNote || "";
  renderForecast(sel);
  $("#timeline-title").textContent = "Forecasts from your file";
  $("#timeline-sub").textContent = "Every forecastable weekday hour in the file. Click a point to see its details above.";
  renderTimeline(rows, sel.time, (r) => { state.uploadSel = rows.indexOf(r); showUpload(); });
  const probs = rows.map((r) => predictProba(M, r.x));
  $("#forecast-table").innerHTML = `<table class="data"><thead><tr><th>Target hour</th><th>Forecast</th><th>P(High)</th><th>Alert</th><th>Actual</th></tr></thead><tbody>
    ${rows.map((r, i) => { const p = probs[i]; const lvl = M.levels[p.indexOf(Math.max(...p))];
      return `<tr data-i="${i}" class="${i === state.uploadSel ? "sel" : ""}"><td>${esc(fmtTime(r.time, { hour: "2-digit", minute: "2-digit" }))}</td>
      <td><span class="badge"><span class="sw" style="background:${STATUS[lvl].color}"></span>${lvl}</span></td><td>${pct(p[2])}</td>
      <td>${p[2] >= M.alert_threshold ? '<b style="color:var(--critical-ink)">⚠ Alert</b>' : "–"}</td><td>${r.actual || '<span style="color:var(--ink-3)">not known yet</span>'}</td></tr>`; }).join("")}
    </tbody></table>`;
  $("#forecast-table").querySelectorAll("tbody tr").forEach((tr) => tr.addEventListener("click", () => { state.uploadSel = +tr.dataset.i; showUpload(); window.scrollTo({ top: 0, behavior: "smooth" }); }));
  $("#dl-forecasts").onclick = () => {
    const lines = ["target_time,forecast,p_low,p_moderate,p_high,alert,actual"].concat(rows.map((r, i) => {
      const p = probs[i];
      return [new Date(r.time).toISOString().slice(0, 16).replace("T", " "), M.levels[p.indexOf(Math.max(...p))], ...p.map((v) => v.toFixed(4)), p[2] >= M.alert_threshold, r.actual || ""].join(",");
    }));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = "forecasts.csv"; a.click(); URL.revokeObjectURL(a.href);
  };
}

// Performance -----------------------------------------------------
function hbar(items, { highlight, fmt = (v) => v.toFixed(3), max = 1 }) {
  return `<div class="bars">${items.map((it) => {
    const on = it.label === highlight;
    return `<div class="bar-row" title="${esc(it.label)}: ${fmt(it.value)}"><div class="bar-label${on ? " strong" : ""}">${esc(it.label)}</div>
      <div class="track"><span class="bar${on ? " on" : ""}" style="width:${Math.max((it.value / max) * 100, 0.6)}%"></span></div>
      <div class="bar-val${on ? " strong" : ""}">${fmt(it.value)}</div></div>`;
  }).join("")}</div>`;
}
function buildPerf() {
  const mt = M.metrics; const best = mt.selected_model; const res = mt.test;
  const baselines = Object.keys(res).filter((k) => !["Logistic regression", best].includes(k));
  const bestBase = baselines.reduce((a, b) => (res[b].macro_f1 > res[a].macro_f1 ? b : a));
  // confusion matrix of the deployed model on the held-out days
  const cm = M.levels.map(() => M.levels.map(() => 0));
  TEST.forEach((r) => { const p = predictProba(M, r.x); cm[M.levels.indexOf(r.actual)][p.indexOf(Math.max(...p))]++; });
  const seqRamp = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
  const cmCells = cm.map((row, i) => {
    const tot = row.reduce((a, b) => a + b, 0);
    return `<tr><th style="text-align:right">${M.levels[i]}</th>${row.map((n, j) => {
      const share = tot ? n / tot : 0; const step = Math.min(seqRamp.length - 1, Math.floor(share * seqRamp.length));
      return `<td style="background:${seqRamp[step]};color:${step >= 3 ? "#fff" : "#0b0b0b"}" title="Actual ${M.levels[i]}, predicted ${M.levels[j]}: ${n} (${pct(share)})"><b>${n}</b>${pct(share)}</td>`;
    }).join("")}</tr>`;
  }).join("");
  const imp = Object.entries(mt.factor_importance).map(([label, value]) => ({ label, value: Math.max(value, 0) }));
  const lead = Object.entries(mt.lead_time_sensitivity);
  const r = res[best];
  $("#view-perf").innerHTML = `
    <div class="perf">
      <div class="card wide">
        <h2>Held-out test: ${TEST.length} forecasts on unseen weekdays (Oct 2017 – Sep 2018)</h2>
        <p class="sub">Chronological split. The model was chosen by time-series cross-validation on training days only, so the test year was used once.</p>
        <div class="stats">
          <div class="stat"><div class="n">${r.macro_f1.toFixed(2)}</div><div class="l">Macro-F1 (${esc(best.replace(" (HistGB)", ""))})</div><div class="c">vs ${res[bestBase].macro_f1.toFixed(2)} for the best baseline</div></div>
          <div class="stat"><div class="n">${pct(r.high_recall)}</div><div class="l">of High hours caught</div><div class="c">High recall · precision ${pct(r.high_precision)}</div></div>
          <div class="stat"><div class="n">${r.false_alerts_per_week.toFixed(1)}</div><div class="l">false alerts per week</div><div class="c">out of 10 forecasts a week</div></div>
          <div class="stat"><div class="n">${lead.length > 1 ? lead[1][1].model.toFixed(2) : "–"}</div><div class="l">Macro-F1 predicting 2 h ahead</div><div class="c">High recall ${lead.length > 1 ? pct(lead[1][1].model_high_recall) : "–"}</div></div>
        </div>
      </div>
      <div class="card">
        <h2>Model vs. baselines</h2><p class="sub">Macro-F1 on the held-out days (higher is better). The deployed model is highlighted.</p>
        ${hbar(Object.entries(res).map(([label, m]) => ({ label, value: m.macro_f1 })).sort((a, b) => a.value - b.value), { highlight: best })}
      </div>
      <div class="card">
        <h2>Confusion matrix: ${esc(best)}</h2><p class="sub">Rows are what happened, columns are what the model forecast. Shading shows the share of each row.</p>
        <table class="cm"><thead><tr><th></th>${M.levels.map((l) => `<th>${l}</th>`).join("")}</tr></thead><tbody>${cmCells}</tbody></table>
      </div>
      <div class="card">
        <h2>What drives the forecast</h2><p class="sub">Drop in macro-F1 when a factor is shuffled (permutation importance, test set).</p>
        ${hbar(imp, { highlight: imp[0].label, max: Math.max(...imp.map((i) => i.value)) * 1.05 })}
        <p class="hint">Weather and holidays matter for individual forecasts, but snow days and holidays are rare in the test year, so their average importance is small.</p>
      </div>
      <div class="card">
        <h2>All metrics</h2><p class="sub">An alert is raised when P(High) ≥ ${pct(M.alert_threshold)}.</p>
        <div class="tbl-wrap"><table class="data"><thead><tr><th>Model</th><th>Acc.</th><th>Macro-F1</th><th>High prec.</th><th>High recall</th><th>False alerts/wk</th></tr></thead><tbody>
        ${Object.entries(res).map(([k, m]) => `<tr style="cursor:default"><td>${k === best ? `<b>${esc(k)}</b>` : esc(k)}</td><td>${m.accuracy.toFixed(3)}</td><td>${m.macro_f1.toFixed(3)}</td><td>${m.high_precision.toFixed(3)}</td><td>${m.high_recall.toFixed(3)}</td><td>${m.false_alerts_per_week.toFixed(2)}</td></tr>`).join("")}
        </tbody></table></div>
      </div>
      <div class="card wide">
        <h2>Representative test cases: successes and failures</h2>
        <p class="sub">Ten forecasts from the held-out year that cover every situation: normal peaks, rain, snow, holidays, and each kind of mistake. Click a row to replay it.</p>
        <div class="tbl-wrap" style="max-height:none"><table class="data"><thead><tr><th>Arrival hour</th><th>Result</th><th>Situation</th><th>Weather</th><th>P(High)</th><th>Predicted</th><th>Actual</th></tr></thead><tbody>
        ${CASES.map((c, i) => `<tr data-case="${i}"><td>${esc(c.target_time)}</td><td>${c.type === "success" ? '<b style="color:var(--good-ink)">✓ Success</b>' : '<b style="color:var(--critical-ink)">✗ Failure</b>'}</td><td style="font-variant-numeric:normal">${esc(c.situation)}</td><td>${esc(c.weather)}${c.holiday_or_event ? " + event" : ""}</td><td>${pct(c.p_high)}</td><td>${esc(c.predicted)}</td><td>${esc(c.actual)} (${fmtInt(c.actual_volume)})</td></tr>`).join("")}
        </tbody></table></div>
        <p class="hint">Error analysis: most false alarms (79%) were hours that ended within 300 veh/h below the High cut-off, and every missed High hour was within 300 veh/h above it. Mistakes are almost always between neighbouring levels, so treat P(High) between 40% and 60% as borderline.</p>
      </div>
      <div class="card wide">
        <h2>How it works</h2>
        <ul class="notes">
          <li><b>Data:</b> real hourly vehicle counts, weather and holidays for westbound I-94, 2012–2018 (UCI / Kaggle, CC BY 4.0), used as a stand-in for the campus road.</li>
          <li><b>Classes:</b> Low &lt; ${fmtInt(M.level_bins[0])} veh/h, Moderate up to ${fmtInt(M.level_bins[1])}, High ≥ ${fmtInt(M.level_bins[1])} (about 85% of peak road capacity). This is a volume-based proxy, because the dataset has no speeds.</li>
          <li><b>No leakage:</b> the forecast for 08:00–09:00 is made at 07:00 from completed hours, current weather and the calendar only.</li>
          <li><b>Model:</b> a lightweight gradient-boosted tree model (HistGradientBoosting, depth 3, 200 trees) that trains in seconds. It is exported to JSON and runs in your browser, with output identical to scikit-learn.</li>
          <li><b>Limits:</b> there is no live feed. Retrain on the campus road's own counts, ideally with speed data, before real use.</li>
        </ul>
      </div>
    </div>`;
  $("#view-perf").querySelectorAll("tr[data-case]").forEach((tr) => tr.addEventListener("click", () => {
    const c = CASES[+tr.dataset.case];
    const t = parseTime(c.target_time);
    state.replayDay = dayStart(t); state.replayHour = hourOf(t);
    setMode("replay"); window.scrollTo({ top: 0, behavior: "smooth" });
  }));
}

// About & Responsible AI ------------------------------------------
function buildAbout() {
  const row = (cells) => `<tr style="cursor:default">${cells.map((c) => `<td style="font-variant-numeric:normal;vertical-align:top">${c}</td>`).join("")}</tr>`;
  $("#view-about").innerHTML = `
    <div class="perf">
      <div class="card wide">
        <h2>Problem and intended users</h2>
        <p class="sub">Most students reach campus between 08:00 and 10:00. On some mornings the approach road to the gate jams, students are late and crowded gates are unsafe. GateFlow forecasts the congestion level one hour ahead, so people can act before the jam rather than in it.</p>
        <div class="tbl-wrap" style="max-height:none"><table class="data"><thead><tr><th>Who</th><th>What they need</th><th>How GateFlow helps</th></tr></thead><tbody>
          ${row(["<b>Transport / admin office</b>", "Decide on extra shuttles, open a second gate, post marshals", "Alert at 07:00 for 08:00–09:00, with suggested actions"])}
          ${row(["<b>Gate security staff</b>", "Know when crowds will peak", "Simple Low / Moderate / High level with the reason"])}
          ${row(["<b>Students and staff</b>", "Leave on time, avoid the jam", "\"Leave 20 minutes earlier\" message (to be shared by the office)"])}
          ${row(["<b>Shuttle operators</b>", "Plan trips around busy hours", "Forecasts for every weekday peak, CSV download"])}
        </tbody></table></div>
      </div>
      <div class="card wide">
        <h2>Architecture and workflow</h2>
        <p class="sub">Data input → preprocessing → features → model → output. The bottom row shows the offline training, evaluation and deployment.</p>
        <img src="architecture.png" alt="Architecture: hourly records are cleaned, turned into features known one hour ahead, scored by a gradient-boosting model, and shown as a level, an alert and a factor chart. Training uses a chronological split with a held-out test year; the model is exported to JSON and runs in the browser." style="width:100%;border-radius:10px;border:1px solid var(--border);background:#fff">
      </div>
      <div class="card">
        <h2>Responsible AI</h2>
        <ul class="notes">
          <li><b>Privacy:</b> only counts of vehicles per hour. No cameras, number plates or personal data. Uploaded CSV files are read inside your browser and never sent anywhere. No accounts, no tracking.</li>
          <li><b>Bias and fairness:</b> trained on one US highway, so patterns may differ on our road. Accuracy is lower in fog and rain (67–68%) than in snow (91%). College events are not in the data. Rare classes are weighted so High is not ignored.</li>
          <li><b>Security:</b> a static site with no server, database or secrets to steal. All user text is escaped before display, and uploaded files are parsed as plain data.</li>
          <li><b>Accessibility:</b> each level is shown with a word and an icon, never colour alone. Colour-blind-safe status colours, keyboard-usable controls, screen-reader labels, dark mode, reduced-motion support, works on phones.</li>
          <li><b>Human oversight:</b> GateFlow only advises. A person in the transport office decides what to do. P(High) between 40% and 60% is shown as a probability so borderline cases get a human look. Nothing is automated, such as closing a gate.</li>
          <li><b>Transparency:</b> every forecast shows why, the code is public, and all results are measured on a year the model never saw, including its failures.</li>
        </ul>
      </div>
      <div class="card">
        <h2>UN Sustainable Development Goals</h2>
        <ul class="notes">
          <li><b>SDG 11: Sustainable cities and communities</b> (target 11.2: safe, accessible transport). It eases peak congestion at a shared transport point and suggests alternatives such as shuttles and a second gate.</li>
          <li><b>SDG 3: Good health and well-being</b> (3.6: road traffic injuries; 3.9: air pollution). Fewer crowded, rushed gate queues is safer, and less stop-start traffic means less exhaust.</li>
          <li><b>SDG 13: Climate action.</b> Smoother traffic and more shuttle use cut idling emissions.</li>
          <li><b>SDG 9: Industry, innovation and infrastructure</b> (9.1). It gets more out of existing roads using data, without building new ones.</li>
          <li><b>SDG 4: Quality education.</b> Students reach class on time.</li>
        </ul>
      </div>
      <div class="card wide">
        <h2>Implemented vs. planned</h2>
        <div class="tbl-wrap" style="max-height:none"><table class="data"><thead><tr><th>Implemented now (working)</th><th>Planned next</th></tr></thead><tbody>
          ${row(["Model trained on real hourly traffic data (I-94, 2012–2018), beats all baselines on a held-out year", "Collect hourly counts at our own gate and retrain (same code)"])}
          ${row(["Low / Moderate / High forecast 1 h ahead, alert at P(High) ≥ 50%, factor explanations", "Speed or queue-length labels from a camera or GPS, instead of a volume proxy"])}
          ${row(["Web dashboard: replay, what-if, manual entry, CSV upload, performance, this page", "Live data feed (traffic counter API) and a weather-forecast API"])}
          ${row(["Model runs in the browser; deployed as a static site from GitHub to Vercel", "Push notifications or SMS to students, run by the transport office"])}
          ${row(["Evaluation: metrics, confusion matrix, test cases with failures, parity tests", "15-minute resolution; college calendar (exams, fests) as an event input"])}
        </tbody></table></div>
        <p class="hint">This is a clearly labelled <b>proof of concept</b>. It is not connected to live traffic.</p>
      </div>
    </div>`;
}

// ---------- boot ----------
async function boot() {
  [M, TEST, CASES] = await Promise.all([fetch("model.json").then((r) => r.json()), fetch("test_days.json").then((r) => r.json()),
    fetch("test_cases.json").then((r) => (r.ok ? r.json() : [])).catch(() => [])]);
  TEST = TEST.map((r) => ({ ...r, time: parseTime(r.time.replace("T", " ")) }));
  $("#model-pill").innerHTML = `<span class="dot" style="background:var(--accent)"></span>${esc(M.model_name)} · ${M.lead_h} h ahead`;
  document.querySelectorAll(".modes button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  const fromHash = location.hash.slice(1);
  setMode(MODES.includes(fromHash) ? fromHash : "replay");
}
boot().catch((e) => {
  document.querySelector("main").innerHTML = `<div class="card"><h2>Could not load the model</h2><p class="sub">${esc(e.message)}. If you opened index.html directly from disk, serve the folder instead (for example <code>python -m http.server -d public</code>).</p></div>`;
});
