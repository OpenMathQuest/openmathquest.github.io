import assert from "node:assert/strict";
import test from "node:test";
import { createHtmlSourceExtractor, createSourceExtractor } from "./source-extraction.mjs";

test("source extraction preserves exact async declarations without executing source", () => {
  const declaration = "async function chosen(value = { nested: [1] }) { return value; }";
  const extractor = createSourceExtractor(`throw new Error('must not execute');\n${declaration}`);
  assert.equal(extractor.functionDeclaration("chosen"), declaration);
});

test("declaration lookup ignores comments, strings, and regular-expression lookalikes", () => {
  const declaration = "function chosen() { return /[})]/u.test('}'); }";
  const extractor = createSourceExtractor(`// function chosen() {}\nconst text = 'function chosen() {}';\n${declaration}`);
  assert.equal(extractor.functionDeclaration("chosen"), declaration);
});

test("declaration lookup rejects missing and ambiguous declarations", () => {
  const extractor = createSourceExtractor("function outer() { function repeated() {} } function repeated() {}");
  assert.throws(() => extractor.functionDeclaration("missing"), /exactly one/u);
  assert.throws(() => extractor.functionDeclaration("repeated"), /exactly one/u);
  assert.equal(extractor.functionDeclaration("missing", { optional: true }), null);
  assert.throws(() => extractor.functionDeclaration("repeated", { optional: true }), /exactly one/u);
});

test("declaration lookup treats names literally and includes generators", () => {
  const declaration = "function* $chosen() { yield 1; }";
  const extractor = createSourceExtractor(declaration);
  assert.equal(extractor.functionDeclaration("$chosen"), declaration);
  assert.throws(() => extractor.functionDeclaration(".*"), /exactly one/u);
});

test("delimiter lookup ignores quoted and regex punctuation and nested templates", () => {
  const source = 'const values = ["]", /[\\]})]/u, `outer ${`inner ${({ value: "]" }).value}`} end`];';
  const extractor = createSourceExtractor(source);
  assert.equal(extractor.matchingDelimiter(source.indexOf("["), "[", "]"), source.lastIndexOf("]"));
});

test("delimiter lookup rejects non-token starts, wrong pairs, and invalid source", () => {
  const source = 'const text = "["; const values = [];';
  const extractor = createSourceExtractor(source);
  assert.throws(() => extractor.matchingDelimiter(source.indexOf("["), "[", "]"), /opening token/u);
  assert.throws(() => extractor.matchingDelimiter(source.lastIndexOf("["), "[", "}"), /delimiter pair/u);
  assert.throws(() => createSourceExtractor("function broken( {"), /parse/u);
});

test("listener extraction retains exact statement bytes and selects by marker", () => {
  const first = 'target.addEventListener("click", () => { act("first"); });';
  const second = 'target.addEventListener("click", () => { act("second"); });';
  const extractor = createSourceExtractor(`${first}\n${second}`);
  assert.equal(extractor.listenerStatement("target", "click", 'act("second")'), second);
  assert.throws(() => extractor.listenerStatement("target", "click", "absent"), /unique/u);
  assert.throws(() => extractor.listenerStatement("target", "click", "act"), /unique/u);
});

test("separate sources never share declaration state", () => {
  const first = createSourceExtractor("function chosen() { return 1; }");
  const second = createSourceExtractor("function chosen() { return 2; }");
  assert.equal(first.functionDeclaration("chosen"), "function chosen() { return 1; }");
  assert.equal(second.functionDeclaration("chosen"), "function chosen() { return 2; }");
});

test("listener extraction ignores commented and quoted calls", () => {
  const statement = 'target.addEventListener("click", () => chosen());';
  const extractor = createSourceExtractor(`// ${statement}\nconst text = '${statement}';\n${statement}`);
  assert.equal(extractor.listenerStatement("target", "click", "chosen"), statement);
});

test("module extraction requires explicit module mode and never executes imports", () => {
  const declaration = "function chosen() { return 1; }";
  const source = `import unavailable from "unavailable"; export ${declaration}`;
  assert.throws(() => createSourceExtractor(source), /parse/u);
  assert.equal(createSourceExtractor(source, { sourceType: "module" }).functionDeclaration("chosen"), declaration);
});

test("HTML extraction selects executable inline scripts without executing or loading them", () => {
  const declaration = "function chosen() { return /[})]/u.test('}'); }";
  const html = `<p>function chosen() {}</p>
    <script src="unavailable.js">function chosen() {}</script>
    <script type="application/json">{"text":"function chosen() {}"}</script>
    <script>throw new Error('must not execute'); ${declaration}</script>`;
  const extractor = createHtmlSourceExtractor(html);
  assert.equal(extractor.functionDeclaration("chosen"), declaration);
  assert.throws(() => extractor.functionDeclaration("missing"), /exactly one/u);
});

test("HTML extraction keeps script scopes separate and rejects ambiguous declarations", () => {
  const html = '<script>const value = 1; function first() { return value; }</script>'
    + '<script type="module">import absent from "absent"; const value = 2; function second() { return value; }</script>';
  const extractor = createHtmlSourceExtractor(html);
  assert.equal(extractor.functionDeclaration("first"), "function first() { return value; }");
  assert.equal(extractor.functionDeclaration("second"), "function second() { return value; }");
  assert.throws(() => createHtmlSourceExtractor(html + '<script>function first() {}</script>')
    .functionDeclaration("first"), /exactly one/u);
  assert.throws(() => createHtmlSourceExtractor('<script>function broken(</script>'), /parse/u);
});

test("HTML script selection requires a unique executable marker and preserves source bytes", () => {
  const source = '\nconst paths = Object.freeze(["./first", "./second"]);\n';
  const html = `<script type="application/json">{"paths":[]}</script><script>${source}</script>`;
  const extractor = createHtmlSourceExtractor(html);
  assert.equal(extractor.scriptContaining("const paths"), source);
  assert.throws(() => extractor.scriptContaining("missing"), /exactly one/u);
  assert.throws(() => createHtmlSourceExtractor(html + `<script>${source}</script>`)
    .scriptContaining("const paths"), /exactly one/u);
  assert.throws(() => createHtmlSourceExtractor("<p>No executable source</p>"), /executable inline/u);
});
