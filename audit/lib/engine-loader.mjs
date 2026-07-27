import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

export const ENGINE_FILENAME = "math-quest.engine.js";
export const START_MARKER = "ENGINE-START";
export const END_MARKER = "ENGINE-END";

const AMBIENT_PATTERNS = Object.freeze([
  ["Math.random", /\bMath\s*\.\s*random\b/u],
  ["Date", /\bDate\b/u],
  ["window", /\bwindow\b/u],
  ["document", /\bdocument\b/u],
  ["localStorage", /\blocalStorage\b/u],
  ["sessionStorage", /\bsessionStorage\b/u],
  ["fetch", /\bfetch\b/u],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/u],
  ["WebSocket", /\bWebSocket\b/u],
  ["crypto", /\bcrypto\b/u],
  ["performance", /\bperformance\b/u],
  ["globalThis", /\bglobalThis\b/u],
  ["navigator", /\bnavigator\b/u],
  ["setTimeout", /\bsetTimeout\b/u],
  ["setInterval", /\bsetInterval\b/u],
]);

function countAscii(buffer, needle) {
  const bytes = Buffer.from(needle, "ascii");
  let count = 0;
  let offset = 0;
  while ((offset = buffer.indexOf(bytes, offset)) !== -1) {
    count += 1;
    offset += bytes.length;
  }
  return count;
}

function lineStart(buffer, offset) {
  const priorLf = buffer.lastIndexOf(0x0a, offset - 1);
  return priorLf === -1 ? 0 : priorLf + 1;
}

function afterLine(buffer, offset) {
  const lf = buffer.indexOf(0x0a, offset);
  return lf === -1 ? buffer.length : lf + 1;
}

export async function extractEngine(indexPath) {
  const pageBytes = await readFile(indexPath);
  const startCount = countAscii(pageBytes, START_MARKER);
  const endCount = countAscii(pageBytes, END_MARKER);
  if (startCount !== 1 || endCount !== 1) {
    throw new Error(`Expected one ${START_MARKER} and one ${END_MARKER}; found ${startCount} and ${endCount}.`);
  }

  const startToken = pageBytes.indexOf(Buffer.from(START_MARKER, "ascii"));
  const endToken = pageBytes.indexOf(Buffer.from(END_MARKER, "ascii"));
  if (endToken <= startToken) throw new Error(`${END_MARKER} must follow ${START_MARKER}.`);

  const engineStart = afterLine(pageBytes, startToken);
  const engineEnd = lineStart(pageBytes, endToken);
  if (engineEnd <= engineStart) throw new Error("The marked engine block is empty.");
  const engineBytes = pageBytes.subarray(engineStart, engineEnd);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const source = decoder.decode(engineBytes);
  const sha256 = createHash("sha256").update(engineBytes).digest("hex");
  return Object.freeze({
    pageBytes,
    engineBytes,
    source,
    sha256,
    startCount,
    endCount,
    byteStart: engineStart,
    byteEndExclusive: engineEnd,
  });
}

