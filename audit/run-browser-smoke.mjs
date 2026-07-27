import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBrowserSmoke } from "./lib/browser-smoke.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserPath = process.argv[2] || process.env.MQ_BROWSER_PATH || null;
const report = await runBrowserSmoke({ root, browserPath });
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.status === "PASS" ? 0 : 1;
