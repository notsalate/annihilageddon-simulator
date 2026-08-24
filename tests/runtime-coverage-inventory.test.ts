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
  assert.equal(deadWizardTokens.length, 28);
  assert.ok(
    [...wizardProperties, ...deadWizardTokens].every(
      (item) => item.primaryMechanicCluster !== undefined
    )
  );
  assert.equal(report.crossSourceSummary.blocked, 168);
  assert.equal(report.crossSourceSummary.crossSourceComplete, 4);
  assert.ok(firstDeadWizardToken);
  assert.ok(wizardProperty004);
  assert.equal(wizardProperty004.crossSourceStatus, "crossSourceComplete");
  assert.deepEqual(wizardProperty004.crossSourceBlockers, []);
  assert.equal(firstDeadWizardToken.crossSourceStatus, "blocked");
  assert.ok(
    firstDeadWizardToken.crossSourceBlockers.includes("runtime has no effects")
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
