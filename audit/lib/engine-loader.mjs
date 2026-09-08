import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const ENGINE_FILENAME = "math-quest.engine.js";
const START_MARKER = "ENGINE-START";
const END_MARKER = "ENGINE-END";

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

export function extractEngineFromPageBytes(pageBytes) {
  if (!Buffer.isBuffer(pageBytes) && !(pageBytes instanceof Uint8Array)) {
    throw new TypeError("Engine extraction requires the exact page bytes.");
  }
  pageBytes = Buffer.from(pageBytes);
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

export async function extractEngine(indexPath) {
  return extractEngineFromPageBytes(await readFile(indexPath));
}

// This scanner removes ordinary comments and quoted text before looking for the
// prompt's banned direct references. It intentionally treats template literals
// conservatively: engine code should use plain data rather than template code.
function maskPair(cursor, nextState = cursor.state) {
  cursor.out += "  ";
  cursor.index += 1;
  cursor.state = nextState;
}

function scanTemplateCode(cursor, c) {
  const frame = cursor.frames.at(-1);
  if (frame && frame.depth !== null) {
    if (c === "{") frame.depth += 1;
    else if (c === "}") {
      frame.depth -= 1;
      if (frame.depth === 0) {
        frame.depth = null;
        cursor.state = "template";
        cursor.out += " ";
        return;
      }
    }
  }
  cursor.out += c;
}

const scanStates = Object.freeze({
  line(cursor, c) {
    if (c === "\n") { cursor.state = "code"; cursor.out += "\n"; }
    else cursor.out += " ";
  },
  block(cursor, c, n) {
    if (c === "*" && n === "/") maskPair(cursor, "code");
    else cursor.out += c === "\n" ? "\n" : " ";
  },
  string(cursor, c) {
    if (c === "\\") maskPair(cursor);
    else if (c === cursor.quote) { cursor.out += " "; cursor.state = "code"; }
    else cursor.out += c === "\n" ? "\n" : " ";
  },
  template(cursor, c, n) {
    if (c === "\\") maskPair(cursor);
    else if (c === "`") {
      cursor.out += " ";
      cursor.frames.pop();
      cursor.state = cursor.frames.length && cursor.frames.at(-1).depth === null ? "template" : "code";
    } else if (c === "$" && n === "{") {
      maskPair(cursor, "code");
      cursor.frames.at(-1).depth = 1;
    } else cursor.out += c === "\n" ? "\n" : " ";
  },
  code(cursor, c, n) {
    if (c === "/" && n === "/") maskPair(cursor, "line");
    else if (c === "/" && n === "*") maskPair(cursor, "block");
    else if (c === "\"" || c === "'") {
      cursor.quote = c; cursor.out += " "; cursor.state = "string";
    } else if (c === "`") {
      cursor.frames.push({ depth: null }); cursor.out += " "; cursor.state = "template";
    } else scanTemplateCode(cursor, c);
  },
});

function stripNonCode(source) {
  const cursor = { out: "", state: "code", quote: "", frames: [], index: 0 };
  for (; cursor.index < source.length; cursor.index += 1) {
    scanStates[cursor.state](cursor, source[cursor.index], source[cursor.index + 1]);
  }
  return cursor.out;
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
