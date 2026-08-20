# Child-string approval candidate — updated 2026-08-20

Canonicalization: `child-strings-v1`
Complete table: 441 records
Current candidate SHA-256: `a7d942177f0b9097dee92a4ffe2028bd6db359015742d0a57fe095df00a86e3e`
Current engine SHA-256: `26e75cd042fee62ba01a3fb1608b2b847ae6b0b8ade5e6b09d26cc37b461c871`
Extraction validation errors: 0

Owner decision: **Approved on 2026-08-20**

The current 441-record candidate retains the complete owner-approved 407-record
table unchanged and adds 34 exact tutorial and visual-clarity records. The
project owner approved this complete candidate and exact SHA-256 on
2026-08-20.

## Approved visual-clarity wording

| ID | Exact text |
|---|---|
| `ui.tutorialPhaseNotice` | Notice — Step 1 of 3 |
| `ui.tutorialPhasePlan` | Plan — Step 2 of 3 |
| `ui.tutorialPhaseCheck` | Check — Step 3 of 3 |
| `ui.selected` | Selected |
| `model.arrayRow` | Row {row}: {count} |

The `{row}` and `{count}` slots are positive integers. These records make the
tutorial phase, selected state, and bounded array rows legible without relying
on colour or layout alone.

## Approved different-example tutorial wording

| ID | Exact text |
|---|---|
| `ui.practiceExample` | Practice example |
| `ui.yourQuestion` | Your question |
| `ui.tutorialNext` | Next step |
| `ui.tutorialPrevious` | Previous step |
| `ui.tutorialBack` | Back to your question |
| `ui.tutorialOffer` | Would a different example help? |
| `ui.tutorialStep` | Step {step} of 3 |
| `ui.tutorialUnavailable` | This practice example is unavailable. Go back to your question. |
| `tutorial.notice.choose` | Notice what the question asks you to choose. |
| `tutorial.plan.choose` | Compare one choice at a time using the same rule. |
| `tutorial.check.choose` | Check that the choice matches the rule. |
| `tutorial.notice.count` | Notice the start, the order, and what must come next. |
| `tutorial.plan.count` | Mark each object, number, or move once. |
| `tutorial.check.count` | Check the count or position from the start. |
| `tutorial.notice.spatial` | Notice the parts, positions, labels, and scale. |
| `tutorial.plan.spatial` | Build one part at a time without skipping or overlapping. |
| `tutorial.check.spatial` | Check every part against the whole model. |
| `tutorial.notice.groups` | Notice the total, the groups, and the unit. |
| `tutorial.plan.groups` | Keep the groups equal and the unit the same. |
| `tutorial.check.groups` | Combine the groups and check the total. |
| `tutorial.notice.operations` | Notice the operation, the known parts, and the unknown part. |
| `tutorial.plan.operations` | Use one step at a time and keep each place or side aligned. |
| `tutorial.check.operations` | Use the model or inverse operation to check the result. |
| `tutorial.notice.parts` | Notice the whole, the known part, and the missing part. |
| `tutorial.plan.parts` | Keep equal shares the same size and connect the model to the number. |
| `tutorial.check.parts` | Put the parts together and check the whole. |
| `tutorial.notice.measure` | Notice the zero point, unit, and interval. |
| `tutorial.plan.measure` | Read the instrument first, then calculate if needed. |
| `tutorial.check.measure` | Check the unit and count every interval once. |

The `{step}` slot is restricted to integers 1 through 3. Every other new
record has no runtime slot.

## Approved 407-record table from 2026-08-13

The owner approved the complete prior 407-record candidate and exact SHA-256
`956dc30c2b8a58a5d15d6c1c5face5629e5e5cc038150447b849fcaa2dc09b4a`.
It retained the strategy-construction and Free Play wording, added ten exact
screen-native activity records, and revised one existing counting prompt for
the approved group-count activity.

## Approved screen-native activity wording and accessible names

