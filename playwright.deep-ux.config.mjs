import { defineConfig } from "@playwright/test";
import { DEEP_UX_CENSUS_VIEWPORTS } from "./audit/lib/playwright-deep-ux-census.mjs";

const executablePath = process.env.MQ_PLAYWRIGHT_EDGE_EXECUTABLE;
if (!executablePath) throw new Error("MQ_PLAYWRIGHT_EDGE_EXECUTABLE must name the reviewed installed Edge executable.");

export default defineConfig({
  testDir: "./audit/playwright",
  testMatch: "deep-ux-census.spec.mjs",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: process.env.MQ_DEEP_UX_HOSTED === "1" ? 2 : 1,
  timeout: 7_000_000,
  actionTimeout: 2_500,
  expect: { timeout: 5_000 },
  outputDir: "audit/.tmp-playwright-deep-ux-results",
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
  projects: DEEP_UX_CENSUS_VIEWPORTS.map((viewport) => ({
    name: `deep-ux-${viewport.id}`,
    use: {
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      hasTouch: viewport.touch,
      isMobile: viewport.mobile,
      colorScheme: "light",
      reducedMotion: "reduce",
    },
  })),
});
