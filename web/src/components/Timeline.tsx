import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Replay } from "../lib/types";
import { recordedFrames } from "../lib/replay";
export default function Timeline({
  replay,
  time,
  onSeek,
}: {
  replay: Replay;
  time: number;
  onSeek: (time: number) => void;
}) {
  const id = useId().replaceAll(":", "");
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(800);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);
  const frames = useMemo(() => recordedFrames(replay), [replay]);
  const end = frames.at(-1)!.t,
    chartTime = Math.min(time, end),
    release = replay.route.observed_seconds;
  const W = width,
    H = 116,
    left = 30,
    right = 14,
    top = 12,
    bottom = 24;
  const max =
    Math.ceil(Math.max(...frames.map((f) => f.separation), 4) / 2) * 2;
  const x = (t: number) => left + (t / end) * (W - left - right),
    y = (v: number) => H - bottom - (v / max) * (H - top - bottom);
  const line = frames
    .map((f, i) => `${i ? "L" : "M"}${x(f.t)},${y(f.separation)}`)
    .join(" ");
  return (
    <div className="spacing-chart">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Recorded separation history, zero to ${end.toFixed(1)} seconds. Highlighted bands meet the spacing screen.`}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity=".16" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {replay.windows
          .filter((w) => w.duration_seconds >= 0.5)
          .map((w, i) => (
            <rect
              className="chart-window"
              key={i}
              x={x((w.start_frame - replay.route.snap) / 10)}
              y={top}
              width={
                x((w.end_frame - replay.route.snap) / 10) -
                x((w.start_frame - replay.route.snap) / 10)
              }
              height={H - top - bottom}
            />
          ))}
        {[0, 2, max].map((v) => (
          <g key={v}>
            <line
              className="chart-grid"
              x1={left}
              x2={W - right}
              y1={y(v)}
              y2={y(v)}
              strokeDasharray={v === 2 ? "4 4" : undefined}
            />
            <text className="chart-axis" x="1" y={y(v) + 4}>
              {v}
            </text>
          </g>
        ))}
        <path
          d={line + ` L${x(frames.at(-1)!.t)},${y(0)} L${x(0)},${y(0)} Z`}
          fill={`url(#${id})`}
        />
        <path className="chart-line" d={line} />
        <line
          className="chart-release"
          x1={x(release)}
          x2={x(release)}
          y1={top}
          y2={H - bottom}
        />
        <text
          className="chart-axis"
          x={x(release) - 6}
          y={top + 8}
          textAnchor="end"
        >
          Throw
        </text>
        <line
          className="chart-cursor"
          x1={x(chartTime)}
          x2={x(chartTime)}
          y1={top}
          y2={H - bottom}
        />
        {Array.from(
          { length: Math.floor(end / Math.ceil(end / 5)) + 1 },
          (_, i) => i * Math.ceil(end / 5),
        ).map((t) => (
          <text
            className="chart-axis"
            key={t}
            x={x(t)}
            y={H - 4}
            textAnchor="middle"
          >
            {t}s
          </text>
        ))}
      </svg>
      <input
        className="chart-seek"
        type="range"
        aria-label="Seek separation chart"
        min="0"
        max={end}
        step="0.1"
        value={chartTime}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
    </div>
  );
}
