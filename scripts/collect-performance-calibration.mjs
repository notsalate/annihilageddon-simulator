import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const inputRoot = path.resolve(process.argv[2] ?? "");
const outputRoot = path.resolve(process.argv[3] ?? "");
if (inputRoot.length === 0 || outputRoot.length === 0) {
  throw new Error(
    "Usage: node scripts/collect-performance-calibration.mjs <input-dir> <output-dir>"
  );
}

const bundles = listJsonFiles(inputRoot).filter((filePath) =>
  path.basename(filePath).startsWith("performance-calibration-")
);
if (bundles.length === 0) {
  throw new Error("No performance calibration bundles were found");
}
mkdirSync(outputRoot, { recursive: true });

const groups = new Map();
for (const bundlePath of bundles) {
  const parsed = JSON.parse(readFileSync(bundlePath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`Calibration bundle is not an array: ${bundlePath}`);
  }
  for (const pair of parsed) {
    if (
      typeof pair !== "object" ||
      pair === null ||
      Array.isArray(pair) ||
      typeof pair.first !== "object" ||
      pair.first === null ||
      typeof pair.second !== "object" ||
      pair.second === null ||
      typeof pair.first.id !== "string"
    ) {
      throw new Error(
        `Calibration bundle contains an invalid pair: ${bundlePath}`
      );
    }
    const entries = groups.get(pair.first.id) ?? [];
    entries.push({ first: pair.first, second: pair.second });
    groups.set(pair.first.id, entries);
  }
}

for (const [id, pairs] of groups) {
  if (pairs.length !== 20) {
    throw new Error(
      `Calibration ${id} has ${pairs.length} comparisons instead of 20`
    );
  }
  const outputPath = path.join(outputRoot, `${id.replaceAll(":", "-")}.json`);
  writeFileSync(outputPath, `${JSON.stringify(pairs, null, 2)}\n`, "utf8");
}

function listJsonFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? listJsonFiles(entryPath)
      : entry.name.endsWith(".json")
        ? [entryPath]
        : [];
  });
}
