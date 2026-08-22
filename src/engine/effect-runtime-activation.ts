import type {
  EffectExecutionResult,
  EffectRuntimeServices,
  EffectSourceContext,
} from "./effect-runtime-registry.js";
import type { RuntimeEffectDecoder } from "./runtime-effect-decoder.js";
import type {
  EffectTiming,
  RuntimeEffectCondition,
  RuntimeEffectForId,
} from "./runtime-effect.js";
import {
  allEffectRuntimeModes,
  type EffectRuntimeSupportedModes,
  type EffectRuntimeSupportedSourceKinds,
  type EffectRuntimeSupportedTimings,
} from "./effect-runtime-catalog-shared.js";
import type { GameState, PlayerState } from "./setup.js";

type ValueDecoder<T> = (
  label: string,
  raw: unknown
) => { ok: true; value: T } | { ok: false; errors: string[] };
type RequiredField<T> = { optional: false; decode: ValueDecoder<T> };
type OptionalField<T> = { optional: true; decode: ValueDecoder<T> };
type FieldDefinition<T extends object, Key extends keyof T> =
  {} extends Pick<T, Key>
    ? OptionalField<Exclude<T[Key], undefined>>
    : RequiredField<T[Key]>;
type ObjectFields<T extends object> = {
  [Key in keyof T]-?: FieldDefinition<T, Key>;
};

type TimedEffect<Id extends string, Timing extends EffectTiming> = {
  effectId: Id;
  timing: Timing;
};
type PositiveAmount = { amount: number };
type Conditioned = { condition?: RuntimeEffectCondition };

export type ActivationDestroySelfThenDestroyOwnCardsRuntimeEffect = TimedEffect<
  "activation_destroy_self_then_destroy_own_cards",
  "activation"
> & {
  chooser: "controller";
  activationLimit: "oncePerTurnWhileControlled";
  sourceZones: "hand";
  minAmount: number;
  maxAmount: number;
  destroySelf: true;
};
export type ConditionalActivationDestroyOwnCardsRuntimeEffect = TimedEffect<
  "conditional_activation_destroy_own_cards",
  "activation"
> &
  Conditioned & {
    chooser: "controller";
    activationLimit: "oncePerTurnWhileControlled";
    sourceZones: ("hand" | "discard")[];
    amount: number;
  };
export type ConditionalActivationGainChipsRuntimeEffect = TimedEffect<
  "conditional_activation_gain_chips",
  "activation"
> &
  PositiveAmount &
  Conditioned & { activationLimit: "oncePerTurnWhileControlled" };
export type OptionalSpendChipDestroyOwnCardsRuntimeEffect = TimedEffect<
  "optional_spend_chip_destroy_own_cards",
  "onPlay"
> & {
  chipCost: number;
  amount: number;
  sourceZones: ("hand" | "discard")[];
  chooser: "controller";
};

export interface ActivationEffectPayloadMap {
  activation_destroy_self_then_destroy_own_cards: ActivationDestroySelfThenDestroyOwnCardsRuntimeEffect;
  conditional_activation_destroy_own_cards: ConditionalActivationDestroyOwnCardsRuntimeEffect;
  conditional_activation_gain_chips: ConditionalActivationGainChipsRuntimeEffect;
  optional_spend_chip_destroy_own_cards: OptionalSpendChipDestroyOwnCardsRuntimeEffect;
}

export type ActivationEffectId =
  | "activation_destroy_self_then_destroy_own_cards"
  | "conditional_activation_destroy_own_cards"
  | "conditional_activation_gain_chips"
  | "optional_spend_chip_destroy_own_cards";

export const activationEffectIds = [
  "activation_destroy_self_then_destroy_own_cards",
  "conditional_activation_destroy_own_cards",
  "conditional_activation_gain_chips",
  "optional_spend_chip_destroy_own_cards",
] as const satisfies readonly ActivationEffectId[];

export interface ActivationEffectDecoderTools {
  defineDecoder<Id extends ActivationEffectId>(
    effectId: Id,
    fields: ObjectFields<RuntimeEffectForId<Id>>
  ): RuntimeEffectDecoder<Id>;
  required<T>(decode: ValueDecoder<T>): RequiredField<T>;
  optional<T>(decode: ValueDecoder<T>): OptionalField<T>;
  literal<const Value extends string | number | boolean>(
    expected: Value
  ): ValueDecoder<Value>;
  positiveInteger: ValueDecoder<number>;
  optionalCondition: OptionalField<
    NonNullable<
      RuntimeEffectForId<"conditional_activation_destroy_own_cards">["condition"]
    >
  >;
  handOrDiscardZones: ValueDecoder<("hand" | "discard")[]>;
  optionalTiming: OptionalField<EffectTiming>;
}

export type ActivationEffectDecoders = {
  [Id in ActivationEffectId]: RuntimeEffectDecoder<Id>;
};

