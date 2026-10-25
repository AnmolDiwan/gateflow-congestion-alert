// Agentic AI layer on top of the (unchanged) ML model.
// The ML model only sees counts, weather and calendar, so it cannot react to one-off events such as
// a crash or a lane closure. This agent runs an observe -> plan -> act -> reason -> reflect -> decide
// loop: it starts from the ML forecast, calls tools (government incident feed, roadworks permits,
// news), cross-checks what it finds and adjusts the alert, showing every step.
//
// Two engines with the same tools:
//   runBuiltinAgent  - deterministic planner + rules, runs offline (no key)
//   runClaudeAgent   - Claude (claude-opus-5-5) drives the tool loop; optional live web search

const SOURCES = {
  govt_traffic: "Government traffic incident feed",
  govt_roadworks: "Government roadworks permits",
  news: "News stations & public reports",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

// Does an event overlap the arrival window [start, start + 60 min]? Handles works that run past midnight.
function overlaps(ev, windowStartMin) {
  if (!ev.start) return true;
  let s = toMin(ev.start);
  let e = ev.end ? toMin(ev.end) : 24 * 60;
  if (e <= s) e += 24 * 60; // e.g. 22:00-05:00
  const w0 = windowStartMin, w1 = windowStartMin + 60;
  return (s < w1 && e > w0) || (s < w1 + 1440 && e > w0 + 1440);
}

// ---------- tools (shared by both engines) ----------
export function makeTools(scenario, { live = false } = {}) {
  const fetchFeed = (key) => {
    if (live) return { status: "no_live_feed", source: SOURCES[key],
      message: "No live government/news feed is connected in this prototype. Use web_search for current reports." };
    return { status: "ok", source: SOURCES[key], items: scenario.feeds[key] || [] };
  };
  return {
    get_traffic_incidents: () => fetchFeed("govt_traffic"),
    get_roadworks: () => fetchFeed("govt_roadworks"),
    get_news_reports: () => fetchFeed("news"),
  };
}

// ---------- shared reasoning rules ----------
function assess(base, events, windowStartMin) {
  let p = base.pHigh;
  const notes = [];
  let officialOverride = false, needsHuman = false, closure = false, laneClosure = false;
  const officialRoutes = events.filter((e) => e.credibility === "official" && e.on_route && overlaps(e, windowStartMin));
  for (const ev of events) {
    const tag = `[${ev.id}] ${ev.title}`;
    if (!ev.on_route) { notes.push({ ev, effect: "ignored", text: `${tag}: not on the campus approach route (${ev.distance_km} km away).` }); continue; }
    if (!overlaps(ev, windowStartMin)) { notes.push({ ev, effect: "ignored", text: `${tag}: ${ev.start}–${ev.end}, does not overlap the arrival window.` }); continue; }
    if (ev.credibility === "unverified") {
      needsHuman = true;
      notes.push({ ev, effect: "flag", text: `${tag}: unverified and not confirmed by any official source, so the forecast is not changed. Flagged for a human check.` });
      continue;
    }
    if (ev.full_closure) {
      if ((ev.credibility === "official" || officialRoutes.some((o) => o.full_closure)) && closure) {
        notes.push({ ev, effect: "info", text: `${tag}: independently confirms the closure (${ev.publisher}).` });
      } else if (ev.credibility === "official" || officialRoutes.some((o) => o.full_closure)) {
        const before = p; p = Math.max(p, 0.97); officialOverride = true; closure = true;
        notes.push({ ev, effect: "raise", text: `${tag}: road fully blocked on the route during the arrival window. The ML model cannot see this, so P(High) goes from ${(before * 100).toFixed(0)}% to ${(p * 100).toFixed(0)}%.` });
      } else {
        const before = p; p = 1 - (1 - p) * 0.5; needsHuman = true;
        notes.push({ ev, effect: "raise", text: `${tag}: news reports a closure but there is no official confirmation yet, so P(High) gets a partial raise from ${(before * 100).toFixed(0)}% to ${(p * 100).toFixed(0)}% and is flagged for a check.` });
      }
      continue;
    }
    if (ev.lanes_closed && ev.lanes_total) {
      const c = ev.lanes_closed / ev.lanes_total;
      const impact = Math.min(0.9, 1.5 * c);
      const before = p; p = 1 - (1 - p) * (1 - impact); laneClosure = true; officialOverride ||= ev.credibility === "official";
      notes.push({ ev, effect: "raise", text: `${tag}: ${ev.lanes_closed} of ${ev.lanes_total} lanes closed (${Math.round(c * 100)}% less capacity), so P(High) goes from ${(before * 100).toFixed(0)}% to ${(p * 100).toFixed(0)}%.` });
      continue;
    }
    notes.push({ ev, effect: "info", text: `${tag}: confirms an event already counted.` });
  }
  return { p, notes, officialOverride, needsHuman, closure, laneClosure };
}

function decide(base, a) {
  let level = a.p >= 0.5 ? "High" : base.level;
  if (level === "Low" && a.p >= 0.25) level = "Moderate";
  const actions = [];
  if (a.closure) actions.push("Divert all arrivals to Gate 3 now: the main approach road is blocked", "Push an urgent message to students and shuttles: road closed near the main gate", "Ask security to manage the Gate 3 queue; re-check the incident feed every 15 minutes for reopening");
  else if (a.laneClosure) actions.push("Tell students to leave 20–30 minutes earlier", "Open alternate Gate 3 and post a marshal at the works zone", "Run an extra shuttle in the 08:00–09:00 window");
  else if (level === "High") actions.push("Notify students to leave about 20 minutes earlier", "Open alternate Gate 3 and post a marshal at the junction");
  if (a.needsHuman) actions.push("Ask gate security to confirm the road status before sending any alert");
  if (!actions.length) actions.push("No action needed: keep the normal plan");
  const confidence = a.needsHuman ? "low" : a.officialOverride ? "high" : "medium";
  return { final_level: level, adjusted_p_high: a.p, alert: a.p >= 0.5, confidence, needs_human_check: a.needsHuman, actions };
}

// ---------- engine 1: built-in agent (offline) ----------
export async function runBuiltinAgent({ base, scenario, onStep, delay = 450 }) {
  const tools = makeTools(scenario);
  const step = async (s) => { onStep(s); await sleep(delay); };
  const win = `${String(base.hour).padStart(2, "0")}:00–${String(base.hour + 1).padStart(2, "0")}:00`;
  await step({ stage: "observe", title: "Read the ML forecast",
    detail: `ML model (unchanged): ${base.level}, P(High) ${(base.pHigh * 100).toFixed(0)}% for ${win} on ${base.dateLabel}. The model only knows counts, weather and the calendar. It cannot see crashes, closures or roadworks.` });
  await step({ stage: "plan", title: "Plan the checks",
    detail: "1) Official incident feed (most reliable). 2) Roadworks permits. 3) News reports to cross-check. Then decide whether the ML forecast still holds." });
  const events = [];
  for (const [name, label] of [["get_traffic_incidents", "Check government incident feed"], ["get_roadworks", "Check government roadworks permits"], ["get_news_reports", "Check news stations"]]) {
    const res = tools[name]();
    events.push(...res.items);
    await step({ stage: "act", title: label, tool: name,
      detail: res.items.length ? res.items.map((e) => `• ${e.title} (${e.road}, ${e.start}${e.end ? "–" + e.end : ""}, ${e.publisher})`).join("\n") : "• Nothing reported." });
  }
  const a = assess(base, events, base.hour * 60);
  await step({ stage: "reason", title: "Judge each event against the route and time window",
    detail: a.notes.length ? a.notes.map((n) => `• ${n.text}`).join("\n") : `• No events found. The ML forecast stands at ${(base.pHigh * 100).toFixed(0)}%.` });
  const official = events.filter((e) => e.credibility === "official" && e.on_route).length;
  const news = events.filter((e) => e.credibility === "news" && e.on_route).length;
  await step({ stage: "reflect", title: "Cross-check the sources",
    detail: a.needsHuman ? "Some information is not confirmed by an official source. I won't sound an alarm on a rumour, so this needs a human check."
      : official && news ? `An official feed and a news report agree (${official} official, ${news} news). Confidence is high.`
      : official ? "The information comes from an official government feed. Confidence is high."
      : "No relevant events from any source. Absence of reports isn't proof, so confidence is medium and the ML forecast is kept." });
  const final = { ...decide(base, a), reasons: a.notes.filter((n) => n.effect !== "ignored").map((n) => n.text),
    summary: a.closure ? "Road blocked on the route: override the ML forecast to High." : a.laneClosure ? "Lane closure cuts road capacity, so congestion risk goes up." : a.needsHuman ? "Unconfirmed report: keep the ML forecast and ask a person to verify."
      : events.some((e) => e.on_route) ? "Reported events are over before the arrival window or don't affect the route: the ML forecast stands."
      : "Nothing unusual found: the ML forecast stands.",
    sources_used: [...new Set(events.map((e) => e.publisher))] };
  await step({ stage: "decide", title: "Final decision", detail: final.summary });
  return final;
}

// ---------- engine 2: Claude agent ----------
const SYSTEM = `You are GateFlow's traffic agent for a college. Students arrive at the campus gate between 08:00 and 10:00.
An ML model has already forecast congestion for the coming arrival hour from traffic counts, weather and the calendar. It cannot see one-off events: crashes, road closures, roadworks, protests, VIP movements.
Your job: check the tools for such events, cross-verify them, and decide whether to keep or adjust the ML forecast.
Rules:
- Check the official government incident feed and roadworks permits first, then news to cross-check. If web_search is available, use it to look for current reports near the given location.
- An event matters only if it is on the campus approach route AND overlaps the arrival window.
- A confirmed full closure on the route during the window means High (adjusted P(High) about 0.95 or more).
- A partial lane closure raises the risk in proportion to the capacity lost.
- Never raise an alarm on unverified rumours alone. Keep the ML forecast and set needs_human_check.
- No relevant events means keep the ML forecast, with medium confidence.
Finish by calling submit_assessment exactly once. Keep reasons short and concrete.`;

const CLAUDE_TOOLS = [
  { name: "get_traffic_incidents", description: "Government traffic incident feed (police/transport department): crashes, breakdowns, closures near the campus route.", strict: true,
    input_schema: { type: "object", properties: { location: { type: "string" } }, required: ["location"], additionalProperties: false } },
  { name: "get_roadworks", description: "Government roadworks and construction permits affecting roads near the campus.", strict: true,
    input_schema: { type: "object", properties: { location: { type: "string" } }, required: ["location"], additionalProperties: false } },
  { name: "get_news_reports", description: "Recent local news-station and public reports about traffic near the campus.", strict: true,
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } },
  { name: "submit_assessment", description: "Submit the final decision. Call exactly once, at the end.", strict: true,
    input_schema: { type: "object", additionalProperties: false,
      required: ["final_level", "adjusted_p_high", "alert", "confidence", "needs_human_check", "summary", "reasons", "actions", "sources_used"],
      properties: {
        final_level: { type: "string", enum: ["Low", "Moderate", "High"] },
        adjusted_p_high: { type: "number", description: "0 to 1" },
        alert: { type: "boolean" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        needs_human_check: { type: "boolean" },
        summary: { type: "string" },
        reasons: { type: "array", items: { type: "string" } },
        actions: { type: "array", items: { type: "string" } },
        sources_used: { type: "array", items: { type: "string" } },
      } } },
];

export async function runClaudeAgent({ apiKey, base, scenario, live, location, onStep, maxTurns = 10 }) {
  const { default: Anthropic } = await import("https://esm.sh/@anthropic-ai/sdk@0.110.0");
  // The key stays in this page's memory only (never stored or sent anywhere except api.anthropic.com).
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const tools = makeTools(scenario, { live });
  const toolDefs = live ? [...CLAUDE_TOOLS, { type: "web_search_20260209", name: "web_search", max_uses: 5 }] : CLAUDE_TOOLS;
  const win = `${String(base.hour).padStart(2, "0")}:00–${String(base.hour + 1).padStart(2, "0")}:00`;
  const messages = [{ role: "user", content:
    `Location: ${location}\nArrival window: ${win} on ${live ? "today" : base.dateLabel}\n` +
    `ML forecast (do not recompute it): level ${base.level}; P(Low) ${base.proba[0].toFixed(2)}, P(Moderate) ${base.proba[1].toFixed(2)}, P(High) ${base.proba[2].toFixed(2)}.\n` +
    (live ? "Mode: LIVE. The government feeds aren't connected; use web_search for current accident, closure and roadworks reports near the location." :
      "Mode: REPLAY of a held-out day with SIMULATED example feeds. Use the feed tools; do not search the web.") +
    "\nCheck for one-off events, then call submit_assessment." }];
  onStep({ stage: "observe", title: "Read the ML forecast", detail: `ML model (unchanged): ${base.level}, P(High) ${(base.pHigh * 100).toFixed(0)}% for ${win}. Handing over to Claude (claude-opus-5-5)${live ? " with live web search" : ""}.` });

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "medium" },
      system: SYSTEM,
      tools: toolDefs,
      messages,
    });
    if (response.stop_reason === "refusal") throw new Error("Claude declined this request.");
    messages.push({ role: "assistant", content: response.content });

    const toolResults = [];
    for (const block of response.content) {
      if (block.type === "thinking" && block.thinking) onStep({ stage: "reason", title: "Claude is reasoning", detail: block.thinking });
      else if (block.type === "text" && block.text.trim()) onStep({ stage: "reflect", title: "Claude", detail: block.text });
      else if (block.type === "server_tool_use") onStep({ stage: "act", title: "Live web search", tool: "web_search", detail: `Query: ${block.input?.query ?? ""}` });
      else if (block.type === "web_search_tool_result") {
        const items = Array.isArray(block.content) ? block.content : [];
        onStep({ stage: "act", title: "Web search results", tool: "web_search",
          detail: items.length ? items.slice(0, 6).map((r) => `• ${r.title} (${r.url})`).join("\n") : "• No results / search error." });
      } else if (block.type === "tool_use") {
        if (block.name === "submit_assessment") {
          onStep({ stage: "decide", title: "Final decision", detail: block.input.summary });
          return block.input;
        }
        const fn = tools[block.name];
        const result = fn ? fn(block.input) : { status: "error", message: `unknown tool ${block.name}` };
        const label = { get_traffic_incidents: "Check government incident feed", get_roadworks: "Check government roadworks permits", get_news_reports: "Check news stations" }[block.name] || block.name;
        onStep({ stage: "act", title: label, tool: block.name,
          detail: result.items ? (result.items.length ? result.items.map((e) => `• ${e.title} (${e.road}, ${e.start}${e.end ? "–" + e.end : ""}, ${e.publisher})`).join("\n") : "• Nothing reported.") : `• ${result.message}` });
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result), is_error: !fn });
      }
    }
    if (response.stop_reason === "pause_turn") continue;
    if (toolResults.length) { messages.push({ role: "user", content: toolResults }); continue; }
    if (response.stop_reason === "end_turn") {
      messages.push({ role: "user", content: "Please call submit_assessment now with your decision." });
    }
  }
  throw new Error("The agent did not reach a decision within the turn limit.");
}
