import { recordGameEvent } from "./event-recorder.js";
import {
  collectAttackReplacementProfile,
  type DamageResult,
  type EffectExecutionResult,
  type EffectSourceContext,
} from "./effect-runtime-registry.js";
import type {
  AttackOutcomeBranch,
  RuntimeEffectId,
  RuntimeEffectPayload,
} from "./runtime-effect.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";

export interface AttackDefenseUsage {
  defendedPlayerIds: Set<PlayerState["playerId"]>;
  usedDefenseCardInstanceIds: Set<CardInstance["instanceId"]>;
}

export function createAttackDefenseUsage(): AttackDefenseUsage {
  return {
    defendedPlayerIds: new Set(),
    usedDefenseCardInstanceIds: new Set(),
  };
}

export interface AttackIntent {
  attackingPlayer: PlayerState;
  targetPlayer: PlayerState;
  amount: number;
  effectId: RuntimeEffectId;
  source: EffectSourceContext;
  unavoidable?: boolean;
  baseAmount?: number;
  originalSource?: EffectSourceContext;
  defenseUsage?: AttackDefenseUsage;
  amountComponents?: AttackAmountComponents;
}

export interface RedirectedAttackIntent {
  readonly attackingPlayer: PlayerState;
  readonly targetPlayer: PlayerState;
  readonly amountComponents: AttackAmountComponents;
  readonly effectId: RuntimeEffectId;
  readonly source: EffectSourceContext;
  readonly originalSource: EffectSourceContext;
  readonly defenseUsage: AttackDefenseUsage;
  readonly unavoidable?: boolean;
}

export interface AttackResolution extends DamageResult {
  avoided: boolean;
  amountComponents: AttackAmountComponents;
  attackingPlayer: PlayerState;
  currentAttackerId: PlayerState["playerId"];
  targetPlayer: PlayerState;
  source: EffectSourceContext;
  originalSource: EffectSourceContext;
}

export type DamageApplicationResult = DamageResult | EffectExecutionResult;

export type AttackTargetResolutionResult =
  | { ok: true; resolution: AttackResolution; gameEnd?: never }
  | {
      ok: true;
      gameEnd: NonNullable<
        Extract<EffectExecutionResult, { ok: true }>["gameEnd"]
      >;
      resolution?: never;
    }
  | { ok: false; error: string };

type PlayerControlledAttackTargetResolutionResult =
  | {
      ok: true;
      resolution: AttackResolution;
      requestedTargetKilled: boolean;
      gameEnd?: never;
    }
  | {
      ok: true;
      gameEnd: NonNullable<
        Extract<EffectExecutionResult, { ok: true }>["gameEnd"]
      >;
      resolution?: never;
      requestedTargetKilled?: never;
    }
  | { ok: false; error: string };

export type DefenseWindowResolutionResult =
  | { ok: true; avoided: false; resolution?: never; gameEnd?: never }
  | {
      ok: true;
      avoided: true;
      resolution?: AttackResolution;
      gameEnd?: never;
    }
  | {
      ok: true;
      avoided: true;
      gameEnd: NonNullable<
        Extract<EffectExecutionResult, { ok: true }>["gameEnd"]
      >;
      resolution?: never;
    }
  | { ok: false; error: string };

export type DefenseAttackContext =
  | {
      kind: "redirectable";
      attackingPlayer: PlayerState;
      amountComponents: AttackAmountComponents;
      effectId: RuntimeEffectId;
      source: EffectSourceContext;
      originalSource: EffectSourceContext;
      defenseUsage: AttackDefenseUsage;
    }
  | {
      kind: "nonredirectable";
      source: EffectSourceContext;
      defenseUsage: AttackDefenseUsage;
    };

export type PlayerControlledAttackTargetPlan =
  | {
      readonly kind: "orderedPlayers";
      readonly players: readonly PlayerState[];
      readonly continueWhile?: "targetKilled";
    }
  | {
      readonly kind: "runtimeSelector";
      readonly effect: RuntimeEffectPayload;
    };

export type PlayerControlledAttackImpact =
  | {
      readonly kind: "damage";
      readonly baseAmount: number;
      readonly sourceOwnerModifierAmount: number;
      readonly onDamageDealt: readonly AttackOutcomeBranch[];
      readonly onKill: readonly AttackOutcomeBranch[];
    }
  | {
      readonly kind: "effects";
      readonly effects: readonly RuntimeEffectPayload[];
    };

export interface PlayerControlledAttackProfile {
  readonly damageBonus: number;
  readonly unavoidable: boolean;
}

