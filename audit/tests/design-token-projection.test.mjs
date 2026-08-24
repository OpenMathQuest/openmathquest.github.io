import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DESIGN_TOKEN_CUSTOM_PROPERTY_PREFIX,
  DESIGN_TOKEN_PROJECTED_VALUE_CLASSES,
  DESIGN_TOKEN_PROJECTION_CSS_PATH,
  designTokenProjectionProperties,
  expectedRuntimeConsumers,
  expectedDesignTokenProjection,
  loadDesignTokenProjection,
  renderDesignTokenProjectionCss,
  validateDesignTokenProjection,
} from "../lib/design-token-projection.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
const clone = (value) => structuredClone(value);

const fixture = async () => {
  const [tokens, cssBytes, releaseShell, indexText] = await Promise.all([
    readJson("assets/design/math-quest-design-tokens-v1.json"),
    readFile(path.join(root, DESIGN_TOKEN_PROJECTION_CSS_PATH)),
    readJson("release-shell-v1.json"),
    readFile(path.join(root, "index.html"), "utf8"),
  ]);
  return { tokens, cssBytes, releaseShell, runtimeSources: { "index.html": indexText } };
};

test("ART-MIG-04 projection is exact, collision-safe, linked, offline-bound, and closed to its governed consumers", async () => {
  const { tokens, cssBytes, releaseShell, runtimeSources } = await fixture();
  assert.deepEqual(validateDesignTokenProjection(tokens, cssBytes, { releaseShell, runtimeSources }), []);
  assert.equal(designTokenProjectionProperties(tokens).length, 63);
  assert.equal(new Set(designTokenProjectionProperties(tokens).map((record) => record.name)).size, 63);
  assert.deepEqual(tokens.projection.projectedValueClasses, DESIGN_TOKEN_PROJECTED_VALUE_CLASSES);
  assert.deepEqual(tokens.projection, expectedDesignTokenProjection(tokens));
  assert.equal(expectedRuntimeConsumers(tokens).length, 37);
  assert.equal(cssBytes.toString("utf8"), renderDesignTokenProjectionCss(tokens));
  assert.equal((await loadDesignTokenProjection()).projection.activationGate, "QUESTION_SHELL_PLAYWRIGHT_VERIFIED");
});

