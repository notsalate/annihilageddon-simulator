import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const engineDir = path.join(rootDir, "src/engine");
const pattern = /as Record<string, unknown>/u;
const allowed = new Set([
  "src/engine/controlled-power.ts:64",
  "src/engine/setup.ts:645",
]);
const violations = [];

for (const filePath of listTypeScriptFiles(engineDir)) {
  const relativePath = path.relative(rootDir, filePath).replaceAll("\\", "/");
  for (const [index, line] of readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .entries()) {
    if (pattern.test(line) && !allowed.has(`${relativePath}:${index + 1}`)) {
      violations.push(`${relativePath}:${index + 1}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Untyped runtime object access: ${violations.join(", ")}`);
}

console.log(`Engine typed-access guard: ok (${allowed.size} exception(s))`);

function listTypeScriptFiles(targetPath) {
  if (statSync(targetPath).isFile()) {
    return targetPath.endsWith(".ts") ? [targetPath] : [];
  }

  return readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) =>
    listTypeScriptFiles(path.join(targetPath, entry.name))
  );
}
