import type {
  EffectExecutionResult,
  EffectRuntimeServices,
  EffectSourceContext,
} from "./effect-runtime-registry.js";
import type { RuntimeEffectDecoder } from "./runtime-effect-decoder.js";
import type { RuntimeEffect, RuntimeEffectForId } from "./runtime-effect.js";
import type {
  EffectRuntimeMode,
  EffectRuntimeSourceKind,
  EffectRuntimeSupportedModes,
  EffectRuntimeSupportedSourceKinds,
  EffectRuntimeSupportedTimings,
} from "./effect-runtime-catalog-shared.js";
import type {
  ObjectFields,
  RequiredField,
  ValueDecoder,
} from "./effect-runtime-family-support.js";
import type { GameState, PlayerState } from "./setup.js";

export const cardTypeEffectIds = ["owned_cards_count_as_card_type"] as const;

export type CardTypeEffectId = (typeof cardTypeEffectIds)[number];

export type OwnedCardsCountAsCardTypeRuntimeEffect = {
  effectId: "owned_cards_count_as_card_type";
  timing: "whileControlled";
  sourceCardTypes: string[];
  countedAsCardType: string;
};

export interface CardTypeEffectPayloadMap {
  owned_cards_count_as_card_type: OwnedCardsCountAsCardTypeRuntimeEffect;
}

export interface CardTypeEffectDecoderTools {
  defineDecoder<Id extends CardTypeEffectId>(
    effectId: Id,
    fields: ObjectFields<RuntimeEffectForId<Id>>
  ): RuntimeEffectDecoder<Id>;
  required<T>(decode: ValueDecoder<T>): RequiredField<T>;
  literal<const Value extends string | number | boolean>(
    expected: Value
  ): ValueDecoder<Value>;
  nonEmptyStringArray: ValueDecoder<string[]>;
}

export function createCardTypeEffectDecoders(
  tools: CardTypeEffectDecoderTools
): { [Id in CardTypeEffectId]: RuntimeEffectDecoder<Id> } {
  const { defineDecoder, required, literal, nonEmptyStringArray } = tools;
  return {
    owned_cards_count_as_card_type: defineDecoder(
      "owned_cards_count_as_card_type",
      {
        effectId: required(literal("owned_cards_count_as_card_type")),
        timing: required(literal("whileControlled")),
        sourceCardTypes: required(nonEmptyStringArray),
        countedAsCardType: required(nonEmptyStringArrayItem),
      }
    ),
  };
}

const nonEmptyStringArrayItem: ValueDecoder<string> = (label, raw) =>
  typeof raw === "string" && raw.length > 0
    ? { ok: true, value: raw }
    : { ok: false, errors: [`${label} must be a non-empty string`] };

export function isOwnedCardsCountAsCardTypeRuntimeEffect(
  effect: RuntimeEffect
): effect is RuntimeEffectForId<"owned_cards_count_as_card_type"> {
  return effect.effectId === "owned_cards_count_as_card_type";
}

const ownedCardsCountAsCardTypeHandler = {
  effectId: "owned_cards_count_as_card_type" as const,
  execute(
    _state: GameState,
    _player: PlayerState,
    _effect: RuntimeEffectForId<"owned_cards_count_as_card_type">,
    _source: EffectSourceContext,
    _services: EffectRuntimeServices
  ): EffectExecutionResult {
    return {
      ok: false,
      error:
        "owned_cards_count_as_card_type is evaluated by cardMatchesTypeForPlayer",
    };
  },
};

export interface CardTypeEffectCatalogDefinition {
  readonly effectId: CardTypeEffectId;
  readonly supportedTimings: readonly ["whileControlled"];
  readonly supportedModes: readonly [EffectRuntimeMode, ...EffectRuntimeMode[]];
  readonly supportedSourceKinds: readonly [
    EffectRuntimeSourceKind,
    ...EffectRuntimeSourceKind[],
  ];
}

export const cardTypeEffectCatalogDefinitions = [
  {
    effectId: "owned_cards_count_as_card_type",
    supportedTimings: ["whileControlled"],
    supportedModes: ["combat", "fixture"],
    supportedSourceKinds: ["wizardProperty"],
  },
] as const satisfies readonly CardTypeEffectCatalogDefinition[];

export interface CardTypeEffectCatalogTools {
  bindRuntimeEffectDecoder<Id extends CardTypeEffectId>(
    effectId: Id
  ): RuntimeEffectDecoder<Id>;
}

export function createCardTypeEffectDefinitions(
  tools: CardTypeEffectCatalogTools
) {
  const { bindRuntimeEffectDecoder } = tools;
  return [
    {
      ...cardTypeEffectCatalogDefinitions[0],
      decoder: bindRuntimeEffectDecoder("owned_cards_count_as_card_type"),
      supportedTimings: cardTypeEffectCatalogDefinitions[0]
        .supportedTimings as EffectRuntimeSupportedTimings,
      supportedModes: cardTypeEffectCatalogDefinitions[0]
        .supportedModes as EffectRuntimeSupportedModes,
      supportedSourceKinds: cardTypeEffectCatalogDefinitions[0]
        .supportedSourceKinds as EffectRuntimeSupportedSourceKinds,
      handler: ownedCardsCountAsCardTypeHandler,
    },
  ] as const;
}
