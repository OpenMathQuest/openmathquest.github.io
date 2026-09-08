const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const ART_QUESTION_SHELL_ACTION_ORDER = Object.freeze(["replay", "tutorial", "stop"]);
const ART_QUESTION_SHELL_MINIMUM_TARGET_PX = 44;
export const ART_QUESTION_ZONE_NARROW_MAX_PX = 1023;
const ART_EARLY_COUNTING_RENDERER_FAMILY = "ART-MIG-06-EARLY-COUNTING";
const ART_EARLY_FRAME_RENDERER_FAMILY = "ART-MIG-06-TEN-FRAME";
const ART_EARLY_FRAME_CELL_INDEXES = Object.freeze(Array.from({ length: 20 }, (_, index) => index));
const ART_EARLY_FRAME_CELL_POSITIONS = Object.freeze([
  ...Array.from({ length: 10 }, (_, index) => index + 1),
  ...Array.from({ length: 10 }, (_, index) => index + 1),
]);
export const ART_QUESTION_SHELL_RAIL_LABELS = Object.freeze({
  replay: "Replay",
  tutorial: "? Show me how",
  stop: "Grown-up: stop",
});

function numericValues(value) {
  if (Array.isArray(value)) return value.flatMap(numericValues);
  if (value && typeof value === "object") return Object.values(value).flatMap(numericValues);
  return typeof value === "number" ? [value] : [];
}

function appendTargetIssues(snapshot, describeTarget, issues, checkContent = false) {
  for (const target of snapshot.targets || []) {
    if (target.width < ART_QUESTION_SHELL_MINIMUM_TARGET_PX || target.height < ART_QUESTION_SHELL_MINIMUM_TARGET_PX) issues.push(`${describeTarget(target)} target is below ${ART_QUESTION_SHELL_MINIMUM_TARGET_PX}px`);
    if (checkContent && (target.scrollWidth > target.clientWidth || target.scrollHeight > target.clientHeight)) issues.push(`${describeTarget(target)} content overflows its target`);
  }
}

function horizontalOverflow(scrollWidth, clientWidth) {
  return (scrollWidth || 0) > (clientWidth || 0) + 1;
}

function containsScroller(values) {
  return values.some((value) => ["auto", "scroll"].includes(value));
}

function appendShellIdentityIssues(snapshot, issues) {
  if (snapshot.questionCount !== 1) issues.push(`question-shell count is ${snapshot.questionCount}; expected 1`);
  if (snapshot.railCount !== 1) issues.push(`instrument-rail count is ${snapshot.railCount}; expected 1`);
  for (const action of ART_QUESTION_SHELL_ACTION_ORDER) {
    if (snapshot.actionCounts?.[action] !== 1) issues.push(`${action} action count is ${snapshot.actionCounts?.[action]}; expected 1`);
  }
}

function appendShellDomOrderIssues(snapshot, issues) {
  if (!snapshot.questionBeforeRail) issues.push("question-shell must precede the instrument rail in DOM order");
  if (!Number.isInteger(snapshot.responseControlCount) || snapshot.responseControlCount < 1) issues.push("question shell has no operable response control before Confirm");
  if (!snapshot.responseRegionBeforeConfirm || !snapshot.responseControlsBeforeConfirm) issues.push("every child response control must precede Confirm in DOM order");
  if (!snapshot.confirmBeforeRail) issues.push("Confirm must precede the instrument rail in DOM order");
  if (!same(snapshot.railActionOrder, ART_QUESTION_SHELL_ACTION_ORDER)) issues.push("instrument-rail action order is not replay, tutorial, stop");
}

function appendRailPresentationIssues(snapshot, issues) {
  for (const action of ART_QUESTION_SHELL_ACTION_ORDER) {
    const label = snapshot.railLabels?.find((record) => record.action === action);
    if (label?.visibleText !== ART_QUESTION_SHELL_RAIL_LABELS[action]) issues.push(`${action} visible label is not exact`);
  }
  if (!snapshot.railVisible) issues.push("instrument rail is hidden at a governed viewport");
}

