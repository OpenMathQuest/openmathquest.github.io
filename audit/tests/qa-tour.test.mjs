import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { extractEngine, evaluateEngine } from "../lib/engine-loader.mjs";

const indexUrl = new URL("../../index.html", import.meta.url);
const html = readFileSync(indexUrl, "utf8");
const localServerSource = readFileSync(new URL("../../Serve-MathQuest.ps1", import.meta.url), "utf8");
const browserSmokeSource = readFileSync(new URL("../lib/browser-smoke.mjs", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/giu)].map((match) => match[1]);
assert.equal(scripts.length, 2);
const adapter = scripts[1];
const extractedEngine = await extractEngine(indexUrl);
const engine = evaluateEngine(extractedEngine.source);
const EXPECTED_RENDERER_CAPABLE_METHODS = Object.freeze([
  "ACTION_SCENE", "ANGLE_MEASURE", "AREA_DECOMPOSE", "BAR_MODEL", "BOND_SPLIT",
  "CLOCK_READ", "COIN_BUILD", "COUNT_TOUCH", "EXPRESSION_BUILD", "FACT_FAMILY",
  "FRACTION_ENTRY", "FRACTION_PARTITION", "GRAPH_BUILD", "GRID_ROUTE", "GROUP_BUILD",
  "LANDMARK_PLACE", "MEASURE_OBJECT", "METRIC_SCALE", "MIXED_NUMBER_ENTRY", "NUMBER_BOND",
  "NUMBER_CHOICE", "NUMBER_LINE", "NUMBER_PAD", "ORDER_BUILD", "PAIR_LINK", "PATTERN_BUILD",
  "PICTURE_CHOICE", "PLACE_VALUE_BUILD", "SHARE_DEAL", "SLOT_COMPOSER", "SORT_BINS",
  "STRATEGY_BUILD", "SYMMETRY_BUILD", "TEN_FRAME", "VOLUME_INSPECT",
]);
const EXPECTED_RELEASE_REACHABLE_METHODS = Object.freeze(
  EXPECTED_RENDERER_CAPABLE_METHODS.filter((method) => !["NUMBER_BOND", "NUMBER_CHOICE"].includes(method)),
);

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
    if (character === "/" && next === "/" && source[index - 1] !== "\\") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*" && source[index - 1] !== "\\") {
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

function extractFunctionOptional(name) {
  const matches = [...adapter.matchAll(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "gu"))];
  if (!matches.length) return null;
  assert.equal(matches.length, 1, `${name} must have exactly one adapter declaration`);
  const start = matches[0].index;
  const parametersStart = adapter.indexOf("(", start);
  const parametersEnd = matchingDelimiter(adapter, parametersStart, "(", ")");
  const bodyStart = adapter.indexOf("{", parametersEnd);
  const bodyEnd = matchingDelimiter(adapter, bodyStart, "{", "}");
  return adapter.slice(start, bodyEnd + 1);
}

