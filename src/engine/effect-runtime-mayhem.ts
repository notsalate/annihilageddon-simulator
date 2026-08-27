import { drawDeckCards } from "./deck-lifecycle.js";
import type { AttackInstance } from "./attack-resolution.js";
import {
  findCardOwner,
  getControlledOngoingCards,
  listLegendMarketCards,
  listMainMarketCards,
  movePhysicalCard,
  peekLegendDeckCard,
  removeTemporaryCardControl,
} from "./control-ledger.js";
import { recordDeckReshuffle, recordGameEvent } from "./event-recorder.js";
import { recordEffectChipsChanged } from "./effect-runtime-resources-draw.js";
import { gainLimpWandsFromCommonStack } from "./effect-runtime-special-card-stack.js";
import {
  chooseCardCombinations,
  destroyOwnedCard,
  destroyTopMainDeckCard,
} from "./effect-runtime-cards-ownership-choice.js";
import type {
  EffectChoice,
  EffectGameEnd,
  EffectExecutionResult,
  EffectRuntimeServices,
  EffectSourceContext,
  MayhemAttackPlanTarget,
} from "./effect-runtime-registry.js";
import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";
import type { RuntimeEffectDecoder } from "./runtime-effect-decoder.js";
import type {
  EffectTiming,
  MayhemHandRedrawOption,
  RuntimeEffectForId,
  RuntimeEffectId,
  RuntimeEffectSelectorTarget,
  RuntimeEffectTargetSelector,
} from "./runtime-effect.js";
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
import type { CardDefinition } from "./data.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";

export type MayhemEffectId =
  | "mayhem_attack"
  | "mayhem_attack_equal_highest_card_cost"
  | "mayhem_each_player_discard_half_controlled_permanents"
  | "mayhem_add_chips_to_main_market"
  | "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status"
  | "mayhem_each_player_choose_foe_gain_chips"
  | "mayhem_each_non_dingler_gain_chips"
  | "mayhem_each_player_gain_chips"
  | "mayhem_refresh_legend_market"
  | "mayhem_each_player_battle_highest_hand_cost"
  | "mayhem_each_player_choose_discard_hand_draw_or_take_damage"
  | "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none"
  | "mayhem_each_player_discard_deck_then_destroy_from_discard"
  | "mayhem_each_player_reveal_random_hand_card_destroy_or_pay_life_to_reroll"
  | "mayhem_each_player_optional_destroy_own_card"
  | "mayhem_each_player_optional_destroy_own_card_for_half_chips"
  | "mayhem_each_player_gain_chips_then_attack_for_current_chips"
  | "mayhem_each_player_reduce_life_to_gain_chips"
  | "mayhem_each_player_vote_dingler"
  | "mayhem_lowest_life_players_gain_dingler_and_set_to_max_life"
  | "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem"
  | "mega_mayhem_each_player_optional_destroy_own_cards"
  | "mega_mayhem_each_player_gain_limp_wands_to_hand"
  | "mega_mayhem_each_player_toggle_dingler"
  | "mega_mayhem_set_life";

export const mayhemEffectIds = [
  "mayhem_attack",
  "mayhem_attack_equal_highest_card_cost",
  "mayhem_each_player_discard_half_controlled_permanents",
  "mayhem_add_chips_to_main_market",
  "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status",
  "mayhem_each_player_choose_foe_gain_chips",
  "mayhem_each_non_dingler_gain_chips",
  "mayhem_each_player_gain_chips",
  "mayhem_refresh_legend_market",
  "mayhem_each_player_battle_highest_hand_cost",
  "mayhem_each_player_choose_discard_hand_draw_or_take_damage",
  "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none",
  "mayhem_each_player_discard_deck_then_destroy_from_discard",
  "mayhem_each_player_reveal_random_hand_card_destroy_or_pay_life_to_reroll",
  "mayhem_each_player_optional_destroy_own_card",
  "mayhem_each_player_optional_destroy_own_card_for_half_chips",
  "mayhem_each_player_gain_chips_then_attack_for_current_chips",
  "mayhem_each_player_reduce_life_to_gain_chips",
  "mayhem_each_player_vote_dingler",
  "mayhem_lowest_life_players_gain_dingler_and_set_to_max_life",
  "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem",
  "mega_mayhem_each_player_optional_destroy_own_cards",
  "mega_mayhem_each_player_gain_limp_wands_to_hand",
  "mega_mayhem_each_player_toggle_dingler",
  "mega_mayhem_set_life",
] as const satisfies readonly MayhemEffectId[];

type EffectWithOptionalTiming<Id extends string> = {
  effectId: Id;
  timing?: EffectTiming;
};

type TimedEffect<Id extends string, Timing extends EffectTiming> = {
  effectId: Id;
  timing: Timing;
};

type PositiveAmount = { amount: number };

export type MayhemAttackRuntimeEffect =
  EffectWithOptionalTiming<"mayhem_attack"> &
    PositiveAmount & {
      target: RuntimeEffectSelectorTarget & { selector: "allPlayers" };
    };
export type MayhemAttackEqualHighestCardCostRuntimeEffect = TimedEffect<
  "mayhem_attack_equal_highest_card_cost",
  "onMayhemResolve"
> & {
  targetSelector: "allPlayers";
  costSource: "legendMarket" | "targetHand";
};
export type MayhemEachPlayerDiscardHalfControlledPermanentsRuntimeEffect =
  TimedEffect<
    "mayhem_each_player_discard_half_controlled_permanents",
    "onMayhemResolve"
  > & {
    targetSelector: "eachPlayerClockwiseFromActive";
    chooser: "affectedPlayer";
  };
export type MayhemAddChipsToMainMarketRuntimeEffect = TimedEffect<
  "mayhem_add_chips_to_main_market",
  "onMayhemResolve"
> & {
  market: "mainMarket";
  amount: number;
};
export type MayhemEachDinglerChoosePayLifeOrChipToRemoveStatusRuntimeEffect =
  TimedEffect<
    "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status",
    "onMayhemResolve"
  > & {
    targetSelector: "eachPlayerClockwiseFromActive";
    chooser: "affectedPlayer";
    statusId: "dingler";
    lifeCost: number;
    chipCost: number;
  };
export type MayhemEachPlayerChooseFoeGainChipsRuntimeEffect = TimedEffect<
  "mayhem_each_player_choose_foe_gain_chips",
  "onMayhemResolve"
> & {
  targetSelector: "eachPlayerClockwiseFromActive";
  chipAmount: number;
};
export type MayhemEachNonDinglerGainChipsRuntimeEffect = TimedEffect<
  "mayhem_each_non_dingler_gain_chips",
  "onMayhemResolve"
> & {
  targetSelector: "eachPlayerClockwiseFromActive";
  chipAmount: number;
};
export type MayhemEachPlayerGainChipsRuntimeEffect = TimedEffect<
  "mayhem_each_player_gain_chips",
  "onMayhemResolve"
> & {
  targetSelector: "eachPlayerClockwiseFromActive";
  chipAmount: number;
};
export type MayhemRefreshLegendMarketRuntimeEffect = TimedEffect<
  "mayhem_refresh_legend_market",
  "onMayhemResolve"
> & {
  targetSize: number;
  destroyMegaMayhem?: true;
};
export type MayhemEachPlayerBattleHighestHandCostRuntimeEffect = TimedEffect<
  "mayhem_each_player_battle_highest_hand_cost",
  "onMayhemResolve"
> & {
  targetSelector: "eachPlayerClockwiseFromActive";
  chooser: "affectedPlayer";
  winnerDrawAmount: number;
};
export type MayhemEachPlayerChooseDiscardHandDrawOrTakeDamageRuntimeEffect =
  TimedEffect<
    "mayhem_each_player_choose_discard_hand_draw_or_take_damage",
    "onMayhemResolve"
  > & {
    targetSelector: "eachPlayerClockwiseFromActive";
    chooser: "affectedPlayer";
    options: [
      Extract<
        MayhemHandRedrawOption,
        { effectId: "discard_hand_then_draw_cards" }
      >,
      Extract<MayhemHandRedrawOption, { effectId: "take_damage" }>,
    ];
  };
export type MayhemEachPlayerDiscardTopDeckCardsChooseDestroyAllOrNoneRuntimeEffect =
  TimedEffect<
    "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none",
    "onMayhemResolve"
  > & {
    targetSelector: "eachPlayerClockwiseFromActive";
    chooser: "affectedPlayer";
    choice: "destroyBothOrDestroyNone";
    amount: number;
    sourceZone: "deck";
  };
export type MayhemEachPlayerDiscardDeckThenDestroyFromDiscardRuntimeEffect =
  TimedEffect<
    "mayhem_each_player_discard_deck_then_destroy_from_discard",
    "onMayhemResolve"
  > & {
    targetSelector: "eachPlayerClockwiseFromActive";
    chooser: "affectedPlayer";
    destroyAmount: number;
    destroySourceZone: "discard";
    discardSourceZone: "deck";
  };
export type MayhemEachPlayerRevealRandomHandCardDestroyOrPayLifeToRerollRuntimeEffect =
  TimedEffect<
    "mayhem_each_player_reveal_random_hand_card_destroy_or_pay_life_to_reroll",
    "onMayhemResolve"
  > & {
    targetSelector: "eachPlayerClockwiseFromActive";
    chooser: "affectedPlayer";
    lifeCost: number;
  };
export type MayhemEachPlayerOptionalDestroyOwnCardRuntimeEffect = TimedEffect<
  "mayhem_each_player_optional_destroy_own_card",
  "onMayhemResolve"
> & {
  targetSelector: "eachPlayerClockwiseFromActive";
  chooser: "affectedPlayer";
  lifeCost: number;
};
export type MayhemEachPlayerOptionalDestroyOwnCardForHalfChipsRuntimeEffect =
  TimedEffect<
    "mayhem_each_player_optional_destroy_own_card_for_half_chips",
    "onMayhemResolve"
  > & {
    targetSelector: "eachPlayerClockwiseFromActive";
    chooser: "affectedPlayer";
  };
