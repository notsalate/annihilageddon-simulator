import type { CardDefinition } from "./data.js";
import type { GameState, PlayerId } from "./setup.js";

const familiarAsLegendWizardPropertyId = "esw2_dbg__wizard_property_003";

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
  if (
    cardType !== "legend" ||
    !definition.engine.cardTypes.includes("familiar")
  ) {
    return false;
  }

  return (
    state.players
      .find((player) => player.playerId === playerId)
      ?.wizardProperties.some(
        (property) => property.definitionId === familiarAsLegendWizardPropertyId
      ) ?? false
  );
}
