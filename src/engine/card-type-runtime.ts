import type { CardDefinition, TokenDefinition } from "./data.js";
import type { GameState, PlayerId, TokenInstance } from "./setup.js";
import {
  isOwnedCardsCountAsCardTypeRuntimeEffect,
  type OwnedCardsCountAsCardTypeRuntimeEffect,
} from "./effect-runtime-card-type.js";
import {
  evaluateRuntimeEffectAtTiming,
  type EffectSourceContext,
} from "./effect-runtime-registry.js";
import type { RuntimeEffect } from "./runtime-effect.js";
import { requireVerifiedRuntimeEffect } from "./runtime-effect-verification.js";

type CardTypeEffectResolution =
  | {
      readonly status: "resolved";
      readonly effect: OwnedCardsCountAsCardTypeRuntimeEffect;
    }
  | { readonly status: "error"; readonly error: string };

const cardTypeEffectResolutionCache = new WeakMap<
  object,
  Map<string, CardTypeEffectResolution>
>();

export function cardMatchesTypeForPlayer(
  state: GameState,
  playerId: PlayerId,
  definition: CardDefinition,
  cardType: string
): boolean {
  if (
    definition.engine.cardTypes.includes(cardType) ||
    definition.engine.tags?.includes("counts_as_every_card_type") === true
  ) {
    return true;
  }
  return (
    state.players
      .find((player) => player.playerId === playerId)
      ?.wizardProperties.some((property) =>
        wizardPropertyCountsDefinitionAsType(
          state,
          playerId,
          property.instanceId,
          property.definitionId,
          definition,
          cardType
        )
      ) ?? false
  );
}

function wizardPropertyCountsDefinitionAsType(
  state: GameState,
  playerId: PlayerId,
  tokenInstanceId: TokenInstance["instanceId"],
  tokenDefinitionId: TokenDefinition["tokenId"],
  definition: CardDefinition,
  cardType: string
): boolean {
  const propertyDefinition = state.tokenDefinitions.get(tokenDefinitionId);
  const effects =
    propertyDefinition?.kind === "wizardProperty"
      ? propertyDefinition.engine?.effects
      : undefined;
  if (effects === undefined) return false;

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
      return true;
    }
  }
  return false;
}

function resolveCardTypeEffect(
  effect: RuntimeEffect,
  source: EffectSourceContext
): CardTypeEffectResolution {
  const cacheable = Object.isFrozen(effect);
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
