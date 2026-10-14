import { readVisualDefectGeometry, readOfficialVisualLabCapacity, VISUAL_GEOMETRY_STYLES, visualContains, visualOverlap, visualPaintedBox, visualShadowValues, visualCapacityAlignment, visualRadialClearance } from "./art-dom-observations.mjs";
import { activate, activateNamedButton, expect } from "./fixtures.mjs";
import { DEEP_UX_CENSUS_VIEWPORTS } from "../lib/playwright-deep-ux-census.mjs";
export async function exerciseFocusedVisualDefects(page) {
  await finishFocusedRegularSession(page);
  const viewport = page.viewportSize();
  const profile = VISUAL_DEFECT_PROFILES.find((candidate) => candidate.width === viewport.width && candidate.height === viewport.height);
  if (!profile) throw new Error("Focused visual regression viewport is not governed");
  await exerciseVisualDefectRegressions(page, { profiles: [profile] });
}
function readFocusedCapstoneIdentity() {
  const saved = JSON.parse(localStorage.getItem(window.MathQuestEngine.CONSTANTS.STORAGE_NAMESPACE)), question = saved?.activeSession?.uiState?.question;
  return { skillId: question?.skillId, inputMethod: question?.inputMethod, capstone: question?.capstone };
}
async function finishFocusedRegularSession(page) {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("section.question")).toBeVisible();
  await activate(page.locator('[data-action="stop"]'), page);
  expect(await page.evaluate(readFocusedCapstoneIdentity)).toEqual({ skillId: "MQ-001", inputMethod: "PAIR_LINK", capstone: true });
  await completeFocusedCapstone(page);
}
async function completeFocusedCapstone(page) {
  await finishFocusedCapstonePairs(page);
  const confirm = page.getByRole("button", { name: "Confirm", exact: true });
  await expect(confirm).toBeEnabled();
  await activate(confirm, page);
  await expect(page.locator('[data-feedback-context="capstone"][data-feedback-state="correct"]')).toBeVisible();
  await activate(page.locator('[data-action="finish"]'), page);
  await activate(page.locator('[data-action="home"]'), page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem(window.MathQuestEngine.CONSTANTS.STORAGE_NAMESPACE)).activeSession)).toBeNull();
}
async function finishFocusedCapstonePairs(page) {
  const task = page.locator('.panel.done [data-response-kind="PAIR_LINK"]');
  const source = task.getByRole("group", { name: /^Step 1:/u }), target = task.getByRole("group", { name: /^Step 2:/u });
  const pairCount = Math.min(await source.getByRole("button").count(), await target.getByRole("button").count());
  expect(pairCount).toBeGreaterThan(0);
  for (let index = 0; index < pairCount; index += 1) {
    await activate(source.getByRole("button", { disabled: false }).first(), page);
    await activate(target.getByRole("button", { disabled: false }).first(), page);
  }
  await expect(source.locator("button.paired")).toHaveCount(pairCount); await expect(target.locator("button.paired")).toHaveCount(pairCount);
}
// Capture identities are historical defect witnesses, not visual approvals.
// Each sample is reached through the shipped lab controls; no injected questions.
export const VISUAL_DEFECT_PROFILES = DEEP_UX_CENSUS_VIEWPORTS;

