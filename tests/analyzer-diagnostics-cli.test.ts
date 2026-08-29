import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

interface DiagnosticsCliModule {
  parseAnalyzerDiagnosticsArgs(
    args: readonly string[]
  ): Record<string, unknown>;
  summarizeCpuProfile(profile: unknown): {
    sampledTimeMs: number;
    sampleCount: number;
    categoryTotals: Record<string, number>;
    hotspots: readonly {
      category: string;
      functionName: string;
      selfTimeMs: number;
    }[];
  };
  summarizeAllocationProfile(profile: unknown): {
    sampledBytes: number;
    sampleCount: number;
    categoryTotals: Record<string, number>;
    hotspots: readonly {
      category: string;
      functionName: string;
      sampledBytes: number;
      samples: number;
    }[];
  };
  formatAnalyzerDiagnosticsSummary(summary: unknown): string;
  assertAnalyzerDiagnosticDeterminism(fingerprints: readonly string[]): void;
  assertAnalyzerCleanBenchmarkArtifactConsistency(
    cleanBenchmark: Record<string, unknown>,
    persistedArtifact: Record<string, unknown>
  ): void;
  assessAnalyzerE1Comparability(options: {
    cleanBenchmark: Record<string, unknown>;
    role: "reference" | "current";
    profile: "light" | "typical" | "heavy";
    acceptedReference: Record<string, unknown> | null;
    baselinePath: string;
  }): {
    status: string;
    comparableTo: string;
    mismatches: readonly {
      field: string;
      expected: unknown;
      actual: unknown;
    }[];
  };
}

const cliModule: unknown = await import(
  pathToFileURL(
    path.resolve(process.cwd(), "scripts", "run-analyzer-diagnostics.mjs")
  ).href
);

const analyzerEnvironment = {
  nodeVersion: "v22.15.0",
  platform: "linux",
  arch: "x64",
  runner: "github:Linux:X64:ubuntu:24.04",
  cpuModel: "fixture-cpu",
  cpuCount: 4,
};

function isDiagnosticsCliModule(value: unknown): value is DiagnosticsCliModule {
  return (
    typeof value === "object" &&
    value !== null &&
    "parseAnalyzerDiagnosticsArgs" in value &&
    typeof value.parseAnalyzerDiagnosticsArgs === "function" &&
    "summarizeCpuProfile" in value &&
    typeof value.summarizeCpuProfile === "function" &&
    "summarizeAllocationProfile" in value &&
    typeof value.summarizeAllocationProfile === "function" &&
    "formatAnalyzerDiagnosticsSummary" in value &&
    typeof value.formatAnalyzerDiagnosticsSummary === "function" &&
    "assertAnalyzerDiagnosticDeterminism" in value &&
    typeof value.assertAnalyzerDiagnosticDeterminism === "function" &&
    "assertAnalyzerCleanBenchmarkArtifactConsistency" in value &&
    typeof value.assertAnalyzerCleanBenchmarkArtifactConsistency ===
      "function" &&
    "assessAnalyzerE1Comparability" in value &&
    typeof value.assessAnalyzerE1Comparability === "function"
  );
}

if (!isDiagnosticsCliModule(cliModule)) {
  throw new Error("analyzer diagnostics CLI has an invalid interface");
}

test("analyzer diagnostics CLI parses profile and artifact options", () => {
  assert.deepEqual(
    cliModule.parseAnalyzerDiagnosticsArgs([
      "--profile",
      "heavy",
      "--role",
      "reference",
      "--format",
      "json",
      "--dataPackPath",
      "manifest.json",
      "--commit",
      "head-sha",
      "--artifacts",
      "tmp/analyzer",
      "--output",
      "summary.json",
    ]),
    {
      profile: "heavy",
      role: "reference",
      format: "json",
      dataPackPath: "manifest.json",
      commit: "head-sha",
      artifactDir: "tmp/analyzer",
      outputPath: "summary.json",
      worker: false,
      diagnosticWorker: false,
    }
  );
});

test("analyzer diagnostics CLI defaults to a reference light-profile run", () => {
  assert.deepEqual(cliModule.parseAnalyzerDiagnosticsArgs([]), {
    profile: "light",
    role: "reference",
    format: "human",
    dataPackPath: undefined,
    commit: undefined,
    artifactDir: undefined,
    outputPath: undefined,
    worker: false,
    diagnosticWorker: false,
  });
});

