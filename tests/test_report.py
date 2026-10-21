import json
import math
import sys
from pathlib import Path

import polars as pl
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from audit import normalize
from report import (
    add_gap_trend,
    replay_id,
    review_candidates,
    review_cue,
    situation_data,
    speed_value,
    thrower_data,
)
from third_down import (
    FEATURED_PLAY,
    failed_third_down,
    pressure_flags,
    review_context,
    third_down_candidates,
)

ROOT = Path(__file__).resolve().parents[1]


def test_story_cue_uses_peak_inside_longest_qualifying_window_and_its_start():
    frames = [{"frame": i + 10, "t": i / 10, "downfield": 4,
               "separation": 30 if i == 0 else 8 if i == 14 else 3} for i in range(25)]
    windows = [{"start_frame": 20, "end_frame": 25, "duration_seconds": .5},
               {"start_frame": 27, "end_frame": 28, "duration_seconds": .1}]
    result = review_cue(frames, windows)
    assert result == {"has_window": True, "earlier_frame_index": 14,
                      "review_frame_index": 10, "throw_frame_index": 24}


def test_story_with_no_qualifying_window_does_not_offer_a_window_cue():
    frames = [{"frame": i + 10, "t": i / 10, "downfield": 4,
               "separation": 10 if i == 24 else 1 + i / 100} for i in range(25)]
    result = review_cue(frames, [{"start_frame": 20, "end_frame": 22,
                                  "duration_seconds": .2}])
    assert result["has_window"] is False
    assert result["review_frame_index"] == 0
    assert frames[result["earlier_frame_index"]]["t"] <= 2.1


@pytest.mark.parametrize("direction, raw_line, down, distance, expected_line, goal", [
    ("right", 40, 3, 8, 48, False),
    ("left", 80, 4, 2, 42, False),
    ("right", 105, 1, 5, 110, True),
    ("left", 15, 2, 5, 110, True),
])
def test_first_down_line_follows_offense_and_handles_goal_to_go(
        direction, raw_line, down, distance, expected_line, goal):
    line = normalize(raw_line, 0, direction)[0]
    result = situation_data(line, {"down": down, "yardsToGo": distance})
    assert result == {"down": down, "yards_to_go": distance,
                      "line_to_gain": expected_line, "goal_to_go": goal}


def test_missing_situation_is_not_invented():
    assert situation_data(50, {}) == {"down": None, "yards_to_go": None,
                                      "line_to_gain": None, "goal_to_go": None}
    assert situation_data(50, {"down": 0, "yardsToGo": -1}) == situation_data(50, {})


@pytest.mark.parametrize("value, expected", [(6.5, 6.5), (0, 0), (None, None),
                                            (float("nan"), None), (float("inf"), None), (-1, None)])
def test_recorded_speed_preserves_stopped_player_and_missing_data(value, expected):
    assert speed_value(value) == expected


@pytest.mark.parametrize("delta, trend", [(0.3, "opening"), (-0.3, "closing"),
                                         (0.06, "steady"), (-0.06, "steady")])
def test_gap_trend_is_trailing_nearest_gap_not_individual_defender_speed(delta, trend):
    frames = [{"frame": i, "separation": 2 + i * delta / 3, "nearest": i % 2}
              for i in range(4)]
    add_gap_trend(frames)
    assert all(f["gap_trend"] == "unknown" for f in frames[:3])
    assert frames[-1]["gap_change_yards_per_second"] == pytest.approx(delta / 0.3)
    assert frames[-1]["gap_trend"] == trend
    # A future observation must not change past readouts.
    before = [f.copy() for f in frames]
    frames.append({"frame": 4, "separation": 100})
    add_gap_trend(frames)
    assert frames[:4] == before


