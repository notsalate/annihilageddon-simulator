import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createRuntimeCoverageInventory,
  formatRuntimeCoverageInventoryMarkdown,
  createRuntimeSemanticCompletionReport,
  formatRuntimeSemanticCompletionMarkdown,
} from "../src/index.js";
import type { RuntimeCoverageInventoryItem } from "../src/index.js";
import { evaluateCrossSourceCoverage } from "../src/import/cross-source-runtime-coverage.js";
import type { CrossSourceCoveragePlanEntry } from "../src/import/cross-source-runtime-coverage.js";

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

test("cross-source coverage blocks an empty DWT runtime and ignores an ID outside its runtime seam", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-cross-source-runtime-")
  );
  const tokenId = "esw2_dbg__dead_wizard_token_001";

  writeJson(
    rootDir,
    `data/import/tokens/dead-wizard-token/drafts/${tokenId}.json`,
    {
      schemaVersion: 1,
      draftKind: "deadWizardTokenDraft",
      tokenId,
      kind: "deadWizardToken",
      source: { image: "assets/dead-wizard-token/DWT_001.png" },
      visible: {
        sourceLabel: "Получи вялую палочку за каждую легенду в сбросе",
        textRu: "Получи вялую палочку за каждую легенду в сбросе.",
        victoryPoints: -3,
        uncertainty: [],
      },
      notes: [],
      composition: { quantity: 1 },
    }
  );
  writeJson(rootDir, `data/tokens/dead-wizard/${tokenId}.json`, {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "deadWizardToken",
    victoryPoints: -3,
    effects: [],
  });
  writeJson(rootDir, "data/stacks/tokens/dead-wizard-tokens.json", {
    stackId: "dead-wizard-tokens",
    role: "deadWizardTokens",
    entries: [{ tokenId, count: 1 }],
  });
  writeJson(rootDir, "config/runtime-coverage/cross-source-mechanics.json", {
    schemaVersion: 1,
    entries: [
      {
        id: tokenId,
        objectKind: "deadWizardToken",
        primaryMechanicCluster: "special-card-stack",
        semanticMappings: [
          {
            draftPoint: {
              path: "visible.textRu",
              value: "Получи вялую палочку за каждую легенду в сбросе.",
            },
            runtimeRefs: [
              {
                kind: "effect",
                effectId: "gain_card",
                timing: "onGain",
                fields: { amount: 1 },
              },
            ],
            testRefs: [
              {
                file: "tests/dead-wizard-token-runtime.test.ts",
                name: "resolves limp wand payout",
              },
            ],
          },
        ],
        unresolvedMechanics: [],
      },
    ],
  });
  writeText(
    rootDir,
    "tests/dead-wizard-token-runtime.test.ts",
    `test("resolves limp wand payout", () => {\n  const tokenId = "${tokenId}";\n  const result = applyAction(state, { type: "playCard", cardId: "esw2_dbg__main_001" });\n  assert.equal(result.ok, true);\n});\n`
  );

  const report = createRuntimeCoverageInventory(rootDir);
  const item = report.items.find((candidate) => candidate.id === tokenId);

  assert.ok(item);
  assert.equal(item.primaryMechanicCluster, "special-card-stack");
  assert.equal(item.crossSourceStatus, "blocked");
  assert.ok(
    item.crossSourceBlockers.some((blocker) =>
      blocker.includes("runtime effect gain_card@onGain is missing")
    )
  );
  assert.ok(
    item.crossSourceBlockers.some((blocker) =>
      blocker.includes("focused test reference is missing")
    )
  );
  assert.match(
    formatRuntimeCoverageInventoryMarkdown(report),
    /crossSourceStatus: blocked/
  );
});

test("cross-source coverage requires matching runtime and focused test evidence for every draft point", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-cross-source-complete-")
  );
  const tokenId = "esw2_dbg__wizard_property_005";
  const textRu = "☼: при активации получи 1 чипсину.";

  writeJson(
    rootDir,
    `data/import/tokens/wizard-property/drafts/${tokenId}.json`,
    {
      schemaVersion: 1,
      draftKind: "wizardPropertyDraft",
      tokenId,
      kind: "wizardProperty",
      source: { image: "assets/wizard-property/wp_005.png" },
      visible: { sourceLabel: "Свойство 5", textRu, uncertainty: [] },
      notes: [],
      composition: { quantity: 1 },
    }
  );
  writeJson(rootDir, `data/tokens/wizard-property/${tokenId}.json`, {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    engine: {
      mappingStatus: "mapped",
      playableInV0: true,
      effects: [{ effectId: "gain_chips", timing: "activation", amount: 1 }],
      unsupportedMechanics: [],
    },
  });
  writeJson(rootDir, "data/stacks/tokens/wizard-properties.json", {
    stackId: "wizard-properties",
    role: "wizardProperties",
    entries: [{ tokenId, count: 1 }],
  });
  writeJson(rootDir, "config/runtime-coverage/cross-source-mechanics.json", {
    schemaVersion: 1,
    entries: [
      {
        id: tokenId,
        objectKind: "wizardProperty",
        primaryMechanicCluster: "activation-effects",
        semanticMappings: [
          {
            draftPoint: { path: "visible.textRu", value: textRu },
            runtimeRefs: [
              {
                kind: "effect",
                effectId: "gain_chips",
                timing: "activation",
                fields: { amount: 1 },
              },
            ],
            testRefs: [
              {
                file: "tests/wizard-property-runtime.test.ts",
                name: "gains a chip while activated",
              },
            ],
          },
        ],
        unresolvedMechanics: [],
      },
    ],
  });
  writeText(
    rootDir,
    "tests/wizard-property-runtime.test.ts",
    `test("gains a chip while activated", () => {\n  const tokenId = "${tokenId}";\n  const state = initializeGame({ rootDir });\n  applyAction(state, { type: "playCard", cardId: tokenId });\n  assert.equal(state.players[0]?.chips, 1);\n});\n`
  );

  const report = createRuntimeCoverageInventory(rootDir);
  const item = report.items.find((candidate) => candidate.id === tokenId);

  assert.ok(item);
  assert.equal(item.crossSourceStatus, "crossSourceComplete");
  assert.deepEqual(item.crossSourceBlockers, []);
});

