import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  createSeededRng,
  forkGameState,
  type CardInstance,
  type CardDefinition,
  type GameState,
  type TokenDefinition,
} from "../src/index.js";
import { recordBotActionSelected } from "../src/engine/event-recorder.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
  markPlayerId,
  markTokenDefinitionId,
  markTokenInstanceId,
} from "../src/domain/types.js";
import {
  clonePhysicalCardZones,
  listPhysicalCardZoneDescriptors,
  registerPhysicalCardZoneDescriptorFactory,
} from "../src/engine/control-ledger.js";

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
      gainedCardDefinitionIds: ["gained-card", "gained-card"],
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
        unboughtFamiliar: card("familiar-card"),
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
  fork.turn.gainedCardDefinitionIds.push("fork-gained-card");
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
  assert.deepEqual(source.turn.gainedCardDefinitionIds, [
    "gained-card",
    "gained-card",
  ]);
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

test("Ledger clones descriptor zones with isolated cards", () => {
  const source = createFixture();
  const target = createFixture();
  const sourceCard = source.common.market[0]!;
  source.common.destroyedMegaMayhem.push({
    ...sourceCard,
    instanceId: markCardInstanceId("destroyed-mega-mayhem-card"),
  });

  clonePhysicalCardZones(source, target, (card: CardInstance) => ({ ...card }));
  target.common.destroyedMegaMayhem[0]!.marketChips = 3;

  assert.equal(source.common.destroyedMegaMayhem.length, 1);
  assert.equal(source.common.destroyedMegaMayhem[0]!.marketChips, 0);
  assert.notEqual(
    target.common.destroyedMegaMayhem[0],
    source.common.destroyedMegaMayhem[0]
  );
});

test("fork clones a descriptor-only card location without sharing mutable cards", () => {
  type StateWithDescriptorOnlyZone = GameState & {
    players: Array<
      GameState["players"][number] & { descriptorOnlyZone: CardInstance[] }
    >;
  };
  const source = createFixture() as StateWithDescriptorOnlyZone;
  const player = source.players[0]!;
  player.descriptorOnlyZone = [
    {
      ...player.hand[0]!,
      instanceId: markCardInstanceId("descriptor-only-card"),
    },
  ];
  registerPhysicalCardZoneDescriptorFactory(
    source,
    Object.assign(
      (state: Pick<GameState, "players" | "common">) => {
        const zonePlayer = state
          .players[0] as StateWithDescriptorOnlyZone["players"][number];
        return {
          cardinality: "many" as const,
          scoringEligible: false,
          read: () => [...zonePlayer.descriptorOnlyZone],
          replace: (cards: readonly CardInstance[]) => {
            zonePlayer.descriptorOnlyZone = [...cards];
          },
        };
      },
      {
        identity: "fixture.descriptor-only-zone",
        zoneName: "descriptorOnlyZone",
      }
    )
  );

  const fork = forkGameState(source) as StateWithDescriptorOnlyZone;
  const sourceDescriptor = listPhysicalCardZoneDescriptors(source).find(
    (descriptor) => descriptor.zoneName === "descriptorOnlyZone"
  );
  const forkDescriptor = listPhysicalCardZoneDescriptors(fork).find(
    (descriptor) => descriptor.zoneName === "descriptorOnlyZone"
  );
  assert.ok(sourceDescriptor);
  assert.ok(forkDescriptor);
  assert.deepEqual(forkDescriptor.read(), sourceDescriptor.read());
  assert.notEqual(forkDescriptor.read()[0], sourceDescriptor.read()[0]);

  forkDescriptor.replace([
    {
      ...forkDescriptor.read()[0]!,
      instanceId: markCardInstanceId("descriptor-only-replacement"),
      marketChips: 4,
    },
  ]);

  assert.equal(sourceDescriptor.read()[0]!.marketChips, 0);
  assert.equal(forkDescriptor.read()[0]!.marketChips, 4);
  assert.notEqual(forkDescriptor.read()[0], sourceDescriptor.read()[0]);
});

test("fork clones a descriptor zone stored outside enumerable state", () => {
  const source = createFixture();
  const externalZones = new WeakMap<object, readonly CardInstance[]>();
  const sourceCard = {
    ...source.players[0]!.hand[0]!,
    instanceId: markCardInstanceId("external-zone-card"),
  };
  externalZones.set(source, [sourceCard]);
  registerPhysicalCardZoneDescriptorFactory(
    source,
    Object.assign(
      (state: Pick<GameState, "players" | "common">) => ({
        cardinality: "zeroOrOne" as const,
        scoringEligible: true,
        expectedOwnerId: source.players[0]!.playerId,
        read: () => externalZones.get(state) ?? [],
        replace: (cards: readonly CardInstance[]) => {
          externalZones.set(state, [...cards]);
        },
      }),
      { identity: "fixture.external-zone", zoneName: "externalZone" }
    )
  );

  const fork = forkGameState(source);
  const sourceDescriptor = listPhysicalCardZoneDescriptors(source).find(
    (descriptor) => descriptor.zoneName === "externalZone"
  );
  const forkDescriptor = listPhysicalCardZoneDescriptors(fork).find(
    (descriptor) => descriptor.zoneName === "externalZone"
  );

  assert.ok(sourceDescriptor);
  assert.ok(forkDescriptor);
  assert.equal(forkDescriptor.cardinality, "zeroOrOne");
  assert.equal(forkDescriptor.scoringEligible, true);
  assert.equal(forkDescriptor.expectedOwnerId, source.players[0]!.playerId);
  assert.deepEqual(forkDescriptor.read(), sourceDescriptor.read());
  assert.notEqual(forkDescriptor.read()[0], sourceDescriptor.read()[0]);

  forkDescriptor.replace([
    {
      ...forkDescriptor.read()[0]!,
      marketChips: 4,
    },
  ]);

  assert.equal(sourceDescriptor.read()[0]!.marketChips, 0);
  assert.equal(forkDescriptor.read()[0]!.marketChips, 4);
});

