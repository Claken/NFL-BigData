import json
import math
import sys
from pathlib import Path

import polars as pl
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from report import replay_id, review_candidates, thrower_data

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("roles, expected", [
    ([(1, "Pass"), (2, "Pass Route")], 1),
    ([(1, "PASS"), (1, "Pass")], 1),
    ([(1, "Pass"), (2, "Pass")], None),
    ([(1, "Pass Block"), (2, "Pass Route")], None),
    ([(3, "Pass")], None),
])
def test_thrower_uses_unique_recorded_passing_role_and_offensive_track(roles, expected):
    scouting = pl.DataFrame([{"gameId": 10, "playId": 20, "nflId": n, "pff_role": role}
                             for n, role in roles])
    tracking = pl.DataFrame({"nflId": [1, 2, 3], "team": ["TB", "TB", "ATL"],
                             "jerseyNumber": [12, 10, 24]})
    result = thrower_data({"gameId": 10, "playId": 20, "possessionTeam": "TB"},
                          scouting, tracking, {1: "Tom Brady", 2: "Scott Miller"})
    assert (result["id"] if result else None) == expected
    if result:
        assert result["name"] == "Tom Brady"
        assert result["jersey_number"] == 12


def test_review_queue_excludes_wrong_routes_and_keeps_ties_deterministic():
    rows = [
        {"gameId": game, "playId": 12, "nflId": 3, "release_separation": 2.0,
         "sustained_2_0": True, "longest_2_0": 0.5}
        for game in [2, 1, 3]
    ]
    rows.extend([
        {"gameId": 4, "playId": 12, "nflId": 3, "release_separation": 2.01,
         "sustained_2_0": True, "longest_2_0": 10.0},
        {"gameId": 5, "playId": 12, "nflId": 3, "release_separation": 1.0,
         "sustained_2_0": False, "longest_2_0": 0.4},
    ])
    assert review_candidates(pl.DataFrame(rows), limit=2)["gameId"].to_list() == [1, 2]
    assert replay_id(rows[0]) != replay_id(rows[1])
    assert replay_id({**rows[0], "nflId": 4}) != replay_id(rows[0])


def test_packaged_queue_replays_match_endpoints_windows_and_field_geometry():
    data = json.loads((ROOT / "outputs/multigame/replay_data.json").read_text())
    replays = {r["id"]: r for r in data["replays"]}
    assert len(replays) == len(data["replays"])
    assert len(data["queue"]) == 50
    assert set(data["example_ids"]).issubset(replays)
    assert {q["replay_id"] for q in data["queue"]}.issubset(replays)
    for queued in data["queue"]:
        replay = replays[queued["replay_id"]]
        route = replay["route"]
        assert replay_id(queued) == replay_id(route) == replay["id"]
        assert queued["displayName"] == route["displayName"]
        assert queued["window_end_seconds"] - queued["window_start_seconds"] == pytest.approx(
            route["longest_2_0"])
    # Verify all displayed frames, including leftward plays, against normalized geometry.
    for replay in replays.values():
        route, frames = replay["route"], replay["frames"]
        thrower = replay["thrower"]
        assert thrower is not None
        assert thrower["source"] == "pff_role: Pass"
        assert thrower["id"] != route["nflId"]
        assert [f["frame"] for f in frames] == list(range(route["snap"], route["release"] + 1))
        assert frames[-1]["t"] == route["observed_seconds"]
        assert frames[-1]["separation"] == route["release_separation"]
        assert 0 <= replay["initial_frame_index"] < len(frames)
        for frame in frames:
            players = [p for p in frame["players"] if p["side"] != "ball"]
            assert len({p["id"] for p in players}) == 22
            passer = next(p for p in players if p["id"] == thrower["id"])
            assert passer["side"] == "offense"
            assert passer["name"] == thrower["name"]
            assert passer["label"] == str(thrower["jersey_number"])
            receiver = next(p for p in players if p["id"] == route["nflId"])
            defenders = [p for p in players if p["side"] == "defense"]
            assert len(defenders) == 11
            nearest = next(p for p in defenders if p["id"] == frame["nearest"])
            nearest_distance = math.dist((receiver["x"], receiver["y"]), (nearest["x"], nearest["y"]))
            # Player coordinates are rounded to 0.001 yd for display; metrics retain full precision.
            assert nearest_distance == pytest.approx(frame["separation"], abs=0.002)
            assert nearest_distance <= min(math.dist((receiver["x"], receiver["y"]),
                                                     (p["x"], p["y"])) for p in defenders) + 0.002
        for window in replay["windows"]:
            for frame in frames:
                if window["start_frame"] <= frame["frame"] <= window["end_frame"]:
                    assert frame["separation"] > 2
                    assert frame["downfield"] >= 2
                    assert 1 <= frame["t"] <= route["observed_seconds"] - 0.3 + 1e-9
