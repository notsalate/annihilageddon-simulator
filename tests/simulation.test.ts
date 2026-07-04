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
import { markPlayerId } from "../src/domain/types.js";

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
  assert.equal(event.playerId, markPlayerId("player-1"));
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
        playerId: markPlayerId("player-1"),
        victoryPoints: 8,
        legendCount: 0,
        deadWizardTokenCount: 0,
      },
      {
        playerId: markPlayerId("player-2"),
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
        playerId: markPlayerId("player-1"),
        victoryPoints: 8,
        legendCount: 1,
        deadWizardTokenCount: 0,
      },
      {
        playerId: markPlayerId("player-2"),
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
        playerId: markPlayerId("player-1"),
        victoryPoints: 8,
        legendCount: 2,
        deadWizardTokenCount: 1,
      },
      {
        playerId: markPlayerId("player-2"),
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
        playerId: markPlayerId("player-1"),
        victoryPoints: 8,
        legendCount: 2,
        deadWizardTokenCount: 0,
      },
      {
        playerId: markPlayerId("player-2"),
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

  assert.deepEqual(
    projections.map((projection) => ({
      seed: projection.seed,
      endReason: projection.endReason,
      turnsElapsed: projection.turnsElapsed,
    })),
    [
      { seed: 80809, endReason: "maxTurnsReached", turnsElapsed: 1 },
      { seed: 80810, endReason: "maxTurnsReached", turnsElapsed: 1 },
    ]
  );

  for (const projection of projections) {
    const eventTypes = projection.eventLog.map((event) => event["type"]);

    assert.deepEqual(eventTypes.slice(0, 5), [
      "setupChoiceSelected",
      "setupChoiceSelected",
      "setupChoiceSelected",
      "setupChoiceSelected",
      "gameInitialized",
    ]);
    assert.ok(eventTypes.includes("botActionSelected"));
    assert.ok(eventTypes.includes("cardMoved"));
    assert.ok(eventTypes.includes("cardPlayed"));
    assert.ok(eventTypes.includes("cardBought"));
    assert.equal(eventTypes.at(-2), "marketFlowCardAdded");
    assert.equal(eventTypes.at(-1), "turnStarted");

    const initialized = projection.eventLog.find(
      (event) => event["type"] === "gameInitialized"
    );
    assert.equal(initialized?.["eventSequence"], 1);
    assert.equal(initialized?.["turnNumber"], 1);

    const bought = projection.eventLog.find(
      (event) => event["type"] === "cardBought"
    );
    assert.equal(bought?.["destination"], "discard");
    assert.equal(bought?.["sourceZone"], undefined);
    assert.equal(bought?.["powerBefore"], undefined);
    assert.equal(bought?.["chipsBefore"], undefined);
  }
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
  const compactEvents = eventLog.filter((event) => {
    if (
      event.type === "marketFlowCardAdded" ||
      event.type === "marketEventCardOpened" ||
      event.type === "mayhemDestroyed" ||
      event.type === "megaMayhemDestroyed" ||
      event.type === "marketChipAdded"
    ) {
      return event.actionSequence !== undefined;
    }

    return event.type !== "endTurnCleanupMoved" && event.type !== "handDrawn";
  });

  let compactEventSequence = 0;

  return compactEvents.map((event) => {
    const eventSequence =
      event.eventSequence === undefined ? undefined : ++compactEventSequence;

    const projected = {
      type: event.type,
      eventSequence,
      turnNumber: event.turnNumber,
      actionSequence: event.actionSequence,
      actionIdentity: event.actionIdentity,
      playerId:
        event.type === "marketFlowCardAdded" ? undefined : event.playerId,
      targetPlayerId: event.targetPlayerId,
      cardInstanceId: event.cardInstanceId,
      definitionId: event.definitionId,
      targetCardInstanceId: event.targetCardInstanceId,
      targetDefinitionId: event.targetDefinitionId,
      tokenInstanceId: event.tokenInstanceId,
      tokenDefinitionId: event.tokenDefinitionId,
      effectId: event.effectId,
      amount: event.type === "effectAddPowerApplied" ? event.amount : undefined,
      sourceZone: event.type === "cardMoved" ? event.sourceZone : undefined,
      destinationZone:
        event.type === "cardMoved" ? event.destinationZone : undefined,
      ownerBefore: event.ownerBefore,
      ownerAfter: event.ownerAfter,
      destination: event.destination,
      powerBefore:
        event.type === "effectAddPowerApplied" ? event.powerBefore : undefined,
      powerAfter:
        event.type === "effectAddPowerApplied" ? event.powerAfter : undefined,
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
