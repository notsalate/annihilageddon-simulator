import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
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
const invalidCodeShaFixture = path.join(
  repositoryRoot,
  "tests",
  "fixtures",
  "completion-reconciliation-invalid-code-sha.json"
);
const invalidFixCommitFixture = path.join(
  repositoryRoot,
  "tests",
  "fixtures",
  "completion-reconciliation-invalid-fix-commit.json"
);
const invalidTestReferenceFixture = path.join(
  repositoryRoot,
  "tests",
  "fixtures",
  "completion-reconciliation-invalid-test-reference.json"
);
const testAfterCodeShaFixture = path.join(
  repositoryRoot,
  "tests",
  "fixtures",
  "completion-reconciliation-test-after-code-sha.json"
);
const missingActiveRequirementsFixture = path.join(
  repositoryRoot,
  "tests",
  "fixtures",
  "completion-reconciliation-missing-active-requirements.json"
);
const evidenceManifest = path.join(
  repositoryRoot,
  "tests",
  "fixtures",
  "pr137-round4-completion-reconciliation.json"
);

test("reconciliation rejects a clean overall verdict when an active requirement is unresolved", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(
        repositoryRoot,
        "scripts",
        "check-completion-reconciliation.mjs"
      ),
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
      path.join(
        repositoryRoot,
        "scripts",
        "check-completion-reconciliation.mjs"
      ),
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

test("reconciliation rejects a code SHA that is not a commit", () => {
  const result = runReconciliation(invalidCodeShaFixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /manifest.codeSha must resolve to a commit/);
});

test("reconciliation rejects a fix commit outside the code SHA ancestry", () => {
  const result = runReconciliation(invalidFixCommitFixture);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /REQ-176-AC01: fix commit bf5fefd must be an ancestor of manifest.codeSha/
  );
});

test("reconciliation rejects an unregistered test reference", () => {
  const result = runReconciliation(invalidTestReferenceFixture);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /REQ-176-AC01: test reference tests\/does-not-exist\.test\.ts must exist and be registered/
  );
});

test("reconciliation checks test evidence in the code SHA tree", () => {
  const result = runReconciliation(testAfterCodeShaFixture);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /REQ-R3-09-AC03: test reference tests\/completion-reconciliation\.test\.ts must exist and be registered at manifest\.codeSha/
  );
});

test("reconciliation requires every frozen active requirement", () => {
  const result = runReconciliation(missingActiveRequirementsFixture);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /manifest\.requirements must contain exactly the frozen active requirements: REQ-176-AC01, REQ-R3-09-AC02, REQ-R3-09-AC03/
  );
});

test("reconciliation ignores test names that appear only in registry comments", (context) => {
  const result = runRegistryFixture(
    context,
    "comment-only.test.ts",
    'const testSuites: string[] = [];\n// "comment-only.test.js"\n'
  );

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /test reference tests\/comment-only\.test\.ts must exist and be registered at manifest\.codeSha/
  );
});

test("reconciliation rejects a syntactically invalid test registry", (context) => {
  const result = runRegistryFixture(
    context,
    "syntax-error.test.ts",
    'const testSuites = ["syntax-error.test.js"];\nconst broken = ;\n'
  );

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /test reference tests\/syntax-error\.test\.ts must exist and be registered at manifest\.codeSha/
  );
});

test("current reconciliation manifest passes Git and test-reference checks", () => {
  const result = runReconciliation(evidenceManifest);

  assert.equal(result.status, 0, result.stderr);
});

function runReconciliation(
  fixturePath: string,
  workingDirectory = repositoryRoot
) {
  return spawnSync(
    process.execPath,
    [
      path.join(
        repositoryRoot,
        "scripts",
        "check-completion-reconciliation.mjs"
      ),
      fixturePath,
    ],
    { cwd: workingDirectory, encoding: "utf8" }
  );
}

function runFixtureGit(repository: string, args: readonly string[]) {
  const result = spawnSync("git", args, {
    cwd: repository,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function runRegistryFixture(
  context: test.TestContext,
  testFileName: string,
  registrySource: string
) {
  const fixtureRepository = mkdtempSync(
    path.join(os.tmpdir(), "completion-registry-")
  );
  context.after(() =>
    rmSync(fixtureRepository, { force: true, recursive: true })
  );
  mkdirSync(path.join(fixtureRepository, "tests"), { recursive: true });
  writeFileSync(
    path.join(fixtureRepository, "tests", testFileName),
    "export {};\n"
  );
  writeFileSync(
    path.join(fixtureRepository, "tests", "run-tests.ts"),
    registrySource
  );
  runFixtureGit(fixtureRepository, ["init"]);
  runFixtureGit(fixtureRepository, [
    "config",
    "user.email",
    "fixture@example.invalid",
  ]);
  runFixtureGit(fixtureRepository, ["config", "user.name", "Fixture"]);
  runFixtureGit(fixtureRepository, ["add", "tests"]);
  runFixtureGit(fixtureRepository, ["commit", "-m", "fixture"]);
  const codeSha = runFixtureGit(fixtureRepository, [
    "rev-parse",
    "HEAD",
  ]).stdout.trim();
  const manifestPath = path.join(fixtureRepository, "manifest.json");
  const requirements = ["REQ-176-AC01", "REQ-R3-09-AC02", "REQ-R3-09-AC03"].map(
    (id) => ({
      id,
      active: true,
      status: "unresolved",
      findings: ["INVALID-REGISTRY"],
      fixCommits: [],
      tests: [`tests/${testFileName}`],
      codeSha,
    })
  );
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        rangeStart: codeSha,
        codeSha,
        overallVerdict: "есть открытые требования",
        requirements,
      },
      null,
      2
    )}\n`
  );

  return runReconciliation(manifestPath, fixtureRepository);
}
