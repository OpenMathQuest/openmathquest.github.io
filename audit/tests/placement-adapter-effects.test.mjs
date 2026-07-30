import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/giu)].map((match) => match[1]);
assert.equal(scripts.length, 2);
const adapter = scripts[1];

function matchingDelimiter(source, openIndex, open, close) {
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
  throw new Error(`unclosed ${open}${close}`);
}

function extractFunction(name) {
  const matches = [...adapter.matchAll(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "gu"))];
  assert.equal(matches.length, 1, `${name} must have exactly one adapter declaration`);
  const start = matches[0].index;
  const parametersStart = adapter.indexOf("(", start);
  const parametersEnd = matchingDelimiter(adapter, parametersStart, "(", ")");
  const bodyStart = adapter.indexOf("{", parametersEnd);
  const bodyEnd = matchingDelimiter(adapter, bodyStart, "{", "}");
  return adapter.slice(start, bodyEnd + 1);
}

function extractListenerStatement(target, eventName, marker) {
  const token = `${target}.addEventListener("${eventName}",`;
  const matches = [];
  for (let from = 0; ; ) {
    const start = adapter.indexOf(token, from);
    if (start < 0) break;
    const open = adapter.indexOf("(", start);
    const close = matchingDelimiter(adapter, open, "(", ")");
    const statement = `${adapter.slice(start, close + 1)};`;
    if (statement.includes(marker)) matches.push(statement);
    from = close + 1;
  }
  assert.equal(matches.length, 1, `${target} ${eventName} listener containing ${marker} must be unique`);
  return matches[0];
}

function evaluate({ prelude = "", functions = [], body = "", exposed = "", context = {} }) {
  return new vm.Script(`(()=>{"use strict";${prelude}${functions.map(extractFunction).join("\n")}${body}return {${exposed}};})()`, {
    filename: "math-quest-placement-adapter-effects.js",
  }).runInNewContext(context);
}

function draft({
  run,
  phase = "question",
  questionId = "q1",
  correct = null,
  responseState = { touched: [], count: "" },
  generation = 0,
  feedbackKind = phase === "feedback" ? (correct ? "correct" : "incorrect") : null,
}) {
  const responseKind = phase === "feedback"
    ? feedbackKind
    : null;
  return JSON.stringify({
    schemaVersion: 4,
    placementDraftGeneration: generation,
    run,
    ui: {
      world: "ocean",
      phase,
      questionId,
      selected: null,
      entry: "",
      fractionParts: { whole: "", numerator: "", denominator: "" },
      modelCells: [],
      responseState,
      responseKind,
      feedbackKind,
    },
  });
}

function restoreHarness(bytes, { stateGeneration = 0 } = {}) {
  return evaluate({
    prelude: `
      const PLACEMENT_DRAFT_SCHEMA=4,PLACEMENT_DRAFT_MAX_CHARACTERS=262144;
      const placementDraftUiKeys=Object.freeze(["world","phase","questionId","selected","entry","fractionParts","modelCells","responseState","responseKind","feedbackKind"]);
      const question={questionId:"q1",inputMethod:"COUNT_TOUCH",options:[]};
      const nextQuestion={questionId:"q2",inputMethod:"COUNT_TOUCH",options:[]};
      const state={identity:"MAIN-UNCHANGED",placementDraftGeneration:effects.stateGeneration};
      let persistedPlacementDraftBytes=effects.bytes,placementNotice="",removed=0;
      let ui={screen:"grown",world:"ocean",session:null,placementRun:null,placementCorrect:null,placementFeedbackKind:null,placementRecommendation:null};
      const E={
        validatePlacementRun(run){return run.stale?{valid:false,error:"stale placement draft",complete:false}:{valid:true,error:null,complete:Boolean(run.complete)};},
        placementCurrentQuestion(run){return run.answers.length===0?question:nextQuestion;},
        placementRecommendation(){return {recommendedLevel:4,questionCount:12};},
        createResponseState(){return {touched:[],count:""};}
      };
      function removePlacementDraft(){removed+=1;persistedPlacementDraftBytes=null;return true;}
      function status(){return {ui:structuredClone(ui),placementNotice,removed,state:structuredClone(state),bytes:persistedPlacementDraftBytes};}
    `,
    functions: [
      "safePlacementDraftValue",
      "placementResponseShapeMatches",
      "restorePlacementResponse",
      "restorePlacementDraft",
    ],
    exposed: "restorePlacementDraft,status",
    context: { effects: { bytes, stateGeneration }, structuredClone },
  });
}

test("completed-run crash restore preserves the final explicit answer outcome before the result", () => {
  const run = { answers: [{ questionId: "q1", responseKind: "correct" }], complete: true };
  const harness = restoreHarness(draft({ run, phase: "feedback", correct: true }));
  assert.equal(harness.restorePlacementDraft(), true);
  const status = harness.status();
  assert.equal(status.ui.screen, "placement");
  assert.equal(status.ui.phase, "feedback");
  assert.equal(status.ui.question.questionId, "q1");
  assert.equal(status.ui.placementCorrect, true);
  assert.equal(status.ui.placementFeedbackKind, "correct");
  assert.equal(status.ui.placementRecommendation.recommendedLevel, 4);
  assert.equal(status.removed, 0);
  assert.equal(status.state.identity, "MAIN-UNCHANGED");
});

