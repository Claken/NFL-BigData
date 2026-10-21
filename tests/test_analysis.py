import sys
from pathlib import Path

import polars as pl
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import analyze


@pytest.mark.parametrize("primary,automatic,expected", [
    ([40], [38], (40, "primary")),
    ([], [38], (38, "automatic_fallback")),
    ([39, 40], [38], (None, "ambiguous_primary")),
    ([], [], (None, "missing_or_ambiguous")),
    ([], [37, 38], (None, "missing_or_ambiguous")),
])
def test_release_policy(primary, automatic, expected):
    assert analyze.choose_event(primary, automatic) == expected


def history_rows(start, stop, distance=3.0, downfield=3.0):
    return [{"frameId": f, "separation_yards": distance, "downfield_yards": downfield}
            for f in range(start, stop + 1)]


def test_alignment_and_release_exclusion():
    rows = history_rows(1, 35)
    h = analyze.history_metrics(rows, snap=1, release=35, threshold=2)
    assert h["windows"] == [{"start_frame": 11, "end_frame": 32,
                             "samples": 22, "duration_seconds": 2.1}]
    assert h["sustained"]
    assert not analyze.history_metrics(history_rows(1, 10), 1, 35, 2)["sustained"]
    assert not analyze.history_metrics(history_rows(33, 35), 1, 35, 2)["sustained"]


def test_downfield_gate_breaks_windows_and_six_samples_are_required():
    rows = history_rows(11, 21)
    rows[5]["downfield_yards"] = 1.9
    assert not analyze.history_metrics(rows, 1, 35, 2)["sustained"]
    assert analyze.history_metrics(history_rows(11, 16), 1, 35, 2)["longest"] == 0.5
    assert not analyze.history_metrics(history_rows(11, 15), 1, 35, 2)["sustained"]
    assert not analyze.history_metrics(history_rows(11, 20, distance=2), 1, 35, 2)["sustained"]


def test_timing_jump_only_excludes_affected_play():
    rows = []
    for play in [1, 2]:
        for frame in range(1, 32):
            second = (frame - 1) // 10 + (12 if play == 2 and frame >= 15 else 0)
            rows.append({"playId": play, "frameId": frame,
                         "time": f"2021-09-10T00:00:{second:02d}Z"})
    spacings, bad = analyze.timing_audit(pl.DataFrame(rows))
    assert spacings[10] >= 2
    assert bad == {2}


def test_alignment_symmetry_preserves_slot_detail():
    assert analyze.alignment("LWR") == analyze.alignment("RWR") == "Wide"
    assert analyze.alignment("SLiWR") == analyze.alignment("SRiWR") == "Slot inside"
    assert analyze.alignment("SLiWR") != analyze.alignment("SLoWR")
