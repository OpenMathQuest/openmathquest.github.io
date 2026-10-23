import { activate, activateNamedButton, expect, visibleTutorialButton } from "./fixtures.mjs";
import { installSpeechFixture } from "./functional-art-journey.mjs";
import { loadShippedEngine } from "../lib/engine-loader.mjs";
import { baseUi, findActiveQuestion, stateWithUi } from "../tests/session-fixtures.mjs";

const C06_TEACHING_CASES = [
  ["C06-F01", "MQ-032", "question.multiplication", "PLAN"],
  ["C06-F01", "MQ-045", "question.multiplication", "PLAN"],
  ["C06-F02", "MQ-102", "question.moneyPurchase", "PLAN"],
  ["C06-F03", "MQ-046", "question.informalMeasure", "CHECK"],
  ["C06-F04", "MQ-106", "question.symmetryComplete", "NOTICE"],
  ["C06-F05", "MQ-097", "question.parity", "CHECK"],
  ["C06-F06", "MQ-114", "question.remainderFraction", "PLAN"],
  ["C06-F08", "MQ-043", "question.factFamilyBuild", "CHECK"],
  ["C06-F09", "MQ-057", "question.decimalCompare", "CHECK"],
  ["C06-F10", "MQ-122", "question.prismVolume", "NOTICE"],
  ["C06-F11", "MQ-018", "question.sortRecord", "NOTICE"],
  ["C06-F12", "MQ-006", "question.eventDuration", "NOTICE"],
  ["C06-F13", "MQ-051", "question.coinEquivalent", "NOTICE"],
  ["C06-DECIMAL", "MQ-099", "question.decimal", "QUESTION"],
  ["C06-DECIMAL", "MQ-099", "question.decimal", "NOTICE"],
  ["C06-DECIMAL", "MQ-099", "question.decimal", "PLAN"],
  ["C06-DECIMAL", "MQ-099", "question.decimal", "CHECK"],
];

async function c06LabFixture(page, [familyId, skillId, promptId, stepId]) {
  const candidate = await page.evaluate(({ familyId, skillId, promptId }) => {
    const e = window.MathQuestEngine, skill = e.SKILL_BY_ID[skillId];
    const representation = skill.phases.includes("P") ? "PICTORIAL" : "CONCRETE";
    for (let ordinal = 0; ordinal < 128; ordinal += 1) {
      const q = e.makeQuestion({ skillId, tier: "EASY", representation, seed: 1297175628, ordinal, eligibleQuestionOrdinal: ordinal, scheduledReview: false, coldTest: false, preview: true, theme: "ocean", scaffolded: true });
      if (q.semanticPromptStringId !== promptId) continue;
      const plan = e.makeTutorialPlan(q), example = plan?.example;
      if (!example || plan.answerDisclosurePolicy !== "DIFFERENT_ANSWER_REQUIRED") continue;
      const applicable = { "C06-F01": () => skillId !== "MQ-045" || example.params.groups !== example.params.a, "C06-F04": () => Boolean(example.params.shown), "C06-F05": () => !/×/.test(example.prompt), "C06-F13": () => Number(example.params.firstCount) > 4 };
      if (applicable[familyId] && !applicable[familyId]()) continue;
      return { familyId, skill: skillId, level: skill.level, representation, sample: ordinal + 1, questionId: q.questionId, example };
    }
    return null;
  }, { familyId, skillId, promptId });
  expect(candidate, `${familyId} governed Lab witness`).not.toBeNull();
  return { ...candidate, state: stepId === "QUESTION" ? "question" : "tutorial", step: { QUESTION: 0, NOTICE: 1, PLAN: 2, CHECK: 3 }[stepId], stepId };
}

async function assertC06F01({ panel, p }) {
  const groups = panel.locator(".stimulus .visual-item");
    await expect(groups).toHaveCount(Number(p.groups ?? p.a));
    for (const group of await groups.all()) await expect(group.locator(".counter-set-visual i,.pattern-visual i,.tally-set i,.manipulative-set i")).toHaveCount(Number(p.perGroup ?? p.b));
}

async function assertC06F02({ panel }) {
  await expect(panel.locator(".tutorial-instruction")).not.toContainText("groups equal");
}

