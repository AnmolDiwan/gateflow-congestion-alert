"""Export the trained model + held-out data to JSON for the static web dashboard (public/).

The HistGradientBoosting trees are written out node by node, so the browser runs the *same*
model with no Python server (public/model.js re-implements predict_proba). A parity check
against sklearn runs at the end and fails loudly if the two disagree.

Usage: python export_web.py   (after python train.py)
"""
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from features import FACTOR_GROUPS, FEATURES, LEVEL_BINS, LEVELS, RAW_COLUMNS, WEATHERS, build_features, load

ROOT = Path(__file__).parent
OUT = ROOT / "public"
RAW = ROOT / "data" / "raw" / "Metro_Interstate_Traffic_Volume.csv.gz"


def export_trees(model):
    """[[tree for each class] for each iteration]; tree = parallel node arrays."""
    iterations = []
    for per_class in model._predictors:
        trees = []
        for t in per_class:
            n = t.nodes
            trees.append({"f": n["feature_idx"].tolist(), "t": [float(v) for v in n["num_threshold"]],
                          "m": n["missing_go_to_left"].astype(int).tolist(), "l": n["left"].tolist(),
                          "r": n["right"].tolist(), "leaf": n["is_leaf"].astype(int).tolist(),
                          "v": [round(float(v), 7) for v in n["value"]]})
        iterations.append(trees)
    return {"baseline": model._baseline_prediction.ravel().tolist(), "trees": iterations}


def predict_proba_json(spec, X):
    """Pure-numpy mirror of public/model.js, used for the parity check."""
    raw = np.tile(np.array(spec["baseline"]), (len(X), 1))
    for per_class in spec["trees"]:
        for k, t in enumerate(per_class):
            for i, x in enumerate(X):
                node = 0
                while not t["leaf"][node]:
                    v = x[t["f"][node]]
                    go_left = t["m"][node] if np.isnan(v) else v <= t["t"][node]
                    node = t["l"][node] if go_left else t["r"][node]
                raw[i, k] += t["v"][node]
    e = np.exp(raw - raw.max(1, keepdims=True))
    return e / e.sum(1, keepdims=True)


def clean_json(v):
    if isinstance(v, (float, np.floating)) and np.isnan(v):
        return None
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return float(v)  # unrounded: values can sit exactly on a split threshold
    return v


def main():
    art = joblib.load(ROOT / "models" / "congestion_model.joblib")
    model, lead = art["model"], art["lead_h"]
    metrics = json.loads((ROOT / "reports" / "metrics.json").read_text())
    OUT.mkdir(exist_ok=True)

    spec = export_trees(model)
    feat = build_features(load(RAW), lead)
    X = feat[FEATURES].astype(float).to_numpy()
    sk = model.predict_proba(feat[FEATURES].astype(float))
    mine = predict_proba_json(spec, X)
    err = np.abs(sk - mine).max()
    print(f"parity check on {len(X)} rows: max |sklearn - export| = {err:.2e}")
    assert err < 1e-5, "exported model does not match sklearn"

    model_json = {
        **spec, "model_name": art["model_name"], "features": FEATURES, "factor_groups": FACTOR_GROUPS,
        "levels": LEVELS, "level_bins": LEVEL_BINS[1:3], "weathers": WEATHERS, "lead_h": lead,
        "alert_threshold": art["alert_threshold"], "reference": {k: clean_json(v) for k, v in art["reference"].items()},
        "metrics": metrics,
    }
    (OUT / "model.json").write_text(json.dumps(model_json, separators=(",", ":")))

    test = feat[feat["date"] >= pd.Timestamp(art["test_start"]).date()]
    rows = [{"time": r.target_time.strftime("%Y-%m-%dT%H:00"), "x": [clean_json(r[c]) for c in FEATURES],
             "actual": r.target_level, "volume": int(r.target_volume), "weather": r.weather_now,
             "holiday": r.holiday_name if isinstance(r.holiday_name, str) else None}
            for _, r in test.iterrows()]
    (OUT / "test_days.json").write_text(json.dumps(rows, separators=(",", ":")))
    # parity rows for the JS test (features + sklearn probabilities)
    (ROOT / "tests").mkdir(exist_ok=True)
    (ROOT / "tests" / "parity_rows.json").write_text(json.dumps(
        {"x": [[clean_json(v) for v in row] for row in X[:400]], "proba": sk[:400].round(7).tolist()}))

    raw = pd.read_csv(RAW, parse_dates=["date_time"])
    sample = raw[raw["date_time"].between("2018-09-10", "2018-09-14 09:00")].drop_duplicates("date_time")
    sample[RAW_COLUMNS].to_csv(OUT / "traffic_template.csv", index=False, date_format="%Y-%m-%d %H:%M:%S")
    print(f"wrote {OUT / 'model.json'} ({(OUT / 'model.json').stat().st_size / 1024:.0f} KB), "
          f"{len(rows)} test forecasts, template CSV")


if __name__ == "__main__":
    main()
