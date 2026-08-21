import assert from "node:assert/strict";
import test from "node:test";

import {
  drawDeckCard,
  drawDeckCards,
  shuffleDeck,
} from "../src/engine/deck-lifecycle.js";
import { createSeededRng } from "../src/index.js";

test("deck lifecycle shuffles the same input reproducibly", () => {
  const first = ["a", "b", "c", "d"];
  const second = [...first];

  shuffleDeck(first, createSeededRng(60615));
  shuffleDeck(second, createSeededRng(60615));

  assert.deepEqual(first, second);
});

test("deck lifecycle refills and draws from discard only when the deck is empty", () => {
  const deck = ["top"];
  const discard = ["discard-1", "discard-2"];
  const rng = createSeededRng(60615);

  const first = drawDeckCard(deck, discard, rng);
  assert.deepEqual(first, { card: "top", reshuffled: false });
  assert.deepEqual(discard, ["discard-1", "discard-2"]);

  const second = drawDeckCard(deck, discard, rng);
  assert.equal(second.reshuffled, true);
  assert.equal(second.card === undefined, false);
  assert.deepEqual(discard, []);
  assert.equal(deck.length, 1);
});

test("deck lifecycle bulk draw counts a discard refill and stops at exhaustion", () => {
  const deck: string[] = [];
  const discard = ["only-card"];
  const rng = createSeededRng(60615);
  const reshuffles: number[] = [];

  const result = drawDeckCards(deck, discard, 2, rng, () => {
    reshuffles.push(reshuffles.length);
  });
  assert.deepEqual(result.cards, ["only-card"]);
  assert.equal(result.reshuffleCount, 1);
  assert.deepEqual(reshuffles, [0]);
  assert.deepEqual(deck, []);
  assert.deepEqual(discard, []);
});
