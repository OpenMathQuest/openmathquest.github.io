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

// Read browser geometry only. Predicates below operate on these native snapshots.
export function readVisualDefectGeometry({ kind, scope, specs, styleProperties }) {
  const root = document.querySelector(scope);
  if (!root) throw new Error(`Missing visible regression scope ${scope}`);
  const rect = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
  const box = (element) => rect(element.getBoundingClientRect());
  const visible = (element) => element.checkVisibility() && element.getClientRects().length > 0;
  const select = (element, selector) => [...element.querySelectorAll(selector)].filter(visible);
  const styleRecord = (element, pseudo) => {
    const css = getComputedStyle(element, pseudo);
    return Object.fromEntries(styleProperties.map((property) => [property, css.getPropertyValue(property)]).concat([["content", css.content]]));
  };
  const glyphs = (element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), result = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (let offset = 0; offset < node.textContent.length; offset += 1) {
        if (!/\S/u.test(node.textContent[offset])) continue;
        const range = document.createRange(); range.setStart(node, offset); range.setEnd(node, offset + 1);
        for (const r of range.getClientRects()) if (r.width && r.height) result.push({ ...rect(r), glyph: node.textContent[offset] });
      }
    }
    return result;
  };
  const matrixRecord = (element) => {
    const css = getComputedStyle(element);
    let matrix = new DOMMatrix(css.transform === "none" ? undefined : css.transform);
    if (css.scale !== "none") { const values = css.scale.split(/\s+/u).map(Number); matrix = new DOMMatrix().scale(values[0], values[1] ?? values[0]).multiply(matrix); }
    if (css.rotate !== "none") matrix = new DOMMatrix().rotate(Number.parseFloat(css.rotate)).multiply(matrix);
    return { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d };
  };
  const buttonRecord = (element) => {
    const button = element.closest("button");
    if (!button) return { button: null, buttonInterior: null };
    const r = box(button), css = getComputedStyle(button);
    return { button: r, buttonInterior: { left: r.left + Number.parseFloat(css.borderLeftWidth), right: r.right - Number.parseFloat(css.borderRightWidth),
      top: r.top + Number.parseFloat(css.borderTopWidth), bottom: r.bottom - Number.parseFloat(css.borderBottomWidth) } };
  };
  const readAttribute = (name) => question ? question.getAttribute(name) : null;
  const readText = (selector) => { const element = root.querySelector(selector); return element ? element.textContent.trim() : null; };
  const readValue = (selector) => { const element = document.querySelector(selector); return element ? element.value : null; };
  const read = (element, spec) => ({
    text: element.textContent.trim(), box: box(element), glyphs: spec.glyphs ? glyphs(element) : [],
    shape: element.dataset.shape || element.dataset.solid || null, crossing: element.classList.contains("fifth"),
    value: element.getAttribute("data-value"), className: element.getAttribute("class"),
    container: spec.closest ? box(element.closest(spec.closest) || element.parentElement) : null,
    frame: element.closest(".shape-frame") ? box(element.closest(".shape-frame")) : null,
    ...buttonRecord(element),
    paint: spec.paint ? { style: styleRecord(element), matrix: matrixRecord(element) } : null,
    pseudo: spec.pseudo ? styleRecord(element, "::before") : null,
    children: Object.fromEntries((spec.children || []).map((child) => [child.id, select(element, child.selector).map((value) => read(value, child))])),
  });
  const question = root.matches("[data-skill-id]") ? root : root.querySelector("[data-skill-id]");
  return {
    kind, collections: Object.fromEntries(specs.map((spec) => [spec.id, select(root, spec.selector).map((element) => read(element, spec))])),
    identity: { skillId: readAttribute("data-skill-id"), questionId: readAttribute("data-question-id"),
      prompt: readText(".prompt"), theme: readValue("#lab-theme"), sample: readValue("#lab-sample") },
    browserProfile: { width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio, touch: navigator.maxTouchPoints > 0 },
    cssTrigSupport: CSS.supports("width", "calc(abs(cos(30deg)) * 100px)"),
  };
}
export function readOfficialVisualLabCapacity() {
  const value = (name) => document.getElementById(`lab-${name}`).value;
  const ordinal = Number(value("sample")) - 1;
  const question = window.MathQuestEngine.makeQuestion({ skillId: value("skill"), tier: value("tier"), representation: value("representation"),
    seed: 1297175628, ordinal, eligibleQuestionOrdinal: ordinal, scheduledReview: false, coldTest: false, preview: true, theme: value("theme"), scaffolded: true });
  if (question.questionId !== document.querySelector("article.lab-question").getAttribute("data-question-id")) throw new Error("Capacity official question identity does not match native lab");
  const target = Number(question.answer.value);
  if (!Number.isFinite(target)) throw new Error("Capacity official target is not finite");
  return { questionId: question.questionId, target };
}
function visualCapacitySurfaceBand(liquid, surface) {
  if (surface) return surface.box;
  return { top: liquid.box.top, bottom: liquid.box.top + Number.parseFloat(liquid.paint.style["border-top-width"]) };
}
export function visualCapacityAlignment(ticks, liquid, surface, target) {
  const byValue = new Map(ticks.map((mark) => [Number(mark.value), mark.box]));
  const maximum = Math.max(...byValue.keys()), zero = byValue.get(0), end = byValue.get(maximum), tick = byValue.get(target);
  if (!zero || !end || !tick || !Number.isFinite(maximum) || maximum <= 0) throw new Error("Capacity target or endpoint tick witness missing");
  const center = (box) => (box.top + box.bottom) / 2;
  const expectedCenter = center(zero) + (center(end) - center(zero)) * target / maximum;
  const surfaceBand = visualCapacitySurfaceBand(liquid, surface), liquidCenter = center(surfaceBand), tickCenter = center(tick);
  const inside = (band, value) => value >= band.top && value <= band.bottom;
  return { target, expectedCenter, tickCenter, liquidCenter, tickBand: tick, surfaceBand,
    liquidTickDelta: liquidCenter - tickCenter, tickEndpointDelta: tickCenter - expectedCenter,
    aligned: inside(tick, expectedCenter) && inside(tick, liquidCenter) && inside(surfaceBand, tickCenter) };
}
export function visualRadialClearance(face, glyphs, paint) {
  const x = (face.left + face.right) / 2, y = (face.top + face.bottom) / 2;
  const innerRadius = Math.min(...glyphs.map((g) => Math.hypot(Math.max(0, g.left - x, x - g.right), Math.max(0, g.top - y, y - g.bottom))));
  const corners = [paint.left, paint.right].flatMap((px) => [paint.top, paint.bottom].map((py) => Math.hypot(px - x, py - y)));
  return { innerRadius, handRadius: Math.max(...corners) };
}

