"""Writes three demo CSVs (original dataset format) for the Upload CSV tab, cut from the
held-out test year so every forecast is honest: the model never saw these days.

  public/demo/1_busy_week_alerts.csv     heavy late-summer weeks: High alerts, mostly correct (+ State Fair day)
  public/demo/2_holiday_weeks.csv        Christmas and New Year: quiet Low mornings, no false alarms
  public/demo/3_winter_live_forecast.csv snowy winter weeks with a missed surge (5 Feb), ending Friday 07:00
                                         so the last forecasts show "not known yet", as in live use

Usage: python make_demo_csvs.py
"""
from pathlib import Path

import pandas as pd

from features import RAW_COLUMNS

ROOT = Path(__file__).parent
RAW = ROOT / "data" / "raw" / "Metro_Interstate_Traffic_Volume.csv.gz"
OUT = ROOT / "public" / "demo"

DEMOS = {
    "1_busy_week_alerts.csv": ("2018-08-13 00:00", "2018-08-24 23:00"),
    "2_holiday_weeks.csv": ("2017-12-18 00:00", "2018-01-05 23:00"),
    "3_winter_live_forecast.csv": ("2018-01-29 00:00", "2018-02-09 07:00"),
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    raw = pd.read_csv(RAW, parse_dates=["date_time"])
    for name, (start, end) in DEMOS.items():
        part = raw[raw["date_time"].between(start, end)][RAW_COLUMNS]
        part.to_csv(OUT / name, index=False, date_format="%Y-%m-%d %H:%M:%S")
        print(f"{name}: {len(part)} rows, {part['date_time'].min()} -> {part['date_time'].max()}")


if __name__ == "__main__":
    main()
