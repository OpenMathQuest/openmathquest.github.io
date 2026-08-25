import { defineConfig } from "@playwright/test";
import {
  PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS,
  PLAYWRIGHT_INTERACTION_FUZZ_RETRIES,
  PLAYWRIGHT_INTERACTION_FUZZ_WORKERS,
} from "./audit/lib/playwright-interaction-fuzz.mjs";

const executablePath = process.env.MQ_PLAYWRIGHT_EDGE_EXECUTABLE;
if (!executablePath) throw new Error("MQ_PLAYWRIGHT_EDGE_EXECUTABLE must name the reviewed installed Edge executable.");

export default defineConfig({
  testDir: "./audit/playwright",
  testMatch: "interaction-fuzz.spec.mjs",
  fullyParallel: false,
  forbidOnly: true,
  retries: PLAYWRIGHT_INTERACTION_FUZZ_RETRIES,
  workers: PLAYWRIGHT_INTERACTION_FUZZ_WORKERS,
  timeout: 180_000,
  expect: { timeout: 7_500 },
  outputDir: "audit/.tmp-playwright-interaction-fuzz/playwright",
  reporter: [["line"]],
  use: {
    baseURL: "http://127.0.0.1:8771",
    browserName: "chromium",
    headless: true,
    serviceWorkers: "block",
    trace: "off",
    screenshot: "off",
    video: "off",
    launchOptions: {
      executablePath,
      args: [
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-features=OptimizationHints,MediaRouter",
        "--disable-sync",
        "--no-default-browser-check",
        "--no-first-run",
      ],
    },
  },
  projects: PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS.map((project) => ({
    name: project.id,
    use: {
      viewport: project.viewport,
      deviceScaleFactor: project.hasTouch ? 3 : 1,
      hasTouch: project.hasTouch,
      isMobile: project.hasTouch,
      colorScheme: "light",
      reducedMotion: "reduce",
    },
  })),
});
