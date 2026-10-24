# GateFlow: Our Congestion Alert, Explained Simply

*A plain-language guide for presenting the project. Live version: https://claude.ai/artifact/NRQepkcSFE9Pzs3nhgk5aL*

## 1. The problem, in one minute

Our project, GateFlow, warns the college **one hour before** the road to the gate gets jammed, so students can leave earlier or use another gate.

- **The situation:** most students arrive between 8:00 and 10:00 AM. At some times the road to the main gate gets very crowded and people are late.
- **What causes it:** how many vehicles are coming, the weather (rain and snow slow everyone down) and special days such as holidays and events.
- **What we built:** a small AI program that looks at recent traffic, the weather and the date, and predicts whether the next hour will be **Low**, **Moderate** or **High** congestion.
- **What it does with that:** when High is likely, it shows a big red alert with suggested actions, such as "leave 20 minutes earlier" or "open Gate 3".

It is a **prototype**. It learns from real traffic data from a highway, not from our own college road, and it is not connected to live traffic. We say this openly everywhere in the project.

## 2. The data we used

We used a **real, public dataset** called *Metro Interstate Traffic Volume*. It counts every car on a busy US highway (I-94, in Minnesota) once an hour, from October 2012 to September 2018. It is about 48,000 rows. It is free to use (licence CC BY 4.0) and is published by the UCI Machine Learning Repository and copied on Kaggle.

| Column | What it means in simple words | Which task requirement it covers |
| --- | --- | --- |
| date_time | The date and the hour, for example 12 Sep 2018, 8:00 AM | timestamp |
| traffic_volume | How many vehicles passed in that hour | vehicle count |
| weather_main | The weather: Clear, Clouds, Rain, Snow, Fog and so on | weather condition |
| temp, rain_1h, snow_1h, clouds_all | Temperature, how much rain and snow fell, and how cloudy it was | weather condition (extra detail) |
| holiday | The name of the holiday or event, such as Christmas or the State Fair | event indicator |

**Why a highway and not our own road?** We don't have traffic counts for our college road, and the task said to use a provided or simulated dataset. Real data is more convincing than made-up data, so we used a real road as a stand-in. The program works for any road: give it the same four kinds of columns and retrain it.

**Cleaning we had to do:**

- Some hours appeared twice, once for each weather type, so we kept one row per hour.
- The holiday name was written only on the midnight row, so we copied it to the whole day.
- We fixed a few broken values, such as a temperature of 0 Kelvin and one impossible rain reading of 9,831 mm.
- About 11 months in 2014–15 are missing because the sensor was off. We left the gap empty rather than inventing numbers.
- We kept **weekdays only**, because students come to class Monday to Friday. Weekend mornings were always quiet, and keeping them would have made our scores look better than they really are.

## 3. What Low, Moderate and High mean

| Level | Vehicles per hour | What it feels like |
| --- | --- | --- |
| Low | under 5,000 | Traffic moves freely |
| Moderate | 5,000 to 5,800 | Busy, but still moving |
| High | 5,800 or more | Close to jammed |

**How we picked 5,800:** the busiest hour ever recorded on this road had about 6,900 vehicles, which is roughly the most the road can carry. 5,800 is about 85% of that, and traffic engineers know roads start to jam when they are that full.

In the 8–10 AM weekday hours, about 29% of hours are Low, 48% Moderate and 23% High.

**An honest note:** the dataset has no car speeds, only counts. So our levels are based on volume, which works as a stand-in for congestion. On a real campus road we would use speeds or queue length from a camera.

## 4. How the AI learns

The AI learns from 1,769 past rush hours (8 AM and 9 AM on 986 weekdays, 2012–2017). For each one it sees the clues it would have had and the level that actually happened. It finds patterns that link the clues to the answer.

| Clue ("feature") | Example | Why it helps |
| --- | --- | --- |
| Traffic in the last finished hour | 5,908 cars between 6 and 7 AM | A busy early morning usually means a busy peak |
| Traffic the hour before, and the change | went up by 2,823 | A fast rise warns that the road is filling up |
| Same hour yesterday | 5,644 cars | Days are often similar |
| Same hour last week | 5,732 cars | Mondays look like Mondays |
| Weather now | Rain, 19 °C, 0.25 mm of rain | Rain and snow slow traffic or change how people travel |
| Holiday or event that day | Christmas, State Fair | Holidays are quiet, events can be busy |
| Hour, day of the week, month | 8 AM, Wednesday, September | Rush hour, Fridays and seasons all differ |

