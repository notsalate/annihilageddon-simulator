import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testsDirectory, "..", "..");
const unresolvedFixture = path.join(
  repositoryRoot,
  "tests",
  "fixtures",
  "completion-reconciliation-unresolved.json"
);
const closingClaimFixture = path.join(
  repositoryRoot,
  "tests",
  "fixtures",
  "completion-reconciliation-closing-claim.json"
);

test("reconciliation rejects a clean overall verdict when an active requirement is unresolved", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(repositoryRoot, "scripts", "check-completion-reconciliation.mjs"),
      unresolvedFixture,
    ],
    { encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /REQ-176-AC01: active requirement remains unresolved \(FIND-009\)/
  );
});

test("reconciliation rejects every closing verdict when an active requirement is unresolved", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(repositoryRoot, "scripts", "check-completion-reconciliation.mjs"),
      closingClaimFixture,
    ],
    { encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /REQ-176-AC01: active requirement remains unresolved \(FIND-009\)/
  );
});
