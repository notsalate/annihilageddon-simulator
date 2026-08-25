import {
  AnalysisLimitError,
  enumerateTurnLines,
  rankTurnLines,
  type AnalysisLimits,
  type AnalyzedTurnLine,
  type RankedTurnLine,
} from "./best-move-analysis.js";
import {
  getBestMovePolicy,
  type BestMoveCriterionId,
} from "./best-move-policies.js";
import { stableAction } from "./action-format.js";
import type { LoadedDataPack } from "./data.js";
import {
  elapsedMs,
  getBenchmarkCommit,
  getBenchmarkEnvironmentFingerprint,
  median,
  sha256,
  systemBenchmarkClock,
  type BenchmarkClock,
  type BenchmarkEnvironmentFingerprint,
} from "./benchmark-support.js";
import { initializeGame } from "./setup.js";
import { PERFORMANCE_EPOCH } from "./performance-epoch.js";
import { intakeRuntimeData } from "./runtime-data-intake.js";

export const ANALYZER_BENCHMARK_CONTRACT_VERSION =
  "analyzer-benchmark-v1" as const;
export const ANALYZER_REFERENCE_WORKLOAD_VERSION =
  "analyzer-reference-v1" as const;
export const ANALYZER_BENCHMARK_PROFILES = [
  "light",
  "typical",
  "heavy",
] as const;

export type AnalyzerBenchmarkProfileId =
  (typeof ANALYZER_BENCHMARK_PROFILES)[number];
export type AnalyzerBenchmarkRole = "reference" | "current";

export interface AnalyzerBenchmarkProfile {
  id: AnalyzerBenchmarkProfileId;
  seeds: readonly number[];
  limits: AnalysisLimits;
  volumeDefinition: "seed-set-and-analysis-limits";
  volumeRank: 1 | 2 | 3;
}

export const ANALYZER_REFERENCE_PROFILES: Readonly<
  Record<AnalyzerBenchmarkProfileId, AnalyzerBenchmarkProfile>
> = {
  light: {
    id: "light",
    seeds: [1, 6, 7, 8],
    limits: {
      maxChoiceDepth: 8,
      maxBranchesPerAction: 64,
      maxActionsPerLine: 16,
      maxTurnLines: 6_000,
    },
    volumeDefinition: "seed-set-and-analysis-limits",
    volumeRank: 1,
  },
  typical: {
    id: "typical",
    seeds: [2, 4, 9],
    limits: {
      maxChoiceDepth: 12,
      maxBranchesPerAction: 256,
      maxActionsPerLine: 24,
      maxTurnLines: 8_000,
    },
    volumeDefinition: "seed-set-and-analysis-limits",
    volumeRank: 2,
  },
  heavy: {
    id: "heavy",
    seeds: [3, 5, 10],
    limits: {
      maxChoiceDepth: 16,
      maxBranchesPerAction: 1_024,
      maxActionsPerLine: 32,
      maxTurnLines: 10_000,
    },
    volumeDefinition: "seed-set-and-analysis-limits",
    volumeRank: 3,
  },
};

export interface AnalyzerBenchmarkWorkload {
  role: AnalyzerBenchmarkRole;
  workloadId: string;
  contractVersion: typeof ANALYZER_BENCHMARK_CONTRACT_VERSION;
  epoch: typeof PERFORMANCE_EPOCH;
  referenceWorkloadVersion: typeof ANALYZER_REFERENCE_WORKLOAD_VERSION | null;
  referenceBaselineReview: "required-on-workload-change" | "not-applicable";
  profile: AnalyzerBenchmarkProfileId;
  seeds: readonly number[];
  playerCount: 2;
  criterionId: BestMoveCriterionId;
  limits: AnalysisLimits;
  dataPackPath: string;
}

export interface CreateAnalyzerBenchmarkWorkloadOptions {
  role?: AnalyzerBenchmarkRole;
  profile?: AnalyzerBenchmarkProfileId;
  dataPackPath?: string;
}

export interface AnalyzerBenchmarkTimings {
  totalMs: number;
  dataLoadMs: number;
  preparationMs: number;
  enumerationMs: number;
  rankingMs: number;
  resultPreparationMs: number;
}

export interface AnalyzerBenchmarkMetrics {
  totalSeeds: number;
  lineCount: number;
  rankedLineCount: number;
  actionCount: number;
  branchCount: number;
  choiceBranchCount: number;
  limitsReached: number;
  limitKindCounts: Record<string, number>;
}

