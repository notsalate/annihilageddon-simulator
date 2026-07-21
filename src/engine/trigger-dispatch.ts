import { buildControlledObjectView } from "./control-ledger.js";
import type {
  EffectExecutionResult,
  EffectSourceContext,
} from "./effect-runtime-registry.js";
import type { EffectTiming, RuntimeEffect } from "./runtime-effect.js";
import type { GameState, PlayerState } from "./setup.js";

export interface DispatchControlledCardEffectsOptions {
  state: GameState;
  player: PlayerState;
  timing: EffectTiming;
  predicate?: (effect: RuntimeEffect, source: EffectSourceContext) => boolean;
  execute(
    effect: RuntimeEffect,
    source: EffectSourceContext
  ): EffectExecutionResult;
}

/**
 * Executes matching effects from cards controlled by one player in the stable
 * order exposed by Control Ledger. The dispatcher owns source attribution and
 * stops immediately when an effect fails or ends the game.
 */
export function dispatchControlledCardEffects(
  options: DispatchControlledCardEffectsOptions
): EffectExecutionResult {
  const controlled = buildControlledObjectView(
    options.state,
    options.player.playerId
  );

  for (const { card, definition } of controlled.cards) {
    if (!definition.engine.playableInV0) {
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
      if (
        effect.timing !== options.timing ||
        options.predicate?.(effect, source) === false
      ) {
        continue;
      }

      const result = options.execute(effect, source);
      if (!result.ok || result.gameEnd !== undefined) {
        return result;
      }
    }
  }

  return { ok: true };
}

export function getCardEffectRuntimeMode(
  definitionId: string
): EffectSourceContext["runtimeMode"] {
  return definitionId.startsWith("fixture-") ? "fixture" : "combat";
}
