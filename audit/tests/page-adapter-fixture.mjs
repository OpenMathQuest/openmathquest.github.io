import assert from "node:assert/strict";

export const BETA1_MIGRATION_PRELUDE = `
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
    `;

export const UPDATE_APPLY_PRELUDE = `
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
    `;

export function updateBoundaryPrelude(retryBody, homeCheckBody) {
  return `
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
    `;
}

class MockFile {
  constructor(parts, name, options) {
    this.parts = parts;
    this.name = name;
    this.type = options.type;
    this.lastModified = options.lastModified;
  }
}

export function backupExportBrowser(effects, shareResult) {
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
  return { File: MockFile, document, navigator, URL: urlApi };
}