function appendShellNavigationIssues(snapshot, issues) {
  if (snapshot.cssOrder?.question !== 0 || snapshot.cssOrder?.rail !== 0) issues.push("CSS order repositions the question shell or instrument rail");
  if (numericValues(snapshot.controlCssOrders).some((value) => value !== 0)) issues.push("CSS order repositions an answer, Confirm, or rail control");
  if (snapshot.controlTabIndexes?.response?.length !== snapshot.responseControlCount) issues.push("response-control tab-order evidence is incomplete");
  if (numericValues(snapshot.controlTabIndexes).some((value) => value !== 0)) issues.push("positive or removed tab order changes the governed control sequence");
}

function appendShellGeometryIssues(snapshot, issues) {
  if (horizontalOverflow(snapshot.documentScrollWidth, snapshot.viewportWidth)) issues.push("question shell introduces horizontal document overflow");
  if (containsScroller([snapshot.questionOverflowX, snapshot.questionOverflowY])) issues.push("question shell creates a nested scroller");
  if ((snapshot.questionRailOverlapArea || 0) > 0) issues.push("instrument rail overlaps the mathematical question surface");
}

export function artQuestionShellIssues(snapshot) {
  const issues = [];
  if (!snapshot || typeof snapshot !== "object") return Object.freeze(["question-shell snapshot is missing"]);
  appendShellIdentityIssues(snapshot, issues);
  appendShellDomOrderIssues(snapshot, issues);
  appendRailPresentationIssues(snapshot, issues);
  appendShellNavigationIssues(snapshot, issues);
  appendTargetIssues(snapshot, (target) => target.action, issues, true);
  appendShellGeometryIssues(snapshot, issues);
  return Object.freeze(issues);
}

function appendZoneContentIssues(snapshot, issues) {
  if (snapshot.layoutCount !== 1) issues.push(`question-zone layout count is ${snapshot.layoutCount}; expected 1`);
  if (snapshot.observationCount !== 1) issues.push(`observation-zone count is ${snapshot.observationCount}; expected 1`);
  if (snapshot.constructionCount !== 1) issues.push(`construction-zone count is ${snapshot.constructionCount}; expected 1`);
  if (!snapshot.observationBeforeConstruction) issues.push("observation zone must precede construction zone in DOM order");
  if (!snapshot.promptInObservation) issues.push("the prompt must remain in the observation zone");
  if (snapshot.staticStimulusCount !== snapshot.staticStimulusInObservationCount) issues.push("every static answer-free stimulus must remain in the observation zone");
  if (snapshot.referenceSupportCount !== snapshot.referenceSupportInObservationCount) issues.push("every reteach support block must remain in the observation zone");
  if (snapshot.workedReferenceCount !== snapshot.workedReferenceInObservationCount) issues.push("every worked reference model must remain in the observation zone");
}

function appendConstructionOrderIssues(snapshot, issues) {
  if (!snapshot.responseInConstruction) issues.push("the response region must remain in the construction zone");
  if (!snapshot.confirmInConstruction) issues.push("Confirm must remain in the construction zone");
  if (!snapshot.responseBeforeConfirm) issues.push("response controls must precede Confirm in DOM order");
  if (!snapshot.confirmBeforeRail) issues.push("Confirm must precede the instrument rail in DOM order");
  if (!Number.isInteger(snapshot.responseControlCount) || snapshot.responseControlCount < 1) issues.push("construction zone has no operable response control");
}

function appendZoneDiscoveryIssues(snapshot, issues) {
  if (!snapshot.firstResponseDiscoverable) issues.push("the first response control is not visibly contained in the construction zone");
  if (snapshot.requiresFirstScreenResponse && !snapshot.firstResponseOnFirstScreen) issues.push("the first response control is not discoverable on the first screen");
  if (snapshot.requiresFirstScreenTutorial && !snapshot.tutorialActionOnFirstScreen) issues.push("the tutorial action is not discoverable on the first screen");
  if (numericValues(snapshot.cssOrders).some((value) => value !== 0)) issues.push("CSS order repositions a governed zone or response control");
  if (numericValues(snapshot.tabIndexes).some((value) => value !== 0)) issues.push("tab order removes or positively reorders a governed response control");
}

