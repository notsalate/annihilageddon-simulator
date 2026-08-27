import type { CardDefinition } from "./data.js";
import {
  buildControlledObjectView,
  getControlledOngoingCards,
} from "./control-ledger.js";
import {
  applyRuntimeEffectAfterDamageDealt,
  applyRuntimeEffectAfterPlayerAttackDamage,
  evaluateRuntimeEffectControlledPower,
  evaluateRuntimeEffectEndTurnDrawModifier,
  executeRuntimeEffectOnPlayCard,
  isSupportedRuntimeEffectTiming,
  preserveEffectCycleOutcome,
  type EffectCycleOutcome,
  type EffectGameEnd,
  type EffectExecutionResult,
  type EffectRuntimeOperationResult,
  type EffectSourceContext,
} from "./effect-runtime-registry.js";
import {
  requireVerifiedRuntimeEffect,
  type VerifiedRuntimeEffect,
} from "./runtime-effect-verification.js";
import type { RuntimeEffect } from "./runtime-effect.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";

export interface ControlledCardDispatchOperationMap {
  readonly onPlayCard: {
    readonly kind: "onPlayCard";
    readonly playedCard: CardInstance;
    readonly playedDefinition: CardDefinition;
  };
  readonly afterPlayerAttackDamage: {
    readonly kind: "afterPlayerAttackDamage";
    readonly totalDamageDealt: number;
    readonly attackSource: EffectSourceContext;
  };
  readonly afterDamageDealt: {
    readonly kind: "afterDamageDealt";
    readonly damageDealt: number;
    readonly damageSource: EffectSourceContext;
  };
  readonly afterControllerPlaysCard: {
    readonly kind: "afterControllerPlaysCard";
    readonly executeEffect: ControlledCardTimedEffectExecutor;
  };
  readonly startOfControllerTurn: {
    readonly kind: "startOfControllerTurn";
    readonly executeEffect: ControlledCardTimedEffectExecutor;
  };
  readonly collectEndTurnDrawModifier: {
    readonly kind: "collectEndTurnDrawModifier";
    readonly currentBaseDrawCount: number;
  };
  readonly recalculateControlledPower: {
    readonly kind: "recalculateControlledPower";
  };
}

export interface ControlledCardDispatchResultMap {
  readonly onPlayCard: EffectExecutionResult;
  readonly afterPlayerAttackDamage: EffectExecutionResult;
  readonly afterDamageDealt: EffectExecutionResult;
  readonly afterControllerPlaysCard: EffectExecutionResult;
  readonly startOfControllerTurn: EffectExecutionResult;
  readonly collectEndTurnDrawModifier:
    | { readonly ok: true; readonly drawCount: number }
    | { readonly ok: false; readonly error: string };
  readonly recalculateControlledPower: EffectExecutionResult;
}

type ControlledCardDispatchOperation =
  ControlledCardDispatchOperationMap[keyof ControlledCardDispatchOperationMap];
type ControlledCardExecutionOperation =
  | ControlledCardDispatchOperationMap["onPlayCard"]
  | ControlledCardDispatchOperationMap["afterPlayerAttackDamage"]
  | ControlledCardDispatchOperationMap["afterDamageDealt"]
  | ControlledCardDispatchOperationMap["afterControllerPlaysCard"]
  | ControlledCardDispatchOperationMap["startOfControllerTurn"];
type ControlledCardDispatchResult =
  ControlledCardDispatchResultMap[keyof ControlledCardDispatchResultMap];

export type ControlledPowerMutationResult<Value> =
  | {
      readonly ok: true;
      readonly value: Value;
      readonly gameEnd?: EffectGameEnd;
    }
  | {
      readonly ok: false;
      readonly error: string;
    };

interface ControlledCardEffectCandidate {
  readonly effect: VerifiedRuntimeEffect;
  readonly source: EffectSourceContext;
  readonly sourceDefinition: CardDefinition;
}

interface ControlledCardEntry {
  readonly card: CardInstance;
  readonly definition: CardDefinition;
}

export type ControlledCardTimedEffectExecutor = (
  effect: VerifiedRuntimeEffect,
  source: EffectSourceContext,
  sourceDefinition: CardDefinition
) => EffectRuntimeOperationResult<EffectExecutionResult>;

/**
 * Runs one mutation that can change the active controller's passive power and
 * reconciles that power through Trigger Dispatch after the mutation succeeds.
 * A selector is useful for turn transitions, where the active player changes
 * inside the mutation before the controlled view is rebuilt.
 */
