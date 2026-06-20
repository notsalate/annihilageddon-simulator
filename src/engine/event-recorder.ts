import type { GameAction } from "./actions.js";
import type { EffectSourceContext } from "./effect-runtime-registry.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";

export function recordBotActionSelected(state: GameState, action: GameAction): void {
  state.eventLog.push({
    type: "botActionSelected",
    playerId: state.activePlayerId,
    turnNumber: state.turn.number,
    actionIdentity: getActionIdentity(action),
  });
}

export function recordTurnPowerChanged(
  state: GameState,
  player: PlayerState,
  source: EffectSourceContext,
  effectId: string,
  powerBefore: number,
  powerAfter: number,
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
  effectId: string,
  chipsBefore: number,
  chipsAfter: number,
): void {
  state.eventLog.push({
    type: "effectChipsGained",
    playerId: player.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    ...(source.tokenInstanceId === undefined ? {} : { tokenInstanceId: source.tokenInstanceId }),
    ...(source.tokenDefinitionId === undefined ? {} : { tokenDefinitionId: source.tokenDefinitionId }),
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
  chipsAfter: number,
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

function getActionIdentity(action: GameAction): string {
  if (action.type === "buyMarketCard") {
    return `${action.type}:${action.source}`;
  }

  return action.type;
}
