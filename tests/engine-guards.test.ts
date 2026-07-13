import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const rootDir = process.cwd();

test("unknown-array guard rejects multiline arrays and ignores comments/literals", () => {
  const fixture = createFixture(`
    // ReadonlyArray<unknown> in a comment
    const text = "unknown[]";
    type Bad = ReadonlyArray<
      unknown
    >;
  `);
  const result = run("check-engine-unknown-arrays.mjs", fixture);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/engine\/fixture\.ts:4/);
  assert.doesNotMatch(result.stderr, /:2|:3/);
});

test("unknown-array guard rejects new matches despite stale exceptions", () => {
  const fixture = createFixture("type Bad = unknown[];\n");
  const result = run("check-engine-unknown-arrays.mjs", fixture);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/engine\/fixture\.ts:1:12/);
  assert.match(result.stderr, /untracked unknown-array pattern/);
});

test("unknown-array guard rejects a same-position exception substitution", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "engine-guard-"));
  const sourceDir = path.join(fixtureRoot, "src", "engine");
  mkdirSync(sourceDir, { recursive: true });
  const source = `${"\n".repeat(164)}interface Input {\n  otherData?: unknown[];\n}\n`;
  writeFileSync(path.join(sourceDir, "data.ts"), source, "utf8");
  const result = run("check-engine-unknown-arrays.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /stale unknown-array exception/);
  assert.match(result.stderr, /untracked unknown-array pattern/);
});

test("unknown-array guard accepts a clean fixture", () => {
  const result = run(
    "check-engine-unknown-arrays.mjs",
    createFixture("type Good = string[];\n")
  );
  assert.equal(result.status, 0);
});

test("typed-access guard rejects multiline, angle-bracket, and aliased assertions", () => {
  const fixture = createFixture(`
    type Loose = Record<string, unknown>;
    const a = value as Record<
      string,
      unknown
    >;
    const b = value as Loose;
    const c = <Record<string, unknown>>value;
  `);
  const result = run("check-engine-typed-access.mjs", fixture);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.match(/fixture\.ts:\d+:15/gu)?.length, 3);
});

test("typed-access guard allows the raw data boundary", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "engine-guard-"));
  const sourceDir = path.join(fixtureRoot, "src", "engine");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(
    path.join(sourceDir, "data.ts"),
    "const a = value as Record<string, unknown>;\n",
    "utf8"
  );
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 0);
});

function createFixture(source: string): string {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "engine-guard-"));
  const sourceDir = path.join(fixtureRoot, "src", "engine");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(path.join(sourceDir, "fixture.ts"), source, "utf8");
  return fixtureRoot;
}

function run(script: string, fixtureRoot: string) {
  return spawnSync(
    process.execPath,
    [path.join(rootDir, "scripts", script), fixtureRoot],
    { encoding: "utf8" }
  );
}
