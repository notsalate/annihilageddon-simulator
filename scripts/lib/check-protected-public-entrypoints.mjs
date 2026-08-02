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
    const adapterOrigins =
      adapterTrace.status === "found" ? adapterTrace.origins : [];
    const unapprovedAdapterOrigin = adapterOrigins.find(
      (origin) => !isApprovedTrustedAdapterOrigin(origin, policy)
    );
    const adapterOrigin = unapprovedAdapterOrigin ?? adapterOrigins[0];
    const approvedAdapterExport =
      adapterOrigins.length > 0 && unapprovedAdapterOrigin === undefined;
    if (
      !protectedValue &&
      adapterTrace.status !== "unresolved" &&
      (adapterTrace.status === "clear" || approvedAdapterExport)
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
    return { status: "found", origins: [origin] };
  }

  const adapterOrigins = [];
  for (const declaration of origin.declarations ?? []) {
    const staticOrigins = collectStaticOriginSymbols(checker, declaration);
    if (staticOrigins.attempted && staticOrigins.symbols.length === 0) {
      return { status: "unresolved" };
    }
    const declarationOrigins = [];
    for (const staticOrigin of staticOrigins.symbols) {
      const traced = traceTrustedAdapterOrigin(
        checker,
        staticOrigin,
        policy,
        new Set(visited)
      );
      if (traced.status === "unresolved") {
        return traced;
      }
      if (traced.status === "found") {
        declarationOrigins.push(...traced.origins);
      }
    }
    if (staticOrigins.failClosed && declarationOrigins.length > 0) {
      return { status: "unresolved" };
    }
    adapterOrigins.push(...declarationOrigins);
  }
  return adapterOrigins.length > 0
    ? { status: "found", origins: [...new Set(adapterOrigins)] }
    : { status: "clear" };
}

