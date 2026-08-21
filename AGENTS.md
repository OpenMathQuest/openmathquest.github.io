# Math Quest agent instructions

These instructions apply to every coding agent working anywhere in this
repository. They are permanent project policy and remain in force for the
lifetime of Math Quest unless a later project directive explicitly replaces
them.

## Dependency and implementation policy

Before designing bespoke code, first inventory the capabilities already
available: the language standard library, installed Python and other-language
libraries, existing project dependencies, repository utilities, and
established open-source tools. Prefer these proven capabilities when they fit
the requirement. When the existing environment falls short, reasonably search
for an established, well-maintained open-source library or utility before
proposing a substantial custom implementation.

Before adopting or executing a new third-party library or utility, identify
its licence and maintenance or provenance status, then ask the project owner
for approval with a brief justification and the licence named explicitly.
Always ask before adding a dependency or building a substantial custom
solution. Do not treat familiarity with a tool, its installation on the
machine, or an open-source label as approval to use it.

Custom code is allowed for small local glue when a library would be
disproportionate, or when the user or project conventions require it. If no
suitable open-source option turns up after a reasonable search, propose a
custom approach—do not implement the substantial version until approved.

<!-- AI-FIRST-DRIFT-CONTROL-START -->
## AI-first drift-control authority

The primary consumer of the **Owners, Code Map, Feature Map, Tutorial
Manifest, Blast Radius, and Gates** systems is an AI coding agent. Design and
maintain these systems for maximum machine legibility. Never choose prose,
layout, naming, omission, convenience, or a human-friendly summary when that
choice makes the machine contract less exact or more ambiguous.

Their canonical records must use closed machine-readable schemas, stable
namespaced identifiers, explicit sole owners, typed relationships, enumerated
states and predicates, exact source bindings, deterministic declared ordering,
and fail-closed validation for missing, unknown, duplicate, stale, or orphaned
facts. A machine consumer must not need to infer control flow, authority,
ownership, dependency, proof meaning, or release impact from narrative prose.
Machine-facing commands emit structured data by default.

Human-readable tables, Markdown, diagrams, and summaries may exist only as
generated, non-authoritative projections. They may annotate canonical facts,
but may not introduce, reinterpret, weaken, or override one. When human and
machine convenience conflict, preserve the unambiguous machine contract. The
closed machine mirror of this directive is
`audit/repository-code-map-v1.json#aiReaderContract`; its authority binding and
focused tests must be updated in the same change whenever this section changes.
<!-- AI-FIRST-DRIFT-CONTROL-END -->

## Driftless repository routine

Before changing a shared fact, mechanic, count, identifier, path, or public
contract, run the relevant exact, word, symbol, or count query through
`tools/blast-radius-lookup.mjs`. Treat its output as a bounded dependency
hypothesis, then inspect the declared owners and artifact relations in
`audit/repository-code-map-v1.json`; do not treat text search as proof that no
other dependency exists.

The permanent chain is **Owners → Code Map → Feature Map → Tutorial Manifest →
Blast Radius → Gates**. Each governed fact has one sole owner in the Code Map.
Each child-operable mechanic has one stable `child.mechanic.*` identity in
`curriculum/math-quest-feature-map-v1.json`, and that identity must appear in
the matching Tutorial Manifest method binding. Any new, removed, renamed, or
moved mechanic, file, owner, projection, tutorial binding, proof obligation,
or dependency edge must update the applicable canonical maps and focused gates
in the same change. Never create a parallel ownership, feature, or status map
to work around this chain.

Run `node tools/blast-radius-lookup.mjs --self-test` and the focused `driftless`
development gate after changing any layer in the chain. Unknown paths and
unclassified effects fail safe to the broad development suite. The maps and
automation predict impact; they do not replace independent mathematical
oracles, rendered-browser evidence, accessibility review, human play testing,
or the single frozen-candidate certification run.

## Gate integrity

`audit/gate-integrity-policy-v1.json` is the sole machine authority for gate
status semantics, gate-family claim boundaries, versioned metric floors,
retry rules, negative controls, GitHub enforcement expectations, and honest
outcome reporting. `audit/release-evidence-bundle-v1.json` is the sole
machine authority for the current release-evidence bindings.

Every gate family must name and execute an effect-sensitive negative control.
A syntactically valid digest proves nothing unless it matches validated
canonical artifact bytes or an explicitly typed structured assertion whose
claim boundary is recorded. Inventory equality is never a pass count. Reports
must separately state literal passes, failures, skips, missing evidence,
required non-runs, and accepted non-pass states.

