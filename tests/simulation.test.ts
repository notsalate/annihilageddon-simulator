import assert from "node:assert/strict";
import test from "node:test";

import {
  determineWinnerIds,
  formatSingleGameDebugTrace,
  getGameEndReason,
  initializeGame,
  runMassSimulation,
  runSingleGame,
  scoreGame,
} from "../src/index.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

test("single-game simulation can stop at maxTurns as a non-game termination", () => {
  const result = runSingleGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    maxTurns: 1,
  });

  assert.equal(result.endReason, "maxTurnsReached");
  assert.equal(result.isGameEnd, false);
  assert.equal(result.turnsElapsed, 1);
  assert.equal(result.players.length, 2);
  assert.ok(
    result.eventLog.some((event) => event.type === "botActionSelected")
  );
});

test("bot action selection records turn number and safe action identity for debug trace", () => {
  const result = runSingleGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    maxTurns: 1,
    bot: {
      chooseAction() {
        return { type: "endTurn" };
      },
    },
  });

  const event = result.eventLog.find(
    (candidate) => candidate.type === "botActionSelected"
  );
  assert.ok(event);
  assert.equal(event.playerId, "player-1");
  assert.equal(event.turnNumber, 1);
  assert.equal(event.actionIdentity, "endTurn");
  assert.equal(event.actionSequence, 1);

  const trace = formatSingleGameDebugTrace(result);
  assert.match(trace, /Turn 1, Action 1 - player-1 \(endTurn\)/);
  assert.match(trace, /- Bot selected endTurn\./);
  assert.doesNotMatch(trace, /Turn \? - player-1/);
});

test("game end reason is dead wizard token exhaustion when the DWT stack is empty", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  state.common.deadWizardTokens = {
    status: "available",
    drawStack: [],
  };

  assert.equal(getGameEndReason(state), "deadWizardTokensExhausted");
});

test("game end reason does not infer market exhaustion outside Market Flow", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });

  state.common.market.pop();
  state.common.mainDeck.splice(0);
  assert.equal(getGameEndReason(state), undefined);

  state.common.market.push(state.common.legendMarket[0]!);
  state.common.legendMarket.pop();
  state.common.legendDeck.splice(0);
  assert.equal(getGameEndReason(state), undefined);
});

test("single-game simulation uses the Market Flow main deck exhaustion reason directly", () => {
  let prepared = false;
  const result = runSingleGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    maxTurns: 20,
    bot: {
      chooseAction({ state }) {
        if (!prepared) {
          state.common.market.splice(0, 1);
          state.common.mainDeck.splice(0);
          prepared = true;
        }

        return { type: "endTurn" };
      },
    },
  });

  assert.equal(result.endReason, "mainDeckExhausted");
  assert.equal(result.isGameEnd, true);
  assert.equal(result.eventLog.at(-1)?.type, "marketFlowFailed");
  assert.equal(
    result.eventLog.some((event) => event.type === "turnStarted"),
    false
  );
});

test("single-game simulation uses the Market Flow legend deck exhaustion reason directly", () => {
  let prepared = false;
  const result = runSingleGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    maxTurns: 20,
    bot: {
      chooseAction({ state }) {
        if (!prepared) {
          state.common.legendMarket.splice(0, 1);
          state.common.legendDeck.splice(0);
          prepared = true;
        }

        return { type: "endTurn" };
      },
    },
  });

  assert.equal(result.endReason, "legendDeckExhausted");
  assert.equal(result.isGameEnd, true);
  assert.equal(result.eventLog.at(-1)?.type, "marketFlowFailed");
  assert.equal(
    result.eventLog.some((event) => event.type === "turnStarted"),
    false
  );
});

