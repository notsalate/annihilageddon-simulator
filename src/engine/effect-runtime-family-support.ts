import type { EffectExecutionResult } from "./effect-runtime-registry.js";
import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";
import type { RuntimeEffectForId, RuntimeEffectId } from "./runtime-effect.js";

export function createUnsupportedEffectHandler<Id extends RuntimeEffectId>(
  effectId: Id
): EffectRuntimeHandler<RuntimeEffectForId<Id>> {
  return {
    effectId,
    unsupported: true,
    execute() {
      return { ok: false, error: `Unsupported effect id ${effectId}` };
    },
  };
}

export function setupOnlyExecutionError(
  effectId: RuntimeEffectId
): EffectExecutionResult {
  return {
    ok: false,
    error: `${effectId} is a setup-only wizard property effect`,
  };
}
