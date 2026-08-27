import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";
import type { RuntimeEffectDecoder } from "./runtime-effect-decoder.js";
import type {
  EffectRuntimeSupportedModes,
  EffectRuntimeSupportedSourceKinds,
  EffectRuntimeSupportedTimings,
} from "./effect-runtime-catalog-shared.js";
import { allEffectRuntimeModes } from "./effect-runtime-catalog-shared.js";
import type {
  RuntimeEffectCost,
  RuntimeEffectForId,
  RuntimeEffect,
} from "./runtime-effect.js";
import {
  createUnsupportedEffectHandler,
  type ObjectFields,
  type OptionalField,
  type RequiredField,
  type ValueDecoder,
} from "./effect-runtime-family-support.js";

export type CombatDefenseEffectId =
  | "avoid_attack"
  | "exchange_controlled_dead_wizard_tokens"
  | "defense_discard_self_avoid_attack_then_optional_destroy_hand_card";

export const combatDefenseEffectIds = [
  "avoid_attack",
  "exchange_controlled_dead_wizard_tokens",
  "defense_discard_self_avoid_attack_then_optional_destroy_hand_card",
] as const satisfies readonly CombatDefenseEffectId[];

export interface CombatDefenseEffectDecoderTools {
  defineDecoder<Id extends CombatDefenseEffectId>(
    effectId: Id,
    fields: ObjectFields<RuntimeEffectForId<Id>>
  ): RuntimeEffectDecoder<Id>;
  required<T>(decode: ValueDecoder<T>): RequiredField<T>;
  optional<T>(decode: ValueDecoder<T>): OptionalField<T>;
  literal<const Value extends string | number | boolean>(
    expected: Value
  ): ValueDecoder<Value>;
  booleanValue: ValueDecoder<boolean>;
  optionalCosts: OptionalField<RuntimeEffectCost[]>;
  optionalRuntimeEffectArray: OptionalField<RuntimeEffect[]>;
  oneOf<const Values extends readonly (string | number | boolean)[]>(
    values: Values
  ): ValueDecoder<Values[number]>;
  positiveInteger: ValueDecoder<number>;
  decodeObject<T extends object>(
    label: string,
    raw: unknown,
    fields: ObjectFields<T>
  ): { ok: true; value: T } | { ok: false; errors: string[] };
}

export type CombatDefenseEffectDecoders = {
  [Id in CombatDefenseEffectId]: RuntimeEffectDecoder<Id>;
};

export function createCombatDefenseEffectDecoders(
  tools: CombatDefenseEffectDecoderTools
): CombatDefenseEffectDecoders {
  const {
    defineDecoder,
    required,
    optional,
    literal,
    booleanValue,
    optionalCosts,
    optionalRuntimeEffectArray,
    oneOf,
  } = tools;
  return {
    avoid_attack: defineDecoder("avoid_attack", {
      effectId: required(literal("avoid_attack")),
      timing: required(literal("onDefense")),
      destination: required(
        oneOf([
          "discardSelf",
          "topdeckSelf",
          "topdeckSelfFaceUp",
          "keep",
        ] as const)
      ),
      redirectAttack: optional(booleanValue),
      redirectAttackIf: optional(literal("dingler")),
      costs: optionalCosts,
      branchEffects: optionalRuntimeEffectArray,
    }),
    exchange_controlled_dead_wizard_tokens: defineDecoder(
      "exchange_controlled_dead_wizard_tokens",
      {
        effectId: required(literal("exchange_controlled_dead_wizard_tokens")),
        timing: required(literal("onDefense")),
        optional: required(literal(true)),
      }
    ),
    defense_discard_self_avoid_attack_then_optional_destroy_hand_card:
      defineDecoder(
        "defense_discard_self_avoid_attack_then_optional_destroy_hand_card",
        {
          effectId: required(
            literal(
              "defense_discard_self_avoid_attack_then_optional_destroy_hand_card"
            )
          ),
          timing: required(literal("defense")),
          defenseCost: required((label, raw) =>
            tools.decodeObject(label, raw, {
              effectId: required(literal("discard_self")),
            })
          ),
          avoids: required(literal("attack")),
          optionalFollowup: required((label, raw) =>
            tools.decodeObject(label, raw, {
              effectId: required(literal("destroy_own_cards")),
              sourceZones: required(literal("hand")),
              amount: required(tools.positiveInteger),
              chooser: required(literal("defendingPlayer")),
            })
          ),
        }
      ),
  };
}

const avoidAttackHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"avoid_attack">
> = {
  effectId: "avoid_attack",
  execute() {
    return { ok: true };
  },
};

const exchangeControlledDeadWizardTokensHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"exchange_controlled_dead_wizard_tokens">
> = {
  effectId: "exchange_controlled_dead_wizard_tokens",
  execute(state, player, effect, source, services) {
    const attackerPlayerId = source.currentAttackerPlayerId;
    if (attackerPlayerId === undefined) {
      return { ok: true };
    }
    const attacker = state.players.find(
      (candidate) => candidate.playerId === attackerPlayerId
    );
    if (attacker === undefined) {
      return {
        ok: false,
        error: `Missing current attacker player ${attackerPlayerId}`,
      };
    }
    return services.exchangeControlledDeadWizardTokenLikes(
      state,
      player,
      attacker,
      effect.effectId,
      source,
      { reapplyFace: true }
    );
  },
};

export interface CombatDefenseCatalogTools {
  bindRuntimeEffectDecoder<Id extends CombatDefenseEffectId>(
    effectId: Id
  ): RuntimeEffectDecoder<Id>;
}

type CombatDefenseEffectDefinition<Id extends CombatDefenseEffectId> = {
  readonly effectId: Id;
  readonly decoder: RuntimeEffectDecoder<Id>;
  readonly supportedTimings: EffectRuntimeSupportedTimings;
  readonly supportedModes: EffectRuntimeSupportedModes;
  readonly supportedSourceKinds: EffectRuntimeSupportedSourceKinds;
  readonly handler: EffectRuntimeHandler<RuntimeEffectForId<Id>>;
};

export function createCombatDefenseEffectDefinitions(
  tools: CombatDefenseCatalogTools
): readonly [
  CombatDefenseEffectDefinition<"avoid_attack">,
  CombatDefenseEffectDefinition<"exchange_controlled_dead_wizard_tokens">,
  CombatDefenseEffectDefinition<"defense_discard_self_avoid_attack_then_optional_destroy_hand_card">,
] {
  return [
    {
      effectId: "avoid_attack",
      decoder: tools.bindRuntimeEffectDecoder("avoid_attack"),
      supportedTimings: ["onDefense"],
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card"],
      handler: avoidAttackHandler,
    },
    {
      effectId: "exchange_controlled_dead_wizard_tokens",
      decoder: tools.bindRuntimeEffectDecoder(
        "exchange_controlled_dead_wizard_tokens"
      ),
      supportedTimings: ["onDefense"],
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card"],
      handler: exchangeControlledDeadWizardTokensHandler,
    },
    {
      effectId:
        "defense_discard_self_avoid_attack_then_optional_destroy_hand_card",
      decoder: tools.bindRuntimeEffectDecoder(
        "defense_discard_self_avoid_attack_then_optional_destroy_hand_card"
      ),
      supportedTimings: ["defense"],
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card"],
      handler: createUnsupportedEffectHandler(
        "defense_discard_self_avoid_attack_then_optional_destroy_hand_card"
      ),
    },
  ];
}
