import { loadShippedEngine } from "./lib/engine-loader.mjs";
import { canonicalizeJson, loadManifest } from "./lib/curriculum-manifest.mjs";

const { engine, sha256 } = await loadShippedEngine(new URL("../index.html", import.meta.url));
const manifestArtifact = await loadManifest(new URL("../curriculum/math-quest-manifest-v1.json", import.meta.url));
const manifest = manifestArtifact.manifest;
const tiers = Object.freeze(["EASY", "HARD/TARGET"]);
const representations = Object.freeze(["CONCRETE", "PICTORIAL", "ABSTRACT"]);
const themes = Object.freeze(["ocean", "forest", "space"]);
const ordinals = 32;
const expectedQuestions = engine.SKILLS.length * tiers.length * representations.length * themes.length * ordinals;
const choiceSeeds = Object.freeze([0x4d515631, 1831565813]);
const choiceOrdinals = Object.freeze([0, 4, 8, 12, 16, 20, 24, 28, 32]);
const expectedChoiceSearches = engine.SKILLS.length * tiers.length * representations.length * themes.length * choiceSeeds.length * choiceOrdinals.length;
const records = new Map(engine.CHILD_STRINGS.map((record) => [record.id, record]));
const keypadKeys = records.get("ui.keypadKey")?.slots?.key ?? [];
const keypadCharacters = new Set(keypadKeys.flatMap((key) => key === "Clear" || key === "⌫" ? [] : key === "−" ? ["−", "-"] : [key]));
const issues = new Set();
const promptIds = new Set();
const inputMethods = new Set();
const answerKinds = new Set();
const generatedSkills = new Set();
let questionCount = 0;
let choiceSearchCount = 0;
let choicePairCount = 0;
let suppressedChoiceCount = 0;

function issue(message) {
  if (issues.size < 500) issues.add(message);
}

function optionValue(option) {
  return option && Object.hasOwn(option, "value") ? option.value : option?.optionId;
}

function correct(engineQuestion, value) {
  try { return engine.gradeAnswer(engineQuestion, value).correct === true; }
  catch { return false; }
}

function namedPromptCandidates(question) {
  if (question.semanticPromptStringId === "question.moneyCompare") return [question.params.c1, question.params.c2].map(String);
  if (question.semanticPromptStringId === "question.numberOrder") return [question.params.a, question.params.b, question.params.c].map(String);
  return null;
}

function engineSkillProjection(skill) {
  return {
    id: skill.skillId ?? skill.id,
    level: skill.level,
    band: skill.band,
    strand: skill.strand,
    title: skill.title ?? skill.name,
    objective: skill.objective,
    masteryRole: skill.masteryRole ?? skill.classification,
    prerequisites: skill.prerequisites,
    phases: skill.phases,
    representation: skill.representation,
    family: skill.family,
    generatorProfile: skill.generatorProfile,
    constraints: skill.constraints,
    rationaleId: skill.rationaleId,
    benchmarkIds: skill.benchmarkIds,
    assessment: skill.raw?.assessment ?? skill.assessment,
  };
}

if (engine.CURRICULUM_MANIFEST_SHA256 !== manifestArtifact.sha256) {
  issue(`engine manifest SHA-256 ${engine.CURRICULUM_MANIFEST_SHA256 ?? "(missing)"} != ${manifestArtifact.sha256}`);
}
if (engine.CURRICULUM_MANIFEST?.manifestId !== manifest.manifestId) {
  issue(`engine manifest id ${engine.CURRICULUM_MANIFEST?.manifestId ?? "(missing)"} != ${manifest.manifestId}`);
}
if (engine.CURRICULUM_MANIFEST?.version !== manifest.version) {
  issue(`engine manifest version ${engine.CURRICULUM_MANIFEST?.version ?? "(missing)"} != ${manifest.version}`);
}
try {
  if (canonicalizeJson(engine.CURRICULUM_MANIFEST) !== manifestArtifact.canonical) {
    issue("engine embedded manifest differs from the canonical shipped manifest");
  }
} catch (error) {
  issue(`engine embedded manifest is not canonicalizable: ${error.message}`);
}
if (engine.SKILLS.length !== manifest.skills.length) {
  issue(`engine skill count ${engine.SKILLS.length} != manifest skill count ${manifest.skills.length}`);
} else {
  for (let index = 0; index < manifest.skills.length; index += 1) {
    try {
      if (canonicalizeJson(engineSkillProjection(engine.SKILLS[index])) !== canonicalizeJson(manifest.skills[index])) {
        issue(`${manifest.skills[index].id}: engine skill fields differ from manifest`);
      }
    } catch (error) {
      issue(`${manifest.skills[index].id}: engine skill fields are incomplete (${error.message})`);
    }
  }
}

