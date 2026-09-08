export function realPlacementPrelude(semanticResponseMethods) {
  return `
      const PLACEMENT_DRAFT_SCHEMA=4,PLACEMENT_DRAFT_MAX_CHARACTERS=262144;
      const placementDraftUiKeys=Object.freeze(["world","phase","questionId","selected","entry","fractionParts","modelCells","responseState","responseKind","feedbackKind"]);
      ${semanticResponseMethods}
      function realmClone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
      const engine=effects.engine;
      const E=new Proxy({},{get(_target,key){
        if(key==="createResponseState")return question=>realmClone(engine.createResponseState(question));
        if(key==="serializeResponse")return (question,responseState)=>{const payload=realmClone(engine.serializeResponse(question,responseState));effects.serialized.push(structuredClone(payload));return payload;};
        if(key==="submitPlacementAnswer")return (run,answer)=>{effects.submitted.push(structuredClone(answer));return engine.submitPlacementAnswer(run,answer);};
        const value=Reflect.get(engine,key,engine);return typeof value==="function"?value.bind(engine):value;
      }});
      const state=realmClone(effects.state);
      const initialRun=effects.run?realmClone(effects.run):null,initialQuestion=effects.question?realmClone(effects.question):null;
      let persistedPlacementDraftBytes=effects.bytes,placementNotice="";
      let ui=initialRun?{
        screen:"placement",world:initialRun.theme,session:null,grownTab:"placement",phase:"question",placementRun:initialRun,
        question:initialQuestion,placementCorrect:null,placementFeedbackKind:null,placementRecommendation:null,selected:null,entry:"",
        fractionParts:{whole:"",numerator:"",denominator:""},modelCells:[],
        responseState:effects.responseState===undefined?E.createResponseState(initialQuestion):realmClone(effects.responseState),
        modelTouched:false,hintUsed:false,selectionEvents:[],selectionRestored:false,feedback:null,lastAttempt:null
      }:{
        screen:"grown",world:"ocean",session:null,grownTab:"placement",phase:"question",placementRun:null,question:null,
        placementCorrect:null,placementFeedbackKind:null,placementRecommendation:null,selected:null,entry:"",
        fractionParts:{whole:"",numerator:"",denominator:""},modelCells:[],responseState:{},modelTouched:false,hintUsed:false,
        selectionEvents:[],selectionRestored:false,feedback:null,lastAttempt:null
      };
      const app={querySelector(){return {focus(){effects.outcomeFocuses+=1;}};}};
      function savePlacementDraft(){const bytes=placementDraftBytes();if(bytes===null)return false;persistedPlacementDraftBytes=bytes;effects.saved.push(bytes);placementNotice="";return true;}
      function removePlacementDraft(){effects.removals+=1;persistedPlacementDraftBytes=null;return true;}
      function cancelSpeech(){effects.cancelledSpeech+=1;}
      function stopSounds(){effects.stoppedSounds+=1;}
      function playSound(name){effects.sounds.push(name);}
      function render(){effects.renders+=1;}
      function focusColdStartTarget(){effects.coldFocuses+=1;}
      function speak(value){effects.spoken.push(value);}
      function questionSpeechText(){return "Question "+String(ui.question?.questionId||"");}
      function announce(value){effects.announcements.push(value);}
      function focusFeedbackOutcome(){effects.outcomeFocuses+=1;return true;}
      function placementFeedbackText(){return ui.placementFeedbackKind==="correct"?"Correct.":"Not correct.";}
      function save(){effects.mainWrites+=1;return true;}
      function setResponse(value){
        if(ui.question.inputClass==="SELECTION")ui.selected=String(value.optionId);
        else if(SEMANTIC_RESPONSE_METHODS.has(ui.question.inputMethod))ui.responseState=realmClone(value);
        else ui.entry=String(value);
      }
      function status(){return {ui:structuredClone(ui),state:structuredClone(state),bytes:persistedPlacementDraftBytes,notice:placementNotice};}
    `;
}

export const PLACEMENT_SPEECH_PRELUDE = `
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
    `;

export const PLACEMENT_START_SPEECH_PRELUDE = `
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
    `;

export const PLACEMENT_NEXT_SPEECH_PRELUDE = `
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
    `;

export const PLACEMENT_RECOVERY_RESET_PRELUDE = `
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
    `;

export const PLACEMENT_RECOVERY_APPLY_PRELUDE = `
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
    `;
