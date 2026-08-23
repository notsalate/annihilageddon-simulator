import type { CardDefinition } from "./data.js";
import type { GameState, PlayerId } from "./setup.js";
import { isOwnedCardsCountAsCardTypeRuntimeEffect } from "./effect-runtime-card-type.js";

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
      ?.wizardProperties.some((property) => {
        const propertyDefinition = state.tokenDefinitions.get(
          property.definitionId
        );
        const effects =
          propertyDefinition?.kind === "wizardProperty"
            ? propertyDefinition.engine?.effects
            : undefined;
        return (
          effects?.some(
            (effect) =>
              isOwnedCardsCountAsCardTypeRuntimeEffect(effect) &&
              effect.countedAsCardType === cardType &&
              effect.sourceCardTypes.some((sourceCardType) =>
                definition.engine.cardTypes.includes(sourceCardType)
              )
          ) ?? false
        );
      }) ?? false
  );
}
