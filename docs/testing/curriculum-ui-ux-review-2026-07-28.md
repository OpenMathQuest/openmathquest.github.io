# Math Quest curriculum and UI/UX review

Date: 2026-07-28
Status: Historical review complete; all parent decisions approved; see the
2026-08-03 current-worktree supplement for implementation and evidence status
Runtime status: This review itself changed no game or curriculum behaviour;
the approved remediation was implemented afterward and remains subject to the
focused and frozen-candidate evidence named below

## Purpose

This review began with a parent report about MQ-001, "Pair Each Object." The
question described two rows of themed objects but did not show either row, and
five samples repeated the same scenario with only the count changed.

The review expanded to determine whether that was an isolated presentation
problem or a recurring question-generation, visual-representation, and
assessment-validity problem.

## Review method

Three independent methods were reconciled:

1. A browser walkthrough of the Parent Test Lab covered all 126 skills in all
   21 levels, Easy and Hard/Target, with five rendered samples per combination:
   1,260 rendered question states.
2. A deterministic generator corpus covered 126 skills, two difficulties,
   three requested representations, three themes, and 32 ordinals: 72,576
   generated questions.
3. An independent curriculum-clarity and assessment-validity audit checked
   8,064 seeded instances and explicitly probed every declared task type.

The Parent Test Lab remained isolated throughout. No child progress, evidence,
session, or save data was changed.

This was a desktop question-content review, not a replacement for the planned
physical iOS/iPadOS device matrix.

## Verdict

The reported problem is confirmed and is broader than MQ-001.

The current build can remain available as a prototype, but it should not claim
that every one of the 126 skills is currently a valid mastery assessment.
Affected questions should be fixed or made non-evidentiary before the next
release is described as measuring mastery across the complete curriculum.

The existing responsive-size baseline is healthy: the current visual suite
found no sampled child-facing font below 16 px and no sampled control below
44 px. Those floors should be preserved during remediation.

The most serious problems are:

- questions that refer to a clock, angle, map, chart, grid, set, or model that
  is not visible;
- objectives that require pairing, sorting, building, measuring, explaining,
  or recording but provide only multiple-choice selection;
- prompts or teaching models that disclose the answer before the child
  responds;
- variants with ambiguous mathematics, invalid distractors, broken controls,
  or curriculum constraints that the generator does not enforce;
- very low scenario and representation variety in substantial parts of the
  curriculum;
- generated grammar and reading-load problems, especially for pre-readers and
  early readers.

## Quantitative signals

- Only 5,692 of 72,576 generated visible prompts were unique (7.84%).
- At every one of 24,192 matched skill/difficulty/theme/ordinal coordinates,
  the Concrete, Pictorial, and Abstract requests produced identical question
  semantics. Only the representation label changed.
- Runtime queues request Pictorial or Abstract, but not Concrete.
- All 42 skills through Level 7 rendered as `PICTURE_CHOICE`; the child is not
  asked to construct, pair, sort, split, deal, move, or draw.
- In the 1,260-state browser sample, only 9 of the first 42 skills showed a
  conventional DOM illustration or diagram on the question surface. Some
  other questions placed dots, brackets, or shape glyphs inside a sentence,
  but did not preserve an authentic spatial representation.
- After numbers and theme nouns were normalized, 37 of 126 skills used one
  sampled prompt structure and 72 used no more than two.
- Six skills produced only one visible prompt across the larger corpus:
  MQ-004, MQ-006, MQ-030, MQ-042, MQ-051, and MQ-066.
- Four prompt families omitted all source values from their text and depended
  on a hidden model. This affected 3,600 of 72,576 corpus questions.
- MQ-004, MQ-030, and MQ-124 expose too few distinct sample keys to satisfy
  the current selection-mastery rule.
- The three themes mostly substitute "shells," "acorns," or "moon rocks"
  without changing the mathematical situation or representation.

These counts are diagnostic. A fluency fact can legitimately retain a stable
sentence structure, so repetition alone is not automatically a defect. It is a
defect when the repeated form omits required evidence, collapses difficulty or
representation, or prevents the child from demonstrating the named skill.

## Reproducible screenshot cases

