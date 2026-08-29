import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  runAnalyzerDiagnostic,
  runAnalyzerWorkloadOnce,
} from "../dist/src/engine/analyzer-diagnostics.js";
import { ANALYZER_BENCHMARK_PROFILES } from "../dist/src/engine/analyzer-benchmark.js";

const ANALYZER_ROLES = ["reference", "current"];
const OUTPUT_FORMATS = ["human", "json"];
const ALLOCATION_PROFILE_INTERVAL_BYTES = 64 * 1024;
const E1_BASELINE_RELATIVE_PATH = path.join(
  "docs",
  "benchmarks",
  "performance-epoch-e1.json"
);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ANALYZER_ENVIRONMENT_FIELDS = [
  "nodeVersion",
  "platform",
  "arch",
  "runner",
  "cpuModel",
  "cpuCount",
];

export function parseAnalyzerDiagnosticsArgs(args) {
  const values = new Map();
  let worker = false;
  let diagnosticWorker = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--worker") {
      worker = true;
      continue;
    }
    if (arg === "--diagnostic-worker") {
      diagnosticWorker = true;
      continue;
    }
    if (
      typeof arg !== "string" ||
      !arg.startsWith("--") ||
      ![
        "profile",
        "role",
        "format",
        "dataPackPath",
        "commit",
        "artifacts",
        "output",
      ].includes(arg.slice(2))
    ) {
      throw new Error(`Unsupported argument: ${String(arg)}`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }
    values.set(arg.slice(2), value);
    index += 1;
  }

  const profile = parseChoice(
    values.get("profile") ?? "light",
    ANALYZER_BENCHMARK_PROFILES,
    "profile"
  );
  const role = parseChoice(
    values.get("role") ?? "reference",
    ANALYZER_ROLES,
    "role"
  );
  const format = parseChoice(
    values.get("format") ?? "human",
    OUTPUT_FORMATS,
    "format"
  );

  return {
    profile,
    role,
    format,
    dataPackPath: values.get("dataPackPath"),
    commit: values.get("commit"),
    artifactDir: values.get("artifacts"),
    outputPath: values.get("output"),
    worker,
    diagnosticWorker,
  };
}

