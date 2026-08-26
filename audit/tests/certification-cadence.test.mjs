import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  HOSTED_WINDOWS_OBSERVATION_KIND,
  HOSTED_WINDOWS_OBSERVATION_STATUS,
  parseHostedWindowsObservation,
} from "../lib/hosted-windows-observation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

test("certification cadence has a closed machine-readable contract", async () => {
  const policy = JSON.parse(await read("audit/certification-cadence-v1.json"));
  assert.deepEqual(Object.keys(policy), [
    "schemaVersion",
    "policyId",
    "development",
    "earlyFullCertification",
    "release",
    "entryPoints",
  ]);
  assert.equal(policy.schemaVersion, 1);
  assert.equal(policy.policyId, "math-quest-certification-cadence-v1");
  assert.deepEqual(policy.development.ordinaryEvents, [
    "pull_request",
    "push:main",
    "local_change",
  ]);
  assert.equal(policy.development.suite, "FOCUSED_EFFECT_SENSITIVE");
  assert.equal(policy.development.fullCertificationPermitted, false);
  assert.equal(policy.development.formalCompletionPermitted, false);
  assert.deepEqual(policy.earlyFullCertification, {
    ownerApprovalRequired: true,
    diagnosticOnly: true,
  });
  assert.deepEqual(policy.release, {
    explicitPublicationInstructionAuthorizesFinalRun: true,
    freezeRequired: true,
    candidateIdentity: "EXACT_COMMIT_AND_PUBLIC_PAYLOAD",
    scheduledFullRunsPerUnchangedCandidate: 1,
    timing: "AFTER_FREEZE_IMMEDIATELY_BEFORE_PUBLICATION",
    scope: "COMPLETE_CERTIFICATION_SYSTEM",
    qualificationEvidenceSuccessor: {
      policy: "RELEASE_EVIDENCE_SUCCESSOR_V2",
      releaseTag: "v1.0.0-beta.8",
      parentCount: 1,
      parentMustEqualQualificationCommit: true,
      exactChangedPaths: [
        "PUBLICATION_CLEARANCE.md",
        "audit/browser-runner-evidence-v1.json",
        "audit/release-evidence-bundle-v1.json",
        "audit/trusted-https-canary-v1.json",
      ],
      qualificationClearanceStatus: "PENDING",
      qualificationBrowserEvidenceStatus: "PENDING",
      qualificationBundleLifecycleState: "QUALIFICATION_PENDING",
      qualificationCanaryEvidenceStatus: "PENDING",
      requiredQualificationEvidence: [
        "RECONCILED_CANARY",
        "REVIEWED_HOSTED_WINDOWS",
      ],
      finalCertificationTarget: "RELEASE_EVIDENCE_SUCCESSOR_V2",
    },
    deepUxCensus: {
      policy: "ALTERNATING_BETA_V1",
      firstRequiredBetaOrdinal: 4,
      interval: 2,
      requiredVersionExamples: [
        "1.0.0-beta.4",
        "1.0.0-beta.6",
        "1.0.0-beta.8",
      ],
      inventoryQuestions: 72576,
      viewports: 6,
      renderedStates: [
        "INITIAL",
        "PARTIAL_RESPONSE",
        "EXPECTED_REVEALED",
        "TEACHING_MODEL_WHEN_AVAILABLE",
      ],
      localBenchmarkCells: 100,
      routineDevelopmentRunsCompleteCensus: false,
      completeRunEnvironment: "GITHUB_HOSTED_WINDOWS",
      failureEvidence: "ANOMALY_ONLY",
      replacesExistingCertificationOrHumanEvidence: false,
      publicationRequiresPassWhenScheduled: true,
    },
    postCertificationChange: "INVALIDATE_REFREEZE_RERUN_FULL",
    publicationRequiresPass: true,
  });
  assert.deepEqual(policy.entryPoints, {
    development: "audit/run-audit.ps1 -DevelopmentOnly",
    release: "audit.bat",
  });
});

