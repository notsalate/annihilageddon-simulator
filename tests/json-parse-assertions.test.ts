import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { runJsonParseAssertionsGuard } from "./helpers/guard-runners.js";

const rootDir = process.cwd();
const guardPath = path.join(
  rootDir,
  "scripts",
  "check-json-parse-assertions.mjs"
);

test("JSON parse assertion guard allows an unknown decoder input", () => {
  const fixtureRoot = createFixtureRoot(
    "const raw = JSON.parse(source) as unknown;\n"
  );
  const result = runGuard(fixtureRoot);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /JSON parse assertion guard: ok/);
});

test("JSON parse assertion guard rejects a domain type assertion", () => {
  const fixtureRoot = createFixtureRoot(
    "interface RuntimeData { packId: string; }\nconst data = JSON.parse(source) as RuntimeData;\n"
  );
  const result = runGuard(fixtureRoot);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/fixture\.ts:2/);
  assert.match(result.stderr, /RuntimeData/);
});

test("JSON parse assertion guard rejects an assertion after unknown", () => {
  const fixtureRoot = createFixtureRoot(
    "interface RuntimeData { packId: string; }\nconst data = JSON.parse(source) as unknown as RuntimeData;\n"
  );
  const result = runGuard(fixtureRoot);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /RuntimeData/);
});

function createFixtureRoot(sourceText: string): string {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "json-parse-guard-"));
  const sourceDir = path.join(fixtureRoot, "src");
  mkdirSync(sourceDir);
  writeFileSync(path.join(sourceDir, "fixture.ts"), sourceText, "utf8");
  return fixtureRoot;
}

function runGuard(fixtureRoot: string) {
  return runJsonParseAssertionsGuard(fixtureRoot);
}

test("JSON parse assertion guard CLI preserves successful output", () => {
  const fixtureRoot = createFixtureRoot(
    "const raw = JSON.parse(source) as unknown;\n"
  );
  const result = spawnSync(process.execPath, [guardPath, fixtureRoot], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /JSON parse assertion guard: ok/);
});
