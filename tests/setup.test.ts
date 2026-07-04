import assert from "node:assert/strict";
import test from "node:test";

import {
  initializeGame,
  loadCurrentRuntimeDataPack,
  type CardInstance,
  type GameState,
} from "../src/index.js";

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

  assert.equal(
    setupMarketEvents.filter((event) => event.destinationZone === "mainMarket")
      .length,
    5
  );
  assert.equal(
    setupMarketEvents.filter((event) => event.destinationZone === "legendMarket")
      .length,
    3
  );
  for (const event of setupMarketEvents) {
    assert.equal(event.playerId, state.activePlayerId);
  }
});

test("starter card instances are independent between players", () => {
  const state = initializeGame({ rootDir, seed: 777 });
  const firstPlayerStarter = ownedCards(state, "player-1");
  const secondPlayerStarter = ownedCards(state, "player-2");
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

  assert.equal(setupChoiceEvents.length, 2);
  for (const event of setupChoiceEvents) {
    const candidates = event.candidateDefinitionIds ?? [];
    assert.equal(event.policyId, "alwaysPickFirst");
    assert.ok(candidates.length > 0);
    assert.equal(event.chosenDefinitionId, candidates[0]);
  }
});

function snapshot(state: GameState): unknown {
  return {
    activePlayerId: state.activePlayerId,
    players: state.players.map((player) => ({
      playerId: player.playerId,
      deck: cardSnapshot(player.deck),
      hand: cardSnapshot(player.hand),
      wizardProperties: player.wizardProperties.map((token) => ({
        instanceId: token.instanceId,
        definitionId: token.definitionId,
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
    instanceId: card.instanceId,
    definitionId: card.definitionId,
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
