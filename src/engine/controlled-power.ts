import type { CardDefinition } from "./data.js";
import type { RuntimeEffect } from "./runtime-effect.js";
import type { GameState, PlayerState } from "./setup.js";

interface PassiveStatusPowerEffect {
  effectId: "add_power_if_player_has_status";
  timing: "whileControlled";
  statusId: "dingler";
  amount: number;
}

export function reconcileActivePlayerControlledPower(state: GameState): void {
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  if (activePlayer === undefined) {
    return;
  }

  const nextBonus = calculateControlledPowerBonus(state, activePlayer);
  const currentBonus = state.turn.controlledPowerBonus;
  const delta = nextBonus - currentBonus;
  if (delta === 0) {
    return;
  }

  state.turn.power = Math.max(0, state.turn.power + delta);
  state.turn.controlledPowerBonus = nextBonus;
}

function calculateControlledPowerBonus(
  state: GameState,
  player: PlayerState
): number {
  return player.permanents.reduce<number>((total, card) => {
    const definition = state.cardDefinitions.get(card.definitionId);
    if (definition === undefined) {
      return total;
    }

    return total + calculateCardPassivePowerBonus(definition, player);
  }, 0);
}

function calculateCardPassivePowerBonus(
  definition: CardDefinition,
  player: PlayerState
): number {
  return definition.engine.effects.reduce<number>((total, effect) => {
    if (!isPassiveStatusPowerEffect(effect)) {
      return total;
    }

    return hasStatus(player, effect.statusId) ? total + effect.amount : total;
  }, 0);
}

function isPassiveStatusPowerEffect(
  effect: RuntimeEffect
): effect is PassiveStatusPowerEffect {
  return (
    effect.effectId === "add_power_if_player_has_status" &&
    effect.timing === "whileControlled" &&
    effect.statusId === "dingler" &&
    typeof effect.amount === "number"
  );
}

function hasStatus(player: PlayerState, statusId: string): boolean {
  return player.statuses.some((status) => status.statusId === statusId);
}
