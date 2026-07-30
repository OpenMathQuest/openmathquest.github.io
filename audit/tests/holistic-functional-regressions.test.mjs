import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { loadShippedEngine } from "../lib/engine-loader.mjs";

const indexUrl = new URL("../../index.html", import.meta.url);
const html = readFileSync(indexUrl, "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/giu)]
  .map((match) => match[1]);
assert.equal(scripts.length, 2, "the shipped page must retain one engine and one adapter script");
const adapter = scripts[1];
const { engine } = await loadShippedEngine(indexUrl);
const plain = (value) => JSON.parse(JSON.stringify(value));

function matchingDelimiter(source, openIndex, open, close) {
  assert.equal(source[openIndex], open);
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === open) depth += 1;
    if (character === close && --depth === 0) return index;
  }
  throw new Error(`unclosed ${open}${close} delimiter`);
}

function extractFunction(name) {
  const expression = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "gu");
  const matches = [...adapter.matchAll(expression)];
  assert.equal(matches.length, 1, `${name} must have one shipped declaration`);
  const start = matches[0].index;
  const parametersStart = adapter.indexOf("(", start);
  const parametersEnd = matchingDelimiter(adapter, parametersStart, "(", ")");
  const bodyStart = adapter.indexOf("{", parametersEnd);
  const bodyEnd = matchingDelimiter(adapter, bodyStart, "{", "}");
  return adapter.slice(start, bodyEnd + 1);
}

function questionsFor(skillId, count = 16) {
  const skill = engine.SKILL_BY_ID[skillId];
  assert.ok(skill, `${skillId} must exist`);
  const questions = [];
  for (const tier of ["EASY", "HARD/TARGET"]) {
    for (let ordinal = 0; ordinal < count; ordinal += 1) {
      questions.push(engine.makeQuestion({
        skillId,
        tier,
        representation: skill.phases.includes("P") ? "PICTORIAL" : "ABSTRACT",
        seed: 0x726f7574,
        ordinal,
        eligibleQuestionOrdinal: ordinal,
        theme: "ocean",
      }));
    }
  }
  return questions;
}

test("QA-002/003 every route starts at its displayed origin and only the traced route grades", () => {
  const coordinateBase = plain(questionsFor("MQ-125", 1)[0]);
  const exactCoordinate = {
    ...coordinateBase,
    params: {
      ...coordinateBase.params,
      x: 8,
      y: 14,
      dx: -1,
      dy: 0,
      moves: ["L"],
    },
    answer: { ...coordinateBase.answer, value: "(7,14)" },
  };
  const exactSpecification = engine.gridRouteSpecification(exactCoordinate);
  assert.deepEqual(
    plain(exactSpecification),
    {
      startX: 8,
      startY: 14,
      size: 20,
      expectedMoves: ["L"],
      expectedEnd: { x: 7, y: 14 },
      plannedPoints: [{ x: 8, y: 14 }, { x: 7, y: 14 }],
    },
    "MQ-125 exact reported boundary resolves from (8,14) rather than (1,1)",
  );
  const exactResponse = engine.createResponseState(exactCoordinate);
  exactResponse.moves.push("L");
  exactResponse.end = { ...engine.traceGridRoute(exactCoordinate, exactResponse.moves).end };
  assert.equal(engine.gradeAnswer(exactCoordinate, exactResponse).correct, true);

  for (const skillId of ["MQ-034", "MQ-125"]) {
    for (const question of questionsFor(skillId)) {
      assert.equal(question.inputMethod, "GRID_ROUTE", `${skillId} input method`);
      const specification = engine.gridRouteSpecification(question);
      assert.ok(specification, `${skillId} route specification`);
      assert.deepEqual(
        [...specification.expectedMoves],
        [...question.params.moves],
        `${skillId} displayed move plan`,
      );

      const initial = engine.createResponseState(question);
      assert.deepEqual(
        plain(initial),
        { moves: [], end: { x: specification.startX, y: specification.startY } },
        `${skillId} response starts at the displayed point`,
      );

      for (let length = 0; length <= specification.expectedMoves.length; length += 1) {
        const moves = specification.expectedMoves.slice(0, length);
        const trace = engine.traceGridRoute(question, moves);
        assert.ok(trace, `${skillId} prefix ${length} traces`);
        const response = { moves: [...moves], end: { ...trace.end } };
        assert.equal(
          engine.isResponseComplete(question, response),
          length === specification.expectedMoves.length,
          `${skillId} prefix ${length} completion`,
        );
        if (length === specification.expectedMoves.length) {
          assert.equal(engine.gradeAnswer(question, response).correct, true, `${skillId} final route`);
        }
      }

      const teleported = {
        moves: [],
        end: { ...specification.expectedEnd },
      };
      if (specification.expectedMoves.length > 0) {
        assert.equal(engine.gradeAnswer(question, teleported).correct, false, `${skillId} teleport`);
        assert.equal(engine.isResponseComplete(question, teleported), false, `${skillId} teleport completion`);
      }

      const forgedEnd = {
        moves: [...specification.expectedMoves],
        end: { x: specification.expectedEnd.x + 1, y: specification.expectedEnd.y },
      };
      assert.equal(engine.gradeAnswer(question, forgedEnd).correct, false, `${skillId} forged endpoint`);
      assert.equal(engine.isResponseComplete(question, forgedEnd), false, `${skillId} forged state`);
    }
  }
});

