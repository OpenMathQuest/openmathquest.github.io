import { spawnSync } from "node:child_process";
import path from "node:path";

export function measurePowershellFunctionQuality(root, paths) {
  const script = path.join(root, "audit", "measure-powershell-function-quality.ps1");
  const powershell = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32", "WindowsPowerShell", "v1.0", "powershell.exe",
  );
  const environment = {
    ...process.env,
    PSModulePath: [
      path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "Modules"),
      path.join(process.env.ProgramFiles || "C:\\Program Files", "WindowsPowerShell", "Modules"),
    ].join(path.delimiter),
  };
  const powershellPaths = paths.filter((relativePath) => relativePath.endsWith(".ps1"));
  const pathListBase64 = Buffer.from(JSON.stringify(powershellPaths), "utf8").toString("base64");
  const result = spawnSync(powershell, [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", script,
    "-RepositoryRoot", root,
    "-PathListBase64", pathListBase64,
  ], { cwd: root, encoding: "utf8", env: environment, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`PowerShell function measurement failed:\n${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}
