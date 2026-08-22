import { isPlainRecord } from "../common.js";
import type {
  AnalyzerBenchmarkResult,
  AnalyzerBenchmarkTimings,
} from "./analyzer-benchmark.js";
import { type BenchmarkEnvironmentFingerprint } from "./benchmark-support.js";
import type {
  SimulationBenchmarkResult,
  SimulationBenchmarkTimings,
} from "./simulation-benchmark.js";

export const PERFORMANCE_EPOCH_SCHEMA_VERSION = "performance-epoch-v1" as const;
export const PERFORMANCE_EPOCH = "E0" as const;
export const PERFORMANCE_CALIBRATION_COMPARISON_COUNT = 20 as const;
export const PERFORMANCE_WARMUP_COUNT = 1 as const;
export const PERFORMANCE_MEASUREMENT_COUNT = 3 as const;

const LEGACY_BENCHMARK_ENVIRONMENT: BenchmarkEnvironmentFingerprint = {
  nodeVersion: "unknown",
  platform: "unknown",
  arch: "unknown",
  runner: "unknown",
  cpuModel: "unknown",
  cpuCount: 1,
};

export const PERFORMANCE_STAGES = {
  smoke: 10,
  pullRequest: 100,
  nightly: 1_000,
  weekly: 10_000,
  release: 100_000,
} as const;

export type PerformanceStage = keyof typeof PERFORMANCE_STAGES;
export type PerformanceBenchmarkKind = "simulation" | "analyzer";
export type PerformanceVerdict =
  | "pass"
  | "regression"
  | "workload-changed"
  | "not-calibrated"
  | "not-measured";

export interface PerformanceMeasurement {
  benchmark: PerformanceBenchmarkKind;
  id: string;
  role: "reference" | "current";
  epoch: string;
  contractVersion: string;
  playerCount: number;
  workloadFingerprint: string;
  workloadVolumeFingerprint: string;
  resultFingerprint: string;
  warmupCount: number;
  measurementCount: number;
  environment: BenchmarkEnvironmentFingerprint;
  comparisonPairId?: string;
  commit: string | null;
  timings: Readonly<Record<string, number>>;
  metrics: Readonly<Record<string, number>>;
}

export interface PerformanceTolerance {
  relativePercent: number;
  absoluteMs: number;
}

export interface PerformanceBaselineEntry {
  benchmark: PerformanceBenchmarkKind;
  id: string;
  epoch: string;
  reference: PerformanceMeasurement;
  tolerances: Readonly<Record<string, PerformanceTolerance>>;
}

export interface PerformanceCalibrationMetric {
  p95RelativePercent: number;
  p95AbsoluteMs: number;
  tolerance: PerformanceTolerance;
}

export interface PerformanceCalibrationResult {
  benchmark: PerformanceBenchmarkKind;
  id: string;
  comparisons: typeof PERFORMANCE_CALIBRATION_COMPARISON_COUNT;
  commit: string;
  environment: BenchmarkEnvironmentFingerprint;
  formula: "p95-plus-25-percent-safety-margin";
  metrics: Readonly<Record<string, PerformanceCalibrationMetric>>;
  tolerances: Readonly<Record<string, PerformanceTolerance>>;
}

export interface PerformanceCalibrationPair {
  first: PerformanceMeasurement;
  second: PerformanceMeasurement;
}

export interface PerformanceEpochCalibrationMetadata {
  comparisons: typeof PERFORMANCE_CALIBRATION_COMPARISON_COUNT;
  method: "paired-same-commit";
  freshRunners: true;
  warmupCount: typeof PERFORMANCE_WARMUP_COUNT;
  measurementCount: typeof PERFORMANCE_MEASUREMENT_COUNT;
  formula: "p95-plus-25-percent-safety-margin";
  commit: string;
  environment: BenchmarkEnvironmentFingerprint;
}

export interface PerformanceEpochBaseline {
  schemaVersion: typeof PERFORMANCE_EPOCH_SCHEMA_VERSION;
  epoch: string;
  playerCount: 2;
  calibration: PerformanceEpochCalibrationMetadata;
  entries: readonly PerformanceBaselineEntry[];
}

