# Math Quest agent instructions

These instructions apply to every coding agent working anywhere in this
repository. They are permanent project policy and remain in force for the
lifetime of Math Quest unless a later project directive explicitly replaces
them.

## Permanent directive: holistic release certification

Maintaining, extending, executing, and reviewing Math Quest's release
certification framework is a first-class project responsibility. The framework
is core infrastructure and must receive the same care as production source
code.

This responsibility applies whenever the game or repository changes,
including changes to code, assets, educational content, artwork, audio, user
interface, documentation, configuration, dependencies, workflows, build or
deployment behavior, and project structure. Holistic, rigorous testing of the
complete user experience is an enduring responsibility, not a one-time release
task.

The objective is to certify release quality, not merely to show that the
software runs. Continuously challenge the assumption that the product is ready
until sufficient objective evidence demonstrates otherwise.

### Required quality dimensions

Evaluate every applicable change and release candidate across:

- software correctness;
- educational and mathematical correctness;
- usability;
- child comprehension, including pre-reader use;
- visual quality;
- accessibility;
- platform and device consistency;
- performance and responsiveness;
- content quality;
- completeness;
- overall product polish; and
- overall release readiness.

Absence of an obvious failure is not evidence that a dimension is covered.
Use automated checks, browser evidence, visual inspection, manual review, and
real-device evidence as appropriate to the claim being certified.

### Change-time obligations

For every feature, fix, refactor, optimization, content update, or release
candidate:

1. Determine which user journeys, learning contracts, platforms, assets,
   safety properties, and release claims could be affected, including indirect
   and cross-feature effects.
2. Inspect the existing certification coverage for those effects.
3. Extend or revise the framework whenever the existing evidence would not
   comprehensively cover the change. When uncertain whether new coverage is
   required, assume that it is required.
4. Keep test fixtures, expected counts, effect maps, visual profiles, manual
   review protocols, platform matrices, release documentation, and audit
   orchestration synchronized with the product.
5. Execute the relevant focused checks while developing, then execute the
   complete applicable certification gate before declaring the work complete.
6. Review the findings, failures, skips, residual risks, and generated evidence
   rather than treating a process exit code alone as certification.

No feature, refactor, optimization, content update, or release candidate is
complete until the certification framework has been updated as necessary,
executed, and its findings reviewed. Failure to update or execute the
framework after a project change is a process defect.

### Defect regression policy

Every confirmed defect must become a permanent, effect-sensitive regression
test. The test must fail for the defective behavior and pass for the corrected
behavior; source-text matching alone is not sufficient where an observable
effect can be exercised.

If a permanent automated regression test is technically infeasible, document
the specific reason, preserve the defect as a mandatory manual or real-device
certification check, identify the evidence required, and record the residual
risk. Convenience, implementation time, test size, or current tool limitations
alone are not sufficient reasons to omit coverage.

### Test-validity and obsolete-assertion review

Holistic review must challenge both the product and the continuing validity of
its tests. Do not assume that an old assertion remains correct merely because
it once protected an approved behaviour.

For every failing or materially affected check:

1. Classify it explicitly as a product defect, test defect, environment or
   harness defect, pending approval/evidence gate, or a combination of these.
2. Compare the assertion with the current approved child, grown-up,
   accessibility, educational, privacy, platform, and persistence contracts.
3. Identify obsolete assumptions, contradictory predicates, stale focus or
   interaction expectations, timing races, and assertions that accidentally
   include unrelated changing state.
4. Revise or replace an obsolete test only when the reason is documented and
   equal or stronger effect-sensitive coverage protects the current intended
   behaviour and the original safety or usability purpose.
5. Never weaken, delete, skip, or reclassify a test merely to obtain a passing
   result. When the product is wrong, fix the product and retain a regression
   that would fail for the defect.

Independent and antagonistic review briefs must include this test-validity
analysis. Release reports must distinguish corrected product defects from
corrected test or harness defects so a green gate cannot conceal either kind of
regression.

