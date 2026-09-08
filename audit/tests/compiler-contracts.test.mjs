import assert from "node:assert/strict";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  compilerContractFindings,
  compilerContractMutationFailures,
} from "../run-compiler-contracts.mjs";

function cleanObservation() {
  return {
    eslintStatus: 0,
    javascriptParseErrors: [],
    powershellParseErrors: [],
    jsonParseErrors: [],
    policyValidationErrors: [],
  };
}

test("compiler contracts accept zero parse, lint-error, and schema failures", () => {
  assert.deepEqual(compilerContractFindings(cleanObservation()), []);
});

test("[NC-COMPILER-CONTRACTS] each malformed source or policy channel fails", () => {
  assert.deepEqual(compilerContractMutationFailures(), []);
});

test("schema validator URI resolution canonicalizes scheme-relative international hosts", () => {
  const resolver = new Ajv2020().opts.uriResolver;
  const resolved = resolver.resolve("https://base.invalid/", "//mañana.invalid/");
  assert.equal(resolved, "https://xn--maana-pta.invalid/");
  assert.equal(new URL(resolved).hostname, "xn--maana-pta.invalid");
});
