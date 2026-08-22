import {
  EFFECT_RUNTIME_BENCHMARK_ITERATIONS,
  runEffectRuntimeBenchmark,
} from "../dist/src/engine/effect-runtime-benchmark.js";

const iterations = parseIterations(process.argv.slice(2));
const result = runEffectRuntimeBenchmark({
  rootDir: process.cwd(),
  iterations,
});

console.log(
  [
    "Benchmark: effect-runtime",
    `contract: ${result.contractVersion}`,
    `effect: ${result.effectId}`,
    `iterations per path: ${result.iterations}`,
    "measurements: 1 warmup excluded, median of 3",
    `legacy decoder median: ${formatMilliseconds(result.legacyDecodeMedianMs)}`,
    `typed Catalog median: ${formatMilliseconds(result.typedCatalogMedianMs)}`,
    `speedup: ${formatRatio(result.speedupRatio)}`,
    `equivalent results: ${result.equivalentResults ? "yes" : "no"}`,
  ].join("\n")
);

function parseIterations(args) {
  if (args.length === 0) {
    return EFFECT_RUNTIME_BENCHMARK_ITERATIONS;
  }
  if (args.length !== 2 || args[0] !== "--iterations") {
    throw new Error(
      "Usage: npm run benchmark:effect-runtime -- --iterations <count>"
    );
  }
  const value = Number(args[1]);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("--iterations must be a positive safe integer");
  }
  return value;
}

function formatMilliseconds(value) {
  return `${value.toFixed(2)} ms`;
}

function formatRatio(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}x` : "infinite";
}
