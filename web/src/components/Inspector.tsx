import * as Tabs from "@radix-ui/react-tabs";
import {
  ArrowUpRight,
  ArrowRight,
  Clock3,
  Copy,
  Check,
  Crosshair,
  FileText,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import type { Replay } from "../lib/types";
import { cueText } from "../lib/data";
import { Button, Modal } from "./ui";
export default function Inspector({
  replay,
  time,
  onSeek,
}: {
  replay: Replay;
  time: number;
  onSeek: (time: number) => void;
}) {
  const [copied, setCopied] = useState(false),
    [manualCopy, setManualCopy] = useState(false);
  const cue = replay.third_down_review,
    earlier = replay.frames[replay.review_cue.earlier_frame_index],
    thrown = replay.frames[replay.review_cue.throw_frame_index];
  const focus = {
    timing: "Check receiver timing",
    pressure: "Check recorded pressure",
    movement: "Check thrower movement",
  }[cue.context.review_focus];
  const question = {
    timing: "Was the passing lane available before the throw?",
    pressure: "Did the recorded hurry or hit happen before this opening?",
    movement: "Did the thrower’s movement change the available passing lane?",
  }[cue.context.review_focus];
  async function copy() {
    try {
      await navigator.clipboard.writeText(cueText(replay));
      setCopied(true);
    } catch {
      setManualCopy(true);
    }
  }
  return (
    <aside className="inspector" aria-label="Receiver analysis">
      <Tabs.Root defaultValue="analysis">
        <Tabs.List className="inspector-tabs" aria-label="Receiver information">
          <Tabs.Trigger value="analysis">Analysis</Tabs.Trigger>
          <Tabs.Trigger value="details">Play details</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="analysis" className="inspector-content">
          <div className="inspector-eyebrow">
            <Crosshair size={15} />
            <span>Selected receiver</span>
          </div>
          <div className="receiver-heading">
            <div>
              <h2>{cue.displayName}</h2>
              <p>
                {cue.officialPosition} <span>·</span> {cue.possessionTeam}{" "}
                <span>·</span> {cue.alignment} alignment
              </p>
            </div>
            <span className="jersey-number">
              {earlier.players.find((p) => p.id === cue.nflId)?.label}
            </span>
          </div>
          <div className="compare-heading">
            <span>Compare the moments</span>
            <span className="mono">YARDS</span>
          </div>
          <div className="moment-comparison">
            <button
              className={`moment ${Math.abs(time - earlier.t) < 0.05 ? "is-active" : ""}`}
              onClick={() => onSeek(earlier.t)}
              aria-pressed={Math.abs(time - earlier.t) < 0.05}
            >
              <span>
                Earlier opening <ArrowUpRight size={15} />
              </span>
              <strong>
                {earlier.separation.toFixed(1)}
                <small>yd</small>
              </strong>
              <span className="moment-time">
                <Clock3 size={12} />
                {earlier.t.toFixed(1)}s after snap
              </span>
            </button>
            <button
              className={`moment ${Math.abs(time - thrown.t) < 0.05 ? "is-active" : ""}`}
              onClick={() => onSeek(thrown.t)}
              aria-pressed={Math.abs(time - thrown.t) < 0.05}
            >
              <span>
                At the throw <ArrowUpRight size={15} />
              </span>
              <strong>
                {thrown.separation.toFixed(1)}
                <small>yd</small>
              </strong>
              <span className="moment-time">
                <Clock3 size={12} />
                {thrown.t.toFixed(1)}s after snap
              </span>
            </button>
          </div>
          <div className="window-stat">
            <span className="window-icon">
              <Clock3 size={17} />
            </span>
            <p>
              <strong>
                {cue.conversion_window.duration_seconds.toFixed(1)}s sustained
                window
              </strong>
              <span>Beyond the line with &gt;2 yd of space.</span>
            </p>
          </div>
          <section className="film-cue">
            <span className="eyebrow">Your next question</span>
            <h3>{focus}</h3>
            <p>{question}</p>
            <Button onClick={() => onSeek(earlier.t)}>
              Inspect {earlier.t.toFixed(1)}s <ArrowRight size={16} />
            </Button>
          </section>
          <div className="context-alert">
            <ShieldAlert size={17} />
            <p>
              <strong>
                {cue.context.pressure_recorded
                  ? "Pressure flag recorded"
                  : "No pressure flag recorded"}
              </strong>
              <span>
                {cue.context.pressure_recorded
                  ? "Play-level hurry / hit; its timing is unavailable."
                  : "This does not establish a clean pocket."}
              </span>
            </p>
          </div>
          <div className="inspector-copy">
            <Button
              onClick={copy}
              className={`copy-button ${copied ? "is-copied" : ""}`}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
              {copied ? "Review cue copied" : "Copy review cue"}
            </Button>
            <span role="status" className="copy-status">
              {copied
                ? "Play ID, timestamp, and observation copied."
                : "Take the exact moment into film review."}
            </span>
          </div>
          <p className="inspector-note">
            The selected receiver may not be the pass target. Tracking shows
            spacing, not a guaranteed passing opportunity.
          </p>
        </Tabs.Content>
        <Tabs.Content
          value="details"
          className="inspector-content details-content"
        >
          <div className="inspector-eyebrow">
            <FileText size={15} />
            <span>Official play record</span>
          </div>
          <h2>Behind the play</h2>
          <p className="official-description">{cue.playDescription}</p>
          <dl className="detail-list">
            <div>
              <dt>Thrower</dt>
              <dd>
                {replay.thrower.name} #{replay.thrower.jersey_number}
              </dd>
            </div>
            <div>
              <dt>Coverage</dt>
              <dd>{cue.pff_passCoverage || "Unknown"}</dd>
            </div>
            <div>
              <dt>Play type</dt>
              <dd>
                {cue.context.dropback_type.toLowerCase().replaceAll("_", " ")}
              </dd>
            </div>
            <div>
              <dt>Outcome</dt>
              <dd>
                {cue.outcome.label} · {cue.outcome.yards_gained} yd
              </dd>
            </div>
            <div>
              <dt>Release</dt>
              <dd>{cue.observed_seconds.toFixed(1)}s after snap</dd>
            </div>
            <div>
              <dt>Release source</dt>
              <dd>{cue.release_source}</dd>
            </div>
            <div>
              <dt>Game ID</dt>
              <dd className="mono">{cue.gameId}</dd>
            </div>
            <div>
              <dt>Play ID</dt>
              <dd className="mono">{cue.playId}</dd>
            </div>
            <div>
              <dt>Receiver ID</dt>
              <dd className="mono">{cue.nflId}</dd>
            </div>
          </dl>
          <div className="context-alert">
            <ShieldAlert size={17} />
            <p>
              <strong>Recorded context</strong>
              <span>{cue.context.pressure_note}. Timing is unavailable.</span>
            </p>
          </div>
          <a
            className="download-link"
            href={`${import.meta.env.BASE_URL}downloads/third_down_review_queue.csv`}
            download
          >
            Download review sample <ArrowUpRight size={16} />
          </a>
        </Tabs.Content>
      </Tabs.Root>
      <Modal
        open={manualCopy}
        onOpenChange={setManualCopy}
        title="Copy your review cue"
        description="Clipboard access is unavailable. Select and copy the text below."
      >
        <textarea
          className="cue-text"
          aria-label="Review cue"
          readOnly
          rows={10}
          value={cueText(replay)}
          onFocus={(e) => e.target.select()}
        />
      </Modal>
    </aside>
  );
}