The following screens were captured during the live review. They can be
reproduced in Grown-ups corner > Parent Test Lab.

| Evidence | Level and skill | Setting | Visible failure |
|---|---|---|---|
| S-01 | Level 1, MQ-001 | Easy, Forest | Describes two rows of acorns but shows no rows or acorns; asks a count-only question |
| S-02 | Level 11, MQ-066 | Easy, sample 1 | Says "Read the analogue clock" but displays no clock |
| S-03 | Level 21, MQ-124 | Easy, sample 1 | Says "Measure the shown angle" but displays no angle |
| S-04 | Level 6, MQ-034 | Easy, sample 1 | Route task displays coordinate answer cards but no grid or map |
| S-05 | Level 9, MQ-054 | Easy, sample 1 | Grade 1 data task is a long raw comma-separated response list rather than a display |
| S-06 | Level 7, MQ-042 | Easy, sample 1 | Four clock choices have different labels but identical 12:00 hands; no target clock is shown |

## Findings

### UXR-001 — MQ-001 is not a pairing task

Severity: P0

The prompt states the row count and uses that same count as the answer. There
is no pairing action, correspondence line, unmatched item, or comparison. The
manifest's `unmatchedMax` constraint is ignored.

Across the full corpus, MQ-001 produced 576 questions but only 12 prompts.
Every Forest question used "Match one acorns"; questions with count one also
said "There are 1." Generic distractors could exceed the declared maximum set
size.

This is an assessment-validity problem, not only a missing illustration.

### UXR-002 — Essential source visuals are absent or malformed

Severity: P0

Confirmed examples include:

- MQ-026: refers to a ten-frame but does not show one;
- MQ-034, MQ-053, MQ-071, MQ-089, MQ-125: route or coordinate tasks have no
  bounded grid, map, path, key, or plotted point;
- MQ-042: no target clock, and all four answer clocks render with identical
  12:00 hands;
- MQ-066 and MQ-086: ask the child to read an analogue clock but show none;
- MQ-069: some variants refer to a shown metric scale but show none;
- MQ-070: says "Look at the circle" without displaying the source circle;
- MQ-092: says to use a place-value chart but shows no chart;
- MQ-121: describes a composite shape without showing how the rectangles
  connect;
- MQ-122: says to use a unit-cube model, but the question surface has no such
  model;
- MQ-124: says to measure the shown angle, but no angle is shown.

Other illustrated choices falsely repeat one generic visual: MQ-017 can show
the same landmark scene for `on`, `under`, `in`, and `beside`; MQ-006, MQ-012,
and MQ-035 can show the same measurement bar for different relations; and
MQ-069 can show the same bar for different unit words. A generic picture must
not be presented as evidence that distinguishes the choices.

The system needs a distinction between a non-answer-bearing problem stimulus
and a worked teaching result.

### UXR-003 — Named construction objectives collapse into selection

Severity: P0

All MQ-001 through MQ-042 questions use selection. Serious objective/input
mismatches include MQ-001, MQ-007, MQ-008, MQ-011, MQ-013, MQ-014, MQ-015,
MQ-018, MQ-022, MQ-028, MQ-029, MQ-030, and MQ-036.

The child cannot currently pair, sort, move, split, deal, act out, build a
graph, write an equation, or partition a shape in these questions.

MQ-003, MQ-021, and MQ-035 also name comparison or explanation evidence that
the input does not collect.

### UXR-004 — Some prompts or pre-response models disclose the answer

Severity: P0

Prompt examples include:

- MQ-017: "The ball is in the box" before asking for the position word "in";
- MQ-046: states the number of covering blocks, then asks how many blocks long;
- MQ-058: prints a complete related fact containing the requested answer;
- MQ-063: states the equal-group fact containing the requested quotient.

On assisted Pictorial turns, result-bearing models can appear before the
response for MQ-015, MQ-026, MQ-030, MQ-031, MQ-034, MQ-042, MQ-047, MQ-051,
MQ-053, MQ-063, MQ-064, MQ-066, MQ-067, MQ-071, MQ-075, MQ-080, MQ-082,
MQ-086, MQ-089, MQ-093, MQ-094, MQ-098, MQ-099, MQ-100-order, MQ-104,
MQ-107-plan, MQ-109-order, MQ-110-order, MQ-114 through MQ-117, MQ-123, and
MQ-125.

