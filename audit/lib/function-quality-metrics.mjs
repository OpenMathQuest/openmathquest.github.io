import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Linter } from "eslint";

const FUNCTION_QUALITY_METRIC_CONTRACT = Object.freeze({
  id: "MATH_QUEST_FUNCTION_QUALITY_V1",
  cyclomatic: "ESLINT_CLASSIC_V10_CODE_PATH_BRANCHES",
  abc: "ASSIGNMENTS_CALL_BRANCHES_AND_BOOLEAN_CONDITIONS_EUCLIDEAN_MAGNITUDE",
  cognitive: "MQ_COGNITIVE_V1_NESTED_CONTROL_FLOW_LOGICAL_CHAINS_AND_RECURSION",
  functionLoc: "PHYSICAL_INCLUSIVE_SOURCE_LINES",
  nesting: "ESLINT_MAX_DEPTH_CONTROL_BLOCKS",
});

export const NEW_FUNCTION_LIMITS = Object.freeze({
  cyclomatic: 10,
  abcMagnitude: 30,
  cognitive: 15,
  functionLines: 80,
  maxNesting: 4,
});

const functionTypes = new Set(["ArrowFunctionExpression", "FunctionDeclaration", "FunctionExpression"]);
const loopTypes = new Set(["DoWhileStatement", "ForInStatement", "ForOfStatement", "ForStatement", "WhileStatement"]);
const comparisonOperators = new Set(["!=", "!==", "<", "<=", "==", "===", ">", ">=", "in", "instanceof"]);
const executableScriptTypes = new Set(["", "application/javascript", "module", "text/javascript"]);
const cyclomaticNodeTypes = new Set([
  "AssignmentPattern", "CatchClause", "ConditionalExpression", "LogicalExpression",
  "ForInStatement", "ForOfStatement", "ForStatement", "IfStatement",
  "WhileStatement", "DoWhileStatement",
]);
const assignmentNodeTypes = new Set(["AssignmentExpression", "AssignmentPattern", "UpdateExpression"]);
const branchNodeTypes = new Set(["AwaitExpression", "CallExpression", "NewExpression", "YieldExpression"]);
const conditionNodeTypes = new Set(["CatchClause", "ConditionalExpression", "IfStatement", "LogicalExpression"]);
const propertyParentTypes = new Set(["MethodDefinition", "PropertyDefinition", "Property"]);

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function physicalLineCount(value) {
  const text = String(value);
  return text.split(/\r?\n/u).length - (text.endsWith("\n") ? 1 : 0);
}

function childNodes(node, visitorKeys) {
  const children = [];
  for (const key of visitorKeys[node.type] || []) {
    const value = node[key];
    if (Array.isArray(value)) children.push(...value.filter((item) => item?.type));
    else if (value?.type) children.push(value);
  }
  return children;
}

function parseJavaScript(source, filename, sourceType) {
  const linter = new Linter();
  const messages = linter.verify(source, [{
    languageOptions: { ecmaVersion: "latest", sourceType },
    rules: {},
  }], { filename });
  const errors = messages.filter((message) => message.fatal || message.severity === 2);
  if (errors.length) {
    return Object.freeze({
      errors: Object.freeze(errors.map((message) => Object.freeze({
        line: message.line || 0,
        column: message.column || 0,
        message: message.message,
      }))),
      sourceCode: null,
    });
  }
  const sourceCode = linter.getSourceCode();
  if (!sourceCode) {
    return Object.freeze({
      errors: Object.freeze([Object.freeze({
        line: 0,
        column: 0,
        message: "ESLint did not return a parsed source tree.",
      })]),
      sourceCode: null,
    });
  }
  return Object.freeze({ errors: Object.freeze([]), sourceCode });
}

function scriptType(attributes) {
  const match = String(attributes).match(/\btype\s*=\s*["']([^"']+)["']/iu);
  return match ? match[1].trim().toLowerCase() : "";
}

