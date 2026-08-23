import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { captureGuard, runGuardCli } from "./lib/guard-cli.mjs";

export function runEngineEventRecordingGuard(rootPath = process.cwd()) {
  return captureGuard(() => {
    const rootDir = path.resolve(rootPath);
    const engineDir = path.join(rootDir, "src", "engine");
    const recorderPath = path.join(engineDir, "event-recorder.ts");
    const violations = [];

    for (const filePath of listTypeScriptFiles(engineDir)) {
      if (filePath === recorderPath) continue;

      const sourceText = readFileSync(filePath, "utf8");
      const sourceFile = ts.createSourceFile(
        filePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true
      );

      function visit(node) {
        if (isEventLogPush(node)) {
          const position = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile)
          );
          violations.push(
            `${path.relative(rootDir, filePath).replaceAll("\\\\", "/")}:${position.line + 1}:${position.character + 1}`
          );
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
    }

    if (violations.length > 0) {
      throw new Error(
        `Direct eventLog.push outside event-recorder: ${violations.join(", ")}`
      );
    }

    return "Engine event-recorder guard: ok";

    function isEventLogPush(node) {
      if (
        !ts.isCallExpression(node) ||
        !ts.isPropertyAccessExpression(node.expression)
      ) {
        return false;
      }
      if (node.expression.name.text !== "push") return false;

      const target = node.expression.expression;
      return (
        (ts.isIdentifier(target) && target.text === "eventLog") ||
        (ts.isPropertyAccessExpression(target) &&
          target.name.text === "eventLog")
      );
    }

    function listTypeScriptFiles(targetPath) {
      if (statSync(targetPath).isFile())
        return targetPath.endsWith(".ts") ? [targetPath] : [];
      return readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) =>
        listTypeScriptFiles(path.join(targetPath, entry.name))
      );
    }
  });
}

runGuardCli(import.meta.url, () =>
  runEngineEventRecordingGuard(process.argv[2] ?? process.cwd())
);
