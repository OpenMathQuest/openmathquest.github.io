# Math Quest Free Play pilot contract

Status: implementation work finished; exact child strings owner-approved;
focused independent reviews cleared. The change remains formally incomplete
until a new immutable versioned release candidate passes the single final
pre-publication certification cycle.

The independent review disposition is recorded in
`docs/testing/math-quest-free-play-review-2026-07-30.md`. The exact owner
wording gate is recorded in
`docs/release/child-string-approval-candidate-2026-07-30.md`.

## Scope

The pilot adds a secondary **Math Quest Free Play** route from Home. It contains:

- **Play Solo**;
- **Family Play Together**;
- **Many Ways, Same Amount**; and
- **Balance Bay**.

Regular learning remains the primary Home action. Playground play is optional,
untimed, unscored, and non-evidentiary. The pilot does not replace or extend
the mandatory session-closing capstone. Capstone integration is deferred until
standalone duration, comprehension, and stopping-agency evidence exists.

## Introduction and unlock contract

For this pilot, a skill is introduced only when its acquisition state is
`PRACTISING` or `SOLID`. This means the child has completed at least one
ordinary evidentiary question for that exact skill.

The following do not unlock Playground content:

- opening or abandoning a first teaching screen (`LEARNING`);
- Parent Test;
- level preview;
- starting-point placement (`PLACED`);
- Playground activity; or
- merely reaching a level.

Each activity and representation tier is mapped to exact manifest skill IDs.
The pilot mappings are:

| Activity or tool | Exact prerequisite | Pilot range |
| --- | --- | --- |
| Many Ways: object-set construction | `MQ-010` | 0–5 |
| Many Ways: two non-empty parts | `MQ-011` | wholes 2–5 |
| Many Ways: numeral/collection range extension | `MQ-019` | 0–10 |
| Many Ways: five-frame source | `MQ-020` | 1–5 |
| Many Ways: two-part range extension | `MQ-023` | wholes 6–10 |
| Balance Bay | both `MQ-021` and `MQ-023` | unit weights, totals 3–10 |

The pilot contains no symbolic equations, equality sign, arbitrary
expressions, fractions, decimals, money, points, prizes, streaks, or timers.

## Interaction contract

### Play Solo

The game supplies a starting amount. The child constructs the same amount in
a different representation and deliberately checks it. Undo is always
available. Incorrect checks retain the construction and provide neutral
too-few or too-many guidance.

### Family Play Together

The Maker chooses a starting amount. An explicit **End turn** action leads to
a handoff screen. The next person deliberately chooses **Ready**, becomes the
Builder, and constructs the same amount in a different way. Roles reverse on
the next round. A single activation cannot both end one turn and act in the
next.

The visible roles are **Child’s turn** and **Grown-up’s turn**. Both roles make
a consequential mathematical choice. There is no winner, correction role, or
speed reward.

### Many Ways, Same Amount

The source and construction use different semantic representation families.
For the pilot these are numerals, object sets, five-frame sources, and
two-part constructions. Colour, theme, object identity, or rearrangement alone
does not count as a different representation.

### Balance Bay

The scene uses explicitly declared unit values, not differently sized objects
whose physical mass could be misleading. One side shows the target as 1-unit
weights; the child builds the same total from 1-unit and 2-unit weights and
must use at least one 2-unit weight so the construction is genuinely
different. The scene does not reveal same/needs-more/has-extra before
**Check**. Before `MQ-044`, it uses no relational glyph. After checking,
static text and icons communicate the comparison; motion and colour are never
required.

## Isolation, privacy, and lifecycle

Playground state exists only in the page adapter’s transient memory. It:

- is not included in `activeSession`;
- is not written to local storage;
- does not advance the curriculum seed;
- makes no network request;
- stores no identifier, analytics, result, engagement record, or hidden
  mastery proxy; and
- disappears safely on reload or exit.

The entire exported learning state must be byte-for-byte identical before and
after every standalone Playground journey. A paused ordinary session remains
unchanged. PWA activation and reload are not allowed to use Playground as a
safe update boundary.

## Accessibility and layout

- All actions use native buttons and work by touch, mouse, keyboard, and
  sequential switch activation.
- No drag, multi-touch, held gesture, hover, or timed input is required.
- Early child targets are at least 64 by 64 CSS pixels and child text is at
  least 18 CSS pixels.
- Focus order is heading, role/goal, construction, status, actions.
- Every Playground screen exposes Replay. It describes the activity, current
  role, exact visible amount or construction, and next action. Automatic
  speech remains off by default.
- Reduced motion leaves every mathematical and turn state understandable.
- Core controls must fit without document scrolling at 1366×768, 820×1180,
  and 390×844. At 320-pixel reflow, natural vertical scrolling is preferable
  to shrinking text or targets.

## Clean-room boundary

The pilot is independently specified from abstract mathematics. It does not
use cards, decks, suits, polka-dot identity, captured pairs, copied commercial
rules, source examples, source artwork, or source layout. All visuals are
first-party HTML, CSS, and inline SVG already governed by Math Quest’s
provenance controls.

## Deferred work

- Optional post-session or capstone integration.
- Fractions, decimals, money, expressions, and other later tiers.
- Persistent cosmetic Playground state.
- Any evidentiary version of a construction task.

Each deferred expansion requires an explicit manifest mapping, child-content
review, effect-sensitive regression coverage, and the complete release gate.
