import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  initializeGame,
  listLegalActions,
  type CardInstance,
  type GameState,
  type LoadedDataPack,
  type RuntimeEffect,
} from "../src/index.js";
import { loadCurrentRuntimeDataPack } from "../src/engine/data.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
  markPlayerId,
  type CardInstanceId,
} from "../src/domain/types.js";

const rootDir = process.cwd();

test("initial game setup is deterministic for the same seed", () => {
  const first = initializeGame({ rootDir, seed: 60615 });
  const second = initializeGame({ rootDir, seed: 60615 });

  assert.deepEqual(snapshot(first), snapshot(second));
});

test("current runtime data pack uses current-runtime manifest", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);

  assert.equal(dataPack.manifest.packId, "current-runtime-data-pack");
  assert.equal(
    dataPack.manifest.decks?.starterDeck,
    "data/decks/starter-deck.json"
  );
});

test("current runtime data pack uses canonical starter template", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);

  assert.deepEqual(dataPack.decks.starterDeck.entries, [
    { cardId: "esw2_dbg__starter_001", count: 6 },
    { cardId: "esw2_dbg__starter_002", count: 3 },
    { cardId: "esw2_dbg__starter_003", count: 1 },
  ]);
  assert.equal(
    dataPack.cardDefinitions.get("esw2_dbg__starter_003")?.visible.nameRu,
    "Сырная палочка"
  );
});

test("initial runtime setup gives each player exactly ten starter cards", () => {
  const state = initializeGame({ rootDir, seed: 12345 });

  assert.equal(state.players.length, 2);
  assert.equal(state.common.market.length, 5);
  assert.equal(state.common.legendMarket.length, 3);

  for (const player of state.players) {
    const starterCards = ownedCards(state, player.playerId);
    assert.equal(starterCards.length, 10);
    assert.equal(player.hand.length, 5);
    assert.equal(player.deck.length, 5);
    assert.equal(countDefinition(starterCards, "esw2_dbg__starter_001"), 6);
    assert.equal(countDefinition(starterCards, "esw2_dbg__starter_002"), 3);
    assert.equal(countDefinition(starterCards, "esw2_dbg__starter_003"), 1);
  }
});

test("setup records initial market additions as setup-phase events", () => {
  const state = initializeGame({ rootDir, seed: 12345 });
  const setupMarketEvents = state.eventLog.filter(
    (event) =>
      event.type === "marketFlowCardAdded" && event.sourceType === "setup"
  );

  assert.equal(setupMarketEvents.length, 8);
  assert.equal(
    setupMarketEvents.filter((event) => event.destinationZone === "mainMarket")
      .length,
    5
  );
  assert.equal(
    setupMarketEvents.filter(
      (event) => event.destinationZone === "legendMarket"
    ).length,
    3
  );
  for (const event of setupMarketEvents) {
    assert.equal(event.playerId, state.activePlayerId);
  }
});

test("starter card instances are independent between players", () => {
  const state = initializeGame({ rootDir, seed: 777 });
  const firstPlayerStarter = ownedCards(state, markPlayerId("player-1"));
  const secondPlayerStarter = ownedCards(state, markPlayerId("player-2"));
  const firstPlayerIds = new Set(
    firstPlayerStarter.map((card) => card.instanceId)
  );
  const secondPlayerIds = new Set(
    secondPlayerStarter.map((card) => card.instanceId)
  );

  assert.equal(firstPlayerIds.size, 10);
  assert.equal(secondPlayerIds.size, 10);
  assert.deepEqual(intersection(firstPlayerIds, secondPlayerIds), []);
});

test("default setup choice policy records alwaysPickFirst", () => {
  const state = initializeGame({ rootDir, seed: 24680 });
  const setupChoiceEvents = state.eventLog.filter(
    (event) => event.type === "setupChoiceSelected"
  );

  assert.equal(setupChoiceEvents.length, 4);
  for (const event of setupChoiceEvents) {
    const candidates = event.candidateDefinitionIds ?? [];
    const candidateInstanceIds = event.candidateInstanceIds ?? [];
    assert.equal(event.policyId, "alwaysPickFirst");
    assert.ok(candidates.length > 0);
    assert.equal(candidateInstanceIds.length, candidates.length);
    assert.equal(event.chosenDefinitionId, candidates[0]);
    const chosenInstanceId = event.chosenInstanceId;
    assert.equal(chosenInstanceId, candidateInstanceIds[0]);
    assert.ok(chosenInstanceId);
    const owner = state.players.find(
      (player) => player.playerId === event.playerId
    );
    assert.ok(owner);
    const ownedSetupObjects =
      event.setupChoiceKind === "wizardProperty"
        ? owner.wizardProperties
        : owner.unboughtFamiliars;
    assert.ok(
      ownedSetupObjects.some((object) => object.instanceId === chosenInstanceId)
    );
  }
});

