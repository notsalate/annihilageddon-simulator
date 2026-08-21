import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  PERFORMANCE_CALIBRATION_COMPARISON_COUNT,
  PERFORMANCE_EPOCH_SCHEMA_VERSION,
  PERFORMANCE_MEASUREMENT_COUNT,
  PERFORMANCE_WARMUP_COUNT,
  createPerformanceBaselineEntry,
  type BenchmarkEnvironmentFingerprint,
  type PerformanceEpochBaseline,
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
  role: PerformanceMeasurement["role"] = "current",
  totalMs = 10,
  measurementEnvironment: BenchmarkEnvironmentFingerprint = environment
): PerformanceMeasurement {
  return {
    benchmark: "simulation",
    id: "simulation:100",
    role,
    epoch: "E0",
    contractVersion: "simulation-benchmark-v1",
    playerCount: 2,
    workloadFingerprint: "workload",
    workloadVolumeFingerprint: "volume",
    resultFingerprint: "result",
    warmupCount: PERFORMANCE_WARMUP_COUNT,
    measurementCount: PERFORMANCE_MEASUREMENT_COUNT,
    environment: measurementEnvironment,
    commit: "commit-1",
    timings: {
      totalMs,
      dataLoadMs: 1,
      gamesMs: 8,
      aggregationMs: 0.5,
      resultPreparationMs: 0.5,
    },
    metrics: { totalGames: 100 },
  };
}

function referenceMeasurement(
  benchmark: PerformanceMeasurement["benchmark"],
  id: string
): PerformanceMeasurement {
  const base = measurement("reference");
  if (benchmark === "simulation") {
    return { ...base, benchmark, id };
  }
  return {
    ...base,
    benchmark,
    id,
    contractVersion: "analyzer-benchmark-v1",
    timings: {
      totalMs: 10,
      dataLoadMs: 1,
      preparationMs: 1,
      enumerationMs: 5,
      rankingMs: 2,
      resultPreparationMs: 1,
    },
    metrics: { totalSeeds: 1, lineCount: 1 },
  };
}

function calibrationFor(reference: PerformanceMeasurement) {
  const tolerances = Object.fromEntries(
    Object.keys(reference.timings).map((name) => [
      name,
      { relativePercent: 10, absoluteMs: 1 },
    ])
  );
  const metrics = Object.fromEntries(
    Object.entries(tolerances).map(([name, tolerance]) => [
      name,
      {
        p95RelativePercent: 1,
        p95AbsoluteMs: 0.8,
        tolerance,
      },
    ])
  );
  return {
    benchmark: reference.benchmark,
    id: reference.id,
    comparisons: PERFORMANCE_CALIBRATION_COMPARISON_COUNT,
    commit: reference.commit,
    environment: reference.environment,
    formula: "p95-plus-25-percent-safety-margin",
    metrics,
    tolerances,
  };
}