test("cross-source coverage accepts scoreGame with a stable DWT definition as focused evidence", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-cross-source-scoring-dwt-")
  );
  const tokenId = "esw2_dbg__dead_wizard_token_003";

  writeJson(
    rootDir,
    `data/import/tokens/dead-wizard-token/drafts/${tokenId}.json`,
    {
      schemaVersion: 1,
      draftKind: "deadWizardTokenDraft",
      tokenId,
      kind: "deadWizardToken",
      source: { image: "assets/dead-wizard-token/DWT_003-004.png" },
      visible: {
        sourceLabel: "Уничтожь пару ЖДК",
        textRu: "В конце игры: удали оба ЖДК с тем же текстом.",
        victoryPoints: -8,
        uncertainty: [],
      },
      notes: [],
      composition: { quantity: 2 },
    }
  );
  writeJson(rootDir, `data/tokens/dead-wizard/${tokenId}.json`, {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "deadWizardToken",
    victoryPoints: -8,
    effects: [
      {
        effectId: "endgame_remove_matching_dead_wizard_tokens",
        timing: "scoring",
        matching: "sameDefinition",
        minimumCount: 2,
      },
    ],
  });
  writeJson(rootDir, "data/stacks/tokens/dead-wizard-tokens.json", {
    stackId: "dead-wizard-tokens",
    role: "deadWizardTokens",
    entries: [{ tokenId, count: 2 }],
  });
  writeJson(rootDir, "config/runtime-coverage/cross-source-mechanics.json", {
    schemaVersion: 1,
    entries: [
      {
        id: tokenId,
        objectKind: "deadWizardToken",
        primaryMechanicCluster: "scoring-effects",
        semanticMappings: [
          {
            draftPoint: {
              path: "visible.textRu",
              value: "В конце игры: удали оба ЖДК с тем же текстом.",
            },
            runtimeRefs: [
              {
                kind: "effect",
                effectId: "endgame_remove_matching_dead_wizard_tokens",
                timing: "scoring",
                fields: { matching: "sameDefinition", minimumCount: 2 },
              },
            ],
            testRefs: [
              {
                file: "tests/dead-wizard-token-scoring.test.ts",
                name: "scores one paired DWT 003",
              },
            ],
          },
          {
            draftPoint: { path: "visible.victoryPoints", value: -8 },
            runtimeRefs: [{ kind: "field", path: "victoryPoints", value: -8 }],
            testRefs: [
              {
                file: "tests/dead-wizard-token-scoring.test.ts",
                name: "scores one paired DWT 003",
              },
            ],
          },
        ],
        unresolvedMechanics: [],
      },
    ],
  });
  writeText(
    rootDir,
    "tests/dead-wizard-token-scoring.test.ts",
    `test("scores one paired DWT 003", () => {
  const state = initializeGame({ rootDir });
  state.players[0].deadWizardTokens.push({
    definitionId: markTokenDefinitionId("${tokenId}"),
  });
  const scores = scoreGame(state);
  assert.equal(scores[0].victoryPoints, -8);
});
`
  );

  const item = createRuntimeCoverageInventory(rootDir).items.find(
    (candidate) => candidate.id === tokenId
  );

  assert.ok(item);
  assert.deepEqual(item.crossSourceBlockers, []);
  assert.equal(item.crossSourceStatus, "crossSourceComplete");
});

test("cross-source coverage accepts gainDeadWizardToken with a stable DWT definition as focused evidence", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-cross-source-dwt-face-")
  );
  const tokenId = "esw2_dbg__dead_wizard_token_027";
  const textRu = "Стань лошарой.";

  writeJson(
    rootDir,
    `data/import/tokens/dead-wizard-token/drafts/${tokenId}.json`,
    {
      schemaVersion: 1,
      draftKind: "deadWizardTokenDraft",
      tokenId,
      kind: "deadWizardToken",
      source: { image: "assets/dead-wizard-token/DWT_027.png" },
      visible: {
        sourceLabel: textRu,
        textRu,
        victoryPoints: -3,
        uncertainty: [],
      },
      notes: [],
      composition: { quantity: 1 },
    }
  );
  writeJson(rootDir, `data/tokens/dead-wizard/${tokenId}.json`, {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "deadWizardToken",
    victoryPoints: -3,
    effects: [
      {
        effectId: "dead_wizard_token_gain_status_or_draw_face",
        timing: "onDeadWizardTokenFace",
        statusId: "dingler",
      },
    ],
  });
  writeJson(rootDir, "data/stacks/tokens/dead-wizard-tokens.json", {
    stackId: "dead-wizard-tokens",
    role: "deadWizardTokens",
    entries: [{ tokenId, count: 1 }],
  });
  const testRef = {
    file: "tests/dead-wizard-token-runtime.test.ts",
    name: "resolves DWT 027 through the public face action",
  };
  writeJson(rootDir, "config/runtime-coverage/cross-source-mechanics.json", {
    schemaVersion: 1,
    entries: [
      {
        id: tokenId,
        objectKind: "deadWizardToken",
        primaryMechanicCluster: "dingler-status",
        semanticMappings: [
          {
            draftPoint: { path: "visible.textRu", value: textRu },
            runtimeRefs: [
              {
                kind: "effect",
                effectId: "dead_wizard_token_gain_status_or_draw_face",
                timing: "onDeadWizardTokenFace",
                fields: { statusId: "dingler" },
              },
            ],
            testRefs: [testRef],
          },
          {
            draftPoint: { path: "visible.victoryPoints", value: -3 },
            runtimeRefs: [{ kind: "field", path: "victoryPoints", value: -3 }],
            testRefs: [testRef],
          },
        ],
        unresolvedMechanics: [],
      },
    ],
  });
  writeText(
    rootDir,
    testRef.file,
    `test("${testRef.name}", () => {
  const state = initializeGame({ rootDir });
  state.common.deadWizardTokens.drawStack.push({
    definitionId: markTokenDefinitionId("${tokenId}"),
  });
  gainDeadWizardToken(state, state.players[0]);
  assert.equal(state.players[0].statuses.length, 1);
});
`
  );

  const item = createRuntimeCoverageInventory(rootDir).items.find(
    (candidate) => candidate.id === tokenId
  );

  assert.ok(item);
  assert.deepEqual(item.crossSourceBlockers, []);
  assert.equal(item.crossSourceStatus, "crossSourceComplete");
});