test("analyzer diagnostics CLI does not allow skipping the CPU profile", () => {
  assert.throws(
    () => cliModule.parseAnalyzerDiagnosticsArgs(["--no-cpu-profile"]),
    /Unsupported argument/
  );
});

test("analyzer diagnostics CLI does not allow skipping the allocation profile", () => {
  assert.throws(
    () => cliModule.parseAnalyzerDiagnosticsArgs(["--no-allocation-profile"]),
    /Unsupported argument/
  );
});

test("analyzer diagnostics human summary includes location counters and branch buckets", () => {
  const operationCounters = {
    actionApplications: 0,
    gameStateClones: 0,
    choicePathReplays: 0,
    choicePathExpansions: 0,
    choiceBranchesGenerated: 0,
    intermediateStates: 0,
    terminalStates: 0,
    pathCopyOperations: 0,
    pathItemsCopied: 0,
    eventLogCopyOperations: 0,
    eventLogEntriesCopied: 0,
    pointLocationSearches: 4,
    temporaryControlLocationSearches: 2,
    knownCardLocationSearches: 1,
    effectiveTypeSelectionLocationSearches: 1,
    gainedCardRecordLocationSearches: 0,
    effectSourceLocationSearches: 0,
    unclassifiedIdLocationSearches: 0,
    physicalCardRemovalSearches: 0,
    physicalCardReorderSearches: 0,
    physicalCardMoveSearches: 0,
    physicalZonePasses: 5,
    physicalCardsViewed: 6,
    fullLocationListsBuilt: 7,
    locationRecordsCreated: 8,
    physicalLocationChanges: 9,
  };
  const summary = {
    workload: {
      role: "reference",
      workloadId: "analyzer-reference-v1",
      profile: "light",
      seeds: [1],
      playerCount: 2,
      criterionId: "victory-points",
    },
    workloadFingerprint: "workload",
    workloadVolumeFingerprint: "volume",
    resultFingerprint: "result",
    cleanBenchmark: {
      comparableTo: "not comparable",
      timings: { totalMs: 1, enumerationMs: 2, rankingMs: 3 },
      resultFingerprint: "result",
    },
    diagnosticRun: {
      timings: {
        totalMs: 4,
        enumerationMs: 5,
        rankingMs: 6,
        evaluationPolicyMs: 7,
      },
      counters: {
        total: operationCounters,
        branchSearchDistribution: {
          branchAttempts: 15,
          totalPointLocationSearches: 16,
          averagePointLocationSearches: 16 / 15,
          buckets: {
            zero: 1,
            one: 2,
            twoToThree: 3,
            fourToSeven: 4,
            eightOrMore: 5,
          },
        },
        phases: {
          enumeration: operationCounters,
          ranking: operationCounters,
          evaluationPolicy: {
            invocations: 0,
            timeMs: 0,
            operations: operationCounters,
            isolatedStateClones: 0,
            isolatedPathCopyOperations: 0,
            isolatedPathItemsCopied: 0,
            isolatedEventLogCopyOperations: 0,
            isolatedEventLogEntriesCopied: 0,
          },
        },
      },
    },
    cpuProfile: {
      sampledTimeMs: 0,
      categoryTotals: { javascript: 0, v8: 0, native: 0, gc: 0 },
      hotspots: [],
    },
    allocationProfile: {
      sampledBytes: 0,
      sampleCount: 0,
      categoryTotals: { javascript: 0, v8: 0, native: 0, gc: 0 },
      applicationHotspots: [],
    },
    determinism: { allMatch: true },
    artifacts: {
      cleanBenchmark: "clean.json",
      diagnosticRun: "diagnostic.json",
      cpuProfile: "cpu.cpuprofile",
      allocationProfile: "allocation.heapprofile",
      summary: "summary.json",
    },
  };

  const rendered = cliModule.formatAnalyzerDiagnosticsSummary(summary);

  assert.match(rendered, /point searches 4/);
  assert.match(
    rendered,
    /temporary control 2, known card 1, effective-type selection 1, gained-card record 0, effect source 0, unclassified id 0, removal 0, reorder 0, move 0/
  );
  assert.match(rendered, /physical zone passes 5/);
  assert.match(rendered, /location changes 9/);
  assert.match(rendered, /buckets 0=1, 1=2, 2-3=3, 4-7=4, 8\+=5/);
});