test("stale and recursively corrupt placement drafts fail closed without reaching a renderer", () => {
  const corrupt = restoreHarness(draft({
    run: { answers: [], complete: false },
    responseState: { touched: {}, count: "" },
  }));
  assert.equal(corrupt.restorePlacementDraft(), false);
  assert.equal(corrupt.status().removed, 1);
  assert.equal(corrupt.status().ui.placementRun, null);
  assert.equal(corrupt.status().state.identity, "MAIN-UNCHANGED");
  assert.match(corrupt.status().placementNotice, /could not be resumed/u);

  const stale = restoreHarness(draft({ run: { answers: [], complete: false, stale: true } }));
  assert.equal(stale.restorePlacementDraft(), false);
  assert.equal(stale.status().removed, 1);
  assert.equal(stale.status().state.identity, "MAIN-UNCHANGED");

  const priorGeneration = restoreHarness(
    draft({ run: { answers: [], complete: false }, generation: 7 }),
    { stateGeneration: 8 },
  );
  assert.equal(priorGeneration.restorePlacementDraft(), false);
  assert.equal(priorGeneration.status().removed, 1);
  assert.equal(priorGeneration.status().ui.placementRun, null);
  assert.equal(priorGeneration.status().state.placementDraftGeneration, 8);
});

test("failed next-question draft persistence rolls back to committed feedback", () => {
  const harness = evaluate({
    prelude: `
      const oldQuestion={questionId:"q1",inputMethod:"COUNT_TOUCH"};
      const newQuestion={questionId:"q2",inputMethod:"COUNT_TOUCH"};
      const state={identity:"MAIN"};
      let placementNotice="";
      let ui={screen:"placement",phase:"feedback",placementRun:{answers:[{questionId:"q1",responseKind:"incorrect"}]},question:oldQuestion,placementCorrect:false,placementFeedbackKind:"incorrect",placementRecommendation:null,selected:null,entry:"",fractionParts:{whole:"",numerator:"",denominator:""},modelCells:[],responseState:{touched:[],count:""}};
      const E={
        validatePlacementRun(){return {valid:true,complete:false};},
        placementCurrentQuestion(){return newQuestion;},
        createResponseState(){return {touched:[],count:""};}
      };
      function savePlacementDraft(){placementNotice="draft write failed";return false;}
      function render(){effects.renders+=1;}
      function focusColdStartTarget(){effects.focused+=1;}
      function speak(){effects.spoken+=1;}
      function status(){return structuredClone(ui);}
    `,
    functions: ["resetPlacementResponse", "nextPlacement"],
    exposed: "nextPlacement,status",
    context: { effects: { renders: 0, focused: 0, spoken: 0 }, structuredClone },
  });
  harness.nextPlacement();
  const status = harness.status();
  assert.equal(status.phase, "feedback");
  assert.equal(status.question.questionId, "q1");
  assert.equal(status.placementCorrect, false);
  assert.equal(status.placementFeedbackKind, "incorrect");
});

test("Not sure records a valid non-correct placement response without grading fabricated input", () => {
  const effects = { saved: 0, graded: 0, focused: 0, announced: [], sounds: [], renders: 0 };
  const harness = evaluate({
    prelude: `
      let placementNotice="";
      const state={identity:"MAIN-UNCHANGED"};
      let ui={screen:"placement",phase:"question",placementRun:{answers:[]},question:{questionId:"q1"},placementCorrect:null,placementFeedbackKind:null,placementRecommendation:null};
      const E={
        submitPlacementNotSure(run){return {run:{...run,answers:[...run.answers,{questionId:"q1",responseKind:"not-sure"}]},grade:{valid:true,correct:false,notSure:true,reason:"not-sure",canonical:"",responseKind:"not-sure"},complete:false,recommendation:null};},
        submitPlacementAnswer(){effects.graded+=1;throw new Error("ordinary grading must not run");}
      };
      const app={querySelector(){return {focus(){effects.focused+=1;}};}};
      function cancelSpeech(){}
      function savePlacementDraft(){effects.saved+=1;return true;}
      function playSound(name){effects.sounds.push(name);}
      function render(){effects.renders+=1;}
      function announce(value){effects.announced.push(value);}
      function placementFeedbackText(){return "Not sure. Let’s try another.";}
      function status(){return {ui:structuredClone(ui),state:structuredClone(state)};}
    `,
    functions: ["submitPlacementNotSureAnswer"],
    exposed: "submitPlacementNotSureAnswer,status",
    context: { effects, structuredClone },
  });
  harness.submitPlacementNotSureAnswer();
  const status = harness.status();
  assert.deepEqual(status.ui.placementRun.answers, [{ questionId: "q1", responseKind: "not-sure" }]);
  assert.equal(status.ui.phase, "feedback");
  assert.equal(status.ui.placementCorrect, false);
  assert.equal(status.ui.placementFeedbackKind, "not-sure");
  assert.equal(status.state.identity, "MAIN-UNCHANGED");
  assert.equal(effects.graded, 0);
  assert.equal(effects.saved, 1);
  assert.deepEqual(effects.sounds, [], "choosing Not sure must not play the incorrect-answer sound");
  assert.deepEqual(effects.announced, ["Not sure. Let’s try another."]);
  assert.equal(effects.focused, 1);
});

test("Not sure restores and renders as a distinct neutral outcome", () => {
  const restored = restoreHarness(draft({
    run: { answers: [{ questionId: "q1", responseKind: "not-sure" }], complete: false },
    phase: "feedback",
    correct: false,
    feedbackKind: "not-sure",
  }));
  assert.equal(restored.restorePlacementDraft(), true);
  assert.equal(restored.status().ui.placementFeedbackKind, "not-sure");

  const harness = evaluate({
    prelude: `
      let ui={screen:"placement",placementCorrect:false,placementFeedbackKind:"not-sure",isReteach:false};
      function s(id){return ({
        "feedback.placementNotSureStatus":"Not sure. Let’s try another.",
        "feedback.placementIncorrectStatus":"Not correct.",
        "feedback.correctStatus":"Correct.",
        "feedback.incorrectStatus":"Not correct yet."
      })[id]||id;}
      function iconSvg(name){return '<i data-icon="'+name+'"></i>';}
      function escape(value){return String(value);}
      function show(kind){ui.placementFeedbackKind=kind;return feedbackStateHtml({firstAnswerCorrect:false},"");}
    `,
    functions: ["placementFeedbackPresentation", "placementFeedbackText", "feedbackStateHtml"],
    exposed: "show,placementFeedbackText",
  });
  const neutral = harness.show("not-sure");
  assert.match(neutral, /data-feedback-state="neutral"/u);
  assert.match(neutral, /data-icon="not-sure"/u);
  assert.match(neutral, />Not sure\. Let’s try another\.</u);
  assert.doesNotMatch(neutral, /data-feedback-state="incorrect"/u);
  const incorrect = harness.show("incorrect");
  assert.match(incorrect, /data-feedback-state="incorrect"/u);
  assert.match(incorrect, /data-icon="incorrect"/u);
  assert.match(incorrect, />Not correct\.</u);
});

