import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { loadShippedEngine } from "../lib/engine-loader.mjs";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/giu)]
  .map((match) => match[1]);
assert.equal(scripts.length, 2, "the shipped page must retain its engine and adapter scripts");
const adapter = scripts[1];

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
      if (character === "\\") {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
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
    if (character === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
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

function extractActionBranch(action) {
  const expression = new RegExp(
    `(?:else\\s+)?if\\s*\\(\\s*action\\s*===\\s*["']${action}["']\\s*\\)\\s*\\{`,
    "gu",
  );
  const matches = [...adapter.matchAll(expression)];
  assert.equal(matches.length, 1, `${action} must have one shipped action branch`);
  const bodyStart = adapter.indexOf("{", matches[0].index);
  const bodyEnd = matchingDelimiter(adapter, bodyStart, "{", "}");
  return adapter.slice(bodyStart + 1, bodyEnd);
}

function extractListenerStatement(target, eventName, marker) {
  const token = `${target}.addEventListener("${eventName}",`;
  const matches = [];
  for (let from = 0; ;) {
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

function evaluateHarness({ prelude, functions, body, exposed, context = {} }) {
  const source = `(()=>{
    "use strict";
    ${prelude}
    ${functions.map(extractFunction).join("\n")}
    ${body || ""}
    return {${exposed}};
  })()`;
  return new vm.Script(source, { filename: "math-quest-page-adapter-effects.js" })
    .runInNewContext(context);
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

function createProgressHarness(effects) {
  return evaluateHarness({
    prelude: `
      const KEY="math-quest:progress:v2";
      const PROGRESS_WRITE_LOCK=\`\${KEY}:exclusive-progress-write\`;
      let storageAvailable=true;
      let progressConflict=false;
      let persistedSaveBytes=effects.bytes;
      let saveRecoveryRequired=false;
      let saveRecoveryError="";
      let progressLeaseStatus="PENDING";
      let progressLeaseFailure="";
      let progressLeaseRelease=null;
      let progressLeaseAcquirePromise=null;
      const progressConflictText="Progress was changed in another tab. This tab will not overwrite it. Reload this page before continuing.";
      const progressLockUnavailableText="Reliable progress protection is unavailable in this browser. Child play is paused so progress cannot be silently lost. A grown-up can export a backup, then use a current supported browser.";
      const progressLockOccupiedText="Math Quest is already open for play in another tab or window. Child play is paused so the two copies cannot overwrite each other. Close the other copy, then reload this page.";
      const navigator={locks:effects.lockManager};
      const app={
        inert:false,
        setAttribute(name,value){effects.attributes.set(name,value);},
        removeAttribute(name){effects.attributes.delete(name);}
      };
      const localStorage={
        getItem(key){effects.reads.push(key);return effects.bytes;},
        setItem(key,value){effects.writes.push({key,value});effects.bytes=value;}
      };
      function raiseWarning(message){effects.warnings.push(String(message));}
      function storageErrorText(action){return \`storage error: \${action}\`;}
      function scheduleProgressProtectionScreen(){effects.protectionScreens+=1;app.inert=false;app.removeAttribute("aria-busy");}
      function storageWrite(key,value){
        try{localStorage.setItem(key,value);storageAvailable=true;return true;}
        catch{storageAvailable=false;return false;}
      }
      function status(){return {progressConflict,persistedSaveBytes,storageAvailable,progressLeaseStatus,progressLeaseFailure};}
    `,
    functions: [
      "markProgressConflict",
      "progressWritePreflight",
      "persistProgressBytes",
      "persistProgressBytesCommitted",
      "settleProgressLeaseFailure",
      "acquireProgressWriterLease",
      "releaseProgressWriterLease",
    ],
    exposed: "app,acquireProgressWriterLease,releaseProgressWriterLease,persistProgressBytes,persistProgressBytesCommitted,status",
    context: { effects },
  });
}

test("one lifetime writer lease makes saves synchronous and a second client read-only", async () => {
  let active = false;
  const lockManager = {
    request(name, options, callback) {
      effects.lockRequests.push({ name, options });
      if (options.ifAvailable && active) return Promise.resolve(callback(null));
      active = true;
      return Promise.resolve(callback({ name, mode: "exclusive" })).finally(() => { active = false; });
    },
  };
  const effects = {
    bytes: "S0", reads: [], writes: [], warnings: [], attributes: new Map(),
    protectionScreens: 0, lockRequests: [], lockManager,
  };
  const first = createProgressHarness(effects);
  const second = createProgressHarness(effects);

  assert.equal(await first.acquireProgressWriterLease(), true);
  assert.equal(first.status().progressLeaseStatus, "HELD");
  assert.equal(first.persistProgressBytes("FIRST"), true);
  assert.equal(effects.bytes, "FIRST");
  assert.equal(await second.acquireProgressWriterLease(), false);
  assert.equal(second.status().progressLeaseStatus, "DENIED");
  assert.equal(second.status().progressLeaseFailure, "OCCUPIED");
  assert.equal(second.persistProgressBytes("SECOND"), false);
  assert.equal(effects.bytes, "FIRST");
  assert.match(effects.warnings.at(-1), /already open for play/u);

  assert.equal(first.persistProgressBytes("TERMINAL"), true);
  assert.equal(effects.bytes, "TERMINAL", "the terminal state is durable before pagehide releases the lease");
  first.releaseProgressWriterLease();
  await settle();

  const bfcacheCopy = createProgressHarness(effects);
  effects.bytes = "EXTERNAL";
  assert.equal(await bfcacheCopy.acquireProgressWriterLease(), false);
  assert.equal(bfcacheCopy.status().progressLeaseFailure, "CONFLICT");
  assert.equal(bfcacheCopy.persistProgressBytes("STALE"), false);
  assert.equal(effects.bytes, "EXTERNAL");
  await settle();

  effects.bytes = "TERMINAL";
  const reopened = createProgressHarness(effects);
  assert.equal(await reopened.acquireProgressWriterLease(), true);
  assert.equal(reopened.status().persistedSaveBytes, "TERMINAL");
  assert.equal(reopened.persistProgressBytes("REOPENED"), true);
  assert.equal(effects.bytes, "REOPENED");
  reopened.releaseProgressWriterLease();
  assert.deepEqual(effects.writes.map((write) => write.value), ["FIRST", "TERMINAL", "REOPENED"]);
  assert.equal(effects.lockRequests.length, 4);
  assert.ok(effects.lockRequests.every((request) => request.options.ifAvailable === true));
});

test("a missing or broken Web Lock refuses the persistent write without an unlocked fallback", async () => {
  const effects = {
    bytes: "S0",
    reads: [],
    writes: [],
    warnings: [],
    attributes: new Map(),
    protectionScreens: 0,
    lockManager: { request() { throw new Error("lock unavailable"); } },
  };
  const harness = createProgressHarness(effects);
  assert.equal(await harness.acquireProgressWriterLease(), false);
  assert.equal(harness.status().progressLeaseStatus, "DENIED");
  assert.equal(harness.status().progressLeaseFailure, "UNAVAILABLE");
  assert.equal(harness.persistProgressBytes("UNSAFE"), false);
  assert.equal(effects.bytes, "S0");
  assert.deepEqual(effects.writes, []);
  assert.match(effects.warnings.at(-1), /Reliable progress protection is unavailable/u);
  assert.ok(effects.protectionScreens >= 1);
});

test("an unreadable initial save fails closed before requesting the writer lease", async () => {
  const effects = {
    acquireCalls: 0,
    saveCalls: 0,
    protectionScreens: 0,
    warnings: [],
    attributes: new Map(),
  };
  const harness = evaluateHarness({
    prelude: `
      const progressSourceReadOk=false;
      let progressLeaseStatus="PENDING";
      let progressLeaseFailure="";
      let saveRecoveryRequired=false;
      let backupImportBusy=false;
      let pwaControllerChangeBusy=false;
      const progressLockUnavailableText="Reliable progress protection is unavailable.";
      const progressSourceFailureText=progressLockUnavailableText;
      const app={
        inert:false,
        setAttribute(name,value){effects.attributes.set(name,value);},
        removeAttribute(name){effects.attributes.delete(name);}
      };
      function raiseWarning(message){effects.warnings.push(String(message));}
      function scheduleProgressProtectionScreen(){effects.protectionScreens+=1;}
      async function acquireProgressWriterLease(){effects.acquireCalls+=1;return true;}
      function save(){effects.saveCalls+=1;return true;}
    `,
    functions: ["initializeProgressPersistence"],
    exposed: "app,initializeProgressPersistence,status:()=>({progressLeaseStatus,progressLeaseFailure})",
    context: { effects },
  });

  assert.equal(await harness.initializeProgressPersistence(), false);
  assert.equal(effects.acquireCalls, 0);
  assert.equal(effects.saveCalls, 0);
  assert.equal(effects.protectionScreens, 1);
  assert.equal(harness.app.inert, true);
  assert.equal(harness.status().progressLeaseStatus, "DENIED");
  assert.equal(harness.status().progressLeaseFailure, "UNAVAILABLE");
});

function createBeta1MigrationHarness(mode, values = new Map([
  ["math-quest:progress:v2", null],
  ["math-quest:v2", "BETA1-A"],
  ["math-quest:progress:v2:beta1-migration-guard:v1", null],
])) {
  const effects = {
    values,
    acquireCalls: 0,
    saveCalls: 0,
    protectedWrites: 0,
    removals: [],
    writes: [],
    warnings: [],
    protectionScreens: 0,
    storageOperations: [],
    handlers: {},
    pendingStorageEvent: null,
  };
  const storageListener = extractListenerStatement("window", "storage", "BETA1_MIGRATION_GUARD_KEY");
  const harness = evaluateHarness({
    prelude: `
      const KEY="math-quest:progress:v2";
      const BETA1_PROGRESS_KEY="math-quest:v2";
      const BETA1_MIGRATION_GUARD_KEY=\`\${KEY}:beta1-migration-guard:v1\`;
      const BETA1_MIGRATION_GUARD_VALUE="beta1-to-protected-v1";
      const BETA1_EMPTY_CUTOVER_GUARD_VALUE="empty-to-protected-v1";
      const BETA1_RETAINED_CUTOVER_GUARD_VALUE="beta1-retained-to-protected-v1";
      const BETA1_RETAINED_COMPLETE_VALUE="beta1-retained-current-curriculum-v1";
      const PLACEMENT_DRAFT_KEY="math-quest:placement-draft:v1";
      const currentRead={ok:true,value:effects.values.get(KEY)??null};
      const guardRead={ok:true,value:effects.values.get(BETA1_MIGRATION_GUARD_KEY)??null};
      const beta1Read={ok:true,value:effects.values.get(BETA1_PROGRESS_KEY)??null};
      const selected=selectProgressSource(currentRead,guardRead,beta1Read,effects.values.get(KEY)==="PROTECTED-BLANK");
      const beta1Save=selected.beta1Save;
      const progressSourceReadOk=selected.prerequisitesOk;
      const progressSourceFailureText="Beta 1 source unavailable.";
      const retainedMode=effects.mode.startsWith("retained");
      let beta1MigrationPending=selected.beta1Selected&&!retainedMode;
      let beta1EmptyCutoverPending=selected.emptyCutoverSelected&&selected.prerequisitesOk;
      let beta1RetainedCutoverPending=selected.beta1Selected&&retainedMode;
      let persistedSaveBytes=currentRead.value;
      let persistedBeta1MigrationGuardBytes=guardRead.value;
      let progressConflict=false;
      let progressLeaseStatus="PENDING";
      let progressLeaseFailure="";
      let beta1ProtectedWriteAttempted=false;
      let persistedPlacementDraftBytes=null;
      let saveRecoveryRequired=false;
      let backupImportBusy=false;
      let pwaControllerChangeBusy=false;
      const progressLockUnavailableText="Reliable progress protection is unavailable.";
      const beta1MigrationConflictText="Beta 1 progress changed while Beta 2 was opening. The migration guard remains.";
      const beta1MigrationGuardFailureText="Beta 1 migration guard could not be completed.";
      const beta1LateArrivalText="Beta 1 progress or its migration guard changed while Beta 2 was preparing protected storage. Protected progress was not accepted; any partial copy remains guarded and will not be opened.";
      const app={
        inert:true,
        setAttribute(){},
        removeAttribute(){}
      };
      const window={addEventListener(name,handler){effects.handlers[name]=handler;}};
      const localStorage={
        getItem(key){effects.storageOperations.push({type:"read",key});if(effects.storageReadLost)throw new Error("storage access lost");return effects.values.get(key)??null;},
        setItem(key,value){
          effects.storageOperations.push({type:"write",key,value});
          effects.writes.push({key,value});
          if(effects.mode==="retained-complete-write-fail"&&key===BETA1_MIGRATION_GUARD_KEY&&value===BETA1_RETAINED_COMPLETE_VALUE)throw new Error("terminal marker denied");
          effects.values.set(key,value);
          if(effects.mode==="retained-post-commit-read-loss"&&key===BETA1_MIGRATION_GUARD_KEY&&value===BETA1_RETAINED_COMPLETE_VALUE)effects.storageReadLost=true;
        },
        removeItem(key){
          effects.removals.push(key);
          if(["across-remove-fail","empty-after-beta1-remove-fail","retained-across-remove-fail"].includes(effects.mode)&&key===KEY)throw new Error("protected remove denied");
          if(effects.mode==="guard-clear-fail"&&key===BETA1_MIGRATION_GUARD_KEY)throw new Error("guard remove denied");
          if(effects.mode==="empty-clear-read-loss"&&key===BETA1_MIGRATION_GUARD_KEY){
            effects.values.set(key,null);
            effects.values.set(BETA1_PROGRESS_KEY,"BETA1-NEW");
            effects.storageReadLost=true;
            return;
          }
          effects.values.set(key,null);
          if(effects.mode==="empty-clear-beta1"&&key===BETA1_MIGRATION_GUARD_KEY)effects.values.set(BETA1_PROGRESS_KEY,"BETA1-NEW");
          if(effects.mode==="empty-clear-guard"&&key===BETA1_MIGRATION_GUARD_KEY)effects.values.set(BETA1_MIGRATION_GUARD_KEY,BETA1_MIGRATION_GUARD_VALUE);
        }
      };
      function storageWrite(key,value){
        try{localStorage.setItem(key,value);return true;}catch{return false;}
      }
      function storageRemove(key){
        try{localStorage.removeItem(key);return true;}catch{return false;}
      }
      function raiseWarning(message){effects.warnings.push(String(message));}
      function scheduleProgressProtectionScreen(){effects.protectionScreens+=1;}
      function markProgressConflict(){progressConflict=true;progressLeaseFailure="CONFLICT";}
      function markPlacementDraftConflict(){}
      function releaseProgressWriterLease(){progressLeaseStatus="RELEASED";}
      async function acquireProgressWriterLease(){
        effects.acquireCalls+=1;
        progressLeaseStatus="HELD";
        if(effects.mode==="before")effects.values.set(BETA1_PROGRESS_KEY,"BETA1-B");
        if(effects.mode==="retained-before")effects.values.set(BETA1_PROGRESS_KEY,"BETA1-B");
        if(effects.mode==="late-beta1"){
          await Promise.resolve();
          effects.values.set(BETA1_PROGRESS_KEY,"BETA1-NEW");
          effects.pendingStorageEvent={key:BETA1_PROGRESS_KEY,newValue:"BETA1-NEW"};
        }
        if(effects.mode==="late-guard"){
          await Promise.resolve();
          effects.values.set(BETA1_MIGRATION_GUARD_KEY,BETA1_MIGRATION_GUARD_VALUE);
          effects.pendingStorageEvent={key:BETA1_MIGRATION_GUARD_KEY,newValue:BETA1_MIGRATION_GUARD_VALUE};
        }
        return true;
      }
      function save(){
        effects.saveCalls+=1;
        if(effects.mode==="empty-entry-beta1")effects.values.set(BETA1_PROGRESS_KEY,"BETA1-NEW");
        if(effects.mode==="empty-entry-guard")effects.values.set(BETA1_MIGRATION_GUARD_KEY,BETA1_MIGRATION_GUARD_VALUE);
        persistedSaveBytes=beta1Save===null||beta1RetainedCutoverPending?"PROTECTED-BLANK":\`MIGRATED-\${String(beta1Save).at(-1)}\`;
        effects.values.set(KEY,persistedSaveBytes);
        effects.protectedWrites+=1;
        if(["empty-after-beta1","empty-after-beta1-remove-fail"].includes(effects.mode))effects.values.set(BETA1_PROGRESS_KEY,"BETA1-NEW");
        if(effects.mode==="empty-after-guard")effects.values.set(BETA1_MIGRATION_GUARD_KEY,BETA1_MIGRATION_GUARD_VALUE);
        if(["across","across-remove-fail"].includes(effects.mode))effects.values.set(BETA1_PROGRESS_KEY,"BETA1-B");
        if(effects.mode==="retained-across")effects.values.set(BETA1_PROGRESS_KEY,"BETA1-B");
        return true;
      }
      function status(){return {
        selectedSource:selected.sourceSave,
        beta1MigrationPending,
        beta1EmptyCutoverPending,
        beta1RetainedCutoverPending,
        persistedSaveBytes,
        persistedBeta1MigrationGuardBytes,
        guardBytes:effects.values.get(BETA1_MIGRATION_GUARD_KEY)??null,
        progressConflict,
        progressLeaseStatus,
        progressLeaseFailure
      };}
      function dispatchPendingStorageEvent(){
        if(!effects.pendingStorageEvent)return;
        effects.handlers.storage({storageArea:localStorage,...effects.pendingStorageEvent});
        effects.pendingStorageEvent=null;
      }
    `,
    functions: [
      "selectProgressSource",
      "abortBeta1MigrationCutover",
      "ensureBeta1MigrationGuard",
      "ensureBeta1EmptyCutoverGuard",
      "ensureBeta1RetainedCutoverGuard",
      "clearBeta1MigrationGuard",
      "verifyBeta1MigrationSourceUnchanged",
      "verifyNoLateBeta1MigrationInput",
      "verifyBeta1EmptyCutoverUnchanged",
      "finalizeBeta1EmptyCutover",
      "verifyBeta1RetainedCutoverUnchanged",
      "finalizeBeta1RetainedCutover",
      "initializeProgressPersistence",
    ],
    body: storageListener,
    exposed: "initializeProgressPersistence,verifyNoLateBeta1MigrationInput,status,dispatchPendingStorageEvent",
    context: { effects: Object.assign(effects, { mode }) },
  });
  return { effects, harness };
}

test("only an exact validated virgin protected state can trigger guard-independent Beta 1 discovery", async () => {
  const { engine } = await loadShippedEngine(new URL("../../index.html", import.meta.url));
  const harness = evaluateHarness({
    prelude: "const E=effects.engine;",
    functions: ["isVirginProtectedSave"],
    exposed: "isVirginProtectedSave",
    context: { effects: { engine } },
  });
  const initial = engine.createInitialState(21_000);
  const initialBytes = engine.exportState(initial);
  assert.equal(harness.isVirginProtectedSave(initialBytes), true);

  const changedSettings = structuredClone(initial);
  changedSettings.settings.soundEnabled = true;
  const changedSettingsBytes = engine.exportState(changedSettings);
  assert.equal(engine.loadState(changedSettingsBytes, 0).ok, true);
  assert.equal(harness.isVirginProtectedSave(changedSettingsBytes), false);

  const recoveryGeneration = structuredClone(initial);
  recoveryGeneration.placementDraftGeneration = 1;
  const recoveryGenerationBytes = engine.exportState(recoveryGeneration);
  assert.equal(engine.loadState(recoveryGenerationBytes, 0).ok, true);
  assert.equal(harness.isVirginProtectedSave(recoveryGenerationBytes), false);

  const startedSession = structuredClone(initial);
  startedSession.previewLevel = 1;
  const startedSessionBytes = engine.exportState(startedSession);
  assert.equal(engine.loadState(startedSessionBytes, 0).ok, true);
  assert.equal(harness.isVirginProtectedSave(startedSessionBytes), false);
  assert.equal(harness.isVirginProtectedSave("{"), false);
  assert.equal(harness.isVirginProtectedSave(""), false);
  assert.equal(harness.isVirginProtectedSave(null), false);
});

test("only a fully valid exact immutable retired Beta 1 envelope is eligible for retained fresh-start cutover", async () => {
  const { engine } = await loadShippedEngine(new URL("../../index.html", import.meta.url));
  const retiredKeys = ["schemaVersion","productVersion","curriculumManifestId","curriculumVersion","curriculumSha256","earnedLevel","previewLevel","maxSeenPlayDay","practiceCountByDay","skills","settings","activeSession","sessionLog","feedbackHistory","reteachQueue","currentLevelColdWindow","levelReteachActive","levelReteachTargets","levelReteachTargetSince","guessingLikeStreak","latencyHistory","seed"].sort();
  const retiredSha = "49e5265eed2fe6d17d660d8136de1b55b05398e6b86b2b8761571480580e1048";
  const harness = evaluateHarness({
    prelude: `const E=effects.engine;const BETA1_RETIRED_STATE_KEYS=Object.freeze(effects.keys);const BETA1_RETIRED_CURRICULUM_SHA256=effects.sha;`,
    functions: ["isRetainedRetiredBeta1Save"],
    exposed: "isRetainedRetiredBeta1Save",
    context: { effects: { engine, keys: retiredKeys, sha: retiredSha } },
  });
  const exact = structuredClone(engine.createInitialState(30_000));
  delete exact.placement;
  delete exact.placementDraftGeneration;
  Object.assign(exact, {
    schemaVersion: 2,
    productVersion: "1.0.0-beta.1",
    curriculumManifestId: "math-quest-curriculum",
    curriculumVersion: "1.0.0",
    curriculumSha256: retiredSha,
  });
  const adapted = structuredClone(exact);
  adapted.productVersion = engine.CONSTANTS.PRODUCT_VERSION;
  adapted.curriculumManifestId = engine.CURRICULUM_MANIFEST.manifestId;
  adapted.curriculumVersion = engine.CURRICULUM_MANIFEST.version;
  adapted.curriculumSha256 = engine.CURRICULUM_MANIFEST_SHA256;
  const adaptedLoad = engine.loadState(JSON.stringify(adapted), 0);
  assert.equal(harness.isRetainedRetiredBeta1Save(JSON.stringify(exact)), true, adaptedLoad.error);
  for (const mutation of [
    (value) => { value.schemaVersion = 3; },
    (value) => { value.productVersion = "1.0.0-beta.2"; },
    (value) => { value.curriculumManifestId = "other"; },
    (value) => { value.curriculumVersion = "2.0.0"; },
    (value) => { value.curriculumSha256 = "0".repeat(64); },
    (value) => { value.earnedLevel = null; },
    (value) => { value.maxSeenPlayDay = -1; },
    (value) => { value.practiceCountByDay = null; },
    (value) => { value.skills = null; },
    (value) => { value.settings = null; },
    (value) => { value.sessionLog = null; },
    (value) => { value.seed = -1; },
    (value) => { value.unrecognized = true; },
    (value) => { delete value.seed; },
  ]) {
    const changed = structuredClone(exact);
    mutation(changed);
    assert.equal(harness.isRetainedRetiredBeta1Save(JSON.stringify(changed)), false);
  }
  assert.equal(harness.isRetainedRetiredBeta1Save("{"), false);
  assert.equal(harness.isRetainedRetiredBeta1Save(null), false);
});

test("retired Beta 1 progress remains byte-identical while a guarded fresh Beta 8 save commits transactionally", async () => {
  const retainedNotice = "A Beta 1 save from the earlier curriculum remains stored separately on this device. Beta 8 starts fresh so old mastery is not applied to changed skills.";
  const successful = createBeta1MigrationHarness("retained-success");
  assert.equal(successful.harness.status().selectedSource, "BETA1-A");
  assert.equal(successful.harness.status().beta1RetainedCutoverPending, true);
  assert.equal(await successful.harness.initializeProgressPersistence(), true);
  assert.equal(successful.effects.values.get("math-quest:v2"), "BETA1-A");
  assert.equal(successful.effects.values.get("math-quest:progress:v2"), "PROTECTED-BLANK");
  assert.equal(successful.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), "beta1-retained-current-curriculum-v1");
  assert.equal(successful.harness.status().beta1MigrationPending, false);
  assert.equal(successful.harness.status().beta1EmptyCutoverPending, false);
  assert.equal(successful.harness.status().beta1RetainedCutoverPending, false);
  assert.equal(successful.effects.warnings.at(-1), retainedNotice, "the completed cutover must visibly explain the fresh start to the grown-up");
  assert.equal(JSON.stringify(successful.effects.storageOperations.at(-1)), JSON.stringify({ type: "write", key: "math-quest:progress:v2:beta1-migration-guard:v1", value: "beta1-retained-current-curriculum-v1" }), "the terminal marker must be the last synchronous cutover operation");

  const reload = createBeta1MigrationHarness("success", successful.effects.values);
  assert.equal(reload.harness.status().selectedSource, "PROTECTED-BLANK", "the terminal marker must stop the retained source from replacing a virgin current save on reload");
  assert.equal(reload.harness.status().beta1MigrationPending, false);
  assert.equal(reload.harness.verifyNoLateBeta1MigrationInput(), true, "a protected save with the terminal retained marker is not an interrupted empty cutover");
  assert.equal(await reload.harness.initializeProgressPersistence(), true);
  assert.equal(reload.effects.values.get("math-quest:v2"), "BETA1-A");
  assert.equal(reload.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), "beta1-retained-current-curriculum-v1");

  const postCommitReadLoss = createBeta1MigrationHarness("retained-post-commit-read-loss");
  assert.equal(await postCommitReadLoss.harness.initializeProgressPersistence(), true, "no unverified read may remain after the terminal commit");
  assert.equal(JSON.stringify(postCommitReadLoss.effects.storageOperations.at(-1)), JSON.stringify({ type: "write", key: "math-quest:progress:v2:beta1-migration-guard:v1", value: "beta1-retained-current-curriculum-v1" }));

  for (const mode of ["retained-before", "retained-across", "retained-complete-write-fail"]) {
    const run = createBeta1MigrationHarness(mode);
    assert.equal(await run.harness.initializeProgressPersistence(), false, `${mode} must fail closed`);
    assert.equal(run.effects.values.get("math-quest:progress:v2"), null, `${mode} must not leave a trusted fresh save`);
    assert.equal(run.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), "beta1-retained-to-protected-v1", `${mode} must remain retryable under the retained guard`);
    assert.equal(run.harness.status().progressConflict, true);
  }

  const missingProtected = createBeta1MigrationHarness("success", new Map([
    ["math-quest:progress:v2", null],
    ["math-quest:v2", "BETA1-A"],
    ["math-quest:progress:v2:beta1-migration-guard:v1", "beta1-retained-current-curriculum-v1"],
  ]));
  assert.equal(await missingProtected.harness.initializeProgressPersistence(), false, "a terminal marker without its protected save must fail closed");
  assert.equal(missingProtected.effects.acquireCalls, 0);
  assert.equal(missingProtected.effects.protectedWrites, 0);
  assert.equal(missingProtected.effects.values.get("math-quest:v2"), "BETA1-A");
});

test("Beta 1 migration never copies a source that changed before or across the protected cutover", async () => {
  const before = createBeta1MigrationHarness("before");
  assert.equal(await before.harness.initializeProgressPersistence(), false);
  assert.equal(before.effects.acquireCalls, 1);
  assert.equal(before.effects.saveCalls, 0, "a source changed before cutover must not be copied");
  assert.equal(before.effects.values.get("math-quest:progress:v2"), null);
  assert.equal(before.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), "beta1-to-protected-v1");
  assert.equal(before.harness.status().progressConflict, true);
  assert.equal(before.harness.status().progressLeaseFailure, "CONFLICT");
  assert.match(before.effects.warnings.at(-1), /Beta 1 progress changed/u);

  const across = createBeta1MigrationHarness("across");
  assert.equal(await across.harness.initializeProgressPersistence(), false);
  assert.equal(across.effects.saveCalls, 1, "the race occurs only after the protected write");
  assert.equal(
    across.effects.values.get("math-quest:progress:v2"),
    null,
    "the just-written stale copy is removed while it still matches this tab's bytes",
  );
  assert.deepEqual(across.effects.removals, ["math-quest:progress:v2"]);
  assert.equal(across.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), "beta1-to-protected-v1");
  assert.equal(across.harness.status().persistedSaveBytes, null);
  assert.equal(across.harness.status().progressConflict, true);
  assert.equal(across.harness.status().progressLeaseFailure, "CONFLICT");
});

