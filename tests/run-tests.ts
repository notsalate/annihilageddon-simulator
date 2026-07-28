import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  assertTestSuiteRegistryComplete,
  collectCompiledTestSuites,
} from "./test-suite-registry.js";

const testSuites = [
  "common.test.js",
  "id-types.test.js",
  "json-parse-assertions.test.js",
  "rng.test.js",
  "game-state-fork.test.js",
  "setup.test.js",
  "setup-effects.test.js",
  "action-loop.test.js",
  "effective-values.test.js",
  "simulation.test.js",
  "simulation-legal-actions.test.js",
  "debug-trace.test.js",
  "invariants.test.js",
  "simulation-menu.test.js",
  "runtime-regression.test.js",
  "validation.test.js",
  "draft-validation.test.js",
  "draft-generator.test.js",
  "import-completeness.test.js",
  "import-index-integrity.test.js",
  "runtime-coverage-inventory.test.js",
  "runtime-image-metadata.test.js",
  "card-runtime-clusters.test.js",
  "engine-guards.test.js",
  "effect-choice-routing.test.js",
  "best-move-analysis.test.js",
  "best-move-cli.test.js",
  "effect-runtime-applicability.test.js",
  "test-suite-registry.test.js",
];

const compiledTestsRoot = path.join(process.cwd(), "dist", "tests");
assertTestSuiteRegistryComplete(
  testSuites,
  collectCompiledTestSuites(compiledTestsRoot)
);

for (const suite of testSuites) {
  const result = spawnSync(
    process.execPath,
    ["--test", path.join(compiledTestsRoot, suite)],
    { stdio: "inherit" }
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
