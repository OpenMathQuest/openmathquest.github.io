import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateEngine, extractEngine } from "./lib/engine-loader.mjs";
import { runEngineSuite } from "./tests/engine-suite.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FAMILIES = Object.freeze([
  {
    family: "mastery and promotion", testId: "BND-02",
    replacements: [[/(\bPROMOTION_(?:SOLID_)?RATIO\s*:\s*)0\.8\b/u, (_, prefix) => `${prefix}0.81`], [/(solidRatio\s*>=\s*)0\.8\b/u, (_, prefix) => `${prefix}0.81`]],
    taskTypeReplacements: [[/coversTasks=requiredTaskTypes\.every\(taskType=>set\.some\(x=>x\.taskType===taskType\)\)/u, "coversTasks=requiredTaskTypes.some(taskType=>set.some(x=>x.taskType===taskType))"]],
  },
  {
    family: "level re-teaching trigger", testId: "BND-01",
    replacements: [[/(\bLEVEL_RETEACH(?:ING)?_(?:CLEAN_MAX|MAX_CLEAN|TRIGGER_MAX_CLEAN)\s*:\s*)7\b/u, (_, prefix) => `${prefix}8`], [/(cleanCount\s*<=\s*)7\b/u, (_, prefix) => `${prefix}8`]],
  },
  {
    family: "skill demotion", testId: "BEH-08",
    replacements: [[/(if\s*\(\s*attempt\.scheduledReview\s*&&\s*rec\.acquisition\s*===\s*["']SOLID["']\s*\)\s*\{\s*rec\.acquisition\s*=\s*["'])PRACTISING(["'])/u, "$1SOLID$2"], [/(\bDEMOTION_ON_INCORRECT_REVIEW\s*:\s*)true\b/u, "$1false"], [/(type\s*:\s*["'])SKILL_DEMOTED(["'])/u, "$1SKILL_DEMOTED_MUTANT$2"]],
  },
  {
    family: "fraction equivalence and canonical form", testId: "BND-07",
    replacements: [[/(targetForm\s*===\s*["'])SIMPLEST(["'])/u, "$1SIMPLEST_MUTANT$2"], [/(parsed\.n\s*===\s*want\.n\s*&&\s*parsed\.d\s*===\s*want\.d)/u, "parsed.n===want.n"]],
  },
  {
    family: "repeated-miss re-teaching", testId: "BND-08",
    replacements: [[/(\bCHRONIC_MISS_COUNT\s*:\s*)3\b/u, (_, prefix) => `${prefix}4`], [/(\bRETEACH_MISSES_(?:PRE_K|PREK)\s*:\s*)1\b/u, (_, prefix) => `${prefix}2`]],
  },
  {
    family: "feedback classification", testId: "BEH-09",
    replacements: [[/hintUsed\s*\|\|\s*changed/u, "hintUsed && changed"], [/firstAnswerCorrect\s*&&\s*!hintUsed\s*&&\s*!changed/u, "firstAnswerCorrect || !hintUsed || !changed"], [/(\bFIRST_TRY_CLEAN_REQUIRES_NO_HINT\s*:\s*)true\b/u, "$1false"]],
  },
  {
    family: "fatigue", testId: "BND-09",
    replacements: [[/Number\(item\.elapsed\)<=threshold/u, "Number(item.elapsed)<threshold"], [/(elapsed\s*)<=(\s*(?:rapid|threshold))/iu, "$1<$2"]],
  },
  {
    family: "pick-your-question frequency and distinctness", testId: "BEH-06",
    replacements: [[/return\s+deepFreeze\(\[first,candidate\]\);/u, "return deepFreeze([first,first]);"], [/(\bPICK_CHOICE_STEP_(?:PRE_K|PREK)\s*:\s*)4\b/u, (_, prefix) => `${prefix}3`], [/(stage\s*===\s*["']PRE_K["']\s*\?\s*i\s*%\s*)4(\s*===\s*0)/u, (_, prefix, suffix) => `${prefix}3${suffix}`], [/(stage\s*===\s*["']PRE_K["']\s*\?\s*)4(\s*:\s*2)/u, (_, prefix, suffix) => `${prefix}3${suffix}`]],
  },
]);

function seed(source, replacements) {
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(source)) return { source: source.replace(pattern, replacement), pattern: String(pattern), changed: true };
  }
  return { source, pattern: null, changed: false };
}

function taskTypeMasteryOutcome(engine) {
  const skill = engine.SKILLS.find((candidate) => (candidate.constraints?.taskTypes?.length ?? 0) > 1);
  if (!skill) return { ok: false, reason: "The manifest has no multi-task-type skill." };
  const skillId = skill.skillId ?? skill.id;
  const repeatedTaskType = skill.constraints.taskTypes[0];
  const witnessCount = engine.CONSTANTS.NORMAL_CONSTRUCTION_SUCCESSES;
  if (!Number.isInteger(witnessCount) || witnessCount < 1) {
    return { ok: false, reason: "The construction mastery witness count is unavailable." };
  }
  let state = engine.createInitialState(21_000);
  for (let index = 0; index < witnessCount; index += 1) {
    const attempt = {
      recordId: `task-type-mutation-${index}`,
      questionId: `task-type-question-${index}`,
      skillId,
      level: skill.level,
      stage: engine.stageForLevel(skill.level),
      tier: "HARD/TARGET",
      representation: "PICTORIAL",
      inputClass: "CONSTRUCTION",
      evidenceClass: "CONSTRUCTION",
      feedbackClass: "FIRST_TRY_CLEAN",
      coldTest: false,
      scheduledReview: false,
      sampleKey: `${skillId}|${engine.CONSTANTS.SAMPLE_KEY_VERSION}|task-type-sample-${index}`,
      firstAnswerCorrect: true,
      hintUsed: false,
      changed: false,
      elapsed: 2_000,
      idleMs: 0,
      validTelemetry: true,
      guessingLike: false,
      modelUsed: true,
      applied: true,
      preview: false,
      capstone: false,
      sessionId: `task-type-session-${index}`,
      playDay: 21_000 + index,
      taskType: repeatedTaskType,
    };
    state = engine.applyAttempt(state, attempt).state;
  }
  return {
    ok: true,
    skillId,
    repeatedTaskType,
    witnessCount,
    requiredTaskTypes: [...skill.constraints.taskTypes],
    acquisition: state.skills[skillId].acquisition,
  };
}

export async function runMutations({ indexPath = path.join(root, "index.html") } = {}) {
  const extracted = await extractEngine(indexPath);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "math-quest-mutants-"));
  const report = { status: "FAIL", engineSha256: extracted.sha256, families: [] };
  try {
    for (const family of FAMILIES) {
      const selected = new Set([family.testId]);
      const baseline = await runEngineSuite({ root, indexPath, only: selected });
      const baseResult = baseline.harness.results.find((item) => item.id === family.testId);
      if (!baseResult || baseResult.status !== "PASS") {
        report.families.push({ ...family, status: "FAIL", reason: "The protecting baseline test did not pass.", baseline: baseResult ?? null });
        continue;
      }
      const mutant = seed(extracted.source, family.replacements);
      if (!mutant.changed) {
        report.families.push({ ...family, status: "FAIL", reason: "No representative mutation point matched the shipped engine." });
        continue;
      }
      const mutantPath = path.join(tempRoot, `${family.testId}.html`);
      await writeFile(mutantPath, `<!-- ENGINE-START -->\n${mutant.source}\n<!-- ENGINE-END -->\n`, "utf8");
      const result = await runEngineSuite({ root, indexPath: mutantPath, only: selected, engineFilename: path.join(tempRoot, `${family.testId}.engine.js`) });
      const target = result.harness.results.find((item) => item.id === family.testId);
      const cases = [{
        id: family.testId,
        mutation: mutant.pattern,
        status: target && target.status === "FAIL" ? "PASS" : "FAIL",
        reason: target && target.status === "FAIL" ? "Mutant killed by its effect-sensitive assertion." : "Mutant survived or the target was skipped.",
        target: target ?? null,
      }];

      if (family.taskTypeReplacements) {
        const baselineTaskType = taskTypeMasteryOutcome(evaluateEngine(extracted.source));
        const taskTypeMutant = seed(extracted.source, family.taskTypeReplacements);
        let taskTypeTarget = null;
        if (taskTypeMutant.changed) taskTypeTarget = taskTypeMasteryOutcome(evaluateEngine(taskTypeMutant.source));
        const baselineProtected = baselineTaskType.ok && baselineTaskType.acquisition !== "SOLID";
        const mutantExposed = taskTypeTarget?.ok && taskTypeTarget.acquisition === "SOLID";
        cases.push({
          id: "TASK-TYPE-MASTERY",
          mutation: taskTypeMutant.pattern,
          status: baselineProtected && mutantExposed ? "PASS" : "FAIL",
          reason: baselineProtected && mutantExposed
            ? "Mutant killed: repeated evidence for one task type cannot satisfy a multi-task-type mastery contract."
            : !taskTypeMutant.changed
              ? "No task-type mastery mutation point matched the shipped engine."
              : !baselineProtected
                ? "The baseline did not enforce coverage of every required task type."
                : "The task-type mastery mutant survived.",
          baseline: baselineTaskType,
          target: taskTypeTarget,
        });
      }

      const familyPassed = cases.every((item) => item.status === "PASS");
      report.families.push({
        family: family.family, testId: family.testId, mutation: mutant.pattern, cases,
        status: familyPassed ? "PASS" : "FAIL",
        reason: familyPassed ? `All ${cases.length} effect-sensitive mutant cases were killed.` : `${cases.filter((item) => item.status !== "PASS").length}/${cases.length} mutant cases survived or could not run.`,
        target: target ?? null,
      });
    }
    report.status = report.families.length === 8 && report.families.every((item) => item.status === "PASS") ? "PASS" : "FAIL";
    return report;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runMutations({ indexPath: process.env.MQ_INDEX_PATH || path.join(root, "index.html") });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === "PASS" ? 0 : 1;
}