| ID | Exact text |
|---|---|
| `aria.objectGroup` | Objects in the group: {items}. |
| `aria.patternSequence` | Pattern, from left to right: {items}. |
| `aria.tenFrameCells` | Ten-frame cells, from left to right: {cells}. |
| `aria.hiddenFrame` | Ten-cell frame. Showing: {items}. The remaining cells are covered. |
| `aria.numberCards` | Number cards: {items}. |
| `question.frameNumber` | Which number matches the frame? |
| `question.makeTenFrame` | The frame shows {counterText}. How many more make ten? |
| `question.numberLeast` | Which number is least: {a}, {b}, or {c}? |
| `question.hiddenPart` | A frame holds ten counters. You can see {counterText}. How many are hidden? |
| `question.patternVisualNext` | What comes next in the pattern? |
| `question.countSet` | How many {noun} are in this group? |

The ten new records extend the prior 397-record table. `question.countSet`
already existed and is the one revised record.

The prior 68-record strategy-construction addition remains approved below.

## Approved strategy-construction instructions and accessible names

| ID | Exact text |
|---|---|
| `strategy.chooseAny` | Choose a method and show its steps. |
| `strategy.useExact` | Use this exact method. |
| `strategy.begin` | Choose the shown method to begin. |
| `strategy.result` | Result |
| `strategy.resultAria` | Result after completing the method |
| `strategy.numberLineLead` | {method}: start at {start}. Make every one-step jump in order. |
| `strategy.numberLineAria` | Number-line landing points |
| `strategy.landOn` | Land on {value} |
| `strategy.jumpStatus` | {done} of {total} jumps made. |
| `strategy.jumpLandedStatus` | {done} of {total} jumps made. Landed on {value}. |
| `strategy.undoJump` | Undo last jump |
| `strategy.undoStep` | Undo last step |
| `strategy.stepLegend` | Step {number}: {label} |
| `strategy.workStatus` | {done} of {total} method steps complete |
| `strategy.step.jump` | Jump {number} |
| `strategy.step.fillTen` | Counters that fill the ten-frame |
| `strategy.step.leftAfterTen` | Counters left after making ten |
| `strategy.step.knownPart` | Known part |
| `strategy.step.missingPart` | Missing part |
| `strategy.step.firstPart` | First part |
| `strategy.step.secondPart` | Second part |
| `strategy.step.rows` | Rows |
| `strategy.step.eachRow` | In each row |
| `strategy.step.tensPart` | Tens part |
| `strategy.step.onesPart` | Ones part |
| `strategy.step.tensPartial` | Tens partial product |
| `strategy.step.onesPartial` | Ones partial product |
| `strategy.step.onesProduct` | Ones product before regrouping |
| `strategy.step.carryTens` | Carry to the tens |
| `strategy.step.tensTotal` | Tens total with the carry |
| `strategy.step.afterAdd` | After adding {amount} |
| `strategy.step.afterSubtract` | After subtracting {amount} |
| `strategy.step.columnTotal` | Column total from the right |
| `strategy.step.finalCarry` | Final carry |
| `strategy.step.regroup` | Regroup this column? |
| `strategy.step.columnDifference` | Column difference from the right |
| `strategy.step.firstParity` | First number is |
| `strategy.step.secondParity` | Second number is |
| `strategy.method.countOn` | Count on |
| `strategy.method.countBack` | Count back |
| `strategy.method.countUp` | Count up |
| `strategy.method.makeTen` | Make ten |
| `strategy.method.knownBond` | Use a known bond |
| `strategy.method.array` | Build an array |
| `strategy.method.partition` | Partition the two-digit factor |
| `strategy.method.writtenLayout` | Use a written layout |
| `strategy.method.mental` | Mental place-value steps |
| `strategy.method.written` | Written column steps |
| `strategy.method.parity` | Prove the parity rule |
| `strategy.method.subtraction` | Use subtraction |
| `strategy.tenFrameAria` | Ten-frame with {count} counters filled |
| `strategy.bondAria` | Number bond construction |
| `strategy.arrayAria` | Array with {rows} rows and {columns} in each row |
| `strategy.action.countOn` | Count on |
| `strategy.action.countBack` | Count back |
| `strategy.action.countUp` | Count up |
| `strategy.action.makeTen` | Make ten |
| `strategy.action.knownBond` | Known bond |
| `strategy.action.partition` | Partition |
| `strategy.action.array` | Array |
| `strategy.action.writtenLayout` | Written layout |
| `strategy.action.mental` | Mental |
| `strategy.action.written` | Written |
| `strategy.action.evenFactor` | An even factor makes an even product |
| `strategy.action.oddFactors` | Two odd factors make an odd product |
| `strategy.action.sameParity` | Same-parity numbers give an even result |
| `strategy.action.differentParity` | Different-parity numbers give an odd result |
| `strategy.action.subtraction` | Use subtraction |

