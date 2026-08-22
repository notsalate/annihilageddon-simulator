import { readFileSync, writeFileSync } from "node:fs";

import {
  ANALYZER_BENCHMARK_PROFILES,
  runAnalyzerBenchmark,
  type AnalyzerBenchmarkProfileId,
  type AnalyzerBenchmarkResult,
  type AnalyzerBenchmarkRole,
} from "../engine/analyzer-benchmark.js";
import {
  assertPerformanceAcceptedCalibration,
  assertPerformanceEpochBaseline,
  calibratePerformance,
  comparePerformance,
  findPerformanceBaselineEntry,
  parsePerformanceMeasurement,
  toPerformanceMeasurement,
  type PerformanceCalibrationPair,
  type PerformanceAcceptedCalibration,
  type PerformanceEpochBaseline,
  type PerformanceMeasurement,
} from "../engine/performance-epoch.js";
import {
  runSimulationBenchmark,
  SIMULATION_BENCHMARK_STAGES,
  type SimulationBenchmarkResult,
  type SimulationBenchmarkRole,
  type SimulationBenchmarkStage,
} from "../engine/simulation-benchmark.js";

export type BenchmarkKind = "simulation" | "analyzer";
export type BenchmarkOutputFormat = "human" | "json";
export type BenchmarkMode = "run" | "compare" | "calibrate";

export interface BenchmarkArgs {
  mode: BenchmarkMode;
  kind: BenchmarkKind;
  role: SimulationBenchmarkRole | AnalyzerBenchmarkRole;
  format: BenchmarkOutputFormat;
  stage: SimulationBenchmarkStage;
  profile: AnalyzerBenchmarkProfileId;
  firstSeed: number | undefined;
  maxTurns: number | undefined;
  dataPackPath: string | undefined;
  commit: string | undefined;
  comparisonPairId: string | undefined;
  baselinePath: string | undefined;
  epochReferencePath: string | undefined;
  basePath: string | undefined;
  headPath: string | undefined;
  confirmationPath: string | undefined;
  acceptedCalibrationPath: string | undefined;
  calibrationPath: string | undefined;
  outputPath: string | undefined;
}

const defaults: BenchmarkArgs = {
  mode: "run",
  kind: "simulation",
  role: "reference",
  format: "human",
  stage: 10,
  profile: "light",
  firstSeed: undefined,
  maxTurns: undefined,
  dataPackPath: undefined,
  commit: undefined,
  comparisonPairId: undefined,
  baselinePath: undefined,
  epochReferencePath: undefined,
  basePath: undefined,
  headPath: undefined,
  confirmationPath: undefined,
  acceptedCalibrationPath: undefined,
  calibrationPath: undefined,
  outputPath: undefined,
};