**The model:** we used **Gradient Boosting**, through scikit-learn's `HistGradientBoostingClassifier`. Picture a team of 200 small "yes/no" question trees. The first tree asks simple questions, such as "Was the 6 AM traffic above 5,500?" and "Is it snowing?", and makes a rough guess. Each next tree focuses on fixing the mistakes of the trees before it. Together the 200 small trees make a good forecast, and each tree is only 3 questions deep.

The model does not just say "High". It gives a **chance for each level**, for example Low 1%, Moderate 1%, High 98%.

**Why a lightweight model?** The hackathon gave us 6 hours, so we needed something that trains fast. The whole training takes about **11 seconds on a normal laptop**, with no GPU and no deep learning. We also tried Logistic Regression, a simpler model, and Gradient Boosting was better.

## 5. How we made sure it is honest

1. **It only uses what you would really know at the time.** The forecast for 8:00–9:00 is made at 7:00, so the model never sees the number it is trying to predict.
2. **The test uses a year the model never saw.** It learned from Oct 2012 to Oct 2017 and was tested on the **last year, Oct 2017 to Sep 2018**: 247 weekdays and 494 forecasts. This is like studying from old exam papers and being tested on a new one.
3. **We chose the model without looking at the test.** To pick between our two models, we only tested them on parts of the training years (*time-series cross-validation*). The final test year was used **once**, at the end.
4. **We compared it with simple "baselines":**
    - always guess the most common level;
    - guess from the historical average for that hour and weekday;
    - guess the same level as exactly one week ago.

We also checked that the website gives the **same answers as the Python model**. The biggest difference across 2,263 forecasts was 0.0000004.

## 6. Results in plain numbers

On the year it never saw, our model got **3 out of 4 forecasts right (73.5%)** and beat every simple rule.

![Model vs baselines](../reports/comparison.png)

**What "macro-F1" means:** a score from 0 to 1 that checks how well the model does on **each** level and then averages them. Accuracy can be fooled: always guessing "Moderate" is right 51% of the time but never warns anyone, and its macro-F1 is only 0.23. Our model scores 0.73, against 0.61 for the best simple rule.

| Method | High hours it catches | When it says High, it's right | False alerts per week | Missed High hours per week |
| --- | --- | --- | --- | --- |
| Gradient boosting (our model) | 80% | 61% | 0.95 | 0.40 |
| Logistic regression | 90% | 51% | 1.42 | 0.28 |
| Same hour last week | 61% | 61% | 0.77 | 0.77 |
| Historical average | 0% | – | 0 | 1.98 |

A "week" is 10 forecasts: 5 weekdays × 2 hours. Our model catches 4 out of 5 jammed hours and gives about **one false alarm a week**.

**Where it makes mistakes:** of the 98 hours that were really High, it called 78 High, 18 Moderate and only 2 Low. It almost never mixes up Low and High. See `reports/test_cases.md` for 10 real examples, including failures.

**How early can it warn?** Forecasting 1 hour ahead scores 0.73. Forecasting 2 hours ahead still scores 0.69 and catches 92% of High hours, with more false alarms.

## 7. What affects the prediction

The two strongest clues are **how busy the road was in the last hour** and **how busy it usually is at this time** (yesterday and last week).

| Clue | Score drop when shuffled | In simple words |
| --- | --- | --- |
| Recent traffic and its trend | 0.19 | Very important |
| Usual traffic (yesterday, last week) | 0.14 | Very important |
| Month (season) | 0.01 | A little |
| Hour of day | 0.01 | A little |
| Weather, holiday, day of week | about 0 | Little effect on average |

Weather and holidays look unimportant on average only because they are **rare** in the test year. For one single forecast, the website's "Why this forecast?" chart shows their effect: a **red bar** pushes the chance of a jam **up**, a **blue bar** pushes it **down**. On Wed 12 Sep 2018, the "usual traffic" clue added about **27 percentage points** to the chance of High.

## 8. The alert

The alert appears when the **chance of High is 50% or more**.

- **Red card, "High congestion expected":** the time window, the chance and suggested actions: leave about 20 minutes earlier, open Gate 3 and post a marshal, run an extra shuttle.
- **Amber card, "Moderate congestion likely":** keep an eye on the next forecast.
- **Green card, "Traffic expected to flow normally":** nothing to do.

Every level shows a **word and an icon**, not just a colour, so colour-blind users can read it too.

## 9. Tour of the website

