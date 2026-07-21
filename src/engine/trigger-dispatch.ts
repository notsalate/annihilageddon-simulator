import { getControlledCards } from "./control-ledger.js";
import type {
  EffectExecutionResult,
  EffectSourceContext,
} from "./effect-runtime-registry.js";
import type { CardDefinition } from "./data.js";
import type { EffectTiming, RuntimeEffect } from "./runtime-effect.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";

export interface ControlledCardEffectContext {
  card: CardInstance;
  definition: CardDefinition;
  effect: RuntimeEffect;
  source: EffectSourceContext;
}

export interface ListControlledCardEffectsOptions {
  state: GameState;
  player: PlayerState;
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
 * Executes matching effects from cards controlled by one player in the stable
 * order exposed by Control Ledger. The dispatcher owns source attribution and
 * stops immediately when an effect fails or ends the game.
 */
export function listControlledCardEffects(
  options: ListControlledCardEffectsOptions
): ControlledCardEffectContext[] {
  const contexts: ControlledCardEffectContext[] = [];
  for (const card of getControlledCards(options.state, options.player)) {
    const definition = options.state.cardDefinitions.get(card.definitionId);
    if (definition === undefined || !definition.engine.playableInV0) {
      continue;
    }

    const source: EffectSourceContext = {
      sourceType: "card",
      runtimeMode: getCardEffectRuntimeMode(card.definitionId),
      playerId: options.player.playerId,
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
 * Executes matching effects from cards controlled by one player in the stable
 * order exposed by Control Ledger. The dispatcher owns source attribution and
 * stops immediately when an effect fails or ends the game.
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

export function getCardEffectRuntimeMode(
  definitionId: string
): EffectSourceContext["runtimeMode"] {
  return definitionId.startsWith("fixture-") ? "fixture" : "combat";
}
