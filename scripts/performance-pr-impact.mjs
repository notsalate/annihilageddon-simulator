import { spawnSync } from "node:child_process";

const base = process.argv[2];
const head = process.argv[3];
if (base === undefined || head === undefined) {
  throw new Error(
    "Usage: node scripts/performance-pr-impact.mjs <base> <head>"
  );
}

const result = spawnSync(
  "git",
  ["diff", "--name-status", "-z", "--find-renames", base, head, "--"],
  { encoding: "utf8" }
);
if (result.error !== undefined) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const fields = result.stdout.split("\0");
fields.pop();
const changedPaths = [];
for (let index = 0; index < fields.length; ) {
  const status = fields[index];
  if (status === undefined || status.length === 0) {
    throw new Error("git diff returned an invalid name-status record");
  }
  index += 1;
  const pathCount = status.startsWith("R") || status.startsWith("C") ? 2 : 1;
  for (let pathIndex = 0; pathIndex < pathCount; pathIndex += 1) {
    const changedPath = fields[index];
    if (changedPath === undefined || changedPath.length === 0) {
      throw new Error("git diff returned an incomplete name-status record");
    }
    changedPaths.push(changedPath.replaceAll("\\", "/"));
    index += 1;
  }
}

function isGuaranteedNonExecutable(changedPath) {
  return (
    changedPath.toLowerCase().endsWith(".md") ||
    changedPath.startsWith(".github/ISSUE_TEMPLATE/")
  );
}

const benchmarkRequired =
  changedPaths.length === 0 ||
  changedPaths.some((changedPath) => !isGuaranteedNonExecutable(changedPath));

console.log(benchmarkRequired ? "true" : "false");
