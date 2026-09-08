const STYLE_PROPERTIES = Object.freeze([
  "display", "visibility", "order", "overflowX", "overflowY", "borderTopStyle",
  "backgroundColor", "content", "backgroundImage", "width", "height", "borderStyle",
  "borderLeftWidth", "borderRightWidth", "borderTopWidth", "borderBottomWidth",
]);

// Capture scoped DOM facts together; the host-side projections do not query or
// mutate the page. Missing nodes remain explicit empty observations.
async function observeArtDom(page, queries, { relations = [], includeSavedUi = false } = {}) {
  return page.evaluate(({ queries, relations, styleProperties, includeSavedUi }) => {
    const nodes = { document: [document] };
    for (const { id, scope = "document", selector, closest = false } of queries) {
      const root = nodes[scope][0];
      if (!root) nodes[id] = [];
      else if (closest) nodes[id] = [root.closest(selector)].filter(Boolean);
      else nodes[id] = [...root.querySelectorAll(selector)];
    }
    const readStyle = (element, pseudo = null) => {
      const style = getComputedStyle(element, pseudo);
      return Object.fromEntries(styleProperties.map((property) => [property, style[property]]));
    };
    const readNode = (element, index, { pseudos, texts, parentGroup }) => ({
      index,
      attributes: Object.fromEntries(element.getAttributeNames().map((name) => [name, element.getAttribute(name)])),
      dataset: { ...element.dataset },
      bounds: element.getBoundingClientRect().toJSON(),
      style: readStyle(element),
      pseudos: Object.fromEntries(pseudos.map((pseudo) => [pseudo, readStyle(element, pseudo)])),
      texts: Object.fromEntries(texts.map((selector) => [selector, element.querySelector(selector)?.textContent])),
      parentIndex: parentGroup ? nodes[parentGroup].indexOf(element.parentElement) : -1,
      hidden: element.hidden,
      disabled: element.disabled,
      tabIndex: element.tabIndex,
      innerText: element.innerText,
      textContent: element.textContent,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    });
    const compare = ({ from, to, kind }) => {
      const target = nodes[to][0];
      return nodes[from].map((element) => {
        if (!target) return false;
        if (kind === "inside") return target.contains(element);
        return Boolean(element.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
    };
    const observations = Object.fromEntries(queries.map(({ id, pseudos = [], texts = [], parentGroup = null }) => [
      id, nodes[id].map((element, index) => readNode(element, index, { pseudos, texts, parentGroup })),
    ]));
    const readSavedUi = () => {
      if (!includeSavedUi) return null;
      const saved = JSON.parse(localStorage.getItem(window.MathQuestEngine.CONSTANTS.STORAGE_NAMESPACE) || "null");
      return saved?.activeSession?.uiState || null;
    };
    return {
      observations,
      relations: Object.fromEntries(relations.map((relation) => [relation.id, compare(relation)])),
      savedUi: readSavedUi(),
      viewport: { width: innerWidth, height: innerHeight },
      document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
    };
  }, { queries, relations, styleProperties: STYLE_PROPERTIES, includeSavedUi });
}

function attribute(node, name, fallback = null) {
  return node?.attributes[name] || fallback;
}

function data(node, name, fallback = null) {
  return node?.dataset[name] || fallback;
}

function rendered(node) {
  return Boolean(node && !node.hidden && node.style.display !== "none"
    && node.style.visibility !== "hidden" && node.bounds.width > 0 && node.bounds.height > 0);
}

function targetSize(node) {
  return { width: node.bounds.width, height: node.bounds.height };
}

function earlyQuestionGeometry(snapshot, controls) {
  const { observations, document, viewport } = snapshot;
  const support = observations.support[0];
  const firstBounds = controls[0]?.bounds;
  return {
    confirmDisabled: observations.confirm[0]?.disabled === true,
    firstResponseOnFirstScreen: Boolean(firstBounds && firstBounds.top >= 0 && firstBounds.bottom <= viewport.height),
    horizontalDocumentOverflow: document.scrollWidth > document.clientWidth,
    nestedQuestionScroll: Boolean(support && support.scrollHeight > support.clientHeight && ["auto", "scroll"].includes(support.style.overflowY)),
  };
}

function earlyQuestionQueries(skillId, inputMethod, taskSelector) {
  return [
    { id: "question", selector: `section.question[data-skill-id="${skillId}"][data-input-method="${inputMethod}"]` },
    { id: "task", scope: "question", selector: taskSelector },
    { id: "confirm", scope: "question", selector: 'button[data-action="confirm"]' },
    { id: "support", scope: "question", selector: ".support-scroll" },
    { id: "disclosures", scope: "question", selector: '[data-feedback-state],[data-correct-answer],.worked-answer,.feedback' },
  ];
}

function pressed(node) {
  return attribute(node, "aria-pressed") === "true";
}

function countedGeometricCue(node) {
  if (!node) return false;
  const cue = node.pseudos["::after"];
  return cue.content === '""' && cue.backgroundImage.split("linear-gradient").length === 3
    && Number.parseFloat(cue.width) >= 32 && Number.parseFloat(cue.height) >= 32;
}

function countedAccessibleCue(node) {
  return Boolean(node && attribute(node, "aria-label", "").includes("counted") && pressed(node));
}

function earlyCountingIdentity(snapshot) {
  const { observations, savedUi } = snapshot;
  const savedQuestion = savedUi?.question;
  return {
    skillId: data(observations.question[0], "skillId"),
    inputMethod: data(observations.question[0], "inputMethod"),
    semanticPromptStringId: savedQuestion?.semanticPromptStringId || null,
    rendererFamily: data(observations.task[0], "artRendererFamily"),
    objectOracle: Number(savedQuestion?.answer?.value),
  };
}

export async function earlyCountingSnapshot(page, expectedTouchedCount) {
  const queries = [
    ...earlyQuestionQueries("MQ-002", "COUNT_TOUCH", '.count-touch-task[data-response-kind="COUNT_TOUCH"]'),
    { id: "objects", scope: "task", selector: ".touch-objects button[data-item-id]", pseudos: ["::after"], texts: ["span:last-child"] },
    { id: "numbers", scope: "task", selector: ".count-number-bank button[data-count-value]" },
  ];
  const snapshot = await observeArtDom(page, queries, { includeSavedUi: true });
  return projectEarlyCounting(snapshot, expectedTouchedCount);
}

function projectEarlyCounting(snapshot, expectedTouchedCount) {
  const { observations } = snapshot;
  const objects = observations.objects;
  const numbers = observations.numbers;
  const counted = objects.find(pressed);
  return {
    ...earlyCountingIdentity(snapshot),
    objectCount: objects.length,
    objectIds: objects.map((node) => node.dataset.itemId),
    numberBank: numbers.map((node) => Number(node.dataset.countValue)),
    expectedNumberBank: [0, 1, 2, 3],
    touchedCount: objects.filter(pressed).length,
    expectedTouchedCount,
    countedHasGeometricCheckCue: countedGeometricCue(counted),
    countedHasVisibleTextCue: Boolean(counted && counted.texts["span:last-child"]?.trim() === "Counted"),
    countedHasAccessibleCue: countedAccessibleCue(counted),
    answerDisclosureCount: observations.disclosures.length + numbers.filter(pressed).length,
    ...earlyQuestionGeometry(snapshot, objects),
    targets: [
      ...objects.map((node) => ({ kind: "object", ...targetSize(node) })),
      ...numbers.map((node) => ({ kind: "number", ...targetSize(node) })),
    ],
  };
}

function frameHasFiveByTwoCells(cells) {
  if (cells.length !== 10) return false;
  const bounds = cells.map((node) => node.bounds);
  const near = (left, right) => Math.abs(left - right) <= 1;
  return bounds.slice(0, 5).every((rect) => near(rect.top, bounds[0].top))
    && bounds.slice(5).every((rect) => near(rect.top, bounds[5].top))
    && bounds[5].top > bounds[0].top
    && bounds.slice(0, 5).every((rect, index) => near(rect.left, bounds[index + 5].left));
}

function filledCounterCue(node) {
  if (!node) return false;
  const cue = node.pseudos["::before"];
  const width = Number.parseFloat(cue.width) + Number.parseFloat(cue.borderLeftWidth) + Number.parseFloat(cue.borderRightWidth);
  const height = Number.parseFloat(cue.height) + Number.parseFloat(cue.borderTopWidth) + Number.parseFloat(cue.borderBottomWidth);
  return cue.content === '""' && cue.borderStyle === "solid" && width >= 28 && height >= 28;
}

function filledCentrePipCue(node) {
  if (!node) return false;
  const cue = node.pseudos["::after"];
  return cue.content === '""' && cue.borderStyle === "solid" && Number.parseFloat(cue.width) >= 10 && Number.parseFloat(cue.height) >= 10;
}

function earlyFrameIdentity(snapshot) {
  const { observations, savedUi } = snapshot;
  const savedQuestion = savedUi?.question;
  return {
    skillId: data(observations.question[0], "skillId"),
    inputMethod: data(observations.question[0], "inputMethod"),
    semanticPromptStringId: savedQuestion?.semanticPromptStringId || null,
    taskType: savedQuestion?.taskType || null,
    rendererFamily: data(observations.task[0], "artRendererFamily"),
    answerOracle: Number(savedQuestion?.answer?.value),
    declaredCellCount: Number(observations.task[0]?.dataset.cellCount),
  };
}

export async function earlyFrameSnapshot(page, expectedPressedCount) {
  const queries = [
    ...earlyQuestionQueries("MQ-026", "TEN_FRAME", '.ten-frame-construction[data-response-kind="TEN_FRAME"]'),
    { id: "frames", scope: "task", selector: ":scope > .tenframe" },
    { id: "frameCells", scope: "task", selector: ":scope > .tenframe > .model-cell", parentGroup: "frames" },
    { id: "cells", scope: "task", selector: ".model-cell[data-cell][data-cell-position]", pseudos: ["::before", "::after"] },
  ];
  const snapshot = await observeArtDom(page, queries, { includeSavedUi: true });
  return projectEarlyFrame(snapshot, expectedPressedCount);
}

function projectEarlyFrame(snapshot, expectedPressedCount) {
  const { observations, savedUi } = snapshot;
  const cells = observations.cells;
  const filled = cells.find(pressed);
  return {
    ...earlyFrameIdentity(snapshot),
    ...frameStructure(observations),
    pressedCount: cells.filter(pressed).length,
    expectedPressedCount,
    responseValue: String(savedUi?.entry ?? ""),
    filledHasCssCounterCue: filledCounterCue(filled),
    filledHasCentrePipCue: filledCentrePipCue(filled),
    filledHasAccessibleCue: Boolean(filled && pressed(filled) && attribute(filled, "aria-label")),
    answerDisclosureCount: observations.disclosures.length,
    ...earlyQuestionGeometry(snapshot, cells),
    targets: cells.map(targetSize),
  };
}

function frameStructure(observations) {
  const { frames, cells } = observations;
  const frameCells = frames.map((frame) => observations.frameCells.filter((cell) => cell.parentIndex === frame.index));
  return {
    frameCount: frames.length,
    frameCapacities: frames.map((frame) => Number(frame.dataset.frameCapacity)),
    cellsPerFrame: frameCells.map((group) => group.length),
    frameIndexes: frames.map((frame) => Number(frame.dataset.frameIndex)),
    cellIndexes: cells.map((cell) => Number(cell.dataset.cell)),
    cellPositions: cells.map((cell) => Number(cell.dataset.cellPosition)),
    fiveByTwoStructure: frameCells.every(frameHasFiveByTwoCells),
  };
}

function style(node, property, fallback = "missing") {
  return node?.style[property] || fallback;
}

function cssOrder(node) {
  return Number.parseInt(style(node, "order", "0"), 10);
}

function visibleResponseControls(observations) {
  return observations.controls.filter((node) => !node.disabled && rendered(node));
}

function relation(snapshot, name) {
  return snapshot.relations[name][0] || false;
}

function controlsPrecedeConfirm(snapshot, controls) {
  return controls.length > 0 && controls.every((node) => snapshot.relations.controlsBeforeConfirm[node.index]);
}

function overlap(first, second) {
  if (!first || !second) return { width: 0, height: 0 };
  return {
    width: Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left)),
    height: Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)),
  };
}