export type MegaMayhemEachPlayerOptionalDestroyOwnCardsRuntimeEffect =
  TimedEffect<
    "mega_mayhem_each_player_optional_destroy_own_cards",
    "onMayhemResolve"
  > & {
    targetSelector: "eachPlayerClockwiseFromActive";
    chooser: "affectedPlayer";
  };
export type MayhemEachPlayerGainChipsThenAttackForCurrentChipsRuntimeEffect =
  TimedEffect<
    "mayhem_each_player_gain_chips_then_attack_for_current_chips",
    "onMayhemResolve"
  > & {
    targetSelector: "eachPlayerClockwiseFromActive";
    chipAmount: number;
  };
export type MayhemEachPlayerReduceLifeToGainChipsRuntimeEffect = TimedEffect<
  "mayhem_each_player_reduce_life_to_gain_chips",
  "onMayhemResolve"
> & {
  targetSelector: "eachPlayerClockwiseFromActive";
  chooser: "affectedPlayer";
  lifeTotal: number;
  chipAmount: number;
};
export type MayhemEachPlayerVoteDinglerRuntimeEffect = TimedEffect<
  "mayhem_each_player_vote_dingler",
  "onMayhemResolve"
> & {
  targetSelector: "eachPlayerClockwiseFromActive";
  chooser: "affectedPlayer";
  voteTargetSelector: "anyPlayer";
  statusId: "dingler";
};
export type MayhemLowestLifePlayersGainDinglerAndSetToMaxLifeRuntimeEffect =
  TimedEffect<
    "mayhem_lowest_life_players_gain_dingler_and_set_to_max_life",
    "onMayhemResolve"
  > & { statusId: "dingler" };
export type MegaMayhemEachPlayerDestroyTopMainDeckDeathIfMayhemRuntimeEffect =
  TimedEffect<
    "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem",
    "onMayhemResolve"
  > & {
    targetSelector: "eachPlayerClockwiseFromActive";
    deathCondition: {
      effectId: "destroyed_card_kind_is";
      cardKind: "mayhem";
    };
    destroyedCardSource: "mainDeck";
  };
export type MegaMayhemEachPlayerGainLimpWandsToHandRuntimeEffect = TimedEffect<
  "mega_mayhem_each_player_gain_limp_wands_to_hand",
  "onMayhemResolve"
> & {
  targetSelector: "eachPlayerClockwiseFromActive";
  destination: "hand";
  amount: number;
};
export type MegaMayhemEachPlayerToggleDinglerRuntimeEffect = TimedEffect<
  "mega_mayhem_each_player_toggle_dingler",
  "onMayhemResolve"
> & { targetSelector: "eachPlayerClockwiseFromActive" };
export type MegaMayhemSetLifeRuntimeEffect = TimedEffect<
  "mega_mayhem_set_life",
  "onMayhemResolve"
> & {
  targetSelector: "eachPlayerClockwiseFromActive";
  lifeTotal: number;
};

export interface MayhemEffectPayloadMap {
  mayhem_attack: MayhemAttackRuntimeEffect;
  mayhem_attack_equal_highest_card_cost: MayhemAttackEqualHighestCardCostRuntimeEffect;
  mayhem_each_player_discard_half_controlled_permanents: MayhemEachPlayerDiscardHalfControlledPermanentsRuntimeEffect;
  mayhem_add_chips_to_main_market: MayhemAddChipsToMainMarketRuntimeEffect;
  mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status: MayhemEachDinglerChoosePayLifeOrChipToRemoveStatusRuntimeEffect;
  mayhem_each_player_choose_foe_gain_chips: MayhemEachPlayerChooseFoeGainChipsRuntimeEffect;
  mayhem_each_non_dingler_gain_chips: MayhemEachNonDinglerGainChipsRuntimeEffect;
  mayhem_each_player_gain_chips: MayhemEachPlayerGainChipsRuntimeEffect;
  mayhem_refresh_legend_market: MayhemRefreshLegendMarketRuntimeEffect;
  mayhem_each_player_battle_highest_hand_cost: MayhemEachPlayerBattleHighestHandCostRuntimeEffect;
  mayhem_each_player_choose_discard_hand_draw_or_take_damage: MayhemEachPlayerChooseDiscardHandDrawOrTakeDamageRuntimeEffect;
  mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none: MayhemEachPlayerDiscardTopDeckCardsChooseDestroyAllOrNoneRuntimeEffect;
  mayhem_each_player_discard_deck_then_destroy_from_discard: MayhemEachPlayerDiscardDeckThenDestroyFromDiscardRuntimeEffect;
  mayhem_each_player_reveal_random_hand_card_destroy_or_pay_life_to_reroll: MayhemEachPlayerRevealRandomHandCardDestroyOrPayLifeToRerollRuntimeEffect;
  mayhem_each_player_optional_destroy_own_card: MayhemEachPlayerOptionalDestroyOwnCardRuntimeEffect;
  mayhem_each_player_optional_destroy_own_card_for_half_chips: MayhemEachPlayerOptionalDestroyOwnCardForHalfChipsRuntimeEffect;
  mayhem_each_player_gain_chips_then_attack_for_current_chips: MayhemEachPlayerGainChipsThenAttackForCurrentChipsRuntimeEffect;
  mayhem_each_player_reduce_life_to_gain_chips: MayhemEachPlayerReduceLifeToGainChipsRuntimeEffect;
  mayhem_each_player_vote_dingler: MayhemEachPlayerVoteDinglerRuntimeEffect;
  mayhem_lowest_life_players_gain_dingler_and_set_to_max_life: MayhemLowestLifePlayersGainDinglerAndSetToMaxLifeRuntimeEffect;
  mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem: MegaMayhemEachPlayerDestroyTopMainDeckDeathIfMayhemRuntimeEffect;
  mega_mayhem_each_player_optional_destroy_own_cards: MegaMayhemEachPlayerOptionalDestroyOwnCardsRuntimeEffect;
  mega_mayhem_each_player_gain_limp_wands_to_hand: MegaMayhemEachPlayerGainLimpWandsToHandRuntimeEffect;
  mega_mayhem_each_player_toggle_dingler: MegaMayhemEachPlayerToggleDinglerRuntimeEffect;
  mega_mayhem_set_life: MegaMayhemSetLifeRuntimeEffect;
}

export interface MayhemEffectDecoderTools {
  defineDecoder<Id extends MayhemEffectId>(
    effectId: Id,
    fields: ObjectFields<RuntimeEffectForId<Id>>
  ): RuntimeEffectDecoder<Id>;
  required<T>(decode: ValueDecoder<T>): RequiredField<T>;
  optional<T>(decode: ValueDecoder<T>): OptionalField<T>;
  literal<const Value extends string | number | boolean>(
    expected: Value
  ): ValueDecoder<Value>;
  positiveInteger: ValueDecoder<number>;
  nonNegativeInteger: ValueDecoder<number>;
  optionalTiming: OptionalField<EffectTiming>;
  selectorTarget<Selector extends RuntimeEffectTargetSelector>(
    selector: Selector
  ): ValueDecoder<{ selector: Selector }>;
  arrayOf<T>(decode: ValueDecoder<T>): ValueDecoder<T[]>;
  mayhemRedrawOption: ValueDecoder<MayhemHandRedrawOption>;
  decodeObject<T extends object>(
    label: string,
    raw: unknown,
    fields: ObjectFields<T>
  ): { ok: true; value: T } | { ok: false; errors: string[] };
}

export type MayhemEffectDecoders = {
  [Id in MayhemEffectId]: RuntimeEffectDecoder<Id>;
};

