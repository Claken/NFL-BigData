/* Embedded into the standalone report by report.py; no network requests. */
const model = __MODEL__;
const el = id => document.getElementById(id);
const replays = new Map(model.replays.map(replay => [replay.id, replay]));
const plotConfig = {
  responsive: true, displaylogo: false,
  modeBarButtonsToRemove: ['sendDataToCloud', 'select2d', 'lasso2d']
};
const chartFont = { family: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', size: 12, color: '#a3b1aa' };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let index = 0, timer = null, current = null, loadVersion = 0, loading = false, fieldView = 'fit';
const fieldBounds = new Map(), recordedCache = new Map();
let flightHorizon = 0, lastTimelinePosition = null;

const contextLabels = { traditional: 'Traditional dropback', scramble: 'Scramble-related', rollout: 'Designed rollout', other: 'Other / unknown type' };
const teamNames = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers', CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys', DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
  HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', KC: 'Kansas City Chiefs',
  LA: 'Los Angeles Rams', LAR: 'Los Angeles Rams', LAC: 'Los Angeles Chargers', LV: 'Las Vegas Raiders',
  MIA: 'Miami Dolphins', MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints',
  NYG: 'New York Giants', NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers',
  SEA: 'Seattle Seahawks', SF: 'San Francisco 49ers', TB: 'Tampa Bay Buccaneers', TEN: 'Tennessee Titans',
  WAS: 'Washington Football Team'
};
function playSummaryParts(replay) {
  const focus = replay.third_down_review, distance = focus.yards_to_go, gain = focus.outcome.yards_gained;
  const yards = number => number + (number === 1 ? ' yard' : ' yards');
  const emphasis = (text, kind = '') => ({ text, kind });
  const team = teamNames[replay.route.possessionTeam];
  const subject = team ? 'The ' + team : 'The attacking team';
  const objective = [subject + ' needed to move the ball ', emphasis(yards(distance), 'goal'),
    ' on their ', emphasis('third attempt'), ' to earn another four attempts. '];
  let outcome;
  if (replay.route.passResult === 'IN') outcome = ['An ', emphasis('opponent caught the pass', 'result'),
    ' instead, so ', emphasis('the other team took possession', 'result'), ' of the ball.'];
  else if (replay.route.passResult === 'I') outcome = ['The pass was ', emphasis('not caught', 'result'),
    ', so they ', emphasis('gained no yards', 'result'), ' and did not earn those extra attempts.'];
  else {
    const gained = gain < 0 ? 'lost ' + yards(Math.abs(gain)) : gain === 0 ? 'gained no yards' : 'gained only ' + yards(gain);
    outcome = ['The pass was caught, but the team ', emphasis(gained, 'result'),
      gain === 0 ? ' and remained ' : ', leaving them ',
      emphasis(yards(distance - gain) + ' short of the target', 'result'), '.'];
  }
  return [...objective, ...outcome];
}
function plainPlaySummary(replay) {
  return playSummaryParts(replay).map(part => typeof part === 'string' ? part : part.text).join('');
}
function renderPlaySummary(replay) {
  el('playSummary').replaceChildren(...playSummaryParts(replay).map(part => {
    if (typeof part === 'string') return document.createTextNode(part);
    const strong = document.createElement('strong');
    strong.textContent = part.text;
    if (part.kind) strong.className = 'summary-' + part.kind;
    return strong;
  }));
}

function setStory(replay) {
  const cue = replay.review_cue, r = replay.route, focus = replay.third_down_review, c = focus.context;
  const earlier = replay.frames[cue.earlier_frame_index], thrown = replay.frames[cue.throw_frame_index];
  const review = replay.frames[cue.review_frame_index];
  renderPlaySummary(replay);
  el('timelineWindowLabel').textContent = 'First beyond-line interval';
  const surname = r.displayName.split(' ').slice(-1)[0];
  const question = 'At ' + review.t.toFixed(1) + ' s, was a throw toward ' + surname + ' realistic?';
  el('pitchQuestion').textContent = question;
  el('playConditions').replaceChildren();
  for (const label of [contextLabels[c.dropback_group], c.pressure_note + (c.pressure_recorded ? ' · time unknown' : '')]) {
    const tag = document.createElement('span'); tag.textContent = label; el('playConditions').append(tag);
  }
  const instructions = {
    pressure: ['Check recorded pressure.', 'Locate the hurry / hit on video, then check whether this spacing preceded it.', 'Play-level flag; pressure timing is unknown.'],
    movement: ["Check thrower movement.", "Trace the thrower's movement around this point. Check whether the play had extended beyond its original timing.", 'This play is recorded as ' + contextLabels[c.dropback_group].toLowerCase() + '; that does not establish why it extended.'],
    timing: ['Check receiver timing.', "Check the throwing lane and intended read on video, using the marked positions.", 'No flag does not prove a clean pocket.']
  };
  const [heading, instruction, reason] = instructions[c.review_focus];
  el('storyHeading').innerText = heading;
  el('earlierLabel').textContent = 'First sustained spacing';
  el('earlierGap').textContent = earlier.separation.toFixed(1) + ' yd gap';
  el('earlierTime').textContent = earlier.t.toFixed(1) + ' s · ' + earlier.downfield.toFixed(1) + ' yd downfield';
  el('throwTime').textContent = thrown.t.toFixed(1) + ' s · ' + (thrown.t - earlier.t).toFixed(1) + ' s after this cue';
  el('reviewActionTitle').textContent = 'Inspect ' + review.t.toFixed(1) + ' s after snap';
  el('reviewQuestion').textContent = instruction;
  el('reviewReason').textContent = reason;
  el('reviewMoment').textContent = '↶ Inspect the marked moment';
  el('reviewCueText').value = r.displayName + ' · ' + r.possessionTeam + ' · Week ' + r.week +
    '\nGame ' + r.gameId + ' · Play ' + r.playId + '\n' + el('downDistance').textContent +
    ' · Q' + c.quarter + ' ' + c.game_clock + ' · ' + c.away_team + ' ' + c.away_score + '–' + c.home_score + ' ' + c.home_team +
    '\n' + plainPlaySummary(replay) +
    '\nRecorded context: ' + c.dropback_type + '; ' + c.pressure_note + ' (play-level, timing unavailable).' +
    '\nInspect ' + review.t.toFixed(1) + ' s after snap: ' + review.downfield.toFixed(2) + ' yd downfield, nearest gap ' + review.separation.toFixed(2) + ' yd. Throw at ' + thrown.t.toFixed(1) + ' s.' +
    '\n' + question + ' ' + instruction +
    '\nSelected receiver is not necessarily the target. Tracking alone cannot prove an available or missed pass.';
  el('cueStatus').textContent = '';
}

