import type { CardDefinition, TokenDefinition } from "./data.js";
import type {
  CardInstance,
  GameState,
  PlayerId,
  TokenInstance,
} from "./setup.js";
import { findCardLocation } from "./control-ledger.js";
import {
  isOwnedCardsCountAsCardTypeRuntimeEffect,
  type OwnedCardsCountAsCardTypeRuntimeEffect,
} from "./effect-runtime-card-type.js";
import {
  evaluateRuntimeEffectAtTiming,
  type EffectSourceContext,
} from "./effect-runtime-registry.js";
import type { RuntimeEffectForId } from "./runtime-effect.js";
import { requireVerifiedRuntimeEffect } from "./runtime-effect-verification.js";

type CardTypeEffectResolution =
  | {
      readonly status: "resolved";
      readonly effect: OwnedCardsCountAsCardTypeRuntimeEffect;
    }
  | { readonly status: "error"; readonly error: string };

type CardTypeCapabilityMode = "always" | "perCard";

const cardTypeEffectResolutionCache = new WeakMap<
  object,
  Map<string, CardTypeEffectResolution>
>();

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
      playerId,
      property.instanceId,
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

    const source = {
      sourceType: "wizardProperty" as const,
      runtimeMode: state.runtimeMode,
      playerId,
      cardInstanceId: property.instanceId,
      definitionId: property.definitionId,
      tokenInstanceId: property.instanceId,
      tokenDefinitionId: property.definitionId,
    };
    for (const effect of effects) {
      if (!isOwnedCardsCountAsCardTypeRuntimeEffect(effect)) continue;
      const resolvedEffect = resolveCardTypeEffect(effect, source);
      if (resolvedEffect.status === "error") {
        throw new Error(resolvedEffect.error);
      }
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
  return Array.from(options).sort();
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
  playerId: PlayerId,
  tokenInstanceId: TokenInstance["instanceId"],
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

  const source = {
    sourceType: "wizardProperty" as const,
    runtimeMode: state.runtimeMode,
    playerId,
    cardInstanceId: tokenInstanceId,
    definitionId: tokenDefinitionId,
    tokenInstanceId,
    tokenDefinitionId,
  };
  for (const effect of effects) {
    if (!isOwnedCardsCountAsCardTypeRuntimeEffect(effect)) continue;
    const resolvedEffect = resolveCardTypeEffect(effect, source);
    if (resolvedEffect.status === "error") {
      throw new Error(resolvedEffect.error);
    }
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
  effect: RuntimeEffectForId<"owned_cards_count_as_card_type">,
  source: EffectSourceContext
): CardTypeEffectResolution {
  const cacheable =
    Object.isFrozen(effect) && Object.isFrozen(effect.sourceCardTypes);
  const cached = cacheable
    ? cardTypeEffectResolutionCache.get(effect)?.get(source.runtimeMode)
    : undefined;
  if (cached !== undefined) return cached;

  const result = evaluateRuntimeEffectAtTiming(
    requireVerifiedRuntimeEffect(effect),
    source,
    "whileControlled",
    (decoded) => {
      if (decoded.effectId !== "owned_cards_count_as_card_type") {
        return { status: "notApplicable" };
      }
      return {
        status: "resolved",
        result: decoded,
      };
    }
  );
  const resolved: CardTypeEffectResolution =
    result.status === "resolved"
      ? { status: "resolved", effect: result.result }
      : {
          status: "error",
          error:
            result.status === "error"
              ? result.error
              : "owned_cards_count_as_card_type is not applicable",
        };
  if (cacheable) {
    const cache = cardTypeEffectResolutionCache.get(effect) ?? new Map();
    cache.set(source.runtimeMode, resolved);
    cardTypeEffectResolutionCache.set(effect, cache);
  }
  return resolved;
}