test("an initially empty protected store rechecks late Beta 1 source and guard arrivals before any blank write", async () => {
  const initiallyEmpty = () => new Map([
    ["math-quest:progress:v2", null],
    ["math-quest:v2", null],
    ["math-quest:progress:v2:beta1-migration-guard:v1", null],
  ]);

  for (const mode of ["late-beta1", "late-guard"]) {
    const run = createBeta1MigrationHarness(mode, initiallyEmpty());
    assert.equal(await run.harness.initializeProgressPersistence(), false, `${mode} must fail closed`);
    assert.equal(run.effects.acquireCalls, 1);
    assert.equal(run.effects.saveCalls, 0, `${mode} must not write blank protected progress`);
    assert.equal(run.effects.values.get("math-quest:progress:v2"), null);
    assert.equal(run.harness.status().progressConflict, true);
    assert.equal(run.harness.status().progressLeaseStatus, "RELEASED");
    assert.equal(run.harness.status().progressLeaseFailure, "CONFLICT");
    assert.match(run.effects.warnings.at(-1), /Protected progress was not accepted/u);
    assert.ok(run.effects.pendingStorageEvent, `${mode} must remain safe before the delayed event arrives`);

    run.harness.dispatchPendingStorageEvent();
    assert.equal(run.effects.saveCalls, 0, `${mode} must remain write-free after the delayed event`);
    assert.equal(run.effects.values.get("math-quest:progress:v2"), null);
  }
});

