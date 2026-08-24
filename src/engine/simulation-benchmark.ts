import type { LoadedDataPack } from "./data.js";
import {
  assertPositiveSafeInteger,
  elapsedMs,
  getBenchmarkCommit,
  getBenchmarkEnvironmentFingerprint,
  median,
  sha256,
  systemBenchmarkClock,
  type BenchmarkClock,
  type BenchmarkEnvironmentFingerprint,
} from "./benchmark-support.js";
import { intakeRuntimeData } from "./runtime-data-intake.js";
import { PERFORMANCE_EPOCH } from "./performance-epoch.js";
import {
  runSingleGame,
  type RunSingleGameOptions,
  type SingleGameResult,
} from "./simulation.js";

export const SIMULATION_BENCHMARK_CONTRACT_VERSION =
  "simulation-benchmark-v1" as const;
export const SIMULATION_REFERENCE_WORKLOAD_VERSION =
  "simulation-reference-v1" as const;

export const SIMULATION_BENCHMARK_STAGES = [
  10, 100, 1_000, 10_000, 100_000,
] as const;

export const SIMULATION_REFERENCE_STAGES = [10, 100] as const;

export type SimulationBenchmarkStage =
  (typeof SIMULATION_BENCHMARK_STAGES)[number];
export type SimulationBenchmarkRole = "reference" | "current";

export const SIMULATION_REFERENCE_COVERAGE = [
  "setup",
  "turns",
  "cardPlay",
  "effects",
  "discard",
  "reshuffle",
  "scoring",
] as const;

export type SimulationCoverageKey =
  (typeof SIMULATION_REFERENCE_COVERAGE)[number];

export interface SimulationCoverage {
  setup: boolean;
  turns: boolean;
  cardPlay: boolean;
  effects: boolean;
  discard: boolean;
  reshuffle: boolean;
  scoring: boolean;
}

export interface SimulationBenchmarkWorkload {
  role: SimulationBenchmarkRole;
  workloadId: string;
  contractVersion: typeof SIMULATION_BENCHMARK_CONTRACT_VERSION;
  epoch: typeof PERFORMANCE_EPOCH;
  referenceWorkloadVersion: typeof SIMULATION_REFERENCE_WORKLOAD_VERSION | null;
  referenceBaselineReview: "required-on-workload-change" | "not-applicable";
  playerCount: 2;
  firstSeed: number;
  gameCount: SimulationBenchmarkStage;
  maxTurns: number;
  dataPackPath: string;
}

export interface CreateSimulationBenchmarkWorkloadOptions {
  role?: SimulationBenchmarkRole;
  stage?: SimulationBenchmarkStage;
  firstSeed?: number;
  maxTurns?: number;
  dataPackPath?: string;
}

export interface SimulationBenchmarkTimings {
  totalMs: number;
  dataLoadMs: number;
  gamesMs: number;
  aggregationMs: number;
  resultPreparationMs: number;
}

export interface SimulationBenchmarkMetrics {
  totalGames: number;
  totalTurns: number;
  totalActions: number;
  totalEvents: number;
  completedGames: number;
  maxTurnsReached: number;
  eventTypeCounts: Record<string, number>;
}

export interface SimulationBenchmarkSample {
  sampleIndex: number;
  timings: SimulationBenchmarkTimings;
  metrics: SimulationBenchmarkMetrics;
  peakMemoryBytes: number;
  runtimeDataPackId: string;
  workloadFingerprint: string;
  workloadVolumeFingerprint: string;
  resultFingerprint: string;
  coverage: SimulationCoverage;
}

export interface SimulationBenchmarkResult {
  benchmark: "simulation";
  commit: string | null;
  environment: BenchmarkEnvironmentFingerprint;
  workload: SimulationBenchmarkWorkload;
  warmupCount: 1;
  measurementCount: 3;
  timings: SimulationBenchmarkTimings;
  metrics: SimulationBenchmarkMetrics;
  peakMemoryBytes: number | undefined;
  runtimeDataPackId: string;
  workloadFingerprint: string;
  workloadVolumeFingerprint: string;
  resultFingerprint: string;
  coverage: SimulationCoverage;
  coverageSatisfied: boolean;
  missingCoverage: SimulationCoverageKey[];
  samples: readonly SimulationBenchmarkSample[];
}

export interface SimulationBenchmarkDependencies {
  clock?: BenchmarkClock;
  commit?: string | null;
  environment?: BenchmarkEnvironmentFingerprint;
  intakeDataPack?: (rootDir: string, manifestPath: string) => LoadedDataPack;
  runGame?: (options: RunSingleGameOptions) => SingleGameResult;
}

export interface RunSimulationBenchmarkOptions extends CreateSimulationBenchmarkWorkloadOptions {
  rootDir: string;
  dependencies?: SimulationBenchmarkDependencies;
}