test("wizard property 003 keeps two familiars, selects a third, and toggles effective types independently", () => {
  const source = loadCurrentRuntimeDataPack(rootDir);
  const wizardPropertyStack = source.tokenStacks.wizardProperties;
  const familiarPool = source.decks.familiarPool;
  assert.ok(wizardPropertyStack);
  assert.ok(familiarPool);

  const dataPack: LoadedDataPack = {
    ...source,
    decks: {
      ...source.decks,
      familiarPool: {
        ...familiarPool,
        entries: [{ cardId: "esw2_dbg__familiar_003", count: 24 }],
      },
    },
    tokenStacks: {
      ...source.tokenStacks,
      wizardProperties: {
        ...wizardPropertyStack,
        entries: [{ tokenId: "esw2_dbg__wizard_property_003", count: 4 }],
      },
    },
  };

  const setupChoicePhases: string[] = [];
  const state = initializeGame({
    dataPack,
    playerCount: 2,
    seed: 81203,
    familiarSetupChoicePolicy: ({ phase, candidateInstanceIds }) => {
      setupChoicePhases.push(phase);
      const selectedInstanceId =
        phase === "thirdFamiliar"
          ? candidateInstanceIds[candidateInstanceIds.length - 1]
          : candidateInstanceIds[1];
      if (selectedInstanceId === undefined) {
        throw new Error("Expected a familiar setup choice candidate");
      }
      return selectedInstanceId;
    },
  });
  const player = state.players[0];
  const otherPlayer = state.players[1];
  assert.ok(player);
  assert.ok(otherPlayer);
  assert.equal(state.activePlayerId, player.playerId);
  assert.equal(state.players.length, 2);
  assert.deepEqual(setupChoicePhases, ["thirdFamiliar", "thirdFamiliar"]);
  assert.equal(player.unboughtFamiliars.length, 3);
  assert.equal(otherPlayer.unboughtFamiliars.length, 3);
  const familiarChoiceEvent = state.eventLog.find(
    (event) =>
      event.type === "setupChoiceSelected" &&
      event.setupChoiceKind === "familiar" &&
      event.playerId === player.playerId
  );
  assert.ok(familiarChoiceEvent);
  assert.ok(familiarChoiceEvent.chosenInstanceId);
  assert.ok(
    player.unboughtFamiliars.some(
      (card) => card.instanceId === familiarChoiceEvent.chosenInstanceId
    )
  );
  assert.ok(
    player.unboughtFamiliars.every((card) => card.ownerId === player.playerId)
  );
  assert.ok(
    otherPlayer.unboughtFamiliars.every(
      (card) => card.ownerId === otherPlayer.playerId
    )
  );

  const firstFamiliar = player.unboughtFamiliars[0];
  const secondFamiliar = player.unboughtFamiliars[1];
  const foreignFamiliar = otherPlayer.unboughtFamiliars[0];
  assert.ok(firstFamiliar);
  assert.ok(secondFamiliar);
  assert.ok(foreignFamiliar);

  assert.equal(
    listLegalActions(state).some(
      (action) =>
        action.type === "setCardEffectiveType" &&
        action.cardInstanceId === firstFamiliar.instanceId &&
        action.cardType === "legend" &&
        action.enabled
    ),
    true
  );
  assert.deepEqual(
    applyAction(state, {
      type: "setCardEffectiveType",
      cardInstanceId: firstFamiliar.instanceId,
      cardType: "legend",
      enabled: true,
    }),
    { ok: true }
  );
  assert.ok(
    listLegalActions(state).some(
      (action) =>
        action.type === "setCardEffectiveType" &&
        action.cardInstanceId === secondFamiliar.instanceId &&
        action.cardType === "legend" &&
        action.enabled
    )
  );
  const familiarDefinition = state.cardDefinitions.get(
    firstFamiliar.definitionId
  );
  assert.ok(familiarDefinition);
  state.turn.power = 0;
  player.chips = familiarDefinition.engine.cost;
  assert.equal(
    listLegalActions(state).some(
      (action) =>
        action.type === "buyMarketCard" &&
        action.source === "familiar" &&
        action.cardInstanceId === firstFamiliar.instanceId
    ),
    true
  );
  assert.equal(
    listLegalActions(state).some(
      (action) =>
        action.type === "buyMarketCard" &&
        action.source === "familiar" &&
        action.cardInstanceId === secondFamiliar.instanceId
    ),
    false
  );
  assert.deepEqual(
    applyAction(state, {
      type: "buyMarketCard",
      cardInstanceId: firstFamiliar.instanceId,
      source: "familiar",
    }),
    { ok: true }
  );
  assert.equal(player.discard.includes(firstFamiliar), true);
  assert.equal(state.turn.power, 0);
  assert.equal(player.chips, 0);

  assert.deepEqual(
    applyAction(state, {
      type: "setCardEffectiveType",
      cardInstanceId: firstFamiliar.instanceId,
      cardType: "legend",
      enabled: false,
    }),
    { ok: true }
  );
  assert.ok(
    listLegalActions(state).some(
      (action) =>
        action.type === "setCardEffectiveType" &&
        action.cardInstanceId === firstFamiliar.instanceId &&
        action.cardType === "legend" &&
        action.enabled
    )
  );
  const foreignResult = applyAction(state, {
    type: "setCardEffectiveType",
    cardInstanceId: foreignFamiliar.instanceId,
    cardType: "legend",
    enabled: true,
  });
  assert.equal(foreignResult.ok, false);
  if (!foreignResult.ok) {
    assert.match(foreignResult.error, /eligible effective-type target/);
  }
});