These turns must not count as independent mastery evidence.

### UXR-005 — Operation representations do not show the claimed action

Severity: P0/P1

The generic arithmetic fallback shows two operand piles. It does not show
joining, removal, equal groups, sharing, array structure, or the named
strategy. Large quantities can become labels such as "N objects," which no
longer function as visual models.

Affected scopes include MQ-013, MQ-014, MQ-028, MQ-029, MQ-032, MQ-040,
MQ-041, MQ-045, MQ-049, MQ-059 through MQ-062, MQ-076 through MQ-079, MQ-095,
MQ-096, and MQ-113.

### UXR-006 — The fraction progression can become notation copying

Severity: P0

MQ-030, MQ-047, and MQ-064 state the relevant numerator and denominator rather
than asking the child to partition or mark an unlabeled shape or set. MQ-030
can offer nonsensical distractors such as `201`, `202`, and `203`.

Later fraction and decimal result models can disclose answers. MQ-098 can
label a strip as `2/4` while normalizing the picture to one half, creating a
picture/label disagreement.

Affected scopes include MQ-030, MQ-047, MQ-064, MQ-082, MQ-098, MQ-099,
MQ-104, and MQ-115 through MQ-117.

### UXR-007 — Route and coordinate objectives lack route evidence

Severity: P0

MQ-034, MQ-053, MQ-071, MQ-089, and MQ-125 need a bounded grid or map with a
visible start and meaningful landmarks or points. Current variants usually
repeat right-then-up movement, may offer invalid coordinates such as row zero,
and do not collect giving directions or describing a translation.

### UXR-008 — Some variants are ambiguous, incorrect, or unusable

Severity: P0

- MQ-027 can make the only numeric option automatically correct.
- MQ-030 can use non-fraction numeric distractors.
- MQ-088 can present both a square and a rectangle as correct for "has a right
  angle"; perpendicularity collapses into the same prompt.
- MQ-106 maps rotational order three to "full turn" and can request impossible
  square-symmetry line counts.
- MQ-121's composite-area control reads nonexistent top-level dimensions and
  can display "width undefined" and "height undefined."
- MQ-124 declares a plus-or-minus two-degree tolerance but uses exact grading;
  three options can lie inside the declared tolerance.

Affected variants should be removed from evidentiary play until they have a
unique, mathematically valid answer and usable control.

### UXR-009 — The runtime does not consistently enforce the manifest

Severity: P0/P1

Confirmed examples include:

- MQ-001 ignores `unmatchedMax`;
- MQ-032 does not represent its group and remainder constraints;
- MQ-043 declares four equations but produces one item;
- MQ-049 can exceed its operand maximum;
- MQ-059 exceeded `addendMax: 99` in 42 of 64 sampled hard cases;
- MQ-078 can generate quotients outside the named known-fact scope;
- MQ-088 does not honour varied orientation;
- MQ-095 does not present the required strategy choice.

The generator should either enforce the declared curriculum contract or fail
closed. Silently changing the meaning of the manifest undermines mastery data.

### UXR-010 — Representation, difficulty, and scenario variety collapse

Severity: P1

Concrete, Pictorial, and Abstract requests produced identical semantics at
every matched coordinate in the larger corpus. Easy and Hard were fully
identical in some skills. Theme changes usually replaced only one noun.

Examples of extreme repetition include:

- MQ-004: one AB-repeat prompt;
- MQ-006: one duration-comparison prompt;
- MQ-030: one fixed half prompt;
- MQ-042 and MQ-066: one clock prompt;
- MQ-051: one fixed coin-equivalence situation.

Generic late-level wrappers such as "The acorns team needs this answer for its
plan" add reading without supplying a mathematical situation.

### UXR-011 — Reading load, grammar, and pre-reader access need a system

Severity: P1

Repeated generated errors include:

