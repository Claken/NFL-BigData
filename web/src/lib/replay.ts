import type { Frame, Point, Replay } from './types';
export const recordedFrames = (replay: Replay) => [...replay.frames, ...replay.post_release.frames];
export function canProject(replay: Replay) {
  const post = replay.post_release;
  return !post.projection_unavailable && post.frames.length > 0 && !!post.motion.ball && !!post.motion.receiver;
}
export function endTime(replay: Replay) {
  return canProject(replay) ? replay.route.observed_seconds + replay.post_release.assumptions.max_seconds_after_throw : recordedFrames(replay).at(-1)!.t;
}
export function frameAt(replay: Replay, time: number, frames = recordedFrames(replay)): Frame {
  const position = Math.max(0, Math.min(frames.length - 1, time * 10));
  const index = Math.floor(position), first = frames[index], second = frames[index + 1];
  if (!second || position === index) return first;
  const fraction = position - index;
  const next = new Map(second.players.map(player => [player.id, player]));
  const players = first.players.map(player => {
    const target = next.get(player.id)!;
    return { ...player, x: player.x + (target.x - player.x) * fraction, y: player.y + (target.y - player.y) * fraction };
  });
  const receiver = players.find(player => player.id === replay.route.nflId)!;
  const nearest = players.filter(player => player.side === 'defense').map(player => ({ id: player.id!, gap: Math.hypot(player.x - receiver.x, player.y - receiver.y) })).sort((a, b) => a.gap - b.gap)[0];
  return { ...first, t: time, players, x: receiver.x, y: receiver.y, downfield: receiver.x - replay.line_of_scrimmage, nearest: nearest.id, separation: nearest.gap };
}
export function projectionAt(replay: Replay, time: number) {
  if (!canProject(replay) || time > endTime(replay) + 1e-8) return null;
  const post = replay.post_release, last = post.frames.at(-1)!;
  const dt = time - last.t;
  if (dt <= 1e-8) return null;
  const ball = last.players.find(player => player.side === 'ball')!;
  const receiver = last.players.find(player => player.id === replay.route.nflId)!;
  const vb = post.motion.ball!, vr = post.motion.receiver!;
  const projectedBall = { x: ball.x + vb.vx * dt, y: ball.y + vb.vy * dt };
  const projectedReceiver = { x: receiver.x + vr.vx * dt, y: receiver.y + vr.vy * dt };
  const angle = Math.atan2(vb.vy, vb.vx), spread = post.assumptions.heading_degrees * Math.PI / 180;
  const radius = Math.hypot(vb.vx, vb.vy) * (1 + post.assumptions.speed_fraction) * dt;
  const sector: Point[] = [ball];
  for (let i = 0; i <= 32; i++) {
    const theta = angle - spread + 2 * spread * i / 32;
    sector.push({ x: ball.x + radius * Math.cos(theta), y: ball.y + radius * Math.sin(theta) });
  }
  sector.push(ball);
  return { ball, receiver, projectedBall, projectedReceiver, sector, gap: Math.hypot(projectedBall.x - projectedReceiver.x, projectedBall.y - projectedReceiver.y) };
}
export function fieldBounds(replay: Replay, full: boolean, includeProjection = false) {
  const points: Point[] = recordedFrames(replay).flatMap(frame => frame.players);
  const projection = includeProjection ? projectionAt(replay, endTime(replay)) : null;
  if (projection) points.push(...projection.sector, projection.projectedReceiver);
  const centerY = (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2;
  points.push({x: replay.line_of_scrimmage, y: centerY}, {x: replay.situation.line_to_gain, y: centerY});
  if (full) points.push({x: 0, y: 0}, {x: 120, y: 160 / 3});
  const padX = full ? 5 : 3, padY = full ? 4 : 3;
  const x0 = Math.min(...points.map(p => p.x)) - padX, x1 = Math.max(...points.map(p => p.x)) + padX;
  const y0 = Math.min(...points.map(p => p.y)) - padY, y1 = Math.max(...points.map(p => p.y)) + padY;
  return {x0, x1, y0, y1};
}
