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
include tracking for 50 queued routes and two matched examples plus per-route derived metrics; review the
event/data terms before publishing them.

Optional `--raw /path/to/raw --output /path/to/outputs --processed /path/to/cache`
arguments control paths. Open `outputs/multigame/report.html` directly in a browser:
its Plotly JavaScript and example replay data are embedded. The report provides play/pause,
scrubbing, two matched examples, a synchronized cursor, cohort hover/zoom and clickable
highlighted example points. Its 50-route queue filters by receiver, alignment and coverage,
and every queue row opens a packaged replay with window times and release spacing.
Filters do not change aggregate statistics or automatically replace the current replay.
The queue is selected for long windows, not representativeness or receiver quality.
Section links connect the finding, route review, evidence and method. Wide screens place
the queue beside the replay; narrow screens stack the two. The field offers Fit play and
Full field views using equal yard scales, with all 22 players retained in both views.
The thrower is identified from the unique recorded PFF `Pass` role and matching offensive
tracking, and highlighted in purple; the selected receiver is green. Both have names and
jersey numbers above the replay and labels on the field. Missing or ambiguous passer
identity is shown as unidentified, never inferred from position or ball proximity.
The selected receiver is not necessarily the pass's intended target.
Each replay joins `down` and `yardsToGo` from `plays.csv`; invalid values stay unknown.
The blue dashed target is the normalized starting line plus yards to go, capped at the
goal line (x=110); both field views keep the target visible. Current receiver speed is
the recorded tracking `s`, shown in yd/s and mph (yd/s × 3600 / 1760), not a player ranking.
Gap trend is (nearest distance now − nearest distance 0.3 seconds earlier) / 0.3:
opening above +0.2 yd/s, closing below −0.2 yd/s, otherwise steady. The ±0.2 display
deadband does not affect the spacing score. There is no trend for the first three frames;
only earlier observations are used, and the nearest defender may change. First-down-line
proximity is position context, not a prediction of a catch or conversion. These additions
do not change the eligibility rules, 33.1% result or queue, and add no ball-flight model.
The main view leads with the football field, an earlier snapshot and the throw snapshot.
The earlier snapshot is the largest observed gap inside the longest qualifying window;
the review cue starts at that window's first observed frame. When there is no qualifying
window, no window cue is invented: review starts at the snap, and the earlier view uses
the largest gap among time/downfield-eligible frames (or the snap if none exist).
Copying the cue produces game/play IDs, the selected receiver and the exact time after
snap, with a question for film review. It makes no missed-pass claim. Queue and evidence
drawers preserve all 52 replays, statistical results, definitions and exports; anchor links
open their containing drawers. Speed and detailed play/frame metadata remain expandable.
The pitch uses equal yard scales, yard lines and hash marks; all 22 players are retained,
with the receiver, thrower and nearest opponent highlighted. Only the already-traversed
receiver path is drawn.
Replays stop at the recorded release. The small gold dot is the ball; post-throw flight is not
shown. The playback notice changes to “Throw — replay ends” at the final frame, and the
Replay button starts again from the beginning.
Complete play descriptions, frame details, eligibility, timing and exclusions remain
available in labeled expandable sections; numeric evidence tables retain every result.
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
- `film_review_queue.csv`: 50 routes selected for long earlier windows despite close release spacing.
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
