import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { captureGuard, runGuardCli } from "./lib/guard-cli.mjs";

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

export function runTsSuppressionsGuard(rootPath = process.cwd()) {
  return captureGuard(() => {
    const rootDir = path.resolve(rootPath);
    const violations = TARGET_DIRS.flatMap((targetDir) =>
      collectViolations(path.join(rootDir, targetDir), rootDir)
    );

    if (violations.length === 0) {
      return "TS suppression guard: ok";
    }

    throw new Error(
      [
        ...violations.map(
          (violation) =>
            `${violation.filePath}:${violation.lineNumber} forbidden TS suppression pattern ${violation.pattern}`
        ),
        `TS suppression guard failed: ${violations.length} violation(s)`,
      ].join("\n")
    );
  });
}

runGuardCli(import.meta.url, () =>
  runTsSuppressionsGuard(process.argv[2] ?? process.cwd())
);

function collectViolations(absolutePath, rootDir) {
  const pathStat = statSync(absolutePath);
  if (pathStat.isDirectory()) {
    return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) =>
      collectViolations(path.join(absolutePath, entry.name), rootDir)
    );
  }

  if (!absolutePath.endsWith(".ts")) {
    return [];
  }

  return findForbiddenPatterns(absolutePath, rootDir);
}

function findForbiddenPatterns(absolutePath, rootDir) {
  const sourceText = readFileSync(absolutePath, "utf8");
  const displayPath = path
    .relative(rootDir, absolutePath)
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