test("wizard property 003 can choose an unselected ordinary familiar", () => {
  const source = loadCurrentRuntimeDataPack(rootDir);
  const wizardPropertyStack = source.tokenStacks.wizardProperties;
  const familiarPool = source.decks.familiarPool;
  assert.ok(wizardPropertyStack);
  assert.ok(familiarPool);

  const dataPack: LoadedDataPack = {
    ...source,
    decks: {
      ...source.decks,
      familiarPool: {
        ...familiarPool,
        entries: [{ cardId: "esw2_dbg__familiar_003", count: 24 }],
      },
    },
    tokenStacks: {
      ...source.tokenStacks,
      wizardProperties: {
        ...wizardPropertyStack,
        entries: [
          { tokenId: "esw2_dbg__wizard_property_003", count: 2 },
          { tokenId: "esw2_dbg__wizard_property_004", count: 2 },
        ],
      },
    },
  };

  let ordinaryUnselectedId: CardInstanceId | undefined;
  let thirdChoiceSawOrdinaryUnselected = false;
  const state = initializeGame({
    dataPack,
    playerCount: 2,
    seed: 80001,
    familiarSetupChoicePolicy: ({ phase, candidateInstanceIds }) => {
      if (phase === "startingPair" && ordinaryUnselectedId === undefined) {
        ordinaryUnselectedId = candidateInstanceIds[1];
      }
      if (
        phase === "thirdFamiliar" &&
        ordinaryUnselectedId !== undefined &&
        candidateInstanceIds.includes(ordinaryUnselectedId)
      ) {
        thirdChoiceSawOrdinaryUnselected = true;
        return ordinaryUnselectedId;
      }
      return candidateInstanceIds[0];
    },
  });

  const ordinaryPlayer = state.players.find((player) =>
    player.wizardProperties.some(
      (property) => property.definitionId === "esw2_dbg__wizard_property_004"
    )
  );
  const retainingPlayer = state.players.find((player) =>
    player.wizardProperties.some(
      (property) => property.definitionId === "esw2_dbg__wizard_property_003"
    )
  );
  assert.ok(ordinaryPlayer);
  assert.ok(retainingPlayer);
  assert.ok(ordinaryUnselectedId);
  assert.equal(thirdChoiceSawOrdinaryUnselected, true);
  assert.equal(ordinaryPlayer.unboughtFamiliars.length, 1);
  assert.equal(retainingPlayer.unboughtFamiliars.length, 3);
  assert.ok(
    retainingPlayer.unboughtFamiliars.some(
      (card) => card.instanceId === ordinaryUnselectedId
    )
  );
});

test("invalid familiar setup choice falls back to the first candidate", () => {
  const state = initializeGame({
    rootDir,
    seed: 60615,
    familiarSetupChoicePolicy: () => markCardInstanceId("missing-familiar"),
  });
  const familiarChoiceEvents = state.eventLog.filter(
    (event) =>
      event.type === "setupChoiceSelected" &&
      event.setupChoiceKind === "familiar"
  );

  assert.equal(familiarChoiceEvents.length, state.players.length);
  for (const event of familiarChoiceEvents) {
    assert.ok(event.candidateInstanceIds);
    assert.equal(event.chosenInstanceId, event.candidateInstanceIds[0]);
  }
});

