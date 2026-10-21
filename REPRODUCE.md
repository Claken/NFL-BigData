# Reproduce the receiver-spacing analysis

From this repository with [uv](https://docs.astral.sh/uv/) installed:

```bash
uv sync --locked
uv run --locked python scripts/build.py --fetch
uv run --locked pytest -q
uv run --locked ruff check scripts tests
```

Python 3.12 and dependencies are pinned by `.python-version` and `uv.lock`.
`--fetch` downloads only missing inputs listed in `data/multigame_manifest.json` and
verifies every input's SHA-256 before analysis. Source URLs use an immutable Git commit.
The full download totals 865,324,685 bytes (approximately 865 MB). Raw files are ignored
by Git; no redistribution permission is inferred from public access. Generated outputs
include 91 unique replays: the original 50-route queue and matched pair, plus 50 focused
failed-third-down routes (some overlap). Review the event/data terms before publishing them.

Optional `--raw /path/to/raw --output /path/to/outputs --processed /path/to/cache`
arguments control paths. Open `outputs/multigame/report.html` directly in a browser:
its Plotly JavaScript and replay data are embedded. The report shows all 22 players,
rotated with the offense moving right, using equal yard scales. The thrower is identified
by a unique recorded PFF `Pass` role with matching offensive tracking. The selected
receiver is not necessarily the intended target.

The primary queue is derived by `scripts/third_down.py` from **all eligible routes**,
not by filtering the original 50-route sample. It joins `plays.csv` down, yards-to-go,
pass result and play result. Third-down incompletions, interceptions and completions
short of the distance qualify as failures. Penalties (including declined penalties in
descriptions), no-plays, fumbles, scoring ambiguities and goal-to-go plays are excluded.
923 plays contribute 3,510 eligible receiver routes under this conservative policy.
177 routes have >2-yard separation sustained for ≥0.5 seconds at/beyond the first-down
line (and ≥2 yards downfield), between snap+1 s and release−0.3 s, and ≤2-yard separation
at release. Missing or ineligible samples break windows. The 50 longest windows are
packaged with deterministic game/play/player tie breaks; multiple routes may share a
play, and extended dropbacks have more time to qualify. These are review cues, not
missed-read labels, conversion rates or player rankings.

The report opens at the first frame of the longest beyond-line window, the same instant
named in the on-pitch question. Need, recorded outcome and review question remain
visible while scrubbing. The blue dashed target is the normalized starting line plus
yards to go. The earlier and throw buttons compare the gap; the copy action includes
IDs, situation, outcome and timestamp. Check passing lanes, pressure and intended read
on game film. Speed and trailing gap trend remain in the exported replay data but have
been removed from the UI to concentrate on the conversion question.

The original all-downs study remains separate in Evidence & method, with its unchanged
2-yard downfield gate, aggregate results, matched examples and original CSV export.
The queue is visible by default. Filters change the queue only; navigation anchors open
containing evidence sections. Source descriptions and detailed frame measurements are
available for audit. Fit play and Full field retain all 22 players; only the already-traversed
receiver path is drawn. The playback ends at the recorded throw, before ball flight.
The final play outcome is sourced from the play log; no catch or flight is fabricated.

It has no external asset tags. Linked findings, CSV and PNG
are sibling files; keep the output folder together if distributing those links.

`scripts/build.py` runs `scripts/analyze.py` followed by `scripts/report.py` with the same paths.
The full analysis processes 122 games and validates inputs, joins and eligible segments.
`data/processed/separation_*.parquet` contains rebuildable per-frame receiver distances.
Do not reuse these cached files with a different source or metric definition.

Main outputs under `outputs/multigame/`:

- `report.html`: offline interactive report.
- `findings.md`: definitions, result, comparisons, limits and event policy.
- `analysis.json`: group rates, seeded game-bootstrap intervals and per-game exclusions.
- `event_audit.json`: every play's snap/release markers and differences.
- `routes.csv` / `routes.parquet`: route metrics with player, play, alignment and coverage.
- `alternate_event_routes.parquet`: common-cohort event sensitivity data.
- `third_down_review_queue.csv`: 50 failed-third-down routes with actual outcome, yards needed and beyond-line windows.
- `film_review_queue.csv`: original 50 routes selected for long earlier windows despite close release spacing.
- `replay_data.json`: embedded tracking for every queued route and the matched pair.
- `example_independent_checks.csv`: distances recomputed from original defender coordinates.
- `replay_independent_checks.csv`: three independent frame checks for each unique replay.
- `matched_pair.png`: static comparison for export and fallback.

The primary marker is preferred; a unique automatic marker is used only when the primary
is absent on C/I/IN pass outcomes. The alternative policy uses the automatic marker when
unique. Unknown/ambiguous events, inconsistent timestamps, incomplete players/frames,
missing line of scrimmage, out-of-bounds receivers, short observations and routes never
reaching two yards downfield are excluded with reasons. Whole-game 10 Hz evidence is
required; conflicting times reject the affected play rather than its whole game.

The main exploratory threshold is two yards, with alternatives 1.5, 2.5 and 3 yards.
History runs from snap+1.0 s to release−0.3 s while at least two yards downfield;
six consecutive samples form a sustained 0.5-second endpoint span. Intervals use 2,000
whole-game bootstrap resamples with seed 20261021. Initial-spacing, later-start and
greater-depth checks are reported separately. No predictive model or causal claim is made.

## Original one-game feasibility audit

```bash
uv run --locked python scripts/audit.py --fetch
```

This uses the smaller `data/source_manifest.json` (approximately 25 MB).
`outputs/audit_report.html` contains a static field and separation timeline for Antonio Brown.
`outputs/audit.json` records checks and all play eligibility decisions.
`outputs/manual_distance_checks.csv` contains all 11 defender distances at three frames.
`outputs/receiver_separation.csv` contains the 35 selected receiver samples.
`outputs/separation.png` is the static timeline fallback.

The upstream data dictionary is saved under `data/raw/README.md`. Its role descriptions
use different capitalisation than the CSV; analysis compares lowercase roles with
`pass route`. No target label or route-type field is assumed.
