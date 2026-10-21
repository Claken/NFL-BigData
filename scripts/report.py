"""Build an offline evidence report and synchronized replay from measured routes."""

import argparse
import json
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import polars as pl
from analyze import KEY, history_metrics
from audit import normalize, read_csv
from plotly.offline import get_plotlyjs

ROOT = Path(__file__).resolve().parents[1]


def replay_id(key):
    return ":".join(str(key[k]) for k in KEY)


def review_candidates(routes, limit=50):
    """Keep the existing longest-window queue and a deterministic tie break."""
    return routes.filter((pl.col("release_separation") <= 2) & pl.col("sustained_2_0")).sort(
        ["longest_2_0", *KEY], descending=[True, False, False, False]).head(limit)


def thrower_data(route, scouting, tracking, names):
    """Use the recorded passing role, never position or proximity to the ball."""
    ids = scouting.filter(
        (pl.col("gameId") == route["gameId"]) & (pl.col("playId") == route["playId"])
        & (pl.col("pff_role").str.to_lowercase() == "pass")
    )["nflId"].drop_nulls().unique().to_list()
    if len(ids) != 1:
        return None
    player = tracking.filter(pl.col("nflId") == ids[0])
    if player.is_empty() or player["team"].unique().to_list() != [route["possessionTeam"]]:
        return None
    return {"id": ids[0], "name": names.get(ids[0], "Unknown name"),
            "jersey_number": player["jerseyNumber"][0], "source": "pff_role: Pass"}


