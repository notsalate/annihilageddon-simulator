import assert from "node:assert/strict";
import test from "node:test";

import { applyAction, initializeGame } from "../src/index.js";
import {
  createGameScenario,
  givenRuntimeCard,
  givenTemporaryControl,
} from "./helpers/game-scenario.js";
import { createTerminalMarketEventFixture } from "./helpers/market-flow-fixtures.js";
import { withTemporaryEffectRuntimeOperations } from "./helpers/with-temporary-effect-runtime-operations.js";

const rootDir = process.cwd();
const eventKinds = ["mayhem", "megaMayhem"] as const;

for (const eventKind of eventKinds) {
  test(`late endTurn errors stop after cleanup and Market Flow mutations for ${eventKind}`, () => {
    const scenario = createGameScenario({
      rootDir,
      seed: eventKind === "mayhem" ? 18701 : 18801,
      playerCount: 2,
    });
    const state = scenario.state;
    state.runtimeMode = "fixture";
    const activePlayer = scenario.activePlayer;
    const cleanupCard = givenRuntimeCard(scenario, { effects: [] });
    const playedCard = givenRuntimeCard(scenario, {
      effects: [],
      zone: "playedThisTurn",
    });
    givenTemporaryControl(scenario, playedCard, activePlayer);
    state.turn.power = 7;
    state.turn.controlledPowerBonus = 3;
    state.turn.activatedCardIds = [playedCard.instanceId];
    state.turn.gainedCards = [
      {
        playerId: activePlayer.playerId,
        definitionId: cleanupCard.definitionId,
        cardInstanceId: cleanupCard.instanceId,
      },
    ];
    state.turn.damagingAttackPlayerIds = [activePlayer.playerId];

    const { eventCard } = createTerminalMarketEventFixture({
      state,
      eventKind,
      effects: [
        {
          effectId: "add_power",
          timing: "onMayhemResolve",
          amount: 1,
        },
        {
          effectId: "add_power",
          timing: "onMayhemResolve",
          amount: 2,
        },
      ],
    });
    const sourceDeck =
      eventKind === "mayhem" ? state.common.mainDeck : state.common.legendDeck;
    const market =
      eventKind === "mayhem" ? state.common.market : state.common.legendMarket;
    market.splice(0);
    sourceDeck.splice(0, sourceDeck.length, eventCard);

    const eventLogLength = state.eventLog.length;
    let executions = 0;

    assert.throws(
      () =>
        withTemporaryEffectRuntimeOperations(
          "add_power",
          {
            execute(mutatedState, player) {
              executions += 1;
              if (executions === 1) {
                mutatedState.turn.power += 2;
                player.chips += 6;
                return { ok: true };
              }
              mutatedState.turn.power += 9;
              player.chips += 4;
              mutatedState.rng.next();
              return { ok: false, error: `late ${eventKind} failure` };
            },
          },
          () => applyAction(state, { type: "endTurn" })
        ),
      new RegExp(`late ${eventKind} failure`)
    );
    assert.equal(executions, 2);
    assert.equal(activePlayer.hand.includes(cleanupCard), false);
    assert.equal(activePlayer.playedThisTurn.includes(playedCard), false);
    assert.equal(sourceDeck.includes(eventCard), false);
    assert.equal(market.includes(eventCard), false);
    assert.equal(
      state.eventLog.some(
        (event) =>
          event.type === "marketEventCardOpened" &&
          event.cardInstanceId === eventCard.instanceId
      ),
      true
    );
    assert.equal(
      state.eventLog.some(
        (event) =>
          event.type === "endTurnCleanupMoved" &&
          event.targetCardInstanceIds?.includes(cleanupCard.instanceId)
      ),
      true
    );
    assert.ok(state.eventLog.length > eventLogLength);
  });

  test(`endTurn commits terminal ${eventKind} after destroying the event card`, () => {
    const state = initializeGame({
      rootDir,
      seed: eventKind === "mayhem" ? 18702 : 18802,
      playerCount: 2,
    });
    state.runtimeMode = "fixture";
    const activePlayerId = state.activePlayerId;
    const nextPlayer = state.players.find(
      (player) => player.playerId !== activePlayerId
    );
    assert.ok(nextPlayer);
    const { eventCard } = createTerminalMarketEventFixture({
      state,
      eventKind,
      effects: [
        {
          effectId: "add_power",
          timing: "onMayhemResolve",
          amount: 1,
        },
      ],
    });
    const sourceDeck =
      eventKind === "mayhem" ? state.common.mainDeck : state.common.legendDeck;
    const market =
      eventKind === "mayhem" ? state.common.market : state.common.legendMarket;
    const destroyed =
      eventKind === "mayhem"
        ? state.common.destroyedMayhem
        : state.common.destroyedMegaMayhem;
    const destroyedEventType =
      eventKind === "mayhem" ? "mayhemDestroyed" : "megaMayhemDestroyed";
    market.splice(0);
    sourceDeck.splice(0, sourceDeck.length, eventCard);

    const result = withTemporaryEffectRuntimeOperations(
      "add_power",
      {
        execute(_state, player) {
          return {
            ok: true,
            gameEnd: {
              reason: "playerDefeated",
              winnerPlayerId: player.playerId,
            },
          };
        },
      },
      () => applyAction(state, { type: "endTurn" })
    );

    assert.deepEqual(result, {
      ok: true,
      gameEndReason: "playerDefeated",
      winnerPlayerId: nextPlayer.playerId,
    });
    assert.equal(state.activePlayerId, nextPlayer.playerId);
    assert.equal(sourceDeck.includes(eventCard), false);
    assert.equal(market.includes(eventCard), false);
    assert.equal(destroyed.includes(eventCard), true);
    assert.equal(
      state.eventLog.some(
        (event) =>
          event.type === "marketEventCardOpened" &&
          event.cardInstanceId === eventCard.instanceId
      ),
      true
    );
    assert.equal(
      state.eventLog.some(
        (event) =>
          event.type === "mayhemResolved" &&
          event.cardInstanceId === eventCard.instanceId
      ),
      false
    );
    assert.equal(
      state.eventLog.some(
        (event) =>
          event.type === destroyedEventType &&
          event.cardInstanceId === eventCard.instanceId
      ),
      false
    );
    assert.equal(
      state.eventLog.findIndex(
        (event) =>
          event.type === "turnEnded" && event.playerId === activePlayerId
      ) <
        state.eventLog.findIndex(
          (event) =>
            event.type === "marketEventCardOpened" &&
            event.cardInstanceId === eventCard.instanceId
        ),
      true
    );
    assert.equal(
      state.eventLog.some(
        (event) =>
          event.type === "turnStarted" && event.playerId === nextPlayer.playerId
      ),
      false
    );
  });
}

