import { auditMarkdown } from "./lib/audit-markdown-report.mjs";
import { publicationClearance } from "./lib/audit-publication-report.mjs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { EXPECTED_BROWSER_RESULT_IDS } from "./lib/browser-smoke.mjs";
import { PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS } from "./lib/playwright-focused-contract.mjs";
import {
  BROWSER_RUNNER_EVIDENCE_PATH,
  parseReviewedBrowserRunnerEvidence,
} from "./lib/browser-runner-evidence.mjs";
import { CURRICULUM_PATH, loadManifest } from "./lib/curriculum-manifest.mjs";
import {
  computeReleaseDecision,
  EXTERNAL_RELEASE_GATE_IDS,
} from "./lib/publication-clearance.mjs";
import { rightsStateSha256 } from "./lib/rights-state.mjs";
import { AI_READER_CONTRACT_REF } from "./lib/repository-code-map.mjs";
import {
  GATE_INTEGRITY_POLICY,
  loadGateIntegrityPolicy,
  REPRESENTATIVE_MUTATION_FAMILY_COUNT,
  requiredOutcomeStatuses,
  summarizeGateOutcomes,
} from "./lib/gate-integrity-policy.mjs";
import {
  AUDIT_LANE_IDS,
  auditCandidateStabilityIssues,
  failedAuditLaneResult,
  runBoundedAuditLanes,
} from "./lib/bounded-audit-lanes.mjs";
import { MINIMUM_ENGINE_BRANCH_COVERAGE_PCT } from "./run-coverage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_SEMANTIC = Object.freeze({ assertions: 130, skills: 126, taskTypes: 166, questions: 6_048 });
const EXPECTED_COMPONENTS = Object.freeze({ engineAssertions: 43, semanticAssertions: EXPECTED_SEMANTIC.assertions, browserAssertions: EXPECTED_BROWSER_RESULT_IDS.length, playwrightAssertions: PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.length, mutationFamilies: REPRESENTATIVE_MUTATION_FAMILY_COUNT, coverageGates: 1, generatorGates: 1, auditOrchestrationGates: 1, launcherGates: 1, externalEvidenceGates: EXTERNAL_RELEASE_GATE_IDS.length });
const EXPECTED = Object.freeze({ ...EXPECTED_COMPONENTS, total: Object.values(EXPECTED_COMPONENTS).reduce((sum, value) => sum + value, 0) });
const execFileAsync = promisify(execFile);

function arg(name) {
  const prefix = `--${name}=`; const entry = process.argv.find((value) => value.startsWith(prefix)); return entry ? entry.slice(prefix.length) : null;
}

function sanitizeHostDetails(value) {
  const home = os.homedir();
  const replacements = [
    [root, "{{REPOSITORY_ROOT}}"],
    [root.replaceAll("\\", "/"), "{{REPOSITORY_ROOT}}"],
    [home, "{{LOCAL_USER_HOME}}"],
    [home.replaceAll("\\", "/"), "{{LOCAL_USER_HOME}}"],
  ].filter(([source]) => source);
  if (typeof value === "string") {
    return replacements.reduce((text, [source, replacement]) => text.replaceAll(source, replacement), value);
  }
  if (Array.isArray(value)) return value.map(sanitizeHostDetails);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeHostDetails(entry)]));
  }
  return value;
}

async function metadata() {
  const [promptBytes, register] = await Promise.all([
    readFile(path.join(root, "docs", "development", "build-spec.md")), readFile(path.join(root, "research", "build-axioms.md"), "utf8"),
  ]);
  const promptText = promptBytes.toString("utf8");
  const promptSha256 = createHash("sha256").update(promptBytes).digest("hex");
  const recordedPromptSha = register.match(/Contract SHA-256:\*\*\s*`([a-f0-9]{64})`/iu)?.[1] ?? null;
  const promptVersion = promptText.match(/Contract version:\*\*\s*`([^`]+)`/iu)?.[1] ?? "UNKNOWN";
  const registerRevision = register.match(/Register revision:\*\*\s*`([^`]+)`/iu)?.[1] ?? "UNKNOWN";
  return { promptVersion, promptSha256, recordedPromptSha, promptDigestMatchesRegister: promptSha256 === recordedPromptSha, registerRevision };
}

