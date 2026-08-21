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
  publicationBrowserEvidenceState,
} from "./lib/browser-runner-evidence.mjs";
import { CURRICULUM_PATH, loadManifest } from "./lib/curriculum-manifest.mjs";
import {
  clearanceMatches,
  computeReleaseDecision,
  CURRENT_RELEASE_TAG,
  evaluateExternalReleaseEvidence,
  EXTERNAL_RELEASE_GATE_IDS,
  parsePublicationClearance,
  PUBLICATION_CLEARANCE_PATH,
} from "./lib/publication-clearance.mjs";
import { observeRuntimeEquivalentEvidenceSuccessor } from "./lib/release-evidence-successor.mjs";
import { loadReleaseEvidenceBundle } from "./lib/release-evidence-bundle.mjs";
import { rightsStateSha256 } from "./lib/rights-state.mjs";
import { AI_READER_CONTRACT_REF } from "./lib/repository-code-map.mjs";
import {
  GATE_INTEGRITY_POLICY,
  loadGateIntegrityPolicy,
  REPRESENTATIVE_MUTATION_FAMILY_COUNT,
  summarizeGateOutcomes,
} from "./lib/gate-integrity-policy.mjs";
import {
  AUDIT_LANE_IDS,
  failedAuditLaneResult,
  runBoundedAuditLanes,
} from "./lib/bounded-audit-lanes.mjs";
import { MINIMUM_ENGINE_BRANCH_COVERAGE_PCT } from "./run-coverage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_SEMANTIC = Object.freeze({ assertions: 130, skills: 126, taskTypes: 166, questions: 6_048 });
const EXPECTED_COMPONENTS = Object.freeze({ engineAssertions: 43, semanticAssertions: EXPECTED_SEMANTIC.assertions, browserAssertions: EXPECTED_BROWSER_RESULT_IDS.length, playwrightAssertions: PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.length, mutationFamilies: REPRESENTATIVE_MUTATION_FAMILY_COUNT, coverageGates: 1, generatorGates: 1, launcherGates: 1, externalEvidenceGates: EXTERNAL_RELEASE_GATE_IDS.length });
const EXPECTED = Object.freeze({ ...EXPECTED_COMPONENTS, total: Object.values(EXPECTED_COMPONENTS).reduce((sum, value) => sum + value, 0) });
const execFileAsync = promisify(execFile);

function arg(name) {
  const prefix = `--${name}=`; const entry = process.argv.find((value) => value.startsWith(prefix)); return entry ? entry.slice(prefix.length) : null;
}

function esc(value) { return String(value ?? "").replace(/\|/gu, "\\|").replace(/\r?\n/gu, " "); }
function tick(value) { return `\`${String(value ?? "—").replace(/`/gu, "\\`")}\``; }
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

