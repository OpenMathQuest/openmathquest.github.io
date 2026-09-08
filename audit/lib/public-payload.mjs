import { createHash } from "node:crypto";

const PAYLOAD_SOURCES = Object.freeze({
  staged: Object.freeze({
    empty: "The public payload cannot be empty.",
    format: "The staged entries use an unsupported or inconsistent Git object format.",
    conflict: "a file conflicts with a directory in the staged tree",
    invalidPath: "duplicate or invalid staged path",
    requireMergedStage: true,
  }),
  qualification: Object.freeze({
    empty: "the qualification public payload cannot be empty",
    format: "the qualification payload uses an unsupported or inconsistent Git object format",
    conflict: "a file conflicts with a directory",
    invalidPath: "duplicate or invalid path",
    requireMergedStage: false,
  }),
});

export function publicPayloadSha256(entries) {
  const canonical = [...entries]
    .sort((left, right) => left.path.localeCompare(right.path, "en"))
    .map((entry) => `${entry.mode}\0${entry.hash}\0${entry.stage}\0${entry.path}\0`)
    .join("");
  return createHash("sha256").update(Buffer.from(canonical, "utf8")).digest("hex");
}

function payloadHashAlgorithm(entries, rules) {
  if (!entries.length) throw new Error(rules.empty);
  const oidLength = entries[0].hash.length;
  const algorithm = oidLength === 40 ? "sha1" : oidLength === 64 ? "sha256" : null;
  if (!algorithm || entries.some((entry) => entry.hash.length !== oidLength)) {
    throw new Error(rules.format);
  }
  return algorithm;
}

function payloadDirectory(rootNode, entry, segments, rules) {
  let node = rootNode;
  for (const segment of segments) {
    const existing = node.children.get(segment);
    if (existing?.entry) throw new Error(`${entry.path}: ${rules.conflict}`);
    if (!existing) node.children.set(segment, { children: new Map() });
    node = node.children.get(segment);
  }
  return node;
}

function addPayloadEntry(rootNode, entry, rules) {
  if (rules.requireMergedStage && entry.stage !== "0") {
    throw new Error(`${entry.path}: an unmerged stage cannot form the public payload tree`);
  }
  if (!/^(?:100644|100755|120000)$/u.test(entry.mode)) {
    throw new Error(`${entry.path}: unsupported Git mode ${entry.mode}`);
  }
  const segments = entry.path.split("/");
  const node = payloadDirectory(rootNode, entry, segments.slice(0, -1), rules);
  const name = segments.at(-1);
  if (!name || node.children.has(name)) throw new Error(`${entry.path}: ${rules.invalidPath}`);
  node.children.set(name, { entry });
}

function sortedTreeRows(node) {
  return [...node.children.entries()].map(([name, child]) => ({
    name,
    child,
    sortKey: Buffer.from(child.entry ? name : `${name}/`, "utf8"),
  })).sort((left, right) => Buffer.compare(left.sortKey, right.sortKey));
}

function treeRowBytes({ name, child }, algorithm) {
  const mode = child.entry ? child.entry.mode : "40000";
  const oid = child.entry ? Buffer.from(child.entry.hash, "hex") : treeHash(child, algorithm);
  return Buffer.concat([Buffer.from(`${mode} ${name}\0`, "utf8"), oid]);
}

function treeHash(node, algorithm) {
  const body = Buffer.concat(sortedTreeRows(node).map((row) => treeRowBytes(row, algorithm)));
  return createHash(algorithm)
    .update(Buffer.from(`tree ${body.byteLength}\0`, "utf8"))
    .update(body)
    .digest();
}

export function publicPayloadTreeOid(entries, source = "staged") {
  const rules = PAYLOAD_SOURCES[source];
  const algorithm = payloadHashAlgorithm(entries, rules);
  const rootNode = { children: new Map() };
  for (const entry of entries) addPayloadEntry(rootNode, entry, rules);
  return treeHash(rootNode, algorithm).toString("hex");
}
