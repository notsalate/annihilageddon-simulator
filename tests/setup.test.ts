import assert from "node:assert/strict";
import test from "node:test";

import {
  initializeGame,
  loadV0DataPack,
  scoreGame,
  type CardInstance,
  type GameState,
  type LoadedDataPack,
} from "../src/index.js";

const rootDir = process.cwd();

test("initial game setup is deterministic for the same seed", () => {
  const first = initializeGame({ rootDir, seed: 60615 });
  const second = initializeGame({ rootDir, seed: 60615 });

  assert.deepEqual(snapshot(first), snapshot(second));
});

test("initial game setup can use a preloaded data pack", () => {
  const dataPack = loadV0DataPack(rootDir);
  const fromFilesystem = initializeGame({ rootDir, seed: 60615 });
  const fromLoadedDataPack = initializeGame({ dataPack, seed: 60615 });

  assert.deepEqual(snapshot(fromLoadedDataPack), snapshot(fromFilesystem));
});

test("initial game setup creates expected player and common zones", () => {
  const state = initializeGame({ rootDir, seed: 12345 });

  assert.equal(state.players.length, 2);
  assert.equal(state.common.market.length, 5);
  assert.equal(state.common.legendMarket.length, 3);
  assert.equal(state.common.wildMagicStack.length, 15);
  assert.equal(state.common.limpWandStack.length, 15);
  assert.equal(state.common.deadWizardTokens.status, "available");
  assert.equal(state.common.deadWizardTokens.drawStack.length, 8);
  const neutralDeadWizardToken = state.tokenDefinitions.get(
    "esw2_dbg__dead_wizard_token_001"
  );
  assert.equal(neutralDeadWizardToken?.kind, "deadWizardToken");
  assert.equal(neutralDeadWizardToken.victoryPoints, -3);

  for (const player of state.players) {
    assert.equal(player.hand.length, 5);
    assert.equal(player.deck.length, 5);
    assert.equal(player.discard.length, 0);
    assert.equal(player.playedThisTurn.length, 0);
    assert.equal(player.permanents.length, 0);
    assert.equal(player.wizardProperties.length, 1);
    const wizardProperty = player.wizardProperties[0];
    assert.ok(wizardProperty);
    assert.equal(wizardProperty.ownerId, player.playerId);
    assert.equal(
      state.tokenDefinitions.get(wizardProperty.definitionId)?.kind,
      "wizardProperty"
    );
  }
});

test("dead wizard token setup uses four shuffled draw tokens per player", () => {
  const state = initializeGame({ rootDir, seed: 12345, playerCount: 3 });

  assert.equal(state.common.deadWizardTokens.status, "available");
  assert.equal(state.common.deadWizardTokens.drawStack.length, 12);
});

test("dead wizard token setup order is reproducible for the same seed", () => {
  const first = initializeGame({ rootDir, seed: 24680 });
  const second = initializeGame({ rootDir, seed: 24680 });

  assert.deepEqual(
    tokenSnapshot(first.common.deadWizardTokens.drawStack),
    tokenSnapshot(second.common.deadWizardTokens.drawStack)
  );
});

test("dead wizard tokens left in setup draw stack do not score for players", () => {
  const state = initializeGame({ rootDir, seed: 12345 });

  assert.equal(state.common.deadWizardTokens.status, "available");
  assert.equal(state.common.deadWizardTokens.drawStack.length, 8);
  for (const score of scoreGame(state)) {
    assert.equal(score.deadWizardTokenCount, 0);
  }
});

test("v0 data pack loads the wizard property setup pool", () => {
  const dataPack = loadV0DataPack(rootDir);
  const wizardPropertyStack = dataPack.tokenStacks.wizardProperties;
  const executableWizardProperties = new Set([
    "esw2_dbg__wizard_property_001",
    "esw2_dbg__wizard_property_002",
    "esw2_dbg__wizard_property_004",
    "esw2_dbg__wizard_property_005",
    "esw2_dbg__wizard_property_006",
    "esw2_dbg__wizard_property_007",
    "esw2_dbg__wizard_property_008",
    "esw2_dbg__wizard_property_009",
    "esw2_dbg__wizard_property_010",
  ]);

  assert.ok(wizardPropertyStack);
  assert.equal(wizardPropertyStack.entries.length, 10);

  for (const entry of wizardPropertyStack.entries) {
    assert.equal(entry.count, 1);
    const definition = dataPack.tokenDefinitions.get(entry.tokenId);
    assert.equal(definition?.kind, "wizardProperty");
    assert.equal(
      definition.engine?.playableInV0,
      executableWizardProperties.has(entry.tokenId)
    );
  }
});

test("wizard property setup choice is deterministic and seed-dependent", () => {
  const first = initializeGame({ rootDir, seed: 11111 });
  const firstRepeat = initializeGame({ rootDir, seed: 11111 });
  const second = initializeGame({ rootDir, seed: 22222 });

  assert.deepEqual(
    selectedWizardProperties(first),
    selectedWizardProperties(firstRepeat)
  );
  assert.notDeepEqual(
    selectedWizardProperties(first),
    selectedWizardProperties(second)
  );
});

test("familiar-selection wizard property remains non-executable until familiar lifecycle exists", () => {
  const dataPack = loadV0DataPack(rootDir);
  const definition = dataPack.tokenDefinitions.get(
    "esw2_dbg__wizard_property_003"
  );

  assert.equal(definition?.kind, "wizardProperty");
  assert.equal(definition.engine?.playableInV0, false);
  assert.deepEqual(definition.engine?.effects, []);
  assert.ok(
    definition.engine?.unsupportedMechanics.includes(
      "wizard-property-setup-familiar-selection"
    )
  );
});

