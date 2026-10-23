// Math Quest teaching displays. MIT; see LICENSE.
(function installMathQuestTeachingDisplay(root){
"use strict";
function multiplicationDisplay(m,q){
if(m.type!=="visualPrompt"||m.values.kind!=="arithmeticSets")return m;
const next=structuredClone(m),p=q.params,groups=Number(p.groups??p.a),perGroup=Number(p.perGroup??p.b);
if(q.inputMethod!=="GROUP_BUILD")return m;
next.values.items=Array.from({length:groups},(_,index)=>({...m.values.items[0],label:"group "+(index+1),magnitude:perGroup}));return next;
}
function informalMeasureDisplay(m){const next=structuredClone(m);if(next.values?.items?.[0])next.values.items[0].wholeMarks=true;return next;}
function symmetryDisplay(m,q){const next=structuredClone(m);if(next.values?.items?.[0])next.values.items[0].shownLineIds=q.params.shownLineIds;return next;}
function fractionDivisionDisplay(m,q,{worked=false}={}){const next=structuredClone(m),v=next.values;v.groups=Number(q.params.divisor);delete v.perGroup;delete v.remainder;if(worked)v.perGroup=String(q.answer.value);return next;}
function decimalDisplay(m,q,{worked=false}={}){return worked?m:{...m,values:{...m.values,representations:m.values.representations.filter(x=>x.role!=="decimal").map(x=>({...x,label:null})),relation:""}};}
const DISPLAY_MODEL_ADAPTERS={"question.decimal":decimalDisplay,"question.multiplication":multiplicationDisplay,"question.appliedMultiplication":multiplicationDisplay,"question.informalMeasure":informalMeasureDisplay,"question.symmetryComplete":symmetryDisplay,"question.remainderFraction":fractionDivisionDisplay};
function displayModelDescriptor(m,q,options={}){if(!m||!q)return m;const adapt=DISPLAY_MODEL_ADAPTERS[q.semanticPromptStringId];return adapt?adapt(m,q,options):m;}
function arraySummaryFacts({total,rows,columns,groups,perGroup,remainder},v){return [["total",total],["rows",rows],["columns",columns],["groups",groups],["in each group",perGroup??(v.interpretation==="fraction"?v.perGroup??null:null)],["remainder",Number.isFinite(remainder)&&remainder?remainder:null]].filter(([,value])=>value!==null);}
function discreteGraphHtml(values,{escape}){
const data=values.data,series=values.items[0]?.series||data.series||{},rows=Object.entries(series),tally=String(data.display||"").toLowerCase()==="tally";
return `<div class="source-display-model"><div class="graph-source" aria-label="Source response cards">${data.responses.map(value=>`<span data-source-response="${escape(value)}">${escape(value)}</span>`).join("")}</div><div class="discrete-display" role="group" aria-label="One mark for each response">${rows.map(([label,count])=>`<div class="discrete-display-row"><strong>${escape(label)}</strong><span class="discrete-marks" aria-label="${Number(count)} ${escape(label)}">${Array.from({length:Number(count)},()=>`<span class="discrete-mark" aria-hidden="true">${tally?"│":"●"}</span>`).join("")}</span></div>`).join("")}</div></div>`;
}
function graphSeriesRows(values,{rationalNumber}){
const items=values.items||[],data=values.data,series=items[0]?.series??(Array.isArray(data)?data:Array.isArray(data?.values)?data.values:null),entries=Array.isArray(series)?series.map((value,index)=>[String(index+1),value]):series&&typeof series==="object"?Object.entries(series):[];
return entries.map(([label,value])=>[label,rationalNumber(value)]).filter(([,value])=>Number.isFinite(value));
}
function continuousGraphHtml(values,context){
const {escape,categoryIconHtml}=context,rows=graphSeriesRows(values,context),max=Math.max(1,...rows.map(([,value])=>Math.abs(value))),scale=values.items?.[0]?.scale;if(!rows.length)return "";
return `<div class="visual-item" data-visual-kind="graph"><div class="graph-visual" aria-hidden="true">${rows.map(([label,number])=>`<span><i class="graph-bar" style="display:block;height:${Math.max(10,Math.abs(number)/max*70).toFixed(2)}px"></i><b class="graph-category-label">${categoryIconHtml(label)||escape(label)}</b></span>`).join("")}</div>${scale?`<span class="model-label">Scale: ${escape(scale)} per symbol</span>`:""}</div>`;
}
function graphDisplayHtml(values,context){return Array.isArray(values.data?.responses)&&values.data.responses.length?discreteGraphHtml(values,context):continuousGraphHtml(values,context);}
root.MathQuestTeachingDisplay=Object.freeze({displayModelDescriptor,arraySummaryFacts,graphDisplayHtml});
})(globalThis);
