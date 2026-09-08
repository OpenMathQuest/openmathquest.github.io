(function installMathQuestPwaStatus(root){
  "use strict";
  const stay=" Stay online until offline setup finishes.",verified=" The current verified offline version remains available.",pair=prefix=>[prefix+stay,prefix+verified];
  const phaseMessages={CACHING:pair("A candidate update is caching."),CHECKING:pair("Checking for an update."),ERROR:["The update needs attention. Stay online and retry after offline setup finishes.","The update needs attention."+verified],READY:"A verified update is ready. Apply it only from Home or the Grown-ups corner.",RELOAD_PENDING:"Verified offline files are active. Reload this tab from Home or the Grown-ups corner when you are ready; it will not reload by itself."};
  const readinessMessages={CACHING:"Caching app files — stay online until setup finishes",ONLINE_ONLY:"Online only",READY:"Ready for an offline check",RECOVERY:"Recovery needed"};
  const fields=["type","release","buildId","cacheIdentity","requiredPaths","workerState","checkedAt","ready"];
  function exact(v,k){return Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));}
  function envelope(p,c,k){return ![p.type===c.expectedType,p.release===c.release,p.buildId===c.buildId,p.cacheIdentity===c.cacheIdentity,exact(p,k),Array.isArray(p.requiredPaths),p.requiredPaths?.length===c.requiredPaths.length,["active","waiting","installing"].includes(p.workerState),typeof p.checkedAt==="string",p.checkedAt?.length<=40,c.expectedWorkerState===null||p.workerState===c.expectedWorkerState,c.activationChallenge===null||(/^[a-f0-9]{64}$/.test(c.activationChallenge)&&p.activationChallenge===c.activationChallenge)].includes(false);}
  function validItem(i){return i&&typeof i==="object"&&exact(i,["path","ready"])&&typeof i.path==="string"&&typeof i.ready==="boolean";}
  function collect(p,c){const m=new Map();for(const i of p.requiredPaths){if(!validItem(i)||m.has(i.path))return null;m.set(i.path,i.ready);}const all=[...m.values()].every(Boolean);if([m.size===c.requiredPaths.length,c.requiredPaths.every(x=>m.has(x)),typeof p.ready==="boolean",p.ready===all].includes(false))return null;return m;}
  function fresh(s,n){const checked=Date.parse(s),elapsed=Math.abs(n-checked);return Number.isFinite(checked)&&elapsed<=600000;}
  function record(p,c,m,k){return Object.fromEntries(k.map(x=>[x,x==="requiredPaths"?c.requiredPaths.map(y=>({path:y,ready:m.get(y)})):p[x]]));}
  function validateReadiness(p,c){if(!c||!Array.isArray(c.requiredPaths)||typeof c.now!=="function")return null;if(!p||typeof p!=="object")return null;const k=c.activationChallenge===null?fields:[...fields,"activationChallenge"];if(!envelope(p,c,k)||!fresh(p.checkedAt,c.now()))return null;const m=collect(p,c);return m?record(p,c,m,k):null;}
  function updateStatusText(state){if(!state)return "";if(state.applying)return state.applyAcknowledged?"This tab is finishing the verified update and will reload. Other open Math Quest tabs are never forced to reload; close and reopen or reload them yourself.":"Requesting verified update activation.";const message=phaseMessages[state.updatePhase];return Array.isArray(message)?message[state.verified?1:0]:message||"";}
  function readinessStatusText(phase){return readinessMessages[phase]||"Not controlled — stay online and reload";}
  root.MathQuestPwaStatus=Object.freeze({readinessStatusText,updateStatusText,validateReadiness});
})(globalThis);
