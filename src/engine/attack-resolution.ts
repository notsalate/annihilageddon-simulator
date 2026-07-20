import type { GameState, PlayerState } from "./setup.js";

export interface AttackAmountComponents {
  unresolvedBaseAmount: number;
  sourceOwnerModifierAmount: number;
  currentAttackerTargetModifierAmount: number;
}

export type AttackAmountState = AttackAmountComponents;

export interface ResolvedAttackAmount {
  components: AttackAmountComponents;
  total: number;
}

export function createAttackAmountState(
  baseAmount: number,
  sourceOwnerModifierAmount = 0
): AttackAmountState {
  return {
    unresolvedBaseAmount: baseAmount,
    sourceOwnerModifierAmount,
    currentAttackerTargetModifierAmount: 0,
  };
}

export function resolveAttackAmount(
  state: GameState,
  attackingPlayer: PlayerState,
  targetPlayer: PlayerState,
  amountState: AttackAmountState
): ResolvedAttackAmount {
  const unmodifiedAmount =
    amountState.unresolvedBaseAmount + amountState.sourceOwnerModifierAmount;
  const doublesAgainstTarget =
    attackingPlayer.playerId !== targetPlayer.playerId &&
    attackingPlayer.permanents.some((permanent) => {
      const definition = state.cardDefinitions.get(permanent.definitionId);
      return (
        definition?.engine.playableInV0 === true &&
        definition.engine.effects.some(
          (effect) =>
            effect.timing === "attackReplacement" &&
            effect.effectId === "double_owned_attack_damage"
        )
      );
    });
  const components: AttackAmountComponents = {
    ...amountState,
    currentAttackerTargetModifierAmount: doublesAgainstTarget
      ? unmodifiedAmount
      : 0,
  };

  return {
    components,
    total:
      components.unresolvedBaseAmount +
      components.sourceOwnerModifierAmount +
      components.currentAttackerTargetModifierAmount,
  };
}
