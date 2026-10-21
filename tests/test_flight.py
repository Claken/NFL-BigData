import json
import math
import sys
from pathlib import Path

import polars as pl
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from flight import fit_motion, post_release_data

ROOT = Path(__file__).resolve().parents[1]


def test_motion_fit_uses_only_last_three_samples_and_keeps_velocity_units():
    points = [{"t": .1, "x": 999, "y": 999},
              *[{"t": t, "x": 10 + 20 * t, "y": 30 - 3 * t} for t in [.2, .3, .4]]]
    result = fit_motion(points)
    assert result["vx"] == pytest.approx(20)
    assert result["vy"] == pytest.approx(-3)
    assert result["max_fit_residual_yards"] == pytest.approx(0)


@pytest.mark.parametrize("points", [[], [{"t": 0, "x": 1, "y": 1}] * 2,
    [{"t": t, "x": 1, "y": 1} for t in [0, .1, .3]],
    [{"t": t, "x": float("nan"), "y": 1} for t in [0, .1, .2]]])
def test_motion_fit_rejects_too_few_missing_or_invalid_samples(points):
    assert fit_motion(points) is None


def fixture_tracking(direction="right"):
    rows = []
    for frame in range(2, 7):
        for player in [*range(1, 23), None]:
            rows.append({"playId": 7, "frameId": frame, "nflId": player,
                         "team": "football" if player is None else "AAA" if player <= 11 else "BBB",
                         "x": 40 + frame + (player or 0) / 10, "y": 20 + (player or 0) / 10,
                         "s": 10, "jerseyNumber": player, "playDirection": direction})
    route = {"playId": 7, "release": 2, "snap": 1, "nflId": 1,
             "absoluteYardlineNumber": 40, "possessionTeam": "AAA"}
    return route, pl.DataFrame(rows)


@pytest.mark.parametrize("direction, velocity", [("right", 10), ("left", -10)])
def test_post_release_preserves_normalized_ball_receiver_and_all_players(direction, velocity):
    route, tracking = fixture_tracking(direction)
    result = post_release_data(route, tracking, direction, {1: "Receiver"})
    assert [f["frame"] for f in result["frames"]] == [3, 4, 5, 6]
    assert result["seconds_recorded"] == .4
    assert result["projection_unavailable"] is None
    assert result["motion"]["ball"]["vx"] == pytest.approx(velocity)
    for frame in result["frames"]:
        assert len(frame["players"]) == 23
        receiver = next(p for p in frame["players"] if p["id"] == 1)
        nearest = next(p for p in frame["players"] if p["id"] == frame["nearest"])
        assert frame["separation"] == pytest.approx(math.dist((receiver["x"], receiver["y"]),
                                                              (nearest["x"], nearest["y"])))


def test_incomplete_frame_stops_playback_without_bridging_a_gap_or_inventing_a_projection():
    route, tracking = fixture_tracking()
    tracking = tracking.filter(~((pl.col("frameId") == 5) & (pl.col("nflId") == 22)))
    result = post_release_data(route, tracking, "right", {})
    assert [f["frame"] for f in result["frames"]] == [3, 4]
    assert result["seconds_recorded"] == .2
    assert result["projection_unavailable"] is not None
    assert result["tracking_note"] is not None


def test_packaged_post_release_frames_are_measured_and_separate_from_screening_frames():
    data = json.loads((ROOT / "outputs/multigame/replay_data.json").read_text())
    for replay in data["replays"]:
        post = replay["post_release"]
        release = replay["route"]["release"]
        assert replay["frames"][-1]["frame"] == release
        assert replay["review_cue"]["throw_frame_index"] == len(replay["frames"]) - 1
        assert [f["frame"] for f in post["frames"]] == list(range(release + 1, release + len(post["frames"]) + 1))
        for frame in post["frames"]:
            assert len(frame["players"]) == 23
            assert len({p["id"] for p in frame["players"] if p["side"] != "ball"}) == 22
            assert sum(p["side"] == "ball" for p in frame["players"]) == 1
            assert frame["t"] > replay["route"]["observed_seconds"]
        if post["projection_unavailable"] is None:
            assert len(post["frames"]) >= 3
            assert all(math.isfinite(post["motion"][name][axis]) for name in ("ball", "receiver") for axis in ("vx", "vy"))


def test_post_release_positions_match_raw_tracking_when_available():
    data = json.loads((ROOT / "outputs/multigame/replay_data.json").read_text())
    games = {r["route"]["gameId"] for r in data["replays"]}
    paths = {g: ROOT / f"data/raw/data/tracking/tracking_{g}.csv" for g in games}
    if any(not p.exists() for p in paths.values()):
        pytest.skip("Raw tracking is optional; fetch source data to run position crosschecks")
    cached = {}
    for replay in data["replays"]:
        game, play = replay["route"]["gameId"], replay["route"]["playId"]
        if game not in cached:
            cached[game] = pl.read_csv(paths[game], null_values=["NA", "None"], infer_schema_length=10000)
        tracking = cached[game].filter(pl.col("playId") == play)
        for frame in replay["post_release"]["frames"]:
            raw = {p["nflId"]: p for p in tracking.filter(pl.col("frameId") == frame["frame"]).to_dicts()}
            for player in frame["players"]:
                source = raw[player["id"]]
                x, y = source["x"], source["y"]
                if source["playDirection"] == "left":
                    x, y = 120 - x, 160 / 3 - y
                assert player["x"] == pytest.approx(x, abs=.000501)
                assert player["y"] == pytest.approx(y, abs=.000501)