test("fork preserves Map-backed descriptor storage before replaying extension cards", () => {
  type StateWithMapDescriptorZone = GameState & {
    players: Array<
      GameState["players"][number] & {
        descriptorStorage: Map<string, CardInstance[]>;
      }
    >;
  };
  const source = createFixture() as StateWithMapDescriptorZone;
  const sourcePlayer = source.players[0]!;
  const sourceCard = {
    ...sourcePlayer.hand[0]!,
    instanceId: markCardInstanceId("map-descriptor-zone-card"),
  };
  sourcePlayer.descriptorStorage = new Map([["extension-zone", [sourceCard]]]);
  registerPhysicalCardZoneDescriptorFactory(
    source,
    Object.assign(
      (state: Pick<GameState, "players" | "common">) => {
        const player = state
          .players[0] as StateWithMapDescriptorZone["players"][number];
        const storage = player.descriptorStorage.get("extension-zone");
        assert.ok(storage);
        return {
          cardinality: "many" as const,
          scoringEligible: false,
          expectedOwnerId: player.playerId,
          read: () => player.descriptorStorage.get("extension-zone") ?? storage,
          replace: (cards: readonly CardInstance[]) => {
            player.descriptorStorage.set("extension-zone", [...cards]);
          },
        };
      },
      {
        identity: "fixture.map-descriptor-zone",
        zoneName: "mapDescriptorZone",
      }
    )
  );

  const fork = forkGameState(source) as StateWithMapDescriptorZone;
  const forkPlayer = fork.players[0]!;
  const sourceDescriptor = listPhysicalCardZoneDescriptors(source).find(
    (descriptor) => descriptor.zoneName === "mapDescriptorZone"
  );
  const forkDescriptor = listPhysicalCardZoneDescriptors(fork).find(
    (descriptor) => descriptor.zoneName === "mapDescriptorZone"
  );

  assert.ok(sourceDescriptor);
  assert.ok(forkDescriptor);
  assert.ok(forkPlayer.descriptorStorage instanceof Map);
  assert.notEqual(forkPlayer.descriptorStorage, sourcePlayer.descriptorStorage);
  assert.notEqual(
    forkPlayer.descriptorStorage.get("extension-zone"),
    sourcePlayer.descriptorStorage.get("extension-zone")
  );
  assert.deepEqual(forkDescriptor.read(), sourceDescriptor.read());
  assert.notEqual(forkDescriptor.read()[0], sourceDescriptor.read()[0]);

  forkDescriptor.replace([
    {
      ...forkDescriptor.read()[0]!,
      marketChips: 5,
    },
  ]);

  assert.equal(sourceDescriptor.read()[0]!.marketChips, 0);
  assert.equal(forkDescriptor.read()[0]!.marketChips, 5);
});

test("fork clones each physical card once per Analyzer branch", () => {
  const source = createFixture();
  const externalZones = new WeakMap<object, readonly CardInstance[]>();
  const externalCard = {
    ...source.players[0]!.hand[0]!,
    instanceId: markCardInstanceId("clone-count-external-card"),
  };
  externalZones.set(source, [externalCard]);
  registerPhysicalCardZoneDescriptorFactory(
    source,
    Object.assign(
      (state: Pick<GameState, "players" | "common">) => ({
        cardinality: "many" as const,
        scoringEligible: false,
        read: () => externalZones.get(state) ?? [],
        replace: (cards: readonly CardInstance[]) => {
          externalZones.set(state, [...cards]);
        },
      }),
      { identity: "fixture.clone-count", zoneName: "cloneCountZone" }
    )
  );

  const sourceCards = listPhysicalCardZoneDescriptors(source).flatMap(
    (descriptor) => descriptor.read()
  );
  const marketChipReads = new Map<CardInstance["instanceId"], number>();
  for (const card of sourceCards) {
    Object.defineProperty(card, "marketChips", {
      configurable: true,
      enumerable: true,
      get() {
        marketChipReads.set(
          card.instanceId,
          (marketChipReads.get(card.instanceId) ?? 0) + 1
        );
        return 0;
      },
    });
  }

  const forks = [
    forkGameState(source),
    forkGameState(source),
    forkGameState(source),
  ];

  assert.equal(marketChipReads.size, sourceCards.length);
  for (const sourceCard of sourceCards) {
    assert.equal(marketChipReads.get(sourceCard.instanceId), forks.length);
  }
  for (const fork of forks) {
    const forkCards = new Map(
      listPhysicalCardZoneDescriptors(fork)
        .flatMap((descriptor) => descriptor.read())
        .map((card) => [card.instanceId, card])
    );
    for (const sourceCard of sourceCards) {
      assert.notEqual(forkCards.get(sourceCard.instanceId), sourceCard);
    }
  }
});

