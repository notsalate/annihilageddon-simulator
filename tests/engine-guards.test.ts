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

test("typed-access guard resolves short aliases inside their namespace", () => {
  const fixture = createFixture(`
    namespace Raw {
      type Loose = Record<string, unknown>;
      const result: Loose = value;
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixture);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.match(/fixture\.ts:\d+:/gu)?.length, 1);
});

test("typed-access guard keeps qualified namespace aliases scoped by function", () => {
  const fixture = createFixture(`
    function raw(value: unknown) {
      namespace Raw {
        export type Loose = Record<string, unknown>;
      }
      const result: Raw.Loose = value;
      return result;
    }
    function safe() {
      namespace Raw {
        export type Loose = Record<string, number>;
      }
      const result: Raw.Loose = {};
      return result;
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixture);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.match(/fixture\.ts:\d+:/gu)?.length, 1);
});

test("typed-access guard resolves relative aliases in nested namespaces", () => {
  const fixture = createFixture(`
    namespace Outer {
      namespace Inner {
        type Loose = Record<string, unknown>;
      }
      const result: Inner.Loose = value;
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixture);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.match(/fixture\.ts:\d+:/gu)?.length, 1);
});

test("typed-access guard resolves full aliases outside nested namespaces", () => {
  const fixture = createFixture(`
    namespace Outer {
      namespace Inner {
        type Loose = Record<string, unknown>;
      }
    }
    const result: Outer.Inner.Loose = value;
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

test("typed-access guard rejects runtime-effect fallbacks and payload assertions", () => {
  const fixture = createFixture(`
    type RuntimeEffectFields = { amount?: unknown };
    type RuntimeEffectPayload = { effectId: string };
    const decoded = value as RuntimeEffectPayload;
    void decoded;
  `);
  const result = run("check-engine-typed-access.mjs", fixture);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /forbidden runtime-effect boundary RuntimeEffectFields/
  );
  assert.match(result.stderr, /asserts a decoded runtime effect payload/);
});

test("typed-access guard permits concrete payload annotations but rejects their assertions", () => {
  const safeFixture = createFixture(`
    type RuntimeEffectForId<Id extends string> = { effectId: Id };
    function execute(effect: RuntimeEffectForId<"add_power">) {
      return effect.effectId;
    }
    void execute;
  `);
  const safeResult = run("check-engine-typed-access.mjs", safeFixture);
  assert.equal(safeResult.status, 0);

  const unsafeFixture = createFixture(`
    type RuntimeEffectForId<Id extends string> = { effectId: Id };
    const decoded = value as RuntimeEffectForId<"add_power">;
    void decoded;
  `);
  const unsafeResult = run("check-engine-typed-access.mjs", unsafeFixture);
  assert.equal(unsafeResult.status, 1);
  assert.match(unsafeResult.stderr, /asserts a decoded runtime effect payload/);
});

test("typed-access guard rejects raw known payload access in the effect registry", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "engine-guard-"));
  const sourceDir = path.join(fixtureRoot, "src", "engine");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(
    path.join(sourceDir, "effect-runtime-registry.ts"),
    'const amount = effect["amount"];\nvoid amount;\n',
    "utf8"
  );
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /uses raw bracket access for amount/);
});

test("typed-access guard rejects Catalog bypass exports and decoder imports", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "engine-guard-"));
  const sourceDir = path.join(fixtureRoot, "src", "engine");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(
    path.join(sourceDir, "effect-runtime-registry.ts"),
    "export function getEffectRuntimeHandler() {}\n",
    "utf8"
  );
  writeFileSync(
    path.join(sourceDir, "fixture.ts"),
    'import { decodeRuntimeEffectForId } from "./runtime-effect-decoder.js";\nvoid decodeRuntimeEffectForId;\n',
    "utf8"
  );

  const result = run("check-engine-typed-access.mjs", fixtureRoot);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /exports Catalog bypass getEffectRuntimeHandler/);
  assert.match(
    result.stderr,
    /imports runtime effect decoder outside an approved boundary/
  );
});

test("typed-access guard rejects aliased and direct Catalog bypass re-exports", () => {
  const fixtureRoot = createEngineFixture({
    "effect-runtime-registry.ts": `
      const effectRuntimeHandlerMap = {};
      export { effectRuntimeHandlerMap as unsafe };
      function resolveSourceKinds(effectId: string): EffectRuntimeSupportedSourceKinds | undefined {
        switch (effectId) {
          case "fixture": return ["card"];
        }
      }
    `,
    "fixture.ts":
      'export { decodeRuntimeEffectForId } from "./runtime-effect-decoder.js";\n',
  });

  const result = run("check-engine-typed-access.mjs", fixtureRoot);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /re-exports Catalog bypass effectRuntimeHandlerMap/
  );
  assert.match(
    result.stderr,
    /re-exports runtime effect decoder outside an approved boundary/
  );
});

