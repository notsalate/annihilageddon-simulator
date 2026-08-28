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