test("a durable empty-cutover guard encloses the blank write and controls interrupted reload selection without storage events", async () => {
  const initiallyEmpty = () => new Map([
    ["math-quest:progress:v2", null],
    ["math-quest:v2", null],
    ["math-quest:progress:v2:beta1-migration-guard:v1", null],
  ]);

  for (const mode of ["empty-entry-beta1", "empty-after-beta1"]) {
    const run = createBeta1MigrationHarness(mode, initiallyEmpty());
    assert.equal(await run.harness.initializeProgressPersistence(), false, `${mode} must reject its guarded partial write`);
    assert.equal(run.effects.protectedWrites, 1);
    assert.equal(run.effects.values.get("math-quest:progress:v2"), null, `${mode} must roll back its byte-matching blank record`);
    assert.equal(run.effects.values.get("math-quest:v2"), "BETA1-NEW");
    assert.equal(run.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), "empty-to-protected-v1");
    assert.equal(run.effects.pendingStorageEvent, null, `${mode} must not depend on a storage event`);
    assert.equal(run.harness.status().progressConflict, true);

    const reloaded = createBeta1MigrationHarness("success", run.effects.values);
    assert.equal(reloaded.harness.status().selectedSource, "BETA1-NEW", `${mode} reload must prefer the guarded Beta 1 source`);
    assert.equal(await reloaded.harness.initializeProgressPersistence(), true);
    assert.equal(reloaded.effects.values.get("math-quest:progress:v2"), "MIGRATED-W");
    assert.equal(reloaded.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), null);
  }

  const rollbackFailure = createBeta1MigrationHarness("empty-after-beta1-remove-fail", initiallyEmpty());
  assert.equal(await rollbackFailure.harness.initializeProgressPersistence(), false);
  assert.equal(rollbackFailure.effects.values.get("math-quest:progress:v2"), "PROTECTED-BLANK");
  assert.equal(rollbackFailure.effects.values.get("math-quest:v2"), "BETA1-NEW");
  assert.equal(rollbackFailure.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), "empty-to-protected-v1");
  const recovered = createBeta1MigrationHarness("success", rollbackFailure.effects.values);
  assert.equal(recovered.harness.status().selectedSource, "BETA1-NEW", "the durable empty guard must outrank an unremovable blank record");
  assert.equal(await recovered.harness.initializeProgressPersistence(), true);
  assert.equal(recovered.effects.values.get("math-quest:progress:v2"), "MIGRATED-W");
  assert.equal(recovered.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), null);

  for (const mode of ["empty-entry-guard", "empty-after-guard"]) {
    const run = createBeta1MigrationHarness(mode, initiallyEmpty());
    assert.equal(await run.harness.initializeProgressPersistence(), false, `${mode} must reject a changed guard`);
    assert.equal(run.effects.protectedWrites, 1);
    assert.equal(run.effects.values.get("math-quest:progress:v2"), null);
    assert.equal(run.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), "beta1-to-protected-v1");
    assert.equal(run.effects.pendingStorageEvent, null, `${mode} must not depend on a storage event`);

    const reloaded = createBeta1MigrationHarness("success", run.effects.values);
    assert.equal(await reloaded.harness.initializeProgressPersistence(), false, "a migration guard without its source must fail closed on reload");
    assert.equal(reloaded.effects.acquireCalls, 0);
    assert.equal(reloaded.effects.protectedWrites, 0);
    assert.equal(reloaded.effects.values.get("math-quest:progress:v2"), null);
  }

  const closingSource = createBeta1MigrationHarness("empty-clear-beta1", initiallyEmpty());
  assert.equal(await closingSource.harness.initializeProgressPersistence(), false);
  assert.equal(closingSource.effects.protectedWrites, 1);
  assert.equal(closingSource.effects.values.get("math-quest:progress:v2"), null);
  assert.equal(closingSource.effects.values.get("math-quest:v2"), "BETA1-NEW");
  assert.equal(closingSource.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), "empty-to-protected-v1");
  const closingReload = createBeta1MigrationHarness("success", closingSource.effects.values);
  assert.equal(closingReload.harness.status().selectedSource, "BETA1-NEW");
  assert.equal(await closingReload.harness.initializeProgressPersistence(), true);
  assert.equal(closingReload.effects.values.get("math-quest:progress:v2"), "MIGRATED-W");

  const closingGuard = createBeta1MigrationHarness("empty-clear-guard", initiallyEmpty());
  assert.equal(await closingGuard.harness.initializeProgressPersistence(), false);
  assert.equal(closingGuard.effects.values.get("math-quest:progress:v2"), null);
  assert.equal(closingGuard.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), "beta1-to-protected-v1");
  const closingGuardReload = createBeta1MigrationHarness("success", closingGuard.effects.values);
  assert.equal(await closingGuardReload.harness.initializeProgressPersistence(), false);
  assert.equal(closingGuardReload.effects.protectedWrites, 0);

  const accessLoss = createBeta1MigrationHarness("empty-clear-read-loss", initiallyEmpty());
  assert.equal(await accessLoss.harness.initializeProgressPersistence(), false);
  assert.equal(accessLoss.effects.protectedWrites, 1);
  assert.equal(accessLoss.effects.values.get("math-quest:progress:v2"), "PROTECTED-BLANK");
  assert.equal(accessLoss.effects.values.get("math-quest:v2"), "BETA1-NEW");
  assert.equal(accessLoss.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), null);
  assert.equal(accessLoss.effects.storageReadLost, true);

  const accessRestoredReload = createBeta1MigrationHarness("success", accessLoss.effects.values);
  assert.equal(
    accessRestoredReload.harness.status().selectedSource,
    "BETA1-NEW",
    "a demonstrably virgin protected record cannot hide Beta 1 even when its external guard disappeared",
  );
  assert.equal(await accessRestoredReload.harness.initializeProgressPersistence(), true);
  assert.equal(accessRestoredReload.effects.values.get("math-quest:progress:v2"), "MIGRATED-W");
  assert.equal(accessRestoredReload.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), null);

  const clean = createBeta1MigrationHarness("success", initiallyEmpty());
  assert.equal(await clean.harness.initializeProgressPersistence(), true);
  assert.equal(clean.effects.values.get("math-quest:progress:v2"), "PROTECTED-BLANK");
  assert.equal(clean.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), null);
  assert.equal(clean.harness.status().beta1EmptyCutoverPending, false);
});

