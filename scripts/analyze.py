"""Multi-game receiver-spacing analysis with explicit event and exclusion policies."""

import argparse
import hashlib
import json
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen

import numpy as np
import polars as pl
from audit import FIELD_WIDTH, RATE, duplicates, read_csv, separation, windows

ROOT = Path(__file__).resolve().parents[1]
THRESHOLDS = (1.5, 2.0, 2.5, 3.0)
SEED = 20261021
KEY = ["gameId", "playId", "nflId"]


def choose_event(primary, automatic):
    """Prefer a unique primary; only use an automatic event when primary is absent."""
    if len(primary) == 1:
        return primary[0], "primary"
    if primary:
        return None, "ambiguous_primary"
    if len(automatic) == 1:
        return automatic[0], "automatic_fallback"
    return None, "missing_or_ambiguous"


def alignment(label):
    """Preserve alignment detail while removing left/right symmetry."""
    mapping = {
        "LWR": "Wide", "RWR": "Wide", "SLWR": "Slot", "SRWR": "Slot",
        "SLiWR": "Slot inside", "SRiWR": "Slot inside",
        "SLoWR": "Slot outside", "SRoWR": "Slot outside",
        "TE-L": "Inline TE", "TE-R": "Inline TE",
        "TE-iL": "TE inside", "TE-iR": "TE inside",
        "TE-oL": "TE outside", "TE-oR": "TE outside",
        "HB": "Backfield HB", "HB-L": "Backfield HB", "HB-R": "Backfield HB",
        "FB": "Backfield FB", "FB-L": "Backfield FB", "FB-R": "Backfield FB",
    }
    return mapping.get(label, "Other")


def timing_audit(frames):
    """Use game-level 10 Hz evidence; reject individual plays with inconsistent time."""
    frames = frames.sort("playId", "frameId").with_columns(
        pl.col("time").str.to_datetime(format="%Y-%m-%dT%H:%M:%SZ", time_zone="UTC")
        .dt.epoch("ms").alias("ms")
    ).with_columns(pl.col("ms").diff().over("playId").alias("dt"))
    transitions = frames.filter(pl.col("dt") > 0).with_columns(
        pl.col("frameId").diff().over("playId").alias("spacing"))
    bad = set(frames.filter((pl.col("dt") < 0) | (pl.col("dt") > 1000))["playId"])
    bad.update(transitions.filter(pl.col("spacing").is_not_null()
                                  & (pl.col("spacing") != 10))["playId"])
    spacings = Counter(transitions["spacing"].drop_nulls().to_list())
    return spacings, bad


def history_metrics(rows, snap, release, threshold, start_seconds=1.0, downfield_yards=2.0):
    """Exclude initial alignment and last 0.3 s; require receiver at least 2 yd downfield.

    A sustained window has at least six consecutive samples: a 0.5 s endpoint span.
    Distances can be evaluated earlier than the chosen release marker, never after it.
    """
    eligible = [r for r in rows if snap + round(start_seconds * RATE) <= r["frameId"]
                <= release - 3 and r["downfield_yards"] >= downfield_yards]
    detected = windows([r["frameId"] for r in eligible],
                       [r["separation_yards"] for r in eligible], threshold)
    longest = max((w["duration_seconds"] for w in detected), default=0.0)
    return {
        "longest": longest,
        "total": sum(w["duration_seconds"] for w in detected),
        "sustained": longest >= 0.5,
        "windows": detected,
    }


def verify_inputs(manifest, raw, fetch):
    def check(item):
        path = raw / item["path"]
        if not path.exists() and fetch:
            data = urlopen(item["url"], timeout=60).read()
            if hashlib.sha256(data).hexdigest() != item["sha256"]:
                raise ValueError(f"Download checksum mismatch: {path}")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        if hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
            raise ValueError(f"Input checksum mismatch: {path}")
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(check, manifest["files"]))


