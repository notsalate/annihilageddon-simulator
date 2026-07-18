import type { GameAction } from "./actions.js";
import type { GameEvent, GameEventDraft, GameState } from "./setup.js";

interface ActionContext {
  identity: string;
  sequence: number;
}

interface EventContext {
  currentAction?: ActionContext;
  nextActionSequence: number;
  nextEventSequence: number;
}

const eventContexts = new WeakMap<GameState, EventContext>();

export function installGameEventLog(state: GameState): void {
  let maxEventSequence = 0;
  let maxActionSequence = 0;
  for (const event of state.eventLog) {
    if (event.eventSequence !== undefined) {
      maxEventSequence = Math.max(maxEventSequence, event.eventSequence);
    }
    if (event.actionSequence !== undefined) {
      maxActionSequence = Math.max(maxActionSequence, event.actionSequence);
    }
  }
  const context: EventContext = {
    nextActionSequence: maxActionSequence + 1,
    nextEventSequence: maxEventSequence + 1,
  };
  eventContexts.set(state, context);
}

export function beginGameAction(state: GameState, action: GameAction): void {
  const context = mustGetEventContext(state);
  context.currentAction = {
    identity: getActionIdentity(action),
    sequence: context.nextActionSequence,
  };
  context.nextActionSequence += 1;
}

export function enrichGameEvent(
  state: GameState,
  event: GameEventDraft
): GameEvent {
  const context = mustGetEventContext(state);
  const enrichedEvent: GameEvent = {
    ...event,
    eventSequence: event.eventSequence ?? context.nextEventSequence,
    turnNumber: event.turnNumber ?? state.turn.number,
  };
  context.nextEventSequence += 1;

  if (context.currentAction !== undefined) {
    enrichedEvent.actionSequence ??= context.currentAction.sequence;
    enrichedEvent.actionIdentity ??= context.currentAction.identity;
  }

  return enrichedEvent;
}

function mustGetEventContext(state: GameState): EventContext {
  const context = eventContexts.get(state);
  if (context === undefined) {
    throw new Error("Game event log is not installed for this state");
  }

  return context;
}

function getActionIdentity(action: GameAction): string {
  if (action.type === "buyMarketCard") {
    return `${action.type}:${action.source}`;
  }

  return action.type;
}
