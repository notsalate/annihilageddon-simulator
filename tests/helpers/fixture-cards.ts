import assert from "node:assert/strict";

import type { CardDefinition, CardInstance, GameState } from "../../src/index.js";

export function addFixtureDefinitionToActiveHand(
  state: GameState,
  definition: CardDefinition,
  options: {
    instanceId?: string;
  } = {},
): CardInstance {
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);

  state.cardDefinitions = new Map([...state.cardDefinitions, [definition.cardId, definition]]);

  const card: CardInstance = {
    instanceId: options.instanceId ?? `${definition.cardId}-instance-${activePlayer.hand.length + 1}`,
    definitionId: definition.cardId,
    ownerId: activePlayer.playerId,
    marketChips: 0,
  };
  activePlayer.hand.push(card);

  return card;
}