def summarize_route(rows, metadata, event):
    snap, release = event["snap"], event["release"]
    segment = [r for r in rows if snap <= r["frameId"] <= release]
    if len(segment) != release - snap + 1:
        return None, "incomplete_receiver"
    if any(not (0 <= r["x"] <= 120 and 0 <= r["y"] <= FIELD_WIDTH) for r in segment):
        return None, "receiver_outside_field"
    if release - snap < 18:
        return None, "observation_shorter_than_1.8_seconds"
    if not any(r["downfield_yards"] >= 2 for r in segment):
        return None, "never_two_yards_downfield"
    initial, final = segment[0], segment[-1]
    result = {**metadata, **event,
              "release_separation": final["separation_yards"],
              "initial_separation": initial["separation_yards"],
              "observed_seconds": (release - snap) / RATE,
              "alignment": alignment(metadata["pff_positionLinedUp"])}
    for threshold in THRESHOLDS:
        h = history_metrics(segment, snap, release, threshold)
        suffix = str(threshold).replace(".", "_")
        result.update({f"longest_{suffix}": h["longest"],
                       f"total_{suffix}": h["total"],
                       f"sustained_{suffix}": h["sustained"]})
    # Timing/alignment sensitivities on the exact same main route cohort.
    result["sustained_late_start"] = history_metrics(
        segment, snap, release, 2.0, start_seconds=1.5)["sustained"]
    result["sustained_deeper"] = history_metrics(
        segment, snap, release, 2.0, downfield_yards=5.0)["sustained"]
    result["initially_above_2"] = initial["separation_yards"] > 2
    return result, None