export function formatAnalyzerDiagnosticsSummary(summary) {
  const clean = summary.cleanBenchmark;
  const diagnostic = summary.diagnosticRun;
  const cpu = summary.cpuProfile;
  const allocation = summary.allocationProfile;
  const counterTotals = diagnostic.counters.total;
  const phaseCounters = diagnostic.counters.phases;
  const branchSearchDistribution = diagnostic.counters.branchSearchDistribution;
  const hotspotLines = (cpu.hotspots ?? [])
    .slice(0, 5)
    .map(
      (hotspot) =>
        `  - ${hotspot.category}: ${hotspot.functionName} ${hotspot.selfTimeMs.toFixed(2)} ms (${hotspot.url || "native"})`
    );
  const allocationHotspotLines = (allocation.applicationHotspots ?? [])
    .slice(0, 5)
    .map(
      (hotspot) =>
        `  - ${hotspot.category}: ${hotspot.functionName} ${formatBytes(hotspot.sampledBytes)} (${hotspot.url || "native"})`
    );
  return [
    "Analyzer diagnostics",
    `workload: ${summary.workload.role} (${summary.workload.workloadId}), profile ${summary.workload.profile}`,
    `parameters: seeds ${summary.workload.seeds.join(", ")}, players ${summary.workload.playerCount}, criterion ${summary.workload.criterionId}`,
    `fingerprints: workload ${summary.workloadFingerprint}, volume ${summary.workloadVolumeFingerprint}, result ${summary.resultFingerprint}`,
    "",
    `clean benchmark (${clean.comparableTo}):`,
    `  time ${formatMilliseconds(clean.timings.totalMs)}, enumeration ${formatMilliseconds(clean.timings.enumerationMs)}, ranking ${formatMilliseconds(clean.timings.rankingMs)}`,
    `  result fingerprint ${clean.resultFingerprint}`,
    "",
    "diagnostic run (instrumented; diagnostic-only, not comparable to E1):",
    `  time ${formatMilliseconds(diagnostic.timings.totalMs)}, enumeration ${formatMilliseconds(diagnostic.timings.enumerationMs)}, ranking ${formatMilliseconds(diagnostic.timings.rankingMs)}, evaluation policy ${formatMilliseconds(diagnostic.timings.evaluationPolicyMs)}`,
    `  actions ${counterTotals.actionApplications}, state clones ${counterTotals.gameStateClones}, choice replays ${counterTotals.choicePathReplays}`,
    `  states intermediate ${counterTotals.intermediateStates}, terminal ${counterTotals.terminalStates}`,
    `  path copies ${counterTotals.pathCopyOperations} operations/${counterTotals.pathItemsCopied} items, event-log copies ${counterTotals.eventLogCopyOperations} operations/${counterTotals.eventLogEntriesCopied} entries`,
    `  locations: point searches ${counterTotals.pointLocationSearches}, physical zone passes ${counterTotals.physicalZonePasses}, cards viewed ${counterTotals.physicalCardsViewed}, full lists ${counterTotals.fullLocationListsBuilt}, records ${counterTotals.locationRecordsCreated}, location changes ${counterTotals.physicalLocationChanges}`,
    `  point-search reasons: temporary control ${counterTotals.temporaryControlLocationSearches}, known card ${counterTotals.knownCardLocationSearches}, effective-type selection ${counterTotals.effectiveTypeSelectionLocationSearches}, gained-card record ${counterTotals.gainedCardRecordLocationSearches}, effect source ${counterTotals.effectSourceLocationSearches}, unclassified id ${counterTotals.unclassifiedIdLocationSearches}, removal ${counterTotals.physicalCardRemovalSearches}, reorder ${counterTotals.physicalCardReorderSearches}, move ${counterTotals.physicalCardMoveSearches}`,
    `  branch point-searches: ${branchSearchDistribution.branchAttempts} attempts, average ${branchSearchDistribution.averagePointLocationSearches.toFixed(2)}, buckets 0=${branchSearchDistribution.buckets.zero}, 1=${branchSearchDistribution.buckets.one}, 2-3=${branchSearchDistribution.buckets.twoToThree}, 4-7=${branchSearchDistribution.buckets.fourToSeven}, 8+=${branchSearchDistribution.buckets.eightOrMore}`,
    `  phases: enumeration ${phaseCounters.enumeration.actionApplications} actions, ranking ${phaseCounters.ranking.gameStateClones} clones, policy ${phaseCounters.evaluationPolicy.invocations} calls/${formatMilliseconds(phaseCounters.evaluationPolicy.timeMs)}, policy operations ${phaseCounters.evaluationPolicy.operations.actionApplications} actions/${phaseCounters.evaluationPolicy.operations.gameStateClones} clones`,
    "",
    "CPU profile (diagnostic-only, not comparable to E1):",
    `  sampled ${formatMilliseconds(cpu.sampledTimeMs ?? 0)}, categories JS ${formatMilliseconds(cpu.categoryTotals.javascript)}, V8 ${formatMilliseconds(cpu.categoryTotals.v8)}, native ${formatMilliseconds(cpu.categoryTotals.native)}, GC ${formatMilliseconds(cpu.categoryTotals.gc)}`,
    ...(hotspotLines.length === 0
      ? ["  hotspots: none"]
      : ["  hotspots:", ...hotspotLines]),
    "",
    "Allocation profile (sampled; diagnostic-only, not comparable to E1):",
    `  sampled ${formatBytes(allocation.sampledBytes ?? 0)} across ${allocation.sampleCount ?? 0} samples, categories JS ${formatBytes(allocation.categoryTotals.javascript)}, V8 ${formatBytes(allocation.categoryTotals.v8)}, native ${formatBytes(allocation.categoryTotals.native)}, GC ${formatBytes(allocation.categoryTotals.gc)}`,
    ...(allocationHotspotLines.length === 0
      ? ["  project hotspots: none"]
      : ["  project hotspots:", ...allocationHotspotLines]),
    "",
    `determinism: ${summary.determinism.allMatch ? "all runs have the same result fingerprint" : "fingerprints differ"}`,
    "artifacts:",
    `  clean benchmark: ${summary.artifacts.cleanBenchmark}`,
    `  counters: ${summary.artifacts.diagnosticRun}`,
    `  CPU profile: ${summary.artifacts.cpuProfile}`,
    `  allocation profile: ${summary.artifacts.allocationProfile}`,
    `  summary: ${summary.artifacts.summary}`,
  ].join("\n");
}

