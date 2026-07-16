import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const rootDir = path.resolve(process.argv[2] ?? process.cwd());
const engineDir = path.join(rootDir, "src", "engine");
const violations = [];
const configuredAllowedViolations = [
  ["src/engine/data.ts", 1625, 1, "expectRuntimeRecord"],
  ["src/engine/data.ts", 1638, 1, "requireRecordField"],
  ["src/engine/data.ts", 1653, 1, "optionalRecordField"],
  ["src/engine/data.ts", 1639, 3, "requireRecordField"],
  ["src/engine/data.ts", 1654, 3, "optionalRecordField"],
  ["src/engine/data.ts", 1673, 3, "requireArrayField"],
  ["src/engine/data.ts", 1688, 3, "requireUnknownArrayField"],
  ["src/engine/data.ts", 1698, 3, "requireRuntimeEffectArrayField"],
  ["src/engine/data.ts", 1764, 11, "requireRuntimeEffectArrayField"],
  ["src/engine/data.ts", 1968, 3, "optionalUnknownArrayField"],
  ["src/engine/data.ts", 1985, 3, "requireStringField"],
  ["src/engine/data.ts", 2000, 3, "optionalStringField"],
  ["src/engine/data.ts", 2019, 3, "requireStringOrNullField"],
  ["src/engine/data.ts", 2034, 3, "requireExactStringField"],
  ["src/engine/data.ts", 2054, 3, "requireNumberField"],
  ["src/engine/data.ts", 2069, 3, "requireNumberOrNullField"],
  ["src/engine/data.ts", 2087, 3, "requireBooleanField"],
  ["src/engine/data.ts", 2102, 3, "requireStringArrayField"],
  ["src/engine/data.ts", 2126, 3, "requireUnsupportedMechanicsField"],
  ["src/engine/data.ts", 2155, 3, "optionalStringArrayField"],
  ["src/engine/data.ts", 2168, 3, "requireCardKindField"],
  ["src/engine/data.ts", 2183, 3, "requireTokenKindField"],
  ["src/engine/data.ts", 2208, 3, "validateRuntimeEffectDefinition"],
  ["src/engine/data.ts", 2260, 3, "validateNestedAttackBranches"],
  ["src/engine/data.ts", 2313, 43, "isEffectRecord"],
  ["src/engine/runtime-effect.ts", 408, 4, "isRuntimeEffectTargetRecord"],
  ["src/engine/effect-runtime-registry.ts", 4284, 43, "isEffectRecord"],
];

for (const filePath of listTypeScriptFiles(engineDir)) {
  const sourceText = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
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
        path.relative(rootDir, filePath).replaceAll("\\", "/"),
        position.line + 1,
        position.character + 1,
        findOwner(node),
      ]);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
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
console.log(
  `Engine typed-access guard: ok (${violations.length} tracked exception(s))`
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
  function visit(node, namespacePath = [], namespaceScope = sourceFile) {
    if (ts.isTypeAliasDeclaration(node)) {
      const name = [...namespacePath, node.name.text].join(".");
      const entries = aliases.get(name) ?? [];
      entries.push({
        declaration: node,
        scope:
          namespacePath.length > 0 && ts.isModuleBlock(node.parent)
            ? namespaceScope
            : node.parent,
        type: node.type,
      });
      aliases.set(name, entries);
    }
    if (
      ts.isModuleDeclaration(node) &&
      node.body &&
      ts.isIdentifier(node.name)
    ) {
      visit(node.body, [...namespacePath, node.name.text], namespaceScope);
      return;
    }
    ts.forEachChild(node, (child) =>
      visit(child, namespacePath, namespaceScope)
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
