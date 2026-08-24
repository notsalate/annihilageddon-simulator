import type {
  EffectExecutionResult,
  EffectRuntimeAfterDamageDealtOperationContext,
  EffectRuntimeAfterPlayerAttackDamageOperationContext,
  EffectRuntimeControlledPowerOperationContext,
  EffectRuntimeEndTurnDrawModifierOperationContext,
  EffectRuntimeBasicTrophyChipPayoutSuppressionOperationContext,
  EffectRuntimeHandlerOperationResult,
  EffectRuntimeOnPlayCardOperationContext,
  EffectRuntimeServices,
  EffectRuntimeSetupServices,
  EffectSourceContext,
  SetupDirective,
  SetupEffectSourceContext,
} from "./effect-runtime-registry.js";
import type {
  RuntimeEffectForId,
  RuntimeEffectId,
  RuntimeEffectPayload,
} from "./runtime-effect.js";
import type { GameState, PlayerState } from "./setup.js";

export interface EffectRuntimeHandler<
  Effect extends RuntimeEffectPayload = RuntimeEffectPayload,
> {
  readonly effectId: Effect["effectId"];
  readonly unsupported?: true;
  execute(
    state: GameState,
    player: PlayerState,
    effect: Effect,
    source: EffectSourceContext,
    services: EffectRuntimeServices
  ): EffectExecutionResult;
  executeOnPlayCard?(
    effect: Effect,
    context: EffectRuntimeOnPlayCardOperationContext
  ): EffectRuntimeHandlerOperationResult<EffectExecutionResult>;
  applyAfterPlayerAttackDamage?(
    effect: Effect,
    context: EffectRuntimeAfterPlayerAttackDamageOperationContext
  ): EffectRuntimeHandlerOperationResult<EffectExecutionResult>;
  applyAfterDamageDealt?(
    effect: Effect,
    context: EffectRuntimeAfterDamageDealtOperationContext
  ): EffectRuntimeHandlerOperationResult<EffectExecutionResult>;
  evaluateEndTurnDrawModifier?(
    effect: Effect,
    context: EffectRuntimeEndTurnDrawModifierOperationContext
  ): EffectRuntimeHandlerOperationResult<number>;
  evaluateBasicTrophyChipPayoutSuppression?(
    effect: Effect,
    context: EffectRuntimeBasicTrophyChipPayoutSuppressionOperationContext
  ): EffectRuntimeHandlerOperationResult<boolean>;
  evaluateControlledPower?(
    effect: Effect,
    context: EffectRuntimeControlledPowerOperationContext
  ): EffectRuntimeHandlerOperationResult<number>;
  executeSetup?(
    player: PlayerState,
    effect: Effect,
    source: SetupEffectSourceContext,
    services: EffectRuntimeSetupServices
  ): { ok: true; directive?: SetupDirective } | { ok: false; error: string };
}

export type EffectRuntimeFamilyHandler<Id extends RuntimeEffectId> =
  EffectRuntimeHandler<RuntimeEffectForId<Id>>;