function createRouteDispatchHarness(question, saveResult) {
  const effects = {
    engineState: engine.createInitialState(22_000),
    ui: {
      screen: "session",
      phase: "question",
      question,
      responseState: structuredClone(engine.createResponseState(question)),
      selected: null,
      entry: "",
      fractionParts: { whole: "", numerator: "", denominator: "" },
      modelTouched: false,
      selectionEvents: [],
      selectionRestored: false,
      manipulationStartedAt: 0,
      manipulationMs: 0,
      promptFinishedAt: 0,
      idleStart: 123,
      maxIdleMs: 17,
    },
    saveResult,
    saveCalls: 0,
    renders: 0,
    manipulations: 0,
    scrolls: [],
  };
  const source = `(()=>{
    "use strict";
    const E=engine;
    let lab=null;
    let state=effects.engineState;
    let ui=effects.ui;
    const window={scrollTo:(x,y)=>effects.scrolls.push([x,y]),scrollX:0,scrollY:0};
    const confirm={disabled:null};
    const app={
      querySelector:()=>confirm,
      querySelectorAll:()=>[],
    };
    const CSS={escape:(value)=>String(value)};
    function labQuestionAt(){throw new Error("lab path is out of scope");}
    function clearLabFeedback(){throw new Error("lab path is out of scope");}
    function labStorageIntact(){throw new Error("lab path is out of scope");}
    function beginManipulation(){effects.manipulations+=1;ui.manipulationStartedAt=999;ui.maxIdleMs=321;}
    function save(){effects.saveCalls+=1;if(!effects.saveResult)state.activeSession={leaked:"failed response snapshot"};return effects.saveResult;}
    function render(){effects.renders+=1;effects.visibleValue=String(ui.responseState?.value??ui.entry??"");}
    function controlState(){return ui;}
    function responseComplete(question,controls){return E.isResponseComplete(question,controls.responseState);}
    function now(){return 456;}
    function noteActivity(at){ui.idleStart=at;ui.maxIdleMs=654;}
    function accessibleOptionLabel(option){return String(option?.label??option?.value??"");}
    function s(id,slots){return id==="announcement.selected"?"Selected "+slots.label:id;}
    function scheduleRenderedFocus(){effects.focusScheduled=(effects.focusScheduled||0)+1;}
    function announce(){effects.announced=(effects.announced||0)+1;}
    ${extractFunction("responseMutationCheckpoint")}
    ${extractFunction("persistResponseMutation")}
    ${extractFunction("selectOption")}
    ${extractFunction("dispatchResponse")}
    ${extractFunction("handleResponseInput")}
    return {
      run:(control)=>dispatchResponse("child",control),
      input:(target)=>handleResponseInput({target}),
      select:(optionId)=>selectOption(optionId),
      status:()=>({state,ui}),
    };
  })()`;
  const harness = new vm.Script(source, {
    filename: "math-quest-grid-route-persistence.js",
  }).runInNewContext({
    effects,
    engine,
    structuredClone,
    setTimeout,
    CSS: { escape: (value) => String(value) },
  });
  return { effects, harness };
}

test("QA-002 a route move rolls back visibly when its save cannot commit", () => {
  for (const skillId of ["MQ-034", "MQ-125"]) {
    const question = questionsFor(skillId, 1)[0];
    const specification = engine.gridRouteSpecification(question);
    assert.ok(specification?.expectedMoves.length, `${skillId} needs a move`);
    const control = {
      dataset: {
        responseAction: "route-move",
        move: specification.expectedMoves[0],
        focusKey: "",
      },
    };
    const { effects, harness } = createRouteDispatchHarness(question, false);
    const before = structuredClone(harness.status().ui.responseState);
    const beforeBytes = engine.exportState(harness.status().state);
    const beforeUi = structuredClone(harness.status().ui);
    harness.run(control);
    assert.deepEqual(plain(harness.status().ui.responseState), plain(before), `${skillId} failed save rollback`);
    assert.equal(harness.status().ui.modelTouched, false, `${skillId} failed save model flag`);
    assert.deepEqual(plain(harness.status().ui), plain(beforeUi), `${skillId} failed save restores all response timing`);
    assert.equal(
      engine.exportState(harness.status().state),
      beforeBytes,
      `${skillId} failed save restores exact exported engine bytes`,
    );
    assert.equal(effects.saveCalls, 1, `${skillId} failed save attempted once`);
    assert.equal(effects.renders, 1, `${skillId} failed save rerender`);

    effects.saveResult = true;
    harness.run(control);
    const trace = engine.traceGridRoute(question, [specification.expectedMoves[0]]);
    assert.deepEqual(
      plain(harness.status().ui.responseState),
      { moves: [specification.expectedMoves[0]], end: { ...trace.end } },
      `${skillId} committed route move`,
    );
    assert.equal(harness.status().ui.modelTouched, true, `${skillId} committed model flag`);
    assert.equal(effects.saveCalls, 2, `${skillId} successful save attempted once`);
  }
});