def process_game(game_id, raw, plays, players, scouting, games, processed):
    t = read_csv(raw, f"tracking/tracking_{game_id}.csv")
    diagnostics = {"gameId": game_id, "tracking_rows": t.height,
                   "tracking_plays": t["playId"].n_unique(), "exclusions": Counter()}
    if t["gameId"].unique().to_list() != [game_id]:
        raise ValueError(f"Unexpected game IDs in {game_id}")
    diagnostics["duplicate_tracking_keys"] = duplicates(t, KEY + ["frameId"])
    if diagnostics["duplicate_tracking_keys"]:
        diagnostics["game_excluded"] = "duplicate tracking keys"
        return [], [], diagnostics, []
    frame_times = t.group_by("playId", "frameId").agg(
        pl.col("time").n_unique().alias("n_times"), pl.col("time").min())
    conflicting_time_plays = set(frame_times.filter(pl.col("n_times") > 1)["playId"])
    frames = frame_times.select("playId", "frameId", "time").sort("playId", "frameId")
    spacings, invalid_timing_plays = timing_audit(frames)
    invalid_timing_plays.update(conflicting_time_plays)
    diagnostics["conflicting_frame_time_plays"] = sorted(conflicting_time_plays)
    diagnostics["cadence_transition_spacings"] = {str(k): v for k, v in spacings.items()}
    diagnostics["invalid_timing_plays"] = sorted(invalid_timing_plays)
    if not spacings[10]:
        diagnostics["game_excluded"] = "10 Hz cadence not validated"
        return [], [], diagnostics, []
    base = t.filter(pl.col("nflId").is_not_null())
    j = base.join(plays, on=["gameId", "playId"], how="left", validate="m:1").join(
        players, on="nflId", how="left", validate="m:1").join(
        scouting, on=KEY, how="left", validate="m:1").join(
        games, on="gameId", how="left", validate="m:1")
    diagnostics["player_rows"] = base.height
    diagnostics["joined_rows"] = j.height
    assert j.height == base.height
    event_map = {}
    for r in t.filter(pl.col("event").is_not_null()).select(
        "playId", "frameId", "event").unique().sort("playId", "frameId").iter_rows(named=True):
        event_map.setdefault(r["playId"], {}).setdefault(r["event"], []).append(r["frameId"])
    checks = j.group_by("playId", "frameId").agg(
        (pl.col("team") == pl.col("defensiveTeam")).sum().alias("defenders"),
        (pl.col("team") == pl.col("possessionTeam")).sum().alias("offense"),
        pl.col("nflId").n_unique().alias("players"),
        (pl.col("x").is_null() | pl.col("y").is_null()
         | ~pl.col("x").is_finite() | ~pl.col("y").is_finite()).sum().alias("invalid_xy"),
        pl.col("pff_role").is_null().sum().alias("missing_role"),
    ).sort("playId", "frameId")
    frame_checks = {p[0]: f for p, f in checks.partition_by("playId", as_dict=True).items()}
    play_meta = {r["playId"]: r for r in plays.filter(pl.col("gameId") == game_id).iter_rows(named=True)}
    policies = {}; event_audit = []
    for play_id in sorted(t["playId"].unique().to_list()):
        e = event_map.get(play_id, {})
        primary = e.get("pass_forward", [])
        auto = e.get("autoevent_passforward", [])
        snap, snap_source = choose_event(e.get("ball_snap", []), e.get("autoevent_ballsnap", []))
        release, release_source = choose_event(primary, auto)
        meta = play_meta.get(play_id, {})
        event_audit.append({"gameId": game_id, "playId": play_id,
                            "passResult": meta.get("passResult"), "snap": snap,
                            "snap_source": snap_source, "primary_release": primary,
                            "automatic_release": auto, "release": release,
                            "release_source": release_source,
                            "auto_minus_primary_frames": auto[0] - primary[0]
                            if len(primary) == len(auto) == 1 else None})
        if meta.get("passResult") not in ["C", "I", "IN"]:
            diagnostics["exclusions"]["non_pass_outcome"] += 1
            continue
        if play_id in invalid_timing_plays:
            diagnostics["exclusions"]["inconsistent_timestamp_cadence"] += 1
            continue
        if meta.get("absoluteYardlineNumber") is None:
            diagnostics["exclusions"]["missing_line_of_scrimmage"] += 1
            continue
        if snap is None or release is None or release < snap:
            diagnostics["exclusions"]["missing_ambiguous_or_unordered_events"] += 1
            continue
        alternate = auto[0] if len(auto) == 1 else release
        end = max(release, alternate)
        f = frame_checks[play_id].filter(pl.col("frameId").is_between(snap, end))
        if f.height != end - snap + 1 or not f.filter(
            (pl.col("defenders") != 11) | (pl.col("offense") != 11)
            | (pl.col("players") != 22) | (pl.col("invalid_xy") > 0)
            | (pl.col("missing_role") > 0)
        ).is_empty():
            diagnostics["exclusions"]["incomplete_players_frames_or_metadata"] += 1
            continue
        directions = t.filter(pl.col("playId") == play_id)["playDirection"].unique().to_list()
        if len(directions) != 1 or directions[0] not in ["left", "right"]:
            diagnostics["exclusions"]["invalid_direction"] += 1
            continue
        policies[play_id] = {"snap": snap, "release": release, "release_source": release_source,
                             "alternate_release": alternate, "snap_source": snap_source}
    diagnostics["eligible_pass_segments"] = len(policies)
    if not policies:
        return [], [], diagnostics, event_audit
    j = j.filter(pl.col("playId").is_in(list(policies)))
    route_filter = ((pl.col("pff_role").str.to_lowercase() == "pass route")
                    & pl.col("officialPosition").is_in(["WR", "TE", "RB"])
                    & (pl.col("team") == pl.col("possessionTeam")))
    metadata_cols = KEY + ["displayName", "officialPosition", "pff_positionLinedUp",
                           "pff_passCoverage", "pff_passCoverageType", "possessionTeam",
                           "week", "passResult", "playDescription", "absoluteYardlineNumber"]
    metadata = j.filter(route_filter).select(metadata_cols).unique()
    metadata_map = {tuple(r[k] for k in KEY): r for r in metadata.iter_rows(named=True)}
    receivers = j.filter(route_filter).select(
        *KEY, "frameId", "x", "y", "playDirection", "absoluteYardlineNumber")
    defenders = j.filter(pl.col("team") == pl.col("defensiveTeam")).select(
        "gameId", "playId", "frameId", pl.col("nflId").alias("defenderId"),
        pl.col("x").alias("dx"), pl.col("y").alias("dy"))
    d = separation(receivers, defenders).with_columns(
        pl.when(pl.col("playDirection") == "right")
        .then(pl.col("x") - pl.col("absoluteYardlineNumber"))
        .otherwise(pl.col("absoluteYardlineNumber") - pl.col("x")).alias("downfield_yards")
    ).sort(KEY + ["frameId"])
    processed.mkdir(parents=True, exist_ok=True)
    d.write_parquet(processed / f"separation_{game_id}.parquet")
    routes, alternate_routes = [], []
    for key, part in d.partition_by(KEY, as_dict=True).items():
        metadata = metadata_map[key]
        policy = policies[metadata["playId"]]
        rows = part.to_dicts()
        result, reason = summarize_route(rows, metadata, policy)
        if result is None:
            diagnostics["exclusions"][reason] += 1
            continue
        routes.append(result)
        alt, alt_reason = summarize_route(rows, metadata, {**policy, "release": policy["alternate_release"]})
        if alt is not None:
            alternate_routes.append(alt)
        elif alt_reason:
            diagnostics["exclusions"]["alternate_" + alt_reason] += 1
    diagnostics["eligible_routes"] = len(routes)
    return routes, alternate_routes, diagnostics, event_audit