function boundsContained(inner, outer) {
  return Boolean(inner && outer && inner.left >= outer.left - 1 && inner.right <= outer.right + 1
    && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1);
}

function targetDimensions(node) {
  return {
    ...targetSize(node),
    clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
    clientHeight: node.clientHeight, scrollHeight: node.scrollHeight,
  };
}

const SHELL_QUERIES = Object.freeze([
  { id: "question", selector: '[data-art-question-shell="ART-MIG-04"]' },
  { id: "rail", selector: '[data-art-instrument-rail="ART-MIG-04"]' },
  { id: "response", scope: "question", selector: ".question-response" },
  { id: "confirm", scope: "question", selector: 'button[data-action="confirm"]' },
  { id: "answerRegion", scope: "response", selector: ".answer-controls" },
  { id: "confirmContainer", scope: "confirm", selector: ".question-submit", closest: true },
  { id: "controls", scope: "answerRegion", selector: "button,input,select,textarea,[tabindex]" },
  { id: "railActions", scope: "rail", selector: "button[data-action]" },
  ...["replay", "tutorial", "stop"].map((action) => ({ id: action, selector: `button[data-action="${action}"]` })),
]);

const SHELL_RELATIONS = Object.freeze([
  { id: "questionBeforeRail", from: "question", to: "rail", kind: "before" },
  { id: "responseRegionBeforeConfirm", from: "answerRegion", to: "confirm", kind: "before" },
  { id: "controlsBeforeConfirm", from: "controls", to: "confirm", kind: "before" },
  { id: "confirmBeforeRail", from: "confirm", to: "rail", kind: "before" },
]);