test("CPU profile summary separates JavaScript, V8, native and GC samples", () => {
  const summary = cliModule.summarizeCpuProfile({
    nodes: [
      {
        id: 1,
        callFrame: {
          functionName: "runAnalyzerWorkloadOnce",
          url: "file:///repo/dist/src/engine/analyzer-diagnostics.js",
          lineNumber: 9,
          columnNumber: 2,
        },
      },
      {
        id: 2,
        callFrame: {
          functionName: "Builtin:ArraySort",
          url: "node:internal/v8",
          lineNumber: 0,
          columnNumber: 0,
        },
      },
      {
        id: 3,
        callFrame: {
          functionName: "node::fs::Read",
          url: "",
          lineNumber: 0,
          columnNumber: 0,
        },
      },
      {
        id: 4,
        callFrame: {
          functionName: "(garbage collector)",
          url: "",
          lineNumber: 0,
          columnNumber: 0,
        },
      },
    ],
    samples: [1, 2, 3, 4],
    timeDeltas: [1_000, 2_000, 3_000, 4_000],
  });

  assert.deepEqual(summary.categoryTotals, {
    javascript: 1,
    v8: 2,
    native: 3,
    gc: 4,
  });
  assert.equal(summary.sampledTimeMs, 10);
  assert.equal(summary.sampleCount, 4);
  assert.equal(summary.hotspots[0]?.functionName, "(garbage collector)");
});

test("allocation profile summary attributes sampled bytes to allocation sites", () => {
  const summary = cliModule.summarizeAllocationProfile({
    head: {
      id: 1,
      callFrame: {
        functionName: "(root)",
        url: "",
        lineNumber: -1,
        columnNumber: -1,
      },
      selfSize: 0,
      children: [
        {
          id: 2,
          callFrame: {
            functionName: "forkGameState",
            url: "file:///repo/dist/src/engine/game-state.js",
            lineNumber: 9,
            columnNumber: 2,
          },
          selfSize: 1_024,
          children: [],
        },
        {
          id: 3,
          callFrame: {
            functionName: "Builtin:ArrayMap",
            url: "node:internal/v8",
            lineNumber: 0,
            columnNumber: 0,
          },
          selfSize: 512,
          children: [],
        },
      ],
    },
    samples: [
      { size: 1_024, nodeId: 2, ordinal: 1 },
      { size: 512, nodeId: 3, ordinal: 2 },
    ],
  });

  assert.equal(summary.sampledBytes, 1_536);
  assert.equal(summary.sampleCount, 2);
  assert.deepEqual(summary.categoryTotals, {
    javascript: 1_024,
    v8: 512,
    native: 0,
    gc: 0,
  });
  assert.deepEqual(summary.hotspots[0], {
    category: "javascript",
    functionName: "forkGameState",
    url: "file:///repo/dist/src/engine/game-state.js",
    lineNumber: 10,
    columnNumber: 3,
    sampledBytes: 1_024,
    samples: 1,
  });
});

test("analyzer diagnostics reject mismatched result fingerprints", () => {
  assert.doesNotThrow(() =>
    cliModule.assertAnalyzerDiagnosticDeterminism(["same", "same", "same"])
  );
  assert.throws(
    () => cliModule.assertAnalyzerDiagnosticDeterminism(["same", "different"]),
    /different result fingerprints/
  );
});

test("analyzer diagnostics reject an E1 workload fingerprint mismatch", () => {
  const result = cliModule.assessAnalyzerE1Comparability({
    cleanBenchmark: {
      workload: {
        epoch: "E1",
        contractVersion: "analyzer-benchmark-v1",
        playerCount: 2,
      },
      workloadFingerprint: "current-workload",
      workloadVolumeFingerprint: "current-volume",
      warmupCount: 1,
      measurementCount: 3,
      environment: analyzerEnvironment,
      comparisonPairId: "fixture-pair",
    },
    role: "reference",
    profile: "light",
    acceptedReference: {
      epoch: "E1",
      contractVersion: "analyzer-benchmark-v1",
      playerCount: 2,
      workloadFingerprint: "accepted-workload",
      workloadVolumeFingerprint: "accepted-volume",
      warmupCount: 1,
      measurementCount: 3,
      environment: analyzerEnvironment,
      comparisonPairId: "fixture-pair",
    },
    baselinePath: "docs/benchmarks/performance-epoch-e1.json",
  });

  assert.equal(result.status, "incomparable");
  assert.match(result.comparableTo, /incomparable/iu);
  assert.deepEqual(
    result.mismatches.map(({ field }) => field),
    ["workloadFingerprint", "workloadVolumeFingerprint"]
  );
});

