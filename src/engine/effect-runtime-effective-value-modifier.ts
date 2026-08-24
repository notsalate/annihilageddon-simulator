import type {
  EffectExecutionResult,
  EffectRuntimeServices,
  EffectSourceContext,
} from "./effect-runtime-registry.js";
import type { RuntimeEffectDecoder } from "./runtime-effect-decoder.js";
import type {
  EffectTiming,
  RuntimeEffectForId,
  RuntimeEffectTarget,
} from "./runtime-effect.js";
import {
  type EffectRuntimeMode,
  type EffectRuntimeSourceKind,
  type EffectRuntimeSupportedModes,
  type EffectRuntimeSupportedSourceKinds,
  type EffectRuntimeSupportedTimings,
} from "./effect-runtime-catalog-shared.js";
import type {
  ObjectFields,
  OptionalField,
  RequiredField,
  ValueDecoder,
} from "./effect-runtime-family-support.js";
import type { GameState, PlayerState } from "./setup.js";

export const effectiveValueModifierEffectIds = [
  "modify_effective_value",
  "fixture_modify_effective_value",
] as const;

export type EffectiveValueModifierId =
  (typeof effectiveValueModifierEffectIds)[number];

export interface EffectiveValueModifierCatalogDefinition<
  Id extends EffectiveValueModifierId = EffectiveValueModifierId,
