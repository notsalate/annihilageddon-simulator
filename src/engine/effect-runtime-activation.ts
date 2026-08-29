import { countControlledCardsOfType } from "./card-type-runtime.js";
import { getControlledCards } from "./control-ledger.js";
import { destroyOwnedCard } from "./effect-runtime-cards-ownership-choice.js";
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
import type { CardInstance } from "./setup.js";
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
export type ActivationLookChooseReorderLegendDeckRuntimeEffect = TimedEffect<
  "activation_look_choose_reorder_legend_deck",
  "activation"
> & {
  condition: RuntimeEffectCondition;
  lookAmount: number;
  activationLimit: "oncePerTurnWhileControlled";
};
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
  activation_look_choose_reorder_legend_deck: ActivationLookChooseReorderLegendDeckRuntimeEffect;
  conditional_activation_destroy_own_cards: ConditionalActivationDestroyOwnCardsRuntimeEffect;
  conditional_activation_gain_chips: ConditionalActivationGainChipsRuntimeEffect;
  optional_spend_chip_destroy_own_cards: OptionalSpendChipDestroyOwnCardsRuntimeEffect;
}

export type ActivationEffectId =
  | "activation_add_power_per_controlled_card_type"
  | "activation_destroy_self_then_destroy_own_cards"
  | "activation_double_turn_power"
  | "activation_look_choose_reorder_legend_deck"
  | "conditional_activation_destroy_own_cards"
  | "conditional_activation_gain_chips"
  | "optional_spend_chip_destroy_own_cards";