test("scoring sums owned cards from scoring zones and applies DWT penalty", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const player = state.players[0]!;
  const legend = state.common.legendMarket[0]!;
  legend.ownerId = player.playerId;
  player.permanents.push(legend);
  assert.equal(state.common.deadWizardTokens.status, "available");
  const firstDwt = state.common.deadWizardTokens.drawStack.shift();
  const secondDwt = state.common.deadWizardTokens.drawStack.shift();
  assert.ok(firstDwt);
  assert.ok(secondDwt);
  firstDwt.ownerId = player.playerId;
  secondDwt.ownerId = player.playerId;
  player.deadWizardTokens.push(firstDwt, secondDwt);
  const expectedCardScore = [
    ...player.hand,
    ...player.deck,
    ...player.discard,
    legend,
  ].reduce((total, card) => {
    return (
      total + state.cardDefinitions.get(card.definitionId)!.engine.victoryPoints
    );
  }, 0);

  const score = scoreGame(state).find(
    (candidate) => candidate.playerId === player.playerId
  );

  assert.ok(score);
  assert.equal(score.legendCount, 1);
  assert.equal(score.deadWizardTokenCount, 2);
  assert.equal(score.victoryPoints, expectedCardScore - 6);
});

test("scoring applies DWT victory points from token definitions", () => {
  const state = initializeGame({
    rootDir,
    seed: 60615,
    dataPackPath: "tests/fixtures/token-data-pack.json",
  });
  const player = state.players[0]!;
  assert.equal(state.common.deadWizardTokens.status, "available");
  const dwt = state.common.deadWizardTokens.drawStack.shift();
  assert.ok(dwt);
  dwt.ownerId = player.playerId;
  player.deadWizardTokens.push(dwt);

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
  const fixtureDeadWizardToken = state.tokenDefinitions.get(
    "fixture-dead-wizard-token"
  );
  assert.equal(fixtureDeadWizardToken?.kind, "deadWizardToken");
  assert.equal(fixtureDeadWizardToken.victoryPoints, -5);
  assert.equal(score.victoryPoints, expectedCardScore - 5);
});

test("winner determination applies VP, legend count, fewer DWT, then true tie", () => {
  assert.deepEqual(
    determineWinnerIds([
      {
        playerId: "player-1",
        victoryPoints: 8,
        legendCount: 0,
        deadWizardTokenCount: 0,
      },
      {
        playerId: "player-2",
        victoryPoints: 7,
        legendCount: 10,
        deadWizardTokenCount: 0,
      },
    ]),
    ["player-1"]
  );
  assert.deepEqual(
    determineWinnerIds([
      {
        playerId: "player-1",
        victoryPoints: 8,
        legendCount: 1,
        deadWizardTokenCount: 0,
      },
      {
        playerId: "player-2",
        victoryPoints: 8,
        legendCount: 2,
        deadWizardTokenCount: 3,
      },
    ]),
    ["player-2"]
  );
  assert.deepEqual(
    determineWinnerIds([
      {
        playerId: "player-1",
        victoryPoints: 8,
        legendCount: 2,
        deadWizardTokenCount: 1,
      },
      {
        playerId: "player-2",
        victoryPoints: 8,
        legendCount: 2,
        deadWizardTokenCount: 0,
      },
    ]),
    ["player-2"]
  );
  assert.deepEqual(
    determineWinnerIds([
      {
        playerId: "player-1",
        victoryPoints: 8,
        legendCount: 2,
        deadWizardTokenCount: 0,
      },
      {
        playerId: "player-2",
        victoryPoints: 8,
        legendCount: 2,
        deadWizardTokenCount: 0,
      },
    ]),
    ["player-1", "player-2"]
  );
});

test("single-game run is reproducible for the same seed and baseline bot", () => {
  const first = runSingleGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 80809,
    maxTurns: 8,
  });
  const second = runSingleGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 80809,
    maxTurns: 8,
  });

  assert.deepEqual(
    projectMeaningfulEventLog(first.eventLog),
    projectMeaningfulEventLog(second.eventLog)
  );
});