function appendZoneGeometryIssues(snapshot, issues) {
  if ((snapshot.zoneOverlapArea || 0) > 0) issues.push("observation and construction zones overlap");
  if (snapshot.expectedLayout === "STACKED" && !snapshot.stacked) issues.push("governed narrow viewport does not stack observation before construction");
  if (snapshot.expectedLayout === "PAIRED" && !snapshot.paired) issues.push("governed wide selection viewport does not pair readable zones");
  if (snapshot.observationBorderStyle === snapshot.constructionBorderStyle) issues.push("zones are distinguished by colour alone");
  if (snapshot.observationBackground === snapshot.constructionBackground) issues.push("observation and construction surfaces are not visually distinct");
}

function appendZoneOverflowIssues(snapshot, issues) {
  if (horizontalOverflow(snapshot.documentScrollWidth, snapshot.viewportWidth)) issues.push("question zones introduce horizontal document overflow");
  if (horizontalOverflow(snapshot.zoneScrollWidth, snapshot.zoneClientWidth)) issues.push("question zones introduce horizontal internal overflow");
  if (containsScroller([
    snapshot.supportScrollOverflowX, snapshot.supportScrollOverflowY, snapshot.layoutOverflowX, snapshot.layoutOverflowY,
    snapshot.observationOverflowX, snapshot.observationOverflowY, snapshot.constructionOverflowX, snapshot.constructionOverflowY,
  ])) issues.push("question zones create a nested scroller");
  if ((snapshot.supportScrollWidth || 0) > (snapshot.supportClientWidth || 0)
      || (snapshot.supportScrollHeight || 0) > (snapshot.supportClientHeight || 0)) issues.push("question-zone support wrapper clips or scrolls its content");
}

export function artQuestionZoneIssues(snapshot) {
  const issues = [];
  if (!snapshot || typeof snapshot !== "object") return Object.freeze(["question-zone snapshot is missing"]);
  appendZoneContentIssues(snapshot, issues);
  appendConstructionOrderIssues(snapshot, issues);
  appendZoneDiscoveryIssues(snapshot, issues);
  appendZoneGeometryIssues(snapshot, issues);
  appendZoneOverflowIssues(snapshot, issues);
  appendTargetIssues(snapshot, (target) => target.action, issues, true);
  return Object.freeze(issues);
}

function appendCountingIdentityIssues(snapshot, issues) {
  if (snapshot.skillId !== "MQ-002" || snapshot.inputMethod !== "COUNT_TOUCH" || snapshot.semanticPromptStringId !== "question.countSet") issues.push("early-counting identity is not the governed MQ-002 COUNT_TOUCH count-set family");
  if (snapshot.rendererFamily !== ART_EARLY_COUNTING_RENDERER_FAMILY) issues.push("early-counting renderer-family marker is missing or incorrect");
}

function appendCountingOracleIssues(snapshot, issues) {
  if (!Number.isInteger(snapshot.objectOracle) || snapshot.objectOracle < 0 || snapshot.objectCount !== snapshot.objectOracle) issues.push("rendered object count does not equal the question-owned oracle");
  if (new Set(snapshot.objectIds || []).size !== snapshot.objectCount) issues.push("rendered counting objects do not have one unique response id each");
  if (!same(snapshot.numberBank, snapshot.expectedNumberBank)) issues.push("number bank does not equal the question-owned bounded choice sequence");
}

function appendCountingResponseIssues(snapshot, issues) {
  if (snapshot.touchedCount !== snapshot.expectedTouchedCount) issues.push("counted-state cardinality does not equal the exercised response state");
  if (snapshot.expectedTouchedCount > 0 && (!snapshot.countedHasGeometricCheckCue || !snapshot.countedHasVisibleTextCue || !snapshot.countedHasAccessibleCue)) issues.push("counted state depends on colour instead of a CSS-drawn check, text, and accessible-state cues");
  if (snapshot.answerDisclosureCount !== 0) issues.push("early-counting response state discloses the answer before submission");
  if (!snapshot.confirmDisabled) issues.push("incomplete early-counting response enables Confirm");
}