def test_gap_trend_does_not_bridge_missing_tracking_frames():
    frames = [{"frame": i, "separation": float(i)} for i in [0, 1, 3, 4]]
    add_gap_trend(frames)
    assert frames[-1]["gap_change_yards_per_second"] is None


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
        situation = replay["situation"]
        cue = replay["review_cue"]
        qualified = [w for w in replay.get("third_down_review", {}).get("conversion_windows", replay["windows"])
                     if w["duration_seconds"] >= .5]
        assert cue["has_window"] == bool(qualified)
        assert cue["throw_frame_index"] == len(frames) - 1
        if qualified:
            window = qualified[0] if "third_down_review" in replay else max(qualified, key=lambda w: w["duration_seconds"])
            assert frames[cue["review_frame_index"]]["frame"] == window["start_frame"]
            assert window["start_frame"] <= frames[cue["earlier_frame_index"]]["frame"] <= window["end_frame"]
        else:
            assert cue["review_frame_index"] == 0
        assert situation["down"] is None or 1 <= situation["down"] <= 4
        if situation["yards_to_go"] is None:
            assert situation["line_to_gain"] is None
        else:
            assert situation["yards_to_go"] > 0
            assert situation["line_to_gain"] == pytest.approx(
                min(110, replay["line_of_scrimmage"] + situation["yards_to_go"]))
        thrower = replay["thrower"]
        assert thrower is not None
        assert thrower["source"] == "pff_role: Pass"
        assert thrower["id"] != route["nflId"]
        assert [f["frame"] for f in frames] == list(range(route["snap"], route["release"] + 1))
        assert frames[-1]["t"] == route["observed_seconds"]
        assert frames[-1]["separation"] == route["release_separation"]
        assert 0 <= replay["initial_frame_index"] < len(frames)
        for frame in frames:
            assert frame["receiver_speed_yards_per_second"] is not None
            assert frame["receiver_speed_yards_per_second"] >= 0
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


@pytest.mark.parametrize("change, label", [
    ({}, "Incomplete"), ({"down": 4}, None), ({"down": 1}, None),
    ({"yardsToGo": 0}, None), ({"yardsToGo": None}, None),
    ({"passResult": "C", "playResult": 7}, "Completed · 7 yd"),
    ({"passResult": "C", "playResult": 10}, None),
    ({"passResult": "C", "playResult": -2}, "Completed · -2 yd"),
    ({"passResult": "IN", "playResult": 30}, "Intercepted"),
    ({"passResult": "S"}, None), ({"playResult": None}, None),
    ({"penaltyYards": 0, "foulName1": "Defensive Holding"}, None),
    ({"penaltyYards": 5}, None), ({"playDescription": "Incomplete. PENALTY declined."}, None),
    ({"playDescription": "Completed, FUMBLES"}, None), ({"playDescription": "No Play"}, None),
])
def test_failed_third_down_uses_actual_outcome_and_excludes_ambiguity(change, label):
    play = {"down": 3, "yardsToGo": 10, "passResult": "I", "playResult": 0,
            "playDescription": "Pass incomplete", **change}
    result = failed_third_down(play)
    assert (result["label"] if result else None) == label


@pytest.mark.parametrize("depth, gap, missing, goal, qualifies", [
    (9.99, 3, None, False, False), (10, 3, None, False, True),
    (10, 2, None, False, False), (10, 3, 13, False, False),
    (10, 3, None, True, False),
])
def test_beyond_line_window_does_not_count_space_short_of_line_or_bridge_missing_samples(
        tmp_path, depth, gap, missing, goal, qualifies):
    route = {"gameId": 1, "playId": 2, "nflId": 3, "snap": 0, "release": 18,
             "absoluteYardlineNumber": 100 if goal else 40, "release_separation": 1}
    rows = [{"gameId": 1, "playId": 2, "nflId": 3, "frameId": i,
             "playDirection": "right", "downfield_yards": depth,
             "separation_yards": gap if 10 <= i <= 15 else 1} for i in range(19) if i != missing]
    pl.DataFrame(rows).write_parquet(tmp_path / "separation_1.parquet")
    play = {"down": 3, "yardsToGo": 10, "passResult": "I", "playResult": 0}
    queue, _ = third_down_candidates(pl.DataFrame([route]), {(1, 2): play}, tmp_path)
    assert bool(queue) == qualifies
    if qualifies:
        assert queue[0]["conversion_window"]["duration_seconds"] == .5