async function assertC06F03({ panel, p }) {
  const units = panel.locator(".model .unit-measure i");
    await expect(units).toHaveCount(Number(p.count));
    const boxes = await units.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, width: r.width }; }));
    expect(boxes.every(box => box.width >= 8 && Math.abs(box.y - boxes[0].y) < 1)).toBe(true);
    expect(boxes.slice(1).every((box, index) => Math.abs(box.x - boxes[index].right) < 1)).toBe(true);
}

async function assertC06F04({ panel, p }) {
  await expect(panel.locator(".stimulus [data-shown-symmetry-line]")).toHaveCount(Number(p.shown));
}

async function assertC06F05({ panel, example }) {
  const expression = /(\d+)\s*([+−-])\s*(\d+)/u.exec(example.prompt);
    expect(expression).not.toBeNull();
    const sameParity = Number(expression[1]) % 2 === Number(expression[3]) % 2;
    await expect(panel.locator("[data-worked-strategy]")).toHaveAttribute("data-worked-strategy", sameParity ? "same-parity numbers give an even result" : "different-parity numbers give an odd result");
}

async function assertC06F06({ page, panel, p }) {
  const cards = panel.locator(".stimulus .array-summary .model-card");
    const group = cards.filter({ has: page.locator(".model-label", { hasText: /^groups$/ }) });
    await expect(group.locator(".model-value")).toHaveText(String(p.divisor));
    await expect(cards.filter({ hasText: "in each group" })).toHaveCount(0);
}

async function assertC06F08({ panel, p }) {
  const a = Number(p.a), b = Number(p.b), total = Number(p.whole);
    const equations = p.equationFamily === "multiply-divide" ? [`${a} × ${b} = ${total}`, `${b} × ${a} = ${total}`, `${total} ÷ ${a} = ${b}`, `${total} ÷ ${b} = ${a}`] : [`${a} + ${b} = ${total}`, `${b} + ${a} = ${total}`, `${total} − ${a} = ${b}`, `${total} − ${b} = ${a}`];
    for (const equation of equations) await expect(panel.locator(".worked-result")).toContainText(equation);
    await expect(panel.locator(".worked-result")).not.toContainText("fact family");
}

async function assertC06F09({ panel }) {
  const source = await panel.locator(".stimulus .number-line-exact").boundingBox(), worked = await panel.locator(".model .number-line-exact").boundingBox();
    expect(source).not.toBeNull(); expect(worked).not.toBeNull(); expect(worked.width).toBeGreaterThanOrEqual(source.width - 20);
}

async function assertC06F10({ panel }) {
  const observations = await panel.locator(".stimulus .prism-visual").evaluateAll(nodes => nodes.map(node => ({
    paintedBottom: Math.max(...[...node.querySelectorAll("polygon,polyline")].map(shape => shape.getBoundingClientRect().bottom)),
    labels: [...node.querySelectorAll(".model-label,svg text")].map(label => { const r = label.getBoundingClientRect(); return { top: r.top, height: r.height }; }),
  })));
  expect(observations.length).toBeGreaterThan(0);
  for (const observation of observations) {
    expect(Number.isFinite(observation.paintedBottom)).toBe(true);
    expect(observation.labels.length).toBeGreaterThan(0);
    expect(observation.labels.every(label => label.height > 0 && label.top >= observation.paintedBottom + 1)).toBe(true);
  }
}

async function assertC06F11({ panel, example }) {
  const count = example.modelDescriptor.values.data.responses.length;
    await expect(panel.locator(".stimulus [data-source-response]")).toHaveCount(count);
    await expect(panel.locator(".stimulus .discrete-mark")).toHaveCount(count);
}

async function assertC06F12({ panel }) {
  await expect(panel.locator(".stimulus [data-duration-event]")).toHaveCount(2);
}

async function assertC06F13({ panel, p }) {
  const row = panel.locator(".stimulus .proportional-row").first();
    await expect(row.locator(".proportional-label-key span")).toHaveCount(Number(p.firstCount));
    for (const segment of await row.locator(".proportional-segment").all()) await expect(segment).toHaveText("");
}

async function assertDecimalSource(panel) {
  expect(await panel.locator(".stimulus .decimal-card").count()).toBe(0);
  const labels = await panel.locator(".stimulus .math-model").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label") || ""));
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.every(label => !/\d+\.\d+/u.test(label))).toBe(true);
  const source = panel.locator(".stimulus");
  expect(await source.innerText()).not.toMatch(/\d+\.\d+/u);
  const descriptions = await source.evaluate(node => [node, ...node.querySelectorAll("*")].flatMap(el => [el.getAttribute("aria-label"), el.getAttribute("aria-description"), ...(el.getAttribute("aria-describedby") || "").split(/\s+/u).map(id => document.getElementById(id)?.textContent)]).filter(Boolean));
  expect(descriptions.every(text => !/\d+\.\d+/u.test(text))).toBe(true);
  await assertDecimalSourceLabels(source);
}