test("cross-source coverage blocks effects outside their source-kind policy", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-cross-source-policy-")
  );
  const tokenId = "esw2_dbg__dead_wizard_token_001";
  const textRu = "Замени стартовую карту.";

  writeJson(
    rootDir,
    `data/import/tokens/dead-wizard-token/drafts/${tokenId}.json`,
    {
      schemaVersion: 1,
      draftKind: "deadWizardTokenDraft",
      tokenId,
      kind: "deadWizardToken",
      source: { image: "assets/dead-wizard-token/DWT_001.png" },
      visible: {
        sourceLabel: textRu,
        textRu,
        victoryPoints: -3,
        uncertainty: [],
      },
      notes: [],
      composition: { quantity: 1 },
    }
  );
  writeJson(rootDir, `data/tokens/dead-wizard/${tokenId}.json`, {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "deadWizardToken",
    victoryPoints: -3,
    effects: [
      {
        effectId: "replace_starting_card",
        timing: "setup",
        fromDefinitionId: "esw2_dbg__starter_001",
        toDefinitionId: "esw2_dbg__starter_002",
      },
    ],
  });
  writeJson(rootDir, "data/stacks/tokens/dead-wizard-tokens.json", {
    stackId: "dead-wizard-tokens",
    role: "deadWizardTokens",
    entries: [{ tokenId, count: 1 }],
  });
  writeJson(rootDir, "config/runtime-coverage/cross-source-mechanics.json", {
    schemaVersion: 1,
    entries: [
      {
        id: tokenId,
        objectKind: "deadWizardToken",
        primaryMechanicCluster: "dwt-interactions",
        semanticMappings: [
          {
            draftPoint: { path: "visible.textRu", value: textRu },
            runtimeRefs: [
              {
                kind: "effect",
                effectId: "replace_starting_card",
                timing: "setup",
                fields: {
                  fromDefinitionId: "esw2_dbg__starter_001",
                  toDefinitionId: "esw2_dbg__starter_002",
                },
              },
            ],
            testRefs: [
              {
                file: "tests/dead-wizard-token-runtime.test.ts",
                name: "rejects setup replacement on a DWT",
              },
            ],
          },
          {
            draftPoint: { path: "visible.victoryPoints", value: -3 },
            runtimeRefs: [
              {
                kind: "field",
                path: "victoryPoints",
                value: -3,
              },
            ],
            testRefs: [
              {
                file: "tests/dead-wizard-token-runtime.test.ts",
                name: "rejects setup replacement on a DWT",
              },
            ],
          },
        ],
        unresolvedMechanics: [],
      },
    ],
  });
  writeText(
    rootDir,
    "tests/dead-wizard-token-runtime.test.ts",
    `test("rejects setup replacement on a DWT", () => {\n  const tokenId = "${tokenId}";\n  const state = initializeGame({ rootDir });\n  applyAction(state, { type: "playCard", cardId: tokenId });\n  assert.equal(state.players[0]?.chips, 1);\n});\n`
  );

  const item = createRuntimeCoverageInventory(rootDir).items.find(
    (candidate) => candidate.id === tokenId
  );

  assert.ok(item);
  assert.equal(item.crossSourceStatus, "blocked");
  assert.ok(
    item.crossSourceBlockers.some((blocker) =>
      blocker.includes("violates source/timing policy")
    )
  );
});