test("analyzer diagnostics does not compare an unpaired E1 run", () => {
  const result = cliModule.assessAnalyzerE1Comparability({
    cleanBenchmark: {
      workload: {
        epoch: "E1",
        contractVersion: "analyzer-benchmark-v1",
        playerCount: 2,
      },
      workloadFingerprint: "same-workload",
      workloadVolumeFingerprint: "same-volume",
      warmupCount: 1,
      measurementCount: 3,
      environment: analyzerEnvironment,
    },
    role: "reference",
    profile: "light",
    acceptedReference: {
      epoch: "E1",
      contractVersion: "analyzer-benchmark-v1",
      playerCount: 2,
      workloadFingerprint: "same-workload",
      workloadVolumeFingerprint: "same-volume",
      warmupCount: 1,
      measurementCount: 3,
      environment: analyzerEnvironment,
    },
    baselinePath: "docs/benchmarks/performance-epoch-e1.json",
  });

  assert.equal(result.status, "not-measured");
  assert.match(result.comparableTo, /comparisonPairId/iu);
  assert.deepEqual(
    result.mismatches.map(({ field }) => field),
    ["comparisonPairId"]
  );
});

test("analyzer diagnostics rejects a paired E1 run from another environment", () => {
  const result = cliModule.assessAnalyzerE1Comparability({
    cleanBenchmark: {
      workload: {
        epoch: "E1",
        contractVersion: "analyzer-benchmark-v1",
        playerCount: 2,
      },
      workloadFingerprint: "same-workload",
      workloadVolumeFingerprint: "same-volume",
      warmupCount: 1,
      measurementCount: 3,
      environment: { ...analyzerEnvironment, cpuModel: "other-cpu" },
      comparisonPairId: "fixture-pair",
    },
    role: "reference",
    profile: "light",
    acceptedReference: {
      epoch: "E1",
      contractVersion: "analyzer-benchmark-v1",
      playerCount: 2,
      workloadFingerprint: "same-workload",
      workloadVolumeFingerprint: "same-volume",
      warmupCount: 1,
      measurementCount: 3,
      environment: analyzerEnvironment,
      comparisonPairId: "fixture-pair",
    },
    baselinePath: "docs/benchmarks/performance-epoch-e1.json",
  });

  assert.equal(result.status, "incomparable");
  assert.deepEqual(
    result.mismatches.map(({ field }) => field),
    ["environment"]
  );
});

test("analyzer diagnostics verify clean timing after artifact serialization", () => {
  const cleanBenchmark = {
    timings: {
      totalMs: 5_003,
      dataLoadMs: 10,
      preparationMs: 1,
      enumerationMs: 4_000,
      rankingMs: 900,
      resultPreparationMs: 92,
    },
    workloadFingerprint: "workload",
    workloadVolumeFingerprint: "volume",
    resultFingerprint: "result",
  };
  const persistedArtifact = {
    timings: { ...cleanBenchmark.timings },
    workloadFingerprint: cleanBenchmark.workloadFingerprint,
    workloadVolumeFingerprint: cleanBenchmark.workloadVolumeFingerprint,
    resultFingerprint: cleanBenchmark.resultFingerprint,
  };

  assert.doesNotThrow(() =>
    cliModule.assertAnalyzerCleanBenchmarkArtifactConsistency(
      cleanBenchmark,
      persistedArtifact
    )
  );
  assert.throws(
    () =>
      cliModule.assertAnalyzerCleanBenchmarkArtifactConsistency(
        cleanBenchmark,
        {
          ...persistedArtifact,
          timings: { ...persistedArtifact.timings, totalMs: 5_683 },
        }
      ),
    /changed totalMs/
  );
});
