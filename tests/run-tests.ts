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
  "controlled-power-ongoing.test.js",
  "control-ledger.test.js",
  "control-ledger-zones.test.js",
  "trigger-dispatch.test.js",
  "trigger-dispatch-ongoing.test.js",
  "trigger-dispatch-errors.test.js",
  "simulation.test.js",
  "adjudication.test.js",
  "simulation-legal-actions.test.js",
  "debug-trace.test.js",
  "invariants.test.js",
  "simulation-menu.test.js",
  "runtime-regression.test.js",
  "market-flow-terminal.test.js",
  "validation.test.js",
  "runtime-data-intake.test.js",
  "draft-validation.test.js",
  "draft-generator.test.js",
  "import-completeness.test.js",
  "import-index-integrity.test.js",
  "runtime-coverage-inventory.test.js",
  "runtime-image-metadata.test.js",
  "card-runtime-clusters.test.js",
  "engine-guards.test.js",
  "public-entrypoint-guard.test.js",
  "effect-choice-decision-view-types.test.js",
  "effect-choice-routing.test.js",
  "best-move-analysis.test.js",
  "best-move-cli.test.js",
  "benchmark.test.js",
  "benchmark-cli.test.js",
  "performance-epoch.test.js",
  "performance-tools.test.js",
  "completion-reconciliation.test.js",
  "effect-runtime-applicability.test.js",
  "effect-runtime-catalog-types.test.js",
  "effect-runtime-catalog-errors.test.js",
  "attack-resolution.test.js",
  "attack-resolution-ordering.test.js",
  "directional-chain-redirect.test.js",
  "attack-replacement-ongoing.test.js",
  "attack-defense.test.js",
  "attack-defense-snapshot.test.js",
  "defense-choice.test.js",
  "defense-fixtures.test.js",
  "helpers/game-scenario.test.js",
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
