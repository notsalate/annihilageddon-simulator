import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const frozenActiveRequirementIds = [
  "REQ-176-AC01",
  "REQ-R3-09-AC02",
  "REQ-R3-09-AC03",
];
const testSuitesByCommit = new Map();

const manifestPath = process.argv[2];

if (manifestPath === undefined) {
  console.error(
    "usage: node scripts/check-completion-reconciliation.mjs <manifest.json>"
  );
  process.exitCode = 1;
} else {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    console.error(`cannot read reconciliation manifest: ${String(error)}`);
    process.exitCode = 1;
  }

  if (manifest !== undefined) {
    const errors = validateManifest(manifest);
    if (errors.length > 0) {
      for (const error of errors) {
        console.error(error);
      }
      process.exitCode = 1;
    }
  }
}

function validateManifest(manifest) {
  const errors = [];
  if (!isRecord(manifest)) {
    return ["manifest must be an object"];
  }

  if (!isSha(manifest.codeSha)) {
    errors.push("manifest.codeSha must be a full 40-character commit SHA");
  }
  if (!isSha(manifest.rangeStart)) {
    errors.push("manifest.rangeStart must be a full 40-character commit SHA");
  }
  if (!Array.isArray(manifest.requirements)) {
    return [...errors, "manifest.requirements must be an array"];
  }
  validateFrozenActiveRequirements(manifest.requirements, errors);

  const codeCommit = resolveCommit(
    manifest.codeSha,
    "manifest.codeSha",
    errors
  );
  const rangeStart = resolveCommit(
    manifest.rangeStart,
    "manifest.rangeStart",
    errors
  );
  if (
    codeCommit !== undefined &&
    rangeStart !== undefined &&
    !isAncestor(rangeStart, codeCommit)
  ) {
    errors.push("manifest.rangeStart must be an ancestor of manifest.codeSha");
  }

  for (const requirement of manifest.requirements) {
    if (!isRecord(requirement)) {
      errors.push("requirement must be an object");
      continue;
    }
    if (typeof requirement.id !== "string") {
      errors.push("requirement.id must be a string");
      continue;
    }
    if (requirement.active !== true) {
      continue;
    }
    if (requirement.codeSha !== manifest.codeSha) {
      errors.push(`${requirement.id}: codeSha must match manifest.codeSha`);
    }
    validateTestReferences(requirement, codeCommit, errors);
    validateFixCommits(requirement, rangeStart, codeCommit, errors);
    if (requirement.status === "unresolved") {
      if (manifest.overallVerdict !== "есть открытые требования") {
        errors.push(
          `${requirement.id}: active requirement remains unresolved${formatFindings(requirement.findings)}`
        );
      }
      continue;
    }
    if (requirement.status !== "resolved") {
      errors.push(
        `${requirement.id}: active requirement needs resolved or unresolved status`
      );
      continue;
    }
    for (const fieldName of ["findings", "fixCommits", "tests"]) {
      if (!hasEntries(requirement[fieldName])) {
        errors.push(
          `${requirement.id}: resolved requirement needs ${fieldName}`
        );
      }
    }
  }

  return errors;
}

function validateFrozenActiveRequirements(requirements, errors) {
  const activeRequirementIds = requirements
    .filter(
      (requirement) =>
        isRecord(requirement) &&
        requirement.active === true &&
        typeof requirement.id === "string"
    )
    .map((requirement) => requirement.id)
    .sort();
  const expectedRequirementIds = [...frozenActiveRequirementIds].sort();
  if (
    activeRequirementIds.length !== expectedRequirementIds.length ||
    activeRequirementIds.some(
      (requirementId, index) => requirementId !== expectedRequirementIds[index]
    )
  ) {
    errors.push(
      `manifest.requirements must contain exactly the frozen active requirements: ${frozenActiveRequirementIds.join(", ")}`
    );
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function resolveCommit(reference, label, errors) {
  if (typeof reference !== "string") {
    errors.push(`${label} must resolve to a commit`);
    return undefined;
  }
  const result = spawnSync(
    "git",
    ["rev-parse", "--verify", `${reference}^{commit}`],
    { cwd: process.cwd(), encoding: "utf8" }
  );
  if (result.status !== 0) {
    errors.push(`${label} must resolve to a commit`);
    return undefined;
  }
  return result.stdout.trim();
}

function isAncestor(ancestor, descendant) {
  return (
    spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: process.cwd(),
    }).status === 0
  );
}

