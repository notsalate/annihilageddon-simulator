import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [runId] = process.argv.slice(2);

if (runId === "--help" || runId === "-h") {
  console.log("Usage: npm run benchmark:artifacts:download -- <run-id>");
  process.exit(0);
}

if (!runId || !/^\d+$/.test(runId)) {
  console.error("Expected a numeric GitHub Actions run ID.");
  process.exit(1);
}

const destination = path.join(
  process.cwd(),
  ".scratch",
  "tmp",
  "performance-artifacts",
  runId
);

if (existsSync(destination)) {
  console.error(`Artifacts already exist: ${destination}`);
  process.exit(1);
}

mkdirSync(destination, { recursive: true });

const result = spawnSync(
  "gh",
  ["run", "download", runId, "--dir", destination],
  { stdio: "inherit" }
);

if (result.error) {
  console.error(`Failed to start gh: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Artifacts downloaded to ${destination}`);