export function executableInlineScripts(html, relativePath) {
  const scripts = [];
  const expression = /<script\b([^>]*)>([\s\S]*?)<\/script>/giu;
  let ordinal = 0;
  for (const match of html.matchAll(expression)) {
    const attributes = match[1] || "";
    const type = scriptType(attributes);
    if (/\bsrc\s*=/iu.test(attributes) || !executableScriptTypes.has(type)) continue;
    ordinal += 1;
    const contentOffset = (match.index || 0) + match[0].indexOf(match[2]);
    const lineOffset = html.slice(0, contentOffset).split(/\r?\n/u).length - 1;
    scripts.push(Object.freeze({
      relativePath: relativePath + "#inline-script-" + ordinal,
      ownerPath: relativePath,
      source: match[2],
      sourceType: type === "module" ? "module" : "script",
      lineOffset,
    }));
  }
  return Object.freeze(scripts);
}

function javascriptUnits(root, paths) {
  return javascriptUnitsFromLoader(paths, (relativePath) => readFileSync(
    path.join(root, ...relativePath.split("/")),
    "utf8",
  ));
}

export function javascriptUnitsFromLoader(paths, loadText) {
  const units = [];
  for (const relativePath of paths) {
    if (/\.(?:js|mjs)$/u.test(relativePath)) {
      units.push(Object.freeze({
        relativePath,
        ownerPath: relativePath,
        source: loadText(relativePath),
        sourceType: "module",
        lineOffset: 0,
      }));
    } else if (relativePath.endsWith(".html")) {
      units.push(...executableInlineScripts(loadText(relativePath), relativePath));
    }
  }
  return Object.freeze(units);
}

function collectFunctions(program, visitorKeys) {
  const functions = [];
  function visit(node, parent) {
    if (functionTypes.has(node.type)) functions.push(Object.freeze({ node, parent }));
    for (const child of childNodes(node, visitorKeys)) visit(child, node);
  }
  visit(program, null);
  return functions;
}

function keyText(node, sourceCode) {
  if (!node) return "";
  if (node.type === "Identifier" || node.type === "PrivateIdentifier") return node.name;
  if (node.type === "Literal") return String(node.value);
  return sourceCode.getText(node).slice(0, 80);
}

function callName(node, sourceCode) {
  if (!node || node.type !== "CallExpression") return "";
  return keyText(node.callee, sourceCode).replace(/\s+/gu, " ");
}

function parentBoundName(parent, sourceCode) {
  if (parent?.type === "VariableDeclarator") return keyText(parent.id, sourceCode);
  if (parent?.type === "AssignmentExpression") return keyText(parent.left, sourceCode);
  if (propertyParentTypes.has(parent?.type)) return keyText(parent.key, sourceCode);
  if (parent?.type === "CallExpression") return (callName(parent, sourceCode) || "call") + ".callback";
  return "";
}

function displayName(node, parent, sourceCode) {
  return node.id?.name || parentBoundName(parent, sourceCode) || "(anonymous)";
}

function isElseIf(node, parent) {
  return node.type === "IfStatement" && parent?.type === "IfStatement" && parent.alternate === node;
}

function raisesDepth(node, parent) {
  return (node.type === "IfStatement" && !isElseIf(node, parent))
    || node.type === "SwitchStatement"
    || node.type === "TryStatement"
    || loopTypes.has(node.type);
}

function incrementCyclomatic(metrics, node) {
  if (cyclomaticNodeTypes.has(node.type)) metrics.cyclomatic += 1;
  else if (node.type === "SwitchCase" && node.test) metrics.cyclomatic += 1;
  else if (node.type === "AssignmentExpression" && ["&&=", "||=", "??="].includes(node.operator)) metrics.cyclomatic += 1;
  else if ((node.type === "MemberExpression" || node.type === "CallExpression") && node.optional === true) metrics.cyclomatic += 1;
}

function isAssignmentNode(node) {
  return assignmentNodeTypes.has(node.type) || (node.type === "VariableDeclarator" && node.init);
}

