import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  timeout: 40_000,
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:4173",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "laptop", use: { viewport: { width: 1280, height: 720 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "narrow", use: { viewport: { width: 320, height: 740 } } },
  ],
  webServer: {
    command: "pnpm build && pnpm preview --port 4173",
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
