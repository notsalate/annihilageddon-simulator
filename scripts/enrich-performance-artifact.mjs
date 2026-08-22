import { readFileSync, writeFileSync } from "node:fs";

import {
  getBenchmarkCommit,
  getBenchmarkEnvironmentFingerprint,
} from "../dist/src/engine/benchmark-support.js";

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const commitOverride = process.argv[4];
const comparisonPairId = process.argv[5];
if (inputPath === undefined || outputPath === undefined) {
  throw new Error(
    "Usage: node scripts/enrich-performance-artifact.mjs <input> <output> [commit] [comparisonPairId]"
  );
}

const value = JSON.parse(readFileSync(inputPath, "utf8"));
if (typeof value !== "object" || value === null || Array.isArray(value)) {
  throw new TypeError("Performance artifact must contain a JSON object");
}

writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      ...value,
      environment: getBenchmarkEnvironmentFingerprint(),
      commit: commitOverride ?? getBenchmarkCommit(),
      ...(comparisonPairId === undefined ? {} : { comparisonPairId }),
    },
    null,
    2
  )}\n`,
  "utf8"
);
