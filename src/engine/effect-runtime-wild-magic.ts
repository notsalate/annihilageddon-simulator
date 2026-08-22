import { recordGameEvent } from "./event-recorder.js";
import type { EffectChoice } from "./effect-runtime-registry.js";
import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";
import type { RuntimeEffectDecoder } from "./runtime-effect-decoder.js";
import type { RuntimeEffectForId, WildMagicOption } from "./runtime-effect.js";
import {
  allEffectRuntimeModes,
  type EffectRuntimeSupportedModes,
  type EffectRuntimeSupportedSourceKinds,
  type EffectRuntimeSupportedTimings,
} from "./effect-runtime-catalog-shared.js";

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

export type WildMagicEffectId = "wild_magic_choice";

export const wildMagicEffectIds = [
  "wild_magic_choice",
] as const satisfies readonly WildMagicEffectId[];

export interface WildMagicEffectDecoderTools {
  defineDecoder<Id extends WildMagicEffectId>(
    effectId: Id,
    fields: ObjectFields<RuntimeEffectForId<Id>>,
    validateDecodedPayload?: (
      subjectId: string,
      effect: RuntimeEffectForId<Id>
    ) => string[]
  ): RuntimeEffectDecoder<Id>;
  required<T>(decode: ValueDecoder<T>): RequiredField<T>;
  literal<const Value extends string | number | boolean>(
    expected: Value
  ): ValueDecoder<Value>;
  wildMagicOption: ValueDecoder<WildMagicOption>;
  arrayOf<T>(decode: ValueDecoder<T>): ValueDecoder<T[]>;
}

export type WildMagicEffectDecoders = {
  [Id in WildMagicEffectId]: RuntimeEffectDecoder<Id>;
};

export function createWildMagicEffectDecoders(
  tools: WildMagicEffectDecoderTools
): WildMagicEffectDecoders {
  const { defineDecoder, required, literal, wildMagicOption, arrayOf } = tools;
  return {
    wild_magic_choice: defineDecoder("wild_magic_choice", {
      effectId: required(literal("wild_magic_choice")),
      timing: required(literal("onPlay")),
      options: required(arrayOf(wildMagicOption)),
    }),
  };
}

const wildMagicChoiceHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"wild_magic_choice">
> = {
  effectId: "wild_magic_choice",
  execute(state, player, effect, source, services) {
    const legalOptions = effect.options.filter((option) =>
      services.isLegalWildMagicOption(state, player, option)
    );
    const choices: EffectChoice[] = legalOptions.map((_, index) => ({
      choiceKind: "option",
      choiceId: `wild_magic_option_${index}`,
    }));
    const choice = services.chooseEffectChoice(
      state,
      player,
      source,
      effect.effectId,
      choices
    );
    const selectedOption = legalOptions[choices.indexOf(choice!)];
    if (selectedOption !== undefined) {
      recordGameEvent(state, {
        type: "wildMagicChoiceSelected",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: selectedOption.effectId,
        sourceType: source.sourceType,
      });
      return services.executeEffect(
        state,
        player,
        { ...selectedOption, timing: "onPlay" },
        source
      );
    }
    recordGameEvent(state, {
      type: "wildMagicChoiceSkipped",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: "wild_magic_choice",
      sourceType: source.sourceType,
    });
    return { ok: true };
  },
};

export interface WildMagicCatalogTools {
  bindRuntimeEffectDecoder<Id extends WildMagicEffectId>(
    effectId: Id
  ): RuntimeEffectDecoder<Id>;
}

type WildMagicEffectDefinition = {
  readonly effectId: WildMagicEffectId;
  readonly decoder: RuntimeEffectDecoder<WildMagicEffectId>;
  readonly supportedTimings: EffectRuntimeSupportedTimings;
  readonly supportedModes: EffectRuntimeSupportedModes;
  readonly supportedSourceKinds: EffectRuntimeSupportedSourceKinds;
  readonly handler: EffectRuntimeHandler<RuntimeEffectForId<WildMagicEffectId>>;
};

export function createWildMagicEffectDefinitions(
  tools: WildMagicCatalogTools
): readonly [WildMagicEffectDefinition] {
  return [
    {
      effectId: "wild_magic_choice",
      decoder: tools.bindRuntimeEffectDecoder("wild_magic_choice"),
      supportedTimings: ["onPlay"],
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card"],
      handler: wildMagicChoiceHandler,
    },
  ];
}
