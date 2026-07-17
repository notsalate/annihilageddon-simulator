import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const rootDir = path.resolve(process.argv[2] ?? process.cwd());
const engineDir = path.join(rootDir, "src", "engine");

const configuredAllowedViolations = [
  {
    filePath: "src/engine/data.ts",
    line: 167,
    column: 15,
    source: "unknown[]",
    owner: "PropertySignature:needsData",
    issue: "#64",
    reason: "raw/decode boundary",
  },
  {
    filePath: "src/engine/data.ts",
    line: 1675,
    column: 4,
    source: "unknown[]",
    owner: "FunctionDeclaration:requireArrayField",
    issue: "#64",
    reason: "raw/decode boundary",
  },
  {
    filePath: "src/engine/data.ts",
    line: 1978,
    column: 51,
    source: "unknown[]",
    owner: "FunctionDeclaration:isUnknownArray",
    issue: "#64",
    reason: "raw/decode boundary",
  },
];
const allowedViolations = statSync(path.join(engineDir, "data.ts"), {
  throwIfNoEntry: false,
})
  ? configuredAllowedViolations
  : [];
const allowedKeys = new Set(allowedViolations.map(createKey));
const violations = collectViolations(engineDir);
const actualKeys = new Set(violations.map(createKey));
const stale = allowedViolations.filter(
  (item) => !actualKeys.has(createKey(item))
);
const untracked = violations.filter(
  (item) => !allowedKeys.has(createKey(item))
);

for (const item of stale)
  console.error(
    `${item.filePath}:${item.line} stale unknown-array exception (${item.issue}, ${item.reason})`
  );
for (const item of untracked)
  console.error(
    `${item.filePath}:${item.line}:${item.column} untracked unknown-array pattern: ${item.source}`
  );
if (stale.length || untracked.length) {
  console.error(
    `Engine unknown-array guard failed: ${untracked.length} untracked, ${stale.length} stale exception(s)`
  );
  process.exit(1);
}
console.log(
  `Engine unknown-array guard: ok (${violations.length} tracked exception(s))`
);

function collectViolations(targetPath) {
  if (statSync(targetPath).isDirectory()) {
    return readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) =>
      collectViolations(path.join(targetPath, entry.name))
    );
  }
  if (!targetPath.endsWith(".ts")) return [];
  const sourceText = readFileSync(targetPath, "utf8");
  const sourceFile = ts.createSourceFile(
    targetPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
  const filePath = path.relative(rootDir, targetPath).replaceAll("\\", "/");
  const nodes = [];
  function visit(node) {
    if (ts.isArrayTypeNode(node) && isUnknown(node.elementType))
      nodes.push(node);
    if (
      ts.isTypeReferenceNode(node) &&
      ["Array", "ReadonlyArray"].includes(node.typeName.getText(sourceFile)) &&
      node.typeArguments?.length === 1 &&
      isUnknown(node.typeArguments[0])
    )
      nodes.push(node);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return nodes.map((node) => {
    const position = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile)
    );
    return {
      filePath,
      line: position.line + 1,
      column: position.character + 1,
      source: normalize(node.getText(sourceFile)),
      owner: findOwner(node),
    };
  });
}

function createKey(item) {
  return `${item.filePath}:${item.line}:${item.column}:${item.source}:${item.owner}`;
}

function findOwner(node) {
  for (
    let current = node.parent;
    current !== undefined;
    current = current.parent
  ) {
    if (ts.isFunctionDeclaration(current) && current.name)
      return `FunctionDeclaration:${current.name.text}`;
    if (ts.isPropertySignature(current) && current.name)
      return `PropertySignature:${current.name.getText()}`;
    if (ts.isTypeAliasDeclaration(current))
      return `TypeAliasDeclaration:${current.name.text}`;
  }
  return "unknown";
}

function normalize(source) {
  return source.replace(/\s+/gu, " ").trim();
}

function isUnknown(node) {
  return node.kind === ts.SyntaxKind.UnknownKeyword;
}
