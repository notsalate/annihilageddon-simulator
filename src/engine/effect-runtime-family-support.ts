import type { EffectExecutionResult } from "./effect-runtime-registry.js";
import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";
import type { RuntimeEffectForId, RuntimeEffectId } from "./runtime-effect.js";

export type ValueDecoder<T> = (
  label: string,
  raw: unknown
) => { ok: true; value: T } | { ok: false; errors: string[] };
export type RequiredField<T> = { optional: false; decode: ValueDecoder<T> };
export type OptionalField<T> = { optional: true; decode: ValueDecoder<T> };
export type FieldDefinition<T extends object, Key extends keyof T> =
  {} extends Pick<T, Key>
    ? OptionalField<Exclude<T[Key], undefined>>
    : RequiredField<T[Key]>;
export type ObjectFields<T extends object> = {
  [Key in keyof T]-?: FieldDefinition<T, Key>;
};

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