export function assertAnalyzerDiagnosticDeterminism(fingerprints) {
  const expected = fingerprints[0];
  if (
    typeof expected !== "string" ||
    fingerprints.some((fingerprint) => fingerprint !== expected)
  ) {
    throw new Error(
      `Analyzer diagnostic runs produced different result fingerprints: ${fingerprints.join(", ")}`
    );
  }
}

export function assertAnalyzerCleanBenchmarkArtifactConsistency(
  cleanBenchmark,
  persistedArtifact
) {
  const timingNames = [
    "totalMs",
    "dataLoadMs",
    "preparationMs",
    "enumerationMs",
    "rankingMs",
    "resultPreparationMs",
  ];
  for (const timingName of timingNames) {
    if (
      cleanBenchmark.timings?.[timingName] !==
      persistedArtifact.timings?.[timingName]
    ) {
      throw new Error(
        `Clean benchmark artifact changed ${timingName} while it was being written: ${String(cleanBenchmark.timings?.[timingName])} -> ${String(persistedArtifact.timings?.[timingName])}`
      );
    }
  }
  for (const fingerprintName of [
    "workloadFingerprint",
    "workloadVolumeFingerprint",
    "resultFingerprint",
  ]) {
    if (
      cleanBenchmark[fingerprintName] !== persistedArtifact[fingerprintName]
    ) {
      throw new Error(
        `Clean benchmark artifact changed ${fingerprintName} while it was being written: ${String(cleanBenchmark[fingerprintName])} -> ${String(persistedArtifact[fingerprintName])}`
      );
    }
  }
}

export function assessAnalyzerE1Comparability({
  cleanBenchmark,
  role,
  profile,
  acceptedReference,
  baselinePath,
}) {
  const actual = {
    epoch: cleanBenchmark.workload?.epoch ?? cleanBenchmark.epoch,
    contractVersion:
      cleanBenchmark.workload?.contractVersion ??
      cleanBenchmark.contractVersion,
    playerCount:
      cleanBenchmark.workload?.playerCount ?? cleanBenchmark.playerCount,
    workloadFingerprint: cleanBenchmark.workloadFingerprint,
    workloadVolumeFingerprint: cleanBenchmark.workloadVolumeFingerprint,
    warmupCount: cleanBenchmark.warmupCount,
    measurementCount: cleanBenchmark.measurementCount,
    environment: cleanBenchmark.environment ?? null,
    comparisonPairId: cleanBenchmark.comparisonPairId ?? null,
  };
  const base = {
    profile,
    baselinePath: baselinePath ?? null,
    actual,
  };
  if (role !== "reference") {
    return {
      ...base,
      status: "not-applicable",
      comparableTo: "not comparable to E1 for current role",
      accepted: null,
      mismatches: [],
    };
  }
  if (acceptedReference === null || acceptedReference === undefined) {
    return {
      ...base,
      status: "not-measured",
      comparableTo: "not measured: accepted E1 baseline is unavailable",
      accepted: null,
      mismatches: [],
    };
  }

  const expected = {
    epoch: acceptedReference.epoch,
    contractVersion: acceptedReference.contractVersion,
    playerCount: acceptedReference.playerCount,
    workloadFingerprint: acceptedReference.workloadFingerprint,
    workloadVolumeFingerprint: acceptedReference.workloadVolumeFingerprint,
    warmupCount: acceptedReference.warmupCount,
    measurementCount: acceptedReference.measurementCount,
    environment: acceptedReference.environment ?? null,
    comparisonPairId: acceptedReference.comparisonPairId ?? null,
  };
  const mismatches = Object.keys(expected)
    .filter(
      (field) =>
        field !== "environment" &&
        field !== "comparisonPairId" &&
        actual[field] !== expected[field]
    )
    .map((field) => ({
      field,
      expected: expected[field],
      actual: actual[field],
    }));
  if (!sameAnalyzerEnvironment(actual.environment, expected.environment)) {
    mismatches.push({
      field: "environment",
      expected: expected.environment,
      actual: actual.environment,
    });
  }
  if (
    !isNonEmptyString(actual.comparisonPairId) ||
    !isNonEmptyString(expected.comparisonPairId) ||
    actual.comparisonPairId !== expected.comparisonPairId
  ) {
    mismatches.push({
      field: "comparisonPairId",
      expected: expected.comparisonPairId,
      actual: actual.comparisonPairId,
    });
  }
  const missingPhysicalPairing =
    !hasAnalyzerEnvironment(actual.environment) ||
    !hasAnalyzerEnvironment(expected.environment) ||
    !isNonEmptyString(actual.comparisonPairId) ||
    !isNonEmptyString(expected.comparisonPairId);
  if (missingPhysicalPairing) {
    return {
      ...base,
      status: "not-measured",
      comparableTo:
        "not measured: exact environment and comparisonPairId are required",
      accepted: expected,
      mismatches,
    };
  }
  if (mismatches.length > 0) {
    return {
      ...base,
      status: "incomparable",
      comparableTo: `incomparable to ADR-0001/E1: ${mismatches
        .map(({ field }) => field)
        .join(", ")} differs`,
      accepted: expected,
      mismatches,
    };
  }
  return {
    ...base,
    status: "comparable",
    comparableTo: "ADR-0001/E1",
    accepted: expected,
    mismatches: [],
  };
}