export function parseBenchmarkArgs(args: readonly string[]): BenchmarkArgs {
  const values = new Map<string, string>();
  const supported = new Set([
    "kind",
    "mode",
    "role",
    "format",
    "stage",
    "profile",
    "firstSeed",
    "maxTurns",
    "dataPackPath",
    "commit",
    "comparisonPairId",
    "baseline",
    "epochReference",
    "base",
    "head",
    "confirmation",
    "acceptedCalibration",
    "calibration",
    "output",
  ]);
  for (let index = 0; index < args.length; index += 2) {
    const arg = args[index];
    if (
      arg === undefined ||
      !arg.startsWith("--") ||
      !supported.has(arg.slice(2))
    ) {
      throw new Error(`Unsupported argument: ${String(arg)}`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }
    values.set(arg.slice(2), value);
  }

  const mode = parseChoice(
    values.get("mode") ?? defaults.mode,
    ["run", "compare", "calibrate"] as const,
    "mode"
  );
  const kind = parseChoice(
    values.get("kind") ?? defaults.kind,
    ["simulation", "analyzer"] as const,
    "kind"
  );
  const role = parseChoice(
    values.get("role") ?? defaults.role,
    ["reference", "current"] as const,
    "role"
  );
  const format = parseChoice(
    values.get("format") ?? defaults.format,
    ["human", "json"] as const,
    "format"
  );
  const profile = parseChoice(
    values.get("profile") ?? defaults.profile,
    ANALYZER_BENCHMARK_PROFILES,
    "profile"
  );
  const stageValue = parsePositiveInteger(
    values.get("stage"),
    defaults.stage,
    "stage"
  );
  if (
    !SIMULATION_BENCHMARK_STAGES.includes(
      stageValue as SimulationBenchmarkStage
    )
  ) {
    throw new Error(
      `stage must be one of ${SIMULATION_BENCHMARK_STAGES.join(", ")}`
    );
  }

  return {
    kind,
    role,
    format,
    stage: stageValue as SimulationBenchmarkStage,
    profile,
    firstSeed: parseOptionalPositiveInteger(
      values.get("firstSeed"),
      "firstSeed"
    ),
    maxTurns: parseOptionalPositiveInteger(values.get("maxTurns"), "maxTurns"),
    dataPackPath: values.get("dataPackPath"),
    commit: values.get("commit"),
    comparisonPairId: values.get("comparisonPairId"),
    baselinePath: values.get("baseline"),
    epochReferencePath: values.get("epochReference"),
    basePath: values.get("base"),
    headPath: values.get("head"),
    confirmationPath: values.get("confirmation"),
    acceptedCalibrationPath: values.get("acceptedCalibration"),
    calibrationPath: values.get("calibration"),
    outputPath: values.get("output"),
    mode,
  };
}

export function formatSimulationBenchmark(
  result: SimulationBenchmarkResult
): string {
  const seconds = result.timings.totalMs / 1_000;
  const lines = [
    "Benchmark: simulation",
    `workload: ${result.workload.role} (${result.workload.workloadId})`,
    `stage: ${result.workload.gameCount} games, seeds ${result.workload.firstSeed}..${result.workload.firstSeed + result.workload.gameCount - 1}`,
    `players: ${result.workload.playerCount}`,
    "measurements: 1 warmup excluded, median of 3",
    `time: ${formatMilliseconds(result.timings.totalMs)}`,
    `phases: data ${formatMilliseconds(result.timings.dataLoadMs)}, games ${formatMilliseconds(result.timings.gamesMs)}, aggregation ${formatMilliseconds(result.timings.aggregationMs)}, result ${formatMilliseconds(result.timings.resultPreparationMs)}`,
    `throughput: ${formatRate(result.metrics.totalGames, seconds)} games/s, ${formatRate(result.metrics.totalTurns, seconds)} turns/s, ${formatRate(result.metrics.totalActions, seconds)} actions/s`,
    `games: completed ${result.metrics.completedGames}, maxTurns limit ${result.workload.maxTurns}, reached ${result.metrics.maxTurnsReached}`,
    `memory: ${result.peakMemoryBytes === undefined ? "not measured for this stage" : formatBytes(result.peakMemoryBytes)}`,
    `coverage: ${result.coverageSatisfied ? "complete" : `missing ${result.missingCoverage.join(", ")}`}`,
    `fingerprints: workload ${result.workloadFingerprint}, volume ${result.workloadVolumeFingerprint}, result ${result.resultFingerprint}`,
  ];
  return lines.join("\n");
}

export function formatAnalyzerBenchmark(
  result: AnalyzerBenchmarkResult
): string {
  const seconds = result.timings.totalMs / 1_000;
  const lines = [
    "Benchmark: analyzer",
    `workload: ${result.workload.role} (${result.workload.workloadId})`,
    `profile: ${result.workload.profile}, seeds ${result.workload.seeds.join(", ")}`,
    `players: ${result.workload.playerCount}, criterion: ${result.workload.criterionId}`,
    "measurements: 1 warmup excluded, median of 3",
    `time: ${formatMilliseconds(result.timings.totalMs)}`,
    `phases: data ${formatMilliseconds(result.timings.dataLoadMs)}, preparation ${formatMilliseconds(result.timings.preparationMs)}, enumeration ${formatMilliseconds(result.timings.enumerationMs)}, ranking ${formatMilliseconds(result.timings.rankingMs)}, result ${formatMilliseconds(result.timings.resultPreparationMs)}`,
    `throughput: ${formatRate(result.metrics.lineCount, seconds)} lines/s`,
    `search: lines ${result.metrics.lineCount}, actions ${result.metrics.actionCount}, branches ${result.metrics.branchCount}, choice branches ${result.metrics.choiceBranchCount}`,
    `limits: reached ${result.metrics.limitsReached}${formatLimitKinds(result.metrics.limitKindCounts)}`,
    `memory: ${formatBytes(result.peakMemoryBytes)}`,
    `fingerprints: workload ${result.workloadFingerprint}, volume ${result.workloadVolumeFingerprint}, result ${result.resultFingerprint}`,
  ];
  return lines.join("\n");
}

function parseChoice<const T extends readonly string[]>(
  value: string,
  choices: T,
  name: string
): T[number] {
  if (!choices.includes(value)) {
    throw new Error(`${name} must be one of ${choices.join(", ")}`);
  }
  return value;
}

function parsePositiveInteger(
  raw: string | undefined,
  fallback: number,
  name: string
): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/u.test(raw)) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