Required errors, timeouts, cancellations, skips, missing artifacts, and
unstarted executions fail closed. Predeclared cadence exclusions, optional
cycles not selected, owner-directed deferrals, historical owner skips, and
emergency waivers remain visible non-passes. They may be release-eligible only
under their exact scoped policy; they may never be relabelled as passes.

The protected `main` branch must require `development-checks`, which runs
on pull requests. It must not require the dispatch-only `full-audit` job.
Every semantic-version tag matching `refs/tags/v*` must be protected against
update and deletion with no bypass actors. Repository tests verify the local
workflow contract and a read-only GitHub preflight verifies the remote
configuration.

## Owner interaction and identity-placeholder policy

All communication addressed to the project owner—not child-facing game copy
or other user-facing product content—must follow Zinsser's four principles of
quality writing: **simplicity, brevity, clarity, and humanity**. Use plain,
direct language; include only what is useful; make the outcome, meaning, and
next action unmistakable; and retain a warm, respectful human voice. This
applies to questions, commentary, status updates, reviews, reports, release
notices, and final responses.

When a genuine ambiguity could materially change the result or waste work,
ask the owner one concise question early instead of guessing. Questions are
welcome whenever they improve shared clarity; do not postpone a necessary
question until after implementation. This does not create repeated approval
prompts for work already authorized.

For work the project owner has already authorized, proceed autonomously through
ordinary file, focused-test, Git, GitHub, and release operations. Do not
repeatedly ask for execution permission, reconfirm an approved scope, or
present the same approval in slightly different forms. Reuse the current
authorization and batch related operations whenever the platform permits it.
Where Codex requires sandbox escalation, submit one narrowly scoped request for
automatic review; do not turn that platform boundary into another product-
owner decision.

An explicit instruction to publish a named Math Quest beta or stable release
is end-to-end authority for that release scope. It covers the ordinary steps
needed to implement and verify the release, create or update its branch, commit
and push, open and maintain its pull request, monitor required checks, integrate
with the repository-approved method, run the one frozen-candidate gauntlet,
create a new annotated tag, publish the corresponding GitHub release, deploy
Pages, and verify the public result. That release instruction is the meaningful
human authorization boundary; do not insert command-by-command approval gates.

Release authorization continues across a **direct successor**: a descendant
revision on the same named release line whose changes are limited to correcting
findings, adding or repairing the checks that guard those corrections,
regenerating derived manifests or evidence, and satisfying the already-selected
release gates. It does not cover a different repository or organization, a new
version or destination, changed visibility, a package-registry publication,
unrelated product scope, force-push or history rewrite, or replacing, moving,
or deleting an existing tag, release, or asset. Those materially different or
destructive outcomes require a new explicit owner decision. A pause or stop
instruction remains controlling until the owner explicitly resumes the work.

GitHub authentication is separate from task authorization. Diagnose it with
`gh auth status` and use the existing GitHub CLI credential from the operating-
system keyring and HTTPS credential helper when valid. The routine interactive
exception is a missing, expired, insufficiently scoped, or organization-blocked
GitHub credential. Use the GitHub device-sign-in flow: provide one fresh,
mobile-friendly `https://github.com/login/device` link and its one-time code,
then verify access before continuing. Do not generate repeated codes while a
current code remains valid. Never display, request, copy, log, or invoke
`gh auth token`, and never expose a PAT, OAuth token, cookie, credential-manager
content, password, or private key.

Never invent a person's name, email address, street address, password, token,
or other identity-like value as a placeholder, fixture, commit identity, or
example. In particular, never request or fabricate a "neutral" or fake email
address. Use an existing repository-approved real role identity or a verified
GitHub-provided noreply identity when one is already available. If an external
operation genuinely requires missing identity information, fail closed and
report the single blocker instead of fabricating it.

This standing authorization does not permit bypassing branch protection,
required reviews, rulesets, environment gates, SSO, repository policy, or the
focused-versus-frozen-candidate testing cadence below. It also does not permit
guessing a material product, child-safety, privacy, legal, or destructive-scope
decision. If such a genuinely new decision cannot be resolved from existing
authority, identify it once and stop only the affected operation; otherwise
continue without asking.

## Agent collaboration and bounded review

Organize agents as one connected, bounded team. A lead agent owns the shared
finish line, delegation, file ownership, integration decision, and final
report. Unless the project owner explicitly authorizes a larger named cycle,
no more than three agents may be active for one task, including the lead, and
subagents may not create further agents.