export interface AnalyzerBenchmarkSample {
  sampleIndex: number;
  timings: AnalyzerBenchmarkTimings;
  metrics: AnalyzerBenchmarkMetrics;
  peakMemoryBytes: number;
  runtimeDataPackId: string;
  workloadFingerprint: string;
  workloadVolumeFingerprint: string;
  resultFingerprint: string;
}

export interface AnalyzerBenchmarkResult {
  benchmark: "analyzer";
  commit: string | null;
  environment: BenchmarkEnvironmentFingerprint;
  workload: AnalyzerBenchmarkWorkload;
  warmupCount: 1;
  measurementCount: 3;
  timings: AnalyzerBenchmarkTimings;
  metrics: AnalyzerBenchmarkMetrics;
  peakMemoryBytes: number;
  runtimeDataPackId: string;
  workloadFingerprint: string;
  workloadVolumeFingerprint: string;
  resultFingerprint: string;
  samples: readonly AnalyzerBenchmarkSample[];
}

export interface AnalyzerBenchmarkDependencies {
  clock?: BenchmarkClock;
  commit?: string | null;
  environment?: BenchmarkEnvironmentFingerprint;
  intakeDataPack?: (rootDir: string, manifestPath: string) => LoadedDataPack;
  initialize?: typeof initializeGame;
  enumerate?: typeof enumerateTurnLines;
  rank?: typeof rankTurnLines;
}

export interface RunAnalyzerBenchmarkOptions extends CreateAnalyzerBenchmarkWorkloadOptions {
  rootDir: string;
  dependencies?: AnalyzerBenchmarkDependencies;
}

const MEASUREMENT_COUNT = 3 as const;
const DEFAULT_MANIFEST_PATH = "data/packs/current-runtime.json";

export function createAnalyzerBenchmarkWorkload(
  options: CreateAnalyzerBenchmarkWorkloadOptions = {}
): AnalyzerBenchmarkWorkload {
  const role = options.role ?? "reference";
  const profileId = options.profile ?? "light";
  const profile = ANALYZER_REFERENCE_PROFILES[profileId];
  if (profile === undefined) {
    throw new RangeError(
      `profile must be one of ${ANALYZER_BENCHMARK_PROFILES.join(", ")}`
    );
  }

  const dataPackPath =
    role === "reference"
      ? DEFAULT_MANIFEST_PATH
      : (options.dataPackPath ?? DEFAULT_MANIFEST_PATH);
  if (
    role === "reference" &&
    options.dataPackPath !== undefined &&
    options.dataPackPath !== DEFAULT_MANIFEST_PATH
  ) {
    throw new RangeError(
      "Reference workload must use data/packs/current-runtime.json"
    );
  }
  if (dataPackPath.length === 0) {
    throw new RangeError("dataPackPath must not be empty");
  }

  return {
    role,
    workloadId:
      role === "reference"
        ? ANALYZER_REFERENCE_WORKLOAD_VERSION
        : "analyzer-current-game",
    contractVersion: ANALYZER_BENCHMARK_CONTRACT_VERSION,
    epoch: PERFORMANCE_EPOCH,
    referenceWorkloadVersion:
      role === "reference" ? ANALYZER_REFERENCE_WORKLOAD_VERSION : null,
    referenceBaselineReview:
      role === "reference" ? "required-on-workload-change" : "not-applicable",
    profile: profile.id,
    seeds: profile.seeds,
    playerCount: 2,
    criterionId: "victory-points",
    limits: profile.limits,
    dataPackPath,
  };
}