export function createActivationEffectDecoders(
  tools: ActivationEffectDecoderTools
): ActivationEffectDecoders {
  const {
    defineDecoder,
    required,
    literal,
    positiveInteger,
    optionalCondition,
    handOrDiscardZones,
  } = tools;

  return {
    activation_destroy_self_then_destroy_own_cards: defineDecoder(
      "activation_destroy_self_then_destroy_own_cards",
      {
        effectId: required(
          literal("activation_destroy_self_then_destroy_own_cards")
        ),
        timing: required(literal("activation")),
        chooser: required(literal("controller")),
        activationLimit: required(literal("oncePerTurnWhileControlled")),
        sourceZones: required(literal("hand")),
        minAmount: required((label, raw) =>
          typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0
            ? { ok: true, value: raw }
            : { ok: false, errors: [`${label} must be a non-negative integer`] }
        ),
        maxAmount: required(positiveInteger),
        destroySelf: required(literal(true)),
      }
    ),
    conditional_activation_destroy_own_cards: defineDecoder(
      "conditional_activation_destroy_own_cards",
      {
        effectId: required(literal("conditional_activation_destroy_own_cards")),
        timing: required(literal("activation")),
        condition: optionalCondition,
        chooser: required(literal("controller")),
        activationLimit: required(literal("oncePerTurnWhileControlled")),
        sourceZones: required(handOrDiscardZones),
        amount: required(positiveInteger),
      }
    ),
    conditional_activation_gain_chips: defineDecoder(
      "conditional_activation_gain_chips",
      {
        effectId: required(literal("conditional_activation_gain_chips")),
        timing: required(literal("activation")),
        amount: required(positiveInteger),
        condition: optionalCondition,
        activationLimit: required(literal("oncePerTurnWhileControlled")),
      }
    ),
    optional_spend_chip_destroy_own_cards: defineDecoder(
      "optional_spend_chip_destroy_own_cards",
      {
        effectId: required(literal("optional_spend_chip_destroy_own_cards")),
        timing: required(literal("onPlay")),
        chipCost: required(positiveInteger),
        amount: required(positiveInteger),
        sourceZones: required(handOrDiscardZones),
        chooser: required(literal("controller")),
      }
    ),
  };
}

type ActivationEffectHandler<Effect extends { effectId: ActivationEffectId }> =
  {
    readonly effectId: Effect["effectId"];
    readonly unsupported?: true;
    execute(
      state: GameState,
      player: PlayerState,
      effect: Effect,
      source: EffectSourceContext,
      services: EffectRuntimeServices
    ): EffectExecutionResult;
  };

function createUnsupportedEffectHandler<Id extends ActivationEffectId>(
  effectId: Id
): ActivationEffectHandler<RuntimeEffectForId<Id>> {
  return {
    effectId,
    unsupported: true,
    execute() {
      return { ok: false, error: `Unsupported effect id ${effectId}` };
    },
  };
}

export interface ActivationCatalogTools {
  bindRuntimeEffectDecoder<Id extends ActivationEffectId>(
    effectId: Id
  ): RuntimeEffectDecoder<Id>;
}

export function createActivationEffectDefinitions(
  tools: ActivationCatalogTools
) {
  const { bindRuntimeEffectDecoder } = tools;
  const supportedTimings = [
    "activation",
  ] as const satisfies EffectRuntimeSupportedTimings;
  const supportedModes =
    allEffectRuntimeModes satisfies EffectRuntimeSupportedModes;
  const supportedSourceKinds = [
    "card",
  ] as const satisfies EffectRuntimeSupportedSourceKinds;
  return [
    {
      effectId: "activation_destroy_self_then_destroy_own_cards",
      decoder: bindRuntimeEffectDecoder(
        "activation_destroy_self_then_destroy_own_cards"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: createUnsupportedEffectHandler(
        "activation_destroy_self_then_destroy_own_cards"
      ),
    },
    {
      effectId: "conditional_activation_destroy_own_cards",
      decoder: bindRuntimeEffectDecoder(
        "conditional_activation_destroy_own_cards"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: createUnsupportedEffectHandler(
        "conditional_activation_destroy_own_cards"
      ),
    },
    {
      effectId: "conditional_activation_gain_chips",
      decoder: bindRuntimeEffectDecoder("conditional_activation_gain_chips"),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: createUnsupportedEffectHandler(
        "conditional_activation_gain_chips"
      ),
    },
    {
      effectId: "optional_spend_chip_destroy_own_cards",
      decoder: bindRuntimeEffectDecoder(
        "optional_spend_chip_destroy_own_cards"
      ),
      supportedTimings: ["onPlay"] as const,
      supportedModes,
      supportedSourceKinds,
      handler: createUnsupportedEffectHandler(
        "optional_spend_chip_destroy_own_cards"
      ),
    },
  ] as const;
}