Delegate only concrete, independently useful work. Low-risk copy,
documentation, or isolated styling work does not automatically require a
subagent. Fresh independent review is required when requested by the owner or
when a change materially affects mathematics or grading, child privacy or
security, persistence or migration, release or update infrastructure, or broad
child UX or accessibility. One reviewer may cover several related lenses; a
list of perspectives is not an instruction to create one agent per label.

Give each agent the requirements, relevant task records and reports, exact
revision or commit, owned files and paths, relevant diffs and test results, and
unresolved questions needed for its bounded task. A
reviewer must not have participated in implementation or be primed with its
conclusions, but independence does not mean withholding the code, requirements,
or objective evidence. Prefer a concise sealed task packet over full
conversation history.

Agents may inspect relevant work produced by teammates. Inspection is
read-only by default. Only one agent may edit a file or overlapping path at a
time. Use a separate branch or worktree when independent editing is genuinely
necessary; otherwise keep one implementation owner and return review findings
to that owner. Agents may send questions, findings, and requests directly through the
available task mailbox, while the lead remains responsible for scope and
integration.

Every review finding must name the exact revision reviewed, the specific
problem, its supporting evidence or reproduction, and the affected files or
observable effects. A general approval or concern without that traceability is
not a completed independent review.

Ordinary review is limited to one independent review and one
correction-verification round. The same reviewer verifies corrections to its
findings. Do not create a second fresh or "final" cohort for unchanged work,
restart unrelated reviews after a narrow correction, recursively spawn
critics, or continue review rounds without a new owner decision. Broader new
findings return to the lead for classification and either focused correction,
an existing backlog, or owner direction.

Record durable facts only when they materially change scope or acceptance,
resolve a blocking finding, preserve a takeover, or record an unresolved
release risk. Update the existing authoritative issue, plan, decision, or
release record that owns the fact; ordinary coordination remains in task
messages and must not create status files.

When one agent takes over another's task, preserve the exact revision,
completed work, focused results, owner decisions, file ownership, and unresolved
problems. The default workflow is:

> Implement → focused verification → independent review when warranted →
> correct → the same reviewer verifies → integrate

An explicitly selected optional six-reviewer release cycle is the only standing
exception to the three-agent cap. It must name one release scope and initial
exact candidate lineage, runs once, prohibits reviewer subagents and
overlapping edits, and uses those same reviewers for any focused correction
verification. Every report and verification binds the exact revision it
reviewed, including a corrected successor revision. It never creates a
preliminary cohort followed by six new final critics. The single frozen-
candidate certification run remains governed separately below.

<!-- FINISHED-WORK-POLICY-START -->
## What counts as finished work

The text between the `FINISHED-WORK-POLICY-START` and
`FINISHED-WORK-POLICY-END` markers in `AGENTS.md` is the human normative
authority for this policy. `audit/finished-work-policy-v1.json` is its closed
machine-readable mirror; it is not a second authority and must remain
consistent with this exact section, as enforced by the focused policy test.

### 1. Scope and product purpose

These rules govern every change, whether performed by a person, one agent, or
several agents working in parallel. They supplement every existing repository
check and do not silently replace or relax one. Satisfy both whenever their
requirements are compatible. If two requirements cannot both be satisfied,
stop the affected action, identify the conflict in the existing record that
owns it, and obtain the owner’s decision. Never infer permission to weaken a
gate.

**The product is the working, accessible, legally distributable game.** Deliver
an experience a child can genuinely use, that teaches and grades mathematics
correctly, protects the child and grown-up, and continues working offline after
validated installation. Math Quest must never automatically transmit child
identity, progress, answers, or gameplay telemetry. A deliberate
grown-up-controlled export or share may transfer only what that grown-up
explicitly selects. Tests, checks, documentation, infrastructure, and evidence
exist to protect the game, its users, and truthful public-release claims; they
remain required safeguards, not ends in themselves.

### 2. Real work and authoritative records

**Build the game and its real safeguards—not duplicate paperwork.** Every
implementation task must deliver a genuine product effect: observable game or
teaching behavior, or an underlying improvement to correctness, privacy,
security, accessibility, offline operation, performance, licensing,
persistence, deployment, or effect-sensitive verification of one of those
properties.

Do not create ad hoc status files, progress logs, roadmaps, session summaries,
or “what I did” reports. Record a fact in the existing authoritative document
or data file that owns it. Create a new repository artifact only when an
established gate requires distinct versioned evidence or no suitable
authoritative record exists. Register its purpose and avoid duplicating the
same authority elsewhere. When both human-readable Markdown and
machine-readable JSON are required, declare which record is authoritative and
enforce their consistency.