async function deliveredFiles() {
  const { stdout } = await execFileAsync("git", ["ls-files", "--cached", "-z"], {
    cwd: root,
    encoding: "buffer",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  const files = stdout.toString("utf8").split("\0").filter(Boolean).map((file) => file.replaceAll("\\", "/"));
  if (!files.length) throw new Error("The exact staged public candidate could not be enumerated.");
  return [...new Set(files)].sort();
}

async function repositoryRevision() {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true });
    const revision = String(stdout || "").trim();
    return /^[a-f0-9]{40}$/u.test(revision) ? revision : "UNAVAILABLE";
  } catch {
    return "UNAVAILABLE";
  }
}

async function runPublicCandidateGuard() {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [path.join(root, "audit", "public-candidate-guard.mjs")],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 120_000,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    const payloadValues = [...stdout.matchAll(/^PUBLIC_PAYLOAD_SHA256=([a-f0-9]{64})$/gmu)].map((match) => match[1]);
    const treeValues = [...stdout.matchAll(/^PUBLIC_PAYLOAD_TREE_OID=((?:[a-f0-9]{40}|[a-f0-9]{64}))$/gmu)].map((match) => match[1]);
    if (payloadValues.length !== 1 || treeValues.length !== 1) {
      throw new Error("The public-candidate guard did not emit exactly one public-payload digest and one payload-tree OID.");
    }
    return {
      status: "PASS",
      payloadSha256: payloadValues[0],
      payloadTreeOid: treeValues[0],
      stderr: String(stderr || "").slice(-4_000),
    };
  } catch (error) {
    return {
      status: "FAIL",
      payloadSha256: null,
      payloadTreeOid: null,
      error: String(error.stack || error),
      stdout: String(error.stdout || "").slice(-8_000),
      stderr: String(error.stderr || "").slice(-8_000),
    };
  }
}


async function curriculumManifestStatus() {
  try {
    const loaded = await loadManifest(path.join(root, CURRICULUM_PATH));
    const { manifest } = loaded;
    const counts = Object.freeze({
      bands: manifest.bands.length,
      levels: manifest.levels.length,
      skills: manifest.skills.length,
      strands: new Set(manifest.skills.map((skill) => skill.strand)).size,
      families: new Set(manifest.skills.map((skill) => skill.family)).size,
      gateways: manifest.skills.filter((skill) => skill.masteryRole === "GATEWAY").length,
    });
    const issues = [];
    const skillsByLevel = new Map(manifest.levels.map((level) => [level.number, []]));
    for (const skill of manifest.skills) skillsByLevel.get(skill.level)?.push(skill);
    if (counts.levels !== 21) issues.push(`Expected 21 neutral levels, found ${counts.levels}.`);
    if (counts.strands !== 6) issues.push(`Expected 6 neutral strands, found ${counts.strands}.`);
    if (counts.skills !== 126) issues.push(`Expected 126 neutral skills, found ${counts.skills}.`);
    for (const [level, skills] of skillsByLevel) {
      if (skills.length !== manifest.counts.skillsPerLevel) issues.push(`Level ${level} must contain exactly ${manifest.counts.skillsPerLevel} skills.`);
    }
    return {
      status: issues.length ? "FAIL" : "PASS",
      path: CURRICULUM_PATH,
      manifestId: manifest.manifestId,
      version: manifest.version,
      schemaVersion: manifest.schemaVersion,
      locale: manifest.locale,
      sha256: loaded.sha256,
      canonicalBytes: loaded.bytes.byteLength,
      counts,
      issues,
    };
  } catch (error) {
    return {
      status: "FAIL",
      path: CURRICULUM_PATH,
      manifestId: null,
      version: null,
      schemaVersion: null,
      locale: null,
      sha256: null,
      canonicalBytes: 0,
      counts: { bands: 0, levels: 0, skills: 0, strands: 0, families: 0, gateways: 0 },
      issues: [String(error)],
    };
  }
}

