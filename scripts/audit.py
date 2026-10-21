"""Audit a pinned one-game sample; never present sample checks as dataset-wide proof."""

import argparse
import hashlib
import html
import json
import math
from collections import Counter
from pathlib import Path
from urllib.request import urlopen

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import plotly.graph_objects as go
import polars as pl
from plotly.subplots import make_subplots

ROOT = Path(__file__).resolve().parents[1]
GAME = 2021090900
RATE = 10  # Accepted only if whole-second transition boundaries validate below.
FIELD_WIDTH = 160 / 3


def windows(frames, distances, threshold=2.0, rate=RATE):
    """Strict > threshold; observed endpoint span (n-1)/rate, singleton = zero.

    Missing frames break windows. No interpolation or unobserved final interval.
    Input must be a single chronologically ordered receiver/play segment.
    """
    result = []
    for frame, distance in zip(frames, distances, strict=True):
        if not math.isfinite(float(distance)) or distance <= threshold:
            continue
        if result and frame == result[-1]["end_frame"] + 1:
            result[-1]["end_frame"] = int(frame)
            result[-1]["samples"] += 1
        else:
            result.append({"start_frame": int(frame), "end_frame": int(frame), "samples": 1})
    for window in result:
        window["duration_seconds"] = (window["end_frame"] - window["start_frame"]) / rate
    return result


def separation(receiver, defenders):
    """Euclidean distance to all opposing players; deterministic ID tie break."""
    return (
        receiver.join(defenders, on=["gameId", "playId", "frameId"], how="inner")
        .with_columns(
            ((pl.col("x") - pl.col("dx")).pow(2) + (pl.col("y") - pl.col("dy")).pow(2))
            .sqrt()
            .alias("separation_yards")
        )
        .sort(["frameId", "separation_yards", "defenderId"])
        .unique(subset=["gameId", "playId", "nflId", "frameId"], keep="first")
        .sort("frameId")
    )


def normalize(x, y, direction):
    return (120 - x, FIELD_WIDTH - y) if direction == "left" else (x, y)


def read_csv(raw, name):
    return pl.read_csv(
        raw / "data" / name,
        null_values=["NA", "None"],
        schema_overrides={k: pl.Int64 for k in ["gameId", "playId", "nflId", "frameId"]},
        infer_schema_length=10000,
    )


