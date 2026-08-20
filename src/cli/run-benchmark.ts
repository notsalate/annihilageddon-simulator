import {
  ANALYZER_BENCHMARK_PROFILES,
  runAnalyzerBenchmark,
  type AnalyzerBenchmarkProfileId,
  type AnalyzerBenchmarkResult,
  type AnalyzerBenchmarkRole,
} from "../engine/analyzer-benchmark.js";
import {
  runSimulationBenchmark,
  SIMULATION_BENCHMARK_STAGES,
  type SimulationBenchmarkResult,
  type SimulationBenchmarkRole,
  type SimulationBenchmarkStage,
} from "../engine/simulation-benchmark.js";

export type BenchmarkKind = "simulation" | "analyzer";
export type BenchmarkOutputFormat = "human" | "json";

export interface BenchmarkArgs {
  kind: BenchmarkKind;
  role: SimulationBenchmarkRole | AnalyzerBenchmarkRole;
  format: BenchmarkOutputFormat;
  stage: SimulationBenchmarkStage;
  profile: AnalyzerBenchmarkProfileId;
  firstSeed: number | undefined;
  maxTurns: number | undefined;
  dataPackPath: string | undefined;
}

const defaults: BenchmarkArgs = {
  kind: "simulation",
  role: "reference",
  format: "human",
  stage: 10,
  profile: "light",
  firstSeed: undefined,
  maxTurns: undefined,
  dataPackPath: undefined,
};

export function parseBenchmarkArgs(args: readonly string[]): BenchmarkArgs {
  const values = new Map<string, string>();
  const supported = new Set([
    "kind",
    "role",
    "format",
    "stage",
    "profile",
    "firstSeed",
    "maxTurns",
    "dataPackPath",
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
    `games: completed ${result.metrics.completedGames}, maxTurns ${result.metrics.maxTurnsReached}`,
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

if (process.argv[1]?.endsWith("run-benchmark.js")) {
  try {
    const args = parseBenchmarkArgs(process.argv.slice(2));
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
      });
      console.log(
        args.format === "json"
          ? JSON.stringify(result, null, 2)
          : formatSimulationBenchmark(result)
      );
    } else {
      const result = runAnalyzerBenchmark({
        rootDir: process.cwd(),
        role: args.role,
        profile: args.profile,
        ...(args.dataPackPath === undefined
          ? {}
          : { dataPackPath: args.dataPackPath }),
      });
      console.log(
        args.format === "json"
          ? JSON.stringify(result, null, 2)
          : formatAnalyzerBenchmark(result)
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