function baseline(): PerformanceEpochBaseline {
  const reference = measurement("reference");
  return {
    schemaVersion: PERFORMANCE_EPOCH_SCHEMA_VERSION,
    epoch: "E0",
    playerCount: 2,
    calibration: {
      comparisons: PERFORMANCE_CALIBRATION_COMPARISON_COUNT,
      method: "paired-same-commit",
      freshRunners: true,
      warmupCount: PERFORMANCE_WARMUP_COUNT,
      measurementCount: PERFORMANCE_MEASUREMENT_COUNT,
      formula: "p95-plus-25-percent-safety-margin",
      commit: "commit-1",
      environment,
    },
    entries: [
      createPerformanceBaselineEntry(reference, {
        totalMs: { relativePercent: 10, absoluteMs: 1 },
        dataLoadMs: { relativePercent: 25, absoluteMs: 1 },
        gamesMs: { relativePercent: 10, absoluteMs: 1 },
        aggregationMs: { relativePercent: 50, absoluteMs: 1 },
        resultPreparationMs: { relativePercent: 50, absoluteMs: 1 },
      }),
    ],
  };
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath: string): unknown {
  const value: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runNodeScript(scriptPath: string, args: readonly string[]) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

test("benchmark CLI compares artifacts, writes a report, and blocks confirmed regression", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "krutagidon-performance-cli-")
  );
  try {
    const baselinePath = path.join(root, "baseline.json");
    const basePath = path.join(root, "base.json");
    const headPath = path.join(root, "head.json");
    const confirmationPath = path.join(root, "confirmation.json");
    const reportPath = path.join(root, "report.json");
    writeJson(baselinePath, baseline());
    writeJson(basePath, measurement());
    writeJson(headPath, measurement("current", 13));
    writeJson(confirmationPath, measurement("current", 13));

    const result = runNodeScript(
      path.join(process.cwd(), "dist", "src", "cli", "run-benchmark.js"),
      [
        "--mode",
        "compare",
        "--baseline",
        baselinePath,
        "--base",
        basePath,
        "--head",
        headPath,
        "--confirmation",
        confirmationPath,
        "--format",
        "json",
        "--output",
        reportPath,
      ]
    );

    assert.equal(result.status, 1);
    const report = readJson(reportPath);
    assert.ok(isRecord(report));
    assert.equal(report["verdict"], "regression");
    assert.equal(report["blocking"], true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("benchmark CLI calculates and writes a twenty-pair calibration result", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "krutagidon-performance-calibrate-")
  );
  try {
    const calibrationPath = path.join(root, "pairs.json");
    const outputPath = path.join(root, "calibration.json");
    const pairs = Array.from(
      { length: PERFORMANCE_CALIBRATION_COMPARISON_COUNT },
      () => ({ first: measurement(), second: measurement("current", 10.2) })
    );
    writeJson(calibrationPath, pairs);

    const result = runNodeScript(
      path.join(process.cwd(), "dist", "src", "cli", "run-benchmark.js"),
      [
        "--mode",
        "calibrate",
        "--calibration",
        calibrationPath,
        "--format",
        "json",
        "--output",
        outputPath,
      ]
    );

    assert.equal(result.status, 0);
    const calibration = readJson(outputPath);
    assert.ok(isRecord(calibration));
    assert.equal(
      calibration["comparisons"],
      PERFORMANCE_CALIBRATION_COMPARISON_COUNT
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("benchmark CLI uses supplied calibration for a changed PR environment", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "krutagidon-performance-compare-calibration-")
  );
  try {
    const baselinePath = path.join(root, "baseline.json");
    const basePath = path.join(root, "base.json");
    const headPath = path.join(root, "head.json");
    const confirmationPath = path.join(root, "confirmation.json");
    const calibrationInputPath = path.join(root, "calibration-pairs.json");
    const calibrationPath = path.join(root, "calibration.json");
    const reportPath = path.join(root, "report.json");
    const pullRequestEnvironment: BenchmarkEnvironmentFingerprint = {
      ...environment,
      runner: "github:Linux:X64:ubuntu-24.04:pull-request",
    };
    const pairs = Array.from(
      { length: PERFORMANCE_CALIBRATION_COMPARISON_COUNT },
      () => ({
        first: measurement("current", 10, pullRequestEnvironment),
        second: measurement("current", 10.2, pullRequestEnvironment),
      })
    );
    writeJson(baselinePath, baseline());
    writeJson(basePath, measurement("current", 10, pullRequestEnvironment));
    writeJson(headPath, measurement("current", 13, pullRequestEnvironment));
    writeJson(
      confirmationPath,
      measurement("current", 13, pullRequestEnvironment)
    );
    writeJson(calibrationInputPath, pairs);

    const calibrationResult = runNodeScript(
      path.join(process.cwd(), "dist", "src", "cli", "run-benchmark.js"),
      [
        "--mode",
        "calibrate",
        "--calibration",
        calibrationInputPath,
        "--format",
        "json",
        "--output",
        calibrationPath,
      ]
    );
    assert.equal(calibrationResult.status, 0);

    const comparisonResult = runNodeScript(
      path.join(process.cwd(), "dist", "src", "cli", "run-benchmark.js"),
      [
        "--mode",
        "compare",
        "--baseline",
        baselinePath,
        "--base",
        basePath,
        "--head",
        headPath,
        "--confirmation",
        confirmationPath,
        "--calibration",
        calibrationPath,
        "--format",
        "json",
        "--output",
        reportPath,
      ]
    );

    assert.equal(comparisonResult.status, 1);
    const report = readJson(reportPath);
    assert.ok(isRecord(report));
    assert.equal(report["verdict"], "regression");
    assert.equal(report["blocking"], true);
    const epochComparison = report["epochComparison"];
    const baseComparison = report["baseComparison"];
    assert.ok(isRecord(epochComparison));
    assert.ok(isRecord(baseComparison));
    assert.equal(epochComparison["verdict"], "not-calibrated");
    assert.equal(baseComparison["verdict"], "regression");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("calibration collector groups twenty nested CI bundles by workload id", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "krutagidon-performance-collect-")
  );
  try {
    const input = path.join(root, "input");
    const nested = path.join(input, "nested");
    const output = path.join(root, "output");
    mkdirSync(nested, { recursive: true });
    for (let index = 1; index <= 20; index += 1) {
      writeJson(
        path.join(
          index % 2 === 0 ? input : nested,
          `performance-calibration-${index}.json`
        ),
        [
          {
            first: { id: "simulation:100" },
            second: { id: "simulation:100" },
          },
        ]
      );
    }

    const result = runNodeScript(
      path.join(
        process.cwd(),
        "scripts",
        "collect-performance-calibration.mjs"
      ),
      [input, output]
    );

    assert.equal(result.status, 0);
    const pairs = readJson(path.join(output, "simulation-100.json"));
    assert.ok(Array.isArray(pairs));
    assert.equal(pairs.length, PERFORMANCE_CALIBRATION_COMPARISON_COUNT);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("E0 baseline bootstrap requires matched reference and calibration fingerprints", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "krutagidon-performance-baseline-bootstrap-")
  );
  try {
    const referenceRoot = path.join(root, "reference");
    const calibrationRoot = path.join(root, "calibration");
    const outputPath = path.join(root, "performance-epoch-e0.json");
    mkdirSync(referenceRoot, { recursive: true });
    mkdirSync(calibrationRoot, { recursive: true });

    const workloads = [
      [
        "simulation",
        "simulation:100",
        "performance-epoch-reference-simulation.json",
        "calibration-simulation.json",
      ],
      [
        "analyzer",
        "analyzer:light",
        "performance-epoch-reference-analyzer-light.json",
        "calibration-analyzer-light.json",
      ],
      [
        "analyzer",
        "analyzer:typical",
        "performance-epoch-reference-analyzer-typical.json",
        "calibration-analyzer-typical.json",
      ],
      [
        "analyzer",
        "analyzer:heavy",
        "performance-epoch-reference-analyzer-heavy.json",
        "calibration-analyzer-heavy.json",
      ],
    ] as const;
    for (const [benchmark, id, referenceFile, calibrationFile] of workloads) {
      const reference = referenceMeasurement(benchmark, id);
      writeJson(path.join(referenceRoot, referenceFile), reference);
      writeJson(
        path.join(calibrationRoot, calibrationFile),
        calibrationFor(reference)
      );
    }

    const scriptPath = path.join(
      process.cwd(),
      "scripts",
      "create-performance-epoch-baseline.mjs"
    );
    const result = runNodeScript(scriptPath, [
      referenceRoot,
      calibrationRoot,
      outputPath,
    ]);
    assert.equal(result.status, 0);
    const baselineCandidate = readJson(outputPath);
    assert.ok(isRecord(baselineCandidate));
    assert.equal(baselineCandidate["epoch"], "E0");
    assert.equal(baselineCandidate["playerCount"], 2);
    assert.equal(
      Array.isArray(baselineCandidate["entries"])
        ? baselineCandidate["entries"].length
        : -1,
      workloads.length
    );

    const mismatchedCalibration = calibrationFor(
      referenceMeasurement("analyzer", "analyzer:heavy")
    );
    mismatchedCalibration.environment = {
      ...environment,
      runner: "github:Linux:X64:ubuntu-24.04:mismatch",
    };
    writeJson(
      path.join(calibrationRoot, "calibration-analyzer-heavy.json"),
      mismatchedCalibration
    );
    assert.equal(
      runNodeScript(scriptPath, [referenceRoot, calibrationRoot, outputPath])
        .status,
      1
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("legacy base simulation adapter enables the PR stage without changing base source", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "krutagidon-performance-base-adapter-")
  );
  try {
    const baseDir = path.join(root, "base");
    const moduleDir = path.join(baseDir, "dist", "src", "engine");
    mkdirSync(moduleDir, { recursive: true });
    writeJson(path.join(baseDir, "package.json"), { type: "module" });
    writeFileSync(
      path.join(moduleDir, "simulation-benchmark.js"),
      `export const SIMULATION_BENCHMARK_STAGES = [10, 1000];\nexport function runSimulationBenchmark(options) {\n  if (options.stage !== 100) throw new Error("stage adapter was not applied");\n  return { benchmark: "simulation", workload: { gameCount: options.stage } };\n}\n`,
      "utf8"
    );
    const outputPath = path.join(root, "base-simulation.json");

    const result = runNodeScript(
      path.join(process.cwd(), "scripts", "run-base-simulation-benchmark.mjs"),
      [baseDir, outputPath]
    );

    assert.equal(result.status, 0);
    const artifact = readJson(outputPath);
    assert.ok(isRecord(artifact));
    const workload = artifact["workload"];
    assert.ok(isRecord(workload));
    assert.equal(workload["gameCount"], 100);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("performance report gate requires all reports and blocks only blocking verdicts", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "krutagidon-performance-report-gate-")
  );
  try {
    for (const id of [
      "simulation",
      "analyzer-light",
      "analyzer-typical",
      "analyzer-heavy",
    ]) {
      writeJson(path.join(root, `performance-report-${id}.json`), {
        blocking: false,
      });
    }
    const scriptPath = path.join(
      process.cwd(),
      "scripts",
      "assert-performance-reports.mjs"
    );
    assert.equal(runNodeScript(scriptPath, [root]).status, 0);
    writeJson(path.join(root, "performance-report-analyzer-heavy.json"), {
      blocking: true,
    });
    assert.equal(runNodeScript(scriptPath, [root]).status, 1);
    writeJson(path.join(root, "performance-report-analyzer-heavy.json"), {
      blocking: false,
    });
    writeFileSync(
      path.join(root, "performance-report-analyzer-typical.json"),
      "not json",
      "utf8"
    );
    assert.equal(runNodeScript(scriptPath, [root]).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("base artifact enricher adds the runner environment and commit", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "krutagidon-performance-enrich-")
  );
  try {
    const inputPath = path.join(root, "input.json");
    const outputPath = path.join(root, "output.json");
    writeJson(inputPath, { benchmark: "simulation", workload: {} });

    const result = runNodeScript(
      path.join(process.cwd(), "scripts", "enrich-performance-artifact.mjs"),
      [inputPath, outputPath, "base-sha"]
    );

    assert.equal(result.status, 0);
    const enriched = readJson(outputPath);
    assert.ok(isRecord(enriched));
    const enrichedEnvironment = enriched["environment"];
    assert.ok(isRecord(enrichedEnvironment));
    assert.equal(typeof enrichedEnvironment["runner"], "string");
    assert.equal(enriched["commit"], "base-sha");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