function choiceContract(question) {
  return JSON.stringify([
    question.skillId, question.taskType, question.tier, question.representation, question.applied, question.inputClass, question.inputMethod,
    question.answer?.kind, question.answer?.targetForm, question.semanticPromptStringId, question.modelDescriptor?.type,
  ]);
}

function checkReachability(question) {
  const answer = String(question.answer?.value ?? "");
  switch (question.inputMethod) {
    case "PICTURE_CHOICE":
    case "NUMBER_CHOICE":
      if (!question.options.some((option) => correct(question, optionValue(option)))) issue(`${question.skillId}: no selectable correct option`);
      break;
    case "TEN_FRAME": {
      const values = question.modelDescriptor?.type === "tenFrame" ? question.modelDescriptor.values : null;
      const frames = values?.frames;
      const target = Number(answer);
      const frameValues = Array.isArray(frames) ? frames.map((frame) => Number(frame?.value ?? frame)).filter(Number.isFinite) : [];
      const capacity = Math.max(10, Math.ceil(Math.max(0, target, ...frameValues) / 10) * 10);
      const result = Number(values?.strategy?.result ?? frames?.find((frame) => frame?.role === "result")?.value);
      if (!values || !Array.isArray(frames) || frames.length < 2) issue(`${question.skillId}: ten-frame lacks explicit frames`);
      if (!Number.isInteger(target) || target < 0 || target > 20 || capacity > 20) issue(`${question.skillId}: ten-frame target ${answer} outside reachable 0..20`);
      if (!Number.isFinite(result) || result !== target) issue(`${question.skillId}: ten-frame strategy/result does not reach ${answer}`);
      break;
    }
    case "NUMBER_LINE": {
      const values = question.modelDescriptor?.type === "numberLine" ? question.modelDescriptor.values : null;
      const points = values?.points, domain = values?.domain;
      const pointValues = Array.isArray(points) ? points.map((point) => String(point?.value ?? point)) : [];
      const min = Number(engine.parseRational(domain?.min)?.n) / Number(engine.parseRational(domain?.min)?.d);
      const max = Number(engine.parseRational(domain?.max)?.n) / Number(engine.parseRational(domain?.max)?.d);
      const step = Number(engine.parseRational(domain?.step)?.n) / Number(engine.parseRational(domain?.step)?.d);
      const target = Number(engine.parseRational(answer)?.n) / Number(engine.parseRational(answer)?.d);
      if (!values || !Array.isArray(points) || !points.length || !values.domain) issue(`${question.skillId}: number-line lacks domain and points`);
      if (!pointValues.some((value) => correct(question, value))) issue(`${question.skillId}: number-line target ${answer} is not a described point`);
      if (![min, max, step, target].every(Number.isFinite) || min >= max || step <= 0 || target < min || target > max) issue(`${question.skillId}: number-line domain does not bound target ${answer}`);
      if (!Array.isArray(values.jumps)) issue(`${question.skillId}: number-line jumps are not explicit`);
      break;
    }
    case "FRACTION_ENTRY":
      if (!/^-?\d+\/\d+$/u.test(answer)) issue(`${question.skillId}: FRACTION_ENTRY cannot represent ${answer}`);
      break;
    case "MIXED_NUMBER_ENTRY":
      if (!/^-?\d+ \d+\/\d+$/u.test(answer)) issue(`${question.skillId}: MIXED_NUMBER_ENTRY cannot represent ${answer}`);
      break;
    case "NUMBER_BOND":
    case "BAR_MODEL":
    case "NUMBER_PAD":
      for (const character of answer) if (!keypadCharacters.has(character)) issue(`${question.skillId}: ${question.inputMethod} has no key for ${JSON.stringify(character)} in ${answer}`);
      break;
    default:
      issue(`${question.skillId}: unknown input method ${question.inputMethod}`);
  }
}