export function runAnalyzerBenchmark(
  options: RunAnalyzerBenchmarkOptions
): AnalyzerBenchmarkResult {
  const workload = createAnalyzerBenchmarkWorkload(options);
  const dependencies = options.dependencies ?? {};
  const clock = dependencies.clock ?? systemBenchmarkClock;
  const commit = dependencies.commit ?? getBenchmarkCommit();
  const environment =
    dependencies.environment ?? getBenchmarkEnvironmentFingerprint();
  const intakeDataPack =
    dependencies.intakeDataPack ??
    ((rootDir: string, manifestPath: string) =>
      intakeRuntimeData({ rootDir, dataPackPath: manifestPath }));
  const initialize = dependencies.initialize ?? initializeGame;
  const enumerate = dependencies.enumerate ?? enumerateTurnLines;
  const rank = dependencies.rank ?? rankTurnLines;

  const warmup = executeAnalyzerTrial(
    workload,
    options.rootDir,
    0,
    clock,
    intakeDataPack,
    initialize,
    enumerate,
    rank
  );
  const warmupPeakMemoryBytes = warmup.peakMemoryBytes;

  const samples = Array.from({ length: MEASUREMENT_COUNT }, (_, index) =>
    executeAnalyzerTrial(
      workload,
      options.rootDir,
      index + 1,
      clock,
      intakeDataPack,
      initialize,
      enumerate,
      rank,
      warmupPeakMemoryBytes
    )
  );
  const firstSample = samples[0];
  if (firstSample === undefined) {
    throw new Error("Analyzer benchmark did not produce a measurement");
  }
  assertStableSamples(samples);

  return {
    benchmark: "analyzer",
    commit,
    environment,
    workload,
    warmupCount: 1,
    measurementCount: MEASUREMENT_COUNT,
    timings: {
      totalMs: median(samples.map((sample) => sample.timings.totalMs)),
      dataLoadMs: median(samples.map((sample) => sample.timings.dataLoadMs)),
      preparationMs: median(
        samples.map((sample) => sample.timings.preparationMs)
      ),
      enumerationMs: median(
        samples.map((sample) => sample.timings.enumerationMs)
      ),
      rankingMs: median(samples.map((sample) => sample.timings.rankingMs)),
      resultPreparationMs: median(
        samples.map((sample) => sample.timings.resultPreparationMs)
      ),
    },
    metrics: medianAnalyzerMetrics(samples),
    peakMemoryBytes: median(samples.map((sample) => sample.peakMemoryBytes)),
    runtimeDataPackId: firstSample.runtimeDataPackId,
    workloadFingerprint: firstSample.workloadFingerprint,
    workloadVolumeFingerprint: firstSample.workloadVolumeFingerprint,
    resultFingerprint: firstSample.resultFingerprint,
    samples,
  };
}

function executeAnalyzerTrial(
  workload: AnalyzerBenchmarkWorkload,
  rootDir: string,
  sampleIndex: number,
  clock: BenchmarkClock,
  intakeDataPack: NonNullable<AnalyzerBenchmarkDependencies["intakeDataPack"]>,
  initialize: NonNullable<AnalyzerBenchmarkDependencies["initialize"]>,
  enumerate: NonNullable<AnalyzerBenchmarkDependencies["enumerate"]>,
  rank: NonNullable<AnalyzerBenchmarkDependencies["rank"]>,
  warmupPeakMemoryBytes = 0
): AnalyzerBenchmarkSample {
  const startedAt = clock.now();
  let peakMemoryBytes = clock.readPeakMemoryBytes();
  const dataLoadStartedAt = clock.now();
  const dataPack = intakeDataPack(rootDir, workload.dataPackPath);
  const dataLoadMs = elapsedMs(clock, dataLoadStartedAt);
  peakMemoryBytes = Math.max(peakMemoryBytes, clock.readPeakMemoryBytes());

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
    peakMemoryBytes = Math.max(peakMemoryBytes, clock.readPeakMemoryBytes());

    const enumerationStartedAt = clock.now();
    let lines: AnalyzedTurnLine[];
    try {
      lines = enumerate(state, workload.limits);
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
      peakMemoryBytes = Math.max(peakMemoryBytes, clock.readPeakMemoryBytes());
      continue;
    }
    enumerationMs += elapsedMs(clock, enumerationStartedAt);
    peakMemoryBytes = Math.max(peakMemoryBytes, clock.readPeakMemoryBytes());

    const rankingStartedAt = clock.now();
    const ranked = rank(state, lines, policy, state.activePlayerId);
    rankingMs += elapsedMs(clock, rankingStartedAt);
    peakMemoryBytes = Math.max(peakMemoryBytes, clock.readPeakMemoryBytes());

    const rankedLines = ranked.rankedLines.map(toAnalyzerLineFingerprint);
    lineCount += lines.length;
    rankedLineCount += ranked.rankedLines.length;
    actionCount += lines.reduce((total, line) => total + line.steps.length, 0);
    choiceBranchCount += lines.reduce(
      (total, line) =>
        total +
        line.steps.reduce((stepTotal, step) => {
          return stepTotal + step.selectedChoices.length;
        }, 0),
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
    limitKindCounts: toSortedRecord(limitKindCounts),
  };
  const workloadFingerprint = sha256(
    JSON.stringify({
      contractVersion: workload.contractVersion,
      epoch: workload.epoch,
      profile: workload.profile,
      seeds: workload.seeds,
      playerCount: workload.playerCount,
      criterionId: workload.criterionId,
      limits: workload.limits,
      runtimeDataPackId,
    })
  );
  const workloadVolumeFingerprint = sha256(
    JSON.stringify({
      workloadFingerprint,
      lineCount: metrics.lineCount,
      rankedLineCount: metrics.rankedLineCount,
      actionCount: metrics.actionCount,
      branchCount: metrics.branchCount,
      choiceBranchCount: metrics.choiceBranchCount,
      limitsReached: metrics.limitsReached,
      limitKindCounts: metrics.limitKindCounts,
    })
  );
  const resultFingerprint = sha256(
    JSON.stringify({ workloadFingerprint, seedResults })
  );
  const resultPreparationMs = elapsedMs(clock, resultPreparationStartedAt);
  const totalMs = elapsedMs(clock, startedAt);

  return {
    sampleIndex,
    timings: {
      totalMs,
      dataLoadMs,
      preparationMs,
      enumerationMs,
      rankingMs,
      resultPreparationMs,
    },
    metrics,
    peakMemoryBytes: Math.max(0, peakMemoryBytes - warmupPeakMemoryBytes),
    runtimeDataPackId,
    workloadFingerprint,
    workloadVolumeFingerprint,
    resultFingerprint,
  };
}

