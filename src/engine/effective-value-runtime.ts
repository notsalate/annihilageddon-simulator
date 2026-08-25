import type { CardDefinition, TokenDefinition } from "./data.js";
import {
  calculateEffectiveCardCost as calculateEffectiveCardCostCore,
  calculateEffectiveCardVictoryPoints as calculateEffectiveCardVictoryPointsCore,
  calculateEffectivePlayerMaxLife as calculateEffectivePlayerMaxLifeCore,
  calculateEffectivePlayerVictoryPoints as calculateEffectivePlayerVictoryPointsCore,
  calculateEffectiveTokenVictoryPoints as calculateEffectiveTokenVictoryPointsCore,
  getOwnedScoringCards,
  type CardTypeMatcher,
} from "./effective-values.js";
import { cardMatchesTypeForPlayer } from "./card-type-runtime.js";
import type { CardInstance, GameState, PlayerId } from "./setup.js";

const playerCardTypeMatcher: CardTypeMatcher = cardMatchesTypeForPlayer;

export function calculateEffectiveCardCost(
  state: GameState,
  playerId: PlayerId,
  definition: CardDefinition,
  card?: CardInstance
): number {
  return calculateEffectiveCardCostCore(
    state,
    playerId,
    definition,
    card,
    playerCardTypeMatcher
  );
}

export function calculateEffectiveCardVictoryPoints(
  state: GameState,
  playerId: PlayerId,
  definition: CardDefinition,
  card: CardInstance | undefined
): number {
  return calculateEffectiveCardVictoryPointsCore(
    state,
    playerId,
    definition,
    card,
    playerCardTypeMatcher
  );
}

export function calculateEffectivePlayerMaxLife(
  state: GameState,
  playerId: PlayerId
): number {
  return calculateEffectivePlayerMaxLifeCore(
    state,
    playerId,
    playerCardTypeMatcher
  );
}

export function calculateEffectivePlayerVictoryPoints(
  state: GameState,
  playerId: PlayerId,
  baseValue: number
): number {
  return calculateEffectivePlayerVictoryPointsCore(
    state,
    playerId,
    baseValue,
    playerCardTypeMatcher
  );
}

export function calculateEffectiveTokenVictoryPoints(
  state: GameState,
  playerId: PlayerId,
  definition: TokenDefinition
): number {
  return calculateEffectiveTokenVictoryPointsCore(
    state,
    playerId,
    definition,
    playerCardTypeMatcher
  );
}

export { getOwnedScoringCards };