const MEASUREMENT_COUNT = 3 as const;
const DEFAULT_MANIFEST_PATH = "data/packs/current-runtime.json";
const DEFAULT_MAX_TURNS = 200;

export function createSimulationBenchmarkWorkload(
  options: CreateSimulationBenchmarkWorkloadOptions = {}
): SimulationBenchmarkWorkload {
  const role = options.role ?? "reference";
  const stage = options.stage ?? 10;
  assertSimulationStage(stage);
  if (
    role === "reference" &&
    !SIMULATION_REFERENCE_STAGES.includes(
      stage as (typeof SIMULATION_REFERENCE_STAGES)[number]
    )
  ) {
    throw new RangeError(
      `Reference workload stage must be one of ${SIMULATION_REFERENCE_STAGES.join(", ")}`
    );
  }

  const firstSeed = options.firstSeed ?? 1;
  assertPositiveSafeInteger(firstSeed, "firstSeed");
  if (role === "reference" && firstSeed !== 1) {
    throw new RangeError("Reference workload must start at seed 1");
  }

  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  assertPositiveSafeInteger(maxTurns, "maxTurns");
  if (role === "reference" && maxTurns !== DEFAULT_MAX_TURNS) {
    throw new RangeError("Reference workload must use maxTurns 200");
  }
  const lastSeed = firstSeed + stage - 1;
  if (!Number.isSafeInteger(lastSeed)) {
    throw new RangeError("Simulation seed range exceeds safe integer limits");
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
        ? SIMULATION_REFERENCE_WORKLOAD_VERSION
        : "simulation-current-game",
    contractVersion: SIMULATION_BENCHMARK_CONTRACT_VERSION,
    epoch: PERFORMANCE_EPOCH,
    referenceWorkloadVersion:
      role === "reference" ? SIMULATION_REFERENCE_WORKLOAD_VERSION : null,
    referenceBaselineReview:
      role === "reference" ? "required-on-workload-change" : "not-applicable",
    playerCount: 2,
    firstSeed,
    gameCount: stage,
    maxTurns,
    dataPackPath,
  };
}

export function runSimulationBenchmark(
  options: RunSimulationBenchmarkOptions
): SimulationBenchmarkResult {
  const workload = createSimulationBenchmarkWorkload(options);
  const dependencies = options.dependencies ?? {};
  const clock = dependencies.clock ?? systemBenchmarkClock;
  const commit = dependencies.commit ?? getBenchmarkCommit();
  const environment =
    dependencies.environment ?? getBenchmarkEnvironmentFingerprint();
  const intakeDataPack =
    dependencies.intakeDataPack ??
    ((rootDir: string, manifestPath: string) =>
      intakeRuntimeData({ rootDir, dataPackPath: manifestPath }));
  const runGame = dependencies.runGame ?? runSingleGame;

  const warmup = executeSimulationTrial(
    workload,
    options.rootDir,
    0,
    clock,
    intakeDataPack,
    runGame
  );
  const warmupPeakMemoryBytes = warmup.peakMemoryBytes;

  const samples = Array.from({ length: MEASUREMENT_COUNT }, (_, index) =>
    executeSimulationTrial(
      workload,
      options.rootDir,
      index + 1,
      clock,
      intakeDataPack,
      runGame,
      warmupPeakMemoryBytes
    )
  );

  const firstSample = samples[0];
  if (firstSample === undefined) {
    throw new Error("Simulation benchmark did not produce a measurement");
  }
  assertStableSamples(samples);

  const timings = {
    totalMs: median(samples.map((sample) => sample.timings.totalMs)),
    dataLoadMs: median(samples.map((sample) => sample.timings.dataLoadMs)),
    gamesMs: median(samples.map((sample) => sample.timings.gamesMs)),
    aggregationMs: median(
      samples.map((sample) => sample.timings.aggregationMs)
    ),
    resultPreparationMs: median(
      samples.map((sample) => sample.timings.resultPreparationMs)
    ),
  } satisfies SimulationBenchmarkTimings;
  const metrics = medianSimulationMetrics(samples);
  const coverage = firstSample.coverage;
  const missingCoverage = SIMULATION_REFERENCE_COVERAGE.filter(
    (key) => !coverage[key]
  );
  const coverageSatisfied = missingCoverage.length === 0;
  if (workload.role === "reference" && !coverageSatisfied) {
    throw new Error(
      `Reference workload is missing coverage: ${missingCoverage.join(", ")}`
    );
  }

  return {
    benchmark: "simulation",
    commit,
    environment,
    workload,
    warmupCount: 1,
    measurementCount: MEASUREMENT_COUNT,
    timings,
    metrics,
    peakMemoryBytes:
      workload.gameCount >= 10_000
        ? median(samples.map((sample) => sample.peakMemoryBytes))
        : undefined,
    runtimeDataPackId: firstSample.runtimeDataPackId,
    workloadFingerprint: firstSample.workloadFingerprint,
    workloadVolumeFingerprint: firstSample.workloadVolumeFingerprint,
    resultFingerprint: firstSample.resultFingerprint,
    coverage,
    coverageSatisfied,
    missingCoverage,
    samples,
  };
}

