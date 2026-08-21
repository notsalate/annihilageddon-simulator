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
  test(`endTurn rolls back cleanup, draw, controls, Market Flow, events, and RNG for ${eventKind}`, () => {
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
    state.turn.gainedCardDefinitionIds = [cleanupCard.definitionId];
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
    const destroyed =
      eventKind === "mayhem"
        ? state.common.destroyedMayhem
        : state.common.destroyedMegaMayhem;
    market.splice(0);
    sourceDeck.splice(0, sourceDeck.length, eventCard);

    const players = state.players;
    const common = state.common;
    const turn = state.turn;
    const activePlayerId = state.activePlayerId;
    const hand = activePlayer.hand;
    const deck = activePlayer.deck;
    const discard = activePlayer.discard;
    const playedThisTurn = activePlayer.playedThisTurn;
    const controls = state.turn.temporaryCardControls;
    const eventLog = state.eventLog;
    const turnBefore = structuredClone(state.turn);
    const handBefore = [...hand];
    const deckBefore = [...deck];
    const discardBefore = [...discard];
    const playedThisTurnBefore = [...playedThisTurn];
    const sourceDeckBefore = [...sourceDeck];
    const marketBefore = [...market];
    const destroyedBefore = [...destroyed];
    const eventLogBefore = [...eventLog];
    const chipsBefore = state.players.map((player) => player.chips);
    const expectedNextRandom = state.rng.fork().next();
    let executions = 0;

    const result = withTemporaryEffectRuntimeOperations(
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
    );

    assert.deepEqual(result, { ok: false, error: `late ${eventKind} failure` });
    assert.equal(executions, 2);
    assert.equal(state.players, players);
    assert.equal(state.common, common);
    assert.equal(state.turn, turn);
    assert.equal(state.activePlayerId, activePlayerId);
    assert.equal(activePlayer.hand, hand);
    assert.equal(activePlayer.deck, deck);
    assert.equal(activePlayer.discard, discard);
    assert.equal(activePlayer.playedThisTurn, playedThisTurn);
    assert.equal(state.turn.temporaryCardControls, controls);
    assert.equal(state.eventLog, eventLog);
    assert.deepEqual(state.eventLog, eventLogBefore);
    assert.deepEqual(state.turn, turnBefore);
    assert.deepEqual(hand, handBefore);
    assert.deepEqual(deck, deckBefore);
    assert.deepEqual(discard, discardBefore);
    assert.deepEqual(playedThisTurn, playedThisTurnBefore);
    assert.deepEqual(sourceDeck, sourceDeckBefore);
    assert.deepEqual(market, marketBefore);
    assert.deepEqual(destroyed, destroyedBefore);
    assert.deepEqual(
      state.players.map((player) => player.chips),
      chipsBefore
    );
    assert.equal(
      state.eventLog.some(
        (event) =>
          event.type === "marketEventCardOpened" &&
          event.cardInstanceId === eventCard.instanceId
      ),
      false
    );
    assert.equal(state.rng.next(), expectedNextRandom);
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