### Framework evolution and modularity

Continuously evolve the certification framework as new screens, mechanics,
assets, educational material, platforms, workflows, or release claims are
introduced. Remove or replace obsolete tests only when equivalent or stronger
coverage is demonstrated and documented. Never allow the framework to become
obsolete through neglect.

Do not omit a certification requirement merely to reduce file size, token use,
context size, instruction length, or documentation volume. If any instruction,
test, or evidence map becomes impractical as a single file, refactor it into
clear, logically organized modules while preserving its complete behavior,
authority, traceability, and mandatory-gate status.

### Evidence and release decisions

The release certification framework is a mandatory, fail-closed release gate.
Do not describe a build as certified, shippable, release-ready, or complete
while any required check is failing, stale, unreviewed, unjustifiably skipped,
or waiting on mandatory manual, independent, hosted, or physical-device
evidence.

Report blockers and limitations precisely. A check that cannot run in the
current environment remains pending; it does not become a pass. Any product or
evidence change after certification invalidates the affected conclusions and
requires recertification.

This directive has higher project priority than convenience, implementation
speed, or minimizing tests and documentation. It does not override applicable
security, privacy, legal, platform, or higher-authority agent instructions.

## Owner-authorized emergency exception: Public Beta 3 only

On 2026-07-30, the project owner explicitly authorized an emergency exception
for `v1.0.0-beta.3` so the already-public child experience can receive urgent
Home-navigation and answer-feedback repairs without waiting for the six-lane
physical-device matrix or six new independent-reviewer reports.

This exception is narrow and expires with that exact tag. It does not convert
missing evidence into a pass. The release record and audit must report
`EMERGENCY_APPROVED`, show the six affected external gates as `WAIVED`, retain
their real zero/unknown counts, name the residual risk, and remain bound to the
exact public payload, protected `main` ref, reviewed GitHub-hosted Windows
browser tuple, and owner authorization. All deterministic, educational,
privacy, licence, mutation, coverage, browser, PWA, immutable-snapshot, tag,
and deployment checks remain mandatory and fail closed.

No later release may reuse this exception. The ordinary holistic certification
policy above resumes in full for Beta 4 and every subsequent candidate unless
the project owner records a new explicit release-scoped directive.

## Certification framework entry points

Treat the following as one modular certification system and keep their
contracts consistent:

- `audit/run-audit.ps1` and `audit/run-audit.mjs`: complete audit orchestration
  and evidence reporting;
- `audit.html` and `audit/approved-visual-regression.js`: browser, visual,
  accessibility, child-flow, and profile certification;
- `audit/tests/`, `audit/exhaustive-generator-audit.mjs`,
  `audit/mutation-runner.mjs`, and `audit/run-coverage.mjs`: effect-sensitive
  technical, educational, exhaustive, mutation, and coverage checks;
- `docs/development/build-spec.md` and `research/build-axioms.md`: the stable
  build contract and its reviewed interpretation record;
- `docs/testing/test-to-branch-effect-map.md`: traceability from every check to
  its protected observable effect;
- `docs/release/publication-gates.md`, `docs/release/checklist.md`, and
  `docs/release/readiness.md`: fail-closed release requirements, evidence
  status, and human review decisions;
- `docs/release/ios-ipados-pwa-beta2-plan.md` and related verification
  documents: platform, installation, lifecycle, performance, and real-device
  evidence;
- `PUBLICATION_CLEARANCE.md`, the public-file manifest, provenance and rights
  records, and browser-runner evidence: exact-candidate approval inputs.

When adding or changing coverage, update the effect map and all expected
assertion or evidence counts that form part of the fail-closed contract. When
adding a new certification module, add it to this entry-point list or to a
linked index so future agents can discover and execute it.

On Windows, `audit.bat` is the ordinary complete local entry point. Use focused
test commands only as development feedback; they do not replace the complete
gate. Release approval still requires every external, independent, hosted, and
physical-device gate specified by the release documents.
