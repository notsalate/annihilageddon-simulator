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
const E1_BASELINE_RELATIVE_PATH = path.join(
  "docs",
  "benchmarks",
  "performance-epoch-e1.json"
);
const SCRIPT_PATH = fileURLToPath(import.meta.url);

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
  const counterTotals = diagnostic.counters.total;
  const phaseCounters = diagnostic.counters.phases;
  const hotspotLines = (cpu.hotspots ?? [])
    .slice(0, 5)
    .map(
      (hotspot) =>
        `  - ${hotspot.category}: ${hotspot.functionName} ${hotspot.selfTimeMs.toFixed(2)} ms (${hotspot.url || "native"})`
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
    `  phases: enumeration ${phaseCounters.enumeration.actionApplications} actions, ranking ${phaseCounters.ranking.gameStateClones} clones, policy ${phaseCounters.evaluationPolicy.invocations} calls/${formatMilliseconds(phaseCounters.evaluationPolicy.timeMs)}, policy operations ${phaseCounters.evaluationPolicy.operations.actionApplications} actions/${phaseCounters.evaluationPolicy.operations.gameStateClones} clones`,
    "",
    "CPU profile (diagnostic-only, not comparable to E1):",
    `  sampled ${formatMilliseconds(cpu.sampledTimeMs ?? 0)}, categories JS ${formatMilliseconds(cpu.categoryTotals.javascript)}, V8 ${formatMilliseconds(cpu.categoryTotals.v8)}, native ${formatMilliseconds(cpu.categoryTotals.native)}, GC ${formatMilliseconds(cpu.categoryTotals.gc)}`,
    ...(hotspotLines.length === 0
      ? ["  hotspots: none"]
      : ["  hotspots:", ...hotspotLines]),
    "",
    `determinism: ${summary.determinism.allMatch ? "all runs have the same result fingerprint" : "fingerprints differ"}`,
    "artifacts:",
    `  clean benchmark: ${summary.artifacts.cleanBenchmark}`,
    `  counters: ${summary.artifacts.diagnosticRun}`,
    `  CPU profile: ${summary.artifacts.cpuProfile}`,
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
    epoch: cleanBenchmark.workload?.epoch,
    contractVersion: cleanBenchmark.workload?.contractVersion,
    playerCount: cleanBenchmark.workload?.playerCount,
    workloadFingerprint: cleanBenchmark.workloadFingerprint,
    workloadVolumeFingerprint: cleanBenchmark.workloadVolumeFingerprint,
    warmupCount: cleanBenchmark.warmupCount,
    measurementCount: cleanBenchmark.measurementCount,
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
  };
  const mismatches = Object.keys(expected)
    .filter((field) => actual[field] !== expected[field])
    .map((field) => ({
      field,
      expected: expected[field],
      actual: actual[field],
    }));
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

function parseChoice(value, choices, name) {
  if (!choices.includes(value)) {
    throw new Error(`${name} must be one of ${choices.join(", ")}`);
  }
  return value;
}

function formatMilliseconds(value) {
  return `${value.toFixed(2)} ms`;
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

function runCleanBenchmark(args) {
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
    "json",
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
  return parseChildJson(result, "clean benchmark");
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
  const profilePath = resolveCpuProfilePath(artifactDir, expectedPath);
  if (profilePath === undefined) {
    throw new Error(`CPU profile was not created in ${artifactDir}`);
  }
  return {
    workerRun,
    profilePath,
    profile: summarizeCpuProfile(readJson(profilePath)),
  };
}

function resolveCpuProfilePath(artifactDir, expectedPath) {
  if (existsSync(expectedPath)) return expectedPath;
  const candidates = readdirSync(artifactDir)
    .filter((entry) => entry.endsWith(".cpuprofile"))
    .map((entry) => path.join(artifactDir, entry));
  return candidates.length === 0 ? undefined : candidates.at(-1);
}

function parseChildJson(result, label) {
  if (result.error !== undefined) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with status ${String(result.status)}: ${String(result.stderr).trim()}`
    );
  }
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

  const cleanBenchmark = runCleanBenchmark(args);
  const diagnosticRun = runDiagnosticProcess(args);
  const cpuRun = runCpuProfile(args, artifactDir);

  const artifacts = {
    cleanBenchmark: path.join(artifactDir, "clean-benchmark.json"),
    diagnosticRun: path.join(artifactDir, "diagnostic-run.json"),
    cpuProfile: cpuRun.profilePath,
    cpuRun: path.join(artifactDir, "cpu-run.json"),
    summary: path.resolve(
      args.outputPath ?? path.join(artifactDir, "summary.json")
    ),
  };
  writeJson(artifacts.cleanBenchmark, cleanBenchmark);
  const persistedCleanBenchmark = readJson(artifacts.cleanBenchmark);
  assertAnalyzerCleanBenchmarkArtifactConsistency(
    cleanBenchmark,
    persistedCleanBenchmark
  );
  writeJson(artifacts.diagnosticRun, diagnosticRun);
  writeJson(artifacts.cpuRun, cpuRun.workerRun);

  const fingerprints = [
    persistedCleanBenchmark.resultFingerprint,
    diagnosticRun.resultFingerprint,
    cpuRun.workerRun.resultFingerprint,
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
    determinism: {
      allMatch: true,
      fingerprints: {
        cleanBenchmark: persistedCleanBenchmark.resultFingerprint,
        diagnosticRun: diagnosticRun.resultFingerprint,
        cpuProfile: cpuRun.workerRun.resultFingerprint,
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