test("placement speech uses evidence-rich prompts, visible option positions, and exact feedback outcomes", async () => {
  const harness = evaluate({
    prelude: `
      let ui={
        screen:"placement",
        phase:"question",
        hintUsed:false,
        isReteach:false,
        placementCorrect:false,
        placementFeedbackKind:null,
        question:{
          inputClass:"SELECTION",
          prompt:"Which lasts longer?",
          modelDescriptor:{
            type:"visualPrompt",
            instruction:"Compare the time cards.",
            values:{kind:"durationPair",items:[
              {event:"jumping",magnitude:2},
              {event:"drawing",magnitude:5}
            ]}
          },
          options:[
            {optionId:"o0",label:"jumping",value:"jumping"},
            {optionId:"o1",label:"drawing",value:"drawing"}
          ]
        }
      };
      function accessibleOptionLabel(option){return option.label;}
      function s(id,slots={}){
        if(id==="instruction.selectionOption")return "Option "+slots.position+": "+slots.label+".";
        return ({
          "instruction.capstone":"Show what you did today.",
          "instruction.reteach":"Watch one complete step.",
          "feedback.placementNotSureStatus":"Not sure. Let’s try another.",
          "feedback.placementIncorrectStatus":"Not correct.",
          "feedback.correctStatus":"Correct."
        })[id]||id;
      }
      function setFeedback(kind){ui.phase="feedback";ui.placementFeedbackKind=kind;return replayText();}
      function setQuestion(){ui.phase="question";ui.placementFeedbackKind=null;return replayText();}
    `,
    functions: [
      "durationEvidenceSpeech",
      "questionSpeechText",
      "placementFeedbackPresentation",
      "placementFeedbackText",
      "replayText",
    ],
    exposed: "setFeedback,setQuestion,questionSpeechText",
  });
  const question = harness.setQuestion();
  assert.equal(
    question,
    "jumping takes 2 minutes. drawing takes 5 minutes. Which lasts longer? Option 1: jumping. Option 2: drawing.",
  );
  assert.equal(harness.setFeedback("not-sure"), "Not sure. Let’s try another.");
  assert.equal(harness.setFeedback("incorrect"), "Not correct.");

  const startEffects = { spoken: [] };
  const start = evaluate({
    prelude: `
      let placementNotice="";
      let state={activeSession:null,previewLevel:null,maxSeenPlayDay:5,seed:9,placement:{runNonce:0}};
      let ui={screen:"grown",world:"ocean",grownTab:"placement",placementRun:null};
      let placementStartBusy=false;
      const question={questionId:"q1"};
      const E={
        beginPlacementRun(){return {state:{...state,placement:{runNonce:1}},run:{answers:[],nonce:1,seed:123}};},
        placementCurrentQuestion(){return question;},
        createResponseState(){return {};},
        exportState(){return "COMMITTED-NONCE";}
      };
      function dayNow(){return 5;}
      async function persistProgressBytesCommitted(bytes){startEffects.committed=bytes;return true;}
      function savePlacementDraft(){return true;}
      function render(){}
      function focusColdStartTarget(){}
      function speak(text){startEffects.spoken.push(text);}
      function questionSpeechText(){return "EVIDENCE-RICH START";}
    `,
    functions: ["resetPlacementResponse", "startPlacement"],
    exposed: "startPlacement",
    context: { startEffects, structuredClone },
  });
  assert.equal(await start.startPlacement(), true);
  assert.equal(startEffects.committed, "COMMITTED-NONCE");
  assert.deepEqual(startEffects.spoken, ["EVIDENCE-RICH START"]);

  const nextEffects = { spoken: [] };
  const next = evaluate({
    prelude: `
      let placementNotice="";
      const state={identity:"MAIN"};
      let ui={screen:"placement",phase:"feedback",placementRun:{answers:[{questionId:"q1",responseKind:"correct"}]},question:{questionId:"q1"},placementCorrect:true,placementFeedbackKind:"correct",placementRecommendation:null};
      const nextQuestion={questionId:"q2"};
      const E={
        validatePlacementRun(){return {valid:true,complete:false};},
        placementCurrentQuestion(){return nextQuestion;},
        createResponseState(){return {};}
      };
      function savePlacementDraft(){return true;}
      function render(){}
      function focusColdStartTarget(){}
      function speak(text){nextEffects.spoken.push(text);}
      function questionSpeechText(){return "EVIDENCE-RICH NEXT";}
    `,
    functions: ["resetPlacementResponse", "nextPlacement"],
    exposed: "nextPlacement",
    context: { nextEffects, structuredClone },
  });
  next.nextPlacement();
  assert.deepEqual(nextEffects.spoken, ["EVIDENCE-RICH NEXT"]);
});