test("cadence policy and regression are registered in every public inventory", async () => {
  const [componentRegisterText, firstPartyText, publicManifestText] = await Promise.all([
    read("licenses/component-register-v1.json"),
    read("licenses/first-party-paths-v1.txt"),
    read("docs/release/public-file-manifest.txt"),
  ]);
  const componentRegister = JSON.parse(componentRegisterText);
  for (const governedPath of [
    "audit/certification-cadence-v1.json",
    "audit/tests/certification-cadence.test.mjs",
    ".github/workflows/hosted-windows-observation.yml",
    "audit/observe-hosted-windows.ps1",
    "audit/lib/hosted-windows-observation.mjs",
    "audit/validate-hosted-windows-observation.mjs",
  ]) {
    assert.equal(componentRegister.firstPartyPaths.includes(governedPath), true, governedPath);
    assert.match(firstPartyText, new RegExp(`^${governedPath.replaceAll("/", "\\/")}$`, "mu"));
    assert.match(publicManifestText, new RegExp(`^${governedPath.replaceAll("/", "\\/")}$`, "mu"));
  }
});

test("ordinary automation cannot invoke complete certification", async () => {
  const [workflow, watcher] = await Promise.all([
    read(".github/workflows/audit.yml"),
    read("audit/on-change-audit.ps1"),
  ]);
  const developmentJob = workflow.split(/^  development-checks:\s*$/mu)[1]?.split(/^  full-audit:\s*$/mu)[0] || "";
  const releaseJob = workflow.split(/^  full-audit:\s*$/mu)[1]?.split(/^  deep-ux-census:\s*$/mu)[0] || "";
  const qualificationJob = workflow.split(/^  audit-execution-qualification:\s*$/mu)[1] || "";
  assert.match(workflow, /^\s{2}pull_request:\s*$/mu);
  assert.match(workflow, /^\s{2}push:\s*[\r\n]+\s{4}branches:\s*[\r\n]+\s{6}- main\s*$/mu);
  assert.match(developmentJob, /if:\s*github\.event_name != 'workflow_dispatch'/u);
  assert.match(developmentJob, /git diff --name-only --diff-filter=ACDMRTUXB/iu);
  assert.match(developmentJob, /run-audit\.ps1 -NodePath \$nodePath -DevelopmentOnly -ChangedPath \$changedPaths/u);
  assert.doesNotMatch(developmentJob, /run-audit\.mjs|run-coverage|mutation-runner|exhaustive-generator|run-browser-smoke/iu);
  assert.match(releaseJob, /if:\s*github\.event_name == 'workflow_dispatch'/u);
  assert.match(releaseJob, /candidate_sha must exactly equal the frozen commit/iu);
  assert.match(releaseJob, /actions\/checkout@[a-f0-9]{40}[\s\S]*fetch-depth:\s*0/iu);
  assert.match(releaseJob, /run-audit\.ps1 -NodePath \$nodePath\s*$/mu);
  assert.doesNotMatch(releaseJob, /run-audit\.ps1[^\r\n]*-TechnicalOnly/iu);
  assert.match(qualificationJob, /if:\s*github\.event_name == 'workflow_dispatch' && inputs\.execution_qualification == true/u);
  assert.match(qualificationJob, /audit-execution-qualification sentinel/iu);
  assert.equal((qualificationJob.match(/run-audit\.ps1[^\r\n]*-TechnicalOnly/giu) || []).length, 2);
  assert.match(watcher, /Invoke-DevelopmentChecks/iu);
  assert.match(watcher, /\$runner[^\r\n]*-DevelopmentOnly/iu);
  assert.doesNotMatch(watcher, /Invoke-FullAudit|-TechnicalOnly/iu);
  assert.match(workflow, /^  deep-ux-census:\s*$/mu);
  assert.match(workflow, /run-playwright-deep-ux-census\.mjs --full/u);
  assert.match(workflow, /MQ_DEEP_UX_CANDIDATE_SHA:\s*\$\{\{ inputs\.candidate_sha \}\}/u);
  assert.match(workflow, /timeout-minutes:\s*120/u);
  assert.match(workflow, /NON_CERTIFYING|alternating-beta|alternating beta/iu);
  assert.doesNotMatch(developmentJob, /run-playwright-deep-ux-census\.mjs/iu);
});