function collectStaticOriginSymbols(checker, declaration) {
  if (ts.isVariableDeclaration(declaration)) {
    const staticOrigins = staticExpressionOriginSymbols(
      checker,
      declaration.initializer
    );
    return {
      ...staticOrigins,
      failClosed:
        staticOrigins.attempted && !isConstVariableDeclaration(declaration),
    };
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
  const initializerSymbol = staticInitializerSymbol(
    checker,
    variableDeclaration.initializer
  );
  const initializerOrigin =
    initializerSymbol === undefined
      ? undefined
      : resolveAlias(checker, initializerSymbol);
  if (
    initializerOrigin === undefined ||
    !(initializerOrigin.declarations ?? []).some(ts.isSourceFile)
  ) {
    return { attempted: false, symbols: [] };
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
  if (!ts.isBlock(body)) {
    return directWrapperReturnOriginSymbols(checker, body);
  }

  const returnExpressions = [];
  collectDirectWrapperReturnExpressions(body, returnExpressions);
  if (returnExpressions.length === 0) {
    const terminalStatement = body.statements.at(-1);
    if (
      terminalStatement !== undefined &&
      ts.isExpressionStatement(terminalStatement)
    ) {
      returnExpressions.push(terminalStatement.expression);
    }
  }

  const symbols = [];
  let attempted = false;
  let failClosed = false;
  for (const expression of returnExpressions) {
    const returnedOrigin = directWrapperReturnOriginSymbols(
      checker,
      expression
    );
    attempted ||= returnedOrigin.attempted;
    failClosed ||= returnedOrigin.failClosed ?? false;
    symbols.push(...returnedOrigin.symbols);
  }
  return {
    attempted,
    symbols,
    failClosed: failClosed && symbols.length > 0,
  };
}

function directWrapperReturnOriginSymbols(checker, expression) {
  if (expression === undefined) {
    return { attempted: false, symbols: [] };
  }
  const unwrappedExpression = unwrapParenthesizedExpression(expression);
  if (ts.isObjectLiteralExpression(unwrappedExpression)) {
    return objectLiteralOriginSymbols(checker, unwrappedExpression);
  }
  if (ts.isConditionalExpression(unwrappedExpression)) {
    return aggregateOriginSymbols([
      directWrapperReturnOriginSymbols(checker, unwrappedExpression.whenTrue),
      directWrapperReturnOriginSymbols(checker, unwrappedExpression.whenFalse),
    ]);
  }
  if (ts.isArrayLiteralExpression(unwrappedExpression)) {
    return aggregateOriginSymbols(
      unwrappedExpression.elements.map((element) =>
        ts.isSpreadElement(element)
          ? { attempted: false, symbols: [], failClosed: true }
          : directWrapperReturnOriginSymbols(checker, element)
      )
    );
  }
  const originExpression = ts.isCallExpression(unwrappedExpression)
    ? unwrapParenthesizedExpression(unwrappedExpression.expression)
    : unwrappedExpression;
  const originSymbol = staticInitializerSymbol(checker, originExpression);
  if (originSymbol === undefined) {
    return {
      attempted: false,
      symbols: [],
      failClosed: !isStaticLiteralExpression(unwrappedExpression),
    };
  }
  return { attempted: true, symbols: [originSymbol] };
}

function aggregateOriginSymbols(origins) {
  const symbols = origins.flatMap((origin) => origin.symbols);
  return {
    attempted: origins.some((origin) => origin.attempted),
    symbols,
    failClosed:
      symbols.length > 0 &&
      origins.some((origin) => origin.failClosed ?? false),
  };
}

function collectDirectWrapperReturnExpressions(node, expressions) {
  ts.forEachChild(node, (child) => {
    if (ts.isFunctionLike(child)) {
      return;
    }
    if (ts.isReturnStatement(child)) {
      expressions.push(child.expression);
      return;
    }
    collectDirectWrapperReturnExpressions(child, expressions);
  });
}

function objectLiteralOriginSymbols(checker, expression) {
  const symbols = [];
  let attempted = false;
  let failClosed = false;
  for (const property of expression.properties) {
    let propertyOrigin;
    if (ts.isPropertyAssignment(property)) {
      propertyOrigin = directWrapperReturnOriginSymbols(
        checker,
        property.initializer
      );
    } else if (ts.isShorthandPropertyAssignment(property)) {
      const valueSymbol = checker.getShorthandAssignmentValueSymbol(property);
      propertyOrigin = {
        attempted: true,
        symbols: valueSymbol === undefined ? [] : [valueSymbol],
      };
    } else {
      propertyOrigin = { attempted: false, symbols: [], failClosed: true };
    }
    attempted ||= propertyOrigin.attempted;
    failClosed ||= propertyOrigin.failClosed ?? false;
    symbols.push(...propertyOrigin.symbols);
  }
  return {
    attempted,
    symbols,
    failClosed: failClosed && symbols.length > 0,
  };
}

function unwrapParenthesizedExpression(expression) {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function isStaticLiteralExpression(expression) {
  return (
    ts.isStringLiteral(expression) ||
    ts.isNumericLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression) ||
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword ||
    expression.kind === ts.SyntaxKind.NullKeyword
  );
}

function isApprovedTrustedAdapterOrigin(origin, policy) {
  const sourceFile = originSourceFile(origin);
  if (sourceFile === undefined) {
    return false;
  }
  const adapterExports = policy.trustedAdapterValueExports.get(
    displayPath(policy.rootDir, sourceFile.fileName)
  );
  return adapterExports?.has(originName(origin)) ?? false;
}

function isConstVariableDeclaration(declaration) {
  return (declaration.parent.flags & ts.NodeFlags.Const) !== 0;
}

function staticInitializerSymbol(checker, initializer) {
  if (ts.isIdentifier(initializer)) {
    return checker.getSymbolAtLocation(initializer);
  }
  if (ts.isPropertyAccessExpression(initializer)) {
    return runtimeStaticPropertySymbol(
      checker.getSymbolAtLocation(initializer.name)
    );
  }
  if (
    ts.isElementAccessExpression(initializer) &&
    initializer.argumentExpression !== undefined &&
    ts.isStringLiteral(initializer.argumentExpression)
  ) {
    return runtimeStaticPropertySymbol(
      checker.getPropertyOfType(
        checker.getTypeAtLocation(initializer.expression),
        initializer.argumentExpression.text
      )
    );
  }
  return undefined;
}

function runtimeStaticPropertySymbol(symbol) {
  if (symbol === undefined) {
    return undefined;
  }
  const declarations = symbol.declarations ?? [];
  return declarations.length > 0 &&
    declarations.every(
      (declaration) =>
        ts.isPropertySignature(declaration) || ts.isMethodSignature(declaration)
    )
    ? undefined
    : symbol;
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
