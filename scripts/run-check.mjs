import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { runEngineEventRecordingGuard } from "./check-engine-event-recording.mjs";
import { runEngineTypedAccessGuard } from "./check-engine-typed-access.mjs";
import { runEngineUnknownArraysGuard } from "./check-engine-unknown-arrays.mjs";
import { runJsonParseAssertionsGuard } from "./check-json-parse-assertions.mjs";
import { runTsSuppressionsGuard } from "./check-ts-suppressions.mjs";

const rootDir = process.cwd();
rmSync(path.join(rootDir, "dist"), { force: true, recursive: true });

const compiler = runChild([
  path.join("node_modules", "typescript", "bin", "tsc"),
  "-p",
  "tsconfig.strictest.json",
  "--pretty",
  "false",
]);
const linter = runChild([
  path.join("node_modules", "eslint", "bin", "eslint.js"),
  "--cache",
  "--cache-strategy",
  "content",
  "src/**/*.ts",
  "tests/**/*.ts",
]);

const guardResults = [
  runTsSuppressionsGuard(rootDir),
  runEngineUnknownArraysGuard(rootDir),
  runEngineEventRecordingGuard(rootDir),
  runEngineTypedAccessGuard(rootDir),
  runJsonParseAssertionsGuard(rootDir),
];
for (const result of guardResults) {
  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
}

const [compilerStatus, lintStatus] = await Promise.all([compiler, linter]);
if (
  compilerStatus !== 0 ||
  lintStatus !== 0 ||
  guardResults.some((result) => result.status !== 0)
) {
  process.exitCode = 1;
} else {
  const semanticCompletionStatus = await runChild([
    path.join("dist", "src", "cli", "check-runtime-semantic-completion.js"),
  ]);
  process.exitCode =
    semanticCompletionStatus === 0
      ? await runChild([path.join("dist", "tests", "run-tests.js")])
      : semanticCompletionStatus;
}

function runChild(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.once("error", (error) => {
      console.error(error);
      resolve(1);
    });
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