def test_focused_queue_has_sustained_space_beyond_first_down_line_and_real_failed_results():
    from audit import read_csv

    data = json.loads((ROOT / "outputs/multigame/replay_data.json").read_text())
    replays = {r["id"]: r for r in data["replays"]}
    plays = {(p["gameId"], p["playId"]): p for p in read_csv(ROOT / "data/raw", "plays.csv").to_dicts()}
    queue = data["third_down_queue"]
    assert len(queue) == data["third_down_counts"]["packaged_routes"]
    assert len({(r["gameId"], r["playId"]) for r in queue}) == data["third_down_counts"]["packaged_plays"] == 50
    assert data["third_down_counts"]["qualifying_routes"] >= len(queue)
    assert data["featured_id"] in {r["replay_id"] for r in queue}
    assert tuple(replays[data["featured_id"]]["route"][k] for k in ["gameId", "playId"]) == FEATURED_PLAY
    order = [(r["week"], r["gameId"], r["playId"], r["window_start_seconds"], r["nflId"]) for r in queue]
    assert order == sorted(order)
    assert any(r["release_separation"] > 2 for r in queue)
    for q in queue:
        replay = replays[q["replay_id"]]
        assert q["outcome"] == failed_third_down(plays[(q["gameId"], q["playId"])])
        assert replay["situation"]["down"] == 3
        assert replay["situation"]["goal_to_go"] is False
        window = q["conversion_window"]
        frames = [f for f in replay["frames"] if window["start_frame"] <= f["frame"] <= window["end_frame"]]
        assert len(frames) >= 6
        assert [f["frame"] for f in frames] == list(range(window["start_frame"], window["end_frame"] + 1))
        assert frames[-1]["t"] - frames[0]["t"] == pytest.approx(window["duration_seconds"])
        for f in frames:
            assert f["separation"] > 2
            assert f["x"] >= replay["situation"]["line_to_gain"] - 1e-9
            assert 1 <= f["t"] <= replay["route"]["observed_seconds"] - .3 + 1e-9
        cue = replay["review_cue"]
        assert replay["frames"][cue["earlier_frame_index"]]["frame"] == window["start_frame"]


@pytest.mark.parametrize("kind, flags, group, focus, note", [
    ("TRADITIONAL", {"pff_hurry": 0, "pff_hit": 0}, "traditional", "timing", "No hurry / hit flag recorded"),
    ("TRADITIONAL", {"pff_hurry": 1, "pff_hit": 0}, "traditional", "pressure", "Hurry / hit recorded"),
    ("SCRAMBLE", {"pff_hurry": 0, "pff_hit": 0}, "scramble", "movement", "No hurry / hit flag recorded"),
    ("DESIGNED_ROLLOUT_RIGHT", {"pff_hit": 1}, "rollout", "pressure", "Hurry / hit recorded"),
    (None, {}, "other", "timing", "Hurry / hit information unavailable"),
])
def test_recorded_context_does_not_turn_missing_flags_into_a_clean_pocket(kind, flags, group, focus, note):
    context = review_context({"dropBackType": kind, "quarter": 2, "gameClock": "00:07"}, flags, {})
    assert context["dropback_group"] == group
    assert context["review_focus"] == focus
    assert context["pressure_note"] == note
    assert context["game_clock"] == "00:07"
    assert "pressure_time" not in context


def test_first_window_is_retained_and_receivers_still_separated_at_throw_are_included(tmp_path):
    routes = [{"gameId": 1, "playId": 2, "nflId": n, "snap": 0, "release": 31,
               "absoluteYardlineNumber": 40, "release_separation": 3, "week": 1} for n in [3, 4]]
    rows = [{"gameId": 1, "playId": 2, "nflId": n, "frameId": i, "playDirection": "right",
             "downfield_yards": 10, "separation_yards": 3 if 10 <= i <= 15 or i >= 18 else 1}
            for n in [3, 4] for i in range(32)]
    pl.DataFrame(rows).write_parquet(tmp_path / "separation_1.parquet")
    play = {"down": 3, "yardsToGo": 10, "passResult": "I", "playResult": 0}
    queue, counts = third_down_candidates(pl.DataFrame(routes), {(1, 2): play}, tmp_path, limit=1)
    assert counts["packaged_plays"] == 1
    assert counts["packaged_routes"] == len(queue) == 2
    assert all(r["conversion_window"]["start_frame"] == 10 for r in queue)
    assert all(r["conversion_window"]["duration_seconds"] == .5 for r in queue)
    assert queue == third_down_candidates(pl.DataFrame(routes).reverse(), {(1, 2): play}, tmp_path, limit=1)[0]


def test_pressure_flags_ignore_inapplicable_offensive_nulls_but_preserve_unknown_defensive_flags():
    rows = [{"gameId": 1, "playId": 2, "nflId": n, "pff_role": "Coverage",
             "pff_hurry": 0, "pff_hit": 0} for n in range(11)]
    rows += [{"gameId": 1, "playId": 2, "nflId": 12, "pff_role": "Pass",
              "pff_hurry": None, "pff_hit": None}]
    assert pressure_flags(pl.DataFrame(rows))[(1, 2)]["pff_hurry"] == 0
    rows[0]["pff_hurry"] = None
    assert pressure_flags(pl.DataFrame(rows))[(1, 2)]["pff_hurry"] is None
    rows[1]["pff_hurry"] = 1
    assert pressure_flags(pl.DataFrame(rows))[(1, 2)]["pff_hurry"] == 1
    assert pressure_flags(pl.DataFrame(rows[1:]))[(1, 2)]["pff_hit"] is None
