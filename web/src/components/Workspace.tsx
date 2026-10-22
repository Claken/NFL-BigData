import TeamLogo from "./TeamLogo";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Expand,
  Focus,
  Layers,
  Pause,
  Play as PlayIcon,
  RotateCcw,
  SkipBack,
  SkipForward,
  Info,
} from "lucide-react";
import type { Play, Replay } from "../lib/types";
import { teamNames } from "../lib/data";
import { fullTeamNames } from "../lib/teamNames";
import {
  canProject,
  endTime,
  frameAt,
  projectionAt,
  recordedFrames,
} from "../lib/replay";
import { Button, Modal } from "./ui";
import Field from "./Field";
import Inspector from "./Inspector";
import Timeline from "./Timeline";
export default function Workspace({
  replay,
  play,
  saved,
  onSave,
  onSelect,
  onPrevious,
  onNext,
  position,
  total,
}: {
  replay: Replay;
  play: Play;
  saved: boolean;
  onSave: () => void;
  onSelect: (id: string) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  position: number;
  total: number;
}) {
  const [time, setTime] = useState(
    replay.frames[replay.review_cue.review_frame_index].t,
  );
  const [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [full, setFull] = useState(false),
    [trails, setTrails] = useState(true),
    [projectionEnabled, setProjectionEnabled] = useState(false),
    [guide, setGuide] = useState(false);
  const frames = useMemo(() => recordedFrames(replay), [replay]);
  const last = frames.at(-1)!.t,
    end = projectionEnabled ? endTime(replay) : last,
    release = replay.route.observed_seconds;
  const frame = useMemo(
    () => frameAt(replay, time, frames),
    [replay, time, frames],
  );
  const projection = projectionAt(replay, time);
  const phase = projection
    ? "Projection"
    : time >= release
      ? "After the throw"
      : "Recorded tracking";
  const cue = replay.third_down_review,
    c = cue.context;
  const seek = useCallback(
    (value: number) => {
      setPlaying(false);
      setTime(Math.max(0, Math.min(end, value)));
    },
    [end],
  );
  useEffect(() => {
    if (!playing) return;
    let handle = 0,
      previous: number | null = null;
    const tick = (now: number) => {
      if (previous !== null) {
        const elapsed = Math.min(now - previous, 100) / 1000;
        setTime((t) => Math.min(end, t + elapsed * speed));
      }
      previous = now;
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, speed, end]);
  useEffect(() => {
    if (time >= end) setPlaying(false);
  }, [time, end]);
  const toggle = () => {
    if (time >= end) setTime(0);
    setPlaying((value) => !value);
  };
  return (
    <div className="study-view" data-replay-id={replay.id}>
      <div className="study-main">
        <header className="match-header">
          <div>
            <div className="match-kicker">
              <span>WEEK {cue.week}</span>
              <span className="separator">/</span> PLAY {cue.playId}
            </div>
            <h1>
              <span className="team-name-full">
                {fullTeamNames[c.away_team] || c.away_team}
              </span>
              <span className="team-name-short">
                {teamNames[c.away_team] || c.away_team}
              </span>
              <span className="versus">{" vs "}</span>
              <span className="team-name-full">
                {fullTeamNames[c.home_team] || c.home_team}
              </span>
              <span className="team-name-short">
                {teamNames[c.home_team] || c.home_team}
              </span>
            </h1>
            <span className="result-tag">{cue.outcome.label}</span>
          </div>
          <Button
            variant="ghost"
            className={`save-button ${saved ? "is-saved" : ""}`}
            onClick={onSave}
            aria-label={saved ? "Remove saved play" : "Save play"}
            aria-pressed={saved}
          >
            <Bookmark size={19} fill={saved ? "currentColor" : "none"} />
            <span>{saved ? "Saved" : "Save play"}</span>
          </Button>
        </header>
        <section
          className="scoreboard"
          aria-label="Score and game clock at this play"
        >
          <div className="scoreboard-team">
            <span className="scoreboard-identity">
              <TeamLogo team={c.away_team} />
              {c.away_team}
            </span>
            <strong>{c.away_score}</strong>
          </div>
          <div className="scoreboard-clock">
            <span>Q{c.quarter}</span>
            <strong>{c.game_clock}</strong>
          </div>
          <div className="scoreboard-team scoreboard-team--home">
            <span className="scoreboard-identity">
              <TeamLogo team={c.home_team} />
              {c.home_team}
            </span>
            <strong>{c.home_score}</strong>
          </div>
        </section>
        <div className="receiver-bar">
          <span>Study receiver</span>
          <div className="receiver-options" aria-label="Receivers on this play">
            {play.cues.map((receiver) => (
              <button
                key={receiver.replay_id}
                aria-pressed={receiver.replay_id === replay.id}
                onClick={() => onSelect(receiver.replay_id)}
              >
                {receiver.displayName}
                <span>{receiver.officialPosition}</span>
              </button>
            ))}
          </div>
        </div>
        <section className="replay-deck" aria-label="Play replay">
          <div className="deck-toolbar">
            <div className="down-marker">
              <strong>
                3<small>RD</small> & {cue.yards_to_go}
              </strong>
              <span>{cue.possessionTeam} possession</span>
            </div>
            <div className="field-tools">
              <Button
                variant="ghost"
                aria-pressed={trails}
                onClick={() => setTrails(!trails)}
                aria-label="Show receiver trail"
              >
                <Layers size={16} />
                <span>Trail</span>
              </Button>
              <Button
                variant="ghost"
                className="camera-toggle"
                role="switch"
                aria-label="Full field view"
                aria-checked={full}
                title={full ? "Switch to fitted view" : "Switch to full field"}
                onClick={() => setFull((value) => !value)}
              >
                {full ? <Expand size={16} /> : <Focus size={16} />}
                <span>View: {full ? "Full field" : "Fit"}</span>
              </Button>
            </div>
          </div>
          <div className="field-stage">
            <div className="field-topline">
              <span
                className={`tracking-status ${projection ? "is-projected" : ""}`}
              >
                <i />
                {phase}
              </span>
              <span>
                OFFENSE <ArrowRight size={13} />
              </span>
            </div>
            <Field
              replay={replay}
              frame={frame}
              time={time}
              full={full}
              trails={trails}
              projectionEnabled={projectionEnabled}
            />
            <div className="field-bottomline">
              <div className="field-legend">
                <span>
                  <i className="legend-receiver" />
                  Receiver
                </span>
                <span>
                  <i className="legend-radius" />2 yd radius
                </span>
                <span>
                  <i className="legend-offense" />
                  Offense
                </span>
                <span>
                  <i className="legend-defense" />
                  Defense
                </span>
                <span>
                  <i className="legend-ball" />
                  Ball
                </span>
              </div>
              <span className="sample-label">10 Hz tracking</span>
            </div>
          </div>
          <div className="transport">
            <label className="projection-option">
              <input
                type="checkbox"
                checked={projectionEnabled}
                disabled={!canProject(replay)}
                onChange={(event) => {
                  setProjectionEnabled(event.target.checked);
                  setPlaying(false);
                  setTime((value) => Math.min(value, last));
                }}
              />
              <span>
                Illustrative projection{" "}
                <small>
                  {canProject(replay)
                    ? "Assumed motion, not the actual outcome"
                    : "Unavailable for this play"}
                </small>
              </span>
            </label>
            <div className="scrubber-labels">
              <span>Snap</span>
              <button
                className="jump-throw"
                aria-label="Play after the throw"
                onClick={() => {
                  setTime(release);
                  setPlaying(true);
                }}
              >
                Throw <b>{release.toFixed(1)}s</b>
              </button>
              <span>{projectionEnabled ? "Projection" : "Tracking ends"}</span>
            </div>
            <div
              className="scrubber"
              style={
                {
                  "--recorded": `${(last / end) * 100}%`,
                  "--progress": `${(time / end) * 100}%`,
                } as React.CSSProperties
              }
            >
              <input
                aria-label="Replay time"
                aria-valuetext={`${time.toFixed(1)} seconds, ${phase}`}
                type="range"
                min="0"
                max={end}
                step="0.01"
                value={time}
                onChange={(e) => seek(Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    seek(time + (e.key === "ArrowRight" ? 0.1 : -0.1));
                  }
                }}
              />
            </div>
            <div className="transport-bottom">
              <div className="playback-buttons">
                <Button
                  variant="ghost"
                  className="icon-button restart"
                  aria-label="Restart replay"
                  onClick={() => seek(0)}
                >
                  <RotateCcw size={17} />
                </Button>
                <Button
                  variant="ghost"
                  className="icon-button"
                  aria-label="Step back one frame"
                  onClick={() => seek(time - 0.1)}
                >
                  <SkipBack size={17} />
                </Button>
                <Button
                  variant="primary"
                  className="play-button"
                  aria-label={playing ? "Pause replay" : "Play replay"}
                  onClick={toggle}
                >
                  {playing ? (
                    <Pause size={18} fill="currentColor" />
                  ) : (
                    <PlayIcon size={18} fill="currentColor" />
                  )}
                  <span>{playing ? "Pause" : "Play"}</span>
                </Button>
                <Button
                  variant="ghost"
                  className="icon-button"
                  aria-label="Step forward one frame"
                  onClick={() => seek(time + 0.1)}
                >
                  <SkipForward size={17} />
                </Button>
                <output className="replay-clock" aria-label="Replay position">
                  {time.toFixed(1)}
                  <span> / {end.toFixed(1)}s</span>
                </output>
              </div>
              <label className="speed-select">
                <span className="sr-only">Playback speed</span>
                <select
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                >
                  <option value="0.5">0.5×</option>
                  <option value="1">1×</option>
                  <option value="2">2×</option>
                </select>
              </label>
            </div>
          </div>
        </section>
        <div className="phase-note">
          <Info size={15} />
          <p>
            {projection
              ? "Dotted motion is an assumed continuation, not a landing prediction."
              : time >= release
                ? canProject(replay)
                  ? projectionEnabled
                    ? "Brief recorded ball flight. Playback continues into an illustrative projection."
                    : "Playback stops at the last recorded frame. Enable projection to explore assumed motion."
                  : "Recorded tracking ends here. A motion projection is unavailable for this play."
                : "Solid paths show recorded positions. Use the timeline to inspect the play."}
          </p>
          <button onClick={() => setGuide(true)}>Replay guide</button>
        </div>
        <section className="timeline-panel" aria-labelledby="spacing-title">
          <div className="panel-heading">
            <h2 id="spacing-title">Receiver separation</h2>
            <span>
              <i className="window-key" />
              Qualifying window
            </span>
          </div>
          <Timeline replay={replay} time={time} onSeek={seek} />
          <div className="timeline-caption">
            <span>Recorded distance to nearest defender · yards</span>
            <span className="current-gap">
              {projection
                ? `${frames.at(-1)!.separation.toFixed(1)} yd at tracking end`
                : `${frame.separation.toFixed(1)} yd at this moment`}
            </span>
          </div>
        </section>
        <footer className="study-footer">
          <span className="mono">
            PLAY {String(position + 1).padStart(2, "0")} / {total}
          </span>
          <div>
            <Button variant="ghost" disabled={!onPrevious} onClick={onPrevious}>
              <ChevronLeft size={16} />
              Previous
            </Button>
            <Button variant="ghost" disabled={!onNext} onClick={onNext}>
              Next play
              <ChevronRight size={16} />
            </Button>
          </div>
        </footer>
      </div>
      <Inspector replay={replay} time={time} onSeek={seek} />
      <Modal
        open={guide}
        onOpenChange={setGuide}
        title="Read the replay"
        description="Recorded positions and illustrative motion share one timeline."
      >
        <div className="guide-content">
          <section>
            <h3>Solid means recorded</h3>
            <p>
              The field shows all 22 players and the ball. Orange highlights the
              selected receiver; the yellow dashed line marks the line to gain
              for a first down. The ball is gold and the thrower has a gold
              ring.
            </p>
          </section>
          <section>
            <h3>Receiver and distance ring</h3>
            <p>
              The filled orange marker identifies the selected receiver. The
              thin orange circle marks a 2-yard radius around that receiver,
              matching the distance threshold used to screen review moments. It
              is not a catch radius or a guarantee that the receiver is open.
            </p>
          </section>
          <section>
            <h3>Dotted means projected</h3>
            <p>
              Playback stops after {last.toFixed(1)} seconds of recorded
              tracking by default.{" "}
              {canProject(replay)
                ? `Enable Illustrative projection to explore ${Math.max(0, endTime(replay) - last).toFixed(1)} more seconds of assumed straight ball and receiver motion. This does not show the actual catch or outcome. Other players stay at their last recorded positions.`
                : replay.post_release.projection_unavailable}
            </p>
            <p>
              The cone sweeps assumed ball paths with ±
              {replay.post_release.assumptions.speed_fraction * 100}% speed and
              ±{replay.post_release.assumptions.heading_degrees}° direction. It
              is not a confidence region or a landing prediction. Ball height,
              landing time, drag and receiver turns are unknown.
            </p>
          </section>
          <section>
            <h3>Move through the play</h3>
            <p>
              Focus the replay slider, then use <kbd>←</kbd> <kbd>→</kbd> to
              step one frame. <kbd>Home</kbd> returns to the snap;{" "}
              <kbd>End</kbd> goes to the last recorded frame, or the end of the
              projection when enabled. Choose an analysis moment to jump to its
              timestamp.
            </p>
          </section>
        </div>
      </Modal>
    </div>
  );
}
