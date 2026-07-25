import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const rootDir = path.resolve(process.argv[2] ?? process.cwd());
const engineDir = path.join(rootDir, "src", "engine");
const violations = [];
const physicalCardZoneOwnershipViolations = [];
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
  ["src/engine/data.ts", 1274, 3, "decodeRuntimeSourceMetadata"],
  ["src/engine/data.ts", 1678, 1, "expectRuntimeRecord"],
  ["src/engine/data.ts", 1691, 1, "requireRecordField"],
  ["src/engine/data.ts", 1706, 1, "optionalRecordField"],
  ["src/engine/data.ts", 1692, 3, "requireRecordField"],
  ["src/engine/data.ts", 1707, 3, "optionalRecordField"],
  ["src/engine/data.ts", 1726, 3, "requireArrayField"],
  ["src/engine/data.ts", 1741, 3, "requireUnknownArrayField"],
  ["src/engine/data.ts", 1751, 3, "requireRuntimeEffectArrayField"],
  ["src/engine/data.ts", 1817, 11, "requireRuntimeEffectArrayField"],
  ["src/engine/data.ts", 2022, 3, "optionalUnknownArrayField"],
  ["src/engine/data.ts", 2039, 3, "requireStringField"],
  ["src/engine/data.ts", 2054, 3, "optionalStringField"],
  ["src/engine/data.ts", 2073, 3, "requireNonEmptyStringField"],
  ["src/engine/data.ts", 2091, 3, "optionalNonEmptyStringField"],
  ["src/engine/data.ts", 2103, 3, "requireStringOrNullField"],
  ["src/engine/data.ts", 2118, 3, "requireExactStringField"],
  ["src/engine/data.ts", 2138, 3, "requireNumberField"],
  ["src/engine/data.ts", 2153, 3, "requireNumberOrNullField"],
  ["src/engine/data.ts", 2171, 3, "requireBooleanField"],
  ["src/engine/data.ts", 2186, 3, "requireStringArrayField"],
  ["src/engine/data.ts", 2210, 3, "requireUnsupportedMechanicsField"],
  ["src/engine/data.ts", 2239, 3, "optionalStringArrayField"],
  ["src/engine/data.ts", 2252, 3, "requireCardKindField"],
  ["src/engine/data.ts", 2267, 3, "requireTokenKindField"],
  ["src/engine/data.ts", 2292, 3, "validateRuntimeEffectDefinition"],
  ["src/engine/data.ts", 2322, 3, "validateNestedAttackBranches"],
  ["src/engine/data.ts", 2375, 43, "isEffectRecord"],
  ["src/engine/runtime-effect.ts", 578, 4, "isRuntimeEffectTargetRecord"],
];

for (const filePath of listTypeScriptFiles(engineDir)) {
  const sourceText = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
  const relativePath = path.relative(rootDir, filePath).replaceAll("\\", "/");
  checkPhysicalCardZoneOwnership(relativePath, sourceFile);
  const aliases = collectTypeAliases(sourceFile);
  function visit(node) {
    const assertedType =
      ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)
        ? node.type
        : isForbiddenAnnotation(node)
          ? node.type
          : undefined;
    if (
      assertedType &&
      isRecordType(assertedType, aliases, sourceFile, new Set(), node)
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
if (physicalCardZoneOwnershipViolations.length > 0) {
  throw new Error(
    `Physical card zone ownership violation(s): ${physicalCardZoneOwnershipViolations.join("; ")}`
  );
}
console.log(
  `Engine typed-access guard: ok (${violations.length} tracked exception(s)); physical card zone ownership: ok`
);

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
