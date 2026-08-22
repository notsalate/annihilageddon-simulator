import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  PERFORMANCE_CALIBRATION_SCHEMA_VERSION,
  assertPerformanceAcceptedCalibration,
  assertPerformanceCalibrationResult,
  samePerformanceRunnerClass,
  toPerformanceRunnerClass,
} from "../dist/src/engine/performance-epoch.js";

const calibrationRoot = process.argv[2];
const outputPath = process.argv[3];
const calibrationId = process.argv[4];
if (
  calibrationRoot === undefined ||
  outputPath === undefined ||
  calibrationId === undefined
) {
  throw new Error(
    "Usage: node scripts/create-performance-calibration-candidate.mjs <calibration-dir> <output> <calibration-id>"
  );
}
if (!/^[a-z0-9][a-z0-9._-]*$/u.test(calibrationId)) {
  throw new Error("Calibration ID must be a stable lowercase identifier");
}

const files = [
  "calibration-simulation.json",
  "calibration-analyzer-light.json",
  "calibration-analyzer-typical.json",
  "calibration-analyzer-heavy.json",
];
const results = files.map((fileName) => {
  const value = JSON.parse(
    readFileSync(path.join(calibrationRoot, fileName), "utf8")
  );
  assertPerformanceCalibrationResult(value);
  return value;
});
const first = results[0];
if (first === undefined) {
  throw new Error("Calibration candidate has no workload results");
}
for (const result of results.slice(1)) {
  if (
    result.commit !== first.commit ||
    result.comparisons !== first.comparisons ||
    result.warmupCount !== first.warmupCount ||
    result.measurementCount !== first.measurementCount ||
    result.formula !== first.formula ||
    !samePerformanceRunnerClass(result.environment, first.environment)
  ) {
    throw new Error(
      "Calibration candidate requires one commit, protocol and runner class"
    );
  }
}

const candidate = {
  schemaVersion: PERFORMANCE_CALIBRATION_SCHEMA_VERSION,
  calibrationId,
  commit: first.commit,
  protocol: {
    comparisons: first.comparisons,
    warmupCount: first.warmupCount,
    measurementCount: first.measurementCount,
    formula: first.formula,
  },
  runnerClass: toPerformanceRunnerClass(first.environment),
  entries: results.map((result) => ({
    benchmark: result.benchmark,
    id: result.id,
    contractVersion: result.contractVersion,
    workloadFingerprint: result.workloadFingerprint,
    workloadVolumeFingerprint: result.workloadVolumeFingerprint,
    tolerances: result.tolerances,
  })),
};
assertPerformanceAcceptedCalibration(candidate);
writeFileSync(outputPath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