export const VISUAL_DEFECT_LAB_CASES = Object.freeze([
  { evidence: "C01P0148", questionId: "MQ-042-11-3821600498", kind: "clock", level: 7, skill: "MQ-042", tier: "EASY", representation: "PICTORIAL", theme: "forest", sample: 12 },
  { evidence: "C01P0091", questionId: "MQ-069-17-1477683568", kind: "capacity", level: 12, skill: "MQ-069", tier: "EASY", representation: "PICTORIAL", theme: "ocean", sample: 18 },
  { evidence: "C01P0037", questionId: "MQ-007-11-587588052", kind: "sort-label", level: 2, skill: "MQ-007", tier: "EASY", representation: "PICTORIAL", theme: "ocean", sample: 12 },
  { evidence: "C02P0049", questionId: "MQ-005-29-3282782524", kind: "shape", level: 1, skill: "MQ-005", tier: "EASY", representation: "CONCRETE", theme: "forest", sample: 30 },
  { evidence: "C02P0313", questionId: "MQ-024-11-3602879940", kind: "solid", level: 4, skill: "MQ-024", tier: "EASY", representation: "CONCRETE", theme: "forest", sample: 12 },
  { evidence: "C01P0050", questionId: "MQ-114-1-3208058340", kind: "numeral", level: 19, skill: "MQ-114", tier: "HARD/TARGET", representation: "PICTORIAL", theme: "ocean", sample: 2 },
  { evidence: "C02P0370", questionId: "MQ-027-2-2825557952", kind: "endpoint", level: 5, skill: "MQ-027", tier: "EASY", representation: "PICTORIAL", theme: "forest", sample: 3 },
  { evidence: "C03P0547", questionId: "MQ-057-11-4233681801", kind: "number-line-labels", level: 10, skill: "MQ-057", tier: "HARD/TARGET", representation: "PICTORIAL", theme: "forest", sample: 12,
    numberLine: { min: 203, max: 303, markers: ["245"], labels: ["203", "213", "223", "233", "243", "253", "263", "273", "283", "293", "303", "245"] } },
  { evidence: "C03P0553", questionId: "MQ-057-8-513695998", kind: "number-line-labels", level: 10, skill: "MQ-057", tier: "EASY", representation: "ABSTRACT", theme: "ocean", sample: 9,
    numberLine: { min: 340, max: 440, markers: ["353", "436"], labels: ["340", "350", "360", "370", "380", "390", "400", "410", "420", "430", "440", "436", "353"] } },
  { evidence: "C03P0925", questionId: "MQ-057-26-1247411311", kind: "number-line-labels", level: 10, skill: "MQ-057", tier: "EASY", representation: "ABSTRACT", theme: "ocean", sample: 27,
    numberLine: { min: 641, max: 741, markers: ["642", "665"], labels: ["641", "651", "661", "671", "681", "691", "701", "711", "721", "731", "741", "665", "642"] } },
  { evidence: "C02P0370-teaching-jump-neighbor", questionId: "MQ-027-2-2825557952", kind: "number-line-jump", level: 5, skill: "MQ-027", tier: "EASY", representation: "PICTORIAL", theme: "forest", sample: 3, teachingShown: true,
    numberLine: { min: 17, max: 18, markers: [], labels: ["?", "18"], positions: { "?": 17, "18": 18 }, jumping: true, jump: { from: 18, to: 17, label: "less" } } },
  { evidence: "C01P0757", questionId: "MQ-087-20-3400714769", kind: "clear", level: 15, skill: "MQ-087", tier: "HARD/TARGET", representation: "PICTORIAL", theme: "ocean", sample: 21 },
  { evidence: "C01P0867", questionId: "MQ-079-11-1591344857", kind: "tally-six", level: 14, skill: "MQ-079", tier: "EASY", representation: "ABSTRACT", theme: "space", sample: 12 },
  { evidence: "C02P0409", questionId: "MQ-029-17-97618109", kind: "tally-five-ten", level: 5, skill: "MQ-029", tier: "HARD/TARGET", representation: "ABSTRACT", theme: "space", sample: 18 },
]);
async function settled(page) {
  await expect(page.locator(".lab-workspace")).toHaveAttribute("data-render-settled", "true");
  await page.evaluate(() => document.fonts.ready);
}
export async function selectVisualDefectLabCase(page, record) {
  for (const [selector, value] of [["#lab-level", record.level], ["#lab-skill", record.skill], ["#lab-tier", record.tier], ["#lab-representation", record.representation], ["#lab-theme", record.theme]]) {
    if (await page.locator(selector).inputValue() === String(value)) continue;
    await page.locator(selector).selectOption(String(value));
    await settled(page);
  }
  const sample = page.locator("#lab-sample");
  await sample.fill(String(record.sample));
  await sample.press("Tab");
  await settled(page);
  await expectVisualLabIdentity(page, record);
}
async function expectVisualLabIdentity(page, record) {
  await expect(page.locator("article.lab-question")).toHaveAttribute("data-skill-id", record.skill);
  await expect(page.locator("article.lab-question")).toHaveAttribute("data-question-id", record.questionId);
  await expect(page.locator("#lab-sample")).toHaveValue(String(record.sample));
}