export function createMayhemEffectDecoders(
  tools: MayhemEffectDecoderTools
): MayhemEffectDecoders {
  const {
    defineDecoder,
    required,
    optional,
    literal,
    positiveInteger,
    nonNegativeInteger,
    optionalTiming,
    selectorTarget,
    arrayOf,
    mayhemRedrawOption,
    decodeObject,
  } = tools;
  return {
    mayhem_attack: defineDecoder("mayhem_attack", {
      effectId: required(literal("mayhem_attack")),
      timing: optionalTiming,
      amount: required(positiveInteger),
      target: required(selectorTarget("allPlayers")),
    }),
    mayhem_attack_equal_highest_card_cost: defineDecoder(
      "mayhem_attack_equal_highest_card_cost",
      {
        effectId: required(literal("mayhem_attack_equal_highest_card_cost")),
        timing: required(literal("onMayhemResolve")),
        targetSelector: required(literal("allPlayers")),
        costSource: required((label: string, raw: unknown) => {
          if (raw === "legendMarket" || raw === "targetHand") {
            return { ok: true, value: raw };
          }
          return {
            ok: false,
            errors: [`${label} must be legendMarket or targetHand`],
          };
        }),
      }
    ),
    mayhem_each_player_discard_half_controlled_permanents: defineDecoder(
      "mayhem_each_player_discard_half_controlled_permanents",
      {
        effectId: required(
          literal("mayhem_each_player_discard_half_controlled_permanents")
        ),
        timing: required(literal("onMayhemResolve")),
        targetSelector: required(literal("eachPlayerClockwiseFromActive")),
        chooser: required(literal("affectedPlayer")),
      }
    ),
    mayhem_add_chips_to_main_market: defineDecoder(
      "mayhem_add_chips_to_main_market",
      {
        effectId: required(literal("mayhem_add_chips_to_main_market")),
        timing: required(literal("onMayhemResolve")),
        market: required(literal("mainMarket")),
        amount: required(positiveInteger),
      }
    ),
    mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status: defineDecoder(
      "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status",
      {
        effectId: required(
          literal(
            "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status"
          )
        ),
        timing: required(literal("onMayhemResolve")),
        targetSelector: required(literal("eachPlayerClockwiseFromActive")),
        chooser: required(literal("affectedPlayer")),
        statusId: required(literal("dingler")),
        lifeCost: required(positiveInteger),
        chipCost: required(positiveInteger),
      }
    ),
    mayhem_each_player_choose_foe_gain_chips: defineDecoder(
      "mayhem_each_player_choose_foe_gain_chips",
      {
        effectId: required(literal("mayhem_each_player_choose_foe_gain_chips")),
        timing: required(literal("onMayhemResolve")),
        targetSelector: required(literal("eachPlayerClockwiseFromActive")),
        chipAmount: required(positiveInteger),
      }
    ),
    mayhem_each_non_dingler_gain_chips: defineDecoder(
      "mayhem_each_non_dingler_gain_chips",
      {
        effectId: required(literal("mayhem_each_non_dingler_gain_chips")),
        timing: required(literal("onMayhemResolve")),
        targetSelector: required(literal("eachPlayerClockwiseFromActive")),
        chipAmount: required(positiveInteger),
      }
    ),
    mayhem_each_player_gain_chips: defineDecoder(
      "mayhem_each_player_gain_chips",
      {
        effectId: required(literal("mayhem_each_player_gain_chips")),
        timing: required(literal("onMayhemResolve")),
        targetSelector: required(literal("eachPlayerClockwiseFromActive")),
        chipAmount: required(positiveInteger),
      }
    ),
    mayhem_refresh_legend_market: defineDecoder(
      "mayhem_refresh_legend_market",
      {
        effectId: required(literal("mayhem_refresh_legend_market")),
        timing: required(literal("onMayhemResolve")),
        targetSize: required(positiveInteger),
        destroyMegaMayhem: optional(literal(true)),
      }
    ),
    mayhem_each_player_battle_highest_hand_cost: defineDecoder(
      "mayhem_each_player_battle_highest_hand_cost",
      {
        effectId: required(
          literal("mayhem_each_player_battle_highest_hand_cost")
        ),
        timing: required(literal("onMayhemResolve")),
        targetSelector: required(literal("eachPlayerClockwiseFromActive")),
        chooser: required(literal("affectedPlayer")),
        winnerDrawAmount: required(nonNegativeInteger),
      }
    ),
    mayhem_each_player_choose_discard_hand_draw_or_take_damage: defineDecoder(
      "mayhem_each_player_choose_discard_hand_draw_or_take_damage",
      {
        effectId: required(
          literal("mayhem_each_player_choose_discard_hand_draw_or_take_damage")
        ),
        timing: required(literal("onMayhemResolve")),
        targetSelector: required(literal("eachPlayerClockwiseFromActive")),
        chooser: required(literal("affectedPlayer")),
        options: required((label, raw) => {
          const result = arrayOf(mayhemRedrawOption)(label, raw);
          if (!result.ok) return result;
          if (
            result.value.length !== 2 ||
            result.value[0]?.effectId !== "discard_hand_then_draw_cards" ||
            result.value[1]?.effectId !== "take_damage"
          ) {
            return {
              ok: false,
              errors: [`${label} must contain redraw then damage options`],
            };
          }
          return {
            ok: true,
            value: [result.value[0], result.value[1]] as [
              Extract<
                MayhemHandRedrawOption,
                { effectId: "discard_hand_then_draw_cards" }
              >,
              Extract<MayhemHandRedrawOption, { effectId: "take_damage" }>,
            ],
          };
        }),
      }
    ),
    mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none:
      defineDecoder(
        "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none",
        {
          effectId: required(
            literal(
              "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none"
            )
          ),
          timing: required(literal("onMayhemResolve")),
          targetSelector: required(literal("eachPlayerClockwiseFromActive")),
          chooser: required(literal("affectedPlayer")),
          choice: required(literal("destroyBothOrDestroyNone")),
          amount: required(nonNegativeInteger),
          sourceZone: required(literal("deck")),
        }
      ),
    mayhem_each_player_discard_deck_then_destroy_from_discard: defineDecoder(
      "mayhem_each_player_discard_deck_then_destroy_from_discard",
      {
        effectId: required(
          literal("mayhem_each_player_discard_deck_then_destroy_from_discard")
        ),
        timing: required(literal("onMayhemResolve")),
        targetSelector: required(literal("eachPlayerClockwiseFromActive")),
        chooser: required(literal("affectedPlayer")),
        destroyAmount: required(positiveInteger),
        destroySourceZone: required(literal("discard")),
        discardSourceZone: required(literal("deck")),
      }
    ),
    mayhem_each_player_reveal_random_hand_card_destroy_or_pay_life_to_reroll:
      defineDecoder(
        "mayhem_each_player_reveal_random_hand_card_destroy_or_pay_life_to_reroll",
        {
          effectId: required(
            literal(
              "mayhem_each_player_reveal_random_hand_card_destroy_or_pay_life_to_reroll"
            )
          ),
          timing: required(literal("onMayhemResolve")),
          targetSelector: required(literal("eachPlayerClockwiseFromActive")),
          chooser: required(literal("affectedPlayer")),
          lifeCost: required(positiveInteger),
        }
      ),
    mayhem_each_player_optional_destroy_own_card: defineDecoder(
      "mayhem_each_player_optional_destroy_own_card",
      {
        effectId: required(
          literal("mayhem_each_player_optional_destroy_own_card")
        ),
        timing: required(literal("onMayhemResolve")),
        targetSelector: required(literal("eachPlayerClockwiseFromActive")),
        chooser: required(literal("affectedPlayer")),
        lifeCost: required(positiveInteger),
      }
    ),
    mayhem_each_player_optional_destroy_own_card_for_half_chips: defineDecoder(
      "mayhem_each_player_optional_destroy_own_card_for_half_chips",
      {
        effectId: required(
          literal("mayhem_each_player_optional_destroy_own_card_for_half_chips")
        ),
        timing: required(literal("onMayhemResolve")),
        targetSelector: required(literal("eachPlayerClockwiseFromActive")),
        chooser: required(literal("affectedPlayer")),
      }
    ),
    mayhem_each_player_gain_chips_then_attack_for_current_chips: defineDecoder(
      "mayhem_each_player_gain_chips_then_attack_for_current_chips",
      {
        effectId: required(
          literal("mayhem_each_player_gain_chips_then_attack_for_current_chips")
        ),
        timing: required(literal("onMayhemResolve")),
        targetSelector: required(literal("eachPlayerClockwiseFromActive")),
        chipAmount: required(positiveInteger),
      }
    ),
    mayhem_each_player_reduce_life_to_gain_chips: defineDecoder(
      "mayhem_each_player_reduce_life_to_gain_chips",
      {
        effectId: required(
          literal("mayhem_each_player_reduce_life_to_gain_chips")
        ),
        timing: required(literal("onMayhemResolve")),
        targetSelector: required(literal("eachPlayerClockwiseFromActive")),
        chooser: required(literal("affectedPlayer")),
        lifeTotal: required(positiveInteger),
        chipAmount: required(positiveInteger),
      }
    ),
    mayhem_each_player_vote_dingler: defineDecoder(
      "mayhem_each_player_vote_dingler",
      {
        effectId: required(literal("mayhem_each_player_vote_dingler")),
        timing: required(literal("onMayhemResolve")),
        targetSelector: required(literal("eachPlayerClockwiseFromActive")),
        chooser: required(literal("affectedPlayer")),
        voteTargetSelector: required(literal("anyPlayer")),
        statusId: required(literal("dingler")),
      }
    ),
    mayhem_lowest_life_players_gain_dingler_and_set_to_max_life: defineDecoder(
      "mayhem_lowest_life_players_gain_dingler_and_set_to_max_life",
      {
        effectId: required(
          literal("mayhem_lowest_life_players_gain_dingler_and_set_to_max_life")
        ),
        timing: required(literal("onMayhemResolve")),
        statusId: required(literal("dingler")),
      }
    ),
    mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem:
      defineDecoder(
        "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem",
        {
          effectId: required(
            literal(
              "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem"
            )
          ),
          timing: required(literal("onMayhemResolve")),
          targetSelector: required(literal("eachPlayerClockwiseFromActive")),
          deathCondition: required((label, raw) =>
            decodeObject(label, raw, {
              effectId: required(literal("destroyed_card_kind_is")),
              cardKind: required(literal("mayhem")),
            })
          ),
          destroyedCardSource: required(literal("mainDeck")),
        }
      ),
    mega_mayhem_each_player_optional_destroy_own_cards: defineDecoder(
      "mega_mayhem_each_player_optional_destroy_own_cards",
      {
        effectId: required(
          literal("mega_mayhem_each_player_optional_destroy_own_cards")
        ),
        timing: required(literal("onMayhemResolve")),
        targetSelector: required(literal("eachPlayerClockwiseFromActive")),
        chooser: required(literal("affectedPlayer")),
      }
    ),
    mega_mayhem_each_player_gain_limp_wands_to_hand: defineDecoder(
      "mega_mayhem_each_player_gain_limp_wands_to_hand",
      {
        effectId: required(
          literal("mega_mayhem_each_player_gain_limp_wands_to_hand")
        ),
        timing: required(literal("onMayhemResolve")),
        targetSelector: required(literal("eachPlayerClockwiseFromActive")),
        destination: required(literal("hand")),
        amount: required(positiveInteger),
      }
    ),
    mega_mayhem_each_player_toggle_dingler: defineDecoder(
      "mega_mayhem_each_player_toggle_dingler",
      {
        effectId: required(literal("mega_mayhem_each_player_toggle_dingler")),
        timing: required(literal("onMayhemResolve")),
        targetSelector: required(literal("eachPlayerClockwiseFromActive")),
      }
    ),
    mega_mayhem_set_life: defineDecoder("mega_mayhem_set_life", {
      effectId: required(literal("mega_mayhem_set_life")),
      timing: required(literal("onMayhemResolve")),
      targetSelector: required(literal("eachPlayerClockwiseFromActive")),
      lifeTotal: required(nonNegativeInteger),
    }),
  };
}

