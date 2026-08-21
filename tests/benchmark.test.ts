import assert from "node:assert/strict";
import test from "node:test";

import {
  ANALYZER_REFERENCE_PROFILES,
  SIMULATION_BENCHMARK_STAGES,
  SIMULATION_REFERENCE_COVERAGE,
  createAnalyzerBenchmarkWorkload,
  createSimulationBenchmarkWorkload,
  markPlayerId,
  runAnalyzerBenchmark,
  runSimulationBenchmark,
  runSingleGame,
} from "../src/index.js";
import { loadCurrentRuntimeDataPack } from "../src/engine/data.js";
import type {
  RunSingleGameOptions,
  SingleGameResult,
} from "../src/engine/simulation.js";

const rootDir = process.cwd();

test("simulation benchmark exposes the nested reference stages", () => {
  assert.deepEqual(SIMULATION_BENCHMARK_STAGES, [10, 1_000, 10_000, 100_000]);
  const workload = createSimulationBenchmarkWorkload({
    stage: 1_000,
  });
  assert.equal(workload.role, "reference");
  assert.equal(workload.firstSeed, 1);
  assert.equal(workload.gameCount, 1_000);
  assert.equal(workload.playerCount, 2);
  assert.equal(workload.referenceBaselineReview, "required-on-workload-change");
  assert.deepEqual(SIMULATION_REFERENCE_COVERAGE, [
    "setup",
    "turns",
    "cardPlay",
    "effects",
    "discard",
    "reshuffle",
    "scoring",
  ]);
  assert.throws(
    () => createSimulationBenchmarkWorkload({ maxTurns: 40 }),
    /Reference workload must use maxTurns 200/
  );
});

test("simulation benchmark keeps current workload separate from reference", () => {
  const workload = createSimulationBenchmarkWorkload({
    role: "current",
    stage: 10,
    firstSeed: 60615,
    maxTurns: 40,
  });

  assert.equal(workload.workloadId, "simulation-current-game");
  assert.equal(workload.referenceWorkloadVersion, null);
  assert.equal(workload.referenceBaselineReview, "not-applicable");
  assert.equal(workload.firstSeed, 60615);
  assert.equal(workload.maxTurns, 40);
});

test("Analyzer reference profiles use the declared deterministic seed groups", () => {
  assert.deepEqual(ANALYZER_REFERENCE_PROFILES.light.seeds, [1, 6, 7, 8]);
  assert.deepEqual(ANALYZER_REFERENCE_PROFILES.typical.seeds, [2, 4, 9]);
  assert.deepEqual(ANALYZER_REFERENCE_PROFILES.heavy.seeds, [3, 5, 10]);
  assert.ok(
    ANALYZER_REFERENCE_PROFILES.light.limits.maxTurnLines <
      ANALYZER_REFERENCE_PROFILES.typical.limits.maxTurnLines
  );
  assert.ok(
    ANALYZER_REFERENCE_PROFILES.typical.limits.maxTurnLines <
      ANALYZER_REFERENCE_PROFILES.heavy.limits.maxTurnLines
  );

  const workload = createAnalyzerBenchmarkWorkload({ profile: "heavy" });
  assert.equal(workload.playerCount, 2);
  assert.equal(workload.criterionId, "victory-points");
  assert.equal(workload.referenceBaselineReview, "required-on-workload-change");
  assert.throws(
    () =>
      createAnalyzerBenchmarkWorkload({
        dataPackPath: "tests/fixtures/playable-runtime-data-pack.json",
      }),
    /Reference workload must use data\/packs\/current-runtime\.json/
  );
});

test("Analyzer benchmark reports complete light-profile measurements", () => {
  const result = runAnalyzerBenchmark({
    rootDir,
    role: "current",
    profile: "light",
  });

  assert.equal(result.measurementCount, 3);
  assert.equal(result.samples.length, 3);
  assert.equal(result.workload.profile, "light");
  assert.equal(result.workload.seeds.length, 4);
  assert.ok(result.metrics.lineCount > 0);
  assert.ok(result.metrics.actionCount > 0);
  assert.ok(result.timings.dataLoadMs >= 0);
  assert.ok(result.timings.preparationMs >= 0);
  assert.ok(result.timings.enumerationMs > 0);
  assert.ok(result.timings.rankingMs > 0);
  assert.equal(
    new Set(result.samples.map((sample) => sample.resultFingerprint)).size,
    1
  );
});

test("simulation benchmark excludes warmup and reports stable fingerprints", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  let loadCount = 0;
  let clockTick = 0;
  const runGame = ({
    seed,
    maxTurns,
  }: RunSingleGameOptions): SingleGameResult => ({
    seed,
    endReason: "maxTurnsReached",
    isGameEnd: false,
    turnsElapsed: maxTurns,
    players: [
      {
        playerId: markPlayerId("player-1"),
        victoryPoints: 0,
        legendCount: 0,
        deadWizardTokenCount: 0,
      },
    ],
    winnerIds: [],
    isTie: false,
    eventLog: [],
  });

  const result = runSimulationBenchmark({
    rootDir,
    role: "current",
    stage: 10,
    firstSeed: 1,
    dependencies: {
      clock: {
        now() {
          clockTick += 1;
          return clockTick;
        },
        readPeakMemoryBytes() {
          return 1_024;
        },
      },
      intakeDataPack() {
        loadCount += 1;
        return dataPack;
      },
      runGame,
    },
  });

  assert.equal(loadCount, 4);
  assert.equal(result.warmupCount, 1);
  assert.equal(result.measurementCount, 3);
  assert.equal(result.samples.length, 3);
  assert.equal(result.metrics.totalGames, 10);
  assert.equal(result.metrics.maxTurnsReached, 10);
  assert.equal(result.coverageSatisfied, false);
  assert.equal(
    new Set(result.samples.map((sample) => sample.resultFingerprint)).size,
    1
  );
  assert.equal(result.samples[0]?.peakMemoryBytes, 0);
});

test("single-game simulation preserves results with a preloaded data pack", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const direct = runSingleGame({
    rootDir,
    seed: 80809,
    maxTurns: 4,
  });
  const preloaded = runSingleGame({
    rootDir,
    dataPack,
    seed: 80809,
    maxTurns: 4,
  });

  assert.deepEqual(preloaded, direct);
});