function shellControlOrder(observations, controls) {
  return {
    controlCssOrders: {
      answerRegion: cssOrder(observations.answerRegion[0]),
      response: controls.map(cssOrder),
      confirmContainer: cssOrder(observations.confirmContainer[0]),
      confirm: cssOrder(observations.confirm[0]),
      rail: observations.railActions.map(cssOrder),
    },
    controlTabIndexes: {
      response: controls.map((node) => node.tabIndex),
      confirm: observations.confirm[0]?.tabIndex ?? -1,
      rail: observations.railActions.map((node) => node.tabIndex),
    },
  };
}

function shellGeometry(snapshot) {
  const question = snapshot.observations.question[0];
  const rail = snapshot.observations.rail[0];
  const commonArea = overlap(question?.bounds, rail?.bounds);
  return {
    railVisible: rendered(rail),
    cssOrder: { question: cssOrder(question), rail: cssOrder(rail) },
    documentScrollWidth: snapshot.document.scrollWidth,
    viewportWidth: snapshot.viewport.width,
    questionOverflowX: style(question, "overflowX"),
    questionOverflowY: style(question, "overflowY"),
    questionRailOverlapArea: commonArea.width * commonArea.height,
  };
}

export async function questionShellSnapshot(page) {
  const snapshot = await observeArtDom(page, SHELL_QUERIES, { relations: SHELL_RELATIONS });
  const { observations } = snapshot;
  const controls = visibleResponseControls(observations);
  return {
    questionCount: observations.question.length,
    railCount: observations.rail.length,
    actionCounts: Object.fromEntries(["replay", "tutorial", "stop"].map((action) => [action, observations[action].length])),
    questionBeforeRail: relation(snapshot, "questionBeforeRail"),
    responseControlCount: controls.length,
    responseRegionBeforeConfirm: relation(snapshot, "responseRegionBeforeConfirm"),
    responseControlsBeforeConfirm: controlsPrecedeConfirm(snapshot, controls),
    confirmBeforeRail: relation(snapshot, "confirmBeforeRail"),
    railActionOrder: observations.railActions.map((node) => node.attributes["data-action"]),
    railLabels: observations.railActions.map((node) => ({
      action: node.attributes["data-action"], visibleText: node.innerText.replace(/\s+/gu, " ").trim(),
    })),
    ...shellGeometry(snapshot),
    ...shellControlOrder(observations, controls),
    targets: observations.railActions.map((node) => ({ action: node.attributes["data-action"], ...targetDimensions(node) })),
  };
}