function sumHandCost(state: GameState, player: PlayerState): number {
  return player.hand.reduce((total, card) => {
    const cost = state.cardDefinitions.get(card.definitionId)?.engine.cost;
    return total + (typeof cost === "number" ? cost : 0);
  }, 0);
}

function recordMayhemDecisionPhaseStarted(
  state: GameState,
  effectId: MayhemEffectId,
  source: EffectSourceContext
): void {
  recordGameEvent(state, {
    type: "mayhemDecisionPhaseStarted",
    playerId: source.playerId,
    ...(source.attackId === undefined ? {} : { attackId: source.attackId }),
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    sourceType: source.sourceType,
  });
}

function recordMayhemResolutionPhaseStarted(
  state: GameState,
  effectId: MayhemEffectId,
  source: EffectSourceContext
): void {
  recordGameEvent(state, {
    type: "mayhemResolutionPhaseStarted",
    playerId: source.playerId,
    ...(source.attackId === undefined ? {} : { attackId: source.attackId }),
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    sourceType: source.sourceType,
  });
}

function resolveMayhemAttackDefenseDecision(
  state: GameState,
  targetPlayer: PlayerState,
  effectId: MayhemEffectId,
  attackInstance: AttackInstance,
  services: EffectRuntimeServices
):
  | { ok: true; avoided: boolean; gameEnd?: never }
  | { ok: true; gameEnd: EffectGameEnd; avoided?: never }
  | { ok: false; error: string } {
  recordGameEvent(state, {
    type: "mayhemDecisionStarted",
    playerId: attackInstance.source.playerId,
    attackId: attackInstance.attackId,
    targetPlayerId: targetPlayer.playerId,
    cardInstanceId: attackInstance.source.cardInstanceId,
    definitionId: attackInstance.source.definitionId,
    effectId,
    sourceType: attackInstance.source.sourceType,
  });
  const defenseResult = services.resolveDefenseWindow(state, targetPlayer, {
    kind: "nonredirectable",
    attackId: attackInstance.attackId,
    source: attackInstance.source,
    defenseUsage: attackInstance.defenseUsage,
  });
  if (!defenseResult.ok) return defenseResult;
  if (defenseResult.gameEnd !== undefined) {
    return { ok: true, gameEnd: defenseResult.gameEnd };
  }
  const avoided = defenseResult.avoided;
  if (avoided) {
    recordGameEvent(state, {
      type: "attackAvoided",
      playerId: targetPlayer.playerId,
      attackId: attackInstance.attackId,
      targetPlayerId: targetPlayer.playerId,
      cardInstanceId: attackInstance.source.cardInstanceId,
      definitionId: attackInstance.source.definitionId,
      effectId,
      sourceType: attackInstance.source.sourceType,
    });
  }
  return { ok: true, avoided };
}

function collectMayhemAttackDefenseDecisions(
  state: GameState,
  targets: readonly PlayerState[],
  effectId: MayhemEffectId,
  source: EffectSourceContext,
  services: EffectRuntimeServices
):
  | {
      ok: true;
      decisions: Array<{ player: PlayerState; avoided: boolean }>;
      attackInstance: AttackInstance;
      source: EffectSourceContext;
      gameEnd?: never;
    }
  | { ok: true; gameEnd: EffectGameEnd; decisions?: never }
  | { ok: false; error: string } {
  const decisions: Array<{ player: PlayerState; avoided: boolean }> = [];
  const sourcePlayer = state.players.find(
    (player) => player.playerId === source.playerId
  );
  if (sourcePlayer === undefined) {
    return {
      ok: false,
      error: `Missing Mayhem source player ${source.playerId}`,
    };
  }
  const attackInstance = services.openAttackInstance(
    state,
    sourcePlayer,
    source
  );
  recordMayhemDecisionPhaseStarted(state, effectId, attackInstance.source);

  for (const targetPlayer of targets) {
    const decisionResult = resolveMayhemAttackDefenseDecision(
      state,
      targetPlayer,
      effectId,
      attackInstance,
      services
    );
    if (!decisionResult.ok) {
      return services.closeAttackInstance(
        state,
        attackInstance,
        decisionResult
      );
    }
    if (decisionResult.gameEnd !== undefined) {
      return services.closeAttackInstance(state, attackInstance, {
        ok: true,
        gameEnd: decisionResult.gameEnd,
      });
    }
    decisions.push({ player: targetPlayer, avoided: decisionResult.avoided });
  }

  recordMayhemResolutionPhaseStarted(state, effectId, attackInstance.source);
  return { ok: true, decisions, attackInstance, source: attackInstance.source };
}

const mayhemAddChipsToMainMarketHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_add_chips_to_main_market">
> = {
  effectId: "mayhem_add_chips_to_main_market",
  execute(state, player, effect, source) {
    for (const card of listMainMarketCards(state)) {
      card.marketChips += effect.amount;
      recordGameEvent(state, {
        type: "marketChipAdded",
        playerId: player.playerId,
        sourceType: source.sourceType,
        cardInstanceId: card.instanceId,
        definitionId: card.definitionId,
        amount: effect.amount,
      });
    }
    return { ok: true };
  },
};

const megaMayhemSetLifeHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mega_mayhem_set_life">
> = {
  effectId: "mega_mayhem_set_life",
  execute(state, player, effect, source, services) {
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      const lifeChange = services.setPlayerLife(
        state,
        targetPlayer,
        effect.lifeTotal
      );
      recordGameEvent(state, {
        type: "effectLifeSet",
        playerId: player.playerId,
        targetPlayerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: effect.effectId,
        amount: effect.lifeTotal,
        targetLifeBefore: lifeChange.lifeBefore,
        targetLifeAfter: lifeChange.lifeAfter,
        sourceType: source.sourceType,
      });
      if (lifeChange.lifeAfter < 1) {
        const deathResult = services.resolvePlayerDeath(state, targetPlayer);
        if (!deathResult.ok || deathResult.gameEnd !== undefined) {
          return deathResult;
        }
      }
    }
    return { ok: true };
  },
};

const megaMayhemEachPlayerToggleDinglerHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mega_mayhem_each_player_toggle_dingler">
> = {
  effectId: "mega_mayhem_each_player_toggle_dingler",
  execute(state, _player, effect, source, services) {
    const decisionResult = collectMayhemAttackDefenseDecisions(
      state,
      services.getPlayersInActiveOrder(state),
      effect.effectId,
      source,
      services
    );
    if (!decisionResult.ok) return decisionResult;
    if (decisionResult.gameEnd !== undefined) {
      return { ok: true, gameEnd: decisionResult.gameEnd };
    }
    const attackInstance = decisionResult.attackInstance;
    const attackSource = decisionResult.source;
    for (const { player: targetPlayer, avoided } of decisionResult.decisions) {
      if (avoided) continue;
      const result = services.hasDinglerStatus(targetPlayer)
        ? services.removeDinglerStatus(
            state,
            targetPlayer,
            effect.effectId,
            attackSource
          )
        : services.gainDinglerStatus(
            state,
            targetPlayer,
            effect.effectId,
            attackSource
          );
      if (!result.ok || result.gameEnd !== undefined) {
        return services.closeAttackInstance(state, attackInstance, result);
      }
    }
    return services.closeAttackInstance(state, attackInstance, { ok: true });
  },
};

const megaMayhemEachPlayerDestroyTopMainDeckHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem">
> = {
  effectId: "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem",
  execute(state, _player, effect, source, services) {
    const decisionResult = collectMayhemAttackDefenseDecisions(
      state,
      services.getPlayersInActiveOrder(state),
      effect.effectId,
      source,
      services
    );
    if (!decisionResult.ok) return decisionResult;
    if (decisionResult.gameEnd !== undefined) {
      return { ok: true, gameEnd: decisionResult.gameEnd };
    }
    const attackInstance = decisionResult.attackInstance;
    const attackSource = decisionResult.source;
    let gameEnd: EffectGameEnd | undefined;
    for (const { player: targetPlayer, avoided } of decisionResult.decisions) {
      if (avoided) continue;
      const destroyResult = destroyTopMainDeckCard(
        state,
        targetPlayer,
        effect.effectId,
        attackSource,
        services
      );
      if (!destroyResult.ok) {
        return services.closeAttackInstance(
          state,
          attackInstance,
          destroyResult
        );
      }
      const destroyedCard = destroyResult.card;
      if (destroyedCard === undefined) continue;
      const destroyedDefinition = state.cardDefinitions.get(
        destroyedCard.definitionId
      );
      if (destroyedDefinition?.engine.cardKind !== "mayhem") continue;

      const deathResult = services.resolvePlayerDeath(
        state,
        targetPlayer,
        attackSource
      );
      if (!deathResult.ok) {
        return services.closeAttackInstance(state, attackInstance, deathResult);
      }
      if (deathResult.gameEnd !== undefined && gameEnd === undefined) {
        gameEnd = deathResult.gameEnd;
      }
    }
    return services.closeAttackInstance(
      state,
      attackInstance,
      gameEnd === undefined ? { ok: true } : { ok: true, gameEnd }
    );
  },
};

const mayhemEachPlayerDiscardTopDeckDestroyHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none">
> = {
  effectId:
    "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none",
  execute(state, _player, effect, source, services) {
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      const discardedCards = services.discardTopDeckCards(
        state,
        targetPlayer,
        effect.amount
      );
      if (discardedCards.length === 0) continue;
      const choice = services.chooseEffectChoice(
        state,
        targetPlayer,
        source,
        effect.effectId,
        [
          { choiceKind: "option", choiceId: "destroy_both" },
          { choiceKind: "option", choiceId: "destroy_none" },
        ]
      );
      if (choice?.choiceId === "destroy_none") continue;
      for (const discardedCard of discardedCards) {
        const destination = services.getDestroyDestination(
          state,
          discardedCard
        );
        if (!destination.ok) return destination;
        if (
          !services.moveCardToZonePreservingOwner(
            state,
            targetPlayer,
            discardedCard,
            destination.zone,
            destination.zoneName,
            effect.effectId,
            source
          )
        ) {
          return {
            ok: false,
            error: `Cannot destroy discarded card ${discardedCard.instanceId}`,
          };
        }
      }
      recordGameEvent(state, {
        type: "mayhemDiscardedTopDeckCardsDestroyed",
        playerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: effect.effectId,
        amount: discardedCards.length,
        sourceType: source.sourceType,
      });
    }
    return { ok: true };
  },
};

