import type { CardDefinition, TokenDefinition } from "./data.js";
import type { CardInstance, GameState, PlayerId } from "./setup.js";
import { findCardLocation } from "./control-ledger.js";
import {
  isOwnedCardsCountAsCardTypeRuntimeEffect,
  type OwnedCardsCountAsCardTypeRuntimeEffect,
} from "./effect-runtime-card-type.js";

type CardTypeEffectResolution = {
  readonly status: "resolved";
  readonly effect: OwnedCardsCountAsCardTypeRuntimeEffect;
};

type CardTypeCapabilityMode = "always" | "perCard";

const cardTypeOptionsCache = new WeakMap<GameState, Map<string, string[]>>();

export function cardMatchesTypeForPlayer(
  state: GameState,
  playerId: PlayerId,
  definition: CardDefinition,
  cardType: string,
  card?: CardInstance
): boolean {
  if (
    definition.engine.cardTypes.includes(cardType) ||
    definition.engine.tags?.includes("counts_as_every_card_type") === true
  ) {
    return true;
  }
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId
  );
  if (player === undefined) return false;

  if (card !== undefined && card.ownerId !== playerId) return false;
  let capabilityMode: CardTypeCapabilityMode | undefined;
  for (const property of player.wizardProperties) {
    const propertyCapability = wizardPropertyCountsDefinitionAsType(
      state,
      property.definitionId,
      definition,
      cardType
    );
    if (propertyCapability === "always") {
      capabilityMode = "always";
      break;
    }
    if (propertyCapability === "perCard") {
      capabilityMode = "perCard";
    }
  }
  if (capabilityMode === undefined || capabilityMode === "always") {
    return capabilityMode === "always";
  }
  if (card === undefined) return false;
  return player.effectiveCardTypeSelections.some(
    (selection) =>
      selection.cardInstanceId === card.instanceId &&
      selection.cardType === cardType
  );
}

export function getCardEffectiveTypeOptions(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance
): string[] {
  const player = requirePlayer(state, playerId);
  if (card.ownerId !== playerId) return [];
  const definition = state.cardDefinitions.get(card.definitionId);
  if (definition === undefined) return [];

  const cacheKey = JSON.stringify([
    state.runtimeMode,
    playerId,
    player.wizardProperties.map(({ instanceId, definitionId }) => [
      instanceId,
      definitionId,
    ]),
    card.definitionId,
  ]);
  const cachedOptions = cardTypeOptionsCache.get(state)?.get(cacheKey);
  if (cachedOptions !== undefined) return cachedOptions;

  const options = new Set<string>();
  for (const property of player.wizardProperties) {
    const propertyDefinition = state.tokenDefinitions.get(
      property.definitionId
    );
    const effects =
      propertyDefinition?.kind === "wizardProperty"
        ? propertyDefinition.engine?.effects
        : undefined;
    if (effects === undefined) continue;

    for (const effect of effects) {
      if (!isOwnedCardsCountAsCardTypeRuntimeEffect(effect)) continue;
      const resolvedEffect = resolveCardTypeEffect(effect);
      if (
        resolvedEffect.effect.selectionMode === "perCard" &&
        resolvedEffect.effect.sourceCardTypes.some((sourceCardType) =>
          definition.engine.cardTypes.includes(sourceCardType)
        )
      ) {
        options.add(resolvedEffect.effect.countedAsCardType);
      }
    }
  }
  const sortedOptions = Array.from(options).sort();
  const stateCache = cardTypeOptionsCache.get(state) ?? new Map();
  stateCache.set(cacheKey, sortedOptions);
  cardTypeOptionsCache.set(state, stateCache);
  return sortedOptions;
}

