import { recordGameEvent } from "./event-recorder.js";
import { createAttackId, type AttackId } from "../domain/types.js";
import { registerDeadWizardTokenAttackInstance } from "./dead-wizard-token-resolution.js";
import {
  collectAttackReplacementProfile,
  type EffectGameEnd,
  type DamageResult,
  type EffectExecutionResult,
  type EffectSourceContext,
} from "./effect-runtime-registry.js";
import type {
  AttackOutcomeBranch,
  RuntimeEffectId,
  RuntimeEffectPayload,
  AttackSemantics,
} from "./runtime-effect.js";
import { validateAttackSemanticsForEffect } from "./runtime-effect.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";

export interface AttackDefenseUsage {
  attackId?: AttackId;
  defendedPlayerIds: Set<PlayerState["playerId"]>;
  usedDefenseCardInstanceIds: Set<CardInstance["instanceId"]>;
}

export type DefenseWindowMode = "PER_TARGET" | "COLLECT_ALL_FIRST";

export function createAttackDefenseUsage(
  attackId?: AttackId
): AttackDefenseUsage {
  return {
    ...(attackId === undefined ? {} : { attackId }),
    defendedPlayerIds: new Set(),
    usedDefenseCardInstanceIds: new Set(),
  };
}

export interface AttackApplication {
  readonly originalTargetPlayerId: PlayerState["playerId"];
  controlEpoch: number;
  attackingPlayer: PlayerState;
  targetPlayer: PlayerState;
  source: EffectSourceContext;
  avoided?: boolean;
  resolution?: AttackResolution;
}

export interface AttackInstance {
  readonly attackId: AttackId;
  readonly originalAttacker: PlayerState;
  readonly originalSource: EffectSourceContext;
  readonly source: EffectSourceContext;
  readonly defenseUsage: AttackDefenseUsage;
  readonly applications: AttackApplication[];
  readonly defenseWindowMode?: DefenseWindowMode;
}

export function createAttackInstance(
  state: GameState,
  attackingPlayer: PlayerState,
  source: EffectSourceContext,
  defenseWindowMode?: DefenseWindowMode
): AttackInstance {
  const attackId = createAttackId(state.nextAttackId);
  state.nextAttackId += 1;
  registerDeadWizardTokenAttackInstance(state, attackId);
  const attackSource = { ...source, attackId, attackDeath: true };
  return {
    attackId,
    originalAttacker: attackingPlayer,
    originalSource: source,
    source: attackSource,
    defenseUsage: createAttackDefenseUsage(attackId),
    applications: [],
    ...(defenseWindowMode === undefined ? {} : { defenseWindowMode }),
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
  readonly attackId?: AttackId;
  readonly controlEpoch: number;
  readonly attackingPlayer: PlayerState;
  readonly targetPlayer: PlayerState;
  readonly amountComponents: AttackAmountComponents;
  readonly carriedAmount: number;
  readonly effectId: RuntimeEffectId;
  readonly source: EffectSourceContext;
  readonly originalSource: EffectSourceContext;
  readonly defenseUsage: AttackDefenseUsage;
  readonly unavoidable?: boolean;
}

export interface AttackResolution extends DamageResult {
  attackId?: AttackId;
  controlEpoch: number;
  avoided: boolean;
  amountComponents: AttackAmountComponents;
  attackingPlayer: PlayerState;
  currentAttackerId: PlayerState["playerId"];
  targetPlayer: PlayerState;
  source: EffectSourceContext;
  originalSource: EffectSourceContext;
}

export type DamageApplicationResult = DamageResult | EffectExecutionResult;

export type PlayerControlledAttackExecutionResult = EffectExecutionResult & {
  readonly requestedTargetKilled?: boolean;
  readonly resolvedTargetKilled?: boolean;
};

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
      resolvedTargetKilled: boolean;
      gameEnd?: never;
    }
  | {
      ok: true;
      gameEnd: NonNullable<
        Extract<EffectExecutionResult, { ok: true }>["gameEnd"]
      >;
      resolution?: never;
      requestedTargetKilled?: never;
      resolvedTargetKilled?: never;
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
      attackId?: AttackId;
      controlEpoch: number;
      attackingPlayer: PlayerState;
      amountComponents: AttackAmountComponents;
      carriedAmount: number;
      effectId: RuntimeEffectId;
      source: EffectSourceContext;
      originalSource: EffectSourceContext;
      defenseUsage: AttackDefenseUsage;
      redirectPolicy?: "ignoreOriginalAttacker";
    }
  | {
      kind: "nonredirectable";
      attackId?: AttackId;
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
      readonly baseAmountForTarget?: (
        state: GameState,
        attackingPlayer: PlayerState,
        targetPlayer: PlayerState
      ) => number;
      readonly sourceOwnerModifierAmount: number;
      readonly beforeDamage?: (
        state: GameState,
        attackingPlayer: PlayerState,
        targetPlayer: PlayerState,
        source: EffectSourceContext
      ) => EffectExecutionResult;
      readonly onDamageDealt: readonly AttackOutcomeBranch[];
      readonly onAvoided?: readonly AttackOutcomeBranch[];
      readonly onKill: readonly AttackOutcomeBranch[];
    }
  | {
      readonly kind: "effects";
      readonly effects: readonly RuntimeEffectPayload[];
    }
  | PlayerControlledSharedAttackImpact;

