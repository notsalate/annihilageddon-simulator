import assert from "node:assert/strict";
import test from "node:test";

import { initializeGame, type CardInstance, type GameState } from "../src/index.js";

const rootDir = process.cwd();

test("initial game setup is deterministic for the same seed", () => {
  const first = initializeGame({ rootDir, seed: 60615 });
  const second = initializeGame({ rootDir, seed: 60615 });

  assert.deepEqual(snapshot(first), snapshot(second));
});

test("initial game setup creates expected player and common zones", () => {
  const state = initializeGame({ rootDir, seed: 12345 });

  assert.equal(state.players.length, 2);
  assert.equal(state.common.market.length, 5);
  assert.equal(state.common.legendMarket.length, 3);
  assert.equal(state.common.wildMagicStack.length, 15);
  assert.equal(state.common.limpWandStack.length, 15);
  assert.equal(state.common.deadWizardTokens.status, "available");
  assert.ok(state.common.deadWizardTokens.drawStack.length > 0);
  assert.equal(state.tokenDefinitions.get("neutral-dead-wizard-token")?.kind, "deadWizardToken");
  assert.equal(state.tokenDefinitions.get("neutral-dead-wizard-token")?.victoryPoints, -3);

  for (const player of state.players) {
    assert.equal(player.hand.length, 5);
    assert.equal(player.deck.length, 5);
    assert.equal(player.discard.length, 0);
    assert.equal(player.playedThisTurn.length, 0);
    assert.equal(player.permanents.length, 0);
  }
});

test("starter deck definitions are independent physical instances per player", () => {
  const state = initializeGame({ rootDir, seed: 777 });
  const firstPlayerStarter = ownedCards(state, "player-1");
  const secondPlayerStarter = ownedCards(state, "player-2");

  assert.equal(countDefinition(firstPlayerStarter, "esw2_dbg__ocr_022"), 6);
  assert.equal(countDefinition(secondPlayerStarter, "esw2_dbg__ocr_022"), 6);

  const firstPlayerIds = new Set(firstPlayerStarter.map((card) => card.instanceId));
  const secondPlayerIds = new Set(secondPlayerStarter.map((card) => card.instanceId));

  assert.equal(firstPlayerIds.size, 10);
  assert.equal(secondPlayerIds.size, 10);
  assert.deepEqual(intersection(firstPlayerIds, secondPlayerIds), []);
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
    })),
    common: {
      market: cardSnapshot(state.common.market),
      legendMarket: cardSnapshot(state.common.legendMarket),
      mainDeck: cardSnapshot(state.common.mainDeck),
      legendDeck: cardSnapshot(state.common.legendDeck),
      wildMagicStack: cardSnapshot(state.common.wildMagicStack),
      limpWandStack: cardSnapshot(state.common.limpWandStack),
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

function ownedCards(state: GameState, ownerId: "player-1" | "player-2"): CardInstance[] {
  const player = state.players.find((candidate) => candidate.playerId === ownerId);
  assert.ok(player);
  return [...player.deck, ...player.hand, ...player.discard, ...player.playedThisTurn, ...player.permanents];
}

function countDefinition(cards: CardInstance[], definitionId: string): number {
  return cards.filter((card) => card.definitionId === definitionId).length;
}

function intersection(first: Set<string>, second: Set<string>): string[] {
  return [...first].filter((value) => second.has(value));
}