test("starter deck definitions are independent physical instances per player", () => {
  const state = initializeGame({ rootDir, seed: 777 });
  const firstPlayerStarter = ownedCards(state, "player-1");
  const secondPlayerStarter = ownedCards(state, "player-2");

  assert.equal(countDefinition(firstPlayerStarter, "esw2_dbg__starter_001"), 6);
  assert.equal(countDefinition(firstPlayerStarter, "esw2_dbg__starter_003"), 1);
  assert.equal(countDefinition(firstPlayerStarter, "esw2_dbg__starter_002"), 3);
  assert.equal(
    countDefinition(secondPlayerStarter, "esw2_dbg__starter_001"),
    6
  );
  assert.equal(
    countDefinition(secondPlayerStarter, "esw2_dbg__starter_003"),
    1
  );
  assert.equal(
    countDefinition(secondPlayerStarter, "esw2_dbg__starter_002"),
    3
  );

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

test("wizard property setup replaces exactly one owned starter Sign with Hrenalocka Wand", () => {
  const dataPack = createWizardPropertySetupDataPack(
    loadV0DataPack(rootDir),
    "esw2_dbg__wizard_property_009"
  );
  const state = initializeGame({ dataPack, seed: 777 });

  for (const player of state.players) {
    assert.equal(
      player.wizardProperties[0]?.definitionId,
      "esw2_dbg__wizard_property_009"
    );
    const starterCards = ownedCards(state, player.playerId);
    assert.equal(countDefinition(starterCards, "esw2_dbg__starter_001"), 5);
    assert.equal(countDefinition(starterCards, "esw2_dbg__starter_004"), 1);
  }
});

test("wizard property setup grants Basic Trophy, first turn, and starting life override", () => {
  const state = initializeGame({ rootDir, seed: 777, playerCount: 10 });
  const propertyOwner = state.players.find((player) => {
    return player.wizardProperties.some(
      (property) => property.definitionId === "esw2_dbg__wizard_property_010"
    );
  });
  assert.ok(propertyOwner);

  assert.equal(state.activePlayerId, propertyOwner.playerId);
  assert.equal(propertyOwner.life.current, 25);
  assert.equal(propertyOwner.life.max, 25);
  assert.ok(
    propertyOwner.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    )
  );

  for (const otherPlayer of state.players.filter(
    (player) => player.playerId !== propertyOwner.playerId
  )) {
    assert.equal(otherPlayer.life.current, 20);
    assert.equal(
      otherPlayer.trophyLikeObjects.some(
        (trophy) => trophy.trophyId === "basicTrophy"
      ),
      false
    );
  }
});

function snapshot(state: GameState): unknown {
  return {
    activePlayerId: state.activePlayerId,
    players: state.players.map((player) => ({
      playerId: player.playerId,
      deck: cardSnapshot(player.deck),
      hand: cardSnapshot(player.hand),
      discard: cardSnapshot(player.discard),
      playedThisTurn: cardSnapshot(player.playedThisTurn),
      permanents: cardSnapshot(player.permanents),
      wizardProperties: tokenSnapshot(player.wizardProperties),
    })),
    common: {
      market: cardSnapshot(state.common.market),
      legendMarket: cardSnapshot(state.common.legendMarket),
      mainDeck: cardSnapshot(state.common.mainDeck),
      legendDeck: cardSnapshot(state.common.legendDeck),
      wildMagicStack: cardSnapshot(state.common.wildMagicStack),
      limpWandStack: cardSnapshot(state.common.limpWandStack),
      destroyedPile: cardSnapshot(state.common.destroyedPile),
      destroyedMayhem: cardSnapshot(state.common.destroyedMayhem),
      destroyedMegaMayhem: cardSnapshot(state.common.destroyedMegaMayhem),
      deadWizardTokens: state.common.deadWizardTokens,
    },
  };
}

function cardSnapshot(cards: CardInstance[]): unknown[] {
  return cards.map((card) => ({
    instanceId: card.instanceId,
    definitionId: card.definitionId,
    ownerId: card.ownerId,
  }));
}

function tokenSnapshot(
  tokens: GameState["players"][number]["wizardProperties"]
): unknown[] {
  return tokens.map((token) => ({
    instanceId: token.instanceId,
    definitionId: token.definitionId,
    ownerId: token.ownerId,
  }));
}

function selectedWizardProperties(state: GameState): string[] {
  return state.players.map((player) => {
    const property = player.wizardProperties[0];
    assert.ok(property);
    return property.definitionId;
  });
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

function createWizardPropertySetupDataPack(
  dataPack: LoadedDataPack,
  tokenId: string
): LoadedDataPack {
  return {
    ...dataPack,
    tokenStacks: {
      ...dataPack.tokenStacks,
      wizardProperties: {
        schemaVersion: 1,
        stackId: "fixture-wizard-property-setup-stack",
        runtimeSchema: "krutagidon.tokenStack.v0",
        role: "wizardProperties",
        mappingStatus: "fixture",
        entries: [{ tokenId, count: 2 }],
      },
    },
  };
}

function intersection(first: Set<string>, second: Set<string>): string[] {
  return [...first].filter((value) => second.has(value));
}