export interface PlayerControlledAttackIntent {
  readonly state: GameState;
  readonly attackingPlayer: PlayerState;
  readonly source: EffectSourceContext;
  readonly effectId: RuntimeEffectId;
  readonly unavoidable: boolean;
  readonly attackProfile?: PlayerControlledAttackProfile;
  readonly targetPlan: PlayerControlledAttackTargetPlan;
  readonly impact: PlayerControlledAttackImpact;
}

export interface ResolvedAttackBranchContext {
  readonly source: EffectSourceContext;
  readonly damageDealt: number;
  readonly killed: boolean;
  readonly avoided: boolean;
  readonly amountComponents: AttackAmountComponents;
  readonly originalSource: EffectSourceContext;
}

export interface PlayerControlledAttackAdapters {
  resolveTargets(
    intent: PlayerControlledAttackIntent
  ):
    | { ok: true; players: readonly PlayerState[] }
    | { ok: false; error: string };

  resolveDefenseWindow(
    state: GameState,
    defendingPlayer: PlayerState,
    attack: DefenseAttackContext,
    resolveRedirectedAttack: (
      redirectedIntent: RedirectedAttackIntent
    ) => AttackTargetResolutionResult
  ): DefenseWindowResolutionResult;

  dealAttackDamage(
    state: GameState,
    attackingPlayer: PlayerState,
    targetPlayer: PlayerState,
    amount: number,
    effectId: RuntimeEffectId,
    source: EffectSourceContext
  ): DamageApplicationResult;

  executeOnHitEffect(
    state: GameState,
    attackingPlayer: PlayerState,
    targetPlayer: PlayerState,
    effect: RuntimeEffectPayload,
    source: EffectSourceContext
  ): EffectExecutionResult;

  executeOutcomeBranch(
    state: GameState,
    attackingPlayer: PlayerState,
    targetPlayer: PlayerState,
    branch: AttackOutcomeBranch,
    context: ResolvedAttackBranchContext
  ): EffectExecutionResult;

  applyAfterAttackDamage(
    state: GameState,
    attribution: AttackDamageAttribution<EffectSourceContext>
  ): EffectExecutionResult;
}

interface PlayerControlledAttackContext {
  readonly originalAttacker: PlayerState;
  readonly originalSource: EffectSourceContext;
  readonly defenseUsage: AttackDefenseUsage;
  readonly resolutions: AttackResolution[];
}

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
  const attackReplacementProfile = collectAttackReplacementProfile(
    state,
    attackingPlayer,
    {
      sourceType: "card",
      runtimeMode: state.runtimeMode,
      playerId: attackingPlayer.playerId,
      cardInstanceId: "attack-resolution",
      definitionId: "attack-resolution",
    }
  );
  if (attackReplacementProfile.status === "error") {
    throw new Error(attackReplacementProfile.error);
  }
  const doublesAgainstTarget =
    attackingPlayer.playerId !== targetPlayer.playerId &&
    attackReplacementProfile.status === "resolved" &&
    attackReplacementProfile.result.doublesOwnedAttackDamage;
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
    if (attackResult.damageDealt <= 0) {
      continue;
    }

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

export function resolvePlayerControlledAttack(
  intent: PlayerControlledAttackIntent,
  adapters: PlayerControlledAttackAdapters
): EffectExecutionResult {
  const targetResult = adapters.resolveTargets(intent);
  if (!targetResult.ok) {
    return targetResult;
  }
  if (targetResult.players.length === 0) {
    return { ok: true };
  }

  const context: PlayerControlledAttackContext = {
    originalAttacker: intent.attackingPlayer,
    originalSource: intent.source,
    defenseUsage: createAttackDefenseUsage(),
    resolutions: [],
  };
  const initialAmount =
    intent.impact.kind === "damage"
      ? intent.impact.baseAmount + intent.impact.sourceOwnerModifierAmount
      : undefined;
  const singleResolvedTarget =
    targetResult.players.length === 1 ? targetResult.players[0] : undefined;

  recordGameEvent(intent.state, {
    type: "attackCreated",
    playerId: intent.attackingPlayer.playerId,
    ...(singleResolvedTarget === undefined
      ? {}
      : { targetPlayerId: singleResolvedTarget.playerId }),
    cardInstanceId: intent.source.cardInstanceId,
    definitionId: intent.source.definitionId,
    effectId: intent.effectId,
    ...(initialAmount === undefined ? {} : { amount: initialAmount }),
    sourceType: intent.source.sourceType,
  });

  for (const targetPlayer of targetResult.players) {
    const resolutionResult = resolvePlayerControlledAttackTarget(
      intent,
      context,
      adapters,
      {
        attackingPlayer: intent.attackingPlayer,
        targetPlayer,
        source: intent.source,
        unavoidable: intent.attackProfile?.unavoidable ?? intent.unavoidable,
        amountComponents:
          intent.impact.kind === "damage"
            ? createAttackAmountState(
                intent.impact.baseAmount,
                intent.impact.sourceOwnerModifierAmount
              )
            : createAttackAmountState(0),
      }
    );
    if (!resolutionResult.ok) {
      return resolutionResult;
    }
    if (resolutionResult.gameEnd !== undefined) {
      return { ok: true, gameEnd: resolutionResult.gameEnd };
    }

    context.resolutions.push(resolutionResult.resolution);
    if (
      intent.targetPlan.kind === "orderedPlayers" &&
      intent.targetPlan.continueWhile === "targetKilled" &&
      !resolutionResult.requestedTargetKilled
    ) {
      break;
    }
  }

  for (const attribution of summarizeAttackDamage(context.resolutions)) {
    const result = adapters.applyAfterAttackDamage(intent.state, attribution);
    if (!result.ok || result.gameEnd !== undefined) {
      return result;
    }
  }

  return { ok: true };
}

