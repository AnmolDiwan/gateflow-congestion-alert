"""Draws docs/architecture.png: data input -> preprocessing -> features -> model -> output,
plus the offline training/evaluation loop and the deployment path.
Usage: python docs/make_architecture.py
"""
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

OUT = Path(__file__).parent / "architecture.png"
INK, QUIET, EDGE = "#1f1f1e", "#52514e", "#9a998f"
STAGE = {"input": "#e8f1fb", "process": "#f3f2ee", "model": "#dbe9fa", "output": "#fde9e9", "offline": "#f7f7f4"}

fig, ax = plt.subplots(figsize=(16, 8.4), dpi=150)
ax.set_xlim(0, 162)
ax.set_ylim(0, 84)
ax.axis("off")


def box(x, y, w, h, title, lines, fill, bold_edge=False):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=1.6", fc=fill,
                                ec="#2a78d6" if bold_edge else EDGE, lw=2 if bold_edge else 1.1))
    ax.text(x + w / 2, y + h - 3.6, title, ha="center", va="top", fontsize=12.5, weight="bold", color=INK)
    for i, line in enumerate(lines):
        ax.text(x + 2.2, y + h - 9.0 - i * 3.4, line, ha="left", va="top", fontsize=9.4, color=QUIET)


def arrow(x1, y1, x2, y2, label=None, dy=1.6):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle="-|>", mutation_scale=14, color=EDGE, lw=1.4))
    if label:
        ax.text((x1 + x2) / 2, (y1 + y2) / 2 + dy, label, ha="center", fontsize=9, color=QUIET)


ax.text(2, 81, "GateFlow architecture: from hourly traffic records to a congestion alert one hour ahead",
        fontsize=15, weight="bold", color=INK, va="top")
ax.text(2, 77, "Top row = what happens for every forecast. Bottom row = how the model was trained, tested and put online.",
        fontsize=10.5, color=QUIET, va="top")

ty, th, tw = 33, 38, 29
xs = [2, 34, 66, 98, 130]
box(xs[0], ty, tw, th, "1. Data input", ["Hourly records:", "- timestamp", "- vehicle count", "- weather (+ temp, rain, snow)",
                                          "- holiday / event flag", "Sources: UCI/Kaggle CSV,", "manual entry, CSV upload"], STAGE["input"])
box(xs[1], ty, tw, th, "2. Preprocessing", ["- one row per hour (dedupe)", "- holiday flag to whole day", "- fix sensor errors / outliers",
                                             "- regular hourly grid (gaps", "  stay empty, never invented)", "- weekdays, 08:00 & 09:00"], STAGE["process"])
box(xs[2], ty, tw, th, "3. Features (clues)", ["Known 1 h before the hour:", "- last finished hour + trend", "- same hour yesterday",
                                                "- same hour last week", "- weather now", "- holiday / event",
                                                "- hour, weekday, month"], STAGE["process"])
box(xs[3], ty, tw, th, "4. Model", ["HistGradientBoosting", "200 shallow trees (depth 3)", "trains in ~11 s on a laptop",
                                     "", "Output: probabilities", "P(Low), P(Moderate), P(High)"], STAGE["model"], bold_edge=True)
box(xs[4], ty, tw - 1, th, "5. Output", ["- Low / Moderate / High", "- ALERT if P(High) >= 50%", "  + suggested actions",
                                          "- 'why' factor chart", "- dashboard: road view,", "  timeline, tables"], STAGE["output"])
for a, b in zip(xs[:-1], xs[1:]):
    arrow(a + tw, ty + th / 2, b, ty + th / 2)

by, bh = 1, 28
box(2, by, 50, bh, "Training & evaluation (train.py)", [
    "Chronological split by day, never shuffled:",
    "- train: Oct 2012 - Oct 2017 (986 weekdays)",
    "- validation: 4 expanding-window CV folds inside train",
    "  (used only to choose the model)",
    "- test: Oct 2017 - Sep 2018 (247 weekdays), used once"], STAGE["offline"])
box(56, by, 50, bh, "Baselines & metrics", [
    "- majority class   - historical hour x weekday average",
    "- same hour last week   - logistic regression",
    "Metrics: macro-F1, accuracy, High precision / recall,",
    "false alerts and missed High per week, confusion matrix,",
    "permutation importance, 10 representative test cases"], STAGE["offline"])
box(110, by, 50, bh, "Deployment (export_web.py)", [
    "Trees exported to model.json (checked identical",
    "to scikit-learn on 2,263 rows)",
    "GitHub repo -> Vercel static site",
    "model.js runs the forecast in the browser:",
    "no server, uploaded files never leave the device"], STAGE["offline"])
arrow(17, by + bh, 17, ty)
ax.text(18.5, (by + bh + ty) / 2 - 0.8, "trains the model", fontsize=9, color=QUIET)
arrow(52, by + bh / 2, 56, by + bh / 2)
arrow(106, by + bh / 2, 110, by + bh / 2)
arrow(135, by + bh, 135, ty)
ax.text(136.5, (by + bh + ty) / 2 - 0.8, "serves the model to the browser", fontsize=9, color=QUIET)

fig.savefig(OUT, bbox_inches="tight", facecolor="white")
print(f"wrote {OUT}")