export type PlayerControlledSharedAttackResolver = (
  state: GameState,
  attack: AttackInstance,
  adapters: PlayerControlledAttackAdapters
) => EffectExecutionResult;

export interface PlayerControlledSharedAttackImpact {
  readonly kind: "shared";
  readonly resolve: PlayerControlledSharedAttackResolver;
}

export interface PlayerControlledAttackProfile {
  readonly damageBonus: number;
  readonly unavoidable: boolean;
}

export interface PlayerControlledAttackIntent {
  readonly state: GameState;
  readonly attackingPlayer: PlayerState;
  readonly source: EffectSourceContext;
  readonly effectId: RuntimeEffectId;
  readonly defenseWindowMode: DefenseWindowMode;
  readonly attackSemantics?: AttackSemantics;
  readonly unavoidable: boolean;
  readonly redirectPolicy?: "ignoreOriginalAttacker";
  readonly attackProfile?: PlayerControlledAttackProfile;
  readonly reportResolvedTargetKilled?: boolean;
  readonly targetPlan: PlayerControlledAttackTargetPlan;
  readonly impact: PlayerControlledAttackImpact;
}

export interface ResolvedAttackBranchContext {
  readonly attackId?: AttackId;
  readonly controlEpoch: number;
  readonly effectId: RuntimeEffectId;
  readonly source: EffectSourceContext;
  readonly damageDealt: number;
  readonly killed: boolean;
  readonly avoided: boolean;
  readonly amountComponents: AttackAmountComponents;
  readonly originalSource: EffectSourceContext;
  readonly originalTargetPlayerId: PlayerState["playerId"];
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

  closeAttackInstance(
    state: GameState,
    attack: AttackInstance,
    result: EffectExecutionResult
  ): EffectExecutionResult;
  deferGameEnd?(state: GameState, gameEnd: EffectGameEnd): void;
}