function jumpToFrame(frameIndex) {
  if (!current || loading) return;
  stop(); index = frameIndex; draw();
}
for (const id of ['storyEarlier', 'mobileEarlier']) el(id).onclick = () => jumpToFrame(current.review_cue.earlier_frame_index);
for (const id of ['storyThrow', 'mobileThrow']) el(id).onclick = () => jumpToFrame(current.review_cue.throw_frame_index);
el('reviewMoment').onclick = () => jumpToFrame(current.review_cue.review_frame_index);
el('copyCue').onclick = async () => {
  try {
    await navigator.clipboard.writeText(el('reviewCueText').value);
    el('cueStatus').textContent = 'Play and timestamp copied.';
  } catch {
    el('reviewCueText').closest('details').open = true;
    el('reviewCueText').focus(); el('reviewCueText').select();
    el('cueStatus').textContent = 'Select and copy the play details below.';
  }
};

function revealSection(hash) {
  const target = document.getElementById(hash.replace(/^#/, ''));
  if (!target) return;
  for (let node = target.parentElement; node; node = node.parentElement) {
    if (node.tagName === 'DETAILS') node.open = true;
  }
  requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: 'instant' }));
}
document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', () => revealSection(link.hash)));
window.addEventListener('hashchange', () => revealSection(location.hash));
el('queueDrawer').addEventListener('toggle', () => {
  if (el('timeline').data) requestAnimationFrame(() => Plotly.Plots.resize(el('timeline')));
});

function options(id, values, allLabel) {
  const select = el(id), all = document.createElement('option');
  all.value = ''; all.textContent = allLabel; select.append(all);
  values.forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value; option.textContent = label; select.append(option);
  });
}

function queuePlayResult(route) {
  const yards = number => number + (number === 1 ? ' yard' : ' yards');
  if (route.passResult === 'IN') return 'An opponent caught the pass and took possession of the ball.';
  if (route.passResult === 'I') return 'The pass was not caught.';
  const gain = route.outcome.yards_gained, short = yards(route.yards_to_go - gain);
  if (gain < 0) return 'The pass was caught, but the team lost ' + yards(Math.abs(gain)) + '.';
  if (gain === 0) return 'The pass was caught, but the team gained no yards.';
  return 'The pass was caught, but the team finished ' + short + ' short.';
}

