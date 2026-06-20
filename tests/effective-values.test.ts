import assert from "node:assert/strict";
import test from "node:test";

import {
  buildControlledObjectView,
  calculateEffectiveCardCost,
  calculateEffectivePlayerMaxLife,
  calculateEffectivePlayerVictoryPoints,
  initializeGame,
  applyAction,
  listLegalActions,
  loadV0DataPack,
  scoreGame,
  type CardDefinition,
  type LoadedDataPack,
  type StatusInstance,
  type TokenDefinition,
  type TrophyLikeInstance,
} from "../src/index.js";
import { addFixtureDefinitionToActiveHand } from "./helpers/fixture-cards.js";

const rootDir = process.cwd();

test("a controlled fixture object can modify a card's effective cost without mutating base data", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const player = state.players.find((candidate) => candidate.playerId === state.activePlayerId);
  assert.ok(player);
  const marketCard = state.common.market[0];
  assert.ok(marketCard);
  const definition = state.cardDefinitions.get(marketCard.definitionId);
  assert.ok(definition);
  const baseCost = definition.engine.cost;
  state.turn.power = Math.max(0, baseCost - 2);
  player.statuses.push(createCostModifierStatus(player.playerId, marketCard.definitionId, -2));

  const effectiveCost = calculateEffectiveCardCost(state, player.playerId, definition);
  const legalActions = listLegalActions(state);

  assert.equal(effectiveCost, baseCost - 2);
  assert.equal(definition.engine.cost, baseCost);
  assert.ok(
    legalActions.some((action) => action.type === "buyMarketCard" && action.cardInstanceId === marketCard.instanceId),
  );
});

test("omitting the controlled object removes the effective cost modifier", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const player = state.players.find((candidate) => candidate.playerId === state.activePlayerId);
  assert.ok(player);
  const marketCard = state.common.market[0];
  assert.ok(marketCard);
  const definition = state.cardDefinitions.get(marketCard.definitionId);
  assert.ok(definition);
  const baseCost = definition.engine.cost;
  state.turn.power = Math.max(0, baseCost - 2);

  const effectiveCost = calculateEffectiveCardCost(state, player.playerId, definition);
  const legalActions = listLegalActions(state);

  assert.equal(effectiveCost, baseCost);
  assert.equal(definition.engine.cost, baseCost);
  assert.equal(
    legalActions.some((action) => action.type === "buyMarketCard" && action.cardInstanceId === marketCard.instanceId),
    state.turn.power >= baseCost,
  );
});

test("controlled object view gathers separately stored cards, tokens, wizard properties, statuses, and trophy-like objects", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
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
  const status = createCostModifierStatus(player.playerId, permanent.definitionId, -1);
  const trophy = createCostModifierTrophy(player.playerId, permanent.definitionId, -1);
  player.statuses.push(status);
  player.trophyLikeObjects.push(trophy);

  const view = buildControlledObjectView(state, player.playerId);

  assert.deepEqual(
    {
      cards: view.cards.map((object) => object.card.instanceId),
      tokens: view.tokens.map((object) => object.token.instanceId),
      wizardProperties: view.wizardProperties.map((object) => object.token.instanceId),
      statuses: view.statuses.map((object) => object.instanceId),
      trophyLikeObjects: view.trophyLikeObjects.map((object) => object.instanceId),
    },
    {
      cards: [permanent.instanceId],
      tokens: [token.instanceId],
      wizardProperties: player.wizardProperties.map((object) => object.instanceId),
      statuses: [status.instanceId],
      trophyLikeObjects: [trophy.instanceId],
    },
  );
});

test("a controlled fixture object can modify token scoring without mutating token definitions", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
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
  player.trophyLikeObjects.push(createTokenVictoryPointModifierTrophy(player.playerId, token.definitionId, 1));

  const expectedCardScore = [...player.hand, ...player.deck, ...player.discard].reduce((total, card) => {
    return total + state.cardDefinitions.get(card.definitionId)!.engine.victoryPoints;
  }, 0);
  const score = scoreGame(state).find((candidate) => candidate.playerId === player.playerId);

  assert.ok(score);
  assert.equal(score.victoryPoints, expectedCardScore + baseVictoryPoints + 1);
  assert.equal(definition.victoryPoints, baseVictoryPoints);
});

test("wizard property discount and scoring modifier apply to owned treasures", () => {
  const treasure = createTypedFixtureCardDefinition("fixture-treasure", ["treasure"], 5, 2);
  const spell = createTypedFixtureCardDefinition("fixture-spell", ["spell"], 5, 2);
  const dataPack = createTreasureModifierDataPack(loadV0DataPack(rootDir), treasure, spell);
  const state = initializeGame({ dataPack, seed: 60615 });
  const player = state.players[0];
  assert.ok(player);
  player.discard.push({
    instanceId: "fixture-owned-treasure",
    definitionId: treasure.cardId,
    ownerId: player.playerId,
    marketChips: 0,
  });

  assert.equal(calculateEffectiveCardCost(state, player.playerId, treasure), 4);
  assert.equal(calculateEffectiveCardCost(state, player.playerId, spell), 5);
  assert.equal(scoreGame(state).find((score) => score.playerId === player.playerId)?.victoryPoints, 3);
});

