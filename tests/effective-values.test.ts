import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateEffectiveCardCost,
  calculateEffectiveCardVictoryPoints,
  calculateEffectivePlayerMaxLife,
  calculateEffectivePlayerVictoryPoints,
  calculateEffectiveTokenVictoryPoints,
  determineWinnerIds,
  initializeGame,
  applyAction,
  listLegalActions,
  scoreGame,
  type CardInstance,
  type CardDefinition,
  type LoadedDataPack,
  type RuntimeEffect,
  type StatusInstance,
  type TokenDefinition,
  type TrophyLikeInstance,
} from "../src/index.js";
import { calculateEffectiveCardCost as calculateEffectiveCardCostFromDomain } from "../src/engine/effective-values.js";
import { loadCurrentRuntimeDataPack } from "../src/engine/data.js";
import { gainDeadWizardToken } from "../src/engine/effect-runtime.js";
import { createRuntimeCoverageInventory } from "../src/import/runtime-coverage-inventory.js";
import {
  buildControlledObjectView,
  grantTemporaryControl,
  listOwnedScoringCards,
} from "../src/engine/control-ledger.js";
import { addFixtureDefinitionToActiveHand } from "./helpers/fixture-cards.js";
import {
  markCardInstanceId,
  markCardDefinitionId,
  markTokenDefinitionId,
  markTokenInstanceId,
} from "../src/domain/types.js";
import { verifiedTestRuntimeEffect } from "./helpers/verified-runtime-effect.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

test("реальный ЖДК 002 даёт полный штраф в -6 ПО", () => {
  const state = initializeGame({ rootDir, seed: 60202 });
  const player = state.players[0];
  assert.ok(player);
  const scoreBefore = scoreGame(state).find(
    (candidate) => candidate.playerId === player.playerId
  );
  assert.ok(scoreBefore);

  player.deadWizardTokens.push({
    instanceId: markTokenInstanceId("real-dwt-002"),
    definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_002"),
    ownerId: player.playerId,
  });

  const definition = state.tokenDefinitions.get(
    "esw2_dbg__dead_wizard_token_002"
  );
  assert.equal(definition?.kind, "deadWizardToken");
  assert.equal(
    definition?.kind === "deadWizardToken"
      ? definition.victoryPoints
      : undefined,
    -6
  );
  const scoreAfter = scoreGame(state).find(
    (candidate) => candidate.playerId === player.playerId
  );
  assert.ok(scoreAfter);
  assert.equal(scoreAfter.victoryPoints, scoreBefore.victoryPoints - 6);
  assert.equal(scoreAfter.deadWizardTokenCount, 1);
});

test("пара реальных ЖДК 003 исключается из очков и tie-breaker", () => {
  const state = initializeGame({ rootDir, seed: 60203 });
  const [firstPlayer, secondPlayer] = state.players;
  assert.ok(firstPlayer);
  assert.ok(secondPlayer);
  for (const player of state.players) {
    player.deck.splice(0);
    player.hand.splice(0);
    player.discard.splice(0);
    player.playedThisTurn.splice(0);
    player.permanents.splice(0);
  }

  firstPlayer.deadWizardTokens.push({
    instanceId: markTokenInstanceId("real-dwt-003-first"),
    definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_003"),
    ownerId: firstPlayer.playerId,
  });

  const scoreWithOneToken = scoreGame(state).find(
    (score) => score.playerId === firstPlayer.playerId
  );
  assert.ok(scoreWithOneToken);
  assert.equal(scoreWithOneToken.victoryPoints, -8);
  assert.equal(scoreWithOneToken.deadWizardTokenCount, 1);

  secondPlayer.deadWizardTokens.push({
    instanceId: markTokenInstanceId("real-dwt-003-second"),
    definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_003"),
    ownerId: secondPlayer.playerId,
  });

  const scores = scoreGame(state);
  assert.deepEqual(
    scores.map(({ victoryPoints, deadWizardTokenCount }) => ({
      victoryPoints,
      deadWizardTokenCount,
    })),
    [
      { victoryPoints: 0, deadWizardTokenCount: 0 },
      { victoryPoints: 0, deadWizardTokenCount: 0 },
    ]
  );
  assert.deepEqual(determineWinnerIds(scores), [
    firstPlayer.playerId,
    secondPlayer.playerId,
  ]);
});

test("реальный ЖДК 029 удваивает уже инвертированные ПО вялых палочек", () => {
  const state = initializeGame({ rootDir, seed: 60229 });
  const player = state.players[0];
  assert.ok(player);
  const scoreBefore = scoreGame(state).find(
    (candidate) => candidate.playerId === player.playerId
  );
  assert.ok(scoreBefore);
  player.discard.push(
    createCardInstance(
      "real-dwt-029-limp-wand-1",
      "esw2_dbg__limp_wand",
      player.playerId
    ),
    createCardInstance(
      "real-dwt-029-limp-wand-2",
      "esw2_dbg__limp_wand",
      player.playerId
    )
  );
  const scoreWithNegativeWands = scoreGame(state).find(
    (candidate) => candidate.playerId === player.playerId
  );
  assert.ok(scoreWithNegativeWands);
  assert.equal(
    scoreWithNegativeWands.victoryPoints,
    scoreBefore.victoryPoints - 2
  );

  player.deadWizardTokens.push({
    instanceId: markTokenInstanceId("real-dwt-029"),
    definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_029"),
    ownerId: player.playerId,
  });

  const scoreAfterNegativeDoubling = scoreGame(state).find(
    (candidate) => candidate.playerId === player.playerId
  );
  assert.ok(scoreAfterNegativeDoubling);
  assert.equal(
    scoreAfterNegativeDoubling.victoryPoints,
    scoreBefore.victoryPoints - 7
  );

  player.statuses.push({
    instanceId: markCardInstanceId("fixture-limp-wand-vp-inverter"),
    statusId: "fixture-limp-wand-vp-inverter",
    ownerId: player.playerId,
    effects: [
      verifiedTestRuntimeEffect({
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "cardVictoryPoints",
        operation: "invertNegative",
        target: {
          targetType: "card",
          definitionId: "esw2_dbg__limp_wand",
        },
      }),
    ],
  });
  const scoreAfterInversion = scoreGame(state).find(
    (candidate) => candidate.playerId === player.playerId
  );
  assert.ok(scoreAfterInversion);
  assert.equal(
    scoreAfterInversion.victoryPoints,
    scoreBefore.victoryPoints + 1
  );
});