const visualSpec = (id, selector, options = {}) => ({ id, selector, ...options });
const GLYPH_SPEC = { glyphs: true };
const VISUAL_GEOMETRY_SPECS = Object.freeze({
  clock: [visualSpec("faces", ".clock-face", { children: [visualSpec("numerals", ".clock-numeral", GLYPH_SPEC), visualSpec("hands", ".clock-hand,.clock-minute-hand", { paint: true })] })],
  capacity: [visualSpec("labels", ".metric-capacity-scale .metric-scale-mark b", GLYPH_SPEC),
    visualSpec("ticks", ".metric-capacity-scale .metric-scale-mark"), visualSpec("liquids", ".metric-capacity-liquid", { paint: true }), visualSpec("surfaces", ".metric-capacity-surface")],
  numeral: [visualSpec("values", ".visual-number,.model-value,.array-total,.array-summary b", { glyphs: true, closest: ".visual-item,.model-card,.array-summary" })],
  endpoint: [visualSpec("values", ".number-line-point b", { glyphs: true, closest: ".math-model,.model,.stimulus" })],
  "number-line-labels": [visualSpec("values", ".number-line-point b", { glyphs: true, closest: ".number-line-exact" }), visualSpec("track", ".number-line-track"),
    visualSpec("points", ".number-line-point", { children: [visualSpec("stem", "i", { paint: true }), visualSpec("label", "b")] })],
  "number-line-jump": [visualSpec("values", ".model .number-line-point b", { glyphs: true, closest: ".number-line-exact" }), visualSpec("track", ".model .number-line-track"),
    visualSpec("points", ".model .number-line-point", { children: [visualSpec("stem", "i", { paint: true }), visualSpec("label", "b")] }),
    visualSpec("jumps", ".model .number-line-jump", { children: [visualSpec("caption", "span", GLYPH_SPEC)] })],
  clear: [visualSpec("keys", ".key", GLYPH_SPEC)],
  shape: [visualSpec("shapes", ".shape-visual", { paint: true, closest: ".option-visual,.visual-item,.sort-bin-cue" }), visualSpec("labels", ".prompt,.model-label,.sort-bin-heading strong,.choice>span:last-child", GLYPH_SPEC)],
  solid: [visualSpec("shapes", ".sort-item .solid-visual", { paint: true, closest: ".option-visual,.visual-item,.sort-bin-cue" }), visualSpec("labels", ".prompt,.model-label,.sort-bin-heading strong,.choice>span:last-child", GLYPH_SPEC)],
  "sort-label": [visualSpec("headings", ".sort-bin-heading", { pseudo: true, children: [visualSpec("label", "strong", GLYPH_SPEC), visualSpec("badge", ".sort-bin-step"), visualSpec("cues", ".sort-bin-cue")] })],
  tally: [visualSpec("sets", ".tally-set", { children: [visualSpec("strokes", "i")] })],
  session: [visualSpec("labels", ".session-summary h3,.session-summary>p:not(.small)", GLYPH_SPEC)],
  header: [visualSpec("rocket", ".brand-mark svg"), visualSpec("subtitle", ".subtitle", GLYPH_SPEC)],
  tutorial: [visualSpec("prompt", ".tutorial-example .prompt", GLYPH_SPEC), visualSpec("graphics", ".tutorial-example .stimulus i,.tutorial-example .visual-item,.tutorial-example .model-card")],
  action: [visualSpec("button", '[data-response-action="direct-action"]', { paint: true }), visualSpec("caption", ".action-scene-task .direct-status,.action-scene .direct-status,.direct-task .direct-status", GLYPH_SPEC)],
});

