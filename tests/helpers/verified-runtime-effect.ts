import {
  markRuntimeEffectTreeVerified,
  type VerifiedRuntimeEffect,
} from "../../src/engine/runtime-effect-verification.js";
import type { RuntimeEffect } from "../../src/engine/runtime-effect.js";

export function verifiedTestRuntimeEffect(
  effect: RuntimeEffect
): VerifiedRuntimeEffect {
  return markRuntimeEffectTreeVerified(effect);
}