test("new and retried placement runs commit a fresh private nonce before any draft is exposed", async () => {
  const build = ({ commitOk = true, resultRun = false } = {}) => {
    const effects = { order: [], commitOk };
    const harness = evaluate({
      prelude: `
        let placementNotice="",placementStartBusy=false;
        let state={activeSession:null,previewLevel:null,maxSeenPlayDay:5,placement:{runNonce:${resultRun ? 1 : 0}}};
        let ui=${resultRun
    ? '{screen:"placement",phase:"result",world:"ocean",grownTab:"placement",placementRun:{answers:[],nonce:1,seed:101},placementCorrect:null,placementFeedbackKind:null,placementRecommendation:{}}'
    : '{screen:"grown",phase:"question",world:"ocean",grownTab:"placement",placementRun:null}'};
        const E={
          beginPlacementRun({state:current}){
            effects.order.push("prepare");
            const nonce=current.placement.runNonce+1;
            return {state:{...current,placement:{...current.placement,runNonce:nonce}},run:{answers:[],nonce,seed:100+nonce}};
          },
          placementCurrentQuestion(){return {questionId:"fresh-question"};},
          createResponseState(){return {};},
          exportState(candidate){return "NONCE-"+candidate.placement.runNonce;}
        };
        function dayNow(){return 5;}
        async function persistProgressBytesCommitted(bytes){effects.order.push("commit:"+bytes);return effects.commitOk;}
        function savePlacementDraft(){effects.order.push("draft:"+state.placement.runNonce);return true;}
        function removePlacementDraft(){effects.order.push("remove-old-draft");return true;}
        function render(){effects.order.push("render");}
        function focusColdStartTarget(){}
        function speak(){effects.order.push("speak");}
        function questionSpeechText(){return "fresh question";}
        function cancelSpeech(){}
        function stopSounds(){}
        function status(){return {state:structuredClone(state),ui:structuredClone(ui),notice:placementNotice,order:[...effects.order]};}
      `,
      functions: ["resetPlacementResponse", "startPlacement", "retryPlacement"],
      exposed: "startPlacement,retryPlacement,status",
      context: { effects, structuredClone },
    });
    return { effects, harness };
  };

  const started = build();
  assert.equal(await started.harness.startPlacement(), true);
  assert.equal(started.harness.status().state.placement.runNonce, 1);
  assert.equal(started.harness.status().ui.placementRun.nonce, 1);
  assert.deepEqual([...started.harness.status().order].slice(0, 3), [
    "prepare",
    "commit:NONCE-1",
    "draft:1",
  ]);

  const failed = build({ commitOk: false });
  assert.equal(await failed.harness.startPlacement(), false);
  assert.equal(failed.harness.status().state.placement.runNonce, 0);
  assert.equal(failed.harness.status().ui.placementRun, null);
  assert.equal(failed.harness.status().order.some((entry) => entry.startsWith("draft:")), false);

  const retried = build({ resultRun: true });
  assert.equal(await retried.harness.retryPlacement(), true);
  assert.equal(retried.harness.status().state.placement.runNonce, 2);
  assert.equal(retried.harness.status().ui.placementRun.nonce, 2);
  assert.deepEqual([...retried.harness.status().order].slice(0, 4), [
    "remove-old-draft",
    "prepare",
    "commit:NONCE-2",
    "draft:2",
  ]);
});

test("placement apply requires a delayed grown-up second confirmation", async () => {
  assert.match(
    adapter,
    /action==="placement-apply"\)openDestructiveDialog\("placement-apply",b,\{startingLevel:Number\(b\.dataset\.level\)\}\)/u,
    "the shipped placement button opens the confirmation boundary rather than committing",
  );
  const effects = { now: 1_000, commits: 0, overlays: 0, closed: 0, timers: [] };
  const harness = evaluate({
    prelude: `
      let destructiveDialog=null,destructiveReturnFocus=null,destructiveEnableTimer=null,pwaDialogOpen=false;
      let ui={screen:"placement",phase:"result",placementRun:{answers:[]}};
      const app={querySelector(){return null;}};
      const document={activeElement:{isConnected:true}};
      const Date={now(){return effects.now;}};
      function closePwaDialog(){}
      function cancelSpeech(){}
      function stopSounds(){}
      function renderDestructiveOverlay(){effects.overlays+=1;}
      function closeDestructiveDialog(){destructiveDialog=null;effects.closed+=1;}
      async function confirmPlacement(level){effects.commits+=1;effects.level=level;return true;}
      function setTimeout(handler,delay){effects.timers.push({handler,delay});return effects.timers.length;}
      function clearTimeout(){}
      function status(){return {open:Boolean(destructiveDialog),commits:effects.commits,level:effects.level??null};}
    `,
    functions: ["openDestructiveDialog", "confirmDestructiveDialog"],
    exposed: "openDestructiveDialog,confirmDestructiveDialog,status",
    context: { effects },
  });
  harness.openDestructiveDialog("placement-apply", { isConnected: true }, { startingLevel: 8 });
  assert.deepEqual({ ...harness.status() }, { open: true, commits: 0, level: null });
  await harness.confirmDestructiveDialog();
  assert.equal(harness.status().commits, 0, "the opening gesture and early repeat cannot commit");
  effects.now = 1_701;
  await harness.confirmDestructiveDialog();
  assert.deepEqual({ ...harness.status() }, { open: false, commits: 1, level: 8 });
  assert.equal(effects.closed, 1);
});