test("typed-access guard enforces the closed decoder export surface", () => {
  const fixtureRoot = createEngineFixture({
    "effect-runtime-registry.ts": `
      function resolveSourceKinds(effectId: string): EffectRuntimeSupportedSourceKinds | undefined {
        switch (effectId) {
          case "fixture": return ["card"];
        }
      }
    `,
    "runtime-effect-decoder.ts": `
      const runtimeEffectDecoders = {};
      let assignedDecoderMap;
      assignedDecoderMap = runtimeEffectDecoders;
      let nestedAssignmentLeak;
      if (true) nestedAssignmentLeak = runtimeEffectDecoders;
      const [safeArrayItem, leakedArrayItem] = [1, runtimeEffectDecoders];
      let assignedSafeArrayItem;
      let assignedLeakedArrayItem;
      [assignedSafeArrayItem, assignedLeakedArrayItem] = [1, runtimeEffectDecoders];
      const { safe: safeObjectProperty, leak: leakedObjectProperty } = {
        safe: 1,
        leak: runtimeEffectDecoders,
      };
      let assignedSafeObjectProperty;
      let assignedLeakedObjectProperty;
      ({ safe: assignedSafeObjectProperty, leak: assignedLeakedObjectProperty } = {
        safe: 1,
        leak: runtimeEffectDecoders,
      });
      const publicDecoderMap = runtimeEffectDecoders;
      const transitiveDecoderMap = publicDecoderMap;
      export { transitiveDecoderMap as exposedDecoderMap };
      export const directDecoderMap = runtimeEffectDecoders;
      export { assignedDecoderMap };
      export const parenthesizedDecoderMap = (runtimeEffectDecoders);
      export const assertedDecoderMap = runtimeEffectDecoders as unknown;
      export const satisfiedDecoderMap = runtimeEffectDecoders satisfies object;
      export const nonNullDecoderMap = runtimeEffectDecoders!;
      export const objectWrapper = { decoderMap: runtimeEffectDecoders };
      export const arrayWrapper = [runtimeEffectDecoders];
      export const closureWrapper = () => runtimeEffectDecoders;
      export default function decodeRuntimeEffect() {
        return runtimeEffectDecoders;
      }
      const unrelatedDecoderMap = {};
      export { unrelatedDecoderMap };
      export { nestedAssignmentLeak, safeArrayItem, leakedArrayItem };
      export { assignedSafeArrayItem, assignedLeakedArrayItem };
      export { safeObjectProperty, leakedObjectProperty };
      export { assignedSafeObjectProperty, assignedLeakedObjectProperty };
      export const shadowedParameter = (runtimeEffectDecoders: unknown) => runtimeEffectDecoders;
      type DecoderMapType = typeof runtimeEffectDecoders;
      export type { DecoderMapType };
    `,
  });

  const result = run("check-engine-typed-access.mjs", fixtureRoot);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /closed decoder export surface/);
});

test("typed-access guard accepts a renamed explicit source-kind policy helper", () => {
  const fixtureRoot = createEngineFixture({
    "effect-runtime-registry.ts": `
      function resolveSourceKinds(effectId: string): EffectRuntimeSupportedSourceKinds | undefined {
        switch (effectId) {
          case "fixture": return ["card"];
        }
      }
    `,
  });

  const result = run("check-engine-typed-access.mjs", fixtureRoot);

  assert.equal(result.status, 0);
});

test("typed-access guard accepts unrelated interfaces but rejects executable raw handler validation", () => {
  const safe = createEngineFixture({
    "effect-runtime-registry.ts": `
      interface Unrelated { checkPayload(raw: unknown): string[]; }
      function resolveSourceKinds(effectId: string): EffectRuntimeSupportedSourceKinds | undefined {
        switch (effectId) { case "fixture": return ["card"]; }
      }
    `,
    "runtime-effect-decoder.ts":
      "function checkPayload(raw: unknown): string[] { return []; }\nvoid checkPayload;\n",
  });
  assert.equal(run("check-engine-typed-access.mjs", safe).status, 0);

  const bypass = createEngineFixture({
    "effect-runtime-registry.ts": `
      const handler = {
        execute: () => {},
        checkPayload(raw: unknown): string[] { return []; },
      };
      void handler;
      function resolveSourceKinds(effectId: string): EffectRuntimeSupportedSourceKinds | undefined {
        switch (effectId) { case "fixture": return ["card"]; }
      }
    `,
  });
  const result = run("check-engine-typed-access.mjs", bypass);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /handler-owned payload validation/);
});

