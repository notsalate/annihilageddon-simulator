import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";

const frozenActiveRequirementIds = [
  "REQ-176-AC01",
  "REQ-R3-09-AC02",
  "REQ-R3-09-AC03",
];
const testSuitesByCommit = new Map();
const canonicalTestSuiteRegistrySha256 =
  "124256f3248b0b2d36c6f7d1e2fa761f747076bd23957e786b038162cc5b59d3";
const directTestSuiteExecutionDependencyNames = new Set([
  "compiledTestsRoot",
  "path",
  "process",
  "spawnSync",
]);

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
  const runnerResult = spawnSync(
    "git",
    ["show", `${codeCommit}:tests/run-tests.ts`],
    { cwd: process.cwd(), encoding: "utf8" }
  );
  const helperResult = spawnSync(
    "git",
    ["show", `${codeCommit}:tests/test-suite-registry.ts`],
    { cwd: process.cwd(), encoding: "utf8" }
  );
  const testSuites =
    runnerResult.status === 0 &&
    helperResult.status === 0 &&
    createHash("sha256").update(helperResult.stdout).digest("hex") ===
      canonicalTestSuiteRegistrySha256
      ? parseTestSuiteRegistry(runnerResult.stdout)
      : undefined;
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
    if (testSuites.has(element.text)) {
      return undefined;
    }
    testSuites.add(element.text);
  }
  return testSuites;
}

function hasUnambiguousTestSuiteExecution(sourceFile, declaration) {
  if (
    !ts.isVariableDeclarationList(declaration.parent) ||
    (declaration.parent.flags & ts.NodeFlags.Const) === 0 ||
    declaration.parent.declarations.length !== 1 ||
    !ts.isVariableStatement(declaration.parent.parent) ||
    !hasNamedImport(sourceFile, "node:child_process", "spawnSync") ||
    !hasDefaultImport(sourceFile, "node:path", "path") ||
    !hasNamedImport(
      sourceFile,
      "./test-suite-registry.js",
      "assertTestSuiteRegistryComplete"
    ) ||
    !hasNamedImport(
      sourceFile,
      "./test-suite-registry.js",
      "collectCompiledTestSuites"
    ) ||
    sourceFile.statements.filter(ts.isImportDeclaration).length !== 3
  ) {
    return false;
  }
  const registryStatement = declaration.parent.parent;
  const compiledRootStatements = sourceFile.statements.filter(
    (statement) =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (candidate) =>
          ts.isIdentifier(candidate.name) &&
          candidate.name.text === "compiledTestsRoot"
      )
  );
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
  if (
    compiledRootStatements.length !== 1 ||
    completenessCalls.length !== 1 ||
    executionLoops.length !== 1
  ) {
    return false;
  }
  const compiledRootStatement = compiledRootStatements[0];
  if (
    (compiledRootStatement.declarationList.flags & ts.NodeFlags.Const) === 0 ||
    compiledRootStatement.declarationList.declarations.length !== 1 ||
    !hasDirectCompiledTestsRoot(
      compiledRootStatement.declarationList.declarations[0]
    )
  ) {
    return false;
  }
  const completenessReference = completenessCalls[0].arguments[0];
  const completenessStatement = completenessCalls[0].parent;
  const executionLoop = executionLoops[0];
  if (
    completenessReference === undefined ||
    !ts.isIdentifier(completenessReference) ||
    completenessReference.text !== "testSuites" ||
    !hasDirectCompletenessInventory(completenessCalls[0]) ||
    !ts.isExpressionStatement(completenessStatement) ||
    !ts.isIdentifier(executionLoop.expression) ||
    executionLoop.expression.text !== "testSuites"
  ) {
    return false;
  }
  const allowedStatements = new Set([
    registryStatement,
    compiledRootStatement,
    completenessStatement,
    executionLoop,
  ]);
  if (
    sourceFile.statements.some(
      (statement) =>
        !ts.isImportDeclaration(statement) && !allowedStatements.has(statement)
    ) ||
    sourceFile.statements.indexOf(registryStatement) >=
      sourceFile.statements.indexOf(compiledRootStatement) ||
    sourceFile.statements.indexOf(compiledRootStatement) >=
      sourceFile.statements.indexOf(completenessStatement) ||
    sourceFile.statements.indexOf(completenessStatement) >=
      sourceFile.statements.indexOf(executionLoop)
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

function hasNamedImport(sourceFile, moduleName, importedName) {
  return sourceFile.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== moduleName ||
      statement.importClause?.namedBindings === undefined ||
      statement.importClause.isTypeOnly ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      return false;
    }
    return statement.importClause.namedBindings.elements.some(
      (element) =>
        !element.isTypeOnly &&
        (element.propertyName?.text ?? element.name.text) === importedName &&
        element.name.text === importedName
    );
  });
}