test("successful endTurn preserves cleanup, draw, and turn-start event order", () => {
  const scenario = createGameScenario({
    rootDir,
    seed: 18703,
    playerCount: 2,
  });
  const state = scenario.state;
  givenRuntimeCard(scenario, { effects: [] });
  givenRuntimeCard(scenario, { effects: [], zone: "playedThisTurn" });
  const firstActionEventIndex = state.eventLog.length;

  const result = applyAction(state, { type: "endTurn" });

  assert.deepEqual(result, { ok: true });
  const actionEvents = state.eventLog.slice(firstActionEventIndex);
  const cleanupIndexes = actionEvents.flatMap((event, index) =>
    event.type === "endTurnCleanupMoved" ? [index] : []
  );
  const turnEndedIndex = actionEvents.findIndex(
    (event) => event.type === "turnEnded"
  );
  const handDrawnIndex = actionEvents.findIndex(
    (event) => event.type === "handDrawn"
  );
  const turnStartedIndex = actionEvents.findIndex(
    (event) => event.type === "turnStarted"
  );

  assert.ok(cleanupIndexes.length >= 2);
  assert.ok(cleanupIndexes.every((index) => index < turnEndedIndex));
  assert.ok(turnEndedIndex < handDrawnIndex);
  assert.ok(handDrawnIndex < turnStartedIndex);
});
