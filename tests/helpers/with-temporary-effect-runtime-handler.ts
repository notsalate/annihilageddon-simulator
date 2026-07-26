import type {
  RuntimeEffectForId,
  RuntimeEffectId,
} from "../../src/engine/runtime-effect.js";
import {
  replaceEffectRuntimeHandlerForTesting,
  type EffectRuntimeHandler,
} from "../../src/engine/effect-runtime-registry.js";

export function withTemporaryEffectRuntimeHandler<
  Id extends RuntimeEffectId,
  Result,
>(
  effectId: Id,
  handler: EffectRuntimeHandler<RuntimeEffectForId<Id>>,
  run: () => Result
): Result {
  const restore = replaceEffectRuntimeHandlerForTesting(effectId, handler);
  try {
    return run();
  } finally {
    restore();
  }
}