export interface PerformanceMetricDelta {
  referenceMs: number;
  candidateMs: number;
  deltaMs: number;
  relativePercent: number;
  tolerance: PerformanceTolerance;
}

export interface PerformancePairComparison {
  verdict: PerformanceVerdict;
  blocking: boolean;
  reason: string;
  observedRegressionMetrics: readonly string[];
  confirmedRegressionMetrics: readonly string[];
  deltas: Readonly<Record<string, PerformanceMetricDelta>>;
}

export interface PerformanceComparisonReport {
  benchmark: PerformanceBenchmarkKind;
  id: string;
  epoch: string;
  verdict: PerformanceVerdict;
  blocking: boolean;
  blockingSource: "epoch-health" | "pull-request-regression" | "both" | null;
  epochComparison: PerformancePairComparison;
  baseComparison: PerformancePairComparison;
  epochReference: PerformanceMeasurement | null;
  head: PerformanceMeasurement;
  base: PerformanceMeasurement;
  confirmation?: PerformanceMeasurement;
}

type BenchmarkResult = SimulationBenchmarkResult | AnalyzerBenchmarkResult;

export function toPerformanceMeasurement(
  result: BenchmarkResult,
  comparisonPairId?: string
): PerformanceMeasurement {
  if (result.benchmark === "simulation") {
    return {
      benchmark: "simulation",
      id: `${result.benchmark}:${result.workload.gameCount}`,
      role: result.workload.role,
      epoch: result.workload.epoch,
      contractVersion: result.workload.contractVersion,
      playerCount: result.workload.playerCount,
      workloadFingerprint: result.workloadFingerprint,
      workloadVolumeFingerprint: result.workloadVolumeFingerprint,
      resultFingerprint: result.resultFingerprint,
      warmupCount: result.warmupCount,
      measurementCount: result.measurementCount,
      environment: result.environment,
      ...(comparisonPairId === undefined ? {} : { comparisonPairId }),
      commit: result.commit,
      timings: simulationTimings(result.timings),
      metrics: simulationMetrics(result.metrics),
    };
  }

  return {
    benchmark: "analyzer",
    id: `${result.benchmark}:${result.workload.profile}`,
    role: result.workload.role,
    epoch: result.workload.epoch,
    contractVersion: result.workload.contractVersion,
    playerCount: result.workload.playerCount,
    workloadFingerprint: result.workloadFingerprint,
    workloadVolumeFingerprint: result.workloadVolumeFingerprint,
    resultFingerprint: result.resultFingerprint,
    warmupCount: result.warmupCount,
    measurementCount: result.measurementCount,
    environment: result.environment,
    ...(comparisonPairId === undefined ? {} : { comparisonPairId }),
    commit: result.commit,
    timings: analyzerTimings(result.timings),
    metrics: analyzerMetrics(result.metrics),
  };
}

export function createPerformanceBaselineEntry(
  reference: PerformanceMeasurement,
  tolerances: Readonly<Record<string, PerformanceTolerance>>
): PerformanceBaselineEntry {
  if (reference.role !== "reference") {
    throw new Error("Performance baseline must use a reference measurement");
  }

  return {
    benchmark: reference.benchmark,
    id: reference.id,
    epoch: reference.epoch,
    reference,
    tolerances,
  };
}