async function reviewedBrowserRunnerEvidence() {
  try {
    const text = await readFile(path.join(root, BROWSER_RUNNER_EVIDENCE_PATH), "utf8");
    return {
      ...parseReviewedBrowserRunnerEvidence(text),
      sha256: createHash("sha256").update(text, "utf8").digest("hex"),
    };
  } catch (error) {
    return {
      valid: false,
      status: "INVALID",
      browserProductName: null,
      browserFullVersion: null,
      browserExecutableSha256: null,
      runnerImageOS: null,
      runnerImageVersion: null,
      sha256: null,
      issues: [`reviewed browser/runner evidence is absent or unreadable (${String(error)})`],
    };
  }
}

function markdown(report, options) {
  return auditMarkdown(report, options, { EXPECTED, EXPECTED_SEMANTIC, MINIMUM_ENGINE_BRANCH_COVERAGE_PCT });
}

export async function runAudit({ browserPath = null } = {}) {
  const { auditTime, gateIntegrityPolicy, indexPath, revisionBefore, publicCandidateBefore, meta, curriculumManifest, candidateId, runId } = await initializeAudit();
  const laneExecution = await executeAuditLanes({ browserPath, candidateId, indexPath, gateIntegrityPolicy, runId });
  const { auditOrchestration, coverage, browser, playwright, mutation, generator, structured, engine, semantic, engineSuite } = interpretLaneEvidence({ laneExecution });
  const reviewedBrowserEvidence = await reviewedBrowserRunnerEvidence();
  const publicCandidate = await verifyPublicCandidateStability({ publicCandidateBefore, revisionBefore });
  const { stringTechnicalPass, parentStrings } = parentStringEvidence({ engine, structured, engineSuite });
  const rightsStateDigest = await rightsStateSha256(root);
  const publication = await publicationClearance({
    root, engineSha256: coverage.engineSha256, curriculumManifest, rightsSha256: rightsStateDigest,
    publicCandidate, browser, reviewedBrowserEvidence, now: auditTime,
  });
  const externalReleaseEvidence = publication.externalReleaseEvidence;
  const { actual, countsMatch } = auditCounts({ engine, semantic, browser, playwright, mutation, coverage, generator, auditOrchestration, externalReleaseEvidence });
  const outcomeSummary = auditOutcomeSummary({ engine, semantic, browser, playwright, mutation, coverage, generator, auditOrchestration, externalReleaseEvidence });
  const delivered = await deliveredFiles();
  const { residualRisks, unverifiedClaims, launcherPreflight } = auditRiskNotes({ parentStrings, browser, playwright, reviewedBrowserEvidence, coverage, mutation, generator, semantic, curriculumManifest, publicCandidate, externalReleaseEvidence });
  const gatesPass = auditGatesPass({ auditOrchestration, engine, stringTechnicalPass, semantic, curriculumManifest, coverage, mutation, generator, browser, playwright, countsMatch, meta, launcherPreflight, publicCandidate });
  const report = assembleAuditReport({ gatesPass, parentStrings, publication, residualRisks, externalReleaseEvidence, gateIntegrityPolicy, auditTime, meta, actual, countsMatch, outcomeSummary, auditOrchestration, engine, semantic, coverage, mutation, generator, browser, playwright, curriculumManifest, rightsStateDigest, launcherPreflight, publicCandidate, reviewedBrowserEvidence, delivered, unverifiedClaims });
  return await writeAuditReports({ report });
}