function executeSimulationTrial(
  workload: SimulationBenchmarkWorkload,
  rootDir: string,
  sampleIndex: number,
  clock: BenchmarkClock,
  intakeDataPack: NonNullable<
    SimulationBenchmarkDependencies["intakeDataPack"]
  >,
  runGame: NonNullable<SimulationBenchmarkDependencies["runGame"]>,
  warmupPeakMemoryBytes = 0
): SimulationBenchmarkSample {
  const startedAt = clock.now();
  let peakMemoryBytes = clock.readPeakMemoryBytes();
  let gamesMs = 0;
  let aggregationMs = 0;
  const gameSummaries: SimulationGameFingerprint[] = [];
  const eventTypeCounts = new Map<string, number>();
  let totalTurns = 0;
  let totalActions = 0;
  let totalEvents = 0;
  let completedGames = 0;
  let maxTurnsReached = 0;
  let coverage = createEmptyCoverage();
  const dataLoadStartedAt = clock.now();
  const dataPack = intakeDataPack(rootDir, workload.dataPackPath);
  const dataLoadMs = elapsedMs(clock, dataLoadStartedAt);
  const runtimeDataPackId = dataPack.manifest.packId;
  peakMemoryBytes = Math.max(peakMemoryBytes, clock.readPeakMemoryBytes());

  for (let index = 0; index < workload.gameCount; index += 1) {
    const seed = workload.firstSeed + index;
    if (dataPack.manifest.packId !== runtimeDataPackId) {
      throw new Error(
        "Simulation benchmark loaded different Runtime Data packs"
      );
    }

    const gameStartedAt = clock.now();
    const result = runGame({
      rootDir,
      dataPack,
      seed,
      maxTurns: workload.maxTurns,
      playerCount: workload.playerCount,
    });
    gamesMs += elapsedMs(clock, gameStartedAt);
    peakMemoryBytes = Math.max(peakMemoryBytes, clock.readPeakMemoryBytes());

    const aggregationStartedAt = clock.now();
    const actionCount = result.eventLog.filter(
      (event) => event.type === "botActionSelected"
    ).length;
    totalTurns += result.turnsElapsed;
    totalActions += actionCount;
    totalEvents += result.eventLog.length;
    completedGames += result.isGameEnd ? 1 : 0;
    maxTurnsReached += result.endReason === "maxTurnsReached" ? 1 : 0;
    for (const event of result.eventLog) {
      eventTypeCounts.set(
        event.type,
        (eventTypeCounts.get(event.type) ?? 0) + 1
      );
      coverage = updateCoverage(coverage, event);
    }
    coverage = {
      ...coverage,
      scoring:
        coverage.scoring || hasScoringResult(result, workload.playerCount),
    };
    gameSummaries.push(toSimulationGameFingerprint(result, actionCount));
    aggregationMs += elapsedMs(clock, aggregationStartedAt);
  }

  const metricsStartedAt = clock.now();
  const metrics: SimulationBenchmarkMetrics = {
    totalGames: workload.gameCount,
    totalTurns,
    totalActions,
    totalEvents,
    completedGames,
    maxTurnsReached,
    eventTypeCounts: toSortedRecord(eventTypeCounts),
  };
  aggregationMs += elapsedMs(clock, metricsStartedAt);

  const resultPreparationStartedAt = clock.now();
  const safeRuntimeDataPackId = runtimeDataPackId;
  if (safeRuntimeDataPackId === undefined) {
    throw new Error("Simulation benchmark did not load a Runtime Data pack");
  }
  const workloadFingerprint = sha256(
    JSON.stringify({
      contractVersion: workload.contractVersion,
      epoch: workload.epoch,
      profile: SIMULATION_REFERENCE_WORKLOAD_VERSION,
      playerCount: workload.playerCount,
      firstSeed: workload.firstSeed,
      gameCount: workload.gameCount,
      maxTurns: workload.maxTurns,
      runtimeDataPackId: safeRuntimeDataPackId,
    })
  );
  const workloadVolumeFingerprint = sha256(
    JSON.stringify({
      workloadFingerprint,
      totalGames: metrics.totalGames,
      totalTurns: metrics.totalTurns,
      totalActions: metrics.totalActions,
      totalEvents: metrics.totalEvents,
      eventTypeCounts: metrics.eventTypeCounts,
    })
  );
  const resultFingerprint = sha256(
    JSON.stringify({
      workloadFingerprint,
      games: gameSummaries,
      metrics: {
        completedGames: metrics.completedGames,
        maxTurnsReached: metrics.maxTurnsReached,
      },
    })
  );
  const resultPreparationMs = elapsedMs(clock, resultPreparationStartedAt);
  const totalMs = elapsedMs(clock, startedAt);

  return {
    sampleIndex,
    timings: {
      totalMs,
      dataLoadMs,
      gamesMs,
      aggregationMs,
      resultPreparationMs,
    },
    metrics,
    peakMemoryBytes: Math.max(0, peakMemoryBytes - warmupPeakMemoryBytes),
    runtimeDataPackId: safeRuntimeDataPackId,
    workloadFingerprint,
    workloadVolumeFingerprint,
    resultFingerprint,
    coverage,
  };
}

