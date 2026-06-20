import type { GameAction } from "./actions.js";
import type { GameState } from "./setup.js";

export function recordBotActionSelected(state: GameState, action: GameAction): void {
  state.eventLog.push({
    type: "botActionSelected",
    playerId: state.activePlayerId,
    turnNumber: state.turn.number,
    actionIdentity: getActionIdentity(action),
  });
}

function getActionIdentity(action: GameAction): string {
  if (action.type === "buyMarketCard") {
    return `${action.type}:${action.source}`;
  }

  return action.type;
}
