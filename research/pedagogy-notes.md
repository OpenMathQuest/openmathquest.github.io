# Math Quest — Pedagogy and Interaction Notes

These notes explain how the independently authored manifest becomes a
pre-reader-friendly learning experience. The manifest, not this document,
defines the ordered skill journey.

## Manifest-first teaching

Each skill record declares its objective, prerequisites, gateway or supporting
role, generator family, representations, and Concrete–Pictorial–Abstract
phases. Runtime queues and progress views derive level and stage information
from those records.

Prerequisites determine readiness. A later skill can remain visible on the
journey map while unavailable for evidence until its prerequisites are solid.
This keeps the route understandable without presenting notation before its
meaning is established.

## Concrete, Pictorial, and Abstract progression

- **Concrete:** the child acts directly on individually visible on-screen
  objects. The action and stopping point are part of the playable task.
- **Pictorial:** the child interprets or builds a representation by marking,
  placing, partitioning, arranging, or labelling it. Looking at an
  answer-revealing diagram is not an equivalent interaction.
- **Abstract:** the child works with numerals, operation signs, mathematical
  language, or exact entry after the symbols have been linked to meaning.

The manifest determines whether an on-screen action is Concrete or Pictorial
from its semantic purpose, not from whether a hand touches glass. Off-screen
construction and grown-up acknowledgement never gate an assessed question.
Physical-object play can remain an optional grown-up-led extension, but it
does not block play or add evidence. Teaching, hints, worked models, and
re-teaching are always non-evidentiary.

## Representation families

Reuse a small set of semantically honest model families:

- object sets, sorting mats, and attribute cards;
- five-frames, ten-frames, and counters;
- number bonds and part–part–whole diagrams;
- open and labelled number lines;
- base-ten and place-value models;
- equal groups and arrays;
- fraction regions, fraction strips, and fraction number lines;
- bar models that preserve quantity scale and unknown locations;
- rulers, balances, containers, unit grids, clocks, and money models;
- shape, angle, coordinate, area, surface, and volume models; and
- tables, plots, and chance displays.

A model descriptor must express the question's actual quantities and
relationships. It must not print the correct answer as a fallback, silently
change an operation, omit a compared quantity, or use decorative theme art as
mathematical evidence.

## Pre-reader and co-play design

Every early activity is completable without reading:

- speak the world choice, prompt, options, feedback, and stopping choices with
  a local voice;
- give every spoken line a replay button;
- use distinct pictures when the child is choosing which question to try;
- keep question content visually separate from decoration;
- use a stable screen order of prompt, answers, Confirm, and optional Help;
- let Help expand in place without pushing Confirm out of the first desktop
  viewport when a compact truthful layout is possible; and
- preserve the same semantic order on narrow screens even when vertical
  scrolling is unavoidable.

Essential controls are explicit buttons. Early targets should be at least
64 × 64 CSS pixels and later targets at least 48 × 48. Child-facing text is at
least 18 px; all other visible text is at least 16 px. Shape, symbol, coin, and
clock details must be visibly larger than the minimum text floor.

## Question and answer integrity

A question may have two options when it asks the child to choose directly
between two named candidates. Extra unrelated choices can obscure the
mathematical comparison. Such reduced choices are non-evidentiary unless a
future audited evidence rule explicitly supports them.

Every selection set must be distinct under the actual grader and have exactly
one correct choice. Construction questions must expose the interaction the
skill claims to test: placing counters, completing a bond, marking a number
line, building a bar, entering a number, or entering an exact fraction or
mixed number. Parent Test must render the same interaction family as child
play.

Use exact integer, decimal, and fraction reasoning. Fraction acceptance and
simplest-form requirements are skill-specific; option generation must not
create two mathematically equivalent correct answers.

## Feedback and re-teaching

Feedback classes are:

- `FIRST_TRY_CLEAN`: correct on the first submitted answer, with no hint and no
  deliberate selection change;
- `CORRECT_WITH_STRUGGLE`: correct after a hint or deliberate change; and
- `INCORRECT`: the first submitted answer is not correct.

Response latency never changes these classes. Use warm process or observation
language, not scores, prizes, comparative praise, fixed-trait labels, or the
word “wrong.”

After a miss, show the declared representation and ask the child to reconstruct
one meaningful step. When chronic re-teaching triggers, demonstrate a complete
model, then invite an active copy with changed values before returning to an
unscaffolded item.

## Spacing and mastery

The play-day schedule uses local calendar days with a monotonic
`maxSeenPlayDay`. Clock rollback cannot create an extra mastery day, move due
dates backward, or reset a daily cap. The interval sequence is
`1, 1, 2, 4, 7, 12` days and schedules from the day the review actually occurs.

Only the day's first scheduled cold test controls spacing. Early new skills
receive a separated same-session second exposure, which never advances
spacing. Missed days carry no penalty.

Mastery witnesses require clean first attempts on distinct play days with
distinct samples. Normal mastery uses three construction days, or four days
when a counted witness is a guess-prone selection. Fast track may reduce only
the day floor. Every applicable witness set must still include target
difficulty, a model interaction, and applied use.

An incorrect scheduled review demotes a solid skill while preserving its
history. Level re-teaching and gateway pull-back direct attention to the
relevant prerequisite rather than erasing a whole level.

## Sessions, fatigue, and stopping

Sessions mix overdue review, gateway review, other due work, and eligible new
skills. An active re-teach is finished before an ordinary stop. The capstone
always remains non-evidentiary.

Time, idle behavior, and rising latency can offer “one more, or done?” They do
not change mastery or feedback. Replay and active manipulation time are
excluded from response latency. A grown-up practice cap, time cap, manual stop,
fatigue stop, and daily cap each retain a distinct audited reason.

## Accessibility

Support touch, mouse, keyboard, and switch-style activation. Use native button
semantics, visible focus, predictable focus return, logical order, strong
contrast, and restrained live announcements. Do not rely on colour alone,
hover, fine pointer precision, or drag-and-drop as the only construction path.

Respect reduced motion, avoid time-critical animation, and keep speech replay
outside evidence timing. Test the same child path at desktop, phone, and tablet
viewports with zoom and larger text.

## Canadian examples

Use metric units as the ordinary context. Use current Canadian coin values
with clear, sufficiently large visual differences. Label a customary-unit
activity as an extension. Localization changes the story and objects, not the
mathematical relationship or mastery requirement.
