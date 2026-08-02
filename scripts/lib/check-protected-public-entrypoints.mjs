import path from "node:path";
import ts from "typescript";

/**
 * @param {{
 *   rootDir: string;
 *   tsconfigPath: string;
 *   entrypoints: readonly string[];
 *   protectedModules: ReadonlyMap<string, "*" | ReadonlySet<string>>;
 *   approvedValueImporters: ReadonlyMap<string, ReadonlySet<string>>;
 *   trustedAdapterValueExports: ReadonlyMap<string, ReadonlySet<string>>;
 * }} options
 * @returns {readonly {
 *   kind: "configuration" | "import-edge" | "public-export";
 *   file: string;
 *   exportedName?: string;
 *   originFile?: string;
 *   originName?: string;
 *   message: string;
 * }[]}
 */
export function checkProtectedPublicEntrypoints(options) {
  const config = ts.readConfigFile(options.tsconfigPath, ts.sys.readFile);
  if (config.error !== undefined) {
    return [toConfigurationViolation(config.error, options.rootDir)];
  }

  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(options.tsconfigPath)
  );
  if (parsed.errors.length > 0) {
    return parsed.errors.map((diagnostic) =>
      toConfigurationViolation(diagnostic, options.rootDir)
    );
  }

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
  return analyzeProgram(program, options);
}

function analyzeProgram(program, options) {
  const configurationViolations = [];
  const entrypointFiles = options.entrypoints.map((entrypoint) => {
    const sourceFile = findSourceFile(program, options.rootDir, entrypoint);
    if (sourceFile === undefined) {
      configurationViolations.push({
        kind: "configuration",
        file: normalizeRelativePath(options.rootDir, entrypoint),
        message: `protected public entrypoint is missing: ${entrypoint}`,
      });
    }
    return sourceFile;
  });

  for (const protectedModule of options.protectedModules.keys()) {
    if (
      findSourceFile(program, options.rootDir, protectedModule) === undefined
    ) {
      configurationViolations.push({
        kind: "configuration",
        file: normalizeRelativePath(options.rootDir, protectedModule),
        message: `protected module is missing: ${protectedModule}`,
      });
    }
  }
  if (configurationViolations.length > 0) {
    return configurationViolations;
  }

  const checker = program.getTypeChecker();
  const violations = [];
  const seenViolations = new Set();
  const policy = { ...options, checker };

  for (const sourceFile of program.getSourceFiles()) {
    if (!isSourceUnderRoot(sourceFile, options.rootDir)) {
      continue;
    }
    collectImportEdgeViolations(sourceFile, policy, violations, seenViolations);
  }

  for (const sourceFile of entrypointFiles) {
    if (sourceFile === undefined) {
      continue;
    }
    collectPublicExportViolations(
      sourceFile,
      policy,
      violations,
      seenViolations
    );
  }

  return violations;
}

function collectImportEdgeViolations(sourceFile, policy, violations, seen) {
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      statement.importClause === undefined
    ) {
      continue;
    }
    if (statement.importClause.isTypeOnly) {
      continue;
    }

    const importerPath = displayPath(policy.rootDir, sourceFile.fileName);
    for (const origin of collectImportedValues(statement, policy.checker)) {
      if (
        !isProtectedValue(origin, policy) ||
        isApprovedValueImporter(importerPath, origin, policy)
      ) {
        continue;
      }
      addViolation(
        violations,
        seen,
        importEdgeViolation(importerPath, origin, policy.rootDir)
      );
    }
  }
}

