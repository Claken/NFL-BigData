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
include 140 unique replay records in replay_data.json: the original queue/pair plus the
new selected plays, with overlap. Only the current 92 receiver cues are embedded in the
public report; archived replays and research are not part of its main interface.

Optional `--raw /path/to/raw --output /path/to/outputs --processed /path/to/cache`
arguments control paths. The report is offline and embeds Plotly plus all 22 players on
every replay frame, with equal yard scales and offense moving right. The thrower comes
from a unique PFF `Pass` role verified against offensive tracking; the selected receiver
is not necessarily the target. Only the already-traversed receiver path is drawn.

`scripts/third_down.py` scans all eligible routes and joins actual `plays.csv` outcomes.
923 non-penalized, non-goal-to-go failed third-down pass plays contribute 3,510 eligible
receiver routes. Of those, 299 plays / 588 routes satisfy the current beyond-line screen.
A window requires >2-yard nearest-defender spacing continuously for at least 0.5 seconds
(six 10 Hz samples), at/beyond yards-to-go and at least 2 yards downfield, between snap+1 s
and release−0.3 s. Missing or ineligible samples break windows. The FIRST qualifying
interval supplies the timestamp; spacing at the throw is unrestricted.

The offline sample contains 50 distinct plays: the deliberate Anthony Schwartz example
(game 2021092601, play 3345) plus 49 other plays sampled without replacement using Python
Random seed 20261021 from sorted game/play keys. All qualifying receivers on selected
plays are included (92 cues). Cards are ordered by week/game/play; receivers by first
cue time then player ID. This is navigation, not a football-priority ranking.

Quarter, game clock, score and recorded dropBackType are visible. PFF hurry/hit flags
are aggregated over exactly 11 defensive-role records (Coverage/Pass Rush); offensive
nulls are inapplicable. Any positive flag is retained; incomplete defensive labels stay
unknown rather than becoming zero. Flags apply somewhere during the play; pressure
timing is unavailable. Traditional dropbacks and missing flags do not prove a clean pocket.
Review focus (pressure / movement / timing) is a conditional inspection prompt.

The pitch explains the team's objective and recorded outcome in complete sentences.
The copy action includes the play, receiver, timestamp, situation, measured observation
and review question. There is no review-note form, browser note storage or note export.

Part 03 has been removed from the primary UI, including its all-downs statistic, scatter,
sensitivity tables and unrelated matched examples. Original research remains in labeled
downloads and findings.md; the original aggregate analysis and metrics are unchanged.
The small current method/limitations note states the actual screening and sampling rules.
Only C/I/IN failures are included; sacks, rushing outcomes, penalties, no-plays, fumbles,
scoring ambiguities and goal-to-go situations are excluded. Useful short catches with
running gains are outside the screen. An AI coaching-style review is not practicing-coach
validation. The tool does not establish passing lanes, reads, catches or causality.

Playback continues through complete recorded post-release frames (0.2–0.5 s for the
current 50 plays). The final outcome is sourced separately from the play log. Original
`frames` and `review_cue.throw_frame_index` still stop at release; `post_release.frames`
adds observed ball/all-player positions without changing screening or outcome metrics.
Missing, duplicate or invalid tracking stops the extension; gaps are never bridged.
The timeline shows post-release nearest-defender gaps separately, excluded from scoring.

At the last recorded sample, `scripts/flight.py` fits x/y velocities by ordinary least
squares over the last three consecutive post-release positions (0.2 s span), separately
for ball and receiver. The projection is anchored at the last measured point. For a
user-selected T seconds after release, dt = T - recorded_post_release_duration and
position = last_position + fitted_velocity * dt. The receiver continues straight;
the swept ball cone spans all times from the last sample through T, with up to +20% speed and field-plane direction ±15°. The slower (−20%) scenarios lie inside that swept region; it is not a band of endpoints at T. These are
explicit sensitivity assumptions, not data-estimated errors or confidence coverage.
One replay slider progresses through recorded motion and then projection, ending at 2.0 s after release when a fit is available. requestAnimationFrame interpolates recorded positions and advances the projection continuously; the camera bounds include the full cone from the start, so scale does not jump at the boundary. Other players freeze and dim at the last recorded sample. Pausing or manually scrubbing snaps to a 0.1 s step; interpolated animation does not create new evidence samples. Projected
positions are allowed off the field and are never clamped to a sideline. Both projected
central positions use the same future time; their Euclidean gap is descriptive only.

The data's y coordinate is field width, not altitude. No ball height, vertical velocity,
landing time, drag, wind, later deflection, receiver turn or catch is inferred. A landing
calculation needs vertical-motion information; see [NASA's ballistic flight equations](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ballistic-flight-equations/).
With fewer than three valid consecutive post-release samples, no projection is offered.
Buttons, slider, field and timeline synchronize; End jumps to the end of the projection (or the last measured sample if projection is unavailable), while At the throw jumps to release. There is no separate projection slider. Node.js geometry checks are optional:
`node --test tests/test_flight_projection.cjs`.

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
- `third_down_review_queue.csv`: 92 receiver cues on 50 sampled failed-third-down plays, with first intervals, actual outcomes and recorded context.
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
