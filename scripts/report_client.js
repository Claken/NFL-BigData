/* Embedded into the standalone report by report.py; no network requests. */
const model = __MODEL__;
const el = id => document.getElementById(id);
const percent = x => x == null ? 'n/a' : (100 * x).toFixed(1) + '%';
const fmt = x => Number(x).toLocaleString('en-US');
const replays = new Map(model.replays.map(replay => [replay.id, replay]));
const examples = model.exampleIds.map(id => replays.get(id));
const queueById = new Map(model.queue.map(route => [route.replay_id, route]));
const plotConfig = {
  responsive: true, displaylogo: false,
  modeBarButtonsToRemove: ['sendDataToCloud', 'select2d', 'lasso2d']
};
const chartFont = { family: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', size: 12, color: '#a3b1aa' };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let index = 0, timer = null, current = null, loadVersion = 0, loading = false, fieldView = 'fit';
const fieldBounds = new Map();

function setStory(replay) {
  const cue = replay.review_cue, r = replay.route;
  const earlier = replay.frames[cue.earlier_frame_index], thrown = replay.frames[cue.throw_frame_index];
  const review = replay.frames[cue.review_frame_index];
  el('storyHeading').innerText = cue.has_window ? 'Space earlier.\nTight at the throw.' : 'Same receiver.\nDifferent history.';
  el('earlierLabel').textContent = cue.has_window ? 'Earlier space' : 'Earlier view';
  el('earlierGap').textContent = earlier.separation.toFixed(2) + ' yd';
  el('earlierTime').textContent = earlier.t.toFixed(1) + ' s after snap';
  el('throwTime').textContent = thrown.t.toFixed(1) + ' s after snap';
  el('reviewActionTitle').textContent = cue.has_window ? 'Start film at ' + review.t.toFixed(1) + ' s' : 'Review the full route';
  el('reviewQuestion').textContent = cue.has_window ? 'Check the passing lane and quarterback timing.' :
    'No lasting earlier gap meets the rules. What limited the space?';
  el('reviewMoment').textContent = cue.has_window ? '↶ Jump to the window' : '↶ Watch from the start';
  el('reviewCueText').value = r.displayName + ' · ' + r.possessionTeam + ' · Week ' + r.week +
    '\nGame ' + r.gameId + ' · Play ' + r.playId + '\n' + el('downDistance').textContent +
    '\nReview from ' + review.t.toFixed(1) + ' s after snap. Throw at ' + thrown.t.toFixed(1) + ' s.' +
    (cue.has_window ? '\nEarlier gap: ' + r.longest_2_0.toFixed(1) + ' s under the spacing rules. Check passing lane and quarterback timing.' :
      '\nNo qualifying earlier gap. Review what limited the space.') +
    '\nTracking cue only; not proof of an available or missed pass.';
  el('cueStatus').textContent = '';
}

function jumpToFrame(frameIndex) {
  if (!current || loading) return;
  stop(); index = frameIndex; draw();
}
el('storyEarlier').onclick = () => jumpToFrame(current.review_cue.earlier_frame_index);
el('storyThrow').onclick = () => jumpToFrame(current.review_cue.throw_frame_index);
el('reviewMoment').onclick = () => jumpToFrame(current.review_cue.review_frame_index);
el('copyCue').onclick = async () => {
  try {
    await navigator.clipboard.writeText(el('reviewCueText').value);
    el('cueStatus').textContent = 'Film-review cue copied.';
  } catch {
    el('reviewCueText').closest('details').open = true;
    el('reviewCueText').focus(); el('reviewCueText').select();
    el('cueStatus').textContent = 'Select and copy the cue below.';
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
for (const id of ['queueDrawer', 'evidenceDrawer']) el(id).addEventListener('toggle', () => {
  if (el(id).open) requestAnimationFrame(() => {
    for (const chart of ['timeline', 'scatter']) if (el(chart).data) Plotly.Plots.resize(el(chart));
  });
});

function table(headers, rows) {
  const t = document.createElement('table'), head = document.createElement('tr');
  const thead = document.createElement('thead'), tbody = document.createElement('tbody');
  headers.forEach(h => { const c = document.createElement('th'); c.scope = 'col'; c.textContent = h; head.append(c); });
  thead.append(head); t.append(thead, tbody);
  rows.forEach(row => {
    const tr = document.createElement('tr');
    row.forEach(value => { const c = document.createElement('td'); c.textContent = value; tr.append(c); });
    tbody.append(tr);
  });
  return t;
}

function options(id, values, allLabel) {
  const select = el(id), all = document.createElement('option');
  all.value = ''; all.textContent = allLabel; select.append(all);
  values.forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value; option.textContent = label; select.append(option);
  });
}

function renderQueue() {
  const filters = [el('receiverFilter').value, el('alignmentFilter').value, el('coverageFilter').value];
  const routes = model.queue.filter(r =>
    (!filters[0] || String(r.nflId) === filters[0]) &&
    (!filters[1] || r.alignment === filters[1]) &&
    (!filters[2] || (r.pff_passCoverage || 'Unknown') === filters[2]));
  el('queueRows').replaceChildren();
  routes.forEach(r => {
    const card = document.createElement('article'); card.className = 'route-card';
    card.setAttribute('role', 'listitem'); card.dataset.replayId = r.replay_id;
    card.setAttribute('aria-current', String(current?.id === r.replay_id));
    const header = document.createElement('div'); header.className = 'route-card-header';
    const name = document.createElement('p'); name.className = 'route-name'; name.textContent = r.displayName;
    const rank = document.createElement('span'); rank.className = 'route-rank'; rank.textContent = 'Queue #' + r.queue_rank;
    header.append(name, rank);
    const meta = document.createElement('p'); meta.className = 'route-meta';
    meta.textContent = r.possessionTeam + ' · Week ' + r.week + ' · Play ' + r.playId;
    const tags = document.createElement('div'); tags.className = 'route-tags';
    for (const label of [r.alignment, r.pff_passCoverage || 'Unknown']) {
      const tag = document.createElement('span'); tag.textContent = label; tags.append(tag);
    }
    const metrics = document.createElement('div'); metrics.className = 'route-numbers';
    for (const [value, label] of [[r.longest_2_0.toFixed(1) + ' s', 'lasting gap earlier'], [r.release_separation.toFixed(2) + ' yd', 'gap at the throw']]) {
      const metric = document.createElement('div'), b = document.createElement('b'), caption = document.createElement('span');
      b.textContent = value; caption.textContent = label; metric.append(b, caption); metrics.append(metric);
    }
    const window = document.createElement('p'); window.className = 'route-window';
    window.textContent = 'Window ' + r.window_start_seconds.toFixed(1) + '–' + r.window_end_seconds.toFixed(1) +
      ' s after play starts · throw at ' + r.observed_seconds.toFixed(1) + ' s\nGame ' + r.gameId;
    window.style.whiteSpace = 'pre-line';
    const button = document.createElement('button');
    button.textContent = current?.id === r.replay_id ? 'Viewing this route ✓' : 'Watch route →';
    button.setAttribute('aria-label', 'Replay ' + r.displayName + ', game ' + r.gameId + ', play ' + r.playId);
    button.setAttribute('aria-pressed', String(current?.id === r.replay_id));
    button.onclick = () => loadReplay(r.replay_id, true);
    card.append(header, meta, tags, metrics, window, button); el('queueRows').append(card);
  });
  el('queueCount').textContent = routes.length + ' of ' + model.queue.length + ' queued routes';
  el('queueEmpty').hidden = routes.length !== 0;
  el('clearFilters').disabled = !filters.some(Boolean);
}

const receivers = [...new Map(model.queue.map(r => [String(r.nflId), r.displayName])).entries()]
  .sort((a, b) => a[1].localeCompare(b[1]));
options('receiverFilter', receivers, 'All receivers');
for (const [id, field, label] of [
  ['alignmentFilter', 'alignment', 'All'], ['coverageFilter', 'pff_passCoverage', 'All']
]) {
  options(id, [...new Set(model.queue.map(r => r[field] || 'Unknown'))].sort().map(v => [v, v]), label);
}
for (const id of ['receiverFilter', 'alignmentFilter', 'coverageFilter']) el(id).onchange = renderQueue;
el('clearFilters').onclick = () => {
  for (const id of ['receiverFilter', 'alignmentFilter', 'coverageFilter']) el(id).value = '';
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
  const b = boundsFor(current)[fieldView], pad = 24;
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
  f.players.forEach(p => {
    const [x, y] = xy(p), active = p.id === current.route.nflId, passing = p.id === current.thrower?.id;
    const focused = active || passing || p.id === f.nearest || p.side === 'ball';
    ctx.globalAlpha = focused ? 1 : .66;
    ctx.beginPath(); ctx.arc(x, y, active ? 13 : passing ? 11 : p.side === 'ball' ? 4 : 9, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#c0ee79' : passing ? '#ba9bec' : p.side === 'offense' ? '#8bb9d1' : p.side === 'defense' ? '#eb9d7d' : '#e6bc70';
    ctx.fill(); ctx.strokeStyle = '#eff2d8'; ctx.lineWidth = 1; ctx.stroke();
    if (active || passing) { ctx.strokeStyle = active ? '#c0ee79' : '#ba9bec'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.stroke(); }
    if (p.side !== 'ball') { ctx.fillStyle = '#102117'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(p.label, x, y + 4); }
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
  canvas.dataset.throwerId = current.thrower?.id ?? '';
  canvas.dataset.receiverId = current.route.nflId;
  el('scrub').value = index;
  el('clock').value = f.t.toFixed(1) + ' / ' + current.route.observed_seconds.toFixed(1) + ' s';
  const atThrow = index === current.frames.length - 1;
  el('storyEarlier').setAttribute('aria-pressed', String(index === current.review_cue.earlier_frame_index));
  el('storyThrow').setAttribute('aria-pressed', String(atThrow));
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
  const valid = f.t >= 1 && f.t <= current.route.observed_seconds - .3 + 1e-8 && f.downfield >= 2;
  el('nearestReadout').textContent = f.separation.toFixed(2) + ' yd gap · ' + (nearest ? nearest.name : 'unknown');
  el('gateStatus').textContent = !valid ? 'This moment is not counted' :
    f.separation > 2 ? 'Gap above 2 yards at this moment' : 'Opponent within 2 yards';
  el('gateStatus').dataset.eligible = String(valid && f.separation > 2);
  const speed = f.receiver_speed_yards_per_second, rate = f.gap_change_yards_per_second;
  el('receiverSpeed').textContent = speed == null ? 'Unavailable' : (speed * 3600 / 1760).toFixed(1) + ' mph';
  el('receiverSpeedDetail').textContent = speed == null ? 'No valid recorded speed' : speed.toFixed(1) + ' yd/s · at this frame';
  el('gapTrend').textContent = { opening: '↗ Opening', closing: '↘ Closing', steady: '→ Steady', unknown: 'Not yet measured' }[f.gap_trend];
  el('gapTrendCard').dataset.trend = f.gap_trend;
  el('gapTrendRate').textContent = rate == null ? 'Needs 0.3 s of history' :
    (rate > 0 ? '+' : '') + rate.toFixed(1) + ' yd/s · past 0.3 s';
  el('firstDownDistanceLabel').textContent = current.situation.goal_to_go ? 'To goal line' : 'To first-down line';
  const yardsShort = gainLine == null ? null : gainLine - f.x;
  el('firstDownDistance').textContent = yardsShort == null ? 'Unavailable' : Math.abs(yardsShort) < .05 ? 'At the line' :
    Math.abs(yardsShort).toFixed(1) + ' yd ' + (yardsShort > 0 ? 'short' : 'beyond');
  el('frameEligibility').textContent = !valid ? 'Outside the time / position rules' :
    f.separation <= 2 ? 'Gap is too small to count' : 'Can contribute to an earlier gap';
  el('frameEligibilityNote').dataset.eligible = String(valid && f.separation > 2);
  el('frameExplanation').textContent = f.t < 1 ? 'We do not count the first second of the play.' :
    f.t > current.route.observed_seconds - .3 + 1e-8 ? 'We do not count the final 0.3 seconds before the throw.' :
    f.downfield < 2 ? 'The receiver is less than 2 yards beyond the starting line at this moment, so it does not count.' :
    f.separation <= 2 ? 'The closest opponent is within 2 yards. This moment does not count toward an earlier gap.' :
    'The gap is more than 2 yards here. It must last at least half a second without a break to become a qualifying window.';
  canvas.setAttribute('aria-label', current.route.displayName + ' at ' + f.t.toFixed(1) + ' seconds since snap; nearest defender ' +
    (nearest ? nearest.name : 'unknown') + ', ' + f.separation.toFixed(2) + ' yards away. Thrower: ' +
    (current.thrower ? current.thrower.name : 'unknown') + '. Selected receiver: ' + current.route.displayName +
    '. ' + el('downDistance').textContent + '. Receiver speed: ' + el('receiverSpeed').textContent +
    '. Nearest gap: ' + el('gapTrend').textContent + '. ' + el('firstDownDistanceLabel').textContent + ': ' +
    el('firstDownDistance').textContent + '. All 22 players shown.');
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
  const r = current.route, queued = queueById.get(id);
  const situation = current.situation, downName = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' }[situation.down];
  const distance = situation.yards_to_go;
  el('downDistance').textContent = (downName || 'Down unknown') + (distance == null ? '' : ' & ' +
    (situation.goal_to_go ? 'Goal' : String(distance)));
  el('situationHint').textContent = distance == null ? 'Distance unavailable' : distance +
    (distance === 1 ? ' yard' : ' yards') +
    (situation.goal_to_go ? ' to the goal line' : ' for a new set of downs');
  el('lineToGainLabel').textContent = situation.goal_to_go ? 'Goal line' : 'First-down line';
  el('lineToGainKey').hidden = situation.line_to_gain == null;
  setStory(current);
  for (let i = 0; i < 2; i++) el('example' + i).setAttribute('aria-pressed', String(id === model.exampleIds[i]));
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
  el('routeOrigin').textContent = queued ? 'Queue #' + queued.queue_rank + ' of ' + model.queue.length +
    ': selected for a long earlier gap, not a player ranking.' : 'Matched illustration: selected for contrast, not as a typical route.';
  el('releaseMetric').textContent = r.release_separation.toFixed(2) + ' yd';
  el('historyMetric').textContent = r.longest_2_0.toFixed(1) + ' s';
  el('timeMetric').textContent = r.observed_seconds.toFixed(1) + ' s';
  el('initialMetric').textContent = r.initial_separation.toFixed(2) + ' yd';
  el('routeExplanation').textContent = 'At the throw, the closest opponent was ' + r.release_separation.toFixed(2) +
    ' yards from ' + r.displayName + '. ' + (r.longest_2_0 >= .5 ?
    'Earlier, a gap of more than 2 yards lasted ' + r.longest_2_0.toFixed(1) + ' seconds under our rules. That is a moment to inspect on video, not proof a pass was available.' :
    'No earlier gap lasted at least half a second while meeting all five rules. This does not mean the player was never a possible target.');
  el('description').textContent = r.playDescription;
  el('releaseSource').textContent = r.release_source;
  el('scrub').max = current.frames.length - 1;
  const sustained = current.windows.filter(w => w.duration_seconds >= .5);
  el('windowSummary').textContent = sustained.length ? 'Lasting earlier gaps: ' + sustained.map(w =>
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

el('example0').onclick = () => loadReplay(model.exampleIds[0]);
el('example1').onclick = () => loadReplay(model.exampleIds[1]);
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

const ref = examples[0].route;
el('pairContext').textContent = ref.displayName + ' · game ' + ref.gameId + ' · ' + ref.alignment + ' · ' +
  ref.pff_passCoverage;
el('cohortContext').textContent = fmt(model.scatter.length) + ' eligible routes in ' + ref.alignment +
  ' against ' + ref.pff_passCoverage + '. The matched pair remains highlighted independently of queue filters.';
const traces = [{ x: model.scatter.map(r => r.release_separation), y: model.scatter.map(r => r.longest_2_0),
  text: model.scatter.map(r => r.displayName + ' · game ' + r.gameId + ' · play ' + r.playId + ' · throw ' + r.observed_seconds.toFixed(1) + ' s'),
  mode: 'markers', marker: { color: '#6d8fa6', size: 6, opacity: .35 }, type: 'scattergl',
  name: 'Same alignment / coverage', hovertemplate: '%{text}<br>Release %{x:.2f} yd · Earlier window %{y:.1f} s<extra></extra>' }];
examples.forEach((e, i) => traces.push({ x: [e.route.release_separation], y: [e.route.longest_2_0],
  mode: 'markers', marker: { size: 15, color: i ? '#c65332' : '#177449', symbol: 'diamond' },
  name: 'Replay: play ' + e.route.playId, customdata: [e.id],
  hovertemplate: 'Play ' + e.route.playId + '<br>Release %{x:.2f} yd · Earlier window %{y:.1f} s<extra></extra>' }));
Plotly.newPlot('scatter', traces, { margin: { l: 70, r: 22, t: 25, b: 105 },
  xaxis: { title: { text: 'Spacing at release (yd)', font: { size: 15 } },
    tickfont: { size: 10 }, gridcolor: '#304239', automargin: true },
  yaxis: { title: { text: 'Earlier window (s)', font: { size: 15 } }, rangemode: 'tozero',
    tickfont: { size: 10 }, gridcolor: '#304239', automargin: true },
  legend: { orientation: 'h', y: -.25, font: { size: 13 } },
  shapes: [{ type: 'line', x0: 2, x1: 2, y0: 0, y1: 1, yref: 'paper', line: { color: '#999', dash: 'dot' } }],
  font: chartFont, paper_bgcolor: '#0c1512', plot_bgcolor: '#0c1512',
}, plotConfig).then(() => el('scatter').on('plotly_click', e => {
  const p = e.points[0]; if (p.data.customdata) loadReplay(p.data.customdata[p.pointIndex], true);
}));
el('groups').append(table(['Alignment / coverage', 'Close-at-release routes', 'Earlier sustained spacing', '95% interval'],
  model.groups.map(g => [g.alignment + ' / ' + g.coverage, fmt(g.closed_at_release_routes),
    percent(g.fraction), g.game_bootstrap_95_percent_interval.map(percent).join('–')])));
const st = model.stats, es = st.event_sensitivity;
const sensitivity = [['Main definition', st.main], ['Start history at 1.5 s', st.late_start_sensitivity],
  ['Require ≥5 yd downfield', st.deeper_sensitivity], ['Initially ≤2 yd separation', st.initially_close_sensitivity],
  ['Primary events: common cohort', es.common_cohort_primary], ['Alternative events: common cohort', es.common_cohort_alternate],
  ...st.threshold_sensitivity.filter(s => s.threshold_yards !== 2).map(s => ['Threshold ' + s.threshold_yards + ' yd', s])];
el('sensitivity').append(table(['Definition', 'Earlier sustained / close at release', 'Rate'],
  sensitivity.map(([label, s]) => [label, fmt(s.earlier_sustained_routes) + ' / ' + fmt(s.closed_at_release_routes), percent(s.fraction)])));
const eventText = document.createElement('p');
eventText.textContent = 'Use a unique primary snap/release marker; use a unique automatic fallback only when the primary is absent and the outcome is C/I/IN. ' +
  fmt(es.automatic_fallback_plays) + ' pass plays have an automatic release fallback before route exclusions. ' +
  fmt(es.both_markers_plays) + ' plays have both release markers; the sustained flag changes for ' +
  fmt(es.sustained_status_changed_routes) + ' common-cohort routes under alternate timing. Marker choice is operational, not verified ground truth.';
el('eventDetails').append(eventText);
el('eventDetails').append(table(['Recorded exclusion category', 'Count'], Object.entries(st.exclusion_counts).map(([k, v]) => [k.replaceAll('_', ' '), fmt(v)])));
const note = document.createElement('p'); note.className = 'sub';
note.textContent = 'Non-pass outcomes and invalid segments are counted per play; receiver/observation exclusions per route. These mixed-unit counts must not be added into a single attrition percentage.';
el('eventDetails').append(note); el('commit').textContent = st.source_commit;
loadReplay(model.exampleIds[0]);

if (location.hash) revealSection(location.hash);
