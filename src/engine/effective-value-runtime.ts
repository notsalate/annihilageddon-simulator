import type { CardDefinition, TokenDefinition } from "./data.js";
import { applyEffectiveValueModifier } from "./effect-runtime-registry.js";
import {
  calculateEffectiveCardCost as calculateEffectiveCardCostCore,
  calculateEffectiveCardVictoryPoints as calculateEffectiveCardVictoryPointsCore,
  calculateEffectivePlayerMaxLife as calculateEffectivePlayerMaxLifeCore,
  calculateEffectivePlayerVictoryPoints as calculateEffectivePlayerVictoryPointsCore,
  calculateEffectiveTokenVictoryPoints as calculateEffectiveTokenVictoryPointsCore,
} from "./effective-values.js";
import type { CardInstance, GameState, PlayerId } from "./setup.js";

export function calculateEffectiveCardCost(
  state: GameState,
  playerId: PlayerId,
  definition: CardDefinition
): number {
  return calculateEffectiveCardCostCore(
    state,
    playerId,
    definition,
    applyEffectiveValueModifier
  );
}

export function calculateEffectiveCardVictoryPoints(
  state: GameState,
  playerId: PlayerId,
  definition: CardDefinition,
  card?: CardInstance
): number {
  return calculateEffectiveCardVictoryPointsCore(
    state,
    playerId,
    definition,
    card,
    applyEffectiveValueModifier
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
    applyEffectiveValueModifier
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
    applyEffectiveValueModifier
  );
}

export function calculateEffectivePlayerMaxLife(
  state: GameState,
  playerId: PlayerId
): number {
  return calculateEffectivePlayerMaxLifeCore(
    state,
    playerId,
    applyEffectiveValueModifier
  );
}

export { getOwnedScoringCards } from "./effective-values.js";
