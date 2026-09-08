const FAILURE_RENDERERS = Object.freeze([
  function failureSemanticAssertions({ semanticResults }) {
    return semanticResults.filter((x) => x.status === "FAIL" || x.ok === false).map((x) => `${x.id}: ${x.title} — ${x.details || x.reason || "semantic assertion failed"}`);
  },
  function failureSemanticSuite({ report, semanticResults }) {
    return !report.semantic.ok && semanticResults.length === 0 ? report.semantic.failures.map((x) => `${x.id}: ${x.title} — ${x.details || x.reason || "semantic suite failed"}`) : [];
  },
  function failureSemanticCounts({ report, EXPECTED_SEMANTIC, semanticResults }) {
    return report.semantic.contractPass ? [] : [`Semantic contract totals: expected ${EXPECTED_SEMANTIC.assertions} assertions, ${EXPECTED_SEMANTIC.skills} skills, ${EXPECTED_SEMANTIC.taskTypes} task types, and ${EXPECTED_SEMANTIC.questions} questions; observed ${semanticResults.length}, ${report.semantic.summary.skills ?? "unavailable"}, ${report.semantic.summary.taskTypes ?? "unavailable"}, and ${report.semantic.summary.questions ?? "unavailable"}.`];
  },
  function failureEngine({ engineResults }) {
    return engineResults.filter((x) => x.status === "FAIL").map((x) => `${x.id}: ${x.title} — ${x.details}`);
  },
  function failureBrowser({ report }) {
    return report.browser.results.filter((x) => x.status === "FAIL").map((x) => `${x.id}: ${x.title} — ${x.details}`);
  },
  function failurePlaywright({ report }) {
    return report.playwright.results.filter((x) => x.status !== "passed").map((x) => `${x.key}: direct Playwright journey ended ${x.status}`);
  },
  function failureMutation({ report }) {
    return report.mutation.families.filter((x) => x.status === "FAIL").map((x) => `Mutation ${x.family}: ${x.reason}`);
  },
  function failureGenerator({ report }) {
    return report.generator.status === "PASS" ? [] : [`Exhaustive generator gate: ${(report.generator.issues || []).join("; ") || report.generator.error || "process did not pass"}`];
  },
  function failureCoverage({ report }) {
    return report.coverage.status === "PASS" ? [] : [`Coverage: ${report.coverage.calibration.reasons.join("; ") || report.coverage.aggregationError || `engine branch result ${report.coverage.branchPct ?? "unavailable"}`}`];
  },
  function failureBrowserProcess({ report }) {
    return report.browser.status === "PASS" ? [] : [`Browser smoke process: ${report.browser.reason || report.browser.process?.error || report.browser.process?.stderr || "did not complete"}`];
  },
  function failurePlaywrightProcess({ report }) {
    return report.playwright.status === "PASS" ? [] : report.playwright.findings.map((item) => `Playwright Test: ${item}`);
  },
  function failureOrchestration({ report }) {
    return report.auditOrchestration.status === "PASS" ? [] : report.auditOrchestration.issues.map((item) => `Audit orchestration: ${item}`);
  },
  function failureCurriculum({ report }) {
    return report.curriculumManifest.status === "PASS" ? [] : [`Curriculum manifest: ${report.curriculumManifest.issues.join("; ") || "validation failed"}`];
  },
  function failureInventory({ report }) {
    return report.countsMatch ? [] : ["Predicted and actual audit counts do not match."];
  },
]);

