import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createRuntimeCoverageInventory,
  formatRuntimeCoverageInventoryMarkdown,
} from "../src/index.js";

test("runtime coverage inventory reports drafts, runtime, composition, legacy v0 facts, and review-needed status", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-runtime-coverage-")
  );

  writeJson(
    rootDir,
    "data/import/cards/main/drafts/esw2_dbg__main_001.json",
    createCardDraft("esw2_dbg__main_001", {
      nameRu: "Проверочная атака",
      textRu: "Атака: нанеси 3 урона врагу.",
      markers: ["attack"],
    })
  );
  writeJson(rootDir, "data/cards/main/esw2_dbg__main_001.json", {
    schemaVersion: 1,
    cardId: "esw2_dbg__main_001",
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "supported",
      playableInV0: true,
      effects: [{ effectId: "attack_damage", timing: "onPlay", amount: 3 }],
      unsupportedMechanics: [],
    },
  });
  writeJson(rootDir, "data/decks/v0-main-deck-first-batch.json", {
    deckId: "v0-main-deck-first-batch",
    role: "mainDeck",
    entries: [{ cardId: "esw2_dbg__main_001", count: 2 }],
  });

  const report = createRuntimeCoverageInventory(rootDir);
  const item = report.items.find(
    (candidate) => candidate.id === "esw2_dbg__main_001"
  );

  assert.ok(item);
  assert.equal(item.objectKind, "card");
  assert.equal(item.sourceGroupOrTokenKind, "main");
  assert.equal(item.draftPresence, "present");
  assert.equal(item.runtimePresence, "present");
  assert.deepEqual(item.compositionMembership, [
    "deck:v0-main-deck-first-batch",
  ]);
  assert.equal(item.legacyRuntimeSchema, "krutagidon.cardDefinition.v0");
  assert.equal(item.legacyPlayableInV0, true);
  assert.equal(item.coverageStatus, "reviewNeeded");

  const markdown = formatRuntimeCoverageInventoryMarkdown(report);

  assert.match(markdown, /Runtime Coverage Audit Report/);
  assert.match(markdown, /reviewNeeded/);
  assert.match(markdown, /esw2_dbg__main_001/);
});

test("runtime coverage inventory distinguishes planning statuses and proposes a Wand Attack Card cluster", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-runtime-coverage-statuses-")
  );

  writeJson(
    rootDir,
    "data/import/cards/main/drafts/esw2_dbg__main_001.json",
    createCardDraft("esw2_dbg__main_001")
  );
  writeJson(
    rootDir,
    "data/import/cards/main/drafts/esw2_dbg__main_002.json",
    createCardDraft("esw2_dbg__main_002")
  );
  writeJson(
    rootDir,
    "data/import/cards/main/drafts/esw2_dbg__main_003.json",
    createCardDraft("esw2_dbg__main_003")
  );
  writeJson(
    rootDir,
    "data/import/cards/legend/drafts/esw2_dbg__legend_001.json",
    createCardDraft("esw2_dbg__legend_001", {
      nameRu: "Боевая палочка",
      textRu: "Атака: нанеси 4 урона врагу.",
      markers: ["attack"],
    })
  );

  writeRuntimeCard(
    rootDir,
    "data/cards/main/esw2_dbg__main_001.json",
    "esw2_dbg__main_001",
    {
      mappingStatus: "draft",
      playableInV0: false,
      unsupportedMechanics: ["needs-real-effect"],
    }
  );
  writeRuntimeCard(
    rootDir,
    "data/cards/main/esw2_dbg__main_002.json",
    "esw2_dbg__main_002",
    {
      mappingStatus: "v0-user-provided-placeholder",
      playableInV0: false,
      unsupportedMechanics: [],
    }
  );
  writeRuntimeCard(
    rootDir,
    "data/cards/legend/esw2_dbg__legend_001.json",
    "esw2_dbg__legend_001",
    {
      mappingStatus: "supported",
      playableInV0: true,
      unsupportedMechanics: [],
      effects: [{ effectId: "attack_damage", timing: "onPlay", amount: 4 }],
    }
  );
  writeJson(rootDir, "data/decks/v0-legend-deck-first-batch.json", {
    deckId: "v0-legend-deck-first-batch",
    role: "legendDeck",
    entries: [{ cardId: "esw2_dbg__legend_001", count: 1 }],
  });
  writeText(
    rootDir,
    "tests/wand-attack.test.ts",
    'test("wand", () => "esw2_dbg__legend_001");'
  );

  const report = createRuntimeCoverageInventory(rootDir);
  const statusById = new Map(
    report.items.map((item) => [item.id, item.coverageStatus])
  );

  assert.equal(statusById.get("esw2_dbg__main_001"), "partial");
  assert.equal(statusById.get("esw2_dbg__main_002"), "placeholder");
  assert.equal(statusById.get("esw2_dbg__main_003"), "missingRuntime");
  assert.equal(
    statusById.get("esw2_dbg__legend_001"),
    "fullyPlayableCandidate"
  );

  const wandCluster = report.clusters.find(
    (cluster) => cluster.clusterId === "wand-attack-card"
  );

  assert.ok(wandCluster);
  assert.deepEqual(wandCluster.itemIds, ["esw2_dbg__legend_001"]);
  assert.match(
    wandCluster.sharedMechanicSurface,
    /visible name plus attack-damage behavior/
  );
});

function createCardDraft(
  cardId: string,
  visibleOverrides: Partial<{
    nameRu: string;
    textRu: string;
    markers: string[];
  }> = {}
) {
  return {
    schemaVersion: 1,
    draftKind: "cardDraft",
    cardId,
    source: {
      image: "assets/cards/main/example.png",
      text: `data/import/cards/main/texts/${cardId}.md`,
    },
    visible: {
      nameRu: visibleOverrides.nameRu ?? "Тестовая карта",
      cost: 3,
      victoryPoints: 1,
      typeRu: "Заклинание",
      cardKind: "normal",
      cardTypes: ["spell"],
      textRu: visibleOverrides.textRu ?? "+2 мощи",
      markers: visibleOverrides.markers ?? [],
      uncertainty: [],
    },
    notes: [],
    composition: {
      quantity: 2,
    },
  };
}

function writeJson(
  rootDir: string,
  relativePath: string,
  value: unknown
): void {
  writeText(rootDir, relativePath, JSON.stringify(value));
}

function writeRuntimeCard(
  rootDir: string,
  relativePath: string,
  cardId: string,
  engineOverrides: Partial<{
    mappingStatus: string;
    playableInV0: boolean;
    unsupportedMechanics: string[];
    effects: unknown[];
  }>
): void {
  writeJson(rootDir, relativePath, {
    schemaVersion: 1,
    cardId,
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: engineOverrides.mappingStatus ?? "supported",
      playableInV0: engineOverrides.playableInV0 ?? true,
      effects: engineOverrides.effects ?? [],
      unsupportedMechanics: engineOverrides.unsupportedMechanics ?? [],
    },
  });
}

function writeText(rootDir: string, relativePath: string, text: string): void {
  const absolutePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, text, "utf8");
}