interface AnalyzerSeedFingerprint {
  seed: number;
  limitReached: boolean;
  limitError?: string;
  lineCount: number;
  rankedLines: AnalyzerLineFingerprint[];
}

interface AnalyzerLineFingerprint {
  rank: number;
  score: number;
  components?: Readonly<Record<string, number>>;
  terminalReason: AnalyzedTurnLine["terminalReason"];
  gameEndReason?: string;
  steps: AnalyzerStepFingerprint[];
}

interface AnalyzerStepFingerprint {
  action: Record<string, string>;
  selectedChoices: readonly {
    requestIndex: number;
    effectId: string;
    choiceIndex: number;
    choiceId: string;
    choiceKind: string;
  }[];
}

function toAnalyzerLineFingerprint(
  entry: RankedTurnLine
): AnalyzerLineFingerprint {
  return {
    rank: entry.rank,
    score: entry.score,
    ...(entry.components === undefined
      ? {}
      : { components: sortNumericRecord(entry.components) }),
    terminalReason: entry.line.terminalReason,
    ...(entry.line.gameEndReason === undefined
      ? {}
      : { gameEndReason: entry.line.gameEndReason }),
    steps: entry.line.steps.map((step) => ({
      action: stableAction(step.action),
      selectedChoices: step.selectedChoices.map(
        ({ requestIndex, effectId, choiceIndex, choiceId, choiceKind }) => ({
          requestIndex,
          effectId,
          choiceIndex,
          choiceId,
          choiceKind,
        })
      ),
    })),
  };
}

function medianAnalyzerMetrics(
  samples: readonly AnalyzerBenchmarkSample[]
): AnalyzerBenchmarkMetrics {
  const firstSample = samples[0];
  if (firstSample === undefined) {
    throw new Error("Cannot aggregate empty analyzer benchmark samples");
  }
  return {
    totalSeeds: median(samples.map((sample) => sample.metrics.totalSeeds)),
    lineCount: median(samples.map((sample) => sample.metrics.lineCount)),
    rankedLineCount: median(
      samples.map((sample) => sample.metrics.rankedLineCount)
    ),
    actionCount: median(samples.map((sample) => sample.metrics.actionCount)),
    branchCount: median(samples.map((sample) => sample.metrics.branchCount)),
    choiceBranchCount: median(
      samples.map((sample) => sample.metrics.choiceBranchCount)
    ),
    limitsReached: median(
      samples.map((sample) => sample.metrics.limitsReached)
    ),
    limitKindCounts: firstSample.metrics.limitKindCounts,
  };
}

function assertStableSamples(
  samples: readonly AnalyzerBenchmarkSample[]
): void {
  const firstSample = samples[0];
  if (firstSample === undefined) {
    throw new Error("Cannot compare empty analyzer benchmark samples");
  }
  for (const sample of samples.slice(1)) {
    if (
      sample.runtimeDataPackId !== firstSample.runtimeDataPackId ||
      sample.workloadFingerprint !== firstSample.workloadFingerprint ||
      sample.workloadVolumeFingerprint !==
        firstSample.workloadVolumeFingerprint ||
      sample.resultFingerprint !== firstSample.resultFingerprint
    ) {
      throw new Error(
        "Analyzer benchmark is not deterministic across measured samples"
      );
    }
  }
}

function sortNumericRecord(
  values: Readonly<Record<string, number>>
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right))
  );
}

function toSortedRecord(
  counts: ReadonlyMap<string, number>
): Record<string, number> {
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right))
  );
}
