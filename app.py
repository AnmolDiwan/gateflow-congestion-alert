"""Campus Gate congestion dashboard (Streamlit).

Run:  streamlit run app.py
Requires models/congestion_model.joblib (created by `python train.py`).
"""
import io
import json
from pathlib import Path

import altair as alt
import joblib
import pandas as pd
import streamlit as st

from features import (FEATURES, LEVEL_BINS, LEVELS, RAW_COLUMNS, WEATHERS, build_features, clean,
                      factor_contributions, level_of, load)

ROOT = Path(__file__).parent
RAW = ROOT / "data" / "raw" / "Metro_Interstate_Traffic_Volume.csv.gz"
LEVEL_COLORS = {"Low": "#2e9e5b", "Moderate": "#e0a100", "High": "#d64545"}
DOW = ["Mon", "Tue", "Wed", "Thu", "Fri"]

st.set_page_config(page_title="Campus Gate Congestion Alert", page_icon="🚦", layout="wide")


@st.cache_resource
def load_artifact():
    return joblib.load(ROOT / "models" / "congestion_model.joblib")


@st.cache_data
def load_features(lead):
    return build_features(load(RAW), lead)


art = load_artifact()
model, ref, LEAD, THR = art["model"], art["reference"], art["lead_h"], art["alert_threshold"]
feat = load_features(LEAD)
test_start = pd.Timestamp(art["test_start"]).date()
test = feat[feat["date"] >= test_start].copy()
test["p_high"] = model.predict_proba(test[FEATURES].astype(float))[:, 2]


def hh(h):
    return f"{int(h):02d}:00"


@st.cache_data
def template_csv():
    """A few real weekdays in the original dataset format, offered as an upload template."""
    raw = pd.read_csv(RAW, parse_dates=["date_time"])
    sample = raw[raw["date_time"].between("2018-09-10", "2018-09-14 09:00")].drop_duplicates("date_time")
    return sample[RAW_COLUMNS].to_csv(index=False).encode()


def forecast_raw(raw, lead):
    """Clean user-supplied records, extend the grid to the next target hour and build forecast rows."""
    last = pd.to_datetime(raw["date_time"]).max()
    f = build_features(clean(raw, extend_to=last.normalize() + pd.Timedelta(hours=9)), lead, require_target=False)
    if len(f):
        proba = model.predict_proba(f[FEATURES].astype(float))
        f["p_high"] = proba[:, 2]
        f["forecast"] = [LEVELS[i] for i in proba.argmax(1)]
    return f


# ---------------- header ----------------
st.title("🚦 Campus Gate: Smart Congestion Alert")
st.caption(f"Forecasts congestion for the **08:00–10:00 weekday arrival window**, **{LEAD} h ahead** · model: "
           f"{art['model_name']} · trained on real hourly counts (UCI/Kaggle *Metro Interstate Traffic Volume*, I-94 WB) "
           "used as a stand-in for the campus approach road · ⚠️ **no live traffic feed is connected**.")

tab_live, tab_eval = st.tabs(["Dashboard", "Model evaluation"])
entry_box = tab_live.container()  # manual-entry widgets render here, above the results