function firstQuestionWithMethod(inputMethod) {
  for (const skill of engine.SKILLS) {
    for (const question of questionsFor(skill.skillId, 3)) {
      if (question.inputMethod === inputMethod) return question;
    }
  }
  assert.fail(`no shipped ${inputMethod} question`);
}

test("failed structured, direct-entry, fraction, and selection responses restore exact state", () => {
  const pattern = questionsFor("MQ-004", 1).find((question) => question.inputMethod === "PATTERN_BUILD");
  assert.ok(pattern, "a shipped pattern-construction question exists");
  {
    const { effects, harness } = createRouteDispatchHarness(pattern, false);
    const beforeUi = structuredClone(harness.status().ui);
    const beforeBytes = engine.exportState(harness.status().state);
    harness.run({
      dataset: {
        responseAction: "pattern-token",
        token: String(pattern.params.tokenChoices?.[0] ?? "●"),
        focusKey: "",
      },
    });
    assert.deepEqual(plain(harness.status().ui), plain(beforeUi), "failed pattern token is not left visible");
    assert.equal(engine.exportState(harness.status().state), beforeBytes, "failed pattern token leaves exact engine bytes");
    assert.equal(effects.renders, 1, "failed pattern token rerenders the saved response");
  }

  const fraction = firstQuestionWithMethod("FRACTION_ENTRY");
  {
    const { effects, harness } = createRouteDispatchHarness(fraction, false);
    const beforeUi = structuredClone(harness.status().ui);
    const beforeBytes = engine.exportState(harness.status().state);
    const box = { textContent: "" };
    const confirm = { disabled: false };
    harness.input({
      dataset: { controlMode: "play", fractionPart: "numerator" },
      value: "7",
      closest: () => ({
        querySelector: (selector) => selector === "[data-answerbox]" ? box : confirm,
      }),
    });
    assert.deepEqual(plain(harness.status().ui), plain(beforeUi), "failed fraction input restores every response field");
    assert.equal(engine.exportState(harness.status().state), beforeBytes, "failed fraction input leaves exact engine bytes");
    assert.equal(effects.renders, 1, "failed fraction input rerenders instead of leaving the typed digit");
  }

  const selection = firstQuestionWithMethod("PICTURE_CHOICE");
  {
    const { effects, harness } = createRouteDispatchHarness(selection, false);
    const beforeUi = structuredClone(harness.status().ui);
    const beforeBytes = engine.exportState(harness.status().state);
    harness.select(selection.options[0].optionId);
    assert.deepEqual(
      plain(harness.status().ui),
      plain(beforeUi),
      "failed choice save restores selection, debounce events, activity timing, and restored-selection state",
    );
    assert.equal(engine.exportState(harness.status().state), beforeBytes, "failed choice leaves exact engine bytes");
    assert.equal(effects.announced ?? 0, 0, "an unsaved choice is not announced as selected");
    assert.equal(effects.focusScheduled ?? 0, 0, "an unsaved choice is not focused as though committed");
    assert.equal(effects.renders, 1, "failed choice rerenders the prior selected state");
  }
});

test("QA-004 both displayed volume methods are complete, exact, and gradeable", () => {
  const questions = questionsFor("MQ-122");
  assert.ok(questions.length > 0);
  for (const question of questions) {
    assert.equal(question.inputMethod, "VOLUME_INSPECT");
    const height = Number(question.params.height);
    const viewedLayers = Array.from({ length: height }, (_, index) => index + 1);
    for (const method of ["count", "multiply"]) {
      const response = {
        viewedLayers: [...viewedLayers],
        method,
        value: String(question.answer.value),
      };
      assert.equal(engine.isResponseComplete(question, response), true, `${method} complete`);
      assert.equal(engine.gradeAnswer(question, response).correct, true, `${method} correct`);
    }
    const missingLayer = {
      viewedLayers: viewedLayers.slice(0, -1),
      method: "count",
      value: String(question.answer.value),
    };
    assert.equal(engine.isResponseComplete(question, missingLayer), false, "all layers are required");
    assert.equal(engine.gradeAnswer(question, missingLayer).correct, false, "missing layer cannot grade");
    const unsupported = {
      viewedLayers,
      method: "add",
      value: String(question.answer.value),
    };
    assert.equal(engine.isResponseComplete(question, unsupported), false, "undisplayed method");
    assert.equal(engine.gradeAnswer(question, unsupported).valid, false, "undisplayed method invalid");
  }
});