function renderQueue() {
  const filters = [el('receiverFilter').value, el('dropbackFilter').value, el('coverageFilter').value];
  const routes = model.queue.filter(r => (!filters[0] || String(r.nflId) === filters[0]) &&
    (!filters[1] || r.context.dropback_group === filters[1]) &&
    (!filters[2] || (r.pff_passCoverage || 'Unknown') === filters[2]));
  const plays = new Map();
  for (const r of routes) {
    const key = r.gameId + ':' + r.playId;
    if (!plays.has(key)) plays.set(key, []);
    plays.get(key).push(r);
  }
  el('queueRows').replaceChildren();
  for (const [key, receivers] of plays) {
    const r = receivers[0], c = r.context;
    const card = document.createElement('article'); card.className = 'route-card';
    card.setAttribute('role', 'listitem'); card.dataset.playId = key;
    card.setAttribute('aria-current', String(receivers.some(r => r.replay_id === current?.id)));
    const name = document.createElement('h3'); name.className = 'route-name';
    name.textContent = teamNames[r.possessionTeam] || r.possessionTeam;
    const situation = document.createElement('p'); situation.className = 'queue-situation';
    const needed = document.createElement('strong'); needed.className = 'summary-goal';
    needed.textContent = r.yards_to_go + (r.yards_to_go === 1 ? ' yard' : ' yards');
    situation.append('They needed ', needed, ' on their third attempt.');
    const result = document.createElement('p'); result.className = 'queue-result';
    result.textContent = queuePlayResult(r);
    const meta = document.createElement('p'); meta.className = 'route-meta';
    meta.textContent = 'Week ' + r.week + ' · Q' + c.quarter + ' ' + c.game_clock + ' · ' + c.away_team + ' ' + c.away_score + '–' + c.home_score + ' ' + c.home_team;
    card.append(name, situation, result, meta);
    for (const receiver of receivers) {
      const button = document.createElement('button'); button.className = 'route-choice';
      button.textContent = receiver.displayName + ' · inspect ' + receiver.window_start_seconds.toFixed(1) + ' s';
      button.setAttribute('aria-label', 'Inspect ' + receiver.displayName + ', game ' + receiver.gameId + ', play ' + receiver.playId);
      button.setAttribute('aria-pressed', String(current?.id === receiver.replay_id));
      button.onclick = () => loadReplay(receiver.replay_id, true); card.append(button);
    }
    el('queueRows').append(card);
  }
  el('queueCount').textContent = plays.size + ' of ' + model.thirdDownCounts.packaged_plays + ' plays · ' + routes.length + ' receiver cues';
  el('queueEmpty').hidden = routes.length !== 0;
  el('clearFilters').disabled = !filters.some(Boolean);
}
const receivers = [...new Map(model.queue.map(r => [String(r.nflId), r.displayName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
options('receiverFilter', receivers, 'All receivers');
options('dropbackFilter', [...new Set(model.queue.map(r => r.context.dropback_group))].sort().map(v => [v, contextLabels[v]]), 'All play types');
options('coverageFilter', [...new Set(model.queue.map(r => r.pff_passCoverage || 'Unknown'))].sort().map(v => [v, v]), 'All coverages');
for (const id of ['receiverFilter', 'dropbackFilter', 'coverageFilter']) el(id).onchange = renderQueue;
el('clearFilters').onclick = () => {
  for (const id of ['receiverFilter', 'dropbackFilter', 'coverageFilter']) el(id).value = '';
  renderQueue();
};

function stop() {
  if (timer) cancelAnimationFrame(timer);
  index = Math.round(index);
  timer = null; el('play').textContent = 'Play'; el('play').setAttribute('aria-label', 'Play replay');
  el('play').dataset.playing = 'false';
}

function recordedFrames(replay) {
  if (!recordedCache.has(replay.id)) recordedCache.set(replay.id, [...replay.frames, ...(replay.post_release?.frames || [])]);
  return recordedCache.get(replay.id);
}
function flightScenario(replay, horizon) {
  const data = replay.post_release;
  if (!data || data.projection_unavailable || !data.frames.length) return null;
  const last = data.frames[data.frames.length - 1];
  const dt = horizon - (last.t - replay.route.observed_seconds);
  if (dt <= 0 || horizon > data.assumptions.max_seconds_after_throw) return null;
  const ball = last.players.find(p => p.side === 'ball');
  const receiver = last.players.find(p => p.id === replay.route.nflId);
  const vb = data.motion.ball, vr = data.motion.receiver;
  const position = (p, v) => ({ x: p.x + v.vx * dt, y: p.y + v.vy * dt });
  const projectedBall = position(ball, vb), projectedReceiver = position(receiver, vr);
  const speed = Math.hypot(vb.vx, vb.vy), angle = Math.atan2(vb.vy, vb.vx);
  const spread = data.assumptions.heading_degrees * Math.PI / 180;
  // A swept cone includes every assumed path from the last measured point, not an end-cap band.
  const sector = [{ x: ball.x, y: ball.y }];
  for (let i = 0; i <= 32; i++) {
    const theta = angle - spread + 2 * spread * i / 32;
    const radius = speed * (1 + data.assumptions.speed_fraction) * dt;
    sector.push({ x: ball.x + radius * Math.cos(theta), y: ball.y + radius * Math.sin(theta) });
  }
  sector.push({ x: ball.x, y: ball.y });
  return { ball, receiver, projectedBall, projectedReceiver, sector,
    outsideField: projectedBall.x < 0 || projectedBall.x > 120 || projectedBall.y < 0 || projectedBall.y > 160 / 3,
    gap: Math.hypot(projectedBall.x - projectedReceiver.x, projectedBall.y - projectedReceiver.y) };
}
function playbackEndIndex(replay) {
  const recorded = recordedFrames(replay), last = recorded[recorded.length - 1];
  if (replay.post_release.projection_unavailable) return recorded.length - 1;
  return recorded.length - 1 + Math.round((replay.route.observed_seconds + replay.post_release.assumptions.max_seconds_after_throw - last.t) * 10);
}
function playbackTime(replay, progress) {
  const recorded = recordedFrames(replay), lastIndex = recorded.length - 1;
  if (progress >= lastIndex) return recorded[lastIndex].t + (progress - lastIndex) / 10;
  const lower = Math.floor(progress);
  return recorded[lower].t + (progress - lower) / 10;
}
function animatedFrame(replay, progress) {
  const recorded = recordedFrames(replay), lower = Math.min(Math.floor(progress), recorded.length - 1);
  const first = recorded[lower], second = recorded[lower + 1], fraction = progress - lower;
  if (!second || fraction < 1e-8) return first;
  const next = new Map(second.players.map(p => [p.id, p]));
  const players = first.players.map(p => ({ ...p, x: p.x + (next.get(p.id).x - p.x) * fraction,
    y: p.y + (next.get(p.id).y - p.y) * fraction }));
  const receiver = players.find(p => p.id === replay.route.nflId);
  const nearest = players.filter(p => p.side === 'defense').map(p => ({ id: p.id, gap: Math.hypot(p.x - receiver.x, p.y - receiver.y) })).sort((a, b) => a.gap - b.gap)[0];
  return { ...first, players, x: receiver.x, y: receiver.y, t: first.t + fraction / 10,
    downfield: receiver.x - replay.line_of_scrimmage, nearest: nearest.id,
    separation: nearest.gap, interpolated: true };
}
function drawFlight(ctx, xy, scenario, replay, frameIndex, displayedFrame) {
  const recorded = recordedFrames(replay).slice(replay.review_cue.throw_frame_index, frameIndex + 1);
  const path = (points, color, dash, width = 3) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath();
    points.forEach((p, i) => { const [x, y] = xy(p); if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); ctx.setLineDash([]);
  };
  const ballPath = recorded.map(f => f.players.find(p => p.side === 'ball')).filter(Boolean);
  if (displayedFrame.interpolated) ballPath.push(displayedFrame.players.find(p => p.side === 'ball'));
  path(ballPath, '#e6bc70', []);
  if (!scenario) return;
  ctx.beginPath(); scenario.sector.forEach((p, i) => { const [x, y] = xy(p); if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.closePath(); ctx.fillStyle = '#e6bc7026'; ctx.fill(); ctx.strokeStyle = '#e6bc70'; ctx.lineWidth = 2; ctx.setLineDash([2, 5]); ctx.stroke(); ctx.setLineDash([]);
  path([scenario.ball, scenario.projectedBall], '#e6bc70', [2, 5], 2);
  path([scenario.receiver, scenario.projectedReceiver], '#c0ee79', [2, 5], 2);
}
function drawScenarioPoints(ctx, xy, scenario) {
  if (!scenario) return;
  for (const [point, color] of [[scenario.projectedBall, '#e6bc70'], [scenario.projectedReceiver, '#c0ee79']]) {
    const [x, y] = xy(point); ctx.beginPath(); ctx.arc(x, y, 7, 0, 2 * Math.PI);
    ctx.fillStyle = '#102719'; ctx.fill(); ctx.strokeStyle = color; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
  }
}

function boundsFor(replay) {
  if (fieldBounds.has(replay.id)) return fieldBounds.get(replay.id);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const frame of recordedFrames(replay)) for (const p of frame.players) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const fullScenario = flightScenario(replay, replay.post_release.assumptions.max_seconds_after_throw);
  if (fullScenario) for (const p of [...fullScenario.sector, fullScenario.projectedReceiver]) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  x0 = Math.min(x0, replay.line_of_scrimmage);
  x1 = Math.max(x1, replay.line_of_scrimmage);
  if (replay.situation.line_to_gain != null) {
    x0 = Math.min(x0, replay.situation.line_to_gain);
    x1 = Math.max(x1, replay.situation.line_to_gain);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const width = Math.max(48, x1 - x0 + 8), height = Math.max(32, y1 - y0 + 8);
  const bounds = { fit: { x0: cx - width / 2, x1: cx + width / 2, y0: cy - height / 2, y1: cy + height / 2 },
    full: { x0: Math.min(-2, x0 - 2), x1: Math.max(122, x1 + 2), y0: Math.min(-2, y0 - 2), y1: Math.max(160 / 3 + 2, y1 + 2) } };
  fieldBounds.set(replay.id, bounds); return bounds;
}

function draw() {
  if (!current || loading) return;
  const allFrames = recordedFrames(current), f = animatedFrame(current, index);
  const projected = index > allFrames.length - 1 + 1e-8, afterThrow = index > current.review_cue.throw_frame_index + 1e-8;
  const atEnd = index >= playbackEndIndex(current), displayTime = playbackTime(current, index);
  flightHorizon = Math.min(current.post_release.assumptions.max_seconds_after_throw, displayTime - current.route.observed_seconds);
  const scenario = projected ? flightScenario(current, flightHorizon) : null;
  const canvas = el('field'), rect = canvas.getBoundingClientRect();
  const W = Math.max(1, Math.round(rect.width)), H = Math.max(1, Math.round(rect.height));
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  if (canvas.width !== Math.round(W * ratio) || canvas.height !== Math.round(H * ratio)) {
    canvas.width = Math.round(W * ratio); canvas.height = Math.round(H * ratio);
  }
  const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const b = { ...boundsFor(current)[fieldView] }, pad = 34;
  // Fill the pitch without stretching yard scales or cropping any tracked player.
  const aspect = (W - 2 * pad) / (H - 2 * pad);
  const width = b.x1 - b.x0, height = b.y1 - b.y0;
  if (width / height < aspect) {
    const extra = (height * aspect - width) / 2; b.x0 -= extra; b.x1 += extra;
  } else {
    const extra = (width / aspect - height) / 2; b.y0 -= extra; b.y1 += extra;
  }
  const scale = Math.min((W - 2 * pad) / (b.x1 - b.x0), (H - 2 * pad) / (b.y1 - b.y0));
  const ox = (W - (b.x1 - b.x0) * scale) / 2, oy = (H - (b.y1 - b.y0) * scale) / 2;
  const xy = p => [ox + (p.x - b.x0) * scale, H - oy - (p.y - b.y0) * scale];
  ctx.clearRect(0, 0, W, H); ctx.save();
  ctx.beginPath(); ctx.rect(ox, oy, (b.x1 - b.x0) * scale, (b.y1 - b.y0) * scale); ctx.clip();
  const [fieldLeft, fieldTop] = xy({ x: 0, y: 160 / 3 });
  ctx.fillStyle = '#204f32'; ctx.fillRect(fieldLeft, fieldTop, 120 * scale, (160 / 3) * scale);
  for (let x = 10; x < 110; x += 5) {
    ctx.fillStyle = (x / 5) % 2 ? '#244f32' : '#285737';
    ctx.fillRect(fieldLeft + x * scale, fieldTop, 5 * scale, (160 / 3) * scale);
  }
  ctx.fillStyle = '#183e29'; ctx.fillRect(fieldLeft, fieldTop, 10 * scale, (160 / 3) * scale);
  ctx.fillRect(fieldLeft + 110 * scale, fieldTop, 10 * scale, (160 / 3) * scale);
  ctx.strokeStyle = '#d6e5c34a'; ctx.lineWidth = 1;
  for (let x = 0; x <= 120; x += 5) {
    const [px, py] = xy({ x, y: 160 / 3 }), [, bottom] = xy({ x, y: 0 });
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, bottom); ctx.stroke();
  }
  ctx.strokeStyle = '#d6e5c35c';
  for (let x = 11; x < 110; x++) for (const y of [1, 23.58, 29.75, 52.33]) {
    const [px, py] = xy({ x, y });
    ctx.beginPath(); ctx.moveTo(px, py - .22 * scale); ctx.lineTo(px, py + .22 * scale); ctx.stroke();
  }
  ctx.strokeRect(fieldLeft, fieldTop, 120 * scale, (160 / 3) * scale);
  ctx.strokeStyle = '#e9e6cb90'; ctx.setLineDash([5, 4]); ctx.beginPath();
  const [lineX, lineTop] = xy({ x: current.line_of_scrimmage, y: 160 / 3 });
  ctx.moveTo(lineX, lineTop); ctx.lineTo(lineX, xy({ x: 0, y: 0 })[1]); ctx.stroke(); ctx.setLineDash([]);
  const gainLine = current.situation.line_to_gain;
  if (gainLine != null) {
    const [gainX, gainTop] = xy({ x: gainLine, y: 160 / 3 });
    ctx.strokeStyle = '#78cfff'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]); ctx.beginPath();
    ctx.moveTo(gainX, gainTop); ctx.lineTo(gainX, xy({ x: 0, y: 0 })[1]); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.strokeStyle = '#c0ee7955'; ctx.lineWidth = 2; ctx.setLineDash([]); ctx.beginPath();
  [...allFrames.slice(0, index + 1), ...(f.interpolated ? [f] : [])].forEach((p, i) => { const [x, y] = xy(p); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#c0ee79'; ctx.lineWidth = 3; ctx.beginPath();
  [...allFrames.slice(Math.max(0, index - 10), index + 1), ...(f.interpolated ? [f] : [])].forEach((p, i) => {
    const [x, y] = xy(p); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }); ctx.stroke();
  if (afterThrow) drawFlight(ctx, xy, scenario, current, index, f);
  const receiver = f.players.find(p => p.id === current.route.nflId);
  const thrower = current.thrower && f.players.find(p => p.id === current.thrower.id);
  const nearest = f.players.find(p => p.id === f.nearest);
  if (receiver && nearest && !afterThrow) {
    const [x1, y1] = xy(receiver), [x2, y2] = xy(nearest);
    ctx.strokeStyle = '#e6bc70'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.fillStyle = '#c0ee791a'; ctx.beginPath(); ctx.arc(x1, y1, 2 * scale, 0, 2 * Math.PI); ctx.fill(); ctx.lineWidth = 1; ctx.stroke();
  }
  // Paint the selected players last so contextual dots cannot cover their identities.
  const paintOrder = p => p.id === current.route.nflId ? 4 : p.id === current.thrower?.id ? 3 : p.id === f.nearest ? 2 : 1;
  [...f.players].sort((a, b) => paintOrder(a) - paintOrder(b)).forEach(p => {
    const [x, y] = xy(p), active = p.id === current.route.nflId, passing = p.id === current.thrower?.id;
    const focused = active || passing || p.id === f.nearest || p.side === 'ball';
    ctx.globalAlpha = projected ? .3 : focused ? 1 : .8;
    ctx.beginPath(); ctx.arc(x, y, active ? 11 : passing ? 10 : p.side === 'ball' ? 4 : 7, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#c0ee79' : passing ? '#ba9bec' : p.side === 'offense' ? '#8bb9d1' : p.side === 'defense' ? '#eb9d7d' : '#e6bc70';
    ctx.fill(); ctx.strokeStyle = '#eff2d8'; ctx.lineWidth = 1; ctx.stroke();
    if (active || passing) { ctx.strokeStyle = active ? '#c0ee79' : '#ba9bec'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.stroke(); }
    if (p.id === f.nearest && !afterThrow) { ctx.strokeStyle = '#e6bc70'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke(); }
    if (p.side !== 'ball') { ctx.fillStyle = '#102117'; ctx.font = 'bold ' + (active || passing ? 11 : 9) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText(p.label, x, y + 3); }
    ctx.globalAlpha = 1;
  });
  drawScenarioPoints(ctx, xy, scenario);
  ctx.restore(); ctx.textAlign = 'center'; ctx.fillStyle = '#e5ebc9b0'; ctx.font = 'bold 16px system-ui';
  for (let x = 20; x <= 100; x += 10) {
    const [px] = xy({ x, y: 0 });
    if (px > pad && px < W - pad) ctx.fillText(String(Math.min(x - 10, 110 - x)), px, H - oy + 17);
  }
  ctx.save(); ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const labels = [];
  const labeledPlayers = [[thrower, projected ? 'Last thrower' : 'Thrower', '#ba9bec', 22], [receiver, projected ? 'Last receiver' : 'Receiver', '#c0ee79', -40]];
  if (scenario) labeledPlayers.push([scenario.projectedBall, 'Ball projection', '#e6bc70', 22],
    [scenario.projectedReceiver, 'Receiver projection', '#c0ee79', -40]);
  for (const [player, role, color, offset] of labeledPlayers) {
    if (!player) continue;
    const [px, py] = xy(player), label = role + (player.label ? ' #' + player.label : '');
    const width = Math.ceil(ctx.measureText(label).width) + 14;
    const x = Math.max(4, Math.min(W - width - 4, px - width / 2));
    let y = Math.max(4, Math.min(H - 26, py + offset));
    for (const box of labels) {
      if (x < box.x + box.width + 4 && x + width + 4 > box.x && y < box.y + 26 && y + 26 > box.y) {
        y = box.y - 26 >= 4 ? box.y - 26 : Math.min(H - 26, box.y + 26);
      }
    }
    labels.push({ x, y, width });
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(px, py); ctx.lineTo(x + width / 2, y + 11); ctx.stroke();
    ctx.fillStyle = '#102719f5'; ctx.fillRect(x, y, width, 22); ctx.strokeRect(x, y, width, 22);
    ctx.fillStyle = color; ctx.fillText(label, x + 7, y + 11);
  }
  ctx.restore();
  ctx.save(); ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
  for (const [worldX, label, color] of [[current.line_of_scrimmage, 'START', '#e9e6cb'], [gainLine, 'TARGET: ' + current.situation.yards_to_go + ' YD', '#78cfff']]) {
    if (worldX == null) continue;
    const [px] = xy({ x: worldX, y: 0 }), labelWidth = ctx.measureText(label).width + 12;
    const x = Math.max(labelWidth / 2 + 2, Math.min(W - labelWidth / 2 - 2, px));
    const y = label === 'START' ? H - 28 : 4;
    ctx.fillStyle = '#102719'; ctx.fillRect(x - labelWidth / 2, y, labelWidth, 22);
    ctx.fillStyle = color; ctx.fillText(label, x, y + 15);
  }
  ctx.restore();
  el('flightBanner').hidden = false;
  el('flightBanner').textContent = scenario ? 'Projection +' + flightHorizon.toFixed(1) + ' s · dotted cone, not a landing' :
    'Solid paths: recorded motion' + (atEnd ? ' · projection unavailable' : ' · dotted cone follows tracking');
  canvas.dataset.throwerId = current.thrower?.id ?? '';
  canvas.dataset.receiverId = current.route.nflId;
  el('scrub').value = index;
  const playedFraction = index / playbackEndIndex(current);
  el('scrubTrack').style.setProperty('--played-position', (playedFraction * 100) + '%');
  el('scrubTrack').style.setProperty('--thumb-offset', (8 - 16 * playedFraction) + 'px');
  const tailLength = playbackEndIndex(current) - (allFrames.length - 1);
  el('scrubTrack').style.setProperty('--played-tail', (tailLength ? Math.max(0, Math.min(100, (index - (allFrames.length - 1)) / tailLength * 100)) : 0) + '%');
  el('scrubTrack').dataset.phase = projected ? 'projected' : 'recorded';
  el('clock').value = displayTime.toFixed(1) + ' / ' + playbackTime(current, playbackEndIndex(current)).toFixed(1) + ' s';
  const atThrow = index === current.review_cue.throw_frame_index;
  for (const id of ['storyEarlier', 'mobileEarlier']) el(id).setAttribute('aria-pressed', String(index === current.review_cue.earlier_frame_index));
  for (const id of ['storyThrow', 'mobileThrow']) el(id).setAttribute('aria-pressed', String(atThrow));
  const extra = current.post_release?.seconds_recorded || 0;
  const playbackStatus = projected ? 'Projection +' + flightHorizon.toFixed(1) + ' s after throw · tracking ended at +' + extra.toFixed(1) + ' s.' : afterThrow ? (atEnd ? 'Tracking ends +' + extra.toFixed(1) + ' s after the throw. Landing is not recorded.' :
    'Recorded positions +' + (f.t - current.route.observed_seconds).toFixed(1) + ' s after the throw.') :
    atThrow ? 'Throw — ' + extra.toFixed(1) + ' s of recorded tracking follows.' :
    'Replay includes ' + extra.toFixed(1) + ' s of recorded tracking after the throw.';
  if (el('playbackStatus').textContent !== playbackStatus) el('playbackStatus').textContent = playbackStatus;
  el('playbackStatus').setAttribute('aria-live', timer ? 'off' : 'polite');
  el('playbackStatus').dataset.phase = projected ? 'projected' : afterThrow ? 'after' : atThrow ? 'throw' : 'before';
  el('scrub').setAttribute('aria-valuetext', displayTime.toFixed(1) + ' seconds since play start; ' +
    (projected ? 'projected motion, not measured' : afterThrow ? 'recorded post-release positions' : atThrow ? 'throw' : 'before the throw'));
  el('flightReview').setAttribute('aria-pressed', String(afterThrow));
  el('flightControls').hidden = !(projected || (atEnd && afterThrow));
  el('flightLimit').hidden = !scenario;
  el('projectionTimeLabel').hidden = !projected;
  el('flightTime').textContent = flightHorizon.toFixed(1) + ' s';
  el('flightComparison').textContent = scenario ? 'Projected ball–receiver gap: ' + scenario.gap.toFixed(1) + ' yards.' + (scenario.outsideField ? ' The projected ball is outside the field.' : '') :
    current.post_release?.projection_unavailable || 'No projection available.';
  if (!timer) {
    el('play').textContent = atEnd ? 'Replay' : 'Play';
    el('play').setAttribute('aria-label', atEnd ? 'Replay from play start' : 'Play replay');
  }
  const requiredDepth = current.third_down_review ? Math.max(2, current.situation.yards_to_go) : 2;
  const valid = !projected && !f.interpolated && f.t >= 1 && f.t <= current.route.observed_seconds - .3 + 1e-8 && f.downfield >= requiredDepth;
  el('nearestReadout').textContent = f.separation.toFixed(2) + ' yd gap · ' + (nearest ? nearest.name : 'unknown');
  el('gateStatus').textContent = projected ? 'Projected motion · no spacing score' : f.interpolated ? 'Animated between recorded samples' : afterThrow ? 'After throw · excluded from spacing screen' : !valid ? 'This moment is not counted' :
    f.separation > 2 ? 'Gap above 2 yards at this moment' : 'Opponent within 2 yards';
  el('gateStatus').dataset.eligible = String(valid && f.separation > 2);
  const yardsShort = gainLine == null ? null : gainLine - f.x;
  const positionText = yardsShort == null ? 'Line unavailable' : Math.abs(yardsShort) < .05 ? 'At the first-down line' :
    (Math.round(Math.abs(yardsShort) * 10 + 1e-8) / 10).toFixed(1) + ' yd ' + (yardsShort > 0 ? 'short of' : 'beyond') + ' the first-down line';
  const ball = f.players.find(p => p.side === 'ball');
  el('nearestReadout').textContent = scenario ? 'Projected ball–receiver gap: ' + scenario.gap.toFixed(1) + ' yd' : afterThrow && ball ? 'Recorded ball–receiver gap: ' + Math.hypot(ball.x - f.x, ball.y - f.y).toFixed(1) + ' yd' : positionText + ' · ' + f.separation.toFixed(1) + ' yd nearest gap';
  el('frameEligibility').textContent = projected ? 'Projection only' : !valid ? 'Outside the time / position rules' :
    f.separation <= 2 ? 'Gap is too small to count' : 'Can contribute to an earlier gap';
  el('frameEligibilityNote').dataset.eligible = String(valid && f.separation > 2);
  el('frameExplanation').textContent = projected ? 'Assumed ball and receiver motion. Other players are frozen; no nearest-defender measurement or score is inferred.' : f.interpolated ? 'Animation interpolates two recorded frames. Only the recorded samples contribute to screening.' : afterThrow ? 'Recorded after the throw; never counted toward the earlier-spacing screen.' : f.t < 1 ? 'We do not count the first second of the play.' :
    f.t > current.route.observed_seconds - .3 + 1e-8 ? 'We do not count the final 0.3 seconds before the throw.' :
    f.downfield < requiredDepth ? 'The receiver has not reached the required downfield position (' + requiredDepth + ' yards), so it does not count.' :
    f.separation <= 2 ? 'The closest opponent is within 2 yards. This moment does not count toward an earlier gap.' :
    'The gap is more than 2 yards here. It must last at least half a second without a break to become a qualifying window.';
  canvas.setAttribute('aria-label', projected ? current.route.displayName + ' projected at ' + flightHorizon.toFixed(1) + ' seconds after throw. Dotted ball cone and straight receiver continuation; other players frozen at their last recorded positions. Projected ball to receiver gap ' + scenario.gap.toFixed(1) + ' yards. Not a landing prediction.' : current.route.displayName + ' at ' + f.t.toFixed(1) + ' seconds since snap; nearest defender ' +
    (nearest ? nearest.name : 'unknown') + ', ' + f.separation.toFixed(2) + ' yards away. Thrower: ' +
    (current.thrower ? current.thrower.name : 'unknown') + '. Selected receiver: ' + current.route.displayName +
    '. ' + el('downDistance').textContent + '. ' + positionText + '. ' + el('playSummary').textContent + ' All 22 players shown.' + (scenario ? ' Dotted paths are straight-motion projections at ' + flightHorizon.toFixed(1) + ' seconds after throw, not recorded landing positions. Projected ball to receiver gap ' + scenario.gap.toFixed(1) + ' yards.' : ''));
  canvas.dataset.lineToGain = gainLine ?? '';
  for (const [id, value] of Object.entries({ frameNumber: projected ? 'Projection' : f.interpolated ? 'Between ' + f.frame + ' and ' + (f.frame + 1) : f.frame, frameTime: displayTime.toFixed(1) + ' s',
    frameNearest: projected ? 'Not modeled' : nearest ? nearest.name : 'Unknown', frameGap: projected ? 'Not measured' : f.separation.toFixed(2) + ' yd',
    frameDepth: projected ? 'Not measured' : f.downfield.toFixed(1) + ' yd', frameTimeDepth: valid ? 'Eligible' : 'Excluded' })) {
    el(id).textContent = value;
  }
  const cursorTime = Math.round(displayTime * 10) / 10;
  if (cursorTime !== lastTimelinePosition) {
    lastTimelinePosition = cursorTime;
    Plotly.relayout('timeline', { 'shapes[0].x0': cursorTime, 'shapes[0].x1': cursorTime });
  }
}

async function loadReplay(id, scroll = false) {
  if (!replays.has(id)) return;
  const version = ++loadVersion;
  stop(); loading = true;
  for (const control of ['play', 'reset', 'scrub']) el(control).disabled = true;
  current = replays.get(id); index = current.review_cue.earlier_frame_index;
  const r = current.route;
  const situation = current.situation, downName = { 1: 'First', 2: 'Second', 3: 'Third', 4: 'Fourth' }[situation.down];
  const distance = situation.yards_to_go;
  el('downDistance').textContent = (downName ? downName + ' attempt' : 'Attempt unknown') + (distance == null ? '' :
    situation.goal_to_go ? '; reach the goal line' : ', ' + distance + (distance === 1 ? ' yard needed' : ' yards needed'));
  el('lineToGainLabel').textContent = situation.goal_to_go ? 'Blue line marks the goal' : 'Blue line marks the yards needed';
  el('lineToGainKey').hidden = situation.line_to_gain == null;
  const c = current.third_down_review.context;
  el('storyPlayMeta').textContent = 'Week ' + r.week + ' · Q' + c.quarter + ' ' + c.game_clock + ' · ' + c.away_team + ' ' + c.away_score + '–' + c.home_score + ' ' + c.home_team;
  setStory(current);
  const receiver = current.frames[0].players.find(p => p.id === r.nflId);
  el('selectedName').textContent = r.displayName + (receiver?.label ? ' #' + receiver.label : '');
  el('throwerName').textContent = current.thrower ? current.thrower.name +
    (current.thrower.jersey_number != null ? ' #' + current.thrower.jersey_number : '') : 'Not identified';
  el('throwerSource').textContent = current.thrower ? 'Recorded PFF “Pass” role' :
    'No unique recorded passer with matching offensive tracking; not inferred.';
  el('throwerPlayerId').textContent = current.thrower ? current.thrower.id : 'Not identified';
  for (const [id, value] of Object.entries({ contextTeam: r.possessionTeam, contextWeek: r.week,
    contextGame: r.gameId, contextPlay: r.playId, contextAlignment: r.alignment,
    contextCoverage: r.pff_passCoverage || 'Unknown' })) el(id).textContent = value;
  el('routeOrigin').textContent = id === model.featuredId ? 'Deliberately selected traditional-dropback illustration, not a typical play or a verified missed read.' : 'Reproducibly sampled failed play. Plays are ordered chronologically, not by opportunity or receiver quality.';
  el('releaseMetric').textContent = r.release_separation.toFixed(1) + ' yd gap';
  el('historyMetric').textContent = (current.third_down_review?.conversion_window.duration_seconds ?? r.longest_2_0).toFixed(1) + ' s';
  el('routeExplanation').textContent = current.third_down_review ?
    'This window is beyond the first-down line. It identifies a moment to inspect on film, not proof that a pass was available.' :
    'Original study example: its earlier spacing rule requires at least 2 yards downfield, regardless of the first-down line.';
  el('description').textContent = r.playDescription;
  el('releaseSource').textContent = r.release_source;
  el('scrub').max = playbackEndIndex(current);
  const recordedEnd = recordedFrames(current).length - 1, replayEnd = playbackEndIndex(current);
  el('scrubTrack').style.setProperty('--recorded-end', (recordedEnd / replayEnd * 100) + '%');
  el('scrubTrack').style.setProperty('--recorded-offset', (8 - 16 * recordedEnd / replayEnd) + 'px');
  el('scrubTrack').dataset.hasProjection = String(recordedEnd < replayEnd);
  lastTimelinePosition = null;
  el('flightReview').disabled = !current.post_release?.frames.length;
  flightHorizon = 0;
  const sustained = [current.third_down_review.conversion_window];
  el('windowSummary').textContent = sustained.length ? 'First sustained spacing: ' + sustained.map(w =>
    ((w.start_frame - r.snap) / 10).toFixed(1) + '–' + ((w.end_frame - r.snap) / 10).toFixed(1) +
    ' s (' + w.duration_seconds.toFixed(1) + ' s)').join('; ') + ' after the play starts.' : 'No lasting earlier gap meets all five rules.';
  renderQueue();
  const shapes = [
    { type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, yref: 'paper', line: { color: '#f2f0e6', width: 2 } },
    { type: 'line', x0: 0, x1: r.observed_seconds, y0: 2, y1: 2, line: { color: '#899a82', dash: 'dash' } },
    { type: 'rect', x0: 0, x1: 1, y0: 0, y1: 1, yref: 'paper', fillcolor: '#ddd', opacity: .35, line: { width: 0 }, layer: 'below' },
    { type: 'rect', x0: r.observed_seconds - .3, x1: r.observed_seconds, y0: 0, y1: 1, yref: 'paper', fillcolor: '#ddd', opacity: .35, line: { width: 0 }, layer: 'below' },
    { type: 'rect', x0: r.observed_seconds, x1: recordedFrames(current).at(-1).t, y0: 0, y1: 1, yref: 'paper', fillcolor: '#e6bc70', opacity: .13, line: { width: 0 }, layer: 'below' },
    { type: 'rect', x0: recordedFrames(current).at(-1).t, x1: playbackTime(current, playbackEndIndex(current)), y0: 0, y1: 1, yref: 'paper', fillcolor: '#e6bc70', opacity: .06, line: { width: 1, color: '#e6bc70', dash: 'dot' }, layer: 'below' }
  ];
  sustained.forEach(w => shapes.push({ type: 'rect', x0: (w.start_frame - r.snap) / 10,
    x1: (w.end_frame - r.snap) / 10, y0: 0, y1: 1, yref: 'paper', fillcolor: '#c0ee79',
    opacity: .2, line: { width: 0 }, layer: 'below' }));
  const replay = current;
  await Plotly.react('timeline', [
    { x: replay.frames.map(f => f.t), y: replay.frames.map(f => f.separation), mode: 'lines+markers',
      marker: { size: 4 }, line: { color: '#c0ee79' }, name: 'Nearest-defender spacing',
      hovertemplate: '%{x:.1f} s · %{y:.2f} yd<extra></extra>' },
    { x: [r.observed_seconds], y: [r.release_separation], mode: 'markers',
      marker: { color: '#e6bc70', size: 9 }, name: 'Throw · recorded flight follows' },
    { x: [replay.frames[replay.frames.length - 1], ...replay.post_release.frames].map(f => f.t),
      y: [replay.frames[replay.frames.length - 1], ...replay.post_release.frames].map(f => f.separation),
      mode: 'lines+markers', line: { color: '#e6bc70' }, marker: { size: 4 },
      hovertemplate: '%{x:.1f} s · %{y:.2f} yd · after throw, excluded<extra></extra>', name: 'Recorded after throw · excluded' }
    ], { margin: { l: 34, r: 24, t: 12, b: 32 }, font: chartFont,
    xaxis: { title: { text: 'Seconds after snap', font: { size: 10 } }, range: [0, playbackTime(replay, playbackEndIndex(replay)) + .1],
      tickfont: { size: 10 }, gridcolor: '#304239', zeroline: false, automargin: true },
    yaxis: { title: { text: 'yd', font: { size: 10 } }, rangemode: 'tozero',
      tickfont: { size: 10 }, gridcolor: '#304239', zeroline: false, automargin: true }, shapes,
    annotations: [{ x: 1, xref: 'paper', y: 2, text: '2 yd', showarrow: false,
      yanchor: 'bottom', xanchor: 'right', font: { size: 10, color: '#a3b1aa' }, bgcolor: '#0c1512' }],
    showlegend: false, paper_bgcolor: '#0c1512', plot_bgcolor: '#0c1512' }, { ...plotConfig, displayModeBar: false });
  if (version !== loadVersion) return;
  loading = false;
  for (const control of ['play', 'reset', 'scrub']) el(control).disabled = false;
  el('loadingStatus').hidden = true;
  draw();
  if (scroll) {
    el('replaySection').focus({ preventScroll: true });
    el('replaySection').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
  }
}

el('flightReview').onclick = () => {
  jumpToFrame(current.review_cue.throw_frame_index);
  startPlayback();
  el('field').scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
};
el('scrub').oninput = e => { stop(); index = Math.round(Number(e.target.value)); draw(); };
el('scrub').onkeydown = e => {
  const movement = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };
  if (!(e.key in movement) && e.key !== 'Home' && e.key !== 'End') return;
  e.preventDefault(); stop();
  index = e.key === 'Home' ? 0 : e.key === 'End' ? playbackEndIndex(current) : Math.max(0, Math.min(playbackEndIndex(current), index + movement[e.key]));
  draw();
};
el('reset').onclick = () => { stop(); index = 0; draw(); };
for (const [id, view] of [['fitView', 'fit'], ['fullView', 'full']]) {
  el(id).onclick = () => {
    fieldView = view;
    el('fitView').setAttribute('aria-pressed', String(view === 'fit'));
    el('fullView').setAttribute('aria-pressed', String(view === 'full'));
    draw();
  };
}
new ResizeObserver(() => draw()).observe(el('field').parentElement);
function startPlayback() {
  if (loading || timer) return;
  if (index >= playbackEndIndex(current)) index = 0;
  el('play').textContent = 'Pause'; el('play').setAttribute('aria-label', 'Pause replay');
  el('play').dataset.playing = 'true';
  let previousTime = null;
  const tick = now => {
    if (previousTime !== null) index += Math.min(now - previousTime, 80) / 100;
    previousTime = now;
    if (index >= playbackEndIndex(current)) { index = playbackEndIndex(current); stop(); draw(); return; }
    draw(); timer = requestAnimationFrame(tick);
  };
  timer = requestAnimationFrame(tick); draw();
}
el('play').onclick = () => { if (timer) { stop(); draw(); } else startPlayback(); };

el('commit').textContent = model.sourceCommit;
loadReplay(model.featuredId);
if (location.hash) revealSection(location.hash);
