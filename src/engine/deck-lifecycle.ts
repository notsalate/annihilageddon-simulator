import type { RandomSource } from "./rng.js";

export interface DeckDrawResult<Card> {
  card: Card | undefined;
  reshuffled: boolean;
}

export interface DeckDrawCardsResult<Card> {
  cards: Card[];
  reshuffleCount: number;
}

interface FaceUpState {
  faceUp?: true;
}

function isFaceUpState(value: unknown): value is FaceUpState {
  return typeof value === "object" && value !== null && "faceUp" in value;
}

/** Clear a transient open-card marker whenever a value leaves its observed position. */
export function clearFaceUpState(value: unknown): void {
  if (isFaceUpState(value)) {
    delete value.faceUp;
  }
}

export function clearFaceUpStates<T>(values: readonly T[]): void {
  for (const value of values) {
    clearFaceUpState(value);
  }
}

export function shuffleDeck<T>(items: T[], rng: RandomSource): void {
  clearFaceUpStates(items);
  shuffleItems(items, rng);
}

function shuffleItems<T>(items: T[], rng: RandomSource): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.nextInt(index + 1);
    const item = items[index];
    const swapItem = items[swapIndex];
    if (item === undefined || swapItem === undefined) {
      throw new Error("Unexpected sparse array during shuffle");
    }

    items[index] = swapItem;
    items[swapIndex] = item;
  }
}

export function refillDeckFromDiscard<T>(
  deck: T[],
  discard: T[],
  rng: RandomSource
): boolean {
  if (deck.length > 0 || discard.length === 0) {
    return false;
  }

  deck.push(...discard.splice(0));
  shuffleDeck(deck, rng);
  return true;
}

export interface DeckPreviewResult<Card> {
  card: Card | undefined;
  deck: Card[];
  discard: Card[];
  rng: RandomSource;
  reshuffled: boolean;
}

/** Simulates one top-card peek without changing the supplied deck state or RNG. */
export function previewDeckCard<T>(
  deck: readonly T[],
  discard: readonly T[],
  rng: RandomSource
): DeckPreviewResult<T> {
  const previewDeck = [...deck];
  const previewDiscard = [...discard];
  const previewRng = rng.fork();
  let reshuffled = false;

  if (previewDeck.length === 0 && previewDiscard.length > 0) {
    previewDeck.push(...previewDiscard.splice(0));
    shuffleItems(previewDeck, previewRng);
    reshuffled = true;
  }

  return {
    card: previewDeck[0],
    deck: previewDeck,
    discard: previewDiscard,
    rng: previewRng,
    reshuffled,
  };
}

/** Returns the next deck card without changing the deck, discard, or RNG. */
export function peekDeckCard<T>(
  deck: readonly T[],
  discard: readonly T[],
  rng: RandomSource
): T | undefined {
  return previewDeckCard(deck, discard, rng).card;
}

export function drawDeckCard<T>(
  deck: T[],
  discard: T[],
  rng: RandomSource
): DeckDrawResult<T> {
  const reshuffled = refillDeckFromDiscard(deck, discard, rng);
  const card = deck.shift();
  clearFaceUpState(card);
  return {
    card,
    reshuffled,
  };
}

export function drawDeckCards<T>(
  deck: T[],
  discard: T[],
  count: number,
  rng: RandomSource,
  onReshuffle?: () => void
): DeckDrawCardsResult<T> {
  const cards: T[] = [];
  let reshuffleCount = 0;

  for (let index = 0; index < count; index += 1) {
    const result = drawDeckCard(deck, discard, rng);
    if (result.reshuffled) {
      reshuffleCount += 1;
      onReshuffle?.();
    }
    if (result.card === undefined) {
      break;
    }
    cards.push(result.card);
  }

  return { cards, reshuffleCount };
}
