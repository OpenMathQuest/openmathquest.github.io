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

test("QA-007: physical-model guidance uses large approved materials without erasing coin curriculum", () => {
  const representation = E.SKILL_BY_ID["MQ-001"].representation;
  const guidance = E.renderChildString("instruction.physicalModel", { representation });
  assert.match(guidance, /\blarge\b/iu);
  assert.match(guidance, /\bgrown-up-approved\b/iu);
  assert.doesNotMatch(
    guidance,
    /\b(?:coins?|counters?|beads?|buttons?|marbles?|small objects?)\b/iu,
    "the generic floor-play cue must not invite small manipulatives",
  );

  const coinQuestion = makeQuestion("MQ-048", { ordinal: 0 });
  assert.equal(coinQuestion.semanticPromptStringId, "question.coinValue");
  assert.match(coinQuestion.prompt, /\bCanadian\b.*\bcoin\b/iu);
  assert.equal(coinQuestion.modelDescriptor.values.items[0].kind, "coin");
  assert.ok(Number.isInteger(Number(coinQuestion.modelDescriptor.values.items[0].cents)));
});

test("QA-008: direct construction emits a primary action whose winning colour is white", () => {
  const actionQuestion = findGeneratedQuestion((question) => question.inputMethod === "ACTION_SCENE");
  const measureQuestion = findGeneratedQuestion((question) => question.inputMethod === "MEASURE_OBJECT");
  assert.ok(actionQuestion, "a generated ACTION_SCENE question must remain reachable");
  assert.ok(measureQuestion, "a generated MEASURE_OBJECT question must remain reachable");

  const harness = evaluateHarness({
    prelude: `
      function escape(value){return String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));}
      function questionModelHtml(){return "";}
      function themedObjectTokenHtml(noun){return '<i data-object-kind="'+escape(noun)+'"></i>';}
      function responseAction(mode,action,extra=""){return 'data-control-mode="'+mode+'" data-response-action="'+action+'" '+extra;}
    `,
    functions: ["directNumericConstructionHtml"],
    exposed: "directNumericConstructionHtml",
  });

  for (const question of [actionQuestion, measureQuestion]) {
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
});

test("QA-009: zero number-connection support works the answer and renders an explicit empty set", () => {
  let zeroQuestion = null;
  for (let ordinal = 0; ordinal < 256 && !zeroQuestion; ordinal += 1) {
    const question = makeQuestion("MQ-019", { ordinal });
    if (Number(question.answer.value) === 0) zeroQuestion = question;
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
    functions: ["metricScaleConstructionHtml"],
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
      assert.match(
        html,
        new RegExp(`role="img"[^>]*aria-label="[^"]*mark ${target}\\.`, "u"),
        "the accessible instrument must communicate the same marked value as the picture",
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
