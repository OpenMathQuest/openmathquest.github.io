import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { extractEngine, evaluateEngine } from "../lib/engine-loader.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const indexPath = path.join(root, "index.html");
const page = readFileSync(indexPath, "utf8");
const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/giu)]
  .map((match) => match[1]);
assert.equal(scripts.length, 2, "the shipped page must retain its engine and adapter scripts");
const adapter = scripts[1];
const auditPage = readFileSync(path.join(root, "audit.html"), "utf8");
const approvedVisualSource = readFileSync(path.join(root, "audit", "approved-visual-regression.js"), "utf8");
const extracted = await extractEngine(indexPath);
const E = evaluateEngine(extracted.source);

function matchingDelimiter(source, openIndex, open, close) {
  assert.equal(source[openIndex], open);
  const modes = [{ type: "code", templateExpression: false, braceDepth: 0 }];
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    const mode = modes.at(-1);

    if (mode.type === "template") {
      if (character === "\\") {
        index += 1;
      } else if (character === "`") {
        modes.pop();
      } else if (character === "$" && next === "{") {
        if (open === "{") depth += 1;
        modes.push({ type: "code", templateExpression: true, braceDepth: 1 });
        index += 1;
      }
      continue;
    }
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
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "`") {
      modes.push({ type: "template" });
      continue;
    }

    if (character === open) {
      depth += 1;
      if (mode.templateExpression && open === "{") mode.braceDepth += 1;
    }
    if (character === close) {
      depth -= 1;
      if (mode.templateExpression && close === "}") {
        mode.braceDepth -= 1;
        if (mode.braceDepth === 0) modes.pop();
      }
      if (depth === 0) return index;
    }
  }
  throw new Error(`unclosed ${open}${close} delimiter`);
}

function extractFunctionFrom(source, name) {
  const expression = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "gu");
  const matches = [...source.matchAll(expression)];
  assert.equal(matches.length, 1, `${name} must have one shipped declaration`);
  const start = matches[0].index;
  const parametersStart = source.indexOf("(", start);
  const parametersEnd = matchingDelimiter(source, parametersStart, "(", ")");
  const bodyStart = source.indexOf("{", parametersEnd);
  const bodyEnd = matchingDelimiter(source, bodyStart, "{", "}");
  return source.slice(start, bodyEnd + 1);
}

const extractFunction = (name) => extractFunctionFrom(adapter, name);

function evaluateHarness({ prelude = "", functions = [], body = "", exposed, context = {} }) {
  const source = `(()=>{
    "use strict";
    ${prelude}
    ${functions.map(extractFunction).join("\n")}
    ${body}
    return {${exposed}};
  })()`;
  return new vm.Script(source, { filename: "holistic-child-ux-page-effects.js" })
    .runInNewContext(context);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function makeQuestion(skillId, options = {}) {
  const ordinal = Number(options.ordinal ?? 0);
  return E.makeQuestion({
    skillId,
    seed: 0x4d515558,
    ordinal,
    eligibleQuestionOrdinal: ordinal,
    tier: "HARD/TARGET",
    representation: "PICTORIAL",
    theme: "ocean",
    ...options,
  });
}

function findGeneratedQuestion(predicate) {
  for (const skill of E.SKILLS) {
    for (const representation of ["CONCRETE", "PICTORIAL", "ABSTRACT"]) {
      for (let ordinal = 0; ordinal < 8; ordinal += 1) {
        const question = makeQuestion(skill.skillId, { ordinal, representation });
        if (predicate(question)) return question;
      }
    }
  }
  return null;
}

const styleSource = [...page.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/giu)]
  .map((match) => match[1])
  .join("\n");

function cssRules(source) {
  const rows = [];
  const leafRule = /([^{}]+)\{([^{}]*)\}/gu;
  let order = 0;
  for (const match of source.matchAll(leafRule)) {
    const selectorText = match[1].trim();
    if (!selectorText || selectorText.startsWith("@")) continue;
    const declarations = [];
    for (const part of match[2].split(";")) {
      const colon = part.indexOf(":");
      if (colon < 1) continue;
      const property = part.slice(0, colon).trim().toLowerCase();
      let value = part.slice(colon + 1).trim();
      const important = /\s*!important\s*$/iu.test(value);
      value = value.replace(/\s*!important\s*$/iu, "").trim();
      declarations.push({ property, value, important });
    }
    for (const selector of selectorText.split(",")) {
      rows.push({ selector: selector.trim(), declarations, order });
    }
    order += 1;
  }
  return rows;
}

const shippedCssRules = cssRules(styleSource);

function fixture(tag, { classes = [], attributes = {}, parent = null } = {}) {
  return {
    tag: String(tag).toLowerCase(),
    classes: new Set(classes),
    attributes: new Map(Object.entries(attributes).map(([key, value]) => [
      key.toLowerCase(),
      String(value),
    ])),
    parent,
  };
}

function selectorParts(selector) {
  if (/[:+~]/u.test(selector)) return null;
  const tokens = selector.replace(/>/gu, " > ").trim().split(/\s+/u).filter(Boolean);
  const compounds = [];
  const combinators = [];
  let pending = null;
  for (const token of tokens) {
    if (token === ">") {
      pending = ">";
      continue;
    }
    if (compounds.length) combinators.push(pending || " ");
    compounds.push(token);
    pending = null;
  }
  return pending || !compounds.length ? null : { compounds, combinators };
}

function compoundMatches(element, compound) {
  const attributes = [...compound.matchAll(/\[([^\]]+)\]/gu)];
  for (const match of attributes) {
    const expression = match[1].trim();
    const equality = expression.match(/^([\w-]+)\s*=\s*["']?([^"']+)["']?$/u);
    if (equality) {
      if (element.attributes.get(equality[1].toLowerCase()) !== equality[2]) return false;
    } else if (!/^[\w-]+$/u.test(expression)
      || !element.attributes.has(expression.toLowerCase())) {
      return false;
    }
  }
  for (const match of compound.matchAll(/#([\w-]+)/gu)) {
    if (element.attributes.get("id") !== match[1]) return false;
  }
  for (const match of compound.matchAll(/\.([\w-]+)/gu)) {
    if (!element.classes.has(match[1])) return false;
  }
  const residual = compound
    .replace(/\[[^\]]+\]/gu, "")
    .replace(/#[\w-]+/gu, "")
    .replace(/\.[\w-]+/gu, "")
    .replace(/\*/gu, "")
    .trim();
  return !residual || residual.toLowerCase() === element.tag;
}

function selectorMatches(element, selector) {
  const parsed = selectorParts(selector);
  if (!parsed) return false;
  const { compounds, combinators } = parsed;
  function visit(candidate, index) {
    if (!candidate || !compoundMatches(candidate, compounds[index])) return false;
    if (index === 0) return true;
    if (combinators[index - 1] === ">") return visit(candidate.parent, index - 1);
    for (let ancestor = candidate.parent; ancestor; ancestor = ancestor.parent) {
      if (visit(ancestor, index - 1)) return true;
    }
    return false;
  }
  return visit(element, compounds.length - 1);
}

