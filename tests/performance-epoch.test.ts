import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PERFORMANCE_CALIBRATION_COMPARISON_COUNT,
  assertPerformanceEpochBaseline,
  calibratePerformance,
  comparePerformance,
  createPerformanceBaselineEntry,
  parsePerformanceMeasurement,
  type BenchmarkEnvironmentFingerprint,
  type PerformanceMeasurement,
} from "../src/index.js";

const environment: BenchmarkEnvironmentFingerprint = {
  nodeVersion: "v22.23.1",
  platform: "linux",
  arch: "x64",
  runner: "github:Linux:X64:ubuntu-24.04:20260801.1",
  cpuModel: "fixture-cpu",
  cpuCount: 4,
};

function measurement(
  options: {
    role?: PerformanceMeasurement["role"];
    totalMs?: number;
    workloadFingerprint?: string;
    workloadVolumeFingerprint?: string;
    resultFingerprint?: string;
    environment?: BenchmarkEnvironmentFingerprint;
  } = {}
): PerformanceMeasurement {
  return {
    benchmark: "simulation",
    id: "simulation:100",
    role: options.role ?? "current",
    epoch: "E0",
    contractVersion: "simulation-benchmark-v1",
    playerCount: 2,
    workloadFingerprint: options.workloadFingerprint ?? "workload",
    workloadVolumeFingerprint: options.workloadVolumeFingerprint ?? "volume",
    resultFingerprint: options.resultFingerprint ?? "result",
    warmupCount: 1,
    measurementCount: 3,
    environment: options.environment ?? environment,
    comparisonPairId: "fixture-pair",
    commit: "commit-1",
    timings: {
      totalMs: options.totalMs ?? 10,
      dataLoadMs: 1,
      gamesMs: 8,
      aggregationMs: 0.5,
      resultPreparationMs: 0.5,
    },
    metrics: {
      totalGames: 100,
      totalTurns: 1_000,
    },
  };
}

function baselineEntry(reference = measurement({ role: "reference" })) {
  return createPerformanceBaselineEntry(reference, {
    totalMs: { relativePercent: 10, absoluteMs: 1 },
    dataLoadMs: { relativePercent: 25, absoluteMs: 1 },
    gamesMs: { relativePercent: 10, absoluteMs: 1 },
    aggregationMs: { relativePercent: 50, absoluteMs: 1 },
    resultPreparationMs: { relativePercent: 50, absoluteMs: 1 },
  });
}

function pairedMeasurement(
  comparisonPairId: string,
  options: Parameters<typeof measurement>[0] = {}
): PerformanceMeasurement & { comparisonPairId: string } {
  return {
    ...measurement(options),
    comparisonPairId,
  };
}

test("performance comparison passes within calibrated tolerance", () => {
  const base = measurement({ totalMs: 10.2 });
  const head = measurement({ totalMs: 10.8 });
  const report = comparePerformance({
    baseline: baselineEntry(),
    base,
    head,
    confirmation: measurement({ totalMs: 10.7 }),
  });

  assert.equal(report.verdict, "pass");
  assert.equal(report.blocking, false);
  assert.equal(report.epochComparison.verdict, "pass");
  assert.equal(report.baseComparison.verdict, "pass");
});

test("performance comparison confirms a regression before blocking", () => {
  const base = measurement({ totalMs: 10 });
  const firstHead = measurement({ totalMs: 13 });
  const unconfirmed = comparePerformance({
    baseline: baselineEntry(),
    base,
    head: firstHead,
  });
  assert.equal(unconfirmed.verdict, "not-measured");
  assert.equal(unconfirmed.blocking, false);

  const confirmed = comparePerformance({
    baseline: baselineEntry(),
    base,
    head: firstHead,
    confirmation: measurement({ totalMs: 13 }),
  });
  assert.equal(confirmed.verdict, "regression");
  assert.equal(confirmed.blocking, true);
  assert.equal(confirmed.blockingSource, "both");
  assert.deepEqual(confirmed.epochComparison.confirmedRegressionMetrics, [
    "totalMs",
  ]);
});