for (const skill of engine.SKILLS) {
  for (const tier of tiers) {
    for (const representation of representations) {
      for (const theme of themes) {
        const correctPositionGroups = new Map();
        for (let ordinal = 0; ordinal < ordinals; ordinal += 1) {
          const question = engine.makeQuestion({
            skillId: skill.skillId,
            tier,
            representation,
            theme,
            seed: 0x4d515631,
            ordinal,
            eligibleQuestionOrdinal: ordinal,
          });
          questionCount += 1;
          generatedSkills.add(question.skillId);
          promptIds.add(question.promptStringId);
          inputMethods.add(question.inputMethod);
          answerKinds.add(question.answer?.kind);
          if (question.skillId !== skill.skillId || question.level !== skill.level) issue(`${skill.skillId}: identity or level changed`);
          if (question.theme !== theme || question.tier !== tier) issue(`${skill.skillId}: requested theme/tier was not retained`);
          if (!records.has(question.promptStringId)) issue(`${skill.skillId}: unknown prompt string ${question.promptStringId}`);
          else {
            let rendered = null;
            try { rendered = engine.renderChildString(question.promptStringId, question.promptSlots); }
            catch (error) { issue(`${skill.skillId}: prompt rendering threw ${error.message}`); }
            if (rendered !== null && rendered !== question.prompt) issue(`${skill.skillId}: prompt bytes do not regenerate (${question.promptStringId})`);
          }
          if (!question.modelDescriptor || !records.has(question.modelDescriptor.instructionStringId)) issue(`${skill.skillId}: missing registered model instruction`);
          else {
            const instruction = engine.renderChildString(question.modelDescriptor.instructionStringId, { representation: skill.representation });
            if (instruction !== question.modelDescriptor.instruction) issue(`${skill.skillId}: model instruction bytes do not regenerate`);
          }
          if (!correct(question, question.answer?.value)) issue(`${skill.skillId}: generated answer fails its own grader (${question.answer?.value})`);
          if (question.inputClass !== engine.CONSTANTS.INPUT_CLASS_BY_METHOD[question.inputMethod]) issue(`${skill.skillId}: ${question.inputMethod} disagrees with ${question.inputClass}`);

          if (question.inputClass === "SELECTION") {
            const expectedCount = Number(question.optionCount);
            if (!Number.isInteger(expectedCount) || expectedCount < 2 || expectedCount > 4) issue(`${skill.skillId}: invalid selection optionCount ${question.optionCount}`);
            if (question.options.length !== expectedCount) issue(`${skill.skillId}: selection exposes ${question.options.length} options but declares ${expectedCount}`);
            const positionGroupKey = JSON.stringify([question.taskType, question.semanticPromptStringId, expectedCount]);
            const positionGroup = correctPositionGroups.get(positionGroupKey) ?? {
              selectionArity: expectedCount,
              taskType: question.taskType,
              semanticPromptStringId: question.semanticPromptStringId,
              correctPositions: [0, 0, 0, 0],
            };
            correctPositionGroups.set(positionGroupKey, positionGroup);
            const correctPositions = positionGroup.correctPositions;
            const ids = new Set(question.options.map((option) => option.optionId));
            const values = new Set(question.options.map((option) => JSON.stringify(optionValue(option))));
            if (ids.size !== question.options.length || values.size !== question.options.length) issue(`${skill.skillId}: duplicate option id/value`);
            const correctOptions = question.options.filter((option) => correct(question, optionValue(option)));
            if (correctOptions.length !== 1) issue(`${skill.skillId}: expected exactly one correct option, saw ${correctOptions.length}`);
            if (question.correctIndex < 0 || question.correctIndex >= question.options.length || question.options[question.correctIndex] !== correctOptions[0]) issue(`${skill.skillId}: correctIndex does not identify the correct option`);
            else correctPositions[question.correctIndex] += 1;
            const namedCandidates = namedPromptCandidates(question);
            if (namedCandidates && JSON.stringify(question.options.map((option) => String(optionValue(option))).sort()) !== JSON.stringify([...namedCandidates].sort())) issue(`${skill.skillId}: named prompt candidates do not exactly match its options`);
            for (const option of question.options) {
              const generic = engine.renderChildString("option.value", { value: optionValue(option) });
              const shape = /^[●▲■▰] [A-Z][a-z]+$/u.test(option.label);
              if (option.label !== generic && !shape) issue(`${skill.skillId}: unregistered option label ${JSON.stringify(option.label)}`);
            }
          } else if (question.options.length || question.optionCount !== 0 || question.correctIndex !== -1) issue(`${skill.skillId}: construction exposes selection metadata`);

          checkReachability(question);

          if (choiceOrdinals.includes(ordinal)) {
            for (const choiceSeed of choiceSeeds) {
              const args = { skillId: skill.skillId, tier, representation, theme, seed: choiceSeed, ordinal, eligibleQuestionOrdinal: ordinal / 2 };
              const choices = engine.makeQuestionChoices(args);
              choiceSearchCount += 1;
              if (!Object.isFrozen(choices) || ![1, 2].includes(choices.length)) {
                issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: choice search returned an invalid collection`);
                continue;
              }
              const base = engine.makeQuestion(args);
              if (choices[0].questionId !== base.questionId || choices[0].prompt !== base.prompt || choices[0].sampleKey !== base.sampleKey) {
                issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: first choice is not the requested base sample`);
              }
              for (const [choiceIndex, candidate] of choices.entries()) {
                if (!correct(candidate, candidate.answer?.value)) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}/${choiceIndex}: choice fails its own grader`);
                if (choiceContract(candidate) !== choiceContract(choices[0])) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}/${choiceIndex}: mastery/input contract changed`);
                if (candidate.inputClass === "SELECTION") {
                  const correctOptions = candidate.options.filter((option) => correct(candidate, optionValue(option)));
                  if (correctOptions.length !== 1 || candidate.options[candidate.correctIndex] !== correctOptions[0]) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}/${choiceIndex}: selected card has no unique reachable answer`);
                }
                checkReachability(candidate);
              }
              if (choices.length === 2) {
                choicePairCount += 1;
                if (choices[0].prompt === choices[1].prompt) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: two child-visible prompts are identical`);
                if (choices[0].sampleKey === choices[1].sampleKey) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: two cards share a sample key`);
              } else {
                suppressedChoiceCount += 1;
                const contract = choiceContract(base);
                let missedAlternative = false;
                for (let offset = 1; offset <= 32; offset += 1) {
                  const candidate = engine.makeQuestion({ ...args, ordinal: ordinal + offset });
                  if (candidate.prompt !== base.prompt && candidate.sampleKey !== base.sampleKey && choiceContract(candidate) === contract) { missedAlternative = true; break; }
                }
                if (missedAlternative) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: bounded search suppressed an available distinct choice`);
              }
            }
          }
        }
        if (choiceOrdinals.at(-1) >= ordinals) {
          const ordinal = choiceOrdinals.at(-1);
          for (const choiceSeed of choiceSeeds) {
            const args = { skillId: skill.skillId, tier, representation, theme, seed: choiceSeed, ordinal, eligibleQuestionOrdinal: ordinal / 2 };
            const choices = engine.makeQuestionChoices(args);
            choiceSearchCount += 1;
            if (!Object.isFrozen(choices) || ![1, 2].includes(choices.length)) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: choice search returned an invalid collection`);
            else {
              const base = engine.makeQuestion(args), contract = choiceContract(base);
              if (choices[0].questionId !== base.questionId || choices[0].prompt !== base.prompt || choices[0].sampleKey !== base.sampleKey) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: first choice is not the requested base sample`);
              for (const [choiceIndex, candidate] of choices.entries()) {
                if (!correct(candidate, candidate.answer?.value)) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}/${choiceIndex}: choice fails its own grader`);
                if (choiceContract(candidate) !== contract) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}/${choiceIndex}: mastery/input contract changed`);
                if (candidate.inputClass === "SELECTION") {
                  const correctOptions = candidate.options.filter((option) => correct(candidate, optionValue(option)));
                  if (correctOptions.length !== 1 || candidate.options[candidate.correctIndex] !== correctOptions[0]) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}/${choiceIndex}: selected card has no unique reachable answer`);
                }
                checkReachability(candidate);
              }
              if (choices.length === 2) {
                choicePairCount += 1;
                if (choices[0].prompt === choices[1].prompt) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: two child-visible prompts are identical`);
                if (choices[0].sampleKey === choices[1].sampleKey) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: two cards share a sample key`);
              } else {
                suppressedChoiceCount += 1;
                let missedAlternative = false;
                for (let offset = 1; offset <= 32; offset += 1) {
                  const candidate = engine.makeQuestion({ ...args, ordinal: ordinal + offset });
                  if (candidate.prompt !== base.prompt && candidate.sampleKey !== base.sampleKey && choiceContract(candidate) === contract) { missedAlternative = true; break; }
                }
                if (missedAlternative) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: bounded search suppressed an available distinct choice`);
              }
            }
          }
        }
        for (const { selectionArity, taskType, semanticPromptStringId, correctPositions } of correctPositionGroups.values()) {
          const sampledPositions = correctPositions.slice(0, selectionArity);
          const sampleCount = sampledPositions.reduce((sum, count) => sum + count, 0);
          const activePositions = sampledPositions.filter((count) => count > 0);
          const requiredDistinctPositions = Math.min(selectionArity, Math.max(2, Math.floor(sampleCount / selectionArity)));
          const maximumPositionShare = sampleCount > 0 ? Math.max(...sampledPositions) / sampleCount : 1;
          if (activePositions.length < requiredDistinctPositions || maximumPositionShare > 0.75) {
            issue(`${skill.skillId}/${taskType}/${semanticPromptStringId}: ${selectionArity}-option answer-position bias has ${sampleCount} samples, ${activePositions.length}/${requiredDistinctPositions} required distinct positions, ${(maximumPositionShare * 100).toFixed(2)}% maximum share, counts ${correctPositions.join(",")}`);
          }
        }
      }
    }
  }
}