test("cross-source coverage applies complete evidence to cards", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-cross-source-card-")
  );
  const cardId = "esw2_dbg__main_001";
  const textRu = "Получи 1 чипсину.";

  writeJson(
    rootDir,
    `data/import/cards/main/drafts/${cardId}.json`,
    createCardDraft(cardId, { textRu, markers: ["ongoing"] })
  );
  writeJson(rootDir, `data/cards/main/${cardId}.json`, {
    schemaVersion: 1,
    cardId,
    visible: { victoryPoints: 1 },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "supported",
      playableInV0: true,
      cardKind: "normal",
      cardTypes: ["spell"],
      cost: 3,
      victoryPoints: 1,
      isOngoing: true,
      effects: [{ effectId: "gain_chips", timing: "onPlay", amount: 1 }],
      unsupportedMechanics: [],
    },
  });
  writeJson(rootDir, "data/decks/main-deck.json", {
    deckId: "main-deck",
    role: "mainDeck",
    entries: [{ cardId, count: 2 }],
  });
  writeJson(rootDir, "config/runtime-coverage/cross-source-mechanics.json", {
    schemaVersion: 1,
    entries: [
      {
        id: cardId,
        objectKind: "card",
        primaryMechanicCluster: "chipsin-economy",
        semanticMappings: [
          {
            draftPoint: { path: "visible.textRu", value: textRu },
            runtimeRefs: [
              {
                kind: "effect",
                effectId: "gain_chips",
                timing: "onPlay",
                fields: { amount: 1 },
              },
            ],
            testRefs: [
              {
                file: "tests/card-runtime.test.ts",
                name: "gains a chip from the mapped card",
              },
            ],
          },
          {
            draftPoint: { path: "visible.victoryPoints", value: 1 },
            runtimeRefs: [
              { kind: "field", path: "visible.victoryPoints", value: 1 },
            ],
            testRefs: [
              {
                file: "tests/card-runtime.test.ts",
                name: "gains a chip from the mapped card",
              },
            ],
          },
          {
            draftPoint: { path: "visible.cost", value: 3 },
            runtimeRefs: [{ kind: "field", path: "engine.cost", value: 3 }],
            testRefs: [
              {
                file: "tests/card-runtime.test.ts",
                name: "gains a chip from the mapped card",
              },
            ],
          },
          {
            draftPoint: { path: "visible.cardKind", value: "normal" },
            runtimeRefs: [
              { kind: "field", path: "engine.cardKind", value: "normal" },
            ],
            testRefs: [
              {
                file: "tests/card-runtime.test.ts",
                name: "gains a chip from the mapped card",
              },
            ],
          },
          {
            draftPoint: { path: "visible.cardTypes", value: ["spell"] },
            runtimeRefs: [
              {
                kind: "field",
                path: "engine.cardTypes",
                value: ["spell"],
              },
            ],
            testRefs: [
              {
                file: "tests/card-runtime.test.ts",
                name: "gains a chip from the mapped card",
              },
            ],
          },
          {
            draftPoint: { path: "visible.markers", value: ["ongoing"] },
            runtimeRefs: [
              { kind: "field", path: "engine.isOngoing", value: true },
            ],
            testRefs: [
              {
                file: "tests/card-runtime.test.ts",
                name: "gains a chip from the mapped card",
              },
            ],
          },
        ],
        unresolvedMechanics: [],
      },
    ],
  });
  writeText(
    rootDir,
    "tests/card-runtime.test.ts",
    `test("gains a chip from the mapped card", () => {\n  const cardId = "${cardId}";\n  const state = initializeGame({ rootDir });\n  applyAction(state, { type: "playCard", cardId });\n  assert.equal(state.players[0]?.chips, 1);\n});\n`
  );

  const item = createRuntimeCoverageInventory(rootDir).items.find(
    (candidate) => candidate.id === cardId
  );

  assert.ok(item);
  assert.equal(item.crossSourceStatus, "crossSourceComplete");
  assert.equal(item.primaryMechanicCluster, "chipsin-economy");

  writeJson(rootDir, "data/decks/main-deck.json", {
    deckId: "main-deck",
    role: "mainDeck",
    entries: [{ tokenId: cardId, count: 2 }],
  });
  const itemWithTokenEntry = createRuntimeCoverageInventory(rootDir).items.find(
    (candidate) => candidate.id === cardId
  );

  assert.ok(itemWithTokenEntry);
  assert.equal(itemWithTokenEntry.crossSourceStatus, "blocked");
  assert.ok(
    itemWithTokenEntry.crossSourceBlockers.includes(
      "missing appropriate deck/stack/pool composition membership"
    )
  );

  writeJson(rootDir, "data/decks/main-deck.json", {
    deckId: "main-deck",
    role: "mainDeck",
    entries: [{ cardId, count: 2 }],
  });

  writeJson(rootDir, "config/runtime-coverage/cross-source-mechanics.json", {
    schemaVersion: 1,
    entries: [
      {
        id: cardId,
        objectKind: "card",
        primaryMechanicCluster: "chipsin-economy",
        semanticMappings: [],
        unresolvedMechanics: [],
      },
    ],
  });
  const itemWithoutCostMapping = createRuntimeCoverageInventory(
    rootDir
  ).items.find((candidate) => candidate.id === cardId);

  assert.ok(itemWithoutCostMapping);
  assert.equal(itemWithoutCostMapping.crossSourceStatus, "blocked");
  assert.ok(
    itemWithoutCostMapping.crossSourceBlockers.includes(
      "unmapped canonical draft point: visible.cost"
    )
  );
  assert.ok(
    itemWithoutCostMapping.crossSourceBlockers.includes(
      "unmapped canonical draft point: visible.markers"
    )
  );
});