## Prior approved 329-record table

The owner approved the prior 329-record candidate, SHA-256
`438d726a3d19e7ec8b19603be8ac2f7de72372867011a7d045b0015a68bf0020`, on
2026-07-30. Relative to that approved table, 328 exact records remain unchanged
and one record changed as part of the approved original-practice-token
remediation:

| ID | Exact current text |
|---|---|
| `question.coinValue` | Which Canadian money value does this practice token stand for? |

The owner approved that exact revised sentence on 2026-08-03. The complete
revised 329-record table was therefore locked to SHA-256
`0d59e16f43860e8972dd9448980045c007b94d26edfe476dd073139b5c115cc7`.

The following 53 exact records remain the unchanged Math Quest Free Play
addition. Braced names are governed runtime slots, not unreviewed prose.

## Visible labels and instructions

| ID | Exact text |
|---|---|
| `ui.playground` | Math Quest Free Play |
| `ui.playSolo` | Play Solo |
| `ui.familyPlay` | Family Play Together |
| `ui.balanceBay` | Balance Bay |
| `ui.manyWays` | Many Ways, Same Amount |
| `ui.playgroundIntro` | Choose how you want to play. |
| `ui.chooseActivity` | Choose a game. |
| `ui.grownNearby` | A grown-up stays nearby. |
| `ui.childTurn` | Child’s turn |
| `ui.grownTurn` | Grown-up’s turn |
| `instruction.manyWays` | Build the same amount in a different way. |
| `instruction.balanceBay` | Make both sides weigh the same. |
| `ui.undo` | Undo |
| `ui.check` | Check |
| `ui.endTurn` | End turn |
| `ui.ready` | Ready |
| `ui.passDevice` | Pass the device to the next builder. |
| `ui.buildAnother` | Build another |
| `ui.addOne` | Add 1 |
| `ui.addTwo` | Add 2 |
| `ui.leftPart` | First part |
| `ui.rightPart` | Second part |
| `ui.makeAmount` | Choose the amount to build. |
| `ui.buildAmount` | Now build that amount. |
| `ui.backPlayground` | Back to Free Play |
| `ui.youBuilt` | You built {amount}. |
| `ui.oneBuilder` | One builder |
| `ui.takeTurns` | Take turns |
| `ui.units` | {amount} units |
| `ui.backGames` | Back to games |

## Feedback

| ID | Exact text |
|---|---|
| `feedback.playCorrect` | That matches. |
| `feedback.playTry` | Not the same amount yet. |
| `feedback.tooFew` | Add some more. |
| `feedback.tooMany` | Take some away. |
| `feedback.sameAmount` | Same amount. |
| `feedback.needsMore` | This side needs more. |
| `feedback.hasExtra` | This side has extra. |
| `feedback.differentWay` | Use at least one 2-unit weight. |
| `feedback.playStopped` | Free Play stopped because the learning save changed. No Free Play result was recorded. |
| `feedback.playUnavailable` | That Free Play game is not available yet. |

## Speech and accessible names

| ID | Exact text |
|---|---|
| `aria.fiveFrame` | {amount} in a five-frame. |
| `aria.counterAdd` | Add counter {position}. |
| `aria.counterRemove` | Remove counter {position}. |
| `aria.unitWeight` | {amount}-unit weight. |
| `aria.startingSide` | Starting side: {amount} units. |
| `aria.builtSide` | Built side: {amount} units. |
| `speech.target` | Target {amount}. |
| `speech.parts` | First part {left}. Second part {right}. You built {amount}. |
| `aria.partRemove` | {label}. Remove one. |
| `aria.partAdd` | {label}. Add one. |
| `aria.partValue` | {label}: {amount}. |
| `speech.targetChoices` | The choices are {choices}. |
| `aria.balanceUnchecked` | Not compared yet. |

Each approval binds its complete canonical table and digest, not merely the
display order in this review document. The owner's 2026-08-20 decision applies
to the complete 441-record candidate and exact candidate SHA-256 at the top of
this file.