test("deployment requires exact-commit certification and does not repeat the gauntlet", async () => {
  const pages = await read(".github/workflows/pages.yml");
  assert.match(pages, /^\s{6}actions:\s*read\s*$/mu);
  assert.match(pages, /Require successful certification of the exact frozen commit/u);
  assert.match(pages, /actions\/workflows\/audit\.yml\/runs\?head_sha=\$\{RELEASE_COMMIT\}&event=workflow_dispatch/iu);
  assert.match(pages, /select\(\.head_sha == \$sha and \.event == "workflow_dispatch" and \.status == "completed" and \.conclusion == "success"\)/u);
  assert.match(pages, /actions\/runs\/\$\{run_id\}\/jobs\?filter=all/iu);
  assert.match(pages, /select\(\.name == "full-audit" and \.status == "completed" and \.conclusion == "success"\)/u);
  assert.doesNotMatch(pages, /node audit\/run-coverage\.mjs|node audit\/mutation-runner\.mjs|node audit\/exhaustive-generator-audit\.mjs|node --test audit\/tests\/node-engine\.test\.mjs/u);
  assert.ok(
    pages.indexOf("Require successful certification of the exact frozen commit")
      < pages.indexOf("Upload Pages artifact"),
  );
});

test("hosted Windows identity observation is narrow and cannot satisfy certification", async () => {
  const [observationWorkflow, pages, rightsState] = await Promise.all([
    read(".github/workflows/hosted-windows-observation.yml"),
    read(".github/workflows/pages.yml"),
    read("audit/lib/rights-state.mjs"),
  ]);
  assert.match(observationWorkflow, /^name: Observe hosted Windows browser identity$/mu);
  assert.match(observationWorkflow, /^\s{2}workflow_dispatch:\s*$/mu);
  assert.doesNotMatch(observationWorkflow, /^\s{2}(push|pull_request):/mu);
  assert.match(observationWorkflow, /^\s{4}runs-on: windows-latest$/mu);
  assert.match(observationWorkflow, /candidate_sha must exactly equal the protected-main commit/iu);
  assert.match(observationWorkflow, /OBSERVATION_ONLY_NOT_CERTIFICATION/u);
  assert.match(observationWorkflow, /observe-hosted-windows\.ps1/u);
  assert.match(observationWorkflow, /validate-hosted-windows-observation\.mjs/u);
  assert.match(observationWorkflow, /actions\/upload-artifact@[a-f0-9]{40}/u);
  assert.doesNotMatch(observationWorkflow, /run-audit|audit\.bat|run-coverage|mutation-runner|exhaustive-generator|run-browser-smoke/iu);
  assert.match(pages, /actions\/workflows\/audit\.yml\/runs\?head_sha=\$\{RELEASE_COMMIT\}&event=workflow_dispatch/iu);
  assert.doesNotMatch(pages, /hosted-windows-observation\.yml/iu);
  assert.match(rightsState, /"\.github\/workflows\/hosted-windows-observation\.yml"/u);
});

