import { createUnsupportedEffectHandler } from "./effect-runtime-family-support.js";
import { countControlledCardsOfType } from "./card-type-runtime.js";
import {
  recordEffectChipsChanged,
  recordGameEvent,
  recordTurnPowerChanged,
} from "./event-recorder.js";
import type { RuntimeEffectDecoder } from "./runtime-effect-decoder.js";
import type {
  EffectTiming,
  RuntimeEffectCondition,
  RuntimeEffectForId,
} from "./runtime-effect.js";
import type { EffectChoice } from "./effect-runtime-registry.js";
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
import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";

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
export type ActivationAddPowerPerControlledCardTypeRuntimeEffect = TimedEffect<
  "activation_add_power_per_controlled_card_type",
  "activation"
> & {
  cardType: string;
  amountPerCard: number;
  activationLimit: "oncePerTurnWhileControlled";
};
export type ActivationDoubleTurnPowerRuntimeEffect = TimedEffect<
  "activation_double_turn_power",
  "activation"
> & { activationLimit: "oncePerTurnWhileControlled" };
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
  activation_add_power_per_controlled_card_type: ActivationAddPowerPerControlledCardTypeRuntimeEffect;
  activation_destroy_self_then_destroy_own_cards: ActivationDestroySelfThenDestroyOwnCardsRuntimeEffect;
  activation_double_turn_power: ActivationDoubleTurnPowerRuntimeEffect;
  conditional_activation_destroy_own_cards: ConditionalActivationDestroyOwnCardsRuntimeEffect;
  conditional_activation_gain_chips: ConditionalActivationGainChipsRuntimeEffect;
  optional_spend_chip_destroy_own_cards: OptionalSpendChipDestroyOwnCardsRuntimeEffect;
}

export type ActivationEffectId =
  | "activation_add_power_per_controlled_card_type"
  | "activation_destroy_self_then_destroy_own_cards"
  | "activation_double_turn_power"
  | "conditional_activation_destroy_own_cards"
  | "conditional_activation_gain_chips"
  | "optional_spend_chip_destroy_own_cards";

export const activationEffectIds = [
  "activation_add_power_per_controlled_card_type",
  "activation_destroy_self_then_destroy_own_cards",
  "activation_double_turn_power",
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
  nonEmptyString: ValueDecoder<string>;
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
    nonEmptyString,
    optionalCondition,
    handOrDiscardZones,
  } = tools;

  return {
    activation_add_power_per_controlled_card_type: defineDecoder(
      "activation_add_power_per_controlled_card_type",
      {
        effectId: required(
          literal("activation_add_power_per_controlled_card_type")
        ),
        timing: required(literal("activation")),
        cardType: required(nonEmptyString),
        amountPerCard: required(positiveInteger),
        activationLimit: required(literal("oncePerTurnWhileControlled")),
      }
    ),
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
    activation_double_turn_power: defineDecoder(
      "activation_double_turn_power",
      {
        effectId: required(literal("activation_double_turn_power")),
        timing: required(literal("activation")),
        activationLimit: required(literal("oncePerTurnWhileControlled")),
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
  const conditionalActivationGainChipsHandler: EffectRuntimeHandler<ConditionalActivationGainChipsRuntimeEffect> =
    {
      effectId: "conditional_activation_gain_chips",
      execute(state, player, effect, source) {
        const chipsBefore = player.chips;
        player.chips += effect.amount;
        recordEffectChipsChanged(
          state,
          player,
          source,
          effect.effectId,
          chipsBefore,
          player.chips
        );
        return { ok: true };
      },
    };
  const activationAddPowerPerControlledCardTypeHandler: EffectRuntimeHandler<ActivationAddPowerPerControlledCardTypeRuntimeEffect> =
    {
      effectId: "activation_add_power_per_controlled_card_type",
      execute(state, player, effect, source) {
        const amount =
          countControlledCardsOfType(state, player, effect.cardType) *
          effect.amountPerCard;
        if (amount === 0) return { ok: true };

        const powerBefore = state.turn.power;
        state.turn.power += amount;
        recordTurnPowerChanged(
          state,
          player,
          source,
          effect.effectId,
          powerBefore,
          state.turn.power
        );
        return { ok: true };
      },
    };
  const activationDoubleTurnPowerHandler: EffectRuntimeHandler<ActivationDoubleTurnPowerRuntimeEffect> =
    {
      effectId: "activation_double_turn_power",
      execute(state, player, effect, source) {
        const powerBefore = state.turn.power;
        state.turn.power *= 2;
        recordTurnPowerChanged(
          state,
          player,
          source,
          effect.effectId,
          powerBefore,
          state.turn.power
        );
        return { ok: true };
      },
    };
  const conditionalActivationDestroyOwnCardsHandler: EffectRuntimeHandler<ConditionalActivationDestroyOwnCardsRuntimeEffect> =
    {
      effectId: "conditional_activation_destroy_own_cards",
      execute(state, player, effect, source, services) {
        const cards = effect.sourceZones.flatMap((zone) =>
          zone === "hand" ? player.hand : player.discard
        );
        const choices = [
          { choiceKind: "option" as const, choiceId: "decline" },
          ...cards.map(
            (card): EffectChoice => ({
              choiceKind: "cardTarget",
              choiceId: `destroy_${card.instanceId}`,
              cards: [card],
              amount: 1,
            })
          ),
        ];
        const choice = services.chooseEffectChoice(
          state,
          player,
          source,
          effect.effectId,
          choices
        );
        if (choice?.choiceKind !== "cardTarget") return { ok: true };

        const target = choice.cards[0];
        if (target === undefined) return { ok: true };
        const destination = services.getDestroyDestination(state, target);
        if (!destination.ok) return destination;
        const moved = services.moveCardToZonePreservingOwner(
          state,
          player,
          target,
          destination.zone,
          destination.zoneName,
          effect.effectId,
          source
        );
        if (!moved) {
          return {
            ok: false,
            error: `Cannot move card ${target.instanceId}`,
          };
        }
        recordGameEvent(state, {
          type: "effectCardDestroyed",
          playerId: player.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          targetCardInstanceId: target.instanceId,
          targetDefinitionId: target.definitionId,
          effectId: effect.effectId,
          sourceType: source.sourceType,
        });
        return { ok: true };
      },
    };
  return [
    {
      effectId: "activation_add_power_per_controlled_card_type",
      decoder: bindRuntimeEffectDecoder(
        "activation_add_power_per_controlled_card_type"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: activationAddPowerPerControlledCardTypeHandler,
    },
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
      effectId: "activation_double_turn_power",
      decoder: bindRuntimeEffectDecoder("activation_double_turn_power"),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: activationDoubleTurnPowerHandler,
    },
    {
      effectId: "conditional_activation_destroy_own_cards",
      decoder: bindRuntimeEffectDecoder(
        "conditional_activation_destroy_own_cards"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: conditionalActivationDestroyOwnCardsHandler,
    },
    {
      effectId: "conditional_activation_gain_chips",
      decoder: bindRuntimeEffectDecoder("conditional_activation_gain_chips"),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: conditionalActivationGainChipsHandler,
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
