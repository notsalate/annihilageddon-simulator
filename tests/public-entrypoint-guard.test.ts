import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type * as PublicEntrypointGuard from "../scripts/lib/check-protected-public-entrypoints.mjs";
import { runEngineTypedAccessGuard } from "./helpers/guard-runners.js";

const productionCliEntrypoints = [
  "src/cli/generate-drafts.ts",
  "src/cli/report-card-runtime-clusters.ts",
  "src/cli/report-import-completeness.ts",
  "src/cli/report-runtime-coverage.ts",
  "src/cli/run-best-move-analysis.ts",
  "src/cli/run-benchmark.ts",
  "src/cli/run-mass-simulation.ts",
  "src/cli/run-simulation-menu.ts",
  "src/cli/run-single-game.ts",
  "src/cli/validate-drafts.ts",
] as const;

const guardModule: unknown = await import(
  new URL(
    "../../scripts/lib/check-protected-public-entrypoints.mjs",
    import.meta.url
  ).href
);
if (!isPublicEntrypointGuardModule(guardModule)) {
  throw new Error("public entrypoint guard module has an invalid interface");
}
const { checkProtectedPublicEntrypoints } = guardModule;

function isPublicEntrypointGuardModule(
  value: unknown
): value is typeof PublicEntrypointGuard {
  return (
    typeof value === "object" &&
    value !== null &&
    "checkProtectedPublicEntrypoints" in value &&
    typeof value.checkProtectedPublicEntrypoints === "function"
  );
}

function createPublicEntrypointFixture(
  files: Record<string, string>,
  cliEntrypoints: readonly string[] = [],
  cliPathSeparator = "/",
  cliPathPrefix = ""
): string {
  const fixtureRoot = mkdtempSync(
    path.join(tmpdir(), "public-entrypoint-guard-")
  );
  const allCliEntrypoints = [...productionCliEntrypoints, ...cliEntrypoints];
  writeFixtureFiles(fixtureRoot, {
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        strict: true,
        skipLibCheck: true,
      },
      include: ["src/**/*.ts"],
    }),
    "package.json": JSON.stringify({
      private: true,
      type: "module",
      scripts: Object.fromEntries(
        allCliEntrypoints.map((entrypoint, index) => [
          `fixture:${index}`,
          `node ${cliPathPrefix}dist/${entrypoint
            .replace(/\.ts$/u, ".js")
            .replaceAll("/", cliPathSeparator)}`,
        ])
      ),
    }),
    "src/engine/runtime-effect-decoder.ts": `
      export type DecodeResult = { ok: true };
      export interface RuntimeEffectDecoder { readonly effectId: string; }
      export function decodeRuntimeEffectForId() { return {}; }
      export function decodeRuntimeEffect() { return {}; }
      export function decodeTimedRuntimeEffect() { return {}; }
    `,
    "src/engine/data.ts": `
      export const loadCurrentRuntimeDataPack = () => ({});
      export const decodeCurrentRuntimeDataPack = () => ({});
      export const loadV0DataPack = () => ({});
      export const validateExecutableDataPack = () => ({});
      export const isIncompleteFullOnlyDataPack = () => false;
    `,
    "src/engine/runtime-data-intake.ts": `
      export const intakeRuntimeData = () => ({});
    `,
    "src/engine/effect-runtime-registry.ts": `
      type EffectRuntimeSupportedSourceKinds = readonly string[];
      function sourceKinds(): EffectRuntimeSupportedSourceKinds { return []; }
      export const executeRuntimeEffect = () => undefined;
    `,
    "src/index.ts": "export const safe = true;\n",
    ...Object.fromEntries(
      productionCliEntrypoints.map((entrypoint) => [
        entrypoint,
        "export const safe = true;\n",
      ])
    ),
    ...files,
  });
  return fixtureRoot;
}

function runTypedAccessGuard(fixtureRoot: string) {
  return runEngineTypedAccessGuard(fixtureRoot);
}

