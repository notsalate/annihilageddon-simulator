import assert from "node:assert/strict";
import test from "node:test";

import {
  loadCurrentRuntimeDataPack,
  initializeGame,
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
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const fromFilesystem = initializeGame({ rootDir, seed: 60615 });
  const fromLoadedDataPack = initializeGame({ dataPack, seed: 60615 });

  assert.deepEqual(snapshot(fromLoadedDataPack), snapshot(fromFilesystem));
});

test("current runtime data pack uses current-runtime manifest and composition paths", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);

  assert.equal(dataPack.manifest.packId, "current-runtime-data-pack");
  assert.equal(dataPack.manifest.mappingStatus, "incomplete-full-only");
  assert.equal(
    dataPack.manifest.decks?.starterDeck,
    "data/decks/starter-deck.json"
  );
  assert.equal(dataPack.manifest.decks?.mainDeck, "data/decks/main-deck.json");
  assert.equal(
    dataPack.manifest.decks?.legendDeck,
    "data/decks/legend-deck.json"
  );
  assert.equal(
    dataPack.manifest.cardStacks?.wildMagicStack,
    "data/stacks/cards/wild-magic-stack.json"
  );
  assert.equal(
    dataPack.manifest.cardStacks?.limpWandStack,
    "data/stacks/cards/limp-wand-stack.json"
  );
  assert.equal(
    dataPack.manifest.pools?.familiarPool,
    "data/pools/familiar-pool.json"
  );
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

test("current runtime data pack loads the wizard property setup pool", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
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
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
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
    loadCurrentRuntimeDataPack(rootDir),
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

test("incomplete-full-only setup skips missing familiar pool and wizard property stack", () => {
  const dataPack = createIncompleteSetupDataPack(
    loadCurrentRuntimeDataPack(rootDir),
    {
      omitFamiliarPool: true,
      omitWizardPropertyStack: true,
    }
  );

  const state = initializeGame({ dataPack, seed: 4242 });

  for (const player of state.players) {
    assert.equal(player.unboughtFamiliar, undefined);
    assert.deepEqual(player.wizardProperties, []);
  }
});

test("incomplete-full-only setup skips empty familiar pool and wizard property stack", () => {
  const dataPack = createIncompleteSetupDataPack(
    loadCurrentRuntimeDataPack(rootDir),
    {
      emptyFamiliarPool: true,
      emptyWizardPropertyStack: true,
    }
  );

  const state = initializeGame({ dataPack, seed: 4343 });

  for (const player of state.players) {
    assert.equal(player.unboughtFamiliar, undefined);
    assert.deepEqual(player.wizardProperties, []);
  }
});

test("incomplete-full-only initialization tolerates empty starter, main, and legend compositions", () => {
  const dataPack = createIncompleteSetupDataPack(
    loadCurrentRuntimeDataPack(rootDir),
    {
      emptyStarterDeck: true,
      emptyMainDeck: true,
      emptyLegendDeck: true,
    }
  );

  const state = initializeGame({ dataPack, seed: 4444 });

  for (const player of state.players) {
    assert.deepEqual(player.hand, []);
    assert.deepEqual(player.deck, []);
  }

  assert.deepEqual(state.common.market, []);
  assert.deepEqual(state.common.legendMarket, []);
  assert.deepEqual(state.common.mainDeck, []);
  assert.deepEqual(state.common.legendDeck, []);
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

function createIncompleteSetupDataPack(
  dataPack: LoadedDataPack,
  options: {
    omitFamiliarPool?: boolean;
    emptyFamiliarPool?: boolean;
    omitWizardPropertyStack?: boolean;
    emptyWizardPropertyStack?: boolean;
    emptyStarterDeck?: boolean;
    emptyMainDeck?: boolean;
    emptyLegendDeck?: boolean;
  }
): LoadedDataPack {
  const manifestTokenStacks = options.omitWizardPropertyStack
    ? dataPack.manifest.tokenStacks === undefined
      ? undefined
      : {
          deadWizardTokens: dataPack.manifest.tokenStacks.deadWizardTokens,
        }
    : dataPack.manifest.tokenStacks;
  const manifest = {
    ...dataPack.manifest,
    ...(options.omitFamiliarPool ? {} : { pools: dataPack.manifest.pools }),
    ...(manifestTokenStacks === undefined
      ? {}
      : { tokenStacks: manifestTokenStacks }),
  };

  return {
    ...dataPack,
    manifest,
    decks: {
      ...dataPack.decks,
      starterDeck: options.emptyStarterDeck
        ? {
            ...dataPack.decks.starterDeck,
            entries: [],
          }
        : dataPack.decks.starterDeck,
      mainDeck: options.emptyMainDeck
        ? {
            ...dataPack.decks.mainDeck,
            entries: [],
          }
        : dataPack.decks.mainDeck,
      legendDeck: options.emptyLegendDeck
        ? {
            ...dataPack.decks.legendDeck,
            entries: [],
          }
        : dataPack.decks.legendDeck,
      familiarPool: options.omitFamiliarPool
        ? undefined
        : options.emptyFamiliarPool && dataPack.decks.familiarPool !== undefined
          ? {
              ...dataPack.decks.familiarPool,
              entries: [],
            }
          : dataPack.decks.familiarPool,
    },
    tokenStacks: {
      ...dataPack.tokenStacks,
      wizardProperties: options.omitWizardPropertyStack
        ? undefined
        : options.emptyWizardPropertyStack &&
            dataPack.tokenStacks.wizardProperties !== undefined
          ? {
              ...dataPack.tokenStacks.wizardProperties,
              entries: [],
            }
          : dataPack.tokenStacks.wizardProperties,
    },
  };
}

function intersection(first: Set<string>, second: Set<string>): string[] {
  return [...first].filter((value) => second.has(value));
}