test("QA-004 count and multiply volume entry are transactional on failed persistence", () => {
  const question = questionsFor("MQ-122", 1)[0];
  const viewedLayers = Array.from({ length: Number(question.params.height) }, (_, index) => index + 1);
  for (const method of ["count", "multiply"]) {
    const failedMethod = createRouteDispatchHarness(question, false);
    failedMethod.harness.status().ui.responseState.viewedLayers = [...viewedLayers];
    const beforeMethodUi = structuredClone(failedMethod.harness.status().ui);
    const beforeMethodBytes = engine.exportState(failedMethod.harness.status().state);
    failedMethod.harness.run({
      dataset: {
        responseAction: "volume-method",
        value: method,
        focusKey: "",
      },
    });
    assert.deepEqual(
      plain(failedMethod.harness.status().ui),
      plain(beforeMethodUi),
      `${method} is not shown as selected when its save fails`,
    );
    assert.equal(
      engine.exportState(failedMethod.harness.status().state),
      beforeMethodBytes,
      `${method} failed method selection restores exact exported bytes`,
    );

    const { effects, harness } = createRouteDispatchHarness(question, true);
    harness.status().ui.responseState.viewedLayers = [...viewedLayers];
    harness.run({
      dataset: {
        responseAction: "volume-method",
        value: method,
        focusKey: "",
      },
    });
    assert.equal(harness.status().ui.responseState.method, method, `${method} can be selected`);
    harness.input({
      dataset: { controlMode: "play", responseInput: "value" },
      value: String(question.answer.value),
    });
    assert.equal(
      engine.isResponseComplete(question, harness.status().ui.responseState),
      true,
      `${method} accepts its displayed volume entry`,
    );

    const failed = createRouteDispatchHarness(question, false);
    failed.harness.status().ui.responseState.viewedLayers = [...viewedLayers];
    failed.harness.status().ui.responseState.method = method;
    const beforeUi = structuredClone(failed.harness.status().ui);
    const beforeBytes = engine.exportState(failed.harness.status().state);
    failed.harness.input({
      dataset: { controlMode: "play", responseInput: "value" },
      value: String(question.answer.value),
    });
    assert.deepEqual(
      plain(failed.harness.status().ui),
      plain(beforeUi),
      `${method} failed save removes the unsaved typed volume`,
    );
    assert.equal(
      engine.exportState(failed.harness.status().state),
      beforeBytes,
      `${method} failed save restores exact exported bytes`,
    );
    assert.equal(failed.effects.visibleValue, "", `${method} rerender visibly clears the unsaved entry`);
    assert.equal(failed.effects.renders, 1, `${method} failed entry rerenders once`);
    assert.equal(failed.effects.saveCalls, 1, `${method} failed entry attempts one save`);
  }
});

test("QA-005 destructive reset cannot confirm under the opening pointer event", async () => {
  const effects = {
    now: 10_000,
    persisted: 0,
    renders: 0,
    closed: 0,
    state: engine.createInitialState(22_000),
  };
  const source = `(()=>{
    "use strict";
    const E=engine;
    const Date={now:()=>effects.now};
    let destructiveDialog={kind:"reset",enableAt:effects.now+700};
    let state=effects.state;
    let ui={screen:"grown",grownTab:"backup",session:null,index:0,resetArmed:false,stopReason:null,stopRequested:false};
    let warning="old warning";
    let backupNotice="";
    let profileChosen=true;
    let persistedPlacementDraftBytes=null;
    const PLACEMENT_DRAFT_MAX_CHARACTERS=262144;
    const dayNow=()=>22000;
    function raiseWarning(message){throw new Error(message);}
    async function persistProgressBytesCommitted(){effects.persisted+=1;return true;}
    function purgePlacementDraftAfterMainCommit(){return true;}
    function closeDestructiveDialog(){effects.closed+=1;destructiveDialog=null;}
    function render(){effects.renders+=1;}
    ${extractFunction("persistedPlacementDraftGenerationFloor")}
    ${extractFunction("confirmDestructiveDialog")}
    return {
      confirm:confirmDestructiveDialog,
      status:()=>({destructiveDialog,state,ui,warning,backupNotice})
    };
  })()`;
  const harness = new vm.Script(source, {
    filename: "math-quest-destructive-confirmation.js",
  }).runInNewContext({ effects, engine });

  await harness.confirm();
  assert.equal(effects.persisted, 0, "the immediate second event cannot reset progress");
  assert.equal(effects.closed, 0, "the protected dialog remains open");
  assert.ok(harness.status().destructiveDialog, "confirmation remains pending");

  effects.now += 701;
  await harness.confirm();
  assert.equal(effects.persisted, 1, "a later deliberate confirmation commits once");
  assert.equal(effects.closed, 1, "the confirmed dialog closes");
  assert.equal(effects.renders, 1, "the new state renders once");
  assert.equal(harness.status().state.earnedLevel, 1, "reset starts at the first level");
  assert.equal(harness.status().state.placementDraftGeneration, 1, "reset advances the placement draft generation");
});