const mayhemEachPlayerDiscardDeckDestroyHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_each_player_discard_deck_then_destroy_from_discard">
> = {
  effectId: "mayhem_each_player_discard_deck_then_destroy_from_discard",
  execute(state, _player, effect, source, services) {
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      const discardedCount = targetPlayer.deck.length;
      services.discardTopDeckCards(state, targetPlayer, discardedCount);
      const discardChoices = targetPlayer.discard.map(
        (card): EffectChoice => ({
          choiceKind: "cardTarget",
          choiceId: `destroy_${card.instanceId}`,
          cards: [card],
          amount: 1,
        })
      );
      const choice =
        discardChoices.length === 0
          ? undefined
          : services.chooseEffectChoice(
              state,
              targetPlayer,
              source,
              effect.effectId,
              discardChoices
            );
      if (
        discardChoices.length > 0 &&
        (choice?.choiceKind !== "cardTarget" ||
          !discardChoices.some(
            (candidate) => candidate.choiceId === choice.choiceId
          ))
      ) {
        return {
          ok: false,
          error:
            "Mayhem discard resolution requires choosing one card to destroy",
        };
      }
      const destroyTarget =
        choice?.choiceKind === "cardTarget" ? choice.cards[0] : undefined;
      if (discardChoices.length > 0 && destroyTarget === undefined) {
        return {
          ok: false,
          error:
            "Mayhem discard resolution requires choosing one card to destroy",
        };
      }
      if (destroyTarget !== undefined) {
        const destroyed = destroyOwnedCard(
          state,
          targetPlayer,
          destroyTarget,
          effect.effectId,
          source,
          services
        );
        if (!destroyed.ok) return destroyed;
      }
      recordGameEvent(state, {
        type: "mayhemDeckDiscardedThenDiscardCardDestroyed",
        playerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        ...(destroyTarget === undefined
          ? {}
          : {
              targetCardInstanceId: destroyTarget.instanceId,
              targetDefinitionId: destroyTarget.definitionId,
            }),
        effectId: effect.effectId,
        amount: discardedCount,
        sourceType: source.sourceType,
      });
    }
    return { ok: true };
  },
};

const mayhemEachPlayerRevealRandomHandCardHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_each_player_reveal_random_hand_card_destroy_or_pay_life_to_reroll">
> = {
  effectId:
    "mayhem_each_player_reveal_random_hand_card_destroy_or_pay_life_to_reroll",
  execute(state, _player, effect, source, services) {
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      while (targetPlayer.hand.length > 0) {
        const revealedCard =
          targetPlayer.hand[state.rng.nextInt(targetPlayer.hand.length)];
        if (revealedCard === undefined) break;

        recordGameEvent(state, {
          type: "effectCardRevealed",
          playerId: targetPlayer.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          targetCardInstanceId: revealedCard.instanceId,
          targetDefinitionId: revealedCard.definitionId,
          effectId: effect.effectId,
          sourceType: source.sourceType,
        });

        const choices: EffectChoice[] = [
          {
            choiceKind: "cardTarget",
            choiceId: `destroy_${revealedCard.instanceId}`,
            cards: [revealedCard],
            amount: 1,
          },
        ];
        if (targetPlayer.life.current > effect.lifeCost) {
          choices.push({ choiceKind: "option", choiceId: "reroll" });
        }
        const choice = services.chooseEffectChoice(
          state,
          targetPlayer,
          source,
          effect.effectId,
          choices
        );
        if (choice?.choiceId === "reroll") {
          services.setPlayerLife(
            state,
            targetPlayer,
            targetPlayer.life.current - effect.lifeCost
          );
          recordGameEvent(state, {
            type: "effectCostPaid",
            playerId: targetPlayer.playerId,
            cardInstanceId: source.cardInstanceId,
            definitionId: source.definitionId,
            effectId: effect.effectId,
            costId: "pay_life",
            amount: effect.lifeCost,
            sourceType: source.sourceType,
          });
          continue;
        }

        const destroyed = destroyOwnedCard(
          state,
          targetPlayer,
          revealedCard,
          effect.effectId,
          source,
          services
        );
        if (!destroyed.ok) return destroyed;
        break;
      }
    }
    return { ok: true };
  },
};

type MayhemDestroyCost =
  | { kind: "pay_life"; amount: number }
  | { kind: "spend_chips"; amount: number };

function chooseAndDestroyMayhemCard(
  state: GameState,
  targetPlayer: PlayerState,
  source: EffectSourceContext,
  effectId: RuntimeEffectId,
  candidates: readonly CardInstance[],
  services: EffectRuntimeServices,
  cost?: MayhemDestroyCost
): EffectExecutionResult {
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
    targetPlayer,
    source,
    effectId,
    choices
  );
  if (choice?.choiceKind !== "cardTarget") return { ok: true };
  const selectedId = choice.cards[0]?.instanceId;
  const selected = candidates.find((card) => card.instanceId === selectedId);
  if (selected === undefined) {
    return {
      ok: false,
      error: "Selected Mayhem destruction card is no longer available",
    };
  }
  const destroyed = destroyOwnedCard(
    state,
    targetPlayer,
    selected,
    effectId,
    source,
    services
  );
  if (!destroyed.ok) return destroyed;
  if (cost !== undefined && cost.amount > 0) {
    if (cost.kind === "pay_life") {
      targetPlayer.life.current -= cost.amount;
    } else {
      targetPlayer.chips -= cost.amount;
    }
    recordGameEvent(state, {
      type: "effectCostPaid",
      playerId: targetPlayer.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId,
      costId: cost.kind,
      amount: cost.amount,
      sourceType: source.sourceType,
    });
  }
  return { ok: true };
}

function executeMayhemOptionalDestroyOwnCards(
  state: GameState,
  source: EffectSourceContext,
  effectId: RuntimeEffectId,
  services: EffectRuntimeServices,
  mode: "dinglerPaysLife" | "halfChips" | "nonDinglerMayDestroyBothZones",
  lifeCost = 0
): EffectExecutionResult {
  for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
    const combinedCandidates = [...targetPlayer.hand, ...targetPlayer.discard];
    if (combinedCandidates.length === 0) continue;

    if (mode === "nonDinglerMayDestroyBothZones") {
      if (services.hasDinglerStatus(targetPlayer)) {
        const result = chooseAndDestroyMayhemCard(
          state,
          targetPlayer,
          source,
          effectId,
          combinedCandidates,
          services
        );
        if (!result.ok) return result;
        continue;
      }

      const handResult = chooseAndDestroyMayhemCard(
        state,
        targetPlayer,
        source,
        effectId,
        [...targetPlayer.hand],
        services
      );
      if (!handResult.ok) return handResult;
      const discardResult = chooseAndDestroyMayhemCard(
        state,
        targetPlayer,
        source,
        effectId,
        [...targetPlayer.discard],
        services
      );
      if (!discardResult.ok) return discardResult;
      continue;
    }

    let cost: MayhemDestroyCost | undefined;
    if (mode === "dinglerPaysLife" && services.hasDinglerStatus(targetPlayer)) {
      if (targetPlayer.life.current - lifeCost < 1) continue;
      cost = { kind: "pay_life", amount: lifeCost };
    } else if (mode === "halfChips") {
      const amount = Math.floor(targetPlayer.chips / 2);
      if (amount <= 0) continue;
      cost = {
        kind: "spend_chips",
        amount,
      };
    }
    const result = chooseAndDestroyMayhemCard(
      state,
      targetPlayer,
      source,
      effectId,
      combinedCandidates,
      services,
      cost
    );
    if (!result.ok) return result;
  }
  return { ok: true };
}

const mayhemEachPlayerOptionalDestroyOwnCardHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_each_player_optional_destroy_own_card">
> = {
  effectId: "mayhem_each_player_optional_destroy_own_card",
  execute(state, _player, effect, source, services) {
    return executeMayhemOptionalDestroyOwnCards(
      state,
      source,
      effect.effectId,
      services,
      "dinglerPaysLife",
      effect.lifeCost
    );
  },
};

const mayhemEachPlayerOptionalDestroyOwnCardForHalfChipsHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_each_player_optional_destroy_own_card_for_half_chips">
> = {
  effectId: "mayhem_each_player_optional_destroy_own_card_for_half_chips",
  execute(state, _player, _effect, source, services) {
    return executeMayhemOptionalDestroyOwnCards(
      state,
      source,
      "mayhem_each_player_optional_destroy_own_card_for_half_chips",
      services,
      "halfChips"
    );
  },
};

const megaMayhemEachPlayerOptionalDestroyOwnCardsHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mega_mayhem_each_player_optional_destroy_own_cards">
> = {
  effectId: "mega_mayhem_each_player_optional_destroy_own_cards",
  execute(state, _player, _effect, source, services) {
    return executeMayhemOptionalDestroyOwnCards(
      state,
      source,
      "mega_mayhem_each_player_optional_destroy_own_cards",
      services,
      "nonDinglerMayDestroyBothZones"
    );
  },
};