Documentation alone does not substitute for requested game implementation.
Reorganizing records, or choosing easier documentation instead of the product
work those records are meant to protect, does not count as implementing the
feature. Documentation remains legitimate work when it is itself the requested
deliverable or is necessary to make a real product, safety, legal, maintenance,
or release claim truthful.

During development, run focused checks that protect the affected behavior.
Reserve the complete certification gauntlet for the frozen release candidate as
already required. Never skip, weaken, shrink, or defer a required gate beyond
its proper release boundary merely to save time, tokens, or effort.

### 3. Honesty and legitimate test maintenance

**Honesty is absolute. Evidence must represent the real approved behavior.**
Never change a product, test, fixture, threshold, or report merely to make a
failure appear to pass.

In particular:

- Never hard-code production behavior, add a test-only bypass, weaken an
  assertion, remove coverage, introduce a skip, or select only favourable
  results to obtain a green outcome.
- Mocks, stubs, samples, and hand-picked cases may prove only the narrow
  behavior they actually exercise. They must never be presented as proof of
  broader procedural, browser, device, offline, privacy, or child-use behavior.
- Exact expected answers, independent mathematical oracles, golden fixtures,
  and defect-specific examples are legitimate when they derive from the
  approved contract and would detect an incorrect implementation.
- A test, fixture, or threshold may change when the approved behavior genuinely
  changed or an assertion became obsolete. Classify and document the reason in
  its existing owning record, obtain owner approval when the product contract
  changes, and preserve equal-or-stronger effect-sensitive protection of the
  intended behavior.
- Never call a build certified, shippable, or release-ready while required work
  or evidence is failing, stale, unreviewed, or incomplete.

Use completion terms precisely: **implemented** means the real behavior exists
and its focused checks pass; **release-certified** means the complete gauntlet
passed against the exact frozen candidate; **shipped** means those certified
bytes were actually published.

If work was incorrectly closed, reopen it in the existing issue, finding, or
authoritative work record; state what remains and why the earlier conclusion
was wrong. Do not create a separate status document merely to record the
correction.

### 4. Blockage, substitution, and changed scope

**Blocked, refused, or substituted work is not delivered work.** For an
implementation request, difficulty alone is not grounds to redefine or close
the feature. Exhaust safe in-scope investigation, diagnostics, and reasonable
alternatives.

If completion requires missing authority, a material owner decision,
unavailable external evidence, or an unsafe or prohibited action, stop the
affected work and label it accurately as **blocked** or **declined**. State the
specific reason, what remains unfinished, and what decision or external change
would permit progress. Never record it as implemented, certified, shipped, or
complete.

A plan, review, refusal, mock-up, stub, or placeholder may be a completed
deliverable when that was the explicitly requested scope. It does not complete
an outstanding implementation request. If the owner explicitly approves a
reduced or prototype scope, record the changed acceptance criteria in the
existing owning record and report only that narrower deliverable as
implemented.

A feature is implemented only when its real production path exists, a real user
can operate it as intended, its results are checked against genuine expected
values, and the applicable focused evidence passes. It becomes formally
complete only when the exact frozen release candidate passes the complete
certification gate.

### 5. Automation and evidence boundaries

**Automate everything that can be settled deterministically, and never
overstate what automation proves.** Independent mathematical oracles, exact
state comparisons, network observation, accessibility inspection, and
effect-sensitive tests should carry as much of the verification burden as they
genuinely can.

Human, rendered-browser, or physical-device evidence remains necessary when
the claim depends on perception, comprehension, platform behavior, or the real
environment. This includes, where applicable:

- whether synthesized speech is correctly pronounced, intelligible, and
  appropriately paced using supported installed voices;
- whether a pre-reader can understand the visual task and discover, operate,
  and recover from its controls;
- whether installation, offline relaunch, cache recovery, updates, touch
  interaction, and viewport behavior work on the selected supported platforms;
- whether visible mathematical representations, wording, feedback, and grading
  communicate the same mathematically correct task to a young child.

During development, run the focused automated checks and targeted human review
appropriate to the affected behavior. At the release boundary, bind every
required human, browser, hosted, and device verdict to the exact frozen
candidate according to the selected release gates. Missing evidence remains
pending; a script cannot convert it into a pass.

Record each verdict in the existing evidence artifact designated by the
repository. Evidence must exclude unnecessary child or personal information
and must state exactly what was observed, on which candidate, platform, and
configuration.

### 6. Predefined finish line

**Define the finish line before implementation begins.** Capture the task’s
acceptance criteria in its existing issue, plan, governing record, or active
working plan. Do not create a separate repository status file solely for this
purpose. A concise in-session definition is sufficient for a small, bounded
change; broad, risky, educational, privacy-sensitive, or release-affecting work
requires durable criteria in its authoritative record.

