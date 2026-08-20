import assert from "node:assert/strict";
import test from "node:test";

import { parseBenchmarkArgs } from "../src/cli/run-benchmark.js";

test("benchmark CLI parses simulation and analyzer options", () => {
  assert.deepEqual(
    parseBenchmarkArgs([
      "--kind",
      "analyzer",
      "--role",
      "current",
      "--format",
      "json",
      "--profile",
      "heavy",
      "--dataPackPath",
      "manifest.json",
    ]),
    {
      kind: "analyzer",
      role: "current",
      format: "json",
      stage: 10,
      profile: "heavy",
      firstSeed: undefined,
      maxTurns: undefined,
      dataPackPath: "manifest.json",
    }
  );
  assert.deepEqual(parseBenchmarkArgs(["--stage", "1000"]), {
    kind: "simulation",
    role: "reference",
    format: "human",
    stage: 1_000,
    profile: "light",
    firstSeed: undefined,
    maxTurns: undefined,
    dataPackPath: undefined,
  });
});

test("benchmark CLI rejects unsupported values and malformed numbers", () => {
  assert.throws(
    () => parseBenchmarkArgs(["--kind", "unknown"]),
    /kind must be one of simulation, analyzer/
  );
  assert.throws(
    () => parseBenchmarkArgs(["--stage", "20"]),
    /stage must be one of 10, 100, 1000, 10000, 100000/
  );
  assert.throws(
    () => parseBenchmarkArgs(["--firstSeed", "0"]),
    /firstSeed must be a positive safe integer/
  );
  assert.throws(
    () => parseBenchmarkArgs(["--format"]),
    /--format requires a value/
  );
});