- "Match one acorns";
- "There are 1";
- "Which object is lasts longer?";
- "Which object is holds more?";
- "How many more birds responses";
- "measuring pencil";
- "1 lines" and "1 are drawn";
- "1 kilograms";
- double punctuation such as `p.m..`.

The larger corpus found hundreds of occurrences in several of these families,
so isolated string edits will not be sufficient.

MQ-054 and MQ-072 can present long comma-separated response lists to Grade 1
and Grade 2 learners instead of a visual data display. Word-choice activities
also need spoken option labels or icon support for pre-readers; prompt speech
alone does not make the options independently accessible.

### UXR-012 — Existing audits do not test assessment meaning

Severity: P0 process gap

Current audits cover determinism, structural validity, option reachability,
self-grading, and some semantic signatures. They do not adequately assert:

- objective-to-input alignment;
- visible availability of every source stimulus;
- answer leakage before submission;
- generated grammar;
- meaningful Concrete/Pictorial/Abstract differentiation;
- difficulty separation;
- unique mathematical correctness;
- sample-key-to-answer consistency;
- task-type and specialized manifest-constraint coverage.

These checks should become release gates rather than relying only on manual
review.

### UXR-013 — Sample identity and grading can block mastery

Severity: P0

- MQ-004, MQ-030, and MQ-124 expose only two distinct sample keys even though
  the current selection-mastery rule requires three.
- MQ-069, MQ-094, MQ-098, MQ-100, MQ-106, MQ-109, MQ-110, and MQ-124 can reuse
  one sample key for multiple correct answers.
- MQ-124 reached as many as 30 answers for one key in the deterministic corpus.
- The angle renderer changes the visual endpoints 0 degrees and 180 degrees
  while grading the original exact values.

Sample identity must include the answer-bearing stimulus semantics, and every
skill must be proven capable of producing enough distinct valid witnesses for
its mastery rule.

## Parent decision register

Decisions will be presented one at a time in the project task using plain codes
such as `1A` and `1B`. Recommended options are marked below so the full
rationale is preserved without requiring all decisions at once.

### Decision 1 — MQ-001 objective

Parent decision: **1A approved on 2026-07-28.**

- **1A — Recommended:** Preserve one-to-one correspondence. Implement a
  touch/click pairing interaction with two visible collections, including equal
  sets and a permitted one-unmatched case.
- **1B:** Rewrite the curriculum objective and title as counting two equal
  sets. Do not claim that it assesses pairing.

### Decision 2 — Early construction evidence

Parent decision: **2A approved on 2026-07-28.**

- **2A — Recommended:** Require a direct construction/action task wherever the
  objective says pair, sort, move, split, deal, build, record, write, or
  partition.
- **2B:** Use selection as rehearsal, followed by a separate direct-action task
  before mastery can be earned.
- **2C:** Let adult-observed off-screen actions count as mastery evidence.

### Decision 3 — Stimulus and teaching-model separation

Parent decision: **3A approved on 2026-07-28.**

- **3A — Recommended:** Create separate `stimulus` and `workedResult`
  descriptors. Show only the non-answer-bearing stimulus before submission and
  reveal the worked result during help/feedback.
- **3B:** Remove teaching models from all assessed turns.
- **3C:** Keep model-first turns only as explicitly assisted, non-evidentiary
  teaching.

Option 3A can be combined with 3C as an interim safety rule.

### Decision 4 — Visual-representation floor

Parent decision: **4A approved on 2026-07-28.**

- **4A — Recommended:** Require real, non-answer-bearing visual stimuli for all
  representation-dependent questions and concrete/pictorial support through
  Level 7. Preserve authentic layout for clocks, dice, ten-frames, grids,
  graphs, coins, fraction regions, metric scales, angles, and cube layers.
- **4B:** Repair only prompts that explicitly refer to a missing visual.

### Decision 5 — Variety standard

Parent decision: **5A approved on 2026-07-28.**

- **5A — Recommended:** Require each concept/representation skill to cover its
  declared task types with at least three genuinely different situations and
  at least two meaningful representations before variants repeat. Fluency
  skills may retain a stable sentence when their mathematical range and
  difficulty genuinely change.
- **5B:** Keep numeric/theme substitution as the default and review variety
  manually per skill.

