import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  createSeededRng,
  forkGameState,
  type GameState,
} from "../src/index.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
  markPlayerId,
  markTokenDefinitionId,
  markTokenInstanceId,
} from "../src/domain/types.js";

function createFixture(): GameState {
  const playerId = markPlayerId("player-1");
  const card = (instanceId: string, ownerId: "common" | typeof playerId = playerId) => ({
    instanceId: markCardInstanceId(instanceId),
    definitionId: markCardDefinitionId("fixture-card"),
    ownerId,
    marketChips: 0,
  });
  const token = (instanceId: string) => ({
    instanceId: markTokenInstanceId(instanceId),
    definitionId: markTokenDefinitionId("fixture-token"),
    ownerId: playerId,
  });
  const choiceStrategy = () => undefined;

  return {
    seed: 124,
    rng: createSeededRng(124),
    activePlayerId: playerId,
    turn: {
      number: 2,
      power: 4,
      controlledPowerBonus: 1,
      activatedCardIds: ["activated-card"],
      gainedCardDefinitionIds: ["gained-card"],
    },
    players: [
      {
        playerId,
        deck: [],
        hand: [card("hand-card")],
        discard: [card("discard-1"), card("discard-2"), card("discard-3")],
        playedThisTurn: [card("played-card")],
        permanents: [card("permanent-card")],
        unboughtFamiliar: card("familiar-card"),
        deadWizardTokens: [token("player-dwt")],
        wizardProperties: [token("wizard-property")],
        statuses: [
          {
            instanceId: "status-instance",
            statusId: "status-id",
            ownerId: playerId,
            effects: [],
          },
        ],
        trophyLikeObjects: [
          {
            instanceId: "trophy-instance",
            trophyId: "trophy-id",
            ownerId: playerId,
            effects: [],
          },
        ],
        chips: 2,
        life: { current: 5, max: 6 },
      },
    ],
    common: {
      market: [card("market-card", "common")],
      legendMarket: [],
      mainDeck: [],
      legendDeck: [],
      wildMagicStack: [],
      limpWandStack: [],
      destroyedPile: [],
      destroyedMayhem: [],
      destroyedMegaMayhem: [],
      deadWizardTokens: {
        status: "available",
        drawStack: [token("common-dwt")],
      },
    },
    cardDefinitions: new Map(),
    tokenDefinitions: new Map(),
    eventLog: [
      {
        type: "handDrawn",
        playerId,
        amount: 1,
        legalChoiceCount: 1,
        choiceId: "1",
        destinationZone: "player-1.hand",
        targetCardInstanceIds: ["hand-card"],
        targetDefinitionIds: ["fixture-card"],
        eventSequence: 7,
        actionSequence: 3,
        turnNumber: 2,
      },
    ],
    effectChoiceStrategy: choiceStrategy,
  };
}

test("forkGameState isolates mutable state and preserves shared definitions", () => {
  const source = createFixture();
  const fork = forkGameState(source);
  const sourcePlayer = source.players[0];
  const forkPlayer = fork.players[0];
  assert.ok(sourcePlayer);
  assert.ok(forkPlayer);

  fork.turn.activatedCardIds.push("fork-only");
  forkPlayer.chips += 3;
  forkPlayer.life.current -= 1;
  forkPlayer.hand[0]!.marketChips = 2;
  fork.common.market[0]!.marketChips = 1;
  fork.common.deadWizardTokens.drawStack[0]!.definitionId = markTokenDefinitionId(
    "fork-token"
  );
  fork.eventLog[0]!.targetCardInstanceIds!.push("fork-event");

  assert.equal(source.turn.activatedCardIds.includes("fork-only"), false);
  assert.equal(sourcePlayer.chips, 2);
  assert.equal(sourcePlayer.life.current, 5);
  assert.equal(sourcePlayer.hand[0]!.marketChips, 0);
  assert.equal(source.common.market[0]!.marketChips, 0);
  assert.equal(
    source.common.deadWizardTokens.drawStack[0]!.definitionId,
    markTokenDefinitionId("fixture-token")
  );
  assert.deepEqual(source.eventLog[0]!.targetCardInstanceIds, ["hand-card"]);
  assert.equal(fork.cardDefinitions, source.cardDefinitions);
  assert.equal(fork.tokenDefinitions, source.tokenDefinitions);
  assert.equal(fork.effectChoiceStrategy, source.effectChoiceStrategy);
  assert.notEqual(fork.eventLog, source.eventLog);
});

test("reassigning fork callback leaves source callback unchanged", () => {
  const source = createFixture();
  const fork = forkGameState(source);
  const replacement = () => undefined;

  fork.effectChoiceStrategy = replacement;

  assert.notEqual(fork.effectChoiceStrategy, source.effectChoiceStrategy);
});

test("fork keeps event sequences unique when applying an action", () => {
  const fork = forkGameState(createFixture());
  const before = fork.eventLog.length;
  const result = applyAction(fork, { type: "endTurn" });

  assert.equal(result.ok, true);
  assert.ok(fork.eventLog.length > before);
  const eventSequences = fork.eventLog
    .map((event) => event.eventSequence)
    .filter((sequence): sequence is number => sequence !== undefined);
  assert.equal(new Set(eventSequences).size, eventSequences.length);
  assert.equal(Math.max(...eventSequences), 7 + fork.eventLog.length - before);
});

test("sibling forks apply the same random action independently", () => {
  const source = createFixture();
  const first = forkGameState(source);
  const second = forkGameState(source);

  const firstResult = applyAction(first, { type: "endTurn" });
  const secondResult = applyAction(second, { type: "endTurn" });

  assert.deepEqual(secondResult, firstResult);
  assert.deepEqual(second.players, first.players);
  assert.deepEqual(second.common, first.common);
  assert.deepEqual(second.eventLog, first.eventLog);
});
