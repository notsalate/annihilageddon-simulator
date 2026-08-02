import assert from "node:assert/strict";
import test from "node:test";

import {
  buildControlledObjectView,
  calculateEffectiveCardCost,
  calculateEffectiveCardVictoryPoints,
  calculateEffectivePlayerMaxLife,
  calculateEffectivePlayerVictoryPoints,
  calculateEffectiveTokenVictoryPoints,
  initializeGame,
  applyAction,
  listLegalActions,
  loadCurrentRuntimeDataPack,
  scoreGame,
  type CardInstance,
  type CardDefinition,
  type LoadedDataPack,
  type RuntimeEffect,
  type StatusInstance,
  type TokenDefinition,
  type TrophyLikeInstance,
} from "../src/index.js";
import {
  grantTemporaryControl,
  listOwnedScoringCards,
} from "../src/engine/control-ledger.js";
import { addFixtureDefinitionToActiveHand } from "./helpers/fixture-cards.js";
import {
  applyEffectiveValueModifier,
  type EffectRuntimeCatalogOperationOverridesForTesting,
  type EffectRuntimeHandlerOperationResult,
  type EffectiveValueModifierOperationContext,
} from "../src/engine/effect-runtime-registry.js";
import {
  markCardInstanceId,
  markCardDefinitionId,
  markPlayerId,
} from "../src/domain/types.js";
import { withTemporaryEffectRuntimeOperations } from "./helpers/with-temporary-effect-runtime-operations.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

test("Catalog rejects a malformed effective-value modifier before evaluation", () => {
  const result = applyEffectiveValueModifier(
    {
      effectId: "fixture_modify_effective_value",
      timing: "whileControlled",
      valueKind: "cardCost",
      operation: "add",
      amount: -1,
    },
    {
      sourceType: "card",
      runtimeMode: "fixture",
      playerId: markPlayerId("player-1"),
      cardInstanceId: "fixture-effective-value-source",
      definitionId: "fixture-effective-value-source",
    },
    {
      timing: "whileControlled",
      valueKind: "cardCost",
      targetMatches: () => true,
      countOwnedScoringCards: () => 0,
      evaluate: (apply) => ({ status: "resolved", result: apply(5) }),
    }
  );

  assert.deepEqual(result, {
    status: "error",
    error: "Effect fixture_modify_effective_value.target is required",
  });
});

test("effective-value entrypoints observe the Catalog modifier operation result", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60618,
  });
  const player = state.players[0];
  const card = state.common.market[0];
  const token = state.common.deadWizardTokens.drawStack[0];
  assert.ok(player);
  assert.ok(card);
  assert.ok(token);
  const cardDefinition = state.cardDefinitions.get(card.definitionId);
  const tokenDefinition = state.tokenDefinitions.get(token.definitionId);
  assert.ok(cardDefinition);
  assert.equal(tokenDefinition?.kind, "deadWizardToken");
  player.statuses.push({
    instanceId: markCardInstanceId("fixture-catalog-operation-status"),
    statusId: "fixture-catalog-operation-status",
    ownerId: player.playerId,
    effects: [
      {
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "cardCost",
        operation: "add",
        amount: 1,
        target: { targetType: "card", definitionId: cardDefinition.cardId },
      },
      {
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "cardVictoryPoints",
        operation: "add",
        amount: 1,
        target: { targetType: "card", definitionId: cardDefinition.cardId },
      },
      {
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "tokenVictoryPoints",
        operation: "add",
        amount: 1,
        target: { targetType: "token", definitionId: tokenDefinition.tokenId },
      },
      {
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerVictoryPoints",
        operation: "add",
        amount: 1,
        target: { targetType: "player" },
      },
      {
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerMaxLife",
        operation: "add",
        amount: 1,
        target: { targetType: "player" },
      },
    ],
  });

  const values = withTemporaryEffectRuntimeOperations(
    "fixture_modify_effective_value",
    effectiveValueCatalogOperationOverride,
    () => [
      calculateEffectiveCardCost(state, player.playerId, cardDefinition),
      calculateEffectiveCardVictoryPoints(
        state,
        player.playerId,
        cardDefinition,
        card
      ),
      calculateEffectiveTokenVictoryPoints(
        state,
        player.playerId,
        tokenDefinition
      ),
      calculateEffectivePlayerVictoryPoints(state, player.playerId, 0),
      calculateEffectivePlayerMaxLife(state, player.playerId),
    ]
  );

  assert.deepEqual(values, [701, 701, 701, 701, 701]);
});

