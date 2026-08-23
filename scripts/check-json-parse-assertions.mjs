import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { captureGuard, runGuardCli } from "./lib/guard-cli.mjs";

const TARGET_DIR = "src";

export function runJsonParseAssertionsGuard(rootPath = process.cwd()) {
  return captureGuard(() => {
    const rootDir = path.resolve(rootPath);
    const violations = collectViolations(
      path.join(rootDir, TARGET_DIR),
      rootDir
    );

    if (violations.length === 0) {
      return "JSON parse assertion guard: ok";
    }

    throw new Error(
      [
        ...violations.map(
          (violation) =>
            `${violation.filePath}:${violation.lineNumber} JSON.parse result must remain unknown before decoding, not ${violation.typeText}`
        ),
        `JSON parse assertion guard failed: ${violations.length} violation(s)`,
      ].join("\n")
    );
  });
}

runGuardCli(import.meta.url, () =>
  runJsonParseAssertionsGuard(process.argv[2] ?? process.cwd())
);

function collectViolations(absolutePath, rootDir) {
  const pathStat = statSync(absolutePath);
  if (pathStat.isDirectory()) {
    return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) =>
      collectViolations(path.join(absolutePath, entry.name), rootDir)
    );
  }

  if (!absolutePath.endsWith(".ts")) {
    return [];
  }

  return findViolations(absolutePath, rootDir);
}

function findViolations(absolutePath, rootDir) {
  const sourceText = readFileSync(absolutePath, "utf8");
  const sourceFile = ts.createSourceFile(
    absolutePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
  const displayPath = path
    .relative(rootDir, absolutePath)
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