test("a failed protected rollback leaves a durable guard and reload reconciles from the newest Beta 1 bytes", async () => {
  const failed = createBeta1MigrationHarness("across-remove-fail");
  assert.equal(await failed.harness.initializeProgressPersistence(), false);
  assert.equal(failed.effects.values.get("math-quest:progress:v2"), "MIGRATED-A");
  assert.equal(failed.effects.values.get("math-quest:v2"), "BETA1-B");
  assert.equal(failed.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), "beta1-to-protected-v1");
  assert.match(failed.effects.warnings.at(-1), /guard still prevents it from opening/iu);

  const reloaded = createBeta1MigrationHarness("success", failed.effects.values);
  assert.equal(reloaded.harness.status().selectedSource, "BETA1-B", "the guard makes reload ignore protected stale bytes");
  assert.equal(await reloaded.harness.initializeProgressPersistence(), true);
  assert.equal(reloaded.effects.values.get("math-quest:progress:v2"), "MIGRATED-B");
  assert.equal(reloaded.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), null);
  assert.equal(reloaded.harness.status().beta1MigrationPending, false);
  assert.equal(reloaded.harness.status().progressConflict, false);
});

test("migration remains fail-closed when the durable guard cannot be cleared", async () => {
  const failed = createBeta1MigrationHarness("guard-clear-fail");
  assert.equal(await failed.harness.initializeProgressPersistence(), false);
  assert.equal(failed.effects.values.get("math-quest:progress:v2"), "MIGRATED-A");
  assert.equal(failed.effects.values.get("math-quest:progress:v2:beta1-migration-guard:v1"), "beta1-to-protected-v1");
  assert.equal(failed.harness.status().progressConflict, true);
  assert.equal(failed.harness.status().progressLeaseStatus, "RELEASED");
  assert.match(failed.effects.warnings.at(-1), /migration guard could not be completed/iu);
});

test("storage events observe the Beta 1 source and every active cutover guard", () => {
  const storageListener = extractListenerStatement("window", "storage", "BETA1_MIGRATION_GUARD_KEY");
  const createHarness = ({ pending = true, emptyPending = false, retainedPending = false } = {}) => {
    const effects = { handlers: {}, aborts: [], conflicts: 0, draftConflicts: 0 };
    const localStorage = {};
    const harness = new vm.Script(`(()=>{"use strict";
      const KEY="math-quest:progress:v2",BETA1_PROGRESS_KEY="math-quest:v2",BETA1_MIGRATION_GUARD_KEY=\`\${KEY}:beta1-migration-guard:v1\`,PLACEMENT_DRAFT_KEY="math-quest:placement-draft:v1";
      const window={addEventListener(name,handler){effects.handlers[name]=handler;}};
      const beta1LateArrivalText="Late Beta 1 cutover input.";
      let beta1MigrationPending=${pending},beta1EmptyCutoverPending=${emptyPending},beta1RetainedCutoverPending=${retainedPending},beta1ProtectedWriteAttempted=true,beta1Save=${emptyPending ? "null" : '"BETA1-A"'},persistedBeta1MigrationGuardBytes=${retainedPending ? '"beta1-retained-to-protected-v1"' : emptyPending ? '"empty-to-protected-v1"' : '"beta1-to-protected-v1"'},persistedSaveBytes="PROTECTED",persistedPlacementDraftBytes=null;
      function abortBeta1MigrationCutover(options){effects.aborts.push(options);beta1MigrationPending=false;beta1EmptyCutoverPending=false;beta1RetainedCutoverPending=false;return false;}
      function markProgressConflict(){effects.conflicts+=1;}
      function markPlacementDraftConflict(){effects.draftConflicts+=1;}
      ${storageListener}
      return {dispatch(event){effects.handlers.storage({storageArea:localStorage,...event});},effects};
    })()`, { filename: "math-quest-storage-event-effect.js" }).runInNewContext({ effects, localStorage });
    return harness;
  };

  const source = createHarness();
  source.dispatch({ key: "math-quest:v2", newValue: "BETA1-B" });
  assert.equal(source.effects.aborts.length, 1);
  assert.equal(source.effects.aborts[0].rollbackProtected, true);
  assert.equal(source.effects.conflicts, 0);

  const guard = createHarness();
  guard.dispatch({ key: "math-quest:progress:v2:beta1-migration-guard:v1", newValue: null });
  assert.equal(guard.effects.aborts.length, 1);
  assert.equal(guard.effects.conflicts, 0);

  const emptySource = createHarness({ pending: false, emptyPending: true });
  emptySource.dispatch({ key: "math-quest:v2", newValue: "BETA1-NEW" });
  assert.equal(emptySource.effects.aborts.length, 1);
  assert.equal(emptySource.effects.aborts[0].rollbackProtected, true);

  const emptyGuard = createHarness({ pending: false, emptyPending: true });
  emptyGuard.dispatch({ key: "math-quest:progress:v2:beta1-migration-guard:v1", newValue: "beta1-to-protected-v1" });
  assert.equal(emptyGuard.effects.aborts.length, 1);
  assert.equal(emptyGuard.effects.aborts[0].rollbackProtected, true);

  const retainedSource = createHarness({ pending: false, retainedPending: true });
  retainedSource.dispatch({ key: "math-quest:v2", newValue: "BETA1-B" });
  assert.equal(retainedSource.effects.aborts.length, 1);
  assert.equal(retainedSource.effects.aborts[0].rollbackProtected, true);

  const retainedGuard = createHarness({ pending: false, retainedPending: true });
  retainedGuard.dispatch({ key: "math-quest:progress:v2:beta1-migration-guard:v1", newValue: "beta1-retained-current-curriculum-v1" });
  assert.equal(retainedGuard.effects.aborts.length, 1);
  assert.equal(retainedGuard.effects.aborts[0].rollbackProtected, true);

  const postMigration = createHarness({ pending: false });
  postMigration.dispatch({ key: "math-quest:progress:v2:beta1-migration-guard:v1", newValue: "unexpected" });
  assert.equal(postMigration.effects.aborts.length, 0);
  assert.equal(postMigration.effects.conflicts, 1);
});