interface CurrentAttackTargetContext {
  readonly attackingPlayer: PlayerState;
  readonly targetPlayer: PlayerState;
  readonly source: EffectSourceContext;
  readonly unavoidable: boolean;
  readonly amountComponents: AttackAmountComponents;
}

function resolvePlayerControlledAttackTarget(
  intent: PlayerControlledAttackIntent,
  context: PlayerControlledAttackContext,
  adapters: PlayerControlledAttackAdapters,
  current: CurrentAttackTargetContext
): PlayerControlledAttackTargetResolutionResult {
  const impact = intent.impact;
  if (impact.kind === "effects") {
    return resolvePlayerControlledEffectsAttackTarget(
      intent,
      impact,
      context,
      adapters,
      current
    );
  }

  const resolvedAmount = resolveAttackAmount(
    intent.state,
    current.attackingPlayer,
    current.targetPlayer,
    current.amountComponents
  );
  recordAttackTargetStarted(
    intent,
    current.attackingPlayer,
    current.targetPlayer,
    current.source,
    resolvedAmount.total
  );

  const defenseResult = current.unavoidable
    ? ({ ok: true, avoided: false } as const)
    : adapters.resolveDefenseWindow(
        intent.state,
        current.targetPlayer,
        {
          kind: "redirectable",
          attackingPlayer: current.attackingPlayer,
          amountComponents: resolvedAmount.components,
          effectId: intent.effectId,
          source: current.source,
          originalSource: context.originalSource,
          defenseUsage: context.defenseUsage,
        },
        (redirectedIntent) =>
          resolvePlayerControlledAttackTarget(intent, context, adapters, {
            attackingPlayer: redirectedIntent.attackingPlayer,
            targetPlayer: redirectedIntent.targetPlayer,
            source: redirectedIntent.source,
            unavoidable: redirectedIntent.unavoidable ?? false,
            amountComponents: redirectedIntent.amountComponents,
          })
      );
  if (!defenseResult.ok) {
    return defenseResult;
  }
  if ("gameEnd" in defenseResult && defenseResult.gameEnd !== undefined) {
    return { ok: true, gameEnd: defenseResult.gameEnd };
  }
  if (defenseResult.avoided) {
    recordAttackAvoided(intent, current.targetPlayer, current.source);
    return {
      ok: true,
      resolution:
        defenseResult.resolution ??
        createAvoidedResolution(
          current,
          resolvedAmount.components,
          context.originalSource
        ),
      requestedTargetKilled: false,
    };
  }

  const damageResult = adapters.dealAttackDamage(
    intent.state,
    current.attackingPlayer,
    current.targetPlayer,
    resolvedAmount.total,
    intent.effectId,
    current.source
  );
  if (!("damageDealt" in damageResult)) {
    return damageResult;
  }
  const damage = damageResult;
  const resolution: AttackResolution = {
    ...damage,
    avoided: false,
    amountComponents: resolvedAmount.components,
    attackingPlayer: current.attackingPlayer,
    currentAttackerId: current.attackingPlayer.playerId,
    targetPlayer: current.targetPlayer,
    source: current.source,
    originalSource: context.originalSource,
  };

  const branchResult = executeResolvedAttackBranches(
    intent,
    impact,
    adapters,
    resolution
  );
  if (!branchResult.ok || branchResult.gameEnd !== undefined) {
    return branchResult;
  }

  return {
    ok: true,
    resolution,
    requestedTargetKilled: resolution.killed,
  };
}

