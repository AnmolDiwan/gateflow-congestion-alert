"""Train the congestion classifier, compare with baselines, evaluate on held-out days.

Split is chronological by day (no shuffling): first 80% of days = train, last 20% = test.
Model selection uses expanding-window cross-validation over the *training* days only
(4 folds covering the second half of the training period), so the test set is touched once.

Outputs: models/congestion_model.joblib, reports/metrics.json, reports/evaluation.md,
         reports/*.png, reports/test_predictions.csv
Usage:   python train.py [--lead 1]
"""
import argparse
import json
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score,
                             precision_recall_fscore_support)
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from features import (FACTOR_GROUPS, FEATURES, LEVEL_BINS, LEVELS, build_features, level_of, load,
                      reference_row)

ROOT = Path(__file__).parent
RAW = ROOT / "data" / "raw" / "Metro_Interstate_Traffic_Volume.csv.gz"
SEED = 42
ALERT_THRESHOLD = 0.5  # alert when P(High) >= this
N_CV_FOLDS = 4
COLORS = {"ink": "#2b2b2b"}


# ---------- baselines ----------
class MajorityBaseline:
    name = "Majority class"

    def fit(self, train):
        self.cls = int(np.bincount(train["y"]).argmax())
        return self

    def predict(self, df):
        return np.full(len(df), self.cls)


class HistoricalProfileBaseline:
    """Average training volume for the same target hour and weekday, mapped to a class."""
    name = "Historical average (hour x weekday)"

    def fit(self, train):
        self.profile = train.groupby(["target_hour", "dow"])["target_volume"].mean()
        return self

    def volume(self, df):
        return df.set_index(["target_hour", "dow"]).index.map(self.profile).to_numpy(dtype=float)

    def predict(self, df):
        return level_of(self.volume(df)).map(LEVELS.index).to_numpy()


class LastWeekBaseline:
    """Persistence: same hour last week (falls back to the historical average if missing)."""
    name = "Same hour last week"

    def fit(self, train):
        self.fallback = HistoricalProfileBaseline().fit(train)
        return self

    def predict(self, df):
        vol = df["vol_lastweek"].to_numpy(dtype=float)
        vol = np.where(np.isnan(vol), self.fallback.volume(df), vol)
        return level_of(vol).map(LEVELS.index).to_numpy()


def make_models():
    return {
        "Logistic regression": make_pipeline(
            SimpleImputer(strategy="median"), StandardScaler(),
            LogisticRegression(max_iter=3000, class_weight="balanced")),
        "Gradient boosting (HistGB)": HistGradientBoostingClassifier(  # handles missing lags natively
            max_iter=200, learning_rate=0.05, max_depth=3, min_samples_leaf=30, l2_regularization=1.0,
            class_weight="balanced", early_stopping=False, random_state=SEED),
    }


# ---------- evaluation ----------
def evaluate(y_true, y_pred, p_high, n_days):
    p, r, f, _ = precision_recall_fscore_support(y_true, y_pred, labels=[0, 1, 2], zero_division=0)
    alert = p_high >= ALERT_THRESHOLD
    m = {"accuracy": accuracy_score(y_true, y_pred),
         "macro_f1": f1_score(y_true, y_pred, average="macro"),
         "weighted_f1": f1_score(y_true, y_pred, average="weighted"),
         "high_precision": p[2], "high_recall": r[2], "high_f1": f[2],
         "false_alerts_per_week": (alert & (y_true != 2)).sum() / n_days * 5,
         "missed_high_per_week": (~alert & (y_true == 2)).sum() / n_days * 5}
    return {k: round(float(v), 4) for k, v in m.items()}


def split_by_day(feat, test_frac=0.2):
    days = np.array(sorted(feat["date"].unique()))
    cut = days[int(len(days) * (1 - test_frac))]
    return feat[feat["date"] < cut], feat[feat["date"] >= cut]