### Decision 6 — Manifest contract

Parent decision: **6A approved on 2026-07-28.**

- **6A — Recommended:** Make generation validate every declared constraint and
  fail closed when a valid question cannot be made.
- **6B:** Amend objectives and constraints to match the narrower tasks the
  current generator can produce.

### Decision 7 — Invalid variants during remediation

Parent decision: **7A approved on 2026-07-28.**

- **7A — Recommended:** Temporarily exclude mathematically ambiguous, broken,
  answer-leaking, or unanswerable variants from mastery and release claims
  until they pass semantic validation.
- **7B:** Leave them in Beta play with a prototype disclaimer.

### Decision 8 — Angle grading

Parent decision: **8A approved on 2026-07-28.**

- **8A — Recommended:** Use a direct degree-entry or protractor interaction and
  accept the declared plus-or-minus two-degree tolerance.
- **8B:** Use exact nearest-degree selection, guarantee one unique answer, and
  place every distractor outside the tolerance band.

### Decision 9 — Context and reading-load policy

Parent decision: **9A approved on 2026-07-28.**

- **9A — Recommended:** Remove generic theme wrappers unless the context
  changes the mathematics. Use short, grade-appropriate, operation-specific
  situations and visual displays for raw data.
- **9B:** Retain the current wrappers and themed noun substitution.

### Decision 10 — Flat versus spatial cube models

Parent decision: **10A approved on 2026-07-28.**

- **10A — Recommended:** Use an isometric or layered cube model for volume and
  let the child inspect/count layers.
- **10B:** Retain the flat dot grid and narrow the objective to array/product
  reasoning.

### Decision 11 — Perceptual and contextual bounds

Parent decision: **11A approved on 2026-07-28.**

- **11A — Recommended:** Add age-appropriate magnitude limits for concrete
  models, realistic bounds for contexts such as temperature, and explicit
  transitions to arrays/place value/symbolic reasoning when quantities become
  too large to perceive.
- **11B:** Keep the current curriculum maxima in every visual and narrative
  context.

### Decision 12 — New release gates

Parent decision: **12A approved on 2026-07-28.**

- **12A — Recommended:** Add automated curriculum-contract, visible-stimulus,
  answer-leak, grammar, unique-answer, sample-identity, difficulty,
  representation, and task-coverage tests, followed by independent
  adversarial review.
- **12B:** Rely on the existing structural audits and manual spot checks.

### Decision 13 — Representation-mode product claim

Parent decision: **13A approved on 2026-07-28.**

- **13A — Recommended:** Implement genuinely different Concrete, Pictorial,
  and Abstract stimuli and actions, with an intentional developmental
  progression.
- **13B:** Remove the representation selector/control and treat the field as
  internal metadata until distinct modes exist.

### Decision 14 — Mastery identity during repair

Parent decision: **14A approved on 2026-07-28.**

- **14A — Recommended:** Correct sample keys to include answer/stimulus
  identity and prove that every skill can generate enough distinct valid
  witnesses.
- **14B:** Exclude affected skills from mastery until their identity and
  witness reachability are repaired.

Decision 14B is the safe interim state and can be followed by 14A as the final
implementation.

## Level traceability

- Level 1, MQ-001–006: MQ-001 blocker; MQ-006 grammar and duration-context
  failure.
- Level 2, MQ-007–012: sorting, structured quantity, split/recombine, and
  measurement-action gaps.
- Level 3, MQ-013–018: operation-action, fair-dealing, position-language, and
  graph-construction gaps.
- Level 4, MQ-019–024: structured quantity, justification, and build-ten tasks
  are selection-only.
- Level 5, MQ-025–030: place-value undercoverage, invalid distractors,
  operation/equation mismatch, and fraction blocker.
- Level 6, MQ-031–036: numeral/model leak, grouping mismatch, missing route
  representation, measurement grammar, and completed graph.
- Level 7, MQ-037–042: comparison undercoverage, strategy mismatch, and broken
  clock choices.
- Level 8, MQ-043–048: missing four-equation evidence, sharing/model mismatch,
  direct measurement answer, and fraction/coin authenticity issues.
