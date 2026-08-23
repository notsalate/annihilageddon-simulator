import {
  applyAction as applyCoreAction,
  preflightAction,
  type ActionResult,
  type GameAction,
} from "./actions-core.js";
import {
  ActionExecutionError,
  createActionExecutionError,
} from "./action-errors.js";
import type { GameState } from "./setup.js";

export { listLegalActions } from "./actions-core.js";
export { ActionExecutionError } from "./action-errors.js";
export type { ActionExecutionContext } from "./action-errors.js";
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
  const preflightResult = preflightAction(state, action);
  if (preflightResult !== undefined) {
    return preflightResult;
  }

  try {
    const result = applyCoreAction(state, action);
    if (!result.ok) {
      throw createActionExecutionError(state, action, result.error);
    }
    return result;
  } catch (error) {
    if (error instanceof ActionExecutionError) {
      throw error;
    }
    throw createActionExecutionError(state, action, error);
  }
}
