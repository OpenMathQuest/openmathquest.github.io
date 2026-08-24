const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export const ART_QUESTION_SHELL_ACTION_ORDER = Object.freeze(["replay", "tutorial", "stop"]);
export const ART_QUESTION_SHELL_MINIMUM_TARGET_PX = 44;
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

export function artQuestionShellIssues(snapshot) {
  const issues = [];
  if (!snapshot || typeof snapshot !== "object") return Object.freeze(["question-shell snapshot is missing"]);
  if (snapshot.questionCount !== 1) issues.push(`question-shell count is ${snapshot.questionCount}; expected 1`);
  if (snapshot.railCount !== 1) issues.push(`instrument-rail count is ${snapshot.railCount}; expected 1`);
  for (const action of ART_QUESTION_SHELL_ACTION_ORDER) {
    if (snapshot.actionCounts?.[action] !== 1) issues.push(`${action} action count is ${snapshot.actionCounts?.[action]}; expected 1`);
  }
  if (!snapshot.questionBeforeRail) issues.push("question-shell must precede the instrument rail in DOM order");
  if (!Number.isInteger(snapshot.responseControlCount) || snapshot.responseControlCount < 1) issues.push("question shell has no operable response control before Confirm");
  if (!snapshot.responseRegionBeforeConfirm || !snapshot.responseControlsBeforeConfirm) issues.push("every child response control must precede Confirm in DOM order");
  if (!snapshot.confirmBeforeRail) issues.push("Confirm must precede the instrument rail in DOM order");
  if (!same(snapshot.railActionOrder, ART_QUESTION_SHELL_ACTION_ORDER)) issues.push("instrument-rail action order is not replay, tutorial, stop");
  for (const action of ART_QUESTION_SHELL_ACTION_ORDER) {
    const label = snapshot.railLabels?.find((record) => record.action === action);
    if (label?.visibleText !== ART_QUESTION_SHELL_RAIL_LABELS[action]) issues.push(`${action} visible label is not exact`);
  }
  if (!snapshot.railVisible) issues.push("instrument rail is hidden at a governed viewport");
  if (snapshot.cssOrder?.question !== 0 || snapshot.cssOrder?.rail !== 0) issues.push("CSS order repositions the question shell or instrument rail");
  if (numericValues(snapshot.controlCssOrders).some((value) => value !== 0)) issues.push("CSS order repositions an answer, Confirm, or rail control");
  if (snapshot.controlTabIndexes?.response?.length !== snapshot.responseControlCount) issues.push("response-control tab-order evidence is incomplete");
  if (numericValues(snapshot.controlTabIndexes).some((value) => value !== 0)) issues.push("positive or removed tab order changes the governed control sequence");
  for (const target of snapshot.targets || []) {
    if (target.width < ART_QUESTION_SHELL_MINIMUM_TARGET_PX || target.height < ART_QUESTION_SHELL_MINIMUM_TARGET_PX) issues.push(`${target.action} target is below ${ART_QUESTION_SHELL_MINIMUM_TARGET_PX}px`);
    if (target.scrollWidth > target.clientWidth || target.scrollHeight > target.clientHeight) issues.push(`${target.action} content overflows its target`);
  }
  if ((snapshot.documentScrollWidth || 0) > (snapshot.viewportWidth || 0) + 1) issues.push("question shell introduces horizontal document overflow");
  if (["auto", "scroll"].includes(snapshot.questionOverflowX) || ["auto", "scroll"].includes(snapshot.questionOverflowY)) issues.push("question shell creates a nested scroller");
  if ((snapshot.questionRailOverlapArea || 0) > 0) issues.push("instrument rail overlaps the mathematical question surface");
  return Object.freeze(issues);
}
