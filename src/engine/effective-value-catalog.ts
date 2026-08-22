import { isPlainRecord } from "../common.js";
import type { PlayerId, TokenInstanceId } from "../domain/types.js";
import type {
  EffectiveValueKind,
  EffectiveValueModifierId,
  EffectiveValueModifierEffectPayloadMap,
} from "./effect-runtime-effective-value-modifier.js";
import { effectiveValueModifierEffectIds } from "./effect-runtime-effective-value-modifier.js";
import { isRuntimeEffectId } from "./runtime-effect.js";

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

export type EffectiveValueModifierOperation = (value: number) => number;

export type EffectiveValueModifierOperationResult<Result> =
  | { readonly status: "notApplicable" }
  | { readonly status: "resolved"; readonly result: Result };

export interface EffectiveValueModifierOperationContext<Result> {
  readonly timing: "whileControlled" | "whileScoring";
  readonly valueKind: EffectiveValueKind;
  readonly targetMatches: (effect: EffectiveValueModifierEffect) => boolean;
  readonly countOwnedScoringCards: (
    countedCardTypes: readonly string[]
  ) => number;
  readonly evaluate: (
    apply: EffectiveValueModifierOperation
  ) => EffectiveValueModifierOperationResult<Result>;
}

export type EffectiveValueModifierCatalogOperationResult<Result> =
  | EffectiveValueModifierOperationResult<Result>
  | { readonly status: "error"; readonly error: string };

export type EffectiveValueModifierCatalogDispatcher = <Result>(
  effect: unknown,
  source: EffectiveValueModifierSource,
  context: EffectiveValueModifierOperationContext<Result>
) => EffectiveValueModifierCatalogOperationResult<Result>;

function readEffectiveValueModifierId(
  rawEffect: unknown
): EffectiveValueModifierId | undefined {
  if (!isPlainRecord(rawEffect) || !isRuntimeEffectId(rawEffect["effectId"])) {
    return undefined;
  }

  return effectiveValueModifierEffectIds.includes(
    rawEffect["effectId"] as EffectiveValueModifierId
  )
    ? (rawEffect["effectId"] as EffectiveValueModifierId)
    : undefined;
}

export function isEffectiveValueModifierEffect(
  effect: unknown
): effect is EffectiveValueModifierEffect {
  return readEffectiveValueModifierId(effect) !== undefined;
}
