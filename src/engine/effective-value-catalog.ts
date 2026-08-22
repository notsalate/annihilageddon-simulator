import type { PlayerId, TokenInstanceId } from "../domain/types.js";
import type {
  EffectiveValueModifierId,
  EffectiveValueModifierEffectPayloadMap,
} from "./effect-runtime-effective-value-modifier.js";
import { effectiveValueModifierEffectIds } from "./effect-runtime-effective-value-modifier.js";
import type { VerifiedRuntimeEffect } from "./runtime-effect-verification.js";

export type {
  EffectiveValueKind,
  EffectiveValueModifierCatalogDefinition,
  EffectiveValueModifierId,
} from "./effect-runtime-effective-value-modifier.js";
export {
  effectiveValueModifierCatalogDefinitions,
  effectiveValueModifierEffectIds,
} from "./effect-runtime-effective-value-modifier.js";
export type EffectiveValueModifierEffect =
  EffectiveValueModifierEffectPayloadMap[EffectiveValueModifierId];

export type EffectiveValueModifierSourceKind =
  | "card"
  | "wizardProperty"
  | "deadWizardToken";
export type EffectiveValueModifierRuntimeMode = "combat" | "fixture";

export interface EffectiveValueModifierSource {
  readonly sourceType: EffectiveValueModifierSourceKind;
  readonly runtimeMode: EffectiveValueModifierRuntimeMode;
  readonly playerId: PlayerId;
  readonly cardInstanceId: string;
  readonly definitionId: string;
  readonly tokenInstanceId?: TokenInstanceId;
  readonly tokenDefinitionId?: string;
}

export function isEffectiveValueModifierEffect(
  effect: VerifiedRuntimeEffect
): effect is VerifiedRuntimeEffect & EffectiveValueModifierEffect {
  return (effectiveValueModifierEffectIds as readonly string[]).includes(
    effect.effectId
  );
}
