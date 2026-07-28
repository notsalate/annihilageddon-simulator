import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertTestSuiteRegistryComplete,
  collectCompiledTestSuites,
} from "./test-suite-registry.js";

interface PackageJson {
  scripts: Record<string, string | undefined>;
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

test("collects compiled test suites from nested directories", (context) => {
  const testsRoot = mkdtempSync(path.join(os.tmpdir(), "test-suite-registry-"));
  context.after(() => rmSync(testsRoot, { force: true, recursive: true }));

  mkdirSync(path.join(testsRoot, "nested", "deeper"), { recursive: true });
  writeFileSync(path.join(testsRoot, "root.test.js"), "");
  writeFileSync(path.join(testsRoot, "nested", "helper.js"), "");
  writeFileSync(
    path.join(testsRoot, "nested", "deeper", "child.test.js"),
    ""
  );

  assert.deepEqual(collectCompiledTestSuites(testsRoot), [
    "nested/deeper/child.test.js",
    "root.test.js",
  ]);
});

test("rejects a missing test suite registration", () => {
  assert.throws(
    () =>
      assertTestSuiteRegistryComplete(
        ["registered.test.js"],
        ["missing.test.js", "registered.test.js"]
      ),
    /Missing registrations:\n {2}- missing\.test\.js/u
  );
});

test("rejects a duplicate test suite registration", () => {
  assert.throws(
    () =>
      assertTestSuiteRegistryComplete(
        ["duplicate.test.js", "duplicate.test.js"],
        ["duplicate.test.js"]
      ),
    /Duplicate registrations:\n {2}- duplicate\.test\.js \(2 entries\)/u
  );
});

test("rejects a registration without a compiled test file", () => {
  assert.throws(
    () =>
      assertTestSuiteRegistryComplete(
        ["present.test.js", "stale.test.js"],
        ["present.test.js"]
      ),
    /Registrations without compiled files:\n {2}- stale\.test\.js/u
  );
});

test("clean-dist removes stale compiled tests", (context) => {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), "clean-dist-"));
  context.after(() => rmSync(projectRoot, { force: true, recursive: true }));

  const staleTest = path.join(
    projectRoot,
    "dist",
    "tests",
    "obsolete.test.js"
  );
  mkdirSync(path.dirname(staleTest), { recursive: true });
  writeFileSync(staleTest, "");

  const result = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "scripts", "clean-dist.mjs")],
    { cwd: projectRoot, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(path.join(projectRoot, "dist")), false);
});

test("npm test cleans dist before compiling", () => {
  const packageJson = JSON.parse(
    readFileSync(path.join(repositoryRoot, "package.json"), "utf8")
  ) as PackageJson;

  assert.equal(packageJson.scripts["clean:dist"], "node scripts/clean-dist.mjs");
  assert.equal(
    packageJson.scripts["test"],
    "npm run clean:dist && npm run build -- --pretty false && node dist/tests/run-tests.js"
  );
});