test("ЖДК 026 удваивает только активный штраф статуса лошары", () => {
  const state = initializeGame({ rootDir, seed: 305026 });
  const player = state.players.find(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  assert.ok(player);
  for (const candidate of state.players) {
    candidate.deck = [];
    candidate.hand = [];
    candidate.discard = [];
    candidate.playedThisTurn = [];
    candidate.permanents = [];
    candidate.wizardProperties = [];
    candidate.statuses = [];
    candidate.deadWizardTokens = [];
  }
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt026"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_026"),
      ownerId: "common",
    },
  ];
  const scoreBefore = scoreGame(state).find(
    (score) => score.playerId === player.playerId
  );
  assert.ok(scoreBefore);

  assert.deepEqual(gainDeadWizardToken(state, player), { ok: true });
  assert.equal(
    player.statuses.some((status) => status.statusId === "dingler"),
    true
  );
  assert.equal(
    scoreGame(state).find((score) => score.playerId === player.playerId)
      ?.victoryPoints,
    scoreBefore.victoryPoints - 13
  );

  player.statuses.push({
    instanceId: markCardInstanceId("fixture-dwt026-invert-dingler-vp"),
    statusId: "fixture-dwt026-invert-dingler-vp",
    ownerId: player.playerId,
    effects: [
      verifiedTestRuntimeEffect({
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerVictoryPoints",
        operation: "invertNegative",
        target: { targetType: "player" },
      }),
    ],
  });
  assert.equal(
    scoreGame(state).find((score) => score.playerId === player.playerId)
      ?.victoryPoints,
    scoreBefore.victoryPoints + 7
  );

  const removeStatusDefinition = createTypedFixtureCardDefinition(
    "fixture-dwt026-remove-status",
    [],
    0,
    0
  );
  removeStatusDefinition.engine.effects = [
    verifiedTestRuntimeEffect({
      effectId: "remove_status",
      timing: "onPlay",
      statusId: "dingler",
      target: { selector: "activePlayer" },
    }),
  ];
  const removeStatus = addFixtureDefinitionToActiveHand(
    state,
    removeStatusDefinition
  );
  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: removeStatus.instanceId,
    }),
    { ok: true }
  );
  assert.equal(
    player.statuses.some((status) => status.statusId === "dingler"),
    false
  );
  assert.equal(
    scoreGame(state).find((score) => score.playerId === player.playerId)
      ?.victoryPoints,
    scoreBefore.victoryPoints - 3
  );
});

test("Effective Value rejects a runtime effect that bypassed Runtime Data Intake", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60617,
  });
  const player = state.players[0];
  assert.ok(player);
  player.statuses.push({
    instanceId: markCardInstanceId("fixture-unverified-effective-value-status"),
    statusId: "fixture-unverified-effective-value-status",
    ownerId: player.playerId,
    effects: [
      {
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "cardCost",
        operation: "add",
        amount: 1,
        target: { targetType: "card", definitionId: "missing-card" },
      },
    ],
  });
  const card = state.common.market[0];
  assert.ok(card);
  const definition = state.cardDefinitions.get(card.definitionId);
  assert.ok(definition);

  assert.throws(
    () =>
      calculateEffectiveCardCostFromDomain(state, player.playerId, definition),
    /must pass Runtime Data Intake/
  );
});

test("Effective Value domain interface applies typed modifiers without a Catalog dispatcher", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60618,
  });
  const player = state.players[0];
  const card = state.common.market[0];
  assert.ok(player);
  assert.ok(card);
  const cardDefinition = state.cardDefinitions.get(card.definitionId);
  assert.ok(cardDefinition);
  player.statuses.push({
    instanceId: markCardInstanceId("fixture-domain-effective-value-status"),
    statusId: "fixture-domain-effective-value-status",
    ownerId: player.playerId,
    effects: [
      verifiedTestRuntimeEffect({
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "cardCost",
        operation: "add",
        amount: 1,
        target: { targetType: "card", definitionId: cardDefinition.cardId },
      }),
    ],
  });

  assert.equal(
    calculateEffectiveCardCostFromDomain(
      state,
      player.playerId,
      cardDefinition
    ),
    cardDefinition.engine.cost + 1
  );
});

test("effective-value modifiers keep discovery order", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60619,
  });
  const player = state.players[0];
  assert.ok(player);
  player.statuses.push({
    instanceId: markCardInstanceId("fixture-effective-value-order-status"),
    statusId: "fixture-effective-value-order-status",
    ownerId: player.playerId,
    effects: [
      verifiedTestRuntimeEffect({
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerVictoryPoints",
        operation: "invertNegative",
        target: { targetType: "player" },
      }),
      verifiedTestRuntimeEffect({
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerVictoryPoints",
        operation: "add",
        amount: 5,
        target: { targetType: "player" },
      }),
    ],
  });

  assert.equal(
    calculateEffectivePlayerVictoryPoints(state, player.playerId, -2),
    7
  );
});