function hasAnalyzerEnvironment(value) {
  return (
    isRecord(value) &&
    ANALYZER_ENVIRONMENT_FIELDS.every((field) =>
      field === "cpuCount"
        ? isFiniteNumber(value[field])
        : typeof value[field] === "string" && value[field].length > 0
    )
  );
}

function sameAnalyzerEnvironment(left, right) {
  return (
    hasAnalyzerEnvironment(left) &&
    hasAnalyzerEnvironment(right) &&
    ANALYZER_ENVIRONMENT_FIELDS.every((field) => left[field] === right[field])
  );
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

export function summarizeCpuProfile(profile) {
  const nodes = Array.isArray(profile?.nodes) ? profile.nodes : [];
  const samples = Array.isArray(profile?.samples) ? profile.samples : [];
  const timeDeltas = Array.isArray(profile?.timeDeltas)
    ? profile.timeDeltas
    : [];
  const nodesById = new Map();
  for (const node of nodes) {
    if (isRecord(node) && isFiniteNumber(node.id)) {
      nodesById.set(node.id, node);
    }
  }

  const categoryTotals = {
    javascript: 0,
    v8: 0,
    native: 0,
    gc: 0,
  };
  const hotspots = new Map();
  let sampledTimeMs = 0;

  samples.forEach((sampleId, index) => {
    if (!isFiniteNumber(sampleId)) return;
    const node = nodesById.get(sampleId);
    const callFrame = getCallFrame(node);
    const category = classifyCallFrame(callFrame);
    const rawDelta = timeDeltas[index];
    const durationMs =
      isFiniteNumber(rawDelta) && rawDelta >= 0 ? rawDelta / 1_000 : 0;
    sampledTimeMs += durationMs;
    categoryTotals[category] += durationMs;

    const key = `${category}|${callFrame.functionName}|${callFrame.url}|${callFrame.lineNumber}|${callFrame.columnNumber}`;
    const current = hotspots.get(key) ?? {
      category,
      functionName: callFrame.functionName,
      url: callFrame.url,
      lineNumber: callFrame.lineNumber,
      columnNumber: callFrame.columnNumber,
      selfTimeMs: 0,
      samples: 0,
    };
    current.selfTimeMs += durationMs;
    current.samples += 1;
    hotspots.set(key, current);
  });

  return {
    sampledTimeMs,
    sampleCount: samples.length,
    categoryTotals,
    hotspots: [...hotspots.values()]
      .sort(
        (left, right) =>
          right.selfTimeMs - left.selfTimeMs ||
          right.samples - left.samples ||
          left.functionName.localeCompare(right.functionName)
      )
      .slice(0, 20),
    sourceLinkage:
      "compiled JavaScript URL with line/column; use generated dist/**/*.js.map in the same build for TypeScript mapping",
  };
}

export function summarizeAllocationProfile(profile) {
  const samples = Array.isArray(profile?.samples) ? profile.samples : [];
  const nodesById = new Map();
  const parentIds = new Map();
  const stack = isRecord(profile?.head)
    ? [{ node: profile.head, parentId: undefined }]
    : [];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!isRecord(current?.node) || !isFiniteNumber(current.node.id)) continue;
    nodesById.set(current.node.id, current.node);
    if (isFiniteNumber(current.parentId)) {
      parentIds.set(current.node.id, current.parentId);
    }
    const children = Array.isArray(current.node.children)
      ? current.node.children
      : [];
    for (const child of children) {
      stack.push({ node: child, parentId: current.node.id });
    }
  }

  const categoryTotals = {
    javascript: 0,
    v8: 0,
    native: 0,
    gc: 0,
  };
  const hotspots = new Map();
  let sampledBytes = 0;
  let sampleCount = 0;

  for (const sample of samples) {
    if (
      !isRecord(sample) ||
      !isFiniteNumber(sample.nodeId) ||
      !isFiniteNumber(sample.size) ||
      sample.size < 0
    ) {
      continue;
    }
    const frame = resolveAllocationFrame(sample.nodeId, nodesById, parentIds);
    const category = classifyCallFrame(frame);
    sampledBytes += sample.size;
    sampleCount += 1;
    categoryTotals[category] += sample.size;

    const key = `${category}|${frame.functionName}|${frame.url}|${frame.lineNumber}|${frame.columnNumber}`;
    const current = hotspots.get(key) ?? {
      category,
      functionName: frame.functionName,
      url: frame.url,
      lineNumber: frame.lineNumber,
      columnNumber: frame.columnNumber,
      sampledBytes: 0,
      samples: 0,
    };
    current.sampledBytes += sample.size;
    current.samples += 1;
    hotspots.set(key, current);
  }

  const sortedHotspots = [...hotspots.values()].sort(
    (left, right) =>
      right.sampledBytes - left.sampledBytes ||
      right.samples - left.samples ||
      left.functionName.localeCompare(right.functionName)
  );
  return {
    sampledBytes,
    sampleCount,
    categoryTotals,
    hotspots: sortedHotspots.slice(0, 20),
    applicationHotspots: sortedHotspots
      .filter((hotspot) => hotspot.url.includes("/dist/src/"))
      .slice(0, 20),
    sourceLinkage:
      "sample leaf, or nearest JavaScript caller for a native/V8 leaf; use generated dist/**/*.js.map in the same build for TypeScript mapping",
    interpretation:
      "sampled allocation bytes captured by Node --heap-prof; not exact total allocation volume and not a heap snapshot",
  };
}