function collectPublicExportViolations(sourceFile, policy, violations, seen) {
  const moduleSymbol = policy.checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol === undefined) {
    return;
  }

  const file = displayPath(policy.rootDir, sourceFile.fileName);
  for (const exported of collectExportedValues(policy.checker, moduleSymbol)) {
    const protectedValue = isProtectedValue(exported.origin, policy);
    const adapterTrace = traceTrustedAdapterOrigin(
      policy.checker,
      exported.exportedOrigin ?? exported.origin,
      policy
    );
    const adapterOrigin =
      adapterTrace.status === "found" ? adapterTrace.origin : undefined;
    const originFile =
      adapterOrigin === undefined ? undefined : originSourceFile(adapterOrigin);
    const adapterExports =
      originFile === undefined
        ? undefined
        : policy.trustedAdapterValueExports.get(
            displayPath(policy.rootDir, originFile.fileName)
          );
    const approvedAdapterExport =
      adapterOrigin !== undefined &&
      (adapterExports?.has(originName(adapterOrigin)) ?? false);
    if (
      !protectedValue &&
      adapterTrace.status !== "unresolved" &&
      (adapterExports === undefined || approvedAdapterExport)
    ) {
      continue;
    }
    if (protectedValue && approvedAdapterExport) {
      continue;
    }
    addViolation(
      violations,
      seen,
      publicExportViolation(
        file,
        exported,
        policy.rootDir,
        adapterOrigin ?? exported.origin
      )
    );
  }
}

function collectImportedValues(importDeclaration, checker) {
  const importClause = importDeclaration.importClause;
  if (importClause === undefined) {
    return [];
  }

  const values = [];
  if (importClause.name !== undefined) {
    values.push(
      ...collectValuesForSymbol(
        checker,
        checker.getSymbolAtLocation(importClause.name)
      )
    );
  }

  const bindings = importClause.namedBindings;
  if (bindings === undefined) {
    return values;
  }
  if (ts.isNamespaceImport(bindings)) {
    const moduleSymbol = checker.getSymbolAtLocation(
      importDeclaration.moduleSpecifier
    );
    if (moduleSymbol !== undefined) {
      values.push(...collectExportedOrigins(checker, moduleSymbol));
    }
    return values;
  }

  for (const element of bindings.elements) {
    if (!element.isTypeOnly) {
      values.push(
        ...collectValuesForSymbol(
          checker,
          checker.getSymbolAtLocation(element.name)
        )
      );
    }
  }
  return values;
}

function collectExportedValues(checker, moduleSymbol, visited = new Set()) {
  const resolvedModule = resolveAlias(checker, moduleSymbol);
  if (visited.has(resolvedModule)) {
    return [];
  }
  visited.add(resolvedModule);

  return checker.getExportsOfModule(resolvedModule).flatMap((exported) => {
    const exportedOrigin = resolveAlias(checker, exported);
    const origins = collectValuesForSymbol(checker, exported, new Set(visited));
    return origins.map((origin) => ({
      exportedName: exported.getName(),
      origin,
      exportedOrigin,
    }));
  });
}

function collectExportedOrigins(checker, moduleSymbol, visited = new Set()) {
  return collectExportedValues(checker, moduleSymbol, visited).map(
    ({ origin }) => origin
  );
}

function collectValuesForSymbol(checker, symbol, visited = new Set()) {
  if (symbol === undefined) {
    return [];
  }
  const origin = resolveAlias(checker, symbol);
  if (visited.has(origin)) {
    return [];
  }

  if ((origin.flags & ts.SymbolFlags.ValueModule) !== 0) {
    return collectExportedOrigins(checker, origin, visited);
  }
  visited.add(origin);
  if ((origin.flags & ts.SymbolFlags.Value) !== 0) {
    const valueDeclarations = origin.declarations ?? [];
    const initializerOrigins = valueDeclarations.flatMap((declaration) => {
      if (
        !ts.isVariableDeclaration(declaration) ||
        declaration.initializer === undefined
      ) {
        return [];
      }
      return collectValuesForSymbol(
        checker,
        staticInitializerSymbol(checker, declaration.initializer),
        visited
      );
    });
    return initializerOrigins.length > 0 ? initializerOrigins : [origin];
  }
  return [];
}