test("empty preview sessions remain preview while empty regular sessions remain regular", () => {
  const previewSession = { level: 2, queue: [] };
  const preview = evaluateHarness({
    prelude: `
      let state={previewLevel:2,activeSession:effects.session};
      let ui={session:effects.session};
    `,
    functions: ["activeSessionKind", "discardPreviewActiveSession"],
    exposed: "activeSessionKind,discardPreviewActiveSession,state:()=>state,ui:()=>ui",
    context: { effects: { session: previewSession } },
  });
  assert.equal(preview.activeSessionKind(), "preview");
  assert.equal(preview.discardPreviewActiveSession(), true);
  assert.equal(preview.state().activeSession, null);
  assert.equal(preview.ui().session, null);

  const regularSession = { level: 1, queue: [] };
  const regular = evaluateHarness({
    prelude: `
      let state={previewLevel:null,activeSession:effects.session};
      let ui={session:effects.session};
    `,
    functions: ["activeSessionKind", "discardPreviewActiveSession"],
    exposed: "activeSessionKind,discardPreviewActiveSession,state:()=>state,ui:()=>ui",
    context: { effects: { session: regularSession } },
  });
  assert.equal(regular.activeSessionKind(), "regular");
  assert.equal(regular.discardPreviewActiveSession(), false);
  assert.notEqual(regular.state().activeSession, null);
  assert.notEqual(regular.ui().session, null);
});

test("Home discards a zero-queue preview capstone but preserves a zero-queue regular capstone", async () => {
  const homeBody = extractActionBranch("home");
  const runCase = async (previewLevel) => {
    const session = { level: 2, queue: [] };
    const effects = { saves: 0, renders: 0 };
    const harness = evaluateHarness({
      prelude: `
        const RESUMABLE_SCREENS=["session","fatigue","capstone"];
        const profileChosen=true;
        let state={previewLevel:effects.previewLevel,activeSession:effects.session};
        let ui={screen:"capstone",session:effects.session};
        function cancelSpeech(){}
        function stopSounds(){}
        async function saveCommitted(){effects.saves+=1;return true;}
        function save(){effects.saves+=1;return true;}
        function render(){effects.renders+=1;}
      `,
      functions: ["activeSessionKind", "discardPreviewActiveSession"],
      body: `async function runHome(){${homeBody}}`,
      exposed: "runHome,state:()=>state,ui:()=>ui",
      context: { effects: { ...effects, previewLevel, session } },
    });
    await harness.runHome();
    return { state: harness.state(), ui: harness.ui(), effects };
  };

  const preview = await runCase(2);
  assert.equal(preview.state.activeSession, null);
  assert.equal(preview.state.previewLevel, null);
  assert.equal(preview.ui.session, null);
  assert.equal(preview.ui.screen, "home");

  const regular = await runCase(null);
  assert.notEqual(regular.state.activeSession, null);
  assert.equal(regular.state.previewLevel, null);
  assert.notEqual(regular.ui.session, null);
  assert.equal(regular.ui.screen, "home");
});

test("MQ-048 Ready opens the unchanged question and rolls back cleanly when saving fails", async () => {
  const { engine } = await loadShippedEngine(new URL("../../index.html", import.meta.url));
  const question = engine.makeQuestion({
    skillId: "MQ-048",
    seed: 0x4d515558,
    ordinal: 0,
    eligibleQuestionOrdinal: 0,
    tier: "EASY",
    representation: "PICTORIAL",
    theme: "ocean",
  });
  const runCase = ({ phase = "practice-token-guide", skillId = "MQ-048", saveOk = true } = {}) => {
    const effects = { question, phase, skillId, saveOk, saves: 0, renders: 0, focus: [], speech: [] };
    const harness = evaluateHarness({
      prelude: `
        let ui={screen:"session",phase:effects.phase,question:{...effects.question,skillId:effects.skillId},modelTouched:false,promptFinishedAt:0,idleStart:0};
        const now=()=>4200;
        function save(){effects.saves+=1;return effects.saveOk;}
        function render(){effects.renders+=1;}
        function renderPlayAndFocus(selector){effects.focus.push(selector);}
        function questionSpeechText(options){effects.speechOptions=options;return "question speech";}
        function speak(text,callback){effects.speech.push(String(text));if(callback)callback();}
      `,
      functions: [],
      body: `function run(){const action="practice-token-ready";${extractActionBranch("practice-token-ready")}}`,
      exposed: "run,ui:()=>ui",
      context: { effects },
    });
    harness.run();
    return { ui: harness.ui(), effects };
  };

  const success = runCase();
  assert.equal(success.ui.phase, "question");
  assert.equal(success.ui.modelTouched, true);
  assert.equal(success.ui.question.questionId, question.questionId);
  assert.deepEqual(JSON.parse(JSON.stringify(success.ui.question)), JSON.parse(JSON.stringify(question)));
  assert.equal(success.ui.promptFinishedAt, 4200);
  assert.equal(success.ui.idleStart, 4200);
  assert.equal(success.effects.saves, 1);
  assert.equal(success.effects.renders, 0);
  assert.equal(success.effects.focus.length, 1);
  assert.deepEqual(success.effects.speech, ["question speech"]);
  assert.equal(success.effects.speechOptions?.includeHelp, false);

  const failedSave = runCase({ saveOk: false });
  assert.equal(failedSave.ui.phase, "practice-token-guide");
  assert.equal(failedSave.ui.modelTouched, false);
  assert.equal(failedSave.effects.renders, 1);
  assert.deepEqual(failedSave.effects.focus, []);
  assert.deepEqual(failedSave.effects.speech, []);

  for (const guarded of [
    runCase({ phase: "question" }),
    runCase({ skillId: "MQ-047" }),
  ]) {
    assert.equal(guarded.effects.saves, 0);
    assert.equal(guarded.effects.renders, 0);
    assert.deepEqual(guarded.effects.speech, []);
  }
  assert.equal(adapter.includes('data-action="physical-done"'), false);
  assert.equal(adapter.includes("physicalTaskHtml"), false);
  assert.equal(adapter.includes("practiceTokenGuideHtml"), true);
  assert.equal(adapter.includes('data-action="practice-token-ready"'), true);
});

test("safe-boundary checks include name gate, home, and grown-ups; explicit Home and Retry checks bypass debounce", async () => {
  const effects = {
    now: 120_000,
    updateCalls: 0,
    readinessCalls: 0,
    initializeCalls: 0,
    statusRefreshes: 0,
  };
  const retryBody = extractActionBranch("pwa-retry");
  const homeCheckBody = extractActionBranch("pwa-check");
  const harness = evaluateHarness({
    prelude: `
      let ui={screen:"nameGate"};
      const pwa={
        registration:{
          waiting:null,
          installing:null,
          async update(){effects.updateCalls+=1;}
        },
        lastUpdateCheck:0,
        updateReady:false,
        reloadSuggested:false,
        phase:"READY",
        details:null,
        error:null
      };
      const navigator={onLine:true};
      function refreshPwaStatus(){effects.statusRefreshes+=1;}
      function setPwaState(phase,{details=null,error=null}={}){
        pwa.phase=phase;pwa.details=details;pwa.error=error?String(error):null;
        refreshPwaStatus();
      }
      async function queryPwaReadiness(){effects.readinessCalls+=1;return true;}
      async function initializePwa(){effects.initializeCalls+=1;}
      function invokeExplicitRetry(){${retryBody}}
      async function invokeHomeCheck(){${homeCheckBody}}
      function setScreen(screen){ui.screen=screen;}
    `,
    functions: ["updateReadyState", "checkPwaUpdateAtBoundary", "checkPwaUpdateNow"],
    exposed: "pwa,setScreen,checkPwaUpdateAtBoundary,invokeExplicitRetry,invokeHomeCheck",
    context: {
      effects,
      Date: { now: () => effects.now },
    },
  });

  harness.setScreen("home");
  harness.pwa.registration.installing = {};
  assert.equal(await harness.checkPwaUpdateAtBoundary(true), true);
  assert.equal(effects.updateCalls, 0, "an in-progress install must not start a competing registration update");
  assert.equal(harness.pwa.updatePhase, "CACHING");
  harness.pwa.registration.installing = null;
  harness.pwa.registration.waiting = {};
  assert.equal(await harness.checkPwaUpdateAtBoundary(true), true);
  assert.equal(effects.updateCalls, 0, "an already waiting update must not be installed a second time");
  assert.equal(harness.pwa.updatePhase, "READY");
  harness.pwa.registration.waiting = null;

  for (const screen of ["nameGate", "home", "grown"]) {
    harness.setScreen(screen);
    const before = effects.updateCalls;
    assert.equal(await harness.checkPwaUpdateAtBoundary(), true, screen);
    assert.equal(effects.updateCalls, before + 1, screen);
    effects.now += 60_001;
  }

  harness.setScreen("session");
  assert.equal(await harness.checkPwaUpdateAtBoundary(true), false);
  assert.equal(effects.updateCalls, 3, "even a forced check must not interrupt a question");

  harness.setScreen("home");
  harness.pwa.lastUpdateCheck = effects.now;
  harness.invokeExplicitRetry();
  await settle();
  assert.equal(effects.readinessCalls, 1);
  assert.equal(effects.updateCalls, 4, "the explicit Retry action must bypass 60-second debounce");
  assert.equal(effects.initializeCalls, 0);
  assert.equal(harness.pwa.lastUpdateCheck, effects.now);

  harness.pwa.lastUpdateCheck = effects.now;
  await harness.invokeHomeCheck();
  assert.equal(effects.readinessCalls, 2);
  assert.equal(effects.updateCalls, 5, "the Home control must perform a real forced registration update");

  harness.pwa.registration = null;
  await harness.invokeHomeCheck();
  assert.equal(effects.initializeCalls, 1, "the Home control must initialize offline support when needed");
});

test("Home renders a grown-up update control with truthful, live states", () => {
  const harness = evaluateHarness({
    prelude: `
      const serviceWorkerEligible=true;
      const navigator={onLine:true,serviceWorker:{controller:{}}};
      const pwa={
        applying:false,updatePhase:"IDLE",updateReady:false,reloadSuggested:false,
        lastUpdateCheck:0,phase:"READY",details:{ready:true},registration:{waiting:null}
      };
      const escape=value=>String(value);
      function pwaUpdateStatusText(){
        if(pwa.updatePhase==="CHECKING")return "Checking for an update.";
        if(pwa.updatePhase==="READY")return "A verified update is ready.";
        return "";
      }
      function hasVerifiedActivePwaShell(){return pwa.phase==="READY"&&pwa.details?.ready===true;}
      function pwaReloadBoundary(){return true;}
      function setState(values){Object.assign(pwa,values);}
    `,
    functions: ["homePwaUpdateStatusText", "homePwaUpdateHtml"],
    exposed: "setState,homePwaUpdateStatusText,homePwaUpdateHtml",
  });

  const initial = harness.homePwaUpdateHtml();
  assert.match(initial, /Grown-ups/u);
  assert.match(initial, /App updates/u);
  assert.match(initial, /data-action="pwa-check"/u);
  assert.match(initial, />Check for updates</u);
  assert.match(initial, /Progress stays on this device/u);

  harness.setState({ updatePhase: "CHECKING" });
  const checking = harness.homePwaUpdateHtml();
  assert.match(checking, /Checking for an update\./u);
  assert.match(checking, /data-action="pwa-check"[^>]*disabled/u);

  harness.setState({ updatePhase: "READY", updateReady: true });
  const ready = harness.homePwaUpdateHtml();
  assert.match(ready, /A verified update is ready\./u);
  assert.match(ready, /data-action="pwa-apply"(?![^>]*hidden)/u);

  harness.setState({ updatePhase: "IDLE", updateReady: false, lastUpdateCheck: 123 });
  assert.equal(harness.homePwaUpdateStatusText(), "Math Quest is up to date.");
});