function writeFixtureFiles(
  fixtureRoot: string,
  files: Record<string, string>
): void {
  for (const [fileName, sourceText] of Object.entries(files)) {
    const targetPath = path.join(fixtureRoot, fileName);
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, sourceText, "utf8");
  }
}

function analyzeFixture(fixtureRoot: string) {
  return analyzeFixtureWithPolicy(fixtureRoot);
}

function analyzeFixtureWithPolicy(
  fixtureRoot: string,
  approvedValueImporters = new Map<string, ReadonlySet<string>>(),
  trustedAdapterValueExports = new Map<string, ReadonlySet<string>>(),
  entrypoints = ["src/index.ts"]
) {
  return checkProtectedPublicEntrypoints({
    rootDir: fixtureRoot,
    tsconfigPath: path.join(fixtureRoot, "tsconfig.json"),
    entrypoints,
    protectedModules: new Map([["src/engine/runtime-effect-decoder.ts", "*"]]),
    approvedValueImporters,
    trustedAdapterValueExports,
  });
}

function assertProtectedExport(
  violations: ReturnType<typeof analyzeFixture>,
  exportedName: string,
  originName = "decodeRuntimeEffect"
): void {
  const violation = violations.find(
    (candidate) => candidate.kind === "public-export"
  );
  assert.ok(violation);
  assert.equal(violation.file, "src/index.ts");
  assert.equal(violation.exportedName, exportedName);
  assert.equal(violation.originFile, "src/engine/runtime-effect-decoder.ts");
  assert.equal(violation.originName, originName);
}

test("public guard rejects a direct aliased protected export", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export function decodeRuntimeEffect() { return {}; }\n",
    "src/index.ts": `
      export {
        decodeRuntimeEffect as unsafeDecoder
      } from "./engine/runtime-effect-decoder.js";
    `,
  });

  assertProtectedExport(analyzeFixture(fixture), "unsafeDecoder");
});

test("public guard rejects a direct named protected export", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export function decodeRuntimeEffect() { return {}; }\n",
    "src/index.ts":
      'export { decodeRuntimeEffect } from "./engine/runtime-effect-decoder.js";\n',
  });

  assertProtectedExport(analyzeFixture(fixture), "decodeRuntimeEffect");
});

test("public guard rejects a transitive named protected re-export", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export function decodeRuntimeEffect() { return {}; }\n",
    "src/barrel.ts":
      'export { decodeRuntimeEffect as decoder } from "./engine/runtime-effect-decoder.js";\n',
    "src/index.ts": 'export { decoder as unsafeDecoder } from "./barrel.js";\n',
  });

  assertProtectedExport(analyzeFixture(fixture), "unsafeDecoder");
});

test("public guard rejects an export-star protected export", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export function decodeRuntimeEffect() { return {}; }\n",
    "src/index.ts": 'export * from "./engine/runtime-effect-decoder.js";\n',
  });

  assertProtectedExport(analyzeFixture(fixture), "decodeRuntimeEffect");
});

test("public guard rejects a transitive export-star through a barrel", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export function decodeRuntimeEffect() { return {}; }\n",
    "src/public-decoder.ts":
      'export * from "./engine/runtime-effect-decoder.js";\n',
    "src/index.ts": 'export * from "./public-decoder.js";\n',
  });

  assertProtectedExport(analyzeFixture(fixture), "decodeRuntimeEffect");
});

test("public guard rejects a default protected export", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export default function decodeRuntimeEffect() { return {}; }\n",
    "src/index.ts":
      'export { default } from "./engine/runtime-effect-decoder.js";\n',
  });

  assertProtectedExport(analyzeFixture(fixture), "default");
});

test("public guard expands an export-as-namespace protected export", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export function decodeRuntimeEffect() { return {}; }\n",
    "src/index.ts":
      'export * as decoder from "./engine/runtime-effect-decoder.js";\n',
  });

  assertProtectedExport(analyzeFixture(fixture), "decoder");
});