test("draft response mutations and lifecycle exits never write the main progress record", () => {
  const visibility = extractListenerStatement("document", "visibilitychange", "if(document.hidden)");
  const pagehide = extractListenerStatement("window", "pagehide", "releaseProgressWriterLease");
  const harness = evaluate({
    prelude: `
      let ui={screen:"placement"},state={identity:"MAIN"},saveRecoveryRequired=false,progressLeaseStatus="HELD";
      const document={hidden:true,addEventListener(name,handler){effects.documentHandlers[name]=handler;}};
      const window={addEventListener(name,handler){effects.windowHandlers[name]=handler;}};
      function cancelSpeech(){}
      function stopSounds(){}
      function savePlacementDraft(){effects.draftWrites+=1;return true;}
      function save(){effects.mainWrites+=1;return true;}
      function releaseProgressWriterLease(){effects.releases+=1;}
      function responseMutationCheckpoint(){return {state:structuredClone(state),ui:structuredClone(ui)};}
    `,
    functions: ["persistResponseMutation"],
    body: `${visibility}${pagehide}`,
    exposed: `
      placementMutation(){const checkpoint=responseMutationCheckpoint();return persistResponseMutation(checkpoint);},
      visibility(){effects.documentHandlers.visibilitychange();},
      pagehide(){effects.windowHandlers.pagehide();},
      ordinary(){ui.screen="session";effects.documentHandlers.visibilitychange();},
      counts(){return {draftWrites:effects.draftWrites,mainWrites:effects.mainWrites,releases:effects.releases};}
    `,
    context: {
      effects: {
        documentHandlers: {},
        windowHandlers: {},
        draftWrites: 0,
        mainWrites: 0,
        releases: 0,
      },
      structuredClone,
    },
  });
  assert.equal(harness.placementMutation(), true);
  harness.visibility();
  harness.pagehide();
  assert.deepEqual({ ...harness.counts() }, { draftWrites: 3, mainWrites: 0, releases: 1 });
  harness.ordinary();
  assert.deepEqual({ ...harness.counts() }, { draftWrites: 3, mainWrites: 1, releases: 1 });
});

test("failed placement confirmation is transactional and does not delete its recoverable draft", async () => {
  const effects = { commits: 0, removals: 0, renders: 0 };
  const harness = evaluate({
    prelude: `
      let state={identity:"ORIGINAL",maxSeenPlayDay:7},placementNotice="",warning="";
      let ui={screen:"placement",phase:"result",placementRun:{answers:[]},placementCorrect:null,placementRecommendation:{recommendedLevel:3},question:null};
      const E={
        applyPlacementRecommendation(){return {ok:true,state:{identity:"CANDIDATE",maxSeenPlayDay:7}};},
        exportState(candidate){return JSON.stringify(candidate);}
      };
      function dayNow(){return 7;}
      function persistedPlacementDraftGenerationFloor(){return state.placementDraftGeneration;}
      async function persistProgressBytesCommitted(){effects.commits+=1;return false;}
      function removePlacementDraft(){effects.removals+=1;return true;}
      function render(){effects.renders+=1;}
      function status(){return {state:structuredClone(state),ui:structuredClone(ui),placementNotice};}
    `,
    functions: ["confirmPlacement"],
    exposed: "confirmPlacement,status",
    context: { effects, structuredClone },
  });
  await harness.confirmPlacement(3);
  assert.equal(harness.status().state.identity, "ORIGINAL");
  assert.equal(harness.status().ui.screen, "placement");
  assert.equal(effects.commits, 1);
  assert.equal(effects.removals, 0);
});

test("post-commit purge removes even a conflicted placement draft because every earlier draft is now stale", () => {
  const effects = { removals: 0, removedKey: null };
  const harness = evaluate({
    prelude: `
      const PLACEMENT_DRAFT_KEY="math-quest:placement-draft:v1";
      let persistedPlacementDraftBytes="OLDER",placementDraftConflict=true,placementDraftReadable=false,placementNotice="conflict";
      function storageRemove(key){effects.removals+=1;effects.removedKey=key;return true;}
      function status(){return {persistedPlacementDraftBytes,placementDraftConflict,placementDraftReadable,placementNotice};}
    `,
    functions: ["purgePlacementDraftAfterMainCommit"],
    exposed: "purgePlacementDraftAfterMainCommit,status",
    context: { effects },
  });
  assert.equal(harness.purgePlacementDraftAfterMainCommit(), true);
  assert.equal(effects.removals, 1);
  assert.equal(effects.removedKey, "math-quest:placement-draft:v1");
  assert.deepEqual({ ...harness.status() }, {
    persistedPlacementDraftBytes: null,
    placementDraftConflict: false,
    placementDraftReadable: true,
    placementNotice: "",
  });
});

test("placement draft generation floors are bounded, safely parsed, and independent of main-save readability", () => {
  const harness = evaluate({
    prelude: `
      const PLACEMENT_DRAFT_MAX_CHARACTERS=262144;
      let persistedPlacementDraftBytes=null;
      function setBytes(value){persistedPlacementDraftBytes=value;}
    `,
    functions: ["persistedPlacementDraftGenerationFloor"],
    exposed: "persistedPlacementDraftGenerationFloor,setBytes",
  });
  for (const [bytes, expected] of [
    [JSON.stringify({ placementDraftGeneration: 1 }), 1],
    [JSON.stringify({ placementDraftGeneration: 91, unrelated: "safe-to-ignore" }), 91],
    ["{", 0],
    [JSON.stringify({ placementDraftGeneration: -1 }), 0],
    [JSON.stringify({ placementDraftGeneration: Number.MAX_SAFE_INTEGER + 1 }), 0],
    ["x".repeat(262145), 0],
  ]) {
    harness.setBytes(bytes);
    assert.equal(harness.persistedPlacementDraftGenerationFloor(), expected);
  }
});