function specificity(selector) {
  const idCount = (selector.match(/#[\w-]+/gu) || []).length;
  const classCount = (selector.match(/\.[\w-]+|\[[^\]]+\]/gu) || []).length;
  const parsed = selectorParts(selector);
  const elementCount = parsed
    ? parsed.compounds.filter((compound) => {
      const residual = compound
        .replace(/\[[^\]]+\]/gu, "")
        .replace(/#[\w-]+/gu, "")
        .replace(/\.[\w-]+/gu, "")
        .replace(/\*/gu, "")
        .trim();
      return Boolean(residual);
    }).length
    : 0;
  return [idCount, classCount, elementCount];
}

function compareSpecificity(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function computedDeclaration(element, property) {
  let winner = null;
  for (const rule of shippedCssRules) {
    if (!selectorMatches(element, rule.selector)) continue;
    const weight = specificity(rule.selector);
    for (const declaration of rule.declarations) {
      if (declaration.property !== property) continue;
      const candidate = { ...declaration, specificity: weight, order: rule.order, selector: rule.selector };
      if (!winner
        || Number(candidate.important) > Number(winner.important)
        || (candidate.important === winner.important
          && (compareSpecificity(candidate.specificity, winner.specificity) > 0
            || (compareSpecificity(candidate.specificity, winner.specificity) === 0
              && candidate.order >= winner.order)))) {
        winner = candidate;
      }
    }
  }
  return winner;
}

function openingTagById(html, id) {
  const match = String(html).match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`, "u"));
  assert.ok(match, `expected an opening tag with id=${id}`);
  return match[0];
}

test("QA-007: ordinary questions open directly and MQ-048 uses answer-free original practice tokens", () => {
  const skill = E.SKILL_BY_ID["MQ-048"];
  assert.equal(skill.title, "Match Canadian Practice Tokens to Values");
  assert.doesNotMatch(skill.objective, /authentic|coin faces?|official artwork/iu);
  assert.equal([...skill.phases].join(","), "P");
  assert.equal(skill.representation, "pictures-and-symbols");

  const expectedTokenByValue = new Map([
    ["5¢", "single-dot"],
    ["10¢", "double-stripe"],
    ["25¢", "triangle-dots"],
    ["$1", "cross-bars"],
    ["$2", "ring-diamond"],
  ]);
  const expectedTaskByValue = new Map([
    ["5¢", "match-practice-token-5-cents"],
    ["10¢", "match-practice-token-10-cents"],
    ["25¢", "match-practice-token-25-cents"],
    ["$1", "match-practice-token-1-dollar"],
    ["$2", "match-practice-token-2-dollars"],
  ]);
  const seenValues = new Set();
  const seenTaskTypes = new Set();
  for (const tier of ["EASY", "HARD/TARGET"]) {
    for (let ordinal = 0; ordinal < 32; ordinal += 1) {
        const question = makeQuestion("MQ-048", { ordinal, tier, representation: "PICTORIAL" });
        const item = question.modelDescriptor.values.items[0];
        assert.equal(question.taskType, expectedTaskByValue.get(question.answer.value));
        assert.equal(question.semanticPromptStringId, "question.coinValue");
        assert.equal(question.prompt, "Which Canadian money value does this practice token stand for?");
        assert.equal(question.modelDescriptor.values.kind, "practiceMoney");
        assert.equal(question.modelDescriptor.values.data.tokenSetVersion, "practice-coins-v1");
        assert.equal(Object.hasOwn(question.modelDescriptor.values.data, "mode"), false,
          "the sanitized shipped descriptor must not depend on an obsolete presentation-mode field");
        assert.equal(item.kind, "practiceCoin");
        assert.equal(item.tokenId, expectedTokenByValue.get(question.answer.value));
        assert.equal(item.tokenId, question.params.tokenId);
        assert.equal(item.label, question.params.tokenName);
        assert.equal(Object.hasOwn(item, "cents"), false);
        assert.equal(Object.hasOwn(item, "value"), false);
        assert.doesNotMatch(item.label, /[0-9¢$]/u);
        assert.equal(question.answer.kind, "text");
        assert.equal(question.options.length, 5);
        assert.equal(question.options.some((option) => option.value === question.answer.value), true);
        assert.equal(new Set(question.options.map((option) => option.value)).size, question.options.length);
        assert.deepEqual(new Set(question.options.map((option) => option.value)), new Set(expectedTokenByValue.keys()));
        assert.equal(question.options.every((option) => /^(?:\d+¢|\$\d+)$/u.test(option.label)), true);
        seenValues.add(question.answer.value);
        seenTaskTypes.add(question.taskType);
    }
  }
  assert.deepEqual(seenValues, new Set(expectedTokenByValue.keys()));
  assert.deepEqual(seenTaskTypes, new Set(expectedTaskByValue.values()));

  const practiceMoneyOracle = approvedVisualSource.match(
    /if \(kind === "practiceMoney"\) \{([\s\S]*?)\n\s*\} else if \(\/money\/iu\.test\(kind\)\)/u,
  )?.[1];
  assert.ok(practiceMoneyOracle, "the approved visual oracle must retain its practice-money branch");
  assert.match(practiceMoneyOracle, /data\.tokenSetVersion === "practice-coins-v1"/u);
  assert.match(practiceMoneyOracle, /item\?\.kind === "practiceCoin"/u);
  assert.match(practiceMoneyOracle, /candidates\.length === 5/u);
  assert.doesNotMatch(practiceMoneyOracle, /data\.mode/u,
    "the oracle must validate governed token semantics rather than a stripped UI hint");
  assert.ok(
    approvedVisualSource.indexOf('if (kind === "practiceMoney")')
      < approvedVisualSource.indexOf('else if (/money/iu.test(kind))'),
    "the specific practice-token oracle must run before the generic cents-bearing money branch",
  );

  const visualContext = { window: {} };
  new vm.Script(approvedVisualSource, { filename: "approved-visual-regression.js" })
    .runInNewContext(visualContext);
  const visualContract = visualContext.window.MathQuestApprovedVisualRegression;
  assert.equal(typeof visualContract?.semanticVisualObligationKey, "function");
  const fixedVisualOracle = [
    { tokenId: "single-dot", value: "5\u00a2" },
    { tokenId: "double-stripe", value: "10\u00a2" },
    { tokenId: "triangle-dots", value: "25\u00a2" },
    { tokenId: "cross-bars", value: "$1" },
    { tokenId: "ring-diamond", value: "$2" },
  ];
  assert.deepEqual(
    Object.values(E.PRACTICE_COIN_TOKENS)
      .sort((left, right) => left.cents - right.cents)
      .map(({ tokenId, value }) => ({ tokenId, value })),
    fixedVisualOracle,
    "the public engine must expose one frozen authority for all five original token/value mappings",
  );
  assert.equal(Object.isFrozen(E.PRACTICE_COIN_TOKENS), true);
  assert.equal(Object.values(E.PRACTICE_COIN_TOKENS).every(Object.isFrozen), true);
  assert.deepEqual(
    Array.from(visualContract.practiceTokenVisualOracle, ({ tokenId, value }) => ({ tokenId, value })),
    fixedVisualOracle,
    "the visual matrix must retain the independent exact five-token/value oracle",
  );
  const tokenStateContract = visualContract.practiceTokenStateTokenContract;
  assert.equal(typeof tokenStateContract, "function");
  assert.equal(tokenStateContract("ordinary", "single-dot", ["single-dot"], []), true);
  assert.equal(tokenStateContract("incorrect", "single-dot", ["single-dot"], []), true);
  assert.equal(tokenStateContract("ordinary", "single-dot", ["double-stripe"], []), false,
    "ordinary and feedback states must retain the source token");
  assert.equal(tokenStateContract(
    "tutorial-notice", "single-dot", ["double-stripe"], ["double-stripe"],
  ), true, "the different-example tutorial must render one governed token different from the source");
  assert.equal(tokenStateContract(
    "tutorial-notice", "single-dot", ["single-dot"], ["single-dot"],
  ), false, "a tutorial that repeats the source token must fail");
  assert.equal(tokenStateContract(
    "tutorial-notice", "single-dot", ["unknown-token"], ["unknown-token"],
  ), false, "an ungoverned tutorial token must fail");
  assert.equal(tokenStateContract(
    "tutorial-notice", "single-dot", ["double-stripe", "triangle-dots"], ["double-stripe", "triangle-dots"],
  ), false, "a tutorial with more than one visual token cannot satisfy the singular example contract");
  const visualKeys = fixedVisualOracle.map(({ tokenId }) => visualContract.semanticVisualObligationKey({
    modelDescriptor: { type: "visualPrompt" },
    semanticPromptStringId: "question.coinValue",
    params: { tokenId },
  }));
  assert.deepEqual(visualKeys, fixedVisualOracle.map(({ tokenId }) => (
    `visualPrompt|question.coinValue|${tokenId}`
  )));
  assert.equal(new Set(visualKeys).size, fixedVisualOracle.length,
    "semantic visual obligations must not collapse the five token designs into one prompt row");
  const fixedViewports = [
    { viewport: "desktop", width: 1366, height: 768 },
    { viewport: "tablet-portrait", width: 820, height: 1180 },
    { viewport: "ipad-landscape-large", width: 1180, height: 820 },
    { viewport: "ipad-landscape-standard", width: 1024, height: 768 },
    { viewport: "phone", width: 390, height: 844 },
  ];
  const fixedStates = ["ordinary", "tutorial-notice", "incorrect"];
  const expectedVisualObligations = fixedVisualOracle.flatMap(({ tokenId, value }) => (
    fixedViewports.flatMap(({ viewport, width, height }) => fixedStates.map((state) => ({
      tokenId,
      value,
      viewport,
      width,
      height,
      state,
    })))
  ));
  const visualObligations = Array.from(
    visualContract.practiceTokenVisualObligations(),
    ({ tokenId, value, viewport, width, height, state }) => (
      { tokenId, value, viewport, width, height, state }
    ),
  );
  assert.equal(visualObligations.length, 75);
  assert.deepEqual(visualObligations, expectedVisualObligations,
    "the governed visual contract must require every token in every viewport and child state");

  const practiceTokenSetSource = adapter.match(/const PRACTICE_COIN_TOKEN_IDS=new Set\([^;]+\);/u)?.[0];
  assert.ok(practiceTokenSetSource, "the adapter must expose its exact practice-token renderer allowlist to the effect harness");
  const { visualItemHtml: renderPracticeToken } = evaluateHarness({
    prelude: `
      ${practiceTokenSetSource}
      function escape(value){return String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));}
      function geometryVisualHtml(){return "";}
      function shapeName(){return "";}
      function shapeVisualHtml(){return "";}
    `,
    functions: ["visualItemHtml"],
    exposed: "visualItemHtml",
    context: { E },
  });
  for (const tokenId of expectedTokenByValue.values()) {
    const html = renderPracticeToken({ kind: "practiceCoin", tokenId, label: "practice token" }, "practiceMoney");
    assert.match(html, new RegExp(`data-practice-token="${tokenId}"`, "u"));
    assert.match(html, /practice-coin-token__mark/u);
    assert.doesNotMatch(html, /(?:5¢|10¢|25¢|\$1|\$2)/u);
  }
  assert.equal(renderPracticeToken({ kind: "practiceCoin", tokenId: "unknown", label: "practice token" }), "");

  const firstTokenQuestion = makeQuestion("MQ-048", {
    ordinal: 0,
    tier: "EASY",
    scaffolded: false,
    coldTest: false,
  });
  const activationHarness = evaluateHarness({
    prelude: `
      let state,ui;
      const effects={saved:0,rendered:0,served:0,spoken:[]};
      const now=()=>1000;
      function markServed(){effects.served+=1;}
      function save(){effects.saved+=1;return true;}
      function render(){effects.rendered+=1;}
      function focusColdStartTarget(){}
      function questionSpeechText(){return "question speech";}
      function practiceTokenGuideSpeech(){return "practice token guide speech";}
      function speak(text,callback){effects.spoken.push(String(text));if(callback)callback();}
      function configure(question,{acquisition="UNSEEN",evidence=[],screen="session"}={}){
        state={skills:{[question.skillId]:{acquisition,evidence:[...evidence]}}};
        ui={screen,question:null,choiceCandidates:[],selected:null,entry:"",fractionParts:{whole:"",numerator:"",denominator:""},modelCells:[],responseState:{},modelTouched:false,hintUsed:false,selectionEvents:[],selectionRestored:false,feedback:null,lastAttempt:null,isReteach:false,capstoneSubmitted:false,promptFinishedAt:0,replayMs:0,manipulationMs:0,manipulationStartedAt:0,idleStart:0,maxIdleMs:0,phase:"question"};
        effects.saved=0;effects.rendered=0;effects.served=0;effects.spoken=[];
      }
      function snapshot(){return {phase:ui.phase,question:ui.question,modelTouched:ui.modelTouched,acquisition:state.skills[ui.question.skillId].acquisition,effects:{saved:effects.saved,rendered:effects.rendered,served:effects.served,spoken:[...effects.spoken]}};}
    `,
    functions: ["activateQuestion"],
    exposed: "activateQuestion,configure,snapshot",
    context: { E },
  });
  activationHarness.configure(firstTokenQuestion);
  activationHarness.activateQuestion(firstTokenQuestion, { ordinal: 0 });
  const unseenActivation = activationHarness.snapshot();
  assert.equal(unseenActivation.phase, "practice-token-guide");
  assert.equal(unseenActivation.modelTouched, false);
  assert.equal(unseenActivation.question.scaffolded, false,
    "direct entry must not mutate the ordinary question contract");
  assert.equal(unseenActivation.acquisition, "LEARNING");
  assert.deepEqual(JSON.parse(JSON.stringify(unseenActivation.effects)), {
    saved: 1,
    rendered: 1,
    served: 1,
    spoken: ["practice token guide speech"],
  });
  activationHarness.configure(firstTokenQuestion, { acquisition: "PLACED" });
  activationHarness.activateQuestion(firstTokenQuestion, { ordinal: 0 });
  assert.equal(activationHarness.snapshot().phase, "practice-token-guide",
    "a placement-inferred skill with no real evidence must still receive the one-time token legend");
  activationHarness.configure(firstTokenQuestion, { acquisition: "PRACTISING", evidence: [{ recordId: "prior" }] });
  activationHarness.activateQuestion(firstTokenQuestion, { ordinal: 0 });
  assert.equal(activationHarness.snapshot().phase, "question",
    "the guide must not repeat after a real MQ-048 attempt has been recorded");
  const previewQuestion = makeQuestion("MQ-048", { ordinal: 0, tier: "EASY", preview: true, coldTest: false });
  activationHarness.configure(previewQuestion);
  activationHarness.activateQuestion(previewQuestion, { ordinal: 0 });
  assert.equal(activationHarness.snapshot().phase, "question",
    "preview and Parent Test paths must open directly as answerable questions");
  const capstoneQuestion = makeQuestion("MQ-048", { ordinal: 0, tier: "EASY", capstone: true, scaffolded: true, coldTest: false });
  activationHarness.configure(capstoneQuestion);
  activationHarness.activateQuestion(capstoneQuestion, { ordinal: 0 });
  assert.equal(activationHarness.snapshot().phase, "question");
  activationHarness.configure(firstTokenQuestion);
  activationHarness.activateQuestion(firstTokenQuestion, { ordinal: 0 }, { reteach: true });
  assert.equal(activationHarness.snapshot().phase, "reteach");

  for (const concreteSkill of E.SKILLS.filter((candidate) => candidate.phases.includes("C"))) {
    const question = makeQuestion(concreteSkill.skillId, {
      ordinal: 0,
      tier: "EASY",
      representation: "CONCRETE",
      scaffolded: false,
      coldTest: false,
    });
    activationHarness.configure(question);
    activationHarness.activateQuestion(question, { ordinal: 0 });
    assert.equal(
      activationHarness.snapshot().phase,
      "question",
      `${concreteSkill.skillId} must open directly without a grown-up acknowledgement gate`,
    );
  }
  const guideHarness = evaluateHarness({
    prelude: `
      function s(id){return id==="ritual.open"?"Let’s look together":id==="ui.ready"?"Ready":id;}
      function escape(value){return String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));}
      function accessibleOptionLabel(option){return String(option.label);}
      function visualItemHtml(item){return '<span class="practice-coin-token" data-practice-token="'+escape(item.tokenId)+'"></span>';}
    `,
    functions: ["practiceTokenGuideItems", "practiceTokenGuideSpeech", "practiceTokenGuideHtml"],
    exposed: "practiceTokenGuideItems,practiceTokenGuideSpeech,practiceTokenGuideHtml",
    context: { E },
  });
  const guideItems = guideHarness.practiceTokenGuideItems(firstTokenQuestion);
  assert.deepEqual(
    JSON.parse(JSON.stringify(guideItems.map(({ tokenId, value }) => ({ tokenId, value })))),
    fixedVisualOracle,
    "the one-time legend must teach all five governed mappings exactly",
  );
  const guideHtml = guideHarness.practiceTokenGuideHtml(firstTokenQuestion);
  assert.equal((guideHtml.match(/role="listitem"/gu) || []).length, 5);
  assert.match(guideHtml, /data-action="practice-token-ready">Ready</u);
  assert.doesNotMatch(guideHtml, /question-response|data-action="select"|data-action="confirm"|Which Canadian money value/iu,
    "the legend must remain answer-free and separate from the assessed question");
  assert.match(guideHarness.practiceTokenGuideSpeech(firstTokenQuestion), /practice token/iu);

  for (const removedMarker of [
    "physicalTaskHtml",
    'data-action="physical-done"',
    "instruction.physical",
    "ui.physicalDone",
    "We made it",
  ]) {
    assert.equal(adapter.includes(removedMarker), false, `${removedMarker} must not remain in the shipped adapter`);
  }

  const guidedAttempt = E.submitAnswer(firstTokenQuestion, { optionId: firstTokenQuestion.options[firstTokenQuestion.correctIndex].optionId }, {
    promptFinishedAt: 100,
    submittedAt: 3100,
    manipulationMs: 0,
    replayMs: 0,
    idleMs: 0,
    hintUsed: false,
    selectionEvents: [{ optionId: firstTokenQuestion.options[firstTokenQuestion.correctIndex].optionId, at: 2000 }],
    sessionId: "mq048-guide",
    playDay: 1,
  });
  assert.equal(guidedAttempt.evidenceClass, "GUESS_PRONE_SELECTION",
    "the legend must not alter the existing mastery contract for the assessed question");
});

test("QA-033: the browser placement oracle submits valid complete responses for every adaptive boundary", () => {
  const visualContext = { window: {} };
  new vm.Script(approvedVisualSource, { filename: "approved-visual-regression.js" })
    .runInNewContext(visualContext);
  const visualContract = visualContext.window.MathQuestApprovedVisualRegression;
  const state = E.createInitialState(21_000);
  const traversal = visualContract.placementCases(E, state);
  assert.equal(traversal.rows.length, E.CONSTANTS.LEVEL_MAX - E.CONSTANTS.LEVEL_MIN + 1);
  assert.equal(traversal.rows.every((row) => row.pass), true,
    "the browser oracle must reach each expected placement recommendation without an invalid fixture response");

  const comparison = findGeneratedQuestion((question) => (
    question.inputMethod === "PAIR_LINK"
    && question.semanticPromptStringId === "question.compare"
  ));
  assert.ok(comparison, "a comparison PAIR_LINK question must remain reachable");
  const answer = visualContract.correctAnswer(E, comparison);
  assert.equal(answer.relation, comparison.answer.value,
    "the worked browser fixture must include the child-visible comparison decision introduced by the approved task redesign");
  const grade = E.gradeAnswer(comparison, answer);
  assert.equal(grade.valid, true);
  assert.equal(grade.correct, true);
  assert.equal(grade.canonical, E.canonical({
    links: answer.links.map((link) => [String(link[0]), String(link[1])]).sort(),
    relation: answer.relation,
  }));

  for (const question of [
    makeQuestion("MQ-063", { ordinal: 1, tier: "HARD/TARGET" }),
    makeQuestion("MQ-097", { ordinal: 2, tier: "HARD/TARGET" }),
  ]) {
    const workedAnswer = visualContract.correctAnswer(E, question);
    const workedGrade = E.gradeAnswer(question, workedAnswer);
    assert.equal(workedGrade.valid, true, `${question.skillId} browser response must satisfy its exact construction schema`);
    assert.equal(workedGrade.correct, true, `${question.skillId} browser response must exercise the governed correct result`);
  }
});

test("QA-008: action scenes separate the shown move from a real answer choice", () => {
  const actionQuestions = ["MQ-013", "MQ-014"].map((skillId) => (
    findGeneratedQuestion((question) => question.skillId === skillId && question.inputMethod === "ACTION_SCENE")
  ));
  const measureQuestion = findGeneratedQuestion((question) => question.inputMethod === "MEASURE_OBJECT");
  actionQuestions.forEach((question, index) => assert.ok(
    question,
    `${["joining", "leaving"][index]} ACTION_SCENE questions must remain reachable`,
  ));
  assert.ok(measureQuestion, "a generated MEASURE_OBJECT question must remain reachable");

  const harness = evaluateHarness({
    prelude: `
      function escape(value){return String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));}
      function questionModelHtml(){return "";}
      function themedObjectTokenHtml(noun){return '<i data-object-kind="'+escape(noun)+'"></i>';}
      function responseAction(mode,action,extra=""){return 'data-control-mode="'+mode+'" data-response-action="'+action+'" '+extra;}
      function s(id){return id==="aria.yourAnswer"?"Your answer":"Undo";}
    `,
    functions: ["directNumericConstructionHtml"],
    exposed: "directNumericConstructionHtml",
    context: { E },
  });

  for (const question of [...actionQuestions, measureQuestion]) {
    const controls = { responseState: E.createResponseState(question) };
    const rendered = String(harness.directNumericConstructionHtml(question, "play", controls));
    assert.match(
      rendered,
      /<button class="primary direct-action-button"[^>]*data-response-action="direct-action"/u,
      `${question.inputMethod} must emit the prominent direct-action control`,
    );
  }

  const directTask = fixture("div", { classes: ["direct-task", "action-scene-task"] });
  const actionButton = fixture("button", {
    classes: ["primary", "direct-action-button"],
    parent: directTask,
  });
  const colour = computedDeclaration(actionButton, "color");
  assert.ok(colour, "the direct primary action needs a resolved text colour");
  assert.equal(colour.value.toLowerCase(), "#fff");

  for (const actionQuestion of actionQuestions) {
    const specification = E.actionSceneSpecification(actionQuestion);
    assert.ok(specification.choices.length >= 3, "every action scene must offer at least three plausible result choices");
    const initial = E.createResponseState(actionQuestion);
    assert.equal(initial.value, "", "the scene must not preselect or calculate an answer");
    assert.equal(initial.actions.length, 0, "the scene must begin before any move is shown");
    const moved = {
      value: "",
      actions: Array.from({ length: specification.required }, () => specification.action),
    };
    const readyHtml = String(harness.directNumericConstructionHtml(actionQuestion, "play", {
      responseState: moved,
    }));
    assert.match(readyHtml, /class="action-scene-count"/u, "the current quantity must be visibly labelled");
    assert.match(readyHtml, /class="action-result-choices"/u, "the numerical answer choices appear after the move");
    assert.match(readyHtml, /data-response-action="action-value"/u, "answer selection must be independent of the move button");

    const wrong = specification.choices.find((value) => value !== specification.expected);
    assert.notEqual(wrong, undefined, "the displayed answer set must include an incorrect but plausible choice");
    const wrongGrade = E.gradeAnswer(actionQuestion, { ...moved, value: String(wrong) });
    assert.equal(wrongGrade.valid, true, "the incorrect displayed choice must be a valid submission");
    assert.equal(wrongGrade.correct, false, "the incorrect displayed choice must remain incorrect");
    assert.equal(
      E.gradeAnswer(actionQuestion, { ...moved, value: String(specification.expected) }).correct,
      true,
      "the separately selected correct result must still grade correctly",
    );
  }
});

test("QA-009: zero number-connection support works the answer and renders an explicit empty set", () => {
  let zeroQuestion = null;
  for (let ordinal = 0; ordinal < 256 && !zeroQuestion; ordinal += 1) {
    const question = makeQuestion("MQ-019", { ordinal });
    if (
      question.semanticPromptStringId === "question.numberConnection"
      && Number(question.answer.value) === 0
    ) zeroQuestion = question;
  }
  assert.ok(zeroQuestion, "the deterministic number-connection generator must exercise zero");
  const sourceCard = zeroQuestion.modelDescriptor.values.items
    .find((item) => item.kind === "numberCard");
  assert.match(String(sourceCard.label), /\?/u, "the unanswered model should retain its unknown");

  const teaching = E.makeTeachingSupport(zeroQuestion);
  const teachingCounter = teaching.values.items.find((item) => item.kind === "counterSet");
  const teachingCard = teaching.values.items.find((item) => item.kind === "numberCard");
  assert.equal(teaching.values.data.workedAnswer, "0");
  assert.equal(String(teachingCard.value), "0");
  assert.match(String(teachingCard.label), /→\s*0$/u);
  assert.doesNotMatch(String(teachingCard.label), /\?/u);

  const renderer = evaluateHarness({
    prelude: `
      function escape(value){return String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));}
      function shapeName(){return "";}
      function geometryVisualHtml(){return "";}
      function shapeVisualHtml(){return "";}
    `,
    functions: ["counterSetVisualHtml", "visualItemHtml"],
    exposed: "visualItemHtml",
  });
  const emptySetHtml = String(renderer.visualItemHtml(teachingCounter, "numberConnection"));
  assert.match(emptySetHtml, /class="counter-set-visual empty-set-counter"/u);
  assert.match(emptySetHtml, /aria-label="Empty set\. Zero objects\."/u);
  assert.match(emptySetHtml, /class="empty-set-mat"/u);
  assert.match(emptySetHtml, /<b aria-hidden="true">0<\/b>/u);

  const workedCardHtml = String(renderer.visualItemHtml(teachingCard, "numberConnection"));
  assert.match(workedCardHtml, /class="visual-number"[^>]*>[^<]*0/u);
  assert.doesNotMatch(workedCardHtml, /\?/u);
});

test("QA-010: choice replay speaks positional cues and both displayed prompts in order", () => {
  const candidates = E.makeQuestionChoices({
    skillId: "MQ-019",
    seed: 0x4d515558,
    ordinal: 0,
    eligibleQuestionOrdinal: 0,
    tier: "EASY",
    representation: "PICTORIAL",
    theme: "ocean",
  });
  assert.equal(candidates.length, 2, "the chosen fixture must produce two distinct candidates");

  const harness = evaluateHarness({
    prelude: `
      const ui={choiceCandidates:candidates};
      function escape(value){return String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));}
      const s=(id,slots={})=>renderChildString(id,slots);
    `,
    functions: ["displayPrompt", "choiceReplayText"],
    exposed: "choiceReplayText",
    context: { candidates, renderChildString: E.renderChildString },
  });
  const replay = String(harness.choiceReplayText());
  const firstCue = E.renderChildString("instruction.firstChoice", { prompt: candidates[0].prompt });
  const secondCue = E.renderChildString("instruction.secondChoice", { prompt: candidates[1].prompt });
  assert.ok(replay.indexOf(firstCue) >= 0, "the first displayed prompt must be spoken");
  assert.ok(replay.indexOf(secondCue) > replay.indexOf(firstCue), "the second prompt must follow the first");
  assert.equal(replay.split(candidates[0].prompt).length - 1, 1);
  assert.equal(replay.split(candidates[1].prompt).length - 1, 1);
  assert.doesNotMatch(replay, /\b(?:left|right)\s+(?:choice|card|question)\b/iu);
});

test("QA-011: one-to-one teaching support renders worked semantic pairs and unmatched objects", () => {
  const renderer = evaluateHarness({
    prelude: `
      function escape(value){return String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));}
      function iconSvg(icon){return '<svg data-icon="'+escape(icon)+'" aria-hidden="true"></svg>';}
    `,
    functions: ["pairGlyphHtml", "visualPromptBody"],
    exposed: "visualPromptBody",
  });
  const worlds = {
    ocean: { leftIcon: "ocean", rightKind: "shell" },
    forest: { leftIcon: "forest", rightKind: "water-drop" },
    space: { leftIcon: "space", rightKind: "moon" },
  };

  for (const [theme, expected] of Object.entries(worlds)) {
    for (const ordinal of [0, 1, 2]) {
      const question = makeQuestion("MQ-001", { theme, ordinal });
      const teaching = E.makeTeachingSupport(question);
      const pairs = Math.min(
        Number(question.params.leftCount),
        Number(question.params.rightCount),
      );
      assert.equal(teaching.values.data.workedPairs, pairs);
      const rendered = String(renderer.visualPromptBody(teaching.values));
      assert.match(rendered, new RegExp(`data-worked-pairs="${pairs}"`, "u"));
      assert.equal((rendered.match(/class="worked-pair"/gu) || []).length, pairs);
      assert.match(rendered, new RegExp(`data-icon="${expected.leftIcon}"`, "u"));
      assert.match(rendered, new RegExp(`data-kind="${expected.rightKind}"`, "u"));
      if (Number(question.params.leftCount) !== Number(question.params.rightCount)) {
        assert.match(rendered, /class="worked-unmatched"/u);
      }
    }
  }
});

test("QA-014: runtime administrative notices are removed from every child-play screen", () => {
  const effects = { removals: 0, insertions: [] };
  const harness = evaluateHarness({
    prelude: `
      let warning="";
      let ui={screen:"home"};
      function escape(value){return String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));}
      const app={
        querySelector(selector){
          if(selector!==".runtime-warning")throw new Error("unexpected selector");
          return {remove(){effects.removals+=1;}};
        },
        insertAdjacentHTML(position,html){effects.insertions.push({position,html});}
      };
    `,
    functions: ["renderRuntimeWarning"],
    body: `
      function renderAt(screen,message){
        ui.screen=screen;
        warning=message;
        effects.insertions.length=0;
        renderRuntimeWarning();
        return effects.insertions.slice();
      }
    `,
    exposed: "renderAt",
    context: { effects },
  });

  const adultNotice = [...harness.renderAt("home", "Backup imported.")];
  assert.equal(adultNotice.length, 1);
  assert.match(String(adultNotice[0].html), /role="alert"[^>]*>Backup imported\./u);
  for (const screen of ["session", "fatigue", "capstone", "done"]) {
    assert.deepEqual(
      [...harness.renderAt(screen, "Backup imported.")],
      [],
      `${screen} must not render the administrative success notice`,
    );
  }
  assert.equal(effects.removals, 5, "each render first removes any stale notice node");
});

test("QA-017: the full 24-character nickname survives greeting generation and wrap-safe layout", () => {
  const nickname = "WWWWWWWWWWWWWWWWWWWWWWWW";
  assert.equal(nickname.length, 24);
  const harness = evaluateHarness({
    prelude: `
      let childName=null;
      const s=()=> "Let's look closely together.";
    `,
    functions: ["ritualOpenLine"],
    body: "function lineFor(name){childName=name;return ritualOpenLine();}",
    exposed: "lineFor",
  });
  const greeting = String(harness.lineFor(nickname));
  assert.equal(greeting, `Let's look closely together, ${nickname}.`);
  assert.equal(greeting.split(nickname).length - 1, 1);
  assert.doesNotMatch(greeting, /…|\.\.\./u);

  const hero = fixture("div", { classes: ["hero"] });
  const panel = fixture("section", { classes: ["panel"], parent: hero });
  const heading = fixture("h2", { parent: panel });
  assert.equal(computedDeclaration(panel, "min-width")?.value, "0");
  assert.equal(computedDeclaration(heading, "overflow-wrap")?.value, "anywhere");
});

