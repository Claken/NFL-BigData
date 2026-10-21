"""Conservative failed-third-down film cues, derived from the full eligible cohort."""

import math
import random

import polars as pl
from analyze import KEY, history_metrics
from audit import normalize


def failed_third_down(play):
    """Exclude penalties and ambiguous possession/scoring outcomes."""
    distance, gain = play.get("yardsToGo"), play.get("playResult")
    if play.get("down") != 3 or not isinstance(distance, (int, float)) or not math.isfinite(distance) or distance <= 0:
        return None
    description = (play.get("playDescription") or "").upper()
    if any(word in description for word in ["PENALTY", "NO PLAY", "FUMB", "TOUCHDOWN", "SAFETY"]):
        return None
    if play.get("penaltyYards") not in (None, 0) or any(play.get(f"foulName{i}") for i in range(1, 4)):
        return None
    result = play.get("passResult")
    if result == "IN":
        return {"label": "Intercepted", "detail": "Turnover · opponent gets the ball", "yards_gained": None}
    if not isinstance(gain, (int, float)) or not math.isfinite(gain) or gain >= distance:
        return None
    if result == "I" and gain == 0:
        return {"label": "Incomplete", "detail": "0 yards gained · no first down", "yards_gained": 0}
    if result == "C":
        return {"label": f"Completed · {gain:g} yd", "detail": f"{distance - gain:g} {'yard' if distance - gain == 1 else 'yards'} short · no first down",
                "yards_gained": gain}
    return None


FEATURED_PLAY = (2021092601, 3345)
SAMPLE_SEED = 20261021


def pressure_flags(scouting):
    """Only defensive-role flags apply; offensive nulls are not missing pressure data."""
    defense = scouting.filter(pl.col("pff_role").is_in(["Coverage", "Pass Rush"]))
    flags = defense.group_by("gameId", "playId").agg([
        pl.when(pl.col(field).max() == 1).then(1)
        .when((pl.col("nflId").n_unique() != 11) | pl.col(field).is_null().any())
        .then(None).otherwise(0).alias(field) for field in ["pff_hurry", "pff_hit"]
    ])
    return {(p["gameId"], p["playId"]): p for p in flags.to_dicts()}


def review_context(play, flags, game):
    """Recorded play-level context, not pressure timing or a diagnosis of failure."""
    dropback = play.get("dropBackType") or "UNKNOWN"
    group = ("scramble" if "SCRAMBLE" in dropback else "rollout" if "ROLLOUT" in dropback
             else "traditional" if dropback == "TRADITIONAL" else "other")
    hurry, hit = flags.get("pff_hurry"), flags.get("pff_hit")
    flagged = hurry == 1 or hit == 1
    pressure = ("Hurry / hit recorded" if flagged else "No hurry / hit flag recorded"
                if hurry == 0 and hit == 0 else "Hurry / hit information unavailable")
    return {"dropback_type": dropback, "dropback_group": group,
            "pressure_note": pressure, "pressure_recorded": flagged,
            "review_focus": "pressure" if flagged else "movement" if group in ("scramble", "rollout") else "timing",
            "quarter": play.get("quarter"), "game_clock": play.get("gameClock"),
            "home_team": game.get("homeTeamAbbr"), "away_team": game.get("visitorTeamAbbr"),
            "home_score": play.get("preSnapHomeScore"), "away_score": play.get("preSnapVisitorScore")}


def third_down_candidates(routes, plays, processed, limit=50):
    """Search all eligible failed thirds; sample distinct plays for offline replay.

    A cue requires >2 yd separation continuously for >=0.5 s while at/beyond
    the first-down line, 1 s after snap through 0.3 s before release. Use the first
    qualifying window, regardless of spacing at release. Include one explicit
    illustration plus a seeded sample of other plays, with every qualifying
    receiver on selected plays. Order chronologically, never by window length.
    """
    outcomes = {key: value for key, p in plays.items() if (value := failed_third_down(p))}
    failed = [r for r in routes.to_dicts() if (r["gameId"], r["playId"]) in outcomes]
    candidates, eligible = [], []
    for game in sorted({r["gameId"] for r in failed}):
        distances = pl.read_parquet(processed / f"separation_{game}.parquet")
        grouped = distances.partition_by(KEY, as_dict=True)
        for route in (r for r in failed if r["gameId"] == game):
            key = tuple(route[k] for k in KEY)
            rows = grouped[key].sort("frameId").to_dicts()
            line = normalize(route["absoluteYardlineNumber"], 0, rows[0]["playDirection"])[0]
            play = plays[(game, route["playId"])]
            distance = play["yardsToGo"]
            if line + distance >= 110 - 1e-6:
                continue  # Goal-to-go is a different objective; do not call it a new first down.
            eligible.append(route)
            history = history_metrics(rows, route["snap"], route["release"], 2,
                                      downfield_yards=max(2, distance))
            if not history["sustained"]:
                continue
            first = next(w for w in history["windows"] if w["duration_seconds"] >= 0.5)
            candidates.append({**route, "down": 3, "yards_to_go": distance,
                               "outcome": outcomes[(game, route["playId"])],
                               "conversion_window": first,
                               "conversion_windows": history["windows"],
                               "window_start_seconds": (first["start_frame"] - route["snap"]) / 10,
                               "window_end_seconds": (first["end_frame"] - route["snap"]) / 10})
    play_keys = sorted({(r["gameId"], r["playId"]) for r in candidates})
    selected = [FEATURED_PLAY] if FEATURED_PLAY in play_keys and limit > 0 else []
    others = [key for key in play_keys if key not in selected]
    selected += random.Random(SAMPLE_SEED).sample(others, min(max(0, limit - len(selected)), len(others)))
    selected = set(selected)
    packaged = [r for r in candidates if (r["gameId"], r["playId"]) in selected]
    packaged.sort(key=lambda r: (r.get("week", 0), r["gameId"], r["playId"], r["window_start_seconds"], r["nflId"]))
    return packaged, {"eligible_failed_routes": len(eligible),
                               "eligible_failed_plays": len({(r["gameId"], r["playId"]) for r in eligible}),
                       "qualifying_routes": len(candidates), "qualifying_plays": len(play_keys),
                       "packaged_routes": len(packaged), "packaged_plays": len(selected), "sample_seed": SAMPLE_SEED}