test("reset and import remove a paused placement draft only after main-state commit", async () => {
  const resetEffects = { removals: 0, commits: 0 };
  const reset = evaluate({
    prelude: `
      let destructiveDialog={kind:"reset",enableAt:0},state={identity:"OLD",placementDraftGeneration:7},profileChosen=true,warning="",backupNotice="";
      let ui={screen:"grown",grownTab:"backup",placementRun:{answers:[]},placementCorrect:false,placementRecommendation:{}};
      const E={createResetState(current){return {identity:"RESET",placementDraftGeneration:current.placementDraftGeneration+1};},exportState(candidate){return JSON.stringify(candidate);}};
      async function persistProgressBytesCommitted(){resetEffects.commits+=1;return true;}
      function purgePlacementDraftAfterMainCommit(){resetEffects.removals+=1;return true;}
      function persistedPlacementDraftGenerationFloor(){return state.placementDraftGeneration;}
      function closeDestructiveDialog(){destructiveDialog=null;}
      function raiseWarning(){}
      function render(){}
      function dayNow(){return 1;}
      function status(){return {state:structuredClone(state),ui:structuredClone(ui)};}
    `,
    functions: ["confirmDestructiveDialog"],
    exposed: "confirmDestructiveDialog,status",
    context: { resetEffects, structuredClone },
  });
  await reset.confirmDestructiveDialog();
  assert.equal(reset.status().state.identity, "RESET");
  assert.equal(reset.status().state.placementDraftGeneration, 8);
  assert.equal(reset.status().ui.placementRun, null);
  assert.equal(resetEffects.commits, 1);
  assert.equal(resetEffects.removals, 1);

  const change = extractListenerStatement("app", "change", 'el.id==="importFile"');
  const importEffects = { handlers: {}, removals: 0, commits: 0, renders: 0 };
  const imported = new vm.Script(`(()=>{"use strict";
    let state={identity:"OLD",placementDraftGeneration:7},ui={screen:"grown",placementRun:{answers:[]},placementCorrect:false,placementRecommendation:{}},backupImportBusy=false,saveRecoveryRequired=false,profileChosen=true;
    const app={addEventListener(name,handler){importEffects.handlers[name]=handler;}};
    const E={CONSTANTS:{BACKUP_MAX_BYTES:1024},importState(){return {ok:true,state:{identity:"IMPORTED",placementDraftGeneration:8}};},exportState(candidate){return JSON.stringify(candidate);}};
    class FileReader{readAsText(){queueMicrotask(()=>this.onload());}}
    function setBackupImportBusy(value){backupImportBusy=Boolean(value);}
    function raiseWarning(){}
    function cancelSpeech(){}
    function stopSounds(){}
    function dayNow(){return 1;}
    function persistedPlacementDraftGenerationFloor(){return state.placementDraftGeneration;}
    async function persistProgressBytesCommitted(){importEffects.commits+=1;return true;}
    function purgePlacementDraftAfterMainCommit(){importEffects.removals+=1;return true;}
    function render(){importEffects.renders+=1;}
    ${change}
    return {
      run(){const target={id:"importFile",files:[{size:20}],value:"chosen",dataset:{}};importEffects.handlers.change({target});},
      status(){return {state:structuredClone(state),ui:structuredClone(ui),busy:backupImportBusy};}
    };
  })()`, { filename: "math-quest-placement-import-effect.js" }).runInNewContext({ importEffects, structuredClone, queueMicrotask });
  imported.run();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(imported.status().state.identity, "IMPORTED");
  assert.equal(imported.status().state.placementDraftGeneration, 8);
  assert.equal(imported.status().ui.placementRun, null);
  assert.equal(importEffects.commits, 1);
  assert.equal(importEffects.removals, 1);
});

