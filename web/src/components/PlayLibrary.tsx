import TeamLogo from "./TeamLogo";
import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  Bookmark,
  ArrowUpRight,
  X,
} from "lucide-react";
import type { Play } from "../lib/types";
import { teamNames } from "../lib/data";
import { Button } from "./ui";
interface Props {
  plays: Play[];
  selectedId: string;
  saved: string[];
  onlySaved: boolean;
  onSelect: (id: string) => void;
  onShowAll: () => void;
}
export default memo(function PlayLibrary({
  plays,
  selectedId,
  saved,
  onlySaved,
  onSelect,
  onShowAll,
}: Props) {
  const [query, setQuery] = useState(""),
    [week, setWeek] = useState(""),
    [coverage, setCoverage] = useState(""),
    [filtersOpen, setFiltersOpen] = useState(false);
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(
    () =>
      plays.filter((play) => {
        const cue = play.primary;
        const text = [
          cue.context.home_team,
          cue.context.away_team,
          teamNames[cue.context.home_team],
          teamNames[cue.context.away_team],
          cue.playId,
          ...play.cues.map((cue) => cue.displayName),
        ]
          .join(" ")
          .toLowerCase();
        return (
          (!onlySaved || saved.includes(play.id)) &&
          (!week || String(cue.week) === week) &&
          (!coverage || cue.pff_passCoverage === coverage) &&
          text.includes(query.toLowerCase().trim())
        );
      }),
    [plays, query, week, coverage, onlySaved, saved],
  );
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLButtonElement>(".is-selected");
    if (list && row)
      list.scrollTop +=
        row.getBoundingClientRect().top - list.getBoundingClientRect().top - 8;
  }, [selectedId, filtered]);
  const clear = () => {
    setQuery("");
    setWeek("");
    setCoverage("");
  };
  return (
    <div className="library-content">
      <div className="library-title">
        <h2>{onlySaved ? "Saved plays" : "Play library"}</h2>
        <span className="count">
          {onlySaved
            ? plays.filter((p) => saved.includes(p.id)).length
            : plays.length}
        </span>
      </div>
      <p className="library-description">
        Failed third downs. A moment worth reviewing.
      </p>
      <label className="search" htmlFor={`${id}-search`}>
        <Search size={17} />
        <input
          id={`${id}-search`}
          type="search"
          aria-label="Search plays"
          placeholder="Team, player, or play ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="library-tools">
        <span>2021 / Weeks 1–8</span>
        <Button
          variant="ghost"
          aria-expanded={filtersOpen}
          aria-controls={`${id}-filters`}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal size={15} /> Filters
          {(week || coverage) && <i className="filter-indicator" />}
        </Button>
      </div>
      {filtersOpen && (
        <div className="library-filters" id={`${id}-filters`}>
          <label>
            Week
            <select value={week} onChange={(e) => setWeek(e.target.value)}>
              <option value="">All weeks</option>
              {[...new Set(plays.map((p) => p.primary.week))]
                .sort((a, b) => a - b)
                .map((w) => (
                  <option key={w}>{w}</option>
                ))}
            </select>
          </label>
          <label>
            Coverage
            <select
              value={coverage}
              onChange={(e) => setCoverage(e.target.value)}
            >
              <option value="">All coverages</option>
              {[
                ...new Set(
                  plays.map((p) => p.primary.pff_passCoverage || "Unknown"),
                ),
              ]
                .sort()
                .map((c) => (
                  <option key={c}>{c}</option>
                ))}
            </select>
          </label>
        </div>
      )}
      <div className="list-count" role="status">
        {filtered.length} {filtered.length === 1 ? "play" : "plays"}
        {(query || week || coverage) && (
          <button onClick={clear}>
            Clear <X size={12} />
          </button>
        )}
      </div>
      <div ref={listRef} className="play-list" aria-label="Available plays">
        {filtered.map((play) => {
          const cue = play.primary,
            selected = selectedId.startsWith(play.id + ":");
          return (
            <button
              className={`play-row ${selected ? "is-selected" : ""}`}
              aria-current={selected ? "true" : undefined}
              key={play.id}
              onClick={() => {
                const match = query.trim()
                  ? play.cues.find((cue) =>
                      cue.displayName
                        .toLowerCase()
                        .includes(query.trim().toLowerCase()),
                    )
                  : undefined;
                onSelect(
                  match?.replay_id ??
                    (selected ? selectedId : play.cues[0].replay_id),
                );
              }}
            >
              <span className="play-row-top">
                <span className="play-matchup">
                  <span className="play-team">
                    <TeamLogo team={cue.context.away_team} />
                    {cue.context.away_team}
                  </span>
                  <span className="match-at">at</span>
                  <span className="play-team">
                    <TeamLogo team={cue.context.home_team} />
                    {cue.context.home_team}
                  </span>
                </span>
                {saved.includes(play.id) ? (
                  <Bookmark size={14} fill="currentColor" />
                ) : (
                  <ArrowUpRight size={15} className="row-arrow" />
                )}
              </span>
              <span className="play-row-detail">
                3rd & {cue.yards_to_go}
                <span className="row-dot">·</span>
                {cue.outcome.label}
              </span>
              <span className="play-row-bottom">
                W{cue.week} · Q{cue.context.quarter} {cue.context.game_clock}
                <span>
                  {play.cues.length}{" "}
                  {play.cues.length === 1 ? "receiver" : "receivers"}
                </span>
              </span>
            </button>
          );
        })}
        {!filtered.length && (
          <div className="empty-state">
            <Search size={24} />
            <h3>
              {onlySaved && !saved.length
                ? "Keep a play for later"
                : "No matching plays"}
            </h3>
            <p>
              {onlySaved && !saved.length
                ? "Bookmark a play in the film room. It will appear here."
                : "Try another team or player, or clear your filters."}
            </p>
            <Button onClick={onlySaved && !saved.length ? onShowAll : clear}>
              {onlySaved && !saved.length
                ? "Browse the library"
                : "Clear filters"}
            </Button>
          </div>
        )}
      </div>
      <div className="library-footer">
        <span className="dataset-dot" /> NFL tracking data{" "}
        <span>50-play sample</span>
      </div>
    </div>
  );
});
