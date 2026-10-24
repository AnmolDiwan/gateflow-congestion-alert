"""Data cleaning + feature engineering shared by train.py and app.py.

Dataset: UCI "Metro Interstate Traffic Volume" (also mirrored on Kaggle), CC BY 4.0.
Hourly westbound I-94 vehicle counts (Minneapolis-St Paul, 2012-2018) with weather and holidays.

Task framing: at the start of hour h-1 (i.e. ~1 hour before), predict the congestion class of
target hour h, for h = 08:00 and 09:00 on weekdays (the 8-10 AM arrival window). Only information available at
prediction time is used: completed hourly counts up to h-2, current weather, calendar/event flags.
"""
import numpy as np
import pandas as pd

LEVELS = ["Low", "Moderate", "High"]
# Congestion proxy from hourly volume vs. capacity. Max observed throughput is ~6,900 veh/h, so
# High >= 5,800 is roughly >= 85% of capacity (near-saturated flow); Low < 5,000 is free-flowing for the peak.
LEVEL_BINS = [-np.inf, 5000, 5800, np.inf]
TARGET_HOURS = [8, 9]
LEAD_H = 1  # prediction made 1 hour before the target hour starts

WEATHER_GROUPS = {"Clear": "Clear", "Clouds": "Clouds",
                  "Rain": "Rain", "Drizzle": "Rain", "Thunderstorm": "Rain", "Squall": "Rain",
                  "Snow": "Snow", "Mist": "Fog/Mist", "Fog": "Fog/Mist", "Haze": "Fog/Mist", "Smoke": "Fog/Mist",
                  "Fog/Mist": "Fog/Mist"}  # group names are accepted as-is (manual entry)
WEATHERS = ["Clear", "Clouds", "Rain", "Snow", "Fog/Mist"]

FACTOR_GROUPS = {
    "Time of day": ["target_hour"],
    "Day of week": ["dow"],
    "Season (month)": ["month"],
    "Recent volume & trend": ["vol_now", "vol_prev", "vol_trend"],
    "Usual volume (yesterday / last week)": ["vol_yday", "vol_lastweek"],
    "Weather": [f"w_{w}" for w in WEATHERS] + ["temp_c", "rain_mm", "snow_mm", "clouds"],
    "Holiday / event": ["holiday_event"],
}
FEATURES = [c for cols in FACTOR_GROUPS.values() for c in cols]


def level_of(volume):
    return pd.Series(pd.cut(volume, LEVEL_BINS, labels=LEVELS), index=getattr(volume, "index", None)).astype(str)


RAW_COLUMNS = ["date_time", "traffic_volume", "weather_main", "temp", "rain_1h", "snow_1h", "clouds_all", "holiday"]


def load(path):
    """Read a CSV in the original dataset format and clean it."""
    return clean(pd.read_csv(path, parse_dates=["date_time"]))


def clean(raw, extend_to=None):
    """Clean raw records into a regular hourly grid (NaN where the sensor had no data).
    `extend_to` adds empty future hours (e.g. the target hour of a forecast) to the grid."""
    raw = raw.copy()
    raw["date_time"] = pd.to_datetime(raw["date_time"])
    raw["weather_group"] = raw["weather_main"].map(WEATHER_GROUPS).fillna("Clouds")
    # Several rows per hour exist (one per weather condition): keep one volume, worst-case weather amounts
    sev = {w: i for i, w in enumerate(["Clear", "Clouds", "Fog/Mist", "Rain", "Snow"])}
    raw["sev"] = raw["weather_group"].map(sev)
    raw = raw.sort_values(["date_time", "sev"], ascending=[True, False])
    hourly = raw.groupby("date_time").agg(
        traffic_volume=("traffic_volume", "first"), weather=("weather_group", "first"),
        temp_k=("temp", "mean"), rain_1h=("rain_1h", "max"), snow_1h=("snow_1h", "max"),
        clouds_all=("clouds_all", "mean"), holiday=("holiday", "first"))
    # The holiday label only appears on the midnight row: spread it to the whole day
    day = hourly.index.normalize()
    hol_days = set(day[hourly["holiday"].notna() & (hourly["holiday"] != "None")])
    hourly["holiday_event"] = pd.Series(day.isin(hol_days).astype(int), index=hourly.index)
    hourly["holiday"] = pd.Series(day, index=hourly.index).map(
        hourly["holiday"].dropna().pipe(lambda s: s[s != "None"]).rename(index=lambda t: t.normalize()).to_dict())
    hourly.loc[hourly["temp_k"] < 200, "temp_k"] = np.nan  # a few sensor errors at 0 K
    hourly["rain_1h"] = hourly["rain_1h"].clip(upper=60)  # one 9,831 mm outlier
    end = max(hourly.index.max(), pd.Timestamp(extend_to)) if extend_to is not None else hourly.index.max()
    grid = pd.date_range(hourly.index.min(), end, freq="h")
    return hourly.reindex(grid).rename_axis("timestamp").reset_index()


