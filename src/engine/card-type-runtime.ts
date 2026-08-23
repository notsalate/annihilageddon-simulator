import type { CardDefinition, TokenDefinition } from "./data.js";
import type { GameState, PlayerId, TokenInstance } from "./setup.js";
import { isOwnedCardsCountAsCardTypeRuntimeEffect } from "./effect-runtime-card-type.js";
import { evaluateRuntimeEffectAtTiming } from "./effect-runtime-registry.js";
import { requireVerifiedRuntimeEffect } from "./runtime-effect-verification.js";

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
    const result = evaluateRuntimeEffectAtTiming(
      requireVerifiedRuntimeEffect(effect),
      source,
      "whileControlled",
      (decoded) => {
        if (decoded.effectId !== "owned_cards_count_as_card_type") {
          return { status: "notApplicable" };
        }
        return decoded.countedAsCardType === cardType &&
          decoded.sourceCardTypes.some((sourceCardType) =>
            definition.engine.cardTypes.includes(sourceCardType)
          )
          ? { status: "resolved", result: true }
          : { status: "notApplicable" };
      }
    );
    if (result.status === "error") {
      throw new Error(result.error);
    }
    if (result.status === "resolved" && result.result) return true;
  }
  return false;
}