async function assertDecimalSourceLabels(source) {
  await expect(source.locator(".fraction-representation")).toHaveCount(1);
  const fraction = await source.locator(".fraction-representation b").innerText();
  expect((await source.innerText()).split(/\s+/u).filter(word => word === fraction)).toHaveLength(1);
  await expect(source.locator(".fraction-relation")).toHaveCount(0);
}

async function verifyDecimalExposureControls(panel, decimal) {
  const source = panel.locator(".stimulus .math-model");
  const original = await source.getAttribute("aria-label");
  for (const kind of ["visible", "plain-text", "accessible", "duplicate-fraction", "relation-caption"]) {
    await source.evaluate((node, { kind, decimal }) => {
      if (kind !== "accessible") { const card = document.createElement("span"); card.className = kind === "visible" ? "decimal-card" : kind === "relation-caption" ? "fraction-relation" : "model-label"; card.dataset.decimalControl = "true"; card.textContent = kind === "duplicate-fraction" ? node.querySelector(".fraction-representation b").textContent : kind === "relation-caption" ? "value" : decimal; node.append(card); }
      else node.setAttribute("aria-label", `${node.getAttribute("aria-label")} Decimal ${decimal}`);
    }, { kind, decimal });
    let rejected = false;
    try { await assertDecimalSource(panel); } catch { rejected = true; }
    finally { await source.evaluate((node, label) => { node.querySelectorAll("[data-decimal-control]").forEach(card => card.remove()); node.setAttribute("aria-label", label); }, original); }
    expect(rejected, `NC-DECIMAL-${kind.toUpperCase()}-RESPONSE-EXPOSURE`).toBe(true);
  }
  await assertDecimalSource(panel);
}

async function assertC06Decimal({ panel, example, stepId }) {
  await assertDecimalSource(panel);
  if (stepId === "CHECK") {
    await expect(panel.locator(".model .decimal-card")).toHaveText(String(example.answer.value));
    await expect(panel.locator(".model .worked-result")).toContainText(String(example.answer.value));
    await verifyDecimalExposureControls(panel, String(example.answer.value));
  } else await expect(panel.locator(".model[data-worked-result]")).toHaveCount(0);
}

const C06_TEACHING_CHECKERS = {
  "C06-F01": assertC06F01,
  "C06-F02": assertC06F02,
  "C06-F03": assertC06F03,
  "C06-F04": assertC06F04,
  "C06-F05": assertC06F05,
  "C06-F06": assertC06F06,
  "C06-F08": assertC06F08,
  "C06-F09": assertC06F09,
  "C06-F10": assertC06F10,
  "C06-F11": assertC06F11,
  "C06-F12": assertC06F12,
  "C06-F13": assertC06F13,
  "C06-DECIMAL": assertC06Decimal
};

export async function assertC06TeachingState(page, { familyId, example, stepId }) {
  const panel = page.locator(stepId === "QUESTION" ? "article.lab-question" : '[data-tutorial="different-example"]');
  await C06_TEACHING_CHECKERS[familyId]({ page, panel, p: example.params, example, stepId });
  if (stepId !== "QUESTION") await expect(panel).toHaveAttribute("data-tutorial-phase-id", stepId);
}

export async function exerciseC06TeachingRepairs(page, reachCase) {
  for (const record of C06_TEACHING_CASES) {
    const fixture = await c06LabFixture(page, record);
    await reachCase(page, fixture);
    await assertC06TeachingState(page, fixture);
    if (fixture.familyId === "C06-DECIMAL" && fixture.stepId !== "QUESTION") {
      await activate(page.locator('[data-lab-action="tutorial-back"]'), page);
      const question = page.locator("article.lab-question");
      await expect(question).toHaveAttribute("data-question-id", fixture.questionId);
      await assertDecimalSource(question);
    }
  }
  await exerciseDecimalReplay(page);
}

