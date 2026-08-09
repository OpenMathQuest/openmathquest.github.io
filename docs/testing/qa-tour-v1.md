# Private QA Test Tour v1

## Purpose

The private QA Test Tour gives the project owner a fixed set of 50 questions
chosen for broad, high-value visual and interaction coverage. It is an adult
review tool, not a child activity, assessment, preview, or source of learning
evidence.

The exact entry parameter is:

`?qa-tour=qa-tour-v1`

No ordinary game, grown-up, Parent Test Lab, or child-facing control links to
that address. An exact parameter match opens a separate **Grown-ups only**
confirmation screen before any test question appears. Cancel removes the
parameter from the visible address. This is a discoverability barrier, not an
authentication or security claim.

## Fixed-set contract

- The ordered set contains exactly 50 unique skills and remains unchanged for
  the life of `qa-tour-v1`.
- It spans all 21 levels, all six curriculum strands, all 26 generator
  profiles, and all 32 input methods reachable from shipped questions.
  The adapter can also render `NUMBER_BOND` and `NUMBER_CHOICE`, but no shipped
  manifest/generator path emits them. They are tracked separately as two
  renderer-capable-only methods and are not misreported as tour omissions.
- Every item binds its skill, deterministic ordinal, declared input method,
  hard/target tier, pictorial representation, forest theme, and tour seed.
- The generated input method must equal the declared method. A mismatch stops
  review and report creation.
- Previous may revisit an item, but the set cannot rotate until the owner has
  submitted this version's report and requests a separately versioned set.

## Isolation and privacy

Opening, reviewing, navigating, hiding, sharing, downloading, or leaving the
tour must not change the Math Quest progress bytes, placement draft, mastery,
evidence, spacing, sessions, logs, settings, child-name record, or daily
counts. The tour compares the live progress record with its opening bytes
before accepting each review and again before report creation. A read failure
or byte difference blocks continuation and submission.

Notes and snapshots exist only in the current browser tab until the grown-up
explicitly submits them. Math Quest performs no automatic upload. Submission
uses the device's local file share sheet when the grown-up selects one, with a
local JSON download as fallback. Math Quest never selects a recipient.

The closed report schema excludes:

- child name and child progress;
- save or placement-draft bytes;
- IP address, site origin, and raw user-agent text;
- accounts, analytics, advertising identifiers, and tracking data.

It includes only categorical browser/form-factor information, viewport and
input-capability facts needed to reproduce a visual issue, exact deterministic
question data, optional grown-up notes, and a visual snapshot for every item
that has either a flag or a nonblank note.

## Review behavior

Each question supports the real isolated Parent Test Lab controls. The grown-up
may test the answer and keep the resulting visible feedback before recording a
finding. **Review and continue** waits for the finding snapshot to finish; it
cannot race to the next question. Snapshot, fixture, storage, or report-schema
failure leaves the item unreviewed and provides a retryable explanation.

All 50 items must be reviewed before **Submit your notes** appears. Leaving an
unfinished, unsubmitted tour requires a second explicit Exit action. The
report is accepted for delivery only when all exact fixture identities,
reviewed flags, required snapshots, privacy fields, and progress-isolation
checks pass.

## Certification

Focused development checks must protect the hidden confirmation, exact
manifest coverage, deterministic generation, interaction wiring, awaited
snapshot behavior, report schema, private file delivery, and zero progress
mutation. Representative real-browser checks must cover desktop and phone
rendering. The fixed set is a risk-based human tour, not an exhaustive visual
Cartesian product: exhaustive automation covers every reachable generated
state, while impossible skill/method/mode combinations are named and excluded.
The feature remains formally incomplete until it is included in an immutable
release candidate that passes the final complete certification gate.