function createExportHarness(shareResult) {
  const effects = {
    exportCalls: 0,
    shareCalls: 0,
    canShareCalls: 0,
    createUrlCalls: 0,
    revokeUrls: [],
    downloadClicks: 0,
    appendedAnchors: 0,
    removedAnchors: 0,
    notices: [],
    timers: [],
  };
  class MockFile {
    constructor(parts, name, options) {
      this.parts = parts;
      this.name = name;
      this.type = options.type;
      this.lastModified = options.lastModified;
    }
  }
  const document = {
    body: {
      appendChild(anchor) {
        effects.appendedAnchors += 1;
        anchor.isConnected = true;
      },
    },
    createElement(name) {
      assert.equal(name, "a");
      return {
        isConnected: false,
        click() {
          effects.downloadClicks += 1;
        },
        remove() {
          effects.removedAnchors += 1;
          this.isConnected = false;
        },
      };
    },
  };
  const navigator = {
    canShare(payload) {
      effects.canShareCalls += 1;
      assert.equal(payload.files.length, 1);
      return true;
    },
    async share(payload) {
      effects.shareCalls += 1;
      assert.equal(payload.files.length, 1);
      return shareResult();
    },
  };
  const urlApi = {
    createObjectURL(blob) {
      assert.ok(blob.size > 0);
      effects.createUrlCalls += 1;
      return "blob:math-quest-private-backup";
    },
    revokeObjectURL(url) {
      effects.revokeUrls.push(url);
    },
  };
  const harness = evaluateHarness({
    prelude: `
      let backupExportBusy=false;
      const state={};
      const E={
        CONSTANTS:{BACKUP_MAX_BYTES:1024*1024},
        exportState(){
          effects.exportCalls+=1;
          return '{"schemaVersion":3,"private":"local-only"}';
        }
      };
      function setBackupNotice(message,{failure=false}={}){
        effects.notices.push({message,failure,busy:backupExportBusy});
      }
    `,
    functions: ["exportBackup"],
    exposed: "exportBackup",
    context: {
      effects,
      Blob,
      File: MockFile,
      navigator,
      document,
      URL: urlApi,
      Date: { now: () => 1_720_000_000_000 },
      setTimeout(callback, delay) {
        effects.timers.push({ callback, delay });
        return effects.timers.length;
      },
    },
  });
  return { effects, harness };
}

test("successful Web Share exports privately without creating a download URL", async () => {
  const { effects, harness } = createExportHarness(() => undefined);
  await harness.exportBackup();
  assert.equal(effects.exportCalls, 1);
  assert.equal(effects.canShareCalls, 1);
  assert.equal(effects.shareCalls, 1);
  assert.equal(effects.createUrlCalls, 0);
  assert.equal(effects.downloadClicks, 0);
  assert.equal(effects.timers.length, 0);
  assert.equal(effects.notices.at(-1).message, "Backup shared to the destination you chose.");
});

test("Web Share AbortError is a cancellation and never falls through to download", async () => {
  const cancellation = new Error("cancelled by grown-up");
  cancellation.name = "AbortError";
  const { effects, harness } = createExportHarness(() => Promise.reject(cancellation));
  await harness.exportBackup();
  assert.equal(effects.shareCalls, 1);
  assert.equal(effects.createUrlCalls, 0);
  assert.equal(effects.downloadClicks, 0);
  assert.equal(effects.timers.length, 0);
  assert.equal(
    effects.notices.at(-1).message,
    "Export cancelled. No file was shared or downloaded.",
  );
});

test("a rejected non-cancellation share falls back to download and revokes its object URL", async () => {
  const { effects, harness } = createExportHarness(
    () => Promise.reject(new Error("share destination unavailable")),
  );
  await harness.exportBackup();
  assert.equal(effects.shareCalls, 1);
  assert.equal(effects.createUrlCalls, 1);
  assert.equal(effects.appendedAnchors, 1);
  assert.equal(effects.downloadClicks, 1);
  assert.deepEqual(effects.revokeUrls, []);
  assert.equal(effects.timers.length, 1);
  assert.equal(effects.timers[0].delay, 60_000);
  effects.timers[0].callback();
  assert.equal(effects.removedAnchors, 1);
  assert.deepEqual(effects.revokeUrls, ["blob:math-quest-private-backup"]);
  assert.equal(effects.notices.at(-1).message, "Backup download started. Keep the file private.");
});

test("waiting-worker readiness uses one exact 256-bit challenge and rejects a mismatched reply", async () => {
  const effects = { requests: [], replyMode: "valid" };
  const harness = evaluateHarness({
    prelude: `
      const PWA_RELEASE="1.0.0-beta.8";
      const PWA_BUILD_ID="math-quest-pwa-v1.0.0-beta.8";
      const PWA_CACHE_ID="math-quest-static-v1.0.0-beta.8";
      const PWA_REQUIRED_PATHS=Object.freeze(["./index.html","./PRIVACY.md"]);
      const PWA_ACTIVATION_CHALLENGE_PATTERN=/^[a-f0-9]{64}$/;
      const waiting={
        postMessage(message,ports){
          effects.requests.push(message);
          const activationChallenge=effects.replyMode==="mismatch"?"f".repeat(64):message.activationChallenge;
          const ready=effects.replyMode!=="not-ready";
          ports[0].postMessage({
            type:"MATH_QUEST_WAITING_READINESS_V1",
            release:PWA_RELEASE,
            buildId:PWA_BUILD_ID,
            cacheIdentity:PWA_CACHE_ID,
            requiredPaths:PWA_REQUIRED_PATHS.map(path=>({path,ready})),
            workerState:"waiting",
            checkedAt:new Date().toISOString(),
            ready,
            activationChallenge
          });
        }
      };
      function setReplyMode(mode){effects.replyMode=mode;}
    `,
    functions: [
      "validateReadiness",
      "freshActivationChallenge",
      "messageWorker",
      "queryWaitingPwaReadiness",
    ],
    exposed: "waiting,setReplyMode,queryWaitingPwaReadiness",
    context: {
      effects,
      crypto: {
        getRandomValues(bytes) {
          bytes.fill(0xab);
          return bytes;
        },
      },
      MessageChannel: class {
        constructor() {
          this.port1 = {
            onmessage: null,
            onmessageerror: null,
            close() {},
          };
          const receivingPort = this.port1;
          this.port2 = {
            postMessage(data) {
              queueMicrotask(() => receivingPort.onmessage?.({ data }));
            },
          };
        }
      },
      setTimeout,
      clearTimeout,
    },
  });

  const valid = await harness.queryWaitingPwaReadiness(harness.waiting);
  assert.equal(valid.activationChallenge, "ab".repeat(32));
  assert.equal(valid.result.workerState, "waiting");
  assert.equal(valid.result.ready, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(effects.requests)),
    [{
      activationChallenge: "ab".repeat(32),
      type: "MATH_QUEST_GET_WAITING_READINESS_V1",
    }],
  );
  harness.setReplyMode("mismatch");
  assert.equal(await harness.queryWaitingPwaReadiness(harness.waiting), null);
  harness.setReplyMode("not-ready");
  assert.equal(await harness.queryWaitingPwaReadiness(harness.waiting), null);
});

function createUpdateApplyHarness(readinessOutcomes, saveOutcomes = [true]) {
  const effects = {
    readinessOutcomes,
    saveOutcomes,
    readinessCalls: 0,
    saveCalls: 0,
    messages: [],
    addedListeners: 0,
    removedListeners: 0,
    statusRefreshes: 0,
    timers: new Map(),
    clearedTimers: [],
    nextTimerId: 1,
  };
  const harness = evaluateHarness({
    prelude: `
      const PWA_ACTIVATION_TIMEOUT_MS=12000;
      const navigator={serviceWorker:{controller:{id:"verified-active-controller"}}};
      let ui={screen:"home"};
      let readinessIndex=0;
      let saveIndex=0;
      const listeners=new Map();
      const waiting={
        state:"installed",
        addEventListener(type,listener){
          effects.addedListeners+=1;
          listeners.set(type,listener);
        },
        removeEventListener(type,listener){
          effects.removedListeners+=1;
          if(listeners.get(type)===listener)listeners.delete(type);
        },
        postMessage(message){effects.messages.push(message);}
      };
      const pwa={
        phase:"READY",details:{ready:true},error:null,registration:{waiting},
        applying:false,applyAcknowledged:false,applyAttempt:0,applyTimer:null,
        applyWorker:null,applyStateHandler:null,updateReady:true,
        reloadSuggested:false,reloaded:false
      };
      async function queryWaitingPwaReadiness(){
        effects.readinessCalls+=1;
        const outcome=effects.readinessOutcomes[Math.min(readinessIndex,effects.readinessOutcomes.length-1)];
        readinessIndex+=1;
        if(outcome&&outcome.throws)throw new Error(outcome.throws);
        if(outcome&&outcome.replaceWaiting)pwa.registration.waiting={state:"installed",postMessage(){}};
        return outcome&&Object.hasOwn(outcome,"value")?outcome.value:outcome;
      }
      async function saveCommitted(){
        effects.saveCalls+=1;
        const outcome=effects.saveOutcomes[Math.min(saveIndex,effects.saveOutcomes.length-1)];
        saveIndex+=1;
        return outcome;
      }
      function refreshPwaStatus(){effects.statusRefreshes+=1;}
      function setPwaState(phase,{details=null,error=null}={}){
        pwa.phase=phase;pwa.details=details;pwa.error=error?String(error):null;
        refreshPwaStatus();
      }
    `,
    functions: [
      "hasVerifiedActivePwaShell",
      "clearPwaActivationWait",
      "failPwaActivation",
      "beginPwaActivationWait",
      "applyPwaUpdate",
    ],
    exposed: "pwa,applyPwaUpdate",
    context: {
      effects,
      setTimeout(callback, delay) {
        const id = effects.nextTimerId;
        effects.nextTimerId += 1;
        effects.timers.set(id, { callback, delay });
        return id;
      },
      clearTimeout(id) {
        effects.clearedTimers.push(id);
      },
    },
  });
  return { effects, harness };
}