function traceTrustedAdapterOrigin(
  checker,
  symbol,
  policy,
  visited = new Set()
) {
  if (symbol === undefined) {
    return { status: "unresolved" };
  }
  const origin = resolveAlias(checker, symbol);
  if (visited.has(origin)) {
    return { status: "unresolved" };
  }
  visited.add(origin);

  const originFile = originSourceFile(origin);
  if (
    originFile !== undefined &&
    policy.trustedAdapterValueExports.has(
      displayPath(policy.rootDir, originFile.fileName)
    )
  ) {
    return { status: "found", origin };
  }

  for (const declaration of origin.declarations ?? []) {
    const staticOrigins = collectStaticOriginSymbols(checker, declaration);
    if (staticOrigins.attempted && staticOrigins.symbols.length === 0) {
      return { status: "unresolved" };
    }
    for (const staticOrigin of staticOrigins.symbols) {
      const traced = traceTrustedAdapterOrigin(
        checker,
        staticOrigin,
        policy,
        visited
      );
      if (traced.status !== "clear") {
        return traced;
      }
    }
  }
  return { status: "clear" };
}

function collectStaticOriginSymbols(checker, declaration) {
  if (ts.isVariableDeclaration(declaration)) {
    return staticExpressionOriginSymbols(checker, declaration.initializer);
  }
  if (ts.isBindingElement(declaration)) {
    return bindingElementOriginSymbols(checker, declaration);
  }
  if (ts.isFunctionDeclaration(declaration)) {
    return directWrapperOriginSymbols(checker, declaration);
  }
  if (ts.isPropertyAssignment(declaration)) {
    return staticExpressionOriginSymbols(checker, declaration.initializer);
  }
  if (ts.isShorthandPropertyAssignment(declaration)) {
    const valueSymbol = checker.getShorthandAssignmentValueSymbol(declaration);
    return {
      attempted: true,
      symbols: valueSymbol === undefined ? [] : [valueSymbol],
    };
  }
  return { attempted: false, symbols: [] };
}

function staticExpressionOriginSymbols(checker, expression) {
  if (expression === undefined) {
    return { attempted: false, symbols: [] };
  }
  const directSymbol = staticInitializerSymbol(checker, expression);
  if (directSymbol !== undefined) {
    return { attempted: true, symbols: [directSymbol] };
  }
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return directWrapperOriginSymbols(checker, expression);
  }
  return { attempted: false, symbols: [] };
}

function bindingElementOriginSymbols(checker, declaration) {
  if (
    declaration.dotDotDotToken !== undefined ||
    declaration.initializer !== undefined ||
    !ts.isIdentifier(declaration.name) ||
    !ts.isObjectBindingPattern(declaration.parent)
  ) {
    return { attempted: true, symbols: [] };
  }
  const variableDeclaration = declaration.parent.parent;
  if (
    !ts.isVariableDeclaration(variableDeclaration) ||
    variableDeclaration.initializer === undefined
  ) {
    return { attempted: true, symbols: [] };
  }
  const propertyName = declaration.propertyName ?? declaration.name;
  if (
    !ts.isIdentifier(propertyName) &&
    !ts.isStringLiteral(propertyName) &&
    !ts.isNumericLiteral(propertyName)
  ) {
    return { attempted: true, symbols: [] };
  }
  const propertySymbol = checker.getPropertyOfType(
    checker.getTypeAtLocation(variableDeclaration.initializer),
    propertyName.text
  );
  return {
    attempted: true,
    symbols: propertySymbol === undefined ? [] : [propertySymbol],
  };
}

function directWrapperOriginSymbols(checker, declaration) {
  const body = declaration.body;
  if (body === undefined) {
    return { attempted: false, symbols: [] };
  }
  let expression;
  if (!ts.isBlock(body)) {
    expression = body;
  } else if (body.statements.length === 1) {
    const statement = body.statements[0];
    if (ts.isReturnStatement(statement)) {
      expression = statement.expression;
    } else if (ts.isExpressionStatement(statement)) {
      expression = statement.expression;
    }
  }
  if (expression === undefined || !ts.isCallExpression(expression)) {
    return { attempted: false, symbols: [] };
  }
  const calleeSymbol = staticInitializerSymbol(checker, expression.expression);
  return {
    attempted: true,
    symbols: calleeSymbol === undefined ? [] : [calleeSymbol],
  };
}