export function calibratePerformance(
  pairs: readonly PerformanceCalibrationPair[]
): PerformanceCalibrationResult {
  if (pairs.length !== PERFORMANCE_CALIBRATION_COMPARISON_COUNT) {
    throw new RangeError(
      `Calibration requires exactly ${PERFORMANCE_CALIBRATION_COMPARISON_COUNT} paired comparisons`
    );
  }

  const firstPair = pairs[0];
  if (firstPair === undefined) {
    throw new Error("Calibration did not receive paired comparisons");
  }
  assertCalibrationPair(firstPair);
  const { first } = firstPair;
  if (first.commit === null) {
    throw new Error("Calibration requires a commit on every measurement");
  }
  for (const pair of pairs) {
    assertCalibrationPair(pair);
    if (
      !sameWorkload(pair.first, first) ||
      !sameProtocol(pair.first, first) ||
      !sameCalibrationEnvironment(pair.first.environment, first.environment) ||
      pair.first.commit !== first.commit ||
      pair.second.commit !== first.commit
    ) {
      throw new Error(
        "Calibration pairs must use one workload, protocol, runner class and commit"
      );
    }
  }

  const metricNames = Object.keys(first.timings);
  const metrics: Record<string, PerformanceCalibrationMetric> = {};
  for (const metricName of metricNames) {
    const relativeValues: number[] = [];
    const absoluteValues: number[] = [];
    for (const pair of pairs) {
      const firstValue = pair.first.timings[metricName];
      const secondValue = pair.second.timings[metricName];
      if (firstValue === undefined || secondValue === undefined) {
        throw new Error(
          `Calibration metric ${metricName} is missing from a pair`
        );
      }
      const absoluteValue = Math.abs(firstValue - secondValue);
      absoluteValues.push(absoluteValue);
      relativeValues.push(
        (absoluteValue / Math.max(Math.abs(firstValue), 1)) * 100
      );
    }

    const p95AbsoluteMs = percentile95(absoluteValues);
    const p95RelativePercent = percentile95(relativeValues);
    const tolerance = {
      relativePercent: roundToTwo(p95RelativePercent * 1.25),
      absoluteMs: roundToTwo(p95AbsoluteMs * 1.25),
    } satisfies PerformanceTolerance;
    metrics[metricName] = {
      p95RelativePercent: roundToTwo(p95RelativePercent),
      p95AbsoluteMs: roundToTwo(p95AbsoluteMs),
      tolerance,
    };
  }

  const tolerances: Record<string, PerformanceTolerance> = {};
  for (const [metricName, metric] of Object.entries(metrics)) {
    tolerances[metricName] = metric.tolerance;
  }

  return {
    benchmark: first.benchmark,
    id: first.id,
    comparisons: PERFORMANCE_CALIBRATION_COMPARISON_COUNT,
    commit: first.commit,
    environment: first.environment,
    formula: "p95-plus-25-percent-safety-margin",
    metrics,
    tolerances,
  };
}

export function comparePerformance(options: {
  baseline: PerformanceBaselineEntry;
  epochReference?: PerformanceMeasurement | null;
  base: PerformanceMeasurement;
  head: PerformanceMeasurement;
  confirmation?: PerformanceMeasurement;
  baseCalibration?: PerformanceCalibrationResult;
}): PerformanceComparisonReport {
  const epochReference =
    options.epochReference === undefined
      ? options.baseline.reference
      : options.epochReference;
  const epochComparison =
    epochReference === null
      ? emptyComparison(
          "not-measured",
          "The accepted E0 commit was not measured with the current protocol"
        )
      : epochReference.commit !== options.baseline.reference.commit
        ? emptyComparison(
            "not-measured",
            "The E0 measurement does not come from the accepted baseline commit"
          )
        : comparePair(
            epochReference,
            options.head,
            options.baseline.tolerances,
            options.confirmation,
            options.baseCalibration?.environment ??
              options.baseline.reference.environment
          );
  const baseComparison = comparePair(
    options.base,
    options.head,
    options.baseCalibration?.tolerances ?? options.baseline.tolerances,
    options.confirmation,
    options.baseCalibration?.environment ??
      options.baseline.reference.environment
  );
  const comparisons = [epochComparison, baseComparison];
  const verdict =
    epochComparison.verdict === "workload-changed"
      ? "workload-changed"
      : comparisons.some((comparison) => comparison.verdict === "regression")
        ? "regression"
        : comparisons.some(
              (comparison) => comparison.verdict === "workload-changed"
            )
          ? "workload-changed"
          : comparisons.some(
                (comparison) => comparison.verdict === "not-calibrated"
              )
            ? "not-calibrated"
            : comparisons.some(
                  (comparison) => comparison.verdict === "not-measured"
                )
              ? "not-measured"
              : "pass";
  const blocking = verdict === "regression";
  const blockingSource = !blocking
    ? null
    : epochComparison.blocking && baseComparison.blocking
      ? "both"
      : epochComparison.blocking
        ? "epoch-health"
        : "pull-request-regression";

  return {
    benchmark: options.head.benchmark,
    id: options.head.id,
    epoch: options.head.epoch,
    verdict,
    blocking,
    blockingSource,
    epochComparison,
    baseComparison,
    epochReference,
    head: options.head,
    base: options.base,
    ...(options.confirmation === undefined
      ? {}
      : { confirmation: options.confirmation }),
  };
}