test("missing, mismatched, late, or non-ready waiting proofs make zero save and activation calls", async () => {
  for (const outcome of [
    null,
    { throws: "no reply" },
    { value: null },
    { value: { activationChallenge: "a".repeat(64), result: { ready: true } }, replaceWaiting: true },
  ]) {
    const { effects, harness } = createUpdateApplyHarness([outcome]);
    await harness.applyPwaUpdate();
    assert.equal(effects.saveCalls, 0);
    assert.deepEqual(effects.messages, []);
    assert.equal(harness.pwa.applying, false);
    assert.equal(harness.pwa.reloadSuggested, true);
  }
});

test("a proved update that cannot commit progress never requests activation", async () => {
  const proof = { activationChallenge: "a".repeat(64), result: { ready: true } };
  const { effects, harness } = createUpdateApplyHarness([proof], [false]);
  await harness.applyPwaUpdate();
  assert.equal(effects.readinessCalls, 1);
  assert.equal(effects.saveCalls, 1);
  assert.deepEqual(effects.messages, []);
  assert.equal(harness.pwa.applying, false);
});

test("activation timeout leaves the current version usable and a second Apply attempt works", async () => {
  const firstProof = { activationChallenge: "a".repeat(64), result: { ready: true } };
  const secondProof = { activationChallenge: "b".repeat(64), result: { ready: true } };
  const { effects, harness } = createUpdateApplyHarness([firstProof, secondProof]);

  const firstApply = harness.applyPwaUpdate();
  const duplicateApply = harness.applyPwaUpdate();
  await Promise.all([firstApply, duplicateApply]);
  assert.equal(effects.readinessCalls, 1);
  assert.equal(effects.saveCalls, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(effects.messages)), [{
    type: "MATH_QUEST_SKIP_WAITING_V1",
    activationChallenge: "a".repeat(64),
  }]);
  assert.equal(harness.pwa.applying, true);
  const firstAttempt = harness.pwa.applyAttempt;
  const firstTimerId = harness.pwa.applyTimer;
  assert.equal(effects.timers.get(firstTimerId).delay, 12_000);

  effects.timers.get(firstTimerId).callback();
  assert.equal(harness.pwa.applying, false);
  assert.equal(harness.pwa.reloadSuggested, true);
  assert.equal(harness.pwa.updateReady, true);
  assert.match(harness.pwa.error, /This (?:verified )?version remains usable/u);
  assert.ok(harness.pwa.applyAttempt > firstAttempt);
  assert.ok(effects.clearedTimers.includes(firstTimerId));

  await harness.applyPwaUpdate();
  assert.equal(effects.readinessCalls, 2);
  assert.equal(effects.saveCalls, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(effects.messages)), [
    { type: "MATH_QUEST_SKIP_WAITING_V1", activationChallenge: "a".repeat(64) },
    { type: "MATH_QUEST_SKIP_WAITING_V1", activationChallenge: "b".repeat(64) },
  ]);
  assert.equal(harness.pwa.applying, true);
  assert.equal(harness.pwa.reloadSuggested, false);
  assert.ok(harness.pwa.applyAttempt > firstAttempt);
  assert.notEqual(harness.pwa.applyTimer, firstTimerId);
  assert.equal(effects.addedListeners, 2);
  assert.equal(effects.removedListeners, 1);
});

test("an explicit update reload interlocks input and reloads only after a committed save", async () => {
  const buildHarness = (saveResult) => {
    const effects = {
      saveResult,
      saves: 0,
      reloads: 0,
      cancelledSpeech: 0,
      stoppedSounds: 0,
      clearedActivation: 0,
      statusRefreshes: 0,
      attributes: new Map(),
      errors: [],
    };
    const harness = evaluateHarness({
      prelude: `
        let pwaControllerChangeBusy=false;
        let backupImportBusy=false;
        const pwa={
          phase:"READY",details:null,error:null,reloaded:false,applying:false,
          applyAcknowledged:false,reloadSuggested:false
        };
        const app={
          inert:false,
          setAttribute(name,value){effects.attributes.set(name,value);},
          removeAttribute(name){effects.attributes.delete(name);}
        };
        const location={reload(){effects.reloads+=1;}};
        function cancelSpeech(){effects.cancelledSpeech+=1;}
        function stopSounds(){effects.stoppedSounds+=1;}
        function clearPwaActivationWait(){effects.clearedActivation+=1;}
        function refreshPwaStatus(){effects.statusRefreshes+=1;}
        async function saveCommitted(){effects.saves+=1;return effects.saveResult;}
        function setPwaState(phase,{details=null,error=null}={}){
          pwa.phase=phase;pwa.details=details;pwa.error=error?String(error):null;
          effects.errors.push(pwa.error);
        }
      `,
      functions: ["handlePwaControllerChange"],
      exposed: "pwa,app,handlePwaControllerChange",
      context: { effects },
    });
    return { effects, harness };
  };

  const success = buildHarness(true);
  const successPromise = success.harness.handlePwaControllerChange();
  assert.equal(success.harness.app.inert, true);
  assert.equal(success.effects.attributes.get("aria-busy"), "true");
  await successPromise;
  assert.equal(success.effects.saves, 1);
  assert.equal(success.effects.reloads, 1);
  assert.equal(success.harness.pwa.reloaded, true);
  assert.equal(success.effects.cancelledSpeech, 1);
  assert.equal(success.effects.stoppedSounds, 1);
  assert.equal(success.effects.clearedActivation, 1);

  const failure = buildHarness(false);
  await failure.harness.handlePwaControllerChange();
  assert.equal(failure.effects.saves, 1);
  assert.equal(failure.effects.reloads, 0);
  assert.equal(failure.harness.app.inert, false);
  assert.equal(failure.effects.attributes.has("aria-busy"), false);
  assert.equal(failure.harness.pwa.reloaded, false);
  assert.equal(failure.harness.pwa.applying, false);
  assert.equal(failure.harness.pwa.reloadSuggested, true);
  assert.match(failure.harness.pwa.error, /export a backup/u);
});

function createFatigueTransitionHarness() {
  const effects = {
    cancelledSpeech: 0,
    stoppedSounds: 0,
    saves: 0,
    renders: 0,
    speech: [],
    snapshots: [],
    prepared: 0,
    capstones: 0,
  };
  const harness = evaluateHarness({
    prelude: `
      let state={reteachQueue:[]};
      let ui={
        screen:"session",phase:"feedback",
        question:{questionId:"stale-reteach-question"},
        choiceCandidates:[{questionId:"stale-choice"}],
        choiceResolved:{0:1},
        selected:"old-selection",entry:"12",
        fractionParts:{whole:"1",numerator:"2",denominator:"3"},
        modelCells:[true],responseState:{value:"12"},
        modelTouched:true,hintUsed:true,
        selectionEvents:[{optionId:"old",at:0}],selectionRestored:true,
        feedback:"old feedback",lastAttempt:{recordId:"old-attempt"},
        promptFinishedAt:100,replayMs:200,manipulationMs:300,
        manipulationStartedAt:400,idleStart:500,maxIdleMs:600,
        fatiguePending:true,isReteach:true,reteachAdvancesIndex:true,
        capstoneSubmitted:false,reteachPending:null,
        stopReason:null,stopRequested:false,oneMore:false,
        index:1,servedCount:2,servedOrdinals:[0,1],
        session:{queue:[{ordinal:0},{ordinal:1},{ordinal:2}]},
        sessionClassifications:[]
      };
      function cancelSpeech(){effects.cancelledSpeech+=1;}
      function stopSounds(){effects.stoppedSounds+=1;}
      function save(){
        effects.saves+=1;
        effects.snapshots.push(JSON.parse(JSON.stringify(ui)));
        return true;
      }
      function render(){effects.renders+=1;}
      function replayText(){return "fatigue prompt";}
      function speak(text){effects.speech.push(String(text));}
      function startReteach(){throw new Error("unexpected chained reteach");}
      function commitPendingAttempt(){return {ok:true,changed:false};}
      function checkTimeCap(){return false;}
      function addClassification(value){
        if(value&&!ui.sessionClassifications.includes(value))ui.sessionClassifications.push(value);
      }
      function prepareQuestion(){
        effects.prepared+=1;
        const slot=ui.session.queue[ui.index];
        if(slot&&!ui.servedOrdinals.includes(slot.ordinal)){
          ui.servedOrdinals.push(slot.ordinal);
          ui.servedCount+=1;
        }
        ui.question={questionId:"prepared-"+slot.ordinal};
        ui.phase="question";
      }
      function capstone(){effects.capstones+=1;ui.screen="capstone";}
    `,
    functions: ["enterFatigue", "next"],
    body: `
      function chooseOneMore(){${extractActionBranch("one-more")}}
      function chooseDone(){${extractActionBranch("done-now")}}
    `,
    exposed: "ui,effects,next,chooseOneMore,chooseDone",
    context: { effects },
  });
  return harness;
}

test("simultaneous reteach and fatigue clears stale question UI without changing progress choices", () => {
  const local = (value) => JSON.parse(JSON.stringify(value));
  const oneMore = createFatigueTransitionHarness();
  oneMore.next();
  assert.equal(oneMore.effects.saves, 1);
  assert.equal(oneMore.effects.cancelledSpeech, 1);
  assert.equal(oneMore.effects.stoppedSounds, 1);
  assert.equal(oneMore.ui.screen, "fatigue");
  assert.equal(oneMore.ui.phase, "question");
  assert.equal(oneMore.ui.question, null);
  assert.deepEqual(local(oneMore.ui.choiceCandidates), []);
  assert.deepEqual(local(oneMore.ui.responseState), {});
  assert.equal(oneMore.ui.feedback, null);
  assert.equal(oneMore.ui.lastAttempt, null);
  assert.equal(oneMore.ui.isReteach, false);
  assert.equal(oneMore.ui.reteachAdvancesIndex, false);
  assert.equal(oneMore.ui.index, 1);
  assert.equal(oneMore.ui.servedCount, 2);
  assert.deepEqual(local(oneMore.ui.servedOrdinals), [0, 1]);
  assert.deepEqual(local(oneMore.ui.choiceResolved), { 0: 1 }, "past choice resolution must survive fatigue");
  assert.deepEqual(
    JSON.parse(JSON.stringify(oneMore.effects.snapshots[0])),
    JSON.parse(JSON.stringify(oneMore.ui)),
    "the durable checkpoint must be the cleared fatigue state",
  );

  oneMore.chooseOneMore();
  assert.equal(oneMore.ui.stopReason, "FATIGUE_STOPPED");
  assert.equal(oneMore.ui.stopRequested, true);
  assert.equal(oneMore.ui.oneMore, true);
  assert.equal(oneMore.ui.index, 2);
  assert.equal(oneMore.effects.prepared, 1);
  assert.equal(oneMore.effects.capstones, 0);
  assert.equal(oneMore.ui.servedCount, 3);
  assert.deepEqual(local(oneMore.ui.servedOrdinals), [0, 1, 2]);

  const done = createFatigueTransitionHarness();
  done.next();
  done.chooseDone();
  assert.equal(done.ui.stopReason, "FATIGUE_STOPPED");
  assert.equal(done.ui.stopRequested, true);
  assert.equal(done.ui.oneMore, false);
  assert.equal(done.ui.index, 1, "Done must not advance the queue");
  assert.equal(done.ui.servedCount, 2);
  assert.deepEqual(local(done.ui.servedOrdinals), [0, 1]);
  assert.equal(done.effects.prepared, 0);
  assert.equal(done.effects.capstones, 1);
  assert.equal(done.ui.screen, "capstone");
});

