import type { PlayerDecisionView, PlayerState } from "./setup.js";

/** Creates the isolated player snapshot exposed at strategy boundaries. */
export function createPlayerDecisionView(
  player: PlayerState
): PlayerDecisionView {
  const { deck: _deck, ...visiblePlayer } = player;
  return structuredClone(visiblePlayer);
}