export function assertPerformanceEpochBaseline(
  value: unknown
): asserts value is PerformanceEpochBaseline {
  if (!isPerformanceEpochBaseline(value)) {
    throw new TypeError("Invalid performance epoch baseline");
  }
}

export function assertPerformanceCalibrationResult(
  value: unknown
): asserts value is PerformanceCalibrationResult {
  if (!isPerformanceCalibrationResult(value)) {
    throw new TypeError("Invalid performance calibration result");
  }
}

export function getAcceptedPerformanceEpochCommit(
  baseline: PerformanceEpochBaseline
): string {
  const commit = baseline.calibration.commit;
  if (!/^[0-9a-f]{40}$/u.test(commit)) {
    throw new Error(
      "Performance epoch baseline has no full accepted commit SHA"
    );
  }
  if (baseline.entries.some((entry) => entry.reference.commit !== commit)) {
    throw new Error(
      "Performance epoch reference measurements do not share the accepted commit"
    );
  }
  return commit;
}

export function parsePerformanceMeasurement(
  value: unknown
): PerformanceMeasurement {
  if (isPerformanceMeasurement(value)) {
    return value;
  }
  if (isPlainRecord(value) && isPerformanceMeasurement(value["measurement"])) {
    return value["measurement"];
  }
  const legacyMeasurement = parseLegacyPerformanceMeasurement(value);
  if (legacyMeasurement !== undefined) return legacyMeasurement;
  throw new TypeError("Invalid performance benchmark artifact");
}

export function findPerformanceBaselineEntry(
  baseline: PerformanceEpochBaseline,
  measurement: Pick<PerformanceMeasurement, "benchmark" | "id">
): PerformanceBaselineEntry {
  const entry = baseline.entries.find(
    (candidate) =>
      candidate.benchmark === measurement.benchmark &&
      candidate.id === measurement.id
  );
  if (entry === undefined) {
    throw new Error(
      `Performance baseline has no entry for ${measurement.benchmark}/${measurement.id}`
    );
  }
  return entry;
}