test("recovery reset, import, and apply advance beyond a surviving generation-one draft when removeItem throws", async () => {
  const priorDraft = draft({
    run: { answers: [], complete: false },
    generation: 1,
  });
  const resetEffects = { bytes: priorDraft, removeAttempts: 0, commits: 0 };
  const reset = evaluate({
    prelude: `
      const PLACEMENT_DRAFT_KEY="math-quest:placement-draft:v1",PLACEMENT_DRAFT_MAX_CHARACTERS=262144;
      let destructiveDialog={kind:"reset-recovery",enableAt:0},state={identity:"RECOVERY-FALLBACK",placementDraftGeneration:0},profileChosen=true,warning="",backupNotice="",storageAvailable=true;
      let persistedPlacementDraftBytes=resetEffects.bytes,placementDraftReadable=true,placementDraftConflict=false,placementNotice="";
      let ui={screen:"saveRecovery",grownTab:"backup",placementRun:{answers:[]},placementCorrect:false,placementRecommendation:{}};
      const localStorage={removeItem(){resetEffects.removeAttempts+=1;throw new Error("remove denied");}};
      const E={createResetState(current,day,floor){return {identity:"RESET",placementDraftGeneration:Math.max(current.placementDraftGeneration,floor)+1};},exportState(candidate){return JSON.stringify(candidate);}};
      function raiseWarning(){}
      async function persistProgressBytesCommitted(){resetEffects.commits+=1;return true;}
      function closeDestructiveDialog(){destructiveDialog=null;}
      function render(){}
      function dayNow(){return 1;}
      function status(){return {state:structuredClone(state),ui:structuredClone(ui),draftBytes:persistedPlacementDraftBytes,placementDraftReadable,warning};}
    `,
    functions: ["persistedPlacementDraftGenerationFloor", "storageRemove", "purgePlacementDraftAfterMainCommit", "confirmDestructiveDialog"],
    exposed: "confirmDestructiveDialog,status",
    context: { resetEffects, structuredClone },
  });
  await reset.confirmDestructiveDialog();
  const resetStatus = reset.status();
  assert.equal(resetStatus.state.identity, "RESET");
  assert.equal(resetStatus.state.placementDraftGeneration, 2, "recovery fallback generation zero must advance beyond surviving generation one");
  assert.equal(resetStatus.draftBytes, priorDraft, "failed removal leaves the old bytes physically present");
  assert.equal(resetStatus.placementDraftReadable, false);
  assert.equal(resetEffects.commits, 1);
  assert.equal(resetEffects.removeAttempts, 1);
  const resetReload = restoreHarness(resetStatus.draftBytes, { stateGeneration: resetStatus.state.placementDraftGeneration });
  assert.equal(resetReload.restorePlacementDraft(), false);
  assert.equal(resetReload.status().ui.placementRun, null);
  assert.equal(resetReload.status().state.identity, "MAIN-UNCHANGED");

  const change = extractListenerStatement("app", "change", 'el.id==="importFile"');
  const importEffects = { handlers: {}, bytes: priorDraft, removeAttempts: 0, commits: 0 };
  const imported = new vm.Script(`(()=>{"use strict";
    const PLACEMENT_DRAFT_KEY="math-quest:placement-draft:v1",PLACEMENT_DRAFT_MAX_CHARACTERS=262144;
    let state={identity:"RECOVERY-FALLBACK",placementDraftGeneration:0},ui={screen:"saveRecovery",placementRun:{answers:[]},placementCorrect:false,placementRecommendation:{}},backupImportBusy=false,saveRecoveryRequired=true,profileChosen=true,storageAvailable=true;
    let persistedPlacementDraftBytes=importEffects.bytes,placementDraftReadable=true,placementDraftConflict=false,placementNotice="";
    const localStorage={removeItem(){importEffects.removeAttempts+=1;throw new Error("remove denied");}};
    const app={addEventListener(name,handler){importEffects.handlers[name]=handler;}};
    const E={CONSTANTS:{BACKUP_MAX_BYTES:1024},importState(current,json,day,floor){return {ok:true,state:{identity:"IMPORTED",placementDraftGeneration:Math.max(current.placementDraftGeneration,0,floor)+1}};},exportState(candidate){return JSON.stringify(candidate);}};
    class FileReader{readAsText(){queueMicrotask(()=>this.onload());}}
    function setBackupImportBusy(value){backupImportBusy=Boolean(value);}
    function raiseWarning(){}
    function cancelSpeech(){}
    function stopSounds(){}
    function dayNow(){return 1;}
    async function persistProgressBytesCommitted(){importEffects.commits+=1;return true;}
    function render(){}
    ${extractFunction("persistedPlacementDraftGenerationFloor")}
    ${extractFunction("storageRemove")}
    ${extractFunction("purgePlacementDraftAfterMainCommit")}
    ${change}
    return {
      run(){const target={id:"importFile",files:[{size:20}],value:"chosen",dataset:{}};importEffects.handlers.change({target});},
      status(){return {state:structuredClone(state),ui:structuredClone(ui),draftBytes:persistedPlacementDraftBytes,placementDraftReadable};}
    };
  })()`, { filename: "math-quest-placement-import-generation-effect.js" }).runInNewContext({
    importEffects,
    structuredClone,
    queueMicrotask,
  });
  imported.run();
  await Promise.resolve();
  await Promise.resolve();
  const importStatus = imported.status();
  assert.equal(importStatus.state.identity, "IMPORTED");
  assert.equal(importStatus.state.placementDraftGeneration, 2, "recovery import must advance beyond surviving generation one");
  assert.equal(importStatus.draftBytes, priorDraft);
  assert.equal(importStatus.placementDraftReadable, false);
  assert.equal(importEffects.commits, 1);
  assert.equal(importEffects.removeAttempts, 1);
  const importReload = restoreHarness(importStatus.draftBytes, { stateGeneration: importStatus.state.placementDraftGeneration });
  assert.equal(importReload.restorePlacementDraft(), false);
  assert.equal(importReload.status().ui.placementRun, null);

  const applyEffects = { bytes: priorDraft, removeAttempts: 0, commits: 0, floor: null };
  const apply = evaluate({
    prelude: `
      const PLACEMENT_DRAFT_KEY="math-quest:placement-draft:v1",PLACEMENT_DRAFT_MAX_CHARACTERS=262144;
      let state={identity:"RECOVERY-FALLBACK",placementDraftGeneration:0,maxSeenPlayDay:1},placementNotice="",warning="",storageAvailable=true;
      let persistedPlacementDraftBytes=applyEffects.bytes,placementDraftReadable=true,placementDraftConflict=false;
      let ui={screen:"placement",phase:"result",placementRun:{answers:[]},placementCorrect:null,placementRecommendation:{recommendedLevel:2},question:null};
      const localStorage={removeItem(){applyEffects.removeAttempts+=1;throw new Error("remove denied");}};
      const E={
        applyPlacementRecommendation(current,run,options){applyEffects.floor=options.placementDraftGenerationFloor;return {ok:true,state:{identity:"APPLIED",placementDraftGeneration:Math.max(current.placementDraftGeneration,options.placementDraftGenerationFloor)+1,maxSeenPlayDay:1}};},
        exportState(candidate){return JSON.stringify(candidate);}
      };
      function dayNow(){return 1;}
      async function persistProgressBytesCommitted(){applyEffects.commits+=1;return true;}
      function render(){}
      function status(){return {state:structuredClone(state),ui:structuredClone(ui),draftBytes:persistedPlacementDraftBytes,placementDraftReadable};}
    `,
    functions: ["persistedPlacementDraftGenerationFloor", "storageRemove", "purgePlacementDraftAfterMainCommit", "confirmPlacement"],
    exposed: "confirmPlacement,status",
    context: { applyEffects, structuredClone },
  });
  assert.equal(await apply.confirmPlacement(2), true);
  const applyStatus = apply.status();
  assert.equal(applyEffects.floor, 1);
  assert.equal(applyStatus.state.identity, "APPLIED");
  assert.equal(applyStatus.state.placementDraftGeneration, 2);
  assert.equal(applyStatus.draftBytes, priorDraft);
  assert.equal(applyStatus.placementDraftReadable, false);
  assert.equal(applyEffects.commits, 1);
  assert.equal(applyEffects.removeAttempts, 1);
  const applyReload = restoreHarness(applyStatus.draftBytes, { stateGeneration: applyStatus.state.placementDraftGeneration });
  assert.equal(applyReload.restorePlacementDraft(), false);
  assert.equal(applyReload.status().ui.placementRun, null);
});