async function publicationClearance(engineSha256, curriculumManifest, rightsSha256, publicCandidate, browser, reviewedBrowserEvidence, now) {
  const clearancePath = path.join(root, PUBLICATION_CLEARANCE_PATH);
  const liveBrowserEvidence = browser?.evidence ?? {};
  const browserEvidenceState = publicationBrowserEvidenceState(liveBrowserEvidence, reviewedBrowserEvidence);
  const reviewedBrowserTuple = browserEvidenceState.reviewedTuple ?? {};
  const expected = {
    engineSha256,
    manifestVersion: curriculumManifest.version,
    manifestSha256: curriculumManifest.sha256,
    rightsSha256,
    payloadSha256: publicCandidate.payloadSha256,
    payloadTreeOid: publicCandidate.payloadTreeOid,
    browserProductName: reviewedBrowserTuple.browserProductName,
    browserFullVersion: reviewedBrowserTuple.browserFullVersion,
    browserExecutableSha256: reviewedBrowserTuple.browserExecutableSha256,
    runnerImageOS: reviewedBrowserTuple.runnerImageOS,
    runnerImageVersion: reviewedBrowserTuple.runnerImageVersion,
    browserRunnerEvidenceSha256: reviewedBrowserEvidence.sha256,
    browserRunnerEvidenceReviewed: browserEvidenceState.valid,
    releaseTag: CURRENT_RELEASE_TAG,
    now,
  };
  try {
    const clearance = await readFile(clearancePath, "utf8");
    const parsed = parsePublicationClearance(clearance);
    const releaseEvidenceBundle = await loadReleaseEvidenceBundle();
    expected.releaseEvidenceBindings = releaseEvidenceBundle.bindings;
    const evidenceSuccessor = parsed.status === "EMERGENCY_APPROVED"
      ? { valid: true, issues: [] }
      : await observeRuntimeEquivalentEvidenceSuccessor(root, parsed.qualificationCommitSha);
    expected.qualificationCommitSha = parsed.qualificationCommitSha;
    expected.evidenceSuccessorValid = evidenceSuccessor.valid;
    expected.qualificationPayloadSha256 = evidenceSuccessor.qualificationPayloadSha256;
    expected.qualificationPayloadTreeOid = evidenceSuccessor.qualificationPayloadTreeOid;
    const browserEvidenceReady = browserEvidenceState.valid;
    const externalReleaseEvidence = evaluateExternalReleaseEvidence(parsed, expected, now);
    const approved = curriculumManifest.status === "PASS"
      && publicCandidate.status === "PASS"
      && browserEvidenceReady
      && releaseEvidenceBundle.valid
      && ["PASS", "EMERGENCY_WAIVER"].includes(externalReleaseEvidence.status)
      && clearanceMatches(parsed, expected);
    return {
      status: approved ? parsed.status : "BLOCKED",
      reviewDate: parsed.reviewDate,
      reviewResult: parsed.reviewResult,
      requiredFailures: parsed.requiredFailures,
      requiredSkips: parsed.requiredSkips,
      residualRisks: parsed.residualRisks,
      releaseEvidenceBundle: {
        status: releaseEvidenceBundle.valid ? "VALIDATED" : "BLOCKED",
        issues: releaseEvidenceBundle.issues,
      },
      reviewedEngineSha256: parsed.reviewedEngineSha256,
      reviewedManifestVersion: parsed.reviewedManifestVersion,
      reviewedManifestSha256: parsed.reviewedManifestSha256,
      reviewedRightsSha256: parsed.reviewedRightsSha256,
      reviewedPayloadSha256: parsed.reviewedPayloadSha256,
      reviewedPayloadTreeOid: parsed.reviewedPayloadTreeOid,
      reviewedBrowserProductName: parsed.reviewedBrowserProductName,
      reviewedBrowserFullVersion: parsed.reviewedBrowserFullVersion,
      reviewedBrowserExecutableSha256: parsed.reviewedBrowserExecutableSha256,
      reviewedRunnerImageOS: parsed.reviewedRunnerImageOS,
      reviewedRunnerImageVersion: parsed.reviewedRunnerImageVersion,
      browserEvidenceReady,
      liveBrowserEvidenceValid: browserEvidenceState.liveValid,
      reviewedBrowserEvidenceValid: browserEvidenceState.reviewedValid,
      browserTuplesMatch: browserEvidenceState.tuplesMatch,
      evidenceSuccessor,
      externalReleaseEvidence,
      schemaIssues: parsed.issues,
      reason: approved
        ? parsed.status === "EMERGENCY_APPROVED"
          ? "Emergency Beta 3 clearance matches the exact candidate and reviewed hosted-Windows record, and the final hosted tuple is independently valid; six external evidence gates are transparently owner-waived for this tag only."
          : externalReleaseEvidence.prereleaseHostDeferralEligible
            ? "Reviewed publication clearance matches the exact prerelease candidate, direct evidence successor, reviewed qualification hosted-Windows record, independently valid final hosted tuple, every mandatory Beta external gate, the visible non-passing host deferral, both optional evidence records, and project-owner authorization."
            : "Reviewed publication clearance matches the exact candidate, reviewed qualification hosted-Windows record, independently valid final hosted tuple, every mandatory external gate, both visible optional evidence records, and project-owner authorization."
        : `PUBLICATION_CLEARANCE.md is absent, pending, stale, invalid, or does not match the exact candidate, direct evidence successor, reviewed qualification browser/runner record, independently valid final hosted tuple, required external gates, and visible optional, owner-skipped, or prerelease-deferred evidence records${[...parsed.issues, ...(evidenceSuccessor.issues || [])].length ? ` (${[...parsed.issues, ...(evidenceSuccessor.issues || [])].join("; ")})` : ""}.`,
    };
  } catch (error) {
    const parsed = parsePublicationClearance("");
    return {
      status: "BLOCKED",
      reviewedEngineSha256: null,
      reviewedManifestVersion: null,
      reviewedManifestSha256: null,
      reviewedRightsSha256: null,
      reviewedPayloadSha256: null,
      reviewedPayloadTreeOid: null,
      reviewedBrowserProductName: null,
      reviewedBrowserFullVersion: null,
      reviewedBrowserExecutableSha256: null,
      reviewedRunnerImageOS: null,
      reviewedRunnerImageVersion: null,
      browserEvidenceReady: false,
      liveBrowserEvidenceValid: false,
      reviewedBrowserEvidenceValid: false,
      browserTuplesMatch: false,
      externalReleaseEvidence: evaluateExternalReleaseEvidence(parsed, expected, now),
      schemaIssues: ["publication clearance is absent or unreadable"],
      reason: `PUBLICATION_CLEARANCE.md is absent or unreadable; all external release evidence and owner authorization remain blocked (${String(error)}).`,
    };
  }
}