The definition must identify, as applicable:

- the real behavior or underlying product property being delivered;
- what the child or grown-up will experience;
- affected mathematical, privacy, accessibility, persistence, offline,
  platform, licensing, and safety contracts;
- the focused automated checks and targeted human evidence that will prove
  implementation;
- any explicit non-goals or approved limitations; and
- the final frozen-candidate evidence still required for formal completion.

For a confirmed defect, include an effect-sensitive regression that fails for
the defective behavior and passes for the correction. For parallel work, all
agents share the same overall finish line; completing a subtask does not
complete the parent task.

If the requested outcome or acceptance criteria must change materially, state
the proposed change and obtain the owner’s approval before implementing the
expanded, reduced, or substituted scope. Never narrow the finish line afterward
merely because the original work proved difficult.
<!-- FINISHED-WORK-POLICY-END -->

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
5. Execute the relevant focused, effect-sensitive checks while developing.
   Reserve the complete certification gate for the immutable release candidate
   after it is frozen and immediately before its public tag, release, and
   deployment.
6. Review the findings, failures, skips, residual risks, and generated evidence
   rather than treating a process exit code alone as certification.

Implementation work may be reported as implemented with its focused checks
passing, but no feature, refactor, optimization, content update, or release
candidate is formally complete until the final complete certification gate has
run against the frozen release candidate and its findings have been reviewed.
Failure to update or execute the applicable focused coverage after a project
change, or the complete gate at the release boundary, is a process defect.

### Testing cadence and release-candidate freeze

During ordinary development, pull requests, branch pushes, and pushes to
`main`, run the defined fast development suite plus every focused check needed
for the affected behavior. Add permanent effect-sensitive regression coverage
for confirmed defects. Do not run the complete certification gauntlet merely
because an individual file, feature, fix, or ordinary integration commit
changed.

Run the complete certification system once after all planned release work is
finished, the candidate commit and public payload are frozen, and publication
is the next intended operation. A clear owner instruction to publish a beta or
stable release authorizes this final run without a second approval prompt. The
run must cover every required automated, browser, visual, educational,
privacy, hosted, manual, independent-review, and physical-device gate defined
for that release.

Bind the final certification evidence to the exact immutable commit and exact
public payload that will be tagged and deployed. A product, content,
configuration, evidence, or payload change after the run invalidates the
candidate: apply focused checks while correcting it, freeze a new candidate,
and rerun the complete gauntlet from the beginning. Never retain a prior green
result as certification for changed bytes.

Agents may recommend an earlier complete run when an unusually broad or risky
change warrants one, explaining the concern and likely value, but must obtain
the owner's explicit approval before starting it. An early run is diagnostic
and does not replace the final frozen-candidate run.

### Alternating-beta Playwright Deep UX Census

Beginning with `v1.0.0-beta.4`, every second semantic-version beta—Beta 4,
Beta 6, Beta 8, and so on—must also pass the Playwright Deep UX Census on the
exact frozen candidate. It runs as a separate GitHub-hosted Windows job in
parallel with, not inside or instead of, the single complete certification
gauntlet. A scheduled census failure blocks that beta.

The census deterministically inventories all 72,576 governed combinations of
126 skills, two difficulties, three representations, three worlds, and 32
sample ordinals. Its versioned risk planner selects a closed representative
set across structural signatures and required skill, method, representation,
theme, and model witnesses. Each selected scenario is rendered in six
governed Edge viewport/touch profiles and inspected in its initial, partial-
response, expected-answer, available teaching-model, and three-step tutorial
states. The tutorial states must prove a structurally matched different example,
Notice / Plan / Check progression, return to the exact source question, and
unchanged child-save bytes. It uses native
Playwright mouse, touch, keyboard, wheel, and form actions; zero retries; context-
level request observation; browser actionability without forced interaction;
16 px text and 44 px control floors; layout, overflow, accessible-name, save-
isolation, console, page-error, and request checks. Screenshots, AI-readable
ARIA snapshots with boxes, and geometry records are retained only for
anomalies and contain synthetic test state only.

Early learning and every ordinary portrait, tablet, and desktop question keep
the first response on the first question view. Later-grade content on the
governed 844 by 390 short-landscape profile may use intentional outer-page
scrolling when a large mathematical model cannot fit; the census must perform
that scroll explicitly and then prove the response is actionable with further
automatic scrolling disabled. Unapproved nested scrolling and unreachable
controls remain defects; only the governed large route-grid scroller is exempt.