test("single-game run keeps a compact golden event projection for stable seeds", () => {
  const projections = [80809, 80810].map((seed) => {
    const result = runSingleGame({
      rootDir,
      dataPackPath: playableRuntimeDataPackPath,
      seed,
      maxTurns: 1,
    });

    return {
      seed,
      endReason: result.endReason,
      turnsElapsed: result.turnsElapsed,
      eventLog: projectMeaningfulEventLog(result.eventLog),
    };
  });

  assert.deepEqual(projections, [
    {
      seed: 80809,
      endReason: "maxTurnsReached",
      turnsElapsed: 1,
      eventLog: [
        { type: "setupChoiceSelected", playerId: "player-1" },
        { type: "setupChoiceSelected", playerId: "player-2" },
        { type: "setupChoiceSelected", playerId: "player-1" },
        { type: "setupChoiceSelected", playerId: "player-2" },
        { type: "gameInitialized", eventSequence: 1, turnNumber: 1 },
        {
          type: "botActionSelected",
          eventSequence: 2,
          turnNumber: 1,
          actionSequence: 1,
          actionIdentity: "playCard",
          playerId: "player-1",
        },
        {
          type: "cardMoved",
          eventSequence: 3,
          turnNumber: 1,
          actionSequence: 1,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-8",
          definitionId: "esw2_dbg__starter_002",
          sourceZone: "player-1.hand",
          destinationZone: "player-1.playedThisTurn",
          ownerBefore: "player-1",
          ownerAfter: "player-1",
        },
        {
          type: "cardPlayed",
          eventSequence: 4,
          turnNumber: 1,
          actionSequence: 1,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-8",
          definitionId: "esw2_dbg__starter_002",
        },
        {
          type: "botActionSelected",
          eventSequence: 5,
          turnNumber: 1,
          actionSequence: 2,
          actionIdentity: "playCard",
          playerId: "player-1",
        },
        {
          type: "cardMoved",
          eventSequence: 6,
          turnNumber: 1,
          actionSequence: 2,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-2",
          definitionId: "esw2_dbg__starter_001",
          sourceZone: "player-1.hand",
          destinationZone: "player-1.playedThisTurn",
          ownerBefore: "player-1",
          ownerAfter: "player-1",
        },
        {
          type: "effectAddPowerApplied",
          eventSequence: 7,
          turnNumber: 1,
          actionSequence: 2,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-2",
          definitionId: "esw2_dbg__starter_001",
          effectId: "add_power",
          amount: 1,
          powerBefore: 0,
          powerAfter: 1,
        },
        {
          type: "cardPlayed",
          eventSequence: 8,
          turnNumber: 1,
          actionSequence: 2,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-2",
          definitionId: "esw2_dbg__starter_001",
        },
        {
          type: "botActionSelected",
          eventSequence: 9,
          turnNumber: 1,
          actionSequence: 3,
          actionIdentity: "playCard",
          playerId: "player-1",
        },
        {
          type: "cardMoved",
          eventSequence: 10,
          turnNumber: 1,
          actionSequence: 3,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-1",
          definitionId: "esw2_dbg__starter_001",
          sourceZone: "player-1.hand",
          destinationZone: "player-1.playedThisTurn",
          ownerBefore: "player-1",
          ownerAfter: "player-1",
        },
        {
          type: "effectAddPowerApplied",
          eventSequence: 11,
          turnNumber: 1,
          actionSequence: 3,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-1",
          definitionId: "esw2_dbg__starter_001",
          effectId: "add_power",
          amount: 1,
          powerBefore: 1,
          powerAfter: 2,
        },
        {
          type: "cardPlayed",
          eventSequence: 12,
          turnNumber: 1,
          actionSequence: 3,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-1",
          definitionId: "esw2_dbg__starter_001",
        },
        {
          type: "botActionSelected",
          eventSequence: 13,
          turnNumber: 1,
          actionSequence: 4,
          actionIdentity: "playCard",
          playerId: "player-1",
        },
        {
          type: "cardMoved",
          eventSequence: 14,
          turnNumber: 1,
          actionSequence: 4,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-5",
          definitionId: "esw2_dbg__starter_001",
          sourceZone: "player-1.hand",
          destinationZone: "player-1.playedThisTurn",
          ownerBefore: "player-1",
          ownerAfter: "player-1",
        },
        {
          type: "effectAddPowerApplied",
          eventSequence: 15,
          turnNumber: 1,
          actionSequence: 4,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-5",
          definitionId: "esw2_dbg__starter_001",
          effectId: "add_power",
          amount: 1,
          powerBefore: 2,
          powerAfter: 3,
        },
        {
          type: "cardPlayed",
          eventSequence: 16,
          turnNumber: 1,
          actionSequence: 4,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-5",
          definitionId: "esw2_dbg__starter_001",
        },
        {
          type: "botActionSelected",
          eventSequence: 17,
          turnNumber: 1,
          actionSequence: 5,
          actionIdentity: "playCard",
          playerId: "player-1",
        },
        {
          type: "cardMoved",
          eventSequence: 18,
          turnNumber: 1,
          actionSequence: 5,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-3",
          definitionId: "esw2_dbg__starter_001",
          sourceZone: "player-1.hand",
          destinationZone: "player-1.playedThisTurn",
          ownerBefore: "player-1",
          ownerAfter: "player-1",
        },
        {
          type: "effectAddPowerApplied",
          eventSequence: 19,
          turnNumber: 1,
          actionSequence: 5,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-3",
          definitionId: "esw2_dbg__starter_001",
          effectId: "add_power",
          amount: 1,
          powerBefore: 3,
          powerAfter: 4,
        },
        {
          type: "cardPlayed",
          eventSequence: 20,
          turnNumber: 1,
          actionSequence: 5,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-3",
          definitionId: "esw2_dbg__starter_001",
        },
        {
          type: "botActionSelected",
          eventSequence: 21,
          turnNumber: 1,
          actionSequence: 6,
          actionIdentity: "buyMarketCard:mainMarket",
          playerId: "player-1",
        },
        {
          type: "cardMoved",
          eventSequence: 22,
          turnNumber: 1,
          actionSequence: 6,
          actionIdentity: "buyMarketCard:mainMarket",
          playerId: "player-1",
          cardInstanceId: "card-67",
          definitionId: "esw2_dbg__main_041",
          sourceZone: "mainMarket",
          destinationZone: "player-1.discard",
          ownerBefore: "common",
          ownerAfter: "player-1",
        },
        {
          type: "cardBought",
          eventSequence: 23,
          turnNumber: 1,
          actionSequence: 6,
          actionIdentity: "buyMarketCard:mainMarket",
          playerId: "player-1",
          cardInstanceId: "card-67",
          definitionId: "esw2_dbg__main_041",
          destination: "discard",
        },
        {
          type: "botActionSelected",
          eventSequence: 24,
          turnNumber: 1,
          actionSequence: 7,
          actionIdentity: "endTurn",
          playerId: "player-1",
        },
        {
          type: "turnEnded",
          eventSequence: 25,
          turnNumber: 1,
          actionSequence: 7,
          actionIdentity: "endTurn",
          playerId: "player-1",
        },
        {
          type: "marketFlowCardAdded",
          eventSequence: 26,
          turnNumber: 2,
          actionSequence: 7,
          actionIdentity: "endTurn",
          cardInstanceId: "card-56",
          definitionId: "esw2_dbg__main_015",
        },
        {
          type: "turnStarted",
          eventSequence: 27,
          turnNumber: 2,
          actionSequence: 7,
          actionIdentity: "endTurn",
          playerId: "player-2",
        },
      ],
    },
    {
      seed: 80810,
      endReason: "maxTurnsReached",
      turnsElapsed: 1,
      eventLog: [
        { type: "setupChoiceSelected", playerId: "player-1" },
        { type: "setupChoiceSelected", playerId: "player-2" },
        { type: "setupChoiceSelected", playerId: "player-1" },
        { type: "setupChoiceSelected", playerId: "player-2" },
        { type: "gameInitialized", eventSequence: 1, turnNumber: 1 },
        {
          type: "botActionSelected",
          eventSequence: 2,
          turnNumber: 1,
          actionSequence: 1,
          actionIdentity: "playCard",
          playerId: "player-1",
        },
        {
          type: "cardMoved",
          eventSequence: 3,
          turnNumber: 1,
          actionSequence: 1,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-1",
          definitionId: "esw2_dbg__starter_001",
          sourceZone: "player-1.hand",
          destinationZone: "player-1.playedThisTurn",
          ownerBefore: "player-1",
          ownerAfter: "player-1",
        },
        {
          type: "effectAddPowerApplied",
          eventSequence: 4,
          turnNumber: 1,
          actionSequence: 1,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-1",
          definitionId: "esw2_dbg__starter_001",
          effectId: "add_power",
          amount: 1,
          powerBefore: 0,
          powerAfter: 1,
        },
        {
          type: "cardPlayed",
          eventSequence: 5,
          turnNumber: 1,
          actionSequence: 1,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-1",
          definitionId: "esw2_dbg__starter_001",
        },
        {
          type: "botActionSelected",
          eventSequence: 6,
          turnNumber: 1,
          actionSequence: 2,
          actionIdentity: "playCard",
          playerId: "player-1",
        },
        {
          type: "cardMoved",
          eventSequence: 7,
          turnNumber: 1,
          actionSequence: 2,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-2",
          definitionId: "esw2_dbg__starter_001",
          sourceZone: "player-1.hand",
          destinationZone: "player-1.playedThisTurn",
          ownerBefore: "player-1",
          ownerAfter: "player-1",
        },
        {
          type: "effectAddPowerApplied",
          eventSequence: 8,
          turnNumber: 1,
          actionSequence: 2,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-2",
          definitionId: "esw2_dbg__starter_001",
          effectId: "add_power",
          amount: 1,
          powerBefore: 1,
          powerAfter: 2,
        },
        {
          type: "cardPlayed",
          eventSequence: 9,
          turnNumber: 1,
          actionSequence: 2,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-2",
          definitionId: "esw2_dbg__starter_001",
        },
        {
          type: "botActionSelected",
          eventSequence: 10,
          turnNumber: 1,
          actionSequence: 3,
          actionIdentity: "playCard",
          playerId: "player-1",
        },
        {
          type: "cardMoved",
          eventSequence: 11,
          turnNumber: 1,
          actionSequence: 3,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-9",
          definitionId: "esw2_dbg__starter_002",
          sourceZone: "player-1.hand",
          destinationZone: "player-1.playedThisTurn",
          ownerBefore: "player-1",
          ownerAfter: "player-1",
        },
        {
          type: "cardPlayed",
          eventSequence: 12,
          turnNumber: 1,
          actionSequence: 3,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-9",
          definitionId: "esw2_dbg__starter_002",
        },
        {
          type: "botActionSelected",
          eventSequence: 13,
          turnNumber: 1,
          actionSequence: 4,
          actionIdentity: "playCard",
          playerId: "player-1",
        },
        {
          type: "cardMoved",
          eventSequence: 14,
          turnNumber: 1,
          actionSequence: 4,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-4",
          definitionId: "esw2_dbg__starter_001",
          sourceZone: "player-1.hand",
          destinationZone: "player-1.playedThisTurn",
          ownerBefore: "player-1",
          ownerAfter: "player-1",
        },
        {
          type: "effectAddPowerApplied",
          eventSequence: 15,
          turnNumber: 1,
          actionSequence: 4,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-4",
          definitionId: "esw2_dbg__starter_001",
          effectId: "add_power",
          amount: 1,
          powerBefore: 2,
          powerAfter: 3,
        },
        {
          type: "cardPlayed",
          eventSequence: 16,
          turnNumber: 1,
          actionSequence: 4,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-4",
          definitionId: "esw2_dbg__starter_001",
        },
        {
          type: "botActionSelected",
          eventSequence: 17,
          turnNumber: 1,
          actionSequence: 5,
          actionIdentity: "playCard",
          playerId: "player-1",
        },
        {
          type: "cardMoved",
          eventSequence: 18,
          turnNumber: 1,
          actionSequence: 5,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-3",
          definitionId: "esw2_dbg__starter_001",
          sourceZone: "player-1.hand",
          destinationZone: "player-1.playedThisTurn",
          ownerBefore: "player-1",
          ownerAfter: "player-1",
        },
        {
          type: "effectAddPowerApplied",
          eventSequence: 19,
          turnNumber: 1,
          actionSequence: 5,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-3",
          definitionId: "esw2_dbg__starter_001",
          effectId: "add_power",
          amount: 1,
          powerBefore: 3,
          powerAfter: 4,
        },
        {
          type: "cardPlayed",
          eventSequence: 20,
          turnNumber: 1,
          actionSequence: 5,
          actionIdentity: "playCard",
          playerId: "player-1",
          cardInstanceId: "card-3",
          definitionId: "esw2_dbg__starter_001",
        },
        {
          type: "botActionSelected",
          eventSequence: 21,
          turnNumber: 1,
          actionSequence: 6,
          actionIdentity: "buyMarketCard:mainMarket",
          playerId: "player-1",
        },
        {
          type: "cardMoved",
          eventSequence: 22,
          turnNumber: 1,
          actionSequence: 6,
          actionIdentity: "buyMarketCard:mainMarket",
          playerId: "player-1",
          cardInstanceId: "card-47",
          definitionId: "esw2_dbg__main_009",
          sourceZone: "mainMarket",
          destinationZone: "player-1.discard",
          ownerBefore: "common",
          ownerAfter: "player-1",
        },
        {
          type: "cardBought",
          eventSequence: 23,
          turnNumber: 1,
          actionSequence: 6,
          actionIdentity: "buyMarketCard:mainMarket",
          playerId: "player-1",
          cardInstanceId: "card-47",
          definitionId: "esw2_dbg__main_009",
          destination: "discard",
        },
        {
          type: "botActionSelected",
          eventSequence: 24,
          turnNumber: 1,
          actionSequence: 7,
          actionIdentity: "endTurn",
          playerId: "player-1",
        },
        {
          type: "turnEnded",
          eventSequence: 25,
          turnNumber: 1,
          actionSequence: 7,
          actionIdentity: "endTurn",
          playerId: "player-1",
        },
        {
          type: "marketFlowCardAdded",
          eventSequence: 26,
          turnNumber: 2,
          actionSequence: 7,
          actionIdentity: "endTurn",
          cardInstanceId: "card-66",
          definitionId: "esw2_dbg__main_041",
        },
        {
          type: "turnStarted",
          eventSequence: 27,
          turnNumber: 2,
          actionSequence: 7,
          actionIdentity: "endTurn",
          playerId: "player-2",
        },
      ],
    },
  ]);
});

