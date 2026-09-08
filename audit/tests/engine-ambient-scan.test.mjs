import assert from "node:assert/strict";
import test from "node:test";
import { scanAmbientReferences } from "../lib/engine-loader.mjs";

test("ambient scanner retains direct references in governed order", () => {
  assert.deepEqual(scanAmbientReferences("fetch(); window.x; Math.random(); Date.now(); fetch();"),
    ["Math.random", "Date", "window", "fetch"]);
  assert.deepEqual(scanAmbientReferences("const fetchValue = 1; const myDate = 2;"), []);
});

test("ambient scanner masks comments and quotes but resumes at their boundaries", () => {
  const cases = [
    ['// fetch window\nDate.now()', ["Date"]],
    ['/* fetch\nwindow */ crypto.x', ["crypto"]],
    [String.raw`"escaped \" fetch"; document.x`, ["document"]],
    [String.raw`'escaped \' fetch'; navigator.x`, ["navigator"]],
    ['"fetch\nwindow"; performance.now()', ["performance"]],
    ['/* unfinished fetch', []],
    ['"unfinished fetch' + "\\", []],
  ];
  for (const [source, expected] of cases) assert.deepEqual(scanAmbientReferences(source), expected, source);
});

test("ambient scanner retains interpolation code through nested templates and braces", () => {
  const cases = [
    ['`fetch window`', []],
    ['`literal fetch ${document.x} window`', ["document"]],
    ['`outer ${`inner ${window.x}`} document`; Math.random()', ["Math.random", "window"]],
    ['`outer ${{ nested: { value: fetch() } }.nested} Date`', ["fetch"]],
    ['`outer ${/* } fetch */ "}" + navigator.x} window`', ["navigator"]],
    ['`escaped \\` fetch`; crypto.x', ["crypto"]],
  ];
  for (const [source, expected] of cases) assert.deepEqual(scanAmbientReferences(source), expected, source);
});