test("repeated typed modifiers reuse one scoring-card type index", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60620,
  });
  const player = state.players[0];
  assert.ok(player);
  const treasure = createTypedFixtureCardDefinition(
    "fixture-indexed-treasure",
    ["treasure"],
    3,
    1
  );
  const spell = createTypedFixtureCardDefinition(
    "fixture-indexed-spell",
    ["spell"],
    4,
    1
  );
  const stateWithFixtures = {
    ...state,
    cardDefinitions: new Map([
      ...state.cardDefinitions,
      [treasure.cardId, treasure],
      [spell.cardId, spell],
    ]),
  };
  player.discard.push(
    createCardInstance(
      "fixture-indexed-treasure-instance",
      treasure.cardId,
      player.playerId
    ),
    createCardInstance(
      "fixture-indexed-spell-instance",
      spell.cardId,
      player.playerId
    )
  );
  player.statuses.push({
    instanceId: markCardInstanceId("fixture-indexed-status"),
    statusId: "fixture-indexed-status",
    ownerId: player.playerId,
    effects: [
      verifiedTestRuntimeEffect({
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerVictoryPoints",
        operation: "add",
        amountPerOwnedCard: 2,
        countedCardTypes: ["treasure"],
        target: { targetType: "player" },
      }),
      verifiedTestRuntimeEffect({
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerVictoryPoints",
        operation: "add",
        amountPerOwnedCard: 3,
        countedCardTypes: ["treasure", "spell", "treasure"],
        target: { targetType: "player" },
      }),
    ],
  });

  assert.equal(
    calculateEffectivePlayerVictoryPoints(
      stateWithFixtures,
      player.playerId,
      0
    ),
    8
  );
});

test("per-owned-card modifiers still load scoring cards lazily", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60621,
  });
  const player = state.players[0];
  const targetCard = state.common.market[0];
  assert.ok(player);
  assert.ok(targetCard);
  const targetDefinition = state.cardDefinitions.get(targetCard.definitionId);
  assert.ok(targetDefinition);

  const scoringCard = createTypedFixtureCardDefinition(
    "fixture-lazy-scoring-card",
    ["treasure"],
    2,
    1
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [scoringCard.cardId, scoringCard],
  ]);
  player.discard.push(
    createCardInstance(
      "fixture-lazy-scoring-card-instance",
      scoringCard.cardId,
      player.playerId
    )
  );
  player.statuses.push({
    instanceId: markCardInstanceId("fixture-lazy-scoring-status"),
    statusId: "fixture-lazy-scoring-status",
    ownerId: player.playerId,
    effects: [
      verifiedTestRuntimeEffect({
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "cardCost",
        operation: "add",
        amountPerOwnedCard: 2,
        countedCardTypes: ["treasure"],
        target: { targetType: "card", definitionId: targetDefinition.cardId },
      }),
    ],
  });

  assert.equal(
    calculateEffectiveCardCostFromDomain(
      state,
      player.playerId,
      targetDefinition
    ),
    targetDefinition.engine.cost + 2
  );
});

test("current runtime keeps fifteen effectless Limp Wands worth minus one VP", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const state = initializeGame({ dataPack, seed: 60615 });
  const player = state.players[0];
  assert.ok(player);
  const scoreBefore = scoreGame(state).find(
    (score) => score.playerId === player.playerId
  );
  assert.ok(scoreBefore);
  const limpWand = dataPack.cardDefinitions.get("esw2_dbg__limp_wand");

  assert.deepEqual(dataPack.decks.limpWandStack.entries, [
    { cardId: "esw2_dbg__limp_wand", count: 15 },
  ]);
  assert.equal(limpWand?.engine.effects.length, 0);
  player.discard.push(
    createCardInstance(
      "fixture-limp-wand",
      "esw2_dbg__limp_wand",
      player.playerId
    )
  );

  assert.equal(
    scoreGame(state).find((score) => score.playerId === player.playerId)
      ?.victoryPoints,
    scoreBefore.victoryPoints - 1
  );
});

test("a controlled fixture object can modify a card's effective cost without mutating base data", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const player = state.players.find(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  assert.ok(player);
  const marketCard = state.common.market[0];
  assert.ok(marketCard);
  const definition = state.cardDefinitions.get(marketCard.definitionId);
  assert.ok(definition);
  const baseCost = definition.engine.cost;
  state.turn.power = Math.max(0, baseCost - 2);
  player.statuses.push(
    createCostModifierStatus(player.playerId, marketCard.definitionId, -2)
  );

  const effectiveCost = calculateEffectiveCardCost(
    state,
    player.playerId,
    definition
  );
  const legalActions = listLegalActions(state);

  assert.equal(effectiveCost, baseCost - 2);
  assert.equal(definition.engine.cost, baseCost);
  assert.ok(
    legalActions.some(
      (action) =>
        action.type === "buyMarketCard" &&
        action.cardInstanceId === marketCard.instanceId
    )
  );
});

test("omitting the controlled object removes the effective cost modifier", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const player = state.players.find(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  assert.ok(player);
  const marketCard = state.common.market[0];
  assert.ok(marketCard);
  const definition = state.cardDefinitions.get(marketCard.definitionId);
  assert.ok(definition);
  const baseCost = definition.engine.cost;
  state.turn.power = Math.max(0, baseCost - 2);

  const effectiveCost = calculateEffectiveCardCost(
    state,
    player.playerId,
    definition
  );
  const legalActions = listLegalActions(state);

  assert.equal(effectiveCost, baseCost);
  assert.equal(definition.engine.cost, baseCost);
  assert.equal(
    legalActions.some(
      (action) =>
        action.type === "buyMarketCard" &&
        action.cardInstanceId === marketCard.instanceId
    ),
    state.turn.power >= baseCost
  );
});

