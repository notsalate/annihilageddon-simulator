import type { GameAction } from "./actions.js";
import type { GameEvent, GameState } from "./setup.js";

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
  const context: EventContext = {
    nextActionSequence: 1,
    nextEventSequence: 1,
  };
  eventContexts.set(state, context);

  const eventLog = state.eventLog;
  eventLog.push = (...events: GameEvent[]): number => {
    const enrichedEvents = events.map((event) => enrichGameEvent(state, event));
    return Array.prototype.push.apply(eventLog, enrichedEvents);
  };
}

export function beginGameAction(state: GameState, action: GameAction): void {
  const context = mustGetEventContext(state);
  context.currentAction = {
    identity: getActionIdentity(action),
    sequence: context.nextActionSequence,
  };
  context.nextActionSequence += 1;
}

function enrichGameEvent(state: GameState, event: GameEvent): GameEvent {
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