const ZONE_QUERIES = Object.freeze([
  { id: "question", selector: '[data-art-question-shell="ART-MIG-04"]' },
  { id: "layout", scope: "question", selector: '[data-art-zone-layout="ART-MIG-05"]' },
  { id: "support", scope: "layout", selector: ".support-scroll", closest: true },
  { id: "observation", scope: "layout", selector: ':scope > [data-art-question-zone="OBSERVATION"]' },
  { id: "construction", scope: "layout", selector: ':scope > [data-art-question-zone="CONSTRUCTION"]' },
  { id: "response", scope: "construction", selector: ".question-response" },
  { id: "answerRegion", scope: "response", selector: ".answer-controls" },
  { id: "confirm", scope: "response", selector: 'button[data-action="confirm"]' },
  { id: "rail", selector: '[data-art-instrument-rail="ART-MIG-04"]' },
  { id: "tutorial", scope: "rail", selector: 'button[data-action="tutorial"]:not([hidden])' },
  { id: "controls", scope: "answerRegion", selector: "button,input,select,textarea,[tabindex]" },
  { id: "prompt", scope: "layout", selector: ".prompt" },
  { id: "staticStimuli", scope: "question", selector: '[data-answer-free="true"]' },
  { id: "referenceSupports", scope: "question", selector: ".question-support" },
  { id: "workedReferences", scope: "question", selector: '[data-worked-result="true"]' },
]);