function parseChoice(value, choices, name) {
  if (!choices.includes(value)) {
    throw new Error(`${name} must be one of ${choices.join(", ")}`);
  }
  return value;
}

function formatMilliseconds(value) {
  return `${value.toFixed(2)} ms`;
}

function formatBytes(value) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(2)} KiB`;
  return `${value.toFixed(0)} B`;
}

function createWorkloadOptions(args) {
  return {
    rootDir: process.cwd(),
    role: args.role,
    profile: args.profile,
    ...(args.dataPackPath === undefined
      ? {}
      : { dataPackPath: args.dataPackPath }),
    ...(args.commit === undefined
      ? {}
      : { dependencies: { commit: args.commit } }),
  };
}

function readAcceptedAnalyzerE1Reference(profile) {
  const baselinePath = path.resolve(process.cwd(), E1_BASELINE_RELATIVE_PATH);
  if (!existsSync(baselinePath)) {
    return { baselinePath, reference: null };
  }
  const baseline = readJson(baselinePath);
  const entry = Array.isArray(baseline.entries)
    ? baseline.entries.find(
        (candidate) =>
          candidate?.benchmark === "analyzer" &&
          candidate?.id === `analyzer:${profile}`
      )
    : undefined;
  return {
    baselinePath,
    reference:
      entry !== undefined && typeof entry.reference === "object"
        ? entry.reference
        : null,
  };
}

function runCleanBenchmark(args, artifactPath) {
  const benchmarkCli = path.join(
    process.cwd(),
    "dist",
    "src",
    "cli",
    "run-benchmark.js"
  );
  const benchmarkArgs = [
    benchmarkCli,
    "--kind",
    "analyzer",
    "--role",
    args.role,
    "--profile",
    args.profile,
    "--format",
    "human",
    "--output",
    artifactPath,
  ];
  if (args.dataPackPath !== undefined) {
    benchmarkArgs.push("--dataPackPath", args.dataPackPath);
  }
  if (args.commit !== undefined) {
    benchmarkArgs.push("--commit", args.commit);
  }
  const result = spawnSync(process.execPath, benchmarkArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  assertChildSuccess(result, "clean benchmark");
  return readJson(artifactPath);
}

function runDiagnosticProcess(args) {
  const workerArgs = [
    SCRIPT_PATH,
    "--diagnostic-worker",
    "--profile",
    args.profile,
    "--role",
    args.role,
  ];
  if (args.dataPackPath !== undefined) {
    workerArgs.push("--dataPackPath", args.dataPackPath);
  }
  if (args.commit !== undefined) {
    workerArgs.push("--commit", args.commit);
  }
  const result = spawnSync(process.execPath, workerArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return parseChildJson(result, "instrumented diagnostic run");
}

function runCpuProfile(args, artifactDir) {
  const expectedPath = path.join(
    artifactDir,
    `cpu-profile-${args.profile}.cpuprofile`
  );
  const workerArgs = [
    SCRIPT_PATH,
    "--worker",
    "--profile",
    args.profile,
    "--role",
    args.role,
  ];
  if (args.dataPackPath !== undefined) {
    workerArgs.push("--dataPackPath", args.dataPackPath);
  }
  if (args.commit !== undefined) {
    workerArgs.push("--commit", args.commit);
  }
  const result = spawnSync(
    process.execPath,
    [
      "--cpu-prof",
      `--cpu-prof-dir=${artifactDir}`,
      `--cpu-prof-name=${path.basename(expectedPath)}`,
      ...workerArgs,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    }
  );
  const workerRun = parseChildJson(result, "CPU profile workload");
  const profilePath = resolveGeneratedProfilePath(
    artifactDir,
    expectedPath,
    ".cpuprofile"
  );
  if (profilePath === undefined) {
    throw new Error(`CPU profile was not created in ${artifactDir}`);
  }
  return {
    workerRun,
    profilePath,
    profile: summarizeCpuProfile(readJson(profilePath)),
  };
}

function runAllocationProfile(args, artifactDir) {
  const expectedPath = path.join(
    artifactDir,
    `allocation-profile-${args.profile}.heapprofile`
  );
  const workerArgs = [
    SCRIPT_PATH,
    "--worker",
    "--profile",
    args.profile,
    "--role",
    args.role,
  ];
  if (args.dataPackPath !== undefined) {
    workerArgs.push("--dataPackPath", args.dataPackPath);
  }
  if (args.commit !== undefined) {
    workerArgs.push("--commit", args.commit);
  }
  const result = spawnSync(
    process.execPath,
    [
      "--heap-prof",
      `--heap-prof-interval=${ALLOCATION_PROFILE_INTERVAL_BYTES}`,
      `--heap-prof-dir=${artifactDir}`,
      `--heap-prof-name=${path.basename(expectedPath)}`,
      ...workerArgs,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    }
  );
  const workerRun = parseChildJson(result, "allocation profile workload");
  const profilePath = resolveGeneratedProfilePath(
    artifactDir,
    expectedPath,
    ".heapprofile"
  );
  if (profilePath === undefined) {
    throw new Error(`Allocation profile was not created in ${artifactDir}`);
  }
  return {
    workerRun,
    profilePath,
    profile: summarizeAllocationProfile(readJson(profilePath)),
  };
}

function resolveGeneratedProfilePath(artifactDir, expectedPath, extension) {
  if (existsSync(expectedPath)) return expectedPath;
  const candidates = readdirSync(artifactDir)
    .filter((entry) => entry.endsWith(extension))
    .map((entry) => path.join(artifactDir, entry));
  return candidates.length === 0 ? undefined : candidates.at(-1);
}

function assertChildSuccess(result, label) {
  if (result.error !== undefined) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with status ${String(result.status)}: ${String(result.stderr).trim()}`
    );
  }
}