async function assertDecimalReplay(page, sourceAnswer, workedAnswer = null) {
  const before = await page.evaluate(() => window.__mqSpeechTest.count());
  await activate(page.locator('[data-action="replay"]'), page);
  const texts = await page.evaluate(() => window.__mqSpeechTest.texts());
  expect(texts.length).toBe(before + 1);
  const decimals = texts.at(-1).match(/\d+\.\d+/gu) || [];
  expect(decimals).not.toContain(String(sourceAnswer));
  if (workedAnswer === null) expect(decimals).toEqual([]);
  else expect(decimals).toContain(String(workedAnswer));
  await page.evaluate(() => window.__mqSpeechTest.end());
}

async function verifyReplayExposureControl(page, sourceAnswer) {
  await page.evaluate(answer => {
    window.__decimalOriginalSpeak = speechSynthesis.speak;
    speechSynthesis.speak = utterance => { utterance.text += ` ${answer}`; window.__decimalOriginalSpeak(utterance); };
  }, sourceAnswer);
  let rejected = false;
  try { await assertDecimalReplay(page, sourceAnswer); } catch { rejected = true; }
  finally { await page.evaluate(() => { speechSynthesis.speak = window.__decimalOriginalSpeak; delete window.__decimalOriginalSpeak; window.__mqSpeechTest.end(); }); }
  expect(rejected, "NC-DECIMAL-REPLAY-ONLY-EXPOSURE").toBe(true);
  await assertDecimalReplay(page, sourceAnswer);
}

async function decimalReplayFixture() {
  const { engine } = await loadShippedEngine(new URL("../../index.html", import.meta.url));
  const q = findActiveQuestion(engine, q => q.semanticPromptStringId === "question.decimal" && q.inputMethod === "NUMBER_PAD", { skillId: "MQ-099" });
  const state = stateWithUi(engine, baseUi(q)), plan = engine.makeTutorialPlan(q);
  expect(engine.validateState(state), "canonical synthetic decimal session").toBeNull();
  expect(plan.answerDisclosurePolicy).toBe("DIFFERENT_ANSWER_REQUIRED");
  return { key: engine.CONSTANTS.STORAGE_NAMESPACE, bytes: engine.exportState(state), questionId: q.questionId, answerOracle: q.answer.value, workedAnswer: plan.example.answer.value };
}

async function assertOrdinaryDecimalSource(page) {
  const question = page.locator('section.question[data-skill-id="MQ-099"]');
  await expect(question).toBeVisible();
  await expect(question.locator("[data-answerbox]")).toHaveRole("status");
  await expect(question.locator("[data-answerbox]")).toHaveAccessibleName("Your answer");
  await assertDecimalSource(question);
}

async function verifyDecimalReplayStep(page, step, fixture) {
  const panel = page.locator('[data-tutorial="different-example"]');
  await expect(panel).toHaveAttribute("data-tutorial-phase-id", step);
  await assertDecimalSource(panel);
  await assertDecimalReplay(page, fixture.answerOracle, step === "CHECK" ? fixture.workedAnswer : null);
}

async function walkDecimalReplayTutorial(page, fixture) {
  await activate(visibleTutorialButton(page), page);
  for (const step of ["NOTICE", "PLAN", "CHECK"]) {
    await verifyDecimalReplayStep(page, step, fixture);
    if (step !== "CHECK") await activateNamedButton(page, "Next step");
  }
}

async function verifyDecimalReplayReturn(page, fixture) {
  await activateNamedButton(page, "Back to your question");
  const returnedId = await page.evaluate(() => { const e = window.MathQuestEngine; return JSON.parse(localStorage.getItem(e.CONSTANTS.STORAGE_NAMESPACE)).activeSession.uiState.question.questionId; });
  expect(returnedId).toBe(fixture.questionId);
  await assertOrdinaryDecimalSource(page);
  await assertDecimalReplay(page, fixture.answerOracle);
  await verifyReplayExposureControl(page, fixture.answerOracle);
}

async function exerciseDecimalReplay(page) {
  await installSpeechFixture(page);
  const fixture = await decimalReplayFixture();
  await page.evaluate(({ key, bytes }) => localStorage.setItem(key, bytes), fixture);
  await page.reload({ waitUntil: "domcontentloaded" });
  await assertOrdinaryDecimalSource(page);
  await assertDecimalReplay(page, fixture.answerOracle);
  await walkDecimalReplayTutorial(page, fixture);
  await verifyDecimalReplayReturn(page, fixture);
}
