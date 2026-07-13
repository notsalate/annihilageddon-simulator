import type { GameAction } from "./actions.js";
import type { EffectSourceContext } from "./effect-runtime-registry.js";
import { beginGameAction } from "./game-events.js";
import type { RuntimeEffectId } from "./runtime-effect.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";

export function recordBotActionSelected(
  state: GameState,
  action: GameAction
): void {
  beginGameAction(state, action);
  state.eventLog.push({
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
  state.eventLog.push({
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
  state.eventLog.push({
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
  state.eventLog.push({
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
    sourceType?: string;
  }
): void {
  state.eventLog.push({
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