- Level 9, MQ-049–054: constraint violation, renamed-ten undercoverage,
  coin/route/graph issues.
- Level 10, MQ-055–060: ordering undercoverage, inverse-answer leak, bound
  failures, and generic operation models.
- Level 11, MQ-061–066: grouping, inverse, fraction, money, and missing-clock
  problems.
- Level 12, MQ-067–072: number-line answer leak, measurement language,
  text-heavy geometry, route, and graph gaps.
- Level 13, MQ-073–078: ordering/place-value/rounding leaks, generic operation
  models, and out-of-scope division facts.
- Level 14, MQ-079–084: multiplication, remainder, and model issues.
- Level 15, MQ-085–090: money/time/perimeter issues, shape ambiguity, and route
  failure.
- Level 16, MQ-091–096: ordering/place-value/rounding/strategy coverage
  failures.
- Level 17, MQ-097–102: missing explanation evidence, fraction-render
  disagreement, result leaks, and one-step-only money.
- Level 18, MQ-103–108: growth overload, fraction result leak, symmetry errors,
  graph-scale leak, and text-only chance apparatus.
- Level 19, MQ-109–114: implausible integer contexts, result leaks, missing
  plausibility evidence, factor gap, and generic division models.
- Level 20, MQ-115–120: result leaks, raw-cent context, missing expression
  writing, and missing unit choice.
- Level 21, MQ-121–126: broken composite-area control, time result leak,
  punctuation, angle tolerance conflict, and coordinate-grid absence.

## Recommended remediation order

1. Apply Decision 7's safety gate so invalid variants cannot affect mastery.
2. Resolve Decisions 1 through 4 and redesign the shared stimulus/interaction
   architecture.
3. Enforce the manifest and mathematical-uniqueness contracts.
4. Rebuild affected families in dependency order, beginning with Levels 1–7.
5. Apply variety, language, reading-load, and perceptual-range policies.
6. Add the new automated release gates.
7. Repeat the all-level browser review, the deterministic corpus audit, and
   independent adversarial reviews before the next public beta.

## 2026-08-03 current-worktree supplement

Status: deterministic full-curriculum review complete; approved remediation
implemented with focused checks passing; current rendered-browser,
physical-device, and frozen-candidate certification evidence pending

This supplement is the authoritative decision record for the full-coverage
review requested on 2026-08-03. The review exercised 72,576 deterministic
questions: 126 skills, two tiers, three representations, three themes, and 32
ordinals. The reviewed engine SHA-256 was
`859960d278e014138b36bdef3b4ff25ad1ee9445560903281322b10899bd8c23`.

The deterministic corpus produced no generator exception, but structural
validity did not establish learner validity. Confirmed defects included:

- answer-bearing Replay, pre-response speech, semantic-model labels, or control
  labels in 5,040 questions across ten skills;
- inaccessible or unresolved worked Help, including all sampled number-bond
  teaching states;
- invalid distractor semantics in MQ-027, disclosed coin values in MQ-048,
  incorrect task identity in MQ-058, and incorrect or ignored symmetry geometry
  in MQ-106;
- objective-to-response mismatches in MQ-003, MQ-021, MQ-031, MQ-035, MQ-063,
  MQ-071, MQ-079, MQ-095, MQ-097, and MQ-101;
- systematic learner-facing grammar defects; and
- test assertions that encoded answer disclosure or could not detect lost
  method reachability, partial clipping, duplicate announcements, or omitted
  skill/viewport coverage.

The supplied iPhone evidence was traced exactly to the Beta 1 glyph-stripping
renderer. A retained Beta 1 document has no path into the newer update UI, and
the current worker does not navigate an already-loaded legacy client. The exact
reason that document remained active on the photographed iPhone is unproven.

No compatible rendered browser was connected during this supplement. Therefore
current screenshots, speech quality, VoiceOver/NVDA behavior, iPad landscape,
Safari zoom, split-view, keyboard-overlap, Switch Control, and physical-device
verdicts remain pending. This supplement is not release certification and did
not run the complete release gauntlet.

### Approved finish line

