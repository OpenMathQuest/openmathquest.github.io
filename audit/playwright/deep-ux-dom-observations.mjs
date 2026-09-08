function captureGeometry(root) {
  const visible = (element) => {
    const style = getComputedStyle(element), box = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
  };
  const names = (element) => {
    const id = element.id;
    const labelledBy = String(element.getAttribute("aria-labelledby") || "").trim().split(/\s+/u).filter(Boolean);
    const labelledText = labelledBy.length && labelledBy.every((labelId) => document.getElementById(labelId))
      ? labelledBy.map((labelId) => document.getElementById(labelId).textContent).join(" ") : "";
    const explicitLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : "";
    const wrappingLabel = element.closest("label")?.textContent;
    return [element.getAttribute("aria-label"), labelledText, explicitLabel, wrappingLabel,
      element.getAttribute("alt"), element.textContent, element.getAttribute("title")];
  };
  const ancestors = (element) => {
    const rows = [];
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (!ancestor.matches(".route-grid-scroll")) {
        const style = getComputedStyle(ancestor);
        rows.push({ bounds: ancestor.getBoundingClientRect().toJSON(), overflowX: style.overflowX, overflowY: style.overflowY });
      }
      if (ancestor === root) break;
    }
    return rows;
  };
  const visibleTextParents = (root, controls) => {
    const parents = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (String(node.textContent || "").trim() && node.parentElement && visible(node.parentElement)) parents.push(node.parentElement);
    }
    for (const control of controls) if (!parents.includes(control)) parents.push(control);
    return parents;
  };
  const controls = [...root.querySelectorAll("button,input,select,textarea,[role='button']")].filter((element) => visible(element) && !element.disabled);
  const textParents = visibleTextParents(root, controls);
  const controlRows = controls.map((element) => ({
    tag: element.tagName.toLowerCase(), names: names(element),
    bounds: element.getBoundingClientRect().toJSON(), ancestors: ancestors(element),
  }));
  const fontSizes = textParents.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)).filter(Number.isFinite);
  const nestedScrollers = [...root.querySelectorAll("*")].filter((element) => {
    if (!visible(element) || element.matches(".route-grid-scroll")) return false;
    const style = getComputedStyle(element);
    return /^(?:auto|scroll)$/u.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
  });
  const rootBox = root.getBoundingClientRect();
  const tutorial = root.querySelector('[data-tutorial="different-example"]');
  const grade = root.querySelector('[data-lab-action="grade"]');
  const response = root.querySelector(".answer-controls");
  return {
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
    question: { x: rootBox.x, y: rootBox.y, width: rootBox.width, height: rootBox.height },
    rootBounds: rootBox.toJSON(), contractValid: root.dataset.contractValid, storageIntact: root.dataset.storageIntact,
    controls: controlRows, fontSizes, nestedScrollerCount: nestedScrollers.length,
    placeholderText: /(?:\bundefined\b|\bNaN\b|\[object Object\])/u.test(root.innerText),
    hasTutorial: Boolean(tutorial), hasGrade: Boolean(grade), hasResponse: Boolean(response),
    gradeVisible: grade ? visible(grade) : false, optionCount: Number(root.dataset.optionCount || 0),
  };
}

function clippedByAncestor({ bounds, ancestors }) {
  for (const ancestor of ancestors) {
    if (/^(?:auto|scroll|hidden|clip)$/u.test(ancestor.overflowX)
        && (bounds.left < ancestor.bounds.left - 1 || bounds.right > ancestor.bounds.right + 1)) return true;
    if (/^(?:auto|scroll|hidden|clip)$/u.test(ancestor.overflowY)
        && (bounds.top < ancestor.bounds.top - 1 || bounds.bottom > ancestor.bounds.bottom + 1)) return true;
  }
  return false;
}

function controlObservation(control) {
  return {
    tag: control.tag,
    label: String(control.names.find(Boolean) || "").trim().slice(0, 100),
    width: control.bounds.width,
    height: control.bounds.height,
    clipped: clippedByAncestor(control),
  };
}

function questionBoundaryIssues(snapshot, issues) {
  if (snapshot.contractValid !== "true") issues.push({ code: "QUESTION_CONTRACT_INVALID", message: "The rendered question reports an invalid production contract." });
  if (snapshot.storageIntact !== "true") issues.push({ code: "SAVE_ISOLATION_FAILED", message: "The Parent Test Lab reports that the learning save changed." });
  if (snapshot.document.width > snapshot.viewport.width + 1) issues.push({ code: "HORIZONTAL_OVERFLOW", message: `Document width ${snapshot.document.width} exceeds viewport ${snapshot.viewport.width}.` });
  if (snapshot.rootBounds.right > snapshot.viewport.width + 1 || snapshot.rootBounds.left < -1) issues.push({ code: "QUESTION_HORIZONTAL_CLIP", message: "The question extends beyond the horizontal viewport." });
}

