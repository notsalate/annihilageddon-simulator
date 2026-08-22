import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";
import type { RuntimeEffectDecoder } from "./runtime-effect-decoder.js";
import type { RuntimeEffectForId } from "./runtime-effect.js";
import {
  allEffectRuntimeModes,
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

export type CombatReplacementEffectId =
  | "modify_owned_wand_attack_damage"
  | "double_owned_attack_damage"
  | "prevent_defense_against_owned_wand_attacks";

export const combatReplacementEffectIds = [
  "modify_owned_wand_attack_damage",
  "double_owned_attack_damage",
  "prevent_defense_against_owned_wand_attacks",
] as const satisfies readonly CombatReplacementEffectId[];

type DecodedPayloadValidator<Id extends CombatReplacementEffectId> = (
  subjectId: string,
  effect: RuntimeEffectForId<Id>
) => string[];

export interface CombatReplacementEffectDecoderTools {
  defineDecoder<Id extends CombatReplacementEffectId>(
    effectId: Id,
    fields: ObjectFields<RuntimeEffectForId<Id>>,
    validateDecodedPayload?: DecodedPayloadValidator<Id>
  ): RuntimeEffectDecoder<Id>;
  required<T>(decode: ValueDecoder<T>): RequiredField<T>;
  optional<T>(decode: ValueDecoder<T>): OptionalField<T>;
  literal<const Value extends string | number | boolean>(
    expected: Value
  ): ValueDecoder<Value>;
  positiveInteger: ValueDecoder<number>;
  nonEmptyStringArray: ValueDecoder<string[]>;
}

export type CombatReplacementEffectDecoders = {
  [Id in CombatReplacementEffectId]: RuntimeEffectDecoder<Id>;
};

export function createCombatReplacementEffectDecoders(
  tools: CombatReplacementEffectDecoderTools
): CombatReplacementEffectDecoders {
  const {
    defineDecoder,
    required,
    optional,
    literal,
    positiveInteger,
    nonEmptyStringArray,
  } = tools;
  return {
    modify_owned_wand_attack_damage: defineDecoder(
      "modify_owned_wand_attack_damage",
      {
        effectId: required(literal("modify_owned_wand_attack_damage")),
        timing: required(literal("attackReplacement")),
        amount: required(positiveInteger),
        cardDefinitionIds: optional(nonEmptyStringArray),
        cardTags: optional(nonEmptyStringArray),
      },
      validateWandAttackReplacement
    ),
    double_owned_attack_damage: defineDecoder("double_owned_attack_damage", {
      effectId: required(literal("double_owned_attack_damage")),
      timing: required(literal("attackReplacement")),
    }),
    prevent_defense_against_owned_wand_attacks: defineDecoder(
      "prevent_defense_against_owned_wand_attacks",
      {
        effectId: required(
          literal("prevent_defense_against_owned_wand_attacks")
        ),
        timing: required(literal("attackReplacement")),
        cardDefinitionIds: optional(nonEmptyStringArray),
        cardTags: optional(nonEmptyStringArray),
      },
      validateWandAttackReplacement
    ),
  };
}

function validateWandAttackReplacement(
  subjectId: string,
  effect:
    | RuntimeEffectForId<"modify_owned_wand_attack_damage">
    | RuntimeEffectForId<"prevent_defense_against_owned_wand_attacks">
): string[] {
  return effect.cardDefinitionIds === undefined && effect.cardTags === undefined
    ? [
        `${subjectId} uses unsupported wand-attack replacement filter cardDefinitionIds/cardTags`,
      ]
    : [];
}

const modifyOwnedWandAttackDamageHandler = {
  effectId: "modify_owned_wand_attack_damage",
  execute() {
    return {
      ok: false,
      error: "modify_owned_wand_attack_damage is an attack replacement effect",
    };
  },
} satisfies EffectRuntimeHandler<
  RuntimeEffectForId<"modify_owned_wand_attack_damage">
>;

const doubleOwnedAttackDamageHandler = {
  effectId: "double_owned_attack_damage",
  execute() {
    return {
      ok: false,
      error: "double_owned_attack_damage is an attack replacement effect",
    };
  },
} satisfies EffectRuntimeHandler<
  RuntimeEffectForId<"double_owned_attack_damage">
>;

const preventDefenseAgainstOwnedWandAttacksHandler = {
  effectId: "prevent_defense_against_owned_wand_attacks",
  execute() {
    return {
      ok: false,
      error:
        "prevent_defense_against_owned_wand_attacks is an attack replacement effect",
    };
  },
} satisfies EffectRuntimeHandler<
  RuntimeEffectForId<"prevent_defense_against_owned_wand_attacks">
>;

export interface CombatReplacementCatalogTools {
  bindRuntimeEffectDecoder<Id extends CombatReplacementEffectId>(
    effectId: Id
  ): RuntimeEffectDecoder<Id>;
}

type CombatReplacementEffectDefinition<Id extends CombatReplacementEffectId> = {
  readonly effectId: Id;
  readonly decoder: RuntimeEffectDecoder<Id>;
  readonly supportedTimings: EffectRuntimeSupportedTimings;
  readonly supportedModes: EffectRuntimeSupportedModes;
  readonly supportedSourceKinds: EffectRuntimeSupportedSourceKinds;
  readonly handler: EffectRuntimeHandler<RuntimeEffectForId<Id>>;
};

export function createCombatReplacementEffectDefinitions(
  tools: CombatReplacementCatalogTools
): readonly [
  CombatReplacementEffectDefinition<"modify_owned_wand_attack_damage">,
  CombatReplacementEffectDefinition<"double_owned_attack_damage">,
  CombatReplacementEffectDefinition<"prevent_defense_against_owned_wand_attacks">,
] {
  return [
    {
      effectId: "modify_owned_wand_attack_damage",
      decoder: tools.bindRuntimeEffectDecoder(
        "modify_owned_wand_attack_damage"
      ),
      supportedTimings: ["attackReplacement"],
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      handler: modifyOwnedWandAttackDamageHandler,
    },
    {
      effectId: "double_owned_attack_damage",
      decoder: tools.bindRuntimeEffectDecoder("double_owned_attack_damage"),
      supportedTimings: ["attackReplacement"],
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card"],
      handler: doubleOwnedAttackDamageHandler,
    },
    {
      effectId: "prevent_defense_against_owned_wand_attacks",
      decoder: tools.bindRuntimeEffectDecoder(
        "prevent_defense_against_owned_wand_attacks"
      ),
      supportedTimings: ["attackReplacement"],
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["wizardProperty"],
      handler: preventDefenseAgainstOwnedWandAttacksHandler,
    },
  ];
}
