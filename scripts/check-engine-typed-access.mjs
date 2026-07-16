import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const rootDir = path.resolve(process.argv[2] ?? process.cwd());
const engineDir = path.join(rootDir, "src", "engine");
const violations = [];
const configuredAllowedViolations = [
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
  const aliases = collectRecordAliases(sourceFile);
  function visit(node) {
    const assertedType =
      ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)
        ? node.type
        : isForbiddenAnnotation(node)
          ? node.type
          : undefined;
    if (assertedType && isRecordType(assertedType, aliases, sourceFile)) {
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
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name)
      return current.name.text;
  }
  return "unknown";
}

function collectRecordAliases(sourceFile) {
  const aliases = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    sourceFile.forEachChild((node) => {
      if (
        ts.isTypeAliasDeclaration(node) &&
        isRecordType(node.type, aliases, sourceFile) &&
        !aliases.has(node.name.text)
      ) {
        aliases.add(node.name.text);
        changed = true;
      }
    });
  }
  return aliases;
}

function isRecordType(node, aliases, sourceFile) {
  if (!ts.isTypeReferenceNode(node)) return false;
  const name = node.typeName.getText(sourceFile);
  if (name === "Record" && node.typeArguments?.length === 2) {
    return (
      node.typeArguments[0].kind === ts.SyntaxKind.StringKeyword &&
      node.typeArguments[1].kind === ts.SyntaxKind.UnknownKeyword
    );
  }
  return aliases.has(name);
}

function listTypeScriptFiles(targetPath) {
  if (statSync(targetPath).isFile())
    return targetPath.endsWith(".ts") ? [targetPath] : [];
  return readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) =>
    listTypeScriptFiles(path.join(targetPath, entry.name))
  );
}