test("non-executable wizard property effects fail instead of applying silently", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const player = state.players[0];
  assert.ok(player);
  const wizardProperty = player.wizardProperties[0];
  assert.ok(wizardProperty);
  const tokenDefinitions = new Map(state.tokenDefinitions);
  tokenDefinitions.set(wizardProperty.definitionId, createNonExecutableMaxLifeWizardProperty(wizardProperty.definitionId, 3));
  const stateWithDraftEffect = {
    ...state,
    tokenDefinitions,
  };

  assert.throws(
    () => calculateEffectivePlayerMaxLife(stateWithDraftEffect, player.playerId),
    /Cannot execute non-playable wizard property/,
  );
});

test("Dingler scoring penalty is an effective player victory point modifier", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const player = state.players.find((candidate) => candidate.playerId === state.activePlayerId);
  assert.ok(player);
  const firstCard = player.hand[0];
  assert.ok(firstCard);
  const firstCardDefinition = state.cardDefinitions.get(firstCard.definitionId);
  assert.ok(firstCardDefinition);
  const baseCardVictoryPoints = firstCardDefinition.engine.victoryPoints;
  const firstTokenDefinition = state.tokenDefinitions.values().next().value;
  const tokenVictoryPointsBefore = firstTokenDefinition?.kind === "deadWizardToken" ? firstTokenDefinition.victoryPoints : undefined;
  const scoreBefore = scoreGame(state).find((score) => score.playerId === player.playerId);
  assert.ok(scoreBefore);

  const gainCardId = addFixtureStatusCardToActiveHand(state, "gain_status");
  assert.equal(applyAction(state, { type: "playCard", cardInstanceId: gainCardId }).ok, true);

  assert.equal(calculateEffectivePlayerVictoryPoints(state, player.playerId, 0), -5);
  assert.equal(scoreGame(state).find((score) => score.playerId === player.playerId)?.victoryPoints, scoreBefore.victoryPoints - 5);
  assert.equal(firstCardDefinition.engine.victoryPoints, baseCardVictoryPoints);
  if (firstTokenDefinition?.kind === "deadWizardToken") {
    assert.equal(firstTokenDefinition.victoryPoints, tokenVictoryPointsBefore);
  }

  const removeCardId = addFixtureStatusCardToActiveHand(state, "remove_status");
  assert.equal(applyAction(state, { type: "playCard", cardInstanceId: removeCardId }).ok, true);

  assert.equal(calculateEffectivePlayerVictoryPoints(state, player.playerId, 0), 0);
  assert.equal(scoreGame(state).find((score) => score.playerId === player.playerId)?.victoryPoints, scoreBefore.victoryPoints);
});

function createCostModifierStatus(playerId: StatusInstance["ownerId"], definitionId: string, amount: number): StatusInstance {
  return {
    instanceId: "fixture-cost-status",
    statusId: "fixture-cost-status",
    ownerId: playerId,
    effects: [createCostModifierEffect(definitionId, amount)],
  };
}

function createCostModifierTrophy(
  playerId: TrophyLikeInstance["ownerId"],
  definitionId: string,
  amount: number,
): TrophyLikeInstance {
  return {
    instanceId: "fixture-cost-trophy",
    trophyId: "fixture-cost-trophy",
    ownerId: playerId,
    effects: [createCostModifierEffect(definitionId, amount)],
  };
}

function createTokenVictoryPointModifierTrophy(
  playerId: TrophyLikeInstance["ownerId"],
  definitionId: string,
  amount: number,
): TrophyLikeInstance {
  return {
    instanceId: "fixture-token-vp-trophy",
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
  spell: CardDefinition,
): LoadedDataPack {
  const tokenDefinitions = new Map(dataPack.tokenDefinitions);
  for (const entry of dataPack.tokenStacks.wizardProperties?.entries ?? []) {
    const definition = tokenDefinitions.get(entry.tokenId);
    if (definition?.kind === "wizardProperty") {
      tokenDefinitions.set(entry.tokenId, createTreasureDiscountWizardProperty(entry.tokenId));
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

function createTreasureDiscountWizardProperty(tokenId: string): TokenDefinition {
  return {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
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
  victoryPoints: number,
): CardDefinition {
  return {
    schemaVersion: 1,
    cardId,
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

function createNonExecutableMaxLifeWizardProperty(tokenId: string, amount: number): TokenDefinition {
  return {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
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

function createCostModifierEffect(definitionId: string, amount: number): unknown {
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

function addFixtureStatusCardToActiveHand(state: ReturnType<typeof initializeGame>, effectId: "gain_status" | "remove_status"): string {
  const player = state.players.find((candidate) => candidate.playerId === state.activePlayerId);
  assert.ok(player);
  const cardId = `fixture-${effectId}-dingler-card-${player.hand.length + 1}`;
  const definition: CardDefinition = {
    schemaVersion: 1,
    cardId,
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
    instanceId: `fixture-${effectId}-dingler-instance-${player.hand.length + 1}`,
  }).instanceId;
}