test("QA-018: negative contexts preserve plausible units while score retains the declared range", () => {
  const skill = E.SKILL_BY_ID["MQ-109"];
  const policies = {
    temperature: { label: "temperature (°C)", min: -40, max: 45 },
    elevation: { label: "elevation (metres)", min: -100, max: 1000 },
    score: { label: "game score (points)", min: -100, max: Number(skill.constraints.positiveMax) },
  };
  const seenContexts = new Set();
  const seenTasks = new Set();
  let sawLargeScore = false;

  for (const tier of ["EASY", "HARD/TARGET"]) {
    for (const representation of ["CONCRETE", "PICTORIAL", "ABSTRACT"]) {
      for (let ordinal = 0; ordinal < 96; ordinal += 1) {
        const question = makeQuestion("MQ-109", { ordinal, tier, representation });
        const policy = policies[question.params.contextKey];
        assert.ok(policy, `unexpected integer context ${question.params.contextKey}`);
        assert.equal(question.params.context, policy.label);
        seenContexts.add(question.params.contextKey);
        seenTasks.add(question.taskType);

        let values;
        if (question.taskType === "compare") {
          values = [Number(question.params.first), Number(question.params.second)];
          assert.ok(values.some((value) => value < 0));
          assert.ok(values.some((value) => value >= 0));
        } else {
          values = question.options.flatMap((option) => String(option.value)
            .split(",")
            .map((value) => Number(value.trim())));
          const answerValues = String(question.answer.value).split(",")
            .map((value) => Number(value.trim()));
          assert.deepEqual(answerValues, [...answerValues].sort((left, right) => left - right));
          assert.ok(answerValues.some((value) => value < 0));
          assert.ok(answerValues.some((value) => value >= 0));
        }
        assert.ok(values.every((value) => Number.isInteger(value)
          && value >= policy.min
          && value <= policy.max));
        if (question.params.contextKey === "score" && values.some((value) => value > 1000)) {
          sawLargeScore = true;
        }
        assert.deepEqual(Array.from(E.questionContractErrors(question)), []);
      }
    }
  }
  assert.deepEqual([...seenContexts].sort(), ["elevation", "score", "temperature"]);
  assert.deepEqual([...seenTasks].sort(), ["compare", "order"]);
  assert.equal(sawLargeScore, true, "score examples must not be compressed to the elevation range");
});