const mayhemEachPlayerHandRedrawChoiceHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_each_player_choose_discard_hand_draw_or_take_damage">
> = {
  effectId: "mayhem_each_player_choose_discard_hand_draw_or_take_damage",
  execute(state, _player, effect, source, services) {
    const [redrawOption, damageOption] = effect.options;
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      const choice = services.chooseEffectChoice(
        state,
        targetPlayer,
        source,
        effect.effectId,
        [
          { choiceKind: "option", choiceId: "discard_hand_then_draw_cards" },
          { choiceKind: "option", choiceId: "take_damage" },
        ]
      );
      const selectedChoiceId =
        choice?.choiceId ?? "discard_hand_then_draw_cards";
      if (selectedChoiceId === "take_damage") {
        const damageResult = services.dealDamage(
          state,
          targetPlayer,
          targetPlayer,
          damageOption.amount,
          effect.effectId,
          source,
          { kind: "ownerless" }
        );
        if (!("damageDealt" in damageResult)) return damageResult;
        continue;
      }
      const discardedCount = targetPlayer.hand.length;
      targetPlayer.discard.push(...targetPlayer.hand.splice(0));
      const drawResult = drawDeckCards(
        targetPlayer.deck,
        targetPlayer.discard,
        redrawOption.drawAmount,
        state.rng,
        () => recordDeckReshuffle(state, targetPlayer.playerId)
      );
      targetPlayer.hand.push(...drawResult.cards);
      recordGameEvent(state, {
        type: "mayhemHandDiscardedAndRedrawn",
        playerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: effect.effectId,
        amount: discardedCount + drawResult.cards.length,
        sourceType: source.sourceType,
      });
    }
    return { ok: true };
  },
};

const mayhemEachPlayerReduceLifeToGainChipsHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_each_player_reduce_life_to_gain_chips">
> = {
  effectId: "mayhem_each_player_reduce_life_to_gain_chips",
  execute(state, _player, effect, source, services) {
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      if (targetPlayer.life.current <= effect.lifeTotal) continue;
      const choice = services.chooseEffectChoice(
        state,
        targetPlayer,
        source,
        effect.effectId,
        [
          { choiceKind: "option", choiceId: "reduce_life_gain_chips" },
          { choiceKind: "option", choiceId: "pass" },
        ]
      );
      if (choice?.choiceId !== "reduce_life_gain_chips") continue;
      const lifeChange = services.setPlayerLife(
        state,
        targetPlayer,
        effect.lifeTotal
      );
      const chipsBefore = targetPlayer.chips;
      targetPlayer.chips += effect.chipAmount;
      recordGameEvent(state, {
        type: "effectLifeSet",
        playerId: targetPlayer.playerId,
        targetPlayerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: effect.effectId,
        amount: effect.lifeTotal,
        targetLifeBefore: lifeChange.lifeBefore,
        targetLifeAfter: lifeChange.lifeAfter,
        sourceType: source.sourceType,
      });
      recordEffectChipsChanged(
        state,
        targetPlayer,
        source,
        effect.effectId,
        chipsBefore,
        targetPlayer.chips
      );
    }
    return { ok: true };
  },
};

const mayhemEachNonDinglerGainChipsHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_each_non_dingler_gain_chips">
> = {
  effectId: "mayhem_each_non_dingler_gain_chips",
  execute(state, _player, effect, source, services) {
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      if (services.hasDinglerStatus(targetPlayer)) continue;
      const chipsBefore = targetPlayer.chips;
      targetPlayer.chips += effect.chipAmount;
      recordEffectChipsChanged(
        state,
        targetPlayer,
        source,
        effect.effectId,
        chipsBefore,
        targetPlayer.chips
      );
    }
    return { ok: true };
  },
};

const mayhemEachPlayerGainChipsHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_each_player_gain_chips">
> = {
  effectId: "mayhem_each_player_gain_chips",
  execute(state, _player, effect, source, services) {
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      const chipsBefore = targetPlayer.chips;
      targetPlayer.chips += effect.chipAmount;
      recordEffectChipsChanged(
        state,
        targetPlayer,
        source,
        effect.effectId,
        chipsBefore,
        targetPlayer.chips
      );
    }
    return { ok: true };
  },
};

const mayhemRefreshLegendMarketHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_refresh_legend_market">
> = {
  effectId: "mayhem_refresh_legend_market",
  execute(state, player, effect, source, services) {
    for (const card of [...listLegendMarketCards(state)]) {
      const moved = movePhysicalCard(
        state,
        card.instanceId,
        "destroyedPile",
        "back",
        "legendMarket"
      );
      if (!moved.ok) {
        return { ok: false, error: moved.reason };
      }
      recordGameEvent(state, {
        type: "effectCardDestroyed",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        targetCardInstanceId: card.instanceId,
        targetDefinitionId: card.definitionId,
        effectId: effect.effectId,
        sourceType: source.sourceType,
      });
    }

    while (listLegendMarketCards(state).length < effect.targetSize) {
      const card = peekLegendDeckCard(state);
      if (card === undefined) {
        return { ok: true };
      }
      const definition = state.cardDefinitions.get(card.definitionId);
      if (definition === undefined) {
        return {
          ok: false,
          error: `Missing legend definition ${card.definitionId}`,
        };
      }
      if (definition.engine.cardKind === "megaMayhem") {
        let gameEnd: EffectGameEnd | undefined;
        if (effect.destroyMegaMayhem !== true) {
          recordGameEvent(state, {
            type: "marketEventCardOpened",
            playerId: player.playerId,
            sourceType: source.sourceType,
            destinationZone: "legendMarket",
            cardInstanceId: card.instanceId,
            definitionId: card.definitionId,
          });
          const mayhemResult = services.executeMayhemEffects(
            state,
            player,
            definition,
            {
              sourceType: "card",
              runtimeMode: state.runtimeMode,
              playerId: player.playerId,
              cardInstanceId: card.instanceId,
              definitionId: card.definitionId,
            }
          );
          if (!mayhemResult.ok) {
            return mayhemResult;
          }
          gameEnd = mayhemResult.gameEnd;
          if (gameEnd === undefined) {
            recordGameEvent(state, {
              type: "mayhemResolved",
              playerId: player.playerId,
              cardInstanceId: card.instanceId,
              definitionId: card.definitionId,
            });
          }
        }
        const moved = movePhysicalCard(
          state,
          card.instanceId,
          "destroyedMegaMayhem",
          "back",
          "legendDeck"
        );
        if (!moved.ok) {
          return { ok: false, error: moved.reason };
        }
        if (gameEnd !== undefined) {
          return { ok: true, gameEnd };
        }
        recordGameEvent(state, {
          type: "megaMayhemDestroyed",
          playerId: player.playerId,
          sourceType: source.sourceType,
          destinationZone: "legendMarket",
          cardInstanceId: card.instanceId,
          definitionId: card.definitionId,
        });
        continue;
      }
      const moved = movePhysicalCard(
        state,
        card.instanceId,
        "legendMarket",
        "back",
        "legendDeck"
      );
      if (!moved.ok) {
        return { ok: false, error: moved.reason };
      }
      recordGameEvent(state, {
        type: "marketFlowCardAdded",
        playerId: player.playerId,
        sourceType: source.sourceType,
        destinationZone: "legendMarket",
        cardInstanceId: card.instanceId,
        definitionId: card.definitionId,
      });
    }
    return { ok: true };
  },
};

const mayhemEachPlayerGainChipsThenAttackHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_each_player_gain_chips_then_attack_for_current_chips">
> = {
  effectId: "mayhem_each_player_gain_chips_then_attack_for_current_chips",
  execute(state, player, effect, source, services) {
    const targetPlayers = services.getPlayersInActiveOrder(state);
    for (const targetPlayer of targetPlayers) {
      const chipsBefore = targetPlayer.chips;
      targetPlayer.chips += effect.chipAmount;
      recordEffectChipsChanged(
        state,
        targetPlayer,
        source,
        effect.effectId,
        chipsBefore,
        targetPlayer.chips
      );
    }
    return services.resolveMayhemAttackPlan(
      state,
      player,
      targetPlayers.map(
        (targetPlayer): MayhemAttackPlanTarget => ({
          targetPlayer,
          amount: targetPlayer.chips,
        })
      ),
      effect.effectId,
      source
    );
  },
};

const mayhemEachPlayerChooseFoeGainChipsHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_each_player_choose_foe_gain_chips">
> = {
  effectId: "mayhem_each_player_choose_foe_gain_chips",
  execute(state, _player, effect, source, services) {
    for (const choosingPlayer of services.getPlayersInActiveOrder(state)) {
      const choice = services.chooseEffectChoice(
        state,
        choosingPlayer,
        source,
        effect.effectId,
        services
          .getOpponentsInSeatingOrder(state, choosingPlayer)
          .map((targetPlayer) => ({
            choiceKind: "playerTarget" as const,
            choiceId: targetPlayer.playerId,
            players: [targetPlayer],
          }))
      );
      const targetPlayer =
        choice?.choiceKind === "playerTarget" ? choice.players[0] : undefined;
      if (targetPlayer === undefined) continue;
      const chipsBefore = targetPlayer.chips;
      targetPlayer.chips += effect.chipAmount;
      recordEffectChipsChanged(
        state,
        targetPlayer,
        source,
        effect.effectId,
        chipsBefore,
        targetPlayer.chips
      );
    }
    return { ok: true };
  },
};

const mayhemEachPlayerBattleHighestHandCostHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_each_player_battle_highest_hand_cost">
> = {
  effectId: "mayhem_each_player_battle_highest_hand_cost",
  execute(state, _player, effect, source, services) {
    const participants: Array<{ player: PlayerState; handCost: number }> = [];
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      const participationChoice = services.chooseEffectChoice(
        state,
        targetPlayer,
        source,
        effect.effectId,
        [
          { choiceKind: "option", choiceId: "participate" },
          { choiceKind: "option", choiceId: "pass" },
        ]
      );
      if (participationChoice?.choiceId !== "participate") continue;
      const handCost = sumHandCost(state, targetPlayer);
      participants.push({ player: targetPlayer, handCost });
      recordGameEvent(state, {
        type: "mayhemBattleParticipationSelected",
        playerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: effect.effectId,
        amount: handCost,
        sourceType: source.sourceType,
      });
    }
    const highestCost = Math.max(
      ...participants.map((participant) => participant.handCost),
      0
    );
    const winners = participants
      .filter((participant) => participant.handCost === highestCost)
      .map((participant) => participant.player);
    const winnerIds = winners.map((winner) => winner.playerId);
    for (const winner of winners) {
      const drawResult = drawDeckCards(
        winner.deck,
        winner.discard,
        effect.winnerDrawAmount,
        state.rng,
        () => recordDeckReshuffle(state, winner.playerId)
      );
      winner.hand.push(...drawResult.cards);
    }
    for (const participant of participants) {
      if (winnerIds.includes(participant.player.playerId)) continue;
      participant.player.discard.push(...participant.player.hand.splice(0));
    }
    recordGameEvent(state, {
      type: "mayhemBattleResolved",
      playerId: source.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: effect.effectId,
      amount: highestCost,
      participantPlayerIds: participants.map(
        (participant) => participant.player.playerId
      ),
      winnerPlayerIds: winnerIds,
      sourceType: source.sourceType,
    });
    return { ok: true };
  },
};

const mayhemEachPlayerVoteDinglerHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_each_player_vote_dingler">
> = {
  effectId: "mayhem_each_player_vote_dingler",
  execute(state, _player, effect, source, services) {
    const players = services.getPlayersInActiveOrder(state);
    const votes = new Map<PlayerState["playerId"], number>();
    for (const votingPlayer of players) {
      const choice = services.chooseEffectChoice(
        state,
        votingPlayer,
        source,
        effect.effectId,
        players.map((targetPlayer) => ({
          choiceKind: "playerTarget" as const,
          choiceId: `vote-${targetPlayer.playerId}`,
          players: [targetPlayer],
        }))
      );
      const votedPlayer =
        choice?.choiceKind === "playerTarget" ? choice.players[0] : undefined;
      if (votedPlayer === undefined) continue;
      votes.set(
        votedPlayer.playerId,
        (votes.get(votedPlayer.playerId) ?? 0) + 1
      );
      recordGameEvent(state, {
        type: "mayhemVoteRecorded",
        playerId: votingPlayer.playerId,
        targetPlayerId: votedPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: effect.effectId,
        sourceType: source.sourceType,
      });
    }
    const highestVoteCount = Math.max(...votes.values(), 0);
    const winners = players.filter(
      (candidate) => votes.get(candidate.playerId) === highestVoteCount
    );
    for (const winner of winners) {
      const result = services.gainDinglerStatus(
        state,
        winner,
        effect.effectId,
        source
      );
      if (!result.ok) return result;
    }
    recordGameEvent(state, {
      type: "mayhemVoteResolved",
      playerId: source.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: effect.effectId,
      amount: highestVoteCount,
      winnerPlayerIds: winners.map((winner) => winner.playerId),
      sourceType: source.sourceType,
    });
    return { ok: true };
  },
};

const mayhemEachDinglerRecoveryChoiceHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status">
> = {
  effectId: "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status",
  execute(state, _player, effect, source, services) {
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      if (!services.hasDinglerStatus(targetPlayer)) continue;
      const choices: EffectChoice[] = [];
      if (targetPlayer.life.current - effect.lifeCost >= 1) {
        choices.push({ choiceKind: "option", choiceId: "pay_life" });
      }
      if (targetPlayer.chips >= effect.chipCost) {
        choices.push({ choiceKind: "option", choiceId: "spend_chips" });
      }
      choices.push({ choiceKind: "option", choiceId: "skip" });
      const choice = services.chooseEffectChoice(
        state,
        targetPlayer,
        source,
        effect.effectId,
        choices
      );
      if (choice?.choiceId === "pay_life") {
        targetPlayer.life.current -= effect.lifeCost;
        recordGameEvent(state, {
          type: "effectCostPaid",
          playerId: targetPlayer.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          effectId: effect.effectId,
          costId: "pay_life",
          amount: effect.lifeCost,
          sourceType: source.sourceType,
        });
        const result = services.removeDinglerStatus(
          state,
          targetPlayer,
          effect.effectId,
          source
        );
        if (!result.ok) return result;
        continue;
      }
      if (choice?.choiceId === "spend_chips") {
        targetPlayer.chips -= effect.chipCost;
        recordGameEvent(state, {
          type: "effectCostPaid",
          playerId: targetPlayer.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          effectId: effect.effectId,
          costId: "spend_chips",
          amount: effect.chipCost,
          sourceType: source.sourceType,
        });
        const result = services.removeDinglerStatus(
          state,
          targetPlayer,
          effect.effectId,
          source
        );
        if (!result.ok) return result;
      }
    }
    return { ok: true };
  },
};

function createMayhemLowestLifeDinglerMaxLifeHandler(
  calculateEffectivePlayerMaxLife: MayhemCatalogTools["calculateEffectivePlayerMaxLife"]
): EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_lowest_life_players_gain_dingler_and_set_to_max_life">
> {
  return {
    effectId: "mayhem_lowest_life_players_gain_dingler_and_set_to_max_life",
    execute(state, _player, effect, source, services) {
      const lowestLife = Math.min(
        ...state.players.map((candidate) => candidate.life.current)
      );
      const targets = services
        .getPlayersInActiveOrder(state)
        .filter((candidate) => candidate.life.current === lowestLife);
      const decisionResult = collectMayhemAttackDefenseDecisions(
        state,
        targets,
        effect.effectId,
        source,
        services
      );
      if (!decisionResult.ok) return decisionResult;
      if (decisionResult.gameEnd !== undefined) {
        return { ok: true, gameEnd: decisionResult.gameEnd };
      }
      const attackInstance = decisionResult.attackInstance;
      const attackSource = decisionResult.source;
      for (const {
        player: targetPlayer,
        avoided,
      } of decisionResult.decisions) {
        if (avoided) continue;
        const statusResult = services.gainDinglerStatus(
          state,
          targetPlayer,
          effect.effectId,
          attackSource
        );
        if (!statusResult.ok || statusResult.gameEnd !== undefined) {
          return services.closeAttackInstance(
            state,
            attackInstance,
            statusResult
          );
        }
        const maxLife = calculateEffectivePlayerMaxLife(
          state,
          targetPlayer.playerId
        );
        services.setPlayerLife(state, targetPlayer, maxLife);
        recordGameEvent(state, {
          type: "effectLifeSet",
          playerId: source.playerId,
          ...(attackSource.attackId === undefined
            ? {}
            : { attackId: attackSource.attackId }),
          targetPlayerId: targetPlayer.playerId,
          cardInstanceId: attackSource.cardInstanceId,
          definitionId: attackSource.definitionId,
          effectId: effect.effectId,
          amount: maxLife,
          sourceType: attackSource.sourceType,
        });
      }
      return services.closeAttackInstance(state, attackInstance, { ok: true });
    },
  };
}

const mayhemAttackHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_attack">
> = {
  effectId: "mayhem_attack",
  execute(state, player, effect, source, services) {
    return services.resolveMayhemAttack(
      state,
      player,
      effect.amount,
      effect.effectId,
      source
    );
  },
};

function discardControlledPermanent(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
  effectId: RuntimeEffectId,
  source: EffectSourceContext,
  services: EffectRuntimeServices
): EffectExecutionResult {
  const owner = findCardOwner(state, card);
  if (owner === undefined) {
    return {
      ok: false,
      error: `Cannot find owner for controlled permanent ${card.instanceId}`,
    };
  }
  const moved = services.moveCardToZonePreservingOwner(
    state,
    player,
    card,
    owner.discard,
    `${owner.playerId}.discard`,
    effectId,
    source
  );
  if (!moved) {
    return {
      ok: false,
      error: `Cannot discard controlled permanent ${card.instanceId}`,
    };
  }
  removeTemporaryCardControl(state, card.instanceId);
  recordGameEvent(state, {
    type: "effectCardDiscarded",
    playerId: player.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    targetCardInstanceId: card.instanceId,
    targetDefinitionId: card.definitionId,
    effectId,
    sourceType: source.sourceType,
  });
  return { ok: true };
}

const mayhemEachPlayerDiscardHalfControlledPermanentsHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_each_player_discard_half_controlled_permanents">
> = {
  effectId: "mayhem_each_player_discard_half_controlled_permanents",
  execute(state, player, effect, source, services) {
    const targets = services.getPlayersInActiveOrder(state).map(
      (targetPlayer): MayhemAttackPlanTarget => ({
        targetPlayer,
        amount: Math.ceil(
          getControlledOngoingCards(state, targetPlayer).length / 2
        ),
      })
    );
    return services.resolveMayhemAttackPlan(
      state,
      player,
      targets,
      effect.effectId,
      source,
      {
        kind: "effect",
        executeOnHit(targetPlayer) {
          const candidates = getControlledOngoingCards(state, targetPlayer);
          const amount = Math.ceil(candidates.length / 2);
          if (amount === 0) return { ok: true };

          const choices: EffectChoice[] = chooseCardCombinations(
            candidates,
            amount
          ).map((cards) => ({
            choiceKind: "cardTarget" as const,
            choiceId: `discard_${amount}_${cards
              .map((card) => card.instanceId)
              .join("_")}`,
            cards,
            amount,
          }));
          const choice = services.chooseEffectChoice(
            state,
            targetPlayer,
            source,
            effect.effectId,
            choices
          );
          if (choice?.choiceKind !== "cardTarget") {
            return {
              ok: false,
              error: "Mayhem permanent discard requires an exact card choice",
            };
          }

          const selectedIds = choice.cards.map((card) => card.instanceId);
          const candidateIds = new Set(
            candidates.map((card) => card.instanceId)
          );
          if (
            choice.amount !== amount ||
            choice.cards.length !== amount ||
            new Set(selectedIds).size !== amount ||
            selectedIds.some(
              (cardInstanceId) => !candidateIds.has(cardInstanceId)
            )
          ) {
            return {
              ok: false,
              error: "Selected Mayhem permanent discard cards are invalid",
            };
          }

          const mutationResult = services.runControlledPowerMutation(
            state,
            targetPlayer.playerId,
            () => {
              for (const card of choice.cards) {
                const result = discardControlledPermanent(
                  state,
                  targetPlayer,
                  card,
                  effect.effectId,
                  source,
                  services
                );
                if (!result.ok) return result;
              }
              return { ok: true } as const;
            },
            (result) => result.ok
          );
          if (!mutationResult.ok) return mutationResult;
          if (!mutationResult.value.ok) return mutationResult.value;
          return mutationResult.gameEnd === undefined
            ? { ok: true }
            : { ok: true, gameEnd: mutationResult.gameEnd };
        },
      }
    );
  },
};