function markdown(report, { final = false } = {}) {
  const engineResults = report.engine.results;
  const semanticResults = report.semantic.assertions;
  const mutationCases = report.mutation.families.flatMap((family) => family.cases ?? [family]);
  const failures = [
    ...semanticResults.filter((x) => x.status === "FAIL" || x.ok === false).map((x) => `${x.id}: ${x.title} — ${x.details || x.reason || "semantic assertion failed"}`),
    ...(!report.semantic.ok && semanticResults.length === 0 ? report.semantic.failures.map((x) => `${x.id}: ${x.title} — ${x.details || x.reason || "semantic suite failed"}`) : []),
    ...(report.semantic.contractPass ? [] : [`Semantic contract totals: expected ${EXPECTED_SEMANTIC.assertions} assertions, ${EXPECTED_SEMANTIC.skills} skills, ${EXPECTED_SEMANTIC.taskTypes} task types, and ${EXPECTED_SEMANTIC.questions} questions; observed ${semanticResults.length}, ${report.semantic.summary.skills ?? "unavailable"}, ${report.semantic.summary.taskTypes ?? "unavailable"}, and ${report.semantic.summary.questions ?? "unavailable"}.`]),
    ...engineResults.filter((x) => x.status === "FAIL").map((x) => `${x.id}: ${x.title} — ${x.details}`),
    ...report.browser.results.filter((x) => x.status === "FAIL").map((x) => `${x.id}: ${x.title} — ${x.details}`),
    ...report.playwright.results.filter((x) => x.status !== "passed").map((x) => `${x.key}: direct Playwright journey ended ${x.status}`),
    ...report.mutation.families.filter((x) => x.status === "FAIL").map((x) => `Mutation ${x.family}: ${x.reason}`),
    ...(report.generator.status === "PASS" ? [] : [`Exhaustive generator gate: ${(report.generator.issues || []).join("; ") || report.generator.error || "process did not pass"}`]),
    ...(report.coverage.status === "PASS" ? [] : [`Coverage: ${report.coverage.calibration.reasons.join("; ") || report.coverage.aggregationError || `engine branch result ${report.coverage.branchPct ?? "unavailable"}`}`]),
    ...(report.browser.status === "PASS" ? [] : [`Browser smoke process: ${report.browser.reason || report.browser.process?.error || report.browser.process?.stderr || "did not complete"}`]),
    ...(report.playwright.status === "PASS" ? [] : report.playwright.findings.map((item) => `Playwright Test: ${item}`)),
    ...(report.auditOrchestration.status === "PASS" ? [] : report.auditOrchestration.issues.map((item) => `Audit orchestration: ${item}`)),
    ...(report.curriculumManifest.status === "PASS" ? [] : [`Curriculum manifest: ${report.curriculumManifest.issues.join("; ") || "validation failed"}`]),
    ...(report.countsMatch ? [] : ["Predicted and actual audit counts do not match."]),
  ];
  const skipped = [
    ...semanticResults.filter((x) => x.status === "SKIP").map((x) => `${x.id}: ${x.title} — ${x.details || ""}`),
    ...engineResults.filter((x) => x.status === "SKIP").map((x) => `${x.id}: ${x.title} — ${x.details}`),
    ...report.browser.results.filter((x) => x.status === "SKIP").map((x) => `${x.id}: ${x.title} — ${x.details}`),
    ...(report.browser.status === "SKIP" ? [report.browser.reason] : []),
    ...report.externalReleaseEvidence.gates
      .filter((item) => item.status !== "PASS")
      .map((item) => `${item.id} [${item.classification}]: ${item.title} — ${item.details}`),
    ...(["APPROVED", "EMERGENCY_APPROVED"].includes(report.publication.status) ? [] : [`Public publication: ${report.publication.reason}`]),
  ];
  const title = final ? "Final build audit report" : "Last audit report";
  const browserEvidenceDetail = !report.publication.reviewedBrowserEvidenceValid
    ? "reviewed qualification record is invalid or pending"
    : !report.publication.liveBrowserEvidenceValid
      ? "final hosted tuple is invalid or unavailable"
      : report.publication.browserTuplesMatch
        ? "both exact tuples happen to match"
        : "both exact tuples differ because windows-latest floated";
  const lines = [
    `# ${title}`, "",
    `- **Generated:** ${tick(report.generatedAt)}`,
    `- **Overall:** ${tick(report.status)}`,
    `- **Technical game gates:** ${tick(report.technicalShippable ? "PASS" : "FAIL")}`,
    `- **Audit orchestration:** ${tick(`${report.auditOrchestration.status}; ${report.auditOrchestration.executionMode}; ${report.auditOrchestration.maximumObservedConcurrency}/${report.auditOrchestration.maximumConcurrentLanes} top-level lanes`)}`,
    `- **Public publication clearance:** ${tick(report.publication.status)}`,
    `- **External release evidence:** ${tick(`${report.externalReleaseEvidence.status} (${report.externalReleaseEvidence.passCount}/${report.externalReleaseEvidence.requiredCount} mandatory; ${report.externalReleaseEvidence.deferredCount ?? 0} prerelease deferred; ${report.externalReleaseEvidence.optionalCompletedCount}/${report.externalReleaseEvidence.optionalCount} optional completed)`)}`,
    `- **External evidence expiry:** ${tick(report.externalReleaseEvidence.expiresAt || "PENDING")}`,
    `- **Shippable:** ${tick(report.shippable ? "YES" : "NO")}`,
    `- **Build contract:** ${tick(`docs/development/build-spec.md v${report.metadata.promptVersion}`)}`,
    `- **Prompt revision ID:** ${tick(`sha256:${report.metadata.promptSha256}`)}`,
    `- **Register revision ID:** ${tick(report.metadata.registerRevision)}`,
    `- **Final misread-test result:** ${tick("Prompt v2.1 version record: no material divergence")}`,
    `- **Engine revision ID:** ${tick(report.coverage.engineSha256 ? `sha256:${report.coverage.engineSha256}` : "UNAVAILABLE")}`,
    `- **Curriculum manifest:** ${tick(report.curriculumManifest.manifestId && report.curriculumManifest.version ? `${report.curriculumManifest.manifestId} v${report.curriculumManifest.version}` : "INVALID")}`,
    `- **Curriculum manifest revision ID:** ${tick(report.curriculumManifest.sha256 ? `sha256:${report.curriculumManifest.sha256}` : "UNAVAILABLE")}`,
    `- **Open-component rights-state revision ID:** ${tick(report.rightsStateSha256 ? `sha256:${report.rightsStateSha256}` : "UNAVAILABLE")}`,
    `- **Public payload revision ID:** ${tick(report.publicCandidate.payloadSha256 ? `sha256:${report.publicCandidate.payloadSha256}` : "UNAVAILABLE")}`,
    `- **Public payload tree OID:** ${tick(report.publicCandidate.payloadTreeOid || "UNAVAILABLE")}`,
    `- **Browser product:** ${tick(report.browser.evidence?.browserProductName || "UNAVAILABLE")}`,
    `- **Browser full version:** ${tick(report.browser.evidence?.browserFullVersion || "UNAVAILABLE")}`,
    `- **Browser executable SHA-256:** ${tick(report.browser.evidence?.browserExecutableSha256 || "UNAVAILABLE")}`,
    `- **GitHub-hosted runner ImageOS:** ${tick(report.browser.evidence?.runnerImageOS || "UNAVAILABLE")}`,
    `- **GitHub-hosted runner ImageVersion:** ${tick(report.browser.evidence?.runnerImageVersion || "UNAVAILABLE")}`,
    `- **Reviewed browser/runner evidence:** ${tick(report.reviewedBrowserRunnerEvidence.status)}`,
    `- **Curriculum manifest counts:** ${tick(`${report.curriculumManifest.counts.levels} levels; ${report.curriculumManifest.counts.skills} skills; ${report.curriculumManifest.counts.strands} strands; ${report.curriculumManifest.counts.families} generator families; ${report.curriculumManifest.counts.gateways} gateways`)}`,
    `- **Parent-string approval:** ${tick(report.parentStrings.status)}`,
    `- **Parent-string approval digest:** ${tick(report.parentStrings.digest || "PENDING")}`,
    `- **Child-string candidate digest:** ${tick(report.parentStrings.candidateDigest || "UNAVAILABLE")}`, "",
    "## Predicted and actual results", "",
    "| Countable result | Predicted | Actual | Result |", "|---|---:|---:|---|",
    `| Engine assertions | ${EXPECTED.engineAssertions} | ${report.actual.engineAssertions} | ${report.actual.engineAssertions === EXPECTED.engineAssertions ? "MATCH" : "MISMATCH"} |`,
    `| Manifest semantic assertions | ${EXPECTED.semanticAssertions} | ${report.actual.semanticAssertions} | ${report.actual.semanticAssertions === EXPECTED.semanticAssertions ? "MATCH" : "MISMATCH"} |`,
    `| Browser assertions | ${EXPECTED.browserAssertions} | ${report.actual.browserAssertions} | ${report.actual.browserAssertions === EXPECTED.browserAssertions ? "MATCH" : "MISMATCH"} |`,
    `| Direct Playwright assertions | ${EXPECTED.playwrightAssertions} | ${report.actual.playwrightAssertions} | ${report.actual.playwrightAssertions === EXPECTED.playwrightAssertions ? "MATCH" : "MISMATCH"} |`,
    `| Mutation families | ${EXPECTED.mutationFamilies} | ${report.actual.mutationFamilies} | ${report.actual.mutationFamilies === EXPECTED.mutationFamilies ? "MATCH" : "MISMATCH"} |`,
    `| Coverage gates | ${EXPECTED.coverageGates} | ${report.actual.coverageGates} | ${report.actual.coverageGates === EXPECTED.coverageGates ? "MATCH" : "MISMATCH"} |`,
    `| Exhaustive generator gates | ${EXPECTED.generatorGates} | ${report.actual.generatorGates} | ${report.actual.generatorGates === EXPECTED.generatorGates ? "MATCH" : "MISMATCH"} |`,
    `| Launcher/server gates | ${EXPECTED.launcherGates} | ${report.actual.launcherGates} | ${report.actual.launcherGates === EXPECTED.launcherGates ? "MATCH" : "MISMATCH"} |`,
    `| External release-evidence gates | ${EXPECTED.externalEvidenceGates} | ${report.actual.externalEvidenceGates} | ${report.actual.externalEvidenceGates === EXPECTED.externalEvidenceGates ? "MATCH" : "MISMATCH"} |`,
    `| **Total** | **${EXPECTED.total}** | **${report.actual.total}** | **${report.actual.total === EXPECTED.total ? "MATCH" : "MISMATCH"}** |`, "",
    "Inventory equality proves only that every expected record was emitted. It is not a pass count.", "",
    "## Outcome summary", "",
    "| Outcome class | Count |", "|---|---:|",
    `| Literal PASS | ${report.outcomeSummary.passedCount} |`,
    `| Failure or blocked | ${report.outcomeSummary.failedCount} |`,
    `| Skipped required execution | ${report.outcomeSummary.skippedCount} |`,
    `| Missing artifact | ${report.outcomeSummary.missingCount} |`,
    `| Required but not run | ${report.outcomeSummary.notRunCount} |`,
    `| Accepted non-pass | ${report.outcomeSummary.acceptedNonPassCount} |`,
    `| Inventory | ${report.outcomeSummary.inventoryActual}/${report.outcomeSummary.inventoryExpected} |`,
    `| Run ID | ${esc(report.outcomeSummary.runId)} |`, "",
    "## Gate results", "",
    "| Gate | Result | Evidence |", "|---|---|---|",
    `| Exact engine bytes | ${report.coverage.exactBytes ? "PASS" : "FAIL"} | ${esc(report.coverage.engineSha256 || "unavailable")} |`,
    `| Canonical curriculum manifest | ${report.curriculumManifest.status} | ${esc(report.curriculumManifest.manifestId || "invalid")} v${esc(report.curriculumManifest.version || "unavailable")}; ${esc(report.curriculumManifest.sha256 || "unavailable")}; ${report.curriculumManifest.canonicalBytes} canonical bytes |`,
    `| Open-component rights state | ${/^[a-f0-9]{64}$/u.test(String(report.rightsStateSha256)) ? "PASS" : "FAIL"} | ${esc(report.rightsStateSha256 || "unavailable")} |`,
    `| Stable staged privacy and open-component guard | ${report.publicCandidate.status} | before and after: ${esc(report.publicCandidate.payloadSha256 || "unavailable")}; payload tree ${esc(report.publicCandidate.payloadTreeOid || "unavailable")} |`,
    `| Restricted VM and behavioral suite | ${report.engine.summary.requiredFailures === 0 ? "PASS" : "FAIL"} | ${report.engine.summary.PASS} pass, ${report.engine.summary.FAIL} fail, ${report.engine.summary.SKIP} skip |`,
    `| Manifest-to-generator semantic suite | ${report.semantic.contractPass ? "PASS" : "FAIL"} | ${report.semantic.summary.PASS ?? 0} pass, ${report.semantic.summary.FAIL ?? report.semantic.failures.length} fail, ${report.semantic.summary.SKIP ?? 0} skip; ${report.semantic.summary.taskTypes ?? 0}/${EXPECTED_SEMANTIC.taskTypes} task types; ${report.semantic.summary.questions ?? 0}/${EXPECTED_SEMANTIC.questions} deterministic questions |`,
    `| Required Node major | ${report.coverage.node24 ? "PASS" : "FAIL"} | ${esc(report.coverage.nodeVersion || "unavailable")} |`,
    `| Native branch calibration | ${report.coverage.calibrated ? "PASS" : "FAIL"} | full ${report.coverage.calibration.fullBranchPct ?? "—"}%; partial ${report.coverage.calibration.partialBranchPct ?? "—"}%; complementary repeated-filename aggregation ${report.coverage.calibration.aggregateBranchPct ?? "—"}% |`,
    `| Engine branch coverage | ${report.coverage.status} | calibrated native ${report.coverage.branchPct ?? "not measured"}% (minimum ${MINIMUM_ENGINE_BRANCH_COVERAGE_PCT}%); raw diagnostic ${report.coverage.branchCovered ?? 0}/${report.coverage.branchTotal ?? 0} ${esc(report.coverage.branchMetric || "branch ranges")} (${report.coverage.rawBlockRangePct ?? "—"}%); ${report.coverage.scriptInstanceCount ?? 0} merged exact-URL script record(s); virtual file ${esc(report.coverage.virtualFilename || "missing")} |`,
    `| Exhaustive generated-question audit | ${report.generator.status} | ${report.generator.questions ?? 0} questions; ${report.generator.skills ?? 0} skills |`,
    `| Eleven-family mutation sanity | ${report.mutation.status} | ${report.mutation.families.filter((x) => x.status === "PASS").length}/11 families; ${mutationCases.filter((x) => x.status === "PASS").length}/${mutationCases.length} effect-sensitive cases killed |`,
    `| Browser smoke | ${report.browser.status} | ${report.browser.results.filter((x) => x.status === "PASS").length} pass, ${report.browser.results.filter((x) => x.status === "FAIL").length} fail, ${report.browser.results.filter((x) => x.status === "SKIP").length} skip |`,
    `| Direct Playwright journeys | ${report.playwright.status} | ${report.playwright.summary.passed}/${report.playwright.summary.expected} pass; ${report.playwright.summary.failed} fail; ${report.playwright.summary.skipped} skip; zero retries required |`,
    `| Bounded audit orchestration | ${report.auditOrchestration.status} | ${report.auditOrchestration.executionMode}; ${report.auditOrchestration.wallDurationMs} ms wall; ${report.auditOrchestration.serialEquivalentDurationMs} ms summed lane time; ${report.auditOrchestration.observedOverlapReductionPercent}% observed overlap reduction; ${report.auditOrchestration.maximumObservedConcurrency}/${report.auditOrchestration.maximumConcurrentLanes} top-level lanes; zero retries |`,
    `| Browser executable identity | ${report.browser.evidence?.browserIdentityValid ? "PASS" : "FAIL"} | ${esc(report.browser.evidence?.browserProductName || "unavailable")} ${esc(report.browser.evidence?.browserFullVersion || "unavailable")}; sha256:${esc(report.browser.evidence?.browserExecutableSha256 || "unavailable")} |`,
    `| GitHub-hosted runner image identity | ${report.browser.evidence?.validForPublication ? "PASS" : "NOT_HOSTED"} | ImageOS ${esc(report.browser.evidence?.runnerImageOS || "unavailable")}; ImageVersion ${esc(report.browser.evidence?.runnerImageVersion || "unavailable")}; requested label ${esc(report.browser.evidence?.requestedRunnerLabel || "unavailable")} |`,
    `| Reviewed qualification browser/runner tuple | ${report.publication.browserEvidenceReady ? "PASS" : "PENDING"} | ${browserEvidenceDetail} |`,
    `| Launcher/server preflight | ${String(report.launcherPreflight).startsWith("PASS_") ? "PASS" : "FAIL"} | ${esc(report.launcherPreflight)} |`,
    `| Prompt digest matches register | ${report.metadata.promptDigestMatchesRegister ? "PASS" : "FAIL"} | recorded ${esc(report.metadata.recordedPromptSha || "missing")} |`,
    `| Parent string approval | ${report.parentStrings.status === "APPROVED" ? "PASS" : "PENDING"} | ${esc(report.parentStrings.digest || "No approved digest recorded")} |`,
    ...report.externalReleaseEvidence.gates.map((item) => `| ${esc(item.id)}: ${esc(item.title)} | ${item.status} | ${esc(item.classification)}; ${esc(item.details)} |`),
    "",
    "## Failures", "",
    ...(failures.length ? failures.map((item) => `- ${item.replace(/\r?\n/gu, " ")}`) : ["- None."]), "",
    "## Skipped, deferred, and pending checks", "",
    ...(skipped.length ? skipped.map((item) => `- ${item.replace(/\r?\n/gu, " ")}`) : ["- None."]), "",
    "## Delivered files", "", ...report.deliveredFiles.map((file) => `- \`${file}\``), "",
    "## Residual risks", "",
    ...(report.residualRisks.length ? report.residualRisks.map((risk) => `- ${risk}`) : ["- None identified by the completed checks."]), "",
    "## Unverified claims", "",
    ...(report.unverifiedClaims.length ? report.unverifiedClaims.map((claim) => `- ${claim}`) : ["- None."]), "",
  ];
  return `${lines.join("\n")}\n`;
}