# ---------------- sidebar inputs ----------------
with st.sidebar:
    st.header("Input")
    mode = st.radio("Mode", ["Replay a held-out test day", "What-if scenario", "Manual data entry"])
    if mode.startswith("Replay"):
        dates = sorted(test["date"].unique())
        default = next((i for i, d in enumerate(dates) if pd.Timestamp(d) >= pd.Timestamp("2018-09-12")), 0)
        day = st.selectbox("Test day (never seen in training)", dates, index=default,
                           format_func=lambda d: pd.Timestamp(d).strftime("%a %d %b %Y"))
        hours = sorted(test.loc[test["date"] == day, "target_hour"])
        hour = st.radio("Arrival hour to forecast", hours, format_func=lambda h: f"{hh(h)}–{hh(h + 1)}", horizontal=True)
        row = test[(test["date"] == day) & (test["target_hour"] == hour)].iloc[0]
        x = row[FEATURES]
        actual, weather_now = row["target_level"], row["weather_now"]
    elif mode.startswith("Manual"):
        how = st.radio("Input method", ["Type readings", "Upload CSV"])
        actual = None
        if how == "Type readings":
            next_weekday = pd.Timestamp.today().normalize() + pd.offsets.BDay(1)
            day = pd.Timestamp(st.date_input("Forecast date (weekday)", value=next_weekday))
            hour = st.radio("Arrival hour to forecast", [8, 9], format_func=lambda h: f"{hh(h)}–{hh(h + 1)}",
                            horizontal=True)
            v_yday = st.number_input(f"Same hour yesterday ({hh(hour)}), veh/h", 0, 8000, value=None,
                                     placeholder="leave empty if unknown")
            v_lw = st.number_input(f"Same hour last week ({hh(hour)}), veh/h", 0, 8000, value=None,
                                   placeholder="leave empty if unknown")
            holiday = st.checkbox("Holiday / big event on this day")
    else:
        hour = st.radio("Arrival hour to forecast", [8, 9], format_func=lambda h: f"{hh(h)}–{hh(h + 1)}", horizontal=True)
        dow = st.selectbox("Day of week", range(5), format_func=lambda d: DOW[d])
        month = st.slider("Month", 1, 12, 9)
        st.markdown("**Traffic observed so far** (veh/h)")
        d_now, d_prev, d_yday, d_lw = {8: (5800, 2900, 5900, 6000), 9: (6300, 5600, 5000, 5000)}[hour]  # busy weekday
        v_now = st.slider(f"Last completed hour ({hh(hour - LEAD - 1)})", 500, 7000, d_now, 50, key=f"vn{hour}")
        v_prev = st.slider(f"Hour before that ({hh(hour - LEAD - 2)})", 200, 7000, d_prev, 50, key=f"vp{hour}")
        v_yday = st.slider(f"Same hour yesterday ({hh(hour)})", 500, 7000, d_yday, 50, key=f"vy{hour}")
        v_lw = st.slider(f"Same hour last week ({hh(hour)})", 500, 7000, d_lw, 50, key=f"vl{hour}")
        weather_now = st.selectbox("Weather now", WEATHERS)
        temp = st.slider("Temperature (°C)", -30, 35, -5)
        rain = st.slider("Rain last hour (mm)", 0.0, 20.0, 0.0, 0.5)
        snow = st.slider("Snow last hour (mm)", 0.0, 1.0, 0.0, 0.05)
        clouds = st.slider("Cloud cover (%)", 0, 100, 90)
        holiday = st.checkbox("Holiday / big event day")
        x = pd.Series({"target_hour": hour, "dow": dow, "month": month,
                       "vol_now": v_now, "vol_prev": v_prev, "vol_trend": v_now - v_prev,
                       "vol_yday": v_yday, "vol_lastweek": v_lw,
                       **{f"w_{w}": int(w == weather_now) for w in WEATHERS},
                       "temp_c": temp, "rain_mm": rain, "snow_mm": snow, "clouds": clouds,
                       "holiday_event": int(holiday)})[FEATURES]
        actual = None

