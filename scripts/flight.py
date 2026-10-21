"""Recorded post-release frames and short, explicitly conditional ground-plane motion."""

import math
from itertools import pairwise

import polars as pl
from audit import normalize


def fit_motion(points):
    """Fit the last three consecutive 10 Hz positions; anchor forecasts at the last sample."""
    if len(points) < 3:
        return None
    points = points[-3:]
    if any(not math.isfinite(p[k]) for p in points for k in ("t", "x", "y")):
        return None
    if any(not math.isclose(b["t"] - a["t"], .1, abs_tol=1e-8)
           for a, b in pairwise(points)):
        return None
    times = [p["t"] - points[0]["t"] for p in points]
    mean_t = sum(times) / 3
    denominator = sum((t - mean_t) ** 2 for t in times)
    velocity = {}
    residuals = []
    for axis in ("x", "y"):
        mean = sum(p[axis] for p in points) / 3
        velocity["v" + axis] = sum((t - mean_t) * (p[axis] - mean)
                                   for t, p in zip(times, points)) / denominator
        residuals.append([p[axis] - (mean + velocity["v" + axis] * (t - mean_t))
                          for t, p in zip(times, points)])
    return {**velocity, "samples": 3, "span_seconds": .2,
            "max_fit_residual_yards": max(math.hypot(x, y) for x, y in zip(*residuals))}


def post_release_data(route, tracking, direction, names):
    """Keep complete recorded frames only, stopping at the first missing/invalid sample."""
    play = tracking.filter(pl.col("playId") == route["playId"])
    ball = play.filter(pl.col("team") == "football")
    frames = []
    reason = None
    last = ball["frameId"].max()
    for number in range(route["release"] + 1, (last or route["release"]) + 1):
        rows = play.filter(pl.col("frameId") == number).to_dicts()
        people = [p for p in rows if p["nflId"] is not None]
        balls = [p for p in rows if p["team"] == "football" and p["nflId"] is None]
        receiver = next((p for p in people if p["nflId"] == route["nflId"]), None)
        defenders = [p for p in people if p["team"] != route["possessionTeam"]]
        if (len(people) != 22 or len({p["nflId"] for p in people}) != 22
                or len(defenders) != 11 or len(balls) != 1 or receiver is None
                or any(p[k] is None or not math.isfinite(p[k]) for p in rows for k in ("x", "y"))):
            reason = "Tracking is incomplete; playback stops at the last complete frame."
            break
        players = []
        for p in rows:
            x, y = normalize(p["x"], p["y"], direction)
            players.append({"id": p["nflId"], "x": round(x, 3), "y": round(y, 3),
                            "side": "ball" if p["nflId"] is None else
                            "offense" if p["team"] == route["possessionTeam"] else "defense",
                            "label": str(p["jerseyNumber"]) if p["jerseyNumber"] else "",
                            "name": names.get(p["nflId"], "Football")})
        gap, defender = min((math.dist((receiver["x"], receiver["y"]), (p["x"], p["y"])),
                             p["nflId"]) for p in defenders)
        x, y = normalize(receiver["x"], receiver["y"], direction)
        line = normalize(route["absoluteYardlineNumber"], 0, direction)[0]
        frames.append({"frame": number, "t": (number - route["snap"]) / 10,
                       "x": x, "y": y, "downfield": x - line, "nearest": defender,
                       "separation": gap, "players": players,
                       "receiver_speed_yards_per_second": receiver["s"]})
    fits = {}
    for name, player_id in (("ball", None), ("receiver", route["nflId"])):
        points = [{"t": f["t"], **next(p for p in f["players"] if p["id"] == player_id)}
                  for f in frames]
        fits[name] = fit_motion(points)
    projection_reason = ("At least three consecutive post-release samples are needed."
                         if any(fit is None for fit in fits.values()) else
                         "The ball has no measurable direction." if
                         math.hypot(fits["ball"]["vx"], fits["ball"]["vy"]) < 1e-6 else None)
    return {"frames": frames, "motion": fits, "projection_unavailable": projection_reason,
            "tracking_note": reason, "seconds_recorded": len(frames) / 10,
            "assumptions": {"speed_fraction": .2, "heading_degrees": 15,
                            "max_seconds_after_throw": 2.0},
            "scope": "Ground-plane straight-motion scenarios, not a landing or catch prediction."}