function extractFunction(name) {
  const source = extractFunctionOptional(name);
  assert.ok(source, `${name} must have exactly one adapter declaration`);
  return source;
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

function declarationBetween(startToken, endToken) {
  const start = adapter.indexOf(startToken);
  assert.notEqual(start, -1, `${startToken} declaration must exist`);
  const end = adapter.indexOf(endToken, start);
  assert.notEqual(end, -1, `${startToken} declaration must end before ${endToken}`);
  return adapter.slice(start, end + 1);
}

const qaManifestDeclaration = declarationBetween("const QA_TOUR_V1=", ";\n    const ACTIVE_UI_VERSION");
const qaSpecs = new vm.Script(`(()=>{"use strict";${qaManifestDeclaration}return QA_TOUR_V1;})()`, {
  filename: "math-quest-qa-tour-manifest.js",
}).runInNewContext(Object.create(null));

const qaFunctionNames = [...new Set(
  [...adapter.matchAll(/(?:async\s+)?function\s+(qa[A-Za-z0-9_]*)\s*\(/gu)].map((match) => match[1]),
)];
const qaFunctionSource = qaFunctionNames.map(extractFunction).join("\n");

function makeQuestionForSpec(spec) {
  return engine.makeQuestion({
    skillId: spec.skillId,
    tier: spec.tier,
    representation: spec.representation,
    seed: 0x51415431,
    ordinal: spec.ordinal,
    eligibleQuestionOrdinal: spec.ordinal,
    scheduledReview: false,
    coldTest: false,
    preview: true,
    theme: spec.theme,
    scaffolded: true,
  });
}

const SAFE_QA_ENVIRONMENT = Object.freeze({
  browser: "Google Chrome",
  formFactor: "phone",
  orientation: "portrait",
  viewport: Object.freeze({ width: 390, height: 844 }),
  devicePixelRatio: 3,
  touchPoints: 5,
});

function completeQaRecords() {
  return qaSpecs.map((spec, index) => {
    const question = makeQuestionForSpec(spec);
    return {
      reviewed: true,
      flagged: index === 0,
      note: index === 1 ? "The answer control needs review." : "",
      snapshot: index <= 1 ? {
        kind: "image/png",
        dataUrl: "data:image/png;base64,AA==",
        width: 320,
        height: 180,
      } : null,
      environment: structuredClone(SAFE_QA_ENVIRONMENT),
      questionId: question.questionId,
      sampleKey: question.sampleKey,
    };
  });
}

function qaReportHarness({
  records,
  storageValue = "UNCHANGED-SAVE",
  storedSave = "UNCHANGED-SAVE",
  complete = true,
  integrityError = "",
  share = false,
  shareThrows = null,
} = {}) {
  const effects = {
    appended: [],
    clicks: 0,
    cleanup: [],
    createdBlobs: [],
    network: 0,
    rendered: 0,
    revoked: [],
    shared: [],
  };
  class LocalFile extends Blob {
    constructor(parts, name, options = {}) {
      super(parts, options);
      this.name = String(name);
      this.lastModified = Number(options.lastModified) || 0;
    }
  }
  const anchors = [];
  const document = {
    body: {
      appendChild(anchor) {
        anchor.isConnected = true;
        effects.appended.push(anchor);
      },
    },
    createElement(name) {
      if (name !== "a") throw new Error(`unexpected element: ${name}`);
      const anchor = {
        download: "",
        hidden: false,
        href: "",
        isConnected: false,
        rel: "",
        click() { effects.clicks += 1; },
        remove() { this.isConnected = false; },
      };
      anchors.push(anchor);
      return anchor;
    },
  };
  const navigator = {
    maxTouchPoints: 5,
    userAgent: "Mozilla/5.0 RAW-UA-SECRET Chrome/120.0.0.0 Safari/537.36",
    sendBeacon() { effects.network += 1; throw new Error("network forbidden"); },
    ...(share ? {
      canShare(payload) { return Array.isArray(payload?.files) && payload.files.length === 1; },
      async share(payload) {
        effects.shared.push(payload);
        if (shareThrows) throw shareThrows;
      },
    } : {}),
  };
  const reportRecords = records ?? completeQaRecords();
  const context = {
    Blob,
    Date,
    E: engine,
    File: LocalFile,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    Set,
    String,
    URL: {
      createObjectURL(blob) {
        effects.createdBlobs.push(blob);
        return `blob:qa-local-${effects.createdBlobs.length}`;
      },
      revokeObjectURL(url) { effects.revoked.push(url); },
    },
    document,
    effects,
    fetch() { effects.network += 1; throw new Error("network forbidden"); },
    innerHeight: 844,
    innerWidth: 390,
    location: { origin: "https://ORIGIN-SECRET.invalid", href: "https://ORIGIN-SECRET.invalid/?qa-tour=qa-tour-v1" },
    navigator,
    screen: { width: 390, height: 844 },
    setTimeout(callback) { effects.cleanup.push(callback); return effects.cleanup.length; },
    state: { childProgress: "PROGRESS-SECRET" },
    structuredClone,
    window: { devicePixelRatio: 3 },
  };
  const source = `(()=>{"use strict";
    const QA_TOUR_VERSION="qa-tour-v1",QA_TOUR_SEED=0x51415431,QA_TOUR_V1=effects.specs,KEY="math-quest:v1",PWA_RELEASE="1.0.0-beta.4",PWA_BUILD_ID="math-quest-pwa-v1.0.0-beta.4";
    let childName="CHILD-NAME-SECRET";
    let lab={saveBytes:effects.storedSave,qaTour:true,qaComplete:effects.complete,qaIndex:49,qaRecords:structuredClone(effects.records),qaSubmitted:false,qaSubmitNotice:"",qaBusy:false,integrityError:effects.integrityError};
    let ui={screen:"lab",world:"forest"};
    const app={querySelector(){return null;},querySelectorAll(){return [];}};
    function storageRead(){return {ok:true,value:effects.storageValue};}
    function render(){effects.rendered+=1;}
    ${extractFunction("labStorageIntact")}
    ${qaFunctionSource}
    return {
      async download(){return await qaDownloadReport();},
      status(){return {lab:structuredClone(lab),anchors:effects.anchors};}
    };
  })()`;
  Object.assign(effects, {
    complete,
    integrityError,
    records: reportRecords,
    anchors,
    specs: qaSpecs,
    storageValue,
    storedSave,
  });
  const harness = new vm.Script(source, { filename: "math-quest-qa-tour-report-effects.js" }).runInNewContext(context);
  return { anchors, context, effects, harness };
}

test("the hidden QA URL requires the exact version and stops at an explicit grown-up confirmation screen", async () => {
  const gateDeclaration = declarationBetween("const LAB_SEED=", ";\n    // This exact, ordered manifest");
  const query = (search) => new vm.Script(`(()=>{"use strict";${gateDeclaration}return {QA_TOUR_QUERY,qaTourRequested};})()`, {
    filename: "math-quest-qa-tour-query-gate.js",
  }).runInNewContext({ location: { search }, URLSearchParams });
  assert.equal(query("").qaTourRequested, false);
  assert.equal(query("?qa-tour=qa-tour-v1").qaTourRequested, true);
  assert.equal(query("?qa-tour=QA-TOUR-V1").qaTourRequested, false);
  assert.equal(query("?qa-tour=qa-tour-v2").qaTourRequested, false);
  assert.equal(query("?other=qa-tour-v1").qaTourRequested, false);

  const coldBootstrap = extractFunction("coldBootstrap");
  const effects = { entered: 0, focused: 0, pwa: 0, renders: 0, restored: 0, resumed: 0 };
  const bootstrap = new vm.Script(`(()=>{"use strict";
    let ui={screen:"home"},qaReturnScreen=null;
    const qaTourRequested=true,profileChosen=true,saveRecoveryRequired=false,state={activeSession:null};
    async function initializeProgressPersistence(){return true;}
    function enterQaTour(){effects.entered+=1;}
    function restorePlacementDraft(){effects.restored+=1;return false;}
    function resumeActive(){effects.resumed+=1;return false;}
    function render(){effects.renders+=1;}
    function focusColdStartTarget(){effects.focused+=1;}
    function initializePwa(){effects.pwa+=1;}
    ${coldBootstrap}
    return {coldBootstrap,status(){return structuredClone(ui);}};
  })()`, { filename: "math-quest-qa-tour-bootstrap-effect.js" }).runInNewContext({ effects, structuredClone });
  await bootstrap.coldBootstrap();
  assert.equal(bootstrap.status().screen, "qaConfirm");
  assert.equal(effects.entered, 0, "the query must never start the tour without an adult action");
  assert.equal(effects.restored, 0, "the private QA gate must precede child-session restoration");
  assert.equal(effects.resumed, 0, "the private QA gate must precede child-session resumption");
  assert.equal(effects.renders, 1);
});

test("qaConfirm renders a grown-up-only explanation with exact start and cancel actions", () => {
  const declaration = extractFunctionOptional("qaConfirmView");
  assert.ok(declaration, "qaConfirmView must render the explicit adult confirmation screen");
  const app = { innerHTML: "", focus() {} };
  const harness = new vm.Script(`(()=>{"use strict";
    let childName="CHILD-NAME-SECRET",state={progress:"PROGRESS-SECRET"};
    const app=effects.app;
    function escape(value){return String(value);}
    function iconSvg(name){return '<i data-icon="'+name+'"></i>';}
    ${declaration}
    qaConfirmView();
    return app.innerHTML;
  })()`, { filename: "math-quest-qa-tour-confirm-view.js" }).runInNewContext({ effects: { app } });
  assert.match(harness, /Grown-up/iu);
  assert.match(harness, /50/iu);
  assert.match(harness, /never changes? (?:a child's )?progress|progress (?:never|will not|does not) change/iu);
  assert.match(harness, /data-lab-action="qa-start"/u);
  assert.match(harness, /data-lab-action="qa-cancel"/u);
  assert.doesNotMatch(harness, /CHILD-NAME-SECRET|PROGRESS-SECRET/u);
});

test("render routes qaConfirm explicitly rather than falling through to another screen", () => {
  const effects = { calls: [] };
  const names = ["saveRecoveryView", "progressProtectionView", "nameGateView", "home", "playgroundView", "placementView", "sessionView", "fatigueView", "capstoneView", "doneView", "grown", "parentLabViewV2", "parents", "qaConfirmView"];
  const stubs = names.map((name) => `function ${name}(){effects.calls.push("${name}");}`).join("\n");
  const harness = new vm.Script(`(()=>{"use strict";
    let ui={screen:"qaConfirm"};
    const pwa={pendingControllerReload:false};
    ${stubs}
    function renderRuntimeWarning(){}
    function renderPwaOverlay(){}
    function renderDestructiveOverlay(){}
    function applyHelpAvailability(){}
    function resumePendingPwaReloadAtBoundary(){}
    function checkPwaUpdateAtBoundary(){}
    ${extractFunction("render")}
    return {render};
  })()`, { filename: "math-quest-qa-tour-render-route.js" }).runInNewContext({ effects });
  harness.render();
  assert.deepEqual(effects.calls, ["qaConfirmView"]);
});

test("the frozen 50-question fixture covers every level, strand, profile, and exact release-reachable method set", () => {
  assert.equal(qaSpecs.length, 50);
  assert.ok(Object.isFrozen(qaSpecs), "the QA fixture array must be frozen");
  assert.ok(qaSpecs.every(Object.isFrozen), "every QA fixture record must be frozen");
  assert.equal(new Set(qaSpecs.map((spec) => JSON.stringify(spec))).size, 50, "all QA fixture specs must be unique");

  const selectedSkills = qaSpecs.map((spec) => engine.SKILL_BY_ID[spec.skillId]);
  assert.ok(selectedSkills.every(Boolean), "every QA spec must name a shipped skill");
  assert.deepEqual(
    [...new Set(qaSpecs.filter((spec) => ["MQ-040", "MQ-041", "MQ-079", "MQ-095", "MQ-097", "MQ-101"].includes(spec.skillId)).map((spec) => spec.skillId))].sort(),
    ["MQ-040", "MQ-041", "MQ-079", "MQ-095", "MQ-097", "MQ-101"],
    "the fixed tour must expose every governed STRATEGY_BUILD skill to adult review",
  );
  assert.deepEqual(
    [...new Set(selectedSkills.map((skill) => skill.level))].sort((a, b) => a - b),
    Array.from({ length: 21 }, (_, index) => index + 1),
  );
  const allStrands = [...new Set(engine.SKILLS.map((skill) => skill.strand))].sort();
  const selectedStrands = [...new Set(selectedSkills.map((skill) => skill.strand))].sort();
  assert.equal(allStrands.length, 6);
  assert.deepEqual(selectedStrands, allStrands);
  const allProfiles = [...new Set(engine.SKILLS.map((skill) => skill.generatorProfile))].sort();
  const selectedProfiles = [...new Set(selectedSkills.map((skill) => skill.generatorProfile))].sort();
  assert.equal(allProfiles.length, 26);
  assert.deepEqual(selectedProfiles, allProfiles);

  const generated = qaSpecs.map(makeQuestionForSpec);
  for (let index = 0; index < qaSpecs.length; index += 1) {
    assert.equal(generated[index].inputMethod, qaSpecs[index].inputMethod, `QA ${index + 1} declared input method`);
    assert.equal(generated[index].skillId, qaSpecs[index].skillId, `QA ${index + 1} skill`);
  }
  assert.equal(new Set(generated.map((question) => question.questionId)).size, 50);
  assert.equal(new Set(generated.map((question) => question.sampleKey)).size, 50);
  assert.deepEqual(
    Object.keys(engine.CONSTANTS.INPUT_CLASS_BY_METHOD).sort(),
    [...EXPECTED_RENDERER_CAPABLE_METHODS].sort(),
    "the renderer-capable method set must not grow or shrink silently",
  );
  assert.deepEqual(
    [...new Set(generated.map((question) => question.inputMethod))].sort(),
    [...EXPECTED_RELEASE_REACHABLE_METHODS].sort(),
    "the fixed tour must cover every method that a shipped question can actually generate",
  );
});

test("the adult QA controls dispatch only their exact named tour actions", async () => {
  const click = extractListenerStatement("app", "click", 'const control=event.target.closest("[data-lab-action]")');
  const effects = { handlers: {}, starts: 0, cancels: 0, reviews: 0, previous: 0, submits: 0, exitRequests: 0 };
  const harness = new vm.Script(`(()=>{"use strict";
    let lab=null,ui={screen:"qaConfirm"};
    const app={addEventListener(name,handler){effects.handlers[name]=handler;}};
    function enterLab(){}
    function enterQaTour(){effects.starts+=1;lab={qaTour:true};ui.screen="lab";}
    function leaveQaTour(){effects.cancels+=1;lab=null;ui.screen="home";}
    function qaReviewAndAdvance(){effects.reviews+=1;}
    function qaPrevious(){effects.previous+=1;}
    function qaDownloadReport(){effects.submits+=1;}
    function qaRequestExit(){effects.exitRequests+=1;}
    function qaTourActive(){return Boolean(lab?.qaTour);}
    function labStorageIntact(){return true;}
    function cancelSpeech(){}
    function stopSounds(){}
    function render(){effects.exits+=1;}
    function gradeLabAnswer(){}
    function dispatchResponse(){}
    function labQuestionAt(){return {options:[]};}
    function clearLabFeedback(){}
    function renderLabAndFocus(){}
    function applyLabKey(){}
    function announce(){}
    function s(){return "";}
    const CSS={escape:value=>String(value)};
    ${click}
    function eventFor(action){return {target:{closest(selector){return selector==="[data-lab-action]"?{dataset:{labAction:action}}:null;}}};}
    return {
      async dispatch(action){return await effects.handlers.click(eventFor(action));},
      activate(){lab={qaTour:true};ui.screen="lab";},
      confirm(){lab=null;ui.screen="qaConfirm";},
      status(){return {lab,screen:ui.screen};}
    };
  })()`, { filename: "math-quest-qa-tour-action-effects.js" }).runInNewContext({ effects });

  await harness.dispatch("qa-cancel");
  assert.equal(harness.status().screen, "home");
  assert.equal(effects.cancels, 1);
  harness.confirm();
  await harness.dispatch("qa-start");
  assert.equal(effects.starts, 1);
  harness.activate();
  await harness.dispatch("qa-review-next");
  await harness.dispatch("qa-previous");
  await harness.dispatch("qa-submit");
  await harness.dispatch("qa-exit");
  assert.equal(effects.reviews, 1);
  assert.equal(effects.previous, 1);
  assert.equal(effects.submits, 1);
  assert.equal(effects.exitRequests, 1);
});

test("flag changes mutate only the current disposable QA record", async () => {
  const change = extractListenerStatement("app", "change", "[data-qa-flag]");
  const effects = { handlers: {} };
  const harness = new vm.Script(`(()=>{"use strict";
    let lab={qaTour:true,qaIndex:0,qaRecords:[{reviewed:false,flagged:false,note:"",snapshot:null}]},ui={screen:"lab"},backupImportBusy=false;
    const app={addEventListener(name,handler){effects.handlers[name]=handler;}};
    function qaTourActive(){return Boolean(lab?.qaTour);}
    function qaCurrentRecord(){return lab.qaRecords[lab.qaIndex];}
    ${change}
    return {
      async change(checked){const target={checked,matches(selector){return selector==="[data-qa-flag]";}};return await effects.handlers.change({target});},
      status(){return structuredClone(lab);}
    };
  })()`, { filename: "math-quest-qa-tour-flag-effect.js" }).runInNewContext({ effects, structuredClone });
  await harness.change(true);
  assert.equal(harness.status().qaRecords[0].flagged, true);
  await harness.change(false);
  assert.equal(harness.status().qaRecords[0].flagged, false);
});

test("visual snapshots use a revocable local Blob URL and fail closed after cleanup", async () => {
  const captureSource = `${extractFunction("qaCopyFormState")}\n${extractFunction("qaCaptureSnapshot")}`;
  const createHarness = ({ imageFailure = false, contextAvailable = true } = {}) => {
    const effects = {
      blobs: [],
      draws: 0,
      imageFailure,
      imageSources: [],
      revoked: [],
      toDataUrlTypes: [],
    };
    class LocalImage {
      set src(value) {
        effects.imageSources.push(value);
        if (effects.imageFailure) this.onerror?.(new Error("image-load-failed"));
        else this.onload?.();
      }
    }
    const clone = {
      outerHTML: '<section class="qa-question">Question</section>',
      querySelectorAll() { return []; },
    };
    const source = {
      cloneNode() { return clone; },
      getBoundingClientRect() { return { width: 319.2, height: 179.1 }; },
      querySelectorAll() { return []; },
    };
    const context = contextAvailable ? {
      drawImage() { effects.draws += 1; },
    } : null;
    const document = {
      styleSheets: [{ cssRules: [{ cssText: ".qa-question{color:#123456}" }] }],
      createElement(name) {
        assert.equal(name, "canvas");
        return {
          width: 0,
          height: 0,
          getContext(kind) { assert.equal(kind, "2d"); return context; },
          toDataURL(kind) {
            effects.toDataUrlTypes.push(kind);
            return "data:image/png;base64,AA==";
          },
        };
      },
    };
    const harness = new vm.Script(`(()=>{"use strict";
      const app={querySelector(selector){return selector===".qa-question"?effects.source:null;}};
      ${captureSource}
      return {capture:qaCaptureSnapshot};
    })()`, { filename: "math-quest-qa-tour-local-snapshot.js" }).runInNewContext({
      Blob,
      HTMLInputElement: class {},
      HTMLSelectElement: class {},
      HTMLTextAreaElement: class {},
      Image: LocalImage,
      URL: {
        createObjectURL(blob) {
          effects.blobs.push(blob);
          return `blob:qa-snapshot-${effects.blobs.length}`;
        },
        revokeObjectURL(url) { effects.revoked.push(url); },
      },
      app: undefined,
      assert,
      document,
      effects: { ...effects, source },
    });
    return { effects, harness };
  };

  const success = createHarness();
  const snapshot = await success.harness.capture();
  assert.equal(snapshot.kind, "image/png");
  assert.equal(snapshot.dataUrl, "data:image/png;base64,AA==");
  assert.equal(snapshot.width, 320);
  assert.equal(snapshot.height, 180);
  assert.deepEqual(success.effects.imageSources, ["blob:qa-snapshot-1"]);
  assert.deepEqual(success.effects.revoked, ["blob:qa-snapshot-1"]);
  assert.equal(success.effects.draws, 1);
  assert.deepEqual(success.effects.toDataUrlTypes, ["image/png"]);
  assert.equal(success.effects.blobs[0].type, "image/svg+xml");
  assert.match(await success.effects.blobs[0].text(), /<svg[\s\S]*qa-question/iu);

  const failed = createHarness({ imageFailure: true });
  assert.equal(await failed.harness.capture(), null);
  assert.deepEqual(failed.effects.revoked, ["blob:qa-snapshot-1"]);
  assert.equal(failed.effects.draws, 0);

  assert.doesNotMatch(adapter, /data\s*:\s*(?:image|audio|video|font)\//iu);
  for (const [name, sourceText] of [
    ["shipped page", html],
    ["local server", localServerSource],
    ["browser-audit server", browserSmokeSource],
  ]) {
    assert.match(sourceText, /img-src 'self' data: blob:/u, `${name} CSP must permit the local snapshot Blob URL`);
  }
});

test("a note or flag is reviewed only after its local visual snapshot succeeds", async () => {
  const effects = {
    capture: async () => ({ kind: "image/png", dataUrl: "data:image/png;base64,AA==", width: 320, height: 180 }),
    focused: 0,
    rendered: 0,
  };
  const harness = new vm.Script(`(()=>{"use strict";
    const QA_TOUR_V1=Array.from({length:50},(_,index)=>({skillId:"MQ-"+index}));
    let lab={saveBytes:"SAVE",qaTour:true,qaBusy:false,qaIndex:0,qaComplete:false,integrityError:"",qaSubmitNotice:"",qaRecords:QA_TOUR_V1.map(()=>({reviewed:false,flagged:false,note:"",snapshot:null,environment:null,questionId:"",sampleKey:""}))};
    const app={querySelector(selector){if(selector==="[data-qa-note]")return {value:"Needs a clearer diagram."};return null;},querySelectorAll(){return [];}};
    function labStorageIntact(){return true;}
    function labQuestionAt(){return {questionId:"q-0",sampleKey:"s-0"};}
    function render(){effects.rendered+=1;}
    function renderLabAndFocus(){effects.focused+=1;}
    ${qaFunctionSource}
    qaCaptureSnapshot=effects.capture;
    qaFixtureData=index=>({question:{questionId:"q-"+index,sampleKey:"s-"+index}});
    qaEnvironment=()=>structuredClone(effects.environment);
    qaResetCurrentQuestion=()=>true;
    return {async review(){return await qaReviewAndAdvance();},status(){return structuredClone(lab);}};
  })()`, { filename: "math-quest-qa-tour-review-snapshot.js" }).runInNewContext({ effects: { ...effects, environment: SAFE_QA_ENVIRONMENT }, structuredClone });
  await harness.review();
  await Promise.resolve();
  const status = harness.status();
  assert.equal(status.qaRecords[0].note, "Needs a clearer diagram.");
  assert.equal(status.qaRecords[0].reviewed, true);
  assert.equal(status.qaRecords[0].snapshot?.kind, "image/png");
  assert.equal(status.qaIndex, 1);
});

test("snapshot failure keeps a noted question unreviewed and prevents advancement", async () => {
  const effects = { capture: async () => null, focused: 0, rendered: 0 };
  const harness = new vm.Script(`(()=>{"use strict";
    const QA_TOUR_V1=Array.from({length:50},(_,index)=>({skillId:"MQ-"+index}));
    let lab={saveBytes:"SAVE",qaTour:true,qaBusy:false,qaIndex:0,qaComplete:false,qaSubmitNotice:"",qaRecords:QA_TOUR_V1.map(()=>({reviewed:false,flagged:false,note:"",snapshot:null,environment:null,questionId:"",sampleKey:""})),integrityError:""};
    const app={querySelector(selector){if(selector==="[data-qa-note]")return {value:"Snapshot this problem."};return null;},querySelectorAll(){return [];}};
    function labStorageIntact(){return true;}
    function labQuestionAt(){return {questionId:"q-0",sampleKey:"s-0"};}
    function render(){effects.rendered+=1;}
    function renderLabAndFocus(){effects.focused+=1;}
    ${qaFunctionSource}
    qaCaptureSnapshot=effects.capture;
    qaFixtureData=index=>({question:{questionId:"q-"+index,sampleKey:"s-"+index}});
    qaEnvironment=()=>structuredClone(effects.environment);
    qaResetCurrentQuestion=()=>true;
    return {async review(){return await qaReviewAndAdvance();},status(){return structuredClone(lab);}};
  })()`, { filename: "math-quest-qa-tour-snapshot-failure.js" }).runInNewContext({ effects: { ...effects, environment: SAFE_QA_ENVIRONMENT }, structuredClone });
  await harness.review();
  await Promise.resolve();
  const status = harness.status();
  assert.equal(status.qaRecords[0].reviewed, false);
  assert.equal(status.qaRecords[0].snapshot, null);
  assert.equal(status.qaIndex, 0);
  assert.match(status.integrityError, /snapshot|image|capture/iu);
});

test("report creation fails closed on incomplete review, missing snapshots, fixture errors, or changed storage", async () => {
  const reviewed = completeQaRecords().map((record) => ({ ...record, flagged: false, note: "", snapshot: null }));
  const cases = [
    ["unreviewed question", reviewed.map((record, index) => index === 17 ? { ...record, reviewed: false } : record), {}, /review/iu],
    ["flag without snapshot", reviewed.map((record, index) => index === 3 ? { ...record, flagged: true } : record), {}, /snapshot|image|capture/iu],
    ["note without snapshot", reviewed.map((record, index) => index === 4 ? { ...record, note: "Needs work" } : record), {}, /snapshot|image|capture/iu],
    ["fixture integrity error", reviewed, { integrityError: "fixture mismatch" }, /fixture|integrity|mismatch/iu],
    ["changed protected storage", reviewed, { storageValue: "CHANGED-SAVE" }, /save|storage|progress|changed/iu],
  ];
  for (const [label, records, options, noticePattern] of cases) {
    const { effects, harness } = qaReportHarness({ records, ...options });
    await harness.download();
    const status = harness.status();
    assert.equal(effects.shared.length, 0, `${label}: must not share`);
    assert.equal(effects.clicks, 0, `${label}: must not download`);
    assert.equal(effects.createdBlobs.length, 0, `${label}: must not create a report blob`);
    assert.match(status.lab.qaSubmitNotice || status.lab.integrityError, noticePattern, `${label}: actionable failure notice`);
  }
});

test("the QA report has an exact privacy allowlist and never serializes child state, raw UA, origin, or IP", async () => {
  const { effects, harness } = qaReportHarness();
  await harness.download();
  assert.equal(effects.network, 0);
  assert.equal(effects.clicks, 1);
  assert.equal(effects.createdBlobs.length, 1);
  const reportText = await effects.createdBlobs[0].text();
  const report = JSON.parse(reportText);
  assert.deepEqual(Object.keys(report).sort(), [
    "appBuildId", "appRelease", "coverage", "generatedAt", "privacy", "questions", "reportKind", "schemaVersion", "tourSeed", "tourVersion",
  ]);
  assert.deepEqual(Object.keys(report.privacy).sort(), [
    "automaticNetworkUpload", "includesChildName", "includesChildProgress", "includesIpAddress", "includesOrigin", "includesRawUserAgent",
  ]);
  assert.deepEqual(Object.keys(report.coverage).sort(), [
    "generatorProfiles", "inputMethods", "levels", "questionCount", "strands",
  ]);
  assert.deepEqual(Object.keys(report.questions[0]).sort(), [
    "environment", "flagged", "generatorProfile", "index", "inputMethod", "level", "note", "question", "representation", "reviewed", "skillId", "skillName", "snapshot", "strand", "taskType", "tier",
  ]);
  assert.deepEqual(Object.keys(report.questions[0].environment).sort(), [
    "browser", "devicePixelRatio", "formFactor", "orientation", "touchPoints", "viewport",
  ]);
  assert.equal(report.questions.length, 50);
  assert.equal(report.coverage.questionCount, 50);
  assert.equal(report.privacy.automaticNetworkUpload, false);
  assert.equal(report.privacy.includesChildProgress, false);
  assert.equal(report.privacy.includesChildName, false);
  assert.equal(report.privacy.includesIpAddress, false);
  assert.equal(report.privacy.includesRawUserAgent, false);
  assert.equal(report.privacy.includesOrigin, false);
  assert.doesNotMatch(reportText, /CHILD-NAME-SECRET|PROGRESS-SECRET|RAW-UA-SECRET|ORIGIN-SECRET|127\.0\.0\.1/u);
  assert.equal(harness.status().anchors[0].download, "math-quest-qa-tour-v1-report.json");
  assert.equal(harness.status().anchors[0].rel, "noopener");
});

test("supported iPad-style file sharing stays local, while unsupported sharing falls back to a local download", async () => {
  const shared = qaReportHarness({ share: true });
  await shared.harness.download();
  assert.equal(shared.effects.shared.length, 1);
  assert.equal(shared.effects.clicks, 0, "a successful local share must not also trigger a download");
  assert.equal(shared.effects.network, 0);
  assert.equal(shared.effects.shared[0].files.length, 1);
  assert.equal(shared.effects.shared[0].files[0].name, "math-quest-qa-tour-v1-report.json");
  assert.equal(shared.effects.shared[0].files[0].type, "application/json");

  const downloaded = qaReportHarness({ share: false });
  await downloaded.harness.download();
  assert.equal(downloaded.effects.shared.length, 0);
  assert.equal(downloaded.effects.clicks, 1);
  assert.equal(downloaded.effects.createdBlobs.length, 1);
  assert.equal(downloaded.effects.network, 0);
  assert.equal(downloaded.harness.status().anchors[0].href, "blob:qa-local-1");
  assert.equal(downloaded.effects.cleanup.length, 1);
  downloaded.effects.cleanup[0]();
  assert.deepEqual(downloaded.effects.revoked, ["blob:qa-local-1"]);
});