function comparePair(
  reference: PerformanceMeasurement,
  candidate: PerformanceMeasurement,
  tolerances: Readonly<Record<string, PerformanceTolerance>>,
  confirmation: PerformanceMeasurement | undefined,
  calibratedEnvironment: BenchmarkEnvironmentFingerprint
): PerformancePairComparison {
  if (!sameWorkload(reference, candidate)) {
    return emptyComparison(
      "workload-changed",
      "Workload fingerprint, epoch or benchmark contract changed; start a new performance epoch"
    );
  }
  if (!sameProtocol(reference, candidate)) {
    return emptyComparison(
      "not-measured",
      "Benchmark protocol changed; repeat the calibration"
    );
  }
  if (!sameEnvironment(reference.environment, candidate.environment)) {
    return emptyComparison(
      "not-calibrated",
      "Blocking comparison requires measurements from one exact environment"
    );
  }
  if (!sameComparisonPair(reference, candidate)) {
    return emptyComparison(
      "not-calibrated",
      "Blocking comparison requires measurements from one runner session"
    );
  }
  if (
    !sameCalibrationEnvironment(reference.environment, calibratedEnvironment) ||
    !sameCalibrationEnvironment(candidate.environment, calibratedEnvironment)
  ) {
    return emptyComparison(
      "not-calibrated",
      "Benchmark environment differs from the calibrated environment"
    );
  }

  const deltas = Object.fromEntries(
    Object.entries(reference.timings).map(([metricName, referenceMs]) => {
      const candidateMs = candidate.timings[metricName];
      const tolerance = tolerances[metricName];
      if (candidateMs === undefined || tolerance === undefined) {
        return [metricName, undefined];
      }
      const deltaMs = candidateMs - referenceMs;
      return [
        metricName,
        {
          referenceMs,
          candidateMs,
          deltaMs,
          relativePercent: (deltaMs / Math.max(Math.abs(referenceMs), 1)) * 100,
          tolerance,
        } satisfies PerformanceMetricDelta,
      ];
    })
  );
  const completeDeltas = Object.fromEntries(
    Object.entries(deltas).filter(
      (entry): entry is [string, PerformanceMetricDelta] =>
        entry[1] !== undefined
    )
  );
  if (Object.keys(completeDeltas).length === 0) {
    return emptyComparison(
      "not-measured",
      "No calibrated timing metric is available"
    );
  }

  const observedRegressionMetrics = Object.entries(completeDeltas)
    .filter(([, delta]) => exceedsTolerance(delta))
    .map(([metricName]) => metricName);
  if (observedRegressionMetrics.length === 0) {
    return {
      verdict: "pass",
      blocking: false,
      reason: "All calibrated timing metrics remain within tolerance",
      observedRegressionMetrics,
      confirmedRegressionMetrics: [],
      deltas: completeDeltas,
    };
  }
  if (confirmation === undefined) {
    return {
      verdict: "not-measured",
      blocking: false,
      reason: "A second measurement is required to confirm the regression",
      observedRegressionMetrics,
      confirmedRegressionMetrics: [],
      deltas: completeDeltas,
    };
  }
  if (
    !sameWorkload(reference, confirmation) ||
    !sameProtocol(reference, confirmation) ||
    !sameEnvironment(reference.environment, confirmation.environment) ||
    !sameComparisonPair(reference, confirmation) ||
    !sameCalibrationEnvironment(confirmation.environment, calibratedEnvironment)
  ) {
    return {
      verdict: "not-measured",
      blocking: false,
      reason: "The confirming measurement is not comparable",
      observedRegressionMetrics,
      confirmedRegressionMetrics: [],
      deltas: completeDeltas,
    };
  }

  const confirmedRegressionMetrics = observedRegressionMetrics.filter(
    (metricName) => {
      const referenceMs = reference.timings[metricName];
      const confirmationMs = confirmation.timings[metricName];
      const tolerance = tolerances[metricName];
      if (
        referenceMs === undefined ||
        confirmationMs === undefined ||
        tolerance === undefined
      ) {
        return false;
      }
      return (
        confirmationMs - referenceMs > tolerance.absoluteMs &&
        ((confirmationMs - referenceMs) / Math.max(Math.abs(referenceMs), 1)) *
          100 >
          tolerance.relativePercent
      );
    }
  );
  if (confirmedRegressionMetrics.length === 0) {
    return {
      verdict: "pass",
      blocking: false,
      reason:
        "The initial regression did not repeat in the confirming measurement",
      observedRegressionMetrics,
      confirmedRegressionMetrics,
      deltas: completeDeltas,
    };
  }
  return {
    verdict: "regression",
    blocking: true,
    reason: "The regression exceeded calibrated tolerance twice",
    observedRegressionMetrics,
    confirmedRegressionMetrics,
    deltas: completeDeltas,
  };
}

function emptyComparison(
  verdict: Exclude<PerformanceVerdict, "pass" | "regression">,
  reason: string
): PerformancePairComparison {
  return {
    verdict,
    blocking: false,
    reason,
    observedRegressionMetrics: [],
    confirmedRegressionMetrics: [],
    deltas: {},
  };
}

