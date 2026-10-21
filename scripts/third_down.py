"""Conservative failed-third-down film cues, derived from the full eligible cohort."""

import math

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


def third_down_candidates(routes, plays, processed, limit=50):
    """Search all eligible failed thirds, not only the old 50-route illustration queue.

    A cue requires >2 yd separation continuously for >=0.5 s while at/beyond
    the first-down line, 1 s after snap through 0.3 s before release. Keep the
    original close-at-release criterion. Rank longest windows; this is a review
    sample, not a conversion rate, missed-read label or player ranking.
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
            if route["release_separation"] > 2:
                continue
            history = history_metrics(rows, route["snap"], route["release"], 2,
                                      downfield_yards=max(2, distance))
            if not history["sustained"]:
                continue
            longest = max(history["windows"], key=lambda w: w["duration_seconds"])
            candidates.append({**route, "down": 3, "yards_to_go": distance,
                               "outcome": outcomes[(game, route["playId"])],
                               "conversion_window": longest,
                               "conversion_windows": history["windows"],
                               "window_start_seconds": (longest["start_frame"] - route["snap"]) / 10,
                               "window_end_seconds": (longest["end_frame"] - route["snap"]) / 10})
    candidates.sort(key=lambda r: (-r["conversion_window"]["duration_seconds"], *(r[k] for k in KEY)))
    return candidates[:limit], {"eligible_failed_routes": len(eligible),
                               "eligible_failed_plays": len({(r["gameId"], r["playId"]) for r in eligible}),
                               "qualifying_routes": len(candidates), "packaged_routes": min(limit, len(candidates))}
