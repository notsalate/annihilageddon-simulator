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
let attackResolutionOwnerPresent = false;
let playerControlledAttackOwnerDeclarationCount = 0;

const physicalCardZoneFields = new Set([
  "deck",
  "hand",
  "discard",
  "playedThisTurn",
  "permanents",
  "unboughtFamiliar",
  "market",
  "legendMarket",
  "mainDeck",
  "legendDeck",
  "wildMagicStack",
  "limpWandStack",
  "destroyedPile",
  "destroyedMayhem",
  "destroyedMegaMayhem",
]);
const forbiddenPhysicalInventoryHelpers = new Set([
  "getPlayerCardZones",
  "getCommonCardZones",
  "listPhysicalCardZones",
]);
const physicalCardZoneConsumerGuards = new Map([
  [
    "src/engine/attack-defense.ts",
    {
      requiredImports: [
        "listPhysicalCardLocations",
        "listPhysicalCardZoneDescriptors",
      ],
      maxDistinctDirectZoneFields: 3,
    },
  ],
  [
    "src/engine/invariants.ts",
    {
      requiredImports: ["listPhysicalCardLocations"],
      maxDistinctDirectZoneFields: 3,
    },
  ],
]);
const configuredAllowedViolations = [
  ["src/engine/data.ts", 1267, 3, "decodeRuntimeSourceMetadata"],
  ["src/engine/data.ts", 1671, 1, "expectRuntimeRecord"],
  ["src/engine/data.ts", 1684, 1, "requireRecordField"],
  ["src/engine/data.ts", 1685, 3, "requireRecordField"],
  ["src/engine/data.ts", 1699, 1, "optionalRecordField"],
  ["src/engine/data.ts", 1700, 3, "optionalRecordField"],
  ["src/engine/data.ts", 1719, 3, "requireArrayField"],
  ["src/engine/data.ts", 1734, 3, "requireUnknownArrayField"],
  ["src/engine/data.ts", 1744, 3, "requireRuntimeEffectArrayField"],
  ["src/engine/data.ts", 1768, 3, "optionalUnknownArrayField"],
  ["src/engine/data.ts", 1785, 3, "requireStringField"],
  ["src/engine/data.ts", 1800, 3, "optionalStringField"],
  ["src/engine/data.ts", 1819, 3, "requireNonEmptyStringField"],
  ["src/engine/data.ts", 1837, 3, "optionalNonEmptyStringField"],
  ["src/engine/data.ts", 1849, 3, "requireStringOrNullField"],
  ["src/engine/data.ts", 1864, 3, "requireExactStringField"],
  ["src/engine/data.ts", 1884, 3, "requireNumberField"],
  ["src/engine/data.ts", 1899, 3, "requireNumberOrNullField"],
  ["src/engine/data.ts", 1917, 3, "requireBooleanField"],
  ["src/engine/data.ts", 1932, 3, "requireStringArrayField"],
  ["src/engine/data.ts", 1956, 3, "requireUnsupportedMechanicsField"],
  ["src/engine/data.ts", 1985, 3, "optionalStringArrayField"],
  ["src/engine/data.ts", 1998, 3, "requireCardKindField"],
  ["src/engine/data.ts", 2013, 3, "requireTokenKindField"],
  ["src/engine/data.ts", 2038, 3, "validateRuntimeEffectDefinition"],
  ["src/engine/data.ts", 2069, 43, "isEffectRecord"],
  ["src/engine/runtime-effect-decoder.ts", 76, 9, "decodeObject"],
  ["src/engine/runtime-effect-decoder.ts", 1292, 41, "isPlainRecord"],
  ["src/engine/runtime-effect.ts", 1071, 4, "isRuntimeEffectTargetRecord"],
  ["src/engine/runtime-effect.ts", 1076, 3, "hasExactKeys"],
];

const typedEffectBoundaryViolations = [];
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

    if (relativePath !== attackResolutionOwner && ts.isObjectLiteralExpression(node)) {
      const typeProperty = node.properties.find(
        (property) =>
          ts.isPropertyAssignment(property) &&
          ((ts.isIdentifier(property.name) && property.name.text === "type") ||
            (ts.isStringLiteral(property.name) && property.name.text === "type"))
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

function checkPhysicalCardZoneOwnership(relativePath, sourceFile) {
  const guard = physicalCardZoneConsumerGuards.get(relativePath);
  if (guard === undefined) return;

  const importedNames = new Set();
  const directZoneFields = new Set();
  const forbiddenHelpers = new Set();

  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === "./control-ledger.js" &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const element of node.importClause.namedBindings.elements) {
        importedNames.add(element.propertyName?.text ?? element.name.text);
      }
    }

    if (
      ts.isFunctionDeclaration(node) &&
      node.name !== undefined &&
      forbiddenPhysicalInventoryHelpers.has(node.name.text)
    ) {
      forbiddenHelpers.add(node.name.text);
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      physicalCardZoneFields.has(node.name.text)
    ) {
      directZoneFields.add(node.name.text);
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteral(node.argumentExpression) &&
      physicalCardZoneFields.has(node.argumentExpression.text)
    ) {
      directZoneFields.add(node.argumentExpression.text);
    }

    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  for (const requiredImport of guard.requiredImports) {
    if (!importedNames.has(requiredImport)) {
      physicalCardZoneOwnershipViolations.push(
        `${relativePath} must import ${requiredImport} from ./control-ledger.js`
      );
    }
  }
  if (forbiddenHelpers.size > 0) {
    physicalCardZoneOwnershipViolations.push(
      `${relativePath} redeclares physical inventory helper(s): ${[...forbiddenHelpers].join(", ")}`
    );
  }
  if (directZoneFields.size > guard.maxDistinctDirectZoneFields) {
    physicalCardZoneOwnershipViolations.push(
      `${relativePath} directly accesses too many physical card zone fields: ${[...directZoneFields].sort().join(", ")}`
    );
  }
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
console.log(
  `Engine typed-access guard: ok (${violations.length} tracked exception(s)); normal attack lifecycle ownership: ok; physical card zone ownership: ok`
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
