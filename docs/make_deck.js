// Run: NODE_PATH=<dir with pptxgenjs, react-icons, react-dom, sharp>/node_modules PPTX_SKILL=<pptx skill dir> node docs/make_deck.js
// (REPO/BUILD below point at the local checkout and the cropped screenshots folder; adjust if needed.)
// Builds the GateFlow presentation (follows the hackathon's suggested 7-part flow).
const path = require("path");
const pptxgen = require("pptxgenjs");
const sharp = require("sharp");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const fa = require("react-icons/fa");
const { applyTheme } = require(process.env.PPTX_SKILL + "/scripts/apply_theme.js");

const REPO = "D:/AI-hacathon/traffic_alert";
const BUILD = "D:/AI-hacathon/_build";
const OUT = path.join(REPO, "docs", "GateFlow_Presentation.pptx");

const THEME = {
  name: "GateFlow Signal",
  headFontFace: "Calibri",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1E2329", lt1: "FFFFFF", dk2: "2B3440", lt2: "F3F4F6",
    accent1: "E8A317", accent2: "D03B3B", accent3: "0CA30C", accent4: "2A78D6", accent5: "6B7280", accent6: "94A3B8",
    hlink: "2A78D6", folHlink: "6250D6",
  },
};
const INK = "1E2329", SUB = "4B5563", MUTED = "6B7280", DARK = "1E2329", CARD = "F3F4F6", LINE = "D9DCE1";
const AMBER = "E8A317", RED = "D03B3B", GREEN = "0CA30C", BLUE = "2A78D6";
const W = 13.333, H = 7.5;

