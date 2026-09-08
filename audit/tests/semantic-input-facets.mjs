// Independent curriculum obligations; these do not supply production answers.
const rules = Object.freeze({
  "MQ-003"({ questions, requireCondition, skill }) {
    requireCondition(questions.every((question) => question.inputMethod === "PAIR_LINK"
      && question.semanticPromptStringId === "question.compare"
      && Number.isInteger(Number(question.params.leftCount))
      && Number.isInteger(Number(question.params.rightCount))
      && Number(question.params.leftCount) >= 0
      && Number(question.params.rightCount) >= 0), `${skill.id}: comparison does not require one-to-one pairing`);
  },
  "MQ-027"({ questions, requireCondition, skill }) {
    requireCondition(questions.every((question) => question.options.length >= 2
      && question.options.every((option) => /^\d+$/u.test(String(option.value)))
      && question.options.filter((option) => String(option.value) === String(question.answer.value)).length === 1), `${skill.id}: one-more/less distractors are not unique numeric candidates`);
  },
  "MQ-031"({ questions, requireCondition, skill }) {
    requireCondition(questions.every((question) => question.inputMethod === "NUMBER_PAD" && question.inputClass === "CONSTRUCTION"), `${skill.id}: numeral formation is not constructive`);
  },
  "MQ-035"({ questions, requireCondition, skill }) {
    const expectedByTask = new Map([
      ["compare-two-objects-directly", ["question.directCompare", "compare"]],
      ["name-compared-attribute", ["question.attributeName", "name-attribute"]],
    ]);
    requireCondition(questions.every((question) => {
      const expected = expectedByTask.get(question.taskType);
      return expected && question.semanticPromptStringId === expected[0] && question.params.evidenceFacet === expected[1];
    }), `${skill.id}: declared comparison task type is not bound to its evidence`);
  },
  "MQ-048"({ canonical, questions, requireCondition, requireSet, skill, values }) {
    const expectedValues = ["5¢", "10¢", "25¢", "$1", "$2"];
    const expectedByTask = new Map([
      ["match-practice-token-5-cents", ["single-dot", "5¢"]],
      ["match-practice-token-10-cents", ["double-stripe", "10¢"]],
      ["match-practice-token-25-cents", ["triangle-dots", "25¢"]],
      ["match-practice-token-1-dollar", ["cross-bars", "$1"]],
      ["match-practice-token-2-dollars", ["ring-diamond", "$2"]],
    ]);
    requireCondition(questions.every((question) => question.options.length === 5
      && canonical(question.options.map((option) => option.value).sort()) === canonical([...expectedValues].sort())
      && question.options.filter((option) => option.value === question.answer.value).length === 1
      && expectedByTask.get(question.taskType)?.[0] === question.params.tokenId
      && expectedByTask.get(question.taskType)?.[1] === question.answer.value), `${skill.id}: token task mapping or answer presence leaks through the choice set`);
    requireSet(values((question) => question.params.tokenId), ["single-dot", "double-stripe", "triangle-dots", "cross-bars", "ring-diamond"], "practice-token identity");
  },
  "MQ-040"({ canonical, correctStrategyBuildResponse, engine, questions, requireCondition, requireSet, skill, strategyMethodOracle, strategyResultOracle, strategyWorkOracle, values }) {
    requireSet(values((question) => strategyMethodOracle(question)), skill.constraints.strategies, "strategy witness");
    requireCondition(questions.every((question) => {
      const response = correctStrategyBuildResponse(question);
      return question.inputMethod === "STRATEGY_BUILD"
        && canonical(Object.keys(response).sort()) === canonical(["strategy", "value", "work"])
        && response.strategy === strategyMethodOracle(question)
        && canonical(response.work) === canonical(strategyWorkOracle(question))
        && response.value === strategyResultOracle(question)
        && engine.gradeAnswer(question, response).correct;
    }), `${skill.id}: independent method, work, and result evidence is not collected`);
  },
  "MQ-058"({ questions, requireCondition, skill }) {
    requireCondition(questions.filter((question) => question.taskType === "addition").every((question) => ["question.addition", "question.appliedAddition"].includes(question.semanticPromptStringId)), `${skill.id}: addition witness does not display addition`);
    requireCondition(questions.filter((question) => question.taskType === "subtraction").every((question) => question.semanticPromptStringId === "question.factFamily"), `${skill.id}: subtraction witness does not display subtraction`);
  },
  "MQ-063"({ ids, questions, requireCondition, requireSet, skill, values }) {
    requireSet(ids, ["question.relatedMultiplyDivide", "question.factFamilyBuild"], "model/equation link");
    requireSet(values((question) => question.params.evidenceFacet), ["group-model", "related-equations"], "multiplication/division evidence");
    requireCondition(questions.every((question) => question.taskType === "write-related-multiplication-and-division-equations"
      ? question.semanticPromptStringId === "question.factFamilyBuild" && question.params.evidenceFacet === "related-equations" && question.inputMethod === "FACT_FAMILY"
      : question.taskType === "model-related-multiplication-and-division" && question.semanticPromptStringId === "question.relatedMultiplyDivide" && question.params.evidenceFacet === "group-model" && question.inputMethod === "GROUP_BUILD"), `${skill.id}: declared link task omits its constructive response`);
  },
  "MQ-071"({ questions, requireCondition, skill }) {
    requireCondition(questions.every((question) => question.inputMethod === "GRID_ROUTE"
      && question.params.keyRequired === true
      && question.params.landmarks?.length >= 2
      && question.params.mapKey?.length >= 2
      && question.params.mapKey.every((entry) => entry.symbol && entry.label)), `${skill.id}: required map key or landmarks are missing`);
  },
  "MQ-078"({ answerNumber, questions, requireCondition, skill }) {
    requireCondition(questions.every((question) => answerNumber(question) <= 12), `${skill.id}: known-fact quotient exceeds twelve`);
  },
  "MQ-079"({ correctStrategyBuildResponse, engine, questions, requireCondition, requireSet, skill, strategyMethodOracle, values }) {
    requireSet(values((question) => strategyMethodOracle(question)), ["partition", "array", "written layout"], "multiplication strategy");
    requireCondition(questions.every((question) => {
      const operands = [Number(question.params.a), Number(question.params.b)];
      const response = correctStrategyBuildResponse(question);
      return question.inputMethod === "STRATEGY_BUILD"
        && operands.filter((value) => value >= 10 && value <= 99).length === 1
        && operands.filter((value) => value >= 1 && value <= 9).length === 1
        && response.value === operands[0] * operands[1]
        && engine.gradeAnswer(question, response).correct;
    }), `${skill.id}: exact 10-99 by 1-9 strategy work is not collected`);
  },
  "MQ-095"({ correctStrategyBuildResponse, engine, questions, requireCondition, skill }) {
    requireCondition(questions.every((question) => question.inputMethod === "STRATEGY_BUILD"
    && ["mental", "written"].every((method) => {
      const response = correctStrategyBuildResponse(question, method);
      return response.strategy === method && response.work.length > 0 && engine.gradeAnswer(question, response).correct;
    })), `${skill.id}: independently derived mental and written work is not collected`);
  },
  "MQ-097"({ canonical, correctStrategyBuildResponse, engine, questions, requireCondition, skill }) {
    requireCondition(questions.every((question) => {
      const response = correctStrategyBuildResponse(question);
      return question.inputMethod === "STRATEGY_BUILD"
        && canonical(question.params.responseValueChoices) === canonical(["odd", "even"])
        && response.work.length === 2
        && engine.gradeAnswer(question, response).correct;
    }), `${skill.id}: parity result or proof rule is invalid`);
  },
  "MQ-101"({ correctStrategyBuildResponse, engine, questions, requireCondition, skill }) {
    requireCondition(questions.every((question) => {
    const response = correctStrategyBuildResponse(question);
    return question.inputMethod === "STRATEGY_BUILD"
      && response.strategy === "use subtraction"
      && response.work.length === 2
      && engine.gradeAnswer(question, response).correct;
      }), `${skill.id}: inverse-operation work is not independently verified`);
  },
  "MQ-106"({ canonical, questions, requireCondition, skill }) {
    requireCondition(questions.some((question) => Number(question.params.rotation) !== 0), `${skill.id}: shape orientation never varies`);
    requireCondition(questions.filter((question) => question.semanticPromptStringId === "question.symmetryComplete").every((question) => {
      const expected = question.params.shape === "triangle" ? ["line1", "line3", "line4"] : question.params.shape === "rectangle" ? ["line1", "line2"] : ["line1", "line2", "line3", "line4"];
      return canonical([...question.params.shownLineIds, ...question.params.requiredLineIds]) === canonical(expected);
    }), `${skill.id}: symmetry axes do not match the shown shape`);
  },
});

const aliases = Object.freeze({
  "MQ-021": "MQ-003",
  "MQ-041": "MQ-040",
});

export function validateInputFacets(id, context) {
  if (typeof id !== "string") return;
  const key = Object.hasOwn(aliases, id) ? aliases[id] : id;
  if (Object.hasOwn(rules, key)) return rules[key](context);
}