def duplicates(frame, keys):
    return frame.height - frame.unique(subset=keys).height


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=ROOT / "data/raw")
    parser.add_argument("--output", type=Path, default=ROOT / "outputs")
    parser.add_argument("--fetch", action="store_true", help="Fetch missing pinned inputs")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((ROOT / "data/source_manifest.json").read_text())
    for item in manifest["files"]:
        path = args.raw / item["path"]
        if not path.exists() and args.fetch:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(urlopen(item["url"], timeout=60).read())
        if hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
            raise ValueError(f"Input checksum mismatch: {path}")

    tracking = read_csv(args.raw, f"tracking/tracking_{GAME}.csv")
    plays = read_csv(args.raw, "plays.csv")
    players = read_csv(args.raw, "players.csv")
    scouting = read_csv(args.raw, "pffScoutingData.csv")
    games = read_csv(args.raw, "games.csv")
    frames = tracking.select("gameId", "playId", "frameId", "time").unique().sort(
        "playId", "frameId"
    )
    frames = frames.with_columns(
        pl.col("time").str.to_datetime(format="%Y-%m-%dT%H:%M:%SZ", time_zone="UTC")
        .dt.epoch("ms").alias("ms")
    )
    changes = frames.with_columns(pl.col("ms").diff().over("playId").alias("dt"))
    boundaries = changes.filter(pl.col("dt") > 0).with_columns(
        pl.col("frameId").diff().over("playId").alias("boundary_spacing")
    )
    steps = boundaries["boundary_spacing"].drop_nulls().to_list()
    cadence = Counter(steps)
    if not steps or set(steps) != {10} or boundaries["dt"].unique().to_list() != [1000]:
        raise ValueError(f"10 Hz inference failed: {cadence}")

    player_rows = tracking.filter(pl.col("nflId").is_not_null())
    metadata_duplicates = {
        "games": duplicates(games, ["gameId"]),
        "plays": duplicates(plays, ["gameId", "playId"]),
        "players": duplicates(players, ["nflId"]),
        "scouting": duplicates(scouting, ["gameId", "playId", "nflId"]),
    }
    assert not any(metadata_duplicates.values()), metadata_duplicates
    joined = player_rows.join(
        plays, on=["gameId", "playId"], how="left", validate="m:1"
    ).join(players, on="nflId", how="left", validate="m:1").join(
        scouting, on=["gameId", "playId", "nflId"], how="left", validate="m:1"
    ).join(games, on="gameId", how="left", validate="m:1")
    assert joined.height == player_rows.height
    event_rows = tracking.filter(pl.col("event").is_not_null()).select(
        "playId", "frameId", "event"
    ).unique().sort("playId", "frameId")
    event_map = {}
    for row in event_rows.iter_rows(named=True):
        event_map.setdefault(row["playId"], {}).setdefault(row["event"], []).append(row["frameId"])

    segment_audit = []
    for play_id in sorted(tracking["playId"].unique().to_list()):
        events = event_map.get(play_id, {})
        snap, release = events.get("ball_snap", []), events.get("pass_forward", [])
        entry = {"playId": play_id, "snap_frames": snap, "throw_frames": release}
        if len(snap) != 1 or len(release) != 1 or release[0] < snap[0]:
            entry.update(usable=False, reason="Missing, ambiguous or unordered primary snap/throw")
        else:
            segment = joined.filter(
                (pl.col("playId") == play_id) & pl.col("frameId").is_between(snap[0], release[0])
            )
            counts = segment.group_by("frameId").agg(
                (pl.col("team") == pl.col("defensiveTeam")).sum().alias("defenders"),
                (pl.col("team") == pl.col("possessionTeam")).sum().alias("offense"),
                pl.col("nflId").n_unique().alias("unique_players"),
            )
            routes = segment.filter(pl.col("pff_role").str.to_lowercase() == "pass route")
            expected = release[0] - snap[0] + 1
            route_counts = routes.group_by("nflId").agg(pl.col("frameId").n_unique().alias("n"))
            complete = (
                counts.height == expected
                and counts.filter(
                    (pl.col("defenders") != 11) | (pl.col("offense") != 11)
                    | (pl.col("unique_players") != 22)
                ).is_empty()
                and routes.height > 0 and route_counts.filter(pl.col("n") != expected).is_empty()
                and segment.filter(
                    pl.col("x").is_null() | pl.col("y").is_null()
                    | ~pl.col("x").is_finite() | ~pl.col("y").is_finite()
                ).is_empty()
                and duplicates(segment, ["gameId", "playId", "nflId", "frameId"]) == 0
            )
            entry.update(
                usable=complete, frames=expected, route_runners=route_counts.height,
                min_defenders=counts["defenders"].min(),
                max_defenders=counts["defenders"].max(),
                auto_throw_frames=events.get("autoevent_passforward", []),
                reason="Complete primary snap-to-throw segment" if complete else "Incomplete segment",
            )
        segment_audit.append(entry)

    eligible = [x for x in segment_audit if x["usable"]]
    assert eligible, "No eligible play"
    # Deterministic feasibility example, selected without looking at separation.
    chosen = eligible[0]
    play_id = chosen["playId"]
    snap, release = chosen["snap_frames"][0], chosen["throw_frames"][0]
    segment = joined.filter(
        (pl.col("playId") == play_id) & pl.col("frameId").is_between(snap, release)
    )
    candidates = segment.filter(
        (pl.col("pff_role").str.to_lowercase() == "pass route")
        & pl.col("officialPosition").is_in(["WR", "TE", "RB"])
    )
    wr = candidates.filter(pl.col("officialPosition") == "WR")
    receiver_id = (wr if wr.height else candidates)["nflId"].min()
    receiver = segment.filter(pl.col("nflId") == receiver_id).select(
        "gameId", "playId", "nflId", "frameId", "x", "y", "displayName", "playDirection"
    )
    defenders = segment.filter(pl.col("team") == pl.col("defensiveTeam")).select(
        "gameId", "playId", "frameId", pl.col("nflId").alias("defenderId"),
        pl.col("x").alias("dx"), pl.col("y").alias("dy"),
        pl.col("displayName").alias("defenderName"),
    )
    distances = separation(receiver, defenders).with_columns(
        ((pl.col("frameId") - snap) / RATE).alias("seconds_since_snap")
    )
    hand_checks = []
    for frame_id in [snap, (snap + release) // 2, release]:
        row = distances.filter(pl.col("frameId") == frame_id).row(0, named=True)
        all_distances = []
        for defender in defenders.filter(pl.col("frameId") == frame_id).iter_rows(named=True):
            dx, dy = row["x"] - defender["dx"], row["y"] - defender["dy"]
            distance = math.sqrt(dx * dx + dy * dy)
            all_distances.append((distance, defender["defenderId"]))
            hand_checks.append({
                "frameId": frame_id, "receiverId": receiver_id,
                "receiver_x": row["x"], "receiver_y": row["y"],
                "defenderId": defender["defenderId"], "defenderName": defender["defenderName"],
                "defender_x": defender["dx"], "defender_y": defender["dy"],
                "difference_x": dx, "difference_y": dy, "distance_yards": distance,
            })
        manual_distance, manual_id = min(all_distances)
        assert manual_id == row["defenderId"]
        assert math.isclose(manual_distance, row["separation_yards"], abs_tol=1e-12)
    pl.DataFrame(hand_checks).write_csv(args.output / "manual_distance_checks.csv")
    distances.write_csv(args.output / "receiver_separation.csv")
    threshold = 2.0
    opening_windows = windows(distances["frameId"], distances["separation_yards"], threshold)
    checks = {
        "source_commit": manifest["commit"], "gameId": GAME,
        "scope": "One game only. This is a feasibility audit, not a receiver evaluation.",
        "input_inventory": {item["path"]: item["bytes"] for item in manifest["files"]},
        "tracking_schema": {name: str(dtype) for name, dtype in tracking.schema.items()},
        "metadata_rows": {"games": games.height, "plays": plays.height,
                          "players": players.height, "scouting": scouting.height},
        "rows": tracking.height, "player_rows": player_rows.height,
        "ball_rows": tracking.height - player_rows.height,
        "plays": tracking["playId"].n_unique(), "unique_frames": frames.height,
        "metadata_duplicate_keys": metadata_duplicates,
        "tracking_duplicate_keys": duplicates(tracking, ["gameId", "playId", "nflId", "frameId"]),
        "player_missing_coordinates": player_rows.filter(
            pl.col("x").is_null() | pl.col("y").is_null()
        ).height,
        "player_nonfinite_coordinates": player_rows.filter(
            ~pl.col("x").is_finite() | ~pl.col("y").is_finite()
        ).height,
        "coordinates_outside_field": tracking.filter(
            ~pl.col("x").is_between(0, 120) | ~pl.col("y").is_between(0, FIELD_WIDTH)
        ).height,
        "coordinate_bounds": {c: [tracking[c].min(), tracking[c].max()] for c in ["x", "y"]},
        "entity_frame_gaps": player_rows.sort("playId", "nflId", "frameId").with_columns(
            pl.col("frameId").diff().over(["gameId", "playId", "nflId"]).alias("gap")
        ).filter(pl.col("gap") > 1).height,
        "frame_timestamp_conflicts": frames.group_by("playId", "frameId").len()
        .filter(pl.col("len") != 1).height,
        "joined_rows": joined.height,
        "unmatched_metadata": {
            col: joined.filter(pl.col(col).is_null()).height
            for col in ["displayName", "possessionTeam", "pff_role", "week"]
        },
        "role_values": sorted(scouting["pff_role"].drop_nulls().unique().to_list()),
        "observed_cadence": {
            "inferred_hz": RATE, "timestamp_precision": "whole seconds",
            "timestamp_transition_deltas_ms": sorted(boundaries["dt"].unique().to_list()),
            "interior_transition_frame_spacings": {str(k): v for k, v in cadence.items()},
            "interpretation": "10 frames between each consecutive second boundary; inferred cadence",
        },
        "usable_primary_snap_to_throw_plays": len(eligible), "segments": segment_audit,
        "selected": {
            "playId": play_id, "receiverId": receiver_id,
            "receiver": distances["displayName"][0],
            "rule": "Lowest playId with complete primary events/players; lowest NFL ID WR route runner",
            "snap_frame": snap, "throw_frame": release, "samples": distances.height,
            "observed_seconds": (release - snap) / RATE,
            "play_description": segment["playDescription"][0],
            "direction": distances["playDirection"][0],
            "coverage": segment["pff_passCoverage"][0],
            "alignment": candidates.filter(pl.col("nflId") == receiver_id)["pff_positionLinedUp"][0],
            "threshold_yards": threshold, "threshold_comparison": "strictly greater than",
            "duration_convention": "observed endpoint span (n-1)/10, singleton zero",
            "opening_windows": opening_windows,
            "separation_at_throw_yards": distances["separation_yards"][-1],
            "manual_check_frames": [snap, (snap + release) // 2, release],
            "manual_check_absolute_tolerance_yards": 1e-12,
            "event_markers": event_map[play_id],
        },
        "decision": "Proceed to multi-game validation; exploratory receiver spacing is feasible",
    }
    (args.output / "audit.json").write_text(json.dumps(checks, indent=2) + "\n")

    figure = make_subplots(rows=1, cols=2, column_widths=[0.57, 0.43],
                           subplot_titles=["Route and nearest-defender connection at throw",
                                           "Receiver separation from snap to throw"])
    figure.add_shape(type="rect", x0=0, x1=120, y0=0, y1=FIELD_WIDTH,
                     line={"color": "#5d8068"}, fillcolor="#f0f7f0", layer="below",
                     row=1, col=1)
    for yardline in range(10, 120, 10):
        figure.add_shape(type="line", x0=yardline, x1=yardline, y0=0, y1=FIELD_WIDTH,
                         line={"color": "#cadbca", "width": 1}, layer="below", row=1, col=1)
    direction = distances["playDirection"][0]
    points = [normalize(r["x"], r["y"], direction) for r in distances.iter_rows(named=True)]
    xx, yy = zip(*points, strict=True)
    figure.add_trace(go.Scatter(x=xx, y=yy, mode="lines", name="Receiver path",
                               line={"color": "#1677b8", "width": 3}), row=1, col=1)
    last_frame = segment.filter(pl.col("frameId") == release)
    for team, color in [("offense", "#1677b8"), ("defense", "#d04b37")]:
        team_rows = last_frame.filter(
            pl.col("team") == pl.col("possessionTeam" if team == "offense" else "defensiveTeam")
        )
        coords = [normalize(r["x"], r["y"], direction) for r in team_rows.iter_rows(named=True)]
        figure.add_trace(go.Scatter(
            x=[p[0] for p in coords], y=[p[1] for p in coords], mode="markers",
            text=team_rows["displayName"].to_list(), name=team.title(),
            marker={"color": color, "size": 9}, hovertemplate="%{text}<extra></extra>",
        ), row=1, col=1)
    last = distances.row(-1, named=True)
    defender_xy = normalize(last["dx"], last["dy"], direction)
    figure.add_trace(go.Scatter(x=[xx[-1], defender_xy[0]], y=[yy[-1], defender_xy[1]],
                               mode="lines+markers", name="Nearest defender at throw",
                               line={"color": "#9d6512", "dash": "dot"}), row=1, col=1)
    figure.add_trace(go.Scatter(
        x=distances["seconds_since_snap"].to_list(), y=distances["separation_yards"].to_list(),
        mode="lines+markers", name="Nearest-defender separation",
        text=distances["defenderName"].to_list(), line={"color": "#1677b8"},
        hovertemplate="%{x:.1f}s: %{y:.3f} yd<br>Nearest: %{text}<extra></extra>",
    ), row=1, col=2)
    figure.add_hline(y=threshold, line_dash="dash", annotation_text="Exploratory 2-yard threshold",
                     row=1, col=2)
    for window in opening_windows:
        figure.add_vrect(x0=(window["start_frame"] - snap) / RATE,
                         x1=(window["end_frame"] - snap) / RATE,
                         fillcolor="green", opacity=0.12, line_width=0, row=1, col=2)
    for event, color, dash in [("pass_forward", "#d04b37", "solid"),
                                ("autoevent_passforward", "#777777", "dot")]:
        for event_frame in event_map[play_id].get(event, []):
            figure.add_vline(x=(event_frame - snap) / RATE, line_color=color, line_dash=dash,
                             row=1, col=2)
    figure.update_xaxes(range=[0, 120], title_text="Normalised field x (yards), offense →", row=1, col=1)
    figure.update_yaxes(range=[0, FIELD_WIDTH], title_text="Field y (yards)",
                        scaleanchor="x", scaleratio=1, constrain="domain", row=1, col=1)
    figure.update_xaxes(title_text="Seconds since snap (10 Hz inferred)", row=1, col=2)
    figure.update_yaxes(title_text="Distance to nearest defender (yards)", rangemode="tozero",
                        row=1, col=2)
    figure.update_layout(template="plotly_white", height=620,
                         title=f"Feasibility example · {checks['selected']['receiver']} · play {play_id}",
                         legend={"orientation": "h", "y": -0.25}, margin={"b": 150})
    plot = figure.to_html(full_html=False, include_plotlyjs=True)
    selected = checks["selected"]
    narrative = f"""<h1>Can we measure receiver spacing over time?</h1>
<p><b>Yes, for this audited game.</b> {len(eligible)} of {checks['plays']} tracked plays have
complete primary snap-to-throw segments with all 11 defenders and route runners.</p>
<p>The coaching question is whether an apparent lack of separation at release hides an earlier
spacing window. This audit establishes that the measurement is possible; it does not establish
a coaching finding, a missed read, or receiver quality.</p>
<p>Example selected without inspecting separation: {html.escape(selected['play_description'])}
Receiver: {html.escape(selected['receiver'])}; alignment: {html.escape(selected['alignment'])};
coverage: {html.escape(selected['coverage'])}. {selected['samples']} samples across
{selected['observed_seconds']:.1f} seconds; throw separation
{selected['separation_at_throw_yards']:.3f} yards.</p>
<p>Shading means distance strictly above an exploratory 2-yard threshold. It does not mean a
pass is available. Red line: primary pass release; grey dotted line: automatic pass marker.
Durations use observed endpoint spans, not an assumed additional final frame.</p>
<p>Brown's only above-threshold window starts at the snap and spans 0.5 seconds. This may
reflect initial alignment rather than route execution; it is a reason to control for alignment
before drawing a football conclusion. Five plays without primary pass-release markers are
excluded. Eleven sideline observations elsewhere in this game have negative y coordinates;
they are flagged and retained rather than clipped.</p>
<p>Nearest-defender spacing ignores passing lanes, leverage, quarterback vision and timing,
route intent and coverage responsibility. Do not infer quarterback error. No route-type or
targeted-receiver label is supplied in these metadata.</p>"""
    (args.output / "audit_report.html").write_text(
        '<!doctype html><html lang="en"><meta charset="utf-8"><title>Receiver spacing audit</title>'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<style>body{max-width:1300px;margin:32px auto;padding:0 24px;font:17px/1.55 system-ui;'
        'color:#172b40}h1{line-height:1.2}</style>' + narrative + plot
        + '<p>Source commit: ' + manifest["commit"] + '</p></html>'
    )
    static, ax = plt.subplots(figsize=(10, 4.8), layout="constrained")
    ax.plot(distances["seconds_since_snap"], distances["separation_yards"], color="#1677b8")
    ax.axhline(threshold, color="#777777", linestyle="--", label="Exploratory threshold: 2 yd")
    for window in opening_windows:
        ax.axvspan((window["start_frame"] - snap) / RATE,
                   (window["end_frame"] - snap) / RATE, color="green", alpha=0.12)
    ax.axvline((release - snap) / RATE, color="#d04b37", label="Primary pass release")
    for event_frame in event_map[play_id].get("autoevent_passforward", []):
        ax.axvline((event_frame - snap) / RATE, color="#777777", linestyle=":",
                   label="Automatic pass marker")
    ax.set(title=f"{selected['receiver']} · game {GAME}, play {play_id}",
           xlabel="Seconds since snap (10 Hz inferred)",
           ylabel="Nearest-defender distance (yards)", ylim=(0, None))
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.17), ncol=3, fontsize=9)
    static.savefig(args.output / "separation.png", dpi=160)
    plt.close(static)
    print(json.dumps({k: v for k, v in checks.items() if k not in ["segments"]}, indent=2))


if __name__ == "__main__":
    main()
