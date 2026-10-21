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
const fieldBounds = new Map();

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
    name.textContent = r.possessionTeam + ' · 3rd & ' + r.yards_to_go + ' → ' + r.outcome.label;
    const meta = document.createElement('p'); meta.className = 'route-meta';
    meta.textContent = 'Week ' + r.week + ' · Q' + c.quarter + ' ' + c.game_clock + ' · ' + c.away_team + ' ' + c.away_score + '–' + c.home_score + ' ' + c.home_team;
    const context = document.createElement('p'); context.className = 'route-window';
    context.textContent = contextLabels[c.dropback_group] + ' · ' + c.pressure_note;
    const window = document.createElement('p'); window.className = 'route-window';
    window.textContent = 'Throw ' + r.observed_seconds.toFixed(1) + ' s · game ' + r.gameId + ' / play ' + r.playId;
    card.append(name, meta, context, window);
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
  if (timer) clearInterval(timer);
  timer = null; el('play').textContent = 'Play'; el('play').setAttribute('aria-label', 'Play replay');
  el('play').dataset.playing = 'false';
}

function boundsFor(replay) {
  if (fieldBounds.has(replay.id)) return fieldBounds.get(replay.id);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const frame of replay.frames) for (const p of frame.players) {
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
  const f = current.frames[index], canvas = el('field'), rect = canvas.getBoundingClientRect();
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
  ctx.strokeStyle = '#c0ee7955'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath();
  current.frames.slice(0, index + 1).forEach((p, i) => { const [x, y] = xy(p); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#c0ee79'; ctx.lineWidth = 3; ctx.beginPath();
  current.frames.slice(Math.max(0, index - 10), index + 1).forEach((p, i) => {
    const [x, y] = xy(p); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }); ctx.stroke();
  const receiver = f.players.find(p => p.id === current.route.nflId);
  const thrower = current.thrower && f.players.find(p => p.id === current.thrower.id);
  const nearest = f.players.find(p => p.id === f.nearest);
  if (receiver && nearest) {
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
    ctx.globalAlpha = focused ? 1 : .8;
    ctx.beginPath(); ctx.arc(x, y, active ? 11 : passing ? 10 : p.side === 'ball' ? 4 : 7, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#c0ee79' : passing ? '#ba9bec' : p.side === 'offense' ? '#8bb9d1' : p.side === 'defense' ? '#eb9d7d' : '#e6bc70';
    ctx.fill(); ctx.strokeStyle = '#eff2d8'; ctx.lineWidth = 1; ctx.stroke();
    if (active || passing) { ctx.strokeStyle = active ? '#c0ee79' : '#ba9bec'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.stroke(); }
    if (p.id === f.nearest) { ctx.strokeStyle = '#e6bc70'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke(); }
    if (p.side !== 'ball') { ctx.fillStyle = '#102117'; ctx.font = 'bold ' + (active || passing ? 11 : 9) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText(p.label, x, y + 3); }
    ctx.globalAlpha = 1;
  });
  ctx.restore(); ctx.textAlign = 'center'; ctx.fillStyle = '#e5ebc9b0'; ctx.font = 'bold 16px system-ui';
  for (let x = 20; x <= 100; x += 10) {
    const [px] = xy({ x, y: 0 });
    if (px > pad && px < W - pad) ctx.fillText(String(Math.min(x - 10, 110 - x)), px, H - oy + 17);
  }
  ctx.save(); ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const labels = [];
  for (const [player, role, color, offset] of [[thrower, 'Thrower', '#ba9bec', 22], [receiver, 'Receiver', '#c0ee79', -40]]) {
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
  canvas.dataset.throwerId = current.thrower?.id ?? '';
  canvas.dataset.receiverId = current.route.nflId;
  el('scrub').value = index;
  el('clock').value = f.t.toFixed(1) + ' / ' + current.route.observed_seconds.toFixed(1) + ' s';
  const atThrow = index === current.frames.length - 1;
  for (const id of ['storyEarlier', 'mobileEarlier']) el(id).setAttribute('aria-pressed', String(index === current.review_cue.earlier_frame_index));
  for (const id of ['storyThrow', 'mobileThrow']) el(id).setAttribute('aria-pressed', String(atThrow));
  const playbackStatus = atThrow ? 'Throw — replay ends before ball flight.' :
    'Replay stops at the throw, before ball flight.';
  if (el('playbackStatus').textContent !== playbackStatus) el('playbackStatus').textContent = playbackStatus;
  el('playbackStatus').dataset.phase = atThrow ? 'throw' : 'before';
  el('scrub').setAttribute('aria-valuetext', f.t.toFixed(1) + ' seconds since play start; ' +
    (atThrow ? 'throw, replay ends' : 'before the throw'));
  if (!timer) {
    el('play').textContent = atThrow ? 'Replay' : 'Play';
    el('play').setAttribute('aria-label', atThrow ? 'Replay from play start' : 'Play replay');
  }
  const requiredDepth = current.third_down_review ? Math.max(2, current.situation.yards_to_go) : 2;
  const valid = f.t >= 1 && f.t <= current.route.observed_seconds - .3 + 1e-8 && f.downfield >= requiredDepth;
  el('nearestReadout').textContent = f.separation.toFixed(2) + ' yd gap · ' + (nearest ? nearest.name : 'unknown');
  el('gateStatus').textContent = !valid ? 'This moment is not counted' :
    f.separation > 2 ? 'Gap above 2 yards at this moment' : 'Opponent within 2 yards';
  el('gateStatus').dataset.eligible = String(valid && f.separation > 2);
  const yardsShort = gainLine == null ? null : gainLine - f.x;
  const positionText = yardsShort == null ? 'Line unavailable' : Math.abs(yardsShort) < .05 ? 'At the first-down line' :
    (Math.round(Math.abs(yardsShort) * 10 + 1e-8) / 10).toFixed(1) + ' yd ' + (yardsShort > 0 ? 'short of' : 'beyond') + ' the first-down line';
  el('nearestReadout').textContent = positionText + ' · ' + f.separation.toFixed(1) + ' yd nearest gap';
  el('frameEligibility').textContent = !valid ? 'Outside the time / position rules' :
    f.separation <= 2 ? 'Gap is too small to count' : 'Can contribute to an earlier gap';
  el('frameEligibilityNote').dataset.eligible = String(valid && f.separation > 2);
  el('frameExplanation').textContent = f.t < 1 ? 'We do not count the first second of the play.' :
    f.t > current.route.observed_seconds - .3 + 1e-8 ? 'We do not count the final 0.3 seconds before the throw.' :
    f.downfield < requiredDepth ? 'The receiver has not reached the required downfield position (' + requiredDepth + ' yards), so it does not count.' :
    f.separation <= 2 ? 'The closest opponent is within 2 yards. This moment does not count toward an earlier gap.' :
    'The gap is more than 2 yards here. It must last at least half a second without a break to become a qualifying window.';
  canvas.setAttribute('aria-label', current.route.displayName + ' at ' + f.t.toFixed(1) + ' seconds since snap; nearest defender ' +
    (nearest ? nearest.name : 'unknown') + ', ' + f.separation.toFixed(2) + ' yards away. Thrower: ' +
    (current.thrower ? current.thrower.name : 'unknown') + '. Selected receiver: ' + current.route.displayName +
    '. ' + el('downDistance').textContent + '. ' + positionText + '. ' + el('playSummary').textContent + ' All 22 players shown.');
  canvas.dataset.lineToGain = gainLine ?? '';
  for (const [id, value] of Object.entries({ frameNumber: f.frame, frameTime: f.t.toFixed(1) + ' s',
    frameNearest: nearest ? nearest.name : 'Unknown', frameGap: f.separation.toFixed(2) + ' yd',
    frameDepth: f.downfield.toFixed(1) + ' yd', frameTimeDepth: valid ? 'Eligible' : 'Excluded' })) {
    el(id).textContent = value;
  }
  Plotly.relayout('timeline', { 'shapes[0].x0': f.t, 'shapes[0].x1': f.t });
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
  el('scrub').max = current.frames.length - 1;
  const sustained = [current.third_down_review.conversion_window];
  el('windowSummary').textContent = sustained.length ? 'First sustained spacing: ' + sustained.map(w =>
    ((w.start_frame - r.snap) / 10).toFixed(1) + '–' + ((w.end_frame - r.snap) / 10).toFixed(1) +
    ' s (' + w.duration_seconds.toFixed(1) + ' s)').join('; ') + ' after the play starts.' : 'No lasting earlier gap meets all five rules.';
  renderQueue();
  const shapes = [
    { type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, yref: 'paper', line: { color: '#f2f0e6', width: 2 } },
    { type: 'line', x0: 0, x1: r.observed_seconds, y0: 2, y1: 2, line: { color: '#899a82', dash: 'dash' } },
    { type: 'rect', x0: 0, x1: 1, y0: 0, y1: 1, yref: 'paper', fillcolor: '#ddd', opacity: .35, line: { width: 0 }, layer: 'below' },
    { type: 'rect', x0: r.observed_seconds - .3, x1: r.observed_seconds, y0: 0, y1: 1, yref: 'paper', fillcolor: '#ddd', opacity: .35, line: { width: 0 }, layer: 'below' }
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
      marker: { color: '#e6bc70', size: 9 }, name: 'Throw · replay ends' }
    ], { margin: { l: 34, r: 24, t: 12, b: 32 }, font: chartFont,
    xaxis: { title: { text: 'Seconds after snap', font: { size: 10 } }, range: [0, r.observed_seconds + .1],
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

el('scrub').oninput = e => { stop(); index = Number(e.target.value); draw(); };
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
el('play').onclick = () => {
  if (timer) { stop(); return; }
  if (loading) return;
  if (index >= current.frames.length - 1) index = 0;
  el('play').textContent = 'Pause'; el('play').setAttribute('aria-label', 'Pause replay');
  el('play').dataset.playing = 'true';
  timer = setInterval(() => {
    index++;
    if (index >= current.frames.length - 1) { index = current.frames.length - 1; stop(); }
    draw();
  }, 100);
  draw();
};

el('commit').textContent = model.sourceCommit;
loadReplay(model.featuredId);
if (location.hash) revealSection(location.hash);