def group_permutation_importance(model, X, y, n_repeats=10):
    """Drop in macro-F1 when all columns of a factor group are shuffled together."""
    rng = np.random.default_rng(SEED)
    base = f1_score(y, model.predict(X), average="macro")
    imp = {}
    for name, cols in FACTOR_GROUPS.items():
        drops = []
        for _ in range(n_repeats):
            Xp = X.copy()
            Xp[cols] = X[cols].values[rng.permutation(len(X))]
            drops.append(base - f1_score(y, model.predict(Xp), average="macro"))
        imp[name] = float(np.mean(drops))
    return pd.Series(imp).sort_values(ascending=False)


def run(lead, df, verbose=True):
    feat = build_features(df, lead)
    train, test = split_by_day(feat)
    Xtr, ytr, Xte, yte = train[FEATURES], train["y"].values, test[FEATURES], test["y"].values
    n_days = test["date"].nunique()

    # model selection: expanding-window CV over training days only (test days untouched)
    days = np.array(sorted(train["date"].unique()))
    folds = np.array_split(days[len(days) // 2:], N_CV_FOLDS)
    val_scores = {}
    for name in make_models():
        scores = []
        for fold in folds:
            past, val = train[train["date"] < fold[0]], train[train["date"].isin(fold)]
            mdl = make_models()[name].fit(past[FEATURES], past["y"].values)
            scores.append(f1_score(val["y"], mdl.predict(val[FEATURES]), average="macro"))
        val_scores[name] = float(np.mean(scores))
    best_name = max(val_scores, key=val_scores.get)

    results, preds, baselines = {}, {}, {}
    for b in (MajorityBaseline(), HistoricalProfileBaseline(), LastWeekBaseline()):
        baselines[b.name] = b.fit(train)
        preds[b.name] = b.predict(test)
        results[b.name] = evaluate(yte, preds[b.name], (preds[b.name] == 2).astype(float), n_days)
    models = {}
    for name, mdl in make_models().items():
        models[name] = mdl.fit(Xtr, ytr)
        proba = mdl.predict_proba(Xte)
        preds[name] = proba.argmax(1)
        results[name] = evaluate(yte, preds[name], proba[:, 2], n_days)

    if verbose:
        print(f"\n=== lead {lead} h | train {len(train)} rows / {train['date'].nunique()} days "
              f"({train['date'].min()}..{train['date'].max()}), test {len(test)} rows / {n_days} days "
              f"({test['date'].min()}..{test['date'].max()})")
        print("CV macro-F1:", {k: round(v, 3) for k, v in val_scores.items()}, "-> selected:", best_name)
        print(pd.DataFrame(results).T[["accuracy", "macro_f1", "high_recall", "high_precision"]].to_string())
    return dict(feat=feat, train=train, test=test, models=models, best_name=best_name,
                val_scores=val_scores, results=results, preds=preds, baselines=baselines)


# ---------- plots ----------
def style(ax):
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.tick_params(colors=COLORS["ink"])


def plot_confusions(yte, preds, names, path):
    fig, axes = plt.subplots(1, len(names), figsize=(4.2 * len(names), 3.8))
    for ax, n in zip(axes, names):
        cm = confusion_matrix(yte, preds[n], labels=[0, 1, 2])
        cmn = cm / cm.sum(1, keepdims=True)
        ax.imshow(cmn, cmap="Blues", vmin=0, vmax=1)
        for i in range(3):
            for j in range(3):
                ax.text(j, i, f"{cm[i, j]}\n{cmn[i, j]:.0%}", ha="center", va="center",
                        color="white" if cmn[i, j] > 0.55 else COLORS["ink"], fontsize=9)
        ax.set_xticks(range(3), LEVELS)
        ax.set_yticks(range(3), LEVELS)
        ax.set_xlabel("Predicted")
        ax.set_ylabel("Actual")
        ax.set_title(n, fontsize=10)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def plot_importance(imp, path):
    fig, ax = plt.subplots(figsize=(7.5, 3.8))
    imp = imp.sort_values()
    ax.barh(imp.index, imp.values, color="#3b6fb6")
    for y, v in enumerate(imp.values):
        ax.text(max(v, 0), y, f"  {v:.3f}", va="center", fontsize=9, color=COLORS["ink"])
    ax.set_xlabel("Drop in macro-F1 when factor is shuffled (test set)")
    ax.set_title("What drives the prediction", loc="left", fontsize=12)
    style(ax)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def plot_comparison(results, path):
    names = list(results)
    metrics = ["accuracy", "macro_f1", "high_recall", "high_precision"]
    labels = ["Accuracy", "Macro-F1", "High recall", "High precision"]
    x = np.arange(len(metrics))
    w = 0.8 / len(names)
    palette = ["#d0d0d0", "#a8a8a8", "#7f7f7f", "#7aa6d8", "#2f5d9e"]
    fig, ax = plt.subplots(figsize=(8.5, 3.9))
    for i, n in enumerate(names):
        ax.bar(x + i * w - 0.4 + w / 2, [results[n][m] for m in metrics], w, label=n,
               color=palette[i % len(palette)])
    ax.set_xticks(x, labels)
    ax.set_ylim(0, 1.15)
    ax.legend(frameon=False, fontsize=8, ncol=3, loc="upper left")
    ax.set_title("Held-out test days: model vs baselines", loc="left", fontsize=12)
    style(ax)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def write_report(main, lead, lead_table, imp, path):
    r, best, test, train = main["results"], main["best_name"], main["test"], main["train"]
    rows = "\n".join(
        f"| {n} | {m['accuracy']:.3f} | {m['macro_f1']:.3f} | {m['high_precision']:.3f} | "
        f"{m['high_recall']:.3f} | {m['false_alerts_per_week']:.2f} | {m['missed_high_per_week']:.2f} |"
        for n, m in r.items())
    lrows = "\n".join(f"| {h} h before | {v['baseline']:.3f} | {v['model']:.3f} | {v['model_high_recall']:.3f} |"
                      for h, v in lead_table.items())
    irows = "\n".join(f"| {k} | {v:.3f} |" for k, v in imp.items())
    mix = test["target_level"].value_counts(normalize=True).reindex(LEVELS)
    text = f"""# Evaluation: Smart Traffic Congestion Alert

**Data:** real hourly vehicle counts from the UCI *Metro Interstate Traffic Volume* dataset (also mirrored on Kaggle,
CC BY 4.0): westbound I-94 (Minneapolis-St Paul), 2012-2018, with weather (OpenWeatherMap) and holiday/event flags.
The road is a **stand-in** for the campus approach road. **No live traffic feed is connected.**

**Task:** {lead} hour before each weekday arrival hour (08:00-09:00 and 09:00-10:00), predict its congestion class.
Classes are a volume-to-capacity proxy: Low < {LEVEL_BINS[1]:.0f} veh/h, Moderate {LEVEL_BINS[1]:.0f}-{LEVEL_BINS[2]:.0f},
High >= {LEVEL_BINS[2]:.0f} (about 85% of the maximum observed throughput of ~6,900 veh/h).
Features use only information available at prediction time (completed hours, current weather, calendar).

**Split:** chronological by day. Train = {train['date'].nunique()} weekdays ({len(train)} rows, {train['date'].min()} to {train['date'].max()}),
held-out test = {test['date'].nunique()} weekdays ({len(test)} rows, {test['date'].min()} to {test['date'].max()}).
Test class mix: Low {mix['Low']:.0%}, Moderate {mix['Moderate']:.0%}, High {mix['High']:.0%}.
Model chosen by {N_CV_FOLDS}-fold expanding-window CV over training days only (mean CV macro-F1:
{', '.join(f'{k} {v:.3f}' for k, v in main['val_scores'].items())}) -> **{best}**.

## Results on the held-out test set

| Model | Accuracy | Macro-F1 | High precision | High recall | False alerts / week | Missed High / week |
|---|---|---|---|---|---|---|
{rows}

Alert rule: raise a HIGH CONGESTION alert when P(High) >= {ALERT_THRESHOLD}. A week is 5 weekdays x 2 target hours.

![comparison](comparison.png)

![confusion](confusion_matrices.png)

## Factors that influence the prediction

Group permutation importance on the test set (all columns of a factor shuffled together, drop in macro-F1):

| Factor | Importance |
|---|---|
{irows}

![importance](factor_importance.png)

The dashboard also shows **per-prediction** factor contributions: the change in P(High) when one factor
is reset to a "calm" reference value (median volumes, Clear weather, no rain/snow, no holiday).

## How early can we alert? (macro-F1 on held-out days)

| Prediction made | Historical-average baseline | {best} | {best} High recall |
|---|---|---|---|
{lrows}

## Limitations

- The congestion class is a **volume-based proxy**: the dataset has no speed or travel-time data. On a real campus
  road, label with speed or queue length (for example from a camera or GPS probes) and retrain.
- It is one highway segment, not the college's own road. The pipeline is reusable: swap in campus counts with the same columns.
- There is a sensor gap from Aug 2014 to Jun 2015. Rows whose lag features are missing are kept, and HistGB handles the NaNs natively.
- The weather input is the latest observation at prediction time, not a forecast. A weather-forecast API would help.
- The holiday flag covers US public holidays and the State Fair. College events (fests, exams) would need a campus calendar.
"""
    path.write_text(text, encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lead", type=int, default=1, help="hours before the target hour the prediction is made")
    args = ap.parse_args()
    (ROOT / "models").mkdir(exist_ok=True)
    reports = ROOT / "reports"
    reports.mkdir(exist_ok=True)

    df = load(RAW)
    main_run = run(args.lead, df)
    best_name = main_run["best_name"]
    best = main_run["models"][best_name]
    test, yte = main_run["test"], main_run["test"]["y"].values
    imp = group_permutation_importance(best, test[FEATURES], yte)

    lead_table = {}
    for h in sorted({1, 2, args.lead}):
        rr = main_run if h == args.lead else run(h, df, verbose=False)
        lead_table[h] = {"baseline": rr["results"][HistoricalProfileBaseline.name]["macro_f1"],
                         "model": rr["results"][best_name]["macro_f1"],
                         "model_high_recall": rr["results"][best_name]["high_recall"]}

    plot_confusions(yte, main_run["preds"], [HistoricalProfileBaseline.name, best_name],
                    reports / "confusion_matrices.png")
    plot_importance(imp, reports / "factor_importance.png")
    plot_comparison(main_run["results"], reports / "comparison.png")
    write_report(main_run, args.lead, lead_table, imp, reports / "evaluation.md")

    proba = best.predict_proba(test[FEATURES])
    out = test[["prediction_time", "target_time", "vol_now", "weather_now", "holiday_event",
                "target_volume", "target_level"]].copy()
    out[["p_low", "p_moderate", "p_high"]] = proba.round(4)
    out["predicted_level"] = [LEVELS[i] for i in proba.argmax(1)]
    out["alert"] = proba[:, 2] >= ALERT_THRESHOLD
    out.to_csv(reports / "test_predictions.csv", index=False)

    metrics = {"lead_hours": args.lead, "selected_model": best_name, "cv_macro_f1": main_run["val_scores"],
               "test": main_run["results"], "factor_importance": imp.to_dict(),
               "lead_time_sensitivity": lead_table, "level_bins_veh_per_h": LEVEL_BINS[1:3],
               "alert_threshold": ALERT_THRESHOLD}
    (reports / "metrics.json").write_text(json.dumps(metrics, indent=2))

    joblib.dump({"model": best, "model_name": best_name, "features": FEATURES, "lead_h": args.lead,
                 "reference": reference_row(main_run["train"][FEATURES]), "alert_threshold": ALERT_THRESHOLD,
                 "test_start": str(test["date"].min()),
                 "profile": main_run["baselines"][HistoricalProfileBaseline.name].profile},
                ROOT / "models" / "congestion_model.joblib")
    print("\nFactor importance:\n", imp.round(3).to_string())
    print(f"\nSaved model + reports to {ROOT}")


if __name__ == "__main__":
    main()
