# Public Beta 1 release readiness

This document describes the release boundary; it is not publication approval.

## Local candidate requirements

A candidate is technically ready only when the generated
`audit/final-build-report.md` records:

- matching predicted and actual audit counts;
- zero required deterministic, semantic, browser, accessibility, or launcher
  failures;
- calibrated branch coverage of at least 90 percent for the exact shipped
  engine;
- all representative mutation families killed;
- exhaustive generator and exact-grading checks passed;
- the staged privacy, metadata, secret, provenance, and open-component guard
  passed; and
- identical public-payload and payload-tree identities before and after the
  audit.

The generated report is intentionally ignored because it contains a run
timestamp and is regenerated from the exact staged tree. Its host paths are
sanitized before writing.

## Publication boundary

Preparing and auditing the repository does not publish it. Deployment remains
fail-closed while `PUBLICATION_CLEARANCE.md` is absent or does not match the
exact engine, curriculum manifest, rights state, payload digest, and payload
tree.

The payload identity covers every staged entry except the bytes of
`PUBLICATION_CLEARANCE.md`. The clearance path still has to be classified in
the component register, listed in the exact public-file manifest, inspected by
the guard, and match the working tree. Excluding only its approval bytes avoids
a cryptographic self-reference while leaving the reviewed release payload
stable.

The remaining external and real-device requirements are listed in
`docs/release/publication-gates.md`. The manual Pages workflow must not be run
until those gates are independently completed.
