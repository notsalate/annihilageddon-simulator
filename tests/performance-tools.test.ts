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
  PERFORMANCE_CALIBRATION_SCHEMA_VERSION,
  PERFORMANCE_EPOCH,
  PERFORMANCE_EPOCH_SCHEMA_VERSION,
  PERFORMANCE_MEASUREMENT_COUNT,
  PERFORMANCE_WARMUP_COUNT,
  comparePerformance,
  createPerformanceBaselineEntry,
  type BenchmarkEnvironmentFingerprint,
  type PerformanceEpochBaseline,
  type PerformanceAcceptedCalibration,
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
    comparisonPairId: "fixture-pair",
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
    contractVersion: reference.contractVersion,
    workloadFingerprint: reference.workloadFingerprint,
    workloadVolumeFingerprint: reference.workloadVolumeFingerprint,
    warmupCount: PERFORMANCE_WARMUP_COUNT,
    measurementCount: PERFORMANCE_MEASUREMENT_COUNT,
    environment: reference.environment,
    formula: "p95-plus-25-percent-safety-margin",
    metrics,
    tolerances,
  };
}

function acceptedCalibrationFor(
  reference: PerformanceMeasurement
): PerformanceAcceptedCalibration {
  const calibration = calibrationFor(reference);
  return {
    schemaVersion: PERFORMANCE_CALIBRATION_SCHEMA_VERSION,
    calibrationId: "fixture-calibration-v1",
    commit: "1111111111111111111111111111111111111111",
    protocol: {
      comparisons: PERFORMANCE_CALIBRATION_COMPARISON_COUNT,
      warmupCount: PERFORMANCE_WARMUP_COUNT,
      measurementCount: PERFORMANCE_MEASUREMENT_COUNT,
      formula: "p95-plus-25-percent-safety-margin",
    },
    runnerClass: {
      nodeVersion: reference.environment.nodeVersion,
      platform: reference.environment.platform,
      arch: reference.environment.arch,
      runner: reference.environment.runner,
      cpuCount: reference.environment.cpuCount,
    },
    entries: [
      {
        benchmark: reference.benchmark,
        id: reference.id,
        contractVersion: reference.contractVersion,
        workloadFingerprint: reference.workloadFingerprint,
        workloadVolumeFingerprint: reference.workloadVolumeFingerprint,
        tolerances: calibration.tolerances,
      },
    ],
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

function passingReport(
  benchmark: PerformanceMeasurement["benchmark"],
  id: string,
  comparisonPairId = "fixture-pair"
) {
  const reference = {
    ...referenceMeasurement(benchmark, id),
    comparisonPairId,
  };
  const current: PerformanceMeasurement = {
    ...reference,
    role: "current",
    commit: "head-commit",
  };
  return comparePerformance({
    baseline: createPerformanceBaselineEntry(
      reference,
      calibrationFor(reference).tolerances
    ),
    acceptedCalibration: acceptedCalibrationFor(reference),
    epochReference: reference,
    base: { ...current, commit: "base-commit" },
    head: current,
    confirmation: current,
  });
}

const performanceReportFixtures = [
  ["simulation", "simulation", "simulation:100"],
  ["analyzer-light", "analyzer", "analyzer:light"],
  ["analyzer-typical", "analyzer", "analyzer:typical"],
  ["analyzer-heavy", "analyzer", "analyzer:heavy"],
] as const;

function writePassingReports(root: string, runId = "fixture-run"): void {
  for (const [fileId, benchmark, id] of performanceReportFixtures) {
    writeJson(
      path.join(root, `performance-report-${fileId}.json`),
      passingReport(benchmark, id, `${runId}:${fileId}`)
    );
  }
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

function runNodeScript(
  scriptPath: string,
  args: readonly string[],
  cwd = process.cwd()
) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
    env: withoutLocalGitEnvironment(),
  });
}

function withoutLocalGitEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  const localVariables = spawnSync("git", ["rev-parse", "--local-env-vars"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(localVariables.status, 0, localVariables.stderr);
  for (const variableName of localVariables.stdout.split(/\r?\n/u)) {
    if (variableName.length > 0) delete environment[variableName];
  }
  return environment;
}

function runGit(cwd: string, args: readonly string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: withoutLocalGitEnvironment(),
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("benchmark CLI compares artifacts, writes a report, and blocks confirmed regression", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "krutagidon-performance-cli-")
  );
  try {
    const baselinePath = path.join(root, "baseline.json");
    const acceptedCalibrationPath = path.join(root, "accepted.json");
    const basePath = path.join(root, "base.json");
    const headPath = path.join(root, "head.json");
    const confirmationPath = path.join(root, "confirmation.json");
    const reportPath = path.join(root, "report.json");
    writeJson(baselinePath, baseline());
    writeJson(
      acceptedCalibrationPath,
      acceptedCalibrationFor(measurement("reference"))
    );
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
        "--acceptedCalibration",
        acceptedCalibrationPath,
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
    const epochComparison = report["epochComparison"];
    assert.ok(isRecord(epochComparison));
    assert.equal(epochComparison["verdict"], "not-measured");
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

test("benchmark CLI uses accepted calibration for a changed PR environment", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "krutagidon-performance-compare-calibration-")
  );
  try {
    const baselinePath = path.join(root, "baseline.json");
    const epochReferencePath = path.join(root, "epoch-reference.json");
    const basePath = path.join(root, "base.json");
    const headPath = path.join(root, "head.json");
    const confirmationPath = path.join(root, "confirmation.json");
    const calibrationInputPath = path.join(root, "calibration-pairs.json");
    const calibrationPath = path.join(root, "calibration.json");
    const acceptedCalibrationPath = path.join(root, "accepted.json");
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
    writeJson(
      epochReferencePath,
      measurement("reference", 10, pullRequestEnvironment)
    );
    writeJson(basePath, measurement("current", 10, pullRequestEnvironment));
    writeJson(headPath, measurement("current", 13, pullRequestEnvironment));
    writeJson(
      confirmationPath,
      measurement("current", 13, pullRequestEnvironment)
    );
    writeJson(calibrationInputPath, pairs);
    writeJson(
      acceptedCalibrationPath,
      acceptedCalibrationFor(
        measurement("reference", 10, pullRequestEnvironment)
      )
    );

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
        "--epochReference",
        epochReferencePath,
        "--base",
        basePath,
        "--head",
        headPath,
        "--confirmation",
        confirmationPath,
        "--acceptedCalibration",
        acceptedCalibrationPath,
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
    assert.equal(epochComparison["verdict"], "regression");
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

test("calibration candidate records one versioned protocol and runner class", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "krutagidon-performance-calibration-candidate-")
  );
  try {
    const calibrationRoot = path.join(root, "calibration");
    const outputPath = path.join(root, "candidate.json");
    mkdirSync(calibrationRoot, { recursive: true });
    const workloads = [
      ["simulation", "simulation:100", "calibration-simulation.json"],
      ["analyzer", "analyzer:light", "calibration-analyzer-light.json"],
      ["analyzer", "analyzer:typical", "calibration-analyzer-typical.json"],
      ["analyzer", "analyzer:heavy", "calibration-analyzer-heavy.json"],
    ] as const;
    for (const [benchmark, id, fileName] of workloads) {
      const reference = {
        ...referenceMeasurement(benchmark, id),
        commit: "2222222222222222222222222222222222222222",
        environment: {
          ...environment,
          cpuModel: `fixture-${id}`,
        },
      };
      writeJson(
        path.join(calibrationRoot, fileName),
        calibrationFor(reference)
      );
    }

    const scriptPath = path.join(
      process.cwd(),
      "scripts",
      "create-performance-calibration-candidate.mjs"
    );
    const result = runNodeScript(scriptPath, [
      calibrationRoot,
      outputPath,
      "candidate-run-42",
    ]);

    assert.equal(result.status, 0);
    const candidate = readJson(outputPath);
    assert.ok(isRecord(candidate));
    assert.equal(candidate["calibrationId"], "candidate-run-42");
    assert.equal(
      candidate["commit"],
      "2222222222222222222222222222222222222222"
    );
    const runnerClass = candidate["runnerClass"];
    assert.ok(isRecord(runnerClass));
    assert.equal(runnerClass["cpuModel"], undefined);
    const entries = candidate["entries"];
    assert.ok(Array.isArray(entries));
    assert.equal(entries.length, 4);

    const mismatched = calibrationFor({
      ...referenceMeasurement("analyzer", "analyzer:heavy"),
      commit: "2222222222222222222222222222222222222222",
      environment: { ...environment, runner: "other-runner-class" },
    });
    writeJson(
      path.join(calibrationRoot, "calibration-analyzer-heavy.json"),
      mismatched
    );
    assert.notEqual(
      runNodeScript(scriptPath, [
        calibrationRoot,
        outputPath,
        "candidate-run-43",
      ]).status,
      0
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("current epoch baseline bootstrap requires matched reference and calibration fingerprints", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "krutagidon-performance-baseline-bootstrap-")
  );
  try {
    const referenceRoot = path.join(root, "reference");
    const calibrationRoot = path.join(root, "calibration");
    const outputPath = path.join(root, "performance-epoch-current.json");
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
      const calibration = calibrationFor(reference);
      calibration.environment = {
        ...calibration.environment,
        cpuModel: `fresh-runner-${id}`,
      };
      writeJson(path.join(calibrationRoot, calibrationFile), calibration);
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
    assert.equal(baselineCandidate["epoch"], PERFORMANCE_EPOCH);
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
    writePassingReports(root);
    const scriptPath = path.join(
      process.cwd(),
      "scripts",
      "assert-performance-reports.mjs"
    );
    assert.equal(runNodeScript(scriptPath, [root, "fixture-run"]).status, 0);
    const heavyPath = path.join(root, "performance-report-analyzer-heavy.json");
    const blockingReport = readJson(heavyPath);
    assert.ok(isRecord(blockingReport));
    blockingReport["blocking"] = true;
    blockingReport["verdict"] = "regression";
    writeJson(heavyPath, blockingReport);
    assert.equal(runNodeScript(scriptPath, [root, "fixture-run"]).status, 1);
    writePassingReports(root);
    writeFileSync(
      path.join(root, "performance-report-analyzer-typical.json"),
      "not json",
      "utf8"
    );
    assert.equal(runNodeScript(scriptPath, [root, "fixture-run"]).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("performance report gate rejects a lost fresh-session comparison pair", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "krutagidon-performance-report-integrity-")
  );
  try {
    writePassingReports(root);

    const simulationPath = path.join(
      root,
      "performance-report-simulation.json"
    );
    const brokenSimulation = readJson(simulationPath);
    assert.ok(isRecord(brokenSimulation));
    const brokenBase = brokenSimulation["base"];
    assert.ok(isRecord(brokenBase));
    delete brokenBase["comparisonPairId"];
    writeJson(simulationPath, brokenSimulation);

    const result = runNodeScript(
      path.join(process.cwd(), "scripts", "assert-performance-reports.mjs"),
      [root, "fixture-run"]
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /comparisonPairId/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("confirmation decision repeats only an observed preliminary regression", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "krutagidon-performance-confirmation-")
  );
  try {
    const reference = referenceMeasurement("simulation", "simulation:100");
    const current: PerformanceMeasurement = {
      ...reference,
      role: "current",
      commit: "head-commit",
    };
    const baselineEntry = createPerformanceBaselineEntry(
      reference,
      calibrationFor(reference).tolerances
    );
    const cleanPath = path.join(root, "clean.json");
    const regressionPath = path.join(root, "regression.json");
    writeJson(
      cleanPath,
      comparePerformance({
        baseline: baselineEntry,
        acceptedCalibration: acceptedCalibrationFor(reference),
        epochReference: reference,
        base: { ...current, commit: "base-commit" },
        head: current,
      })
    );
    writeJson(
      regressionPath,
      comparePerformance({
        baseline: baselineEntry,
        acceptedCalibration: acceptedCalibrationFor(reference),
        epochReference: reference,
        base: { ...current, commit: "base-commit" },
        head: {
          ...current,
          timings: { ...current.timings, totalMs: 13 },
        },
      })
    );

    const scriptPath = path.join(
      process.cwd(),
      "scripts",
      "performance-confirmation-required.mjs"
    );
    assert.equal(runNodeScript(scriptPath, [cleanPath]).stdout.trim(), "false");
    assert.equal(
      runNodeScript(scriptPath, [regressionPath]).stdout.trim(),
      "true"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("performance impact classifier skips only guaranteed non-executable changes", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "krutagidon-performance-impact-")
  );
  try {
    runGit(root, ["init"]);
    runGit(root, ["config", "user.name", "Performance Test"]);
    runGit(root, ["config", "user.email", "performance@example.invalid"]);
    writeFileSync(path.join(root, "README.md"), "initial\n", "utf8");
    runGit(root, ["add", "README.md"]);
    runGit(root, ["commit", "-m", "initial"]);

    const initial = runGit(root, ["rev-parse", "HEAD"]);
    mkdirSync(path.join(root, "docs"));
    writeFileSync(path.join(root, "docs", "guide.md"), "guide\n", "utf8");
    runGit(root, ["add", "docs/guide.md"]);
    runGit(root, ["commit", "-m", "docs"]);
    const docsHead = runGit(root, ["rev-parse", "HEAD"]);

    const scriptPath = path.join(
      process.cwd(),
      "scripts",
      "performance-pr-impact.mjs"
    );
    assert.equal(
      runNodeScript(scriptPath, [initial, docsHead], root).stdout.trim(),
      "false"
    );

    mkdirSync(path.join(root, "src"));
    writeFileSync(path.join(root, "src", "example.ts"), "export {};\n", "utf8");
    runGit(root, ["add", "src/example.ts"]);
    runGit(root, ["commit", "-m", "source"]);
    const sourceHead = runGit(root, ["rev-parse", "HEAD"]);
    assert.equal(
      runNodeScript(scriptPath, [docsHead, sourceHead], root).stdout.trim(),
      "true"
    );

    runGit(root, ["mv", "src/example.ts", "docs/example.md"]);
    runGit(root, ["commit", "-m", "rename source to docs"]);
    const renameHead = runGit(root, ["rev-parse", "HEAD"]);
    assert.equal(
      runNodeScript(scriptPath, [sourceHead, renameHead], root).stdout.trim(),
      "true"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("base artifact enricher adds runner metadata and comparison pair", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "krutagidon-performance-enrich-")
  );
  try {
    const inputPath = path.join(root, "input.json");
    const outputPath = path.join(root, "output.json");
    writeJson(inputPath, { benchmark: "simulation", workload: {} });

    const result = runNodeScript(
      path.join(process.cwd(), "scripts", "enrich-performance-artifact.mjs"),
      [inputPath, outputPath, "base-sha", "run-42:pull-request"]
    );

    assert.equal(result.status, 0);
    const enriched = readJson(outputPath);
    assert.ok(isRecord(enriched));
    const enrichedEnvironment = enriched["environment"];
    assert.ok(isRecord(enrichedEnvironment));
    assert.equal(typeof enrichedEnvironment["runner"], "string");
    assert.equal(enriched["commit"], "base-sha");
    assert.equal(enriched["comparisonPairId"], "run-42:pull-request");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepted E0 commit is read from the committed baseline", () => {
  const result = runNodeScript(
    path.join(process.cwd(), "scripts", "read-performance-epoch-commit.mjs"),
    [
      path.join(
        process.cwd(),
        "docs",
        "benchmarks",
        "performance-epoch-e0.json"
      ),
    ]
  );

  assert.equal(result.status, 0);
  assert.equal(
    result.stdout.trim(),
    "8fefe03277b6ec5ada27aa49938ba0e0fe97baeb"
  );
});

test("PR workflow shards workloads and conditionally confirms regressions", () => {
  const workflow = readFileSync(
    path.join(process.cwd(), ".github", "workflows", "performance.yml"),
    "utf8"
  );
  const pullRequestPlan = workflow.slice(
    workflow.indexOf("  pull-request-plan:"),
    workflow.indexOf("  pull-request-workload:")
  );
  const pullRequestWorkload = workflow.slice(
    workflow.indexOf("  pull-request-workload:"),
    workflow.indexOf("  pull-request:\n")
  );
  const pullRequestGate = workflow.slice(
    workflow.indexOf("  pull-request:\n"),
    workflow.indexOf("  scheduled:")
  );
  const calibrationRunHeader = workflow.slice(
    workflow.indexOf("  calibration-run:"),
    workflow.indexOf("    runs-on:", workflow.indexOf("  calibration-run:"))
  );

  assert.match(
    workflow,
    /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/u
  );
  assert.match(pullRequestPlan, /performance-pr-impact\.mjs/u);
  assert.match(pullRequestPlan, /--diff-filter=MDR/u);
  assert.match(pullRequestWorkload, /id: simulation/u);
  assert.match(pullRequestWorkload, /id: analyzer-light/u);
  assert.match(pullRequestWorkload, /id: analyzer-typical/u);
  assert.match(pullRequestWorkload, /id: analyzer-heavy/u);
  assert.match(
    pullRequestWorkload,
    /PERFORMANCE_COMPARISON_PAIR_ID: \$\{\{ github\.run_id \}\}:\$\{\{ matrix\.id \}\}/u
  );
  assert.match(pullRequestWorkload, /performance-preliminary-report/u);
  assert.match(pullRequestWorkload, /performance-confirmation-required\.mjs/u);
  assert.match(
    pullRequestWorkload,
    /performance-accepted-calibration-\$PERFORMANCE_WORKLOAD_ID\.json/u
  );
  assert.doesNotMatch(
    pullRequestWorkload.slice(
      pullRequestWorkload.indexOf("actions/upload-artifact")
    ),
    /docs\/benchmarks\/performance-calibration-e0-v1\.json/u
  );
  assert.match(
    pullRequestWorkload,
    /steps\.confirmation\.outputs\.required == 'true'/u
  );
  assert.doesNotMatch(pullRequestWorkload, /npm run benchmark:/u);
  assert.doesNotMatch(pullRequestWorkload, /needs:\s*calibration/u);
  assert.doesNotMatch(
    pullRequestWorkload,
    /performance-calibration-results-\$\{\{ github\.run_id \}\}/u
  );
  assert.match(pullRequestWorkload, /--acceptedCalibration/u);
  assert.match(
    pullRequestGate,
    /assert-performance-reports\.mjs "\$RUNNER_TEMP\/performance-reports" "\$\{\{ github\.run_id \}\}"/u
  );
  assert.ok(
    workflow.indexOf("actions/upload-artifact") <
      workflow.indexOf("Enforce performance gate")
  );
  assert.doesNotMatch(calibrationRunHeader, /pull_request/u);
  assert.match(calibrationRunHeader, /workflow_dispatch/u);
  assert.match(calibrationRunHeader, /event\.schedule/u);
});

test("every pull-request workflow cancels only an obsolete PR run", () => {
  const workflowPaths = [
    "security.yml",
    "sast.yml",
    "supply-chain.yml",
    "codeql.optional.yml",
    "performance.yml",
  ];
  for (const workflowPath of workflowPaths) {
    const workflow = readFileSync(
      path.join(process.cwd(), ".github", "workflows", workflowPath),
      "utf8"
    );
    assert.match(
      workflow,
      /group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.run_id \}\}/u,
      workflowPath
    );
    assert.match(
      workflow,
      /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/u,
      workflowPath
    );
  }
});