function staticInitializerSymbol(checker, initializer) {
  if (ts.isIdentifier(initializer)) {
    return checker.getSymbolAtLocation(initializer);
  }
  if (ts.isPropertyAccessExpression(initializer)) {
    return checker.getSymbolAtLocation(initializer.name);
  }
  if (
    ts.isElementAccessExpression(initializer) &&
    initializer.argumentExpression !== undefined &&
    ts.isStringLiteral(initializer.argumentExpression)
  ) {
    return checker.getPropertyOfType(
      checker.getTypeAtLocation(initializer.expression),
      initializer.argumentExpression.text
    );
  }
  return undefined;
}

function resolveAlias(checker, symbol) {
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

function isProtectedValue(origin, policy) {
  const originFile = originSourceFile(origin);
  if (originFile === undefined) {
    return false;
  }
  const protectedNames = policy.protectedModules.get(
    displayPath(policy.rootDir, originFile.fileName)
  );
  if (protectedNames === undefined) {
    return false;
  }
  return protectedNames === "*" || protectedNames.has(originName(origin));
}

function isApprovedValueImporter(importerPath, origin, policy) {
  const originFile = originSourceFile(origin);
  if (originFile === undefined) {
    return false;
  }
  const originPath = displayPath(policy.rootDir, originFile.fileName);
  const name = originName(origin);
  const approvedOrigins = policy.approvedValueImporters.get(importerPath);
  if (
    approvedOrigins?.has(originPath) ||
    approvedOrigins?.has(`${originPath}#${name}`) ||
    approvedOrigins?.has(name)
  ) {
    return true;
  }
  return (
    policy.approvedValueImporters.get(originPath)?.has(importerPath) ?? false
  );
}

function originSourceFile(symbol) {
  return (symbol.valueDeclaration ?? symbol.declarations?.[0])?.getSourceFile();
}

function originName(symbol) {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (
    declaration !== undefined &&
    "name" in declaration &&
    declaration.name !== undefined
  ) {
    return declaration.name.getText();
  }
  return symbol.getName();
}

function importEdgeViolation(file, origin, rootDir) {
  const originFile = originSourceFile(origin);
  const originPath =
    originFile === undefined
      ? "<unknown>"
      : displayPath(rootDir, originFile.fileName);
  const name = originName(origin);
  return {
    kind: "import-edge",
    file,
    originFile: originPath,
    originName: name,
    message: `${file} imports protected value ${originPath}#${name}`,
  };
}

function publicExportViolation(file, exported, rootDir, violationOrigin) {
  const originFile = originSourceFile(violationOrigin);
  const originPath =
    originFile === undefined
      ? "<unknown>"
      : displayPath(rootDir, originFile.fileName);
  const name = originName(violationOrigin);
  return {
    kind: "public-export",
    file,
    exportedName: exported.exportedName,
    originFile: originPath,
    originName: name,
    message: `${file} publicly exports protected value ${originPath}#${name} as ${exported.exportedName}`,
  };
}

function toConfigurationViolation(diagnostic, rootDir) {
  const file =
    diagnostic.file === undefined
      ? "tsconfig.json"
      : displayPath(rootDir, diagnostic.file.fileName);
  return {
    kind: "configuration",
    file,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
  };
}

function findSourceFile(program, rootDir, relativePath) {
  const requestedPath = path.resolve(rootDir, relativePath);
  return program
    .getSourceFiles()
    .find((sourceFile) => samePath(sourceFile.fileName, requestedPath));
}

function isSourceUnderRoot(sourceFile, rootDir) {
  const relativePath = path.relative(rootDir, sourceFile.fileName);
  return (
    !relativePath.startsWith("..") &&
    path.extname(sourceFile.fileName) === ".ts"
  );
}

function normalizeRelativePath(rootDir, fileName) {
  return path
    .relative(rootDir, path.resolve(rootDir, fileName))
    .replaceAll("\\", "/");
}

function displayPath(rootDir, fileName) {
  return path.relative(rootDir, fileName).replaceAll("\\", "/");
}

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function addViolation(violations, seen, violation) {
  const key = [
    violation.kind,
    violation.file,
    violation.exportedName ?? "",
    violation.originFile ?? "",
    violation.originName ?? "",
  ].join("|");
  if (!seen.has(key)) {
    seen.add(key);
    violations.push(violation);
  }
}