Routine development must not run the complete census. The local 100-cell
balanced benchmark is a non-certifying implementation and performance check;
it cannot satisfy the alternating-beta gate. The census supplements but never
replaces the 72-result browser audit, direct Playwright journeys, independent
mathematical checks, human play testing, accessibility review, trusted-PWA
evidence, or any selected physical-device evidence. It cannot establish child
comprehension, visual taste, screen-reader speech, real-finger operation,
software-keyboard behaviour, Safari/iOS behaviour, or installed-PWA relaunch.
The closed machine cadence is owned by
`audit/certification-cadence-v1.json`.

### Permanent tutorial linkage

Every ordinary curriculum question must provide the real in-level **Show me
how** path and a structurally matched different example. The tutorial proceeds
through three child-visible steps—Notice, Plan, and Check—without exposing the
source question's answer. Opening a tutorial or answering after tutorial help
must preserve truthful feedback but contribute no mastery, spacing, practice,
promotion, placement, or other learning evidence. Parent Test must expose the
same tutorial behavior while remaining byte-for-byte isolated from the child
save.

`curriculum/math-quest-tutorial-manifest-v1.json` is the canonical tutorial
linkage record. It must remain schema-valid and exactly bound to the current
curriculum bytes, skill-to-level map, required task types, generator contract,
input-method set, generator-profile set, generated semantic-prompt feature set,
and approved child-string IDs. Any new, removed, renamed, or moved skill, level,
task type, input method, generator profile, semantic prompt, response family,
or child-visible mathematical representation must update or regenerate this
record and its focused tests in the same change. A feature is not implemented,
release-certified, or shipped while its tutorial linkage is missing or stale.

Focused development evidence must exercise different-example structure,
answer separation, persistence, save-failure rollback, non-evidentiary assisted
attempts, Parent Test isolation, and native desktop/touch tutorial operation.
The direct Playwright journeys and the alternating-beta Deep UX Census must
stay synchronized with tutorial controls, steps, geometry, accessibility, and
return-to-question behavior. Adding a game type without extending these
tutorial effects is a process defect.

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

## Owner directive: prerelease host qualification is deferred until stable

On 2026-08-02, the project owner directed that external child-facing host
privacy and legal qualification be deferred for semantic-version prerelease
builds beginning with `v1.0.0-beta.4`. For an eligible prerelease, `EXT-HOST`
must be recorded as exact `DEFERRED_PRERELEASE` and reported as `DEFERRED`.
It is nonblocking for that prerelease channel, but it is never `PASS`,
`APPROVED`, `WAIVED`, or evidence that the selected host is privacy-cleared.
Its evidence digest must bind the current host review and this owner decision,
and the residual risk must remain explicit.

This deferral expires before the first stable release. A stable release tag
with no prerelease suffix must fail closed unless the selected child-facing
host has exact affirmative privacy/legal qualification or the runtime has
moved to another host that has it. No stable candidate may inherit, rename, or
silently convert the prerelease deferral.

The deferral changes no application-level privacy or safety requirement. Math
Quest must still automatically transmit no child name, progress, answers, or
gameplay telemetry; use no analytics, advertising, accounts, cloud sync,
remote speech, or third-party runtime dependency; keep export deliberate and
grown-up-controlled; and pass every runtime-request, privacy, secret,
metadata, provenance, offline, and PWA check. Except for the explicit Beta
4-only owner skip below, the exact-candidate trusted-HTTPS canary remains
mandatory and must be `RECONCILED`; it proves candidate bytes,
headers, caching, update, recovery, and offline behavior, not host privacy.

Every hosted-beta notice must disclose that the hosting provider may receive
ordinary HTTPS request metadata such as IP address, browser or device
information, requested path, and request time. Do not claim that no data at
all leaves the device during a hosted page load. The accurate narrower claim
is that Math Quest itself does not automatically transmit the child's
identity, learning record, answers, or gameplay telemetry.

## Owner-authorized Beta 4 canary skip and direct evidence successor

On 2026-08-09, the project owner explicitly directed that the trusted-HTTPS
canary not run for `v1.0.0-beta.4`. This release-scoped exception must appear
as exact `OWNER_SKIPPED_BETA4` with evidence value `NONE` and gate status
`OWNER_SKIPPED`. It is nonblocking only for that exact prerelease tag. It is
never `PASS`, `RECONCILED`, `APPROVED`, `WAIVED`, host qualification, or proof
of trusted-HTTPS update, cache, repair, cold-offline, migration, teardown, or
privacy behavior. The release report and notes must retain that missing
evidence as an explicit residual risk. The exception expires after Beta 4 and
cannot be copied to Beta 5 or a stable release without a new owner decision.