function exceedsTolerance(delta: PerformanceMetricDelta): boolean {
  return (
    delta.deltaMs > delta.tolerance.absoluteMs &&
    delta.relativePercent > delta.tolerance.relativePercent
  );
}

function sameWorkload(
  left: PerformanceMeasurement,
  right: PerformanceMeasurement
): boolean {
  return (
    left.benchmark === right.benchmark &&
    left.id === right.id &&
    left.epoch === right.epoch &&
    left.contractVersion === right.contractVersion &&
    left.playerCount === right.playerCount &&
    left.workloadFingerprint === right.workloadFingerprint &&
    left.workloadVolumeFingerprint === right.workloadVolumeFingerprint
  );
}

function sameComparisonPair(
  left: PerformanceMeasurement,
  right: PerformanceMeasurement
): boolean {
  return (
    left.comparisonPairId !== undefined &&
    left.comparisonPairId === right.comparisonPairId
  );
}

function sameProtocol(
  left: PerformanceMeasurement,
  right: PerformanceMeasurement
): boolean {
  return (
    left.warmupCount === PERFORMANCE_WARMUP_COUNT &&
    right.warmupCount === PERFORMANCE_WARMUP_COUNT &&
    left.measurementCount === PERFORMANCE_MEASUREMENT_COUNT &&
    right.measurementCount === PERFORMANCE_MEASUREMENT_COUNT
  );
}

function sameEnvironment(
  left: BenchmarkEnvironmentFingerprint,
  right: BenchmarkEnvironmentFingerprint
): boolean {
  return (
    left.nodeVersion === right.nodeVersion &&
    left.platform === right.platform &&
    left.arch === right.arch &&
    left.runner === right.runner &&
    left.cpuModel === right.cpuModel &&
    left.cpuCount === right.cpuCount
  );
}

function sameCalibrationEnvironment(
  left: BenchmarkEnvironmentFingerprint,
  right: BenchmarkEnvironmentFingerprint
): boolean {
  return (
    left.nodeVersion === right.nodeVersion &&
    left.platform === right.platform &&
    left.arch === right.arch &&
    left.runner === right.runner &&
    left.cpuCount === right.cpuCount
  );
}

function assertCalibrationPair(pair: PerformanceCalibrationPair): void {
  if (
    !sameWorkload(pair.first, pair.second) ||
    !sameProtocol(pair.first, pair.second) ||
    !sameEnvironment(pair.first.environment, pair.second.environment)
  ) {
    throw new Error("Calibration pairs must compare identical workloads");
  }
}

function percentile95(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * 0.95) - 1
  );
  const value = sorted[index];
  if (value === undefined) {
    throw new Error("Cannot calculate a percentile of an empty sequence");
  }
  return value;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function simulationTimings(
  timings: SimulationBenchmarkTimings
): Readonly<Record<string, number>> {
  return {
    totalMs: timings.totalMs,
    dataLoadMs: timings.dataLoadMs,
    gamesMs: timings.gamesMs,
    aggregationMs: timings.aggregationMs,
    resultPreparationMs: timings.resultPreparationMs,
  };
}

function simulationMetrics(
  metrics: SimulationBenchmarkResult["metrics"]
): Readonly<Record<string, number>> {
  return {
    totalGames: metrics.totalGames,
    totalTurns: metrics.totalTurns,
    totalActions: metrics.totalActions,
    totalEvents: metrics.totalEvents,
    completedGames: metrics.completedGames,
    maxTurnsReached: metrics.maxTurnsReached,
  };
}

function analyzerTimings(
  timings: AnalyzerBenchmarkTimings
): Readonly<Record<string, number>> {
  return {
    totalMs: timings.totalMs,
    dataLoadMs: timings.dataLoadMs,
    preparationMs: timings.preparationMs,
    enumerationMs: timings.enumerationMs,
    rankingMs: timings.rankingMs,
    resultPreparationMs: timings.resultPreparationMs,
  };
}

