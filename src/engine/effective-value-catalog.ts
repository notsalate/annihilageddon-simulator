import { isPlainRecord } from "../common.js";
import type { PlayerId, TokenInstanceId } from "../domain/types.js";
import {
  isRuntimeEffectId,
  type RuntimeEffectForId,
} from "./runtime-effect.js";

export const effectiveValueModifierEffectIds = [
  "modify_effective_value",
  "fixture_modify_effective_value",
] as const;

export type EffectiveValueModifierId =
  (typeof effectiveValueModifierEffectIds)[number];
export type EffectiveValueModifierEffect =
  RuntimeEffectForId<EffectiveValueModifierId>;

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

export type EffectiveValueKind =
  | "cardCost"
  | "cardVictoryPoints"
  | "tokenVictoryPoints"
  | "playerVictoryPoints"
  | "playerMaxLife";

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

export interface EffectiveValueModifierCatalogDefinition<
  Id extends EffectiveValueModifierId = EffectiveValueModifierId,
> {
  readonly effectId: Id;
  readonly supportedTimings: readonly [
    "whileControlled" | "whileScoring",
    ...("whileControlled" | "whileScoring")[],
  ];
  readonly supportedModes: readonly [
    EffectiveValueModifierRuntimeMode,
    ...EffectiveValueModifierRuntimeMode[],
  ];
  readonly supportedSourceKinds: readonly [
    EffectiveValueModifierSourceKind,
    ...EffectiveValueModifierSourceKind[],
  ];
}

export const effectiveValueModifierCatalogDefinitions = [
  {
    effectId: "modify_effective_value",
    supportedTimings: ["whileControlled", "whileScoring"],
    supportedModes: ["combat", "fixture"],
    supportedSourceKinds: ["card", "wizardProperty", "deadWizardToken"],
  },
  {
    effectId: "fixture_modify_effective_value",
    supportedTimings: ["whileControlled", "whileScoring"],
    supportedModes: ["fixture"],
    supportedSourceKinds: ["card", "wizardProperty", "deadWizardToken"],
  },
] as const satisfies readonly EffectiveValueModifierCatalogDefinition[];

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
