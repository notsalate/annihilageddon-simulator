import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

export interface BenchmarkClock {
  now(): number;
  readPeakMemoryBytes(): number;
}

export const systemBenchmarkClock: BenchmarkClock = {
  now: () => performance.now(),
  readPeakMemoryBytes: () => process.resourceUsage().maxRSS * 1_024,
};

export function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new RangeError("Cannot calculate a median of an empty sequence");
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  if (upper === undefined) {
    throw new Error("Median sequence is unexpectedly sparse");
  }
  return sorted.length % 2 === 0 ? ((lower ?? upper) + upper) / 2 : upper;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

export function elapsedMs(clock: BenchmarkClock, startedAt: number): number {
  return clock.now() - startedAt;
}