const visualFailure = (result, family, detail) => result.failures.push({ family, detail });
const glyphOverlap = (first, second) => first.some((a) => second.some((b) => visualOverlap(a, b)));
const visualPairs = (values) => values.flatMap((first, index) => values.slice(index + 1).map((second) => [first, second]));
function requireVisualRecords(result, id, minimum = 1) {
  const values = result.collections[id];
  if (!values || values.length < minimum) throw new Error(`${result.kind}: expected ${minimum} visible ${id}, saw ${values?.length ?? 0}`);
  result.witnesses.push({ collection: id, count: values.length });
  return values;
}
function checkSeparatedVisualGlyphs(result, elements, family) {
  for (const [first, second] of visualPairs(elements)) if (glyphOverlap(first.glyphs, second.glyphs)) visualFailure(result, family, `${first.text} / ${second.text}`);
}
const wrongVisualDialSize = (r) => r.width < 100 || r.height < 100 || Math.abs(r.width - r.height) > 2;
function checkVisualClock(result) {
  const family = "C01-I010";
  for (const face of requireVisualRecords(result, "faces")) {
    const r = face.box, numerals = face.children.numerals;
    if (wrongVisualDialSize(r)) visualFailure(result, family, `collapsed dial ${r.width}×${r.height}`);
    if (numerals.length !== 12 || new Set(numerals.map((value) => value.text)).size !== 12) visualFailure(result, family, "twelve distinct numerals missing");
    checkSeparatedVisualGlyphs(result, numerals, family);
    if (numerals.some((value) => !visualContains(r, value.box))) visualFailure(result, family, "numeral outside dial");
    const centers = numerals.map(({ box: b }) => [b.left + b.width / 2, b.top + b.height / 2]);
    const span = (axis) => Math.max(...centers.map((center) => center[axis])) - Math.min(...centers.map((center) => center[axis]));
    if (centers.length && (span(0) < r.width * 0.6 || span(1) < r.height * 0.6)) visualFailure(result, family, "numerals do not surround dial");
    checkVisualClockHands(result, face);
  }
}
function checkVisualClockHands(result, face) {
  const hands = face.children.hands, glyphs = face.children.numerals.flatMap((value) => value.glyphs);
  if (hands.length !== 2) throw new Error("Clock must expose two actual hands");
  for (const hand of hands) {
    const paint = visualPaintedBox(hand), clearance = visualRadialClearance(face.box, glyphs, paint);
    result.witnesses.push({ clockHand: hand.className, ...clearance, paint });
    if (!visualContains(face.box, paint) || clearance.handRadius > clearance.innerRadius) visualFailure(result, "C01-I010", `${hand.className} reaches numeral ring`);
    if (glyphs.some((glyph) => visualOverlap(paint, glyph))) visualFailure(result, "C01-I010", `${hand.className} intersects numeral glyph`);
  }
}
function checkVisualNumerals(result) {
  const endpoint = result.kind === "endpoint", family = endpoint ? "KNOWN-NUMBER-LINE-ENDPOINT-OVERFLOW" : "C01-I001";
  const values = requireVisualRecords(result, "values").filter((value) => /^\d{2,}$/u.test(value.text));
  if (!values.length) throw new Error(`${result.kind}: multi-digit numeral witness missing`);
  const expected = endpoint ? "18" : "1763";
  if (!values.some((value) => value.text === expected)) throw new Error(`${result.kind}: ${expected} numeral witness missing`);
  for (const value of values) {
    const tops = value.glyphs.map((glyph) => glyph.top);
    if (Math.max(...tops) - Math.min(...tops) > 1) visualFailure(result, family, `${value.text} wraps between digits`);
    if (value.glyphs.some((glyph) => !visualContains(value.container, glyph))) visualFailure(result, family, `${value.text} leaves display`);
  }
  if (endpoint) checkSeparatedVisualGlyphs(result, values, family);
}
function checkVisualNumberLine(result) {
  const family = "NEW-C03-NUMBER-LINE-TICK-AND-MARKER-LABEL-COLLISION", expected = result.expectedNumberLine;
  const values = requireVisualRecords(result, "values"), track = requireVisualRecords(result, "track")[0].box;
  if (!expected || result.collections.track.length !== 1) throw new Error("Number-line source descriptor or unique native track missing");
  if (JSON.stringify(values.map((value) => value.text).sort()) !== JSON.stringify([...expected.labels].sort())) visualFailure(result, family, "source tick/marker labels missing, duplicated or changed");
  for (const value of values) {
    const tops = value.glyphs.map((glyph) => glyph.top);
    if (!tops.length) throw new Error(`Number-line ${value.text} glyph witness missing`);
    if (Math.max(...tops) - Math.min(...tops) > 1) visualFailure(result, family, `${value.text} wraps between digits`);
    if (value.glyphs.some((glyph) => !visualContains(value.container, glyph))) visualFailure(result, family, `${value.text} leaves number-line display`);
    const expectedX = visualNumberLineExpectedX(value.text, expected, track), actualX = (value.box.left + value.box.right) / 2;
    result.witnesses.push({ label: value.text, expectedX, actualX });
    if (!Number.isFinite(expectedX) || Math.abs(actualX - expectedX) > 1) visualFailure(result, family, `${value.text} loses source-value x position`);
  }
  checkSeparatedVisualGlyphs(result, values, family);
  checkVisualNumberLineStems(result, values, track, family);
}
function visualNumberLineExpectedX(text, source, track) {
  const value = source.positions?.[text] ?? Number(text);
  return track.left + track.width * (value - source.min) / (source.max - source.min);
}
function checkVisualNumberLineStems(result, values, track, family) {
  const points = requireVisualRecords(result, "points");
  if (points.length !== result.expectedNumberLine.labels.length) visualFailure(result, family, "source tick/marker point inventory changed");
  for (const point of points) {
    if (point.children.stem.length !== 1 || point.children.label.length !== 1) { visualFailure(result, family, `${point.text} native stem/label missing`); continue; }
    const paint = visualPaintedBox(point.children.stem[0]), source = result.expectedNumberLine;
    const expectedX = visualNumberLineExpectedX(point.text, source, track), actualX = (paint.left + paint.right) / 2;
    if (!Number.isFinite(expectedX) || Math.abs(actualX - expectedX) > 1) visualFailure(result, family, `${point.text} stem loses source-value x position`);
    if (values.some((value) => value.glyphs.some((glyph) => visualOverlap(paint, glyph)))) visualFailure(result, family, `${point.text} stem intersects label glyph`);
    if (source.jumping) checkVisualJumpingLineStemSide(result, point, paint, track, family);
    else checkVisualNumberLineStemSide(result, point, paint, track, family);
  }
}
function checkVisualJumpingLineStemSide(result, point, paint, track, family) {
  const label = point.children.label[0].box;
  if (label.top < track.bottom) visualFailure(result, family, `${point.text} jumping-line label moved above axis`);
  if (paint.top >= track.top || paint.bottom < track.top || paint.bottom > track.bottom + 1) visualFailure(result, family, `${point.text} original jumping-line stem/axis relationship changed`);
  result.witnesses.push({ label: point.text, jumpingNeighbor: true, stemPaint: paint, labelBox: label, axis: track });
}
function checkVisualNumberLineJump(result) {
  checkVisualNumberLine(result);
  const jumps = requireVisualRecords(result, "jumps"), track = result.collections.track[0].box, source = result.expectedNumberLine;
  const jump = jumps[0], expectedLeft = visualNumberLineExpectedX(String(Math.min(source.jump.from, source.jump.to)), source, track);
  const expectedRight = visualNumberLineExpectedX(String(Math.max(source.jump.from, source.jump.to)), source, track), family = "NEW-C03-NUMBER-LINE-TICK-AND-MARKER-LABEL-COLLISION";
  if (jumps.length !== 1 || jump.text !== source.jump.label) visualFailure(result, family, "source jumping-line arc/caption changed");
  if (Math.abs(jump.box.left - expectedLeft) > 1 || Math.abs(jump.box.right - expectedRight) > 1) visualFailure(result, family, "jump arc loses source endpoints");
  for (const point of result.collections.points) {
    if (!point.children.stem.length) continue;
    const paint = visualPaintedBox(point.children.stem[0]);
    if (jump.children.caption.some((caption) => caption.glyphs.some((glyph) => visualOverlap(paint, glyph)))) visualFailure(result, family, `${point.text} stem crosses jump caption glyph`);
  }
}
function checkVisualNumberLineStemSide(result, point, paint, track, family) {
  const marker = result.expectedNumberLine.markers.includes(point.text), label = point.children.label[0].box;
  const labelClear = marker ? label.bottom <= track.top : label.top >= track.bottom;
  const correctHalf = marker ? paint.bottom <= track.bottom && paint.top < track.top : paint.top >= track.top && paint.bottom > track.bottom;
  if (!labelClear || !correctHalf) visualFailure(result, family, `${point.text} label/stem crosses its required side of axis`);
  const attachment = marker ? paint.bottom : paint.top;
  if (attachment < track.top - 1 || attachment > track.bottom + 1) visualFailure(result, family, `${point.text} stem is detached from axis`);
  result.witnesses.push({ label: point.text, sourceOffGridMarker: marker, stemPaint: paint, labelBox: label, axis: track });
}
function checkVisualCapacity(result) {
  const labels = requireVisualRecords(result, "labels", 2);
  if (!["0", "10"].every((endpoint) => labels.some((label) => label.text === endpoint))) throw new Error("C01P0091: zero or ten capacity endpoint witness missing");
  checkSeparatedVisualGlyphs(result, labels, "C01-I002");
  checkVisualCapacityAlignment(result);
}
function checkVisualCapacityAlignment(result) {
  const ticks = requireVisualRecords(result, "ticks"), liquid = requireVisualRecords(result, "liquids")[0];
  const alignment = visualCapacityAlignment(ticks, liquid, result.collections.surfaces[0], result.expectedCapacity.target);
  result.witnesses.push({ capacityAlignment: alignment });
  if (!alignment.aligned) visualFailure(result, "C01-I002", `capacity liquid/target tick centre offset ${alignment.liquidTickDelta}px`);
}
function checkVisualKeys(result) {
  const keys = requireVisualRecords(result, "keys");
  if (!keys.some((value) => value.text === "Clear")) throw new Error("Clear key witness missing");
  for (const key of keys) if (key.glyphs.some((glyph) => !visualContains(key.box, glyph, 0))) visualFailure(result, "KNOWN-CLEAR-KEY-LABEL-OVERFLOW", `${key.text} leaves key`);
}
function checkVisualShapeBounds(result, shape, labels, family) {
  const paint = visualPaintedBox(shape);
  if (!visualContains(shape.container, paint)) visualFailure(result, family, `${shape.shape} leaves reserved visual space`);
  if (shape.frame && !visualContains(shape.frame, paint)) visualFailure(result, family, `${shape.shape} leaves allocated shape frame`);
  if (shape.button && !visualContains(shape.button, paint)) visualFailure(result, family, `${shape.shape} leaves owning button`);
  for (const label of labels) if (label.glyphs.some((glyph) => visualOverlap(paint, glyph))) visualFailure(result, family, `${shape.shape} intersects ${label.text}`);
}
function checkVisualShapes(result) {
  const family = result.kind === "solid" ? "NEW-C02-SOLID-SORT-CARD-SIZE-MISMATCH" : "C01-I005";
  const shapes = requireVisualRecords(result, "shapes"), labels = result.collections.labels;
  for (const shape of shapes) checkVisualShapeBounds(result, shape, labels, family);
  for (const [first, second] of visualPairs(shapes)) if (visualOverlap(visualPaintedBox(first), visualPaintedBox(second))) visualFailure(result, family, "independent neighboring objects overlap");
}
function visualCssLength(value, reference) {
  const length = Number.parseFloat(value);
  if (!Number.isFinite(length)) throw new Error(`Unmeasurable CSS length ${value}`);
  return value.endsWith("%") ? length * reference / 100 : length;
}
function visualPseudoBadge(heading) {
  const css = heading.pseudo, box = heading.box;
  if (css.content === "none" || css.position !== "absolute") throw new Error("Unmeasurable historical sorting badge");
  let width = visualCssLength(css.width, box.width), height = visualCssLength(css.height, box.height);
  if (css["box-sizing"] !== "border-box") {
    width += ["padding-left", "padding-right", "border-left-width", "border-right-width"].reduce((sum, property) => sum + visualCssLength(css[property], box.width), 0);
    height += ["padding-top", "padding-bottom", "border-top-width", "border-bottom-width"].reduce((sum, property) => sum + visualCssLength(css[property], box.height), 0);
  }
  const translate = css.translate.split(/\s+/u), tx = visualCssLength(translate[0], width), ty = visualCssLength(translate[1] || "0", height);
  const left = box.left + visualCssLength(css.left, box.width) + tx, top = box.top + visualCssLength(css.top, box.height) + ty;
  return { left, top, right: left + width, bottom: top + height, width, height };
}
function visualSortBadge(heading) {
  const step = heading.children.badge[0];
  if (!step) return visualPseudoBadge(heading);
  if (step.text !== "2") throw new Error("sorting step badge identity missing");
  return step.box;
}
function checkVisualSortLabels(result) {
  const headings = requireVisualRecords(result, "headings"), family = "C01-I009";
  const obstacles = headings.flatMap((heading) => [visualSortBadge(heading), ...heading.children.cues.map((cue) => cue.box)]);
  for (const heading of headings) {
    const label = heading.children.label[0];
    if (!label) throw new Error("sorting bin label missing");
    for (const obstacle of obstacles) if (label.glyphs.some((glyph) => visualOverlap(obstacle, glyph))) visualFailure(result, family, `${label.text} intersects sorting badge or category cue`);
    if (!heading.buttonInterior || label.glyphs.some((glyph) => !visualContains(heading.buttonInterior, glyph, 0))) visualFailure(result, family, `${label.text} leaves owning sorting button border interior`);
  }
}
function checkVisualTallySet(result, set) {
  const strokes = set.children.strokes;
  if (![5, 6, 10].includes(strokes.length)) return;
  result.witnesses.push({ tallyCount: strokes.length });
  const uprights = strokes.filter((value) => !value.crossing);
  for (const [first, second] of visualPairs(uprights)) if (visualOverlap(first.box, second.box, -0.1)) visualFailure(result, "C01-I008", `${strokes.length} tally strokes merge upright contours`);
  for (const crossing of strokes.filter((value) => value.crossing)) {
    const crossed = uprights.filter((value) => visualOverlap(crossing.box, value.box)).length;
    if (crossed !== 4) visualFailure(result, "C01-I008", `${strokes.length} tally slash crosses ${crossed} uprights, expected four`);
  }
}
function checkVisualHeader(result) {
  result.witnesses.push({ cssTrigSupport: result.cssTrigSupport });
  const rocket = requireVisualRecords(result, "rocket")[0], subtitle = requireVisualRecords(result, "subtitle")[0];
  if (subtitle.glyphs.some((glyph) => visualOverlap(rocket.box, glyph))) visualFailure(result, "KNOWN-ROCKET-SUBTITLE-OVERLAP", "rocket intersects subtitle glyphs");
}
function checkVisualTutorial(result) {
  const prompt = requireVisualRecords(result, "prompt")[0], graphics = requireVisualRecords(result, "graphics");
  for (const graphic of graphics) if (prompt.glyphs.some((glyph) => visualOverlap(graphic.box, glyph))) visualFailure(result, "KNOWN-TUTORIAL-PROMPT-OVERPRINT", "tutorial graphic intersects prompt glyphs");
}
function checkVisualAction(result) {
  const button = requireVisualRecords(result, "button")[0], caption = requireVisualRecords(result, "caption")[0];
  const [x = 0, y = 0, blur = 0, spread = 0] = visualShadowValues(button.paint.style["box-shadow"]), r = button.box;
  const shadow = { left: r.left + x - spread - blur / 2, right: r.right + x + spread + blur / 2, top: r.top + y - spread - blur / 2, bottom: r.bottom + y + spread + blur / 2 };
  if (caption.glyphs.some((glyph) => visualOverlap(shadow, glyph))) visualFailure(result, "NEW-ACTION-CAPTION-SHADOW-OVERLAP", "caption intersects action button shadow");
}