test("controlled object view gathers separately stored cards, tokens, wizard properties, statuses, and trophy-like objects", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const player = state.players[0];
  assert.ok(player);
  const permanent = state.common.market.shift();
  assert.ok(permanent);
  permanent.ownerId = player.playerId;
  player.permanents.push(permanent);
  assert.equal(state.common.deadWizardTokens.status, "available");
  const token = state.common.deadWizardTokens.drawStack.shift();
  assert.ok(token);
  token.ownerId = player.playerId;
  player.deadWizardTokens.push(token);
  const status = createCostModifierStatus(
    player.playerId,
    permanent.definitionId,
    -1
  );
  const trophy = createCostModifierTrophy(
    player.playerId,
    permanent.definitionId,
    -1
  );
  player.statuses.push(status);
  player.trophyLikeObjects.push(trophy);

  const view = buildControlledObjectView(state, player.playerId);

  assert.deepEqual(
    {
      cards: view.cards.map((object) => object.card.instanceId),
      tokens: view.tokens.map((object) => object.token.instanceId),
      wizardProperties: view.wizardProperties.map(
        (object) => object.token.instanceId
      ),
      statuses: view.statuses.map((object) => object.instanceId),
      trophyLikeObjects: view.trophyLikeObjects.map(
        (object) => object.instanceId
      ),
    },
    {
      cards: [permanent.instanceId],
      tokens: [token.instanceId],
      wizardProperties: player.wizardProperties.map(
        (object) => object.instanceId
      ),
      statuses: [status.instanceId],
      trophyLikeObjects: [trophy.instanceId],
    }
  );
});

test("a controlled fixture object can modify token scoring without mutating token definitions", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const player = state.players[0];
  assert.ok(player);
  assert.equal(state.common.deadWizardTokens.status, "available");
  const token = state.common.deadWizardTokens.drawStack.shift();
  assert.ok(token);
  token.ownerId = player.playerId;
  player.deadWizardTokens.push(token);
  const definition = state.tokenDefinitions.get(token.definitionId);
  assert.equal(definition?.kind, "deadWizardToken");
  const baseVictoryPoints = definition.victoryPoints;
  player.trophyLikeObjects.push(
    createTokenVictoryPointModifierTrophy(
      player.playerId,
      token.definitionId,
      1
    )
  );

  const expectedCardScore = [
    ...player.hand,
    ...player.deck,
    ...player.discard,
  ].reduce((total, card) => {
    return (
      total + state.cardDefinitions.get(card.definitionId)!.engine.victoryPoints
    );
  }, 0);
  const score = scoreGame(state).find(
    (candidate) => candidate.playerId === player.playerId
  );

  assert.ok(score);
  assert.equal(score.victoryPoints, expectedCardScore + baseVictoryPoints + 1);
  assert.equal(definition.victoryPoints, baseVictoryPoints);
});

test("wizard property discount and scoring modifier apply to owned treasures", () => {
  const treasure = createTypedFixtureCardDefinition(
    "fixture-treasure",
    ["treasure"],
    5,
    2
  );
  const spell = createTypedFixtureCardDefinition(
    "fixture-spell",
    ["spell"],
    5,
    2
  );
  const dataPack = createTreasureModifierDataPack(
    loadCurrentRuntimeDataPack(rootDir, playableRuntimeDataPackPath),
    treasure,
    spell
  );
  const state = initializeGame({ dataPack, seed: 60615 });
  const player = state.players[0];
  assert.ok(player);
  player.discard.push({
    instanceId: markCardInstanceId("fixture-owned-treasure"),
    definitionId: markCardDefinitionId(treasure.cardId),
    ownerId: player.playerId,
    marketChips: 0,
  });

  assert.equal(calculateEffectiveCardCost(state, player.playerId, treasure), 4);
  assert.equal(calculateEffectiveCardCost(state, player.playerId, spell), 5);
  assert.equal(
    scoreGame(state).find((score) => score.playerId === player.playerId)
      ?.victoryPoints,
    3
  );
});

