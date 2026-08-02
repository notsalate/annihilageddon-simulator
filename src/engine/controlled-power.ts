import type { CardDefinition } from "./data.js";
import type { RuntimeEffect } from "./runtime-effect.js";
import type { GameState, PlayerState } from "./setup.js";
import { getControlledOngoingCards } from "./control-ledger.js";

interface PassiveStatusPowerEffect {
  effectId: "add_power_if_player_has_status";
  timing: "whileControlled";
  statusId: "dingler";
  amount: number;
}

interface PassiveFlatPowerEffect {
  effectId: "ongoing_add_power";
  timing: "whileControlled";
  amount: number;
}

interface PassiveDeadWizardTokenPowerEffect {
  effectId: "ongoing_add_power_per_dead_wizard_token";
  timing: "whileControlled";
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
  return getControlledOngoingCards(state, player).reduce<number>(
    (total, card) => {
      const definition = state.cardDefinitions.get(card.definitionId);
      if (definition === undefined) {
        return total;
      }

      return total + calculateCardPassivePowerBonus(definition, player);
    },
    0
  );
}

function calculateCardPassivePowerBonus(
  definition: CardDefinition,
  player: PlayerState
): number {
  return definition.engine.effects.reduce<number>((total, effect) => {
    if (isPassiveFlatPowerEffect(effect)) {
      return total + effect.amount;
    }

    if (isPassiveDeadWizardTokenPowerEffect(effect)) {
      return total + player.deadWizardTokens.length * effect.amount;
    }

    if (!isPassiveStatusPowerEffect(effect)) {
      return total;
    }

    return hasStatus(player, effect.statusId) ? total + effect.amount : total;
  }, 0);
}

function isPassiveFlatPowerEffect(
  effect: RuntimeEffect
): effect is PassiveFlatPowerEffect {
  return (
    effect.effectId === "ongoing_add_power" &&
    effect.timing === "whileControlled" &&
    typeof effect.amount === "number"
  );
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

function isPassiveDeadWizardTokenPowerEffect(
  effect: RuntimeEffect
): effect is PassiveDeadWizardTokenPowerEffect {
  return (
    effect.effectId === "ongoing_add_power_per_dead_wizard_token" &&
    effect.timing === "whileControlled" &&
    typeof effect.amount === "number"
  );
}

function hasStatus(player: PlayerState, statusId: string): boolean {
  return player.statuses.some((status) => status.statusId === statusId);
}
