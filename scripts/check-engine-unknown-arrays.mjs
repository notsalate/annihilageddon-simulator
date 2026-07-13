import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const TARGET_DIR = "src/engine";
const unknownArrayPattern =
  /\b(?:readonly\s+)?unknown\s*\[\]|\b(?:ReadonlyArray|Array)<\s*unknown\s*>/u;
const allowedViolations = [
  {
    filePath: "src/engine/data.ts",
    source: "needsData?: unknown[];",
    issue: "#64",
    expectedCount: 1,
  },
  {
    filePath: "src/engine/data.ts",
    source: "): unknown[] | undefined {",
    issue: "#64",
    expectedCount: 1,
  },
  {
    filePath: "src/engine/data.ts",
    source: "function isUnknownArray(value: unknown): value is unknown[] {",
    issue: "#64",
    expectedCount: 1,
  },
  {
    filePath: "src/engine/effective-values.ts",
    source:
      "function getControlledObjectEffects(view: ControlledObjectView): unknown[] {",
    issue: "#53",
    expectedCount: 1,
  },
  {
    filePath: "src/engine/effective-values.ts",
    source: "): unknown[] {",
    issue: "#54",
    expectedCount: 1,
  },
  {
    filePath: "src/engine/effective-values.ts",
    source:
      "function getWizardPropertyEffects(definition: TokenDefinition): unknown[] {",
    issue: "#52",
    expectedCount: 1,
  },
  {
    filePath: "src/engine/setup.ts",
    source: "effects: unknown[];",
    issues: ["#53", "#54"],
    expectedCount: 2,
  },
];

const violations = collectViolations(path.join(ROOT_DIR, TARGET_DIR));
const allowedCounts = countAllowedViolationsByKey(allowedViolations);
const allowedByKey = mapAllowedViolationsByKey(allowedViolations);
const violationCounts = countByViolationKey(violations);
const unusedAllowedViolations = collectStaleAllowedViolations(
  allowedCounts,
  allowedByKey,
  violationCounts
);
const untrackedViolations = collectUntrackedViolations(
  violations,
  allowedCounts,
  violationCounts
);

if (unusedAllowedViolations.length > 0) {
  for (const violation of unusedAllowedViolations) {
    console.error(
      `${violation.filePath} stale unknown-array exception (${violation.count} extra) for ${violation.issues}: ${violation.source}`
    );
  }
}

if (untrackedViolations.length > 0) {
  for (const violation of untrackedViolations) {
    console.error(
      `${violation.filePath}:${violation.lineNumber} untracked unknown-array pattern: ${violation.source}`
    );
  }
}

if (unusedAllowedViolations.length > 0 || untrackedViolations.length > 0) {
  console.error(
    `Engine unknown-array guard failed: ${untrackedViolations.length} untracked, ${unusedAllowedViolations.length} stale exception(s)`
  );
  process.exit(1);
}

console.log(
  `Engine unknown-array guard: ok (${violations.length} tracked exception(s))`
);

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

  return findViolations(absolutePath);
}

function findViolations(absolutePath) {
  const sourceText = readFileSync(absolutePath, "utf8");
  const displayPath = path
    .relative(ROOT_DIR, absolutePath)
    .replaceAll("\\", "/");
  const violations = [];

  for (const [index, line] of sourceText.split(/\r?\n/u).entries()) {
    const source = line.trim();
    if (unknownArrayPattern.test(source)) {
      violations.push({
        filePath: displayPath,
        lineNumber: index + 1,
        source,
      });
    }
  }

  return violations;
}

function countByViolationKey(items) {
  const counts = new Map();

  for (const item of items) {
    const key = createViolationKey(item);
    const count = counts.get(key);
    counts.set(key, count === undefined ? 1 : count + 1);
  }

  return counts;
}

function countAllowedViolationsByKey(allowedItems) {
  const counts = new Map();

  for (const item of allowedItems) {
    counts.set(createViolationKey(item), item.expectedCount);
  }

  return counts;
}

function mapAllowedViolationsByKey(allowedItems) {
  const allowedByKey = new Map();

  for (const item of allowedItems) {
    allowedByKey.set(createViolationKey(item), item);
  }

  return allowedByKey;
}

function collectStaleAllowedViolations(
  allowedCounts,
  allowedByKey,
  violationCounts
) {
  const staleViolations = [];

  for (const [key, allowedCount] of allowedCounts.entries()) {
    const violationCount = violationCounts.get(key) ?? 0;
    if (allowedCount <= violationCount) {
      continue;
    }

    const allowedViolation = allowedByKey.get(key);
    if (allowedViolation === undefined) {
      continue;
    }

    staleViolations.push({
      ...allowedViolation,
      count: allowedCount - violationCount,
      issues: collectAllowedIssues(allowedViolation).join(", "),
    });
  }

  return staleViolations;
}

function collectUntrackedViolations(
  violations,
  allowedCounts,
  violationCounts
) {
  const untrackedViolations = [];

  for (const [key, violationCount] of violationCounts.entries()) {
    const allowedCount = allowedCounts.get(key) ?? 0;
    if (violationCount <= allowedCount) {
      continue;
    }

    untrackedViolations.push(
      ...violations
        .filter((violation) => createViolationKey(violation) === key)
        .slice(allowedCount)
    );
  }

  return untrackedViolations;
}

function collectAllowedIssues(allowedViolation) {
  if (allowedViolation.issues !== undefined) {
    return allowedViolation.issues;
  }

  return [allowedViolation.issue];
}

function createViolationKey(violation) {
  return `${violation.filePath}\0${violation.source}`;
}