test("changed workload receives a non-blocking workload-changed verdict", () => {
  const report = comparePerformance({
    baseline: baselineEntry(),
    base: measurement(),
    head: measurement({ workloadVolumeFingerprint: "new-volume" }),
    confirmation: measurement({ workloadVolumeFingerprint: "new-volume" }),
  });

  assert.equal(report.verdict, "workload-changed");
  assert.equal(report.blocking, false);
  assert.equal(report.epochComparison.verdict, "workload-changed");
  assert.equal(report.baseComparison.verdict, "workload-changed");
  assert.match(report.epochComparison.reason, /start a new performance epoch/);
  assert.match(report.baseComparison.reason, /start a new performance epoch/);
});

test("changed workload does not block on a regression against the changed base", () => {
  const report = comparePerformance({
    baseline: baselineEntry(),
    base: measurement({ workloadVolumeFingerprint: "new-volume" }),
    head: measurement({
      workloadVolumeFingerprint: "new-volume",
      totalMs: 13,
    }),
    confirmation: measurement({
      workloadVolumeFingerprint: "new-volume",
      totalMs: 13,
    }),
  });

  assert.equal(report.epochComparison.verdict, "workload-changed");
  assert.equal(report.baseComparison.verdict, "regression");
  assert.equal(report.verdict, "workload-changed");
  assert.equal(report.blocking, false);
});

test("environment changes require recalibration without blocking", () => {
  const report = comparePerformance({
    baseline: baselineEntry(),
    base: measurement(),
    head: measurement({
      environment: { ...environment, nodeVersion: "v23.0.0" },
    }),
    confirmation: measurement({
      environment: { ...environment, nodeVersion: "v23.0.0" },
    }),
  });

  assert.equal(report.verdict, "not-calibrated");
  assert.equal(report.blocking, false);
  assert.equal(report.blockingSource, null);
  assert.equal(report.epochComparison.verdict, "not-calibrated");
  assert.equal(report.baseComparison.verdict, "not-calibrated");
});

test("historical E0 from another physical runner cannot block a passing PR pair", () => {
  const pullRequestEnvironment = {
    ...environment,
    cpuModel: "different-physical-cpu",
  };
  const report = comparePerformance({
    baseline: baselineEntry(),
    base: measurement({
      totalMs: 13,
      environment: pullRequestEnvironment,
    }),
    head: measurement({
      totalMs: 13,
      environment: pullRequestEnvironment,
    }),
    confirmation: measurement({
      totalMs: 13,
      environment: pullRequestEnvironment,
    }),
  });

  assert.equal(report.epochComparison.verdict, "not-calibrated");
  assert.equal(report.baseComparison.verdict, "pass");
  assert.equal(report.verdict, "not-calibrated");
  assert.equal(report.blocking, false);
});

test("measurements from different runner sessions cannot form a blocking pair", () => {
  const report = comparePerformance({
    baseline: baselineEntry(
      pairedMeasurement("historical-e0", {
        role: "reference",
      })
    ),
    base: pairedMeasurement("pull-request", { totalMs: 13 }),
    head: pairedMeasurement("pull-request", { totalMs: 13 }),
    confirmation: pairedMeasurement("pull-request", { totalMs: 13 }),
  });

  assert.equal(report.epochComparison.verdict, "not-calibrated");
  assert.equal(report.baseComparison.verdict, "pass");
  assert.equal(report.verdict, "not-calibrated");
  assert.equal(report.blocking, false);
});

test("calibration derives tolerances from twenty same-commit pairs", () => {
  const pairs = Array.from(
    { length: PERFORMANCE_CALIBRATION_COMPARISON_COUNT },
    (_, index) => ({
      first: measurement({ totalMs: 10, resultFingerprint: `result-${index}` }),
      second: measurement({
        totalMs: index % 2 === 0 ? 10.5 : 10.2,
        resultFingerprint: `result-${index}`,
      }),
    })
  );
  const result = calibratePerformance(pairs);

  assert.equal(result.comparisons, 20);
  assert.equal(result.commit, "commit-1");
  assert.equal(result.formula, "p95-plus-25-percent-safety-margin");
  assert.equal(result.metrics["totalMs"]?.p95AbsoluteMs, 0.5);
  assert.equal(result.tolerances["totalMs"]?.absoluteMs, 0.63);
  assert.equal(result.tolerances["totalMs"]?.relativePercent, 6.25);
});

