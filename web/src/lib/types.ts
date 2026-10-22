export interface Point { x: number; y: number }
export interface Player extends Point {
  id: number | null; side: 'offense' | 'defense' | 'ball'; label: string; name: string;
}
export interface Frame extends Point {
  frame: number; t: number; separation: number; downfield: number;
  nearest: number; players: Player[]; receiver_speed_yards_per_second: number | null;
}
export interface Window { start_frame: number; end_frame: number; duration_seconds: number }
export interface Context {
  dropback_type: string; dropback_group: string; pressure_note: string; pressure_recorded: boolean;
  review_focus: 'pressure' | 'movement' | 'timing'; quarter: number; game_clock: string;
  home_team: string; away_team: string; home_score: number; away_score: number;
}
export interface Route {
  gameId: number; playId: number; nflId: number; displayName: string; officialPosition: string;
  pff_passCoverage: string; possessionTeam: string; week: number; passResult: 'C' | 'I' | 'IN';
  playDescription: string; snap: number; release_separation: number; observed_seconds: number;
  alignment: string; release_source: string;
}
export interface Cue extends Route {
  replay_id: string; queue_rank: number; yards_to_go: number; context: Context;
  window_start_seconds: number; window_end_seconds: number;
  conversion_window: Window; conversion_windows: Window[];
  outcome: { label: string; detail: string; yards_gained: number };
}
export interface Replay {
  id: string; route: Route; frames: Frame[]; windows: Window[];
  thrower: { id: number; name: string; jersey_number: number; source: string };
  line_of_scrimmage: number;
  situation: { down: number; yards_to_go: number; line_to_gain: number; goal_to_go: boolean };
  review_cue: { has_window: boolean; earlier_frame_index: number; review_frame_index: number; throw_frame_index: number };
  third_down_review: Cue;
  post_release: {
    frames: Frame[]; projection_unavailable: string | null; tracking_note: string | null;
    seconds_recorded: number;
    motion: { ball: Velocity | null; receiver: Velocity | null };
    assumptions: { speed_fraction: number; heading_degrees: number; max_seconds_after_throw: number };
  };
}
export interface Velocity { vx: number; vy: number }
export interface Manifest {
  featuredId: string; sourceCommit: string; cues: Cue[];
  counts: { packaged_plays: number; packaged_routes: number; qualifying_plays: number; eligible_failed_plays: number; qualifying_routes: number };
}
export interface Play { id: string; cues: Cue[]; primary: Cue }
