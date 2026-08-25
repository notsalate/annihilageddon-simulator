import type { CardDefinition } from "./data.js";
import { getControlledCards } from "./control-ledger.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";

export const deadWizardTokenLikeCardTag = "deadWizardTokenLike";

export function isDeadWizardTokenLikeCard(
  definition: CardDefinition | undefined
): boolean {
  return (
    definition?.engine.playableInV0 === true &&
    definition.engine.tags?.includes(deadWizardTokenLikeCardTag) === true
  );
}

export function getControlledDeadWizardTokenLikeCards(
  state: GameState,
  player: PlayerState
): CardInstance[] {
  return getControlledCards(state, player).filter((card) =>
    isDeadWizardTokenLikeCard(state.cardDefinitions.get(card.definitionId))
  );
}

export function getControlledDeadWizardTokenCount(
  state: GameState,
  player: PlayerState
): number {
  return (
    player.deadWizardTokens.length +
    getControlledDeadWizardTokenLikeCards(state, player).length
  );
}