test("calibration accepts CPU variation across fresh runners in one runner class", () => {
  const pairs = Array.from(
    { length: PERFORMANCE_CALIBRATION_COMPARISON_COUNT },
    (_, index) => {
      const runnerEnvironment = {
        ...environment,
        cpuModel: index % 2 === 0 ? "cpu-a" : "cpu-b",
      };
      return {
        first: measurement({ environment: runnerEnvironment }),
        second: measurement({
          environment: runnerEnvironment,
          totalMs: 10.2,
        }),
      };
    }
  );

  const result = calibratePerformance(pairs);
  assert.equal(result.comparisons, PERFORMANCE_CALIBRATION_COMPARISON_COUNT);
});

test("calibration rejects a mixed workload across paired comparisons", () => {
  const pairs = Array.from(
    { length: PERFORMANCE_CALIBRATION_COMPARISON_COUNT },
    (_, index) => ({
      first: measurement({
        totalMs: 10,
        resultFingerprint: `result-${index}`,
        ...(index === 19 ? { workloadVolumeFingerprint: "other-volume" } : {}),
      }),
      second: measurement({
        totalMs: 10.2,
        resultFingerprint: `result-${index}`,
        ...(index === 19 ? { workloadVolumeFingerprint: "other-volume" } : {}),
      }),
    })
  );

  assert.throws(
    () => calibratePerformance(pairs),
    /one workload, protocol, runner class and commit/
  );
});

test("an epoch regression remains blocking when the immediate base changed workload", () => {
  const report = comparePerformance({
    baseline: baselineEntry(),
    base: measurement({ workloadVolumeFingerprint: "old-volume" }),
    head: measurement({ totalMs: 13 }),
    confirmation: measurement({ totalMs: 13 }),
  });

  assert.equal(report.epochComparison.verdict, "regression");
  assert.equal(report.baseComparison.verdict, "workload-changed");
  assert.equal(report.verdict, "regression");
  assert.equal(report.blocking, true);
  assert.equal(report.blockingSource, "epoch-health");
});

test("performance artifacts accept a normalized measurement wrapper", () => {
  const expected = measurement();
  assert.deepEqual(
    parsePerformanceMeasurement({ measurement: expected }),
    expected
  );
});

test("legacy benchmark artifacts are accepted as not-calibrated measurements", () => {
  const legacy = {
    benchmark: "simulation",
    workload: {
      role: "current",
      epoch: "E0",
      contractVersion: "simulation-benchmark-v1",
      playerCount: 2,
      gameCount: 100,
    },
    warmupCount: 1,
    measurementCount: 3,
    timings: measurement().timings,
    metrics: { ...measurement().metrics, eventTypeCounts: { gameEnd: 100 } },
    workloadFingerprint: "workload",
    workloadVolumeFingerprint: "volume",
    resultFingerprint: "result",
  };

  const parsed = parsePerformanceMeasurement(legacy);
  assert.equal(parsed.id, "simulation:100");
  assert.equal(parsed.environment.runner, "unknown");
  assert.equal(parsed.commit, null);
});

test("the committed E0 baseline covers simulation and all analyzer profiles", () => {
  const value: unknown = JSON.parse(
    readFileSync("docs/benchmarks/performance-epoch-e0.json", "utf8")
  );
  assertPerformanceEpochBaseline(value);

  assert.equal(value.epoch, "E0");
  assert.equal(value.calibration.comparisons, 20);
  assert.deepEqual(
    value.entries.map((entry) => entry.id),
    ["simulation:100", "analyzer:light", "analyzer:typical", "analyzer:heavy"]
  );
});