Beta 4 also uses one narrowly defined direct evidence successor so hosted
Windows identity can be observed before final clearance without requiring a
duplicate complete gauntlet. The terms below are literal:

- The **qualification commit** is a committed, protected-main Beta 4 revision
  whose game and runtime bytes are final. It contains `Status: PENDING` in
  `PUBLICATION_CLEARANCE.md` and `status: PENDING` in
  `audit/browser-runner-evidence-v1.json`.
- The **direct evidence successor** is the next commit. It must have exactly
  one parent, and that sole parent must be the named qualification commit. A
  merge commit, skipped ancestor, cousin, rebased equivalent, cherry-pick, or
  later descendant is not a direct successor.
- The Git diff from the qualification commit to the direct evidence successor
  must change exactly `PUBLICATION_CLEARANCE.md` and
  `audit/browser-runner-evidence-v1.json`, and no other path. “Evidence-only”
  does not mean any documentation, workflow, test, manifest, source, asset, or
  release-note file may change.
- Because only those two records may change, every game, curriculum, PWA,
  service-worker, licence, privacy, deployment, and runtime byte remains
  byte-identical. The repository-wide public-payload digest is expected to
  change because it includes the reviewed browser evidence; never claim that
  the two commits have the same public-payload digest.
- The final complete certification runs once on the direct evidence successor,
  after its reviewed evidence and approval are committed. Only that exact
  successor may be tagged and deployed. The earlier qualification commit is
  not certified, taggable, shippable, or a substitute for the final run.

The closed machine policy name is `DIRECT_EVIDENCE_SUCCESSOR_V1`. The release
validator must prove the sole-parent relationship, the two-path exact diff,
the two pending predecessor records, and the final evidence/clearance records.
Any other change or relationship invalidates this exception and requires a
new qualification commit and owner direction before proceeding.

## Owner-authorized Beta 5 canary and runtime-equivalent evidence successor

On 2026-08-12, the project owner authorized publication work for
`v1.0.0-beta.5` and approved one narrow evidence boundary that preserves the
single frozen-candidate gauntlet without weakening the canary. The trusted-
HTTPS canary is mandatory for Beta 5 and must produce exact `RECONCILED`
evidence. Beta 4's owner-skipped canary state is historical and can never
authorize Beta 5.

The **Beta 5 qualification commit** is a protected-main commit whose game,
curriculum, PWA, service-worker, dependency, privacy, licence, deployment, and
runtime bytes are final. It contains `Status: PENDING` in
`PUBLICATION_CLEARANCE.md` and `status: PENDING` in
`audit/browser-runner-evidence-v1.json`. The hosted-Windows observation and
trusted-HTTPS canary must both name this exact qualification commit; the
canary record must validate as `RECONCILED` before clearance is composed.

The **Beta 5 runtime-equivalent evidence successor** has one closed meaning:

- it is the next commit, has exactly one parent, and that sole parent is the
  named Beta 5 qualification commit;
- the parent-to-child Git diff changes exactly
  `PUBLICATION_CLEARANCE.md` and
  `audit/browser-runner-evidence-v1.json`, and no other path;
- the reviewed canary artifact's `candidateSha` equals the qualification
  commit and its exact SHA-256 is recorded in the successor's clearance;
- the hosted-Windows artifact also names the qualification commit, and its
  reviewed tuple is recorded in the browser-evidence file and clearance;
- every game, curriculum, PWA, service-worker, dependency, privacy, licence,
  deployment, and runtime byte is therefore byte-identical between the two
  commits, while the repository-wide public-payload digest truthfully changes
  because the two evidence records changed; and
- the one complete certification gauntlet runs only on this successor. Only
  that exact successor may be tagged, released, or deployed as Beta 5.

The closed policy name is
`RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_V1`. This is a Beta 5-only owner
decision, not a reusable canary waiver or automatic rule for Beta 6 or stable
release. Any different parentage, path set, runtime byte, canary result, or
evidence binding invalidates the successor and requires a new qualification
commit and owner direction.

For Beta 5, the owner also declined the optional six-lane physical-device
cycle and optional six-reviewer cycle. Both must appear as exact
`OPTIONAL_NOT_RUN` / `NONE` / zero-count records and must never be described as
passes, waivers, device qualification, or independent-review qualification.
The ordinary bounded independent review required by this repository remains
separate and does not impersonate the optional six-reviewer cycle.

## Owner-authorized Beta 6 canary and runtime-equivalent evidence successor

