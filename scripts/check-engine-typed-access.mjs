import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const rootDir = path.resolve(process.argv[2] ?? process.cwd());
const engineDir = path.join(rootDir, "src", "engine");
const violations = [];

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
    if (
      (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
      isRecordType(node.type, aliases, sourceFile) &&
      !isRawBoundary(filePath)
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile)
      );
      violations.push(
        `${path.relative(rootDir, filePath).replaceAll("\\", "/")}:${position.line + 1}:${position.character + 1}`
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

if (violations.length > 0)
  throw new Error(`Untyped runtime object access: ${violations.join(", ")}`);
console.log("Engine typed-access guard: ok");

function isRawBoundary(filePath) {
  return (
    path.relative(rootDir, filePath).replaceAll("\\", "/") ===
    "src/engine/data.ts"
  );
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