test("public guard expands a transitive export-as-namespace through a barrel", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export function decodeRuntimeEffect() { return {}; }\n",
    "src/public-decoder.ts":
      'export * as decoder from "./engine/runtime-effect-decoder.js";\n',
    "src/index.ts": 'export { decoder } from "./public-decoder.js";\n',
  });

  assertProtectedExport(analyzeFixture(fixture), "decoder");
});

test("public guard resolves a namespace import static property", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export function decodeRuntimeEffect() { return {}; }\n",
    "src/index.ts": `
      import * as decoder from "./engine/runtime-effect-decoder.js";
      export const unsafeDecoder = decoder.decodeRuntimeEffect;
    `,
  });

  const violations = analyzeFixture(fixture);
  assert.equal(
    violations.filter((violation) => violation.kind === "import-edge").length,
    1
  );
  assertProtectedExport(violations, "unsafeDecoder");
});

test("public guard resolves a static string namespace property", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export function decodeRuntimeEffect() { return {}; }\n",
    "src/index.ts": `
      import * as decoder from "./engine/runtime-effect-decoder.js";
      export const unsafeDecoder = decoder["decodeRuntimeEffect"];
    `,
  });

  assertProtectedExport(analyzeFixture(fixture), "unsafeDecoder");
});

test("public guard follows a namespace alias to a root default export", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export function decodeRuntimeEffect() { return {}; }\n",
    "src/index.ts": `
      import * as decoder from "./engine/runtime-effect-decoder.js";
      const publicDecoder = decoder;
      export default publicDecoder;
    `,
  });

  assertProtectedExport(analyzeFixture(fixture), "default");
});

test("public guard follows a top-level decoder alias through a public module", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export function decodeRuntimeEffect() { return {}; }\n",
    "src/public-decoder.ts": `
      import { decodeRuntimeEffect as raw } from "./engine/runtime-effect-decoder.js";
      const api = raw;
      export { api };
    `,
    "src/index.ts": 'export { api } from "./public-decoder.js";\n',
  });

  assertProtectedExport(analyzeFixture(fixture), "api");
});

test("public guard stops at a two-barrel cycle", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export function decodeRuntimeEffect() { return {}; }\n",
    "src/first.ts": `
      export { decodeRuntimeEffect } from "./engine/runtime-effect-decoder.js";
      export * from "./second.js";
    `,
    "src/second.ts": 'export * from "./first.js";\n',
    "src/index.ts": 'export * from "./first.js";\n',
  });

  assertProtectedExport(analyzeFixture(fixture), "decodeRuntimeEffect");
});

test("public guard permits an independent same-named local value", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export function decodeRuntimeEffect() { return {}; }\n",
    "src/index.ts":
      "export function decodeRuntimeEffect() { return { safe: true }; }\n",
  });

  assert.deepEqual(analyzeFixture(fixture), []);
});

test("public guard permits a type-only protected re-export", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export interface DecodeResult { effectId: string; }\n",
    "src/index.ts":
      'export type { DecodeResult } from "./engine/runtime-effect-decoder.js";\n',
  });

  assert.deepEqual(analyzeFixture(fixture), []);
});

const typeOnlyFixtures = [
  {
    name: "type-only import and export through a public module",
    files: {
      "src/engine/runtime-effect-decoder.ts":
        "export interface DecodeResult { effectId: string; }\n",
      "src/public-types.ts": `
        import type { DecodeResult } from "./engine/runtime-effect-decoder.js";
        export type { DecodeResult };
      `,
      "src/index.ts":
        'export type { DecodeResult } from "./public-types.js";\n',
    },
  },
  {
    name: "a type-only re-export cycle",
    files: {
      "src/engine/runtime-effect-decoder.ts":
        "export interface DecodeResult { effectId: string; }\n",
      "src/public-a.ts": `
        export type { DecodeResult } from "./engine/runtime-effect-decoder.js";
        export type { DecodeResult as FromB } from "./public-b.js";
      `,
      "src/public-b.ts": 'export type { DecodeResult } from "./public-a.js";\n',
      "src/index.ts": 'export type { DecodeResult } from "./public-b.js";\n',
    },
  },
  {
    name: "a type-only export-star",
    files: {
      "src/engine/runtime-effect-decoder.ts":
        "export interface DecodeResult { effectId: string; }\n",
      "src/index.ts":
        'export type * from "./engine/runtime-effect-decoder.js";\n',
    },
  },
  {
    name: "an inline type-only named export",
    files: {
      "src/engine/runtime-effect-decoder.ts":
        "export interface DecodeResult { effectId: string; }\n",
      "src/index.ts":
        'export { type DecodeResult } from "./engine/runtime-effect-decoder.js";\n',
    },
  },
] as const;

