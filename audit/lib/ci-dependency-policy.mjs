import { createHash } from "node:crypto";

const MANIFEST_SCRIPTS = Object.freeze({
  "ai:check": "node audit/run-ai-change-loop.mjs",
  "lint:css": "stylelint \"assets/**/*.css\"",
  "lint:dead-code": "knip",
  "lint:js": "eslint .",
  "lint:markdown": "markdownlint-cli2",
  quality: "node audit/run-quality-gates.mjs",
  "size:bundlewatch": "node audit/run-bundlewatch-budgets.mjs",
});

function exactKeys(value, expected) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === expected.length
    && Object.keys(value).every((key, index) => key === expected[index]),
  );
}

function parseJson(text, label, findings) {
  try {
    return JSON.parse(String(text));
  } catch {
    findings.push(`${label}: invalid JSON`);
    return null;
  }
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function all(checks) {
  return checks.every(Boolean);
}

function objectMatches(value, expected) {
  return Object.entries(expected).every(([key, expectedValue]) => sameJson(value?.[key], expectedValue));
}

function sortedUnique(values) {
  return Array.isArray(values)
    && new Set(values).size === values.length
    && values.every((value, index) => index === 0 || values[index - 1] < value);
}

function validatePolicyIdentity(policy, findings) {
  const identity = {
    policyId: "math-quest-refactor-quality-gates",
    version: "1.3.0",
    schemaVersion: 1,
    status: "ACTIVE",
    authority: "docs/development/post-beta-backlog.md#agent-refactor-code-tests-and-quality-gates",
    baselineCommit: "2078625b407d5189f579e94e716c86dce86ae90f",
  };
  const keys = ["policyId", "version", "schemaVersion", "status", "authority", "baselineCommit", "approvedTutorialMetadataTransition", "runtime", "sliceLifecycle", "candidateBinding", "aiChangeLoop", "qualityToolComponents", "supplyChain", "analysisRatchets", "sourceBudgets", "performanceBudgets", "performanceEvidence", "finishLine"];
  if (!exactKeys(policy, keys)) findings.push("audit/quality-gate-policy-v1.json: policy must use the exact closed schema");
  if (!objectMatches(policy, identity)) findings.push("audit/quality-gate-policy-v1.json: policy identity and authority must remain exact");
}

function validatePolicyRuntime(runtime, findings) {
  const expected = {
    nodeVersion: "24.14.0",
    installCommand: "npm.cmd ci --ignore-scripts --omit=optional --no-audit --no-fund",
  };
  if (!all([exactKeys(runtime, Object.keys(expected)), objectMatches(runtime, expected)])) {
    findings.push("audit/quality-gate-policy-v1.json: runtime and hardened install command must remain exact");
  }
}

function validSupplyChainCollections(supplyChain) {
  return all([
    sortedUnique(supplyChain?.allowedClosureLicences),
    Array.isArray(supplyChain?.licenceMetadataExceptions),
    Array.isArray(supplyChain?.lifecycleScriptExceptions),
    Array.isArray(supplyChain?.dependencyOverrides),
    supplyChain?.dependencyOverrides?.length === 1,
    Array.isArray(supplyChain?.directDependencies),
    supplyChain?.directDependencies?.length > 0,
  ]);
}

function validSupplyChainShape(supplyChain) {
  const supplyChainKeys = [
    "packageLockSha256",
    "packageCountIncludingRoot",
    "allowedClosureLicences",
    "licenceMetadataExceptions",
    "lifecycleScriptExceptions",
    "dependencyOverrides",
    "directDependencies",
  ];
  return all([
    exactKeys(supplyChain, supplyChainKeys),
    /^[a-f0-9]{64}$/u.test(String(supplyChain?.packageLockSha256)),
    Number.isSafeInteger(supplyChain?.packageCountIncludingRoot),
    supplyChain?.packageCountIncludingRoot > 0,
    validSupplyChainCollections(supplyChain),
  ]);
}

function validDirectDependency(dependency, allowedLicences) {
  return all([
    exactKeys(dependency, ["name", "version", "licence", "resolved", "integrity"]),
    typeof dependency?.name === "string",
    typeof dependency?.version === "string",
    allowedLicences.includes(dependency?.licence),
    String(dependency?.resolved).startsWith("https://registry.npmjs.org/"),
    String(dependency?.integrity).startsWith("sha512-"),
  ]);
}

function validateDirectDependencies(supplyChain, findings) {
  const directNames = supplyChain.directDependencies.map((dependency) => dependency?.name);
  if (!sortedUnique(directNames)) findings.push("audit/quality-gate-policy-v1.json: direct dependencies must be unique and lexicographically ordered");
  for (const dependency of supplyChain.directDependencies) {
    if (!validDirectDependency(dependency, supplyChain.allowedClosureLicences)) {
      findings.push(`audit/quality-gate-policy-v1.json: invalid direct dependency record: ${dependency?.name || "unknown"}`);
    }
  }
}

function validatePolicyExceptions(supplyChain, findings) {
  const expectedMetadata = [
    { path: "node_modules/jsonpack", version: "1.1.5", licence: "MIT" },
    { path: "node_modules/svg-tags", version: "1.0.0", licence: "MIT" },
  ];
  const metadataValid = supplyChain.licenceMetadataExceptions.length === expectedMetadata.length
    && supplyChain.licenceMetadataExceptions.every((exception, index) => all([
      exactKeys(exception, ["path", "version", "licence", "reason"]),
      objectMatches(exception, expectedMetadata[index]),
      String(exception?.reason).length >= 80,
    ]));
  if (!metadataValid) {
    findings.push("audit/quality-gate-policy-v1.json: licence metadata exceptions must remain the reviewed jsonpack and svg-tags MIT records");
  }
  const scriptException = supplyChain.lifecycleScriptExceptions[0];
  const scriptValid = all([
    supplyChain.lifecycleScriptExceptions.length === 1,
    exactKeys(scriptException, ["path", "version", "optional", "os", "reason"]),
    objectMatches(scriptException, { path: "node_modules/fsevents", version: "2.3.2", optional: true, os: ["darwin"] }),
    String(scriptException?.reason).length >= 80,
  ]);
  if (!scriptValid) {
    findings.push("audit/quality-gate-policy-v1.json: the sole lifecycle-script exception must remain optional macOS fsevents");
  }
}

function validatePolicyOverride(supplyChain, findings) {
  const override = supplyChain.dependencyOverrides[0];
  const expected = {
    requester: "bundlewatch",
    dependency: "axios",
    declaredRange: "^0.31.1",
    version: "1.20.0",
    licence: "MIT",
    resolved: "https://registry.npmjs.org/axios/-/axios-1.20.0.tgz",
    integrity: "sha512-r8aOh8j9cGKpgQAqpzrUHnSIc6a59Y3Xf/cv8sy1DrHCkZHzQGEuoq1tARk6qSyDdtQGSDgpb9kFlruzPvrgwg==",
  };
  const valid = all([
    exactKeys(override, [...Object.keys(expected), "reason"]),
    objectMatches(override, expected),
    String(override?.reason).length >= 120,
  ]);
  if (!valid) findings.push("audit/quality-gate-policy-v1.json: the BundleWatch Axios security override must remain exact and explained");
}

function validatePolicy(policy, findings) {
  if (!policy) return;
  validatePolicyIdentity(policy, findings);
  validatePolicyRuntime(policy.runtime, findings);
  const supplyChain = policy.supplyChain;
  if (!validSupplyChainShape(supplyChain)) {
    findings.push("audit/quality-gate-policy-v1.json: supply-chain policy must be closed, ordered, and complete");
    return;
  }
  validateDirectDependencies(supplyChain, findings);
  validatePolicyExceptions(supplyChain, findings);
  validatePolicyOverride(supplyChain, findings);
}

function validateManifest(manifest, policy, findings) {
  if (!manifest || !policy?.supplyChain) return;
  if (!exactKeys(manifest, ["name", "version", "private", "license", "engines", "scripts", "devDependencies", "overrides"])) {
    findings.push("package.json: CI dependency manifest must use the exact closed schema");
  }
  const identity = {
    name: "open-math-quest-ci-tools",
    version: "0.0.0",
    private: true,
    license: "MIT",
    engines: { node: policy.runtime?.nodeVersion },
    scripts: MANIFEST_SCRIPTS,
    overrides: { bundlewatch: { axios: policy.supplyChain.dependencyOverrides[0]?.version } },
  };
  if (!objectMatches(manifest, identity)) {
    findings.push("package.json: CI manifest identity, scripts, and Node pin must remain exact");
  }
  const expected = Object.fromEntries(policy.supplyChain.directDependencies.map(({ name, version }) => [name, version]));
  if (!sameJson(manifest.devDependencies, expected)) {
    findings.push("package.json: direct dev dependencies must exactly match the reviewed quality-gate policy");
  }
}

function validLockIdentity(lock, manifest) {
  const identity = {
    name: manifest?.name,
    version: manifest?.version,
    lockfileVersion: 3,
    requires: true,
  };
  return all([
    exactKeys(lock, ["name", "version", "lockfileVersion", "requires", "packages"]),
    objectMatches(lock, identity),
    lock?.packages,
    typeof lock?.packages === "object",
    !Array.isArray(lock?.packages),
  ]);
}

function validLockRoot(root, manifest) {
  const expected = {
    name: manifest?.name,
    version: manifest?.version,
    license: manifest?.license,
    devDependencies: manifest?.devDependencies,
    engines: manifest?.engines,
  };
  return all([
    exactKeys(root, ["name", "version", "license", "devDependencies", "engines"]),
    objectMatches(root, expected),
  ]);
}

function validPackageRecordCore(packageRecord) {
  return all([
    typeof packageRecord.version === "string",
    String(packageRecord.resolved).startsWith("https://registry.npmjs.org/"),
    String(packageRecord.integrity).startsWith("sha512-"),
    packageRecord.dev === true,
  ]);
}

function licenceFinding(packagePath, packageRecord, supplyChain, metadataExceptions) {
  const label = `package-lock.json: ${packagePath}`;
  const exception = metadataExceptions.get(packagePath);
  if (packageRecord.license == null && !objectMatches(exception, { version: packageRecord.version })) {
    return `${label} is missing reviewed licence metadata`;
  }
  if (packageRecord.license != null && !supplyChain.allowedClosureLicences.includes(packageRecord.license)) {
    return `${label} uses an unapproved dependency licence: ${packageRecord.license}`;
  }
  if (packageRecord.license != null && exception) {
    return `${label} no longer matches its narrowly reviewed missing-metadata exception`;
  }
  return null;
}

function lifecycleFinding(packagePath, packageRecord, scriptExceptions) {
  const label = `package-lock.json: ${packagePath}`;
  const exception = scriptExceptions.get(packagePath);
  const expected = { version: packageRecord.version, optional: packageRecord.optional, os: packageRecord.os };
  if (packageRecord.hasInstallScript === true && !objectMatches(exception, expected)) {
    return `${label} has an unapproved lifecycle script`;
  }
  if (packageRecord.hasInstallScript !== true && exception) {
    return `${label} no longer matches its narrowly reviewed lifecycle-script exception`;
  }
  return null;
}

function validatePackageEntries(entries, supplyChain, findings) {
  const metadataExceptions = new Map(supplyChain.licenceMetadataExceptions.map((exception) => [exception.path, exception]));
  const scriptExceptions = new Map(supplyChain.lifecycleScriptExceptions.map((exception) => [exception.path, exception]));
  for (const [packagePath, packageRecord] of entries.slice(1)) {
    const label = `package-lock.json: ${packagePath}`;
    if (!validPackageRecordCore(packageRecord)) {
      findings.push(`${label} must retain an exact version, npm registry artifact, SHA-512 integrity, and dev-only marker`);
    }
    const exceptionFindings = [
      licenceFinding(packagePath, packageRecord, supplyChain, metadataExceptions),
      lifecycleFinding(packagePath, packageRecord, scriptExceptions),
    ].filter(Boolean);
    findings.push(...exceptionFindings);
  }
}

function validDirectLockRecord(dependency, packageRecord) {
  const expected = {
    version: dependency.version,
    license: dependency.licence,
    resolved: dependency.resolved,
    integrity: dependency.integrity,
    dev: true,
  };
  return Boolean(packageRecord) && objectMatches(packageRecord, expected);
}

function validateDirectLockRecords(packages, directDependencies, findings) {
  for (const dependency of directDependencies) {
    const packageRecord = packages[`node_modules/${dependency.name}`];
    if (!validDirectLockRecord(dependency, packageRecord)) {
      findings.push(`package-lock.json: ${dependency.name} artifact, version, licence, integrity, and dev-only metadata must remain exact`);
    }
  }
}

function validateLockOverride(packages, supplyChain, findings) {
  const override = supplyChain.dependencyOverrides[0];
  const requester = packages[`node_modules/${override.requester}`];
  const dependency = packages[`node_modules/${override.dependency}`];
  if (requester?.dependencies?.[override.dependency] !== override.declaredRange) {
    findings.push("package-lock.json: BundleWatch must retain its declared Axios range as override provenance");
  }
  if (!objectMatches(dependency, {
    version: override.version,
    license: override.licence,
    resolved: override.resolved,
    integrity: override.integrity,
    dev: true,
  })) {
    findings.push("package-lock.json: the resolved Axios security override must remain exact");
  }
  if (packages[`node_modules/${override.requester}/node_modules/${override.dependency}`]) {
    findings.push("package-lock.json: a nested vulnerable Axios copy bypasses the reviewed override");
  }
}

function validateLock(lockText, lock, manifest, policy, findings) {
  if (!lock || !policy?.supplyChain) return;
  const supplyChain = policy.supplyChain;
  const digest = createHash("sha256").update(String(lockText), "utf8").digest("hex");
  if (digest !== supplyChain.packageLockSha256) findings.push("package-lock.json: bytes do not match the reviewed SHA-256 policy binding");
  if (!validLockIdentity(lock, manifest)) {
    findings.push("package-lock.json: lockfile identity and closed schema must remain exact");
    return;
  }
  const entries = Object.entries(lock.packages);
  if (entries.length !== supplyChain.packageCountIncludingRoot) findings.push("package-lock.json: package count differs from the reviewed dependency closure");
  if (!validLockRoot(lock.packages[""], manifest)) findings.push("package-lock.json: root package must exactly mirror package.json");
  validatePackageEntries(entries, supplyChain, findings);
  validateDirectLockRecords(lock.packages, supplyChain.directDependencies, findings);
  validateLockOverride(lock.packages, supplyChain, findings);
}

export function qualityToolRegisterRecords(policyText) {
  const findings = [];
  const policy = parseJson(policyText, "audit/quality-gate-policy-v1.json", findings);
  const directByName = new Map((policy?.supplyChain?.directDependencies || []).map((record) => [record.name, record]));
  const records = (policy?.qualityToolComponents || []).map((component) => {
    const dependency = directByName.get(component.packageName);
    return {
      id: component.id, kind: component.kind, version: dependency?.version, licence: dependency?.licence,
      sourceUrl: component.sourceUrl, sourceCommit: component.sourceCommit, licenceEvidence: component.licenceEvidence,
      packageName: component.packageName, packageUrl: dependency?.resolved, packageSri: dependency?.integrity,
      attributionRecord: "licenses/ci-toolchain.md", bundled: false, scope: component.scope,
    };
  });
  if (records.length !== 8) findings.push("audit/quality-gate-policy-v1.json: eight quality-tool component records are required");
  return { records, findings };
}

export function ciDependencyPolicyFindings(input) {
  const findings = [];
  const policy = parseJson(input.qualityPolicyText, "audit/quality-gate-policy-v1.json", findings);
  const manifest = parseJson(input.packageJsonText, "package.json", findings);
  const lock = parseJson(input.packageLockText, "package-lock.json", findings);
  validatePolicy(policy, findings);
  validateManifest(manifest, policy, findings);
  validateLock(input.packageLockText, lock, manifest, policy, findings);
  return findings;
}

function pagesValidationLockPackages(lock) {
  const packages = {};
  const pending = ["ajv"];
  while (pending.length) {
    const key = `node_modules/${pending.pop()}`;
    if (Object.hasOwn(packages, key)) continue;
    const record = lock.packages[key];
    const restricted = ["os", "cpu", "optionalDependencies", "peerDependencies", "hasInstallScript"];
    if (!record || restricted.some((field) => Object.hasOwn(record, field))
        || Object.keys(lock.packages).some((candidate) => candidate.startsWith(`${key}/node_modules/`))) {
      throw new Error(`Pages validation requires a flat, platform-independent, script-free locked package: ${key}`);
    }
    packages[key] = structuredClone(record);
    pending.push(...Object.keys(record.dependencies || {}));
  }
  return Object.fromEntries(Object.entries(packages).sort(([left], [right]) => left.localeCompare(right, "en")));
}

export function pagesValidationDependencyProjection(input) {
  const findings = ciDependencyPolicyFindings(input);
  if (findings.length) throw new Error(findings.join("\n"));
  const manifest = JSON.parse(input.packageJsonText);
  const lock = JSON.parse(input.packageLockText);
  const packageJson = {
    name: manifest.name, version: manifest.version, private: true,
    license: manifest.license, engines: manifest.engines,
    devDependencies: { ajv: manifest.devDependencies.ajv },
  };
  const root = { name: packageJson.name, version: packageJson.version,
    license: packageJson.license, devDependencies: packageJson.devDependencies, engines: packageJson.engines };
  const packageLock = { name: lock.name, version: lock.version, lockfileVersion: lock.lockfileVersion,
    requires: true, packages: { "": root, ...pagesValidationLockPackages(lock) } };
  return Object.freeze({ packageJson, packageLock });
}

export function ciDependencyPolicyMutationFailures(input) {
  const failures = [];
  const run = (label, field, change, expected) => {
    const mutant = { ...input, [field]: change(String(input[field])) };
    if (!ciDependencyPolicyFindings(mutant).some((finding) => expected.test(finding))) {
      failures.push(`CI dependency policy mutation self-test did not reject ${label}`);
    }
  };
  run("a changed direct dependency", "packageJsonText", (text) => text.replace('"eslint": "10.9.0"', '"eslint": "10.8.0"'), /direct dev dependencies/u);
  run("a changed lockfile byte", "packageLockText", (text) => `${text.trimEnd()} `, /SHA-256 policy binding/u);
  run("a changed direct artifact integrity", "packageLockText", (text) => text.replace("sha512-5KeEOJZBfEVA47boFiBsf+6MmmJpffM7qEBg4pLla2e4nlKgdKlqCW0oSLOGsT8Wl5uCGJptLV1bkaiShj90Gw==", "sha512-forged"), /eslint artifact/u);
  run("an unapproved dependency licence", "packageLockText", (text) => text.replace('"license": "ISC",', '"license": "Proprietary",'), /unapproved dependency licence/u);
  run("a second lifecycle script", "packageLockText", (text) => text.replace('"node_modules/yocto-queue": {', '"node_modules/yocto-queue": {\n      "hasInstallScript": true,'), /unapproved lifecycle script/u);
  run("a removed metadata exception target", "packageLockText", (text) => text.replace('"node_modules/svg-tags": {', '"node_modules/svg-tags-renamed": {'), /package count differs|svg-tags/u);
  run("an added package", "packageLockText", (text) => text.replace('\n  }\n}', ',\n    "node_modules/unreviewed": {"version":"1.0.0","resolved":"https://registry.npmjs.org/unreviewed/-/unreviewed-1.0.0.tgz","integrity":"sha512-forged","dev":true,"license":"MIT"}\n  }\n}'), /package count differs/u);
  run("a weakened BundleWatch security override", "packageJsonText", (text) => text.replace('"axios": "1.20.0"', '"axios": "0.31.1"'), /identity, scripts, and Node pin/u);
  return failures;
}