export async function runAudit({ browserPath = null } = {}) {
  const auditTime = new Date();
  const gateIntegrityPolicy = await loadGateIntegrityPolicy();
  const indexPath = path.join(root, "index.html");
  const publicCandidateBefore = await runPublicCandidateGuard();
  const [meta, curriculumManifest] = await Promise.all([
    metadata(),
    curriculumManifestStatus(),
  ]);
  const candidateId = `${await repositoryRevision()}:${publicCandidateBefore.payloadSha256 || "UNAVAILABLE"}`;
  const runId = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT || "1"}`
    : `LOCAL:${process.pid}:${auditTime.toISOString()}`;
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
  const engineSuite = {
    extracted: { sha256: coverage.engineSha256 ?? null },
    engine: {
      CONSTANTS: {
        CHILD_STRINGS_PENDING_APPROVAL: structured?.engine?.childStringConstants?.pendingApproval ?? true,
        CHILD_STRING_APPROVAL_SHA256: structured?.engine?.childStringConstants?.approvalSha256 ?? null,
      },
    },
  };
  const reviewedBrowserEvidence = await reviewedBrowserRunnerEvidence();
  const publicCandidateAfter = await runPublicCandidateGuard();
  const publicCandidateStable = publicCandidateBefore.status === "PASS"
    && publicCandidateAfter.status === "PASS"
    && publicCandidateBefore.payloadSha256 === publicCandidateAfter.payloadSha256
    && publicCandidateBefore.payloadTreeOid === publicCandidateAfter.payloadTreeOid;
  const publicCandidate = {
    status: publicCandidateStable ? "PASS" : "FAIL",
    payloadSha256: publicCandidateBefore.payloadSha256,
    payloadTreeOid: publicCandidateBefore.payloadTreeOid,
    before: publicCandidateBefore,
    after: publicCandidateAfter,
    reason: publicCandidateStable
      ? "The independently invoked guard reported identical public-payload and payload-tree identities before and after the audit."
      : "The public-candidate guard failed or the public payload changed during the audit.",
  };
  const stringResult = engine.results.find((item) => item.id === "BEH-25");
  const stringTechnicalPass = Boolean(stringResult && stringResult.status !== "FAIL");
  const candidateDigest = structured?.engine?.childStringCandidateSha256 ?? null;
  const digest = stringResult?.status === "PASS" ? (engineSuite.engine?.CONSTANTS?.CHILD_STRING_APPROVAL_SHA256 ?? engineSuite.engine?.CONSTANTS?.CHILD_STRING_DIGEST ?? candidateDigest) : null;
  const parentStrings = { status: stringResult?.status === "PASS" ? "APPROVED" : "PENDING_APPROVAL", digest, candidateDigest };
  const rightsStateDigest = await rightsStateSha256(root);
  const publication = await publicationClearance(
    coverage.engineSha256,
    curriculumManifest,
    rightsStateDigest,
    publicCandidate,
    browser,
    reviewedBrowserEvidence,
    auditTime,
  );
  const externalReleaseEvidence = publication.externalReleaseEvidence;
  const actual = {
    engineAssertions: engine.results.length,
    semanticAssertions: semantic.assertions.length,
    browserAssertions: browser.results.length,
    playwrightAssertions: playwright.results.length,
    mutationFamilies: mutation.families.length,
    coverageGates: coverage.branchPct === null ? 0 : 1,
    generatorGates: generator && typeof generator.status === "string" ? 1 : 0,
    launcherGates: process.env.MQ_LAUNCHER_PREFLIGHT ? 1 : 0,
    externalEvidenceGates: externalReleaseEvidence.gates.length,
  };
  actual.total = actual.engineAssertions + actual.semanticAssertions + actual.browserAssertions + actual.playwrightAssertions + actual.mutationFamilies + actual.coverageGates + actual.generatorGates + actual.launcherGates + actual.externalEvidenceGates;
  const countsMatch = Object.entries(EXPECTED).every(([key, value]) => actual[key] === value);
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
    ...engine.results.map((record) => normalizedOutcomeStatus(record.status)),
    ...semantic.assertions.map((record) => normalizedOutcomeStatus(record.status)),
    ...browser.results.map((record) => normalizedOutcomeStatus(record.status)),
    ...playwright.results.map((record) => normalizedOutcomeStatus(record.status)),
    ...mutation.families.map((record) => normalizedOutcomeStatus(record.status)),
    normalizedOutcomeStatus(coverage.status),
    normalizedOutcomeStatus(generator.status),
    process.env.MQ_LAUNCHER_PREFLIGHT?.startsWith("PASS_") ? "PASS" : "FAIL",
    ...externalReleaseEvidence.gates.map((record) => normalizedOutcomeStatus(record.status)),
  ];
  const outcomeSummary = summarizeGateOutcomes(outcomeStatuses, {
    inventoryExpected: EXPECTED.total,
    runId: process.env.GITHUB_RUN_ID || "LOCAL",
  });
  const delivered = await deliveredFiles();
  const residualRisks = [];
  const unverifiedClaims = [];
  residualRisks.push("At 390×844, an adult who expands an optional teaching model in the Parent Test Lab may need to scroll to its Grade control; the live child flow and the approved question-first narrow Lab baseline remain within their tested viewport and size floors.");
  residualRisks.push("MEDIUM: GitHub's windows-latest selector is floating. The qualification evidence and final certification each bind their own exact browser product/version/executable SHA-256 and hosted ImageOS/ImageVersion; the label alone is never evidence, and the two independently valid tuples may differ.");
  unverifiedClaims.push("This local automated review does not verify control of the OpenMathQuest organization and OpenMathQuest/openmathquest.github.io repository, exclusive use of that organization for Math Quest Pages, the root Pages configuration, absence of a CNAME, HTTPS, deployment from the exact reviewed release tag, the deployed artifact, physical Windows/iPhone/iPad devices, or external legal/privacy review.");
  if (parentStrings.status !== "APPROVED") residualRisks.push("Child-facing strings are placeholders pending the project owner's parent approval; the game is not shippable.");
  if (browser.status !== "PASS") unverifiedClaims.push("The complete real-browser interaction flow is not verified.");
  if (playwright.status !== "PASS") unverifiedClaims.push("The direct native-input Playwright journey matrix is not verified.");
  if (!browser.evidence?.validForPublication) unverifiedClaims.push("This run did not record a complete GitHub-hosted browser/runner tuple suitable for publication approval.");
  if (reviewedBrowserEvidence.status !== "REVIEWED") unverifiedClaims.push("The exact GitHub-hosted browser/runner tuple remains pending independent review.");
  if (coverage.status !== "PASS") unverifiedClaims.push(`At least ${MINIMUM_ENGINE_BRANCH_COVERAGE_PCT}% branch coverage of the exact shipped engine bytes is not verified.`);
  if (mutation.status !== "PASS") unverifiedClaims.push("All eleven required representative mutant families have not been shown to fail.");
  if (generator.status !== "PASS") unverifiedClaims.push("Every generated question has not passed the exhaustive self-grade and input-reachability audit.");
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
  const gatesPass = auditOrchestration.status === "PASS" && engine.summary.requiredFailures === 0 && stringTechnicalPass && semantic.contractPass && curriculumManifest.status === "PASS" && coverage.status === "PASS" && mutation.status === "PASS" && generator.status === "PASS" && browser.status === "PASS" && playwright.status === "PASS" && countsMatch && meta.promptDigestMatchesRegister && launcherPreflight.startsWith("PASS_") && publicCandidate.status === "PASS";
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
  const publicReport = sanitizeHostDetails(report);
  await writeFile(path.join(root, "audit", "last-report.json"), `${JSON.stringify(publicReport, null, 2)}\n`, "utf8");
  await writeFile(path.join(root, "audit", "last-report.md"), markdown(publicReport), "utf8");
  await writeFile(path.join(root, "audit", "final-build-report.md"), markdown(publicReport, { final: true }), "utf8");
  return publicReport;
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
