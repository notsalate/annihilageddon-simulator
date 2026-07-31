import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const rootDir = path.resolve(process.argv[2] ?? process.cwd());
const engineDir = path.join(rootDir, "src", "engine");
const violations = [];
const physicalCardZoneOwnershipViolations = [];
const attackLifecycleOwnershipViolations = [];
const attackResolutionOwner = "src/engine/attack-resolution.ts";
const forbiddenNormalAttackOrchestrationSymbols = new Set([
  "executeAttackWithAmount",
  "executeAttackBranches",
  "applyAfterResolvedAttackDamage",
  "resolveAttackTarget",
]);
const attackResolutionOwnedSymbols = new Set(["summarizeAttackDamage"]);
const triggerDispatchOwner = "src/engine/trigger-dispatch.ts";
const forbiddenLegacyTriggerDispatchSymbols = new Set([
  "dispatchControlledCardEffects",
  "listControlledCardEffects",
]);
const forbiddenTriggerDispatchOperationProperties = new Set([
  "controlledObjects",
  "execute",
  "predicate",
  "runtimeMode",
]);
const controlledTriggerCallerFunctions = new Set([
  "applyAfterPlayerAttackDamage",
  "calculateEndTurnDrawCount",
  "executeControlledCardOnPlayCardEffects",
]);
const triggerDispatchOwnershipViolations = [];
let attackResolutionOwnerPresent = false;
let playerControlledAttackOwnerDeclarationCount = 0;
let triggerDispatchOwnerPresent = false;
let triggerDispatchOwnerDeclarationCount = 0;

const forbiddenPhysicalInventoryHelpers = new Set([
  "getPlayerCardZones",
  "getCommonCardZones",
  "listPhysicalCardZones",
]);
const physicalInventorySeamApiNames = new Set([
  "clonePhysicalCardZoneState",
  "clonePhysicalCardZones",
  "listPhysicalCardLocations",
  "listPhysicalCardZoneDescriptors",
]);
const controlLedgerOwner = "src/engine/control-ledger.ts";
const physicalCardZonePaths = collectPhysicalCardZonePaths();
const configuredAllowedViolations = [
  ["src/engine/data.ts", 1266, 3, "decodeRuntimeSourceMetadata"],
  ["src/engine/data.ts", 1670, 1, "expectRuntimeRecord"],
  ["src/engine/data.ts", 1683, 1, "requireRecordField"],
  ["src/engine/data.ts", 1684, 3, "requireRecordField"],
  ["src/engine/data.ts", 1698, 1, "optionalRecordField"],
  ["src/engine/data.ts", 1699, 3, "optionalRecordField"],
  ["src/engine/data.ts", 1718, 3, "requireArrayField"],
  ["src/engine/data.ts", 1733, 3, "requireUnknownArrayField"],
  ["src/engine/data.ts", 1743, 3, "requireRuntimeEffectArrayField"],
  ["src/engine/data.ts", 1767, 3, "optionalUnknownArrayField"],
  ["src/engine/data.ts", 1784, 3, "requireStringField"],
  ["src/engine/data.ts", 1799, 3, "optionalStringField"],
  ["src/engine/data.ts", 1818, 3, "requireNonEmptyStringField"],
  ["src/engine/data.ts", 1836, 3, "optionalNonEmptyStringField"],
  ["src/engine/data.ts", 1848, 3, "requireStringOrNullField"],
  ["src/engine/data.ts", 1863, 3, "requireExactStringField"],
  ["src/engine/data.ts", 1883, 3, "requireNumberField"],
  ["src/engine/data.ts", 1898, 3, "requireNumberOrNullField"],
  ["src/engine/data.ts", 1916, 3, "requireBooleanField"],
  ["src/engine/data.ts", 1931, 3, "requireStringArrayField"],
  ["src/engine/data.ts", 1955, 3, "requireUnsupportedMechanicsField"],
  ["src/engine/data.ts", 1984, 3, "optionalStringArrayField"],
  ["src/engine/data.ts", 1997, 3, "requireCardKindField"],
  ["src/engine/data.ts", 2012, 3, "requireTokenKindField"],
  ["src/engine/data.ts", 2037, 3, "validateRuntimeEffectDefinition"],
  ["src/engine/data.ts", 2058, 43, "isEffectRecord"],
  ["src/engine/runtime-effect-decoder.ts", 76, 9, "decodeObject"],
  ["src/engine/runtime-effect-decoder.ts", 1479, 41, "isPlainRecord"],
  ["src/engine/runtime-effect.ts", 1071, 4, "isRuntimeEffectTargetRecord"],
  ["src/engine/runtime-effect.ts", 1076, 3, "hasExactKeys"],
];