for (const { name, files } of typeOnlyFixtures) {
  test(`public guard permits ${name}`, () => {
    assert.deepEqual(analyzeFixture(createPublicEntrypointFixture(files)), []);
  });
}

test("public guard reports a missing entrypoint as a configuration violation", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export function decodeRuntimeEffect() { return {}; }\n",
  });

  const violations = analyzeFixtureWithPolicy(fixture, new Map(), new Map(), [
    "src/missing.ts",
  ]);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, "configuration");
  assert.equal(violations[0]?.file, "src/missing.ts");
});

test("public guard applies a trusted adapter allowlist to its re-export origin", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export function decodeRuntimeEffect() { return {}; }\n",
    "src/engine/data.ts": `
      import { decodeRuntimeEffect as raw } from "./runtime-effect-decoder.js";
      export const allowedDecoder = raw;
      export const unsafeWrapper = () => raw();
    `,
    "src/index.ts": `
      export { allowedDecoder, unsafeWrapper } from "./engine/data.js";
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map([
      [
        "src/engine/data.ts",
        new Set(["src/engine/runtime-effect-decoder.ts#decodeRuntimeEffect"]),
      ],
    ]),
    new Map([["src/engine/data.ts", new Set(["allowedDecoder"])]])
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, "public-export");
  assert.equal(violations[0]?.exportedName, "unsafeWrapper");
  assert.equal(violations[0]?.originFile, "src/engine/data.ts");
  assert.equal(violations[0]?.originName, "unsafeWrapper");
});

test("public guard rejects an unlisted adapter through a local export alias", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export const allowedAdapter = () => ({});
      export const unlistedAdapter = () => ({});
    `,
    "src/index.ts": `
      import { unlistedAdapter } from "./engine/data.js";
      const alias = unlistedAdapter;
      export { alias };
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map(),
    new Map([["src/engine/data.ts", new Set(["allowedAdapter"])]])
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, "public-export");
  assert.equal(violations[0]?.file, "src/index.ts");
  assert.equal(violations[0]?.exportedName, "alias");
  assert.equal(violations[0]?.originFile, "src/engine/data.ts");
  assert.equal(violations[0]?.originName, "unlistedAdapter");
});

test("public guard rejects an unlisted adapter through a destructuring alias", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export const allowedAdapter = () => ({});
      export const unlistedAdapter = () => ({});
    `,
    "src/index.ts": `
      import * as adapters from "./engine/data.js";
      const { unlistedAdapter: alias } = adapters;
      export { alias };
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map(),
    new Map([["src/engine/data.ts", new Set(["allowedAdapter"])]])
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, "public-export");
  assert.equal(violations[0]?.file, "src/index.ts");
  assert.equal(violations[0]?.exportedName, "alias");
  assert.equal(violations[0]?.originFile, "src/engine/data.ts");
  assert.equal(violations[0]?.originName, "unlistedAdapter");
});

test("public guard rejects an unlisted adapter through a direct function wrapper", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export const allowedAdapter = () => ({});
      export const unlistedAdapter = () => ({});
    `,
    "src/index.ts": `
      import { unlistedAdapter } from "./engine/data.js";
      function wrapper() {
        return unlistedAdapter();
      }
      export { wrapper };
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map(),
    new Map([["src/engine/data.ts", new Set(["allowedAdapter"])]])
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, "public-export");
  assert.equal(violations[0]?.file, "src/index.ts");
  assert.equal(violations[0]?.exportedName, "wrapper");
  assert.equal(violations[0]?.originFile, "src/engine/data.ts");
  assert.equal(violations[0]?.originName, "unlistedAdapter");
});

test("public guard rejects an unlisted adapter through a wrapper-local const alias", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export const allowedAdapter = () => ({});
      export const unlistedAdapter = () => ({});
    `,
    "src/index.ts": `
      import { unlistedAdapter } from "./engine/data.js";
      function wrapper() {
        const local = unlistedAdapter;
        return local();
      }
      export { wrapper };
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map(),
    new Map([["src/engine/data.ts", new Set(["allowedAdapter"])]])
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, "public-export");
  assert.equal(violations[0]?.file, "src/index.ts");
  assert.equal(violations[0]?.exportedName, "wrapper");
  assert.equal(violations[0]?.originFile, "src/engine/data.ts");
  assert.equal(violations[0]?.originName, "unlistedAdapter");
});

test("public guard rejects an unlisted adapter returned by an expression-body wrapper", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export const allowedAdapter = () => ({});
      export const unlistedAdapter = () => ({});
    `,
    "src/index.ts": `
      import { unlistedAdapter } from "./engine/data.js";
      const wrapper = () => unlistedAdapter;
      export { wrapper };
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map(),
    new Map([["src/engine/data.ts", new Set(["allowedAdapter"])]])
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, "public-export");
  assert.equal(violations[0]?.file, "src/index.ts");
  assert.equal(violations[0]?.exportedName, "wrapper");
  assert.equal(violations[0]?.originFile, "src/engine/data.ts");
  assert.equal(violations[0]?.originName, "unlistedAdapter");
});

test("public guard rejects an unlisted adapter from an early conditional return", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export const allowedAdapter = () => ({});
      export const unlistedAdapter = () => ({});
    `,
    "src/index.ts": `
      import { unlistedAdapter } from "./engine/data.js";
      function wrapper(flag: boolean) {
        if (flag) {
          return unlistedAdapter();
        }
        return {};
      }
      export { wrapper };
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map(),
    new Map([["src/engine/data.ts", new Set(["allowedAdapter"])]])
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, "public-export");
  assert.equal(violations[0]?.file, "src/index.ts");
  assert.equal(violations[0]?.exportedName, "wrapper");
  assert.equal(violations[0]?.originFile, "src/engine/data.ts");
  assert.equal(violations[0]?.originName, "unlistedAdapter");
});

test("public guard rejects an unlisted adapter inside a returned object literal", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export const allowedAdapter = () => ({});
      export const unlistedAdapter = () => ({});
    `,
    "src/index.ts": `
      import { unlistedAdapter } from "./engine/data.js";
      const wrapper = () => ({ adapter: unlistedAdapter });
      export { wrapper };
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map(),
    new Map([["src/engine/data.ts", new Set(["allowedAdapter"])]])
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, "public-export");
  assert.equal(violations[0]?.file, "src/index.ts");
  assert.equal(violations[0]?.exportedName, "wrapper");
  assert.equal(violations[0]?.originFile, "src/engine/data.ts");
  assert.equal(violations[0]?.originName, "unlistedAdapter");
});

test("public guard ignores structural fields returned from a trusted module type", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export interface Result {
        reason: string;
      }
      export const allowedAdapter = () => ({});
    `,
    "src/index.ts": `
      import type { Result } from "./engine/data.js";
      declare const result: Result;
      const { reason } = result;
      const wrapper = () => ({ reason });
      export { wrapper };
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map(),
    new Map([["src/engine/data.ts", new Set(["allowedAdapter"])]])
  );

  assert.deepEqual(violations, []);
});

test("public guard rejects an unlisted adapter from a conditional expression", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export const allowedAdapter = () => ({});
      export const unlistedAdapter = () => ({});
    `,
    "src/index.ts": `
      import { unlistedAdapter } from "./engine/data.js";
      const wrapper = (flag: boolean) => flag ? unlistedAdapter() : {};
      export { wrapper };
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map(),
    new Map([["src/engine/data.ts", new Set(["allowedAdapter"])]])
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, "public-export");
  assert.equal(violations[0]?.file, "src/index.ts");
  assert.equal(violations[0]?.exportedName, "wrapper");
  assert.equal(violations[0]?.originFile, "src/engine/data.ts");
  assert.equal(violations[0]?.originName, "unlistedAdapter");
});

test("public guard rejects an unlisted adapter inside a returned array", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export const allowedAdapter = () => ({});
      export const unlistedAdapter = () => ({});
    `,
    "src/index.ts": `
      import { unlistedAdapter } from "./engine/data.js";
      const wrapper = () => [unlistedAdapter];
      export { wrapper };
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map(),
    new Map([["src/engine/data.ts", new Set(["allowedAdapter"])]])
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, "public-export");
  assert.equal(violations[0]?.file, "src/index.ts");
  assert.equal(violations[0]?.exportedName, "wrapper");
  assert.equal(violations[0]?.originFile, "src/engine/data.ts");
  assert.equal(violations[0]?.originName, "unlistedAdapter");
});

test("public guard resolves an unlisted adapter inside a static array spread", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export const allowedAdapter = () => ({});
      export const unlistedAdapter = () => ({});
    `,
    "src/index.ts": `
      import { unlistedAdapter } from "./engine/data.js";
      const wrapper = () => [...([unlistedAdapter])];
      export { wrapper };
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map(),
    new Map([["src/engine/data.ts", new Set(["allowedAdapter"])]])
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, "public-export");
  assert.equal(violations[0]?.file, "src/index.ts");
  assert.equal(violations[0]?.exportedName, "wrapper");
  assert.equal(violations[0]?.originFile, "src/engine/data.ts");
  assert.equal(violations[0]?.originName, "unlistedAdapter");
});

test("public guard fails closed for an array spread through an alias", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export const allowedAdapter = () => ({});
      export const unlistedAdapter = () => ({});
    `,
    "src/index.ts": `
      import { unlistedAdapter } from "./engine/data.js";
      const alias = [unlistedAdapter];
      const wrapper = () => [...alias];
      export { wrapper };
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map(),
    new Map([["src/engine/data.ts", new Set(["allowedAdapter"])]])
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, "public-export");
  assert.equal(violations[0]?.file, "src/index.ts");
  assert.equal(violations[0]?.exportedName, "wrapper");
  assert.equal(violations[0]?.originFile, "src/index.ts");
  assert.equal(violations[0]?.originName, "wrapper");
});

test("public guard permits an allowed adapter inside a static array spread", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export const allowedAdapter = () => ({});
    `,
    "src/index.ts": `
      import { allowedAdapter } from "./engine/data.js";
      const wrapper = () => [...([allowedAdapter])];
      export { wrapper };
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map(),
    new Map([["src/engine/data.ts", new Set(["allowedAdapter"])]])
  );

  assert.deepEqual(violations, []);
});

test("public guard permits literal values inside a static array spread", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export const allowedAdapter = () => ({});
    `,
    "src/index.ts": `
      const wrapper = () => [...(["safe"])];
      export { wrapper };
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map(),
    new Map([["src/engine/data.ts", new Set(["allowedAdapter"])]])
  );

  assert.deepEqual(violations, []);
});

test("public guard permits an unrelated runtime array spread", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export const allowedAdapter = () => ({});
    `,
    "src/index.ts": `
      declare const state: { values: string[] };
      const wrapper = () => [...state.values];
      export { wrapper };
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map(),
    new Map([["src/engine/data.ts", new Set(["allowedAdapter"])]])
  );

  assert.deepEqual(violations, []);
});

test("public guard permits allowed adapters in conditional and array expressions", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export const allowedAdapter = () => ({});
    `,
    "src/index.ts": `
      import { allowedAdapter } from "./engine/data.js";
      const conditionalWrapper = (flag: boolean) =>
        flag ? allowedAdapter() : {};
      const arrayWrapper = () => [allowedAdapter];
      export { conditionalWrapper, arrayWrapper };
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map(),
    new Map([["src/engine/data.ts", new Set(["allowedAdapter"])]])
  );

  assert.deepEqual(violations, []);
});

test("public guard ignores type-only properties in conditional and array expressions", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export interface Result {
        reason: string;
      }
      export const allowedAdapter = () => ({});
    `,
    "src/index.ts": `
      import type { Result } from "./engine/data.js";
      declare const result: Result;
      const conditionalWrapper = (flag: boolean) =>
        flag ? result.reason : "";
      const arrayWrapper = () => [result.reason];
      export { conditionalWrapper, arrayWrapper };
    `,
  });

  const violations = analyzeFixtureWithPolicy(
    fixture,
    new Map(),
    new Map([["src/engine/data.ts", new Set(["allowedAdapter"])]])
  );

  assert.deepEqual(violations, []);
});

