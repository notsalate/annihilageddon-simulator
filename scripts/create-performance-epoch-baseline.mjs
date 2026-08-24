import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  PERFORMANCE_EPOCH,
  assertPerformanceCalibrationResult,
  assertPerformanceEpochBaseline,
  parsePerformanceMeasurement,
  samePerformanceRunnerClass,
} from "../dist/src/engine/performance-epoch.js";

const referenceRoot = path.resolve(process.argv[2] ?? "");
const calibrationRoot = path.resolve(process.argv[3] ?? "");
const outputPath = path.resolve(process.argv[4] ?? "");
if (
  referenceRoot.length === 0 ||
  calibrationRoot.length === 0 ||
  outputPath.length === 0
) {
  throw new Error(
    "Usage: node scripts/create-performance-epoch-baseline.mjs <reference-dir> <calibration-dir> <output>"
  );
}

const workloads = [
  {
    benchmark: "simulation",
    id: "simulation:100",
    referenceFile: "performance-epoch-reference-simulation.json",
    calibrationFile: "calibration-simulation.json",
  },
  {
    benchmark: "analyzer",
    id: "analyzer:light",
    referenceFile: "performance-epoch-reference-analyzer-light.json",
    calibrationFile: "calibration-analyzer-light.json",
  },
  {
    benchmark: "analyzer",
    id: "analyzer:typical",
    referenceFile: "performance-epoch-reference-analyzer-typical.json",
    calibrationFile: "calibration-analyzer-typical.json",
  },
  {
    benchmark: "analyzer",
    id: "analyzer:heavy",
    referenceFile: "performance-epoch-reference-analyzer-heavy.json",
    calibrationFile: "calibration-analyzer-heavy.json",
  },
];

const entries = workloads.map((workload) => {
  const reference = parsePerformanceMeasurement(
    readJson(path.join(referenceRoot, workload.referenceFile))
  );
  const calibration = readJson(
    path.join(calibrationRoot, workload.calibrationFile)
  );
  assertPerformanceCalibrationResult(calibration);

  if (
    reference.benchmark !== workload.benchmark ||
    reference.id !== workload.id ||
    reference.role !== "reference"
  ) {
    throw new Error(
      `Reference artifact does not match ${workload.benchmark}/${workload.id}`
    );
  }
  if (
    calibration.benchmark !== reference.benchmark ||
    calibration.id !== reference.id ||
    calibration.commit !== reference.commit ||
    calibration.contractVersion !== reference.contractVersion ||
    calibration.workloadFingerprint !== reference.workloadFingerprint ||
    calibration.workloadVolumeFingerprint !==
      reference.workloadVolumeFingerprint ||
    calibration.warmupCount !== reference.warmupCount ||
    calibration.measurementCount !== reference.measurementCount ||
    !samePerformanceRunnerClass(calibration.environment, reference.environment)
  ) {
    throw new Error(
      `Reference and calibration fingerprints differ for ${workload.id}`
    );
  }

  return {
    benchmark: reference.benchmark,
    id: reference.id,
    epoch: PERFORMANCE_EPOCH,
    reference: { ...reference, epoch: PERFORMANCE_EPOCH },
    tolerances: calibration.tolerances,
  };
});

const firstCalibration = readCalibration(
  path.join(calibrationRoot, workloads[0].calibrationFile)
);
for (const workload of workloads.slice(1)) {
  const calibration = readCalibration(
    path.join(calibrationRoot, workload.calibrationFile)
  );
  if (
    calibration.commit !== firstCalibration.commit ||
    !samePerformanceRunnerClass(
      calibration.environment,
      firstCalibration.environment
    )
  ) {
    throw new Error("Epoch calibrations must use one commit and environment");
  }
}

const baseline = {
  schemaVersion: "performance-epoch-v1",
  epoch: PERFORMANCE_EPOCH,
  playerCount: 2,
  calibration: {
    comparisons: 20,
    method: "paired-same-commit",
    freshRunners: true,
    warmupCount: 1,
    measurementCount: 3,
    formula: "p95-plus-25-percent-safety-margin",
    commit: firstCalibration.commit,
    environment: firstCalibration.environment,
  },
  entries,
};
assertPerformanceEpochBaseline(baseline);
writeFileSync(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");

function readCalibration(filePath) {
  const value = readJson(filePath);
  assertPerformanceCalibrationResult(value);
  return value;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}
