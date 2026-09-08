import { sortPlacementsFromDescriptor } from "./sort-response-fixtures.mjs";

function recipientHistory(items, recipients) {
  return items.map((item) => {
    const destination = Object.entries(recipients).find(([, placed]) => placed.includes(item))?.[0];
    return [destination, item];
  });
}

function distinctPartition(whole, p, engine) {
  const original = [Number(p.firstA), Number(p.firstB)].sort((left, right) => left - right);
  return Array.from({ length: Math.max(0, whole - 1) }, (_, index) => index + 1)
    .find((candidate) => {
      const proposal = [candidate, whole - candidate].sort((left, right) => left - right);
      return candidate > 0 && whole - candidate > 0 && engine.canonical(proposal) !== engine.canonical(original);
    });
}

const builders = Object.freeze({
  COUNT_TOUCH({ state, answer, count }) {
    state.touched = Array.from({ length: count }, (_, index) => `i${index}`);
    state.count = answer;
    return state;
  },
  ORDER_BUILD({ state, p, count }) {
    state.order = [Number(p.before), count, Number(p.after)];
    return state;
  },
  PLACE_VALUE_BUILD({ state, answer, question }) {
    state.action = question.semanticPromptStringId === "question.renamePlace"
      ? "trade"
      : question.semanticPromptStringId === "question.scalePlace"
        ? "shift"
        : ["question.addition", "question.appliedAddition", "question.subtraction", "question.appliedSubtraction"].includes(question.semanticPromptStringId)
          ? "partition"
          : "build";
    state.value = answer;
    return state;
  },
  STRATEGY_BUILD({ state, question, correctStrategyBuildResponse }) {
    const response = correctStrategyBuildResponse(
      question,
      question.skillId === "MQ-095" ? "mental" : null,
    );
    state.strategy = response.strategy;
    state.work = [...response.work];
    state.value = response.value;
    return state;
  },
  COIN_BUILD({ state, p, answer }) {
    const coinCount = Number(answer);
    const coinValue = coinCount > 0 ? Number(p.amount) / coinCount : Number.NaN;
    state.coins = Array.from({ length: coinCount }, () => coinValue);
    return state;
  },
  SYMMETRY_BUILD({ state, p, count }) {
    state.lines = Array.isArray(p.requiredLineIds)
      ? [...p.requiredLineIds]
      : Array.from({ length: count }, (_, index) => `line${index + 1}`);
    return state;
  },
  EXPRESSION_BUILD({ state, p, answer }) {
    state.rule = String(p.rule);
    state.value = answer;
    return state;
  },
  PAIR_LINK({ state, p, question }) {
    const pairs = Math.min(Number(p.leftCount ?? p.count), Number(p.rightCount ?? p.count));
    state.links = Array.from({ length: pairs }, (_, index) => [`a${index}`, `b${index}`]);
    state.pending = null;
    if (Object.hasOwn(state, "relation")) state.relation = String(question.answer.value);
    return state;
  },
  SORT_BINS({ state, question }) {
    state.placements = sortPlacementsFromDescriptor(question);
    state.pending = null;
    return state;
  },
  SHARE_DEAL({ state, p }) {
    const groups = Number(p.recipients);
    const perGroup = Math.floor(Number(p.total) / groups);
    const items = Array.from({ length: Number(p.total) }, (_, index) => `item${index}`);
    state.recipients = Object.fromEntries(Array.from({ length: groups }, (_, index) => [
      `r${index + 1}`,
      items.slice(index * perGroup, (index + 1) * perGroup),
    ]));
    state.pool = items.slice(groups * perGroup);
    state.history = recipientHistory(items.slice(0, groups * perGroup), state.recipients);
    return state;
  },
  GROUP_BUILD({ state, p }) {
    const groups = Number(p.groups ?? p.a);
    const perGroup = Number(p.perGroup ?? p.b);
    const items = Array.from({ length: groups * perGroup }, (_, index) => `item${index}`);
    state.recipients = Object.fromEntries(Array.from({ length: groups }, (_, index) => [
      `g${index + 1}`,
      items.slice(index * perGroup, (index + 1) * perGroup),
    ]));
    state.pool = [];
    state.history = recipientHistory(items, state.recipients);
    return state;
  },
  BOND_SPLIT({ state, p, count, question, engine, issue }) {
    const whole = Number(p.whole);
    let first = Number(p.part);
    let second = count;
    if (question.semanticPromptStringId === "question.secondPartition") {
      first = distinctPartition(whole, p, engine);
      if (!Number.isInteger(first)) {
        issue(`${question.skillId}: no distinct second partition fixture is reachable`);
        return null;
      }
      second = whole - first;
    }
    const items = Array.from({ length: whole }, (_, index) => `item${index}`);
    state.groups = { g1: items.slice(0, first), g2: items.slice(first, first + second) };
    state.pool = [];
    state.history = items.map((item) => [state.groups.g1.includes(item) ? "g1" : "g2", item]);
    return state;
  },
  PATTERN_BUILD({ state, answer }) {
    state.tokens = answer.trim().split(/\s+/u).filter(Boolean);
    return state;
  },
  LANDMARK_PLACE({ state, answer }) {
    state.relation = answer;
    return state;
  },
  SLOT_COMPOSER({ state, p, answer, question }) {
    const operation = /subtraction|leaving/iu.test(question.semanticPromptStringId) ? "\u2212" : "+";
    state.slots = [String(p.a), operation, String(p.b), "=", answer];
    state.actions = [];
    return state;
  },
  FACT_FAMILY({ state, p }) {
    const a = Number(p.a), b = Number(p.b), whole = Number(p.whole);
    state.selected = p.equationFamily === "multiply-divide"
      ? [`${a}\u00d7${b}=${whole}`, `${b}\u00d7${a}=${whole}`, `${whole}\u00f7${a}=${b}`, `${whole}\u00f7${b}=${a}`]
      : [`${a}+${b}=${whole}`, `${b}+${a}=${whole}`, `${whole}\u2212${a}=${b}`, `${whole}\u2212${b}=${a}`];
    return state;
  },
  GRAPH_BUILD({ state, p, answer, question }) {
    const keys = ["circles", "triangles", "cats", "dogs", "birds", "first", "second", "symbols"];
    state.categories = Object.fromEntries(keys.filter((key) => Number.isFinite(Number(p[key]))).map((key) => [key, Number(p[key])]));
    if (question.semanticPromptStringId === "question.surveyResponseList") state.interpretation = answer;
    if (question.semanticPromptStringId === "question.scaledSurveyPlan") state.scale = answer;
    return state;
  },
  FRACTION_PARTITION({ state, answer, question, engine, issue }) {
    const value = engine.parseRational(answer);
    const denominator = Number(state.denominator);
    const shadedCount = value ? Math.abs(Number(value.n)) * denominator / Number(value.d) : Number.NaN;
    if (!Number.isInteger(shadedCount)) {
      issue(`${question.skillId}: fraction partition fixture is unreachable`);
      return null;
    }
    state.templateId = denominator === 2 ? "radial" : "vertical";
    state.shaded = Array.from({ length: shadedCount }, (_, index) => `part${index}`);
    return state;
  },
  GRID_ROUTE({ state, p, question, engine, issue }) {
    state.moves = Array.isArray(p.moves) ? [...p.moves] : [];
    const trace = engine.traceGridRoute(question, state.moves);
    if (!trace) {
      issue(`${question.skillId}: grid route cannot be traced from its displayed start`);
      return null;
    }
    state.end = { ...trace.end };
    return state;
  },
  CLOCK_READ({ state, answer }) {
    const match = answer.match(/^(\d+):(\d{2})$/u);
    state.hour = match?.[1] ?? "";
    state.minute = match?.[2] ?? "";
    return state;
  },
  METRIC_SCALE({ state, answer }) {
    state.value = answer;
    return state;
  },
  ANGLE_MEASURE({ state, answer }) {
    state.degrees = answer;
    return state;
  },
  ACTION_SCENE({ state, p, answer, question }) {
    state.value = answer;
    state.actions = Array.from(
      { length: Math.abs(Number(p.b) || 0) },
      () => /subtraction|leaving/iu.test(question.semanticPromptStringId) ? "remove" : "join",
    );
    return state;
  },
  MEASURE_OBJECT({ state, p, answer }) {
    state.value = answer;
    state.actions = Array.from({ length: Number(p.count) }, () => "place-unit");
    return state;
  },
  AREA_DECOMPOSE({ state, p, answer }) {
    state.cutIds = ["cut1"];
    state.part0 = String(Number(p.l1) * Number(p.w1));
    state.part1 = String(Number(p.l2) * Number(p.w2));
    state.total = answer;
    return state;
  },
  VOLUME_INSPECT({ state, p, answer }) {
    state.viewedLayers = Array.from({ length: Number(p.height) }, (_, index) => index + 1);
    state.method = String(p.method);
    state.value = answer;
    return state;
  },
});

export function buildExhaustiveResponseState(question, { engine, issue, correctStrategyBuildResponse }) {
  const state = engine.createResponseState(question);
  const p = question.params ?? {};
  const answer = String(question.answer?.value ?? "");
  const count = Number(question.answer?.value);
  if (typeof question.inputMethod !== "string" || !Object.hasOwn(builders, question.inputMethod)) {
    issue(question.skillId + ": audit lacks a structured response fixture for " + question.inputMethod);
    return null;
  }
  return builders[question.inputMethod]({ state, p, answer, count, question, engine, issue, correctStrategyBuildResponse });
}