export function hasPlayerPerCardEffectiveTypeEffects(
  state: GameState,
  playerId: PlayerId
): boolean {
  const player = requirePlayer(state, playerId);
  for (const property of player.wizardProperties) {
    const propertyDefinition = state.tokenDefinitions.get(
      property.definitionId
    );
    const effects =
      propertyDefinition?.kind === "wizardProperty"
        ? propertyDefinition.engine?.effects
        : undefined;
    if (effects === undefined) continue;

    for (const effect of effects) {
      if (
        isOwnedCardsCountAsCardTypeRuntimeEffect(effect) &&
        effect.selectionMode === "perCard"
      ) {
        return true;
      }
    }
  }
  return false;
}

export function isPlayerCardEffectiveTypeSelected(
  state: GameState,
  playerId: PlayerId,
  cardInstanceId: CardInstance["instanceId"],
  cardType: string
): boolean {
  const player = requirePlayer(state, playerId);
  return player.effectiveCardTypeSelections.some(
    (selection) =>
      selection.cardInstanceId === cardInstanceId &&
      selection.cardType === cardType
  );
}

export function setPlayerCardEffectiveType(
  state: GameState,
  playerId: PlayerId,
  cardInstanceId: CardInstance["instanceId"],
  cardType: string
): void {
  const player = requirePlayer(state, playerId);
  const location = findCardLocation(state, cardInstanceId);
  if (location === undefined || location.card.ownerId !== playerId) {
    throw new Error(
      `Card ${cardInstanceId} is not owned by player ${playerId}`
    );
  }

  const definition = state.cardDefinitions.get(location.card.definitionId);
  if (definition === undefined) {
    throw new Error(`Missing card definition ${location.card.definitionId}`);
  }
  if (
    !getCardEffectiveTypeOptions(state, playerId, location.card).includes(
      cardType
    )
  ) {
    throw new Error(
      `Player ${playerId} has no wizard property that counts ${cardInstanceId} as ${cardType}`
    );
  }
  if (
    !player.effectiveCardTypeSelections.some(
      (selection) =>
        selection.cardInstanceId === cardInstanceId &&
        selection.cardType === cardType
    )
  ) {
    player.effectiveCardTypeSelections.push({ cardInstanceId, cardType });
  }
}

export function clearPlayerCardEffectiveType(
  state: GameState,
  playerId: PlayerId,
  cardInstanceId: CardInstance["instanceId"],
  cardType: string
): void {
  const player = requirePlayer(state, playerId);
  const location = findCardLocation(state, cardInstanceId);
  if (location === undefined || location.card.ownerId !== playerId) {
    throw new Error(
      `Card ${cardInstanceId} is not owned by player ${playerId}`
    );
  }
  player.effectiveCardTypeSelections =
    player.effectiveCardTypeSelections.filter(
      (selection) =>
        selection.cardInstanceId !== cardInstanceId ||
        selection.cardType !== cardType
    );
}

function requirePlayer(state: GameState, playerId: PlayerId) {
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId
  );
  if (player === undefined) {
    throw new Error(`Missing player ${playerId}`);
  }
  return player;
}

function wizardPropertyCountsDefinitionAsType(
  state: GameState,
  tokenDefinitionId: TokenDefinition["tokenId"],
  definition: CardDefinition,
  cardType: string
): CardTypeCapabilityMode | undefined {
  const propertyDefinition = state.tokenDefinitions.get(tokenDefinitionId);
  const effects =
    propertyDefinition?.kind === "wizardProperty"
      ? propertyDefinition.engine?.effects
      : undefined;
  if (effects === undefined) return undefined;

  for (const effect of effects) {
    if (!isOwnedCardsCountAsCardTypeRuntimeEffect(effect)) continue;
    const resolvedEffect = resolveCardTypeEffect(effect);
    if (
      resolvedEffect.effect.countedAsCardType === cardType &&
      resolvedEffect.effect.sourceCardTypes.some((sourceCardType) =>
        definition.engine.cardTypes.includes(sourceCardType)
      )
    ) {
      return resolvedEffect.effect.selectionMode ?? "always";
    }
  }
  return undefined;
}

function resolveCardTypeEffect(
  effect: OwnedCardsCountAsCardTypeRuntimeEffect
): CardTypeEffectResolution {
  return { status: "resolved", effect };
}