test("typed-access guard rejects a two-zone consumer without a Ledger import", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    interface PlayerState {
      hand: unknown[];
      deck: unknown[];
    }
    export function listInventory(players: PlayerState[]) {
      return players.flatMap((player: PlayerState) => [
        player.hand,
        player.deck,
      ]);
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /manually enumerates physical-zone inventory without calling a Control Ledger seam/
  );
  assert.match(result.stderr, /PlayerState.hand, PlayerState.deck/);
});

test("typed-access guard rejects a three-zone consumer without a Ledger seam", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    interface PlayerState { hand: unknown[]; deck: unknown[]; discard: unknown[] }
    export function listInventory(players: PlayerState[]) {
      return players.flatMap((player: PlayerState) => [player.hand, player.deck, player.discard]);
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /PlayerState.hand, PlayerState.deck, PlayerState.discard/
  );
});

test("typed-access guard rejects a type-only Ledger import without a seam call", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    import type { clonePhysicalCardZoneState } from "./control-ledger.js";
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    export function listInventory(players: PlayerState[]) {
      return players.flatMap((player: PlayerState) => [player.hand, player.deck]);
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /without calling a Control Ledger seam/);
});

test("typed-access guard rejects a bare Ledger import without a seam call", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    import "./control-ledger.js";
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    export function listInventory(players: PlayerState[]) {
      return players.flatMap((player: PlayerState) => [player.hand, player.deck]);
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /without calling a Control Ledger seam/);
});

test("typed-access guard accepts an aliased physical-zone Ledger seam", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    import { listPhysicalCardLocations as listLocations } from "./control-ledger.js";
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    export function listInventory(players: PlayerState[]) {
      listLocations();
      return players.flatMap((player: PlayerState) => [player.hand, player.deck]);
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 0);
});

test("typed-access guard keeps an aliased Ledger seam outside sibling bindings", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    import { listPhysicalCardLocations as listLocations } from "./control-ledger.js";
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    export function listInventory(players: PlayerState[]) {
      listLocations();
      return players.flatMap((player: PlayerState) => [player.hand, player.deck]);
    }
    function unrelated() {
      function listLocations() {}
      listLocations();
    }
    if (true) {
      const { listLocations } = { listLocations: () => {} };
      listLocations();
    }
    void unrelated;
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 0);
});

test("typed-access guard keeps an aliased Ledger seam after switch and loop bindings", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    import { listPhysicalCardLocations as listLocations } from "./control-ledger.js";
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    export function listInventory(players: PlayerState[]) {
      switch (0) {
        case 0:
          const listLocations = () => {};
          listLocations();
          break;
      }
      for (const listLocations = () => {}; false;) {
        listLocations();
      }
      for (const listLocations of [() => {}]) {
        listLocations();
      }
      for (const listLocations in { local: () => {} }) {
        void listLocations;
      }
      listLocations();
      return players.flatMap((player: PlayerState) => [player.hand, player.deck]);
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 0);
});

test("typed-access guard sees a Ledger alias shadow inside a loop scope", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    import { listPhysicalCardLocations as listLocations } from "./control-ledger.js";
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    export function listInventory(players: PlayerState[]) {
      for (const listLocations of [() => {}]) {
        listLocations();
        return players.flatMap((player: PlayerState) => [player.hand, player.deck]);
      }
      return [];
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /without calling a Control Ledger seam/);
});

test("typed-access guard keeps Ledger aliases outside every lexical sibling scope", () => {
  const siblingScopes = [
    ["Program", ""],
    [
      "FunctionLike",
      "function sibling() { const listLocations = () => {}; listLocations(); }",
    ],
    ["Block", "if (true) { const listLocations = () => {}; listLocations(); }"],
    [
      "CaseBlock",
      "switch (0) { case 0: const listLocations = () => {}; listLocations(); break; }",
    ],
    [
      "Catch",
      "try {} catch { const listLocations = () => {}; listLocations(); }",
    ],
    [
      "For",
      "for (const listLocations = () => {}; false;) { listLocations(); }",
    ],
    ["ForOf", "for (const listLocations of [() => {}]) { listLocations(); }"],
    [
      "ForIn",
      "for (const listLocations in { local: () => {} }) { void listLocations; }",
    ],
    [
      "ModuleBlock",
      "namespace Sibling { const listLocations = () => {}; listLocations(); }",
    ],
    [
      "ClassStaticBlock",
      "class Sibling { static { const listLocations = () => {}; listLocations(); } }",
    ],
  ] as const;

  for (const [scopeName, siblingScope] of siblingScopes) {
    const fixtureRoot = createPhysicalZoneFixture(`
      import { listPhysicalCardLocations as listLocations } from "./control-ledger.js";
      interface PlayerState { hand: unknown[]; deck: unknown[] }
      export function listInventory(players: PlayerState[]) {
        listLocations();
        return players.flatMap((player: PlayerState) => [player.hand, player.deck]);
      }
      ${siblingScope}
    `);
    assert.equal(
      run("check-engine-typed-access.mjs", fixtureRoot).status,
      0,
      scopeName
    );
  }
});