test("свойство колдуна 004 удешевляет обычное и легендарное сокровища и добавляет им ПО", () => {
  const propertyId = "esw2_dbg__wizard_property_004";
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const wizardPropertyStack = dataPack.tokenStacks.wizardProperties;
  assert.ok(wizardPropertyStack);
  const state = initializeGame({
    dataPack: {
      ...dataPack,
      tokenStacks: {
        ...dataPack.tokenStacks,
        wizardProperties: {
          ...wizardPropertyStack,
          entries: [{ tokenId: propertyId, count: 4 }],
        },
      },
    },
    seed: 60616,
  });
  const player = state.players.find(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  const treasure = state.cardDefinitions.get("esw2_dbg__main_015");
  const legendTreasure = state.cardDefinitions.get("esw2_dbg__legend_025");
  assert.ok(player);
  assert.ok(treasure);
  assert.ok(legendTreasure);
  assert.equal(
    state.players.find(
      (candidate) => candidate.playerId === state.activePlayerId
    )?.wizardProperties[0]?.definitionId,
    propertyId
  );

  const ownedTreasure = createCardInstance(
    "property-004-owned-treasure",
    treasure.cardId,
    player.playerId
  );
  const ownedLegendTreasure = createCardInstance(
    "property-004-owned-legend-treasure",
    legendTreasure.cardId,
    player.playerId
  );
  state.common.market.splice(0, state.common.market.length, ownedTreasure);
  state.common.legendMarket.splice(
    0,
    state.common.legendMarket.length,
    ownedLegendTreasure
  );
  state.turn.power = treasure.engine.cost - 1;
  assert.equal(
    applyAction(state, {
      type: "buyMarketCard",
      source: "mainMarket",
      cardInstanceId: ownedTreasure.instanceId,
    }).ok,
    true
  );
  assert.equal(state.turn.power, 0);
  state.turn.power = legendTreasure.engine.cost - 1;
  assert.equal(
    applyAction(state, {
      type: "buyMarketCard",
      source: "legendMarket",
      cardInstanceId: ownedLegendTreasure.instanceId,
    }).ok,
    true
  );
  assert.equal(state.turn.power, 0);
  assert.equal(player.discard.includes(ownedTreasure), true);
  assert.equal(player.discard.includes(ownedLegendTreasure), true);

  assert.equal(
    calculateEffectiveCardCost(state, player.playerId, treasure),
    treasure.engine.cost - 1
  );
  assert.equal(
    calculateEffectiveCardCost(state, player.playerId, legendTreasure),
    legendTreasure.engine.cost - 1
  );
  assert.equal(
    calculateEffectiveCardVictoryPoints(
      state,
      player.playerId,
      treasure,
      ownedTreasure
    ),
    treasure.engine.victoryPoints + 1
  );
  assert.equal(
    calculateEffectiveCardVictoryPoints(
      state,
      player.playerId,
      legendTreasure,
      ownedLegendTreasure
    ),
    legendTreasure.engine.victoryPoints + 1
  );
  assert.equal(
    scoreGame(state).find((score) => score.playerId === player.playerId)
      ?.victoryPoints,
    treasure.engine.victoryPoints + legendTreasure.engine.victoryPoints + 2
  );

  const coverage = createRuntimeCoverageInventory(rootDir).items.find(
    (item) => item.id === propertyId
  );
  assert.ok(coverage);
  assert.equal(coverage.crossSourceStatus, "crossSourceComplete");
  assert.deepEqual(coverage.crossSourceBlockers, []);
});

test("non-executable wizard property effects fail instead of applying silently", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const player = state.players[0];
  assert.ok(player);
  const wizardProperty = player.wizardProperties[0];
  assert.ok(wizardProperty);
  const tokenDefinitions = new Map(state.tokenDefinitions);
  tokenDefinitions.set(
    wizardProperty.definitionId,
    createNonExecutableMaxLifeWizardProperty(wizardProperty.definitionId, 3)
  );
  const stateWithDraftEffect = {
    ...state,
    tokenDefinitions,
  };

  assert.throws(
    () =>
      calculateEffectivePlayerMaxLife(stateWithDraftEffect, player.playerId),
    /Cannot execute non-playable wizard property/
  );
});

test("Dingler scoring penalty is an effective player victory point modifier", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const player = state.players.find(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  assert.ok(player);
  const firstCard = player.hand[0];
  assert.ok(firstCard);
  const firstCardDefinition = state.cardDefinitions.get(firstCard.definitionId);
  assert.ok(firstCardDefinition);
  const baseCardVictoryPoints = firstCardDefinition.engine.victoryPoints;
  const firstTokenDefinition = state.tokenDefinitions.values().next().value;
  const tokenVictoryPointsBefore =
    firstTokenDefinition?.kind === "deadWizardToken"
      ? firstTokenDefinition.victoryPoints
      : undefined;
  const scoreBefore = scoreGame(state).find(
    (score) => score.playerId === player.playerId
  );
  assert.ok(scoreBefore);

  const gainCardId = addFixtureStatusCardToActiveHand(state, "gain_status");
  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: gainCardId }).ok,
    true
  );

  assert.equal(
    calculateEffectivePlayerVictoryPoints(state, player.playerId, 0),
    -5
  );
  assert.equal(
    scoreGame(state).find((score) => score.playerId === player.playerId)
      ?.victoryPoints,
    scoreBefore.victoryPoints - 5
  );
  assert.equal(firstCardDefinition.engine.victoryPoints, baseCardVictoryPoints);
  if (firstTokenDefinition?.kind === "deadWizardToken") {
    assert.equal(firstTokenDefinition.victoryPoints, tokenVictoryPointsBefore);
  }

  const removeCardId = addFixtureStatusCardToActiveHand(state, "remove_status");
  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: removeCardId }).ok,
    true
  );

  assert.equal(
    calculateEffectivePlayerVictoryPoints(state, player.playerId, 0),
    0
  );
  assert.equal(
    scoreGame(state).find((score) => score.playerId === player.playerId)
      ?.victoryPoints,
    scoreBefore.victoryPoints
  );
});

test("Gusynya scores two VP per owned Legend card", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const state = initializeGame({ dataPack, seed: 60615 });
  const player = state.players[0];
  assert.ok(player);
  const gusynya = state.cardDefinitions.get("esw2_dbg__legend_004");
  const tower = state.cardDefinitions.get("esw2_dbg__legend_009");
  assert.ok(gusynya);
  assert.ok(tower);
  player.discard.push(
    createCardInstance("fixture-gusynya", gusynya.cardId, player.playerId),
    createCardInstance("fixture-tower", tower.cardId, player.playerId)
  );

  assert.equal(
    scoreGame(state).find((score) => score.playerId === player.playerId)
      ?.victoryPoints,
    10
  );
  assert.equal(gusynya.engine.victoryPoints, 0);
});