test("mass simulation uses reproducible seed sequence and compact summaries", () => {
  const first = runMassSimulation({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    firstSeed: 9000,
    gameCount: 3,
    maxTurns: 40,
  });
  const second = runMassSimulation({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    firstSeed: 9000,
    gameCount: 3,
    maxTurns: 40,
  });

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.games.map((game) => game.seed),
    [9000, 9001, 9002]
  );
  assert.equal(first.games.length, 3);
  assert.equal(first.aggregate.totalGames, 3);
  assert.equal(
    first.aggregate.tieCount,
    first.games.filter((game) => game.isTie).length
  );
  assert.equal(
    first.aggregate.tieRate,
    first.aggregate.tieCount / first.aggregate.totalGames
  );
  assert.equal(
    first.games.some((game) => "eventLog" in game),
    false
  );
});

function projectMeaningfulEventLog(
  eventLog: ReturnType<typeof runSingleGame>["eventLog"]
): Array<Record<string, string | number>> {
  return eventLog.map((event) => {
    const projected = {
      type: event.type,
      eventSequence: event.eventSequence,
      turnNumber: event.turnNumber,
      actionSequence: event.actionSequence,
      actionIdentity: event.actionIdentity,
      playerId: event.playerId,
      targetPlayerId: event.targetPlayerId,
      cardInstanceId: event.cardInstanceId,
      definitionId: event.definitionId,
      targetCardInstanceId: event.targetCardInstanceId,
      targetDefinitionId: event.targetDefinitionId,
      tokenInstanceId: event.tokenInstanceId,
      tokenDefinitionId: event.tokenDefinitionId,
      effectId: event.effectId,
      amount: event.amount,
      sourceZone: event.sourceZone,
      destinationZone: event.destinationZone,
      ownerBefore: event.ownerBefore,
      ownerAfter: event.ownerAfter,
      destination: event.destination,
      powerBefore: event.powerBefore,
      powerAfter: event.powerAfter,
      chipsBefore: event.chipsBefore,
      chipsAfter: event.chipsAfter,
      lifeBefore: event.lifeBefore,
      lifeAfter: event.lifeAfter,
      targetLifeBefore: event.targetLifeBefore,
      targetLifeAfter: event.targetLifeAfter,
    };

    return Object.fromEntries(
      Object.entries(projected).filter(([, value]) => value !== undefined)
    ) as Record<string, string | number>;
  });
}
