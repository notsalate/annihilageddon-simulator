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
  if (sourceFile.parseDiagnostics.length > 0) {
    return undefined;
  }
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
  const declaration = declarations[0];
  if (!hasUnambiguousTestSuiteExecution(sourceFile, declaration)) {
    return undefined;
  }
  const initializer = unwrapRegistryInitializer(declaration.initializer);
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

function hasUnambiguousTestSuiteExecution(sourceFile, declaration) {
  if (
    !ts.isVariableDeclarationList(declaration.parent) ||
    (declaration.parent.flags & ts.NodeFlags.Const) === 0
  ) {
    return false;
  }
  const completenessCalls = sourceFile.statements.flatMap((statement) => {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isCallExpression(statement.expression) ||
      !ts.isIdentifier(statement.expression.expression) ||
      statement.expression.expression.text !== "assertTestSuiteRegistryComplete"
    ) {
      return [];
    }
    return [statement.expression];
  });
  const executionLoops = sourceFile.statements.filter(ts.isForOfStatement);
  if (completenessCalls.length !== 1 || executionLoops.length !== 1) {
    return false;
  }
  const completenessReference = completenessCalls[0].arguments[0];
  const executionLoop = executionLoops[0];
  if (
    completenessReference === undefined ||
    !ts.isIdentifier(completenessReference) ||
    completenessReference.text !== "testSuites" ||
    !ts.isIdentifier(executionLoop.expression) ||
    executionLoop.expression.text !== "testSuites"
  ) {
    return false;
  }
  const suiteName = getForOfVariableName(executionLoop);
  if (
    suiteName === undefined ||
    !hasDirectTestSuiteSpawn(executionLoop.statement, suiteName)
  ) {
    return false;
  }

  const allowedReferences = new Set([
    declaration.name,
    completenessReference,
    executionLoop.expression,
  ]);
  let referencesAreClosed = true;
  function visit(node) {
    if (
      ts.isIdentifier(node) &&
      node.text === "testSuites" &&
      !allowedReferences.has(node)
    ) {
      referencesAreClosed = false;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return referencesAreClosed;
}

function getForOfVariableName(statement) {
  const initializer = statement.initializer;
  if (
    !ts.isVariableDeclarationList(initializer) ||
    (initializer.flags & ts.NodeFlags.Const) === 0 ||
    initializer.declarations.length !== 1
  ) {
    return undefined;
  }
  const declaration = initializer.declarations[0];
  return ts.isIdentifier(declaration.name) ? declaration.name.text : undefined;
}

function hasDirectTestSuiteSpawn(statement, suiteName) {
  if (!ts.isBlock(statement)) {
    return false;
  }
  const spawnCalls = statement.statements.flatMap((child) => {
    if (!ts.isVariableStatement(child)) {
      return [];
    }
    return child.declarationList.declarations.flatMap((declaration) =>
      declaration.initializer !== undefined &&
      ts.isCallExpression(declaration.initializer) &&
      ts.isIdentifier(declaration.initializer.expression) &&
      declaration.initializer.expression.text === "spawnSync"
        ? [declaration.initializer]
        : []
    );
  });
  if (spawnCalls.length !== 1) {
    return false;
  }
  const spawnArguments = spawnCalls[0].arguments;
  const commandArguments = spawnArguments[1];
  if (
    spawnArguments.length < 2 ||
    !ts.isPropertyAccessExpression(spawnArguments[0]) ||
    !ts.isIdentifier(spawnArguments[0].expression) ||
    spawnArguments[0].expression.text !== "process" ||
    spawnArguments[0].name.text !== "execPath" ||
    commandArguments === undefined ||
    !ts.isArrayLiteralExpression(commandArguments) ||
    commandArguments.elements.length !== 2 ||
    !ts.isStringLiteral(commandArguments.elements[0]) ||
    commandArguments.elements[0].text !== "--test"
  ) {
    return false;
  }
  const testPath = commandArguments.elements[1];
  return (
    ts.isCallExpression(testPath) &&
    ts.isPropertyAccessExpression(testPath.expression) &&
    ts.isIdentifier(testPath.expression.expression) &&
    testPath.expression.expression.text === "path" &&
    testPath.expression.name.text === "join" &&
    testPath.arguments.length === 2 &&
    ts.isIdentifier(testPath.arguments[1]) &&
    testPath.arguments[1].text === suiteName
  );
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