test("hosted Windows observation schema rejects certification ambiguity and tuple drift", () => {
  const candidateSha = "1".repeat(40);
  const baseline = {
    schemaVersion: 1,
    artifactKind: HOSTED_WINDOWS_OBSERVATION_KIND,
    certificationStatus: HOSTED_WINDOWS_OBSERVATION_STATUS,
    repository: "OpenMathQuest/openmathquest.github.io",
    ref: "refs/heads/main",
    candidateSha,
    workflowFile: ".github/workflows/hosted-windows-observation.yml",
    workflowRunId: "123456",
    workflowRunAttempt: "1",
    observedAtUtc: "2026-08-03T12:34:56.789Z",
    browserProductName: "Microsoft Edge",
    browserFullVersion: "140.0.3485.54",
    browserExecutableSha256: "2".repeat(64),
    requestedRunnerLabel: "windows-latest",
    runnerEnvironment: "github-hosted",
    runnerImageOS: "win25",
    runnerImageVersion: "20260801.1.0",
  };
  const canonical = (value) => `${JSON.stringify(value)}\n`;
  assert.equal(parseHostedWindowsObservation(canonical(baseline), {
    candidateSha,
    runnerImageOS: baseline.runnerImageOS,
    runnerImageVersion: baseline.runnerImageVersion,
  }).valid, true);
  for (const [field, badValue, expectedIssue] of [
    ["certificationStatus", "CERTIFIED", /not certification/u],
    ["candidateSha", "3".repeat(40), /requested candidate/u],
    ["browserProductName", "Firefox", /Microsoft Edge or Google Chrome/u],
    ["browserFullVersion", "140.0", /four-part/u],
    ["browserExecutableSha256", "4".repeat(63), /64 lowercase/u],
    ["runnerImageOS", "PENDING", /image identifier/u],
    ["runnerImageVersion", "PENDING", /image version/u],
  ]) {
    const parsed = parseHostedWindowsObservation(canonical({ ...baseline, [field]: badValue }), {
      candidateSha,
      runnerImageOS: baseline.runnerImageOS,
      runnerImageVersion: baseline.runnerImageVersion,
    });
    assert.equal(parsed.valid, false, field);
    assert.match(parsed.issues.join("\n"), expectedIssue, field);
  }
  assert.equal(parseHostedWindowsObservation(canonical({ ...baseline, extra: true })).valid, false);
  assert.equal(parseHostedWindowsObservation(canonical(baseline).replaceAll("\n", "\r\n")).valid, false);
});

test("human-facing policy preserves focused development and formal incompleteness", async () => {
  const [agents, contributing] = await Promise.all([
    read("AGENTS.md"),
    read("CONTRIBUTING.md"),
  ]);
  assert.match(agents, /Do not run the complete certification gauntlet merely[\s\S]*ordinary integration commit/iu);
  assert.match(agents, /clear owner instruction to publish[\s\S]*authorizes this final run/iu);
  assert.match(agents, /exact immutable commit and exact[\s\S]*public payload/iu);
  assert.match(agents, /change after the run invalidates the[\s\S]*rerun the complete gauntlet from the beginning/iu);
  assert.match(agents, /earlier complete run[\s\S]*must obtain[\s\S]*owner's explicit approval/iu);
  assert.match(agents, /OWNER_SKIPPED_BETA4[\s\S]*never `PASS`[\s\S]*expires after Beta 4/iu);
  assert.match(agents, /Beta 6[\s\S]*trusted-[\s\S]*HTTPS canary is mandatory[\s\S]*RECONCILED/iu);
  assert.match(agents, /RELEASE_EVIDENCE_SUCCESSOR_V2/iu);
  assert.match(agents, /Beta 8[\s\S]*OPTIONAL_NOT_RUN[\s\S]*six-reviewer cycle/iu);
  assert.match(agents, /Beta 8 evidence successor[\s\S]*immediate, non-merge, sole child/iu);
  assert.match(agents, /sole parent must be the named qualification commit/iu);
  assert.match(agents, /exact parent-to-child diff changes only these four[\s\S]*audit\/trusted-https-canary-v1\.json/iu);
  assert.match(agents, /every game,[\s\S]*runtime byte remains[\s\S]*byte-identical/iu);
  assert.match(agents, /public-payload digest is expected to[\s\S]*change/iu);
  assert.match(agents, /no feature, refactor, optimization, content update, or release[\s\S]*formally complete until/iu);
  assert.match(contributing, /run-audit\.ps1 -DevelopmentOnly/iu);
  assert.match(contributing, /audit\.bat` is reserved for the frozen release candidate/iu);
});