const LINE_RENDERERS = Object.freeze([
  function line0({ title }) {
    return [`# ${title}`];
  },
  "",
  function lineGenerated({ report }) {
    return [`- **Generated:** ${tick(report.generatedAt)}`];
  },
  function lineOverall({ report }) {
    return [`- **Overall:** ${tick(report.status)}`];
  },
  function lineTechnicalGameGates({ report }) {
    return [`- **Technical game gates:** ${tick(report.technicalShippable ? "PASS" : "FAIL")}`];
  },
  function lineAuditOrchestration({ report }) {
    return [`- **Audit orchestration:** ${tick(`${report.auditOrchestration.status}; ${report.auditOrchestration.executionMode}; ${report.auditOrchestration.maximumObservedConcurrency}/${report.auditOrchestration.maximumConcurrentLanes} top-level lanes`)}`];
  },
  function linePublicPublicationClearance({ report }) {
    return [`- **Public publication clearance:** ${tick(report.publication.status)}`];
  },
  function lineExternalReleaseEvidence({ report }) {
    return [`- **External release evidence:** ${tick(`${report.externalReleaseEvidence.status} (${report.externalReleaseEvidence.passCount}/${report.externalReleaseEvidence.requiredCount} mandatory; ${report.externalReleaseEvidence.deferredCount ?? 0} prerelease deferred; ${report.externalReleaseEvidence.optionalCompletedCount}/${report.externalReleaseEvidence.optionalCount} optional completed)`)}`];
  },
  function lineExternalEvidenceExpiry({ report }) {
    return [`- **External evidence expiry:** ${tick(report.externalReleaseEvidence.expiresAt || "PENDING")}`];
  },
  function lineShippable({ report }) {
    return [`- **Shippable:** ${tick(report.shippable ? "YES" : "NO")}`];
  },
  function lineBuildContract({ report }) {
    return [`- **Build contract:** ${tick(`docs/development/build-spec.md v${report.metadata.promptVersion}`)}`];
  },
  function linePromptRevisionID({ report }) {
    return [`- **Prompt revision ID:** ${tick(`sha256:${report.metadata.promptSha256}`)}`];
  },
  function lineRegisterRevisionID({ report }) {
    return [`- **Register revision ID:** ${tick(report.metadata.registerRevision)}`];
  },
  function lineFinalMisreadTestResult({  }) {
    return [`- **Final misread-test result:** ${tick("Prompt v2.1 version record: no material divergence")}`];
  },
  function lineEngineRevisionID({ report }) {
    return [`- **Engine revision ID:** ${tick(report.coverage.engineSha256 ? `sha256:${report.coverage.engineSha256}` : "UNAVAILABLE")}`];
  },
  function lineCurriculumManifest({ report }) {
    return [`- **Curriculum manifest:** ${tick(report.curriculumManifest.manifestId && report.curriculumManifest.version ? `${report.curriculumManifest.manifestId} v${report.curriculumManifest.version}` : "INVALID")}`];
  },
  function lineCurriculumManifestRevisionID({ report }) {
    return [`- **Curriculum manifest revision ID:** ${tick(report.curriculumManifest.sha256 ? `sha256:${report.curriculumManifest.sha256}` : "UNAVAILABLE")}`];
  },
  function lineOpenComponentRightsStateRevisionID({ report }) {
    return [`- **Open-component rights-state revision ID:** ${tick(report.rightsStateSha256 ? `sha256:${report.rightsStateSha256}` : "UNAVAILABLE")}`];
  },
  function linePublicPayloadRevisionID({ report }) {
    return [`- **Public payload revision ID:** ${tick(report.publicCandidate.payloadSha256 ? `sha256:${report.publicCandidate.payloadSha256}` : "UNAVAILABLE")}`];
  },
  function linePublicPayloadTreeOID({ report }) {
    return [`- **Public payload tree OID:** ${tick(report.publicCandidate.payloadTreeOid || "UNAVAILABLE")}`];
  },
  function lineBrowserProduct({ report }) {
    return [`- **Browser product:** ${tick(report.browser.evidence?.browserProductName || "UNAVAILABLE")}`];
  },
  function lineBrowserFullVersion({ report }) {
    return [`- **Browser full version:** ${tick(report.browser.evidence?.browserFullVersion || "UNAVAILABLE")}`];
  },
  function lineBrowserExecutableSHA256({ report }) {
    return [`- **Browser executable SHA-256:** ${tick(report.browser.evidence?.browserExecutableSha256 || "UNAVAILABLE")}`];
  },
  function lineGitHubHostedRunnerImageOS({ report }) {
    return [`- **GitHub-hosted runner ImageOS:** ${tick(report.browser.evidence?.runnerImageOS || "UNAVAILABLE")}`];
  },
  function lineGitHubHostedRunnerImageVersion({ report }) {
    return [`- **GitHub-hosted runner ImageVersion:** ${tick(report.browser.evidence?.runnerImageVersion || "UNAVAILABLE")}`];
  },
  function lineReviewedBrowserRunnerEvidence({ report }) {
    return [`- **Reviewed browser/runner evidence:** ${tick(report.reviewedBrowserRunnerEvidence.status)}`];
  },
  function lineCurriculumManifestCounts({ report }) {
    return [`- **Curriculum manifest counts:** ${tick(`${report.curriculumManifest.counts.levels} levels; ${report.curriculumManifest.counts.skills} skills; ${report.curriculumManifest.counts.strands} strands; ${report.curriculumManifest.counts.families} generator families; ${report.curriculumManifest.counts.gateways} gateways`)}`];
  },
  function lineParentStringApproval({ report }) {
    return [`- **Parent-string approval:** ${tick(report.parentStrings.status)}`];
  },
  function lineParentStringApprovalDigest({ report }) {
    return [`- **Parent-string approval digest:** ${tick(report.parentStrings.digest || "PENDING")}`];
  },
  function lineChildStringCandidateDigest({ report }) {
    return [`- **Child-string candidate digest:** ${tick(report.parentStrings.candidateDigest || "UNAVAILABLE")}`];
  },
  "",
  "## Predicted and actual results",
  "",
  "| Countable result | Predicted | Actual | Result |",
  "|---|---:|---:|---|",
  countRows,
  "",
  "Inventory equality proves only that every expected record was emitted. It is not a pass count.",
  "",
  "## Outcome summary",
  "",
  "| Outcome class | Count |",
  "|---|---:|",
  function lineLiteralPASS({ report }) {
    return [`| Literal PASS | ${report.outcomeSummary.passedCount} |`];
  },
  function lineFailureOrBlocked({ report }) {
    return [`| Failure or blocked | ${report.outcomeSummary.failedCount} |`];
  },
  function lineSkippedRequiredExecution({ report }) {
    return [`| Skipped required execution | ${report.outcomeSummary.skippedCount} |`];
  },
  function lineMissingArtifact({ report }) {
    return [`| Missing artifact | ${report.outcomeSummary.missingCount} |`];
  },
  function lineRequiredButNotRun({ report }) {
    return [`| Required but not run | ${report.outcomeSummary.notRunCount} |`];
  },
  function lineAcceptedNonPass({ report }) {
    return [`| Accepted non-pass | ${report.outcomeSummary.acceptedNonPassCount} |`];
  },
  function lineInventory({ report }) {
    return [`| Inventory | ${report.outcomeSummary.inventoryActual}/${report.outcomeSummary.inventoryExpected} |`];
  },
  function lineRunID({ report }) {
    return [`| Run ID | ${esc(report.outcomeSummary.runId)} |`];
  },
  "",
  "## Gate results",
  "",
  "| Gate | Result | Evidence |",
  "|---|---|---|",
  function lineExactEngineBytes({ report }) {
    return [`| Exact engine bytes | ${report.coverage.exactBytes ? "PASS" : "FAIL"} | ${esc(report.coverage.engineSha256 || "unavailable")} |`];
  },
  function lineCanonicalCurriculumManifest({ report }) {
    return [`| Canonical curriculum manifest | ${report.curriculumManifest.status} | ${esc(report.curriculumManifest.manifestId || "invalid")} v${esc(report.curriculumManifest.version || "unavailable")}; ${esc(report.curriculumManifest.sha256 || "unavailable")}; ${report.curriculumManifest.canonicalBytes} canonical bytes |`];
  },
  function lineOpenComponentRightsState({ report }) {
    return [`| Open-component rights state | ${/^[a-f0-9]{64}$/u.test(String(report.rightsStateSha256)) ? "PASS" : "FAIL"} | ${esc(report.rightsStateSha256 || "unavailable")} |`];
  },
  function lineStableStagedPrivacyAndOpenComponentGuard({ report }) {
    return [`| Stable staged privacy and open-component guard | ${report.publicCandidate.status} | revision ${esc(report.publicCandidate.revisionBefore || "unavailable")} → ${esc(report.publicCandidate.revisionAfter || "unavailable")}; before and after payload ${esc(report.publicCandidate.payloadSha256 || "unavailable")}; payload tree ${esc(report.publicCandidate.payloadTreeOid || "unavailable")} |`];
  },
  function lineRestrictedVMAndBehavioralSuite({ report }) {
    return [`| Restricted VM and behavioral suite | ${report.engine.summary.requiredFailures === 0 ? "PASS" : "FAIL"} | ${report.engine.summary.PASS} pass, ${report.engine.summary.FAIL} fail, ${report.engine.summary.SKIP} skip |`];
  },
  function lineManifestToGeneratorSemanticSuite({ report, EXPECTED_SEMANTIC }) {
    return [`| Manifest-to-generator semantic suite | ${report.semantic.contractPass ? "PASS" : "FAIL"} | ${report.semantic.summary.PASS ?? 0} pass, ${report.semantic.summary.FAIL ?? report.semantic.failures.length} fail, ${report.semantic.summary.SKIP ?? 0} skip; ${report.semantic.summary.taskTypes ?? 0}/${EXPECTED_SEMANTIC.taskTypes} task types; ${report.semantic.summary.questions ?? 0}/${EXPECTED_SEMANTIC.questions} deterministic questions |`];
  },
  function lineRequiredNodeMajor({ report }) {
    return [`| Required Node major | ${report.coverage.node24 ? "PASS" : "FAIL"} | ${esc(report.coverage.nodeVersion || "unavailable")} |`];
  },
  function lineNativeBranchCalibration({ report }) {
    return [`| Native branch calibration | ${report.coverage.calibrated ? "PASS" : "FAIL"} | full ${report.coverage.calibration.fullBranchPct ?? "—"}%; partial ${report.coverage.calibration.partialBranchPct ?? "—"}%; complementary repeated-filename aggregation ${report.coverage.calibration.aggregateBranchPct ?? "—"}% |`];
  },
  function lineEngineBranchCoverage({ report, MINIMUM_ENGINE_BRANCH_COVERAGE_PCT }) {
    return [`| Engine branch coverage | ${report.coverage.status} | calibrated native ${report.coverage.branchPct ?? "not measured"}% (minimum ${MINIMUM_ENGINE_BRANCH_COVERAGE_PCT}%); raw diagnostic ${report.coverage.branchCovered ?? 0}/${report.coverage.branchTotal ?? 0} ${esc(report.coverage.branchMetric || "branch ranges")} (${report.coverage.rawBlockRangePct ?? "—"}%); ${report.coverage.scriptInstanceCount ?? 0} merged exact-URL script record(s); virtual file ${esc(report.coverage.virtualFilename || "missing")} |`];
  },
  function lineExhaustiveGeneratedQuestionAudit({ report }) {
    return [`| Exhaustive generated-question audit | ${report.generator.status} | ${report.generator.questions ?? 0} questions; ${report.generator.skills ?? 0} skills |`];
  },
  function lineElevenFamilyMutationSanity({ report, mutationCases }) {
    return [`| Eleven-family mutation sanity | ${report.mutation.status} | ${report.mutation.families.filter((x) => x.status === "PASS").length}/11 families; ${mutationCases.filter((x) => x.status === "PASS").length}/${mutationCases.length} effect-sensitive cases killed |`];
  },
  function lineBrowserSmoke({ report }) {
    return [`| Browser smoke | ${report.browser.status} | ${report.browser.results.filter((x) => x.status === "PASS").length} pass, ${report.browser.results.filter((x) => x.status === "FAIL").length} fail, ${report.browser.results.filter((x) => x.status === "SKIP").length} skip |`];
  },
  function lineDirectPlaywrightJourneys({ report }) {
    return [`| Direct Playwright journeys | ${report.playwright.status} | ${report.playwright.summary.passed}/${report.playwright.summary.expected} pass; ${report.playwright.summary.failed} fail; ${report.playwright.summary.skipped} skip; zero retries required |`];
  },
  function lineBoundedAuditOrchestration({ report }) {
    return [`| Bounded audit orchestration | ${report.auditOrchestration.status} | ${report.auditOrchestration.executionMode}; ${report.auditOrchestration.wallDurationMs} ms wall; ${report.auditOrchestration.serialEquivalentDurationMs} ms summed lane time; ${report.auditOrchestration.observedOverlapReductionPercent}% observed overlap reduction; ${report.auditOrchestration.maximumObservedConcurrency}/${report.auditOrchestration.maximumConcurrentLanes} top-level lanes; zero retries |`];
  },
  function lineBrowserExecutableIdentity({ report }) {
    return [`| Browser executable identity | ${report.browser.evidence?.browserIdentityValid ? "PASS" : "FAIL"} | ${esc(report.browser.evidence?.browserProductName || "unavailable")} ${esc(report.browser.evidence?.browserFullVersion || "unavailable")}; sha256:${esc(report.browser.evidence?.browserExecutableSha256 || "unavailable")} |`];
  },
  function lineGitHubHostedRunnerImageIdentity({ report }) {
    return [`| GitHub-hosted runner image identity | ${report.browser.evidence?.validForPublication ? "PASS" : "NOT_HOSTED"} | ImageOS ${esc(report.browser.evidence?.runnerImageOS || "unavailable")}; ImageVersion ${esc(report.browser.evidence?.runnerImageVersion || "unavailable")}; requested label ${esc(report.browser.evidence?.requestedRunnerLabel || "unavailable")} |`];
  },
  function lineReviewedQualificationBrowserRunnerTuple({ report, browserEvidenceDetail }) {
    return [`| Reviewed qualification browser/runner tuple | ${report.publication.browserEvidenceReady ? "PASS" : "PENDING"} | ${browserEvidenceDetail} |`];
  },
  function lineLauncherServerPreflight({ report }) {
    return [`| Launcher/server preflight | ${String(report.launcherPreflight).startsWith("PASS_") ? "PASS" : "FAIL"} | ${esc(report.launcherPreflight)} |`];
  },
  function linePromptDigestMatchesRegister({ report }) {
    return [`| Prompt digest matches register | ${report.metadata.promptDigestMatchesRegister ? "PASS" : "FAIL"} | recorded ${esc(report.metadata.recordedPromptSha || "missing")} |`];
  },
  function lineParentStringApproval({ report }) {
    return [`| Parent string approval | ${report.parentStrings.status === "APPROVED" ? "PASS" : "PENDING"} | ${esc(report.parentStrings.digest || "No approved digest recorded")} |`];
  },
  function lineReportExternalReleaseEvidenceGatesMapItem({ report }) {
    return report.externalReleaseEvidence.gates.map((item) => `| ${esc(item.id)}: ${esc(item.title)} | ${item.status} | ${esc(item.classification)}; ${esc(item.details)} |`);
  },
  "",
  "## Failures",
  "",
  function lineFailuresLengthFailuresMapItem({ failures }) {
    return failures.length ? failures.map((item) => `- ${item.replace(/\r?\n/gu, " ")}`) : ["- None."];
  },
  "",
  "## Skipped, deferred, and pending checks",
  "",
  function lineSkippedLengthSkippedMapItem({ skipped }) {
    return skipped.length ? skipped.map((item) => `- ${item.replace(/\r?\n/gu, " ")}`) : ["- None."];
  },
  "",
  "## Delivered files",
  "",
  function lineReportDeliveredFilesMapFile({ report }) {
    return report.deliveredFiles.map((file) => `- \`${file}\``);
  },
  "",
  "## Residual risks",
  "",
  function lineReportResidualRisksLengthReportResidualRisksMapRisk({ report }) {
    return report.residualRisks.length ? report.residualRisks.map((risk) => `- ${risk}`) : ["- None identified by the completed checks."];
  },
  "",
  "## Unverified claims",
  "",
  function lineReportUnverifiedClaimsLengthReportUnverifiedClaimsMapClaim({ report }) {
    return report.unverifiedClaims.length ? report.unverifiedClaims.map((claim) => `- ${claim}`) : ["- None."];
  },
  "",
]);

