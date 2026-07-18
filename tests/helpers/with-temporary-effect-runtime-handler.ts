import assert from "node:assert/strict";

import type { RuntimeEffectId } from "../../src/engine/runtime-effect.js";
import {
  effectRuntimeCatalog,
  type EffectRuntimeHandler,
} from "../../src/engine/effect-runtime-registry.js";

export function withTemporaryEffectRuntimeHandler<Result>(
  effectId: RuntimeEffectId,
  handler: EffectRuntimeHandler,
  run: () => Result
): Result {
  const originalEntry = effectRuntimeCatalog.get(effectId);
  assert.ok(originalEntry);
  effectRuntimeCatalog.set(effectId, { ...originalEntry, handler });

  try {
    return run();
  } finally {
    effectRuntimeCatalog.set(effectId, originalEntry);
  }
}
