import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { RuntimeDataIntakeError, intakeRuntimeData } from "../src/index.js";
import {
  loadCurrentRuntimeDataPack,
  type LoadedDataPack,
} from "../src/engine/data.js";

const rootDir = process.cwd();

test("Runtime Data Intake accepts filesystem and preloaded sources", () => {
  const fromFilesystem = intakeRuntimeData({ rootDir });
  const fromFixtureFilesystem = intakeRuntimeData({
    rootDir,
    dataPackPath: "tests/fixtures/playable-runtime-data-pack.json",
  });
  const fromPreloaded = intakeRuntimeData({
    dataPack: loadCurrentRuntimeDataPack(rootDir),
  });

  assert.equal(fromFilesystem.manifest.packId, "current-runtime-data-pack");
  assert.equal(
    fromFixtureFilesystem.manifest.packId,
    "playable-runtime-test-data-pack"
  );
  assert.equal(fromPreloaded.manifest.packId, "current-runtime-data-pack");
  assert.equal(Object.isFrozen(fromFilesystem), true);
  assert.equal(Object.isFrozen(fromFilesystem.manifest), true);
  assert.equal(Object.isFrozen(fromFilesystem.decks.starterDeck.entries), true);
  assert.equal("set" in fromFilesystem.cardDefinitions, false);
  assert.throws(
    () =>
      fromFilesystem.decks.starterDeck.entries.push({ cardId: "x", count: 1 }),
    TypeError
  );
});

test("Runtime Data Intake reuses an already verified immutable pack", () => {
  const dataPack = intakeRuntimeData({ rootDir });

  assert.equal(intakeRuntimeData({ dataPack }), dataPack);
});

test("Runtime Data Intake keeps source, decode, and validation errors distinct", () => {
  const missingRoot = path.join(tmpdir(), "runtime-data-intake-missing");
  assert.throws(
    () => intakeRuntimeData({ rootDir: missingRoot }),
    (error: unknown) =>
      error instanceof RuntimeDataIntakeError && error.kind === "source"
  );

  const invalidRoot = mkdtempSync(path.join(tmpdir(), "runtime-data-intake-"));
  writeFileSync(path.join(invalidRoot, "manifest.json"), "{", "utf8");
  assert.throws(
    () =>
      intakeRuntimeData({
        rootDir: invalidRoot,
        dataPackPath: "manifest.json",
      }),
    (error: unknown) =>
      error instanceof RuntimeDataIntakeError && error.kind === "decode"
  );

  const source = loadCurrentRuntimeDataPack(rootDir);
  const fixtureWithSetupGaps: LoadedDataPack = {
    ...source,
    manifest: {
      ...source.manifest,
      mappingStatus: "fixture",
    },
    decks: {
      ...source.decks,
      starterDeck: {
        ...source.decks.starterDeck,
        entries: [],
      },
    },
  };
  assert.doesNotThrow(() =>
    intakeRuntimeData({ dataPack: fixtureWithSetupGaps })
  );

  const invalid: LoadedDataPack = {
    ...fixtureWithSetupGaps,
    manifest: {
      ...fixtureWithSetupGaps.manifest,
      cardDefinitionPaths: ["data/import/cards"],
    },
  };
  assert.throws(
    () => intakeRuntimeData({ dataPack: invalid }),
    (error: unknown) =>
      error instanceof RuntimeDataIntakeError && error.kind === "validation"
  );
});
