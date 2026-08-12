import { defineConfig } from "@playwright/test";

const executablePath = process.env.MQ_PLAYWRIGHT_EDGE_EXECUTABLE;
if (!executablePath) throw new Error("MQ_PLAYWRIGHT_EDGE_EXECUTABLE must name the reviewed installed Edge executable.");

export default defineConfig({
  testDir: "./audit/playwright",
  testMatch: "critical-journeys.spec.mjs",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 7_500 },
  outputDir: "audit/.tmp-playwright-results",
  reporter: [
    ["line"],
    ["./audit/playwright/compact-reporter.mjs"],
  ],
  use: {
    baseURL: "http://127.0.0.1:8771",
    browserName: "chromium",
    headless: true,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
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
  projects: [
    {
      name: "edge-desktop",
      use: {
        viewport: { width: 1366, height: 768 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
        colorScheme: "light",
        reducedMotion: "reduce",
      },
    },
    {
      name: "edge-phone",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
        colorScheme: "light",
        reducedMotion: "reduce",
      },
    },
  ],
});
