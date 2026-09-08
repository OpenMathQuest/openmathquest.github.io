import { cloneJson } from "./test-harness.mjs";

export function recordPlacementResult(engine, run, response) {
  return appendPlacementFixtureAnswer(engine.placementCurrentQuestion(run), run, response);
}

function appendPlacementFixtureAnswer(question, run, response) {
  if (!question) throw new Error("Placement fixture tried to answer a completed run.");
  const responseKind = response === "not-sure"
    ? "not-sure"
    : response ? "correct" : "incorrect";
  return {
    ...cloneJson(run),
    answers: [
      ...cloneJson(run.answers),
      { questionId: question.questionId, responseKind },
    ],
  };
}

export function completePlacement(engine, state, policy, options = {}) {
  let run = engine.createPlacementRun({
    state,
    playDay: options.playDay ?? state.maxSeenPlayDay,
    seed: options.seed ?? 0x706c6163,
    theme: options.theme ?? "ocean",
  });
  for (let index = 0; index < engine.CONSTANTS.PLACEMENT_MAX_QUESTIONS; index += 1) {
    const question = engine.placementCurrentQuestion(run);
    if (!question) return run;
    if (question.inputClass === "SELECTION" && question.options.some((option) => (
      [option.label, option.value].some((value) => String(value).trim().toLowerCase() === "not sure")
    ))) {
      throw new Error(`Placement question ${question.questionId} duplicates the global Not sure action.`);
    }
    run = appendPlacementFixtureAnswer(question, run, policy(question, index, run));
  }
  if (engine.placementCurrentQuestion(run)) throw new Error("Placement fixture exceeded the approved maximum.");
  return run;
}