test("fork preserves Map descriptor storage while cloning its card once per branch", () => {
  type StateWithMapDescriptorZone = GameState & {
    players: Array<
      GameState["players"][number] & {
        descriptorStorage: Map<string, CardInstance[]>;
      }
    >;
  };
  const source = createFixture() as StateWithMapDescriptorZone;
  const sourcePlayer = source.players[0]!;
  const sourceCard = {
    ...sourcePlayer.hand[0]!,
    instanceId: markCardInstanceId("map-clone-count-card"),
  };
  let marketChipReads = 0;
  Object.defineProperty(sourceCard, "marketChips", {
    configurable: true,
    enumerable: true,
    get() {
      marketChipReads += 1;
      return 0;
    },
  });
  sourcePlayer.descriptorStorage = new Map([["extension-zone", [sourceCard]]]);
  registerPhysicalCardZoneDescriptorFactory(
    source,
    Object.assign(
      (state: Pick<GameState, "players" | "common">) => {
        const player = state
          .players[0] as StateWithMapDescriptorZone["players"][number];
        const storage = player.descriptorStorage.get("extension-zone");
        assert.ok(storage);
        return {
          cardinality: "many" as const,
          scoringEligible: false,
          read: () => player.descriptorStorage.get("extension-zone") ?? storage,
          replace: (cards: readonly CardInstance[]) => {
            player.descriptorStorage.set("extension-zone", [...cards]);
          },
        };
      },
      {
        identity: "fixture.map-clone-count",
        zoneName: "mapCloneCountZone",
      }
    )
  );

  const forks = [
    forkGameState(source) as StateWithMapDescriptorZone,
    forkGameState(source) as StateWithMapDescriptorZone,
    forkGameState(source) as StateWithMapDescriptorZone,
  ];

  assert.equal(marketChipReads, forks.length);
  const forkCards = forks.map((fork) => {
    const storage = fork.players[0]!.descriptorStorage;
    assert.ok(storage instanceof Map);
    assert.notEqual(storage, sourcePlayer.descriptorStorage);
    const cards = storage.get("extension-zone");
    assert.ok(cards);
    assert.notEqual(
      cards,
      sourcePlayer.descriptorStorage.get("extension-zone")
    );
    assert.notEqual(cards[0], sourceCard);
    return cards[0]!;
  });
  assert.notEqual(forkCards[0], forkCards[1]);
  assert.notEqual(forkCards[1], forkCards[2]);

  forkCards[0]!.marketChips = 7;
  assert.equal(forkCards[1]!.marketChips, 0);
  assert.equal(forkCards[2]!.marketChips, 0);
});

test("fork isolates source mutations and sibling mutable collections", () => {
  const source = createFixture();
  const first = forkGameState(source);
  const second = forkGameState(source);
  const sourcePlayer = source.players[0]!;
  const firstPlayer = first.players[0]!;
  const secondPlayer = second.players[0]!;

  source.turn.gainedCardDefinitionIds.push("source-gained-card");
  sourcePlayer.statuses[0]!.effects[0]!.timing = "endTurn";
  sourcePlayer.trophyLikeObjects[0]!.effects[0]!.timing = "endTurn";

  assert.deepEqual(first.turn.gainedCardDefinitionIds, [
    "gained-card",
    "gained-card",
  ]);
  assert.equal(firstPlayer.statuses[0]!.effects[0]!.timing, "onPlay");
  assert.equal(firstPlayer.trophyLikeObjects[0]!.effects[0]!.timing, "onPlay");

  first.turn.gainedCardDefinitionIds.push("first-gained-card");
  first.turn.damagingAttackPlayerIds.push(markPlayerId("player-1"));
  firstPlayer.statuses[0]!.effects[0]!.timing = "whileControlled";
  firstPlayer.trophyLikeObjects[0]!.effects[0]!.timing = "whileControlled";

  assert.deepEqual(second.turn.gainedCardDefinitionIds, [
    "gained-card",
    "gained-card",
  ]);
  assert.deepEqual(second.turn.damagingAttackPlayerIds, []);
  assert.equal(secondPlayer.statuses[0]!.effects[0]!.timing, "onPlay");
  assert.equal(secondPlayer.trophyLikeObjects[0]!.effects[0]!.timing, "onPlay");
  assert.deepEqual(source.turn.gainedCardDefinitionIds, [
    "gained-card",
    "gained-card",
    "source-gained-card",
  ]);
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
  forkPlayer.unboughtFamiliar!.marketChips = 3;
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
  assert.equal(sourcePlayer.unboughtFamiliar!.marketChips, 0);
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