def build_features(df, lead_h=LEAD_H, require_target=True):
    """One row per weekday target hour (08:00, 09:00) with features known lead_h hours earlier.
    require_target=False keeps rows whose outcome is not known yet (forecasting new data)."""
    d = df.set_index("timestamp")
    v = d["traffic_volume"]
    t0 = d.index - pd.Timedelta(hours=lead_h)  # prediction time
    obs = d.shift(lead_h + 1)  # last *completed* hour at prediction time is h-2 (hour h-1 is in progress)
    out = pd.DataFrame(index=d.index)
    out["target_hour"] = d.index.hour
    out["dow"] = d.index.dayofweek
    out["month"] = d.index.month
    out["vol_now"] = v.shift(lead_h + 1)
    out["vol_prev"] = v.shift(lead_h + 2)
    out["vol_trend"] = out["vol_now"] - out["vol_prev"]
    out["vol_yday"] = v.shift(24)  # same hour yesterday (known: it is in the past)
    out["vol_lastweek"] = v.shift(168)
    for w in WEATHERS:
        out[f"w_{w}"] = (obs["weather"] == w).astype(int)
    out["temp_c"] = obs["temp_k"] - 273.15
    out["rain_mm"] = obs["rain_1h"]
    out["snow_mm"] = obs["snow_1h"]
    out["clouds"] = obs["clouds_all"]
    out["holiday_event"] = d["holiday_event"].fillna(0).astype(int)  # holidays/events are known in advance
    # bookkeeping
    out["prediction_time"] = t0
    out["weather_now"] = obs["weather"]
    out["holiday_name"] = d["holiday"]
    out["target_volume"] = v
    # weekdays only: students commute to class Mon-Fri (weekend mornings are always Low here)
    out = out[out.index.hour.isin(TARGET_HOURS) & (out.index.dayofweek < 5)]
    out = out.dropna(subset=(["target_volume"] if require_target else []) + ["vol_now", "weather_now"])
    out["target_level"] = level_of(out["target_volume"]).where(out["target_volume"].notna())
    out["y"] = out["target_level"].map({l: i for i, l in enumerate(LEVELS)})
    if require_target:
        out["y"] = out["y"].astype(int)
    out = out.rename_axis("target_time").reset_index()
    out["date"] = out["target_time"].dt.date
    return out


def reference_row(X_train):
    """'Typical calm hour' used as the counterfactual when attributing a prediction to factors."""
    ref = X_train.median()
    for w in WEATHERS:
        ref[f"w_{w}"] = 1 if w == "Clear" else 0
    ref[["rain_mm", "snow_mm"]] = 0
    ref["holiday_event"] = 0
    return ref


def factor_contributions(model, x_row, ref):
    """Change in P(High) when each factor group is reset to its reference value (one at a time).
    Positive = this factor pushes congestion risk up."""
    x = x_row[FEATURES].astype(float).to_frame().T
    p_high = model.predict_proba(x)[0, 2]
    contrib = {}
    for name, cols in FACTOR_GROUPS.items():
        x_ref = x.copy()
        x_ref[cols] = ref[cols].values
        if name == "Recent volume & trend":  # keep the trend consistent with the reset volumes
            x_ref["vol_trend"] = x_ref["vol_now"] - x_ref["vol_prev"]
        contrib[name] = p_high - model.predict_proba(x_ref)[0, 2]
    return p_high, pd.Series(contrib).sort_values(key=np.abs, ascending=False)
