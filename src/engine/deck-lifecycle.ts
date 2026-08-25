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