test("current runtime data makes wizard property 003 setup reachable", () => {
  const state = initializeGame({ rootDir, seed: 2 });
  const propertyOwner = state.players.find((player) =>
    player.wizardProperties.some(
      (property) => property.definitionId === "esw2_dbg__wizard_property_003"
    )
  );
  assert.ok(propertyOwner);
  assert.equal(propertyOwner.unboughtFamiliars.length, 3);
});

test("wizard property setup effects update cards, trophies, life, and first player", () => {
  const state = initializeGame({
    dataPack: createSetupEffectsDataPack(),
    seed: 24680,
  });
  const firstPlayer = state.players[0];

  assert.ok(firstPlayer);
  assert.equal(state.activePlayerId, firstPlayer.playerId);
  for (const player of state.players) {
    const starterCards = ownedCards(state, player.playerId);
    assert.equal(countDefinition(starterCards, "esw2_dbg__starter_001"), 5);
    assert.equal(
      countDefinition(starterCards, "fixture-setup-starter-replacement"),
      1
    );
    assert.equal(player.life.current, 27);
    assert.equal(player.life.max, 27);
    assert.equal(
      player.trophyLikeObjects.some(
        (trophy) => trophy.trophyId === "basicTrophy"
      ),
      true
    );
  }
});

function createSetupEffectsDataPack(): LoadedDataPack {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const sourceProperty = dataPack.tokenDefinitions.get(
    "esw2_dbg__wizard_property_001"
  );
  const sourceStarter = dataPack.cardDefinitions.get("esw2_dbg__starter_003");
  const wizardPropertyStack = dataPack.tokenStacks.wizardProperties;
  if (
    sourceProperty?.kind !== "wizardProperty" ||
    sourceProperty.engine === undefined ||
    sourceStarter === undefined ||
    wizardPropertyStack === undefined
  ) {
    throw new Error("Current runtime data is missing setup test fixtures");
  }

  const effects: RuntimeEffect[] = [
    {
      effectId: "replace_starting_card",
      timing: "setup",
      fromDefinitionId: "esw2_dbg__starter_001",
      toDefinitionId: "fixture-setup-starter-replacement",
    },
    {
      effectId: "start_with_basic_trophy",
      timing: "setup",
    },
    {
      effectId: "set_starting_life_total",
      timing: "setup",
      lifeTotal: 27,
    },
    {
      effectId: "force_starting_player",
      timing: "setup",
    },
  ];
  const property = {
    ...sourceProperty,
    tokenId: "fixture-setup-effects-property",
    engine: {
      ...sourceProperty.engine,
      mappingStatus: "fixture",
      playableInV0: true,
      effects,
    },
  };
  const replacementStarter = {
    ...sourceStarter,
    cardId: "fixture-setup-starter-replacement",
  };

  return {
    ...dataPack,
    cardDefinitions: new Map([
      ...dataPack.cardDefinitions,
      [replacementStarter.cardId, replacementStarter],
    ]),
    tokenDefinitions: new Map([
      ...dataPack.tokenDefinitions,
      [property.tokenId, property],
    ]),
    tokenStacks: {
      ...dataPack.tokenStacks,
      wizardProperties: {
        ...wizardPropertyStack,
        entries: [{ tokenId: property.tokenId, count: 4 }],
      },
    },
  };
}

function snapshot(state: GameState): unknown {
  return {
    activePlayerId: state.activePlayerId,
    players: state.players.map((player) => ({
      playerId: player.playerId,
      deck: cardSnapshot(player.deck),
      hand: cardSnapshot(player.hand),
      wizardProperties: player.wizardProperties.map((token) => ({
        instanceId: markCardInstanceId(token.instanceId),
        definitionId: markCardDefinitionId(token.definitionId),
        ownerId: token.ownerId,
      })),
    })),
    common: {
      market: cardSnapshot(state.common.market),
      legendMarket: cardSnapshot(state.common.legendMarket),
    },
  };
}

function cardSnapshot(cards: CardInstance[]): unknown[] {
  return cards.map((card) => ({
    instanceId: markCardInstanceId(card.instanceId),
    definitionId: markCardDefinitionId(card.definitionId),
    ownerId: card.ownerId,
  }));
}

function ownedCards(
  state: GameState,
  ownerId: GameState["players"][number]["playerId"]
): CardInstance[] {
  const player = state.players.find(
    (candidate) => candidate.playerId === ownerId
  );
  assert.ok(player);
  return [
    ...player.deck,
    ...player.hand,
    ...player.discard,
    ...player.playedThisTurn,
    ...player.permanents,
  ];
}

function countDefinition(cards: CardInstance[], definitionId: string): number {
  return cards.filter((card) => card.definitionId === definitionId).length;
}

function intersection(first: Set<string>, second: Set<string>): string[] {
  return [...first].filter((value) => second.has(value));
}
