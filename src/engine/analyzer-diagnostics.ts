import {
  AnalysisLimitError,
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
  createAnalyzerResultFingerprint,
  createAnalyzerWorkloadFingerprint,
  createAnalyzerWorkloadVolumeFingerprint,
  toAnalyzerLineFingerprint,
  type AnalyzerBenchmarkMetrics,
  type AnalyzerBenchmarkProfileId,
  type AnalyzerBenchmarkRole,
  type AnalyzerBenchmarkWorkload,
  type AnalyzerSeedFingerprint,
} from "./analyzer-benchmark.js";
import { getBestMovePolicy } from "./best-move-policies.js";
import {
  elapsedMs,
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
  "analyzer-diagnostics-v1" as const;

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
  const startedAt = clock.now();

  const dataLoadStartedAt = clock.now();
  const dataPack = intakeDataPack(options.rootDir, workload.dataPackPath);
  const dataLoadMs = elapsedMs(clock, dataLoadStartedAt);

  let preparationMs = 0;
  let enumerationMs = 0;
  let rankingMs = 0;
  let lineCount = 0;
  let rankedLineCount = 0;
  let actionCount = 0;
  let choiceBranchCount = 0;
  let limitsReached = 0;
  const limitKindCounts = new Map<string, number>();
  const seedResults: AnalyzerSeedFingerprint[] = [];
  const policy = getBestMovePolicy(workload.criterionId);

  for (const seed of workload.seeds) {
    const preparationStartedAt = clock.now();
    const state = initialize({
      dataPack,
      seed,
      playerCount: workload.playerCount,
    });
    preparationMs += elapsedMs(clock, preparationStartedAt);

    const enumerationStartedAt = clock.now();
    let lines: AnalyzedTurnLine[];
    try {
      lines = enumerate(state, workload.limits, options.diagnostics);
    } catch (error) {
      enumerationMs += elapsedMs(clock, enumerationStartedAt);
      if (!(error instanceof AnalysisLimitError)) {
        throw error;
      }
      limitsReached += 1;
      limitKindCounts.set(
        error.name,
        (limitKindCounts.get(error.name) ?? 0) + 1
      );
      seedResults.push({
        seed,
        limitReached: true,
        limitError: error.name,
        lineCount: 0,
        rankedLines: [],
      });
      continue;
    }
    enumerationMs += elapsedMs(clock, enumerationStartedAt);

    const rankingStartedAt = clock.now();
    const ranked = rank(
      state,
      lines,
      policy,
      state.activePlayerId,
      options.diagnostics
    );
    rankingMs += elapsedMs(clock, rankingStartedAt);

    const rankedLines = ranked.rankedLines.map(toAnalyzerLineFingerprint);
    lineCount += lines.length;
    rankedLineCount += ranked.rankedLines.length;
    actionCount += lines.reduce((total, line) => total + line.steps.length, 0);
    choiceBranchCount += lines.reduce(
      (total, line) =>
        total +
        line.steps.reduce(
          (stepTotal, step) => stepTotal + step.selectedChoices.length,
          0
        ),
      0
    );
    seedResults.push({
      seed,
      limitReached: false,
      lineCount: lines.length,
      rankedLines,
    });
  }

  const resultPreparationStartedAt = clock.now();
  const runtimeDataPackId = dataPack.manifest.packId;
  const metrics: AnalyzerBenchmarkMetrics = {
    totalSeeds: workload.seeds.length,
    lineCount,
    rankedLineCount,
    actionCount,
    branchCount: lineCount + choiceBranchCount,
    choiceBranchCount,
    limitsReached,
    limitKindCounts: Object.fromEntries(
      [...limitKindCounts.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ),
  };
  const workloadFingerprint = createAnalyzerWorkloadFingerprint(
    workload,
    runtimeDataPackId
  );
  const workloadVolumeFingerprint = createAnalyzerWorkloadVolumeFingerprint(
    workloadFingerprint,
    metrics
  );
  const resultFingerprint = createAnalyzerResultFingerprint(
    workloadFingerprint,
    seedResults
  );
  const resultPreparationMs = elapsedMs(clock, resultPreparationStartedAt);
  const timings: AnalyzerDiagnosticTimings = {
    totalMs: elapsedMs(clock, startedAt),
    dataLoadMs,
    preparationMs,
    enumerationMs,
    rankingMs,
    evaluationPolicyMs:
      options.diagnostics?.snapshot().phases.evaluationPolicy.timeMs ?? 0,
    resultPreparationMs,
  };

  return {
    workload,
    timings,
    metrics,
    seedResults,
    runtimeDataPackId,
    workloadFingerprint,
    workloadVolumeFingerprint,
    resultFingerprint,
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