test("QA-015 time-cap input and persisted settings reject 999-minute state", () => {
  const parser = new vm.Script(`(()=>{
    ${extractFunction("parseSoftTimeCapMinutes")}
    return parseSoftTimeCapMinutes;
  })()`, { filename: "math-quest-time-cap-parser.js" }).runInNewContext();

  for (const [raw, expected] of [["", null], ["1", 60_000], ["14", 840_000]]) {
    const parsed = parser(raw);
    assert.equal(parsed.ok, true, `${JSON.stringify(raw)} accepted`);
    assert.equal(parsed.value, expected, `${JSON.stringify(raw)} value`);
  }
  for (const raw of ["0", "15", "999", "-1", "1.5", "1e1", "ten", " 2.0 "]) {
    const parsed = parser(raw);
    assert.equal(parsed.ok, false, `${JSON.stringify(raw)} rejected`);
    assert.match(parsed.error, /1 to 14/u);
  }

  for (const cap of [null, 60_000, 840_000]) {
    const state = engine.createInitialState(22_000);
    state.settings.grownUpSoftTimeCapMs = cap;
    assert.equal(engine.validateState(state), null, `${String(cap)} persisted boundary`);
    const restored = engine.loadState(engine.exportState(state), 22_000);
    assert.equal(restored.ok, true, `${String(cap)} reload`);
    assert.equal(restored.state.settings.grownUpSoftTimeCapMs, cap, `${String(cap)} round trip`);
  }

  const zeroCap = engine.createInitialState(22_000);
  zeroCap.settings.grownUpSoftTimeCapMs = 0;
  assert.match(engine.validateState(zeroCap), /Invalid settings/u, "zero is not a valid persisted soft-time cap");
  const zeroRestored = engine.loadState(JSON.stringify(zeroCap), 22_000);
  assert.equal(zeroRestored.ok, true, "legacy zero-minute cap migrates safely");
  assert.equal(zeroRestored.migrated, true, "legacy zero-minute cap reports migration");
  assert.equal(zeroRestored.state.settings.grownUpSoftTimeCapMs, null, "legacy zero becomes the ordinary stage cap");
  assert.ok(
    engine.buildSessionQueue(zeroRestored.state, { playDay: 22_000, seed: 1 }).effectiveTimeCapMs > 0,
    "a migrated legacy zero cap cannot create an immediate zero-millisecond session",
  );

  for (const minutes of [15, 999]) {
    const stale = engine.createInitialState(22_000);
    stale.settings.grownUpSoftTimeCapMs = minutes * 60_000;
    const restored = engine.loadState(JSON.stringify(stale), 22_000);
    assert.equal(restored.ok, true, `${minutes}-minute legacy save migrates`);
    assert.equal(restored.migrated, true, `${minutes}-minute legacy save reports migration`);
    assert.equal(restored.state.settings.grownUpSoftTimeCapMs, 840_000, `${minutes}-minute clamp`);
  }
});

test("QA-006/016 cold boot renders and focuses only after progress protection settles", async () => {
  let resolveProtection;
  const effects = {
    order: [],
    resumed: false,
    screen: "home",
    phase: "question",
    selected: null,
    capstoneSubmitted: false,
    ready: new Promise((resolve) => { resolveProtection = resolve; }),
  };
  const source = `(()=>{
    "use strict";
    const ui=effects;
    const profileChosen=true;
    const saveRecoveryRequired=false;
    const state={activeSession:null};
    const CSS={escape:value=>String(value)};
    const focusTarget={focus(){effects.order.push("focus:"+effects.lastSelector);}};
    const app={
      querySelector(selector){effects.lastSelector=selector;return focusTarget;},
      focus(){effects.order.push("focus:app");},
    };
    async function initializeProgressPersistence(){effects.order.push("protection-start");return effects.ready;}
    function restorePlacementDraft(){return false;}
    function resumeActive(){effects.order.push("resume");return effects.resumed;}
    function render(){effects.order.push("render");}
    function initializePwa(){effects.order.push("pwa");}
    ${extractFunction("coldStartFocusSelector")}
    ${extractFunction("focusColdStartTarget")}
    ${extractFunction("coldBootstrap")}
    return coldBootstrap;
  })()`;
  const bootstrap = new vm.Script(source, {
    filename: "math-quest-cold-bootstrap.js",
  }).runInNewContext({ effects });

  const pending = bootstrap();
  await Promise.resolve();
  assert.deepEqual(effects.order, ["protection-start"], "no child UI exists before protection settles");
  resolveProtection(true);
  await pending;
  assert.deepEqual(
    effects.order,
    ["protection-start", "resume", "render", 'focus:[data-action="start"]', "pwa"],
    "fresh Home renders and focuses Start after the writer lease and before PWA work",
  );

  effects.order.length = 0;
  effects.resumed = true;
  effects.screen = "session";
  effects.phase = "pick";
  effects.ready = Promise.resolve(true);
  await bootstrap();
  assert.deepEqual(
    effects.order,
    ["protection-start", "resume", 'focus:[data-action="choose-question"]', "pwa"],
    "a resumed activity is not overwritten and its first task control receives focus",
  );
});