def rate_summary(routes, threshold=2.0, sustained_col=None, resamples=2000):
    suffix = str(threshold).replace(".", "_")
    col = sustained_col or f"sustained_{suffix}"
    closed = routes.filter(pl.col("release_separation") <= threshold)
    totals = closed.group_by("gameId").agg(pl.len().alias("n"), pl.col(col).sum().alias("k"))
    rng = np.random.default_rng(SEED)
    n, k = totals["n"].to_numpy(), totals["k"].to_numpy()
    if len(n) < 2:
        ci = [None, None]
    else:
        samples = rng.integers(0, len(n), size=(resamples, len(n)))
        bootstrap = k[samples].sum(axis=1) / n[samples].sum(axis=1)
        ci = np.quantile(bootstrap, [0.025, 0.975]).tolist()
    return {"threshold_yards": threshold, "routes": routes.height,
            "closed_at_release_routes": closed.height,
            "earlier_sustained_routes": int(closed[col].sum()),
            "fraction": float(closed[col].mean()) if closed.height else None,
            "game_bootstrap_95_percent_interval": ci,
            "games": totals.height,
            "closed_at_release_plays": closed.select("gameId", "playId").unique().height}


def select_pair(routes):
    """Same receiver, game, alignment and coverage; similar endpoints, timing and start."""
    pool = routes.filter((pl.col("release_separation") <= 2)
                         & (pl.col("alignment") != "Other"))
    groups = ["gameId", "nflId", "alignment", "pff_passCoverage"]
    earlier = pool.filter(pl.col("sustained_2_0"))
    never = pool.filter(~pl.col("sustained_2_0"))
    pairs = earlier.join(never, on=groups, suffix="_b").filter(
        (pl.col("playId") != pl.col("playId_b"))
        & ((pl.col("release_separation") - pl.col("release_separation_b")).abs() <= 0.15)
        & ((pl.col("initial_separation") - pl.col("initial_separation_b")).abs() <= 0.5)
        & ((pl.col("observed_seconds") - pl.col("observed_seconds_b")).abs() <= 0.3)
    ).with_columns((pl.col("longest_2_0") - pl.col("longest_2_0_b")).alias("history_gap"))
    if pairs.is_empty():
        return {"matching_pairs": 0, "examples": []}
    best = pairs.sort(["history_gap", "gameId", "playId", "playId_b", "nflId"],
                      descending=[True, False, False, False, False]).row(0, named=True)
    return {"matching_pairs": pairs.height,
            "selection_rule": "Largest history gap within pre-specified tight matching tolerances",
            "release_tolerance_yards": 0.15, "initial_tolerance_yards": 0.5,
            "throw_time_tolerance_seconds": 0.3,
            "examples": [
                {"gameId": best["gameId"], "playId": best["playId"], "nflId": best["nflId"]},
                {"gameId": best["gameId"], "playId": best["playId_b"], "nflId": best["nflId"]},
            ]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=ROOT / "data/raw")
    parser.add_argument("--output", type=Path, default=ROOT / "outputs/multigame")
    parser.add_argument("--processed", type=Path, default=ROOT / "data/processed")
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--limit-games", type=int)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((ROOT / "data/multigame_manifest.json").read_text())
    verify_inputs(manifest, args.raw, args.fetch)
    plays = read_csv(args.raw, "plays.csv")
    players = read_csv(args.raw, "players.csv").select("nflId", "displayName", "officialPosition")
    scouting = read_csv(args.raw, "pffScoutingData.csv").select(*KEY, "pff_role", "pff_positionLinedUp")
    games = read_csv(args.raw, "games.csv").select("gameId", "week", "homeTeamAbbr", "visitorTeamAbbr")
    for table, keys in [(plays, ["gameId", "playId"]), (players, ["nflId"]),
                        (scouting, KEY), (games, ["gameId"])]:
        if duplicates(table, keys):
            raise ValueError(f"Duplicate metadata keys: {keys}")
    game_ids = sorted(int(Path(f["path"]).stem.split("_")[1]) for f in manifest["files"]
                      if f["path"].startswith("data/tracking/"))
    if args.limit_games:
        game_ids = game_ids[:args.limit_games]
    all_routes, all_alternates, audits, events = [], [], [], []
    for index, game_id in enumerate(game_ids, 1):
        routes, alternates, audit, event = process_game(
            game_id, args.raw, plays, players, scouting, games, args.processed)
        all_routes.extend(routes); all_alternates.extend(alternates)
        audits.append(audit); events.extend(event)
        print(f"{index}/{len(game_ids)} games; {len(all_routes)} eligible routes", flush=True)
    routes = pl.DataFrame(all_routes).sort(KEY)
    alternates = pl.DataFrame(all_alternates).sort(KEY)
    routes.write_parquet(args.output / "routes.parquet")
    routes.write_csv(args.output / "routes.csv")
    alternates.write_parquet(args.output / "alternate_event_routes.parquet")
    primary_comparison = routes.join(alternates.select(*KEY, "sustained_2_0", "release_separation"),
                                     on=KEY, suffix="_alternate")
    event_shifts = [e["auto_minus_primary_frames"] for e in events
                    if e["auto_minus_primary_frames"] is not None]
    summaries = []
    for group, part in routes.partition_by(["alignment", "pff_passCoverage"], as_dict=True).items():
        if part.height < 30:
            continue
        summaries.append({"alignment": group[0], "coverage": group[1],
                          **rate_summary(part)})
    # Common-cohort comparison isolates event choice from route attrition.
    common_primary = routes.join(alternates.select(KEY), on=KEY, how="semi")
    exclusions = Counter()
    for a in audits:
        exclusions.update(a["exclusions"])
    result = {
        "source_commit": manifest["commit"], "games_requested": len(game_ids),
        "games_analyzed": routes["gameId"].n_unique(), "eligible_routes": routes.height,
        "eligible_plays": routes.select("gameId", "playId").unique().height,
        "weeks": sorted(routes["week"].unique().to_list()),
        "definition": {
            "event_policy": "Unique primary release; unique automatic fallback only when absent; C/I/IN only",
            "alternate_policy": "Automatic release when unique, else primary-preferred",
            "history_start_seconds": 1.0, "history_ends_seconds_before_release": 0.3,
            "minimum_downfield_yards": 2.0, "minimum_observation_seconds": 1.8,
            "sustained_minimum_endpoint_span_seconds": 0.5,
            "main_threshold_yards": 2.0, "strict_threshold": True,
            "uncertainty": "2000 whole-game cluster bootstrap resamples, seed 20261021",
            "position_filter": ["WR", "TE", "RB"],
        },
        "main": rate_summary(routes),
        "threshold_sensitivity": [rate_summary(routes, t) for t in THRESHOLDS],
        "late_start_sensitivity": rate_summary(routes, sustained_col="sustained_late_start"),
        "deeper_sensitivity": rate_summary(routes, sustained_col="sustained_deeper"),
        "initially_close_sensitivity": rate_summary(routes.filter(~pl.col("initially_above_2"))),
        "week_sensitivity": [{"week": w, **rate_summary(routes.filter(pl.col("week") == w))}
                             for w in sorted(routes["week"].unique().to_list())],
        "event_sensitivity": {"common_cohort_primary": rate_summary(common_primary),
                              "common_cohort_alternate": rate_summary(alternates),
                              "sustained_status_changed_routes": primary_comparison.filter(
                                  pl.col("sustained_2_0") != pl.col("sustained_2_0_alternate")).height,
                              "both_markers_plays": len(event_shifts),
                              "auto_minus_primary_frame_counts": dict(sorted(Counter(event_shifts).items())),
                              "automatic_fallback_plays": len([e for e in events
                                  if e["release_source"] == "automatic_fallback"
                                  and e["passResult"] in ["C", "I", "IN"]])},
        "alignment_coverage_groups": sorted(summaries, key=lambda r: -r["closed_at_release_routes"]),
        "pair": select_pair(routes), "exclusion_counts": dict(exclusions),
        "per_game_audit": audits,
    }
    (args.output / "analysis.json").write_text(json.dumps(result, indent=2) + "\n")
    (args.output / "event_audit.json").write_text(json.dumps(events, indent=2) + "\n")
    print(json.dumps({k: result[k] for k in ["games_analyzed", "eligible_routes", "main", "pair"]}, indent=2))


if __name__ == "__main__":
    main()