test("[NC-ART-TOKEN-PROJECTION-DRIFT] stale bytes, unlisted consumers, literal regressions, broken loading, and shell drift fail closed", async () => {
  const { tokens, cssBytes, releaseShell, runtimeSources } = await fixture();
  const cases = [
    {
      mutate: ({ cssBytes: bytes }) => ({ cssBytes: Buffer.concat([bytes, Buffer.from("body{}\n")]) }),
      pattern: /exact deterministic generator output/u,
    },
    {
      mutate: ({ tokens: value }) => {
        const mutant = clone(value);
        mutant.projection.cssSha256 = "0".repeat(64);
        return { tokens: mutant };
      },
      pattern: /projection metadata is stale/u,
    },
    {
      mutate: ({ runtimeSources: sources }) => ({ runtimeSources: { "index.html": `${sources["index.html"]}\n<style>#app{transform:translateX(var(${DESIGN_TOKEN_CUSTOM_PROPERTY_PREFIX}dimension-body-min))}</style>` } }),
      pattern: /outside the ART-MIG-04 allowlisted style block/u,
    },
    {
      mutate: ({ runtimeSources: sources }) => ({
        runtimeSources: {
          "index.html": `${sources["index.html"]}\n<style>.future-only-state{transform:translateX(var(--mq-\\63onservatory-dimension-body-min))}</style>`,
        },
      }),
      pattern: /outside the ART-MIG-04 allowlisted style block/u,
    },
    {
      mutate: ({ runtimeSources: sources }) => ({ runtimeSources: {
        "index.html": sources["index.html"].replace(
          "outline-color:var(--mq-conservatory-colour-action-focus)",
          "outline-color:var(--mq-conservatory-colour-action-audio)",
        ),
      } }),
      pattern: /do not equal the exact selector\/property\/token allowlist/u,
    },
    {
      mutate: ({ runtimeSources: sources }) => ({ runtimeSources: {
        "index.html": sources["index.html"].replace(
          "outline-color:var(--mq-conservatory-colour-action-focus)",
          "border-color:var(--mq-conservatory-colour-action-focus)",
        ),
      } }),
      pattern: /do not equal the exact selector\/property\/token allowlist/u,
    },
    {
      mutate: ({ runtimeSources: sources }) => ({ runtimeSources: {
        "index.html": sources["index.html"].replace(
          "outline-color:var(--mq-conservatory-colour-action-focus)",
          "outline-color:#5B3CC4",
        ),
      } }),
      pattern: /do not equal the exact selector\/property\/token allowlist/u,
    },
    {
      mutate: ({ runtimeSources: sources }) => ({
        runtimeSources: {
          "index.html": `${sources["index.html"]}\n<script>const first="--mq-";const second="conservatory-colour-ink";getComputedStyle(document.documentElement).getPropertyValue(first+second)</script>`,
        },
      }),
      pattern: /dynamically read or author CSS/u,
    },
    {
      mutate: ({ runtimeSources: sources }) => ({
        runtimeSources: {
          "index.html": `${sources["index.html"]}\n<script>const a="--mq-";const b="conservatory-dimension-body-min";addEventListener("mq-future",()=>document.documentElement["style"]["setProperty"](a+b,"99px"))</script>`,
        },
      }),
      pattern: /dynamically read or author CSS/u,
    },
    {
      mutate: ({ runtimeSources: sources }) => ({ runtimeSources: { "index.html": sources["index.html"].replace(/<link rel="stylesheet"[^>]+data-mq-design-token-projection="v1">/u, "") } }),
      pattern: /exactly one closed design-token projection stylesheet link/u,
    },
    {
      mutate: ({ runtimeSources: sources }) => ({
        runtimeSources: {
          "index.html": `${sources["index.html"]}\n<link href="./${DESIGN_TOKEN_PROJECTION_CSS_PATH}" rel="stylesheet">`,
        },
      }),
      pattern: /exactly one closed design-token projection stylesheet link/u,
    },
    {
      mutate: ({ runtimeSources: sources }) => ({
        runtimeSources: {
          "index.html": `${sources["index.html"]}\n<link data-mq-design-token-projection="v1" rel="stylesheet" href="assets/design/not-the-projection.css">`,
        },
      }),
      pattern: /exactly one closed design-token projection stylesheet link/u,
    },
    {
      mutate: ({ runtimeSources: sources }) => ({
        runtimeSources: {
          "index.html": sources["index.html"].replace(
            `href="${DESIGN_TOKEN_PROJECTION_CSS_PATH}"`,
            `href="//127.0.0.1:8771/${DESIGN_TOKEN_PROJECTION_CSS_PATH}"`,
          ),
        },
      }),
      pattern: /exactly one closed design-token projection stylesheet link/u,
    },
    {
      mutate: ({ releaseShell: shell }) => {
        const mutant = clone(shell);
        mutant.entries.find((entry) => entry.path === `./${DESIGN_TOKEN_PROJECTION_CSS_PATH}`).sha256 = "0".repeat(64);
        return { releaseShell: mutant };
      },
      pattern: /release shell does not bind/u,
    },
  ];
  for (const { mutate, pattern } of cases) {
    const original = { tokens, cssBytes, releaseShell, runtimeSources };
    const mutated = { ...original, ...mutate(original) };
    assert.match(validateDesignTokenProjection(mutated.tokens, mutated.cssBytes, {
      releaseShell: mutated.releaseShell,
      runtimeSources: mutated.runtimeSources,
    }).join("\n"), pattern);
  }
});

test("[NC-ART-FUNCTIONAL-SLICE-DRIFT] unlisted, retargeted, literal, and dynamic runtime consumers fail closed", async () => {
  const { tokens, cssBytes, releaseShell, runtimeSources } = await fixture();
  const runtimeMutants = [
    `${runtimeSources["index.html"]}\n<style>#app{transform:translateX(var(${DESIGN_TOKEN_CUSTOM_PROPERTY_PREFIX}dimension-body-min))}</style>`,
    runtimeSources["index.html"].replace(
      "outline-color:var(--mq-conservatory-colour-action-focus)",
      "outline-color:var(--mq-conservatory-colour-action-audio)",
    ),
    runtimeSources["index.html"].replace(
      "outline-color:var(--mq-conservatory-colour-action-focus)",
      "border-color:var(--mq-conservatory-colour-action-focus)",
    ),
    runtimeSources["index.html"].replace(
      "outline-color:var(--mq-conservatory-colour-action-focus)",
      "outline-color:#5B3CC4",
    ),
    `${runtimeSources["index.html"]}\n<script>getComputedStyle(document.documentElement).getPropertyValue("--mq-conservatory-colour-action-focus")</script>`,
  ];
  for (const indexText of runtimeMutants) {
    assert.notEqual(validateDesignTokenProjection(tokens, cssBytes, {
      releaseShell,
      runtimeSources: { "index.html": indexText },
    }).length, 0);
  }
});

test("projection generator requires exactly one mode and does not accept hand-edited generated bytes", async () => {
  const tool = await readFile(path.join(root, "tools", "build-design-token-projection.mjs"), "utf8");
  assert.match(tool, /if \(write === check\) throw new Error/u);
  assert.match(tool, /designTokenProjectionSourceIssues\(tokens\)/u);
  assert.match(tool, /actualCss !== css/u);
});