| Tab | Question it answers | What to show |
| --- | --- | --- |
| Replay test day | "Would it have warned us on a real day?" | Wed 12 Sep 2018, 08:00: rainy, 99% chance of High, and it really was High |
| What-if | "What happens if...?" | Move the sliders; lower the latest-hour traffic and the alert turns green |
| Manual entry | "Can I type in today's numbers?" | Type hourly counts and weather into the table |
| Upload CSV | "Can it read a whole file?" | "Use template data": forecasts for every 8 and 9 AM in the file, downloadable |
| Model performance | "How good is it, honestly?" | Scores, confusion matrix, factors, and 10 test cases (click one to replay it) |
| About & Responsible AI | "Who is it for, and is it safe?" | Users, architecture, privacy, bias, security, accessibility, oversight, SDGs, implemented vs planned |

## 10. How it is built and put online

![Architecture](architecture.png)

We train the model once on a laptop in Python. `export_web.py` writes the trained trees into `model.json`. The website, stored on GitHub and hosted free on Vercel, runs that same model inside the visitor's browser (`model.js`), so there is **no server**. A CSV you upload never leaves your computer. Vercel can't run Streamlit, so the online site is plain HTML and JavaScript. The Streamlit version is still in the repo for running on a laptop.

## 11. What it can't do yet, and what we'd improve

| Limitation | What we would do next |
| --- | --- |
| No live traffic | Connect a traffic counter or traffic API, plus a weather API |
| A highway stands in for our road | Count vehicles at our gate for a few weeks and retrain (same code) |
| Levels based on counts, not speed | Add speed or queue length from a camera or GPS |
| Hourly data | Use 15-minute counts |
| Weather is "now", not a forecast | Use a weather-forecast API |
| Holidays only, not college events | Add the college calendar |

## 12. Questions the teacher might ask

**Why not deep learning?** We had 6 hours and about 2,000 training examples. Gradient boosting works best on small tables like ours, trains in 11 seconds and can be explained.

**Isn't 73% low?** Traffic is partly random. Our model's macro-F1 is 0.13 higher than the best simple rule's, it catches 80% of jams and it gives about one false alarm a week. Most mistakes are between neighbouring levels.

**How do you know it isn't cheating?** It only uses data from before the forecast time, and it is tested once on a full year it never saw.

**Is the data real?** Yes: real public counts from a US highway (UCI and Kaggle). Only the campus setting is a stand-in.

**Can it work for our college?** Yes. Collect hourly counts at our gate with the same columns, then rerun `train.py` and `export_web.py`.

**Does the website really use the trained model?** Yes. The trees are exported to `model.json`, and a test checks that the browser gives the same answers as Python.

## 13. Two-minute demo script

1. **Problem (15 s):** "Students arrive between 8 and 10, and the gate road jams. GateFlow warns one hour before."
2. **Data (15 s):** "Real hourly traffic, weather and holidays from 2012 to 2018."
3. **Replay (30 s):** Wed 12 Sep 2018, 08:00. "A day the model never saw. At 7 AM it gave a 99% chance of High, and it really was High."
4. **Why (20 s):** "The red bar shows the main reason."
5. **Interactive (20 s):** in What-if, drag the latest-hour traffic down and watch the alert turn green.
6. **Honest results (20 s):** in Model performance: "0.73 vs 0.61 for the best simple rule; 80% of jams caught, about one false alarm a week."
7. **Close (10 s):** "A prototype, not live yet. With our own gate's counts, the same code works for our college."

## 14. Glossary

| Word | Meaning in very simple words |
| --- | --- |
| Dataset | A big table of past information the AI learns from |
| Feature (clue) | One piece of information the model uses, like "traffic at 6 AM" |
| Training | Showing the model many past examples so it finds patterns |
| Gradient boosting | Many small yes/no question trees, each fixing the mistakes of the ones before |
| Probability | How likely something is, from 0% to 100% |
| Baseline | A simple rule without AI that the model must beat |
| Test set (held-out data) | Data kept hidden from the model and used only to check it at the end |
| Data leakage | Accidentally letting the model see the answer. We prevented it |
| Cross-validation | Testing on parts of the training data to choose the best model fairly |
| Precision (for High) | When it says High, how often it is really High |
| Recall (for High) | Of all the real High hours, how many it caught |
| Macro-F1 | One score balancing precision and recall across all three levels, from 0 to 1 |
| Confusion matrix | A table of what really happened against what the model said |
| Static website | A site made only of files, with no server running code |