function resolvePlayerControlledEffectsAttackTarget(
  intent: PlayerControlledAttackIntent,
  impact: Extract<PlayerControlledAttackImpact, { kind: "effects" }>,
  context: PlayerControlledAttackContext,
  adapters: PlayerControlledAttackAdapters,
  current: CurrentAttackTargetContext
): PlayerControlledAttackTargetResolutionResult {
  recordAttackTargetStarted(
    intent,
    current.attackingPlayer,
    current.targetPlayer,
    current.source
  );

  const defenseResult = current.unavoidable
    ? ({ ok: true, avoided: false } as const)
    : adapters.resolveDefenseWindow(
        intent.state,
        current.targetPlayer,
        {
          kind: "nonredirectable",
          source: current.source,
          defenseUsage: context.defenseUsage,
        },
        () => ({
          ok: false,
          error: "A non-damage attack cannot be redirected",
        })
      );
  if (!defenseResult.ok) {
    return defenseResult;
  }
  if ("gameEnd" in defenseResult && defenseResult.gameEnd !== undefined) {
    return { ok: true, gameEnd: defenseResult.gameEnd };
  }
  if (defenseResult.avoided) {
    recordAttackAvoided(intent, current.targetPlayer, current.source);
    return {
      ok: true,
      resolution: createAvoidedResolution(
        current,
        current.amountComponents,
        context.originalSource
      ),
      requestedTargetKilled: false,
    };
  }

  for (const effect of impact.effects) {
    const result = adapters.executeOnHitEffect(
      intent.state,
      current.attackingPlayer,
      current.targetPlayer,
      effect,
      current.source
    );
    if (!result.ok || result.gameEnd !== undefined) {
      return result;
    }
  }

  return {
    ok: true,
    resolution: {
      avoided: false,
      damageDealt: 0,
      killed: false,
      amountComponents: current.amountComponents,
      attackingPlayer: current.attackingPlayer,
      currentAttackerId: current.attackingPlayer.playerId,
      targetPlayer: current.targetPlayer,
      source: current.source,
      originalSource: context.originalSource,
    },
    requestedTargetKilled: false,
  };
}

function executeResolvedAttackBranches(
  intent: PlayerControlledAttackIntent,
  impact: Extract<PlayerControlledAttackImpact, { kind: "damage" }>,
  adapters: PlayerControlledAttackAdapters,
  resolution: AttackResolution
): EffectExecutionResult {
  const branchContext: ResolvedAttackBranchContext = {
    source: resolution.source,
    damageDealt: resolution.damageDealt,
    killed: resolution.killed,
    avoided: resolution.avoided,
    amountComponents: resolution.amountComponents,
    originalSource: resolution.originalSource,
  };

  for (const branch of impact.onDamageDealt) {
    const result = adapters.executeOutcomeBranch(
      intent.state,
      resolution.attackingPlayer,
      resolution.targetPlayer,
      branch,
      branchContext
    );
    if (!result.ok || result.gameEnd !== undefined) {
      return result;
    }
  }

  if (resolution.killed) {
    for (const branch of impact.onKill) {
      const result = adapters.executeOutcomeBranch(
        intent.state,
        resolution.attackingPlayer,
        resolution.targetPlayer,
        branch,
        branchContext
      );
      if (!result.ok || result.gameEnd !== undefined) {
        return result;
      }
    }
  }

  return { ok: true };
}

function recordAttackTargetStarted(
  intent: PlayerControlledAttackIntent,
  attackingPlayer: PlayerState,
  targetPlayer: PlayerState,
  source: EffectSourceContext,
  amount?: number
): void {
  recordGameEvent(intent.state, {
    type: "attackTargetStarted",
    playerId: attackingPlayer.playerId,
    targetPlayerId: targetPlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId: intent.effectId,
    ...(amount === undefined ? {} : { amount }),
    sourceType: source.sourceType,
  });
}

function recordAttackAvoided(
  intent: PlayerControlledAttackIntent,
  targetPlayer: PlayerState,
  source: EffectSourceContext
): void {
  recordGameEvent(intent.state, {
    type: "attackAvoided",
    playerId: targetPlayer.playerId,
    targetPlayerId: targetPlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId: intent.effectId,
    sourceType: source.sourceType,
  });
}

function createAvoidedResolution(
  current: CurrentAttackTargetContext,
  amountComponents: AttackAmountComponents,
  originalSource: EffectSourceContext
): AttackResolution {
  return {
    avoided: true,
    damageDealt: 0,
    killed: false,
    amountComponents,
    attackingPlayer: current.attackingPlayer,
    currentAttackerId: current.attackingPlayer.playerId,
    targetPlayer: current.targetPlayer,
    source: current.source,
    originalSource,
  };
}
