import vm from "node:vm";

function* themedVisualQuestions(engine, options) {
  for (const theme of ["ocean", "forest", "space"]) {
    for (let ordinal = 0; ordinal < 32; ordinal += 1) {
      yield engine.makeQuestion({ ...options, theme, ordinal, eligibleQuestionOrdinal: ordinal, seed: 0x4d515558 });
    }
  }
}

export function* assessedVisualQuestions(engine, skillIds) {
  for (const skillId of skillIds) {
    for (const tier of ["EASY", "HARD/TARGET"]) {
      for (const representation of ["CONCRETE", "PICTORIAL", "ABSTRACT"]) {
        yield* themedVisualQuestions(engine, { skillId, tier, representation });
      }
    }
  }
}

export function visualStimulusHarness(extractFunction) {
  const source = `(()=>{
    "use strict";
    const MODEL_FAMILIES=new Set(["attributeSet","comparison","numberBond","tenFrame","array","fractionPair","placeValue","numberLine","proportionalBar","areaGrid","clockSpan","visualPrompt"]);
    const escape=value=>String(value).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const roleLabel=value=>String(value??"").replace(/([a-z])([A-Z])/g,"$1 $2").replace(/[_-]+/g," ").trim();
    const s=(id,slots={})=>({
      "aria.mathModel":"Math model",
      "aria.objectGroup":"Objects in the group: "+slots.items+".",
      "aria.patternSequence":"Pattern, from left to right: "+slots.items+".",
      "aria.numberCards":"Number cards: "+slots.items+".",
      "aria.hiddenFrame":"Ten-cell frame. Showing: "+slots.items+". The remaining cells are covered.",
      "aria.tenFrameCells":"Ten-frame cells, from left to right: "+slots.cells+"."
    })[id]||id;
    function patternTokenName(value){return ({"●":"circle","▲":"triangle","■":"square","◆":"diamond"})[String(value)]||String(value);}
    const E={CONSTANTS:{READABLE_PROBLEM_TEXT_FROM_LEVEL:8},makeTeachingSupport(question){return question.support;}};
    const displayPrompt=q=>escape(q.prompt);
    let ui={screen:"session",phase:"question",question:{prompt:"Pair every shell with one shell."}};
    function questionSpeechText(){return ui.question.prompt;}
    ${extractFunction("modelOperandDescription")}
    ${extractFunction("repeatedStimulusItems")}
    ${extractFunction("clockHandStimulusDescription")}
    ${extractFunction("unlabelledTickRunDescription")}
    ${extractFunction("stimulusOperandDescription")}
    ${extractFunction("semanticModel")}
    ${extractFunction("workedTeachingDescriptor")}
    ${extractFunction("workedResultText")}
    ${extractFunction("teachingSupportSpeech")}
    ${extractFunction("durationEvidenceSpeech")}
    ${extractFunction("replayText")}
    return {modelOperandDescription,stimulusOperandDescription,semanticModel,workedTeachingDescriptor,teachingSupportSpeech,durationEvidenceSpeech,replayText};
  })()`;
  return new vm.Script(source, {
    filename: "math-quest-complete-visual-operands.js",
  }).runInNewContext({ structuredClone });

}
