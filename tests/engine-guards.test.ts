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

test("typed-access guard rejects aliases declared inside their function scope", () => {
  const fixture = createFixture(`
    function read(value: unknown) {
      type Loose = Record<string, unknown>;
      const result: Loose = value;
      return result;
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixture);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.match(/fixture\.ts:\d+:/gu)?.length, 1);
});

test("typed-access guard resolves same-named aliases in their own function scopes", () => {
  const fixture = createFixture(`
    function raw(value: unknown) {
      type Loose = Record<string, unknown>;
      const result: Loose = value;
      return result;
    }
    function safe() {
      type Loose = Record<string, number>;
      const result: Loose = {};
      return result;
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixture);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.match(/fixture\.ts:\d+:/gu)?.length, 1);
});

test("typed-access guard rejects qualified namespace aliases", () => {
  const fixture = createFixture(`
    namespace Raw {
      export type Loose = Record<string, unknown>;
    }
    const result: Raw.Loose = value;
  `);
  const result = run("check-engine-typed-access.mjs", fixture);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.match(/fixture\.ts:\d+:/gu)?.length, 1);
});

test("typed-access guard rejects record annotations and predicates", () => {
  const fixture = createFixture(`
    const value: Record<string, unknown> = {};
    function read(input: Record<string, unknown>): Record<string, unknown> {
      return input;
    }
    function isLoose(input: unknown): input is Record<string, unknown> {
      return true;
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixture);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.match(/fixture\.ts:\d+:/gu)?.length, 4);
});

test("typed-access guard rejects composite and indexed record access", () => {
  const fixture = createFixture(`
    const asserted = value as (Record<string, unknown> & {});
    type Loose = Record<string, unknown> & { tag?: string };
    const raw: Loose = value;
    const indexed: { [key: string]: unknown } = value;
    type Indexed = { [key: string]: unknown };
    const indexedAlias: Indexed = value;
  `);
  const result = run("check-engine-typed-access.mjs", fixture);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.match(/fixture\.ts:\d+:/gu)?.length, 4);
});

test("typed-access guard permits typed string maps", () => {
  const fixture = createFixture(`
    const counts: Record<string, number> = {};
    const labels: { [key: string]: string } = {};
  `);
  const result = run("check-engine-typed-access.mjs", fixture);
  assert.equal(result.status, 0);
});

test("typed-access guard rejects unions and aliases that retain unknown records", () => {
  const fixture = createFixture(`
    type Loose = Record<string, unknown>;
    type Union = Loose | null;
    type Composite = (Union & {});
    const a: Union = value;
    const b: Composite = value;
  `);
  const result = run("check-engine-typed-access.mjs", fixture);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.match(/fixture\.ts:\d+:/gu)?.length, 2);
});

test("typed-access guard rejects approved utility wrappers around unknown records", () => {
  const fixture = createFixture(`
    type Loose = Record<string, unknown>;
    const a: Readonly<Loose> = value;
    const b: Partial<Readonly<Record<string, unknown>>> = value;
    const c: Required<Partial<Loose>> = value;
    const d: Readonly<{ [key: string]: unknown }> = value;
    const safe: Readonly<Record<string, number>> = {};
  `);
  const result = run("check-engine-typed-access.mjs", fixture);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.match(/fixture\.ts:\d+:/gu)?.length, 4);
});

test("typed-access guard rejects fixture-only raw access outside the production allowlist", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "engine-guard-"));
  const sourceDir = path.join(fixtureRoot, "src", "engine");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(
    path.join(sourceDir, "data.ts"),
    "const a = value as Record<string, unknown>;\n",
    "utf8"
  );
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /untracked Record<string, unknown> access/);
});

test("typed-access guard does not allow new record access in a raw-boundary file", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "engine-guard-"));
  const sourceDir = path.join(fixtureRoot, "src", "engine");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(
    path.join(sourceDir, "effect-runtime-registry.ts"),
    "const value: Record<string, unknown> = {};\n",
    "utf8"
  );
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /untracked Record<string, unknown> access/);
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