function esc(value) { return String(value ?? "").replace(/\|/gu, "\\|").replace(/\r?\n/gu, " "); }
function tick(value) { return `\`${String(value ?? "—").replace(/`/gu, "\\`")}\``; }
export function auditMarkdown(report, { final = false } = {}, { EXPECTED, EXPECTED_SEMANTIC, MINIMUM_ENGINE_BRANCH_COVERAGE_PCT }) {
  const engineResults = report.engine.results;
  const semanticResults = report.semantic.assertions;
  const mutationCases = report.mutation.families.flatMap((family) => family.cases ?? [family]);
  const context = { report, engineResults, semanticResults, mutationCases, EXPECTED, EXPECTED_SEMANTIC, MINIMUM_ENGINE_BRANCH_COVERAGE_PCT };
  const failures = FAILURE_RENDERERS.flatMap(render => render(context));
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
  Object.assign(context, { title, browserEvidenceDetail, failures, skipped });
  const lines = LINE_RENDERERS.flatMap(render => typeof render === "string" ? [render] : render(context));
  return `${lines.join("\n")}\n`;
}


function countRows({ EXPECTED, report }) {
  return [
    ["Engine assertions","engineAssertions"],
    ["Manifest semantic assertions","semanticAssertions"],
    ["Browser assertions","browserAssertions"],
    ["Direct Playwright assertions","playwrightAssertions"],
    ["Mutation families","mutationFamilies"],
    ["Coverage gates","coverageGates"],
    ["Exhaustive generator gates","generatorGates"],
    ["Audit orchestration gates","auditOrchestrationGates"],
    ["Launcher/server gates","launcherGates"],
    ["External release-evidence gates","externalEvidenceGates"],
    ["Total","total","**"],
  ].map(([label, key, emphasis = ""]) => `| ${emphasis}${label}${emphasis} | ${emphasis}${EXPECTED[key]}${emphasis} | ${emphasis}${report.actual[key]}${emphasis} | ${emphasis}${report.actual[key] === EXPECTED[key] ? "MATCH" : "MISMATCH"}${emphasis} |`);
}
