import assert from "node:assert/strict";

export class AuditHarness {
  constructor() {
    this.results = [];
    this.effectMap = [];
  }

  async check(id, title, effect, fn, { required = true } = {}) {
    const started = Date.now();
    try {
      const details = await fn(assert);
      this.results.push({ id, title, status: "PASS", required, durationMs: Date.now() - started, details: details ?? "" });
      this.effectMap.push({ id, effect, antiVacuity: "assertion-backed" });
    } catch (error) {
      const skipped = error instanceof AuditSkip;
      this.results.push({
        id,
        title,
        status: skipped ? "SKIP" : "FAIL",
        required,
        durationMs: Date.now() - started,
        details: error?.stack || String(error),
      });
      this.effectMap.push({ id, effect, antiVacuity: skipped ? "not exercised" : "assertion failed or behavior absent" });
    }
  }

  skip(reason) { throw new AuditSkip(reason); }

  summary() {
    const counts = { PASS: 0, FAIL: 0, SKIP: 0 };
    for (const result of this.results) counts[result.status] += 1;
    const requiredFailures = this.results.filter((r) => r.required && r.status !== "PASS").length;
    return { ...counts, total: this.results.length, requiredFailures };
  }
}

export class AuditSkip extends Error {
  constructor(message) { super(message); this.name = "AuditSkip"; }
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function canonicalData(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalData);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalData(value[key])]));
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalData(value));
}

export function functionFrom(engine, ...names) {
  const name = names.find((candidate) => typeof engine[candidate] === "function");
  return name ? { name, fn: engine[name].bind(engine) } : null;
}

export function constantFrom(constants, ...names) {
  for (const name of names) if (Object.hasOwn(constants, name)) return constants[name];
  return undefined;
}