if mode.startswith("Manual"):
    with entry_box:
        if how == "Type readings":
            target = day + pd.Timedelta(hours=hour)
            st.subheader(f"Enter hourly readings for {day:%a %d %b %Y}")
            st.caption(f"The forecast for {hh(hour)}–{hh(hour + 1)} is made at {hh(hour - LEAD)}, so only hours that "
                       f"have finished by then are used (the {hh(hour - LEAD)} hour is still in progress). "
                       "Edit any cell; the forecast updates instantly.")
            typical = {5: 2900, 6: 5800, 7: 6300}
            hours_in = list(range(5, hour - LEAD))
            n = len(hours_in)
            entry = st.data_editor(
                pd.DataFrame({"Hour start": [hh(h) for h in hours_in],
                              "Vehicles/hour": [typical[h] for h in hours_in],
                              "Weather": ["Clear"] * n, "Temp °C": [15.0] * n,
                              "Rain mm": [0.0] * n, "Snow mm": [0.0] * n, "Cloud %": [20] * n}),
                key=f"entry{hour}", hide_index=True, width="stretch", num_rows="fixed",
                column_config={
                    "Hour start": st.column_config.TextColumn(disabled=True),
                    "Vehicles/hour": st.column_config.NumberColumn(min_value=0, max_value=8000, step=50, required=True),
                    "Weather": st.column_config.SelectboxColumn(options=WEATHERS, required=True),
                    "Temp °C": st.column_config.NumberColumn(min_value=-40.0, max_value=45.0, step=0.5),
                    "Rain mm": st.column_config.NumberColumn(min_value=0.0, max_value=60.0, step=0.1),
                    "Snow mm": st.column_config.NumberColumn(min_value=0.0, max_value=5.0, step=0.05),
                    "Cloud %": st.column_config.NumberColumn(min_value=0, max_value=100, step=5)})
            raw = pd.DataFrame({
                "date_time": [day + pd.Timedelta(hours=h) for h in hours_in],
                "traffic_volume": entry["Vehicles/hour"].astype(float), "weather_main": entry["Weather"],
                "temp": entry["Temp °C"].astype(float) + 273.15, "rain_1h": entry["Rain mm"].astype(float),
                "snow_1h": entry["Snow mm"].astype(float), "clouds_all": entry["Cloud %"].astype(float)})
            past = [(target - pd.Timedelta(hours=24), v_yday), (target - pd.Timedelta(days=7), v_lw)]
            raw = pd.concat([raw, pd.DataFrame([{"date_time": t, "traffic_volume": float(v)}
                                                for t, v in past if v is not None])], ignore_index=True)
            raw["holiday"] = "None"
            if holiday:
                raw.loc[raw["date_time"].dt.normalize() == day, "holiday"] = "Manual event"
            f = forecast_raw(raw, LEAD)
            f = f[f["target_time"] == target]
            if f.empty:
                st.error("No forecast possible: pick a weekday (Mon–Fri) and fill in the vehicle counts.")
                st.stop()
            row = f.iloc[0]
        else:
            st.subheader("Upload hourly readings (CSV)")
            st.caption("Same columns as the original dataset: **date_time, traffic_volume** (required); "
                       "weather_main, temp (Kelvin), rain_1h, snow_1h, clouds_all, holiday (optional). "
                       "Every weekday 08:00 / 09:00 hour that has the readings it needs gets a forecast, "
                       "including the next target hour after your last reading.")
            c1, c2 = st.columns([1, 2])
            c1.download_button("Download template CSV", template_csv(), "traffic_template.csv", "text/csv")
            up = c2.file_uploader("CSV file", type="csv", label_visibility="collapsed")
            if up is None:
                st.info("No file uploaded yet: showing the template (real readings, 10–14 Sep 2018).")
                raw = pd.read_csv(io.BytesIO(template_csv()))
            else:
                raw = pd.read_csv(up)
            missing = [c for c in ("date_time", "traffic_volume") if c not in raw.columns]
            if missing:
                st.error(f"Missing required column(s): {', '.join(missing)}")
                st.stop()
            defaults = {"weather_main": "Clear", "temp": 288.15, "rain_1h": 0.0, "snow_1h": 0.0,
                        "clouds_all": 0.0, "holiday": "None"}
            filled = [c for c in defaults if c not in raw.columns]
            for c in filled:
                raw[c] = defaults[c]
            if filled:
                st.warning(f"Not in file, filled with defaults: {', '.join(filled)}")
            try:
                f = forecast_raw(raw, LEAD)
            except Exception as e:  # malformed dates or numbers in a user file
                st.error(f"Could not read the file: {e}")
                st.stop()
            if f.empty:
                st.error("No forecast possible: the file needs weekday readings for the 2–3 hours before 08:00 or 09:00.")
                st.stop()
            table = pd.DataFrame({
                "Target hour": f["target_time"].dt.strftime("%a %d %b %Y %H:00"), "Forecast": f["forecast"],
                "P(High)": f["p_high"].round(3), "Alert": f["p_high"] >= THR,
                "Actual": f["target_level"].fillna("not known yet")})
            st.dataframe(table, hide_index=True, width="stretch", height=min(36 * len(table) + 40, 320))
            st.download_button("Download forecasts CSV", table.to_csv(index=False).encode(), "forecasts.csv", "text/csv")
            pick = st.selectbox("Show details for", range(len(f)), index=len(f) - 1,
                                format_func=lambda i: table["Target hour"].iloc[i])
            row = f.iloc[pick]
            if pd.notna(row["target_level"]):
                actual = row["target_level"]
        st.divider()
    x, hour, weather_now = row[FEATURES], int(row["target_hour"]), row["weather_now"]

p_high, contrib = factor_contributions(model, x, ref)
proba = model.predict_proba(x.astype(float).to_frame().T)[0]
pred = LEVELS[proba.argmax()]
window = f"{hh(hour)}–{hh(hour + 1)}"