async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}
async function aspect(file) { const m = await sharp(file).metadata(); return m.width / m.height; }

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.title = "GateFlow: Smart Traffic Congestion Alert";
  pres.author = "GateFlow team";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };

  pres.defineSlideMaster({
    title: "CONTENT",
    background: { color: "FFFFFF" },
    objects: [
      { text: { text: "GateFlow · VIT AI Innovate-A-Thon 2026", options: { x: 0.6, y: 7.0, w: 6, h: 0.3, fontSize: 10, color: MUTED } } },
    ],
    slideNumber: { x: 12.2, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: MUTED, align: "right" },
  });
  pres.defineSlideMaster({
    title: "DARK",
    background: { color: DARK },
  });

  const I = {
    admin: await icon(fa.FaUniversity, "FFFFFF"), guard: await icon(fa.FaShieldAlt, "FFFFFF"),
    student: await icon(fa.FaUserGraduate, "FFFFFF"), bus: await icon(fa.FaBus, "FFFFFF"),
    clock: await icon(fa.FaClock, "FFFFFF"), search: await icon(fa.FaSearch, "FFFFFF"),
    browser: await icon(fa.FaGlobe, "FFFFFF"), tools: await icon(fa.FaSlidersH, "FFFFFF"),
    lock: await icon(fa.FaLock, "FFFFFF"), scale: await icon(fa.FaBalanceScale, "FFFFFF"),
    shield: await icon(fa.FaUserShield, "FFFFFF"), access: await icon(fa.FaUniversalAccess, "FFFFFF"),
    warn: await icon(fa.FaExclamationTriangle, "FFFFFF"), human: await icon(fa.FaUserCheck, "FFFFFF"),
    light: await icon(fa.FaTrafficLight, AMBER, 512),
    crash: await icon(fa.FaCarCrash, "FFFFFF"), hardhat: await icon(fa.FaHardHat, "FFFFFF"),
    news: await icon(fa.FaNewspaper, "FFFFFF"), robot: await icon(fa.FaRobot, "FFFFFF"),
  };
  const circleIcon = (s, img, x, y, color, d = 0.62) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color }, line: { color }, objectName: "icon-circle" });
    s.addImage({ data: img, x: x + d * 0.22, y: y + d * 0.22, w: d * 0.56, h: d * 0.56, objectName: "icon" });
  };
  const card = (s, x, y, w, h, fill = CARD) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: fill }, objectName: "card" });
  const txt = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, fontSize: 14, color: SUB, valign: "top", ...o });
  const title = (s, t) => txt(s, t, { x: 0.6, y: 0.35, w: 12.1, h: 0.85, fontSize: 32, bold: true, color: INK, valign: "middle", objectName: "title" });
  const titleDark = (s, t) => txt(s, t, { x: 0.8, y: 2.2, w: 11.7, h: 1.3, fontSize: 48, bold: true, color: "FFFFFF", valign: "middle", objectName: "title" });

  // ---------- 1. Title ----------
  pres.addSection({ title: "Opening" });
  let s = pres.addSlide({ masterName: "DARK", sectionTitle: "Opening" });
  s.addImage({ data: I.light, x: 0.8, y: 1.0, w: 0.9, h: 0.9, objectName: "logo" });
  titleDark(s, "GateFlow");
  txt(s, "Smart traffic congestion alert for campus arrivals, 08:00–10:00", { x: 0.8, y: 3.55, w: 11, h: 0.6, fontSize: 22, color: "E5E7EB" });
  txt(s, "Forecasts Low / Moderate / High one hour ahead · explains why · alerts before the jam", { x: 0.8, y: 4.2, w: 11, h: 0.5, fontSize: 16, color: "9CA3AF" });
  txt(s, [
    { text: "VIT AI Innovate-A-Thon · Question 2 · October 2026", options: { breakLine: true } },
    { text: "Proof of concept on real public traffic data · no live traffic feed connected" },
  ], { x: 0.8, y: 5.8, w: 11, h: 0.8, fontSize: 13, color: "9CA3AF" });
  s.addNotes("Introduce GateFlow: it warns the college one hour before the gate road jams, so students and staff can act early. Be clear from the start that it is a proof of concept trained on real public data, not connected to live traffic.");

  // ---------- 2. Problem and users ----------
  pres.addSection({ title: "1 Problem & users" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "1 Problem & users" });
  title(s, "Students all arrive 08:00–10:00 and the gate road jams");
  card(s, 0.6, 1.45, 4.2, 5.25, DARK);
  txt(s, "2 hours", { x: 0.95, y: 1.8, w: 3.6, h: 1.0, fontSize: 60, bold: true, color: AMBER });
  txt(s, "when most of campus arrives at the same gate", { x: 0.95, y: 2.85, w: 3.5, h: 0.7, fontSize: 15, color: "E5E7EB" });
  txt(s, "23%", { x: 0.95, y: 3.75, w: 3.6, h: 1.0, fontSize: 60, bold: true, color: RED });
  txt(s, "of weekday 8–10 AM hours reach High congestion in our data", { x: 0.95, y: 4.8, w: 3.5, h: 0.7, fontSize: 15, color: "E5E7EB" });
  txt(s, "Congestion depends on vehicle volume, weather and events. A warning only helps if it comes before the jam.", { x: 0.95, y: 5.65, w: 3.6, h: 0.9, fontSize: 12.5, color: "9CA3AF" });
  const users = [
    [I.admin, "Transport / admin office", "Decides on extra shuttles, a second gate and marshals. Gets the 07:00 alert with actions."],
    [I.guard, "Gate security staff", "Needs to know when crowds peak. Gets a simple level plus the reason."],
    [I.student, "Students and staff", "Want to arrive on time. Get a \"leave 20 minutes earlier\" message via the office."],
    [I.bus, "Shuttle operators", "Plan trips around peaks. Get forecasts for every weekday, as CSV."],
  ];
  users.forEach(([img, head, body], i) => {
    const y = 1.5 + i * 1.32;
    circleIcon(s, img, 5.3, y + 0.05, [BLUE, AMBER, GREEN, "6B7280"][i]);
    txt(s, head, { x: 6.15, y, w: 6.5, h: 0.4, fontSize: 18, bold: true, color: INK });
    txt(s, body, { x: 6.15, y: y + 0.42, w: 6.5, h: 0.75, fontSize: 14 });
  });
  s.addNotes("The problem: arrivals bunch into two hours, and on bad mornings the approach road jams. Intended users are the transport office (main decision-maker), gate security, students and staff, and shuttle operators.");

  // ---------- 3. Idea and innovation ----------
  pres.addSection({ title: "2 Idea & innovation" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "2 Idea & innovation" });
  title(s, "A one-hour-ahead forecast that explains itself");
  const ideas = [
    [I.clock, AMBER, "Forecast, not hindsight", "At 07:00 it predicts 08:00–09:00, using only what is known at 07:00. It never sees the answer."],
    [I.search, BLUE, "Explains every forecast", "Shows how much recent traffic, usual traffic, weather and holidays push the chance of High up or down."],
    [I.browser, GREEN, "AI that runs in the browser", "The trained trees are exported to JSON and run in JavaScript, identical to scikit-learn. Free hosting, instant, private."],
    [I.tools, RED, "Built for real use", "Replay any day, what-if sliders, type today's numbers, upload a CSV and download forecasts."],
  ];
  ideas.forEach(([img, col, head, body], i) => {
    const x = 0.6 + (i % 2) * 6.15, y = 1.5 + Math.floor(i / 2) * 2.65;
    card(s, x, y, 5.95, 2.4);
    circleIcon(s, img, x + 0.35, y + 0.4, col, 0.75);
    txt(s, head, { x: x + 1.35, y: y + 0.4, w: 4.4, h: 0.45, fontSize: 19, bold: true, color: INK });
    txt(s, body, { x: x + 1.35, y: y + 0.95, w: 4.35, h: 1.3, fontSize: 14 });
  });
  s.addNotes("Four ideas set GateFlow apart: an honest one-hour-ahead forecast, an explanation for each forecast, a model that runs entirely in the browser (so no server), and practical tools for the transport office.");

  // ---------- 4. Data ----------
  pres.addSection({ title: "3 Architecture & approach" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "3 Architecture & approach" });
  title(s, "Real data: 6 years of hourly traffic, weather and holidays");
  const hdr = (t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: DARK } } });
  s.addTable([
    [hdr("Task field"), hdr("Dataset column")],
    ["Timestamp", "date_time (hourly, Oct 2012 – Sep 2018)"],
    ["Vehicle count", "traffic_volume (vehicles per hour)"],
    ["Weather", "weather_main + temp, rain, snow, clouds"],
    ["Event indicator", "holiday (US holidays, State Fair)"],
  ], { x: 0.6, y: 1.5, w: 6.6, colW: [2.0, 4.6], fontSize: 13, color: INK, border: { type: "solid", pt: 0.75, color: LINE }, rowH: 0.42 });
  txt(s, "UCI Machine Learning Repository / Kaggle · 48,204 rows · CC BY 4.0 · highway I-94 used as a stand-in for the campus road", { x: 0.6, y: 3.75, w: 6.6, h: 0.6, fontSize: 12, color: MUTED });
  txt(s, "Labels (volume-to-capacity proxy)", { x: 7.6, y: 1.5, w: 5.1, h: 0.4, fontSize: 17, bold: true, color: INK });
  [["Low", "< 5,000 veh/h", GREEN], ["Moderate", "5,000 – 5,800", AMBER], ["High", "≥ 5,800 (≈85% of capacity)", RED]].forEach(([l, r, c], i) => {
    const y = 2.0 + i * 0.62;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 7.6, y, w: 1.5, h: 0.48, rectRadius: 0.08, fill: { color: c }, line: { color: c }, objectName: "level-chip" });
    txt(s, l, { x: 7.6, y, w: 1.5, h: 0.48, fontSize: 14, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
    txt(s, r, { x: 9.3, y, w: 3.4, h: 0.48, fontSize: 14, color: INK, valign: "middle" });
  });
  txt(s, "Preprocessing", { x: 0.6, y: 4.45, w: 6, h: 0.4, fontSize: 17, bold: true, color: INK });
  txt(s, [
    { text: "Dedupe hours (7,629 duplicate rows), spread the holiday flag to the whole day", options: { bullet: true, breakLine: true } },
    { text: "Fix sensor errors; the 2014–15 outage stays empty, never invented", options: { bullet: true, breakLine: true } },
    { text: "Weekdays only, target hours 08:00 and 09:00", options: { bullet: true } },
  ], { x: 0.6, y: 4.9, w: 6.6, h: 1.6, fontSize: 14, paraSpaceAfter: 4 });
  txt(s, "Chronological split, never shuffled", { x: 7.6, y: 4.45, w: 5.1, h: 0.4, fontSize: 17, bold: true, color: INK });
  s.addShape(pres.shapes.RECTANGLE, { x: 7.6, y: 5.0, w: 4.0, h: 0.55, fill: { color: BLUE }, line: { color: "FFFFFF", width: 2 }, objectName: "split-train" });
  s.addShape(pres.shapes.RECTANGLE, { x: 11.6, y: 5.0, w: 1.1, h: 0.55, fill: { color: RED }, line: { color: "FFFFFF", width: 2 }, objectName: "split-test" });
  txt(s, "Train 2012–2017 · 986 days", { x: 7.7, y: 5.0, w: 3.8, h: 0.55, fontSize: 13, bold: true, color: "FFFFFF", valign: "middle" });
  txt(s, "Test", { x: 11.6, y: 5.0, w: 1.1, h: 0.55, fontSize: 13, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
  txt(s, "Validation = 4 expanding-window CV folds inside train, used only to choose the model. Test = last year, 247 days, 494 forecasts, used once.", { x: 7.6, y: 5.7, w: 5.1, h: 0.9, fontSize: 12.5, color: SUB });
  s.addNotes("Data: the public Metro Interstate Traffic Volume dataset, with all four required fields. Labels come from volume because there are no speeds. Explain the cleaning, and stress the chronological split: the test year was never seen during training or model selection.");

  // ---------- 5. Architecture ----------
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "3 Architecture & approach" });
  title(s, "Architecture: data in, forecast and alert out");
  const archA = await aspect(path.join(REPO, "docs", "architecture.png"));
  const aw = 12.1, ah = aw / archA;
  s.addImage({ path: path.join(REPO, "docs", "architecture.png"), x: 0.6, y: 1.35, w: aw, h: Math.min(ah, 5.5), altText: "Architecture: data input, preprocessing, features, model, output; training, baselines and deployment below", objectName: "architecture" });
  s.addNotes("Walk left to right: hourly records are cleaned, turned into clues known one hour ahead, scored by the gradient-boosting model, and shown as a level, an alert and an explanation. Bottom row: training with a held-out test year, baselines and metrics, then export to the browser through GitHub and Vercel.");

  // ---------- 6. Technical approach ----------
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "3 Architecture & approach" });
  title(s, "A lightweight model: 200 small trees, trained in 11 seconds");
  card(s, 0.6, 1.5, 6.0, 5.1);
  txt(s, "Clues known one hour before the arrival hour", { x: 0.95, y: 1.75, w: 5.4, h: 0.45, fontSize: 17, bold: true, color: INK });
  txt(s, [
    { text: "Traffic in the last finished hour, and its trend", options: { bullet: true, breakLine: true } },
    { text: "Same hour yesterday and last week", options: { bullet: true, breakLine: true } },
    { text: "Weather now: type, temperature, rain, snow, cloud", options: { bullet: true, breakLine: true } },
    { text: "Holiday or event that day", options: { bullet: true, breakLine: true } },
    { text: "Arrival hour, weekday, month", options: { bullet: true } },
  ], { x: 0.95, y: 2.35, w: 5.4, h: 2.6, fontSize: 15, paraSpaceAfter: 6 });
  txt(s, "Example on 12 Sep 2018: 5,908 cars at 6–7 AM, up 2,823 on the hour before, rain → 99% chance of High.", { x: 0.95, y: 4.9, w: 5.4, h: 1.0, fontSize: 13, italic: true, color: MUTED });
  const facts = [["HistGradientBoosting", "200 trees, 3 questions deep, each fixing the last one's mistakes"], ["11 s", "training time on a laptop CPU: no GPU, no deep learning"], ["0.705 vs 0.672", "validation macro-F1 vs logistic regression, so it was picked before testing"], ["3 × 10⁻⁷", "largest gap between browser and scikit-learn outputs"]];
  facts.forEach(([big, small], i) => {
    const y = 1.5 + i * 1.3;
    txt(s, big, { x: 7.0, y, w: 5.7, h: 0.6, fontSize: 28, bold: true, color: i === 0 ? BLUE : INK });
    txt(s, small, { x: 7.0, y: y + 0.6, w: 5.7, h: 0.55, fontSize: 14 });
  });
  s.addNotes("Explain gradient boosting simply: many small yes/no trees, each fixing the previous ones' mistakes. It suits small tables of numbers, trains in seconds and can be explained. It was chosen by validation on training years only.");

  // ---------- 7. Demo ----------
  pres.addSection({ title: "4 Prototype demo" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "4 Prototype demo" });
  title(s, "Demo: a day the model never saw, caught one hour early");
  const rA = await aspect(path.join(BUILD, "replay_crop.png"));
  const rh = 5.35, rw = rh * rA;
  s.addImage({ path: path.join(BUILD, "replay_crop.png"), x: 0.6, y: 1.35, w: rw, h: rh, altText: "Replay of 12 Sep 2018: High congestion alert with 99% chance, factor chart and road view", objectName: "demo-replay" });
  const cx = 0.6 + rw + 0.4, cw = W - cx - 0.6;
  [["1", "Pick a held-out day", "Wed 12 Sep 2018, rainy. Forecast made at 07:00."], ["2", "Red alert + actions", "99% chance of High: leave earlier, open Gate 3, extra shuttle."], ["3", "See why", "Usual traffic for this slot adds +27 points to the chance of High."], ["4", "Check the truth", "Actual: 6,297 veh/h, High. The forecast was correct."]].forEach(([n, head, body], i) => {
    const y = 1.45 + i * 1.33;
    s.addShape(pres.shapes.OVAL, { x: cx, y, w: 0.5, h: 0.5, fill: { color: AMBER }, line: { color: AMBER }, objectName: "step" });
    txt(s, n, { x: cx, y, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: INK, align: "center", valign: "middle" });
    txt(s, head, { x: cx + 0.7, y: y - 0.02, w: cw - 0.7, h: 0.4, fontSize: 17, bold: true, color: INK });
    txt(s, body, { x: cx + 0.7, y: y + 0.4, w: cw - 0.7, h: 0.8, fontSize: 13.5 });
  });
  s.addNotes("Live demo: open the site, Replay tab, 12 Sep 2018 08:00. Show the alert, the why chart, then scroll to the timeline and click another point. The model never saw this day.");

  // ---------- 8. Workflow ----------
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "4 Prototype demo" });
  title(s, "User workflow: three ways to get a forecast");
  const shots = [["whatif_crop.png", "What-if", "Drag sliders for traffic, weather, month or holiday. The alert updates live."], ["manual_crop.png", "Manual entry", "Type today's hourly counts and weather into a table, then get the 08:00 or 09:00 forecast."], ["upload_crop.png", "Upload CSV", "Drop a file: every weekday peak in it gets a forecast, with a table and CSV download."]];
  const aspects = [];
  for (const [f] of shots) aspects.push(await aspect(path.join(BUILD, f)));
  const tallest = Math.max(...aspects.map((a) => 3.6 / a)); // all cards share one height
  for (let i = 0; i < shots.length; i++) {
    const [f, head, body] = shots[i];
    const x = 0.6 + i * 4.1, w = 3.9, a = aspects[i];
    const ih = (w - 0.3) / a;
    card(s, x, 1.45, w, tallest + 2.0);
    s.addImage({ path: path.join(BUILD, f), x: x + 0.15, y: 1.6, w: w - 0.3, h: ih, altText: head + " screen", objectName: "shot-" + i });
    txt(s, head, { x: x + 0.3, y: 1.6 + tallest + 0.3, w: w - 0.6, h: 0.45, fontSize: 18, bold: true, color: INK });
    txt(s, body, { x: x + 0.3, y: 1.6 + tallest + 0.8, w: w - 0.6, h: 0.9, fontSize: 13.5 });
  }
  s.addNotes("Besides replay, the office can test scenarios, type in today's counts, or upload a whole CSV. Uploaded files never leave the browser. The Model performance and About tabs show the evaluation and the responsible-AI notes.");

  // ---------- Agentic AI: concept ----------
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "4 Prototype demo" });
  title(s, "Agentic AI: ML predicts patterns, the agent handles surprises");
  const loopSteps = [["Observe", "Read the ML forecast"], ["Plan", "Pick which feeds to check"], ["Act", "Call the tools"], ["Reason", "On the route? In the time window?"], ["Reflect", "Do sources agree?"], ["Decide", "Keep or override the alert"]];
  loopSteps.forEach(([h1, b1], i) => {
    const x = 0.6 + i * 2.06, y = 1.45;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 1.82, h: 1.2, rectRadius: 0.1, fill: { color: i === 5 ? BLUE : CARD }, line: { color: i === 5 ? BLUE : LINE }, objectName: "loop-" + i });
    txt(s, `${i + 1}. ${h1}`, { x: x + 0.15, y: y + 0.15, w: 1.55, h: 0.4, fontSize: 16, bold: true, color: i === 5 ? "FFFFFF" : INK });
    txt(s, b1, { x: x + 0.15, y: y + 0.58, w: 1.55, h: 0.55, fontSize: 12, color: i === 5 ? "E5E7EB" : SUB });
    if (i < 5) txt(s, "→", { x: x + 1.84, y: y + 0.38, w: 0.22, h: 0.4, fontSize: 16, color: MUTED, align: "center" });
  });
  txt(s, "↻ repeats until it can decide", { x: 9.9, y: 2.72, w: 2.8, h: 0.3, fontSize: 12, italic: true, color: MUTED, align: "right" });
  const toolsA = [[I.crash, RED, "Govt incident feed", "Crashes, breakdowns and closures from the traffic police / transport department"], [I.hardhat, AMBER, "Govt roadworks permits", "Construction and lane closures from public-works permits"], [I.news, BLUE, "News stations", "Local news reports to cross-check. Live mode adds real web search"]];
  toolsA.forEach(([img, col, h1, b1], i) => {
    const x = 0.6 + i * 2.85;
    card(s, x, 3.15, 2.7, 2.1);
    circleIcon(s, img, x + 0.25, 3.35, col, 0.55);
    txt(s, h1, { x: x + 0.25, y: 4.0, w: 2.25, h: 0.35, fontSize: 15, bold: true, color: INK });
    txt(s, b1, { x: x + 0.25, y: 4.38, w: 2.25, h: 0.8, fontSize: 12 });
  });
  card(s, 0.6, 5.4, 8.25, 1.2, "EEF4FC");
  circleIcon(s, I.robot, 0.85, 5.62, BLUE, 0.55);
  txt(s, "Two engines, same tools", { x: 1.6, y: 5.55, w: 7, h: 0.35, fontSize: 15, bold: true, color: INK });
  txt(s, "Built-in agent: runs offline, no key. Claude agent: claude-opus-5-5 drives the tool loop and can search live news. The ML model is not changed.", { x: 1.6, y: 5.92, w: 7.1, h: 0.6, fontSize: 12.5 });
  card(s, 9.1, 3.15, 3.6, 3.45, DARK);
  txt(s, "Decision rules", { x: 9.4, y: 3.35, w: 3.1, h: 0.4, fontSize: 17, bold: true, color: "FFFFFF" });
  txt(s, [
    { text: "Road blocked (confirmed) → High, ~97%", options: { bullet: true, breakLine: true } },
    { text: "Lane closed → risk up by lost capacity", options: { bullet: true, breakLine: true } },
    { text: "Unverified rumour → keep forecast, ask a human", options: { bullet: true, breakLine: true } },
    { text: "Off the route or already over → ignore", options: { bullet: true } },
  ], { x: 9.4, y: 3.85, w: 3.1, h: 2.6, fontSize: 13.5, color: "E5E7EB", paraSpaceAfter: 8 });
  s.addNotes("ML learns from history, so it cannot see one-off events like a crash or a closed road. The agent starts from the ML forecast and runs a loop: observe, plan, act by calling tools (government incident feed, roadworks permits, news), reason about route and timing, reflect by cross-checking sources, then decide. If the road is blocked, it overrides the forecast to High. It never alerts on a rumour alone. The ML model itself is unchanged.");

  // ---------- Agentic AI: demo ----------
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "4 Prototype demo" });
  title(s, "Demo: a blocked road turns Moderate into a High alert");
  const agA = await aspect(path.join(BUILD, "agent_top.png"));
  const agW = 7.5, agH = agW / agA;
  s.addImage({ path: path.join(BUILD, "agent_top.png"), x: 0.6, y: 1.4, w: agW, h: agH, altText: "Agentic AI tab: ML says Moderate 13%, the agent finds a confirmed crash and raises it to High 97% with diversion actions", objectName: "agent-shot" });
  txt(s, [
    { text: "The ML model alone said Moderate, 13%. It cannot see the crash.", options: { bullet: true, breakLine: true } },
    { text: "The agent found an official crash report, confirmed by TV news, so it raised the forecast to High, 97%: divert to Gate 3.", options: { bullet: true, breakLine: true } },
    { text: "Every step is shown as a trace, so the decision can be checked.", options: { bullet: true } },
  ], { x: 0.6, y: 1.4 + agH + 0.3, w: agW, h: 1.7, fontSize: 14, paraSpaceAfter: 6 });
  const okc = (t) => ({ text: t, options: { color: "006300", bold: true } });
  const upc = (t) => ({ text: t, options: { color: "A32020", bold: true } });
  const wac = (t) => ({ text: t, options: { color: "8A5A00", bold: true } });
  s.addTable([
    [hdr("Scenario"), hdr("ML"), hdr("Agent decides")],
    ["Calm morning", "Mod 13%", okc("Keeps it")],
    ["Accident blocks road", "Mod 13%", upc("High 97%: divert")],
    ["Roadworks, 1 lane", "Mod 19%", upc("High 80%: leave early")],
    ["Unverified rumour", "Mod 25%", wac("Keeps it, human check")],
    ["Crash already cleared", "Mod 3%", okc("Keeps it (over by 07:30)")],
  ], { x: 8.4, y: 1.4, w: 4.3, colW: [1.6, 0.9, 1.8], fontSize: 12, color: INK, border: { type: "solid", pt: 0.75, color: LINE }, rowH: 0.55 });
  txt(s, "Scenario feeds are simulated examples in a government / news feed format; the ML forecasts under them are real held-out days.", { x: 8.4, y: 5.0, w: 4.3, h: 0.9, fontSize: 11, italic: true, color: MUTED });
  s.addNotes("Live demo: open the Agentic AI tab, pick Accident blocks the road, press Run agent and let the steps appear. Then show the rumour scenario: the agent refuses to raise an alarm on an unverified post and asks a human to check. That is responsible AI in action.");

  // ---------- 9. Results ----------
  pres.addSection({ title: "5 Testing & results" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "5 Testing & results" });
  title(s, "On a year it never saw, it beats every simple rule");
  s.addChart(pres.charts.BAR, [{ name: "Macro-F1", labels: ["Majority class", "Historical average", "Same hour last week", "Logistic regression", "Gradient boosting (ours)"], values: [0.226, 0.397, 0.607, 0.660, 0.733] }], {
    x: 0.6, y: 1.4, w: 7.4, h: 5.2, barDir: "bar", chartColors: ["B8BEC6", "B8BEC6", "B8BEC6", "B8BEC6", BLUE], varyColors: true,
    showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.00", dataLabelFontSize: 13, dataLabelColor: INK, dataLabelFontFace: "+mn-lt",
    catAxisLabelColor: SUB, catAxisLabelFontSize: 13, catAxisLabelFontFace: "+mn-lt", valAxisHidden: true, valAxisMinVal: 0, valAxisMaxVal: 0.9,
    valGridLine: { style: "none" }, catGridLine: { style: "none" }, showLegend: false,
    showTitle: true, title: "Macro-F1 on 494 held-out forecasts (1.0 = perfect)", titleFontSize: 14, titleColor: INK, titleFontFace: "+mn-lt",
  });
  [["0.73", "macro-F1, vs 0.61 for the best simple rule", BLUE], ["80%", "of High-congestion hours caught", RED], ["~1", "false alert per week (out of 10 forecasts)", AMBER], ["0.69", "macro-F1 even 2 hours ahead (92% of High caught)", GREEN]].forEach(([big, small, c], i) => {
    const y = 1.45 + i * 1.3;
    txt(s, big, { x: 8.4, y, w: 4.3, h: 0.65, fontSize: 36, bold: true, color: c });
    txt(s, small, { x: 8.4, y: y + 0.65, w: 4.3, h: 0.5, fontSize: 14 });
  });
  s.addNotes("Results on the held-out year: macro-F1 0.73 against 0.61 for the best baseline. Explain macro-F1: it checks each level fairly, unlike accuracy. The alert catches 4 of 5 jams with about one false alarm a week.");

  // ---------- 10. Test cases ----------
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "5 Testing & results" });
  title(s, "Test cases: where it works and where it fails");
  const ok = (t) => ({ text: t, options: { color: "006300", bold: true } });
  const bad = (t) => ({ text: t, options: { color: "A32020", bold: true } });
  s.addTable([
    [hdr("Arrival hour"), hdr("Result"), hdr("Situation"), hdr("P(High)"), hdr("Predicted → actual")],
    ["12 Sep 2018 08:00", ok("Success"), "Rainy peak: alert raised and correct", "99%", "High → High (6,297)"],
    ["23 Aug 2018 08:00", ok("Success"), "Event day (State Fair), heavy traffic", "93%", "High → High (6,162)"],
    ["25 Dec 2017 08:00", ok("Success"), "Christmas: no false alarm", "0%", "Low → Low (1,260)"],
    ["05 Feb 2018 08:00", bad("Failure"), "Quiet 6 AM, then a sudden surge", "1%", "Low → High (6,048)"],
    ["19 Apr 2018 09:00", bad("Failure"), "Barely over the High cut-off", "0%", "Moderate → High (5,842)"],
    ["28 Aug 2018 08:00", bad("Failure"), "False alarm: ended just under the cut-off", "98%", "High → Moderate (5,692)"],
  ], { x: 0.6, y: 1.45, w: 12.1, colW: [2.2, 1.3, 4.6, 1.2, 2.8], fontSize: 13, color: INK, border: { type: "solid", pt: 0.75, color: LINE }, rowH: 0.45 });
  card(s, 0.6, 4.85, 12.1, 1.75, "FEF3F2");
  txt(s, "Error analysis", { x: 0.9, y: 5.0, w: 4, h: 0.4, fontSize: 16, bold: true, color: INK });
  txt(s, [
    { text: "79% of false alarms ended within 300 veh/h below the cut-off; all 20 missed High hours were within 300 above it", options: { bullet: true, breakLine: true } },
    { text: "Weakest in fog and rain (67–68% correct), best in snow (91%); all 20 holiday forecasts were right", options: { bullet: true } },
  ], { x: 0.9, y: 5.45, w: 11.5, h: 1.1, fontSize: 14, paraSpaceAfter: 4 });
  s.addNotes("Show failures honestly. Most mistakes sit right at a level boundary. The worst miss followed a quiet early morning with a sudden surge. Ten cases are in the report and on the website's performance tab.");

  // ---------- 11. Factors + limitations ----------
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "5 Testing & results" });
  title(s, "What drives the forecast, and what it can't do yet");
  s.addChart(pres.charts.BAR, [{ name: "Importance", labels: ["Recent volume & trend", "Usual volume (yesterday / last week)", "Season (month)", "Time of day", "Weather, holiday, weekday"], values: [0.191, 0.135, 0.012, 0.006, 0.0] }], {
    x: 0.6, y: 1.4, w: 6.6, h: 4.2, barDir: "bar", chartColors: [BLUE], showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.000", dataLabelFontSize: 12, dataLabelColor: INK, dataLabelFontFace: "+mn-lt",
    catAxisLabelColor: SUB, catAxisLabelFontSize: 12, catAxisLabelFontFace: "+mn-lt", catAxisOrientation: "maxMin", valAxisHidden: true, valAxisMinVal: 0, valAxisMaxVal: 0.25,
    valGridLine: { style: "none" }, catGridLine: { style: "none" }, showLegend: false,
    showTitle: true, title: "Drop in macro-F1 when a factor is shuffled", titleFontSize: 14, titleColor: INK, titleFontFace: "+mn-lt",
  });
  txt(s, "Weather and holidays matter on the days they occur, but they are rare in the test year. The per-forecast \"why\" chart shows their effect.", { x: 0.6, y: 5.75, w: 6.6, h: 0.8, fontSize: 12.5, color: MUTED });
  txt(s, "Limitations", { x: 7.7, y: 1.5, w: 5, h: 0.45, fontSize: 19, bold: true, color: INK });
  [["Not live", "Replays history; no traffic or weather API yet"], ["Stand-in road", "Highway I-94, not our gate: retrain on our counts"], ["Volume, not speed", "Labels are a proxy; queues and accidents are invisible"], ["Hourly", "15-minute data would give earlier, sharper alerts"], ["No campus events", "Exams and fests are not in the data"]].forEach(([h1, b1], i) => {
    const y = 2.1 + i * 0.9;
    circleIcon(s, I.warn, 7.7, y, "9CA3AF", 0.5);
    txt(s, h1, { x: 8.4, y: y - 0.04, w: 4.3, h: 0.35, fontSize: 15, bold: true, color: INK });
    txt(s, b1, { x: 8.4, y: y + 0.32, w: 4.3, h: 0.45, fontSize: 13 });
  });
  s.addNotes("Recent traffic and usual traffic for the slot dominate. Be upfront about the limits: no live feed, a stand-in road, volume-based labels, hourly resolution, and no campus calendar.");

  // ---------- 12. Responsible AI ----------
  pres.addSection({ title: "6 Responsible AI & SDGs" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "6 Responsible AI & SDGs" });
  title(s, "Responsible AI: private, fair about its limits, human in charge");
  const rai = [
    [I.lock, BLUE, "Privacy", "Vehicle counts only. No cameras, plates or personal data. Uploaded CSVs never leave the browser."],
    [I.scale, AMBER, "Bias & fairness", "One US highway; weaker in fog and rain (67–68%). Balanced class weights so High isn't ignored."],
    [I.shield, "6B7280", "Security", "Static site: no server, database or keys. User text is escaped; files are parsed as plain data."],
    [I.access, GREEN, "Accessibility", "Word + icon for every level, colour-blind-safe colours, keyboard use, screen-reader labels, dark mode, mobile."],
    [I.warn, RED, "Limitations", "Proxy labels, stand-in road, hourly data, no live feed. All stated on the site and in the report."],
    [I.human, DARK, "Human oversight", "Advisory only: the transport office decides. Borderline 40–60% shown as a probability. Nothing automated."],
  ];
  rai.forEach(([img, col, head, body], i) => {
    const x = 0.6 + (i % 3) * 4.1, y = 1.5 + Math.floor(i / 3) * 2.6;
    card(s, x, y, 3.9, 2.4);
    circleIcon(s, img, x + 0.3, y + 0.3, col, 0.6);
    txt(s, head, { x: x + 1.1, y: y + 0.38, w: 2.65, h: 0.45, fontSize: 17, bold: true, color: INK });
    txt(s, body, { x: x + 0.3, y: y + 1.05, w: 3.35, h: 1.25, fontSize: 13 });
  });
  s.addNotes("Cover the six responsible-AI areas: privacy, bias, security, accessibility, limitations and human oversight. The key point is that GateFlow advises and a person decides.");

  // ---------- 13. SDGs ----------
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "6 Responsible AI & SDGs" });
  title(s, "Aligned with the UN Sustainable Development Goals");
  const sdg = [["11", "F99D26", "Sustainable cities & communities", "Target 11.2: safer, more accessible transport at a shared choke point; pushes shuttles and alternate gates."],
    ["3", "4C9F38", "Good health & well-being", "3.6 road injuries and 3.9 air pollution: calmer gate queues, less stop-start exhaust."],
    ["13", "3F7E44", "Climate action", "Smoother flow and more shuttle use mean less idling and lower emissions."],
    ["9", "FD6925", "Industry, innovation & infrastructure", "9.1: more out of existing roads through data, not new construction."],
    ["4", "C5192D", "Quality education", "4.a: students reach class on time and safely."]];
  sdg.forEach(([n, col, head, body], i) => {
    const y = 1.45 + i * 1.07;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y, w: 0.9, h: 0.9, rectRadius: 0.1, fill: { color: col }, line: { color: col }, objectName: "sdg-" + n });
    txt(s, n, { x: 0.6, y, w: 0.9, h: 0.9, fontSize: 30, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
    txt(s, "SDG " + n + ": " + head, { x: 1.75, y: y + 0.05, w: 10.9, h: 0.4, fontSize: 17, bold: true, color: INK });
    txt(s, body, { x: 1.75, y: y + 0.45, w: 10.9, h: 0.45, fontSize: 14 });
  });
  s.addNotes("The main goal is SDG 11.2, safe and sustainable transport, supported by health (SDG 3), climate (SDG 13), infrastructure (SDG 9) and education (SDG 4).");

  // ---------- 14. Conclusion ----------
  pres.addSection({ title: "7 Conclusion" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "7 Conclusion" });
  title(s, "Implemented today, and what comes next");
  card(s, 0.6, 1.45, 5.95, 5.15, "EAF6EA");
  card(s, 6.75, 1.45, 5.95, 5.15, CARD);
  txt(s, "Implemented and working", { x: 0.95, y: 1.7, w: 5.3, h: 0.45, fontSize: 19, bold: true, color: "006300" });
  txt(s, [
    { text: "Real-data model, beats all baselines on a held-out year", options: { bullet: true, breakLine: true } },
    { text: "1-hour-ahead forecast, alert at P(High) ≥ 50%, explanations", options: { bullet: true, breakLine: true } },
    { text: "Web dashboard: replay, what-if, manual entry, CSV upload, performance, responsible AI", options: { bullet: true, breakLine: true } },
    { text: "Agentic AI layer: tool loop that overrides the alert for crashes and closures", options: { bullet: true, breakLine: true } },
    { text: "Model runs in the browser; deployed from GitHub to Vercel", options: { bullet: true, breakLine: true } },
    { text: "Metrics, confusion matrix, test cases with failures, parity tests", options: { bullet: true } },
  ], { x: 0.95, y: 2.3, w: 5.3, h: 4.1, fontSize: 15, paraSpaceAfter: 8, color: INK });
  txt(s, "Planned next", { x: 7.1, y: 1.7, w: 5.3, h: 0.45, fontSize: 19, bold: true, color: INK });
  txt(s, [
    { text: "Count vehicles at our own gate for a few weeks and retrain (same code)", options: { bullet: true, breakLine: true } },
    { text: "Speed or queue labels from a camera or GPS", options: { bullet: true, breakLine: true } },
    { text: "Live traffic counter and weather-forecast APIs", options: { bullet: true, breakLine: true } },
    { text: "Real government incident and roadworks APIs for the agent", options: { bullet: true, breakLine: true } },
    { text: "SMS or app notifications run by the transport office", options: { bullet: true, breakLine: true } },
    { text: "15-minute data and the campus event calendar", options: { bullet: true } },
  ], { x: 7.1, y: 2.3, w: 5.3, h: 4.1, fontSize: 15, paraSpaceAfter: 8, color: INK });
  s.addNotes("Close by separating what works today from what is planned. The most important next step is our own gate counts, which need no code changes.");

  s = pres.addSlide({ masterName: "DARK", sectionTitle: "7 Conclusion" });
  s.addImage({ data: I.light, x: 0.8, y: 1.0, w: 0.9, h: 0.9, objectName: "logo" });
  titleDark(s, "Catches 4 of 5 jams, one hour early");
  txt(s, "About one false alarm a week · explainable · private · runs free in any browser", { x: 0.8, y: 3.7, w: 11.5, h: 0.6, fontSize: 20, color: "E5E7EB" });
  txt(s, [
    { text: "Code: github.com/AnmolDiwan/gateflow-congestion-alert", options: { breakLine: true } },
    { text: "Data: Hogue (2019), Metro Interstate Traffic Volume, UCI ML Repository, CC BY 4.0" },
  ], { x: 0.8, y: 5.6, w: 11.5, h: 0.9, fontSize: 14, color: "9CA3AF" });
  s.addNotes("Thank the judges and invite questions. Have the website open for the live demo.");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote " + OUT);
})();
