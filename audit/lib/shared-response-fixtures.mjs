import { sortPlacementsFromDescriptor } from "./sort-response-fixtures.mjs";

// Shared input construction only; caller-specific mathematical checks remain separate.
function indexedItems(prefix, count) {
  return Array.from({ length: Math.max(0, Number(count) || 0) }, (_, index) => `${prefix}${index}`);
}

function coinValueCents(label) {
  const text = String(label ?? "").trim();
  const value = Number(text.replace(/[^\d]/gu, ""));
  return text.startsWith("$") ? value * 100 : value;
}

const responseBuilders = Object.freeze({
  COUNT_TOUCH({ state, question }) {
    state.touched = indexedItems("i", Number(question.answer.value));
    state.count = String(question.answer.value);
  },
  ORDER_BUILD({ state, question, p }) {
    state.order = [Number(p.before), Number(question.answer.value), Number(p.after)];
  },
  PLACE_VALUE_BUILD({ state, question, p }) {
    state.action = Array.isArray(p.strategyChoices)
      ? String(p.strategyAny ? p.strategyChoices[0] : p.strategy)
      : question.semanticPromptStringId === "question.renamePlace" ? "trade"
        : question.semanticPromptStringId === "question.scalePlace" ? "shift"
          : ["question.addition", "question.appliedAddition", "question.subtraction", "question.appliedSubtraction"].includes(question.semanticPromptStringId) ? "partition"
            : "build";
    state.value = question.answer.kind === "text" ? String(question.answer.value) : Number(question.answer.value);
  },
  COIN_BUILD({ state, question, p }) {
    state.coins = Array.from({ length: Number(question.answer.value) }, () => coinValueCents(p.secondCoin));
  },
  SYMMETRY_BUILD({ state, question, p }) {
    state.lines = Array.isArray(p.requiredLineIds)
      ? [...p.requiredLineIds]
      : Array.from({ length: Number(question.answer.value) }, (_, index) => `line${index + 1}`);
  },
  EXPRESSION_BUILD({ state, question, p }) {
    state.rule = String(p.rule);
    state.value = Number(question.answer.value);
  },
  PAIR_LINK({ state, question, p }) {
    state.links = Array.from(
      { length: Math.min(Number(p.leftCount ?? p.count), Number(p.rightCount ?? p.count)) },
      (_, index) => [`a${index}`, `b${index}`],
    );
    if (Object.hasOwn(state, "relation")) state.relation = String(question.answer.value);
  },
  SORT_BINS({ state, question }) {
    state.placements = sortPlacementsFromDescriptor(question);
  },
  SHARE_DEAL({ state, p }) {
    const recipientCount = Number(p.recipients);
    const total = Number(p.total);
    const remainder = total % recipientCount;
    let next = 1;
    while (state.pool.length > remainder) {
      const recipient = `r${next}`;
      const item = state.pool.shift();
      state.recipients[recipient].push(item);
      state.history = (state.history || []).concat([[recipient, item]]);
      next = next % recipientCount + 1;
    }
  },
  GROUP_BUILD({ state, p }) {
    const groups = Number(p.groups ?? p.a);
    let next = 1;
    while (state.pool.length) {
      const recipient = `g${next}`;
      const item = state.pool.shift();
      state.recipients[recipient].push(item);
      state.history = (state.history || []).concat([[recipient, item]]);
      next = next % groups + 1;
    }
  },
  BOND_SPLIT({ state, question, p }) {
    const counts = question.semanticPromptStringId === "question.secondPartition"
      ? [Number(p.secondA), Number(question.answer.value)]
      : [Number(p.part), Number(question.answer.value)];
    while (state.groups.g1.length < counts[0]) {
      const item = state.pool.shift();
      state.groups.g1.push(item);
      state.history.push(["g1", item]);
    }
    while (state.groups.g2.length < counts[1]) {
      const item = state.pool.shift();
      state.groups.g2.push(item);
      state.history.push(["g2", item]);
    }
  },
  PATTERN_BUILD({ state, question }) {
    state.tokens = String(question.answer.value).trim().split(/\s+/u).filter(Boolean);
  },
  LANDMARK_PLACE({ state, question }) {
    state.relation = String(question.answer.value);
  },
  SLOT_COMPOSER({ state, question, p }) {
    const operation = /subtraction|leaving/iu.test(question.semanticPromptStringId) ? "\u2212" : "+";
    state.slots = [String(p.a), operation, String(p.b), "=", String(question.answer.value)];
  },
  FACT_FAMILY({ state, p }) {
    const a = Number(p.a), b = Number(p.b), whole = Number(p.whole);
    state.selected = p.equationFamily === "multiply-divide"
      ? [`${a}×${b}=${whole}`, `${b}×${a}=${whole}`, `${whole}÷${a}=${b}`, `${whole}÷${b}=${a}`]
      : [`${a}+${b}=${whole}`, `${b}+${a}=${whole}`, `${whole}\u2212${a}=${b}`, `${whole}\u2212${b}=${a}`];
  },
  GRAPH_BUILD({ state, question, p }) {
    const keys = ["circles", "triangles", "cats", "dogs", "birds", "first", "second", "symbols"];
    state.categories = Object.fromEntries(keys.filter((key) => Number.isFinite(Number(p[key]))).map((key) => [key, Number(p[key])]));
    if (question.semanticPromptStringId === "question.surveyResponseList") state.interpretation = String(question.answer.value);
    if (question.semanticPromptStringId === "question.scaledSurveyPlan") state.scale = Number(question.answer.value);
  },
  METRIC_SCALE({ state, question }) {
    state.value = Number(question.answer.value);
  },
  ANGLE_MEASURE({ state, question }) {
    state.degrees = Number(question.answer.value);
  },
  ACTION_SCENE({ state, question, p }) {
    state.actions = Array.from(
      { length: Math.abs(Number(p.b)) },
      () => /subtraction|leaving/iu.test(question.semanticPromptStringId) ? "remove" : "join",
    );
    state.value = String(question.answer.value);
  },
  MEASURE_OBJECT({ state, p }) {
    state.actions = Array.from({ length: Number(p.count) }, () => "place-unit");
    state.value = String(p.count);
  },
  AREA_DECOMPOSE({ state, question, p }) {
    state.cutIds = ["cut1"];
    state.part0 = String(Number(p.l1) * Number(p.w1));
    state.part1 = String(Number(p.l2) * Number(p.w2));
    state.total = String(question.answer.value);
  },
  VOLUME_INSPECT({ state, question, p }) {
    state.viewedLayers = Array.from({ length: Number(p.height) }, (_, index) => index + 1);
    state.method = String(p.method);
    state.value = String(question.answer.value);
  },
});

export function applySharedResponseFixture(method, context) {
  if (typeof method !== "string" || !Object.hasOwn(responseBuilders, method)) return false;
  responseBuilders[method](context);
  return true;
}