function appendEarlyViewportIssues(snapshot, family, issues) {
  if (!snapshot.firstResponseOnFirstScreen) issues.push(`first ${family} response is not visible on the first screen`);
  if (snapshot.horizontalDocumentOverflow || snapshot.nestedQuestionScroll) issues.push(`${family} renderer introduces horizontal or nested question scrolling`);
}

export function artEarlyCountingIssues(snapshot) {
  const issues = [];
  if (!snapshot || typeof snapshot !== "object") return Object.freeze(["early-counting snapshot is missing"]);
  appendCountingIdentityIssues(snapshot, issues);
  appendCountingOracleIssues(snapshot, issues);
  appendCountingResponseIssues(snapshot, issues);
  appendEarlyViewportIssues(snapshot, "early-counting", issues);
  appendTargetIssues(snapshot, (target) => `early-counting ${target.kind}`, issues);
  return Object.freeze(issues);
}

function appendFrameIdentityIssues(snapshot, issues) {
  if (snapshot.skillId !== "MQ-026" || snapshot.inputMethod !== "TEN_FRAME" || snapshot.semanticPromptStringId !== "question.teenBuild" || snapshot.taskType !== "see-ten-inside-teen-numbers") issues.push("early-frame identity is not the governed MQ-026 TEN_FRAME teen-number family");
  if (snapshot.rendererFamily !== ART_EARLY_FRAME_RENDERER_FAMILY) issues.push("early-frame renderer-family marker is missing or incorrect");
  if (!Number.isInteger(snapshot.answerOracle) || snapshot.answerOracle < 11 || snapshot.answerOracle > 19) issues.push("early-frame answer oracle is outside the governed teen-number domain");
}

function appendFrameStructureIssues(snapshot, issues) {
  if (snapshot.declaredCellCount !== 20 || snapshot.frameCount !== 2 || !same(snapshot.frameCapacities, [10, 10]) || !same(snapshot.cellsPerFrame, [10, 10])) issues.push("early-frame must expose exactly two ten-cell frames");
  if (!same(snapshot.frameIndexes, [0, 1]) || !same(snapshot.cellIndexes, ART_EARLY_FRAME_CELL_INDEXES) || !same(snapshot.cellPositions, ART_EARLY_FRAME_CELL_POSITIONS)) issues.push("early-frame data-owned frame or cell order drifted");
  if (!snapshot.fiveByTwoStructure) issues.push("each early frame must retain an exact five-by-two geometry");
}

function appendFrameResponseIssues(snapshot, issues) {
  if (snapshot.pressedCount !== snapshot.expectedPressedCount) issues.push("early-frame pressed-state cardinality does not equal the exercised response state");
  const expectedResponseValue = snapshot.expectedPressedCount > 0 ? String(snapshot.expectedPressedCount) : "";
  if (snapshot.responseValue !== expectedResponseValue) issues.push("early-frame saved numeric response does not equal the pressed-cell count");
  if (snapshot.expectedPressedCount > 0 && (!snapshot.filledHasCssCounterCue || !snapshot.filledHasCentrePipCue || !snapshot.filledHasAccessibleCue)) issues.push("filled early-frame state depends on colour instead of CSS counter geometry, a centre pip, and accessible pressed state");
  if (snapshot.answerDisclosureCount !== 0) issues.push("early-frame response discloses the target answer before submission");
  if (snapshot.confirmDisabled !== (snapshot.expectedPressedCount === 0)) issues.push("early-frame Confirm availability does not match response completeness");
}

export function artEarlyFrameIssues(snapshot) {
  const issues = [];
  if (!snapshot || typeof snapshot !== "object") return Object.freeze(["early-frame snapshot is missing"]);
  appendFrameIdentityIssues(snapshot, issues);
  appendFrameStructureIssues(snapshot, issues);
  appendFrameResponseIssues(snapshot, issues);
  appendEarlyViewportIssues(snapshot, "early-frame", issues);
  appendTargetIssues(snapshot, () => "early-frame cell", issues);
  return Object.freeze(issues);
}