test("Tsirk bratiev loshashnykh turns only the Dingler penalty into bonus VP", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const state = initializeGame({ dataPack, seed: 60615 });
  const player = state.players[0];
  assert.ok(player);
  const circus = state.cardDefinitions.get("esw2_dbg__main_027");
  assert.ok(circus);
  player.discard.push(
    createCardInstance("fixture-circus", circus.cardId, player.playerId)
  );
  const dwtDefinition = state.tokenDefinitions.get(
    "esw2_dbg__dead_wizard_token_002"
  );
  assert.equal(dwtDefinition?.kind, "deadWizardToken");
  if (dwtDefinition?.kind !== "deadWizardToken") return;
  player.deadWizardTokens.push({
    instanceId: markTokenInstanceId("fixture-circus-dwt-002"),
    definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_002"),
    ownerId: player.playerId,
  });

  assert.equal(
    calculateEffectiveTokenVictoryPoints(state, player.playerId, dwtDefinition),
    -6
  );
  const scoreWithoutDingler = scoreGame(state).find(
    (score) => score.playerId === player.playerId
  );
  assert.ok(scoreWithoutDingler);

  player.statuses.push({
    instanceId: "fixture-circus-dingler",
    statusId: "dingler",
    ownerId: player.playerId,
    effects: [
      verifiedTestRuntimeEffect({
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerVictoryPoints",
        operation: "add",
        amount: -5,
        target: { targetType: "player" },
      }),
    ],
  });

  assert.equal(
    calculateEffectivePlayerVictoryPoints(state, player.playerId, 0),
    5
  );
  assert.equal(
    calculateEffectiveTokenVictoryPoints(state, player.playerId, dwtDefinition),
    -6
  );
  assert.equal(
    scoreGame(state).find((score) => score.playerId === player.playerId)
      ?.victoryPoints,
    scoreWithoutDingler.victoryPoints + 5
  );
});

test("Potnyi GeekPig scores one VP per owned creature card", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const state = initializeGame({ dataPack, seed: 60615 });
  const player = state.players[0];
  assert.ok(player);
  const geekPig = state.cardDefinitions.get("esw2_dbg__main_040");
  const pivohranilishche = state.cardDefinitions.get("esw2_dbg__main_035");
  assert.ok(geekPig);
  assert.ok(pivohranilishche);
  player.discard.push(
    createCardInstance("fixture-geekpig", geekPig.cardId, player.playerId),
    createCardInstance(
      "fixture-pivohranilishche",
      pivohranilishche.cardId,
      player.playerId
    )
  );

  assert.equal(
    scoreGame(state).find((score) => score.playerId === player.playerId)
      ?.victoryPoints,
    4
  );
  assert.equal(geekPig.engine.victoryPoints, 0);
});

test("Potnyi GeekPig self-scoring applies once per physical copy", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const state = initializeGame({ dataPack, seed: 60615 });
  const player = state.players[0];
  assert.ok(player);
  const geekPig = state.cardDefinitions.get("esw2_dbg__main_040");
  assert.ok(geekPig);
  player.discard.push(
    createCardInstance("fixture-geekpig-1", geekPig.cardId, player.playerId),
    createCardInstance("fixture-geekpig-2", geekPig.cardId, player.playerId)
  );

  assert.equal(
    scoreGame(state).find((score) => score.playerId === player.playerId)
      ?.victoryPoints,
    4
  );
});

test("scoring another card reports a malformed self-scoring modifier", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const geekPig = dataPack.cardDefinitions.get("esw2_dbg__main_040");
  assert.ok(geekPig);
  const malformedGeekPig: CardDefinition = {
    ...geekPig,
    engine: {
      ...geekPig.engine,
      effects: [
        {
          effectId: "modify_effective_value",
          timing: "whileScoring",
          valueKind: "cardVictoryPoints",
          operation: "add",
          amount: "invalid",
          target: { targetType: "card", definitionId: geekPig.cardId },
        } as never,
      ],
    },
  };
  const malformedDataPack = {
    ...dataPack,
    cardDefinitions: new Map(dataPack.cardDefinitions).set(
      geekPig.cardId,
      malformedGeekPig
    ),
  };

  assert.throws(
    () => initializeGame({ dataPack: malformedDataPack, seed: 60616 }),
    /amount must be a safe integer/
  );
});

test("whileControlled definition modifier applies from another physical copy", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const state = initializeGame({ dataPack, seed: 60617 });
  const player = state.players[0];
  assert.ok(player);
  const target = state.cardDefinitions.get("esw2_dbg__main_035");
  assert.ok(target);
  const modifiedTarget: CardDefinition = {
    ...target,
    engine: {
      ...target.engine,
      effects: [
        verifiedTestRuntimeEffect({
          effectId: "modify_effective_value",
          timing: "whileControlled",
          valueKind: "cardVictoryPoints",
          operation: "add",
          amount: 2,
          target: { targetType: "card", definitionId: target.cardId },
        }),
      ],
    },
  };
  const modifierCopy = createCardInstance(
    "fixture-controlled-modifier-copy",
    target.cardId,
    player.playerId
  );
  const scoredCopy = createCardInstance(
    "fixture-controlled-scored-copy",
    target.cardId,
    player.playerId
  );
  player.permanents.push(modifierCopy);
  player.discard.push(scoredCopy);
  const stateWithModifier = {
    ...state,
    cardDefinitions: new Map(state.cardDefinitions).set(
      target.cardId,
      modifiedTarget
    ),
  };

  assert.equal(
    calculateEffectiveCardVictoryPoints(
      stateWithModifier,
      player.playerId,
      modifiedTarget,
      scoredCopy
    ),
    target.engine.victoryPoints + 2
  );
});