def example_data(key, routes, raw, processed, names, scouting, sources=None):
    route = routes.filter(pl.all_horizontal([pl.col(k) == key[k] for k in KEY])).row(0, named=True)
    if sources is None:
        tracking_game = read_csv(raw, f"tracking/tracking_{key['gameId']}.csv")
        distances_game = pl.read_parquet(processed / f"separation_{key['gameId']}.parquet")
    else:
        tracking_game, distances_game = sources
    tracking = tracking_game.filter(
        (pl.col("playId") == key["playId"])
        & pl.col("frameId").is_between(route["snap"], route["release"]))
    distances = distances_game.filter(
        (pl.col("playId") == key["playId"]) & (pl.col("nflId") == key["nflId"])
        & pl.col("frameId").is_between(route["snap"], route["release"])).sort("frameId")
    direction = distances["playDirection"][0]
    history = history_metrics(distances.to_dicts(), route["snap"], route["release"], 2)
    if not math.isclose(history["longest"], route["longest_2_0"], abs_tol=1e-12):
        raise ValueError(f"Replay history differs from route summary: {key}")
    if not math.isclose(distances["separation_yards"][-1], route["release_separation"],
                        abs_tol=1e-12):
        raise ValueError(f"Replay endpoint differs from route summary: {key}")
    source_frames = {k[0]: f for k, f in tracking.partition_by("frameId", as_dict=True).items()}
    frames, manual = [], []
    for index, row in enumerate(distances.iter_rows(named=True)):
        players = []
        for p in source_frames[row["frameId"]].iter_rows(named=True):
            x, y = normalize(p["x"], p["y"], direction)
            is_offense = p["team"] == route["possessionTeam"]
            players.append({"id": p["nflId"], "x": round(x, 3), "y": round(y, 3),
                            "side": "ball" if p["nflId"] is None else "offense" if is_offense else "defense",
                            "label": str(p["jerseyNumber"]) if p["jerseyNumber"] else "",
                            "name": names.get(p["nflId"], "Football")})
        x, y = normalize(row["x"], row["y"], direction)
        frames.append({"frame": row["frameId"], "t": (row["frameId"] - route["snap"]) / 10,
                       "separation": row["separation_yards"], "downfield": row["downfield_yards"],
                       "nearest": row["defenderId"], "x": x, "y": y, "players": players})
        # Independent nearest search against original raw coordinates, not cached defender coordinates.
        if index in [0, distances.height // 2, distances.height - 1]:
            candidates = []
            for p in source_frames[row["frameId"]].iter_rows(named=True):
                if p["nflId"] is None or p["team"] == route["possessionTeam"]:
                    continue
                candidates.append((math.dist((row["x"], row["y"]), (p["x"], p["y"])), p["nflId"]))
            distance, defender = min(candidates)
            assert len(candidates) == 11
            assert defender == row["defenderId"]
            assert math.isclose(distance, row["separation_yards"], abs_tol=1e-12)
            manual.append({**key, "frameId": row["frameId"], "defenderId": defender,
                           "independent_distance": distance, "calculated_distance": row["separation_yards"]})
    line = normalize(route["absoluteYardlineNumber"], 0, direction)[0]
    start = len(frames) - 1
    if history["windows"]:
        longest = max(history["windows"], key=lambda w: w["duration_seconds"])
        if longest["duration_seconds"] >= 0.5:
            start = (longest["start_frame"] + longest["end_frame"]) // 2 - route["snap"]
    return {"id": replay_id(key), "route": route,
            "thrower": thrower_data(route, scouting, tracking, names),
            "frames": frames, "windows": history["windows"],
            "line_of_scrimmage": line, "initial_frame_index": start}, manual


def pct(x):
    return f"{100*x:.1f}%" if x is not None else "n/a"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=ROOT / "data/raw")
    parser.add_argument("--processed", type=Path, default=ROOT / "data/processed")
    parser.add_argument("--output", type=Path, default=ROOT / "outputs/multigame")
    args = parser.parse_args()
    stats = json.loads((args.output / "analysis.json").read_text())
    routes = pl.read_parquet(args.output / "routes.parquet")
    names = {r["nflId"]: r["displayName"] for r in read_csv(args.raw, "players.csv").iter_rows(named=True)}
    scouting = read_csv(args.raw, "pffScoutingData.csv").select(*KEY, "pff_role")
    queue = review_candidates(routes)
    keys = {replay_id(key): {k: key[k] for k in KEY}
            for key in [*stats["pair"]["examples"], *queue.select(KEY).to_dicts()]}
    game_plays = {}
    for key in keys.values():
        game_plays.setdefault(key["gameId"], set()).add(key["playId"])
    source_cache = {}
    replays, manual = {}, []
    for route_id, key in keys.items():
        game_id = key["gameId"]
        if game_id not in source_cache:
            play_ids = sorted(game_plays[game_id])
            source_cache[game_id] = (
                read_csv(args.raw, f"tracking/tracking_{game_id}.csv")
                .filter(pl.col("playId").is_in(play_ids)),
                pl.read_parquet(args.processed / f"separation_{game_id}.parquet")
                .filter(pl.col("playId").is_in(play_ids)),
            )
        replay, checks = example_data(key, routes, args.raw, args.processed, names, scouting,
                                      source_cache[game_id])
        replays[route_id] = replay
        manual.extend(checks)
    example_ids = [replay_id(key) for key in stats["pair"]["examples"]]
    examples = [replays[key] for key in example_ids]
    if len(examples) != 2:
        raise ValueError("No tightly matched pair; inspect eligibility before building the report")
    checked = pl.DataFrame(manual)
    checked.join(
        pl.DataFrame(stats["pair"]["examples"]).select(KEY), on=KEY, how="semi"
    ).write_csv(args.output / "example_independent_checks.csv")
    checked.write_csv(args.output / "replay_independent_checks.csv")
    queue_entries = []
    for rank, route in enumerate(queue.iter_rows(named=True), 1):
        route_id = replay_id(route)
        sustained = [w for w in replays[route_id]["windows"] if w["duration_seconds"] >= 0.5]
        longest = max(sustained, key=lambda w: w["duration_seconds"])
        queue_entries.append({**route, "replay_id": route_id, "queue_rank": rank,
                              "window_start_seconds": (longest["start_frame"] - route["snap"]) / 10,
                              "window_end_seconds": (longest["end_frame"] - route["snap"]) / 10})
    reference = examples[0]["route"]
    cohort = routes.filter((pl.col("alignment") == reference["alignment"])
                           & (pl.col("pff_passCoverage") == reference["pff_passCoverage"]))
    # All cohort points are shown; only packaged examples have a full replay.
    scatter = cohort.select(*KEY, "displayName", "release_separation", "longest_2_0",
                             "observed_seconds").to_dicts()
    main_stat = stats["main"]
    lo, hi = main_stat["game_bootstrap_95_percent_interval"]
    headline = (f"{pct(main_stat['fraction'])} of routes close at release had sustained earlier spacing")
    groups = [g for g in stats["alignment_coverage_groups"] if g["closed_at_release_routes"] >= 100][:8]
    model = {"stats": stats, "replays": list(replays.values()), "exampleIds": example_ids,
             "queue": queue_entries, "scatter": scatter, "groups": groups}
    encoded = json.dumps(model, separators=(",", ":")).replace("<", "\\u003c")
    template = (ROOT / "scripts/report_template.html").read_text()
    body = template
    display_values = {
        "__RATE__": pct(main_stat["fraction"]),
        "__HIDDEN_COUNT__": f"{main_stat['earlier_sustained_routes']:,}",
        "__CLOSE_COUNT__": f"{main_stat['closed_at_release_routes']:,}",
        "__INTERVAL__": f"{pct(lo)}–{pct(hi)}",
        "__GAME_COUNT__": f"{stats['games_analyzed']:,}",
        "__ROUTE_COUNT__": f"{stats['eligible_routes']:,}",
        "__PLAY_COUNT__": f"{stats['eligible_plays']:,}",
        "__LATE_RATE__": pct(stats["late_start_sensitivity"]["fraction"]),
        "__DEEP_RATE__": pct(stats["deeper_sensitivity"]["fraction"]),
    }
    for placeholder, value in display_values.items():
        body = body.replace(placeholder, value)
    body = body.replace("__STYLES__", (ROOT / "scripts/report_styles.css").read_text())
    body = body.replace("__PLOTLY__", get_plotlyjs()).replace(
        "__CLIENT__", (ROOT / "scripts/report_client.js").read_text()
    ).replace("__MODEL__", encoded)
    (args.output / "report.html").write_text(body)

    fig, axes = plt.subplots(1, 2, figsize=(13, 4.8), layout="constrained", sharey=True)
    for ax, e in zip(axes, examples, strict=True):
        r = e["route"]
        ax.plot([f["t"] for f in e["frames"]], [f["separation"] for f in e["frames"]], color="#1769a6")
        ax.axhline(2, color="#777777", linestyle="--", linewidth=1)
        ax.axvspan(0, 1, color="#dddddd", alpha=0.35)
        ax.axvspan(r["observed_seconds"] - 0.3, r["observed_seconds"], color="#dddddd", alpha=0.35)
        for w in e["windows"]:
            if w["duration_seconds"] >= 0.5:
                ax.axvspan((w["start_frame"] - r["snap"]) / 10,
                           (w["end_frame"] - r["snap"]) / 10, color="#2e956a", alpha=0.2)
        ax.scatter([r["observed_seconds"]], [r["release_separation"]], color="#c44a36", zorder=5)
        ax.set(title=f"Play {r['playId']} · earlier window {r['longest_2_0']:.1f}s\n"
                     f"release separation {r['release_separation']:.2f} yd",
               xlabel="Seconds since snap", ylim=(0, None))
        ax.grid(alpha=0.15)
    axes[0].set_ylabel("Distance to nearest defender (yards)")
    fig.suptitle(f"{reference['displayName']} · {reference['alignment']} · {reference['pff_passCoverage']}\n"
                 "Similar release spacing, different histories", fontsize=15)
    fig.savefig(args.output / "matched_pair.png", dpi=160)
    plt.close(fig)

    table = ["| Alignment / coverage | Routes at ≤2 yd at release | Earlier sustained spacing |",
             "| --- | ---: | ---: |"]
    for group in groups:
        table.append(f"| {group['alignment']} / {group['coverage']} | "
                     f"{group['closed_at_release_routes']:,} | {pct(group['fraction'])} |")
    sensitivity = []
    for label, item in [
        ("Start history at 1.5 s", stats["late_start_sensitivity"]),
        ("Require ≥5 yd downfield", stats["deeper_sensitivity"]),
        ("Receiver initially ≤2 yd from defender", stats["initially_close_sensitivity"]),
        ("Alternative release events, common cohort", stats["event_sensitivity"]["common_cohort_alternate"]),
    ]:
        sensitivity.append(f"- {label}: {pct(item['fraction'])} "
                           f"({item['earlier_sustained_routes']:,}/{item['closed_at_release_routes']:,}).")
    findings = f"""# Similar release spacing can hide different earlier histories

**{headline}.** In this selected sample, {main_stat['earlier_sustained_routes']:,} of
{main_stat['closed_at_release_routes']:,} routes at ≤2 yards at release had an earlier spacing
window above 2 yards lasting at least 0.5 seconds. The descriptive whole-game bootstrap
interval is {pct(lo)}–{pct(hi)}. This is a spacing-history result, not evidence of a missed pass.

## Scope and interpretation

All {stats['games_requested']} source games were processed; {stats['games_analyzed']} contribute
{stats['eligible_routes']:,} eligible routes from {stats['eligible_plays']:,} plays. This is 2021
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

{reference['displayName']}, game {reference['gameId']}, same player, same game, same
normalised alignment ({reference['alignment']}) and same coverage ({reference['pff_passCoverage']}).
Matched tolerances: release separation ≤0.15 yards apart, initial separation ≤0.5 yards apart,
observed throw time ≤0.3 seconds apart. The pair maximises history contrast among
{stats['pair']['matching_pairs']} qualifying pairs: it illustrates the result, not a typical route.

"""
    for e in examples:
        r = e["route"]
        findings += (f"- Play {r['playId']}: initial spacing {r['initial_separation']:.2f} yd, "
                     f"release spacing {r['release_separation']:.2f} yd at {r['observed_seconds']:.1f} s; "
                     f"longest earlier window {r['longest_2_0']:.1f} s.\n")
    findings += "\n## Alignment and coverage context\n\n" + "\n".join(table)
    findings += "\n\nGroups shown have at least 100 close-at-release routes, ordered by sample size. "
    findings += "They are descriptive strata, not estimates of coverage effects.\n\n## Sensitivity\n\n"
    findings += "\n".join(sensitivity)
    findings += "\n\nThreshold changes redefine both 'close at release' and 'earlier spacing':\n\n"
    for item in stats["threshold_sensitivity"]:
        findings += (f"- {item['threshold_yards']} yd: {pct(item['fraction'])} "
                     f"({item['earlier_sustained_routes']:,}/{item['closed_at_release_routes']:,}).\n")
    event = stats["event_sensitivity"]
    findings += (f"\n## Event policy\n\nA unique primary release is preferred; if absent, a unique automatic release is used "
                 f"only on C/I/IN outcomes. Sacks/scrambles are excluded. "
                 f"There are {event['automatic_fallback_plays']} pass plays with automatic fallback markers "
                 "before tracking/route exclusions. Alternatives use the unique automatic marker when available. "
                 "No label is claimed to be ground truth; all event disagreements are recorded in event_audit.json. "
                 f"On the common route cohort the sustained-window flag changes for "
                 f"{event['sustained_status_changed_routes']:,} routes. "
                 "Timing issues are excluded per affected play, not per whole game.\n\n")
    findings += """## How a football professional could use this

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
"""
    (args.output / "findings.md").write_text(findings)
    pl.DataFrame(queue_entries).select(
        "queue_rank",
        *KEY, "displayName", "possessionTeam", "week", "alignment", "pff_passCoverage",
        "initial_separation", "release_separation", "observed_seconds", "longest_2_0",
        "window_start_seconds", "window_end_seconds", "release_source", "playDescription"
    ).write_csv(args.output / "film_review_queue.csv")
    (args.output / "replay_data.json").write_text(json.dumps(
        {"example_ids": example_ids, "replays": list(replays.values()), "queue": queue_entries},
        separators=(",", ":")) + "\n")
    print(headline)
    print(f"Packaged {len(queue_entries)} queue routes and {len(examples)} matched examples "
          f"({len(replays)} unique replays); {len(manual)} independent frame checks passed.")


if __name__ == "__main__":
    main()
