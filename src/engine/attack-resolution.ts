import { getControlledCards } from "./control-ledger.js";
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
    getControlledCards(state, attackingPlayer).some((permanent) => {
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

export interface AttackSourceIdentity {
  sourceType: string;
  cardInstanceId: string;
  definitionId: string;
}

export interface AttributableAttackResult<
  Source extends AttackSourceIdentity = AttackSourceIdentity,
> {
  currentAttackerId: PlayerState["playerId"];
  attackingPlayer: PlayerState;
  damageDealt: number;
  source: Source;
}

export interface AttackDamageAttribution<
  Source extends AttackSourceIdentity = AttackSourceIdentity,
> {
  attackingPlayer: PlayerState;
  damageDealt: number;
  source: Source;
}

export function summarizeAttackDamage<Source extends AttackSourceIdentity>(
  attackResults: readonly AttributableAttackResult<Source>[]
): AttackDamageAttribution<Source>[] {
  const damageByAttackerAndSource = new Map<
    string,
    AttackDamageAttribution<Source>
  >();

  for (const attackResult of attackResults) {
    const key = [
      attackResult.currentAttackerId,
      attackResult.source.sourceType,
      attackResult.source.cardInstanceId,
      attackResult.source.definitionId,
    ].join("\u0000");
    const existing = damageByAttackerAndSource.get(key);
    if (existing === undefined) {
      damageByAttackerAndSource.set(key, {
        attackingPlayer: attackResult.attackingPlayer,
        damageDealt: attackResult.damageDealt,
        source: attackResult.source,
      });
      continue;
    }

    existing.damageDealt += attackResult.damageDealt;
  }

  return [...damageByAttackerAndSource.values()];
}
