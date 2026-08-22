import type { GameAction } from "./actions-core.js";
import type { GameEvent, GameState } from "./setup.js";

export interface ActionExecutionContext {
  readonly action: GameAction;
  readonly turnNumber: number;
  readonly activePlayerId: GameState["activePlayerId"];
  readonly eventLog: readonly GameEvent[];
}

export class ActionExecutionError extends Error {
  override name = "ActionExecutionError";

  constructor(
    message: string,
    readonly context: ActionExecutionContext,
    cause?: unknown
  ) {
    super(message, cause === undefined ? undefined : { cause });
  }
}

export function createActionExecutionError(
  state: GameState,
  action: GameAction,
  failure: unknown
): ActionExecutionError {
  const message = failure instanceof Error ? failure.message : String(failure);
  return new ActionExecutionError(
    message,
    {
      action,
      turnNumber: state.turn.number,
      activePlayerId: state.activePlayerId,
      eventLog: [...state.eventLog],
    },
    failure === undefined ? undefined : failure
  );
}
