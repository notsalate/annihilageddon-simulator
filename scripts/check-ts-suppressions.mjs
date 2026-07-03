import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const TARGET_DIRS = ["src", "tests"];
const forbiddenPatterns = [
  {
    label: "@ts-ignore",
    regex: /@ts-ignore/giu,
  },
  {
    label: "@ts-expect-error",
    regex: /@ts-expect-error/giu,
  },
  {
    label: "as any",
    regex: /\bas\s+any\b/giu,
  },
];

const violations = TARGET_DIRS.flatMap((targetDir) =>
  collectViolations(path.join(ROOT_DIR, targetDir))
);

if (violations.length === 0) {
  console.log("TS suppression guard: ok");
  process.exit(0);
}

for (const violation of violations) {
  console.error(
    `${violation.filePath}:${violation.lineNumber} forbidden TS suppression pattern ${violation.pattern}`
  );
}

console.error(`TS suppression guard failed: ${violations.length} violation(s)`);
process.exit(1);

function collectViolations(absolutePath) {
  const pathStat = statSync(absolutePath);
  if (pathStat.isDirectory()) {
    return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) =>
      collectViolations(path.join(absolutePath, entry.name))
    );
  }

  if (!absolutePath.endsWith(".ts")) {
    return [];
  }

  return findForbiddenPatterns(absolutePath);
}

function findForbiddenPatterns(absolutePath) {
  const sourceText = readFileSync(absolutePath, "utf8");
  const displayPath = path
    .relative(ROOT_DIR, absolutePath)
    .replaceAll("\\", "/");
  const violations = [];

  for (const [index, line] of sourceText.split(/\r?\n/u).entries()) {
    for (const pattern of forbiddenPatterns) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(line)) {
        violations.push({
          filePath: displayPath,
          lineNumber: index + 1,
          pattern: pattern.label,
        });
      }
    }
  }

  return violations;
}
