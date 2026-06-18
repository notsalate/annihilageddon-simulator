import assert from "node:assert/strict";
import test from "node:test";

import {
  determineWinnerIds,
  getGameEndReason,
  initializeGame,
  runMassSimulation,
  runSingleGame,
  scoreGame,
} from "../src/index.js";

const rootDir = process.cwd();

test("single-game simulation can stop at maxTurns as a non-game termination", () => {
  const result = runSingleGame({
    rootDir,
    seed: 60615,
    maxTurns: 1,
  });

  assert.equal(result.endReason, "maxTurnsReached");
  assert.equal(result.isGameEnd, false);
  assert.equal(result.turnsElapsed, 1);
  assert.equal(result.players.length, 2);
  assert.ok(result.eventLog.some((event) => event.type === "botActionSelected"));
});

test("game end reason is dead wizard token exhaustion when the DWT stack is empty", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  state.common.deadWizardTokens = {
    status: "available",
    drawStack: [],
  };

  assert.equal(getGameEndReason(state), "deadWizardTokensExhausted");
});

test("game end reason does not infer market exhaustion outside Market Flow", () => {
  const state = initializeGame({ rootDir, seed: 60615 });

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
  assert.equal(result.eventLog.some((event) => event.type === "turnStarted"), false);
});

test("single-game simulation uses the Market Flow legend deck exhaustion reason directly", () => {
  let prepared = false;
  const result = runSingleGame({
    rootDir,
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
  assert.equal(result.eventLog.some((event) => event.type === "turnStarted"), false);
});

test("scoring sums owned cards from scoring zones and applies DWT penalty", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
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
  const expectedCardScore = [...player.hand, ...player.deck, ...player.discard, legend].reduce((total, card) => {
    return total + state.cardDefinitions.get(card.definitionId)!.engine.victoryPoints;
  }, 0);

  const score = scoreGame(state).find((candidate) => candidate.playerId === player.playerId);

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

  const expectedCardScore = [...player.hand, ...player.deck, ...player.discard].reduce((total, card) => {
    return total + state.cardDefinitions.get(card.definitionId)!.engine.victoryPoints;
  }, 0);

  const score = scoreGame(state).find((candidate) => candidate.playerId === player.playerId);

  assert.ok(score);
  const fixtureDeadWizardToken = state.tokenDefinitions.get("fixture-dead-wizard-token");
  assert.equal(fixtureDeadWizardToken?.kind, "deadWizardToken");
  assert.equal(fixtureDeadWizardToken.victoryPoints, -5);
  assert.equal(score.victoryPoints, expectedCardScore - 5);
});

test("winner determination applies VP, legend count, fewer DWT, then true tie", () => {
  assert.deepEqual(
    determineWinnerIds([
      { playerId: "player-1", victoryPoints: 8, legendCount: 0, deadWizardTokenCount: 0 },
      { playerId: "player-2", victoryPoints: 7, legendCount: 10, deadWizardTokenCount: 0 },
    ]),
    ["player-1"],
  );
  assert.deepEqual(
    determineWinnerIds([
      { playerId: "player-1", victoryPoints: 8, legendCount: 1, deadWizardTokenCount: 0 },
      { playerId: "player-2", victoryPoints: 8, legendCount: 2, deadWizardTokenCount: 3 },
    ]),
    ["player-2"],
  );
  assert.deepEqual(
    determineWinnerIds([
      { playerId: "player-1", victoryPoints: 8, legendCount: 2, deadWizardTokenCount: 1 },
      { playerId: "player-2", victoryPoints: 8, legendCount: 2, deadWizardTokenCount: 0 },
    ]),
    ["player-2"],
  );
  assert.deepEqual(
    determineWinnerIds([
      { playerId: "player-1", victoryPoints: 8, legendCount: 2, deadWizardTokenCount: 0 },
      { playerId: "player-2", victoryPoints: 8, legendCount: 2, deadWizardTokenCount: 0 },
    ]),
    ["player-1", "player-2"],
  );
});

test("single-game run is reproducible for the same seed and baseline bot", () => {
  const first = runSingleGame({ rootDir, seed: 80809, maxTurns: 8 });
  const second = runSingleGame({ rootDir, seed: 80809, maxTurns: 8 });

  assert.deepEqual(
    {
      endReason: first.endReason,
      isGameEnd: first.isGameEnd,
      turnsElapsed: first.turnsElapsed,
      players: first.players,
      winnerIds: first.winnerIds,
      eventTypes: first.eventLog.map((event) => event.type),
    },
    {
      endReason: second.endReason,
      isGameEnd: second.isGameEnd,
      turnsElapsed: second.turnsElapsed,
      players: second.players,
      winnerIds: second.winnerIds,
      eventTypes: second.eventLog.map((event) => event.type),
    },
  );
});

test("mass simulation uses reproducible seed sequence and compact summaries", () => {
  const first = runMassSimulation({
    rootDir,
    firstSeed: 9000,
    gameCount: 3,
    maxTurns: 40,
  });
  const second = runMassSimulation({
    rootDir,
    firstSeed: 9000,
    gameCount: 3,
    maxTurns: 40,
  });

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.games.map((game) => game.seed),
    [9000, 9001, 9002],
  );
  assert.equal(first.games.length, 3);
  assert.equal(first.aggregate.totalGames, 3);
  assert.equal(first.aggregate.tieCount, first.games.filter((game) => game.isTie).length);
  assert.equal(first.aggregate.tieRate, first.aggregate.tieCount / first.aggregate.totalGames);
  assert.equal(first.games.some((game) => "eventLog" in game), false);
});