const ZONE_RELATIONS = Object.freeze([
  { id: "observationBeforeConstruction", from: "observation", to: "construction", kind: "before" },
  { id: "promptInObservation", from: "prompt", to: "observation", kind: "inside" },
  ...["staticStimuli", "referenceSupports", "workedReferences"].map((from) => ({ id: from, from, to: "observation", kind: "inside" })),
  { id: "responseInConstruction", from: "response", to: "construction", kind: "inside" },
  { id: "confirmInConstruction", from: "confirm", to: "construction", kind: "inside" },
  { id: "controlsBeforeConfirm", from: "controls", to: "confirm", kind: "before" },
  { id: "confirmBeforeRail", from: "confirm", to: "rail", kind: "before" },
]);

function zoneSemantics(snapshot, controls) {
  const { observations, relations } = snapshot;
  return {
    layoutCount: observations.layout.length,
    observationCount: observations.observation.length,
    constructionCount: observations.construction.length,
    observationBeforeConstruction: relation(snapshot, "observationBeforeConstruction"),
    promptInObservation: relation(snapshot, "promptInObservation"),
    staticStimulusCount: observations.staticStimuli.length,
    staticStimulusInObservationCount: relations.staticStimuli.filter(Boolean).length,
    referenceSupportCount: observations.referenceSupports.length,
    referenceSupportInObservationCount: relations.referenceSupports.filter(Boolean).length,
    workedReferenceCount: observations.workedReferences.length,
    workedReferenceInObservationCount: relations.workedReferences.filter(Boolean).length,
    responseInConstruction: relation(snapshot, "responseInConstruction"),
    confirmInConstruction: relation(snapshot, "confirmInConstruction"),
    responseBeforeConfirm: controlsPrecedeConfirm(snapshot, controls),
    confirmBeforeRail: relation(snapshot, "confirmBeforeRail"),
    responseControlCount: controls.length,
  };
}