if (questionCount !== expectedQuestions) issue(`question count ${questionCount} != ${expectedQuestions}`);
if (choiceSearchCount !== expectedChoiceSearches) issue(`choice search count ${choiceSearchCount} != ${expectedChoiceSearches}`);
if (generatedSkills.size !== engine.SKILLS.length) issue(`generated ${generatedSkills.size}/${engine.SKILLS.length} skills`);

const report = {
  status: issues.size ? "FAIL" : "PASS",
  engineSha256: sha256,
  manifestId: manifest.manifestId,
  manifestVersion: manifest.version,
  manifestSha256: manifestArtifact.sha256,
  questions: questionCount,
  choiceSearches: choiceSearchCount,
  choicePairs: choicePairCount,
  suppressedChoices: suppressedChoiceCount,
  skills: generatedSkills.size,
  promptIds: [...promptIds].sort(),
  inputMethods: [...inputMethods].sort(),
  answerKinds: [...answerKinds].sort(),
  issues: [...issues],
};

const output = process.argv.includes("--summary")
  ? {
      status: report.status,
      engineSha256: report.engineSha256,
      manifestId: report.manifestId,
      manifestVersion: report.manifestVersion,
      manifestSha256: report.manifestSha256,
      questions: report.questions,
      choiceSearches: report.choiceSearches,
      choicePairs: report.choicePairs,
      suppressedChoices: report.suppressedChoices,
      skills: report.skills,
      issueCount: report.issues.length,
      issues: report.issues.slice(0, 20),
    }
  : report;
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (issues.size) process.exitCode = 1;
