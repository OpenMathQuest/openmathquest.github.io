import assert from "node:assert/strict";
import test from "node:test";

import { artEarlyCountingIssues, artEarlyFrameIssues, artQuestionShellIssues, artQuestionZoneIssues } from "../lib/art-question-shell.mjs";

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

const validEarlyCounting = () => ({
  skillId: "MQ-002",
  inputMethod: "COUNT_TOUCH",
  semanticPromptStringId: "question.countSet",
  rendererFamily: "ART-MIG-06-EARLY-COUNTING",
  objectOracle: 3,
  objectCount: 3,
  objectIds: ["i0", "i1", "i2"],
  numberBank: [0, 1, 2, 3],
  expectedNumberBank: [0, 1, 2, 3],
  touchedCount: 1,
  expectedTouchedCount: 1,
  countedHasGeometricCheckCue: true,
  countedHasVisibleTextCue: true,
  countedHasAccessibleCue: true,
  answerDisclosureCount: 0,
  confirmDisabled: true,
  firstResponseOnFirstScreen: true,
  horizontalDocumentOverflow: false,
  nestedQuestionScroll: false,
  targets: [
    { kind: "object", width: 82, height: 84 },
    { kind: "number", width: 56, height: 56 },
  ],
});

test("ART-MIG-06 early-counting oracle accepts the exact data-owned COUNT_TOUCH renderer with redundant counted cues", () => {
  assert.deepEqual(artEarlyCountingIssues(validEarlyCounting()), []);
});

test("[NC-ART-EARLY-COUNTING-SEMANTICS-STATE-GEOMETRY] retargeting, count drift, answer disclosure, colour-only state, and undersized controls fail closed", () => {
  const mutants = [
    (value) => { value.skillId = "MQ-003"; },
    (value) => { value.rendererFamily = "ART-MIG-06-TEN-FRAME"; },
    (value) => { value.objectCount = 2; },
    (value) => { value.objectIds[2] = "i1"; },
    (value) => { value.numberBank = [0, 1, 3]; },
    (value) => { value.touchedCount = 0; },
    (value) => { value.countedHasGeometricCheckCue = false; },
    (value) => { value.countedHasVisibleTextCue = false; },
    (value) => { value.countedHasAccessibleCue = false; },
    (value) => { value.answerDisclosureCount = 1; },
    (value) => { value.confirmDisabled = false; },
    (value) => { value.firstResponseOnFirstScreen = false; },
    (value) => { value.horizontalDocumentOverflow = true; },
    (value) => { value.nestedQuestionScroll = true; },
    (value) => { value.targets[0].height = 30; },
  ];
  for (const [index, mutate] of mutants.entries()) {
    const snapshot = validEarlyCounting();
    mutate(snapshot);
    assert.notDeepEqual(artEarlyCountingIssues(snapshot), [], `early-counting mutant ${index + 1} escaped`);
  }
});

const validEarlyFrame = () => ({
  skillId: "MQ-026",
  inputMethod: "TEN_FRAME",
  semanticPromptStringId: "question.teenBuild",
  taskType: "see-ten-inside-teen-numbers",
  rendererFamily: "ART-MIG-06-TEN-FRAME",
  answerOracle: 15,
  declaredCellCount: 20,
  frameCount: 2,
  frameCapacities: [10, 10],
  cellsPerFrame: [10, 10],
  frameIndexes: [0, 1],
  cellIndexes: Array.from({ length: 20 }, (_, index) => index),
  cellPositions: [...Array.from({ length: 10 }, (_, index) => index + 1), ...Array.from({ length: 10 }, (_, index) => index + 1)],
  fiveByTwoStructure: true,
  pressedCount: 12,
  expectedPressedCount: 12,
  responseValue: "12",
  filledHasCssCounterCue: true,
  filledHasCentrePipCue: true,
  filledHasAccessibleCue: true,
  answerDisclosureCount: 0,
  confirmDisabled: false,
  firstResponseOnFirstScreen: true,
  horizontalDocumentOverflow: false,
  nestedQuestionScroll: false,
  targets: [{ width: 44, height: 44 }],
});

test("ART-MIG-06 early-frame oracle accepts the exact MQ-026 two-frame construction with redundant filled cues", () => {
  assert.deepEqual(artEarlyFrameIssues(validEarlyFrame()), []);
});

test("[NC-ART-EARLY-FRAME-IDENTITY-STRUCTURE-STATE-GEOMETRY] retargeting, frame drift, response drift, answer disclosure, colour-only state, and undersized cells fail closed", () => {
  const mutants = [
    (value) => { value.skillId = "MQ-023"; },
    (value) => { value.inputMethod = "PICTURE_CHOICE"; },
    (value) => { value.semanticPromptStringId = "question.frameNumber"; },
    (value) => { value.taskType = "build-and-break-ten"; },
    (value) => { value.rendererFamily = "ART-MIG-06-EARLY-COUNTING"; },
    (value) => { value.answerOracle = 20; },
    (value) => { value.declaredCellCount = 10; },
    (value) => { value.frameCount = 1; },
    (value) => { value.frameCapacities[1] = 9; },
    (value) => { value.cellsPerFrame[0] = 9; },
    (value) => { value.frameIndexes.reverse(); },
    (value) => { value.cellIndexes[19] = 18; },
    (value) => { value.cellPositions[10] = 10; },
    (value) => { value.fiveByTwoStructure = false; },
    (value) => { value.pressedCount = 11; },
    (value) => { value.responseValue = "11"; },
    (value) => { value.filledHasCssCounterCue = false; },
    (value) => { value.filledHasCentrePipCue = false; },
    (value) => { value.filledHasAccessibleCue = false; },
    (value) => { value.answerDisclosureCount = 1; },
    (value) => { value.confirmDisabled = true; },
    (value) => { value.firstResponseOnFirstScreen = false; },
    (value) => { value.horizontalDocumentOverflow = true; },
    (value) => { value.nestedQuestionScroll = true; },
    (value) => { value.targets[0].width = 43; },
  ];
  for (const [index, mutate] of mutants.entries()) {
    const snapshot = validEarlyFrame();
    mutate(snapshot);
    assert.notDeepEqual(artEarlyFrameIssues(snapshot), [], `early-frame mutant ${index + 1} escaped`);
  }
});