function isConditionNode(node) {
  if (conditionNodeTypes.has(node.type) || loopTypes.has(node.type)) return true;
  if (node.type === "SwitchCase") return Boolean(node.test);
  if (node.type === "BinaryExpression") return comparisonOperators.has(node.operator);
  return node.type === "UnaryExpression" && node.operator === "!";
}

function incrementAbc(metrics, node) {
  if (isAssignmentNode(node)) metrics.assignments += 1;
  if (branchNodeTypes.has(node.type)) metrics.branches += 1;
  if (isConditionNode(node)) metrics.conditions += 1;
}

function structuralCognitiveIncrement(node, parent, nesting) {
  if (node.type === "IfStatement") return isElseIf(node, parent) ? 1 : 1 + nesting;
  if (loopTypes.has(node.type) || node.type === "SwitchStatement" || node.type === "CatchClause"
    || node.type === "ConditionalExpression") return 1 + nesting;
  return 0;
}

function logicalCognitiveIncrement(node, parent) {
  if (node.type !== "LogicalExpression") return 0;
  return parent?.type !== "LogicalExpression" || parent.operator !== node.operator ? 1 : 0;
}

function jumpCognitiveIncrement(node) {
  if (!node.label) return 0;
  return node.type === "BreakStatement" || node.type === "ContinueStatement" ? 1 : 0;
}

function recursionCognitiveIncrement(node, functionName) {
  if (node.type !== "CallExpression" || node.callee?.type !== "Identifier") return 0;
  return node.callee.name === functionName ? 1 : 0;
}

function cognitiveIncrement(node, parent, nesting, functionName) {
  return structuralCognitiveIncrement(node, parent, nesting)
    + logicalCognitiveIncrement(node, parent)
    + jumpCognitiveIncrement(node)
    + recursionCognitiveIncrement(node, functionName);
}

function cognitiveDepthDelta(node, parent) {
  if (node.type === "IfStatement") return isElseIf(node, parent) ? 0 : 1;
  return loopTypes.has(node.type) || node.type === "SwitchStatement"
    || node.type === "CatchClause" || node.type === "ConditionalExpression" ? 1 : 0;
}

function statementCount(node) {
  return /Statement$/u.test(node.type) || node.type === "VariableDeclaration" ? 1 : 0;
}

function measureFunction(node, parent, visitorKeys, functionName) {
  const metrics = {
    cyclomatic: 1,
    assignments: 0,
    branches: 0,
    conditions: 0,
    cognitive: 0,
    maxNesting: 0,
    statements: 0,
  };
  function visit(current, currentParent, depth, cognitiveDepth) {
    if (current !== node && functionTypes.has(current.type)) return;
    incrementCyclomatic(metrics, current);
    incrementAbc(metrics, current);
    metrics.cognitive += cognitiveIncrement(current, currentParent, cognitiveDepth, functionName);
    if (current.type === "IfStatement" && current.alternate && current.alternate.type !== "IfStatement") metrics.cognitive += 1;
    metrics.statements += statementCount(current);
    const nextDepth = depth + (raisesDepth(current, currentParent) ? 1 : 0);
    const nextCognitiveDepth = cognitiveDepth + cognitiveDepthDelta(current, currentParent);
    metrics.maxNesting = Math.max(metrics.maxNesting, nextDepth);
    for (const child of childNodes(current, visitorKeys)) visit(child, current, nextDepth, nextCognitiveDepth);
  }
  visit(node, parent, 0, 0);
  const magnitude = Math.sqrt((metrics.assignments ** 2) + (metrics.branches ** 2) + (metrics.conditions ** 2));
  return Object.freeze({ ...metrics, abcMagnitude: Math.round(magnitude * 100) / 100 });
}

function thresholdViolations(row, limits = NEW_FUNCTION_LIMITS) {
  return Object.freeze(Object.entries(limits)
    .filter(([metric, maximum]) => row[metric] > maximum)
    .map(([metric, maximum]) => Object.freeze({ metric, observed: row[metric], maximum })));
}