const typedEffectBoundaryViolations = [];
const effectRuntimeCatalogBoundaryViolations = [];
const effectRuntimeCatalogBypassExports = new Set([
  "effectRuntimeHandlerMap",
  "effectRuntimeCatalog",
  "effectRuntimeRegistry",
  "getEffectRuntimeHandler",
  "replaceEffectRuntimeHandlerForTesting",
  "getEffectRuntimeCatalogEntry",
  "resolveEffectRuntimeCatalogEntry",
  "EffectRuntimeHandler",
  "EffectRuntimeEntry",
  "EffectRuntimeCatalogDefinition",
  "EffectRuntimeCatalogResolution",
]);
const runtimeEffectDecoderBypassExports = new Set(["runtimeEffectDecoders"]);
const approvedRuntimeEffectDecoderImporters = new Set([
  "src/engine/data.ts",
  "src/engine/effect-runtime-registry.ts",
]);
const forbiddenRuntimeEffectBoundaryIdentifiers = new Set([
  "RuntimeEffectFields",
  "RuntimeEffectPayloadBase",
  "exactRuntimeEffectPayloadFields",
  "getExactRuntimeEffectPayloadFields",
]);
const forbiddenRuntimeEffectAssertionTypes = new Set([
  "RuntimeEffectPayload",
  "RuntimeEffectForId",
]);
const knownRuntimeEffectPayloadFields = new Set([
  "activationLimit",
  "allowDinglerStatusExchange",
  "allowLifeExchange",
  "amount",
  "amountPerOwnedCard",
  "amountPerPermanent",
  "amountPerPlayer",
  "branchEffects",
  "cardDefinitionIds",
  "cardKind",
  "cardTags",
  "cardTypes",
  "chipAmount",
  "chipCost",
  "chooser",
  "condition",
  "conditionId",
  "costMode",
  "costs",
  "countedCardTypes",
  "deathCondition",
  "destination",
  "destroyedCardSource",
  "drawAmount",
  "emptyChoice",
  "excludeSource",
  "fromDefinitionId",
  "isOngoing",
  "lifeCost",
  "lifeTotal",
  "maximumCards",
  "minimumCards",
  "onDamageDealt",
  "onKill",
  "operation",
  "optional",
  "options",
  "redirectAttack",
  "source",
  "sourceZones",
  "status",
  "statusId",
  "target",
  "targetSelector",
  "timing",
  "toDefinitionId",
  "unlessStatusId",
  "valueKind",
  "voteTargetSelector",
  "winnerDrawAmount",
]);

