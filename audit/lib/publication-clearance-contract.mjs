import { evidenceSuccessorPolicyForReleaseTag } from "./release-evidence-policy.mjs";
export { evidenceSuccessorPolicyForReleaseTag } from "./release-evidence-policy.mjs";

export const PUBLICATION_CLEARANCE_PATH = "PUBLICATION_CLEARANCE.md";
export const CURRENT_RELEASE_TAG = "v1.0.0-beta.9";
export const BETA4_RELEASE_TAG = "v1.0.0-beta.4";
export const EMERGENCY_BETA3_RELEASE_TAG = "v1.0.0-beta.3";
export const CURRENT_EVIDENCE_SUCCESSOR_POLICY = evidenceSuccessorPolicyForReleaseTag(CURRENT_RELEASE_TAG);
export const EXTERNAL_RELEASE_GATE_IDS = Object.freeze([
  "EXT-HOST",
  "EXT-CANARY",
  "EXT-DEVICE",
  "EXT-REVIEWERS",
  "EXT-ADJUDICATION",
  "EXT-FINDINGS",
  "EXT-HOSTED-WINDOWS",
  "EXT-OWNER",
]);
export const OPTIONAL_EXTERNAL_RELEASE_GATE_IDS = Object.freeze([
  "EXT-DEVICE",
  "EXT-REVIEWERS",
]);
export const PRERELEASE_DEFERRED_EXTERNAL_RELEASE_GATE_IDS = Object.freeze([
  "EXT-HOST",
]);
export const PRERELEASE_HOST_QUALIFICATION_STATE = "DEFERRED_PRERELEASE";
export const BETA4_CANARY_OWNER_SKIP_STATE = "OWNER_SKIPPED_BETA4";
export const BETA4_OWNER_SKIPPED_EXTERNAL_GATE_IDS = Object.freeze(["EXT-CANARY"]);
export const REQUIRED_EXTERNAL_RELEASE_GATE_IDS = Object.freeze(
  EXTERNAL_RELEASE_GATE_IDS.filter((id) => !OPTIONAL_EXTERNAL_RELEASE_GATE_IDS.includes(id)),
);
export const EMERGENCY_BETA3_WAIVED_GATE_IDS = Object.freeze(EXTERNAL_RELEASE_GATE_IDS.slice(0, 6));

export function sha256(value) {
  return /^[a-f0-9]{64}$/u.test(String(value || ""));
}

export function isPrereleaseReleaseTag(value) {
  return /^v\d+\.\d+\.\d+-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*$/u.test(String(value || ""));
}