async function executeAuditLanes({ browserPath, candidateId, indexPath, gateIntegrityPolicy, runId }) {
  let laneExecution;
  try {
    laneExecution = await runBoundedAuditLanes({
      browserPath,
      candidateId,
      indexPath,
      policy: gateIntegrityPolicy.executionPolicy,
      root,
      runId,
    });
  } catch (error) {
    const message = String(error?.stack || error);
    laneExecution = {
      report: {
        schemaVersion: 1,
        resultType: "MATH_QUEST_AUDIT_ORCHESTRATION",
        status: "FAIL",
        runId,
        candidateId,
        executionMode: "FAILED_BEFORE_AGGREGATION",
        maximumConcurrentLanes: 0,
        maximumObservedConcurrency: 0,
        laneOrder: [...AUDIT_LANE_IDS],
        boundedExecutionStartOrder: [...gateIntegrityPolicy.executionPolicy.boundedExecutionStartOrder],
        laneSchedulingClass: Object.fromEntries(AUDIT_LANE_IDS.map((laneId) => [laneId, gateIntegrityPolicy.executionPolicy.laneSchedulingClass[laneId]])),
        wallDurationMs: 0,
        serialEquivalentDurationMs: 0,
        observedOverlapReductionPercent: 0,
        minimumAdoptionReductionPercent: gateIntegrityPolicy.executionPolicy.minimumMeasuredWallTimeReductionPercent,
        automaticRetries: 0,
        laneExecutions: AUDIT_LANE_IDS.map((laneId) => ({ laneId, executionStatus: "ERROR", durationMs: 0, resultStatus: "FAIL", error: message })),
        issues: [message],
      },
      results: Object.fromEntries(AUDIT_LANE_IDS.map((laneId) => [laneId, failedAuditLaneResult(laneId, message, "ERROR")])),
    };
  }
  return laneExecution;
}

function interpretLaneEvidence({ laneExecution }) {
  const auditOrchestration = laneExecution.report;
  const coverage = laneExecution.results.coverage;
  const browser = laneExecution.results.browser;
  const playwright = laneExecution.results.playwright;
  const mutation = laneExecution.results.mutation;
  const generator = laneExecution.results.generator;
  const structured = coverage.structuredAuditValid ? coverage.structuredAudit : null;
  const engine = structured
    ? { summary: structured.engine.summary, results: structured.engine.results, effectMap: structured.engine.effectMap }
    : { summary: { requiredFailures: 1 }, results: [], effectMap: {} };
  const semantic = structured
    ? structured.semantic
    : { assertions: [], summary: {}, failures: ["Instrumented semantic evidence is unavailable."], contractPass: false };
  const engineSuite = engineEvidenceProjection({ coverage, structured });
  return { auditOrchestration, coverage, browser, playwright, mutation, generator, structured, engine, semantic, engineSuite };
}

async function verifyPublicCandidateStability({ publicCandidateBefore, revisionBefore }) {
  const publicCandidateAfter = await runPublicCandidateGuard();
  const revisionAfter = await repositoryRevision();
  const publicCandidateStability = auditCandidateStabilityIssues({
    before: publicCandidateBefore,
    after: publicCandidateAfter,
    revisionBefore,
    revisionAfter,
  });
  const publicCandidateStable = publicCandidateStability.length === 0;
  const publicCandidate = {
    status: publicCandidateStable ? "PASS" : "FAIL",
    payloadSha256: publicCandidateBefore.payloadSha256,
    payloadTreeOid: publicCandidateBefore.payloadTreeOid,
    revisionBefore,
    revisionAfter,
    before: publicCandidateBefore,
    after: publicCandidateAfter,
    stabilityIssues: publicCandidateStability,
    reason: publicCandidateStable
      ? "The repository revision, public payload, and payload tree remained identical before and after the audit."
      : "The public-candidate guard failed, the repository revision was invalid or changed, or the public payload changed during the audit.",
  };
  return publicCandidate;
}

