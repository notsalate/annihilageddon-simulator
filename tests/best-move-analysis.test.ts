import assert from "node:assert/strict";
import test from "node:test";

import {
  enumerateTurnLines,
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

  assert.equal(result.length, 3);
  assert.equal(result[0]?.legalAction.type, "playCard");
  const firstBranchPlayer = result[0]?.resultingState.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(firstBranchPlayer);
  assert.equal(firstBranchPlayer.hand.some(
    (candidate) => candidate.instanceId === card.instanceId
  ), false);
  assert.equal(firstBranchPlayer.hand.some(
    (candidate) => candidate.instanceId === secondCard.instanceId
  ), true);
  const secondBranchPlayer = result[1]?.resultingState.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(secondBranchPlayer);
  assert.notEqual(
    firstBranchPlayer,
    secondBranchPlayer
  );
  assert.equal(result[2]?.legalAction.type, "endTurn");
  assert.equal(result[2]?.resultingState.turn.number, sourceTurn + 1);
  assert.equal(state.turn.number, sourceTurn);
});

test("enumerates every current-turn action history through endTurn", () => {
  const state = initializeGame({ rootDir, seed: 127 });
  state.common.market = [];
  state.common.legendMarket = [];
  state.common.wildMagicStack = [];
  state.common.mainDeck = [];
  state.common.legendDeck = [];
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  activePlayer.hand = [];
  activePlayer.permanents = [];
  activePlayer.wizardProperties = [];
  activePlayer.statuses = [];
  activePlayer.trophyLikeObjects = [];
  activePlayer.unboughtFamiliar = undefined;
  activePlayer.deck = [];
  activePlayer.discard = [];
  addFixtureDefinitionToActiveHand(state, fixtureDefinition("fixture-analysis-simple"));
  addFixtureDefinitionToActiveHand(state, fixtureDefinition("fixture-analysis-simple-2"));

  const lines = enumerateTurnLines(state, {
    maxChoiceDepth: 32,
    maxBranchesPerAction: 32,
    maxActionsPerLine: 3,
    maxTurnLines: 100,
  });
  const histories = lines.map((line) => line.steps.map((step) => step.action.type === "playCard"
    ? step.action.cardInstanceId.replace("-instance-", "-")
    : step.action.type).join(">"));

  assert.deepEqual(histories, [
    "fixture-analysis-simple-1>fixture-analysis-simple-2-2>endTurn",
    "fixture-analysis-simple-1>endTurn",
    "fixture-analysis-simple-2-2>fixture-analysis-simple-1>endTurn",
    "fixture-analysis-simple-2-2>endTurn",
    "endTurn",
  ]);
  assert.ok(lines.every((line) => line.terminalReason === "endTurn"));
  assert.ok(lines.every((line) => line.steps.every((step) => step.action.type !== "endTurn" || step === line.steps.at(-1))));
});

test("enumerates each card target as a completed branch", () => {
  const state = initializeGame({ rootDir, seed: 126 });
  const target = state.common.market[0];
  const secondTarget = state.common.mainDeck[0];
  assert.ok(target);
  assert.ok(secondTarget);
  state.common.market = [target, secondTarget];
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
  const branches = result.filter(
    (branch) => branch.legalAction.type === "playCard"
  );
  assert.equal(branches.length, 2);
  assert.equal(branches[0]?.selectedChoices[0]?.effectId, "fixture_add_power_equal_to_target_cost");
  assert.equal(branches[0]?.selectedChoices[0]?.sourceType, "card");
  assert.equal(branches[0]?.selectedChoices[0]?.cardInstanceId, source.instanceId);
  assert.equal(branches[0]?.selectedChoices[0]?.choiceIndex, 0);
  assert.equal(branches[0]?.selectedChoices[0]?.choiceId, target.instanceId);
  assert.equal(branches[1]?.selectedChoices[0]?.choiceIndex, 1);
  assert.equal(branches[1]?.selectedChoices[0]?.choiceId, secondTarget.instanceId);
  assert.equal(branches[0]?.selectedChoices[0]?.choiceKind, "cardTarget");
  assert.equal(state.effectChoiceStrategy, originalStrategy);
  assert.equal(JSON.stringify(branches[0]?.selectedChoices).includes("players"), false);
});