test("count-touch markup preserves exact controls while using world-specific object glyphs", () => {
  const harness = evaluateHarness({
    prelude: `
      const escape=(value)=>String(value).replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
      const responseAction=(mode,action,extra="")=>\`data-mode="\${mode}" data-response-action="\${action}" \${extra}\`;
      const E={SKILL_BY_ID:{"MQ-002":{constraints:{maxNumber:5}}}};
    `,
    functions: ["themedObjectTokenHtml", "countTouchConstructionHtml"],
    exposed: "themedObjectTokenHtml,countTouchConstructionHtml",
  });
  const contracts = [
    ["shells", "shell"],
    ["acorns", "acorn"],
    ["moon rocks", "moon-rock"],
  ];
  for (const [noun, kind] of contracts) {
    const html = harness.countTouchConstructionHtml(
      { skillId: "MQ-002", answer: { value: 3 }, params: { noun, layout: "line" }, modelDescriptor: { values: { items: [{ magnitude: 3, label: noun, objectKind: kind, layout: "line" }] } } },
      "play",
      { responseState: { touched: ["i1"], count: "3" } },
    );
    assert.equal((html.match(new RegExp(`data-object-kind="${kind}"`, "gu")) || []).length, 3);
    assert.equal((html.match(/class="share-token"/gu) || []).length, 0);
    assert.deepEqual(
      [...html.matchAll(/data-item-id="(i\d+)"/gu)].map((match) => match[1]),
      ["i0", "i1", "i2"],
    );
    assert.match(html, /aria-label="[^"]+ 2, counted"/u);
    assert.equal((html.match(/data-response-action="count-number"/gu) || []).length, 6);
    assert.match(html, /data-count-value="3"[^>]+aria-pressed="true"/u);
  }
  const zero = harness.countTouchConstructionHtml(
    { skillId: "MQ-002", answer: { value: 0 }, params: { noun: "shells", layout: "scattered" }, modelDescriptor: { values: { items: [{ magnitude: 0, label: "shells", objectKind: "shell", layout: "scattered" }] } } },
    "play",
    { responseState: { touched: [], count: "" } },
  );
  assert.equal((zero.match(/data-item-id=/gu) || []).length, 0);
  assert.equal((zero.match(/themed-object-token/gu) || []).length, 0);
  assert.equal((zero.match(/empty-set-mat/gu) || []).length, 1);
  assert.match(zero, />0<\/b>/u);
  assert.match(zero, /Zero objects\. The set is empty\./u);
});

test("pattern visuals never impersonate response actions", () => {
  const harness = evaluateHarness({
    prelude: `
      const escape=(value)=>String(value);
      const shapeVisualHtml=()=>"<i></i>";
      const colourName=()=>null;
      const categoryIconHtml=()=>null;
    `,
    functions: ["patternTokenVisualHtml"],
    exposed: "patternTokenVisualHtml",
  });
  for (const action of ["clap", "tap", "stomp", "turn"]) {
    const html = harness.patternTokenVisualHtml(action);
    assert.match(html, new RegExp(`data-pattern-action="${action}"`, "u"));
    assert.doesNotMatch(html, /\sdata-action=/u);
  }
});

function createTutorialCommitHarness({ saveResults = [true] } = {}) {
  const effects = {
    applyCalls: 0,
    suppressed: 0,
    saves: 0,
    renders: 0,
    focuses: [],
    speeches: [],
    announcements: [],
    warnings: [],
    saveResults: [...saveResults],
  };
  const harness = evaluateHarness({
    prelude: `
      const structuredClone=(value)=>JSON.parse(JSON.stringify(value));
      let state={seed:41,evidenceCount:0,practiceCount:0,feedbackHistory:[]};
      let ui={
        screen:"session",phase:"feedback",selected:"wrong",entry:"",fractionParts:{whole:"",numerator:"",denominator:""},
        modelCells:[],responseState:{tokens:["wrong"]},modelTouched:false,hintUsed:false,tutorialOpen:false,tutorialStep:1,
        selectionEvents:[],selectionRestored:false,feedback:"Try a different way.",
        lastAttempt:{recordId:"attempt-1",questionId:"question-1",skillId:"MQ-004",stage:"PRE_K",feedbackClass:"INCORRECT",evidenceClass:"CONSTRUCTION",playDay:7},
        attemptCommitted:false,reteachPending:null,fatiguePending:false,isReteach:false,
        question:{questionId:"question-1",skillId:"MQ-004"},session:{sessionId:"session-1"}
      };
      const E={
        CONSTANTS:{FEEDBACK_HISTORY_MAX:100},
        createResponseState(){return {tokens:[]};},
        suppressAttemptEvidenceForTutorial(attempt){effects.suppressed+=1;return {...attempt,evidenceClass:"NON_EVIDENCE",hintUsed:true,modelUsed:true};},
        applyAttempt(current,attempt){
          effects.applyCalls+=1;
          const next=structuredClone(current);
          if(attempt.evidenceClass!=="NON_EVIDENCE"){next.evidenceCount+=1;next.practiceCount+=1;}
          return {state:next,effects:[]};
        }
      };
      function save(){effects.saves+=1;return effects.saveResults.length?effects.saveResults.shift():true;}
      function raiseWarning(message){effects.warnings.push(String(message));}
      function tutorialAvailable(){return true;}
      function tutorialPlan(){return {sourceQuestionId:"question-1",example:{questionId:"example-1"}};}
      function render(){effects.renders+=1;}
      function renderPlayAndFocus(selector){effects.focuses.push(selector);}
      function speak(value){effects.speeches.push(String(value));}
      function tutorialStepSpeech(){return "Tutorial step one";}
      function announce(value){effects.announcements.push(String(value));}
      function s(value){return value;}
    `,
    functions: ["restoreTutorialOpenCheckpoint", "commitPendingAttempt", "openTutorial"],
    exposed: "state:()=>state,ui:()=>ui,effects,commitPendingAttempt,openTutorial",
    context: { effects },
  });
  return harness;
}

test("tutorial assistance commits a pending attempt once without evidence and rolls back on save failure", () => {
  const direct = createTutorialCommitHarness();
  const first = direct.commitPendingAttempt({ assisted: true });
  assert.equal(first.ok, true);
  assert.equal(first.changed, true);
  assert.equal(direct.effects.applyCalls, 1);
  assert.equal(direct.effects.suppressed, 1);
  assert.equal(direct.effects.saves, 1);
  assert.equal(direct.state().evidenceCount, 0);
  assert.equal(direct.state().practiceCount, 0);
  assert.equal(direct.state().feedbackHistory.length, 1);
  assert.equal(direct.ui().lastAttempt.evidenceClass, "NON_EVIDENCE");
  assert.equal(direct.ui().attemptCommitted, true);
  const repeated = direct.commitPendingAttempt({ assisted: true });
  assert.equal(repeated.ok, true);
  assert.equal(repeated.changed, false);
  assert.equal(direct.effects.applyCalls, 1, "a pending attempt must not be committed twice");

  const opened = createTutorialCommitHarness();
  assert.equal(opened.openTutorial(), true);
  assert.equal(opened.effects.applyCalls, 1);
  assert.equal(opened.state().evidenceCount, 0);
  assert.equal(opened.state().practiceCount, 0);
  assert.equal(opened.state().feedbackHistory.length, 1);
  assert.equal(opened.ui().phase, "question");
  assert.equal(opened.ui().tutorialOpen, true);
  assert.equal(opened.ui().tutorialStep, 1);
  assert.equal(opened.ui().hintUsed, true);
  assert.equal(opened.ui().attemptCommitted, true);
  assert.equal(opened.ui().lastAttempt, null);

  const rollback = createTutorialCommitHarness({ saveResults: [false] });
  const beforeState = JSON.parse(JSON.stringify(rollback.state()));
  const beforeUi = JSON.parse(JSON.stringify(rollback.ui()));
  assert.equal(rollback.openTutorial(), false);
  assert.deepEqual(JSON.parse(JSON.stringify(rollback.state())), beforeState);
  assert.deepEqual(JSON.parse(JSON.stringify(rollback.ui())), beforeUi);
  assert.equal(rollback.effects.applyCalls, 1, "the attempted transaction must exercise the real pending commit");
  assert.equal(rollback.effects.saves, 1);
  assert.equal(rollback.effects.renders, 1);
});

test("duration comparison vectors and tracks are first-party, proportional, and event-specific", () => {
  const harness = evaluateHarness({
    prelude: `
      const escape=(value)=>String(value).replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
      const rationalNumber=(value)=>Number(value);
    `,
    functions: ["durationEventGlyphHtml", "durationEventVisualHtml"],
    exposed: "durationEventGlyphHtml,durationEventVisualHtml",
  });
  const events = ["song", "game", "hand wash", "story", "snack", "walk"];
  const glyphs = events.map((event) => harness.durationEventGlyphHtml(event));
  assert.equal(new Set(glyphs).size, events.length);
  assert.ok(glyphs.every((glyph) => /^<svg[\s\S]+<\/svg>$/u.test(glyph)));
  assert.ok(glyphs.every((glyph) => !/<(?:img|use)\b|https?:|data:/iu.test(glyph)));
  const short = harness.durationEventVisualHtml({ event: "song", magnitude: 2, maxMagnitude: 10 });
  const long = harness.durationEventVisualHtml({ event: "game", magnitude: 10, maxMagnitude: 10 });
  assert.match(short, /data-duration-magnitude="2"/u);
  assert.match(short, /width:20\.000%/u);
  assert.match(long, /data-duration-magnitude="10"/u);
  assert.match(long, /width:100\.000%/u);
  assert.match(short, />2 min</u);
  assert.match(long, />10 min</u);
});
