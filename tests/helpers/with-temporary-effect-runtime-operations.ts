import type { RuntimeEffectId } from "../../src/engine/runtime-effect.js";
import {
  withEffectRuntimeCatalogOperationsForTesting,
  type EffectRuntimeCatalogOperationOverridesForTesting,
} from "../../src/engine/effect-runtime-registry.js";

export function withTemporaryEffectRuntimeOperations<
  Id extends RuntimeEffectId,
  Result,
>(
  effectId: Id,
  operations: EffectRuntimeCatalogOperationOverridesForTesting<Id>,
  run: () => Result
): Result {
  return withEffectRuntimeCatalogOperationsForTesting(
    effectId,
    operations,
    run
  );
}