interface PlayerControlledAttackContext {
  readonly instance: AttackInstance;
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
  amountState: AttackAmountState,
  source?: EffectSourceContext,
  originalSource?: EffectSourceContext,
  carriedAmount?: number
): ResolvedAttackAmount {
  const currentAmount =
    carriedAmount ??
    amountState.unresolvedBaseAmount +
      amountState.sourceOwnerModifierAmount +
      amountState.currentAttackerTargetModifierAmount;
  const attackReplacementProfile = collectAttackReplacementProfile(
    state,
    attackingPlayer,
    source ?? {
      sourceType: "card",
      runtimeMode: state.runtimeMode,
      playerId: attackingPlayer.playerId,
      cardInstanceId: "attack-resolution",
      definitionId: "attack-resolution",
    },
    {
      includeDeadWizardTokenModifiers: true,
      includeSourceOwnerModifiers: false,
    }
  );
  if (attackReplacementProfile.status === "error") {
    throw new Error(attackReplacementProfile.error);
  }
  const doublesAgainstTarget =
    attackingPlayer.playerId !== targetPlayer.playerId &&
    attackReplacementProfile.status === "resolved" &&
    attackReplacementProfile.result.doublesOwnedAttackDamage;
  const currentAttackerDamageBonus =
    attackReplacementProfile.status === "resolved"
      ? attackReplacementProfile.result.deadWizardTokenDamageBonus +
        (source !== undefined &&
        originalSource !== undefined &&
        source.playerId !== originalSource.playerId
          ? attackReplacementProfile.result.controlledCardDamageBonus
          : 0)
      : 0;
  const components: AttackAmountComponents = {
    ...amountState,
    currentAttackerTargetModifierAmount:
      currentAttackerDamageBonus + (doublesAgainstTarget ? currentAmount : 0),
  };

  return {
    components,
    total: currentAmount + components.currentAttackerTargetModifierAmount,
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
): PlayerControlledAttackExecutionResult {
  if (intent.defenseWindowMode === undefined) {
    return {
      ok: false,
      error: "Attack mapping must declare a DefenseWindowMode",
    };
  }
  if (intent.attackSemantics !== undefined) {
    const attackSemanticsErrors = validateAttackSemanticsForEffect(
      intent.effectId,
      { attackSemantics: intent.attackSemantics },
      `${intent.effectId}.attackSemantics`
    );
    if (attackSemanticsErrors.length > 0) {
      return { ok: false, error: attackSemanticsErrors.join("; ") };
    }
    if (
      intent.attackSemantics.resolver !== "playerControlled" ||
      intent.attackSemantics.defenseWindowMode !== intent.defenseWindowMode
    ) {
      return {
        ok: false,
        error: "Attack intent does not match its AttackSemantics",
      };
    }
  }
  if (
    (intent.defenseWindowMode === "COLLECT_ALL_FIRST" &&
      intent.impact.kind !== "shared") ||
    (intent.defenseWindowMode === "PER_TARGET" &&
      intent.impact.kind === "shared")
  ) {
    return {
      ok: false,
      error: `Attack impact kind ${intent.impact.kind} does not match ${intent.defenseWindowMode}`,
    };
  }
  const targetResult = adapters.resolveTargets(intent);
  if (!targetResult.ok) {
    return targetResult;
  }
  if (targetResult.players.length === 0) {
    return { ok: true };
  }

  const context: PlayerControlledAttackContext = {
    instance: createAttackInstance(
      intent.state,
      intent.attackingPlayer,
      intent.source,
      intent.defenseWindowMode
    ),
    resolutions: [],
  };
  const finish = (
    result: EffectExecutionResult
  ): PlayerControlledAttackExecutionResult =>
    adapters.closeAttackInstance(intent.state, context.instance, result);
  const firstTarget = targetResult.players[0];
  if (firstTarget === undefined) {
    return finish({ ok: true });
  }
  const initialAmount =
    intent.impact.kind === "damage"
      ? resolveBaseAmount(
          intent.impact,
          intent.state,
          intent.attackingPlayer,
          firstTarget
        ) + intent.impact.sourceOwnerModifierAmount
      : undefined;
  const singleResolvedTarget =
    targetResult.players.length === 1 ? targetResult.players[0] : undefined;

  recordGameEvent(intent.state, {
    type: "attackCreated",
    playerId: intent.attackingPlayer.playerId,
    attackId: context.instance.attackId,
    ...(singleResolvedTarget === undefined
      ? {}
      : { targetPlayerId: singleResolvedTarget.playerId }),
    cardInstanceId: intent.source.cardInstanceId,
    definitionId: intent.source.definitionId,
    effectId: intent.effectId,
    ...(initialAmount === undefined ? {} : { amount: initialAmount }),
    sourceType: intent.source.sourceType,
  });

  let requestedTargetKilled = false;
  let resolvedTargetKilled = false;
  for (const targetPlayer of targetResult.players) {
    const application: AttackApplication = {
      originalTargetPlayerId: targetPlayer.playerId,
      controlEpoch: 0,
      attackingPlayer: intent.attackingPlayer,
      targetPlayer,
      source: context.instance.source,
    };
    context.instance.applications.push(application);
    const resolutionResult = resolvePlayerControlledAttackTarget(
      intent,
      context,
      adapters,
      {
        attackingPlayer: intent.attackingPlayer,
        targetPlayer,
        source: context.instance.source,
        unavoidable: intent.attackProfile?.unavoidable ?? intent.unavoidable,
        controlEpoch: application.controlEpoch,
        amountComponents:
          intent.impact.kind === "damage"
            ? createAttackAmountState(
                resolveBaseAmount(
                  intent.impact,
                  intent.state,
                  intent.attackingPlayer,
                  targetPlayer
                ),
                intent.impact.sourceOwnerModifierAmount
              )
            : createAttackAmountState(0),
        originalTargetPlayerId: targetPlayer.playerId,
        application,
      }
    );
    if (!resolutionResult.ok) {
      return finish(resolutionResult);
    }
    if (resolutionResult.gameEnd !== undefined) {
      return finish({ ok: true, gameEnd: resolutionResult.gameEnd });
    }

    application.avoided = resolutionResult.resolution.avoided;
    application.resolution = resolutionResult.resolution;
    if (intent.defenseWindowMode === "PER_TARGET") {
      context.resolutions.push(resolutionResult.resolution);
    }
    requestedTargetKilled = resolutionResult.requestedTargetKilled;
    resolvedTargetKilled ||= resolutionResult.resolvedTargetKilled;
    if (
      intent.targetPlan.kind === "orderedPlayers" &&
      intent.targetPlan.continueWhile === "targetKilled" &&
      !resolutionResult.requestedTargetKilled
    ) {
      break;
    }
  }

  if (intent.defenseWindowMode === "COLLECT_ALL_FIRST") {
    if (intent.impact.kind !== "shared") {
      return finish({
        ok: false,
        error: "COLLECT_ALL_FIRST requires shared attack text",
      });
    }
    const sharedResult = intent.impact.resolve(
      intent.state,
      context.instance,
      adapters
    );
    if (!sharedResult.ok || sharedResult.gameEnd !== undefined) {
      return finish(sharedResult);
    }
    for (const application of context.instance.applications) {
      if (application.resolution !== undefined) {
        context.resolutions.push(application.resolution);
      }
    }
  }

  for (const attribution of summarizeAttackDamage(context.resolutions)) {
    const result = adapters.applyAfterAttackDamage(intent.state, attribution);
    if (!result.ok || result.gameEnd !== undefined) {
      return finish(result);
    }
  }

  return finish({
    ok: true,
    ...(intent.reportResolvedTargetKilled ? { resolvedTargetKilled } : {}),
    ...(intent.targetPlan.kind === "orderedPlayers" &&
    intent.targetPlan.continueWhile === "targetKilled"
      ? { requestedTargetKilled }
      : {}),
  });
}

function resolveBaseAmount(
  impact: Extract<PlayerControlledAttackImpact, { kind: "damage" }>,
  state: GameState,
  attackingPlayer: PlayerState,
  targetPlayer: PlayerState
): number {
  return (
    impact.baseAmountForTarget?.(state, attackingPlayer, targetPlayer) ??
    impact.baseAmount
  );
}

interface CurrentAttackTargetContext {
  readonly application: AttackApplication;
  readonly controlEpoch: number;
  readonly attackingPlayer: PlayerState;
  readonly targetPlayer: PlayerState;
  readonly source: EffectSourceContext;
  readonly unavoidable: boolean;
  readonly carriedAmount?: number;
  readonly amountComponents: AttackAmountComponents;
  readonly originalTargetPlayerId: PlayerState["playerId"];
}

function resolveRedirectedAttack(
  intent: PlayerControlledAttackIntent,
  context: PlayerControlledAttackContext,
  adapters: PlayerControlledAttackAdapters,
  current: CurrentAttackTargetContext,
  redirectedIntent: RedirectedAttackIntent
): AttackTargetResolutionResult {
  const nextControlEpoch = current.application.controlEpoch + 1;
  if (redirectedIntent.controlEpoch !== nextControlEpoch) {
    return {
      ok: false,
      error: "Redirect control epoch is not sequential",
    };
  }
  const redirectedSource = {
    ...redirectedIntent.source,
    attackId: context.instance.attackId,
  };
  current.application.controlEpoch = nextControlEpoch;
  current.application.attackingPlayer = redirectedIntent.attackingPlayer;
  current.application.targetPlayer = redirectedIntent.targetPlayer;
  current.application.source = redirectedSource;
  return resolvePlayerControlledAttackTarget(intent, context, adapters, {
    application: current.application,
    attackingPlayer: redirectedIntent.attackingPlayer,
    targetPlayer: redirectedIntent.targetPlayer,
    source: redirectedSource,
    unavoidable: redirectedIntent.unavoidable ?? false,
    carriedAmount: redirectedIntent.carriedAmount,
    amountComponents: redirectedIntent.amountComponents,
    controlEpoch: nextControlEpoch,
    originalTargetPlayerId: current.originalTargetPlayerId,
  });
}

function resolvePlayerControlledAttackTarget(
  intent: PlayerControlledAttackIntent,
  context: PlayerControlledAttackContext,
  adapters: PlayerControlledAttackAdapters,
  current: CurrentAttackTargetContext
): PlayerControlledAttackTargetResolutionResult {
  const impact = intent.impact;
  if (impact.kind === "shared") {
    return resolvePlayerControlledSharedAttackTarget(
      intent,
      context,
      adapters,
      current
    );
  }
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
    current.amountComponents,
    current.source,
    context.instance.originalSource,
    current.carriedAmount
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
          controlEpoch: current.controlEpoch,
          attackingPlayer: current.attackingPlayer,
          amountComponents: resolvedAmount.components,
          carriedAmount: resolvedAmount.total,
          effectId: intent.effectId,
          source: current.source,
          originalSource: context.instance.originalSource,
          defenseUsage: context.instance.defenseUsage,
          attackId: context.instance.attackId,
          ...(intent.redirectPolicy === undefined
            ? {}
            : { redirectPolicy: intent.redirectPolicy }),
        },
        (redirectedIntent) =>
          resolveRedirectedAttack(
            intent,
            context,
            adapters,
            current,
            redirectedIntent
          )
      );
  if (!defenseResult.ok) {
    return defenseResult;
  }
  if ("gameEnd" in defenseResult && defenseResult.gameEnd !== undefined) {
    return { ok: true, gameEnd: defenseResult.gameEnd };
  }
  if (defenseResult.avoided) {
    recordAttackAvoided(intent, current.targetPlayer, current.source);
    const avoidedBranchResult = executeAvoidedAttackBranches(
      intent,
      impact,
      adapters,
      current,
      resolvedAmount.components,
      context.instance.originalSource
    );
    if (!avoidedBranchResult.ok || avoidedBranchResult.gameEnd !== undefined) {
      return avoidedBranchResult;
    }
    return {
      ok: true,
      resolution:
        defenseResult.resolution ??
        createAvoidedResolution(
          current,
          resolvedAmount.components,
          context.instance.originalSource
        ),
      requestedTargetKilled: false,
      resolvedTargetKilled: defenseResult.resolution?.killed ?? false,
    };
  }

  const beforeDamageResult = impact.beforeDamage?.(
    intent.state,
    current.attackingPlayer,
    current.targetPlayer,
    current.source
  );
  if (beforeDamageResult !== undefined) {
    if (!beforeDamageResult.ok || beforeDamageResult.gameEnd !== undefined) {
      return beforeDamageResult;
    }
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
    controlEpoch: current.controlEpoch,
    amountComponents: resolvedAmount.components,
    attackingPlayer: current.attackingPlayer,
    currentAttackerId: current.attackingPlayer.playerId,
    targetPlayer: current.targetPlayer,
    source: current.source,
    attackId: context.instance.attackId,
    originalSource: context.instance.originalSource,
  };

  const branchResult = executeResolvedAttackBranches(
    intent,
    impact,
    adapters,
    resolution,
    current.originalTargetPlayerId
  );
  if (!branchResult.ok || branchResult.gameEnd !== undefined) {
    return branchResult;
  }

  return {
    ok: true,
    resolution,
    requestedTargetKilled: resolution.killed,
    resolvedTargetKilled: resolution.killed,
  };
}