function validateTestReferences(requirement, codeCommit, errors) {
  if (!Array.isArray(requirement.tests) || codeCommit === undefined) {
    return;
  }
  for (const testReference of requirement.tests) {
    if (!isRegisteredTestReference(testReference, codeCommit)) {
      errors.push(
        `${requirement.id}: test reference ${String(testReference)} must exist and be registered at manifest.codeSha`
      );
    }
  }
}

function validateFixCommits(requirement, rangeStart, codeCommit, errors) {
  if (!Array.isArray(requirement.fixCommits)) {
    return;
  }
  for (const fixCommit of requirement.fixCommits) {
    const resolvedFixCommit = resolveCommit(
      fixCommit,
      `${requirement.id}: fix commit ${String(fixCommit)}`,
      errors
    );
    if (
      resolvedFixCommit !== undefined &&
      codeCommit !== undefined &&
      !isAncestor(resolvedFixCommit, codeCommit)
    ) {
      errors.push(
        `${requirement.id}: fix commit ${String(fixCommit)} must be an ancestor of manifest.codeSha`
      );
    }
    if (
      resolvedFixCommit !== undefined &&
      rangeStart !== undefined &&
      !isAncestor(rangeStart, resolvedFixCommit)
    ) {
      errors.push(
        `${requirement.id}: fix commit ${String(fixCommit)} must be inside manifest range`
      );
    }
  }
}

function isRegisteredTestReference(testReference, codeCommit) {
  if (
    typeof testReference !== "string" ||
    !testReference.startsWith("tests/") ||
    !testReference.endsWith(".test.ts") ||
    testReference.includes("\\") ||
    testReference
      .split("/")
      .some((segment) => segment === "." || segment === "..")
  ) {
    return false;
  }
  const testObject = spawnSync(
    "git",
    ["cat-file", "-e", `${codeCommit}:${testReference}`],
    { cwd: process.cwd() }
  );
  if (testObject.status !== 0) {
    return false;
  }
  const compiledTestPath = testReference
    .slice("tests/".length)
    .replace(/\.ts$/, ".js");
  return getRegisteredTestSuites(codeCommit)?.has(compiledTestPath) === true;
}

function getRegisteredTestSuites(codeCommit) {
  if (testSuitesByCommit.has(codeCommit)) {
    return testSuitesByCommit.get(codeCommit);
  }
  const result = spawnSync(
    "git",
    ["show", `${codeCommit}:tests/run-tests.ts`],
    { cwd: process.cwd(), encoding: "utf8" }
  );
  const testSuites =
    result.status === 0 ? parseTestSuiteRegistry(result.stdout) : undefined;
  testSuitesByCommit.set(codeCommit, testSuites);
  return testSuites;
}

function parseTestSuiteRegistry(sourceText) {
  const sourceFile = ts.createSourceFile(
    "tests/run-tests.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const declarations = sourceFile.statements.flatMap((statement) =>
    ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.filter(
          (declaration) =>
            ts.isIdentifier(declaration.name) &&
            declaration.name.text === "testSuites"
        )
      : []
  );
  if (declarations.length !== 1) {
    return undefined;
  }
  const initializer = unwrapRegistryInitializer(declarations[0].initializer);
  if (initializer === undefined || !ts.isArrayLiteralExpression(initializer)) {
    return undefined;
  }
  const testSuites = new Set();
  for (const element of initializer.elements) {
    if (!ts.isStringLiteralLike(element)) {
      return undefined;
    }
    testSuites.add(element.text);
  }
  return testSuites;
}

function unwrapRegistryInitializer(expression) {
  let current = expression;
  while (
    current !== undefined &&
    (ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isParenthesizedExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function hasEntries(value) {
  return Array.isArray(value) && value.length > 0;
}

function formatFindings(value) {
  return hasEntries(value) ? ` (${value.join(", ")})` : "";
}