On 2026-08-13, the project owner authorized end-to-end publication of
`v1.0.0-beta.6` and approved the same closed evidence boundary for this release
line. The trusted-HTTPS canary is mandatory and must produce exact
`RECONCILED` evidence. The Playwright Deep UX Census is also mandatory because
Beta 6 is selected by `ALTERNATING_BETA_V1`.

The **Beta 6 qualification commit** is a protected-main commit whose game,
curriculum, PWA, service-worker, dependency, privacy, licence, deployment, and
runtime bytes are final. It contains `Status: PENDING` in
`PUBLICATION_CLEARANCE.md` and `status: PENDING` in
`audit/browser-runner-evidence-v1.json`. The hosted-Windows observation and
trusted-HTTPS canary both name this exact qualification commit. The canary must
validate as `RECONCILED` before clearance is composed.

The **Beta 6 runtime-equivalent evidence successor** is the immediate,
non-merge, sole child of that qualification commit. Its exact parent-to-child
Git diff changes only `PUBLICATION_CLEARANCE.md` and
`audit/browser-runner-evidence-v1.json`. The reviewed canary and hosted-Windows
artifacts bind the qualification commit; every game, curriculum, PWA,
service-worker, dependency, privacy, licence, deployment, and runtime byte is
byte-identical in the successor. The repository-wide public-payload digest
truthfully changes because the two public evidence records change.

The closed policy name remains
`RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_V1`. The single complete certification
gauntlet and required Deep UX Census run only on the exact successor. Only that
successor may be tagged, released, or deployed as Beta 6. A merge, rebase,
cherry-pick, skipped ancestor, additional changed path, changed runtime byte,
or mismatched evidence artifact invalidates the boundary and requires a new
qualification commit.

The qualification observation and final certification are separate
GitHub-hosted jobs. Each must independently record and validate its own exact
browser product, full version, executable SHA-256, `ImageOS`, and
`ImageVersion`. Because `windows-latest` is a floating selector, those two
exact tuples are not required to be equal. Clearance binds the tuple from the
reviewed qualification artifact; the final certification report binds its own
live tuple. A missing, malformed, local, or unreviewed tuple still fails
closed, as does any mismatch between clearance and the reviewed qualification
record. Drift between two otherwise valid hosted tuples is evidence to retain,
not a reason to restart the release cycle.

For Beta 6, the owner declined the optional six-lane physical-device cycle and
optional six-reviewer cycle. Both remain visible as exact
`OPTIONAL_NOT_RUN` / `NONE` / zero-count records and make no pass, waiver,
device-qualification, or independent-review claim. The ordinary bounded
independent review remains required and separate.

## Certification framework entry points

Treat the following as one modular certification system and keep their
contracts consistent:

- `audit/run-audit.ps1` and `audit/run-audit.mjs`: complete audit orchestration
  and evidence reporting;
- the **Agent collaboration and bounded review** section,
  `audit/agent-collaboration-policy-v1.json`, and
  `audit/tests/agent-collaboration-policy.test.mjs`: the human authority,
  closed machine-readable mirror, and anti-weakening regression for bounded
  delegation and review;
- `.github/workflows/hosted-windows-observation.yml`,
  `audit/observe-hosted-windows.ps1`, and
  `audit/validate-hosted-windows-observation.mjs`: exact-main-SHA
  GitHub-hosted Windows browser/runner identity observation, canonical
  non-certifying artifact validation, and no-gauntlet evidence collection;
- `.github/workflows/trusted-https-canary.yml`,
  `audit/run-trusted-https-canary.ps1`,
  `audit/run-trusted-https-canary.mjs`, and
  `audit/validate-trusted-https-canary.mjs`: a manual, disposable,
  loopback-only GitHub-hosted Windows canary that binds exact Beta 1 and
  candidate bytes to trusted HTTPS, real update, offline-relaunch, cache
  recovery, privacy, and teardown evidence without running the gauntlet;
- `audit.html` and `audit/approved-visual-regression.js`: browser, visual,
  accessibility, child-flow, and profile certification;
- `audit/tests/`, `audit/exhaustive-generator-audit.mjs`,
  `audit/mutation-runner.mjs`, and `audit/run-coverage.mjs`: effect-sensitive
  technical, educational, exhaustive, mutation, and coverage checks;
- the marked **What counts as finished work** section,
  `audit/finished-work-policy-v1.json`, and
  `audit/tests/finished-work-policy.test.mjs`: the human authority, closed
  machine-readable mirror, and anti-weakening regression for completion;
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

On Windows, `audit.bat` is the release-only complete local entry point. Ordinary
development uses the focused development checks and change-specific tests;
they do not replace the final complete gate. Release approval still requires
every external, independent, hosted, and physical-device gate specified by the
release documents.