test("QA-024 Home navigation appears only when it can change screens", () => {
  const source = `(()=>{
    "use strict";
    const ui={screen:"home",world:"ocean"};
    const worldInfo={ocean:{icon:"ocean"}};
    const iconSvg=()=>"<svg></svg>";
    const s=(id)=>id;
    ${extractFunction("header")}
    return {ui,header};
  })()`;
  const harness = new vm.Script(source, {
    filename: "math-quest-home-navigation.js",
  }).runInNewContext({});

  assert.doesNotMatch(
    harness.header(),
    /data-action="home"/u,
    "Home must not present a button that only rerenders the current screen",
  );

  for (const screen of ["session", "grown", "parents"]) {
    harness.ui.screen = screen;
    assert.match(
      harness.header(),
      /data-action="home"/u,
      `${screen} must retain a working route back to Home`,
    );
  }
});

test("QA-025 fresh sessions rotate among eligible skills and advance each skill through CPA order", () => {
  const state = engine.createInitialState(22_000);
  const session = engine.buildSessionQueue(state, { playDay: 22_000, seed: 1 });
  const initialIds = session.queue.slice(0, 3).map((slot) => slot.skillId);
  assert.deepEqual(
    plain(initialIds),
    ["MQ-001", "MQ-004", "MQ-006"],
    "the opening session must not collapse to repeated copies of one obligation",
  );

  const bySkill = new Map();
  for (const slot of session.queue) {
    if (!bySkill.has(slot.skillId)) bySkill.set(slot.skillId, []);
    bySkill.get(slot.skillId).push(slot);
  }
  assert.ok(bySkill.size >= 3, "the first session samples several eligible skills");
  for (const [skillId, slots] of bySkill) {
    assert.ok(slots.length >= 2, `${skillId} receives the required young-learner second exposure`);
    assert.deepEqual(
      plain(slots.slice(0, 2).map((slot) => slot.representation)),
      ["CONCRETE", "PICTORIAL"],
      `${skillId} begins with concrete work before pictorial work`,
    );
  }
});

test("QA-026 mastery requires every declared representation phase in order", () => {
  const skill = engine.SKILL_BY_ID["MQ-003"];
  const attempt = (index, representation) => ({
    recordId: `qa-026-${index}`,
    questionId: `qa-026-question-${index}`,
    skillId: skill.skillId,
    level: skill.level,
    stage: skill.stage,
    taskType: skill.constraints.taskTypes[0],
    tier: "HARD/TARGET",
    representation,
    inputClass: "CONSTRUCTION",
    inputMethod: "PAIR_LINK",
    selectionOptionCount: 0,
    evidenceClass: "CONSTRUCTION",
    feedbackClass: "FIRST_TRY_CLEAN",
    coldTest: false,
    scheduledReview: false,
    sampleKey: `${skill.skillId}|${engine.CONSTANTS.SAMPLE_KEY_VERSION}|qa-026-${index}`,
    firstAnswerCorrect: true,
    hintUsed: false,
    changed: false,
    elapsed: 4_000,
    idleMs: 0,
    validTelemetry: true,
    guessingLike: false,
    modelUsed: false,
    applied: false,
    preview: false,
    capstone: false,
    reteachStep: false,
    sessionId: `qa-026-session-${index}`,
    playDay: 22_000 + index,
  });
  const apply = (state, row) => engine.applyAttempt(state, row).state;

  let pictorialOnly = engine.createInitialState(22_000);
  for (let index = 0; index < 3; index += 1) {
    pictorialOnly = apply(pictorialOnly, attempt(index, "PICTORIAL"));
  }
  assert.notEqual(
    pictorialOnly.skills[skill.skillId].acquisition,
    "SOLID",
    "repeated pictorial success cannot skip the declared concrete phase",
  );

  let reversed = engine.createInitialState(22_000);
  reversed = apply(reversed, attempt(10, "PICTORIAL"));
  reversed = apply(reversed, attempt(11, "CONCRETE"));
  assert.notEqual(
    reversed.skills[skill.skillId].acquisition,
    "SOLID",
    "seeing the required phases in reverse order does not satisfy CPA progression",
  );

  let ordered = engine.createInitialState(22_000);
  ordered = apply(ordered, attempt(20, "CONCRETE"));
  ordered = apply(ordered, attempt(21, "PICTORIAL"));
  assert.equal(ordered.skills[skill.skillId].acquisition, "SOLID");
  assert.equal(
    ordered.skills[skill.skillId].masteryContractVersion,
    engine.CONSTANTS.MASTERY_CONTRACT_VERSION,
  );

  const legacy = plain(pictorialOnly);
  const legacyRecord = legacy.skills[skill.skillId];
  legacyRecord.acquisition = "SOLID";
  legacyRecord.witnessIds = legacyRecord.evidence.slice(0, 2).map((row) => row.recordId);
  legacyRecord.masteryVerifiedPlayDay = legacyRecord.evidence[1].playDay;
  legacyRecord.masteryContractVersion = engine.CONSTANTS.SAMPLE_KEY_VERSION;
  const migrated = engine.loadState(JSON.stringify(legacy), 22_010);
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.state.skills[skill.skillId].acquisition, "PRACTISING");
  assert.deepEqual(plain(migrated.state.skills[skill.skillId].witnessIds), []);
});

