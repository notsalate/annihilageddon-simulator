import { calculateEndTurnDrawCount } from "./effect-runtime.js";
import {
  applyAction as applyCoreAction,
  type ActionResult,
  type GameAction,
} from "./actions-core.js";
import type { GameState } from "./setup.js";

export { listLegalActions } from "./actions-core.js";
export type {
  ActivatePermanentAction,
  ActivateWizardPropertyAction,
  ActionResult,
  BuyMarketCardAction,
  BuySource,
  EndTurnAction,
  GameAction,
  LegalAction,
  PlayCardAction,
} from "./actions-core.js";

/**
 * Keeps action-boundary validation ahead of the mutating end-turn implementation.
 * The core action module remains responsible for normal action execution once the
 * read-only modifier preflight has succeeded.
 */
export function applyAction(
  state: GameState,
  action: GameAction
): ActionResult {
  if (action.type === "endTurn") {
    const activePlayer = state.players.find(
      (player) => player.playerId === state.activePlayerId
    );
    if (activePlayer === undefined) {
      return {
        ok: false,
        error: `Missing active player ${state.activePlayerId}`,
      };
    }

    try {
      calculateEndTurnDrawCount(state, activePlayer);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return applyCoreAction(state, action);
}