with tab_live:
    # ---------------- alert ----------------
    if p_high >= THR:
        st.error(f"### 🚨 HIGH CONGESTION EXPECTED {window}\n"
                 f"P(High) = **{p_high:.0%}** (forecast made at {hh(hour - LEAD)}). Suggested actions: notify students "
                 "to leave ~20 min earlier, open alternate Gate 3, put a traffic marshal at the junction, run an extra shuttle.")
    elif pred == "Moderate":
        st.warning(f"### ⚠️ Moderate congestion likely {window} · P(High) = {p_high:.0%}")
    else:
        st.success(f"### ✅ Traffic expected to flow normally {window} · P(High) = {p_high:.0%}")

    k1, k2, k3, k4, k5 = st.columns(5)
    k1.metric(f"Predicted level {window}", pred)
    k2.metric("P(High)", f"{p_high:.0%}")
    k3.metric(f"Volume {hh(hour - LEAD - 1)} (veh/h)", f"{int(x['vol_now']):,}",
              f"{int(x['vol_trend']):+,}" if pd.notna(x["vol_trend"]) else None)
    k4.metric("Weather now", weather_now)
    k5.metric("Holiday / event", "Yes" if x["holiday_event"] else "No")
    if actual is not None:
        ok = "✅ correct" if actual == pred else "❌ miss"
        st.caption(f"What actually happened {window}: **{actual}** ({int(row['target_volume']):,} veh/h) — {ok}")


    # ---------------- map-style mock-up ----------------
    with st.container():
        st.subheader("Road segment view (schematic mock-up)")
        up_level = level_of(pd.Series([x["vol_now"]])).iloc[0]
        seg_c, up_c = LEVEL_COLORS[pred], LEVEL_COLORS[up_level]
        pulse = '<animate attributeName="stroke-opacity" values="1;0.35;1" dur="1.2s" repeatCount="indefinite"/>' \
            if p_high >= THR else ""
        svg = f"""
        <svg viewBox="0 0 620 300" width="100%" style="font-family:sans-serif;background:#f6f7f4;border-radius:12px">
          <rect x="430" y="40" width="170" height="200" rx="10" fill="#e3ecdf" stroke="#9db58f"/>
          <text x="515" y="70" text-anchor="middle" font-size="15" font-weight="600" fill="#3d5a2f">CAMPUS</text>
          <rect x="420" y="128" width="22" height="34" fill="#555"/>
          <text x="470" y="150" font-size="12" fill="#333">Main Gate</text>
          <rect x="505" y="232" width="34" height="14" fill="#555"/>
          <text x="545" y="268" font-size="11" fill="#666" text-anchor="middle">Gate 3 (alternate)</text>
          <line x1="20" y1="145" x2="200" y2="145" stroke="{up_c}" stroke-width="16" stroke-linecap="round"/>
          <text x="110" y="122" text-anchor="middle" font-size="12" fill="#333">Now ({hh(hour - LEAD - 1)} count)</text>
          <text x="110" y="178" text-anchor="middle" font-size="11" fill="#555">{int(x['vol_now']):,} veh/h</text>
          <line x1="215" y1="145" x2="415" y2="145" stroke="{seg_c}" stroke-width="22" stroke-linecap="round">{pulse}</line>
          <text x="315" y="120" text-anchor="middle" font-size="13" font-weight="600" fill="#222">Approach road</text>
          <text x="315" y="182" text-anchor="middle" font-size="12" fill="#222">Forecast {window}: {pred} · P(High) {p_high:.0%}</text>
          <circle cx="207" cy="145" r="9" fill="#fff" stroke="#555" stroke-width="2"/>
          <path d="M207 145 Q 260 250 505 240" fill="none" stroke="#b9b9b9" stroke-width="7" stroke-dasharray="10 7"/>
          <g font-size="11" fill="#333">
            <rect x="20" y="255" width="12" height="12" fill="{LEVEL_COLORS['Low']}"/><text x="38" y="265">Low &lt;{LEVEL_BINS[1]:,.0f}</text>
            <rect x="120" y="255" width="12" height="12" fill="{LEVEL_COLORS['Moderate']}"/><text x="138" y="265">Moderate</text>
            <rect x="210" y="255" width="12" height="12" fill="{LEVEL_COLORS['High']}"/><text x="228" y="265">High ≥{LEVEL_BINS[2]:,.0f} veh/h</text>
            <text x="20" y="290" fill="#777">Schematic, not to scale. Left = latest observed volume; right = model forecast.</text>
          </g>
        </svg>"""
        st.iframe(svg, height=330)

        probs = pd.DataFrame({"level": LEVELS, "p": proba, "order": [0, 1, 2]})
        st.altair_chart(
            alt.Chart(probs).mark_bar(height=26).encode(
                x=alt.X("p:Q", stack="normalize", title=f"Class probabilities {window}", axis=alt.Axis(format="%")),
                color=alt.Color("level:N", scale=alt.Scale(domain=LEVELS, range=list(LEVEL_COLORS.values())),
                                legend=alt.Legend(orient="bottom", title=None)),
                order=alt.Order("order:Q"),
                tooltip=["level", alt.Tooltip("p:Q", format=".0%")],
            ).properties(height=70),
            width="stretch")

    # ---------------- factor contributions ----------------
    with st.container():
        st.subheader("Why? Factors behind this prediction")
        cdf = contrib.rename("delta").reset_index().rename(columns={"index": "factor"})
        cdf["direction"] = cdf["delta"].map(lambda d: "raises risk" if d > 0 else "lowers risk")
        st.altair_chart(
            alt.Chart(cdf).mark_bar().encode(
                x=alt.X("delta:Q", title="Change in P(High) vs. a calm reference hour", axis=alt.Axis(format="+%")),
                y=alt.Y("factor:N", sort=list(cdf["factor"]), title=None, axis=alt.Axis(labelLimit=260)),
                color=alt.Color("direction:N", scale=alt.Scale(domain=["raises risk", "lowers risk"],
                                                               range=["#d64545", "#2e9e5b"]),
                                legend=alt.Legend(orient="bottom", title=None)),
                tooltip=["factor", alt.Tooltip("delta:Q", format="+.1%")],
            ).properties(height=320),
            width="stretch")
        top = cdf[cdf["delta"] > 0.02].head(2)
        if len(top):
            st.markdown("**Main drivers:** " + ", ".join(f"{r.factor} (+{r.delta:.0%})" for r in top.itertuples()))
        st.caption("Each bar: how much P(High) would drop if that factor were reset to a typical calm value "
                   "(median volumes, Clear weather, no rain/snow, no holiday), all other inputs unchanged.")

    # ---------------- recent weeks timeline ----------------
    if mode.startswith("Replay"):
        st.subheader(f"Forecast vs. actual, {window} arrivals: 4 weeks around the selected day")
        lo, hi = pd.Timestamp(day) - pd.Timedelta(days=14), pd.Timestamp(day) + pd.Timedelta(days=14)
        tl = test[(test["target_hour"] == hour) & test["target_time"].between(lo, hi)]
        base = alt.Chart(tl).encode(x=alt.X("target_time:T", title=None, axis=alt.Axis(format="%a %d %b")))
        line = base.mark_line(color="#2f5d9e", strokeWidth=2).encode(
            y=alt.Y("p_high:Q", title="Forecast P(High)", scale=alt.Scale(domain=[0, 1])))
        pts = base.mark_circle(size=80, opacity=1).encode(
            y="p_high:Q",
            color=alt.Color("target_level:N", title="Actual level",
                            scale=alt.Scale(domain=LEVELS, range=list(LEVEL_COLORS.values()))),
            tooltip=[alt.Tooltip("target_time:T", format="%a %d %b %H:%M"), "target_level",
                     alt.Tooltip("target_volume:Q", format=",", title="actual veh/h"),
                     alt.Tooltip("p_high:Q", format=".0%"), "weather_now", "holiday_name"])
        thr = alt.Chart(pd.DataFrame({"y": [THR]})).mark_rule(strokeDash=[6, 4], color="#d64545").encode(y="y:Q")
        now = alt.Chart(pd.DataFrame({"t": [row["target_time"]]})).mark_rule(color="#555").encode(x="t:T")
        st.altair_chart((line + pts + thr + now).properties(height=260), width="stretch")
        st.caption(f"Dashed line = alert threshold ({THR:.0%}). Dots coloured by what actually happened. Grey line = selected day.")

