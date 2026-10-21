# Failed-third-down film review

The report now opens on failed third-down passes: show the yards needed, the recorded
outcome and an exact earlier moment to inspect on film. Of 923
eligible non-penalized, non-goal-to-go failed third-down pass plays (3510
eligible receiver routes), 177 routes had a sustained gap
at or beyond the first-down line and were within 2 yards of a defender at release.
The report packages the 50 longest such windows, with deterministic
game/play/player tie breaks. Several routes may come from one play. This is a selected
review list, not a conversion rate, missed-read count or player ranking.

For this queue, the receiver must be at least the yards-to-go downfield (and at least
2 yards), with nearest separation strictly above 2 yards for six consecutive 10 Hz
samples, spanning at least 0.5 s. The interval starts at snap+1 s and ends at release−0.3 s.
Missing, short-of-line or below-threshold samples break the window. The review opens
at the first frame of the longest window, rather than the largest gap anywhere on the route.
Pass outcomes and yardage come from plays.csv, not from animating a hypothetical catch.
Completed passes short of the required distance, incompletions and interceptions are
eligible; penalties, no-plays, fumbles and ambiguous scoring outcomes are excluded.
The animation stops at release because complete ball flight is not provided.

Use third_down_review_queue.csv for this focused queue. Check the passing lane,
pressure and intended read on film; the selected receiver is not necessarily the target.
The original study and its film_review_queue.csv export remain below and use a different
cohort and downfield rule. Their 33.1% result is not a failed-third-down success estimate.

# Original study: similar release spacing can hide different earlier histories

**33.1% of routes close at release had sustained earlier spacing.** In this selected sample, 3,598 of
10,870 routes at ≤2 yards at release had an earlier spacing
window above 2 yards lasting at least 0.5 seconds. The descriptive whole-game bootstrap
interval is 31.8%–34.5%. This is a spacing-history result, not evidence of a missed pass.

## Scope and interpretation

All 122 source games were processed; 122 contribute
26,050 eligible routes from 7,217 plays. This is 2021
Weeks 1–8 data. It is not all routes, all dropbacks or a receiver ranking: only WR/TE/RB
pass-route roles on C/I/IN plays with validated timing, complete players, known line of
scrimmage, in-bounds receiver tracks, ≥1.8 seconds observed and a receiver reaching ≥2 yards
downfield are included. All receivers on a play are evaluated; target identity is not assumed.

The history interval begins 1.0 second after the snap and ends 0.3 seconds before release.
Frames count only while the receiver is at least 2 yards beyond the line of scrimmage.
Spacing must be strictly greater than 2 yards. Six consecutive samples span 0.5 seconds;
missing/ineligible/below-threshold samples break windows. The nearest of all 11 defenders
is recalculated each frame. Initial alignment can still matter; these gates do not eliminate
route design, leverage, coverage responsibility or quarterback decision context.

## Matched example

Scott Miller, game 2021091910, same player, same game, same
normalised alignment (Wide) and same coverage (Cover-2).
Matched tolerances: release separation ≤0.15 yards apart, initial separation ≤0.5 yards apart,
observed throw time ≤0.3 seconds apart. The pair maximises history contrast among
16 qualifying pairs: it illustrates the result, not a typical route.

- Play 3195: initial spacing 4.32 yd, release spacing 1.43 yd at 2.7 s; longest earlier window 0.9 s.
- Play 2885: initial spacing 3.88 yd, release spacing 1.33 yd at 2.9 s; longest earlier window 0.0 s.

## Alignment and coverage context

| Alignment / coverage | Routes at ≤2 yd at release | Earlier sustained spacing |
| --- | ---: | ---: |
| Wide / Cover-1 | 2,041 | 18.2% |
| Wide / Cover-3 | 1,310 | 51.1% |
| Slot / Cover-1 | 813 | 18.8% |
| Wide / Quarters | 486 | 56.8% |
| Wide / Cover-2 | 459 | 31.2% |
| Slot / Cover-3 | 452 | 50.9% |
| Wide / Cover-6 | 422 | 40.3% |
| Slot outside / Cover-1 | 420 | 18.6% |

Groups shown have at least 100 close-at-release routes, ordered by sample size. They are descriptive strata, not estimates of coverage effects.

## Sensitivity

- Start history at 1.5 s: 28.4% (3,090/10,870).
- Require ≥5 yd downfield: 17.0% (1,845/10,870).
- Receiver initially ≤2 yd from defender: 15.7% (233/1,484).
- Alternative release events, common cohort: 32.8% (3,533/10,759).

Threshold changes redefine both 'close at release' and 'earlier spacing':

- 1.5 yd: 38.7% (3,020/7,803).
- 2.0 yd: 33.1% (3,598/10,870).
- 2.5 yd: 30.0% (4,062/13,519).
- 3.0 yd: 25.7% (4,086/15,897).

## Event policy

A unique primary release is preferred; if absent, a unique automatic release is used only on C/I/IN outcomes. Sacks/scrambles are excluded. There are 21 pass plays with automatic fallback markers before tracking/route exclusions. Alternatives use the unique automatic marker when available. No label is claimed to be ground truth; all event disagreements are recorded in event_audit.json. On the common route cohort the sustained-window flag changes for 479 routes. Timing issues are excluded per affected play, not per whole game.

## How a football professional could use this

Use the report's 50-route review queue, or `film_review_queue.csv`, to find routes whose
release snapshot hides a sustained earlier spacing interval. Filter by receiver, alignment
and coverage, then open any queued route in the linked replay. The queue contains the
50 longest earlier windows, not all players or a representative sample; extended dropbacks
have more time to create windows. Filtering the queue does not change the aggregate result.
Replay the play and ask whether the leverage, passing lane and quarterback
timing made it usable. A route can draw defenders or occupy space without being a passing
option; nearest distance does not encode this. The tool prioritises film review and does not
label quarterback mistakes, compare receiver value, predict success or infer causation.

The metric is deterministic; confidence intervals describe game-cluster variability in this
sample, not tracking accuracy or future-season generalisation. No threshold was chosen by
maximising the observed result. The illustrative pair was chosen for contrast and is explicitly
not representative. Show an NFL mentor this pair and a misleading example before promoting
the spacing result to a football recommendation. Mentor review remains outstanding.
