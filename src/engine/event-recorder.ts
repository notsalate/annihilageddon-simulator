import type { GameAction } from "./actions.js";
import type { EffectSourceContext } from "./effect-runtime-registry.js";
import { beginGameAction, enrichGameEvent } from "./game-events.js";
import type { RuntimeEffectId } from "./runtime-effect.js";
import type {
  CardInstance,
  GameEvent,
  GameEventDraft,
  GameEventDraftFor,
  GameEventSourceType,
  GameState,
  PlayerState,
} from "./setup.js";

export function recordGameEvent(
  state: GameState,
  event: GameEventDraft
): number {
  const eventIndex = state.eventLog.length;
  state.eventLog.push(enrichGameEvent(state, event));
  return eventIndex;
}

export function recordDeckReshuffle(
  state: GameState,
  playerId: PlayerState["playerId"]
): void {
  recordGameEvent(state, {
    type: "discardShuffledIntoDeck",
    playerId,
  });
}

export function setAttackCreatedTargetPlayer(
  state: GameState,
  eventIndex: number,
  targetPlayerId: PlayerState["playerId"]
): void {
  const event = state.eventLog[eventIndex];
  if (event?.type === "attackCreated") {
    event.targetPlayerId = targetPlayerId;
  }
}

export function recordSetupChoiceSelected(
  eventLog: GameEvent[],
  event: GameEventDraftFor<"setupChoiceSelected">
): void {
  eventLog.push(event);
}

export function recordBotActionSelected(
  state: GameState,
  action: GameAction
): void {
  beginGameAction(state, action);
  recordGameEvent(state, {
    type: "botActionSelected",
    playerId: state.activePlayerId,
  });
}

export function recordTurnPowerChanged(
  state: GameState,
  player: PlayerState,
  source: EffectSourceContext,
  effectId: RuntimeEffectId,
  powerBefore: number,
  powerAfter: number
): void {
  recordGameEvent(state, {
    type: "effectAddPowerApplied",
    playerId: player.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    amount: powerAfter - powerBefore,
    powerBefore,
    powerAfter,
    sourceType: source.sourceType,
  });
}

export function recordEffectChipsChanged(
  state: GameState,
  player: PlayerState,
  source: EffectSourceContext,
  effectId: RuntimeEffectId,
  chipsBefore: number,
  chipsAfter: number
): void {
  recordGameEvent(state, {
    type: "effectChipsGained",
    playerId: player.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    ...(source.tokenInstanceId === undefined
      ? {}
      : { tokenInstanceId: source.tokenInstanceId }),
    ...(source.tokenDefinitionId === undefined
      ? {}
      : { tokenDefinitionId: source.tokenDefinitionId }),
    effectId,
    amount: chipsAfter - chipsBefore,
    chipsBefore,
    chipsAfter,
    sourceType: source.sourceType,
  });
}

export function recordMarketChipsGained(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
  chipsBefore: number,
  chipsAfter: number
): void {
  recordGameEvent(state, {
    type: "marketChipsGained",
    playerId: player.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
    amount: chipsAfter - chipsBefore,
    chipsBefore,
    chipsAfter,
  });
}

export function recordCardMoved(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
  movement: {
    sourceZone: string;
    destinationZone: string;
    ownerBefore: CardInstance["ownerId"];
    ownerAfter: CardInstance["ownerId"];
    effectId?: string;
    sourceType?: GameEventSourceType;
  }
): void {
  recordGameEvent(state, {
    type: "cardMoved",
    playerId: player.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
    sourceZone: movement.sourceZone,
    destinationZone: movement.destinationZone,
    ownerBefore: movement.ownerBefore,
    ownerAfter: movement.ownerAfter,
    ...(movement.effectId === undefined ? {} : { effectId: movement.effectId }),
    ...(movement.sourceType === undefined
      ? {}
      : { sourceType: movement.sourceType }),
  });
}