test("cross-source coverage compares effect payloads and runtime fields", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-cross-source-runtime-values-")
  );
  const tokenId = "esw2_dbg__dead_wizard_token_001";
  const textRu = "Измени стоимость карты.";

  writeJson(
    rootDir,
    `data/import/tokens/dead-wizard-token/drafts/${tokenId}.json`,
    {
      schemaVersion: 1,
      draftKind: "deadWizardTokenDraft",
      tokenId,
      kind: "deadWizardToken",
      source: { image: "assets/dead-wizard-token/DWT_001.png" },
      visible: {
        sourceLabel: textRu,
        textRu,
        victoryPoints: -3,
        uncertainty: [],
      },
      notes: [],
      composition: { quantity: 1 },
    }
  );
  writeJson(rootDir, `data/tokens/dead-wizard/${tokenId}.json`, {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "deadWizardToken",
    victoryPoints: -3,
    effects: [
      {
        effectId: "modify_effective_value",
        timing: "whileControlled",
        valueKind: "cardCost",
        operation: "add",
        amount: 1,
        target: { targetType: "card", cardTypes: ["spell"] },
      },
    ],
  });
  writeJson(rootDir, "data/stacks/tokens/dead-wizard-tokens.json", {
    stackId: "dead-wizard-tokens",
    role: "deadWizardTokens",
    entries: [{ tokenId, count: 1 }],
  });
  const testRef = {
    file: "tests/dead-wizard-token-runtime.test.ts",
    name: "checks exact DWT runtime values",
  };
  writeJson(rootDir, "config/runtime-coverage/cross-source-mechanics.json", {
    schemaVersion: 1,
    entries: [
      {
        id: tokenId,
        objectKind: "deadWizardToken",
        primaryMechanicCluster: "ongoing-modifiers",
        semanticMappings: [
          {
            draftPoint: { path: "visible.textRu", value: textRu },
            runtimeRefs: [
              {
                kind: "effect",
                effectId: "modify_effective_value",
                timing: "whileControlled",
                fields: { amount: 1 },
              },
            ],
            testRefs: [testRef],
          },
          {
            draftPoint: { path: "visible.victoryPoints", value: -3 },
            runtimeRefs: [{ kind: "field", path: "victoryPoints", value: -4 }],
            testRefs: [testRef],
          },
        ],
        unresolvedMechanics: [],
      },
    ],
  });
  writeText(
    rootDir,
    testRef.file,
    `test("${testRef.name}", () => {\n  const tokenId = "${tokenId}";\n  const state = initializeGame({ rootDir });\n  applyAction(state, { type: "playCard", cardId: tokenId });\n  assert.equal(state.players[0]?.chips, 1);\n});\n`
  );

  const item = createRuntimeCoverageInventory(rootDir).items.find(
    (candidate) => candidate.id === tokenId
  );

  assert.ok(item);
  assert.equal(item.crossSourceStatus, "blocked");
  assert.ok(
    item.crossSourceBlockers.some((blocker) =>
      blocker.includes("runtime effect modify_effective_value@whileControlled")
    )
  );
  assert.ok(
    item.crossSourceBlockers.some((blocker) =>
      blocker.includes("runtime field victoryPoints")
    )
  );
});

test("runtime coverage blocks every missing runtime definition from composition", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-runtime-coverage-composition-")
  );
  const missingCardId = "esw2_dbg__main_999";

  writeJson(rootDir, "data/decks/main-deck.json", {
    deckId: "main-deck",
    role: "mainDeck",
    entries: [{ cardId: missingCardId, count: 1 }],
  });

  const report = createRuntimeCoverageInventory(rootDir);

  assert.deepEqual(report.crossSourceIntegrityBlockers, [
    `composition reference has no runtime definition: ${missingCardId}`,
  ]);
});

test("repository cross-source registry assigns every wizard property and DWT to a primary cluster", () => {
  const report = createRuntimeCoverageInventory(process.cwd());
  const wizardProperties = report.items.filter(
    (item) => item.objectKind === "wizardProperty"
  );
  const deadWizardTokens = report.items.filter(
    (item) => item.objectKind === "deadWizardToken"
  );
  const firstDeadWizardToken = deadWizardTokens.find(
    (item) => item.id === "esw2_dbg__dead_wizard_token_001"
  );
  const wizardProperty004 = wizardProperties.find(
    (item) => item.id === "esw2_dbg__wizard_property_004"
  );

  assert.equal(wizardProperties.length, 10);
  assert.equal(deadWizardTokens.length, 29);
  assert.ok(
    [...wizardProperties, ...deadWizardTokens].every(
      (item) => item.primaryMechanicCluster !== undefined
    )
  );
  assert.equal(report.crossSourceSummary.blocked, 159);
  assert.equal(report.crossSourceSummary.crossSourceComplete, 14);
  assert.ok(firstDeadWizardToken);
  assert.ok(wizardProperty004);
  assert.equal(wizardProperty004.crossSourceStatus, "crossSourceComplete");
  assert.deepEqual(wizardProperty004.crossSourceBlockers, []);
  assert.equal(firstDeadWizardToken.crossSourceStatus, "blocked");
  assert.ok(
    firstDeadWizardToken.crossSourceBlockerCodes.some(
      (blocker) =>
        blocker.code === "unresolved-capability" &&
        blocker.capabilityId ===
          "capability:esw2-dbg-dead-wizard-token-001-unresolved-1"
    )
  );
});

function assertUnresolvedDwtCapability(
  item: RuntimeCoverageInventoryItem,
  tokenNumber: string
): void {
  assert.ok(
    item.crossSourceBlockerCodes.some(
      (blocker) =>
        blocker.code === "unresolved-capability" &&
        blocker.capabilityId ===
          `capability:esw2-dbg-dead-wizard-token-${tokenNumber}-unresolved-1`
    )
  );
}

test("activation evidence keeps property 005 complete and exposes the DWT 005 lifecycle gap", () => {
  const report = createRuntimeCoverageInventory(process.cwd());
  const property = report.items.find(
    (candidate) => candidate.id === "esw2_dbg__wizard_property_005"
  );
  const dwt = report.items.find(
    (candidate) => candidate.id === "esw2_dbg__dead_wizard_token_005"
  );
  assert.ok(property);
  assert.equal(property.crossSourceStatus, "crossSourceComplete");
  assert.deepEqual(property.crossSourceBlockers, []);
  assert.ok(dwt);
  assert.equal(dwt.crossSourceStatus, "blocked");
  assertUnresolvedDwtCapability(dwt, "005");
});

