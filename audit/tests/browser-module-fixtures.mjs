import path from "node:path";
import { pathToFileURL } from "node:url";
import { Linter } from "eslint";

export async function loadLocalBrowserModule(source, filename) {
  const linter = new Linter();
  const issues = linter.verify(source, [{ languageOptions: { sourceType: "module", ecmaVersion: "latest" }, rules: {} }]);
  if (issues.length) throw new Error(JSON.stringify(issues));
  const fileUrl = pathToFileURL(path.resolve(filename));
  const imports = linter.getSourceCode().ast.body.filter((node) => node.type === "ImportDeclaration");
  let rewritten = source;
  for (const node of imports.sort((left, right) => right.source.range[0] - left.source.range[0])) {
    if (!/^\.\.?\//u.test(node.source.value)) throw new Error("Expected a relative local browser-module import.");
    const specifier = JSON.stringify(new URL(node.source.value, fileUrl).href);
    rewritten = rewritten.slice(0, node.source.range[0]) + specifier + rewritten.slice(node.source.range[1]);
  }
  rewritten += "\n//# sourceURL=" + fileUrl.href + "\n";
  return import("data:text/javascript;base64," + Buffer.from(rewritten).toString("base64"));
}
