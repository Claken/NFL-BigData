import { copyFile } from "node:fs/promises";
// The existing origin uses report.html as its directory index.
await copyFile(
  new URL("../dist/index.html", import.meta.url),
  new URL("../dist/report.html", import.meta.url),
);