test("public guard rejects an unregistered production CLI", () => {
  const fixture = createPublicEntrypointFixture(
    {
      "src/engine/runtime-effect-decoder.ts":
        "export function decodeRuntimeEffect() { return {}; }\n",
      "src/index.ts": "export const safe = true;\n",
      "src/cli/new-command.ts": "export const safe = true;\n",
    },
    ["src/cli/new-command.ts"]
  );
  const result = runTypedAccessGuard(fixture);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unregistered production CLI/);
  assert.match(result.stderr, /src\/cli\/new-command\.ts/);
});

test("public guard discovers a Windows CLI script like its POSIX form", () => {
  const files = {
    "src/engine/runtime-effect-decoder.ts":
      "export function decodeRuntimeEffect() { return {}; }\n",
    "src/index.ts": "export const safe = true;\n",
    "src/cli/new-command.ts": "export const safe = true;\n",
  };
  const cliEntrypoints = ["src/cli/new-command.ts"];
  const posixResult = runTypedAccessGuard(
    createPublicEntrypointFixture(files, cliEntrypoints)
  );
  const windowsResult = runTypedAccessGuard(
    createPublicEntrypointFixture(files, cliEntrypoints, "\\", ".\\")
  );

  assert.equal(posixResult.status, 1);
  assert.equal(windowsResult.status, 1);
  const posixDiagnostic = posixResult.stderr.match(
    /configuration violation: unregistered production CLI src\/cli\/new-command\.ts/u
  )?.[0];
  const windowsDiagnostic = windowsResult.stderr.match(
    /configuration violation: unregistered production CLI src\/cli\/new-command\.ts/u
  )?.[0];
  assert.ok(posixDiagnostic);
  assert.equal(windowsDiagnostic, posixDiagnostic);
});