test("QA-019: each world generates only its accepted early one-to-one object vocabulary", () => {
  const worlds = {
    ocean: {
      situationId: "fish-shells",
      leftItem: "fish",
      rightItem: "shell",
      leftVisual: "fish",
      rightVisual: "shell",
    },
    forest: {
      situationId: "tree-water",
      leftItem: "tree",
      rightItem: "water drop",
      leftVisual: "tree",
      rightVisual: "water-drop",
    },
    space: {
      situationId: "rocket-moons",
      leftItem: "rocket",
      rightItem: "moon",
      leftVisual: "rocket",
      rightVisual: "moon",
    },
  };

  for (const [theme, expected] of Object.entries(worlds)) {
    for (const tier of ["EASY", "HARD/TARGET"]) {
      for (const representation of ["CONCRETE", "PICTORIAL", "ABSTRACT"]) {
        for (let ordinal = 0; ordinal < 6; ordinal += 1) {
          for (const capstone of [false, true]) {
            const question = makeQuestion("MQ-001", {
              theme,
              tier,
              representation,
              ordinal,
              capstone,
            });
            assert.equal(question.semanticPromptStringId, "question.pairObjects");
            for (const key of [
              "situationId",
              "leftItem",
              "rightItem",
              "leftVisual",
              "rightVisual",
            ]) {
              assert.equal(question.params[key], expected[key], `${theme} ${key} drifted`);
            }
            assert.match(question.prompt, new RegExp(`\\b${expected.leftItem}\\b`, "iu"));
            assert.match(question.prompt, new RegExp(`\\b${expected.rightItem}\\b`, "iu"));
            const [left, right] = question.modelDescriptor.values.items;
            assert.equal(left.objectKind, expected.leftVisual);
            assert.equal(right.objectKind, expected.rightVisual);
            assert.equal(question.modelDescriptor.values.data.situationId, expected.situationId);
            assert.deepEqual(Array.from(E.questionContractErrors(question)), []);
          }
        }
      }
    }
  }
});