test("dwt-interactions evidence remains mapped while DWT 022 and 023 await lifecycle support", () => {
  const report = createRuntimeCoverageInventory(process.cwd());
  for (const id of [
    "esw2_dbg__dead_wizard_token_022",
    "esw2_dbg__dead_wizard_token_023",
  ]) {
    const item = report.items.find((candidate) => candidate.id === id);
    assert.ok(item);
    assert.equal(item.crossSourceStatus, "blocked");
    assertUnresolvedDwtCapability(item, id.slice(-3));
  }
});

test("card-movement evidence keeps property 006 complete while DWT 006 and 010 await lifecycle support", () => {
  const report = createRuntimeCoverageInventory(process.cwd());
  const property = report.items.find(
    (candidate) => candidate.id === "esw2_dbg__wizard_property_006"
  );
  assert.ok(property);
  assert.equal(property.crossSourceStatus, "crossSourceComplete");
  assert.deepEqual(property.crossSourceBlockers, []);
  for (const id of [
    "esw2_dbg__dead_wizard_token_006",
    "esw2_dbg__dead_wizard_token_010",
  ]) {
    const item = report.items.find((candidate) => candidate.id === id);
    assert.ok(item);
    assert.equal(item.crossSourceStatus, "blocked");
    assertUnresolvedDwtCapability(item, id.slice(-3));
  }
});

test("card-movement evidence remains mapped while DWT 008, 009, and 011 await lifecycle support", () => {
  const report = createRuntimeCoverageInventory(process.cwd());
  for (const id of [
    "esw2_dbg__dead_wizard_token_008",
    "esw2_dbg__dead_wizard_token_009",
    "esw2_dbg__dead_wizard_token_011",
  ]) {
    const item = report.items.find((candidate) => candidate.id === id);
    assert.ok(item);
    assert.equal(item.crossSourceStatus, "blocked");
    assertUnresolvedDwtCapability(item, id.slice(-3));
  }
});

test("card-movement evidence remains mapped while DWT 024 awaits lifecycle support", () => {
  const report = createRuntimeCoverageInventory(process.cwd());
  const item = report.items.find(
    (candidate) => candidate.id === "esw2_dbg__dead_wizard_token_024"
  );
  assert.ok(item);
  assert.equal(item.crossSourceStatus, "blocked");
  assertUnresolvedDwtCapability(item, "024");
});

test("attack-effects cross-source evidence covers wizard property 009", () => {
  const report = createRuntimeCoverageInventory(process.cwd());
  const item = report.items.find(
    (candidate) => candidate.id === "esw2_dbg__wizard_property_009"
  );
  assert.ok(item);
  assert.equal(item.crossSourceStatus, "crossSourceComplete");
  assert.deepEqual(item.crossSourceBlockers, []);
});

test("semantic evidence rejects an ID that is present but not passed to the runtime seam", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-semantic-evidence-unused-id-")
  );
  const id = "esw2_dbg__main_001";
  const testName = "runtime seam does not use the claimed card";

  writeText(
    rootDir,
    "tests/semantic-evidence.test.ts",
    `test("${testName}", () => {
  const claimedId = "${id}";
  const state = initializeGame({ rootDir });
  const unrelatedDefinition = state.cardDefinitions.get("${id}");
  applyAction(state, { type: "playCard", cardId: "esw2_dbg__main_002" });
  assert.equal(state.players[0]?.chips, 1);
});
`
  );

  const evaluation = evaluateCrossSourceCoverage({
    rootDir,
    id,
    objectKind: "card",
    sourceGroupOrTokenKind: "main",
    draft: createSemanticEvidenceDraft(id),
    runtime: createSemanticEvidenceRuntime(id),
    compositionMembership: [{ role: "mainDeck", entryKind: "card", count: 1 }],
    planEntry: createSemanticEvidencePlanEntry({
      id,
      testName,
      testSubject: { kind: "binding", name: "claimedId" },
    }),
  });

  assert.equal(evaluation.status, "blocked");
  assert.ok(
    evaluation.blockers.some((blocker) =>
      blocker.includes("does not pass the claimed object to applyAction")
    )
  );
});

test("semantic evidence rejects a source kind declared for a foreign action path", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-semantic-evidence-source-kind-")
  );
  const id = "esw2_dbg__main_001";
  const testName = "runtime seam uses the wrong source kind";

  writeText(
    rootDir,
    "tests/semantic-evidence.test.ts",
    `test("${testName}", () => {
  const cardId = "${id}";
  const state = initializeGame({ rootDir });
  applyAction(state, { type: "playCard", cardId });
  assert.equal(state.players[0]?.chips, 1);
});
`
  );

  const evaluation = evaluateCrossSourceCoverage({
    rootDir,
    id,
    objectKind: "card",
    sourceGroupOrTokenKind: "main",
    draft: createSemanticEvidenceDraft(id),
    runtime: createSemanticEvidenceRuntime(id),
    compositionMembership: [{ role: "mainDeck", entryKind: "card", count: 1 }],
    planEntry: createSemanticEvidencePlanEntry({
      id,
      testName,
      executionObjectKind: "deadWizardToken",
      testSubject: { kind: "binding", name: "cardId" },
    }),
  });

  assert.equal(evaluation.status, "blocked");
  assert.ok(
    evaluation.blockers.some((blocker) =>
      blocker.includes(
        "execution object kind deadWizardToken does not match card"
      )
    )
  );
  const mismatch = evaluation.blockerCodes.find(
    (blocker) => blocker.code === "execution-object-kind-mismatch"
  );
  assert.equal(mismatch?.capabilityId, "capability:gain-chips");
  assert.equal(mismatch?.evidenceId, "evidence:card-gain-chips");
});