function analyzerMetrics(
  metrics: AnalyzerBenchmarkResult["metrics"]
): Readonly<Record<string, number>> {
  return {
    totalSeeds: metrics.totalSeeds,
    lineCount: metrics.lineCount,
    rankedLineCount: metrics.rankedLineCount,
    actionCount: metrics.actionCount,
    branchCount: metrics.branchCount,
    choiceBranchCount: metrics.choiceBranchCount,
    limitsReached: metrics.limitsReached,
  };
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNumberRecord(
  value: unknown
): value is Readonly<Record<string, number>> {
  return (
    isPlainRecord(value) && Object.values(value).every((item) => isNumber(item))
  );
}

function isEnvironmentFingerprint(
  value: unknown
): value is BenchmarkEnvironmentFingerprint {
  if (!isPlainRecord(value)) return false;
  return (
    isString(value["nodeVersion"]) &&
    isString(value["platform"]) &&
    isString(value["arch"]) &&
    isString(value["runner"]) &&
    isString(value["cpuModel"]) &&
    isNumber(value["cpuCount"]) &&
    Number.isInteger(value["cpuCount"]) &&
    value["cpuCount"] > 0
  );
}

function isPerformanceMeasurement(
  value: unknown
): value is PerformanceMeasurement {
  if (!isPlainRecord(value)) return false;
  return (
    (value["benchmark"] === "simulation" ||
      value["benchmark"] === "analyzer") &&
    isString(value["id"]) &&
    (value["role"] === "reference" || value["role"] === "current") &&
    isString(value["epoch"]) &&
    isString(value["contractVersion"]) &&
    isNumber(value["playerCount"]) &&
    isString(value["workloadFingerprint"]) &&
    isString(value["workloadVolumeFingerprint"]) &&
    isString(value["resultFingerprint"]) &&
    isNumber(value["warmupCount"]) &&
    isNumber(value["measurementCount"]) &&
    isEnvironmentFingerprint(value["environment"]) &&
    (value["comparisonPairId"] === undefined ||
      isString(value["comparisonPairId"])) &&
    (value["commit"] === null || isString(value["commit"])) &&
    isNumberRecord(value["timings"]) &&
    isNumberRecord(value["metrics"])
  );
}

function parseLegacyPerformanceMeasurement(
  value: unknown
): PerformanceMeasurement | undefined {
  if (!isPlainRecord(value)) return undefined;
  const benchmark = value["benchmark"];
  const workload = value["workload"];
  const timings = value["timings"];
  const metrics = value["metrics"];
  if (
    (benchmark !== "simulation" && benchmark !== "analyzer") ||
    !isPlainRecord(workload) ||
    !isPlainRecord(timings) ||
    !isPlainRecord(metrics) ||
    (workload["role"] !== "reference" && workload["role"] !== "current") ||
    !isString(workload["epoch"]) ||
    !isString(workload["contractVersion"]) ||
    !isNumber(workload["playerCount"]) ||
    !isString(value["workloadFingerprint"]) ||
    !isString(value["workloadVolumeFingerprint"]) ||
    !isString(value["resultFingerprint"]) ||
    !isNumber(value["warmupCount"]) ||
    !isNumber(value["measurementCount"]) ||
    !isNumberRecord(timings)
  ) {
    return undefined;
  }

  const idPart =
    benchmark === "simulation" ? workload["gameCount"] : workload["profile"];
  const numericMetrics = toNumericRecord(metrics);
  if (
    (benchmark === "simulation" && !isNumber(idPart)) ||
    (benchmark === "analyzer" && !isString(idPart)) ||
    Object.keys(numericMetrics).length === 0
  ) {
    return undefined;
  }

  return {
    benchmark,
    id: `${benchmark}:${String(idPart)}`,
    role: workload["role"],
    epoch: workload["epoch"],
    contractVersion: workload["contractVersion"],
    playerCount: workload["playerCount"],
    workloadFingerprint: value["workloadFingerprint"],
    workloadVolumeFingerprint: value["workloadVolumeFingerprint"],
    resultFingerprint: value["resultFingerprint"],
    warmupCount: value["warmupCount"],
    measurementCount: value["measurementCount"],
    environment: isEnvironmentFingerprint(value["environment"])
      ? value["environment"]
      : LEGACY_BENCHMARK_ENVIRONMENT,
    commit:
      value["commit"] === null || isString(value["commit"])
        ? value["commit"]
        : null,
    timings,
    metrics: numericMetrics,
  };
}

function toNumericRecord(value: object): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] =>
      isNumber(entry[1])
    )
  );
}