function resolvePlayerControlledSharedAttackTarget(
  intent: PlayerControlledAttackIntent,
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
          kind: "redirectable",
          controlEpoch: current.controlEpoch,
          attackingPlayer: current.attackingPlayer,
          amountComponents: current.amountComponents,
          carriedAmount: current.carriedAmount ?? 0,
          effectId: intent.effectId,
          source: current.source,
          originalSource: context.instance.originalSource,
          defenseUsage: context.instance.defenseUsage,
          attackId: context.instance.attackId,
          ...(intent.redirectPolicy === undefined
            ? {}
            : { redirectPolicy: intent.redirectPolicy }),
        },
        (redirectedIntent) =>
          resolveRedirectedAttack(
            intent,
            context,
            adapters,
            current,
            redirectedIntent
          )
      );
  if (!defenseResult.ok) {
    return defenseResult;
  }
  if ("gameEnd" in defenseResult && defenseResult.gameEnd !== undefined) {
    return { ok: true, gameEnd: defenseResult.gameEnd };
  }

  if (defenseResult.avoided) {
    recordAttackAvoided(intent, current.targetPlayer, current.source);
    const resolution =
      defenseResult.resolution ??
      createAvoidedResolution(
        current,
        current.amountComponents,
        context.instance.originalSource
      );
    current.application.avoided = resolution.avoided;
    current.application.resolution = resolution;
    return {
      ok: true,
      resolution,
      requestedTargetKilled: false,
      resolvedTargetKilled: resolution.killed,
    };
  }

  const resolution = createDeferredResolution(
    current,
    context.instance.originalSource
  );
  current.application.avoided = false;
  current.application.resolution = resolution;
  return {
    ok: true,
    resolution,
    requestedTargetKilled: false,
    resolvedTargetKilled: false,
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
          kind: "redirectable",
          controlEpoch: current.controlEpoch,
          attackingPlayer: current.attackingPlayer,
          amountComponents: current.amountComponents,
          carriedAmount: current.carriedAmount ?? 0,
          effectId: intent.effectId,
          source: current.source,
          originalSource: context.instance.originalSource,
          defenseUsage: context.instance.defenseUsage,
          attackId: context.instance.attackId,
          ...(intent.redirectPolicy === undefined
            ? {}
            : { redirectPolicy: intent.redirectPolicy }),
        },
        (redirectedIntent) =>
          resolveRedirectedAttack(
            intent,
            context,
            adapters,
            current,
            redirectedIntent
          )
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
        context.instance.originalSource
      ),
      requestedTargetKilled: false,
      resolvedTargetKilled: false,
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
    const terminalResult = continueAfterAttackEffect(
      intent.state,
      adapters,
      result
    );
    if (terminalResult !== undefined) {
      return terminalResult;
    }
  }

  return {
    ok: true,
    resolution: {
      avoided: false,
      damageDealt: 0,
      killed: false,
      controlEpoch: current.controlEpoch,
      amountComponents: current.amountComponents,
      attackingPlayer: current.attackingPlayer,
      currentAttackerId: current.attackingPlayer.playerId,
      targetPlayer: current.targetPlayer,
      source: current.source,
      attackId: context.instance.attackId,
      originalSource: context.instance.originalSource,
    },
    requestedTargetKilled: false,
    resolvedTargetKilled: false,
  };
}