# ---------------- evaluation tab ----------------
with tab_eval:
    m = json.loads((ROOT / "reports" / "metrics.json").read_text())
    st.subheader(f"Held-out test set: {test['date'].nunique()} weekdays "
                 f"({test['date'].min():%d %b %Y} – {test['date'].max():%d %b %Y}), {len(test)} forecasts")
    st.dataframe(pd.DataFrame(m["test"]).T.rename(columns=lambda c: c.replace("_", " ")), width="stretch")
    st.markdown(f"Model selected by training-only time-series CV: **{m['selected_model']}**. "
                f"Alert when P(High) ≥ {m['alert_threshold']:.0%}.")
    c1, c2 = st.columns(2)
    c1.image(str(ROOT / "reports" / "comparison.png"))
    c2.image(str(ROOT / "reports" / "confusion_matrices.png"))
    c1.image(str(ROOT / "reports" / "factor_importance.png"))
    ls = pd.DataFrame(m["lead_time_sensitivity"]).T
    ls.index = [f"{h} h before" for h in ls.index]
    c2.markdown("**How early can we alert? (macro-F1)**")
    c2.dataframe(ls.rename(columns={"baseline": "historical-average baseline", "model": "model",
                                    "model_high_recall": "model High recall"}), width="stretch")
    st.info("Real historical data (I-94, 2012–2018) used as a stand-in road. No live traffic integration is implemented.")