export const activationEffectIds = [
  "activation_add_power_per_controlled_card_type",
  "activation_destroy_self_then_destroy_own_cards",
  "activation_double_turn_power",
  "activation_look_choose_reorder_legend_deck",
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
  requiredCondition: RequiredField<RuntimeEffectCondition>;
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
    requiredCondition,
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
        maxAmount: required((label, raw) =>
          typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0
            ? { ok: true, value: raw }
            : { ok: false, errors: [`${label} must be a non-negative integer`] }
        ),
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
    activation_look_choose_reorder_legend_deck: defineDecoder(
      "activation_look_choose_reorder_legend_deck",
      {
        effectId: required(
          literal("activation_look_choose_reorder_legend_deck")
        ),
        timing: required(literal("activation")),
        condition: requiredCondition,
        lookAmount: required(positiveInteger),
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
  const activationDestroySelfThenDestroyOwnCardsHandler: EffectRuntimeHandler<ActivationDestroySelfThenDestroyOwnCardsRuntimeEffect> =
    {
      effectId: "activation_destroy_self_then_destroy_own_cards",
      execute(state, player, effect, source, services) {
        const sourceCard =
          source.card ??
          getControlledCards(state, player).find(
            (card) => card.instanceId === source.cardInstanceId
          );
        if (sourceCard === undefined) {
          return {
            ok: false,
            error: `Cannot find source card ${source.cardInstanceId} for self-destruction`,
          };
        }

        const destroyCard = (card: CardInstance) =>
          destroyOwnedCard(
            state,
            player,
            card,
            effect.effectId,
            source,
            services
          );

        const sourceDestroyed = destroyCard(sourceCard);
        if (!sourceDestroyed.ok) return sourceDestroyed;

        const maximumAvailable = Math.min(effect.maxAmount, player.hand.length);
        if (effect.minAmount > maximumAvailable) {
          return {
            ok: false,
            error: `Cannot destroy at least ${effect.minAmount} hand cards`,
          };
        }
        const handOrder = [...player.hand];
        let lastSelectedHandOrderIndex = -1;

        const amountChoices: EffectChoice[] = Array.from(
          { length: maximumAvailable - effect.minAmount + 1 },
          (_, index) => ({
            choiceKind: "option" as const,
            choiceId: `amount_${effect.minAmount + index}`,
          })
        );
        const amountChoice = services.chooseEffectChoice(
          state,
          player,
          source,
          effect.effectId,
          amountChoices
        );
        const amount = Number.parseInt(
          amountChoice?.choiceId.slice("amount_".length) ??
            `amount_${effect.minAmount}`,
          10
        );
        if (!Number.isSafeInteger(amount) || amount < effect.minAmount) {
          return {
            ok: false,
            error: `Invalid hand destruction amount ${amountChoice?.choiceId ?? "undefined"}`,
          };
        }

        for (let index = 0; index < amount; index += 1) {
          const cardChoices: EffectChoice[] = handOrder
            .map((card, handIndex) => ({ card, handIndex }))
            .filter(
              ({ card, handIndex }) =>
                handIndex > lastSelectedHandOrderIndex &&
                player.hand.includes(card)
            )
            .map(({ card }) => ({
              choiceKind: "cardTarget" as const,
              choiceId: `destroy_${card.instanceId}`,
              cards: [card],
              amount: 1,
            }));
          const cardChoice = services.chooseEffectChoice(
            state,
            player,
            source,
            effect.effectId,
            cardChoices
          );
          if (cardChoice?.choiceKind !== "cardTarget") {
            return {
              ok: false,
              error: "A hand card must be selected for destruction",
            };
          }
          const target = cardChoice.cards[0];
          if (target === undefined || !player.hand.includes(target)) {
            return {
              ok: false,
              error: "Selected hand card is no longer available",
            };
          }
          lastSelectedHandOrderIndex = handOrder.indexOf(target);
          const targetDestroyed = destroyCard(target);
          if (!targetDestroyed.ok) return targetDestroyed;
        }

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
  const activationLookChooseReorderLegendDeckHandler: EffectRuntimeHandler<ActivationLookChooseReorderLegendDeckRuntimeEffect> =
    {
      effectId: "activation_look_choose_reorder_legend_deck",
      execute(state, player, effect, source, services) {
        const lookedCards = state.common.legendDeck.slice(
          0,
          Math.min(effect.lookAmount, state.common.legendDeck.length)
        );
        if (lookedCards.length === 0) return { ok: true };

        const cardChoices = (cards: readonly CardInstance[]): EffectChoice[] =>
          cards.map((card) => ({
            choiceKind: "cardTarget" as const,
            choiceId: `choose_${card.instanceId}`,
            cards: [card],
            amount: 1,
          }));
        const selectedChoice = services.chooseEffectChoice(
          state,
          player,
          source,
          effect.effectId,
          cardChoices(lookedCards)
        );
        if (selectedChoice?.choiceKind !== "cardTarget") {
          return {
            ok: false,
            error: "A legend deck card must be selected",
          };
        }
        const selected = selectedChoice.cards[0];
        if (selected === undefined || !lookedCards.includes(selected)) {
          return {
            ok: false,
            error: "Selected legend deck card is no longer available",
          };
        }

        const remaining = lookedCards.filter((card) => card !== selected);
        const returned: CardInstance[] = [];
        while (remaining.length > 0) {
          const orderChoice = services.chooseEffectChoice(
            state,
            player,
            source,
            effect.effectId,
            cardChoices(remaining)
          );
          if (orderChoice?.choiceKind !== "cardTarget") {
            return {
              ok: false,
              error: "A remaining legend deck card must be ordered",
            };
          }
          const card = orderChoice.cards[0];
          if (card === undefined) {
            return {
              ok: false,
              error: "A remaining legend deck card must be selected",
            };
          }
          const index = remaining.indexOf(card);
          if (index < 0) {
            return {
              ok: false,
              error: "Selected legend deck card is not available for ordering",
            };
          }
          returned.push(card);
          remaining.splice(index, 1);
        }

        const selectedMoved = services.moveCardToPlayerZone(
          state,
          selected,
          player,
          `${player.playerId}.deck`,
          effect.effectId,
          source,
          true
        );
        if (!selectedMoved) {
          return {
            ok: false,
            error: `Cannot move selected legend deck card ${selected.instanceId}`,
          };
        }

        for (const card of [...returned].reverse()) {
          const returnedCard = services.moveCardToZonePreservingOwner(
            state,
            player,
            card,
            "legendDeck",
            effect.effectId,
            source,
            true
          );
          if (!returnedCard) {
            return {
              ok: false,
              error: `Cannot return legend deck card ${card.instanceId}`,
            };
          }
        }

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
        return destroyOwnedCard(
          state,
          player,
          target,
          effect.effectId,
          source,
          services
        );
      },
    };
  const optionalSpendChipDestroyOwnCardsHandler: EffectRuntimeHandler<OptionalSpendChipDestroyOwnCardsRuntimeEffect> =
    {
      effectId: "optional_spend_chip_destroy_own_cards",
      execute(state, player, effect, source, services) {
        if (player.chips < effect.chipCost) return { ok: true };
        const candidates = effect.sourceZones.flatMap((zone) =>
          zone === "hand" ? player.hand : player.discard
        );
        if (candidates.length === 0) return { ok: true };

        const choices: EffectChoice[] = [
          { choiceKind: "option", choiceId: "decline" },
          ...candidates.map(
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
        if (target === undefined || !candidates.includes(target)) {
          return {
            ok: false,
            error: "Selected card is no longer available for destruction",
          };
        }

        const destroyed = destroyOwnedCard(
          state,
          player,
          target,
          effect.effectId,
          source,
          services
        );
        if (!destroyed.ok) return destroyed;

        player.chips -= effect.chipCost;
        recordGameEvent(state, {
          type: "effectCostPaid",
          playerId: player.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          effectId: effect.effectId,
          costId: "spend_chips",
          amount: effect.chipCost,
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
      handler: activationDestroySelfThenDestroyOwnCardsHandler,
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
      effectId: "activation_look_choose_reorder_legend_deck",
      decoder: bindRuntimeEffectDecoder(
        "activation_look_choose_reorder_legend_deck"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: activationLookChooseReorderLegendDeckHandler,
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
      handler: optionalSpendChipDestroyOwnCardsHandler,
    },
  ] as const;
}