test("failed reset and import main writes preserve the prior generation and recoverable draft", async () => {
  const resetEffects = { commits: 0, removals: 0 };
  const reset = evaluate({
    prelude: `
      let destructiveDialog={kind:"reset",enableAt:0},state={identity:"BASELINE",placementDraftGeneration:7},profileChosen=true,warning="",backupNotice="";
      let ui={screen:"grown",grownTab:"backup",placementRun:{answers:[]},placementCorrect:false,placementRecommendation:{}};
      const E={createResetState(current){return {identity:"BASELINE",placementDraftGeneration:current.placementDraftGeneration+1};},exportState(candidate){return JSON.stringify(candidate);}};
      async function persistProgressBytesCommitted(){resetEffects.commits+=1;return false;}
      function purgePlacementDraftAfterMainCommit(){resetEffects.removals+=1;return true;}
      function closeDestructiveDialog(){destructiveDialog=null;}
      function render(){}
      function raiseWarning(){}
      function persistedPlacementDraftGenerationFloor(){return state.placementDraftGeneration;}
      function dayNow(){return 1;}
      function status(){return {state:structuredClone(state),ui:structuredClone(ui)};}
    `,
    functions: ["confirmDestructiveDialog"],
    exposed: "confirmDestructiveDialog,status",
    context: { resetEffects, structuredClone },
  });
  await reset.confirmDestructiveDialog();
  assert.equal(reset.status().state.placementDraftGeneration, 7);
  assert.ok(reset.status().ui.placementRun);
  assert.equal(resetEffects.commits, 1);
  assert.equal(resetEffects.removals, 0);

  const change = extractListenerStatement("app", "change", 'el.id==="importFile"');
  const importEffects = { handlers: {}, commits: 0, removals: 0 };
  const imported = new vm.Script(`(()=>{"use strict";
    let state={identity:"BASELINE",placementDraftGeneration:7},ui={screen:"grown",placementRun:{answers:[]},placementCorrect:false,placementRecommendation:{}},backupImportBusy=false,saveRecoveryRequired=false,profileChosen=true;
    const app={addEventListener(name,handler){importEffects.handlers[name]=handler;}};
    const E={CONSTANTS:{BACKUP_MAX_BYTES:1024},importState(){return {ok:true,state:{identity:"BASELINE",placementDraftGeneration:8}};},exportState(candidate){return JSON.stringify(candidate);}};
    class FileReader{readAsText(){queueMicrotask(()=>this.onload());}}
    function setBackupImportBusy(value){backupImportBusy=Boolean(value);}
    function raiseWarning(){}
    function cancelSpeech(){}
    function stopSounds(){}
    function dayNow(){return 1;}
    function persistedPlacementDraftGenerationFloor(){return state.placementDraftGeneration;}
    async function persistProgressBytesCommitted(){importEffects.commits+=1;return false;}
    function purgePlacementDraftAfterMainCommit(){importEffects.removals+=1;return true;}
    function render(){}
    ${change}
    return {
      run(){const target={id:"importFile",files:[{size:20}],value:"chosen",dataset:{}};importEffects.handlers.change({target});},
      status(){return {state:structuredClone(state),ui:structuredClone(ui)};}
    };
  })()`, { filename: "math-quest-placement-import-failed-main-effect.js" }).runInNewContext({
    importEffects,
    structuredClone,
    queueMicrotask,
  });
  imported.run();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(imported.status().state.placementDraftGeneration, 7);
  assert.ok(imported.status().ui.placementRun);
  assert.equal(importEffects.commits, 1);
  assert.equal(importEffects.removals, 0);
});

test("placement construction keyboard input persists through the draft path", () => {
  const keydown = extractListenerStatement("document", "keydown", "const construction=");
  const effects = { handlers: [], persisted: 0, prevented: 0 };
  const harness = new vm.Script(`(()=>{"use strict";
    let ui={screen:"placement",phase:"question",question:{inputClass:"CONSTRUCTION"},entry:"",modelTouched:false},backupImportBusy=false;
    const document={addEventListener(name,handler){if(name==="keydown")effects.handlers.push(handler);}};
    function responseMutationCheckpoint(){return {ui:structuredClone(ui)};}
    function beginManipulation(){}
    function persistResponseMutation(){effects.persisted+=1;return true;}
    function render(){}
    function renderPlayAndFocus(){}
    ${keydown}
    return {
      run(){const event={key:":",target:{closest(){return null;}},preventDefault(){effects.prevented+=1;},stopImmediatePropagation(){}};effects.handlers[0](event);},
      status(){return structuredClone(ui);}
    };
  })()`, { filename: "math-quest-placement-keyboard-effect.js" }).runInNewContext({ effects, structuredClone });
  harness.run();
  assert.equal(harness.status().entry, ":");
  assert.equal(harness.status().modelTouched, true);
  assert.equal(effects.persisted, 1);
  assert.equal(effects.prevented, 1);
});

test("placement mobile minimum geometry no longer guarantees outer-page overflow", () => {
  const style = html.match(/<style>([\s\S]*?)<\/style>/iu)?.[1] || "";
  const mobileRule = style.match(/@media\(max-width:620px\)\{\.placement-panel\{min-height:calc\(100dvh - (\d+)px\)/u);
  assert.ok(mobileRule, "placement mobile viewport contract must remain explicit");
  const reserved = Number(mobileRule[1]);
  const viewportHeight = 844;
  const appVerticalPadding = 20;
  const topbarMinimum = 58;
  const topbarMargin = 4;
  const minimumDocumentHeight = appVerticalPadding + topbarMinimum + topbarMargin + (viewportHeight - reserved);
  assert.ok(minimumDocumentHeight <= viewportHeight, `minimum placement geometry is ${minimumDocumentHeight}px in an ${viewportHeight}px viewport`);
  assert.ok(36 + 66 + 8 + 610 <= 1180, "tablet placement minimum geometry fits 820×1180");
  assert.match(style, /\.placement-progress output\{font-size:18px/iu);
  assert.match(style, /\.placement-question \.answer-controls>\.small\{font-size:18px/iu);
  assert.match(style, /\.placement-question \.direct-status\{font-size:18px/iu);
  assert.match(style, /\.placement-question \.question-submit button\{min-width:44px;min-height:52px\}/iu);
});
