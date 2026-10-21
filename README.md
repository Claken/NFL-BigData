<div align="center">

<img src="assets/nfl-player-mascot.png" alt="NFL Buddy mascot: an 8-bit football player with a football and computer" width="240">

# NFL Buddy 

### Receiver spacing over time, built for NFL film review.

**Find earlier windows. Replay the context. Ask better football questions.**

[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python&logoColor=white)](pyproject.toml)
[![Plotly](https://img.shields.io/badge/Plotly-interactive_report-3F4F75?style=flat-square&logo=plotly&logoColor=white)](outputs/multigame/report.html)
[![Data](https://img.shields.io/badge/NFL-2021_Weeks_1–8-013369?style=flat-square)](#data-and-scope)
[![uv](https://img.shields.io/badge/uv-locked_dependencies-DE5FE9?style=flat-square)](uv.lock)
[![Tests](https://img.shields.io/badge/tests-pytest-0A9EDC?style=flat-square&logo=pytest&logoColor=white)](#development)

[Open live report](https://nflbuddy.nix.zone/) · [Questions it answers](#questions-it-answers) · [How it works](#how-it-works) · [Reproduce](#reproduce-the-analysis) · [Documentation](#documentation)

**Tracking data → Spacing history → Film-review queue**

</div>

## TL;DR

NFL Buddy gives coaches and analysts a precise moment to take back to film: compare earlier space with the gap at the throw, then copy the game, play and review timestamp.

Across 122 games, **33.1%** of routes close to a defender at release (3,598 of 10,870) had at least 0.5 seconds of earlier space, so a release snapshot can hide that window.

The field leads the story; the 50-route queue, speed context and full analysis sit behind expandable controls. Spacing identifies a review cue, not proof that a throw was available.

![Football field with earlier-space and throw snapshots, plus an exact film-review cue](outputs/multigame/report_ui_overview.png)

## Explore the report

**[Open NFL Buddy →](https://nflbuddy.nix.zone/)** — no installation needed. For an offline copy, follow the steps below.

### 1. Get the project

```bash
git clone https://github.com/Claken/NFL-BigData.git
cd NFL-BigData
```

### 2. Open the report

Open [`outputs/multigame/report.html`](outputs/multigame/report.html) in your browser from the cloned repository. GitHub's file viewer shows the HTML source; use the local file to interact with it.

**No Python installation or data download is needed to explore the committed report.** Its charts and replay data are embedded, so it works offline. Keep the output folder together to retain the companion CSV, findings and image links.

### 3. Review a route

1. Select **Earlier space** and **At the throw** to compare two moments on the field.
2. **Jump to the window**, then copy the film-review cue with the game, play and timestamp.
3. Check the passing lane and quarterback timing on game film; spacing alone does not establish an available pass.
4. Open **Review queue** to filter other routes, or select **Play 2885** for a contrasting history.
5. Expand **Speed, situation & how to read the field** or **Evidence & method** for the supporting detail.

![Field-led replay with two selectable moments and a film-review action](outputs/multigame/report_ui_review.png)

## Questions it answers

| Football question | What the report provides |
| --- | --- |
| **Can a close-at-release route hide earlier spacing?** | The frequency of sustained earlier windows among eligible routes at ≤2 yards from the nearest defender at release |
| **Can similar release snapshots tell different stories?** | A matched Scott Miller pair from the same game, alignment and coverage, with contrasting spacing histories |
| **Where does this pattern appear?** | Descriptive alignment and coverage comparisons, with route counts |
| **Which plays should I review first?** | A filterable queue of 50 routes selected for their long earlier spacing windows |
| **Does the finding depend on the definition?** | Checks using different distance thresholds, later start times, greater downfield depth and alternative release markers |

Whether a window was a usable throw still requires film review of leverage, passing lanes, quarterback timing and the play's design.

## How it works

For each eligible receiver, the analysis recalculates the distance to the nearest of all 11 defenders at every tracking frame. It then compares the spacing history with the spacing at release.

| Rule | Main definition |
| --- | --- |
| **Close at release** | Nearest defender at ≤2 yards |
| **Earlier spacing** | Nearest defender strictly more than 2 yards away |
| **Sustained window** | At least 0.5 seconds: six consecutive samples at 10 Hz |
| **History starts** | 1.0 second after the snap |
| **History ends** | 0.3 seconds before release |
| **Downfield gate** | Receiver at least 2 yards beyond the line of scrimmage during the window |

Missing, ineligible or below-threshold samples break a window. The nearest defender can change from frame to frame.

The main result is **3,598 / 10,870 = 33.1%**. Starting the history later, at 1.5 seconds, gives **28.4%**; requiring at least 5 yards downfield gives **17.0%**. These checks show that the chosen timing and depth rules matter. See the [full findings](outputs/multigame/findings.md) for every comparison and denominator.

### A concrete example

Scott Miller has two routes in the same game, both from a Wide alignment against Cover-2:

| Play | Spacing at release | Longest qualifying earlier window |
| --- | ---: | ---: |
| 3195 | 1.43 yd | 0.9 s |
| 2885 | 1.33 yd | 0.0 s |

Their release spacing is similar, but their earlier histories differ. The pair was selected to illustrate that contrast; it is not a typical-route estimate. Down, distance and receiver speed are not matched.

## Features

| Capability | What you can do |
| --- | --- |
| **Synchronized replay** | Follow all 22 players, with the named thrower in purple and selected receiver in green |
| **Game situation** | See down-and-distance, a blue first-down or goal line, and the receiver's distance to it |
| **Movement context** | Read current receiver speed and whether the nearest gap is opening, closing or steady |
| **Playback controls** | Play, pause and scrub from play start to the throw; a clear end label explains that ball flight is not shown |
| **Field views** | Switch between Fit play and Full field with equal yard scales |
| **Review queue** | Filter 50 selected routes by receiver, alignment and coverage |
| **Context and evidence** | Inspect play descriptions, window times, release spacing and group results |
| **Offline use and exports** | Explore embedded charts and replays, or use the companion CSV and PNG files |

## Data and scope

The analysis uses the [NFL Big Data Bowl regional event dataset](https://github.com/ThompsonJamesBliss/nfl-big-data-bowl-regional-event-data/tree/85da22eeff2f1d5be106faa9dfe06a1205f2defd), pinned to an immutable source commit.

| Scope | Included |
| --- | ---: |
| Season | 2021, Weeks 1–8 |
| Games | 122 |
| Plays contributing eligible routes | 7,217 |
| Eligible receiver routes | 26,050 |
| Eligible routes close at release | 10,870 |

Eligibility covers WR/TE/RB pass-route roles on completed, incomplete or intercepted passes, with validated timing, complete player tracking, a known line of scrimmage, in-bounds receiver tracks, at least 1.8 seconds observed and a receiver reaching at least 2 yards downfield. All eligible receivers on a play are evaluated; target identity is not assumed. Sacks and scrambles are excluded.

Input checksums and source URLs are recorded in the [dataset manifest](data/multigame_manifest.json). Raw downloads and rebuildable frame caches are excluded from Git.

## Interpretation and limits

> [!IMPORTANT]
> This is an exploratory spacing-history tool. Nearest-defender distance does not capture passing lanes, leverage, coverage responsibility, quarterback reads or whether the receiver was a viable target.

- **The 33.1% result applies to the eligible close-at-release routes**, not all routes or all dropbacks.
- **The queue is selected for long windows.** It is not representative, and extended dropbacks have more time to create windows.
- **Coverage and alignment comparisons are descriptive.** They do not establish coverage effects or rank receiver quality.
- **Queue filters affect browsing only.** They do not recalculate the aggregate result.
- **The interval describes variation across sampled games.** It does not measure tracking accuracy or guarantee results in another season.
- **Football mentor review remains outstanding.** Use the examples to guide film discussion before turning the metric into a recommendation.

## Reproduce the analysis

You need **Python 3.12** and [uv](https://docs.astral.sh/uv/). From the repository root:

```bash
uv sync --locked
uv run --locked python scripts/build.py --fetch
```

The build downloads missing inputs, verifies their SHA-256 checksums, runs the analysis and rebuilds the report. The complete source download is approximately **865 MB**. Python and dependencies are pinned by `.python-version` and `uv.lock`.

See [REPRODUCE.md](REPRODUCE.md) for custom paths, caching, event policies, output details and the original one-game audit.

## Development

```bash
uv run --locked pytest -q
uv run --locked ruff check scripts tests
```

The tests cover metric rules, eligibility, recorded thrower identity and replay consistency. The selected receiver is the route being studied, not necessarily the intended target. The packaged replays also have [156 independent distance checks](outputs/multigame/replay_independent_checks.csv), recomputed from the original defender coordinates. These checks validate the calculations, not whether a spacing window was a usable football opportunity.

## Documentation

| Resource | What it contains |
| --- | --- |
| [Interactive report](outputs/multigame/report.html) | Main finding, route review, evidence, methods and downloads |
| [Detailed findings](outputs/multigame/findings.md) | Definitions, comparisons, uncertainty and limitations |
| [Reproduction guide](REPRODUCE.md) | Locked build commands, provenance, exclusions and output inventory |
| [Deployment guide](deploy/README.md) | Live hosting, updates and rollback on the VPS |
| [Film-review queue](outputs/multigame/film_review_queue.csv) | The 50 selected routes and their window metrics |
| [All eligible routes](outputs/multigame/routes.csv) | Derived metrics for all 26,050 eligible routes |
| [Analysis results](outputs/multigame/analysis.json) | Group rates, bootstrap intervals, sensitivities and exclusions |
| [Matched-pair image](outputs/multigame/matched_pair.png) | Static comparison for presentations or export |
| [Verification record](outputs/multigame/verification.json) | Recorded calculation and report checks |

Built for the NFL Big Data Bowl regional event side quest. The organizer confirmed that the provided 2021 data is acceptable; see the [event brief](outputs/event_brief.md).
