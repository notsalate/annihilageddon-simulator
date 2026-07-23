import type { ControlledObjectView } from "./control-ledger.js";
import type {
  EffectExecutionResult,
  EffectRuntimeMode,
  EffectSourceContext,
} from "./effect-runtime-registry.js";
import type { CardDefinition } from "./data.js";
import type { EffectTiming, RuntimeEffect } from "./runtime-effect.js";
import type { CardInstance } from "./setup.js";

export interface ControlledCardEffectContext {
  card: CardInstance;
  definition: CardDefinition;
  effect: RuntimeEffect;
  source: EffectSourceContext;
}

export interface ListControlledCardEffectsOptions {
  controlledObjects: ControlledObjectView;
  runtimeMode: EffectRuntimeMode;
  timing: EffectTiming;
  predicate?: (
    effect: RuntimeEffect,
    source: EffectSourceContext,
    context: ControlledCardEffectContext
  ) => boolean;
}

export interface DispatchControlledCardEffectsOptions extends ListControlledCardEffectsOptions {
  execute(
    effect: RuntimeEffect,
    source: EffectSourceContext,
    context: ControlledCardEffectContext
  ): EffectExecutionResult;
}

/**
 * Discovers matching effects from cards controlled by one player in the stable
 * order exposed by Control Ledger. Trigger timings that represent ongoing
 * reactions require an ongoing card; end-turn discovery preserves temporary
 * control semantics for cards that remain controlled through cleanup.
 */
export function listControlledCardEffects(
  options: ListControlledCardEffectsOptions
): ControlledCardEffectContext[] {
  const contexts: ControlledCardEffectContext[] = [];
  const requiresOngoingCard =
    options.timing === "onPlayCard" ||
    options.timing === "afterFirstAttackDamageEachTurn";

  for (const { card, definition } of options.controlledObjects.cards) {
    if (
      !definition.engine.playableInV0 ||
      (requiresOngoingCard && !definition.engine.isOngoing)
    ) {
      continue;
    }

    const source: EffectSourceContext = {
      sourceType: "card",
      runtimeMode: options.runtimeMode,
      playerId: options.controlledObjects.playerId,
      cardInstanceId: card.instanceId,
      definitionId: card.definitionId,
    };

    for (const effect of definition.engine.effects) {
      if (effect.timing !== options.timing) {
        continue;
      }

      const context: ControlledCardEffectContext = {
        card,
        definition,
        effect,
        source,
      };
      if (options.predicate?.(effect, source, context) === false) {
        continue;
      }
      contexts.push(context);
    }
  }
  return contexts;
}

/**
 * Executes matching controlled-card effects in stable order and stops
 * immediately when an effect fails or ends the game.
 */
export function dispatchControlledCardEffects(
  options: DispatchControlledCardEffectsOptions
): EffectExecutionResult {
  for (const context of listControlledCardEffects(options)) {
    const result = options.execute(context.effect, context.source, context);
    if (!result.ok || result.gameEnd !== undefined) {
      return result;
    }
  }
  return { ok: true };
}