function parentStringEvidence({ engine, structured, engineSuite }) {
  const stringResult = engine.results.find((item) => item.id === "BEH-25");
  const stringTechnicalPass = Boolean(stringResult && stringResult.status !== "FAIL");
  const candidateDigest = structured?.engine?.childStringCandidateSha256 ?? null;
  const digest = approvedStringDigest({ stringResult, engineSuite, candidateDigest });
  const parentStrings = { status: stringResult?.status === "PASS" ? "APPROVED" : "PENDING_APPROVAL", digest, candidateDigest };
  return { stringTechnicalPass, parentStrings };
}

function auditCounts({ engine, semantic, browser, playwright, mutation, coverage, generator, auditOrchestration, externalReleaseEvidence }) {
  const actual = {
    engineAssertions: engine.results.length,
    semanticAssertions: semantic.assertions.length,
    browserAssertions: browser.results.length,
    playwrightAssertions: playwright.results.length,
    mutationFamilies: mutation.families.length,
    coverageGates: coverage.branchPct === null ? 0 : 1,
    generatorGates: generator && typeof generator.status === "string" ? 1 : 0,
    auditOrchestrationGates: auditOrchestration && typeof auditOrchestration.status === "string" ? 1 : 0,
    launcherGates: process.env.MQ_LAUNCHER_PREFLIGHT ? 1 : 0,
    externalEvidenceGates: externalReleaseEvidence.gates.length,
  };
  actual.total = Object.values(actual).reduce((sum, value) => sum + value, 0);
  const countsMatch = Object.entries(EXPECTED).every(([key, value]) => actual[key] === value);
  return { actual, countsMatch };
}

function auditOutcomeSummary({ engine, semantic, browser, playwright, mutation, coverage, generator, auditOrchestration, externalReleaseEvidence }) {
  const normalizedOutcomeStatus = (status) => ({
    failed: "FAIL",
    interrupted: "CANCELLED",
    passed: "PASS",
    skipped: "SKIPPED",
    SKIP: "SKIPPED",
    timedOut: "TIMEOUT",
    OPTIONAL: "OPTIONAL_NOT_RUN",
  }[status] || status);
  const outcomeStatuses = [
    ...requiredOutcomeStatuses(engine.results, { containerStatus: coverage.status, expectedCount: EXPECTED.engineAssertions, normalizeStatus: normalizedOutcomeStatus }),
    ...requiredOutcomeStatuses(semantic.assertions, { containerStatus: coverage.status, expectedCount: EXPECTED.semanticAssertions, normalizeStatus: normalizedOutcomeStatus }),
    ...requiredOutcomeStatuses(browser.results, { containerStatus: browser.status, expectedCount: EXPECTED.browserAssertions, normalizeStatus: normalizedOutcomeStatus }),
    ...requiredOutcomeStatuses(playwright.results, { containerStatus: playwright.status, expectedCount: EXPECTED.playwrightAssertions, normalizeStatus: normalizedOutcomeStatus }),
    ...requiredOutcomeStatuses(mutation.families, { containerStatus: mutation.status, expectedCount: EXPECTED.mutationFamilies, normalizeStatus: normalizedOutcomeStatus }),
    normalizedOutcomeStatus(coverage.status),
    normalizedOutcomeStatus(generator.status),
    normalizedOutcomeStatus(auditOrchestration.status),
    process.env.MQ_LAUNCHER_PREFLIGHT?.startsWith("PASS_") ? "PASS" : "FAIL",
    ...externalReleaseEvidence.gates.map((record) => normalizedOutcomeStatus(record.status)),
  ];
  const outcomeSummary = summarizeGateOutcomes(outcomeStatuses, {
    inventoryExpected: EXPECTED.total,
    runId: process.env.GITHUB_RUN_ID || "LOCAL",
  });
  return outcomeSummary;
}