const VISUAL_GEOMETRY_CHECKS = Object.freeze({
  clock: checkVisualClock, capacity: checkVisualCapacity,
  numeral: checkVisualNumerals, endpoint: checkVisualNumerals, clear: checkVisualKeys, shape: checkVisualShapes, solid: checkVisualShapes,
  "number-line-labels": checkVisualNumberLine,
  "number-line-jump": checkVisualNumberLineJump,
  "sort-label": checkVisualSortLabels, tally: (result) => requireVisualRecords(result, "sets").forEach((set) => checkVisualTallySet(result, set)),
  session: (result) => checkSeparatedVisualGlyphs(result, requireVisualRecords(result, "labels", 2), "KNOWN-SESSION-LABEL-OVERLAP"),
  header: checkVisualHeader, tutorial: checkVisualTutorial, action: checkVisualAction,
});
export function visualDefectObservation(snapshot) {
  const result = { ...snapshot, witnesses: [], failures: [] };
  const kind = snapshot.kind.startsWith("tally") ? "tally" : snapshot.kind;
  if (!VISUAL_GEOMETRY_CHECKS[kind]) throw new Error(`Unknown visual geometry kind ${kind}`);
  VISUAL_GEOMETRY_CHECKS[kind](result);
  delete result.collections;
  return result;
}
async function observePaintedTallyContours(page) {
  const sets = page.locator("article.lab-question .tally-set:visible");
  const failures = [];
  for (let index = 0; index < await sets.count(); index += 1) {
    const set = sets.nth(index);
    const geometry = await set.evaluate((element) => {
      const outer = element.getBoundingClientRect();
      const strokes = [...element.querySelectorAll("i")];
      return { width: outer.width, height: outer.height, count: strokes.length, contours: strokes.filter((i) => !i.classList.contains("fifth")).map((i) => {
        const r = i.getBoundingClientRect();
        return { x: r.left + r.width / 2 - outer.left, top: r.top - outer.top, height: r.height, colour: getComputedStyle(i).backgroundColor.match(/[\d.]+/gu).slice(0, 3).map(Number) };
      }) };
    });
    if (![5, 6, 10].includes(geometry.count)) continue;
    const png = (await set.screenshot()).toString("base64");
    const visible = await page.evaluate(async ({ png, geometry }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      return geometry.contours.map((contour) => {
        let painted = 0;
        for (let step = 1; step <= 9; step += 1) {
          const x = Math.min(image.width - 1, Math.max(0, Math.floor(contour.x / geometry.width * image.width)));
          const y = Math.min(image.height - 1, Math.max(0, Math.floor((contour.top + contour.height * step / 10) / geometry.height * image.height)));
          const offset = (y * image.width + x) * 4;
          if (contour.colour.every((colour, channel) => Math.abs(pixels[offset + channel] - colour) < 35)) painted += 1;
        }
        return painted;
      });
    }, { png, geometry });
    if (visible.some((samples) => samples < 7)) failures.push({ family: "C01-I008", detail: `${geometry.count} tally: upright contour not visibly painted along its length` });
  }
  return failures;
}
async function openExistingHome(page) {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  const withoutName = page.getByRole("button", { name: "Continue without a name", exact: true });
  const home = page.getByRole("button", { name: "Home", exact: true });
  await expect(withoutName.or(page.getByRole("button", { name: /Start/u })).or(home).first()).toBeVisible();
  if (await withoutName.count()) await activate(withoutName, page);
  if (await home.isVisible()) await activate(home, page);
  await expect(page.getByRole("heading", { name: "Math Quest", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Start/u })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
export async function exerciseVisualDefectRegressions(page, { openHome = openExistingHome, record = () => {}, profiles = VISUAL_DEFECT_PROFILES } = {}) {
  const observations = [];
  const observe = async (kind, evidence, profile, scope, viewportState = "INITIAL") => {
    const specKind = kind.startsWith("tally") ? "tally" : kind;
    const geometry = await page.evaluate(readVisualDefectGeometry, { kind, scope: scope || "article.lab-question", specs: VISUAL_GEOMETRY_SPECS[specKind], styleProperties: VISUAL_GEOMETRY_STYLES });
    if (kind === "capacity") geometry.expectedCapacity = await page.evaluate(readOfficialVisualLabCapacity);
    if (kind.startsWith("number-line-")) geometry.expectedNumberLine = VISUAL_DEFECT_LAB_CASES.find((fixture) => fixture.evidence === evidence).numberLine;
    const result = visualDefectObservation(geometry);
    if (kind.startsWith("tally")) result.failures.push(...await observePaintedTallyContours(page));
    observations.push({ evidence, profile: profile.id, viewportState, ...result });
    await record(observations, page);
  };
  for (const profile of profiles) await exerciseVisualDefectProfile(page, profile, observe, openHome);
  await record(observations, page);
  const tallies = new Set(observations.flatMap((o) => o.witnesses.filter((w) => w.tallyCount).map((w) => w.tallyCount)));
  expect([...tallies].sort((a, b) => a - b), "actual lab tallies exercise five, six and ten").toEqual([5, 6, 10]);
  for (const observation of observations) expect.soft(observation.failures, `${observation.evidence} ${observation.profile} ${observation.kind}`).toEqual([]);
  return observations;
}
async function exerciseVisualDefectProfile(page, profile, observe, openHome) {
  await page.setViewportSize({ width: profile.width, height: profile.height });
  await openHome(page);
  const actual = await page.evaluate(() => ({ deviceScaleFactor: devicePixelRatio, touch: navigator.maxTouchPoints > 0 }));
  expect(actual, `${profile.id} must use its real context DPR and touch configuration`).toEqual({ deviceScaleFactor: profile.deviceScaleFactor, touch: profile.touch });
  await observe("header", "W090/W092/W094/W098", profile, "#app");
  await activateNamedButton(page, "Grown-ups corner");
  await observe("header", "W090/parent-view-header", profile, "#app");
  await activateNamedButton(page, "Parent test lab");
  for (const fixture of VISUAL_DEFECT_LAB_CASES) {
    await exerciseVisualDefectLabFixture(page, profile, fixture, observe);
  }
  await activateNamedButton(page, "Exit test lab");
  for (const level of [1, 3, 4]) await exerciseVisualDefectPreview(page, profile, level, observe);
}

async function exerciseVisualDefectLabFixture(page, profile, fixture, observe) {
    await selectVisualDefectLabCase(page, fixture);
    if (fixture.teachingShown) { await activate(page.locator('[data-lab-action="model"]'), page); await settled(page); }
    await observe(fixture.kind, fixture.evidence, profile);
    if (fixture.kind === "number-line-labels") await exerciseVisualNumberLineResize(page, profile, fixture, observe);
  }
async function exerciseVisualNumberLineResize(page, profile, fixture, observe) {
  const narrowWidth = profile.width <= 390 ? profile.width - 40 : 390;
  for (const [width, state] of [[narrowWidth, "RESIZED"], [profile.width, "RESIZE_RESTORED"]]) {
    await page.setViewportSize({ width, height: profile.height });
    await page.evaluate(() => new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
    await settled(page);
    await expectVisualLabIdentity(page, fixture);
    await observe(fixture.kind, fixture.evidence, profile, "article.lab-question", state);
  }
}
async function exerciseVisualDefectPreview(page, profile, level, observe) {
  await openVisualDefectPreview(page, level);
  await observe("session", level === 1 ? "C01P0872/W043" : "C01P0884", profile, "#app");
  if (level === 3) await exerciseVisualDefectAction(page, profile, observe);
  if (level === 4) await exerciseVisualDefectTutorial(page, profile, observe);
  await expect(page.getByRole("button", { name: "Home", exact: true })).toBeVisible();
  await activateNamedButton(page, "Home");
  await activateNamedButton(page, "Grown-ups corner");
}
async function openVisualDefectPreview(page, level) {
  await activate(page.getByRole("button", { name: new RegExp(`^Preview level ${level},`, "u") }), page);
  await activateNamedButton(page, "Start preview session");
  const choose = page.locator('button[data-action="choose-question"]:visible');
  if (await choose.count()) await activate(choose.first(), page);
  await expect(page.locator("section.question")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function exerciseVisualDefectAction(page, profile, observe) {
  await observe("action", "C01P0884/W045", profile, "section.question");
  await activate(page.locator('[data-response-action="direct-action"]'), page);
  await expect(page.locator(".action-result-choices")).toBeVisible();
  await observe("action", "C01P0884/W045/post-join", profile, "section.question");
}
async function exerciseVisualDefectTutorial(page, profile, observe) {
  const question = page.locator("section.question");
  await expect(question).toHaveAttribute("data-skill-id", "MQ-019");
  const originalPrompt = await question.locator(".prompt").innerText();
  await activate(page.locator('[data-action="tutorial"]:visible').first(), page);
  await activateNamedButton(page, "Next step");
  await observe("tutorial", "W065/tutorial-step-2", profile, "section.question");
  await activateNamedButton(page, "Back to your question");
  await expect(question.locator(".prompt")).toHaveText(originalPrompt);
}
