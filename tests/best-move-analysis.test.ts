import assert from "node:assert/strict";
import test from "node:test";

import {
  enumerateImmediateActionBranches,
  initializeGame,
  type CardDefinition,
  type RuntimeEffect,
} from "../src/index.js";
import { addFixtureDefinitionToActiveHand } from "./helpers/fixture-cards.js";

const rootDir = process.cwd();

function fixtureDefinition(
  cardId: string,
  effects: RuntimeEffect[] = []
): CardDefinition {
  return {
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
      effects,
      unsupportedMechanics: [],
    },
  };
}

test("enumerates simple actions into independent completed branches", () => {
  const state = initializeGame({ rootDir, seed: 125 });
  state.common.market = [];
  state.common.legendMarket = [];
  state.common.wildMagicStack = [];
  state.common.mainDeck = state.common.mainDeck.filter((candidate) => {
    return state.cardDefinitions.get(candidate.definitionId)?.engine.cardKind === "normal";
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];
  const card = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-simple")
  );
  const secondCard = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-simple-2")
  );
  const sourceTurn = state.turn.number;

  const result = enumerateImmediateActionBranches(state);

  assert.equal(result.completed.length + result.deferred.length, 3);
  assert.equal(result.completed.length, 3);
  assert.equal(result.deferred.length, 0);
  assert.equal(result.completed[0]?.legalAction.type, "playCard");
  const firstBranchPlayer = result.completed[0]?.resultingState.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(firstBranchPlayer);
  assert.equal(firstBranchPlayer.hand.some(
    (candidate) => candidate.instanceId === card.instanceId
  ), false);
  assert.equal(firstBranchPlayer.hand.some(
    (candidate) => candidate.instanceId === secondCard.instanceId
  ), true);
  const secondBranchPlayer = result.completed[1]?.resultingState.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(secondBranchPlayer);
  assert.notEqual(
    firstBranchPlayer,
    secondBranchPlayer
  );
  assert.equal(result.completed[2]?.legalAction.type, "endTurn");
  assert.equal(result.completed[2]?.resultingState.turn.number, sourceTurn + 1);
  assert.equal(state.turn.number, sourceTurn);
});

test("defers a choice action with a serializable first request summary", () => {
  const state = initializeGame({ rootDir, seed: 126 });
  const target = state.common.market[0];
  assert.ok(target);
  state.common.market = [target];
  state.common.legendMarket = [];
  state.common.wildMagicStack = [];
  state.turn.power = 0;
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];
  const source = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-choice", [
      {
        effectId: "fixture_add_power_equal_to_target_cost",
        timing: "onPlay",
        target: { selector: "mainMarketCard" },
      },
    ])
  );
  const originalStrategy = state.effectChoiceStrategy;
  const result = enumerateImmediateActionBranches(state);
  const deferred = result.deferred.find(
    (branch) => branch.legalAction.type === "playCard"
  );
  assert.ok(deferred);
  assert.equal(deferred.choiceRequest.effectId, "fixture_add_power_equal_to_target_cost");
  assert.equal(deferred.choiceRequest.sourceType, "card");
  assert.equal(deferred.choiceRequest.cardInstanceId, source.instanceId);
  assert.equal(deferred.choiceRequest.choices[0]?.choiceIndex, 0);
  assert.equal(deferred.choiceRequest.choices[0]?.choiceId, target.instanceId);
  assert.equal(deferred.choiceRequest.choices[0]?.choiceKind, "cardTarget");
  assert.equal(state.effectChoiceStrategy, originalStrategy);
  assert.equal(JSON.stringify(deferred.choiceRequest).includes("players"), false);
  assert.equal(result.completed.some((branch) => branch.legalAction === deferred.legalAction), false);
});