function auditRiskNotes({ parentStrings, browser, playwright, reviewedBrowserEvidence, coverage, mutation, generator, semantic, curriculumManifest, publicCandidate, externalReleaseEvidence }) {
  const residualRisks = [];
  const unverifiedClaims = [];
  residualRisks.push("At 390×844, an adult who expands an optional teaching model in the Parent Test Lab may need to scroll to its Grade control; the live child flow and the approved question-first narrow Lab baseline remain within their tested viewport and size floors.");
  residualRisks.push("MEDIUM: GitHub's windows-latest selector is floating. The qualification evidence and final certification each bind their own exact browser product/version/executable SHA-256 and hosted ImageOS/ImageVersion; the label alone is never evidence, and the two independently valid tuples may differ.");
  unverifiedClaims.push("This local automated review does not verify control of the OpenMathQuest organization and OpenMathQuest/openmathquest.github.io repository, exclusive use of that organization for Math Quest Pages, the root Pages configuration, absence of a CNAME, HTTPS, deployment from the exact reviewed release tag, the deployed artifact, physical Windows/iPhone/iPad devices, or external legal/privacy review.");
  if (parentStrings.status !== "APPROVED") residualRisks.push("Child-facing strings are placeholders pending the project owner's parent approval; the game is not shippable.");
  appendExecutionClaims({ browser, playwright, reviewedBrowserEvidence, coverage, mutation, generator, unverifiedClaims });
  if (!semantic.contractPass) unverifiedClaims.push("The canonical manifest-to-generator task-type and constraint semantics, including all 166 declared task types, have not all passed their independent effect-sensitive checks.");
  if (curriculumManifest.status !== "PASS") unverifiedClaims.push("The versioned neutral curriculum manifest is not valid, canonical-hashed, and complete across 21 six-skill levels and its six declared strands.");
  const launcherPreflight = process.env.MQ_LAUNCHER_PREFLIGHT || "NOT_RUN";
  if (!launcherPreflight.startsWith("PASS_")) unverifiedClaims.push("The fixed-port launcher/server identity preflight did not pass.");
  if (publicCandidate.status !== "PASS") unverifiedClaims.push("The exact staged privacy, provenance, full-tree classification, asset-hash, workflow-pin, and open-licence guard did not pass consistently before and after the audit.");
  for (const gateResult of externalReleaseEvidence.gates.filter((item) => item.status !== "PASS")) {
    if (["DEFERRED", "OWNER_SKIPPED"].includes(gateResult.status)) {
      residualRisks.push(`${gateResult.id} [${gateResult.classification}]: ${gateResult.details}`);
    } else {
      unverifiedClaims.push(`${gateResult.id} [${gateResult.classification}]: ${gateResult.title} is not verified (${gateResult.details}).`);
    }
  }
  return { residualRisks, unverifiedClaims, launcherPreflight };
}

function auditGatesPass({ auditOrchestration, engine, stringTechnicalPass, semantic, curriculumManifest, coverage, mutation, generator, browser, playwright, countsMatch, meta, launcherPreflight, publicCandidate }) {
  return learningGatesPass({ auditOrchestration, engine, stringTechnicalPass, semantic, curriculumManifest }) && executionGatesPass({ coverage, mutation, generator, browser, playwright }) && countsMatch && meta.promptDigestMatchesRegister && launcherPreflight.startsWith("PASS_") && publicCandidate.status === "PASS";
}


