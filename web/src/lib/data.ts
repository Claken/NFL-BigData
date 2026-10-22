import type { Cue, Manifest, Play, Replay } from './types';
export const teamNames: Record<string, string> = {
 ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills', CAR: 'Panthers', CHI: 'Bears', CIN: 'Bengals', CLE: 'Browns', DAL: 'Cowboys', DEN: 'Broncos', DET: 'Lions', GB: 'Packers', HOU: 'Texans', IND: 'Colts', JAX: 'Jaguars', KC: 'Chiefs', LA: 'Rams', LAR: 'Rams', LAC: 'Chargers', LV: 'Raiders', MIA: 'Dolphins', MIN: 'Vikings', NE: 'Patriots', NO: 'Saints', NYG: 'Giants', NYJ: 'Jets', PHI: 'Eagles', PIT: 'Steelers', SEA: 'Seahawks', SF: '49ers', TB: 'Buccaneers', TEN: 'Titans', WAS: 'Washington',
};
export const playId = (cue: Cue) => `${cue.gameId}:${cue.playId}`;
export function groupPlays(cues: Cue[]): Play[] {
  const groups = new Map<string, Play>();
  for (const cue of cues) {
    const id = playId(cue);
    const play = groups.get(id);
    if (play) play.cues.push(cue);
    else groups.set(id, { id, cues: [cue], primary: cue });
  }
  return [...groups.values()];
}
const cache = new Map<string, Replay>();
const base = import.meta.env.BASE_URL;
export async function fetchManifest(signal: AbortSignal): Promise<Manifest> {
  const response = await fetch(`${base}data/index.json`, { signal });
  if (!response.ok) throw new Error('The play library could not be loaded.');
  return response.json();
}
export async function fetchReplay(id: string, signal: AbortSignal): Promise<Replay> {
  if (cache.has(id)) return cache.get(id)!;
  const response = await fetch(`${base}data/replays/${id.replaceAll(':', '-')}.json`, { signal });
  if (!response.ok) throw new Error('Tracking for this receiver could not be loaded.');
  const replay: Replay = await response.json();
  if (!replay.frames?.length || replay.id !== id) throw new Error('This tracking file is incomplete.');
  cache.set(id, replay);
  return replay;
}
export function cueText(replay: Replay) {
  const cue = replay.third_down_review, frame = replay.frames[replay.review_cue.review_frame_index];
  return `${cue.displayName} · ${cue.possessionTeam} · Week ${cue.week}\nGame ${cue.gameId} · Play ${cue.playId}\n${cue.context.away_team} ${cue.context.away_score} – ${cue.context.home_score} ${cue.context.home_team} · Q${cue.context.quarter} ${cue.context.game_clock}\n3rd & ${cue.yards_to_go} · ${cue.outcome.label}\nInspect ${frame.t.toFixed(1)} s after snap: ${frame.separation.toFixed(2)} yd to nearest defender, ${frame.downfield.toFixed(2)} yd downfield. Throw at ${cue.observed_seconds.toFixed(1)} s.\nCheck the passing lane and intended read on film. This receiver may not be the target; spacing alone does not establish an available or missed pass.\n${cue.context.pressure_note}. Pressure flags apply to the whole play; timing is unavailable.`;
}
