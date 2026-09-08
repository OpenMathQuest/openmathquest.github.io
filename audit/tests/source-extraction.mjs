import assert from "node:assert/strict";
import { Linter } from "eslint";
import { executableInlineScripts } from "../lib/function-quality-metrics.mjs";

function parsedSource(source, sourceType) {
  const declarations = [];
  const calls = [];
  const linter = new Linter();
  const messages = linter.verify(source, [{
    languageOptions: { ecmaVersion: "latest", sourceType },
    plugins: { extraction: { rules: { collect: { create: () => ({
      FunctionDeclaration(node) { declarations.push(node); },
      CallExpression(node) { calls.push(node); },
    }) } } } },
    rules: { "extraction/collect": "error" },
  }]);
  assert.deepEqual(messages, [], "source extraction requires a successful JavaScript parse");
  return { declarations, calls, tokens: linter.getSourceCode().ast.tokens };
}

function declarationSource(source, declarations, name, optional) {
  const matches = declarations.filter((node) => node.id.name === name);
  if (optional && matches.length === 0) return null;
  assert.equal(matches.length, 1, `${name} must have exactly one shipped declaration`);
  return source.slice(...matches[0].range);
}

function delimiterEnd(tokens, openIndex, open, close) {
  assert.equal({ "(": ")", "[": "]", "{": "}" }[open], close, "unsupported delimiter pair");
  const start = tokens.findIndex((token) => token.range[0] === openIndex);
  assert.ok(start >= 0 && tokens[start].type === "Punctuator" && tokens[start].value === open, "expected opening token");
  let depth = 0;
  for (const token of tokens.slice(start)) {
    if (token.type !== "Punctuator") continue;
    if (token.value === open) depth += 1;
    if (token.value === close && --depth === 0) return token.range[0];
  }
  throw new Error(`unclosed ${open}${close} delimiter`);
}

function listenerMatches(source, node, target, eventName) {
  const callee = node.callee;
  return callee.type === "MemberExpression" && !callee.computed
    && callee.property.name === "addEventListener"
    && source.slice(...callee.object.range) === target
    && node.arguments[0]?.type === "Literal" && node.arguments[0].value === eventName;
}

function listenerSource(source, calls, target, eventName, marker) {
  const matches = calls.filter((node) => listenerMatches(source, node, target, eventName))
    .map((node) => `${source.slice(...node.range)};`).filter((statement) => statement.includes(marker));
  assert.equal(matches.length, 1, `${target} ${eventName} listener containing ${marker} must be unique`);
  return matches[0];
}

export function createSourceExtractor(source, { sourceType = "script" } = {}) {
  const { declarations, calls, tokens } = parsedSource(source, sourceType);
  return Object.freeze({
    functionDeclaration: (name, { optional = false } = {}) => declarationSource(source, declarations, name, optional),
    matchingDelimiter: (openIndex, open, close) => delimiterEnd(tokens, openIndex, open, close),
    listenerStatement: (target, eventName, marker) => listenerSource(source, calls, target, eventName, marker),
  });
}

function uniqueMatch(matches, description) {
  assert.equal(matches.length, 1, `${description} must have exactly one match`);
  return matches[0];
}

export function createHtmlSourceExtractor(html) {
  const scripts = executableInlineScripts(html, "test-source.html");
  assert.ok(scripts.length > 0, "HTML extraction requires executable inline scripts");
  const extractors = scripts.map(({ source, sourceType }) => createSourceExtractor(source, { sourceType }));
  return Object.freeze({
    functionDeclaration(name) {
      const declarations = extractors.map((extractor) => extractor.functionDeclaration(name, { optional: true }));
      return uniqueMatch(declarations.filter((source) => source !== null), `${name} declaration`);
    },
    scriptContaining(marker) {
      return uniqueMatch(scripts.filter(({ source }) => source.includes(marker)), `${marker} script`).source;
    },
  });
}
