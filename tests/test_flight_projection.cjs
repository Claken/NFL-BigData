const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const source = fs.readFileSync('scripts/report_client.js', 'utf8');
const context = vm.createContext({});
vm.runInContext('const recordedCache = new Map();' + source.slice(source.indexOf('function recordedFrames('), source.indexOf('function drawFlight(')) + '; this.api = {flightScenario, playbackTime, playbackEndIndex, animatedFrame};', context);
vm.runInContext('const fieldBounds = new Map();' + source.slice(source.indexOf('function boundsFor('), source.indexOf('function draw()')) + '; this.api.boundsFor = boundsFor;', context);
const api = context.api;
const players = offset => [
  { side: 'ball', id: null, x: 10 - 20 * offset, y: 20 },
  { side: 'offense', id: 9, x: 15 - 5 * offset, y: 30 },
  { side: 'defense', id: 1, x: 20, y: 35 }
];
let nextId = 0;
const fixture = () => ({ id: "fixture-" + nextId++,
  route: { observed_seconds: 3.3, nflId: 9 }, line_of_scrimmage: 0, situation: { line_to_gain: 8 },
  frames: [{ t: 3.3, frame: 33, players: players(.4) }],
  review_cue: { throw_frame_index: 0 },
  post_release: { projection_unavailable: null,
    assumptions: { max_seconds_after_throw: 2, heading_degrees: 15, speed_fraction: .2 },
    frames: Array.from({length: 4}, (_, i) => ({ t: 3.4 + i / 10, frame: 34 + i, players: players(.3 - i / 10) })),
    motion: { ball: { vx: 20, vy: 0 }, receiver: { vx: 5, vy: 0 } }
  }
});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
test('both projections start from the last measured sample at the same future time', () => {
  const r = api.flightScenario(fixture(), 1);
  near(r.projectedBall.x, 22); near(r.projectedBall.y, 20);
  near(r.projectedReceiver.x, 18); near(r.projectedReceiver.y, 30);
  near(r.gap, Math.sqrt(116));
});
test('the entire cone starts and closes at the last measured ball position', () => {
  const r = api.flightScenario(fixture(), 1);
  near(r.sector[0].x, 10); near(r.sector[0].y, 20);
  near(r.sector.at(-1).x, 10); near(r.sector.at(-1).y, 20);
  for (const p of r.sector.slice(1, -1)) near(Math.hypot(p.x - 10, p.y - 20), 14.4);
  near(Math.atan2(r.sector[1].y - 20, r.sector[1].x - 10), -Math.PI / 12);
  near(Math.atan2(r.sector.at(-2).y - 20, r.sector.at(-2).x - 10), Math.PI / 12);
});
test('there is no jump at the measured-to-projected boundary', () => {
  const f = fixture();
  near(api.playbackTime(f, 4), 3.7);
  const horizon = api.playbackTime(f, 4.0001) - f.route.observed_seconds;
  const r = api.flightScenario(f, horizon);
  assert.ok(Math.abs(r.projectedBall.x - 10) < .001);
  assert.ok(Math.abs(r.projectedReceiver.x - 15) < .001);
  assert.ok(Math.hypot(r.sector[1].x - 10, r.sector[1].y - 20) < .001);
});
test('one timeline extends continuously through the complete projection', () => {
  const f = fixture();
  assert.equal(api.playbackEndIndex(f), 20);
  near(api.playbackTime(f, api.playbackEndIndex(f)), 5.3);
  for (let i = 0; i < 20; i++) near(api.playbackTime(f, i + 1) - api.playbackTime(f, i), .1);
  f.post_release.projection_unavailable = 'Too few samples';
  assert.equal(api.playbackEndIndex(f), 4);
});
test('animation interpolates between recorded samples without mutating them', () => {
  const f = fixture(), original = JSON.stringify(f), mid = api.animatedFrame(f, .5);
  near(mid.players.find(p => p.id === null).x, 3);
  near(mid.players.find(p => p.id === 9).x, 13.25);
  assert.equal(mid.interpolated, true);
  assert.equal(JSON.stringify(f), original);
  assert.equal(api.animatedFrame(f, 0), f.frames[0]);
});
test('future position is not clamped to the field boundary', () => {
  const f = fixture(); f.post_release.frames.at(-1).players[0].x = 115;
  assert.ok(api.flightScenario(f, 1).projectedBall.x > 120);
  assert.equal(api.flightScenario(f, 1).outsideField, true);
});
test('rotation transforms projected positions consistently', () => {
  const f = fixture(), original = api.flightScenario(f, 1);
  f.post_release.frames.forEach(fr => fr.players.forEach(p => { p.x = 120 - p.x; p.y = 160 / 3 - p.y; }));
  Object.values(f.post_release.motion).forEach(v => { v.vx *= -1; v.vy *= -1; });
  const rotated = api.flightScenario(f, 1);
  near(rotated.projectedBall.x, 120 - original.projectedBall.x);
  near(rotated.projectedBall.y, 160 / 3 - original.projectedBall.y);
  near(rotated.gap, original.gap);
});
test('no extrapolation into recorded time, beyond the stated horizon or with insufficient data', () => {
  const f = fixture();
  assert.equal(api.flightScenario(f, .3), null); assert.equal(api.flightScenario(f, 2.1), null);
  f.post_release.projection_unavailable = 'Too few samples';
  assert.equal(api.flightScenario(f, 1), null);
});

test('camera bounds include the entire future cone before playback and remain fixed', () => {
  const f = fixture(), camera = api.boundsFor(f), future = api.flightScenario(f, 2);
  for (const p of [...future.sector, future.projectedReceiver]) {
    assert.ok(p.x >= camera.fit.x0 && p.x <= camera.fit.x1);
    assert.ok(p.y >= camera.fit.y0 && p.y <= camera.fit.y1);
  }
  api.animatedFrame(f, 3.99); api.flightScenario(f, .40001);
  assert.equal(api.boundsFor(f), camera);
});