export function runControlledPowerMutation<Value>(
  state: GameState,
  controller:
    | PlayerState["playerId"]
    | (() => PlayerState["playerId"] | undefined),
  mutation: () => Value,
  shouldRecalculate: (value: Value) => boolean = () => true
): ControlledPowerMutationResult<Value> {
  const value = mutation();
  if (!shouldRecalculate(value)) {
    return { ok: true, value };
  }

  const controllerId =
    typeof controller === "function" ? controller() : controller;
  if (controllerId === undefined || controllerId !== state.activePlayerId) {
    return { ok: true, value };
  }

  const activePlayer = state.players.find(
    (player) => player.playerId === controllerId
  );
  if (activePlayer === undefined) {
    return { ok: true, value };
  }

  const controlledPowerResult = dispatchControlledCardOperation(
    state,
    activePlayer,
    { kind: "recalculateControlledPower" }
  );
  if (!controlledPowerResult.ok) {
    return controlledPowerResult;
  }
  if (controlledPowerResult.gameEnd === undefined) {
    return { ok: true, value };
  }
  return {
    ok: true,
    value,
    gameEnd: controlledPowerResult.gameEnd,
  };
}

export function dispatchControlledCardOperation(
  state: GameState,
  controller: PlayerState,
  operation: ControlledCardDispatchOperationMap["onPlayCard"]
): ControlledCardDispatchResultMap["onPlayCard"];
// eslint-disable-next-line no-redeclare -- TypeScript overload signature.
export function dispatchControlledCardOperation(
  state: GameState,
  controller: PlayerState,
  operation: ControlledCardDispatchOperationMap["afterPlayerAttackDamage"]
): ControlledCardDispatchResultMap["afterPlayerAttackDamage"];
// eslint-disable-next-line no-redeclare -- TypeScript overload signature.
export function dispatchControlledCardOperation(
  state: GameState,
  controller: PlayerState,
  operation: ControlledCardDispatchOperationMap["afterDamageDealt"]
): ControlledCardDispatchResultMap["afterDamageDealt"];
// eslint-disable-next-line no-redeclare -- TypeScript overload signature.
export function dispatchControlledCardOperation(
  state: GameState,
  controller: PlayerState,
  operation: ControlledCardDispatchOperationMap["afterControllerPlaysCard"]
): ControlledCardDispatchResultMap["afterControllerPlaysCard"];
// eslint-disable-next-line no-redeclare -- TypeScript overload signature.
export function dispatchControlledCardOperation(
  state: GameState,
  controller: PlayerState,
  operation: ControlledCardDispatchOperationMap["startOfControllerTurn"]
): ControlledCardDispatchResultMap["startOfControllerTurn"];
// eslint-disable-next-line no-redeclare -- TypeScript overload signature.
export function dispatchControlledCardOperation(
  state: GameState,
  controller: PlayerState,
  operation: ControlledCardDispatchOperationMap["collectEndTurnDrawModifier"]
): ControlledCardDispatchResultMap["collectEndTurnDrawModifier"];
// eslint-disable-next-line no-redeclare -- TypeScript overload signature.
export function dispatchControlledCardOperation(
  state: GameState,
  controller: PlayerState,
  operation: ControlledCardDispatchOperationMap["recalculateControlledPower"]
): ControlledCardDispatchResultMap["recalculateControlledPower"];
/**
 * Resolves one typed controlled-card operation in stable Control Ledger order.
 * Discovery, timing policy, source identity, catalog resolution, applicability,
 * execution, aggregation, and short-circuiting all stay inside this boundary.
 */
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation.
export function dispatchControlledCardOperation(
  state: GameState,
  controller: PlayerState,
  operation: ControlledCardDispatchOperation
): ControlledCardDispatchResult {
  const candidates = discoverCandidatesForControlledCardOperation(
    state,
    controller,
    operation
  );
  if (operation.kind === "collectEndTurnDrawModifier") {
    return collectEndTurnDrawModifier(state, controller, operation, candidates);
  }
  if (operation.kind === "recalculateControlledPower") {
    return recalculateControlledPower(state, controller, candidates);
  }
  return executeControlledCardOperation(
    state,
    controller,
    operation,
    candidates
  );
}

function recalculateControlledPower(
  state: GameState,
  controller: PlayerState,
  candidates: readonly ControlledCardEffectCandidate[]
): EffectExecutionResult {
  let nextBonus = 0;
  for (const { effect, source, sourceDefinition } of candidates) {
    const result = evaluateRuntimeEffectControlledPower(effect, {
      state,
      controller,
      source,
      sourceDefinition,
    });
    if (result.status === "notApplicable") {
      continue;
    }
    if (result.status === "error") {
      return { ok: false, error: result.error };
    }
    nextBonus += result.result;
  }

  const delta = nextBonus - state.turn.controlledPowerBonus;
  if (delta !== 0) {
    state.turn.power = Math.max(0, state.turn.power + delta);
  }
  state.turn.controlledPowerBonus = nextBonus;
  return { ok: true };
}

function discoverControlledCardEffects(
  state: GameState,
  controller: PlayerState
): ControlledCardEffectCandidate[] {
  const controlledObjects = buildControlledObjectView(
    state,
    controller.playerId
  );
  return buildControlledCardEffectCandidates(
    state,
    controller,
    controlledObjects.cards
  );
}