function executeResolvedAttackBranches(
  intent: PlayerControlledAttackIntent,
  impact: Extract<PlayerControlledAttackImpact, { kind: "damage" }>,
  adapters: PlayerControlledAttackAdapters,
  resolution: AttackResolution,
  originalTargetPlayerId: PlayerState["playerId"]
): EffectExecutionResult {
  const branchContext: ResolvedAttackBranchContext = {
    effectId: intent.effectId,
    controlEpoch: resolution.controlEpoch,
    ...(resolution.attackId === undefined
      ? {}
      : { attackId: resolution.attackId }),
    source: resolution.source,
    damageDealt: resolution.damageDealt,
    killed: resolution.killed,
    avoided: resolution.avoided,
    amountComponents: resolution.amountComponents,
    originalSource: resolution.originalSource,
    originalTargetPlayerId,
  };

  for (const branch of impact.onDamageDealt) {
    const result = adapters.executeOutcomeBranch(
      intent.state,
      resolution.attackingPlayer,
      resolution.targetPlayer,
      branch,
      branchContext
    );
    const terminalResult = continueAfterAttackEffect(
      intent.state,
      adapters,
      result
    );
    if (terminalResult !== undefined) {
      return terminalResult;
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
      const terminalResult = continueAfterAttackEffect(
        intent.state,
        adapters,
        result
      );
      if (terminalResult !== undefined) {
        return terminalResult;
      }
    }
  }

  return { ok: true };
}

