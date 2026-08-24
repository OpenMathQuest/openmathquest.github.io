import assert from "node:assert/strict";
import test from "node:test";

import { artQuestionShellIssues } from "../lib/art-question-shell.mjs";

const valid = () => ({
  questionCount: 1,
  railCount: 1,
  actionCounts: { replay: 1, tutorial: 1, stop: 1 },
  questionBeforeRail: true,
  responseControlCount: 2,
  responseRegionBeforeConfirm: true,
  responseControlsBeforeConfirm: true,
  confirmBeforeRail: true,
  railActionOrder: ["replay", "tutorial", "stop"],
  railLabels: [
    { action: "replay", visibleText: "Replay" },
    { action: "tutorial", visibleText: "? Show me how" },
    { action: "stop", visibleText: "Grown-up: stop" },
  ],
  railVisible: true,
  cssOrder: { question: 0, rail: 0 },
  controlCssOrders: { answerRegion: 0, response: [0, 0], confirmContainer: 0, confirm: 0, rail: [0, 0, 0] },
  controlTabIndexes: { response: [0, 0], confirm: 0, rail: [0, 0, 0] },
  targets: [
    { action: "replay", width: 80, height: 52, clientWidth: 76, scrollWidth: 76, clientHeight: 48, scrollHeight: 48 },
    { action: "tutorial", width: 100, height: 52, clientWidth: 96, scrollWidth: 96, clientHeight: 48, scrollHeight: 48 },
    { action: "stop", width: 80, height: 52, clientWidth: 76, scrollWidth: 76, clientHeight: 48, scrollHeight: 48 },
  ],
  documentScrollWidth: 390,
  viewportWidth: 390,
  questionOverflowX: "visible",
  questionOverflowY: "visible",
  questionRailOverlapArea: 0,
});

test("ART-MIG-04 question-shell oracle accepts the single naturally ordered responsive rail", () => {
  assert.deepEqual(artQuestionShellIssues(valid()), []);
});

test("[NC-ART-QUESTION-SHELL-ORDER-DUPLICATION] duplicated, reordered, hidden, undersized, and overflowing shell states fail closed", () => {
  const mutants = [
    (value) => { value.actionCounts.replay = 2; },
    (value) => { value.responseControlsBeforeConfirm = false; },
    (value) => { value.confirmBeforeRail = false; },
    (value) => { value.railActionOrder = ["tutorial", "replay", "stop"]; },
    (value) => { value.controlCssOrders.confirmContainer = -1; },
    (value) => { value.controlCssOrders.rail[0] = 2; },
    (value) => { value.controlTabIndexes.response[0] = -1; },
    (value) => { value.controlTabIndexes.rail[1] = 3; },
    (value) => { value.railLabels[2].visibleText = "Stop"; },
    (value) => { value.railVisible = false; },
    (value) => { value.targets[0].width = 30; },
    (value) => { value.targets[0].scrollWidth = value.targets[0].clientWidth + 1; },
    (value) => { value.documentScrollWidth = 430; },
    (value) => { value.questionOverflowY = "auto"; },
    (value) => { value.questionRailOverlapArea = 12; },
    (value) => { value.cssOrder.rail = -1; },
  ];
  for (const mutate of mutants) {
    const snapshot = valid();
    mutate(snapshot);
    assert.notDeepEqual(artQuestionShellIssues(snapshot), []);
  }
});