async function initializeAudit() {
  const auditTime = new Date();
  const gateIntegrityPolicy = await loadGateIntegrityPolicy();
  const indexPath = path.join(root, "index.html");
  const revisionBefore = await repositoryRevision();
  const publicCandidateBefore = await runPublicCandidateGuard();
  const [meta, curriculumManifest] = await Promise.all([
    metadata(),
    curriculumManifestStatus(),
  ]);
  const candidateId = `${revisionBefore}:${publicCandidateBefore.payloadSha256 || "UNAVAILABLE"}`;
  const runId = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT || "1"}`
    : `LOCAL:${process.pid}:${auditTime.toISOString()}`;
  return { auditTime, gateIntegrityPolicy, indexPath, revisionBefore, publicCandidateBefore, meta, curriculumManifest, candidateId, runId };
}

async function writeAuditReports({ report }) {
  const publicReport = sanitizeHostDetails(report);
  await writeFile(path.join(root, "audit", "last-report.json"), `${JSON.stringify(publicReport, null, 2)}\n`, "utf8");
  await writeFile(path.join(root, "audit", "last-report.md"), markdown(publicReport), "utf8");
  await writeFile(path.join(root, "audit", "final-build-report.md"), markdown(publicReport, { final: true }), "utf8");
  return publicReport;
}

function assembleAuditReport({ gatesPass, parentStrings, publication, residualRisks, externalReleaseEvidence, gateIntegrityPolicy, auditTime, meta, actual, countsMatch, outcomeSummary, auditOrchestration, engine, semantic, coverage, mutation, generator, browser, playwright, curriculumManifest, rightsStateDigest, launcherPreflight, publicCandidate, reviewedBrowserEvidence, delivered, unverifiedClaims }) {
  const technicalShippable = gatesPass && parentStrings.status === "APPROVED";
  if (!["APPROVED", "EMERGENCY_APPROVED"].includes(publication.status)) residualRisks.push(publication.reason);
  const shippable = computeReleaseDecision({
    technicalShippable,
    publicationStatus: publication.status,
    externalReleaseEvidence,
  });
  const report = {
    schemaVersion: 2, reportType: "MATH_QUEST_CERTIFICATION", aiReaderContractRef: AI_READER_CONTRACT_REF,
    gateIntegrityPolicy: { policyId: gateIntegrityPolicy.policyId, version: gateIntegrityPolicy.version, authority: GATE_INTEGRITY_POLICY.authority },
    generatedAt: auditTime.toISOString(), status: gatesPass ? (parentStrings.status === "APPROVED" ? (shippable ? "PASS" : "PUBLICATION_BLOCKED") : "PENDING_PARENT_APPROVAL") : "FAIL",
    technicalShippable, shippable, publication, metadata: meta, predicted: EXPECTED, actual, countsMatch, outcomeSummary, auditOrchestration, engine, semantic, coverage, mutation, generator, browser, playwright,
    externalReleaseEvidence, curriculumManifest, rightsStateSha256: rightsStateDigest, parentStrings, launcherPreflight, publicCandidate, reviewedBrowserRunnerEvidence: reviewedBrowserEvidence, deliveredFiles: delivered, residualRisks, unverifiedClaims,
  };
  return report;
}

function engineEvidenceProjection({ coverage, structured }) {
  const engineSuite = {
    extracted: { sha256: coverage.engineSha256 ?? null },
    engine: {
      CONSTANTS: {
        CHILD_STRINGS_PENDING_APPROVAL: structured?.engine?.childStringConstants?.pendingApproval ?? true,
        CHILD_STRING_APPROVAL_SHA256: structured?.engine?.childStringConstants?.approvalSha256 ?? null,
      },
    },
  };
  return engineSuite;
}

function approvedStringDigest({ stringResult, engineSuite, candidateDigest }) {
  return stringResult?.status === "PASS" ? (engineSuite.engine?.CONSTANTS?.CHILD_STRING_APPROVAL_SHA256 ?? engineSuite.engine?.CONSTANTS?.CHILD_STRING_DIGEST ?? candidateDigest) : null;
}

function appendExecutionClaims({ browser, playwright, reviewedBrowserEvidence, coverage, mutation, generator, unverifiedClaims }) {
  if (browser.status !== "PASS") unverifiedClaims.push("The complete real-browser interaction flow is not verified.");
  if (playwright.status !== "PASS") unverifiedClaims.push("The direct native-input Playwright journey matrix is not verified.");
  if (!browser.evidence?.validForPublication) unverifiedClaims.push("This run did not record a complete GitHub-hosted browser/runner tuple suitable for publication approval.");
  if (reviewedBrowserEvidence.status !== "REVIEWED") unverifiedClaims.push("The exact GitHub-hosted browser/runner tuple remains pending independent review.");
  if (coverage.status !== "PASS") unverifiedClaims.push(`At least ${MINIMUM_ENGINE_BRANCH_COVERAGE_PCT}% branch coverage of the exact shipped engine bytes is not verified.`);
  if (mutation.status !== "PASS") unverifiedClaims.push("All eleven required representative mutant families have not been shown to fail.");
  if (generator.status !== "PASS") unverifiedClaims.push("Every generated question has not passed the exhaustive self-grade and input-reachability audit.");
}

function learningGatesPass({ auditOrchestration, engine, stringTechnicalPass, semantic, curriculumManifest }) {
  return auditOrchestration.status === "PASS" && engine.summary.requiredFailures === 0 && stringTechnicalPass && semantic.contractPass && curriculumManifest.status === "PASS";
}

function executionGatesPass({ coverage, mutation, generator, browser, playwright }) {
  return coverage.status === "PASS" && mutation.status === "PASS" && generator.status === "PASS" && browser.status === "PASS" && playwright.status === "PASS";
}


const report = await runAudit({ browserPath: arg("browser") || process.env.MQ_BROWSER_PATH || null });
const browserDiagnostic = report.browser.status === "PASS" ? null : {
  reason: report.browser.reason ?? null,
  timedOut: report.browser.process?.timedOut ?? false,
  processStatus: report.browser.process?.status ?? null,
  signal: report.browser.process?.signal ?? null,
  error: report.browser.process?.error ?? null,
  complete: report.browser.complete ?? false,
  parseError: report.browser.parseError ?? null,
  cleanupError: report.browser.cleanupError ?? null,
  assertions: report.browser.results.length,
};
process.stdout.write(`${JSON.stringify({
  schemaVersion: report.schemaVersion,
  reportType: report.reportType,
  aiReaderContractRef: report.aiReaderContractRef,
  status: report.status,
  technicalShippable: report.technicalShippable,
  publication: report.publication.status,
  externalReleaseEvidence: {
    status: report.externalReleaseEvidence.status,
    passCount: report.externalReleaseEvidence.passCount,
    requiredCount: report.externalReleaseEvidence.requiredCount,
    optionalCount: report.externalReleaseEvidence.optionalCount,
    optionalCompletedCount: report.externalReleaseEvidence.optionalCompletedCount,
    gates: report.externalReleaseEvidence.gates.map(({ id, status, classification }) => ({ id, status, classification })),
  },
  shippable: report.shippable,
  countsMatch: report.countsMatch,
  outcomeSummary: report.outcomeSummary,
  publicCandidate: {
    status: report.publicCandidate.status,
    payloadSha256: report.publicCandidate.payloadSha256,
    payloadTreeOid: report.publicCandidate.payloadTreeOid,
    revisionBefore: report.publicCandidate.revisionBefore,
    revisionAfter: report.publicCandidate.revisionAfter,
  },
  actual: report.actual,
  curriculumManifest: {
    status: report.curriculumManifest.status,
    manifestId: report.curriculumManifest.manifestId,
    version: report.curriculumManifest.version,
    sha256: report.curriculumManifest.sha256,
    counts: report.curriculumManifest.counts,
  },
  engine: report.engine.summary,
  semantic: { status: report.semantic.contractPass ? "PASS" : "FAIL", ...report.semantic.summary },
  coverage: { status: report.coverage.status, branchPct: report.coverage.branchPct },
  generator: report.generator.status,
  mutation: report.mutation.status,
  browser: report.browser.status,
  playwright: report.playwright.status,
  browserEvidence: report.browser.evidence ?? null,
  browserDiagnostic,
  parentStrings: report.parentStrings.status,
}, null, 2)}\n`);
const technicalOnly = process.argv.includes("--technical-only");
process.exitCode = (technicalOnly ? report.technicalShippable : report.shippable) ? 0 : 1;
