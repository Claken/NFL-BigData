import importlib.util
from pathlib import Path

import polars as pl
import pytest

spec = importlib.util.spec_from_file_location(
    "audit", Path(__file__).resolve().parents[1] / "scripts/audit.py"
)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


@pytest.mark.parametrize(
    "frames,distances,expected",
    [
        ([1, 2, 3], [1.0, 2.0, 1.0], []),  # equality is not above threshold
        ([1, 2, 3], [3.0, 3.0, 3.0], [(1, 3, 0.2)]),
        ([1, 2, 4, 5], [3.0] * 4, [(1, 2, 0.1), (4, 5, 0.1)]),
        ([1, 2, 3], [3.0, 1.0, 3.0], [(1, 1, 0.0), (3, 3, 0.0)]),
        ([1, 2, 3], [3.0, float("nan"), 3.0], [(1, 1, 0.0), (3, 3, 0.0)]),
        ([], [], []),
    ],
)
def test_window_boundaries(frames, distances, expected):
    result = audit.windows(frames, distances)
    assert [(w["start_frame"], w["end_frame"], w["duration_seconds"]) for w in result] == expected


def test_nearest_defender_changes_ties_and_play_game_isolation():
    receiver = pl.DataFrame({
        "gameId": [1, 1], "playId": [1, 1], "nflId": [7, 7],
        "frameId": [1, 2], "x": [0.0, 0.0], "y": [0.0, 0.0],
    })
    defenders = pl.DataFrame({
        "gameId": [1, 1, 1, 1, 1, 2], "playId": [1, 1, 1, 1, 2, 1],
        "frameId": [1, 1, 2, 2, 1, 1], "defenderId": [9, 8, 9, 8, 1, 2],
        "dx": [3.0, -3.0, 0.0, 6.0, 0.0, 0.0],
        "dy": [4.0, -4.0, 2.0, 8.0, 0.0, 0.0],
    })
    result = audit.separation(receiver, defenders)
    assert result["defenderId"].to_list() == [8, 9]
    assert result["separation_yards"].to_list() == [5.0, 2.0]


def test_coordinate_rotation_preserves_distance_and_is_reversible():
    import math

    left_a = audit.normalize(12.0, 10.0, "left")
    left_b = audit.normalize(15.0, 14.0, "left")
    assert math.dist(left_a, left_b) == pytest.approx(5)
    assert audit.normalize(*left_a, "left") == pytest.approx((12.0, 10.0))