test("semantic evidence rejects a DWT passed through the card action path", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-semantic-evidence-action-path-")
  );
  const id = "esw2_dbg__dead_wizard_token_001";
  const textRu =
    "Получи вялую палочку за каждую легенду в твоей стопке сброса.";
  const testName = "does not play a dead wizard token as a card";

  writeJson(rootDir, `data/import/tokens/dead-wizard-token/drafts/${id}.json`, {
    schemaVersion: 1,
    draftKind: "deadWizardTokenDraft",
    tokenId: id,
    kind: "deadWizardToken",
    source: { image: "assets/dead-wizard-token/DWT_001.png" },
    visible: { textRu, victoryPoints: -3, uncertainty: [] },
    notes: [],
    composition: { quantity: 1 },
  });
  writeJson(rootDir, `data/tokens/dead-wizard/${id}.json`, {
    schemaVersion: 1,
    tokenId: id,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "deadWizardToken",
    victoryPoints: -3,
    effects: [
      {
        effectId: "dead_wizard_token_gain_limp_wands_per_discard_legend",
        timing: "onDeadWizardTokenFace",
        countedCardType: "legend",
        destination: "discard",
      },
    ],
  });
  writeJson(rootDir, "data/stacks/tokens/dead-wizard-tokens.json", {
    stackId: "dead-wizard-tokens",
    role: "deadWizardTokens",
    entries: [{ tokenId: id, count: 1 }],
  });
  writeJson(rootDir, "config/runtime-coverage/cross-source-mechanics.json", {
    schemaVersion: 2,
    entries: [
      {
        id,
        objectKind: "deadWizardToken",
        primaryMechanicCluster: "special-card-stack",
        requiredCapabilities: ["capability:dwt-face"],
        unresolvedCapabilities: [],
        semanticMappings: [
          {
            capabilityId: "capability:dwt-face",
            evidenceId: "evidence:dwt-face",
            draftPoint: { path: "visible.textRu", value: textRu },
            runtimeRefs: [
              {
                kind: "effect",
                effectId:
                  "dead_wizard_token_gain_limp_wands_per_discard_legend",
                timing: "onDeadWizardTokenFace",
                fields: { countedCardType: "legend", destination: "discard" },
              },
            ],
            testRefs: [
              {
                file: "tests/semantic-evidence.test.ts",
                name: testName,
                execution: {
                  seam: "applyAction",
                  objectKind: "deadWizardToken",
                  subject: { kind: "binding", name: "tokenId" },
                },
                observation: {
                  kind: "assertion",
                  target: "state.players[0].chips",
                },
              },
            ],
          },
        ],
      },
    ],
  });
  writeText(
    rootDir,
    "tests/semantic-evidence.test.ts",
    `test("${testName}", () => {
  const tokenId = "${id}";
  const state = initializeGame({ rootDir });
  applyAction(state, { type: "playCard", cardInstanceId: tokenId });
  assert.equal(state.players[0]?.chips, 1);
});
`
  );

  const evaluation = evaluateCrossSourceCoverage({
    rootDir,
    id,
    objectKind: "deadWizardToken",
    sourceGroupOrTokenKind: "deadWizardToken",
    draft: {
      draftKind: "deadWizardTokenDraft",
      tokenId: id,
      kind: "deadWizardToken",
      visible: { textRu, victoryPoints: -3, uncertainty: [] },
      notes: [],
      composition: { quantity: 1 },
    },
    runtime: {
      tokenId: id,
      kind: "deadWizardToken",
      victoryPoints: -3,
      effects: [
        {
          effectId: "dead_wizard_token_gain_limp_wands_per_discard_legend",
          timing: "onDeadWizardTokenFace",
          countedCardType: "legend",
          destination: "discard",
        },
      ],
    },
    compositionMembership: [
      { role: "deadWizardTokens", entryKind: "token", count: 1 },
    ],
    planEntry: {
      id,
      objectKind: "deadWizardToken",
      primaryMechanicCluster: "special-card-stack",
      requiredCapabilities: ["capability:dwt-face"],
      unresolvedCapabilities: [],
      semanticMappings: [
        {
          capabilityId: "capability:dwt-face",
          evidenceId: "evidence:dwt-face",
          draftPoint: { path: "visible.textRu", value: textRu },
          runtimeRefs: [
            {
              kind: "effect",
              effectId: "dead_wizard_token_gain_limp_wands_per_discard_legend",
              timing: "onDeadWizardTokenFace",
              fields: { countedCardType: "legend", destination: "discard" },
            },
          ],
          testRefs: [
            {
              file: "tests/semantic-evidence.test.ts",
              name: testName,
              execution: {
                seam: "applyAction",
                objectKind: "deadWizardToken",
                subject: { kind: "binding", name: "tokenId" },
              },
              observation: {
                kind: "assertion",
                target: "state.players[0].chips",
              },
            },
          ],
        },
      ],
    },
  });

  assert.equal(evaluation.status, "blocked");
  assert.ok(
    evaluation.blockerCodes.some(
      (blocker) => blocker.code === "execution-action-path-not-allowed"
    )
  );
  assert.ok(
    evaluation.blockers.some((blocker) =>
      blocker.includes("applyAction path playCard is not allowed")
    )
  );
});

