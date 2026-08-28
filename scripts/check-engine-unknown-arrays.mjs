import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { captureGuard, runGuardCli } from "./lib/guard-cli.mjs";

export function runEngineUnknownArraysGuard(rootPath = process.cwd()) {
  return captureGuard(() => {
    const rootDir = path.resolve(rootPath);
    const engineDir = path.join(rootDir, "src", "engine");

    const configuredAllowedViolations = [
      {
        filePath: "src/engine/data.ts",
        line: 164,
        column: 15,
        source: "unknown[]",
        owner: "PropertySignature:needsData",
        issue: "#64",
        reason: "raw/decode boundary",
      },
      {
        filePath: "src/engine/data.ts",
        line: 1749,
        column: 4,
        source: "unknown[]",
        owner: "FunctionDeclaration:requireArrayField",
        issue: "#64",
        reason: "raw/decode boundary",
      },
      {
        filePath: "src/engine/data.ts",
        line: 1806,
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
    const violations = collectViolations(engineDir, rootDir);
    const actualKeys = new Set(violations.map(createKey));
    const stale = allowedViolations.filter(
      (item) => !actualKeys.has(createKey(item))
    );
    const untracked = violations.filter(
      (item) => !allowedKeys.has(createKey(item))
    );

    if (stale.length || untracked.length) {
      throw new Error(
        [
          ...stale.map(
            (item) =>
              `${item.filePath}:${item.line} stale unknown-array exception (${item.issue}, ${item.reason})`
          ),
          ...untracked.map(
            (item) =>
              `${item.filePath}:${item.line}:${item.column} untracked unknown-array pattern: ${item.source}`
          ),
          `Engine unknown-array guard failed: ${untracked.length} untracked, ${stale.length} stale exception(s)`,
        ].join("\n")
      );
    }
    return `Engine unknown-array guard: ok (${violations.length} tracked exception(s))`;
  });
}

runGuardCli(import.meta.url, () =>
  runEngineUnknownArraysGuard(process.argv[2] ?? process.cwd())
);

function collectViolations(targetPath, rootDir) {
  if (statSync(targetPath).isDirectory()) {
    return readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) =>
      collectViolations(path.join(targetPath, entry.name), rootDir)
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