function parseOptionalPositiveInteger(
  raw: string | undefined,
  name: string
): number | undefined {
  return raw === undefined ? undefined : parsePositiveInteger(raw, 1, name);
}

function formatMilliseconds(value: number): string {
  return `${value.toFixed(2)} ms`;
}

function formatBytes(value: number): string {
  return `${value} bytes`;
}

function formatRate(value: number, seconds: number): string {
  return (seconds <= 0 ? 0 : value / seconds).toFixed(2);
}

function formatLimitKinds(counts: Readonly<Record<string, number>>): string {
  const entries = Object.entries(counts);
  return entries.length === 0
    ? ""
    : ` (${entries.map(([name, count]) => `${name} ${count}`).join(", ")})`;
}

export function formatPerformanceComparison(
  report: ReturnType<typeof comparePerformance>
): string {
  const epochWorkloadFingerprint =
    report.epochReference?.workloadFingerprint ?? "not-measured";
  const epochVolumeFingerprint =
    report.epochReference?.workloadVolumeFingerprint ?? "not-measured";
  const lines = [
    `Performance verdict: ${report.verdict}`,
    `workload: ${report.benchmark} (${report.id}), epoch ${report.epoch}`,
    `fingerprints: epoch ${epochWorkloadFingerprint}, base ${report.base.workloadFingerprint}, head ${report.head.workloadFingerprint}`,
    `volume fingerprints: epoch ${epochVolumeFingerprint}, base ${report.base.workloadVolumeFingerprint}, head ${report.head.workloadVolumeFingerprint}`,
    `accepted calibration: ${report.calibrationId ?? "none"}`,
    `Epoch health: ${report.epochComparison.verdict} — ${report.epochComparison.reason}`,
    `PR regression: ${report.baseComparison.verdict} — ${report.baseComparison.reason}`,
    `blocking source: ${report.blockingSource ?? "none"}`,
  ];
  if (report.blocking) {
    lines.push(
      `blocking metrics: ${[
        ...report.epochComparison.confirmedRegressionMetrics,
        ...report.baseComparison.confirmedRegressionMetrics,
      ].join(", ")}`
    );
  }
  return lines.join("\n");
}

export function formatPerformanceCalibration(
  result: ReturnType<typeof calibratePerformance>
): string {
  return [
    `Calibration: ${result.benchmark} (${result.id})`,
    `comparisons: ${result.comparisons} paired runs, commit ${result.commit}`,
    `formula: ${result.formula}`,
    ...Object.entries(result.tolerances).map(
      ([metricName, tolerance]) =>
        `${metricName}: ${tolerance.relativePercent}% or ${tolerance.absoluteMs} ms`
    ),
  ].join("\n");
}

function readJson(path: string): unknown {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  return value;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function requirePath(value: string | undefined, name: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`--${name} is required for this benchmark mode`);
  }
  return value;
}

function readBaseline(path: string): PerformanceEpochBaseline {
  const value = readJson(path);
  assertPerformanceEpochBaseline(value);
  return value;
}

function readMeasurement(path: string): PerformanceMeasurement {
  return parsePerformanceMeasurement(readJson(path));
}

function readCalibrationPairs(path: string): PerformanceCalibrationPair[] {
  const value = readJson(path);
  if (!Array.isArray(value)) {
    throw new TypeError("Calibration artifact must contain an array of pairs");
  }
  const pairs: PerformanceCalibrationPair[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      throw new TypeError("Calibration artifact contains an invalid pair");
    }
    const first = item["first"];
    const second = item["second"];
    if (first === undefined || second === undefined) {
      throw new TypeError("Calibration pair must contain first and second");
    }
    pairs.push({
      first: parsePerformanceMeasurement(first),
      second: parsePerformanceMeasurement(second),
    });
  }
  return pairs;
}

