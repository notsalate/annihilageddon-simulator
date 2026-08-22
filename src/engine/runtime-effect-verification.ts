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

export function markRuntimeEffectTreeVerified(effect: RuntimeEffect): void {
  verifiedRuntimeEffects.add(effect);
  if (!("branchEffects" in effect) || effect.branchEffects === undefined) {
    return;
  }

  for (const nestedEffect of effect.branchEffects) {
    markRuntimeEffectTreeVerified(nestedEffect);
  }
}

export function isVerifiedRuntimeEffect(
  value: unknown
): value is VerifiedRuntimeEffect {
  return typeof value === "object" && value !== null
    ? verifiedRuntimeEffects.has(value)
    : false;
}