test("typed-access guard sees Ledger shadows inside module and static-block scopes", () => {
  const moduleFixture = createPhysicalZoneFixture(`
    import { listPhysicalCardLocations as listLocations } from "./control-ledger.js";
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    namespace Unsafe {
      export function listInventory(players: PlayerState[]) {
        const listLocations = () => {};
        listLocations();
        return players.flatMap((player: PlayerState) => [player.hand, player.deck]);
      }
    }
  `);
  const staticFixture = createPhysicalZoneFixture(`
    import { listPhysicalCardLocations as listLocations } from "./control-ledger.js";
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    const players: PlayerState[] = [];
    class Unsafe {
      static {
        const listLocations = () => {};
        listLocations();
        void players.flatMap((player: PlayerState) => [player.hand, player.deck]);
      }
    }
  `);
  assert.equal(run("check-engine-typed-access.mjs", moduleFixture).status, 1);
  assert.equal(run("check-engine-typed-access.mjs", staticFixture).status, 1);
});

test("typed-access guard ignores a Ledger alias shadowed by a parameter", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    import { listPhysicalCardLocations as listLocations } from "./control-ledger.js";
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    export function listInventory(
      players: PlayerState[],
      listLocations: () => void
    ) {
      listLocations();
      return players.flatMap((player: PlayerState) => [player.hand, player.deck]);
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /without calling a Control Ledger seam/);
});

test("typed-access guard ignores a Ledger alias shadowed by a function declaration", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    import { listPhysicalCardLocations as listLocations } from "./control-ledger.js";
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    export function listInventory(players: PlayerState[]) {
      function listLocations() {}
      listLocations();
      return players.flatMap((player: PlayerState) => [player.hand, player.deck]);
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /without calling a Control Ledger seam/);
});

test("typed-access guard ignores a hoisted var Ledger alias shadow", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    import { listPhysicalCardLocations as listLocations } from "./control-ledger.js";
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    export function listInventory(players: PlayerState[]) {
      if (true) {
        var listLocations = () => {};
      }
      listLocations();
      return players.flatMap((player: PlayerState) => [player.hand, player.deck]);
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /without calling a Control Ledger seam/);
});

test("typed-access guard ignores object and array destructuring Ledger alias shadows", () => {
  const objectFixture = createPhysicalZoneFixture(`
    import { listPhysicalCardLocations as listLocations } from "./control-ledger.js";
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    export function listInventory(players: PlayerState[]) {
      const { listLocations } = { listLocations: () => {} };
      listLocations();
      return players.flatMap((player: PlayerState) => [player.hand, player.deck]);
    }
  `);
  const arrayFixture = createPhysicalZoneFixture(`
    import { listPhysicalCardLocations as listLocations } from "./control-ledger.js";
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    export function listInventory(players: PlayerState[]) {
      const [listLocations] = [() => {}];
      listLocations();
      return players.flatMap((player: PlayerState) => [player.hand, player.deck]);
    }
  `);
  assert.equal(run("check-engine-typed-access.mjs", objectFixture).status, 1);
  assert.equal(run("check-engine-typed-access.mjs", arrayFixture).status, 1);
});

test("typed-access guard ignores Ledger aliases shadowed by class and catch bindings", () => {
  const classFixture = createPhysicalZoneFixture(`
    import { listPhysicalCardLocations as listLocations } from "./control-ledger.js";
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    export function listInventory(players: PlayerState[]) {
      class listLocations {}
      listLocations();
      return players.flatMap((player: PlayerState) => [player.hand, player.deck]);
    }
  `);
  const catchFixture = createPhysicalZoneFixture(`
    import { listPhysicalCardLocations as listLocations } from "./control-ledger.js";
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    export function listInventory(players: PlayerState[]) {
      try {} catch ({ listLocations }) {
        listLocations();
        return players.flatMap((player: PlayerState) => [player.hand, player.deck]);
      }
      return [];
    }
  `);
  assert.equal(run("check-engine-typed-access.mjs", classFixture).status, 1);
  assert.equal(run("check-engine-typed-access.mjs", catchFixture).status, 1);
});