function discoverControlledOngoingCardEffects(
  state: GameState,
  controller: PlayerState,
  timing?: RuntimeEffect["timing"]
): ControlledCardEffectCandidate[] {
  const controlledCards: ControlledCardEntry[] = [];
  for (const card of getControlledOngoingCards(state, controller)) {
    const definition = state.cardDefinitions.get(card.definitionId);
    if (definition !== undefined) {
      controlledCards.push({ card, definition });
    }
  }
  return buildControlledCardEffectCandidates(
    state,
    controller,
    controlledCards,
    timing
  );
}

function buildControlledCardEffectCandidates(
  state: GameState,
  controller: PlayerState,
  controlledCards: readonly ControlledCardEntry[],
  timing?: RuntimeEffect["timing"]
): ControlledCardEffectCandidate[] {
  const candidates: ControlledCardEffectCandidate[] = [];

  for (const { card, definition } of controlledCards) {
    if (!definition.engine.playableInV0) {
      continue;
    }

    const source: EffectSourceContext = {
      sourceType: "card",
      runtimeMode: state.runtimeMode,
      playerId: controller.playerId,
      cardInstanceId: card.instanceId,
      definitionId: card.definitionId,
    };
    for (const effect of definition.engine.effects) {
      const verifiedEffect = requireVerifiedRuntimeEffect(effect);
      if (
        timing !== undefined &&
        verifiedEffect.timing !== timing &&
        isSupportedRuntimeEffectTiming(verifiedEffect)
      ) {
        continue;
      }
      candidates.push({
        effect: verifiedEffect,
        source,
        sourceDefinition: definition,
      });
    }
  }

  return candidates;
}

function discoverCandidatesForControlledCardOperation(
  state: GameState,
  controller: PlayerState,
  operation: ControlledCardDispatchOperation
): ControlledCardEffectCandidate[] {
  if (operation.kind === "recalculateControlledPower") {
    return discoverControlledOngoingCardEffects(state, controller);
  }
  if (operation.kind === "afterControllerPlaysCard") {
    return discoverControlledOngoingCardEffects(
      state,
      controller,
      "afterControllerPlaysCard"
    );
  }
  if (operation.kind === "startOfControllerTurn") {
    return discoverControlledOngoingCardEffects(
      state,
      controller,
      "startOfControllerTurn"
    );
  }
  return discoverControlledCardEffects(state, controller);
}

function executeControlledCardOperation(
  state: GameState,
  controller: PlayerState,
  operation: ControlledCardExecutionOperation,
  candidates: readonly ControlledCardEffectCandidate[]
): EffectExecutionResult {
  let cycleOutcome: EffectCycleOutcome | undefined;
  for (const { effect, source, sourceDefinition } of candidates) {
    const result =
      operation.kind === "afterControllerPlaysCard" ||
      operation.kind === "startOfControllerTurn"
        ? operation.executeEffect(effect, source, sourceDefinition)
        : operation.kind === "onPlayCard"
          ? executeRuntimeEffectOnPlayCard(effect, {
              state,
              controller,
              source,
              sourceDefinition,
              playedCard: operation.playedCard,
              playedDefinition: operation.playedDefinition,
            })
          : operation.kind === "afterPlayerAttackDamage"
            ? applyRuntimeEffectAfterPlayerAttackDamage(effect, {
                state,
                controller,
                source,
                sourceDefinition,
                totalDamageDealt: operation.totalDamageDealt,
                attackSource: operation.attackSource,
              })
            : applyRuntimeEffectAfterDamageDealt(effect, {
                state,
                controller,
                source,
                sourceDefinition,
                damageDealt: operation.damageDealt,
                damageSource: operation.damageSource,
              });

    if (result.status === "notApplicable") {
      continue;
    }
    if (result.status === "error") {
      return { ok: false, error: result.error };
    }
    if (!result.result.ok) {
      return result.result;
    }
    cycleOutcome ??= result.result.cycleOutcome;
    if (result.result.gameEnd !== undefined) {
      return preserveEffectCycleOutcome(result.result, cycleOutcome);
    }
  }

  return cycleOutcome === undefined ? { ok: true } : { ok: true, cycleOutcome };
}

function collectEndTurnDrawModifier(
  state: GameState,
  controller: PlayerState,
  operation: ControlledCardDispatchOperationMap["collectEndTurnDrawModifier"],
  candidates: readonly ControlledCardEffectCandidate[]
): ControlledCardDispatchResultMap["collectEndTurnDrawModifier"] {
  let drawCount = operation.currentBaseDrawCount;
  for (const { effect, source } of candidates) {
    const result = evaluateRuntimeEffectEndTurnDrawModifier(effect, {
      state,
      controller,
      source,
      currentDrawCount: drawCount,
    });
    if (result.status === "notApplicable") {
      continue;
    }
    if (result.status === "error") {
      return { ok: false, error: result.error };
    }
    drawCount = result.result;
  }

  return { ok: true, drawCount };
}
