export const DIRECT_EVIDENCE_SUCCESSOR_POLICY = "DIRECT_EVIDENCE_SUCCESSOR_V1";
export const RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_POLICY = "RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_V1";
export const RELEASE_EVIDENCE_SUCCESSOR_POLICY_V2 = "RELEASE_EVIDENCE_SUCCESSOR_V2";
const DIRECT_EVIDENCE_SUCCESSOR_PATHS = Object.freeze([
  "PUBLICATION_CLEARANCE.md",
  "audit/browser-runner-evidence-v1.json",
]);
export const RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_PATHS = DIRECT_EVIDENCE_SUCCESSOR_PATHS;
export const RELEASE_EVIDENCE_SUCCESSOR_PATHS_V2 = Object.freeze([
  "PUBLICATION_CLEARANCE.md",
  "audit/browser-runner-evidence-v1.json",
  "audit/release-evidence-bundle-v1.json",
  "audit/trusted-https-canary-v1.json",
]);

export function betaReleaseOrdinal(releaseTag) {
  const match = /^v\d+\.\d+\.\d+-beta\.(0|[1-9]\d*)$/u.exec(String(releaseTag || ""));
  return match ? Number(match[1]) : null;
}

export function evidenceSuccessorPolicyForOrdinal(ordinal) {
  return ordinal !== null && ordinal >= 8
    ? RELEASE_EVIDENCE_SUCCESSOR_POLICY_V2
    : RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_POLICY;
}

export function evidenceSuccessorPolicyForReleaseTag(releaseTag) {
  return evidenceSuccessorPolicyForOrdinal(betaReleaseOrdinal(releaseTag));
}
