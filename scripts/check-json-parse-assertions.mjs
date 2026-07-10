import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT_DIR = path.resolve(process.argv[2] ?? process.cwd());
const TARGET_DIR = "src";

const violations = collectViolations(path.join(ROOT_DIR, TARGET_DIR));

if (violations.length === 0) {
  console.log("JSON parse assertion guard: ok");
  process.exit(0);
}

for (const violation of violations) {
  console.error(
    `${violation.filePath}:${violation.lineNumber} JSON.parse result must remain unknown before decoding, not ${violation.typeText}`
  );
}

console.error(
  `JSON parse assertion guard failed: ${violations.length} violation(s)`
);
process.exit(1);

function collectViolations(absolutePath) {
  const pathStat = statSync(absolutePath);
  if (pathStat.isDirectory()) {
    return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) =>
      collectViolations(path.join(absolutePath, entry.name))
    );
  }

  if (!absolutePath.endsWith(".ts")) {
    return [];
  }

  return findViolations(absolutePath);
}

function findViolations(absolutePath) {
  const sourceText = readFileSync(absolutePath, "utf8");
  const sourceFile = ts.createSourceFile(
    absolutePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
  const displayPath = path
    .relative(ROOT_DIR, absolutePath)
    .replaceAll("\\", "/");
  const violations = [];

  visit(sourceFile);
  return violations;

  function visit(node) {
    if (isJsonParseAssertion(node) && !isUnknownAssertion(node)) {
      const position = sourceFile.getLineAndCharacterOfPosition(
        node.getStart()
      );
      violations.push({
        filePath: displayPath,
        lineNumber: position.line + 1,
        typeText: node.type.getText(sourceFile),
      });
    }

    ts.forEachChild(node, visit);
  }
}

function isJsonParseAssertion(node) {
  if (!ts.isAsExpression(node) && !ts.isTypeAssertionExpression(node)) {
    return false;
  }

  return isJsonParseCall(unwrapAssertions(node.expression));
}

function unwrapAssertions(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isJsonParseCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "JSON" &&
    node.expression.name.text === "parse"
  );
}

function isUnknownAssertion(node) {
  return node.type.kind === ts.SyntaxKind.UnknownKeyword;
}
