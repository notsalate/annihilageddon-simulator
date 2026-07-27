import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertTestSuiteRegistryComplete,
  collectCompiledTestSuites,
} from "./test-suite-registry.js";

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
    /Missing registrations:\n  - missing\.test\.js/u
  );
});

test("rejects a duplicate test suite registration", () => {
  assert.throws(
    () =>
      assertTestSuiteRegistryComplete(
        ["duplicate.test.js", "duplicate.test.js"],
        ["duplicate.test.js"]
      ),
    /Duplicate registrations:\n  - duplicate\.test\.js \(2 entries\)/u
  );
});

test("rejects a registration without a compiled test file", () => {
  assert.throws(
    () =>
      assertTestSuiteRegistryComplete(
        ["present.test.js", "stale.test.js"],
        ["present.test.js"]
      ),
    /Registrations without compiled files:\n  - stale\.test\.js/u
  );
});
