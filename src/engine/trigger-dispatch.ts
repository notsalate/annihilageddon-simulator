import type { CardDefinition } from "./data.js";
import { buildControlledObjectView } from "./control-ledger.js";
import {
  getEffectRuntimeCatalogEntry,
  type EffectExecutionResult,
  type EffectSourceContext,
} from "./effect-runtime-registry.js";
import type { EffectTiming, RuntimeEffect } from "./runtime-effect.js";
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
  readonly collectEndTurnDrawModifier: {
    readonly kind: "collectEndTurnDrawModifier";
    readonly currentBaseDrawCount: number;
  };
}

export interface ControlledCardDispatchResultMap {
  readonly onPlayCard: EffectExecutionResult;
  readonly afterPlayerAttackDamage: EffectExecutionResult;
  readonly collectEndTurnDrawModifier:
    | { readonly ok: true; readonly drawCount: number }
    | { readonly ok: false; readonly error: string };
}

type ControlledCardDispatchOperation =
  ControlledCardDispatchOperationMap[keyof ControlledCardDispatchOperationMap];
type ControlledCardExecutionOperation =
  | ControlledCardDispatchOperationMap["onPlayCard"]
  | ControlledCardDispatchOperationMap["afterPlayerAttackDamage"];
type ControlledCardDispatchResult =
  ControlledCardDispatchResultMap[keyof ControlledCardDispatchResultMap];

interface ControlledCardEffectCandidate {
  readonly effect: RuntimeEffect;
  readonly source: EffectSourceContext;
}

const controlledCardOperationTimings = {
  onPlayCard: "onPlayCard",
  afterPlayerAttackDamage: "afterFirstAttackDamageEachTurn",
  collectEndTurnDrawModifier: "endTurn",
} as const satisfies Record<ControlledCardDispatchOperation["kind"], EffectTiming>;

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
  operation: ControlledCardDispatchOperationMap["collectEndTurnDrawModifier"]
): ControlledCardDispatchResultMap["collectEndTurnDrawModifier"];
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
  const candidates = discoverControlledCardEffects(state, controller, operation);
  if (operation.kind === "collectEndTurnDrawModifier") {
    return collectEndTurnDrawModifier(
      state,
      controller,
      operation,
      candidates
    );
  }
  return executeControlledCardOperation(
    state,
    controller,
    operation,
    candidates
  );
}

function discoverControlledCardEffects(
  state: GameState,
  controller: PlayerState,
  operation: ControlledCardDispatchOperation
): ControlledCardEffectCandidate[] {
  const controlledObjects = buildControlledObjectView(
    state,
    controller.playerId
  );
  const timing = controlledCardOperationTimings[operation.kind];
  const requiresOngoingCard =
    operation.kind === "onPlayCard" ||
    operation.kind === "afterPlayerAttackDamage";
  const candidates: ControlledCardEffectCandidate[] = [];

  for (const { card, definition } of controlledObjects.cards) {
    if (
      !definition.engine.playableInV0 ||
      (requiresOngoingCard && !definition.engine.isOngoing)
    ) {
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
      if (effect.timing === timing) {
        candidates.push({ effect, source });
      }
    }
  }

  return candidates;
}

function executeControlledCardOperation(
  state: GameState,
  controller: PlayerState,
  operation: ControlledCardExecutionOperation,
  candidates: readonly ControlledCardEffectCandidate[]
): EffectExecutionResult {
  for (const { effect, source } of candidates) {
    const entry = getEffectRuntimeCatalogEntry(effect.effectId);
    const result =
      operation.kind === "onPlayCard"
        ? entry.executeOnPlayCard(`Effect ${effect.effectId}`, effect, {
            state,
            controller,
            source,
            playedCard: operation.playedCard,
            playedDefinition: operation.playedDefinition,
          })
        : entry.applyAfterPlayerAttackDamage(
            `Effect ${effect.effectId}`,
            effect,
            {
              state,
              controller,
              source,
              totalDamageDealt: operation.totalDamageDealt,
              attackSource: operation.attackSource,
            }
          );

    if (result.status === "notApplicable") {
      continue;
    }
    if (result.status === "error") {
      return { ok: false, error: result.error };
    }
    if (!result.result.ok || result.result.gameEnd !== undefined) {
      return result.result;
    }
  }

  return { ok: true };
}

function collectEndTurnDrawModifier(
  state: GameState,
  controller: PlayerState,
  operation: ControlledCardDispatchOperationMap["collectEndTurnDrawModifier"],
  candidates: readonly ControlledCardEffectCandidate[]
): ControlledCardDispatchResultMap["collectEndTurnDrawModifier"] {
  let drawCount = operation.currentBaseDrawCount;
  for (const { effect, source } of candidates) {
    const entry = getEffectRuntimeCatalogEntry(effect.effectId);
    if (!entry.supportedSourceKinds.includes(source.sourceType)) {
      return {
        ok: false,
        error: `Effect ${effect.effectId} uses unsupported source kind`,
      };
    }
    if (!entry.supportedModes.includes(source.runtimeMode)) {
      return {
        ok: false,
        error: `Effect ${effect.effectId} is unavailable in ${source.runtimeMode} mode`,
      };
    }
    const validation = entry.validate(`Effect ${effect.effectId}`, effect);
    if (!validation.ok) {
      return {
        ok: false,
        error:
          validation.errors[0] ?? "Invalid controlled-card end-turn effect",
      };
    }

    const result = entry.evaluateEndTurnDrawModifier(
      `Effect ${effect.effectId}`,
      effect,
      {
        state,
        controller,
        source,
        currentDrawCount: drawCount,
      }
    );
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
