import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  createSeededRng,
  forkGameState,
  type CardDefinition,
  type GameState,
  type TokenDefinition,
} from "../src/index.js";
import { calculateEffectivePlayerVictoryPoints } from "../src/engine/effective-values.js";
import { recordBotActionSelected } from "../src/engine/event-recorder.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
  markPlayerId,
  markTokenDefinitionId,
  markTokenInstanceId,
} from "../src/domain/types.js";
import { clonePhysicalCardLedger } from "../src/engine/control-ledger.js";
import { verifiedTestRuntimeEffect } from "./helpers/verified-runtime-effect.js";

function createFixture(): GameState {
  const playerId = markPlayerId("player-1");
  const card = (
    instanceId: string,
    ownerId: "common" | typeof playerId = playerId
  ) => ({
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
  const cardDefinition: CardDefinition = {
    schemaVersion: 1,
    cardId: "fixture-card",
    source: { image: "assets/cards/fixtures/fixture-card.png" },
    visible: {
      nameRu: "Fixture card",
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
      effects: [],
      unsupportedMechanics: [],
    },
  };
  const tokenDefinition: TokenDefinition = {
    schemaVersion: 1,
    tokenId: "fixture-token",
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    source: { image: "assets/wizard-property/fixture-token.png" },
    engine: {
      mappingStatus: "fixture",
      playableInV0: true,
      effects: [],
      unsupportedMechanics: [],
    },
  };

  return {
    seed: 124,
    runtimeMode: "fixture",
    rng: createSeededRng(124),
    activePlayerId: playerId,
    turn: {
      number: 2,
      power: 4,
      controlledPowerBonus: 1,
      activatedCardIds: ["activated-card"],
      gainedCards: [
        {
          playerId,
          definitionId: markCardDefinitionId("gained-card"),
          cardInstanceId: markCardInstanceId("gained-instance-1"),
        },
        {
          playerId,
          definitionId: markCardDefinitionId("gained-card"),
          cardInstanceId: markCardInstanceId("gained-instance-2"),
        },
      ],
      mainMarketCardHandReplacementSourceCardIds: ["replacement-source"],
      damagingAttackPlayerIds: [],
      temporaryCardControls: [
        {
          cardInstanceId: markCardInstanceId("played-card"),
          controllerId: playerId,
        },
      ],
    },
    players: [
      {
        playerId,
        deck: [],
        hand: [card("hand-card")],
        discard: [card("discard-1"), card("discard-2"), card("discard-3")],
        playedThisTurn: [card("played-card")],
        permanents: [card("permanent-card")],
        unboughtFamiliars: [card("familiar-card")],
        effectiveCardTypeSelections: [],
        deadWizardTokens: [token("player-dwt")],
        wizardProperties: [token("wizard-property")],
        statuses: [
          {
            instanceId: "status-instance",
            statusId: "status-id",
            ownerId: playerId,
            effects: [{ effectId: "add_power", timing: "onPlay", amount: 1 }],
          },
        ],
        trophyLikeObjects: [
          {
            instanceId: "trophy-instance",
            trophyId: "trophy-id",
            ownerId: playerId,
            effects: [{ effectId: "add_power", timing: "onPlay", amount: 1 }],
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
    cardDefinitions: new Map([[cardDefinition.cardId, cardDefinition]]),
    tokenDefinitions: new Map([[tokenDefinition.tokenId, tokenDefinition]]),
    deadWizardTokenResolution: {
      boundaryDepth: 0,
      pendingFaces: [],
    },
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
  fork.turn.gainedCards.push({
    playerId: markPlayerId("player-1"),
    definitionId: markCardDefinitionId("fork-gained-card"),
    cardInstanceId: markCardInstanceId("fork-gained-instance"),
  });
  fork.turn.temporaryCardControls[0]!.controllerId = markPlayerId("player-2");
  fork.turn.temporaryCardControls.push({
    cardInstanceId: markCardInstanceId("fork-controlled-card"),
    controllerId: markPlayerId("player-2"),
  });
  forkPlayer.chips += 3;
  forkPlayer.life.current -= 1;
  forkPlayer.hand[0]!.marketChips = 2;
  fork.common.market[0]!.marketChips = 1;
  fork.common.deadWizardTokens.drawStack[0]!.definitionId =
    markTokenDefinitionId("fork-token");
  forkPlayer.statuses[0]!.effects[0]!.timing = "endTurn";
  forkPlayer.trophyLikeObjects[0]!.effects[0]!.timing = "endTurn";
  fork.eventLog[0]!.targetCardInstanceIds!.push("fork-event");

  assert.equal(source.turn.activatedCardIds.includes("fork-only"), false);
  assert.deepEqual(
    source.turn.gainedCards.map((record) => record.definitionId),
    ["gained-card", "gained-card"]
  );
  assert.deepEqual(source.turn.temporaryCardControls, [
    {
      cardInstanceId: markCardInstanceId("played-card"),
      controllerId: markPlayerId("player-1"),
    },
  ]);
  assert.equal(sourcePlayer.chips, 2);
  assert.equal(sourcePlayer.life.current, 5);
  assert.equal(sourcePlayer.hand[0]!.marketChips, 0);
  assert.equal(source.common.market[0]!.marketChips, 0);
  assert.equal(
    source.common.deadWizardTokens.drawStack[0]!.definitionId,
    markTokenDefinitionId("fixture-token")
  );
  assert.equal(sourcePlayer.statuses[0]!.effects[0]!.timing, "onPlay");
  assert.equal(sourcePlayer.trophyLikeObjects[0]!.effects[0]!.timing, "onPlay");
  assert.deepEqual(source.eventLog[0]!.targetCardInstanceIds, ["hand-card"]);
  assert.equal(fork.cardDefinitions, source.cardDefinitions);
  assert.equal(fork.tokenDefinitions, source.tokenDefinitions);
  assert.equal(fork.effectChoiceStrategy, source.effectChoiceStrategy);
  assert.notEqual(fork.eventLog, source.eventLog);
});

test("fork preserves verified effects for Effective Value calculations", () => {
  const source = createFixture();
  const sourcePlayer = source.players[0]!;
  sourcePlayer.statuses[0]!.statusId = "dingler";
  sourcePlayer.statuses[0]!.effects = [
    verifiedTestRuntimeEffect({
      effectId: "modify_effective_value",
      timing: "whileControlled",
      valueKind: "playerVictoryPoints",
      operation: "add",
      amount: -5,
      target: { targetType: "player" },
    }),
  ];
  sourcePlayer.trophyLikeObjects = [];

  const fork = forkGameState(source);

  assert.equal(
    calculateEffectivePlayerVictoryPoints(fork, sourcePlayer.playerId, 10),
    5
  );
});

test("Ledger clones all physical card storage through one operation", () => {
  const source = createFixture();
  const sourceCard = source.common.market[0]!;
  source.common.destroyedMegaMayhem.push({
    ...sourceCard,
    instanceId: markCardInstanceId("destroyed-mega-mayhem-card"),
  });

  const cloned = clonePhysicalCardLedger(source);
  cloned.common.destroyedMegaMayhem[0]!.marketChips = 3;

  assert.equal(source.common.destroyedMegaMayhem.length, 1);
  assert.equal(source.common.destroyedMegaMayhem[0]!.marketChips, 0);
  assert.notEqual(
    cloned.common.destroyedMegaMayhem[0],
    source.common.destroyedMegaMayhem[0]
  );
});

test("fork isolates source mutations and sibling mutable collections", () => {
  const source = createFixture();
  const first = forkGameState(source);
  const second = forkGameState(source);
  const sourcePlayer = source.players[0]!;
  const firstPlayer = first.players[0]!;
  const secondPlayer = second.players[0]!;

  source.turn.gainedCards.push({
    playerId: markPlayerId("player-1"),
    definitionId: markCardDefinitionId("source-gained-card"),
    cardInstanceId: markCardInstanceId("source-gained-instance"),
  });
  sourcePlayer.statuses[0]!.effects[0]!.timing = "endTurn";
  sourcePlayer.trophyLikeObjects[0]!.effects[0]!.timing = "endTurn";

  assert.deepEqual(
    first.turn.gainedCards.map((record) => record.definitionId),
    ["gained-card", "gained-card"]
  );
  assert.equal(firstPlayer.statuses[0]!.effects[0]!.timing, "onPlay");
  assert.equal(firstPlayer.trophyLikeObjects[0]!.effects[0]!.timing, "onPlay");

  first.turn.gainedCards.push({
    playerId: markPlayerId("player-1"),
    definitionId: markCardDefinitionId("first-gained-card"),
    cardInstanceId: markCardInstanceId("first-gained-instance"),
  });
  first.turn.damagingAttackPlayerIds.push(markPlayerId("player-1"));
  firstPlayer.statuses[0]!.effects[0]!.timing = "whileControlled";
  firstPlayer.trophyLikeObjects[0]!.effects[0]!.timing = "whileControlled";

  assert.deepEqual(
    second.turn.gainedCards.map((record) => record.definitionId),
    ["gained-card", "gained-card"]
  );
  assert.deepEqual(second.turn.damagingAttackPlayerIds, []);
  assert.equal(secondPlayer.statuses[0]!.effects[0]!.timing, "onPlay");
  assert.equal(secondPlayer.trophyLikeObjects[0]!.effects[0]!.timing, "onPlay");
  assert.deepEqual(
    source.turn.gainedCards.map((record) => record.definitionId),
    ["gained-card", "gained-card", "source-gained-card"]
  );
  assert.deepEqual(source.turn.damagingAttackPlayerIds, []);
  assert.equal(sourcePlayer.statuses[0]!.effects[0]!.timing, "endTurn");
  assert.equal(
    sourcePlayer.trophyLikeObjects[0]!.effects[0]!.timing,
    "endTurn"
  );
});

test("fork isolates turn power, zones, statuses, and trophies", () => {
  const source = createFixture();
  const fork = forkGameState(source);
  const sourcePlayer = source.players[0]!;
  const forkPlayer = fork.players[0]!;

  fork.turn.power = 0;
  forkPlayer.deck.push({
    ...forkPlayer.hand[0]!,
    instanceId: markCardInstanceId("fork-deck"),
  });
  forkPlayer.hand.splice(0, 1);
  forkPlayer.discard.splice(0, 1);
  forkPlayer.playedThisTurn.push({
    ...forkPlayer.permanents[0]!,
    instanceId: markCardInstanceId("fork-played"),
  });
  forkPlayer.permanents.push({
    ...forkPlayer.discard[0]!,
    instanceId: markCardInstanceId("fork-permanent"),
  });
  forkPlayer.unboughtFamiliars[0]!.marketChips = 3;
  forkPlayer.deadWizardTokens[0]!.definitionId =
    markTokenDefinitionId("fork-dwt");
  forkPlayer.wizardProperties[0]!.definitionId =
    markTokenDefinitionId("fork-property");
  forkPlayer.statuses[0]!.statusId = "fork-status";
  forkPlayer.trophyLikeObjects[0]!.trophyId = "fork-trophy";

  assert.equal(source.turn.power, 4);
  assert.equal(sourcePlayer.deck.length, 0);
  assert.equal(sourcePlayer.hand.length, 1);
  assert.equal(sourcePlayer.discard.length, 3);
  assert.equal(sourcePlayer.playedThisTurn.length, 1);
  assert.equal(sourcePlayer.permanents.length, 1);
  assert.equal(sourcePlayer.unboughtFamiliars[0]!.marketChips, 0);
  assert.equal(
    sourcePlayer.deadWizardTokens[0]!.definitionId,
    markTokenDefinitionId("fixture-token")
  );
  assert.equal(
    sourcePlayer.wizardProperties[0]!.definitionId,
    markTokenDefinitionId("fixture-token")
  );
  assert.equal(sourcePlayer.statuses[0]!.statusId, "status-id");
  assert.equal(sourcePlayer.trophyLikeObjects[0]!.trophyId, "trophy-id");
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

test("fork continues action sequences without changing the source log", () => {
  const source = createFixture();
  const fork = forkGameState(source);

  recordBotActionSelected(fork, { type: "endTurn" });
  const result = applyAction(fork, { type: "endTurn" });

  assert.equal(result.ok, true);
  assert.equal(source.eventLog.length, 1);
  const newActionSequences = fork.eventLog
    .slice(source.eventLog.length)
    .map((event) => event.actionSequence)
    .filter((sequence): sequence is number => sequence !== undefined);
  assert.ok(newActionSequences.length > 0);
  assert.deepEqual([...new Set(newActionSequences)], [4]);
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
