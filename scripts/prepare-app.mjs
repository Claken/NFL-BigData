import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, "outputs/multigame");
const destination = path.join(root, "web/public");
const data = JSON.parse(
  await readFile(path.join(source, "replay_data.json"), "utf8"),
);
const analysis = JSON.parse(
  await readFile(path.join(source, "analysis.json"), "utf8"),
);
await mkdir(path.join(destination, "data/replays"), { recursive: true });
await mkdir(path.join(destination, "downloads"), { recursive: true });
const replays = new Map(data.replays.map((replay) => [replay.id, replay]));
for (const cue of data.third_down_queue) {
  const replay = replays.get(cue.replay_id);
  if (!replay?.frames.length || !replay.third_down_review)
    throw new Error(`Missing tracking for ${cue.replay_id}`);
  await writeFile(
    path.join(
      destination,
      "data/replays",
      cue.replay_id.replaceAll(":", "-") + ".json",
    ),
    JSON.stringify(replay),
  );
}
await writeFile(
  path.join(destination, "data/index.json"),
  JSON.stringify({
    featuredId: data.featured_id,
    sourceCommit: analysis.source_commit,
    counts: data.third_down_counts,
    cues: data.third_down_queue,
  }),
);
for (const name of [
  "third_down_review_queue.csv",
  "film_review_queue.csv",
  "routes.csv",
  "findings.md",
  "analysis.json",
  "matched_pair.png",
]) {
  await copyFile(
    path.join(source, name),
    path.join(destination, "downloads", name),
  );
}
console.log(
  `Prepared ${data.third_down_counts.packaged_plays} plays and ${data.third_down_queue.length} receiver cues.`,
);