function executeAvoidedAttackBranches(
  intent: PlayerControlledAttackIntent,
  impact: Extract<PlayerControlledAttackImpact, { kind: "damage" }>,
  adapters: PlayerControlledAttackAdapters,
  current: CurrentAttackTargetContext,
  amountComponents: AttackAmountComponents,
  originalSource: EffectSourceContext
): EffectExecutionResult {
  const branches = impact.onAvoided ?? [];
  if (branches.length === 0) {
    return { ok: true };
  }

  const branchContext: ResolvedAttackBranchContext = {
    effectId: intent.effectId,
    controlEpoch: current.controlEpoch,
    ...(current.source.attackId === undefined
      ? {}
      : { attackId: current.source.attackId }),
    source: current.source,
    damageDealt: 0,
    killed: false,
    avoided: true,
    amountComponents,
    originalSource,
    originalTargetPlayerId: current.originalTargetPlayerId,
  };

  for (const branch of branches) {
    const result = adapters.executeOutcomeBranch(
      intent.state,
      current.attackingPlayer,
      current.targetPlayer,
      branch,
      branchContext
    );
    const terminalResult = continueAfterAttackEffect(
      intent.state,
      adapters,
      result
    );
    if (terminalResult !== undefined) {
      return terminalResult;
    }
  }

  return { ok: true };
}

