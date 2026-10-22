import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Frame, Point, Replay } from "../lib/types";
import { fieldBounds, projectionAt, recordedFrames } from "../lib/replay";
export default function Field({
  replay,
  frame,
  time,
  full,
  trails,
}: {
  replay: Replay;
  frame: Frame;
  time: number;
  full: boolean;
  trails: boolean;
}) {
  const clipId = useId().replaceAll(":", "");
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 900, height: 470 });
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    });
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);
  const bounds = useMemo(() => fieldBounds(replay, full), [replay, full]);
  const frames = useMemo(() => recordedFrames(replay), [replay]);
  const projection = projectionAt(replay, time);
  const W = size.width,
    H = size.height,
    padX = W < 500 ? 18 : 35,
    padY = 28;
  const scale = Math.min(
    (W - padX * 2) / (bounds.x1 - bounds.x0),
    (H - padY * 2) / (bounds.y1 - bounds.y0),
  );
  const ox = (W - (bounds.x1 - bounds.x0) * scale) / 2,
    oy = (H - (bounds.y1 - bounds.y0) * scale) / 2;
  const xy = (p: Point) => ({
    x: ox + (p.x - bounds.x0) * scale,
    y: H - oy - (p.y - bounds.y0) * scale,
  });
  const path = (points: Point[]) =>
    points
      .map((p, i) => {
        const v = xy(p);
        return `${i ? "L" : "M"}${v.x},${v.y}`;
      })
      .join(" ");
  const topLeft = xy({ x: 0, y: 160 / 3 });
  const receiver = frame.players.find((p) => p.id === replay.route.nflId)!;
  const nearest = frame.players.find((p) => p.id === frame.nearest);
  const routePoints = frames
    .filter((f) => f.t <= Math.min(time, frames.at(-1)!.t))
    .map((f) => ({ x: f.x, y: f.y }));
  routePoints.push(receiver);
  const receiverXY = xy(receiver);
  const ballPoints = frames
    .filter((f) => f.t >= replay.route.observed_seconds && f.t <= time)
    .map((f) => f.players.find((p) => p.side === "ball")!);
  if (time >= replay.route.observed_seconds)
    ballPoints.push(frame.players.find((p) => p.side === "ball")!);
  return (
    <svg
      ref={ref}
      className="football-field"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${replay.route.displayName} at ${time.toFixed(1)} seconds. ${projection ? "Illustrative projection; not a landing prediction." : `${frame.separation.toFixed(1)} yards to the nearest defender. Offense moves right.`}`}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={W} height={H} rx="4" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect
          className="pitch-fill"
          x={topLeft.x}
          y={topLeft.y}
          width={120 * scale}
          height={(160 / 3) * scale}
        />
        {Array.from({ length: 24 }, (_, i) => i * 5).map((x) => (
          <rect
            className={x % 10 === 0 ? "pitch-stripe" : "pitch-clear"}
            key={x}
            x={xy({ x, y: 0 }).x}
            y={topLeft.y}
            width={5 * scale}
            height={(160 / 3) * scale}
          />
        ))}
        <rect
          className="pitch-edge"
          x={topLeft.x}
          y={topLeft.y}
          width={120 * scale}
          height={(160 / 3) * scale}
        />
        {Array.from({ length: 21 }, (_, i) => 10 + i * 5).map((x) => (
          <g key={x}>
            <line
              className={x % 10 === 0 ? "yard-line" : "yard-line minor"}
              x1={xy({ x, y: 0 }).x}
              x2={xy({ x, y: 0 }).x}
              y1={topLeft.y}
              y2={topLeft.y + (160 / 3) * scale}
            />
            {x % 10 === 0 && (
              <>
                <text
                  className="yard-number"
                  x={xy({ x, y: 0 }).x}
                  y={topLeft.y + 20}
                >
                  {Math.min(x - 10, 110 - x)}
                </text>
                <text
                  className="yard-number"
                  x={xy({ x, y: 0 }).x}
                  y={topLeft.y + (160 / 3) * scale - 12}
                >
                  {Math.min(x - 10, 110 - x)}
                </text>
              </>
            )}
          </g>
        ))}
        {Array.from({ length: 99 }, (_, i) => 11 + i).map((x) => (
          <g key={x}>
            {[23.58, 29.75].map((y) => (
              <line
                className="hash-mark"
                key={y}
                x1={xy({ x, y }).x}
                x2={xy({ x, y }).x}
                y1={xy({ x, y }).y - 2}
                y2={xy({ x, y }).y + 2}
              />
            ))}
          </g>
        ))}
        <line
          className="scrimmage-line"
          x1={xy({ x: replay.line_of_scrimmage, y: 0 }).x}
          x2={xy({ x: replay.line_of_scrimmage, y: 0 }).x}
          y1={topLeft.y}
          y2={topLeft.y + (160 / 3) * scale}
        />
        <line
          className="gain-line"
          x1={xy({ x: replay.situation.line_to_gain, y: 0 }).x}
          x2={xy({ x: replay.situation.line_to_gain, y: 0 }).x}
          y1={topLeft.y}
          y2={topLeft.y + (160 / 3) * scale}
        />
        <text
          className="gain-label"
          x={xy({ x: replay.situation.line_to_gain, y: 0 }).x}
          y={Math.max(16, topLeft.y - 10)}
        >
          LINE TO GAIN
        </text>
        {trails && <path className="receiver-trail" d={path(routePoints)} />}
        {nearest && !projection && (
          <path className="gap-line" d={path([receiver, nearest])} />
        )}
        {ballPoints.length > 1 && (
          <path className="ball-trail" d={path(ballPoints)} />
        )}
        {projection && (
          <>
            <path
              className="projection-cone"
              d={path(projection.sector) + " Z"}
            />
            <path
              className="projected-path ball-trail"
              d={path([projection.ball, projection.projectedBall])}
            />
            <path
              className="projected-path receiver-trail"
              d={path([projection.receiver, projection.projectedReceiver])}
            />
          </>
        )}
        {frame.players
          .filter((p) => p.id !== replay.route.nflId)
          .map((p) => {
            const v = xy(p),
              quarterback = p.id === replay.thrower.id;
            return (
              <g
                key={p.id ?? "ball"}
                className={`player player--${p.side} ${quarterback ? "player--qb" : ""}`}
                transform={`translate(${v.x},${v.y})`}
              >
                <title>
                  {p.name}
                  {p.label ? ` #${p.label}` : ""}
                </title>
                {quarterback && <circle className="qb-ring" r="15" />}
                <circle r={p.side === "ball" ? 5 : 10} />
                {p.side !== "ball" && <text y=".35em">{p.label}</text>}
              </g>
            );
          })}
        <g
          className="player player--receiver"
          transform={`translate(${receiverXY.x},${receiverXY.y})`}
        >
          <circle className="receiver-radius" r={2 * scale} />
          <circle className="receiver-ring" r="17" />
          <circle r="12" />
          <text y=".35em">{receiver.label}</text>
        </g>
        {projection &&
          [projection.projectedBall, projection.projectedReceiver].map(
            (p, i) => {
              const v = xy(p);
              return (
                <g
                  key={i}
                  className={
                    i
                      ? "projection-marker receiver-marker"
                      : "projection-marker ball-marker"
                  }
                  transform={`translate(${v.x},${v.y})`}
                >
                  <circle r="9" />
                  <path d="M-4 0H4M0-4V4" />
                </g>
              );
            },
          )}
        {!projection && (
          <g
            className="receiver-label"
            transform={`translate(${Math.min(W - 152, Math.max(4, receiverXY.x + 22))},${Math.max(28, receiverXY.y - 30)})`}
          >
            <rect x="0" y="-15" width="142" height="28" rx="4" />
            <text x="9" y="3">
              {replay.route.displayName.split(" ").at(-1)}{" "}
              <tspan>#{receiver.label}</tspan>
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}
