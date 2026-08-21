import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const baseDir = process.argv[2];
const outputPath = process.argv[3];
if (baseDir === undefined || outputPath === undefined) {
  throw new Error(
    "Usage: node scripts/run-base-simulation-benchmark.mjs <base-dir> <output>"
  );
}

const resolvedBaseDir = path.resolve(baseDir);
const benchmarkModule = await import(
  pathToFileURL(
    path.join(
      resolvedBaseDir,
      "dist",
      "src",
      "engine",
      "simulation-benchmark.js"
    )
  ).href
);
const stages = benchmarkModule.SIMULATION_BENCHMARK_STAGES;
if (!Array.isArray(stages)) {
  throw new TypeError("Base simulation benchmark stages must be an array");
}
if (!stages.includes(100)) stages.push(100);

const result = benchmarkModule.runSimulationBenchmark({
  rootDir: resolvedBaseDir,
  role: "current",
  stage: 100,
});
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
