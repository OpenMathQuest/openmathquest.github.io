import assert from "node:assert/strict";
import test from "node:test";

import { artQuestionShellIssues, artQuestionZoneIssues } from "../lib/art-question-shell.mjs";

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

const validZones = () => ({
  layoutCount: 1,
  observationCount: 1,
  constructionCount: 1,
  observationBeforeConstruction: true,
  promptInObservation: true,
  staticStimulusCount: 1,
  staticStimulusInObservationCount: 1,
  referenceSupportCount: 1,
  referenceSupportInObservationCount: 1,
  workedReferenceCount: 1,
  workedReferenceInObservationCount: 1,
  responseInConstruction: true,
  confirmInConstruction: true,
  responseBeforeConfirm: true,
  confirmBeforeRail: true,
  responseControlCount: 2,
  firstResponseDiscoverable: true,
  requiresFirstScreenResponse: true,
  firstResponseOnFirstScreen: true,
  requiresFirstScreenTutorial: true,
  tutorialActionOnFirstScreen: true,
  cssOrders: { observation: 0, construction: 0, response: [0, 0], confirm: 0 },
  tabIndexes: { response: [0, 0], confirm: 0 },
  zoneOverlapArea: 0,
  expectedLayout: "STACKED",
  stacked: true,
  paired: false,
  observationBorderStyle: "solid",
  constructionBorderStyle: "dashed",
  observationBackground: "rgb(255, 253, 247)",
  constructionBackground: "rgb(228, 240, 233)",
  documentScrollWidth: 390,
  viewportWidth: 390,
  zoneScrollWidth: 340,
  zoneClientWidth: 340,
  supportScrollWidth: 340,
  supportClientWidth: 340,
  supportScrollHeight: 480,
  supportClientHeight: 480,
  supportScrollOverflowX: "visible",
  supportScrollOverflowY: "visible",
  layoutOverflowX: "visible",
  layoutOverflowY: "visible",
  observationOverflowX: "visible",
  observationOverflowY: "visible",
  constructionOverflowX: "visible",
  constructionOverflowY: "visible",
  targets: [
    { action: "answer", width: 80, height: 64, clientWidth: 76, scrollWidth: 76, clientHeight: 60, scrollHeight: 60 },
    { action: "confirm", width: 180, height: 52, clientWidth: 176, scrollWidth: 176, clientHeight: 48, scrollHeight: 48 },
  ],
});

test("ART-MIG-05 question-zone oracle accepts static observation before stacked construction", () => {
  assert.deepEqual(artQuestionZoneIssues(validZones()), []);
  const paired = validZones();
  paired.expectedLayout = "PAIRED";
  paired.stacked = false;
  paired.paired = true;
  assert.deepEqual(artQuestionZoneIssues(paired), []);
});

test("[NC-ART-QUESTION-ZONES-SEMANTIC-GEOMETRY] missing, reversed, misplaced, compressed, overlapping, scrolling, and colour-only zones fail closed", () => {
  const mutants = [
    (value) => { value.observationCount = 0; },
    (value) => { value.constructionCount = 2; },
    (value) => { value.observationBeforeConstruction = false; },
    (value) => { value.promptInObservation = false; },
    (value) => { value.staticStimulusInObservationCount = 0; },
    (value) => { value.referenceSupportInObservationCount = 0; },
    (value) => { value.workedReferenceInObservationCount = 0; },
    (value) => { value.responseInConstruction = false; },
    (value) => { value.confirmInConstruction = false; },
    (value) => { value.responseBeforeConfirm = false; },
    (value) => { value.firstResponseDiscoverable = false; },
    (value) => { value.firstResponseOnFirstScreen = false; },
    (value) => { value.tutorialActionOnFirstScreen = false; },
    (value) => { value.cssOrders.construction = -1; },
    (value) => { value.tabIndexes.response[0] = -1; },
    (value) => { value.zoneOverlapArea = 10; },
    (value) => { value.stacked = false; },
    (value) => { value.expectedLayout = "PAIRED"; value.stacked = false; value.paired = false; },
    (value) => { value.constructionBorderStyle = value.observationBorderStyle; },
    (value) => { value.constructionBackground = value.observationBackground; },
    (value) => { value.documentScrollWidth = 430; },
    (value) => { value.zoneScrollWidth = 360; },
    (value) => { value.supportScrollHeight = value.supportClientHeight + 1; },
    (value) => { value.supportScrollOverflowY = "auto"; },
    (value) => { value.constructionOverflowY = "auto"; },
    (value) => { value.targets[0].height = 30; },
    (value) => { value.targets[1].scrollWidth = value.targets[1].clientWidth + 1; },
  ];
  for (const [index, mutate] of mutants.entries()) {
    const snapshot = validZones();
    mutate(snapshot);
    assert.notDeepEqual(artQuestionZoneIssues(snapshot), [], `zone mutant ${index + 1} escaped`);
  }
});