interface SimulationGameFingerprint {
  seed: number;
  endReason: SingleGameResult["endReason"];
  isGameEnd: boolean;
  turnsElapsed: number;
  winnerIds: readonly string[];
  isTie: boolean;
  actions: number;
  players: SingleGameResult["players"];
}

function toSimulationGameFingerprint(
  result: SingleGameResult,
  actionCount: number
): SimulationGameFingerprint {
  return {
    seed: result.seed,
    endReason: result.endReason,
    isGameEnd: result.isGameEnd,
    turnsElapsed: result.turnsElapsed,
    winnerIds: result.winnerIds,
    isTie: result.isTie,
    actions: actionCount,
    players: result.players,
  };
}

function medianSimulationMetrics(
  samples: readonly SimulationBenchmarkSample[]
): SimulationBenchmarkMetrics {
  const firstSample = samples[0];
  if (firstSample === undefined) {
    throw new Error("Cannot aggregate empty simulation benchmark samples");
  }
  return {
    totalGames: median(samples.map((sample) => sample.metrics.totalGames)),
    totalTurns: median(samples.map((sample) => sample.metrics.totalTurns)),
    totalActions: median(samples.map((sample) => sample.metrics.totalActions)),
    totalEvents: median(samples.map((sample) => sample.metrics.totalEvents)),
    completedGames: median(
      samples.map((sample) => sample.metrics.completedGames)
    ),
    maxTurnsReached: median(
      samples.map((sample) => sample.metrics.maxTurnsReached)
    ),
    eventTypeCounts: firstSample.metrics.eventTypeCounts,
  };
}

function assertStableSamples(
  samples: readonly SimulationBenchmarkSample[]
): void {
  const firstSample = samples[0];
  if (firstSample === undefined) {
    throw new Error("Cannot compare empty simulation benchmark samples");
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
        "Simulation benchmark is not deterministic across measured samples"
      );
    }
  }
}

function createEmptyCoverage(): SimulationCoverage {
  return {
    setup: false,
    turns: false,
    cardPlay: false,
    effects: false,
    discard: false,
    reshuffle: false,
    scoring: false,
  };
}

function updateCoverage(
  coverage: SimulationCoverage,
  event: SingleGameResult["eventLog"][number]
): SimulationCoverage {
  return {
    ...coverage,
    setup:
      coverage.setup ||
      event.type === "gameInitialized" ||
      event.type === "setupChoiceSelected",
    turns:
      coverage.turns ||
      event.type === "turnStarted" ||
      event.type === "turnEnded",
    cardPlay: coverage.cardPlay || event.type === "cardPlayed",
    effects: coverage.effects || event.type.startsWith("effect"),
    discard:
      coverage.discard ||
      (event.type === "cardMoved" &&
        event.destinationZone.endsWith(".discard")),
    reshuffle: coverage.reshuffle || event.type === "discardShuffledIntoDeck",
    scoring: coverage.scoring,
  };
}

function hasScoringResult(
  result: SingleGameResult,
  playerCount: number
): boolean {
  return (
    result.players.length === playerCount &&
    result.winnerIds.length > 0 &&
    result.players.every(
      (player) =>
        Number.isFinite(player.victoryPoints) &&
        Number.isInteger(player.legendCount) &&
        Number.isInteger(player.deadWizardTokenCount)
    )
  );
}

function toSortedRecord(
  counts: ReadonlyMap<string, number>
): Record<string, number> {
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right))
  );
}

function assertSimulationStage(
  stage: number
): asserts stage is SimulationBenchmarkStage {
  if (
    !SIMULATION_BENCHMARK_STAGES.includes(stage as SimulationBenchmarkStage)
  ) {
    throw new RangeError(
      `stage must be one of ${SIMULATION_BENCHMARK_STAGES.join(", ")}`
    );
  }
}