The approved remediation is implemented only when the real child-facing paths
reflect the decisions below, every confirmed defect has an effect-sensitive
regression, and the affected focused suites pass. Visual automation must cover
the honest reachable-state matrix and remain ready for the missing real-browser
and physical-device evidence. Formal completion still requires the single
complete gauntlet against a later exact frozen candidate immediately before
publication.

### Decisions 15–24

The owner approved all recommended options on 2026-08-03 as the compact set
`15A 16A 17A 18A 19C 20A 21A 22A 23A 24A`.

- **Decision 15 / ADJ-01 — A:** MQ-040 must distinguish count-on, make-ten, and
  known-bond strategy task types and mastery witnesses.
- **Decision 16 / ADJ-02 — A:** MQ-041 must collect or directly construct the
  named subtraction strategy and distinguish its witness.
- **Decision 17 / ADJ-03 — A:** MQ-078 mastery variants must remain within the
  approved known-multiplication-fact range; extended derived-fact reasoning is
  separate.
- **Decision 18 / ADJ-04 — A:** MQ-097 subtraction remains nonnegative until the
  integer prerequisite has been introduced.
- **Decision 19 / ADJ-05 — C:** renderer-capable and generated/release-reachable
  input-method sets must be separately declared and protected by non-circular
  tests; dormant methods are neither silently supported nor silently removed.
- **Decision 20 / ADJ-06 — A:** full coverage means every reachable skill/task
  obligation at every allowed tier and representation, in every applicable
  production mode and required viewport; impossible combinations are excluded
  only by explicit rules.
- **Decision 21 / ADJ-07 — A:** automated learner geometry includes 1180×820 and
  1024×768 iPad-landscape rows. Selected physical iPad evidence remains pending
  until it is actually observed and is never converted into an automated pass.
- **Decision 22 / ADJ-08 — A:** Help is hidden or disabled outside question and
  reteach phases.
- **Decision 23 / ADJ-09 — A:** feedback uses one deliberate focused
  announcement path and an announcement-count protocol replaces assertions that
  merely require multiple announcement mechanisms.
- **Decision 24 / ADJ-10 — A:** after a newer exact worker is verified and
  activated, only non-responsive legacy Math Quest clients are automatically
  navigated to the current entry page with progress preserved and recovery copy
  shown. Beta 2 and newer clients retain safe-boundary update behavior.

### Resolved legal-design constraint for MQ-048

Authentic Royal Canadian Mint coin images and designs are not open-source or
public-domain and require reproduction permission, so they are not imported.
On 2026-08-03 the owner approved replacing the authentic-face recognition claim
with five clearly original practice-token designs mapped to Canadian money
values. MQ-048 must therefore name that narrower practice-token objective,
show no denomination in its pre-response stimulus, use only first-party CSS
geometry, and reveal the value only in the answer choices or worked support.

The final deterministic contract is manifest-driven. MQ-048 declares only the
truthfully rendered pictorial phase (`P`) and `pictures-and-symbols`
representation. Its five token-to-value mappings are five separate required
task types. Every question presents all five money-value choices, so the
presence of a choice cannot reveal the answer, and SOLID mastery requires a
clean witness for all five declared mappings. An invented Concrete or Abstract
witness is outside the manifest phase and cannot count toward mastery.

The 2026-08-03 Beta 4 candidate now places a separate, resumable five-token
visual guide before a child's first real MQ-048 question, including the first
scheduled review of a placement-inferred skill with no stored evidence. The
guide shows each original token beside its governed value, exposes no answer
control, and advances through the existing Ready action to the unchanged
answer-free question. The guide itself records no attempt. The subsequent
question retains the ordinary mastery contract, and later sessions do not
repeat the guide after real evidence exists.

Focused effect-sensitive checks prove the single frozen token/value authority,
all five visible and spoken mappings, preview/re-teach/capstone isolation, the
guide-to-question transition, unchanged evidence classification, and exact
save/export/reload of the physical-phase checkpoint. Those deterministic
checks cannot establish that a pre-reader understands the new presentation.
Rendered first-screen geometry, keyboard/focus operation, Replay order, and a
targeted child/grown-up comprehension verdict therefore remain pending before
this current-worktree correction can be treated as release-certified.
