"""Representative held-out test cases (successes AND failures) + a short error analysis.

Reads reports/test_predictions.csv (written by train.py) and writes
reports/test_cases.md and reports/test_cases.csv.
Usage: python make_test_cases.py
"""
from pathlib import Path

import pandas as pd

from features import LEVEL_BINS

ROOT = Path(__file__).parent
HIGH_CUT = LEVEL_BINS[2]

# Chosen to cover each situation the system meets: normal peaks, weather, holidays, and each kind of error
CASES = [
    ("2018-09-12 08:00", "success", "Rainy weekday peak: High alert raised and correct"),
    ("2017-11-21 08:00", "success", "Snow: High still caught"),
    ("2018-08-23 08:00", "success", "Event day (State Fair) with heavy traffic: High alert correct"),
    ("2017-12-25 08:00", "success", "Christmas holiday: correctly Low, no alert"),
    ("2017-10-27 08:00", "success", "Snowy but moderate morning: correctly Moderate"),
    ("2018-02-05 08:00", "failure", "Missed High: quiet 6 AM, then a sudden surge"),
    ("2018-07-31 08:00", "failure", "Missed High in fog, called Low"),
    ("2018-04-19 09:00", "failure", "Missed High at 9 AM: barely over the cut-off (5,842)"),
    ("2018-08-28 08:00", "failure", "False alarm: 98% High, actual 5,692, just under the cut-off"),
    ("2017-11-09 08:00", "failure", "False alarm in snow: predicted High, actual Moderate"),
]


def main():
    p = pd.read_csv(ROOT / "reports" / "test_predictions.csv", parse_dates=["target_time"])
    p["correct"] = p["predicted_level"] == p["target_level"]
    rows = []
    for ts, kind, note in CASES:
        r = p[p["target_time"] == pd.Timestamp(ts)].iloc[0]
        rows.append({"target_time": ts, "type": kind, "situation": note, "weather": r.weather_now,
                     "holiday_or_event": bool(r.holiday_event), "volume_2h_before": int(r.vol_now),
                     "p_high": round(float(r.p_high), 3), "predicted": r.predicted_level,
                     "actual": r.target_level, "actual_volume": int(r.target_volume), "alert": bool(r.alert)})
    cases = pd.DataFrame(rows)
    cases.to_csv(ROOT / "reports" / "test_cases.csv", index=False)
    cases.to_json(ROOT / "public" / "test_cases.json", orient="records")  # shown on the website's performance tab

    false_alarms = p[p["alert"] & (p["target_level"] != "High")]
    missed = p[~p["alert"] & (p["target_level"] == "High")]
    near_fa = (false_alarms["target_volume"] >= HIGH_CUT - 300).mean()
    near_miss = (missed["target_volume"] < HIGH_CUT + 300).mean()
    by_weather = p.groupby("weather_now")["correct"].agg(["mean", "size"]).sort_values("mean")
    by_hour = p.groupby(p["target_time"].dt.hour)["correct"].mean()
    holiday_acc = p.loc[p["holiday_event"] == 1, "correct"].mean()

    lines = ["# Representative test cases (held-out year, Oct 2017 – Sep 2018)", "",
             "The model never saw these days while training. Each row is one forecast made 1 hour before the arrival hour.", "",
             "| Arrival hour | Type | Situation | Weather | Count 2 h before | P(High) | Predicted | Actual (veh/h) |",
             "|---|---|---|---|---|---|---|---|"]
    for r in rows:
        mark = "✅ success" if r["type"] == "success" else "❌ failure"
        lines.append(f"| {r['target_time']} | {mark} | {r['situation']} | {r['weather']}{' + event' if r['holiday_or_event'] else ''} | "
                     f"{r['volume_2h_before']:,} | {r['p_high']:.0%} | {r['predicted']} | {r['actual']} ({r['actual_volume']:,}) |")
    lines += ["", "## Error analysis", "",
              f"- **False alarms:** {len(false_alarms)} on {p['target_time'].dt.date.nunique()} test days. "
              f"{near_fa:.0%} of them were hours whose real volume was within 300 veh/h of the {HIGH_CUT:,.0f} cut-off: busy hours that just missed High.",
              f"- **Missed High hours:** {len(missed)}. In {near_miss:.0%} of them the real volume was less than 300 veh/h above the cut-off, "
              "so they were borderline. The worst misses had a quiet early morning followed by a sudden surge that the earlier hours didn't hint at (see 2018-02-05).",
              f"- **Holidays:** {holiday_acc:.0%} of holiday or event forecasts were correct ({int((p['holiday_event'] == 1).sum())} forecasts).",
              "- **Accuracy by weather:** " + ", ".join(f"{w} {m:.0%} (n={int(n)})" for w, (m, n) in by_weather.iterrows()) + ".",
              "- **Accuracy by arrival hour:** " + ", ".join(f"{h:02d}:00 {v:.0%}" for h, v in by_hour.items()) + ".",
              "", "Most errors happen between neighbouring levels close to a cut-off, not between Low and High. "
              "A human checking the alert should treat a P(High) between 40% and 60% as \"borderline\"."]
    (ROOT / "reports" / "test_cases.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote reports/test_cases.md ({len(rows)} cases)")


if __name__ == "__main__":
    main()