type HighestCardCostResult =
  | { ok: true; amount: number }
  | { ok: false; error: string };

function calculateHighestEffectiveCardCost(
  state: GameState,
  playerId: PlayerState["playerId"],
  cards: readonly CardInstance[],
  calculateEffectiveCardCost: MayhemCatalogTools["calculateEffectiveCardCost"]
): HighestCardCostResult {
  let highestCost = 0;
  for (const card of cards) {
    const definition = state.cardDefinitions.get(card.definitionId);
    if (definition === undefined) {
      return {
        ok: false,
        error: `Missing card definition ${card.definitionId}`,
      };
    }
    highestCost = Math.max(
      highestCost,
      calculateEffectiveCardCost(state, playerId, definition, card)
    );
  }
  return { ok: true, amount: highestCost };
}

function createMayhemAttackEqualHighestCardCostHandler(
  calculateEffectiveCardCost: MayhemCatalogTools["calculateEffectiveCardCost"]
): EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_attack_equal_highest_card_cost">
> {
  return {
    effectId: "mayhem_attack_equal_highest_card_cost",
    execute(state, player, effect, source, services) {
      const targetPlayers = services.getPlayersInActiveOrder(state);
      let targets: MayhemAttackPlanTarget[];
      if (effect.costSource === "legendMarket") {
        const marketCost = calculateHighestEffectiveCardCost(
          state,
          player.playerId,
          listLegendMarketCards(state),
          calculateEffectiveCardCost
        );
        if (!marketCost.ok) return marketCost;
        targets = targetPlayers.map((targetPlayer) => ({
          targetPlayer,
          amount: marketCost.amount,
        }));
      } else {
        targets = [];
        for (const targetPlayer of targetPlayers) {
          const handCost = calculateHighestEffectiveCardCost(
            state,
            targetPlayer.playerId,
            targetPlayer.hand,
            calculateEffectiveCardCost
          );
          if (!handCost.ok) return handCost;
          targets.push({ targetPlayer, amount: handCost.amount });
        }
      }

      return services.resolveMayhemAttackPlan(
        state,
        player,
        targets,
        effect.effectId,
        source
      );
    },
  };
}

const megaMayhemEachPlayerGainLimpWandsToHandHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mega_mayhem_each_player_gain_limp_wands_to_hand">
> = {
  effectId: "mega_mayhem_each_player_gain_limp_wands_to_hand",
  execute(state, player, effect, source, services) {
    return services.resolveMayhemAttackPlan(
      state,
      player,
      services.getPlayersInActiveOrder(state).map((targetPlayer) => ({
        targetPlayer,
        amount: effect.amount,
      })),
      effect.effectId,
      source,
      {
        kind: "effect",
        executeOnHit(targetPlayer) {
          return gainLimpWandsFromCommonStack(
            state,
            targetPlayer,
            effect.amount,
            "hand",
            effect.effectId,
            source,
            services
          );
        },
      }
    );
  },
};

export interface MayhemCatalogTools {
  bindRuntimeEffectDecoder<Id extends MayhemEffectId>(
    effectId: Id
  ): RuntimeEffectDecoder<Id>;
  calculateEffectiveCardCost(
    state: GameState,
    playerId: PlayerState["playerId"],
    definition: CardDefinition,
    card: CardInstance
  ): number;
  calculateEffectivePlayerMaxLife(
    state: GameState,
    playerId: PlayerState["playerId"]
  ): number;
}

type MayhemEffectDefinition<Id extends MayhemEffectId> = {
  readonly effectId: Id;
  readonly decoder: RuntimeEffectDecoder<Id>;
  readonly supportedTimings: EffectRuntimeSupportedTimings;
  readonly supportedModes: EffectRuntimeSupportedModes;
  readonly supportedSourceKinds: EffectRuntimeSupportedSourceKinds;
  readonly handler: EffectRuntimeHandler<RuntimeEffectForId<Id>>;
};
type AnyMayhemEffectDefinition = {
  [Id in MayhemEffectId]: MayhemEffectDefinition<Id>;
}[MayhemEffectId];

export function createMayhemEffectDefinitions(
  tools: MayhemCatalogTools
): readonly AnyMayhemEffectDefinition[] {
  const mayhemAttackTimings = [
    "onPlay",
    "onMayhemResolve",
  ] as const satisfies EffectRuntimeSupportedTimings;
  const mayhemResolveTimings = [
    "onMayhemResolve",
  ] as const satisfies EffectRuntimeSupportedTimings;
  const sourceKinds = [
    "card",
    "wizardProperty",
  ] as const satisfies EffectRuntimeSupportedSourceKinds;
  const { bindRuntimeEffectDecoder } = tools;
  const definition = <Id extends MayhemEffectId>(
    effectId: Id,
    supportedTimings: EffectRuntimeSupportedTimings,
    handler: EffectRuntimeHandler<RuntimeEffectForId<Id>>
  ): MayhemEffectDefinition<Id> => ({
    effectId,
    decoder: bindRuntimeEffectDecoder(effectId),
    supportedTimings,
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: sourceKinds,
    handler,
  });
  return [
    definition("mayhem_attack", mayhemAttackTimings, mayhemAttackHandler),
    definition(
      "mayhem_attack_equal_highest_card_cost",
      mayhemResolveTimings,
      createMayhemAttackEqualHighestCardCostHandler(
        tools.calculateEffectiveCardCost
      )
    ),
    definition(
      "mayhem_each_player_discard_half_controlled_permanents",
      mayhemResolveTimings,
      mayhemEachPlayerDiscardHalfControlledPermanentsHandler
    ),
    definition(
      "mayhem_add_chips_to_main_market",
      mayhemResolveTimings,
      mayhemAddChipsToMainMarketHandler
    ),
    definition(
      "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status",
      mayhemResolveTimings,
      mayhemEachDinglerRecoveryChoiceHandler
    ),
    definition(
      "mayhem_each_player_choose_foe_gain_chips",
      mayhemResolveTimings,
      mayhemEachPlayerChooseFoeGainChipsHandler
    ),
    definition(
      "mayhem_each_non_dingler_gain_chips",
      mayhemResolveTimings,
      mayhemEachNonDinglerGainChipsHandler
    ),
    definition(
      "mayhem_each_player_gain_chips",
      mayhemResolveTimings,
      mayhemEachPlayerGainChipsHandler
    ),
    definition(
      "mayhem_refresh_legend_market",
      mayhemResolveTimings,
      mayhemRefreshLegendMarketHandler
    ),
    definition(
      "mayhem_each_player_battle_highest_hand_cost",
      mayhemResolveTimings,
      mayhemEachPlayerBattleHighestHandCostHandler
    ),
    definition(
      "mayhem_each_player_choose_discard_hand_draw_or_take_damage",
      mayhemResolveTimings,
      mayhemEachPlayerHandRedrawChoiceHandler
    ),
    definition(
      "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none",
      mayhemResolveTimings,
      mayhemEachPlayerDiscardTopDeckDestroyHandler
    ),
    definition(
      "mayhem_each_player_discard_deck_then_destroy_from_discard",
      mayhemResolveTimings,
      mayhemEachPlayerDiscardDeckDestroyHandler
    ),
    definition(
      "mayhem_each_player_reveal_random_hand_card_destroy_or_pay_life_to_reroll",
      mayhemResolveTimings,
      mayhemEachPlayerRevealRandomHandCardHandler
    ),
    definition(
      "mayhem_each_player_optional_destroy_own_card",
      mayhemResolveTimings,
      mayhemEachPlayerOptionalDestroyOwnCardHandler
    ),
    definition(
      "mayhem_each_player_optional_destroy_own_card_for_half_chips",
      mayhemResolveTimings,
      mayhemEachPlayerOptionalDestroyOwnCardForHalfChipsHandler
    ),
    definition(
      "mayhem_each_player_gain_chips_then_attack_for_current_chips",
      mayhemResolveTimings,
      mayhemEachPlayerGainChipsThenAttackHandler
    ),
    definition(
      "mayhem_each_player_reduce_life_to_gain_chips",
      mayhemResolveTimings,
      mayhemEachPlayerReduceLifeToGainChipsHandler
    ),
    definition(
      "mayhem_each_player_vote_dingler",
      mayhemResolveTimings,
      mayhemEachPlayerVoteDinglerHandler
    ),
    definition(
      "mayhem_lowest_life_players_gain_dingler_and_set_to_max_life",
      mayhemResolveTimings,
      createMayhemLowestLifeDinglerMaxLifeHandler(
        tools.calculateEffectivePlayerMaxLife
      )
    ),
    definition(
      "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem",
      mayhemResolveTimings,
      megaMayhemEachPlayerDestroyTopMainDeckHandler
    ),
    definition(
      "mega_mayhem_each_player_optional_destroy_own_cards",
      mayhemResolveTimings,
      megaMayhemEachPlayerOptionalDestroyOwnCardsHandler
    ),
    definition(
      "mega_mayhem_each_player_gain_limp_wands_to_hand",
      mayhemResolveTimings,
      megaMayhemEachPlayerGainLimpWandsToHandHandler
    ),
    definition(
      "mega_mayhem_each_player_toggle_dingler",
      mayhemResolveTimings,
      megaMayhemEachPlayerToggleDinglerHandler
    ),
    definition(
      "mega_mayhem_set_life",
      mayhemResolveTimings,
      megaMayhemSetLifeHandler
    ),
  ];
}
