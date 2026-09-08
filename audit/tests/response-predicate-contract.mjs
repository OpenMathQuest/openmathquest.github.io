import assert from "node:assert/strict";
import { cloneJson as clone } from "../lib/test-harness.mjs";
import { correctStructuredResponse } from "./manifest-semantic-suite.mjs";

function predicateContext(engine, activeByMethod) {
  const q = (method) => clone(activeByMethod.get(method));
  const correct = (method, question = q(method)) => clone(correctStructuredResponse(engine, question));
  const invalid = (method, question, response, label) => {
    const result = engine.gradeAnswer(question, response);
    assert.equal(result.valid, false, `${method}/${label} valid`);
    assert.equal(result.correct, false, `${method}/${label} correct`);
  };
  return { engine, q, correct, invalid };
}

const predicateCases = {
  symmetryLines({ q, correct, invalid }) {
    const question = q("SYMMETRY_BUILD");
    const response = correct("SYMMETRY_BUILD", question);
    for (const [label, change] of [
      ["missing count fractional", (item) => { item.answer.value = "1.5"; }],
      ["missing count below one", (item) => { item.answer.value = "0"; }],
      ["target below missing", (item) => { item.params.target = 0; }],
      ["required count mismatch", (item) => { item.params.requiredLineIds = []; }],
      ["required lines duplicate", (item) => { item.params.requiredLineIds = ["line1", "line1"]; }],
    ]) {
      const hostile = clone(question);
      change(hostile);
      invalid("SYMMETRY_BUILD", hostile, response, label);
    }
  },
  pairEndpoints({ q, correct, invalid }) {
    const question = q("PAIR_LINK");
    const response = correct("PAIR_LINK", question);
    for (const [label, change] of [
      ["left count fractional", (item) => { item.params.leftCount = 1.5; }],
      ["right count fractional", (item) => { item.params.rightCount = 1.5; }],
      ["too many links", (_, answer) => { answer.links.push(["a999", "b999"]); }],
      ["left endpoint malformed", (_, answer) => { answer.links[0][0] = "x0"; }],
      ["right endpoint malformed", (_, answer) => { answer.links[0][1] = "x0"; }],
      ["left endpoint outside", (item, answer) => { answer.links[0][0] = `a${item.params.leftCount}`; }],
      ["right endpoint outside", (item, answer) => { answer.links[0][1] = `b${item.params.rightCount}`; }],
    ]) {
      const hostile = clone(question);
      const answer = clone(response);
      change(hostile, answer);
      invalid("PAIR_LINK", hostile, answer, label);
    }
  },
  tokenDealParameters({ q, correct, invalid }) {
    for (const method of ["SHARE_DEAL", "GROUP_BUILD", "BOND_SPLIT"]) {
      const question = q(method);
      const response = correct(method, question);
      const cases = method === "SHARE_DEAL"
        ? [
          ["total fractional", (item) => { item.params.total = 1.5; }],
          ["total negative", (item) => { item.params.total = -1; }],
          ["recipient count fractional", (item) => { item.params.recipients = 1.5; }],
          ["recipient count zero", (item) => { item.params.recipients = 0; }],
        ]
        : method === "GROUP_BUILD"
          ? [
            ["group count fractional", (item) => { item.params.groups = 1.5; }],
            ["group count zero", (item) => { item.params.groups = 0; }],
            ["per-group fractional", (item) => { item.params.perGroup = 1.5; }],
            ["per-group zero", (item) => { item.params.perGroup = 0; }],
            ["total fractional", (item) => { item.params.product = 1.5; }],
          ]
          : [
            ["whole fractional", (item) => { item.params.whole = 1.5; }],
            ["whole below two", (item) => { item.params.whole = 1; }],
          ];
      for (const [label, change] of cases) {
        const hostile = clone(question);
        change(hostile);
        invalid(method, hostile, response, label);
      }
    }
  },
  expressionSlots({ engine, q, correct, invalid }) {
    const question = q("SLOT_COMPOSER");
    const response = correct("SLOT_COMPOSER", question);
    const blank = clone(response);
    blank.slots[0] = "";
    invalid("SLOT_COMPOSER", question, blank, "blank slot");
    const direct = engine.gradeAnswer(question, response);
    assert.equal(direct.valid, true);
    assert.equal(direct.correct, true);
    if (!/subtraction|leaving/iu.test(question.semanticPromptStringId)) {
      const commuted = clone(response);
      [commuted.slots[0], commuted.slots[2]] = [commuted.slots[2], commuted.slots[0]];
      assert.equal(engine.gradeAnswer(question, commuted).correct, true, "commuted addition remains correct");
    }
  },
  fractionRegions({ q, correct, invalid }) {
    const question = q("FRACTION_PARTITION");
    const response = correct("FRACTION_PARTITION", question);
    for (const [label, change] of [
      ["duplicate regions", (answer) => { answer.shaded = ["part0", "part0"]; }],
      ["outside region", (answer) => { answer.shaded = ["part999"]; }],
      ["fractional denominator", (answer) => { answer.denominator = 2.5; }],
      ["zero denominator", (answer) => { answer.denominator = 0; }],
      ["fractional shading", (answer) => {
        delete answer.shaded;
        answer.shadedCount = 0.5;
      }],
      ["negative shading", (answer) => {
        delete answer.shaded;
        answer.shadedCount = -1;
      }],
      ["excess shading", (answer) => {
        delete answer.shaded;
        answer.shadedCount = Number(answer.denominator) + 1;
      }],
    ]) {
      const answer = clone(response);
      change(answer);
      invalid("FRACTION_PARTITION", question, answer, label);
    }
  },
  routeMoves({ engine, q, correct, invalid }) {
    const question = q("GRID_ROUTE");
    const response = correct("GRID_ROUTE", question);
    const missingEnd = { moves: response.moves, value: "" };
    invalid("GRID_ROUTE", question, missingEnd, "end absent");
    const wrongMoves = clone(response);
    wrongMoves.moves = [];
    const result = engine.gradeAnswer(question, wrongMoves);
    assert.equal(result.valid, true, "GRID_ROUTE geometric end is still well formed");
    assert.equal(result.correct, false, "GRID_ROUTE missing moves cannot be correct");
  },
  areaParts({ q, correct, invalid }) {
    const question = q("AREA_DECOMPOSE");
    const response = correct("AREA_DECOMPOSE", question);
    for (const [label, change] of [
      ["cut missing", (answer) => { answer.cutIds = []; }],
      ["cut wrong", (answer) => { answer.cutIds = ["wrong"]; }],
      ["part missing", (answer) => { answer.partAreas = [1]; }],
      ["part zero", (answer) => { answer.partAreas[0] = 0; }],
      ["total non-numeric", (answer) => { answer.total = "not-a-number"; }],
    ]) {
      const answer = clone(response);
      change(answer);
      invalid("AREA_DECOMPOSE", question, answer, label);
    }
  },
  volumeLayers({ q, correct, invalid }) {
    const question = q("VOLUME_INSPECT");
    const response = correct("VOLUME_INSPECT", question);
    for (const [label, change] of [
      ["height fractional", (item) => { item.params.height = 1.5; }],
      ["height zero", (item) => { item.params.height = 0; }],
      ["layer missing", (_, answer) => { answer.viewedLayers.pop(); }],
      ["method unknown", (_, answer) => { answer.method = "estimate"; }],
      ["value non-numeric", (_, answer) => { answer.value = "not-a-number"; }],
      ["duplicate layer", (_, answer) => { answer.viewedLayers.push(answer.viewedLayers[0]); }],
    ]) {
      const hostile = clone(question);
      const answer = clone(response);
      change(hostile, answer);
      invalid("VOLUME_INSPECT", hostile, answer, label);
    }
  },
};

export async function registerResponsePredicateTests(t, engine, activeByMethod) {
  await t.test("RESPONSE-GRADE evaluates each defensive predicate before accepting mathematics", () => {
    const context = predicateContext(engine, activeByMethod);
    for (const check of Object.values(predicateCases)) check(context);
  });
}