// This scanner removes ordinary comments and quoted text before looking for the
// prompt's banned direct references. It intentionally treats template literals
// conservatively: engine code should use plain data rather than template code.
export function stripNonCode(source) {
  let out = "";
  let state = "code";
  let quote = "";
  const templateFrames = [];
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const n = source[i + 1];
    if (state === "line") {
      if (c === "\n") { state = "code"; out += "\n"; } else out += " ";
    } else if (state === "block") {
      if (c === "*" && n === "/") { out += "  "; i += 1; state = "code"; }
      else out += c === "\n" ? "\n" : " ";
    } else if (state === "string") {
      if (c === "\\") { out += "  "; i += 1; }
      else if (c === quote) { out += " "; state = "code"; }
      else out += c === "\n" ? "\n" : " ";
    } else if (state === "template") {
      if (c === "\\") { out += "  "; i += 1; }
      else if (c === "`" ) {
        out += " "; templateFrames.pop();
        state = templateFrames.length && templateFrames.at(-1).depth === null ? "template" : "code";
      } else if (c === "$" && n === "{") {
        out += "  "; i += 1; templateFrames.at(-1).depth = 1; state = "code";
      } else out += c === "\n" ? "\n" : " ";
    } else if (c === "/" && n === "/") {
      out += "  "; i += 1; state = "line";
    } else if (c === "/" && n === "*") {
      out += "  "; i += 1; state = "block";
    } else if (c === "\"" || c === "'") {
      quote = c; out += " "; state = "string";
    } else if (c === "`") {
      templateFrames.push({ depth: null }); out += " "; state = "template";
    } else if (templateFrames.length && templateFrames.at(-1).depth !== null && c === "{") {
      templateFrames.at(-1).depth += 1; out += c;
    } else if (templateFrames.length && templateFrames.at(-1).depth !== null && c === "}") {
      templateFrames.at(-1).depth -= 1;
      if (templateFrames.at(-1).depth === 0) { templateFrames.at(-1).depth = null; state = "template"; out += " "; }
      else out += c;
    } else out += c;
  }
  return out;
}

export function scanAmbientReferences(source) {
  const codeOnly = stripNonCode(source);
  return AMBIENT_PATTERNS
    .filter(([, pattern]) => pattern.test(codeOnly))
    .map(([name]) => name);
}

function throwingAmbient(name) {
  return new Proxy(function forbiddenAmbient() {}, {
    apply() { throw new Error(`Forbidden ambient API used: ${name}`); },
    construct() { throw new Error(`Forbidden ambient API used: ${name}`); },
    get() { throw new Error(`Forbidden ambient API used: ${name}`); },
  });
}

export function evaluateEngine(source, { timeoutMs = 1_000, filename = ENGINE_FILENAME } = {}) {
  const safeMath = Object.create(null);
  for (const key of Object.getOwnPropertyNames(Math)) {
    if (key !== "random") Object.defineProperty(safeMath, key, Object.getOwnPropertyDescriptor(Math, key));
  }
  Object.freeze(safeMath);
  const sandbox = Object.create(null);
  Object.assign(sandbox, {
    Math: safeMath,
    Date: throwingAmbient("Date"),
    window: throwingAmbient("window"),
    document: throwingAmbient("document"),
    localStorage: throwingAmbient("localStorage"),
    sessionStorage: throwingAmbient("sessionStorage"),
    fetch: throwingAmbient("fetch"),
    XMLHttpRequest: throwingAmbient("XMLHttpRequest"),
    WebSocket: throwingAmbient("WebSocket"),
    crypto: throwingAmbient("crypto"),
    performance: throwingAmbient("performance"),
    navigator: throwingAmbient("navigator"),
    setTimeout: throwingAmbient("setTimeout"),
    setInterval: throwingAmbient("setInterval"),
  });
  const context = vm.createContext(sandbox, {
    name: "math-quest-restricted-engine",
    codeGeneration: { strings: false, wasm: false },
  });
  // Parentheses make the marker payload parse as exactly one expression. A
  // payload such as `first(); second()` is therefore rejected before it can
  // run, while the extracted and hashed bytes remain unchanged.
  const script = new vm.Script(`(\n${source}\n)`, { filename });
  const engine = script.runInContext(context, { timeout: timeoutMs, breakOnSigint: true });
  if (!engine || typeof engine !== "object") {
    throw new Error("The marked bytes must evaluate directly to one engine object expression.");
  }
  return engine;
}

export async function loadShippedEngine(indexPath, options) {
  const extracted = await extractEngine(indexPath);
  const banned = scanAmbientReferences(extracted.source);
  if (banned.length) throw new Error(`Banned ambient reference(s): ${banned.join(", ")}`);
  return Object.freeze({ ...extracted, engine: evaluateEngine(extracted.source, options) });
}
