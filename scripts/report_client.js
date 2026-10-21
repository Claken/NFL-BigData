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
const chartFont = { family: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', size: 14, color: '#365262' };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let index = 0, timer = null, current = null, loadVersion = 0, loading = false, fieldView = 'fit';
const fieldBounds = new Map();

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
  ctx.fillStyle = '#edf5ed'; ctx.fillRect(fieldLeft, fieldTop, 120 * scale, (160 / 3) * scale);
  ctx.fillStyle = '#dce9e1'; ctx.fillRect(fieldLeft, fieldTop, 10 * scale, (160 / 3) * scale);
  ctx.fillRect(fieldLeft + 110 * scale, fieldTop, 10 * scale, (160 / 3) * scale);
  ctx.strokeStyle = '#a9c2ab'; ctx.lineWidth = 1;
  for (let x = 0; x <= 120; x += 10) {
    const [px, py] = xy({ x, y: 160 / 3 }), [, bottom] = xy({ x, y: 0 });
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, bottom); ctx.stroke();
  }
  ctx.strokeRect(fieldLeft, fieldTop, 120 * scale, (160 / 3) * scale);
  ctx.strokeStyle = '#718494'; ctx.setLineDash([5, 4]); ctx.beginPath();
  const [lineX, lineTop] = xy({ x: current.line_of_scrimmage, y: 160 / 3 });
  ctx.moveTo(lineX, lineTop); ctx.lineTo(lineX, xy({ x: 0, y: 0 })[1]); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#17744970'; ctx.lineWidth = 2; ctx.beginPath();
  current.frames.forEach((p, i) => { const [x, y] = xy(p); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke();
  ctx.strokeStyle = '#177449'; ctx.lineWidth = 3; ctx.beginPath();
  current.frames.slice(Math.max(0, index - 10), index + 1).forEach((p, i) => {
    const [x, y] = xy(p); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }); ctx.stroke();
  const receiver = f.players.find(p => p.id === current.route.nflId);
  const thrower = current.thrower && f.players.find(p => p.id === current.thrower.id);
  const nearest = f.players.find(p => p.id === f.nearest);
  if (receiver && nearest) {
    const [x1, y1] = xy(receiver), [x2, y2] = xy(nearest);
    ctx.strokeStyle = '#bb861e'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x1, y1, 2 * scale, 0, 2 * Math.PI); ctx.lineWidth = 1; ctx.stroke();
  }
  f.players.forEach(p => {
    const [x, y] = xy(p), active = p.id === current.route.nflId, passing = p.id === current.thrower?.id;
    ctx.beginPath(); ctx.arc(x, y, active ? 12 : passing ? 11 : p.side === 'ball' ? 4 : 9, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#177449' : passing ? '#7351a3' : p.side === 'offense' ? '#1769a6' : p.side === 'defense' ? '#c65332' : '#704d22';
    ctx.fill(); ctx.strokeStyle = 'white'; ctx.lineWidth = 1; ctx.stroke();
    if (active || passing) { ctx.strokeStyle = active ? '#174b35' : '#533579'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.stroke(); }
    if (p.side !== 'ball') { ctx.fillStyle = 'white'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(p.label, x, y + 4); }
  });
  ctx.restore(); ctx.textAlign = 'center'; ctx.fillStyle = '#4c6956'; ctx.font = '12px system-ui';
  for (let x = 20; x <= 100; x += 10) {
    const [px] = xy({ x, y: 0 });
    if (px > pad && px < W - pad) ctx.fillText(String(Math.min(x - 10, 110 - x)), px, H - oy + 17);
  }
  ctx.save(); ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const labels = [];
  for (const [player, role, color, offset] of [[thrower, 'Thrower', '#7351a3', 20], [receiver, 'Receiver', '#177449', -38]]) {
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
    ctx.fillStyle = '#ffffffed'; ctx.fillRect(x, y, width, 22); ctx.strokeRect(x, y, width, 22);
    ctx.fillStyle = color; ctx.fillText(label, x + 7, y + 11);
  }
  ctx.restore();
  canvas.dataset.throwerId = current.thrower?.id ?? '';
  canvas.dataset.receiverId = current.route.nflId;
  el('scrub').value = index;
  el('clock').value = f.t.toFixed(1) + ' / ' + current.route.observed_seconds.toFixed(1) + ' s';
  const valid = f.t >= 1 && f.t <= current.route.observed_seconds - .3 + 1e-8 && f.downfield >= 2;
  el('nearestReadout').textContent = f.separation.toFixed(2) + ' yd to closest opponent: ' + (nearest ? nearest.name : 'unknown');
  el('gateStatus').textContent = !valid ? 'This moment is not counted' :
    f.separation > 2 ? 'Gap above 2 yards at this moment' : 'Opponent within 2 yards';
  el('gateStatus').dataset.eligible = String(valid && f.separation > 2);
  el('frameExplanation').textContent = f.t < 1 ? 'We do not count the first second of the play.' :
    f.t > current.route.observed_seconds - .3 + 1e-8 ? 'We do not count the final 0.3 seconds before the throw.' :
    f.downfield < 2 ? 'The receiver is less than 2 yards beyond the starting line at this moment, so it does not count.' :
    f.separation <= 2 ? 'The closest opponent is within 2 yards. This moment does not count toward an earlier gap.' :
    'The gap is more than 2 yards here. It must last at least half a second without a break to become a qualifying window.';
  canvas.setAttribute('aria-label', current.route.displayName + ' at ' + f.t.toFixed(1) + ' seconds since snap; nearest defender ' +
    (nearest ? nearest.name : 'unknown') + ', ' + f.separation.toFixed(2) + ' yards away. Thrower: ' +
    (current.thrower ? current.thrower.name : 'unknown') + '. Selected receiver: ' + current.route.displayName + '. All 22 players shown.');
  el('frameStatus').textContent = 'Frame ' + f.frame + ' · Nearest: ' + (nearest ? nearest.name : 'unknown') +
    ' · ' + f.separation.toFixed(2) + ' yd · Receiver ' + f.downfield.toFixed(1) + ' yd downfield · ' +
    (valid ? 'Eligible history frame' : 'Excluded by time/downfield gate');
  Plotly.relayout('timeline', { 'shapes[0].x0': f.t, 'shapes[0].x1': f.t });
}

async function loadReplay(id, scroll = false) {
  if (!replays.has(id)) return;
  const version = ++loadVersion;
  stop(); loading = true;
  for (const control of ['play', 'reset', 'scrub']) el(control).disabled = true;
  current = replays.get(id); index = current.initial_frame_index;
  const r = current.route, queued = queueById.get(id);
  for (let i = 0; i < 2; i++) el('example' + i).setAttribute('aria-pressed', String(id === model.exampleIds[i]));
  const receiver = current.frames[0].players.find(p => p.id === r.nflId);
  el('selectedName').textContent = r.displayName + (receiver?.label ? ' #' + receiver.label : '');
  el('throwerName').textContent = current.thrower ? current.thrower.name +
    (current.thrower.jersey_number != null ? ' #' + current.thrower.jersey_number : '') : 'Not identified';
  el('throwerSource').textContent = current.thrower ? 'Thrower identified by the recorded PFF Pass role (player ID ' +
    current.thrower.id + ').' : 'No unique recorded passer with matching offensive tracking; no thrower is inferred.';
  el('selectedContext').textContent = r.possessionTeam + ' · Week ' + r.week +
    ' · game ' + r.gameId + ' · play ' + r.playId + ' · ' + r.alignment + ' · ' + (r.pff_passCoverage || 'Unknown coverage');
  el('routeOrigin').textContent = queued ? 'Review queue rank ' + queued.queue_rank + ' of ' + model.queue.length +
    ' · selected for a long earlier spacing window; this is not a player ranking.' : 'Matched illustration · selected for contrast rather than as a typical route.';
  el('releaseMetric').textContent = r.release_separation.toFixed(2) + ' yd';
  el('historyMetric').textContent = r.longest_2_0.toFixed(1) + ' s';
  el('timeMetric').textContent = r.observed_seconds.toFixed(1) + ' s';
  el('initialMetric').textContent = r.initial_separation.toFixed(2) + ' yd';
  el('routeExplanation').textContent = 'At the throw, the closest opponent was ' + r.release_separation.toFixed(2) +
    ' yards from ' + r.displayName + '. ' + (r.longest_2_0 >= .5 ?
    'Earlier, a gap of more than 2 yards lasted ' + r.longest_2_0.toFixed(1) + ' seconds under our rules. That is a moment to inspect on video, not proof a pass was available.' :
    'No earlier gap lasted at least half a second while meeting all five rules. This does not mean the player was never a possible target.');
  el('description').textContent = r.playDescription + ' · release event: ' + r.release_source;
  el('scrub').max = current.frames.length - 1;
  const sustained = current.windows.filter(w => w.duration_seconds >= .5);
  el('windowSummary').textContent = sustained.length ? 'Lasting earlier gaps: ' + sustained.map(w =>
    ((w.start_frame - r.snap) / 10).toFixed(1) + '–' + ((w.end_frame - r.snap) / 10).toFixed(1) +
    ' s (' + w.duration_seconds.toFixed(1) + ' s)').join('; ') + ' after the play starts.' : 'No lasting earlier gap meets all five rules.';
  renderQueue();
  const shapes = [
    { type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, yref: 'paper', line: { color: '#202e39', width: 2 } },
    { type: 'line', x0: 0, x1: r.observed_seconds, y0: 2, y1: 2, line: { color: '#777', dash: 'dash' } },
    { type: 'rect', x0: 0, x1: 1, y0: 0, y1: 1, yref: 'paper', fillcolor: '#ddd', opacity: .35, line: { width: 0 }, layer: 'below' },
    { type: 'rect', x0: r.observed_seconds - .3, x1: r.observed_seconds, y0: 0, y1: 1, yref: 'paper', fillcolor: '#ddd', opacity: .35, line: { width: 0 }, layer: 'below' }
  ];
  sustained.forEach(w => shapes.push({ type: 'rect', x0: (w.start_frame - r.snap) / 10,
    x1: (w.end_frame - r.snap) / 10, y0: 0, y1: 1, yref: 'paper', fillcolor: '#39a86a',
    opacity: .2, line: { width: 0 }, layer: 'below' }));
  const replay = current;
  await Plotly.react('timeline', [
    { x: replay.frames.map(f => f.t), y: replay.frames.map(f => f.separation), mode: 'lines+markers',
      marker: { size: 4 }, line: { color: '#1769a6' }, name: 'Nearest-defender spacing',
      hovertemplate: '%{x:.1f} s · %{y:.2f} yd<extra></extra>' },
    { x: [r.observed_seconds], y: [r.release_separation], mode: 'markers',
      marker: { color: '#c44a36', size: 10 }, name: 'Release' }
    ], { margin: { l: 63, r: 16, t: 22, b: 55 }, font: chartFont,
    xaxis: { title: { text: 'Seconds since the play starts', font: { size: 14 } }, range: [0, r.observed_seconds + .1],
      tickfont: { size: 13 }, gridcolor: '#e5ecef', zeroline: false, automargin: true },
    yaxis: { title: { text: 'Gap to closest opponent (yd)', font: { size: 14 } }, rangemode: 'tozero',
      tickfont: { size: 13 }, gridcolor: '#e5ecef', zeroline: false, automargin: true }, shapes,
    annotations: [{ x: 1, xref: 'paper', y: 2, text: '2 yd', showarrow: false,
      yanchor: 'bottom', xanchor: 'right', font: { size: 13, color: '#526571' }, bgcolor: '#ffffffdd' }],
    showlegend: false, paper_bgcolor: 'white', plot_bgcolor: 'white' }, plotConfig);
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
};

const ref = examples[0].route;
el('pairContext').textContent = ref.displayName + ' · game ' + ref.gameId + ' · ' + ref.alignment + ' · ' +
  ref.pff_passCoverage + '. Release separation differs by at most 0.15 yd, initial spacing by at most 0.5 yd and throw time by at most 0.3 s.';
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
    tickfont: { size: 13 }, gridcolor: '#e5ecef', automargin: true },
  yaxis: { title: { text: 'Earlier window (s)', font: { size: 15 } }, rangemode: 'tozero',
    tickfont: { size: 13 }, gridcolor: '#e5ecef', automargin: true },
  legend: { orientation: 'h', y: -.25, font: { size: 13 } },
  shapes: [{ type: 'line', x0: 2, x1: 2, y0: 0, y1: 1, yref: 'paper', line: { color: '#999', dash: 'dot' } }],
  font: chartFont, paper_bgcolor: 'white', plot_bgcolor: 'white',
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