function isPerformanceTolerance(value: unknown): value is PerformanceTolerance {
  if (!isPlainRecord(value)) return false;
  return (
    isNumber(value["relativePercent"]) &&
    value["relativePercent"] >= 0 &&
    isNumber(value["absoluteMs"]) &&
    value["absoluteMs"] >= 0
  );
}

function isPerformanceBaselineEntry(
  value: unknown
): value is PerformanceBaselineEntry {
  if (!isPlainRecord(value) || !isPerformanceMeasurement(value["reference"])) {
    return false;
  }
  return (
    (value["benchmark"] === "simulation" ||
      value["benchmark"] === "analyzer") &&
    isString(value["id"]) &&
    isString(value["epoch"]) &&
    value["reference"].role === "reference" &&
    isPlainRecord(value["tolerances"]) &&
    Object.values(value["tolerances"]).every((item) =>
      isPerformanceTolerance(item)
    )
  );
}

function isPerformanceEpochCalibrationMetadata(
  value: unknown
): value is PerformanceEpochCalibrationMetadata {
  if (!isPlainRecord(value)) return false;
  return (
    value["comparisons"] === PERFORMANCE_CALIBRATION_COMPARISON_COUNT &&
    value["method"] === "paired-same-commit" &&
    value["freshRunners"] === true &&
    value["warmupCount"] === PERFORMANCE_WARMUP_COUNT &&
    value["measurementCount"] === PERFORMANCE_MEASUREMENT_COUNT &&
    value["formula"] === "p95-plus-25-percent-safety-margin" &&
    isString(value["commit"]) &&
    isEnvironmentFingerprint(value["environment"])
  );
}

function isPerformanceCalibrationResult(
  value: unknown
): value is PerformanceCalibrationResult {
  if (!isPlainRecord(value)) return false;
  return (
    (value["benchmark"] === "simulation" ||
      value["benchmark"] === "analyzer") &&
    isString(value["id"]) &&
    value["comparisons"] === PERFORMANCE_CALIBRATION_COMPARISON_COUNT &&
    isString(value["commit"]) &&
    isEnvironmentFingerprint(value["environment"]) &&
    value["formula"] === "p95-plus-25-percent-safety-margin" &&
    isPlainRecord(value["metrics"]) &&
    Object.values(value["metrics"]).every(isPerformanceCalibrationMetric) &&
    isPlainRecord(value["tolerances"]) &&
    Object.values(value["tolerances"]).every(isPerformanceTolerance)
  );
}

function isPerformanceCalibrationMetric(
  value: unknown
): value is PerformanceCalibrationMetric {
  if (!isPlainRecord(value)) return false;
  return (
    isNumber(value["p95RelativePercent"]) &&
    value["p95RelativePercent"] >= 0 &&
    isNumber(value["p95AbsoluteMs"]) &&
    value["p95AbsoluteMs"] >= 0 &&
    isPerformanceTolerance(value["tolerance"])
  );
}

function isPerformanceEpochBaseline(
  value: unknown
): value is PerformanceEpochBaseline {
  if (!isPlainRecord(value)) return false;
  return (
    value["schemaVersion"] === PERFORMANCE_EPOCH_SCHEMA_VERSION &&
    isString(value["epoch"]) &&
    value["playerCount"] === 2 &&
    isPerformanceEpochCalibrationMetadata(value["calibration"]) &&
    Array.isArray(value["entries"]) &&
    value["entries"].every((entry) => isPerformanceBaselineEntry(entry))
  );
}