test("scoring zones stay aligned between scoreGame and whileScoring modifiers", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const state = initializeGame({ dataPack, seed: 60615 });
  const player = state.players[0];
  assert.ok(player);
  const gusynya = state.cardDefinitions.get("esw2_dbg__legend_004");
  const tower = state.cardDefinitions.get("esw2_dbg__legend_009");
  const geekPig = state.cardDefinitions.get("esw2_dbg__main_040");
  const pivohranilishche = state.cardDefinitions.get("esw2_dbg__main_035");
  assert.ok(gusynya);
  assert.ok(tower);
  assert.ok(geekPig);
  assert.ok(pivohranilishche);

  const playedLegend = createCardInstance(
    "fixture-played-gusynya",
    gusynya.cardId,
    player.playerId
  );
  const permanentLegend = createCardInstance(
    "fixture-permanent-tower",
    tower.cardId,
    player.playerId
  );
  const discardGeekPig = createCardInstance(
    "fixture-discard-geekpig",
    geekPig.cardId,
    player.playerId
  );
  const playedCreature = createCardInstance(
    "fixture-played-pivohranilishche",
    pivohranilishche.cardId,
    player.playerId
  );

  player.playedThisTurn.push(playedLegend, playedCreature);
  player.permanents.push(permanentLegend);
  player.discard.push(discardGeekPig);

  assert.equal(
    calculateEffectiveCardVictoryPoints(
      state,
      player.playerId,
      gusynya,
      playedLegend
    ),
    4
  );
  assert.equal(
    calculateEffectiveCardVictoryPoints(
      state,
      player.playerId,
      geekPig,
      discardGeekPig
    ),
    3
  );
  const expectedScore =
    tower.engine.victoryPoints + pivohranilishche.engine.victoryPoints + 4 + 3;
  assert.equal(
    scoreGame(state).find((score) => score.playerId === player.playerId)
      ?.victoryPoints,
    expectedScore
  );
});

test("scoreGame counts owned player-zone cards without scoring common locations or an unbought familiar", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const state = initializeGame({ dataPack, seed: 60615 });
  const player = state.players[0];
  const otherPlayer = state.players[1];
  assert.ok(player);
  assert.ok(otherPlayer);
  const tower = state.cardDefinitions.get("esw2_dbg__legend_009");
  assert.ok(tower);

  const controlledTower = createCardInstance(
    "fixture-controlled-tower",
    tower.cardId,
    player.playerId
  );
  otherPlayer.permanents.push(controlledTower);
  grantTemporaryControl(
    state,
    controlledTower.instanceId,
    otherPlayer.playerId
  );
  state.common.market.push(
    createCardInstance("fixture-market-tower", tower.cardId, player.playerId)
  );
  player.unboughtFamiliars = [
    createCardInstance("fixture-familiar-tower", tower.cardId, player.playerId),
  ];

  const scoringCardIds = new Set(
    listOwnedScoringCards(state, player.playerId).map(
      (object) => object.card.instanceId
    )
  );
  assert.equal(scoringCardIds.has(controlledTower.instanceId), true);
  assert.equal(
    scoringCardIds.has(player.unboughtFamiliars[0]!.instanceId),
    false
  );
  assert.equal(
    scoringCardIds.has(state.common.market.at(-1)!.instanceId),
    false
  );

  assert.equal(
    scoreGame(state).find((score) => score.playerId === player.playerId)
      ?.victoryPoints,
    6
  );
  assert.deepEqual(state.turn.temporaryCardControls, [
    {
      cardInstanceId: controlledTower.instanceId,
      controllerId: otherPlayer.playerId,
    },
  ]);
});

test("scoreGame uses a selected familiar effective type in the legend tie-break", () => {
  const state = initializeGame({ rootDir, seed: 60306 });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  const otherPlayer = state.players.find(
    (player) => player.playerId !== state.activePlayerId
  );
  assert.ok(activePlayer);
  assert.ok(otherPlayer);

  for (const player of state.players) {
    player.deck = [];
    player.hand = [];
    player.discard = [];
    player.playedThisTurn = [];
    player.permanents = [];
    player.unboughtFamiliars = [];
    player.deadWizardTokens = [];
    player.statuses = [];
    player.trophyLikeObjects = [];
    player.wizardProperties = [];
  }

  activePlayer.wizardProperties = [
    {
      instanceId: markTokenInstanceId("fixture-wp003-scoring"),
      definitionId: markTokenDefinitionId("esw2_dbg__wizard_property_003"),
      ownerId: activePlayer.playerId,
    },
  ];
  const selectedFamiliar = createCardInstance(
    "fixture-wp003-selected-familiar",
    "esw2_dbg__familiar_007",
    activePlayer.playerId
  );
  const unselectedFamiliar = createCardInstance(
    "fixture-wp003-unselected-familiar",
    "esw2_dbg__familiar_007",
    otherPlayer.playerId
  );
  activePlayer.discard.push(selectedFamiliar);
  otherPlayer.discard.push(unselectedFamiliar);

  assert.deepEqual(
    applyAction(state, {
      type: "setCardEffectiveType",
      cardInstanceId: selectedFamiliar.instanceId,
      cardType: "legend",
      enabled: true,
    }),
    { ok: true }
  );

  const scores = scoreGame(state);
  const activeScore = scores.find(
    (score) => score.playerId === activePlayer.playerId
  );
  const otherScore = scores.find(
    (score) => score.playerId === otherPlayer.playerId
  );
  assert.ok(activeScore);
  assert.ok(otherScore);
  assert.equal(activeScore.victoryPoints, otherScore.victoryPoints);
  assert.equal(activeScore.legendCount, 1);
  assert.equal(otherScore.legendCount, 0);
  assert.deepEqual(determineWinnerIds(scores), [activePlayer.playerId]);
});

function createCostModifierStatus(
  playerId: StatusInstance["ownerId"],
  definitionId: string,
  amount: number
): StatusInstance {
  return {
    instanceId: markCardInstanceId("fixture-cost-status"),
    statusId: "fixture-cost-status",
    ownerId: playerId,
    effects: [createCostModifierEffect(definitionId, amount)],
  };
}

