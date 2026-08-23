import { readFileSync } from "node:fs";

import {
  assertPerformanceEpochBaseline,
  getAcceptedPerformanceEpochCommit,
} from "../dist/src/engine/performance-epoch.js";

const baselinePath = process.argv[2];
if (baselinePath === undefined) {
  throw new Error(
    "Usage: node scripts/read-performance-epoch-commit.mjs <baseline>"
  );
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
assertPerformanceEpochBaseline(baseline);
process.stdout.write(`${getAcceptedPerformanceEpochCommit(baseline)}\n`);