> {
  readonly effectId: Id;
  readonly supportedTimings: readonly [
    "whileControlled" | "whileScoring",
    ...("whileControlled" | "whileScoring")[],
  ];
  readonly supportedModes: readonly [EffectRuntimeMode, ...EffectRuntimeMode[]];
  readonly supportedSourceKinds: readonly [
    EffectRuntimeSourceKind,
    ...EffectRuntimeSourceKind[],
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

type TimedEffect<Id extends string, Timing extends EffectTiming> = {
  effectId: Id;
  timing: Timing;
};

export type EffectiveValueKind =
  | "cardCost"
  | "cardVictoryPoints"
  | "tokenVictoryPoints"
  | "playerMaxLife"
  | "playerVictoryPoints";
export type EffectiveValueOperation = "add" | "invertNegative" | "multiply";
export type ModifyEffectiveValueRuntimeEffect<
  Id extends "modify_effective_value" | "fixture_modify_effective_value" =
    | "modify_effective_value"
    | "fixture_modify_effective_value",
> = TimedEffect<Id, "whileControlled" | "whileScoring"> & {
  valueKind: EffectiveValueKind;
  operation: EffectiveValueOperation;
  amount?: number;
  amountPerOwnedCard?: number;
  countedCardTypes?: string[];
  multiplier?: number;
  target: RuntimeEffectTarget;
};
export interface EffectiveValueModifierEffectPayloadMap {
  modify_effective_value: ModifyEffectiveValueRuntimeEffect<"modify_effective_value">;
  fixture_modify_effective_value: ModifyEffectiveValueRuntimeEffect<"fixture_modify_effective_value">;
}

export interface EffectiveValueModifierDecoderTools {
  defineDecoder<Id extends EffectiveValueModifierId>(
    effectId: Id,
    fields: ObjectFields<RuntimeEffectForId<Id>>,
    validateDecodedPayload?: (
      subjectId: string,
      effect: RuntimeEffectForId<Id>
    ) => string[]
  ): RuntimeEffectDecoder<Id>;
  required<T>(decode: ValueDecoder<T>): RequiredField<T>;
  optional<T>(decode: ValueDecoder<T>): OptionalField<T>;
  literal<const Value extends string | number | boolean>(
    expected: Value
  ): ValueDecoder<Value>;
  safeInteger: ValueDecoder<number>;
  nonEmptyStringArray: ValueDecoder<string[]>;
  runtimeTarget: ValueDecoder<RuntimeEffectTarget>;
}

export type EffectiveValueModifierEffectDecoders = {
  [Id in EffectiveValueModifierId]: RuntimeEffectDecoder<Id>;
};

export function createEffectiveValueModifierEffectDecoders(
  tools: EffectiveValueModifierDecoderTools
): EffectiveValueModifierEffectDecoders {
  const {
    defineDecoder,
    required,
    optional,
    literal,
    safeInteger,
    nonEmptyStringArray,
    runtimeTarget,
  } = tools;
  return {
    modify_effective_value: defineDecoder(
      "modify_effective_value",
      {
        effectId: required(literal("modify_effective_value")),
        timing: required(
          oneOfTools(["whileControlled", "whileScoring"] as const)
        ),
        valueKind: required(
          oneOfTools([
            "cardCost",
            "cardVictoryPoints",
            "tokenVictoryPoints",
            "playerMaxLife",
            "playerVictoryPoints",
          ] as const)
        ),
        operation: required(
          oneOfTools(["add", "invertNegative", "multiply"] as const)
        ),
        amount: optional(safeInteger),
        amountPerOwnedCard: optional(safeInteger),
        countedCardTypes: optional(nonEmptyStringArray),
        multiplier: optional(safeInteger),
        target: required(runtimeTarget),
      },
      validateEffectiveValuePayload
    ),
    fixture_modify_effective_value: defineDecoder(
      "fixture_modify_effective_value",
      {
        effectId: required(literal("fixture_modify_effective_value")),
        timing: required(
          oneOfTools(["whileControlled", "whileScoring"] as const)
        ),
        valueKind: required(
          oneOfTools([
            "cardCost",
            "cardVictoryPoints",
            "tokenVictoryPoints",
            "playerMaxLife",
            "playerVictoryPoints",
          ] as const)
        ),
        operation: required(
          oneOfTools(["add", "invertNegative", "multiply"] as const)
        ),
        amount: optional(safeInteger),
        amountPerOwnedCard: optional(safeInteger),
        countedCardTypes: optional(nonEmptyStringArray),
        multiplier: optional(safeInteger),
        target: required(runtimeTarget),
      },
      validateEffectiveValuePayload
    ),
  };
}

function oneOfTools<
  const Values extends readonly (string | number | boolean)[],
>(values: Values): ValueDecoder<Values[number]> {
  return (label, raw) =>
    values.includes(raw as Values[number])
      ? { ok: true, value: raw as Values[number] }
      : {
          ok: false,
          errors: [`${label} must be one of ${values.join(", ")}`],
        };
}

function validateEffectiveValuePayload(
  subjectId: string,
  effect:
    | RuntimeEffectForId<"modify_effective_value">
    | RuntimeEffectForId<"fixture_modify_effective_value">
): string[] {
  const errors: string[] = [];
  if (
    effect.operation === "add" &&
    effect.amount === undefined &&
    effect.amountPerOwnedCard === undefined
  ) {
    errors.push(`${subjectId} uses add operation without amount`);
  }
  if (
    effect.operation === "add" &&
    effect.amount !== undefined &&
    effect.amountPerOwnedCard !== undefined
  ) {
    errors.push(
      `${subjectId} uses add operation with both amount and amountPerOwnedCard`
    );
  }
  if (effect.operation === "invertNegative" && effect.amount !== undefined) {
    errors.push(`${subjectId} uses invertNegative with amount`);
  }
  if (
    effect.operation === "invertNegative" &&
    effect.amountPerOwnedCard !== undefined
  ) {
    errors.push(`${subjectId} uses invertNegative with amountPerOwnedCard`);
  }
  if (
    effect.operation === "invertNegative" &&
    effect.countedCardTypes !== undefined
  ) {
    errors.push(`${subjectId} uses invertNegative with countedCardTypes`);
  }
  if (
    effect.operation === "invertNegative" &&
    effect.multiplier !== undefined
  ) {
    errors.push(`${subjectId} uses invertNegative with multiplier`);
  }
  if (effect.operation === "add" && effect.multiplier !== undefined) {
    errors.push(`${subjectId} uses add operation with multiplier`);
  }
  if (effect.operation === "multiply" && effect.multiplier === undefined) {
    errors.push(`${subjectId} uses multiply operation without multiplier`);
  }
  if (
    effect.operation === "multiply" &&
    (effect.amount !== undefined ||
      effect.amountPerOwnedCard !== undefined ||
      effect.countedCardTypes !== undefined)
  ) {
    errors.push(`${subjectId} uses multiply with additive fields`);
  }
  if (
    effect.amountPerOwnedCard !== undefined &&
    (effect.countedCardTypes === undefined ||
      effect.countedCardTypes.length === 0)
  ) {
    errors.push(
      `${subjectId} uses amountPerOwnedCard without countedCardTypes`
    );
  }
  if (
    effect.operation === "add" &&
    effect.amountPerOwnedCard === undefined &&
    effect.countedCardTypes !== undefined
  ) {
    errors.push(
      `${subjectId} uses countedCardTypes without amountPerOwnedCard`
    );
  }

  const target = effect.target;
  if (!("targetType" in target)) {
    errors.push(`${subjectId} uses invalid effective-value target`);
    return errors;
  }
  if (
    effect.valueKind === "cardCost" ||
    effect.valueKind === "cardVictoryPoints"
  ) {
    if (target.targetType !== "card") {
      errors.push(
        `${subjectId} uses unsupported effective-value target ${target.targetType}`
      );
    } else if (
      target.definitionId === undefined &&
      (target.cardTypes === undefined || target.cardTypes.length === 0)
    ) {
      errors.push(`${subjectId} uses invalid effective-value card target`);
    }
  } else if (effect.valueKind === "tokenVictoryPoints") {
    if (
      target.targetType !== "token" ||
      (target.definitionId === undefined &&
        target.tokenKind !== "deadWizardToken")
    ) {
      errors.push(`${subjectId} uses unsupported effective-value target`);
    }
  } else if (target.targetType !== "player") {
    errors.push(
      `${subjectId} uses unsupported effective-value target ${target.targetType}`
    );
  }
  return errors;
}

type EffectiveValueModifierHandler<
  Effect extends { effectId: EffectiveValueModifierId },
> = {
  readonly effectId: Effect["effectId"];
  execute(
    state: GameState,
    player: PlayerState,
    effect: Effect,
    source: EffectSourceContext,
    services: EffectRuntimeServices
  ): EffectExecutionResult;
};

const modifyEffectiveValueHandler: EffectiveValueModifierHandler<
  RuntimeEffectForId<"modify_effective_value">
> = {
  effectId: "modify_effective_value",
  execute() {
    return {
      ok: false,
      error: "modify_effective_value is an effective-value-only effect",
    };
  },
};

const fixtureModifyEffectiveValueHandler: EffectiveValueModifierHandler<
  RuntimeEffectForId<"fixture_modify_effective_value">
> = {
  effectId: "fixture_modify_effective_value",
  execute() {
    return {
      ok: false,
      error: "fixture_modify_effective_value is an effective-value-only effect",
    };
  },
};

export interface EffectiveValueModifierCatalogTools {
  bindRuntimeEffectDecoder<Id extends EffectiveValueModifierId>(
    effectId: Id
  ): RuntimeEffectDecoder<Id>;
}

export function createEffectiveValueModifierEffectDefinitions(
  tools: EffectiveValueModifierCatalogTools
) {
  const { bindRuntimeEffectDecoder } = tools;
  return [
    {
      ...effectiveValueModifierCatalogDefinitions[0],
      decoder: bindRuntimeEffectDecoder("modify_effective_value"),
      supportedTimings: effectiveValueModifierCatalogDefinitions[0]
        .supportedTimings as EffectRuntimeSupportedTimings,
      supportedModes: effectiveValueModifierCatalogDefinitions[0]
        .supportedModes as EffectRuntimeSupportedModes,
      supportedSourceKinds: effectiveValueModifierCatalogDefinitions[0]
        .supportedSourceKinds as EffectRuntimeSupportedSourceKinds,
      handler: modifyEffectiveValueHandler,
    },
    {
      ...effectiveValueModifierCatalogDefinitions[1],
      decoder: bindRuntimeEffectDecoder("fixture_modify_effective_value"),
      supportedTimings: effectiveValueModifierCatalogDefinitions[1]
        .supportedTimings as EffectRuntimeSupportedTimings,
      supportedModes: effectiveValueModifierCatalogDefinitions[1]
        .supportedModes as EffectRuntimeSupportedModes,
      supportedSourceKinds: effectiveValueModifierCatalogDefinitions[1]
        .supportedSourceKinds as EffectRuntimeSupportedSourceKinds,
      handler: fixtureModifyEffectiveValueHandler,
    },
  ] as const;
}
