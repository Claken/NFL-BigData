# One-game feasibility decision: proceed

Scope: game `2021090900`, Dallas at Tampa Bay, September 9, 2021. The source is
pinned to commit `85da22eeff2f1d5be106faa9dfe06a1205f2defd` in
[the provided repository](https://github.com/ThompsonJamesBliss/nfl-big-data-bowl-regional-event-data).
These checks do not establish data quality across the other 121 games.

## Data integrity

- 92,644 tracking rows: 88,616 player observations and 4,028 football observations.
- 97 tracked plays and 4,028 distinct play/frame combinations.
- Zero duplicate tracking keys, missing/nonfinite player coordinates, player frame gaps,
  or conflicting frame timestamps in this game.
- All metadata tables have unique join keys. Validated many-to-one joins retain all
  88,616 player observations with zero unmatched player, play, scouting or game records.
- 92 plays have one primary snap and one primary pass-release marker, a complete frame
  sequence between them, all 11 offensive players, all 11 defenders, and complete routes.
- Five plays lack a primary pass-release marker: 788, 925, 2279, 2298 and 2330.
  They are excluded from this pass-release analysis; absence does not itself imply corrupt data.
  Play metadata identifies one completion (788), one incompletion (925), one sack (2279),
  and two scrambles (2298, 2330). Primary-label exclusion therefore also removes two passes;
  event alternatives should be inspected before scaling this policy.
- Eleven observations of player 41233 on play 2032 have negative sideline coordinates
  (minimum y = -0.67 yd). These are flagged, retained and not clipped: they could represent
  out-of-bounds movement. Structural completeness does not establish in-bounds eligibility.

## Timing and geometry

Timestamps contain only whole seconds. All 297 intervals between consecutive interior
second-transition boundaries span exactly 10 frames, and timestamp transitions are
1,000 ms. This supports an inferred 10 Hz cadence; use frame offsets rather than rounded
timestamp differences for duration. Field geometry is 120 by 53 1/3 yards, with leftward
plays rotated using `(120-x, 53 1/3-y)`. The chosen example already moves rightward.

Primary `pass_forward` and `autoevent_passforward` can differ. For play 97 they occur
at frames 40 and 38 respectively: a 0.2-second discrepancy at the inferred cadence.
The audit uses primary `ball_snap`/`pass_forward` and displays the automatic alternative.
A larger analysis needs an explicit event policy and sensitivity check.

## Independently checked example

Selection rule: lowest structurally complete play ID, then lowest-ID WR assigned
`Pass Route`. This picks Antonio Brown, NFL ID 35634, on play 97. He is not the
intended target named in the play description (Chris Godwin); this is a route example,
not an analysis of the targeted receiver or a claim about a missed read.

Snap frame 6 through throw frame 40 gives 35 observations spanning 3.4 seconds.
At each frame, distance is measured to every player on the defensive team, including
pass rushers; the nearest defender may change. It is not an assigned-coverage metric.

| Frame | Receiver (x, y) yd | Nearest defender (x, y) yd | Distance yd |
| --- | --- | --- | --- |
| 6 | (41.04, 36.77) | (43.61, 37.62) | 2.706917 |
| 23 | (47.29, 41.14) | (47.92, 40.58) | 0.842912 |
| 40 | (54.72, 41.19) | (55.34, 42.82) | 1.743932 |

For example, frame 6 is `sqrt((41.04-43.61)^2 + (36.77-37.62)^2)`.
Independent scalar calculations across all 11 defenders at all three frames agree with
the Polars result to 1e-12 yards; this verifies the arithmetic, not tracking accuracy.

Using a strictly-greater-than two-yard exploratory threshold, frames 6–11 form one
window. Its observed endpoint span is `(11-6)/10 = 0.5 s`; a one-sample window would
have zero observed span. Missing frames and below-threshold samples break windows.
No interpolation is used. These are spacing windows, not proven passing opportunities.

## Football use and next gate

The useful question is whether two routes with similar spacing at release have different
earlier spacing histories, which could help a coach find plays worth reviewing on film.
This audit demonstrates that the supplied data can support that question. It does not
yet demonstrate that duration adds useful information beyond release separation.

Early spacing can reflect the initial alignment: Brown's only above-threshold window
starts at the snap. Before claiming a football insight, compare within alignment/coverage,
inspect initial-spacing effects and route progression, test thresholds/event policy,
and ask an NFL mentor about leverage, passing lanes and misleading examples.
Route types, target labels and quarterback decision opportunities are not assumed.