test("typed-access guard does not treat non-inventory Ledger APIs as a seam", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    import { findCardLocation } from "./control-ledger.js";
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    export function listInventory(players: PlayerState[]) {
      findCardLocation();
      return players.flatMap((player: PlayerState) => [player.hand, player.deck]);
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /without calling a Control Ledger seam/);
});

test("typed-access guard follows GameState.players and PlayerState[] callbacks", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    interface GameState { players: PlayerState[] }
    export function collectFromGame(state: GameState) {
      return state.players.flatMap((player) => [player.hand, player.deck]);
    }
    export function mapPlayers(state: GameState) {
      return state.players.map((player) => player.hand.concat(player.deck));
    }
    export function filterPlayers(state: GameState) {
      return state.players.filter((player) => {
        const inventory = [player.hand, player.deck];
        return inventory.length > 0;
      });
    }
    export function visitPlayers(players: PlayerState[]) {
      players.forEach((player) => [player.hand, player.deck]);
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PlayerState.hand, PlayerState.deck/);
});

test("typed-access guard follows a players callback through a nested IIFE", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    interface GameState { players: PlayerState[] }
    export function collectFromGame(state: GameState) {
      return state.players.flatMap((player) => (() => [player.hand, player.deck])());
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PlayerState.hand, PlayerState.deck/);
});

test("typed-access guard ignores Other.players callbacks", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    interface OtherPlayer { hand: unknown[]; deck: unknown[] }
    interface Other { players: OtherPlayer[] }
    export function collect(other: Other) {
      return other.players.flatMap((player) => [player.hand, player.deck]);
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 0);
});

test("typed-access guard follows intermediate zone aliases pushed into an inventory", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    export function listInventory(player: PlayerState) {
      const hand = player.hand;
      const deck = player.deck;
      const inventory: unknown[][] = [];
      inventory.push(hand, deck);
      return inventory;
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PlayerState.hand, PlayerState.deck/);
});

test("typed-access guard rejects a concat inventory", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    export function listInventory(player: PlayerState) {
      return player.hand.concat(player.deck);
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PlayerState.hand, PlayerState.deck/);
});

test("typed-access guard follows an object map consumed as an inventory", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    interface PlayerState { hand: unknown[]; deck: unknown[] }
    export function listInventory(player: PlayerState) {
      const zones = { hand: player.hand, deck: player.deck };
      return Object.values(zones);
    }
  `);
  const result = run("check-engine-typed-access.mjs", fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PlayerState.hand, PlayerState.deck/);
});

test("typed-access guard ignores unrelated same-named properties", () => {
  const fixtureRoot = createPhysicalZoneFixture(`
    interface Other { hand: unknown[]; deck: unknown[] }
    export function listOther(other: Other) {
      return [other.hand, other.deck];
    }
  `);
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

function createEngineFixture(files: Record<string, string>): string {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "engine-guard-"));
  const sourceDir = path.join(fixtureRoot, "src", "engine");
  mkdirSync(sourceDir, { recursive: true });
  for (const [fileName, source] of Object.entries(files)) {
    writeFileSync(path.join(sourceDir, fileName), source, "utf8");
  }
  return fixtureRoot;
}

function createPhysicalZoneFixture(consumerSource: string): string {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "engine-guard-"));
  const sourceDir = path.join(fixtureRoot, "src", "engine");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(
    path.join(sourceDir, "control-ledger.ts"),
    `
      function createArrayCardZoneDescriptor(
        zoneName: string,
        readStorage: () => readonly unknown[]
      ) {
        return { zoneName, readStorage };
      }

      interface PlayerState {
        deck: unknown[];
        hand: unknown[];
        discard: unknown[];
        permanents: unknown[];
      }

      function listPlayerPhysicalCardZoneDescriptors(player: PlayerState) {
        return [
          createArrayCardZoneDescriptor("deck", () => player.deck),
          createArrayCardZoneDescriptor("hand", () => player.hand),
          createArrayCardZoneDescriptor("discard", () => player.discard),
          createArrayCardZoneDescriptor("permanents", () => player.permanents),
        ];
      }
      void listPlayerPhysicalCardZoneDescriptors;
    `,
    "utf8"
  );
  writeFileSync(path.join(sourceDir, "fixture.ts"), consumerSource, "utf8");
  return fixtureRoot;
}

function run(script: string, fixtureRoot: string) {
  return spawnSync(
    process.execPath,
    [path.join(rootDir, "scripts", script), fixtureRoot],
    { encoding: "utf8" }
  );
}