function readAcceptedCalibration(path: string): PerformanceAcceptedCalibration {
  const value = readJson(path);
  assertPerformanceAcceptedCalibration(value);
  return value;
}

function runRawBenchmark(args: BenchmarkArgs): {
  result: AnalyzerBenchmarkResult | SimulationBenchmarkResult;
  output: string;
} {
  if (args.kind === "simulation") {
    const result = runSimulationBenchmark({
      rootDir: process.cwd(),
      role: args.role,
      stage: args.stage,
      ...(args.firstSeed === undefined ? {} : { firstSeed: args.firstSeed }),
      ...(args.maxTurns === undefined ? {} : { maxTurns: args.maxTurns }),
      ...(args.dataPackPath === undefined
        ? {}
        : { dataPackPath: args.dataPackPath }),
      ...(args.commit === undefined
        ? {}
        : { dependencies: { commit: args.commit } }),
    });
    return {
      result,
      output:
        args.format === "json"
          ? JSON.stringify(result, null, 2)
          : formatSimulationBenchmark(result),
    };
  }

  const result = runAnalyzerBenchmark({
    rootDir: process.cwd(),
    role: args.role,
    profile: args.profile,
    ...(args.dataPackPath === undefined
      ? {}
      : { dataPackPath: args.dataPackPath }),
    ...(args.commit === undefined
      ? {}
      : { dependencies: { commit: args.commit } }),
  });
  return {
    result,
    output:
      args.format === "json"
        ? JSON.stringify(result, null, 2)
        : formatAnalyzerBenchmark(result),
  };
}

function runComparison(args: BenchmarkArgs): {
  report: ReturnType<typeof comparePerformance>;
  output: string;
} {
  const baseline = readBaseline(requirePath(args.baselinePath, "baseline"));
  const epochReference =
    args.epochReferencePath === undefined
      ? null
      : readMeasurement(args.epochReferencePath);
  const base = readMeasurement(requirePath(args.basePath, "base"));
  const head = readMeasurement(requirePath(args.headPath, "head"));
  const confirmation =
    args.confirmationPath === undefined
      ? undefined
      : readMeasurement(args.confirmationPath);
  const acceptedCalibration =
    args.acceptedCalibrationPath === undefined
      ? undefined
      : readAcceptedCalibration(args.acceptedCalibrationPath);
  const entry = findPerformanceBaselineEntry(baseline, head);
  const report = comparePerformance({
    baseline: entry,
    acceptedCalibration: acceptedCalibration ?? null,
    epochReference,
    base,
    head,
    ...(confirmation === undefined ? {} : { confirmation }),
  });
  return {
    report,
    output:
      args.format === "json"
        ? JSON.stringify(report, null, 2)
        : formatPerformanceComparison(report),
  };
}

function runCalibration(args: BenchmarkArgs): {
  result: ReturnType<typeof calibratePerformance>;
  output: string;
} {
  const result = calibratePerformance(
    readCalibrationPairs(requirePath(args.calibrationPath, "calibration"))
  );
  return {
    result,
    output:
      args.format === "json"
        ? JSON.stringify(result, null, 2)
        : formatPerformanceCalibration(result),
  };
}

if (process.argv[1]?.endsWith("run-benchmark.js")) {
  try {
    const args = parseBenchmarkArgs(process.argv.slice(2));
    if (args.mode === "run") {
      const { result, output } = runRawBenchmark(args);
      console.log(output);
      if (args.outputPath !== undefined) {
        writeJson(
          args.outputPath,
          toPerformanceMeasurement(result, args.comparisonPairId)
        );
      }
    } else if (args.mode === "compare") {
      const { report, output } = runComparison(args);
      console.log(output);
      if (args.outputPath !== undefined) writeJson(args.outputPath, report);
      if (report.blocking) process.exitCode = 1;
    } else {
      const { result, output } = runCalibration(args);
      console.log(output);
      if (args.outputPath !== undefined) writeJson(args.outputPath, result);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