test("QA-020: the empty name-gate alert is hidden and becomes visible only with an error", () => {
  const harness = evaluateHarness({
    prelude: `
      let ui={nameGateInput:"",nameGateError:""};
      function escape(value){return String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));}
      const app={
        innerHTML:"",
        querySelector(){return {focus(){}};}
      };
    `,
    functions: ["nameGateView"],
    body: `
      function renderGate(error,input=""){
        ui.nameGateError=error;
        ui.nameGateInput=input;
        nameGateView();
        return app.innerHTML;
      }
    `,
    exposed: "renderGate",
  });

  const emptyHtml = String(harness.renderGate("", ""));
  const emptyAlert = openingTagById(emptyHtml, "name-gate-error");
  assert.match(emptyAlert, /\shidden(?:\s|>)/u);
  assert.match(emptyHtml, /id="child-name-input"[^>]*maxlength="24"/u);

  const hiddenAlert = fixture("p", {
    classes: ["notice"],
    attributes: { id: "name-gate-error", hidden: "" },
  });
  const display = computedDeclaration(hiddenAlert, "display");
  assert.ok(display);
  assert.equal(display.value, "none");
  assert.equal(display.important, true);

  const error = "Try again <with a nickname>.";
  const errorHtml = String(harness.renderGate(error, "A&B"));
  const visibleAlert = openingTagById(errorHtml, "name-gate-error");
  assert.doesNotMatch(visibleAlert, /\shidden(?:\s|>)/u);
  assert.match(errorHtml, new RegExp(escapeHtml(error).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(errorHtml, /value="A&amp;B"/u);
});

test("QA-021: metric readings use unit-correct instruments and wrapped reachable choices", () => {
  const harness = evaluateHarness({
    prelude: `
      function escape(value){return String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));}
      function responseAction(mode,action,extra=""){return 'data-control-mode="'+mode+'" data-response-action="'+action+'" '+extra;}
    `,
    functions: ["unlabelledTickRunDescription", "metricScaleConstructionHtml"],
    exposed: "metricScaleConstructionHtml",
  });
  const families = new Map([
    ["centimetres", "length"],
    ["metres", "length"],
    ["grams", "mass"],
    ["kilograms", "mass"],
    ["millilitres", "capacity"],
    ["litres", "capacity"],
  ]);

  for (const [unit, family] of families) {
    for (const tier of ["EASY", "HARD/TARGET"]) {
      const target = tier === "EASY" ? 7 : 15;
      const maximum = tier === "EASY" ? 10 : 20;
      const question = {
        answer: { kind: "integer", value: target },
        params: { unit, scaleMaximum: maximum },
        tier,
      };
      const html = String(harness.metricScaleConstructionHtml(
        question,
        "play",
        { responseState: { value: "" } },
      ));
      assert.match(html, new RegExp(`data-instrument-family="${family}"`, "u"));
      assert.match(html, new RegExp(`data-scale-maximum="${maximum}"`, "u"));
      assert.match(html, /id="metric-scale-choices">Choices</u);
      assert.doesNotMatch(html, /overflow-x|scroll/iu);
      assert.match(html, /role="img"[^>]*aria-label="[^"]*unlabelled tick/iu);
      assert.doesNotMatch(
        html,
        new RegExp(`aria-label="[^"]*(?:mark|reaches|points to) ${target}(?:\\D|$)`, "iu"),
        "the accessible equivalent may expose countable intervals but must not state the assessed mark",
      );

      const buttons = [...html.matchAll(
        /<button[^>]*data-response-action="scale-mark"[^>]*data-value="(\d+)"[^>]*>(\d+)<\/button>/gu,
      )];
      assert.equal(buttons.length, maximum + 1);
      assert.deepEqual(
        buttons.map((match) => Number(match[1])),
        Array.from({ length: maximum + 1 }, (_, value) => value),
      );
      assert.ok(buttons.every((match) => match[1] === match[2]));

      const targetPercent = (target / maximum * 100).toFixed(6);
      assert.match(html, new RegExp(`--measure-end:${targetPercent}%`, "u"));
      assert.match(
        html,
        new RegExp(`data-value="${target}"[^>]*--mark-position:${targetPercent}%`, "u"),
        "the depicted endpoint must share the target tick's exact coordinate",
      );

      const visibleLabels = (html.match(/<b>\d+<\/b>/gu) || []).length;
      if (tier === "EASY") {
        assert.equal(visibleLabels, maximum + 1, "easy scales label every whole mark");
      } else {
        assert.ok(visibleLabels >= 3 && visibleLabels < maximum + 1);
      }
    }
  }

  const metricBrowserPredicate = auditPage.match(
    /const instrumentLabel = normalized\(instrument\?\.getAttribute\("aria-label"\) \|\| ""\);[\s\S]*?const alignmentDelta/u,
  )?.[0];
  assert.ok(metricBrowserPredicate,
    "the installed-browser audit must retain its metric accessibility predicate");
  assert.ok(metricBrowserPredicate.includes('instrumentLabel.includes(`zero to ${maximum}`)'));
  assert.ok(metricBrowserPredicate.includes("instrumentLabel.includes(normalized(witness.unit))"));
  assert.ok(metricBrowserPredicate.includes('instrumentLabel.includes("endpoint")'));
  assert.ok(metricBrowserPredicate.includes('instrumentLabel.includes("unlabelled tick")'));
  assert.match(metricBrowserPredicate,
    /!new RegExp\([\s\S]*?mark \$\{witness\.target\}[\s\S]*?\.test\(instrumentLabel\)/u,
    "the browser predicate must reject an accessible label that leaks the assessed mark");
  assert.doesNotMatch(metricBrowserPredicate, /const instrumentAccessible = new RegExp/u,
    "the obsolete answer-leaking mark oracle must not return");

  const lengthQuestion = {
    answer: { kind: "integer", value: 8 },
    params: { unit: "centimetres" },
    tier: "EASY",
  };
  assert.equal(E.gradeAnswer(lengthQuestion, { value: 8 }).correct, true);
  assert.equal(E.gradeAnswer(lengthQuestion, { value: 7 }).correct, false);

  const metricRuler = fixture("div", { classes: ["metric-ruler"] });
  const answerButton = fixture("button", { parent: metricRuler });
  assert.equal(computedDeclaration(metricRuler, "overflow")?.value, "visible");
  assert.equal(computedDeclaration(answerButton, "min-width")?.value, "44px");
  assert.equal(computedDeclaration(answerButton, "min-height")?.value, "44px");
  assert.equal(computedDeclaration(answerButton, "font-size")?.value, "18px");

  const generated = makeQuestion("MQ-069", { ordinal: 1, tier: "HARD/TARGET" });
  assert.equal(generated.semanticPromptStringId, "question.metricRead");
  assert.match(generated.prompt, /\bstarts at zero\b/iu);
  assert.doesNotMatch(generated.prompt, /\bcount\b.*\bmarks?\b/iu);
});

test("QA-022: metric-unit choices are pictorial, answer-free, tiered, and evidentiary", () => {
  const primitiveStrings = (value) => {
    if (Array.isArray(value)) return value.flatMap(primitiveStrings);
    if (value && typeof value === "object") return Object.values(value).flatMap(primitiveStrings);
    return typeof value === "string" ? [value] : [];
  };
  const unitFamilies = new Map([
    ["centimetres", "length"],
    ["metres", "length"],
    ["grams", "mass"],
    ["kilograms", "mass"],
    ["millilitres", "capacity"],
    ["litres", "capacity"],
  ]);
  const situationByFamily = {
    length: "ruler-bench",
    mass: "mass-scale",
    capacity: "capacity-scale",
  };
  const objectByUnit = {
    centimetres: "pencil",
    metres: "door",
    grams: "apple",
    kilograms: "child",
    millilitres: "cup",
    litres: "bucket",
  };
  const unitsBySeed = [];

  for (const seed of [7, 29]) {
    const cycle = [];
    for (let pair = 0; pair < 6; pair += 1) {
      const ordinal = pair * 2;
      const easy = makeQuestion("MQ-069", { seed, ordinal, tier: "EASY" });
      const hard = makeQuestion("MQ-069", { seed, ordinal, tier: "HARD/TARGET" });
      const reading = makeQuestion("MQ-069", { seed, ordinal: ordinal + 1, tier: "EASY" });
      const family = unitFamilies.get(easy.answer.value);
      const item = easy.modelDescriptor.values.items[0];
      const data = easy.modelDescriptor.values.data;

      assert.equal(easy.semanticPromptStringId, "question.metricUnitChoice");
      assert.match(easy.prompt, new RegExp(`measure the ${family} of this ${objectByUnit[easy.answer.value]}`, "i"));
      assert.equal(reading.semanticPromptStringId, "question.metricRead");
      assert.equal(reading.params.unit, easy.answer.value);
      assert.equal(easy.params.object, objectByUnit[easy.answer.value]);
      assert.equal(easy.params.measureKind, family);
      assert.equal(easy.params.situationId, situationByFamily[family]);
      assert.equal(item.kind, "metricObject");
      assert.equal(item.objectKind, easy.params.object);
      assert.equal(item.measureKind, family);
      assert.equal(item.showFamilyCue, true);
      assert.equal(item.unit, undefined);
      assert.equal(data.suitableUnit, undefined);
      assert.ok(
        !primitiveStrings({ items: easy.modelDescriptor.values.items, data })
          .includes(easy.answer.value),
        "the exact answer must not move to another unanswered item/data field",
      );
      assert.equal(easy.options.length, 2);
      assert.equal(hard.options.length, 4);
      assert.equal(hard.modelDescriptor.values.items[0].showFamilyCue, false);
      assert.ok(hard.options.some((option) => (
        option.value !== hard.answer.value
        && unitFamilies.get(option.value) === unitFamilies.get(hard.answer.value)
      )), "Hard choices must include the same-family unit distractor");
      assert.equal(
        easy.options.filter((option) => E.gradeAnswer(easy, option.value).correct).length,
        1,
      );
      assert.equal(
        hard.options.filter((option) => E.gradeAnswer(hard, option.value).correct).length,
        1,
      );

      const telemetry = {
        promptFinishedAt: 1_000,
        submittedAt: 8_000,
        manipulationMs: 0,
        replayMs: 0,
        idleMs: 0,
      };
      assert.equal(E.submitAnswer(
        easy,
        { optionId: easy.options[easy.correctIndex].optionId },
        telemetry,
      ).evidenceClass, "GUESS_PRONE_SELECTION");
      assert.equal(E.submitAnswer(
        hard,
        { optionId: hard.options[hard.correctIndex].optionId },
        telemetry,
      ).evidenceClass, "GUESS_PRONE_SELECTION");

      const teaching = E.makeTeachingSupport(easy);
      assert.equal(teaching.values.items[0].unit, easy.answer.value);
      assert.equal(teaching.values.data.suitableUnit, easy.answer.value);
      cycle.push(easy.answer.value);
    }
    assert.deepEqual(new Set(cycle), new Set(unitFamilies.keys()));
    unitsBySeed.push(cycle);
  }

  assert.notDeepEqual(unitsBySeed[0], unitsBySeed[1], "different seeds must shift unit order");

  const easyReads = Array.from({ length: 12 }, (_, index) => (
    makeQuestion("MQ-069", { seed: 71, ordinal: index * 2 + 1, tier: "EASY" })
  ));
  const hardReads = Array.from({ length: 60 }, (_, index) => (
    makeQuestion("MQ-069", { seed: 71 + index, ordinal: index * 2 + 1, tier: "HARD/TARGET" })
  ));
  assert.ok(easyReads.every((question) => (
    Number(question.answer.value) <= 10 && question.params.scaleMaximum === 10
  )));
  assert.ok(hardReads.every((question) => (
    Number(question.answer.value) <= 20 && question.params.scaleMaximum === 20
  )));
  assert.ok(hardReads.some((question) => Number(question.answer.value) > 10));

  const harness = evaluateHarness({
    prelude: `
      function escape(value){return String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));}
      function roleLabel(value){return String(value??"").replace(/([a-z])([A-Z])/g,"$1 $2").replace(/[_-]+/g," ").trim();}
    `,
    functions: ["metricObjectVisualHtml"],
    exposed: "metricObjectVisualHtml",
  });
  const pictureSignatures = new Set();
  for (const [unit, object] of Object.entries(objectByUnit)) {
    const answerFree = String(harness.metricObjectVisualHtml({
      objectKind: object,
      label: object,
      measureKind: unitFamilies.get(unit),
      showFamilyCue: true,
    }));
    assert.match(answerFree, new RegExp(`data-metric-object="${object}"`, "u"));
    assert.match(answerFree, /metric-object-svg/u);
    assert.match(answerFree, /metric-object-cue/u);
    assert.doesNotMatch(answerFree, new RegExp(`metric-object-unit[^<]*${unit}`, "u"));
    const pictureMarkup = answerFree.match(/<svg[^>]*>([\s\S]*?)<\/svg>/u)?.[1];
    assert.ok(pictureMarkup);
    pictureSignatures.add(pictureMarkup);

    const teaching = String(harness.metricObjectVisualHtml({
      objectKind: object,
      label: object,
      measureKind: unitFamilies.get(unit),
      showFamilyCue: true,
      unit,
    }));
    assert.match(teaching, new RegExp(`metric-object-unit">${unit}<`, "u"));
  }
  assert.equal(pictureSignatures.size, 6, "all six familiar objects need distinct drawings");
});

test("QA-023: starting-point guidance and results disclose a broad heuristic, abstentions, and co-play support", () => {
  const mapHarness = evaluateHarness({
    prelude: `
      const state={
        earnedLevel:2,
        previewLevel:null,
        placement:{placedSkillIds:["s1"]},
        activeSession:null,
        skills:{
          s1:{acquisition:"PLACED",evidence:[],dueDay:3},
          s2:{acquisition:"UNSEEN",evidence:[],dueDay:null}
        }
      };
      const LEVELS=[{number:1},{number:2}];
      const E={
        SKILLS:[
          {skillId:"s1",level:1,name:"Earlier skill",classification:"GATEWAY"},
          {skillId:"s2",level:2,name:"Starting skill",classification:"SUPPORTING"}
        ],
        CONSTANTS:{LEVEL_MIN:1}
      };
      const ui={
        placementRun:{answers:Array(12).fill({})},
        placementRecommendation:{
          recommendedLevel:2,
          questionCount:12,
          responseCounts:{correct:7,incorrect:3,notSure:2},
          confidence:"LIMITED_ABSTENTION"
        },
        grownTab:"progress"
      };
      const placementNotice="";
      const persistedPlacementDraftBytes=null;
      const app={
        innerHTML:"",
        querySelector(){return {focus(){}};}
      };
      function stageName(level){return level===1?"Foundations":"Next ideas";}
      function escape(value){return String(value);}
      function s(id){return id==="ui.youHere"?"You are here":id;}
      function iconSvg(){return "";}
      function activeSessionKind(){return "none";}
      function text(markup){return String(markup).replace(/<[^>]+>/g," ").replace(/\\s+/g," ").trim();}
      function rendered(){
        const map=mapHtml();
        const progress=progressTab();
        const tab=placementTab();
        placementResultView();
        return {map,progress,tab,result:app.innerHTML,mapText:text(map),progressText:text(progress),tabText:text(tab),resultText:text(app.innerHTML)};
      }
    `,
    functions: ["mapHtml", "progressTab", "placementTab", "placementResultView"],
    exposed: "rendered",
  });
  const rendered = mapHarness.rendered();
  assert.match(rendered.map, /inside the inferred starting range/u);
  assert.match(rendered.map, /skills here were not checked one by one/u);
  assert.match(rendered.progressText, /Inferred range/u);
  assert.match(rendered.progressText, /not directly checked/u);
  assert.match(rendered.tabText, /unvalidated broad starting estimate/u);
  assert.match(rendered.tabText, /Grown-up co-play is required/u);
  assert.match(rendered.tabText, /Automatic speech stays off by default/u);
  assert.match(rendered.tabText, /Replay reads the prompt and choices aloud/u);
  assert.match(rendered.tabText, /Not sure instead of guessing/u);
  assert.match(rendered.resultText, /Heuristic starting range/u);
  assert.match(rendered.resultText, /7 correct, 3 incorrect, 2 Not sure/u);
  assert.match(rendered.resultText, /Limited confidence/u);
  assert.match(rendered.resultText, /estimate stayed conservative/u);
  assert.match(rendered.result, /data-action="placement-retry"/u);
  assert.match(rendered.resultText, /not a diagnosis, grade, or skill-by-skill test/u);
  assert.match(rendered.resultText, /were not checked one by one/u);
  for (const visible of [rendered.mapText, rendered.progressText, rendered.tabText, rendered.resultText]) {
    assert.doesNotMatch(visible, /placement[- ]covered/iu);
    assert.doesNotMatch(visible, /earlier (?:skills|levels) (?:were|are) completed/iu);
  }
});

test("QA-035: MQ-031 numeral support is audited through its shipped number-pad construction", () => {
  for (const tier of ["EASY", "HARD/TARGET"]) {
    for (let ordinal = 0; ordinal < 32; ordinal += 1) {
      for (const reteachStep of [false, true]) {
        const question = makeQuestion("MQ-031", {
          tier: reteachStep ? "EASY" : tier,
          ordinal: reteachStep ? 9000 + ordinal : ordinal,
          eligibleQuestionOrdinal: ordinal,
          representation: "PICTORIAL",
          scaffolded: reteachStep,
          reteachStep,
        });
        assert.equal(question.inputClass, "CONSTRUCTION");
        assert.equal(question.inputMethod, "NUMBER_PAD");
        assert.equal(question.semanticPromptStringId, "question.numeralForm");
        assert.equal(question.options.length, 0);
        const grade = E.gradeAnswer(question, { value: question.answer.value });
        assert.equal(grade.valid, true);
        assert.equal(grade.correct, true);
      }
    }
  }

  const supplementalCase = auditPage.match(
    /caseId: "boundary-mq031-numeral-support",[\s\S]*?caseId: "boundary-mq002-maximum"/u,
  )?.[0];
  assert.ok(supplementalCase,
    "the browser audit must retain the exact MQ-031 supplemental layout witness");
  assert.match(supplementalCase, /family: "NUMBER_PAD"/u);
  assert.doesNotMatch(supplementalCase, /family: "PICTURE_CHOICE"/u,
    "an obsolete choice-family label must not make valid MQ-031 construction rows fail");
});

test("QA-036: placement and feedback browser fixtures protect the current lifecycle and announcement contracts", () => {
  const visualContext = { window: {} };
  new vm.Script(approvedVisualSource, { filename: "approved-visual-regression.js" })
    .runInNewContext(visualContext);
  const visualContract = visualContext.window.MathQuestApprovedVisualRegression;
  const originalState = E.createInitialState(31_000);
  const traversal = visualContract.placementCases(E, originalState);
  const denseWitness = traversal.methods.find((row) => row.inputMethod === "SHARE_DEAL");
  assert.ok(denseWitness, "the adaptive traversal must retain a real SHARE_DEAL witness");

  const begun = E.beginPlacementRun({
    state: originalState,
    playDay: originalState.maxSeenPlayDay,
    theme: "ocean",
  });
  assert.notEqual(begun.state.placement.runNonce, denseWitness.run.nonce,
    "the real Start action must advance the private run identity");
  assert.equal(E.validatePlacementRun(denseWitness.run, begun.state).valid, false,
    "a pre-Start traversal fixture must be rejected as stale after Start commits a new nonce");

  let compatibleRun = E.createPlacementRun({
    state: begun.state,
    playDay: denseWitness.run.playDay,
    seed: denseWitness.run.seed,
    theme: denseWitness.run.theme,
  });
  for (const prior of denseWitness.run.answers) {
    const question = E.placementCurrentQuestion(compatibleRun);
    compatibleRun = prior.responseKind === "correct"
      ? E.submitPlacementAnswer(compatibleRun, visualContract.correctAnswer(E, question)).run
      : E.submitPlacementNotSure(compatibleRun).run;
  }
  assert.equal(E.validatePlacementRun(compatibleRun, begun.state).valid, true);
  assert.equal(
    E.placementVisibleTaskSignature(E.placementCurrentQuestion(compatibleRun)),
    E.placementVisibleTaskSignature(denseWitness.question),
    "replaying the same deterministic decisions on the committed identity must reach the same visible task",
  );

  const placementAudit = auditPage.match(
    /const denseWitness = traversal\.methodCases\.find\([\s\S]*?const placementFeedbackRows = \[\];/u,
  )?.[0];
  assert.ok(placementAudit, "the browser audit must retain its dense placement lifecycle fixture");
  assert.match(placementAudit, /denseRun = engine\.createPlacementRun\(\{[\s\S]*?state: startedState/u);
  assert.match(placementAudit, /engine\.validatePlacementRun\(denseRun, startedState\)/u);
  assert.match(placementAudit, /engine\.placementVisibleTaskSignature\(denseQuestion\)[\s\S]*?engine\.placementVisibleTaskSignature\(denseWitness\.question\)/u);
  const placementLifecycleAudit = auditPage.match(
    /const denseWitness = traversal\.methodCases\.find\([\s\S]*?const placementSelectionCase =/u,
  )?.[0];
  assert.ok(placementLifecycleAudit);
  assert.match(placementLifecycleAudit, /dispatchEvent\(new placementScenario\.win\.Event\("pagehide"\)\)[\s\S]*?localStorage\.setItem\(TEST_PLACEMENT_DRAFT_KEY, incorrectDraftBytes\)/u,
    "the outgoing writer must release before the audit restores shared draft bytes");
  assert.match(placementLifecycleAudit, /controllerSignalStayedAtQuestion/u,
    "the controller-change fixture must prove the active question first and then navigate only at Pause");

  const feedbackAudit = auditPage.match(
    /const feedbackRows = \[\];[\s\S]*?add\("BR-26"/u,
  )?.[0];
  assert.ok(feedbackAudit, "the browser audit must retain the exact feedback matrix");
  assert.match(feedbackAudit, /feedback\?\.dataset\.feedbackAnnouncement === "focus"/u);
  assert.match(feedbackAudit, /liveText === ""/u,
    "the focused outcome must not be duplicated through the global live region");
  assert.match(feedbackAudit, /attemptTruthMatches = attemptTruth === correct/u);
  assert.doesNotMatch(feedbackAudit, /liveText\.startsWith\(expectedStatus\)/u,
    "the obsolete duplicate-live-announcement oracle must not return");

  const writerIsolationAudit = auditPage.match(
    /function scenarioFailClosedState\(frame\)[\s\S]*?async function waitForScenarioNavigation/u,
  )?.[0];
  assert.ok(writerIsolationAudit,
    "the browser audit must retain its synthetic-frame writer-isolation boundary");
  assert.match(writerIsolationAudit, /typeof locks\.query !== "function"/u);
  assert.match(writerIsolationAudit, /consecutiveIdleObservations >= 2/u,
    "the handoff must observe an empty held/pending lock set across two task turns");
  assert.match(writerIsolationAudit, /await requireAuditWriterIdle\(\)/u);
  assert.match(writerIsolationAudit, /entered unexpected \$\{failClosedState\}/u,
    "ordinary fixtures must reject progress-protection and save-recovery screens explicitly");
  assert.match(auditPage, /allowFailClosedScreen: true/u,
    "only the deliberate BR-20 fail-closed fixtures may opt into those screens");
  assert.match(auditPage, /waitUntil\([\s\S]*?\}, 350, 20\);[\s\S]*?did not reach expected skill/u,
    "the existing seven-second BR-21 bound must remain intact rather than becoming a retry mask");
});

test("QA-037: exact short-viewport packing keeps governed text and target floors intact", async () => {
  assert.match(styleSource, /\.playground-panel\{height:calc\(100dvh - 116px\);min-height:0/u);
  assert.match(styleSource, /data-skill-id="MQ-048"\] \.choices\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/u);
  assert.match(styleSource, /data-skill-id="MQ-048"\] \.choices\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/u);
  assert.match(styleSource, /data-skill-id="MQ-021"\] \.pair-object\{width:44px;height:44px/u);
  assert.match(styleSource, /data-skill-id="MQ-007"\] \.sort-task\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\) auto/u);
  assert.match(styleSource, /data-skill-id="MQ-105"\] \.area-outline-svg\{max-height:148px\}/u);
  assert.match(styleSource, /\.lab-question:is\(\[data-skill-id="MQ-007"\],\[data-skill-id="MQ-105"\],\[data-skill-id="MQ-122"\]\):has\(>\.model\)\{display:grid;grid-template-columns:/u);
  assert.match(styleSource, /\.lab-question:has\(>\.model\) \.strategy-build-task>\.math-model\{display:none\}/u);
  assert.match(styleSource, /data-skill-id="MQ-097"\] \.strategy-build-task\{grid-template-columns:minmax\(0,2fr\) minmax\(140px,\.75fr\)/u);
  assert.match(styleSource, /\.playground-panel button,\.playground-shell \.topbar button\{min-width:65px;min-height:65px\}/u);
  assert.match(styleSource, /\.play-shell :is\(button,input,select,textarea\)[\s\S]*?min-height:45px/u);
  assert.match(styleSource, /\.proportional-content\{display:grid;gap:8px;min-width:0\}/u);
  assert.match(styleSource, /\.proportional-label-key\{display:flex;justify-content:center;flex-wrap:wrap/u);
  assert.match(styleSource, /placement-panel\[data-skill-id="MQ-118"\] \.placement-question\{display:grid;grid-template-columns:/u);
  assert.match(styleSource, /placement-panel\[data-skill-id="MQ-118"\]\{min-height:0;/u,
    "the MQ-118 placement witness must not inherit the viewport-sized panel minimum that creates artificial overflow");
  assert.match(styleSource, /placement-panel\[data-skill-id="MQ-118"\] \.proportional-track\{min-height:52px\}/u);
  const screenActivityAudit = auditPage.match(
    /const activitySpecs = Object\.freeze\(\[[\s\S]*?add\("BR-21"/u,
  )?.[0];
  assert.ok(screenActivityAudit,
    "BR-21 must retain the rendered screen-native and placement money-label supplement");
  assert.doesNotMatch(screenActivityAudit, /activeSession\.uiState\.question\s*=\s*question/u,
    "screen-native fixtures must remain valid canonical sessions rather than overwriting the bound question");
  assert.match(screenActivityAudit, /engine\.validateState\(state\)/u,
    "every screen-native fixture must fail before browser setup if its saved session is invalid");
  for (const activity of [
    "pattern-next", "count-group", "frame-number", "make-ten", "hidden-part", "greatest", "least",
  ]) {
    assert.match(screenActivityAudit, new RegExp(`activity: "${activity}"`, "u"));
  }
  assert.match(screenActivityAudit, /const moneyWitness = traversal\.moneyCase/u);
  assert.match(screenActivityAudit, /placementDraftBytes\(engine, moneyWitness\.run/u,
    "the money-label regression must load a real placement draft");
  assert.match(screenActivityAudit, /data-placement-screen\]\[data-placement-phase="question"\]\[data-skill-id="MQ-118"\]/u,
    "the money-label regression must inspect the actual Find your level question route");
  assert.match(screenActivityAudit, /\{ width: 1366, height: 706, name: "desktop-short" \}/u,
    "the money-label regression must protect the exact short desktop play-testing viewport");
  assert.doesNotMatch(screenActivityAudit, /1857/u,
    "the money-label regression must not substitute a wider viewport for the reported 1366 px screen");
  assert.match(screenActivityAudit, /expectedLabels = \["first cost", "second cost", "remaining"\]/u);
  assert.match(screenActivityAudit, /everyControlReachable/u);
  assert.match(screenActivityAudit, /const initialAnswerControls[\s\S]*?chosen\?\.click\(\);[\s\S]*?const answerControls = response\?\.querySelector/u,
    "the activity census must requery the live response controls after the selection render");
  assert.match(screenActivityAudit, /data-response-action="pattern-token"/u,
    "the pattern activity must drive the shipped structured-response action rather than a selection-only control");
  assert.match(screenActivityAudit, /\.manipulative-set,\.tally-set/u,
    "the count-group oracle must follow the session's governed representation rather than assume picture tokens");
  assert.match(screenActivityAudit, /countedMagnitude === Number\(question\.answer\.value\)/u,
    "the rendered mark count must remain bound to the independently graded answer");
  assert.match(screenActivityAudit, /countedMarks\.children\.length === countedMagnitude/u,
    "every nonzero count-group witness must render exactly one visible mark per counted object");

  const pairLinkActions = [];
  let confirmClicks = 0;
  const answerStructured = new vm.Script(`(()=>{
    "use strict";
    const pause = async () => {};
    const activateResponse = async (_scenario, selector, keyboard) => {
      pairLinkActions.push({ selector, keyboard });
    };
    ${extractFunctionFrom(auditPage, "pairLinkAuditRelation")}
    ${extractFunctionFrom(auditPage, "answerStructured")}
    return answerStructured;
  })()`, { filename: "pair-link-browser-driver-effect.js" }).runInNewContext({
    pairLinkActions,
    CSS: { escape: (value) => String(value) },
  });
  const scenario = {
    doc: {
      querySelector(selector) {
        if (selector === '[data-action="confirm"]:not([disabled])') {
          return { click: () => { confirmClicks += 1; } };
        }
        return null;
      },
    },
  };
  await answerStructured(scenario, {
    inputMethod: "PAIR_LINK",
    semanticPromptStringId: "question.compare",
    params: { leftCount: 3, rightCount: 2 },
    answer: { value: "more" },
  });
  assert.deepEqual(
    pairLinkActions.map((entry) => entry.selector),
    [
      '[data-response-action="pair-item"][data-item-id="a0"]',
      '[data-response-action="pair-item"][data-item-id="b0"]',
      '[data-response-action="pair-item"][data-item-id="a1"]',
      '[data-response-action="pair-item"][data-item-id="b1"]',
      '[data-response-action="pair-relation"][data-relation="more"]',
    ],
    "the browser driver must complete the governed comparison relation before Confirm",
  );
  assert.equal(confirmClicks, 1);
});

test("QA-038: strategy construction owns and renders its answer-free source model", () => {
  const harness = evaluateHarness({
    prelude: `
      function escape(value){return String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));}
      function s(id,slots={}){return id+Object.values(slots).join("");}
      function responseAction(mode,action,extra=""){return 'data-control-mode="'+mode+'" data-response-action="'+action+'" '+extra;}
      function strategyActionLabel(strategy){return String(strategy);}
      function questionModelHtml(question){return '<div class="math-model" data-model-family="'+escape(question.modelDescriptor.type)+'" data-model-derived="true"></div>';}
    `,
    functions: ["strategyBuildConstructionHtml"],
    exposed: "strategyBuildConstructionHtml",
    context: { E },
  });

  for (const question of [
    makeQuestion("MQ-040", { ordinal: 1, tier: "HARD/TARGET" }),
    makeQuestion("MQ-097", { ordinal: 2, tier: "HARD/TARGET" }),
  ]) {
    assert.equal(question.inputMethod, "STRATEGY_BUILD");
    const rendered = String(harness.strategyBuildConstructionHtml(question, "lab", {
      responseState: E.createResponseState(question),
    }));
    assert.match(rendered, new RegExp(`data-model-family="${question.modelDescriptor.type}"`, "u"),
      `${question.skillId} must show the visual source that gives meaning to its strategy work`);
    assert.match(rendered, /data-response-kind="STRATEGY_BUILD"/u);
    assert.ok(rendered.indexOf("data-model-family=") < rendered.indexOf("data-response-action=\"strategy-select\""),
      "the source model must precede the strategy controls in reading order");
  }
});

test("QA-039: dense mathematical models stay bounded and contextual help stays singular", () => {
  const bounded = evaluateHarness({
    prelude: `
      function finitePositiveInteger(value){const number=Number(value);return Number.isInteger(number)&&number>0?number:null;}
      function s(id,slots){return id === "model.arrayRow" ? "Row "+slots.row+": "+slots.count : id;}
    `,
    functions: ["boundedArrayVisualHtml"],
    exposed: "boundedArrayVisualHtml",
  }).boundedArrayVisualHtml(2, 35);
  assert.equal((bounded.match(/class="array-bounded-row"/gu) || []).length, 2,
    "the 2 by 35 relationship must retain two visibly distinct mathematical rows");
  assert.equal((bounded.match(/class="array-row-chunk"/gu) || []).length, 10,
    "each 35-dot row must wrap into five bounded seven-dot segments");
  assert.equal((bounded.match(/<i><\/i>/gu) || []).length, 70,
    "responsive grouping must retain every one of the 70 represented objects");
  assert.match(bounded, /Row 1: 35/u);
  assert.match(bounded, /Row 2: 35/u);

  const idHarness = evaluateHarness({
    functions: ["semanticSvgId"],
    exposed: "semanticSvgId",
  }).semanticSvgId;
  const sourceId = idHarness("area", { questionId: "MQ-121-example" }, "source");
  const workedId = idHarness("area", { questionId: "MQ-121-example" }, "worked");
  assert.notEqual(sourceId, workedId, "simultaneous source and worked models must not reuse one document-wide SVG clip id");
  assert.equal(sourceId, "area-MQ-121-example-source");
  assert.equal(workedId, "area-MQ-121-example-worked");

  const contextual = { hidden: null, disabled: null, ariaHidden: null,
    closest: (selector) => selector === ".tutorial-offer" ? {} : null,
    setAttribute: (_name, value) => { contextual.ariaHidden = value; } };
  const global = { hidden: null, disabled: null, ariaHidden: null,
    closest: () => null,
    setAttribute: (_name, value) => { global.ariaHidden = value; } };
  const availability = evaluateHarness({
    prelude: `
      const ui=contextUi;
      const app=contextApp;
      function tutorialAvailable(){return true;}
    `,
    functions: ["applyTutorialAvailability"],
    exposed: "applyTutorialAvailability",
    context: {
      contextUi: { tutorialOpen: false, screen: "session", phase: "feedback", lastAttempt: { feedbackClass: "INCORRECT" } },
      contextApp: { querySelectorAll: () => [contextual, global] },
    },
  }).applyTutorialAvailability();
  assert.equal(availability.available, true);
  assert.equal(availability.count, 2);
  assert.equal(availability.visibleCount, 1);
  assert.equal(contextual.hidden, false);
  assert.equal(contextual.disabled, false);
  assert.equal(contextual.ariaHidden, "false");
  assert.equal(global.hidden, true);
  assert.equal(global.disabled, true);
  assert.equal(global.ariaHidden, "true");

  assert.match(styleSource, /\.share-mats\{[^}]*grid-template-columns:repeat\(auto-fit,minmax\(96px,1fr\)\)/u,
    "group mats must wrap rather than widen the document");
  assert.match(styleSource, /\.isometric-prism polyline\{fill:none\}/u,
    "layer separators must remain strokes rather than filled wedges");
  assert.match(styleSource, /\.selected-state--labelled\[aria-pressed="true"\]::after/u,
    "selection must carry a visible label in addition to colour");
  assert.match(styleSource, /repeating-linear-gradient/u,
    "selection and mathematical state must retain a non-colour texture cue");
  assert.match(styleSource, /@media\(forced-colors:active\)/u,
    "selection must remain visible when authored colours are replaced");
});

test("QA-040: grown-up records render as readable in-app documents without nested two-axis tables", () => {
  const legalBlockStart = adapter.indexOf("function legalSafeHref");
  const legalBlockEnd = adapter.indexOf("function legalView", legalBlockStart);
  assert.ok(legalBlockStart >= 0 && legalBlockEnd > legalBlockStart,
    "the effect test must execute the exact shipped legal renderer block");
  const legal = new vm.Script(`(()=>{
    function escape(value){return String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));}
    ${adapter.slice(legalBlockStart, legalBlockEnd)}
    return legalDocumentBodyHtml;
  })()`, { filename: "holistic-child-ux-legal-effects.js" }).runInNewContext();
  const rendered = String(legal("# Privacy\n\n**Local only.**\n\n- No telemetry\n\n<script>alert(1)</script>", "Privacy"));
  assert.doesNotMatch(rendered, /<h2>Privacy<\/h2>/u,
    "the in-app title must not be repeated by the embedded document heading");
  assert.match(rendered, /<strong>Local only\.<\/strong>/u);
  assert.match(rendered, /<ul><li>No telemetry<\/li><\/ul>/u);
  assert.doesNotMatch(rendered, /<script>/u);
  assert.match(rendered, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u,
    "legal text must remain inert even if a governed source file contains markup-looking text");
  const embeddedStart = adapter.indexOf("const LEGAL_DOCUMENT_TEXT=Object.freeze(")
    + "const LEGAL_DOCUMENT_TEXT=Object.freeze(".length;
  const embeddedEnd = adapter.indexOf(");\n    const LEGAL_DOCUMENTS", embeddedStart);
  assert.ok(embeddedEnd > embeddedStart, "the exact governed legal payload must remain machine-readable");
  const embedded = JSON.parse(adapter.slice(embeddedStart, embeddedEnd));
  assert.deepEqual(embedded, {
    privacy: readFileSync(path.join(root, "PRIVACY.md"), "utf8").replace(/\r\n?/gu, "\n"),
    notices: readFileSync(path.join(root, "THIRD_PARTY_NOTICES.md"), "utf8").replace(/\r\n?/gu, "\n"),
    license: readFileSync(path.join(root, "LICENSE"), "utf8").replace(/\r\n?/gu, "\n"),
  }, "the in-app legal reader must reproduce the exact governed source documents");
  const renderedNotices = String(legal(embedded.notices, "Licences and attributions"));
  assert.match(renderedNotices, /<a href="https:\/\/www\.nationalarchives\.gov\.uk\/doc\/open-government-licence\/version\/3\/" target="_blank" rel="noopener noreferrer">Open Government Licence v3\.0<\/a>/u,
    "the actual attribution source must render Markdown links as safe semantic links");
  assert.match(renderedNotices, /<a href="https:\/\/github\.com\/rsms\/inter\/releases\/download\/v4\.1\/Inter-4\.1\.zip" target="_blank" rel="noopener noreferrer">https:\/\/github\.com\/rsms\/inter\/releases\/download\/v4\.1\/Inter-4\.1\.zip<\/a>/u,
    "the actual attribution source must render HTTPS autolinks without raw angle brackets");
  assert.match(renderedNotices, /<table class="legal-table">[\s\S]*<th scope="col">File<\/th>[\s\S]*<td><code>tap\.wav<\/code><\/td>/u,
    "the actual attribution table must render as a semantic table");
  assert.match(renderedNotices, /<em>National curriculum in England: mathematics programmes of study<\/em>/u,
    "the actual attribution source must render governed emphasis rather than literal asterisks");
  assert.doesNotMatch(renderedNotices, /\]\(https:\/\/|&lt;https:\/\/|\|\s*File\s*\|/u,
    "the actual attribution view must not expose raw Markdown links, autolinks, or table rows");
  assert.match(adapter, /const LEGAL_DOCUMENTS=Object\.freeze\(\{privacy:/u);
  assert.doesNotMatch(extractFunction("openLegalDocument"), /fetch\(/u,
    "the in-app legal reader must preserve connect-src 'none' and make no runtime request");
  assert.doesNotMatch(adapter, /href="\.\/PRIVACY\.md"/u,
    "the parent surface must not hand a grown-up a raw Markdown navigation");
  assert.match(adapter, /class="string-review-table"/u);
  assert.doesNotMatch(extractFunction("stringReviewTab"), /class="scroll"/u,
    "the wording review must use the outer document scroll rather than a nested two-axis viewport");
  assert.match(styleSource, /\.place-value-exact\{overflow:visible\}/u);
  assert.match(styleSource, /\.number-line-exact\{max-width:100%;overflow:visible\}/u);
  assert.match(styleSource, /\.partition-regions\{overflow:hidden\}/u);
  assert.match(styleSource, /@media\(max-height:450px\) and \(orientation:landscape\)/u,
    "short landscape Home and tutorial actions must have an explicit first-screen packing contract");
});