function parseChildJson(result, label) {
  assertChildSuccess(result, label);
  try {
    return JSON.parse(String(result.stdout));
  } catch (error) {
    throw new Error(
      `${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function runWorker(args) {
  if (args.diagnosticWorker) {
    return runAnalyzerDiagnostic(createWorkloadOptions(args));
  }
  const run = runAnalyzerWorkloadOnce(createWorkloadOptions(args));
  return {
    workload: run.workload,
    timings: run.timings,
    metrics: run.metrics,
    runtimeDataPackId: run.runtimeDataPackId,
    workloadFingerprint: run.workloadFingerprint,
    workloadVolumeFingerprint: run.workloadVolumeFingerprint,
    resultFingerprint: run.resultFingerprint,
  };
}

function runCommand(args) {
  const artifactDir = path.resolve(
    args.artifactDir ??
      path.join(
        process.cwd(),
        ".scratch",
        "tmp",
        "analyzer-diagnostics",
        `${Date.now()}-${args.profile}`
      )
  );
  mkdirSync(artifactDir, { recursive: true });

  const artifacts = {
    cleanBenchmark: path.join(artifactDir, "clean-benchmark.json"),
    diagnosticRun: path.join(artifactDir, "diagnostic-run.json"),
    cpuProfile: path.join(
      artifactDir,
      `cpu-profile-${args.profile}.cpuprofile`
    ),
    cpuRun: path.join(artifactDir, "cpu-run.json"),
    allocationProfile: path.join(
      artifactDir,
      `allocation-profile-${args.profile}.heapprofile`
    ),
    allocationRun: path.join(artifactDir, "allocation-run.json"),
    summary: path.resolve(
      args.outputPath ?? path.join(artifactDir, "summary.json")
    ),
  };
  const cleanBenchmark = runCleanBenchmark(args, artifacts.cleanBenchmark);
  const diagnosticRun = runDiagnosticProcess(args);
  const cpuRun = runCpuProfile(args, artifactDir);
  const allocationRun = runAllocationProfile(args, artifactDir);
  artifacts.cpuProfile = cpuRun.profilePath;
  artifacts.allocationProfile = allocationRun.profilePath;
  const persistedCleanBenchmark = readJson(artifacts.cleanBenchmark);
  assertAnalyzerCleanBenchmarkArtifactConsistency(
    cleanBenchmark,
    persistedCleanBenchmark
  );
  writeJson(artifacts.diagnosticRun, diagnosticRun);
  writeJson(artifacts.cpuRun, cpuRun.workerRun);
  writeJson(artifacts.allocationRun, allocationRun.workerRun);

  const fingerprints = [
    persistedCleanBenchmark.resultFingerprint,
    diagnosticRun.resultFingerprint,
    cpuRun.workerRun.resultFingerprint,
    allocationRun.workerRun.resultFingerprint,
  ];
  assertAnalyzerDiagnosticDeterminism(fingerprints);
  const resultFingerprint = persistedCleanBenchmark.resultFingerprint;
  const e1Baseline = readAcceptedAnalyzerE1Reference(args.profile);
  const e1Comparison = assessAnalyzerE1Comparability({
    cleanBenchmark: persistedCleanBenchmark,
    role: args.role,
    profile: args.profile,
    acceptedReference: e1Baseline.reference,
    baselinePath: e1Baseline.baselinePath,
  });
  const summary = {
    schemaVersion: "analyzer-diagnostic-report-v1",
    benchmark: "analyzer",
    diagnostic: "analyzer-workload",
    profile: args.profile,
    role: args.role,
    environment: persistedCleanBenchmark.environment,
    workload: diagnosticRun.workload,
    workloadFingerprint: diagnosticRun.workloadFingerprint,
    workloadVolumeFingerprint: diagnosticRun.workloadVolumeFingerprint,
    resultFingerprint,
    e1Comparison,
    cleanBenchmark: {
      timingClass: "clean-benchmark",
      comparableTo: e1Comparison.comparableTo,
      timings: persistedCleanBenchmark.timings,
      metrics: persistedCleanBenchmark.metrics,
      resultFingerprint: persistedCleanBenchmark.resultFingerprint,
      workloadFingerprint: persistedCleanBenchmark.workloadFingerprint,
      workloadVolumeFingerprint:
        persistedCleanBenchmark.workloadVolumeFingerprint,
      artifact: artifacts.cleanBenchmark,
    },
    diagnosticRun: {
      timingClass: "diagnostic-only",
      comparableTo: "not comparable to E1",
      timings: diagnosticRun.timings,
      metrics: diagnosticRun.metrics,
      counters: diagnosticRun.counters,
      resultFingerprint: diagnosticRun.resultFingerprint,
      artifact: artifacts.diagnosticRun,
    },
    cpuProfile: {
      timingClass: "diagnostic-only",
      comparableTo: "not comparable to E1",
      ...cpuRun.profile,
      resultFingerprint: cpuRun.workerRun.resultFingerprint,
      workloadFingerprint: cpuRun.workerRun.workloadFingerprint,
      workloadVolumeFingerprint: cpuRun.workerRun.workloadVolumeFingerprint,
      artifact: artifacts.cpuProfile,
      runArtifact: artifacts.cpuRun,
    },
    allocationProfile: {
      timingClass: "diagnostic-only",
      comparableTo: "not comparable to E1",
      ...allocationRun.profile,
      samplingIntervalBytes: ALLOCATION_PROFILE_INTERVAL_BYTES,
      resultFingerprint: allocationRun.workerRun.resultFingerprint,
      workloadFingerprint: allocationRun.workerRun.workloadFingerprint,
      workloadVolumeFingerprint:
        allocationRun.workerRun.workloadVolumeFingerprint,
      artifact: artifacts.allocationProfile,
      runArtifact: artifacts.allocationRun,
    },
    determinism: {
      allMatch: true,
      fingerprints: {
        cleanBenchmark: persistedCleanBenchmark.resultFingerprint,
        diagnosticRun: diagnosticRun.resultFingerprint,
        cpuProfile: cpuRun.workerRun.resultFingerprint,
        allocationProfile: allocationRun.workerRun.resultFingerprint,
      },
    },
    artifacts,
  };
  writeJson(artifacts.summary, summary);
  const persistedSummary = readJson(artifacts.summary);
  assertAnalyzerCleanBenchmarkArtifactConsistency(
    persistedCleanBenchmark,
    persistedSummary.cleanBenchmark
  );
  writeFileSync(
    path.join(artifactDir, "summary.txt"),
    `${formatAnalyzerDiagnosticsSummary(summary)}\n`,
    "utf8"
  );

  return summary;
}

function getCallFrame(node) {
  const frame = isRecord(node?.callFrame) ? node.callFrame : node;
  return {
    functionName:
      typeof frame?.functionName === "string"
        ? frame.functionName
        : "<anonymous>",
    url: typeof frame?.url === "string" ? frame.url : "",
    lineNumber: isFiniteNumber(frame?.lineNumber) ? frame.lineNumber + 1 : null,
    columnNumber: isFiniteNumber(frame?.columnNumber)
      ? frame.columnNumber + 1
      : null,
  };
}

function resolveAllocationFrame(nodeId, nodesById, parentIds) {
  let currentId = nodeId;
  const fallback = getCallFrame(nodesById.get(currentId));
  while (isFiniteNumber(currentId)) {
    const frame = getCallFrame(nodesById.get(currentId));
    if (classifyCallFrame(frame) === "javascript") return frame;
    currentId = parentIds.get(currentId);
  }
  return fallback;
}

function classifyCallFrame(frame) {
  if (/garbage collector|\bgc\b|collectgarbage/iu.test(frame.functionName)) {
    return "gc";
  }
  if (
    frame.url === "" ||
    frame.url.startsWith("native") ||
    /^(?:C\+\+|cpp|node::|v8::)/iu.test(frame.functionName)
  ) {
    return "native";
  }
  if (frame.url.startsWith("node:internal")) return "v8";
  if (frame.url.startsWith("node:")) return "native";
  return "javascript";
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)
) {
  try {
    const args = parseAnalyzerDiagnosticsArgs(process.argv.slice(2));
    if (args.worker || args.diagnosticWorker) {
      process.stdout.write(`${JSON.stringify(runWorker(args))}\n`);
    } else {
      const summary = runCommand(args);
      process.stdout.write(
        `${args.format === "json" ? JSON.stringify(summary, null, 2) : formatAnalyzerDiagnosticsSummary(summary)}\n`
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
