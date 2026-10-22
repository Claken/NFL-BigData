import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  CircleHelp,
  Film,
  Library,
  PanelLeft,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { fetchManifest, fetchReplay, groupPlays, playId } from "./lib/data";
import type { Manifest, Replay } from "./lib/types";
import { Button, Mark, Modal } from "./components/ui";
import PlayLibrary from "./components/PlayLibrary";
import Workspace from "./components/Workspace";
const storageKey = "nfl-buddy:saved-plays";
function initialSaved(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(saved)
      ? saved.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}
export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null),
    [selected, setSelected] = useState(""),
    [replay, setReplay] = useState<Replay | null>(null);
  const [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(initialSaved),
    [saveNotice, setSaveNotice] = useState(""),
    [onlySaved, setOnlySaved] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false),
    [methodOpen, setMethodOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetchManifest(controller.signal)
      .then((data) => {
        setManifest(data);
        const id = new URLSearchParams(location.search).get("play");
        setSelected(
          data.cues.some((c) => c.replay_id === id) ? id! : data.featuredId,
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchReplay(selected, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setReplay(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [selected, attempt]);
  useEffect(() => {
    const navigate = () => {
      const id =
        new URLSearchParams(location.search).get("play") ||
        manifest?.featuredId;
      if (id && manifest?.cues.some((c) => c.replay_id === id)) setSelected(id);
    };
    window.addEventListener("popstate", navigate);
    return () => window.removeEventListener("popstate", navigate);
  }, [manifest]);
  const plays = manifest ? groupPlays(manifest.cues) : [];
  const active = plays.find((p) =>
    p.cues.some((c) => c.replay_id === selected),
  );
  const position = plays.findIndex((p) => p.id === active?.id);
  function select(id: string) {
    setSelected(id);
    setLibraryOpen(false);
    const url = new URL(location.href);
    url.searchParams.set("play", id);
    history.pushState(null, "", url);
  }
  function toggleSave() {
    if (!active) return;
    const next = saved.includes(active.id)
      ? saved.filter((id) => id !== active.id)
      : [...saved, active.id];
    setSaved(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaveNotice(
        next.includes(active.id)
          ? "Play saved to your library."
          : "Play removed from saved plays.",
      );
    } catch {
      setSaveNotice("Saved for this session. Browser storage is unavailable.");
    }
  }
  const libraryProps = {
    plays,
    selectedId: selected,
    saved,
    onlySaved,
    onSelect: select,
    onShowAll: () => setOnlySaved(false),
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to replay workspace
      </a>
      <aside className="sidebar">
        <a className="brand" href="./" aria-label="NFL Buddy home">
          <Mark />
          <span>
            NFL<span className="brand-light">Buddy</span>
            <small>THE FILM ROOM</small>
          </span>
        </a>
        <nav className="app-nav" aria-label="Library views">
          <button
            className={!onlySaved ? "active" : ""}
            aria-pressed={!onlySaved}
            onClick={() => setOnlySaved(false)}
          >
            <Film size={18} />
            Film room<span>{manifest?.counts.packaged_plays ?? "—"}</span>
          </button>
          <button
            className={onlySaved ? "active" : ""}
            aria-pressed={onlySaved}
            onClick={() => setOnlySaved(true)}
          >
            <Bookmark size={18} />
            Saved plays
            <span>{plays.filter((p) => saved.includes(p.id)).length}</span>
          </button>
        </nav>
        <PlayLibrary {...libraryProps} />
        <button className="sidebar-help" onClick={() => setMethodOpen(true)}>
          <CircleHelp size={17} />
          About the study
          <ArrowUpRight size={15} />
        </button>
      </aside>
      <div className="app-body">
        <header className="app-header">
          <div className="header-location">
            <Button
              variant="ghost"
              className="icon-button mobile-library"
              aria-label="Open play library"
              onClick={() => setLibraryOpen(true)}
            >
              <PanelLeft size={20} />
            </Button>
            <span className="desktop-library-icon">
              <Library size={18} />
            </span>
            <span className="mobile-brand">
              <Mark small />
            </span>
            <span>Film room</span>
            <span className="header-slash">/</span>
            <span className="header-muted">Third-down review</span>
          </div>
          <div className="header-actions">
            <span className="season-chip">2021 season</span>
            <Button
              variant="ghost"
              className="about-button"
              onClick={() => setMethodOpen(true)}
            >
              <BookOpen size={17} />
              <span>Study notes</span>
            </Button>
          </div>
        </header>
        <main id="workspace" tabIndex={-1}>
          {error ? (
            <div className="load-state error-state" role="alert">
              <TriangleAlert size={32} />
              <h1>We couldn’t open this play</h1>
              <p>{error} Check your connection and try again.</p>
              <Button onClick={() => setAttempt((n) => n + 1)}>
                <RefreshCw size={16} />
                Try again
              </Button>
            </div>
          ) : loading || !replay || !active ? (
            <div className="load-state" role="status">
              <div className="loading-pitch">
                <Film size={28} />
              </div>
              <h1>Loading the film room</h1>
              <p>Preparing recorded player tracking…</p>
            </div>
          ) : (
            <Workspace
              key={replay.id}
              replay={replay}
              play={active}
              saved={saved.includes(playId(replay.third_down_review))}
              onSave={toggleSave}
              onSelect={select}
              position={position}
              total={plays.length}
              onPrevious={
                position > 0
                  ? () => select(plays[position - 1].cues[0].replay_id)
                  : undefined
              }
              onNext={
                position < plays.length - 1
                  ? () => select(plays[position + 1].cues[0].replay_id)
                  : undefined
              }
            />
          )}
        </main>
        <div className="save-notice sr-only" role="status">
          {saveNotice}
        </div>
      </div>
      <Modal
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        title="Your play library"
        description="Choose a play, then inspect a receiver."
        className="library-dialog"
      >
        <div className="mobile-view-toggle">
          <Button aria-pressed={!onlySaved} onClick={() => setOnlySaved(false)}>
            All plays
          </Button>
          <Button aria-pressed={onlySaved} onClick={() => setOnlySaved(true)}>
            <Bookmark size={15} />
            Saved
          </Button>
        </div>
        <PlayLibrary {...libraryProps} />
      </Modal>
      <Modal
        open={methodOpen}
        onOpenChange={setMethodOpen}
        title="A starting point for film"
        description="What the third-down study measures, and what it leaves to you."
        className="method-dialog"
      >
        <div className="method-stats">
          <div>
            <strong>{manifest?.counts.eligible_failed_plays ?? "—"}</strong>
            <span>eligible failed plays</span>
          </div>
          <div>
            <strong>{manifest?.counts.qualifying_plays ?? "—"}</strong>
            <span>with a qualifying receiver</span>
          </div>
          <div>
            <strong>{manifest?.counts.packaged_plays ?? "—"}</strong>
            <span>plays in this sample</span>
          </div>
        </div>
        <div className="guide-content">
          <section>
            <h3>The spacing screen</h3>
            <p>
              Nearest defender more than 2 yards away for at least 0.5 seconds,
              while the receiver is at or beyond the first-down line and at
              least 2 yards downfield. The screening interval starts 1 second
              after the snap and ends 0.3 seconds before the throw.
            </p>
          </section>
          <section>
            <h3>A sample, not a ranking</h3>
            <p>
              The {manifest?.counts.packaged_routes ?? 92} receiver cues are
              grouped into {manifest?.counts.packaged_plays ?? 50} plays,
              ordered by week and game. The featured Schwartz play is a selected
              illustration. Other plays use a fixed random sample. All
              qualifying receivers on those plays are included.
            </p>
          </section>
          <section>
            <h3>What tracking cannot tell you</h3>
            <p>
              Spacing does not establish a clear throwing lane, the intended
              read, or a successful catch. The selected receiver may not be the
              target. Play-level hurry and hit flags have no timestamps; no flag
              does not prove a clean pocket.
            </p>
            <p>
              The sample includes completed, incomplete and intercepted passes.
              Sacks, rushing plays, penalties, fumbles and goal-to-go plays are
              excluded. Catches short of the line followed by running gains are
              outside the screen. No practicing-coach validation has been
              performed.
            </p>
          </section>
          <section>
            <h3>Recorded motion and projections</h3>
            <p>
              Tracking continues for only 0.2–0.5 seconds after release. Dotted
              paths assume straight ground-plane motion, with ±20% ball speed
              and ±15° direction. Ball height, landing time, drag and receiver
              turns are not modeled. This is an illustrative projection, not a
              catch or landing prediction.
            </p>
          </section>
        </div>
        <div className="method-downloads">
          {[
            ["third_down_review_queue.csv", "Review sample · CSV"],
            ["findings.md", "Method & research"],
            ["routes.csv", "Route metrics · CSV"],
            ["analysis.json", "Original study · JSON"],
          ].map(([file, label]) => (
            <a
              key={file}
              href={`${import.meta.env.BASE_URL}downloads/${file}`}
              download
            >
              <ArrowDownToLine size={16} />
              {label}
            </a>
          ))}
        </div>
        <p className="source-note">
          2021 NFL tracking · Weeks 1–8
          <br />
          Dataset commit <code>{manifest?.sourceCommit}</code>
        </p>
      </Modal>
    </div>
  );
}