for (const filePath of listTypeScriptFiles(engineDir)) {
  const sourceText = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
  const relativePath = path.relative(rootDir, filePath).replaceAll("\\", "/");
  for (const identifier of forbiddenRuntimeEffectBoundaryIdentifiers) {
    if (sourceText.includes(identifier)) {
      typedEffectBoundaryViolations.push(
        `${relativePath} reintroduces forbidden runtime-effect boundary ${identifier}`
      );
    }
  }
  checkPhysicalCardZoneOwnership(relativePath, sourceFile);
  if (relativePath === attackResolutionOwner) {
    attackResolutionOwnerPresent = true;
  }
  checkAttackLifecycleOwnership(relativePath, sourceFile);
  checkTriggerDispatchOwnership(relativePath, sourceFile);
  checkEffectRuntimeCatalogBoundary(relativePath, sourceFile);
  const aliases = collectTypeAliases(sourceFile);
  function visit(node) {
    const assertionType =
      ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)
        ? node.type
        : undefined;
    const inspectedType =
      assertionType ?? (isForbiddenAnnotation(node) ? node.type : undefined);
    if (
      assertionType &&
      referencesForbiddenRuntimeEffectAssertion(assertionType)
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile)
      );
      typedEffectBoundaryViolations.push(
        `${relativePath}:${position.line + 1}:${position.character + 1} asserts a decoded runtime effect payload`
      );
    }
    if (
      relativePath === "src/engine/effect-runtime-registry.ts" &&
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "effect" &&
      ts.isStringLiteral(node.argumentExpression) &&
      knownRuntimeEffectPayloadFields.has(node.argumentExpression.text)
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile)
      );
      typedEffectBoundaryViolations.push(
        `${relativePath}:${position.line + 1}:${position.character + 1} uses raw bracket access for ${node.argumentExpression.text}`
      );
    }
    if (
      inspectedType &&
      isRecordType(inspectedType, aliases, sourceFile, new Set(), node)
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile)
      );
      violations.push([
        relativePath,
        position.line + 1,
        position.character + 1,
        findOwner(node),
      ]);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function checkAttackLifecycleOwnership(relativePath, sourceFile) {
  function visit(node) {
    if (
      relativePath === attackResolutionOwner &&
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "resolvePlayerControlledAttack"
    ) {
      playerControlledAttackOwnerDeclarationCount += 1;
    }

    if (relativePath !== attackResolutionOwner && ts.isIdentifier(node)) {
      if (forbiddenNormalAttackOrchestrationSymbols.has(node.text)) {
        attackLifecycleOwnershipViolations.push(
          `${relativePath} reintroduces forbidden normal-attack orchestration symbol ${node.text}`
        );
      }
      if (attackResolutionOwnedSymbols.has(node.text)) {
        attackLifecycleOwnershipViolations.push(
          `${relativePath} uses Attack Resolution-owned symbol ${node.text}`
        );
      }
    }

    if (
      relativePath !== attackResolutionOwner &&
      ts.isObjectLiteralExpression(node)
    ) {
      const typeProperty = node.properties.find(
        (property) =>
          ts.isPropertyAssignment(property) &&
          ((ts.isIdentifier(property.name) && property.name.text === "type") ||
            (ts.isStringLiteral(property.name) &&
              property.name.text === "type"))
      );
      if (
        typeProperty !== undefined &&
        ts.isPropertyAssignment(typeProperty) &&
        ts.isStringLiteral(typeProperty.initializer) &&
        typeProperty.initializer.text === "attackCreated"
      ) {
        attackLifecycleOwnershipViolations.push(
          `${relativePath} creates attackCreated outside ${attackResolutionOwner}`
        );
      }
    }

    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function checkTriggerDispatchOwnership(relativePath, sourceFile) {
  if (relativePath === triggerDispatchOwner) {
    triggerDispatchOwnerPresent = true;
  }

  function visit(node) {
    if (
      relativePath === triggerDispatchOwner &&
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "dispatchControlledCardOperation" &&
      node.body !== undefined
    ) {
      triggerDispatchOwnerDeclarationCount += 1;
    }

    if (relativePath !== triggerDispatchOwner && ts.isIdentifier(node)) {
      if (forbiddenLegacyTriggerDispatchSymbols.has(node.text)) {
        triggerDispatchOwnershipViolations.push(
          `${relativePath} uses legacy Trigger Dispatch symbol ${node.text}`
        );
      }
      if (
        node.text === "getEffectRuntimeCatalogEntry" &&
        controlledTriggerCallerFunctions.has(findOwner(node))
      ) {
        triggerDispatchOwnershipViolations.push(
          `${relativePath} resolves the effect catalog inside controlled-trigger caller ${findOwner(node)}`
        );
      }
    }

    if (
      relativePath !== triggerDispatchOwner &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "dispatchControlledCardOperation"
    ) {
      const operation = node.arguments[2];
      if (operation !== undefined && ts.isObjectLiteralExpression(operation)) {
        for (const property of operation.properties) {
          const propertyName =
            property.name !== undefined &&
            (ts.isIdentifier(property.name) ||
              ts.isStringLiteral(property.name))
              ? property.name.text
              : undefined;
          if (
            propertyName !== undefined &&
            forbiddenTriggerDispatchOperationProperties.has(propertyName)
          ) {
            triggerDispatchOwnershipViolations.push(
              `${relativePath} passes forbidden Trigger Dispatch property ${propertyName}`
            );
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function checkEffectRuntimeCatalogBoundary(relativePath, sourceFile) {
  let sourceKindPolicy;

  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === "./runtime-effect-decoder.js" &&
      !approvedRuntimeEffectDecoderImporters.has(relativePath)
    ) {
      effectRuntimeCatalogBoundaryViolations.push(
        `${relativePath} imports runtime effect decoder outside an approved boundary`
      );
    }
    if (ts.isExportDeclaration(node)) {
      if (
        node.moduleSpecifier !== undefined &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === "./runtime-effect-decoder.js"
      ) {
        effectRuntimeCatalogBoundaryViolations.push(
          `${relativePath} re-exports runtime effect decoder outside an approved boundary`
        );
      }
      if (relativePath === "src/engine/effect-runtime-registry.ts") {
        for (const exportedName of getExportedLocalNames(node)) {
          if (effectRuntimeCatalogBypassExports.has(exportedName)) {
            effectRuntimeCatalogBoundaryViolations.push(
              `${relativePath} re-exports Catalog bypass ${exportedName}`
            );
          }
        }
      }
      if (relativePath === "src/engine/runtime-effect-decoder.ts") {
        for (const exportedName of getExportedLocalNames(node)) {
          if (runtimeEffectDecoderBypassExports.has(exportedName)) {
            effectRuntimeCatalogBoundaryViolations.push(
              `${relativePath} re-exports decoder-map bypass ${exportedName}`
            );
          }
        }
      }
    }

    if (relativePath === "src/engine/effect-runtime-registry.ts") {
      if (isExportedCatalogBypass(node)) {
        effectRuntimeCatalogBoundaryViolations.push(
          `${relativePath} exports Catalog bypass ${getDeclarationName(node)}`
        );
      }
      if (isHandlerOwnedPayloadValidator(node)) {
        effectRuntimeCatalogBoundaryViolations.push(
          `${relativePath} reintroduces handler-owned payload validation`
        );
      }
      if (ts.isFunctionDeclaration(node) && isSourceKindPolicy(node)) {
        sourceKindPolicy = node;
      }
    }
    if (
      relativePath === "src/engine/runtime-effect-decoder.ts" &&
      isExportedRuntimeEffectDecoderBypass(node)
    ) {
      effectRuntimeCatalogBoundaryViolations.push(
        `${relativePath} exports decoder-map bypass runtimeEffectDecoders`
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (relativePath !== "src/engine/effect-runtime-registry.ts") return;
  if (sourceKindPolicy === undefined) {
    effectRuntimeCatalogBoundaryViolations.push(
      `${relativePath} must declare explicit registered source-kind policies`
    );
    return;
  }
  let hasDefaultPolicy = false;
  let usesAllSourceKinds = false;
  function inspectSourceKindPolicy(node) {
    if (ts.isDefaultClause(node)) hasDefaultPolicy = true;
    if (ts.isIdentifier(node) && node.text === "effectRuntimeSourceKinds") {
      usesAllSourceKinds = true;
    }
    ts.forEachChild(node, inspectSourceKindPolicy);
  }
  inspectSourceKindPolicy(sourceKindPolicy);
  if (hasDefaultPolicy || usesAllSourceKinds) {
    effectRuntimeCatalogBoundaryViolations.push(
      `${relativePath} must keep registered source-kind policies explicit`
    );
  }
}

function getExportedLocalNames(node) {
  if (
    node.exportClause === undefined ||
    !ts.isNamedExports(node.exportClause)
  ) {
    return [];
  }
  return node.exportClause.elements.map(
    (element) => element.propertyName?.text ?? element.name.text
  );
}

function isSourceKindPolicy(node) {
  if (node.type === undefined) return false;
  let hasSourceKindReturnType = false;
  function visit(typeNode) {
    if (
      ts.isTypeReferenceNode(typeNode) &&
      ts.isIdentifier(typeNode.typeName) &&
      typeNode.typeName.text === "EffectRuntimeSupportedSourceKinds"
    ) {
      hasSourceKindReturnType = true;
    }
    ts.forEachChild(typeNode, visit);
  }
  visit(node.type);
  return hasSourceKindReturnType;
}

function isHandlerOwnedPayloadValidator(node) {
  if (!ts.isMethodDeclaration(node) || !isStringArrayType(node.type)) {
    return false;
  }
  if (
    !node.parameters.some(
      (parameter) => parameter.type?.kind === ts.SyntaxKind.UnknownKeyword
    )
  )
    return false;
  const object = node.parent;
  return (
    ts.isObjectLiteralExpression(object) &&
    object.properties.some(
      (property) =>
        (ts.isMethodDeclaration(property) &&
          ts.isIdentifier(property.name) &&
          property.name.text === "execute") ||
        (ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name) &&
          property.name.text === "execute" &&
          (ts.isArrowFunction(property.initializer) ||
            ts.isFunctionExpression(property.initializer)))
    )
  );
}

function isStringArrayType(type) {
  return (
    type !== undefined &&
    ts.isArrayTypeNode(type) &&
    type.elementType.kind === ts.SyntaxKind.StringKeyword
  );
}

function isExportedCatalogBypass(node) {
  return isExportedNamedDeclaration(node, effectRuntimeCatalogBypassExports);
}

function isExportedRuntimeEffectDecoderBypass(node) {
  return isExportedNamedDeclaration(node, runtimeEffectDecoderBypassExports);
}

function isExportedNamedDeclaration(node, forbiddenNames) {
  if (!hasExportModifier(node)) return false;
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations.some((declaration) =>
      forbiddenNames.has(declaration.name.getText())
    );
  }
  const name = getDeclarationName(node);
  return name !== undefined && forbiddenNames.has(name);
}

function getDeclarationName(node) {
  return "name" in node && node.name && ts.isIdentifier(node.name)
    ? node.name.text
    : undefined;
}

function hasExportModifier(node) {
  return (
    node.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    ) ?? false
  );
}

function checkPhysicalCardZoneOwnership(relativePath, sourceFile) {
  const importedLedgerApis = new Map();
  const calledImportBindings = new Set();
  const forbiddenHelpers = new Set();
  const manuallyEnumeratedZonePaths =
    collectManualPhysicalZonePaths(sourceFile);
  let usesControlLedgerSeam = false;

  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === "./control-ledger.js"
    ) {
      if (
        !node.importClause?.isTypeOnly &&
        node.importClause?.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings)
      ) {
        for (const element of node.importClause.namedBindings.elements) {
          if (!element.isTypeOnly) {
            importedLedgerApis.set(element.name.text, {
              binding: element,
              exportedName: element.propertyName?.text ?? element.name.text,
            });
          }
        }
      }
    }

    if (
      ts.isFunctionDeclaration(node) &&
      node.name !== undefined &&
      forbiddenPhysicalInventoryHelpers.has(node.name.text)
    ) {
      forbiddenHelpers.add(node.name.text);
    }

    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  const valueBindings = collectValueBindings(sourceFile);
  function collectCalls(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const importedApi = importedLedgerApis.get(node.expression.text);
      if (
        importedApi !== undefined &&
        resolveValueBinding(node.expression, valueBindings) ===
          importedApi.binding
      ) {
        calledImportBindings.add(importedApi.binding);
      }
    }
    ts.forEachChild(node, collectCalls);
  }
  collectCalls(sourceFile);

  const calledLedgerApis = new Set();
  for (const { binding, exportedName } of importedLedgerApis.values()) {
    if (calledImportBindings.has(binding)) {
      calledLedgerApis.add(exportedName);
    }
    if (
      physicalInventorySeamApiNames.has(exportedName) &&
      calledImportBindings.has(binding)
    ) {
      usesControlLedgerSeam = true;
    }
    if (
      physicalInventorySeamApiNames.has(exportedName) &&
      !calledImportBindings.has(binding)
    ) {
      physicalCardZoneOwnershipViolations.push(
        `${relativePath} imports Ledger physical-zone API ${exportedName} without calling it`
      );
    }
  }
  if (forbiddenHelpers.size > 0) {
    physicalCardZoneOwnershipViolations.push(
      `${relativePath} redeclares physical inventory helper(s): ${[...forbiddenHelpers].join(", ")}`
    );
  }
  if (
    relativePath !== controlLedgerOwner &&
    !usesControlLedgerSeam &&
    manuallyEnumeratedZonePaths.size > 1
  ) {
    physicalCardZoneOwnershipViolations.push(
      `${relativePath} manually enumerates physical-zone inventory without calling a Control Ledger seam: ${[...manuallyEnumeratedZonePaths].join(", ")}`
    );
  }
  if (
    relativePath === "src/engine/game-state-fork.ts" &&
    !calledLedgerApis.has("clonePhysicalCardZoneState")
  ) {
    physicalCardZoneOwnershipViolations.push(
      `${relativePath} must call clonePhysicalCardZoneState from Control Ledger`
    );
  }
}

function collectPhysicalCardZonePaths() {
  const ledgerPath = path.join(engineDir, "control-ledger.ts");
  if (!statSync(ledgerPath, { throwIfNoEntry: false })) {
    return new Set();
  }
  const ledgerSource = ts.createSourceFile(
    ledgerPath,
    readFileSync(ledgerPath, "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  const paths = new Set();

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "createArrayCardZoneDescriptor" ||
        node.expression.text === "createSingletonCardZoneDescriptor")
    ) {
      const readStorage = node.arguments[1];
      if (readStorage && ts.isArrowFunction(readStorage)) {
        collectPropertyAccessPaths(readStorage.body, paths, ledgerSource);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(ledgerSource);
  return paths;
}

function collectPropertyAccessPaths(node, paths, sourceFile) {
  if (
    ts.isPropertyAccessExpression(node) &&
    (!ts.isPropertyAccessExpression(node.parent) ||
      node.parent.expression !== node)
  ) {
    const path = getSemanticPropertyAccessPath(node, sourceFile);
    if (path !== undefined) {
      paths.add(path);
    }
  }
  ts.forEachChild(node, (child) =>
    collectPropertyAccessPaths(child, paths, sourceFile)
  );
}

function collectManualPhysicalZonePaths(sourceFile) {
  const aliases = new Map();
  const paths = new Set();
  const objectMapNames = collectObjectMapNames(sourceFile);

  function collectExpressionPaths(node, collected) {
    if (ts.isIdentifier(node) && aliases.has(node.text)) {
      collected.add(aliases.get(node.text));
      return;
    }
    if (ts.isPropertyAccessExpression(node)) {
      const path = getSemanticPropertyAccessPath(node, sourceFile);
      if (path !== undefined && physicalCardZonePaths.has(path)) {
        collected.add(path);
        return;
      }
      if (isPlayerStateCollectionCallbackAccess(node, sourceFile)) {
        const callbackPath = `PlayerState.${node.name.text}`;
        if (physicalCardZonePaths.has(callbackPath)) {
          collected.add(callbackPath);
          return;
        }
      }
    }
    ts.forEachChild(node, (child) => collectExpressionPaths(child, collected));
  }

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const assignedPath = ts.isPropertyAccessExpression(node.initializer)
        ? getSemanticPropertyAccessPath(node.initializer, sourceFile)
        : undefined;
      if (
        assignedPath !== undefined &&
        physicalCardZonePaths.has(assignedPath)
      ) {
        aliases.set(node.name.text, assignedPath);
      }
      if (
        objectMapNames.has(node.name.text) &&
        ts.isObjectLiteralExpression(node.initializer)
      ) {
        collectExpressionPaths(node.initializer, paths);
      }
    }
    if (ts.isArrayLiteralExpression(node) && isInventoryCollectionNode(node)) {
      collectExpressionPaths(node, paths);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === "concat" ||
        node.expression.name.text === "push")
    ) {
      if (node.expression.name.text === "concat") {
        const receiverPath = ts.isPropertyAccessExpression(
          node.expression.expression
        )
          ? getSemanticPropertyAccessPath(
              node.expression.expression,
              sourceFile,
              true
            )
          : undefined;
        if (
          receiverPath !== undefined &&
          physicalCardZonePaths.has(receiverPath)
        ) {
          paths.add(receiverPath);
        }
      }
      node.arguments.forEach((argument) =>
        collectExpressionPaths(argument, paths)
      );
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return paths;
}

function collectObjectMapNames(sourceFile) {
  const names = new Set();
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "Object" &&
      node.expression.name.text === "values" &&
      ts.isIdentifier(node.arguments[0])
    ) {
      names.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

function isInventoryCollectionNode(node) {
  return !(
    ts.isPropertyAccessExpression(node.parent) &&
    node.parent.expression === node &&
    ["find", "some", "every", "filter", "map", "reduce"].includes(
      node.parent.name.text
    )
  );
}

function getSemanticPropertyAccessPath(node, sourceFile, allowChained = false) {
  if (
    !allowChained &&
    ((ts.isPropertyAccessExpression(node.parent) &&
      node.parent.expression === node) ||
      (ts.isElementAccessExpression(node.parent) &&
        node.parent.expression === node))
  ) {
    return undefined;
  }
  const parts = [];
  let current = node;
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
  }
  if (!ts.isIdentifier(current)) {
    return undefined;
  }
  const rootType = findRootTypeName(current, sourceFile);
  return rootType === undefined ? undefined : [rootType, ...parts].join(".");
}

function findRootTypeName(root, sourceFile) {
  for (let current = root.parent; current; current = current.parent) {
    if (
      (ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isArrowFunction(current) ||
        ts.isMethodDeclaration(current)) &&
      current.parameters
    ) {
      const parameter = current.parameters.find(
        (candidate) =>
          ts.isIdentifier(candidate.name) && candidate.name.text === root.text
      );
      if (parameter?.type === undefined) {
        continue;
      }
      const typeText = parameter.type.getText(sourceFile);
      if (typeText.includes("PlayerState")) {
        return "PlayerState";
      }
      if (typeText.includes("GameState")) {
        return "GameState";
      }
      return undefined;
    }
  }
  return undefined;
}

function isPlayerStateCollectionCallbackAccess(node, sourceFile) {
  let current = node;
  while (ts.isPropertyAccessExpression(current)) current = current.expression;
  if (!ts.isIdentifier(current)) return false;

  for (let ancestor = current.parent; ancestor; ancestor = ancestor.parent) {
    if (!ts.isFunctionLike(ancestor)) continue;
    const parameter = ancestor.parameters.find(
      (candidate) =>
        ts.isIdentifier(candidate.name) && candidate.name.text === current.text
    );
    if (parameter !== undefined)
      return isPlayerStateCollectionCallbackParameter(parameter, sourceFile);
  }
  return false;
}

function collectValueBindings(sourceFile) {
  const bindings = new Map();

  function add(name, binding, scope) {
    const entries = bindings.get(name) ?? [];
    entries.push({ binding, scope });
    bindings.set(name, entries);
  }

  function visit(node) {
    if (ts.isImportSpecifier(node)) {
      add(node.name.text, node, sourceFile);
    }
    if (ts.isVariableDeclaration(node)) {
      for (const name of collectBindingNames(node.name)) {
        add(
          name.text,
          name,
          isVarDeclaration(node) ? findVarScope(node) : findLexicalScope(node)
        );
      }
    }
    if (ts.isParameter(node)) {
      for (const name of collectBindingNames(node.name)) {
        add(name.text, name, node.parent);
      }
    }
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name !== undefined
    ) {
      add(node.name.text, node.name, findLexicalScope(node.parent));
    }
    if (ts.isFunctionExpression(node) || ts.isClassExpression(node)) {
      if (node.name !== undefined) add(node.name.text, node.name, node);
    }
    if (ts.isCatchClause(node) && node.variableDeclaration !== undefined) {
      for (const name of collectBindingNames(node.variableDeclaration.name)) {
        add(name.text, name, node);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return bindings;
}

function collectBindingNames(node) {
  if (ts.isIdentifier(node)) return [node];
  if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) {
    return node.elements.flatMap((element) =>
      ts.isBindingElement(element) ? collectBindingNames(element.name) : []
    );
  }
  return [];
}

function resolveValueBinding(identifier, bindings) {
  const candidates = bindings.get(identifier.text);
  if (candidates === undefined) return undefined;
  for (let current = identifier.parent; current; current = current.parent) {
    const matches = candidates.filter(
      (candidate) => candidate.scope === current
    );
    if (matches.length === 1) return matches[0].binding;
    if (matches.length > 1) return undefined;
  }
  return undefined;
}

function isVarDeclaration(node) {
  return (node.parent.flags & ts.NodeFlags.BlockScoped) === 0;
}

function findVarScope(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionLike(current) || ts.isSourceFile(current)) return current;
  }
  return node.getSourceFile();
}

function findLexicalScope(node) {
  for (let current = node; current; current = current.parent) {
    if (
      ts.isBlock(current) ||
      ts.isModuleBlock(current) ||
      ts.isClassStaticBlockDeclaration(current) ||
      ts.isCaseBlock(current) ||
      ts.isForStatement(current) ||
      ts.isForOfStatement(current) ||
      ts.isForInStatement(current) ||
      ts.isSourceFile(current) ||
      ts.isFunctionLike(current) ||
      ts.isCatchClause(current)
    ) {
      return current;
    }
  }
  return node.getSourceFile();
}

function isPlayerStateCollectionCallbackParameter(parameter, sourceFile) {
  const callback = parameter.parent;
  if (!ts.isFunctionLike(callback) || !ts.isCallExpression(callback.parent)) {
    return false;
  }
  const call = callback.parent;
  if (
    !ts.isPropertyAccessExpression(call.expression) ||
    !["flatMap", "map", "filter", "forEach"].includes(call.expression.name.text)
  ) {
    return false;
  }
  const collection = call.expression.expression;
  if (ts.isPropertyAccessExpression(collection)) {
    return (
      getSemanticPropertyAccessPath(collection, sourceFile, true) ===
      "GameState.players"
    );
  }
  if (!ts.isIdentifier(collection)) return false;

  for (let current = collection.parent; current; current = current.parent) {
    if (!ts.isFunctionLike(current)) continue;
    const collectionParameter = current.parameters.find(
      (candidate) =>
        ts.isIdentifier(candidate.name) &&
        candidate.name.text === collection.text
    );
    return (
      collectionParameter?.type
        ?.getText(sourceFile)
        .includes("PlayerState[]") ?? false
    );
  }
  return false;
}

function isForbiddenAnnotation(node) {
  return (
    ((ts.isVariableDeclaration(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isPropertySignature(node) ||
      ts.isTypePredicateNode(node)) &&
      node.type !== undefined) ||
    ((ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)) &&
      node.type !== undefined)
  );
}

const allowedKeys = new Set(
  (rootDir === process.cwd() ? configuredAllowedViolations : []).map(
    ([file, line, column, owner]) => `${file}:${line}:${column}:${owner}`
  )
);
const actualKeys = new Set(
  violations.map(
    ([file, line, column, owner]) => `${file}:${line}:${column}:${owner}`
  )
);
const stale = (
  rootDir === process.cwd() ? configuredAllowedViolations : []
).filter(
  ([file, line, column, owner]) =>
    !actualKeys.has(`${file}:${line}:${column}:${owner}`)
);
const untracked = violations.filter(
  ([file, line, column, owner]) =>
    !allowedKeys.has(`${file}:${line}:${column}:${owner}`)
);
if (stale.length || untracked.length)
  throw new Error(
    `Untyped runtime object access: ${untracked.length} untracked, ${stale.length} stale exception(s)` +
      (untracked.length
        ? ` (${untracked.map(([file, line, column]) => `${file}:${line}:${column} untracked Record<string, unknown> access`).join(", ")})`
        : "")
  );
if (typedEffectBoundaryViolations.length > 0) {
  throw new Error(
    `Typed runtime-effect boundary violation(s): ${typedEffectBoundaryViolations.join("; ")}`
  );
}
if (effectRuntimeCatalogBoundaryViolations.length > 0) {
  throw new Error(
    `Effect Runtime Catalog boundary violation(s): ${[...new Set(effectRuntimeCatalogBoundaryViolations)].join("; ")}`
  );
}
if (
  attackResolutionOwnerPresent &&
  playerControlledAttackOwnerDeclarationCount !== 1
) {
  attackLifecycleOwnershipViolations.push(
    `${attackResolutionOwner} must declare exactly one resolvePlayerControlledAttack owner; found ${playerControlledAttackOwnerDeclarationCount}`
  );
}
if (attackLifecycleOwnershipViolations.length > 0) {
  throw new Error(
    `Normal attack lifecycle ownership violation(s): ${[...new Set(attackLifecycleOwnershipViolations)].join("; ")}`
  );
}
if (physicalCardZoneOwnershipViolations.length > 0) {
  throw new Error(
    `Physical card zone ownership violation(s): ${physicalCardZoneOwnershipViolations.join("; ")}`
  );
}
if (triggerDispatchOwnerPresent && triggerDispatchOwnerDeclarationCount !== 1) {
  triggerDispatchOwnershipViolations.push(
    `${triggerDispatchOwner} must declare exactly one dispatchControlledCardOperation implementation; found ${triggerDispatchOwnerDeclarationCount}`
  );
}
if (triggerDispatchOwnershipViolations.length > 0) {
  throw new Error(
    `Trigger Dispatch ownership violation(s): ${[...new Set(triggerDispatchOwnershipViolations)].join("; ")}`
  );
}
console.log(
  `Engine typed-access guard: ok (${violations.length} tracked exception(s)); normal attack lifecycle ownership: ok; Trigger Dispatch ownership: ok; physical card zone ownership: ok`
);

function referencesForbiddenRuntimeEffectAssertion(typeNode) {
  if (
    ts.isTypeReferenceNode(typeNode) &&
    ts.isIdentifier(typeNode.typeName) &&
    forbiddenRuntimeEffectAssertionTypes.has(typeNode.typeName.text)
  ) {
    return true;
  }
  let found = false;
  ts.forEachChild(typeNode, (child) => {
    if (!found && referencesForbiddenRuntimeEffectAssertion(child)) {
      found = true;
    }
  });
  return found;
}

function findOwner(node) {
  for (let current = node; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name)
      return current.name.text;
  }
  return "unknown";
}

function collectTypeAliases(sourceFile) {
  const aliases = new Map();
  function visit(node, namespacePath = [], namespaceScopes = [sourceFile]) {
    if (ts.isTypeAliasDeclaration(node)) {
      const names = [
        ...Array.from({ length: namespacePath.length }, (_, index) =>
          [...namespacePath.slice(index), node.name.text].join(".")
        ),
        node.name.text,
      ];
      names.forEach((name, index) => {
        const entries = aliases.get(name) ?? [];
        entries.push({
          declaration: node,
          scope:
            namespacePath.length > 0 && ts.isModuleBlock(node.parent)
              ? (namespaceScopes[index] ?? node.parent)
              : node.parent,
          type: node.type,
        });
        aliases.set(name, entries);
      });
    }
    if (
      ts.isModuleDeclaration(node) &&
      node.body &&
      ts.isIdentifier(node.name)
    ) {
      const namespaceScope = ts.isModuleBlock(node.parent)
        ? (namespaceScopes.at(-1) ?? sourceFile)
        : node.parent;
      const nextScopes = ts.isModuleBlock(node.parent)
        ? [...namespaceScopes, node.body]
        : [namespaceScope, node.body];
      visit(node.body, [...namespacePath, node.name.text], nextScopes);
      return;
    }
    ts.forEachChild(node, (child) =>
      visit(child, namespacePath, namespaceScopes)
    );
  }
  visit(sourceFile);
  return aliases;
}

function isRecordType(
  node,
  aliases,
  sourceFile,
  resolving = new Set(),
  usageNode = node
) {
  if (ts.isParenthesizedTypeNode(node)) {
    return isRecordType(node.type, aliases, sourceFile, resolving, usageNode);
  }
  if (ts.isIntersectionTypeNode(node) || ts.isUnionTypeNode(node)) {
    return node.types.some((type) =>
      isRecordType(type, aliases, sourceFile, resolving, usageNode)
    );
  }
  if (ts.isTypeLiteralNode(node)) {
    return node.members.some(
      (member) =>
        ts.isIndexSignatureDeclaration(member) &&
        member.parameters.length === 1 &&
        member.parameters[0].type?.kind === ts.SyntaxKind.StringKeyword &&
        member.type?.kind === ts.SyntaxKind.UnknownKeyword
    );
  }
  if (!ts.isTypeReferenceNode(node)) return false;
  const name = node.typeName.getText(sourceFile);
  if (name === "Record" && node.typeArguments?.length === 2) {
    return (
      node.typeArguments[0].kind === ts.SyntaxKind.StringKeyword &&
      node.typeArguments[1].kind === ts.SyntaxKind.UnknownKeyword
    );
  }
  if (
    ["Readonly", "Partial", "Required"].includes(name) &&
    node.typeArguments?.length === 1
  ) {
    return isRecordType(
      node.typeArguments[0],
      aliases,
      sourceFile,
      resolving,
      usageNode
    );
  }
  const alias = resolveAlias(name, aliases, usageNode);
  if (alias && !resolving.has(alias.declaration)) {
    resolving.add(alias.declaration);
    const result = isRecordType(
      alias.type,
      aliases,
      sourceFile,
      resolving,
      alias.declaration
    );
    resolving.delete(alias.declaration);
    return result;
  }
  return false;
}

function resolveAlias(name, aliases, usageNode) {
  const candidates = aliases.get(name);
  if (candidates === undefined) return undefined;
  for (let current = usageNode; current; current = current.parent) {
    const match = candidates.find((candidate) => candidate.scope === current);
    if (match !== undefined) return match;
  }
  return undefined;
}

function listTypeScriptFiles(targetPath) {
  if (statSync(targetPath).isFile())
    return targetPath.endsWith(".ts") ? [targetPath] : [];
  return readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) =>
    listTypeScriptFiles(path.join(targetPath, entry.name))
  );
}