function hasDefaultImport(sourceFile, moduleName, localName) {
  return sourceFile.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === moduleName &&
      statement.importClause?.isTypeOnly === false &&
      statement.importClause?.name?.text === localName
  );
}

function hasDirectCompletenessInventory(call) {
  const inventory = call.arguments[1];
  return (
    call.arguments.length === 2 &&
    inventory !== undefined &&
    ts.isCallExpression(inventory) &&
    ts.isIdentifier(inventory.expression) &&
    inventory.expression.text === "collectCompiledTestSuites" &&
    inventory.arguments.length === 1 &&
    ts.isIdentifier(inventory.arguments[0]) &&
    inventory.arguments[0].text === "compiledTestsRoot"
  );
}

function hasDirectCompiledTestsRoot(declaration) {
  const initializer = declaration.initializer;
  if (
    !ts.isIdentifier(declaration.name) ||
    declaration.name.text !== "compiledTestsRoot" ||
    initializer === undefined ||
    !ts.isCallExpression(initializer) ||
    !ts.isPropertyAccessExpression(initializer.expression) ||
    !ts.isIdentifier(initializer.expression.expression) ||
    initializer.expression.expression.text !== "path" ||
    initializer.expression.name.text !== "join" ||
    initializer.arguments.length !== 3
  ) {
    return false;
  }
  const workingDirectory = initializer.arguments[0];
  return (
    ts.isCallExpression(workingDirectory) &&
    ts.isPropertyAccessExpression(workingDirectory.expression) &&
    ts.isIdentifier(workingDirectory.expression.expression) &&
    workingDirectory.expression.expression.text === "process" &&
    workingDirectory.expression.name.text === "cwd" &&
    workingDirectory.arguments.length === 0 &&
    ts.isStringLiteral(initializer.arguments[1]) &&
    initializer.arguments[1].text === "dist" &&
    ts.isStringLiteral(initializer.arguments[2]) &&
    initializer.arguments[2].text === "tests"
  );
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
  if (
    directTestSuiteExecutionDependencyNames.has(suiteName) ||
    !ts.isBlock(statement) ||
    statement.statements.length === 0
  ) {
    return false;
  }
  const firstStatement = statement.statements[0];
  if (
    !ts.isVariableStatement(firstStatement) ||
    (firstStatement.declarationList.flags & ts.NodeFlags.Const) === 0 ||
    firstStatement.declarationList.declarations.length !== 1
  ) {
    return false;
  }
  const resultDeclaration = firstStatement.declarationList.declarations[0];
  if (
    !ts.isIdentifier(resultDeclaration.name) ||
    resultDeclaration.initializer === undefined ||
    !ts.isCallExpression(resultDeclaration.initializer) ||
    !ts.isIdentifier(resultDeclaration.initializer.expression) ||
    resultDeclaration.initializer.expression.text !== "spawnSync"
  ) {
    return false;
  }
  const resultName = resultDeclaration.name.text;
  if (hasIdentifierReference(resultDeclaration.initializer, resultName)) {
    return false;
  }
  const spawnArguments = resultDeclaration.initializer.arguments;
  const commandArguments = spawnArguments[1];
  if (
    !hasSafeSpawnOptions(spawnArguments) ||
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
  const launchesCurrentSuite =
    ts.isCallExpression(testPath) &&
    ts.isPropertyAccessExpression(testPath.expression) &&
    ts.isIdentifier(testPath.expression.expression) &&
    testPath.expression.expression.text === "path" &&
    testPath.expression.name.text === "join" &&
    testPath.arguments.length === 2 &&
    ts.isIdentifier(testPath.arguments[0]) &&
    testPath.arguments[0].text === "compiledTestsRoot" &&
    ts.isIdentifier(testPath.arguments[1]) &&
    testPath.arguments[1].text === suiteName;
  return (
    launchesCurrentSuite && hasDirectSpawnFailureHandling(statement, resultName)
  );
}

function hasIdentifierReference(node, identifierName) {
  let found = false;
  function visit(child) {
    if (ts.isIdentifier(child) && child.text === identifierName) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
}

function hasSafeSpawnOptions(spawnArguments) {
  if (spawnArguments.length === 2) {
    return true;
  }
  if (spawnArguments.length !== 3) {
    return false;
  }
  const options = spawnArguments[2];
  if (
    !ts.isObjectLiteralExpression(options) ||
    options.properties.length !== 1
  ) {
    return false;
  }
  const stdio = options.properties[0];
  return (
    ts.isPropertyAssignment(stdio) &&
    ((ts.isIdentifier(stdio.name) && stdio.name.text === "stdio") ||
      (ts.isStringLiteral(stdio.name) && stdio.name.text === "stdio")) &&
    ts.isStringLiteral(stdio.initializer) &&
    stdio.initializer.text === "inherit"
  );
}

function hasDirectSpawnFailureHandling(statement, resultName) {
  if (statement.statements.length !== 3) {
    return false;
  }
  const errorBranch = statement.statements[1];
  const statusBranch = statement.statements[2];
  return (
    ts.isIfStatement(errorBranch) &&
    errorBranch.elseStatement === undefined &&
    isResultPropertyInequality(
      errorBranch.expression,
      resultName,
      "error",
      ts.isIdentifier,
      "undefined"
    ) &&
    ts.isBlock(errorBranch.thenStatement) &&
    errorBranch.thenStatement.statements.length === 1 &&
    ts.isThrowStatement(errorBranch.thenStatement.statements[0]) &&
    isResultProperty(
      errorBranch.thenStatement.statements[0].expression,
      resultName,
      "error"
    ) &&
    ts.isIfStatement(statusBranch) &&
    statusBranch.elseStatement === undefined &&
    isResultPropertyInequality(
      statusBranch.expression,
      resultName,
      "status",
      ts.isNumericLiteral,
      "0"
    ) &&
    ts.isBlock(statusBranch.thenStatement) &&
    statusBranch.thenStatement.statements.length === 1 &&
    isFailureExitStatement(statusBranch.thenStatement.statements[0], resultName)
  );
}

function isResultPropertyInequality(
  expression,
  resultName,
  propertyName,
  isExpectedRight,
  expectedRightText
) {
  return (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind ===
      ts.SyntaxKind.ExclamationEqualsEqualsToken &&
    isResultProperty(expression.left, resultName, propertyName) &&
    isExpectedRight(expression.right) &&
    expression.right.text === expectedRightText
  );
}

function isResultProperty(expression, resultName, propertyName) {
  return (
    expression !== undefined &&
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === resultName &&
    expression.name.text === propertyName
  );
}

function isFailureExitStatement(statement, resultName) {
  if (
    !ts.isExpressionStatement(statement) ||
    !ts.isCallExpression(statement.expression) ||
    !ts.isPropertyAccessExpression(statement.expression.expression) ||
    !ts.isIdentifier(statement.expression.expression.expression) ||
    statement.expression.expression.expression.text !== "process" ||
    statement.expression.expression.name.text !== "exit" ||
    statement.expression.arguments.length !== 1
  ) {
    return false;
  }
  const exitStatus = statement.expression.arguments[0];
  return (
    ts.isBinaryExpression(exitStatus) &&
    exitStatus.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
    isResultProperty(exitStatus.left, resultName, "status") &&
    ts.isNumericLiteral(exitStatus.right) &&
    exitStatus.right.text === "1"
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