function controlIssues(controlBoxes, issues) {
  const tooSmall = controlBoxes.filter((box) => box.width < 44 || box.height < 44);
  if (tooSmall.length) issues.push({ code: "CONTROL_TARGET_TOO_SMALL", message: `${tooSmall.length} enabled control(s) are below 44 by 44 CSS pixels.` });
  const blank = controlBoxes.filter((box) => !box.label);
  if (blank.length) issues.push({ code: "CONTROL_NAME_MISSING", message: `${blank.length} visible enabled control(s) have no accessible name.` });
  const clipped = controlBoxes.filter((box) => box.clipped);
  if (clipped.length) issues.push({ code: "CONTROL_CLIPPED", message: `${clipped.length} enabled control(s) are clipped by an ancestor and cannot be reached through ordinary outer-page scrolling.` });
}

function contentIssues(snapshot, minimumFont, issues) {
  if (snapshot.nestedScrollerCount) issues.push({ code: "UNAPPROVED_NESTED_SCROLL", message: `${snapshot.nestedScrollerCount} unapproved nested vertical scroller(s) hide question content.` });
  if (minimumFont < 16) issues.push({ code: "TEXT_BELOW_FLOOR", message: `Minimum visible question text is ${minimumFont}px, below 16px.` });
  if (snapshot.placeholderText) issues.push({ code: "PLACEHOLDER_TEXT_VISIBLE", message: "Undefined, NaN, or object placeholder text is visible." });
  if (!snapshot.hasTutorial && (!snapshot.hasResponse || !snapshot.hasGrade)) issues.push({ code: "RESPONSE_OR_GRADE_MISSING", message: "The response area or Test answer control is missing." });
  if (snapshot.hasGrade && !snapshot.gradeVisible) issues.push({ code: "GRADE_NOT_VISIBLE", message: "The Test answer control is not visibly rendered." });
}

export async function geometryCensus(question) {
  const snapshot = await question.evaluate(captureGeometry);
  const controlBoxes = snapshot.controls.map(controlObservation);
  const minimumFont = snapshot.fontSizes.length ? Math.min(...snapshot.fontSizes) : 0;
  const issues = [];
  questionBoundaryIssues(snapshot, issues);
  controlIssues(controlBoxes, issues);
  contentIssues(snapshot, minimumFont, issues);
  return {
    viewport: snapshot.viewport,
    document: snapshot.document,
    question: snapshot.question,
    minimumFont,
    minimumControlWidth: controlBoxes.length ? Math.min(...controlBoxes.map((box) => box.width)) : 0,
    minimumControlHeight: controlBoxes.length ? Math.min(...controlBoxes.map((box) => box.height)) : 0,
    controlCount: controlBoxes.length,
    optionCount: snapshot.optionCount,
    controls: controlBoxes,
    issues,
  };
}

export function captureTutorialPhaseEffect(root) {
  const anchor = root.querySelector(".tutorial-example [data-visual-anchor-role][data-visual-cue-id]");
  const overlay = anchor?.querySelector(":scope > .tutorial-anchor-overlay");
  const overlayBox = overlay?.getBoundingClientRect();
  const instruction = root.querySelector(".tutorial-instruction");
  const style = anchor ? getComputedStyle(anchor) : null;
  const attribute = (element, name) => element?.getAttribute(name) || "";
  const styleValue = (name, fallback = "") => style?.[name] || fallback;
  const visiblyRendered = (element, box) => Boolean(box && box.width > 0 && box.height > 0
    && getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden");
  const overlayFacts = (element, box) => ({
    visible: visiblyRendered(element, box),
    geometry: element?.querySelector("svg")?.innerHTML || "",
    hasSvgGeometry: Boolean(element?.querySelector("svg :is(circle,rect,path,line,polyline)")),
  });
  const overlayObservation = overlayFacts(overlay, overlayBox);
  return {
    phase: root.dataset.tutorialPhaseId || "",
    declaredAnchor: root.dataset.visualAnchorIds || "",
    declaredCue: root.dataset.visualCueIds || "",
    anchorCount: root.querySelectorAll(".tutorial-example [data-visual-anchor-role][data-visual-cue-id]").length,
    actualMathSurface: Boolean(anchor?.matches(".prompt,.stimulus,.model")),
    anchorRole: attribute(anchor, "data-visual-anchor-role"),
    cueId: attribute(anchor, "data-visual-cue-id"),
    describedByInstruction: anchor?.getAttribute("aria-describedby") === instruction?.id,
    outlineWidth: Number.parseFloat(styleValue("outlineWidth", "0")),
    outlineColor: styleValue("outlineColor"),
    outlineStyle: styleValue("outlineStyle"),
    outlineOffset: styleValue("outlineOffset"),
    overlayVisible: overlayObservation.visible,
    overlayGeometry: overlayObservation.geometry,
    overlayHasSvgGeometry: overlayObservation.hasSvgGeometry,
  };
}