const effectiveValueCatalogOperationOverride = {
  applyEffectiveValueModifier<Result>(
    _effect: Extract<
      RuntimeEffect,
      { effectId: "fixture_modify_effective_value" }
    >,
    context: EffectiveValueModifierOperationContext<Result>
  ): EffectRuntimeHandlerOperationResult<Result> {
    return context.evaluate(() => 701);
  },
} satisfies EffectRuntimeCatalogOperationOverridesForTesting<"fixture_modify_effective_value">;

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
  assert.equal(
    score.victoryPoints,
    expectedCardScore + baseVictoryPoints + 1
  );
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

test("Tsirk bratiev loshashnykh turns owned DWT penalties into bonus VP", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const state = initializeGame({ dataPack, seed: 60615 });
  const player = state.players[0];
  assert.ok(player);
  const circus = state.cardDefinitions.get("esw2_dbg__main_027");
  assert.ok(circus);
  player.discard.push(
    createCardInstance("fixture-circus", circus.cardId, player.playerId)
  );
  assert.equal(state.common.deadWizardTokens.status, "available");
  const dwt = state.common.deadWizardTokens.drawStack.shift();
  assert.ok(dwt);
  dwt.ownerId = player.playerId;
  player.deadWizardTokens.push(dwt);
  const dwtDefinition = state.tokenDefinitions.get(dwt.definitionId);
  assert.equal(dwtDefinition?.kind, "deadWizardToken");
  assert.ok(dwtDefinition.victoryPoints < 0);

  assert.equal(
    scoreGame(state).find((score) => score.playerId === player.playerId)
      ?.victoryPoints,
    2 + Math.abs(dwtDefinition.victoryPoints)
  );
  assert.equal(dwtDefinition.victoryPoints, -3);
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
  const state = initializeGame({ dataPack, seed: 60616 });
  const player = state.players[0];
  assert.ok(player);
  const geekPig = state.cardDefinitions.get("esw2_dbg__main_040");
  const target = state.cardDefinitions.get("esw2_dbg__main_035");
  assert.ok(geekPig);
  assert.ok(target);
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
  const geekPigCard = createCardInstance(
    "fixture-malformed-self-scoring-geekpig",
    geekPig.cardId,
    player.playerId
  );
  const targetCard = createCardInstance(
    "fixture-scored-target",
    target.cardId,
    player.playerId
  );
  player.discard.push(geekPigCard, targetCard);
  const stateWithMalformedSelfScoringEffect = {
    ...state,
    cardDefinitions: new Map(state.cardDefinitions).set(
      geekPig.cardId,
      malformedGeekPig
    ),
  };

  assert.throws(
    () =>
      calculateEffectiveCardVictoryPoints(
        stateWithMalformedSelfScoringEffect,
        player.playerId,
        target,
        targetCard
      ),
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
        {
          effectId: "modify_effective_value",
          timing: "whileControlled",
          valueKind: "cardVictoryPoints",
          operation: "add",
          amount: 2,
          target: { targetType: "card", definitionId: target.cardId },
        },
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
  player.unboughtFamiliar = createCardInstance(
    "fixture-familiar-tower",
    tower.cardId,
    player.playerId
  );

  const scoringCardIds = new Set(
    listOwnedScoringCards(state, player.playerId).map(
      (object) => object.card.instanceId
    )
  );
  assert.equal(scoringCardIds.has(controlledTower.instanceId), true);
  assert.equal(scoringCardIds.has(player.unboughtFamiliar.instanceId), false);
  assert.equal(scoringCardIds.has(state.common.market.at(-1)!.instanceId), false);

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
      {
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "tokenVictoryPoints",
        operation: "add",
        amount,
        target: {
          targetType: "token",
          definitionId,
        },
      },
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
  return {
    effectId: "fixture_modify_effective_value",
    timing: "whileControlled",
    valueKind: "cardCost",
    operation: "add",
    amount,
    target: {
      targetType: "card",
      definitionId,
    },
  };
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
        {
          effectId,
          timing: "onPlay",
          statusId: "dingler",
          target: {
            selector: "activePlayer",
          },
        },
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