export const visualShadowValues = (text) => text.replace(/rgba?\([^)]*\)/gu, "").match(/-?[\d.]+px/gu)?.map(Number.parseFloat) || [];
export function visualShadowDescriptors(style) {
  const shadows = style["box-shadow"].split(/,(?![^()]*\))/u).filter((part) => !part.includes("inset")).map(visualShadowValues).filter((values) => values.length >= 2);
  const filters = (style.filter.match(/drop-shadow\((?:[^()]|rgba?\([^)]*\))*\)/gu) || []).map(visualShadowValues).filter((values) => values.length >= 2);
  return shadows.map(([x, y, blur = 0, spread = 0]) => ({ x, y, radius: spread + blur / 2 })).concat(filters.map(([x, y, blur = 0]) => ({ x, y, radius: blur / 2 })));
}
export function visualPaintedBox(value) {
  const r = { ...value.box }, matrix = value.paint.matrix;
  for (const { x, y, radius } of visualShadowDescriptors(value.paint.style)) {
    const dx = matrix.a * x + matrix.c * y, dy = matrix.b * x + matrix.d * y;
    const rx = radius * (Math.abs(matrix.a) + Math.abs(matrix.c)), ry = radius * (Math.abs(matrix.b) + Math.abs(matrix.d));
    r.left = Math.min(r.left, value.box.left + dx - rx); r.right = Math.max(r.right, value.box.right + dx + rx);
    r.top = Math.min(r.top, value.box.top + dy - ry); r.bottom = Math.max(r.bottom, value.box.bottom + dy + ry);
  }
  return r;
}

export const visualOverlap = (a, b, tolerance = 0.5) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > tolerance && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tolerance;
export const visualContains = (outer, inner, tolerance = 1) => inner.left >= outer.left - tolerance && inner.right <= outer.right + tolerance && inner.top >= outer.top - tolerance && inner.bottom <= outer.bottom + tolerance;

export const VISUAL_GEOMETRY_STYLES = ["width", "height", "box-sizing", "left", "top", "position", "translate", "padding-left", "padding-right", "padding-top", "padding-bottom", "border-left-width", "border-right-width", "border-top-width", "border-bottom-width", "box-shadow", "filter"];

export async function compareSelectedLabelPaint({ painted, unobscured, glyphs }) {
  const pixels = async (png) => {
    const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true }); context.drawImage(image, 0, 0);
    return { data: context.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height };
  };
  const before = await pixels(unobscured), after = await pixels(painted);
  if (before.width !== after.width || before.height !== after.height) throw new Error("Selected paint comparison changed dimensions");
  const countGlyph = (glyph) => {
    let inkPixels = 0, lostInkPixels = 0;
    for (let y = Math.max(0, Math.ceil(glyph.top / glyphs.height * before.height)); y < Math.min(before.height, Math.floor(glyph.bottom / glyphs.height * before.height)); y += 1) {
      for (let x = Math.max(0, Math.ceil(glyph.left / glyphs.width * before.width)); x < Math.min(before.width, Math.floor(glyph.right / glyphs.width * before.width)); x += 1) {
        const offset = (y * before.width + x) * 4, ink = glyph.colour.every((colour, channel) => Math.abs(before.data[offset + channel] - colour) < 4);
        if (!ink) continue; inkPixels += 1;
        if (glyph.colour.some((colour, channel) => Math.abs(after.data[offset + channel] - colour) > 12)) lostInkPixels += 1;
      }
    }
    return { inkPixels, lostInkPixels };
  };
  const counts = glyphs.glyphs.map(countGlyph);
  const inkPixels = counts.reduce((sum, count) => sum + count.inkPixels, 0), lostInkPixels = counts.reduce((sum, count) => sum + count.lostInkPixels, 0);
  if (!inkPixels) throw new Error("Selected label has no observed native ink");
  return { inkPixels, lostInkPixels };
}
