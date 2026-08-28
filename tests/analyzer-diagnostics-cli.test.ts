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
}

const cliModule: unknown = await import(
  pathToFileURL(
    path.resolve(process.cwd(), "scripts", "run-analyzer-diagnostics.mjs")
  ).href
);

function isDiagnosticsCliModule(
  value: unknown
): value is DiagnosticsCliModule {
  return (
    typeof value === "object" &&
    value !== null &&
    "parseAnalyzerDiagnosticsArgs" in value &&
    typeof value.parseAnalyzerDiagnosticsArgs === "function"
    && "summarizeCpuProfile" in value
    && typeof value.summarizeCpuProfile === "function"
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
      cpuProfile: true,
      worker: false,
      diagnosticWorker: false,
    }
  );
});

test("analyzer diagnostics CLI defaults to a current light-profile run", () => {
  assert.deepEqual(cliModule.parseAnalyzerDiagnosticsArgs([]), {
    profile: "light",
    role: "current",
    format: "human",
    dataPackPath: undefined,
    commit: undefined,
    artifactDir: undefined,
    outputPath: undefined,
    cpuProfile: true,
    worker: false,
    diagnosticWorker: false,
  });
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