test("public guard rejects a decoder value import outside approved adapters", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/unsafe.ts": `
      import { decodeRuntimeEffect } from "./runtime-effect-decoder.js";
      void decodeRuntimeEffect;
    `,
  });

  const result = runTypedAccessGuard(fixture);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /src\/engine\/unsafe\.ts imports protected value/
  );
});

test("public guard rejects a direct legacy Runtime Data import outside intake", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/unsafe.ts": `
      import { loadCurrentRuntimeDataPack } from "./data.js";
      void loadCurrentRuntimeDataPack;
    `,
  });

  const result = runTypedAccessGuard(fixture);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /src\/engine\/unsafe\.ts imports protected value/
  );
});

test("public guard permits a decoder type-only import outside approved adapters", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/unsafe.ts": `
      import type { DecodeResult } from "./runtime-effect-decoder.js";
      export type Safe = DecodeResult;
    `,
  });

  const result = runTypedAccessGuard(fixture);
  assert.equal(result.status, 0);
});

test("public guard permits an unexported decoder import in data.ts", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      import { decodeRuntimeEffect } from "./runtime-effect-decoder.js";
      void decodeRuntimeEffect;
      export const loadCurrentRuntimeDataPack = () => ({});
      export const decodeCurrentRuntimeDataPack = () => ({});
      export const loadV0DataPack = () => ({});
      export const validateExecutableDataPack = () => ({});
      export const isIncompleteFullOnlyDataPack = () => false;
    `,
  });

  const result = runTypedAccessGuard(fixture);
  assert.equal(result.status, 0);
});

