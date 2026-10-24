# Representative test cases (held-out year, Oct 2017 – Sep 2018)

The model never saw these days while training. Each row is one forecast made 1 hour before the arrival hour.

| Arrival hour | Type | Situation | Weather | Count 2 h before | P(High) | Predicted | Actual (veh/h) |
|---|---|---|---|---|---|---|---|
| 2018-09-12 08:00 | ✅ success | Rainy weekday peak: High alert raised and correct | Rain | 5,908 | 99% | High | High (6,297) |
| 2017-11-21 08:00 | ✅ success | Snow: High still caught | Snow | 5,793 | 58% | High | High (5,932) |
| 2018-08-23 08:00 | ✅ success | Event day (State Fair) with heavy traffic: High alert correct | Clear + event | 5,860 | 93% | High | High (6,162) |
| 2017-12-25 08:00 | ✅ success | Christmas holiday: correctly Low, no alert | Snow + event | 798 | 0% | Low | Low (1,260) |
| 2017-10-27 08:00 | ✅ success | Snowy but moderate morning: correctly Moderate | Snow | 5,356 | 10% | Moderate | Moderate (5,159) |
| 2018-02-05 08:00 | ❌ failure | Missed High: quiet 6 AM, then a sudden surge | Clear | 4,846 | 1% | Low | High (6,048) |
| 2018-07-31 08:00 | ❌ failure | Missed High in fog, called Low | Fog/Mist | 4,240 | 2% | Low | High (5,960) |
| 2018-04-19 09:00 | ❌ failure | Missed High at 9 AM: barely over the cut-off (5,842) | Clear | 6,461 | 0% | Moderate | High (5,842) |
| 2018-08-28 08:00 | ❌ failure | False alarm: 98% High, actual 5,692, just under the cut-off | Rain | 5,611 | 98% | High | Moderate (5,692) |
| 2017-11-09 08:00 | ❌ failure | False alarm in snow: predicted High, actual Moderate | Snow | 5,970 | 84% | High | Moderate (5,542) |

## Error analysis

- **False alarms:** 47 on 247 test days. 79% of them were hours whose real volume was within 300 veh/h of the 5,800 cut-off: busy hours that just missed High.
- **Missed High hours:** 20. In 100% of them the real volume was less than 300 veh/h above the cut-off, so they were borderline. The worst misses had a quiet early morning followed by a sudden surge that the earlier hours didn't hint at (see 2018-02-05).
- **Holidays:** 100% of holiday or event forecasts were correct (20 forecasts).
- **Accuracy by weather:** Fog/Mist 67% (n=89), Rain 68% (n=79), Clear 73% (n=181), Clouds 74% (n=92), Snow 91% (n=53).
- **Accuracy by arrival hour:** 08:00 71%, 09:00 76%.

Most errors happen between neighbouring levels close to a cut-off, not between Low and High. A human checking the alert should treat a P(High) between 40% and 60% as "borderline".
