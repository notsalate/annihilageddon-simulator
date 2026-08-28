import {
  createAnalyzerDiagnostics,
  enumerateTurnLines,
  rankTurnLines,
  type AnalysisLimits,
  type AnalyzerDiagnosticCounters,
  type AnalyzerDiagnosticsSession,
  type AnalyzedTurnLine,
  type RankedTurnLine,
  type TurnLineEvaluationPolicy,
} from "./best-move-analysis.js";
import {
  createAnalyzerBenchmarkWorkload,
  executeAnalyzerWorkload,
  type AnalyzerBenchmarkMetrics,
  type AnalyzerBenchmarkProfileId,
  type AnalyzerBenchmarkRole,
  type AnalyzerBenchmarkWorkload,
  type AnalyzerSeedFingerprint,
} from "./analyzer-benchmark.js";
import {
  getBenchmarkCommit,
  getBenchmarkEnvironmentFingerprint,
  systemBenchmarkClock,
  type BenchmarkClock,
  type BenchmarkEnvironmentFingerprint,
} from "./benchmark-support.js";
import type { LoadedDataPack } from "./data.js";
import { initializeGame, type GameState } from "./setup.js";
import { intakeRuntimeData } from "./runtime-data-intake.js";

export const ANALYZER_DIAGNOSTIC_CONTRACT_VERSION =
  "analyzer-diagnostics-v2" as const;

export interface AnalyzerDiagnosticTimings {
  totalMs: number;
  dataLoadMs: number;
  preparationMs: number;
  enumerationMs: number;
  rankingMs: number;
  evaluationPolicyMs: number;
  resultPreparationMs: number;
}

export interface AnalyzerWorkloadRunResult {
  workload: AnalyzerBenchmarkWorkload;
  timings: AnalyzerDiagnosticTimings;
  metrics: AnalyzerBenchmarkMetrics;
  seedResults: readonly AnalyzerSeedFingerprint[];
  runtimeDataPackId: string;
  workloadFingerprint: string;
  workloadVolumeFingerprint: string;
  resultFingerprint: string;
}

export interface AnalyzerDiagnosticDependencies {
  clock?: BenchmarkClock;
  commit?: string | null;
  environment?: BenchmarkEnvironmentFingerprint;
  intakeDataPack?: (rootDir: string, manifestPath: string) => LoadedDataPack;
  initialize?: typeof initializeGame;
  enumerate?: (
    source: GameState,
    limits: AnalysisLimits,
    diagnostics?: AnalyzerDiagnosticsSession
  ) => AnalyzedTurnLine[];
  rank?: (
    sourceState: GameState,
    lines: readonly AnalyzedTurnLine[],
    policy: TurnLineEvaluationPolicy,
    perspectivePlayerId: GameState["activePlayerId"],
    diagnostics?: AnalyzerDiagnosticsSession
  ) => {
    readonly rankedLines: readonly RankedTurnLine[];
  };
}

export interface RunAnalyzerWorkloadOptions {
  rootDir: string;
  role?: AnalyzerBenchmarkRole;
  profile?: AnalyzerBenchmarkProfileId;
  dataPackPath?: string;
  dependencies?: AnalyzerDiagnosticDependencies;
  diagnostics?: AnalyzerDiagnosticsSession;
}

export interface AnalyzerDiagnosticResult {
  benchmark: "analyzer";
  diagnostic: "analyzer-workload";
  contractVersion: typeof ANALYZER_DIAGNOSTIC_CONTRACT_VERSION;
  commit: string | null;
  environment: BenchmarkEnvironmentFingerprint;
  workload: AnalyzerBenchmarkWorkload;
  timings: AnalyzerDiagnosticTimings;
  metrics: AnalyzerBenchmarkMetrics;
  counters: AnalyzerDiagnosticCounters;
  runtimeDataPackId: string;
  workloadFingerprint: string;
  workloadVolumeFingerprint: string;
  resultFingerprint: string;
}

export function runAnalyzerWorkloadOnce(
  options: RunAnalyzerWorkloadOptions
): AnalyzerWorkloadRunResult {
  const workload = createAnalyzerBenchmarkWorkload(options);
  const dependencies = options.dependencies ?? {};
  const clock = dependencies.clock ?? systemBenchmarkClock;
  const intakeDataPack =
    dependencies.intakeDataPack ??
    ((rootDir: string, manifestPath: string) =>
      intakeRuntimeData({ rootDir, dataPackPath: manifestPath }));
  const initialize = dependencies.initialize ?? initializeGame;
  const enumerate = dependencies.enumerate ?? enumerateTurnLines;
  const rank = dependencies.rank ?? rankTurnLines;
  const execution = executeAnalyzerWorkload({
    workload,
    rootDir: options.rootDir,
    clock,
    intakeDataPack,
    initialize,
    enumerate,
    rank,
    ...(options.diagnostics === undefined
      ? {}
      : { diagnostics: options.diagnostics }),
  });
  const timings: AnalyzerDiagnosticTimings = {
    ...execution.timings,
    evaluationPolicyMs:
      options.diagnostics?.snapshot().phases.evaluationPolicy.timeMs ?? 0,
  };

  return {
    workload,
    timings,
    metrics: execution.metrics,
    seedResults: execution.seedResults,
    runtimeDataPackId: execution.runtimeDataPackId,
    workloadFingerprint: execution.workloadFingerprint,
    workloadVolumeFingerprint: execution.workloadVolumeFingerprint,
    resultFingerprint: execution.resultFingerprint,
  };
}

export function runAnalyzerDiagnostic(
  options: RunAnalyzerWorkloadOptions
): AnalyzerDiagnosticResult {
  const dependencies = options.dependencies ?? {};
  const clock = dependencies.clock ?? systemBenchmarkClock;
  const diagnostics =
    options.diagnostics ??
    createAnalyzerDiagnostics({ now: () => clock.now() });
  const run = runAnalyzerWorkloadOnce({
    ...options,
    dependencies,
    diagnostics,
  });
  const counters = diagnostics.snapshot();
  return {
    benchmark: "analyzer",
    diagnostic: "analyzer-workload",
    contractVersion: ANALYZER_DIAGNOSTIC_CONTRACT_VERSION,
    commit: dependencies.commit ?? getBenchmarkCommit(),
    environment:
      dependencies.environment ?? getBenchmarkEnvironmentFingerprint(),
    workload: run.workload,
    timings: run.timings,
    metrics: run.metrics,
    counters,
    runtimeDataPackId: run.runtimeDataPackId,
    workloadFingerprint: run.workloadFingerprint,
    workloadVolumeFingerprint: run.workloadVolumeFingerprint,
    resultFingerprint: run.resultFingerprint,
  };
}