test("QA-027 visual operands and concrete tasks remain available to sight, speech, and assistive technology", () => {
  const source = `(()=>{
    "use strict";
    const MODEL_FAMILIES=new Set(["attributeSet","comparison","numberBond","tenFrame","array","fractionPair","placeValue","numberLine","proportionalBar","areaGrid","clockSpan","visualPrompt"]);
    const escape=value=>String(value).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const s=(id,slots={})=>({
      "aria.mathModel":"Math model",
      "instruction.physical":"Grown-up: make this with real objects, then choose We made it.",
      "instruction.physicalModel":"Try "+slots.representation+" with large objects.",
      "ui.physicalDone":"We made it"
    })[id]||id;
    const E={CONSTANTS:{READABLE_PROBLEM_TEXT_FROM_LEVEL:8}};
    const displayPrompt=q=>escape(q.prompt);
    let ui={screen:"session",phase:"physical",question:{prompt:"Pair every shell with one shell."}};
    ${extractFunction("modelOperandDescription")}
    ${extractFunction("semanticModel")}
    ${extractFunction("durationEvidenceSpeech")}
    ${extractFunction("replayText")}
    ${extractFunction("physicalTaskHtml")}
    return {modelOperandDescription,semanticModel,durationEvidenceSpeech,replayText,physicalTaskHtml};
  })()`;
  const harness = new vm.Script(source, {
    filename: "math-quest-complete-visual-operands.js",
  }).runInNewContext({});

  const models = [
    {
      label: "The clock shows 6:30",
      model: { type: "visualPrompt", values: { kind: "clock", items: [{ hour: 6, minute: 30 }] } },
    },
    {
      label: "The start clock shows 3:26. The end clock shows 3:55",
      model: {
        type: "clockSpan",
        values: { startHour: 3, startMinute: 26, endHour: 3, endMinute: 55 },
      },
    },
    {
      label: "The angle measures 80 degrees",
      model: {
        type: "visualPrompt",
        values: { kind: "geometry", items: [{ kind: "angle", degrees: 80 }] },
      },
    },
    {
      label: "The solid is 4 units long, 4 units wide, and 4 units high",
      model: {
        type: "visualPrompt",
        values: { kind: "volume", items: [{ kind: "cubeLayers", length: 4, width: 4, height: 4 }] },
      },
    },
    {
      label: "The composite shape has first rectangle 3 by 11 cm and second rectangle 7 by 5 cm",
      model: {
        type: "areaGrid",
        values: {
          lengthUnitSymbol: "cm",
          parts: [
            { label: "first rectangle", width: 3, height: 11 },
            { label: "second rectangle", width: 7, height: 5 },
          ],
        },
      },
    },
  ];
  for (const { label, model } of models) {
    assert.equal(harness.modelOperandDescription(model), label);
    assert.equal(harness.durationEvidenceSpeech({ modelDescriptor: model }), `${label}.`);
    const rendered = harness.semanticModel(model, { prompt: "Use the model." }, "<span>visual</span>");
    assert.match(rendered, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
    assert.match(rendered, /role="img"/u);
  }

  assert.match(harness.replayText(), /Pair every shell with one shell\./u);
  const physical = harness.physicalTaskHtml(
    { level: 1, prompt: "Pair every shell with one shell." },
    { representation: "objects-and-actions" },
    "<span>two rows of shells</span>",
  );
  assert.match(physical, /Pair every shell with one shell\./u);
  assert.match(physical, /two rows of shells/u);
  assert.match(physical, /data-action="physical-done"/u);
});

test("QA-028 MQ-111 estimates use the rounded operands exactly and comparison wording is grammatical", () => {
  const operations = new Set();
  let fractionalQuotientSeen = false;
  for (let ordinal = 0; ordinal < 96; ordinal += 1) {
    const question = engine.makeQuestion({
      skillId: "MQ-111",
      tier: ordinal % 2 ? "HARD/TARGET" : "EASY",
      representation: "PICTORIAL",
      seed: 0x71313131,
      ordinal,
      eligibleQuestionOrdinal: ordinal,
      theme: "forest",
    });
    if (question.taskType !== "plausibility-check") continue;
    const { a, b, place, operation } = question.params;
    const roundedA = Math.round(a / place) * place;
    const roundedB = Math.round(b / place) * place;
    const expected = operation === "sum"
      ? roundedA + roundedB
      : operation === "difference"
        ? Math.abs(roundedA - roundedB)
        : operation === "product"
          ? roundedA * roundedB
          : roundedA / roundedB;
    operations.add(operation);
    assert.equal(Number(question.answer.value), expected, question.prompt);
    assert.equal(engine.gradeAnswer(question, String(expected)).correct, true, question.prompt);
    if (operation === "quotient" && !Number.isInteger(expected)) fractionalQuotientSeen = true;
  }
  assert.deepEqual(
    plain([...operations].sort()),
    ["difference", "product", "quotient", "sum"],
  );
  assert.equal(fractionalQuotientSeen, true, "the oracle exercises the former rounded-quotient defect");

  for (let ordinal = 0; ordinal < 48; ordinal += 1) {
    const question = engine.makeQuestion({
      skillId: "MQ-035",
      tier: "EASY",
      representation: "PICTORIAL",
      seed: 0x61747472,
      ordinal,
      eligibleQuestionOrdinal: ordinal,
      theme: "ocean",
    });
    assert.doesNotMatch(question.prompt, /\ba (?:apple|orange|acorn)\b/iu);
  }
});

test("QA-029 child play renders an explicit large answer outcome for both result branches", () => {
  const source = `(()=>{
    "use strict";
    const ui={screen:"session",isReteach:false};
    const s=id=>({
      "feedback.correctStatus":"Correct.",
      "feedback.incorrectStatus":"Not correct yet.",
      "feedback.placementIncorrectStatus":"Not correct."
    })[id]||id;
    const iconSvg=name=>"<i data-icon=\\""+name+"\\"></i>";
    const escape=value=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    ${extractFunction("feedbackStateHtml")}
    return feedbackStateHtml;
  })()`;
  const feedback = new vm.Script(source, {
    filename: "math-quest-child-feedback.js",
  }).runInNewContext({});
  const correct = feedback({ firstAnswerCorrect: true }, "You matched the pattern.");
  assert.match(correct, /data-feedback-state="correct"/u);
  assert.match(correct, /<strong id="feedback-title">Correct\.<\/strong>/u);
  assert.match(correct, /role="status"/u);
  assert.match(correct, /tabindex="-1"/u);
  const incorrect = feedback({ firstAnswerCorrect: false }, "Try the other piece.");
  assert.match(incorrect, /data-feedback-state="incorrect"/u);
  assert.match(incorrect, /<strong id="feedback-title">Not correct yet\.<\/strong>/u);
});

test("QA-030 early pattern choices always contain a visible and spoken token", () => {
  const source = `(()=>{
    "use strict";
    const escape=value=>String(value).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const colourName=value=>["red","blue","green","yellow"].includes(String(value))?String(value):"";
    const categoryIconHtml=value=>"<i data-animal=\\""+escape(value)+"\\"></i>";
    const shapeVisualHtml=value=>"<i data-shape=\\""+escape(value)+"\\"></i>";
    const responseAction=()=>\"\";
    const questionModelHtml=()=>\"\";
    ${extractFunction("patternTokenVisualHtml")}
    ${extractFunction("patternBuildConstructionHtml")}
    return patternBuildConstructionHtml;
  })()`;
  const renderPattern = new vm.Script(source, {
    filename: "math-quest-pattern-choices.js",
  }).runInNewContext({});
  const question = engine.makeQuestion({
    skillId: "MQ-004",
    tier: "EASY",
    representation: "PICTORIAL",
    seed: 1,
    ordinal: 0,
    eligibleQuestionOrdinal: 0,
    theme: "forest",
  });
  const rendered = renderPattern(question, "play", { responseState: { tokens: [] } });
  assert.equal((rendered.match(/<button data-token-kind=/gu) || []).length, 4);
  assert.equal((rendered.match(/aria-label="(?:circle|triangle|square|diamond)"/gu) || []).length, 4);
  assert.equal((rendered.match(/class="pattern-token-label"/gu) || []).length, 4);
  assert.doesNotMatch(rendered, /<button[^>]*>\s*<\/button>/u);
});

test("speech and gentle sound effects remain off in every fresh game", () => {
  for (const playDay of [0, 1, 22_000]) {
    const state = engine.createInitialState(playDay);
    assert.equal(state.settings.speechEnabled, false);
    assert.equal(state.settings.soundEnabled, false);
  }
});