test("public guard rejects a new data adapter value exported through the root", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/data.ts": `
      export const loadCurrentRuntimeDataPack = () => ({});
      export const decodeCurrentRuntimeDataPack = () => ({});
      export const loadV0DataPack = () => ({});
      export const validateExecutableDataPack = () => ({});
      export const isIncompleteFullOnlyDataPack = () => false;
      export const unsafeWrapper = () => ({});
    `,
    "src/index.ts": 'export { unsafeWrapper } from "./engine/data.js";\n',
  });

  const result = runTypedAccessGuard(fixture);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /src\/index\.ts publicly exports protected value src\/engine\/data\.ts#unsafeWrapper/
  );
});

test("public guard permits the Runtime Data Intake export through the root", () => {
  const fixture = createPublicEntrypointFixture({
    "src/index.ts": `
      export { intakeRuntimeData } from "./engine/runtime-data-intake.js";
    `,
  });

  const result = runTypedAccessGuard(fixture);
  assert.equal(result.status, 0);
});

test("public guard rejects Catalog bypasses through the root and production CLI", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/effect-runtime-registry.ts": `
      type EffectRuntimeSupportedSourceKinds = readonly string[];
      function sourceKinds(): EffectRuntimeSupportedSourceKinds { return []; }
      export const effectRuntimeCatalog = {};
      export const executeRuntimeEffect = () => undefined;
    `,
    "src/index.ts":
      'export { effectRuntimeCatalog } from "./engine/effect-runtime-registry.js";\n',
    "src/cli/run-single-game.ts": `
      import { effectRuntimeCatalog as catalog } from "../engine/effect-runtime-registry.js";
      export const unsafeAlias = catalog;
    `,
    "src/cli/run-mass-simulation.ts": `
      import * as registry from "../engine/effect-runtime-registry.js";
      export const unsafeProperty = registry.effectRuntimeCatalog;
    `,
    "src/cli/run-simulation-menu.ts": `
      import * as registry from "../engine/effect-runtime-registry.js";
      export const unsafeStringProperty = registry["effectRuntimeCatalog"];
    `,
  });

  const result = runTypedAccessGuard(fixture);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /src\/index\.ts publicly exports protected value src\/engine\/effect-runtime-registry\.ts#effectRuntimeCatalog/
  );
  assert.match(
    result.stderr,
    /src\/cli\/run-single-game\.ts publicly exports protected value/
  );
  assert.match(
    result.stderr,
    /src\/cli\/run-mass-simulation\.ts publicly exports protected value/
  );
  assert.match(
    result.stderr,
    /src\/cli\/run-simulation-menu\.ts publicly exports protected value/
  );
});

test("public guard permits approved registry operations through the root", () => {
  const fixture = createPublicEntrypointFixture({
    "src/index.ts":
      'export { executeRuntimeEffect } from "./engine/effect-runtime-registry.js";\n',
  });

  const result = runTypedAccessGuard(fixture);
  assert.equal(result.status, 0);
});

test("public guard preserves the closed decoder export surface", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts": `
      export type DecodeResult = { ok: true };
      export interface RuntimeEffectDecoder { readonly effectId: string; }
      export function decodeRuntimeEffectForId() { return {}; }
      export function decodeRuntimeEffect() { return {}; }
      export function decodeTimedRuntimeEffect() { return {}; }
      export function unsafeDecoder() { return {}; }
    `,
  });

  const result = runTypedAccessGuard(fixture);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /violates closed decoder export surface/);
});