function unitFunctionRows(unit) {
  const parsePath = unit.relativePath.includes("#")
    ? unit.relativePath.replace("#", ".") + ".js"
    : unit.relativePath;
  const parsed = parseJavaScript(unit.source, parsePath, unit.sourceType);
  if (!parsed.sourceCode) return Object.freeze({ rows: Object.freeze([]), errors: parsed.errors });
  const sourceCode = parsed.sourceCode;
  const occurrences = new Map();
  const rows = collectFunctions(sourceCode.ast, sourceCode.visitorKeys).map(({ node, parent }) => {
    const name = displayName(node, parent, sourceCode);
    const ordinal = (occurrences.get(name) || 0) + 1;
    occurrences.set(name, ordinal);
    const functionSource = sourceCode.getText(node);
    const measured = measureFunction(node, parent, sourceCode.visitorKeys, node.id?.name || "");
    const row = {
      functionId: unit.relativePath + "::" + name + "#" + ordinal,
      path: unit.ownerPath,
      unit: unit.relativePath,
      name,
      kind: node.type,
      startLine: node.loc.start.line + unit.lineOffset,
      endLine: node.loc.end.line + unit.lineOffset,
      functionLines: node.loc.end.line - node.loc.start.line + 1,
      parameters: node.params.length,
      sourceSha256: sha256(functionSource),
      ...measured,
    };
    return Object.freeze({ ...row, thresholdViolations: thresholdViolations(row) });
  });
  return Object.freeze({ rows: Object.freeze(rows), errors: Object.freeze([]) });
}

function maximum(rows, field) {
  return rows.reduce((value, row) => Math.max(value, row[field]), 0);
}

export function functionQualityCensus(root, paths) {
  return functionQualityCensusFromUnits(javascriptUnits(root, paths));
}

export function functionQualityCensusFromUnits(units) {
  const rows = [];
  const parseErrors = [];
  for (const unit of units) {
    const result = unitFunctionRows(unit);
    rows.push(...result.rows);
    parseErrors.push(...result.errors.map((error) => Object.freeze({ unit: unit.relativePath, ...error })));
  }
  rows.sort((left, right) => left.path.localeCompare(right.path, "en")
    || left.startLine - right.startLine || left.functionId.localeCompare(right.functionId, "en"));
  const violations = rows.filter((row) => row.thresholdViolations.length);
  return Object.freeze({
    contract: FUNCTION_QUALITY_METRIC_CONTRACT,
    limits: NEW_FUNCTION_LIMITS,
    units: units.length,
    functions: rows.length,
    parseErrors: Object.freeze(parseErrors),
    maxima: Object.freeze({
      cyclomatic: maximum(rows, "cyclomatic"),
      abcMagnitude: maximum(rows, "abcMagnitude"),
      cognitive: maximum(rows, "cognitive"),
      functionLines: maximum(rows, "functionLines"),
      maxNesting: maximum(rows, "maxNesting"),
    }),
    violationFunctions: violations.length,
    violationCounts: Object.freeze(Object.fromEntries(Object.keys(NEW_FUNCTION_LIMITS)
      .map((metric) => [metric, rows.filter((row) => row[metric] > NEW_FUNCTION_LIMITS[metric]).length]))),
    rows: Object.freeze(rows),
  });
}

export function sourceFileCensus(root, paths) {
  return sourceFileCensusFromLoader(paths, (relativePath) => readFileSync(
    path.join(root, ...relativePath.split("/")),
    "utf8",
  ));
}

export function sourceFileCensusFromLoader(paths, loadText) {
  const sourceExtension = /\.(?:css|html|js|json|jsonc|md|mjs|ps1|svg|txt|webmanifest|ya?ml)$/iu;
  return Object.freeze(paths.filter((relativePath) => sourceExtension.test(relativePath)).map((relativePath) => {
    const text = loadText(relativePath);
    return Object.freeze({
      path: relativePath,
      lines: physicalLineCount(text),
      bytes: Buffer.byteLength(text, "utf8"),
      sha256: sha256(text),
    });
  }));
}
