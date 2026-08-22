import type {
  RuntimeEffect,
  RuntimeEffectForId,
  RuntimeEffectId,
} from "./runtime-effect.js";

declare const verifiedRuntimeEffectBrand: unique symbol;

export type VerifiedRuntimeEffect = RuntimeEffect & {
  readonly [verifiedRuntimeEffectBrand]: true;
};

export type VerifiedRuntimeEffectForId<Id extends RuntimeEffectId> =
  VerifiedRuntimeEffect & RuntimeEffectForId<Id>;

const verifiedRuntimeEffects = new WeakSet<object>();

export function markRuntimeEffectTreeVerified(
  effect: RuntimeEffect
): VerifiedRuntimeEffect {
  verifiedRuntimeEffects.add(effect);
  if (!("branchEffects" in effect) || effect.branchEffects === undefined) {
    return effect as VerifiedRuntimeEffect;
  }

  for (const nestedEffect of effect.branchEffects) {
    markRuntimeEffectTreeVerified(nestedEffect);
  }

  return effect as VerifiedRuntimeEffect;
}

export function requireVerifiedRuntimeEffect(
  effect: RuntimeEffect
): VerifiedRuntimeEffect {
  if (!isVerifiedRuntimeEffect(effect)) {
    throw new Error(
      `Runtime Effect ${effect.effectId} must pass Runtime Data Intake`
    );
  }
  return effect;
}

export function isVerifiedRuntimeEffect(
  value: unknown
): value is VerifiedRuntimeEffect {
  return typeof value === "object" && value !== null
    ? verifiedRuntimeEffects.has(value)
    : false;
}