function zoneLayout(observation, construction) {
  const commonArea = overlap(observation, construction);
  return {
    zoneOverlapArea: commonArea.width * commonArea.height,
    stacked: Boolean(observation && construction && construction.top >= observation.bottom - 1),
    paired: Boolean(observation && construction && construction.left >= observation.right - 1 && commonArea.height > 0),
  };
}

function zoneResponseGeometry(snapshot, controls) {
  const { observations, viewport } = snapshot;
  const firstBounds = controls[0]?.bounds;
  const tutorial = observations.tutorial[0];
  const viewportBounds = { left: 0, top: 0, right: viewport.width, bottom: viewport.height };
  return {
    firstResponseDiscoverable: boundsContained(firstBounds, observations.construction[0]?.bounds),
    firstResponseOnFirstScreen: boundsContained(firstBounds, viewportBounds),
    tutorialActionOnFirstScreen: rendered(tutorial) && boundsContained(tutorial?.bounds, viewportBounds),
    cssOrders: {
      observation: cssOrder(observations.observation[0]), construction: cssOrder(observations.construction[0]),
      response: controls.map(cssOrder), confirm: cssOrder(observations.confirm[0]),
    },
    tabIndexes: { response: controls.map((node) => node.tabIndex), confirm: observations.confirm[0]?.tabIndex ?? -1 },
    targets: [...controls, ...observations.confirm.slice(0, 1)].map((node) => ({
      action: attribute(node, "data-action") || attribute(node, "data-response-action") || "answer", ...targetDimensions(node),
    })),
  };
}

function zoneAppearance(observations) {
  const roles = { observation: "observation", construction: "construction", layout: "layout", supportScroll: "support" };
  const overflow = Object.entries(roles).flatMap(([prefix, role]) => [
    [`${prefix}OverflowX`, style(observations[role][0], "overflowX")],
    [`${prefix}OverflowY`, style(observations[role][0], "overflowY")],
  ]);
  return {
    observationBorderStyle: style(observations.observation[0], "borderTopStyle"),
    constructionBorderStyle: style(observations.construction[0], "borderTopStyle"),
    observationBackground: style(observations.observation[0], "backgroundColor"),
    constructionBackground: style(observations.construction[0], "backgroundColor"),
    ...Object.fromEntries(overflow),
  };
}

function zoneScrollDimensions(snapshot) {
  const { observations, document, viewport } = snapshot;
  const dimension = (node, property) => node?.[property] || 0;
  return {
    documentScrollWidth: document.scrollWidth,
    viewportWidth: viewport.width,
    zoneScrollWidth: dimension(observations.layout[0], "scrollWidth"),
    zoneClientWidth: dimension(observations.layout[0], "clientWidth"),
    supportScrollWidth: dimension(observations.support[0], "scrollWidth"),
    supportClientWidth: dimension(observations.support[0], "clientWidth"),
    supportScrollHeight: dimension(observations.support[0], "scrollHeight"),
    supportClientHeight: dimension(observations.support[0], "clientHeight"),
  };
}

export async function questionZoneSnapshot(page, expectedLayout, {
  requiresFirstScreenResponse = false, requiresFirstScreenTutorial = false,
} = {}) {
  const snapshot = await observeArtDom(page, ZONE_QUERIES, { relations: ZONE_RELATIONS });
  const { observations } = snapshot;
  const controls = visibleResponseControls(observations);
  return {
    ...zoneSemantics(snapshot, controls),
    ...zoneResponseGeometry(snapshot, controls),
    ...zoneLayout(observations.observation[0]?.bounds, observations.construction[0]?.bounds),
    ...zoneAppearance(observations),
    ...zoneScrollDimensions(snapshot),
    expectedLayout, requiresFirstScreenResponse, requiresFirstScreenTutorial,
  };
}
