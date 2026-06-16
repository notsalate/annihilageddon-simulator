import assert from "node:assert/strict";
import test from "node:test";

import {
  buildControlledObjectView,
  calculateEffectiveCardCost,
  initializeGame,
  listLegalActions,
  scoreGame,
  type StatusInstance,
  type TrophyLikeInstance,
} from "../src/index.js";

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

test("controlled object view gathers separately stored cards, tokens, statuses, and trophy-like objects", () => {
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
      statuses: view.statuses.map((object) => object.instanceId),
      trophyLikeObjects: view.trophyLikeObjects.map((object) => object.instanceId),
    },
    {
      cards: [permanent.instanceId],
      tokens: [token.instanceId],
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
  assert.ok(definition);
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