function createCostModifierTrophy(
  playerId: TrophyLikeInstance["ownerId"],
  definitionId: string,
  amount: number
): TrophyLikeInstance {
  return {
    instanceId: markCardInstanceId("fixture-cost-trophy"),
    trophyId: "fixture-cost-trophy",
    ownerId: playerId,
    effects: [createCostModifierEffect(definitionId, amount)],
  };
}

function createTokenVictoryPointModifierTrophy(
  playerId: TrophyLikeInstance["ownerId"],
  definitionId: string,
  amount: number
): TrophyLikeInstance {
  return {
    instanceId: markCardInstanceId("fixture-token-vp-trophy"),
    trophyId: "fixture-token-vp-trophy",
    ownerId: playerId,
    effects: [
      verifiedTestRuntimeEffect({
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "tokenVictoryPoints",
        operation: "add",
        amount,
        target: {
          targetType: "token",
          definitionId,
        },
      }),
    ],
  };
}

function createTreasureModifierDataPack(
  dataPack: LoadedDataPack,
  treasure: CardDefinition,
  spell: CardDefinition
): LoadedDataPack {
  const tokenDefinitions = new Map(dataPack.tokenDefinitions);
  for (const entry of dataPack.tokenStacks.wizardProperties?.entries ?? []) {
    const definition = tokenDefinitions.get(entry.tokenId);
    if (definition?.kind === "wizardProperty") {
      tokenDefinitions.set(
        entry.tokenId,
        createTreasureDiscountWizardProperty(entry.tokenId)
      );
    }
  }

  return {
    ...dataPack,
    cardDefinitions: new Map([
      ...dataPack.cardDefinitions,
      [treasure.cardId, treasure],
      [spell.cardId, spell],
    ]),
    tokenDefinitions,
  };
}

function createTreasureDiscountWizardProperty(
  tokenId: string
): TokenDefinition {
  return {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    source: { image: "assets/wizard-property/wp_fixture.png" },
    engine: {
      mappingStatus: "mapped",
      playableInV0: true,
      effects: [
        {
          effectId: "modify_effective_value",
          timing: "whileControlled",
          valueKind: "cardCost",
          operation: "add",
          amount: -1,
          target: {
            targetType: "card",
            cardTypes: ["treasure"],
          },
        },
        {
          effectId: "modify_effective_value",
          timing: "whileControlled",
          valueKind: "cardVictoryPoints",
          operation: "add",
          amount: 1,
          target: {
            targetType: "card",
            cardTypes: ["treasure"],
          },
        },
      ],
      unsupportedMechanics: [],
    },
  };
}

function createTypedFixtureCardDefinition(
  cardId: string,
  cardTypes: string[],
  cost: number,
  victoryPoints: number
): CardDefinition {
  return {
    schemaVersion: 1,
    cardId,
    source: { image: `assets/cards/fixtures/${cardId}.png` },
    visible: {
      nameRu: cardId,
      cost,
      victoryPoints,
      typeRu: null,
      cardKind: "normal",
      cardTypes,
      markers: [],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind: "normal",
      cardTypes,
      cost,
      victoryPoints,
      isOngoing: false,
      marketChipMarker: false,
      effects: [],
      unsupportedMechanics: [],
    },
  };
}

function createNonExecutableMaxLifeWizardProperty(
  tokenId: string,
  amount: number
): TokenDefinition {
  return {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    source: { image: "assets/wizard-property/wp_fixture.png" },
    engine: {
      mappingStatus: "draft",
      playableInV0: false,
      effects: [
        {
          effectId: "fixture_modify_effective_value",
          timing: "whileControlled",
          valueKind: "playerMaxLife",
          operation: "add",
          amount,
          target: {
            targetType: "player",
          },
        },
      ],
      unsupportedMechanics: ["fixture-non-executable-wizard-property"],
    },
  };
}

function createCostModifierEffect(
  definitionId: string,
  amount: number
): RuntimeEffect {
  return verifiedTestRuntimeEffect({
    effectId: "fixture_modify_effective_value",
    timing: "whileControlled",
    valueKind: "cardCost",
    operation: "add",
    amount,
    target: {
      targetType: "card",
      definitionId,
    },
  });
}

function createCardInstance(
  instanceId: string,
  definitionId: string,
  ownerId: CardInstance["ownerId"]
): CardInstance {
  return {
    instanceId: markCardInstanceId(instanceId),
    definitionId: markCardDefinitionId(definitionId),
    ownerId,
    marketChips: 0,
  };
}

function addFixtureStatusCardToActiveHand(
  state: ReturnType<typeof initializeGame>,
  effectId: "gain_status" | "remove_status"
): string {
  const player = state.players.find(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  assert.ok(player);
  const cardId = `fixture-${effectId}-dingler-card-${player.hand.length + 1}`;
  const definition: CardDefinition = {
    schemaVersion: 1,
    cardId,
    source: { image: `assets/cards/fixtures/${cardId}.png` },
    visible: {
      nameRu: cardId,
      cost: 0,
      victoryPoints: 0,
      typeRu: null,
      cardKind: "normal",
      cardTypes: [],
      markers: [],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind: "normal",
      cardTypes: [],
      cost: 0,
      victoryPoints: 0,
      isOngoing: false,
      marketChipMarker: false,
      effects: [
        verifiedTestRuntimeEffect({
          effectId,
          timing: "onPlay",
          statusId: "dingler",
          target: {
            selector: "activePlayer",
          },
        }),
      ],
      unsupportedMechanics: [],
    },
  };
  return addFixtureDefinitionToActiveHand(state, definition, {
    instanceId: markCardInstanceId(
      `fixture-${effectId}-dingler-instance-${player.hand.length + 1}`
    ),
  }).instanceId;
}