test("semantic evidence keeps a required capability open when its evidence mapping is removed", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-semantic-evidence-capability-")
  );
  const id = "esw2_dbg__main_001";
  const testName = "runtime seam proves one capability";

  writeText(
    rootDir,
    "tests/semantic-evidence.test.ts",
    `test("${testName}", () => {
  const cardId = "${id}";
  const state = initializeGame({ rootDir });
  applyAction(state, { type: "playCard", cardId });
  assert.equal(state.players[0]?.chips, 1);
});
`
  );

  const planEntry = createSemanticEvidencePlanEntry({
    id,
    testName,
    testSubject: { kind: "binding", name: "cardId" },
  });
  planEntry.requiredCapabilities = [
    "capability:gain-chips",
    "capability:missing-after-edit",
  ];

  const evaluation = evaluateCrossSourceCoverage({
    rootDir,
    id,
    objectKind: "card",
    sourceGroupOrTokenKind: "main",
    draft: createSemanticEvidenceDraft(id),
    runtime: createSemanticEvidenceRuntime(id),
    compositionMembership: [{ role: "mainDeck", entryKind: "card", count: 1 }],
    planEntry,
  });

  assert.equal(evaluation.status, "blocked");
  assert.ok(
    evaluation.blockerCodes.some(
      (blocker) => blocker.code === "required-capability-uncovered"
    )
  );
});

test("runtime semantic completion audit separates structural and semantic status", () => {
  const report = createRuntimeSemanticCompletionReport(process.cwd());

  assert.equal(report.structuralStatus, "complete");
  assert.equal(report.status, "BLOCKED");
  assert.equal(report.semanticStatus, "blocked");
  assert.deepEqual(report.byKind.card, {
    expected: 134,
    actual: 134,
    structuralComplete: 134,
    semanticComplete: 0,
  });
  assert.deepEqual(report.byKind.wizardProperty, {
    expected: 10,
    actual: 10,
    structuralComplete: 10,
    semanticComplete: 10,
  });
  assert.deepEqual(report.byKind.deadWizardToken, {
    expected: 29,
    actual: 29,
    structuralComplete: 29,
    semanticComplete: report.byKind.deadWizardToken.semanticComplete,
  });
  assert.deepEqual(report.productionStack, {
    expectedPhysicalCount: 30,
    physicalCount: 30,
    namedDefinitionCount: 29,
    neutralCount: 0,
    dwt003Count: 2,
    structuralStatus: "complete",
  });
  const dwtItems = report.items.filter(
    (item) => item.objectKind === "deadWizardToken"
  );
  assert.equal(dwtItems.length, 29);
  assert.ok(
    dwtItems.every(
      (item) =>
        item.focusedTestEvidence.length > 0 && item.lifecycleClasses.length > 0
    )
  );
  assert.ok(
    report.blockers.some(
      (blocker) => blocker.code === "false-semantic-evidence"
    )
  );
  const transferDwt = dwtItems.find((item) =>
    item.id.endsWith("dead_wizard_token_010")
  );
  assert.ok(transferDwt?.lifecycleClasses.includes("transfer"));
  const preRespawnDwt = dwtItems.find((item) =>
    item.id.endsWith("dead_wizard_token_026")
  );
  assert.ok(preRespawnDwt?.lifecycleClasses.includes("pre-respawn"));
  if (report.semanticStatus === "blocked") {
    assert.ok(
      report.blockers.some(
        (blocker) => blocker.code === "required-capability-open"
      )
    );
  }

  const markdown = formatRuntimeSemanticCompletionMarkdown(report);
  assert.match(markdown, /Structural status/);
  assert.match(markdown, /Semantic status/);
  assert.match(markdown, /production physical DWT: 30/);
  assert.match(markdown, /semanticComplete: \d+ /);
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

function createSemanticEvidenceDraft(cardId: string) {
  return {
    schemaVersion: 1,
    draftKind: "cardDraft",
    cardId,
    source: { image: "assets/cards/main/example.png" },
    visible: {
      nameRu: "Проверочная карта",
      cost: 1,
      victoryPoints: 1,
      typeRu: "Заклинание",
      cardKind: "normal",
      cardTypes: ["spell"],
      textRu: "Получи чипсину.",
      markers: [],
      uncertainty: [],
    },
    notes: [],
    composition: { quantity: 1 },
  };
}

function createSemanticEvidenceRuntime(cardId: string) {
  return {
    cardId,
    engine: {
      effects: [{ effectId: "gain_chips", timing: "onPlay", amount: 1 }],
    },
  };
}

function createSemanticEvidencePlanEntry(input: {
  id: string;
  testName: string;
  executionObjectKind?: "card" | "wizardProperty" | "deadWizardToken";
  testSubject: { kind: "binding"; name: string };
}): CrossSourceCoveragePlanEntry {
  return {
    id: input.id,
    objectKind: "card" as const,
    primaryMechanicCluster: "scoring",
    requiredCapabilities: ["capability:gain-chips"],
    semanticMappings: [
      {
        capabilityId: "capability:gain-chips",
        evidenceId: "evidence:card-gain-chips",
        draftPoint: {
          path: "visible.textRu",
          value: "Получи чипсину.",
        },
        runtimeRefs: [
          {
            kind: "effect" as const,
            effectId: "gain_chips",
            timing: "onPlay",
            fields: { amount: 1 },
          },
        ],
        testRefs: [
          {
            file: "tests/semantic-evidence.test.ts",
            name: input.testName,
            execution: {
              seam: "applyAction",
              objectKind: input.executionObjectKind ?? "card",
              subject: input.testSubject,
            },
            observation: {
              kind: "assertion",
              target: "state.players[0].chips",
            },
          },
        ],
      },
    ],
    unresolvedMechanics: [],
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