function continueAfterAttackEffect(
  state: GameState,
  adapters: PlayerControlledAttackAdapters,
  result: EffectExecutionResult
): EffectExecutionResult | undefined {
  if (!result.ok) {
    return result;
  }
  if (result.gameEnd === undefined) {
    return undefined;
  }
  if (result.gameEnd.resolution !== "endOfTurn") {
    return result;
  }
  if (adapters.deferGameEnd === undefined) {
    return {
      ok: false,
      error: "Attack adapters cannot defer an end-of-turn game end",
    };
  }
  adapters.deferGameEnd(state, result.gameEnd);
  return undefined;
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
    ...(source.attackId === undefined ? {} : { attackId: source.attackId }),
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
    ...(source.attackId === undefined ? {} : { attackId: source.attackId }),
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
    controlEpoch: current.controlEpoch,
    ...(current.source.attackId === undefined
      ? {}
      : { attackId: current.source.attackId }),
    amountComponents,
    attackingPlayer: current.attackingPlayer,
    currentAttackerId: current.attackingPlayer.playerId,
    targetPlayer: current.targetPlayer,
    source: current.source,
    originalSource,
  };
}

function createDeferredResolution(
  current: CurrentAttackTargetContext,
  originalSource: EffectSourceContext
): AttackResolution {
  return {
    avoided: false,
    damageDealt: 0,
    killed: false,
    controlEpoch: current.controlEpoch,
    ...(current.source.attackId === undefined
      ? {}
      : { attackId: current.source.attackId }),
    amountComponents: current.amountComponents,
    attackingPlayer: current.attackingPlayer,
    currentAttackerId: current.attackingPlayer.playerId,
    targetPlayer: current.targetPlayer,
    source: current.source,
    originalSource,
  };
}
