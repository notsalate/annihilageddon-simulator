import { getCardEffectiveTypeOptions } from "./card-type-runtime.js";
import {
  getControlledCards,
  getPhysicalCardLedger,
  removeDeadWizardToken,
  removeTemporaryCardControl,
} from "./control-ledger.js";
import {
  chooseCardCombinations,
  chooseRevealedTopCardForDestruction,
  destroyOwnedCard,
} from "./effect-runtime-cards-ownership-choice.js";
import { changePlayerChips } from "./effect-runtime-resources-draw.js";
import { gainLimpWandsFromCommonStack } from "./effect-runtime-special-card-stack.js";
import { calculateEffectiveCardCost } from "./effective-value-runtime.js";
import { recordGameEvent } from "./event-recorder.js";
import type { CardDefinition } from "./data.js";
import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";
import type {
  EffectExecutionResult,
  EffectRuntimeServices,
  EffectSourceContext,
} from "./effect-runtime-registry.js";
import type { RuntimeEffectDecoder } from "./runtime-effect-decoder.js";
import type {
  RuntimeEffectForId,
  RuntimeEffectId,
  RuntimeEffectTargetSelector,
} from "./runtime-effect.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";
import type {
  EffectRuntimeSupportedModes,
  EffectRuntimeSupportedSourceKinds,
  EffectRuntimeSupportedTimings,
} from "./effect-runtime-catalog-shared.js";
import type {
  ObjectFields,
  RequiredField,
  ValueDecoder,
} from "./effect-runtime-family-support.js";

export const deadWizardTokenEffectIds = [
  "dead_wizard_token_each_foe_gain_chips",
  "dead_wizard_token_random_discard_to_chosen_foe",
  "dead_wizard_token_each_foe_optional_transfer_sign",
  "dead_wizard_token_shuffle_hand_legends",
  "dead_wizard_token_shuffle_owned_permanents",
  "dead_wizard_token_each_foe_optional_discard",
  "dead_wizard_token_reveal_and_optional_destroy",
  "dead_wizard_token_damage_equal_chips",
  "dead_wizard_token_damage_equal_highest_hand_cost",
  "dead_wizard_token_gain_chips",
  "dead_wizard_token_gain_limp_wands_per_discard_legend",
  "dead_wizard_token_gain_limp_wand_to_deck_top",
  "dead_wizard_token_gain_limp_wands_to_deck_bottom",
  "dead_wizard_token_gain_status_or_draw_face",
  "dead_wizard_token_killer_optional_remove_dingler",
  "dead_wizard_token_lose_half_chips",
  "dead_wizard_token_damage_per_discard_legend",
  "dead_wizard_token_exchange_life",
  "dead_wizard_token_reveal_main_deck_gain_if_mayhem",
  "dead_wizard_token_reveal_player_deck_gain_if_legend",
  "dead_wizard_token_reward_killer_chips",
  "dead_wizard_token_self_destroy_for_chips",
  "suppress_basic_trophy_chip_payout",
] as const;

export type DeadWizardTokenEffectId = (typeof deadWizardTokenEffectIds)[number];

export type DeadWizardTokenGainChipsRuntimeEffect = {
  effectId: "dead_wizard_token_gain_chips";
  timing: "onDeadWizardTokenFace";
  amount: 1;
};

export type DeadWizardTokenEachFoeGainChipsRuntimeEffect = {
  effectId: "dead_wizard_token_each_foe_gain_chips";
  timing: "onDeadWizardTokenFace";
  amount: 1;
};

export type DeadWizardTokenRandomDiscardToChosenFoeRuntimeEffect = {
  effectId: "dead_wizard_token_random_discard_to_chosen_foe";
  timing: "onDeadWizardTokenFace";
  targetSelector: "chosenFoe";
};

export type DeadWizardTokenEachFoeOptionalTransferSignRuntimeEffect = {
  effectId: "dead_wizard_token_each_foe_optional_transfer_sign";
  timing: "onDeadWizardTokenFace";
};

export type DeadWizardTokenShuffleHandLegendsRuntimeEffect = {
  effectId: "dead_wizard_token_shuffle_hand_legends";
  timing: "onDeadWizardTokenFace";
};

export type DeadWizardTokenShuffleOwnedPermanentsRuntimeEffect = {
  effectId: "dead_wizard_token_shuffle_owned_permanents";
  timing: "onDeadWizardTokenFace";
};

export type DeadWizardTokenEachFoeOptionalDiscardRuntimeEffect = {
  effectId: "dead_wizard_token_each_foe_optional_discard";
  timing: "onDeadWizardTokenFace";
};

export type DeadWizardTokenRevealAndOptionalDestroyRuntimeEffect = {
  effectId: "dead_wizard_token_reveal_and_optional_destroy";
  timing: "onDeadWizardTokenFace";
};

export type DeadWizardTokenDamageEqualChipsRuntimeEffect = {
  effectId: "dead_wizard_token_damage_equal_chips";
  timing: "onDeadWizardTokenFace";
};

export type DeadWizardTokenDamageEqualHighestHandCostRuntimeEffect = {
  effectId: "dead_wizard_token_damage_equal_highest_hand_cost";
  timing: "onDeadWizardTokenFace";
};

export type DeadWizardTokenLoseHalfChipsRuntimeEffect = {
  effectId: "dead_wizard_token_lose_half_chips";
  timing: "onDeadWizardTokenFace";
  loss: "half";
  rounding: "up";
};

export type DeadWizardTokenDamagePerDiscardLegendRuntimeEffect = {
  effectId: "dead_wizard_token_damage_per_discard_legend";
  timing: "onDeadWizardTokenFace";
  countedCardType: "legend";
  damagePerCard: 4;
};

export type DeadWizardTokenExchangeLifeRuntimeEffect = {
  effectId: "dead_wizard_token_exchange_life";
  timing: "onDeadWizardTokenFace";
  target: { selector: "opponentPlayer" };
};

export type DeadWizardTokenRevealMainDeckGainIfMayhemRuntimeEffect = {
  effectId: "dead_wizard_token_reveal_main_deck_gain_if_mayhem";
  timing: "onDeadWizardTokenFace";
};

export type DeadWizardTokenRevealPlayerDeckGainIfLegendRuntimeEffect = {
  effectId: "dead_wizard_token_reveal_player_deck_gain_if_legend";
  timing: "onDeadWizardTokenFace";
};

export type DeadWizardTokenRewardKillerChipsRuntimeEffect = {
  effectId: "dead_wizard_token_reward_killer_chips";
  timing: "onDeadWizardTokenFace";
  amount: 2;
};

export type DeadWizardTokenSelfDestroyForChipsRuntimeEffect = {
  effectId: "dead_wizard_token_self_destroy_for_chips";
  timing: "activation";
  chipCost: number;
};

export type DeadWizardTokenKillerOptionalRemoveDinglerRuntimeEffect = {
  effectId: "dead_wizard_token_killer_optional_remove_dingler";
  timing: "onDeadWizardTokenFace";
  statusId: "dingler";
};

export type DeadWizardTokenGainStatusOrDrawFaceRuntimeEffect = {
  effectId: "dead_wizard_token_gain_status_or_draw_face";
  timing: "onDeadWizardTokenFace";
  statusId: "dingler";
};

export type DeadWizardTokenGainLimpWandsPerDiscardLegendRuntimeEffect = {
  effectId: "dead_wizard_token_gain_limp_wands_per_discard_legend";
  timing: "onDeadWizardTokenFace";
  countedCardType: "legend";
  destination: "discard";
};

export type DeadWizardTokenGainLimpWandToDeckTopRuntimeEffect = {
  effectId: "dead_wizard_token_gain_limp_wand_to_deck_top";
  timing: "onDeadWizardTokenFace";
  amount: 1;
  destination: "deckTop";
};

export type DeadWizardTokenGainLimpWandsToDeckBottomRuntimeEffect = {
  effectId: "dead_wizard_token_gain_limp_wands_to_deck_bottom";
  timing: "onDeadWizardTokenFace";
  amount: 2;
  destination: "deckBottom";
};

export type DeadWizardTokenSuppressBasicTrophyChipPayoutRuntimeEffect = {
  effectId: "suppress_basic_trophy_chip_payout";
  timing: "whileControlled";
};

export interface DeadWizardTokenEffectPayloadMap {
  dead_wizard_token_each_foe_gain_chips: DeadWizardTokenEachFoeGainChipsRuntimeEffect;
  dead_wizard_token_random_discard_to_chosen_foe: DeadWizardTokenRandomDiscardToChosenFoeRuntimeEffect;
  dead_wizard_token_each_foe_optional_transfer_sign: DeadWizardTokenEachFoeOptionalTransferSignRuntimeEffect;
  dead_wizard_token_shuffle_hand_legends: DeadWizardTokenShuffleHandLegendsRuntimeEffect;
  dead_wizard_token_shuffle_owned_permanents: DeadWizardTokenShuffleOwnedPermanentsRuntimeEffect;
  dead_wizard_token_each_foe_optional_discard: DeadWizardTokenEachFoeOptionalDiscardRuntimeEffect;
  dead_wizard_token_reveal_and_optional_destroy: DeadWizardTokenRevealAndOptionalDestroyRuntimeEffect;
  dead_wizard_token_damage_equal_chips: DeadWizardTokenDamageEqualChipsRuntimeEffect;
  dead_wizard_token_damage_equal_highest_hand_cost: DeadWizardTokenDamageEqualHighestHandCostRuntimeEffect;
  dead_wizard_token_gain_chips: DeadWizardTokenGainChipsRuntimeEffect;
  dead_wizard_token_gain_limp_wands_per_discard_legend: DeadWizardTokenGainLimpWandsPerDiscardLegendRuntimeEffect;
  dead_wizard_token_gain_limp_wand_to_deck_top: DeadWizardTokenGainLimpWandToDeckTopRuntimeEffect;
  dead_wizard_token_gain_limp_wands_to_deck_bottom: DeadWizardTokenGainLimpWandsToDeckBottomRuntimeEffect;
  dead_wizard_token_killer_optional_remove_dingler: DeadWizardTokenKillerOptionalRemoveDinglerRuntimeEffect;
  dead_wizard_token_gain_status_or_draw_face: DeadWizardTokenGainStatusOrDrawFaceRuntimeEffect;
  dead_wizard_token_lose_half_chips: DeadWizardTokenLoseHalfChipsRuntimeEffect;
  dead_wizard_token_damage_per_discard_legend: DeadWizardTokenDamagePerDiscardLegendRuntimeEffect;
  dead_wizard_token_exchange_life: DeadWizardTokenExchangeLifeRuntimeEffect;
  dead_wizard_token_reveal_main_deck_gain_if_mayhem: DeadWizardTokenRevealMainDeckGainIfMayhemRuntimeEffect;
  dead_wizard_token_reveal_player_deck_gain_if_legend: DeadWizardTokenRevealPlayerDeckGainIfLegendRuntimeEffect;
  dead_wizard_token_reward_killer_chips: DeadWizardTokenRewardKillerChipsRuntimeEffect;
  dead_wizard_token_self_destroy_for_chips: DeadWizardTokenSelfDestroyForChipsRuntimeEffect;
  suppress_basic_trophy_chip_payout: DeadWizardTokenSuppressBasicTrophyChipPayoutRuntimeEffect;
}

export interface DeadWizardTokenDecoderTools {
  defineDecoder<Id extends DeadWizardTokenEffectId>(
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
  positiveInteger: ValueDecoder<number>;
  selectorTarget<Selector extends RuntimeEffectTargetSelector>(
    selector: Selector
  ): ValueDecoder<{ selector: Selector }>;
}

export function createDeadWizardTokenEffectDecoders(
  tools: DeadWizardTokenDecoderTools
): { [Id in DeadWizardTokenEffectId]: RuntimeEffectDecoder<Id> } {
  const { defineDecoder, required, literal, positiveInteger, selectorTarget } =
    tools;
  return {
    dead_wizard_token_each_foe_gain_chips: defineDecoder(
      "dead_wizard_token_each_foe_gain_chips",
      {
        effectId: required(literal("dead_wizard_token_each_foe_gain_chips")),
        timing: required(literal("onDeadWizardTokenFace")),
        amount: required(literal(1)),
      }
    ),
    dead_wizard_token_random_discard_to_chosen_foe: defineDecoder(
      "dead_wizard_token_random_discard_to_chosen_foe",
      {
        effectId: required(
          literal("dead_wizard_token_random_discard_to_chosen_foe")
        ),
        timing: required(literal("onDeadWizardTokenFace")),
        targetSelector: required(literal("chosenFoe")),
      }
    ),
    dead_wizard_token_each_foe_optional_transfer_sign: defineDecoder(
      "dead_wizard_token_each_foe_optional_transfer_sign",
      {
        effectId: required(
          literal("dead_wizard_token_each_foe_optional_transfer_sign")
        ),
        timing: required(literal("onDeadWizardTokenFace")),
      }
    ),
    dead_wizard_token_shuffle_hand_legends: defineDecoder(
      "dead_wizard_token_shuffle_hand_legends",
      {
        effectId: required(literal("dead_wizard_token_shuffle_hand_legends")),
        timing: required(literal("onDeadWizardTokenFace")),
      }
    ),
    dead_wizard_token_shuffle_owned_permanents: defineDecoder(
      "dead_wizard_token_shuffle_owned_permanents",
      {
        effectId: required(
          literal("dead_wizard_token_shuffle_owned_permanents")
        ),
        timing: required(literal("onDeadWizardTokenFace")),
      }
    ),
    dead_wizard_token_each_foe_optional_discard: defineDecoder(
      "dead_wizard_token_each_foe_optional_discard",
      {
        effectId: required(
          literal("dead_wizard_token_each_foe_optional_discard")
        ),
        timing: required(literal("onDeadWizardTokenFace")),
      }
    ),
    dead_wizard_token_reveal_and_optional_destroy: defineDecoder(
      "dead_wizard_token_reveal_and_optional_destroy",
      {
        effectId: required(
          literal("dead_wizard_token_reveal_and_optional_destroy")
        ),
        timing: required(literal("onDeadWizardTokenFace")),
      }
    ),
    dead_wizard_token_damage_equal_chips: defineDecoder(
      "dead_wizard_token_damage_equal_chips",
      {
        effectId: required(literal("dead_wizard_token_damage_equal_chips")),
        timing: required(literal("onDeadWizardTokenFace")),
      }
    ),
    dead_wizard_token_damage_equal_highest_hand_cost: defineDecoder(
      "dead_wizard_token_damage_equal_highest_hand_cost",
      {
        effectId: required(
          literal("dead_wizard_token_damage_equal_highest_hand_cost")
        ),
        timing: required(literal("onDeadWizardTokenFace")),
      }
    ),
    dead_wizard_token_gain_chips: defineDecoder(
      "dead_wizard_token_gain_chips",
      {
        effectId: required(literal("dead_wizard_token_gain_chips")),
        timing: required(literal("onDeadWizardTokenFace")),
        amount: required(literal(1)),
      }
    ),
    dead_wizard_token_lose_half_chips: defineDecoder(
      "dead_wizard_token_lose_half_chips",
      {
        effectId: required(literal("dead_wizard_token_lose_half_chips")),
        timing: required(literal("onDeadWizardTokenFace")),
        loss: required(literal("half")),
        rounding: required(literal("up")),
      }
    ),
    dead_wizard_token_damage_per_discard_legend: defineDecoder(
      "dead_wizard_token_damage_per_discard_legend",
      {
        effectId: required(
          literal("dead_wizard_token_damage_per_discard_legend")
        ),
        timing: required(literal("onDeadWizardTokenFace")),
        countedCardType: required(literal("legend")),
        damagePerCard: required(literal(4)),
      }
    ),
    dead_wizard_token_exchange_life: defineDecoder(
      "dead_wizard_token_exchange_life",
      {
        effectId: required(literal("dead_wizard_token_exchange_life")),
        timing: required(literal("onDeadWizardTokenFace")),
        target: required(selectorTarget("opponentPlayer")),
      }
    ),
    dead_wizard_token_reveal_main_deck_gain_if_mayhem: defineDecoder(
      "dead_wizard_token_reveal_main_deck_gain_if_mayhem",
      {
        effectId: required(
          literal("dead_wizard_token_reveal_main_deck_gain_if_mayhem")
        ),
        timing: required(literal("onDeadWizardTokenFace")),
      }
    ),
    dead_wizard_token_reveal_player_deck_gain_if_legend: defineDecoder(
      "dead_wizard_token_reveal_player_deck_gain_if_legend",
      {
        effectId: required(
          literal("dead_wizard_token_reveal_player_deck_gain_if_legend")
        ),
        timing: required(literal("onDeadWizardTokenFace")),
      }
    ),
    dead_wizard_token_reward_killer_chips: defineDecoder(
      "dead_wizard_token_reward_killer_chips",
      {
        effectId: required(literal("dead_wizard_token_reward_killer_chips")),
        timing: required(literal("onDeadWizardTokenFace")),
        amount: required(literal(2)),
      }
    ),
    dead_wizard_token_self_destroy_for_chips: defineDecoder(
      "dead_wizard_token_self_destroy_for_chips",
      {
        effectId: required(literal("dead_wizard_token_self_destroy_for_chips")),
        timing: required(literal("activation")),
        chipCost: required(positiveInteger),
      }
    ),
    dead_wizard_token_killer_optional_remove_dingler: defineDecoder(
      "dead_wizard_token_killer_optional_remove_dingler",
      {
        effectId: required(
          literal("dead_wizard_token_killer_optional_remove_dingler")
        ),
        timing: required(literal("onDeadWizardTokenFace")),
        statusId: required(literal("dingler")),
      }
    ),
    dead_wizard_token_gain_status_or_draw_face: defineDecoder(
      "dead_wizard_token_gain_status_or_draw_face",
      {
        effectId: required(
          literal("dead_wizard_token_gain_status_or_draw_face")
        ),
        timing: required(literal("onDeadWizardTokenFace")),
        statusId: required(literal("dingler")),
      }
    ),
    dead_wizard_token_gain_limp_wands_per_discard_legend: defineDecoder(
      "dead_wizard_token_gain_limp_wands_per_discard_legend",
      {
        effectId: required(
          literal("dead_wizard_token_gain_limp_wands_per_discard_legend")
        ),
        timing: required(literal("onDeadWizardTokenFace")),
        countedCardType: required(literal("legend")),
        destination: required(literal("discard")),
      }
    ),
    dead_wizard_token_gain_limp_wand_to_deck_top: defineDecoder(
      "dead_wizard_token_gain_limp_wand_to_deck_top",
      {
        effectId: required(
          literal("dead_wizard_token_gain_limp_wand_to_deck_top")
        ),
        timing: required(literal("onDeadWizardTokenFace")),
        amount: required(literal(1)),
        destination: required(literal("deckTop")),
      },
      (subjectId, effect) =>
        effect.amount === 1
          ? []
          : [`${subjectId} must gain exactly one Limp Wand`]
    ),
    dead_wizard_token_gain_limp_wands_to_deck_bottom: defineDecoder(
      "dead_wizard_token_gain_limp_wands_to_deck_bottom",
      {
        effectId: required(
          literal("dead_wizard_token_gain_limp_wands_to_deck_bottom")
        ),
        timing: required(literal("onDeadWizardTokenFace")),
        amount: required(literal(2)),
        destination: required(literal("deckBottom")),
      },
      (subjectId, effect) =>
        effect.amount === 2
          ? []
          : [`${subjectId} must gain exactly two Limp Wands`]
    ),
    suppress_basic_trophy_chip_payout: defineDecoder(
      "suppress_basic_trophy_chip_payout",
      {
        effectId: required(literal("suppress_basic_trophy_chip_payout")),
        timing: required(literal("whileControlled")),
      }
    ),
  };
}

const gainLimpWandsPerDiscardLegendHandler: EffectRuntimeHandler<DeadWizardTokenGainLimpWandsPerDiscardLegendRuntimeEffect> =
  {
    effectId: "dead_wizard_token_gain_limp_wands_per_discard_legend",
    execute(state, player, effect, source, services) {
      const amount = countPlayerDiscardCardsMatchingType(
        state,
        player,
        effect.countedCardType,
        source,
        effect.effectId,
        services
      );
      return gainLimpWandsFromCommonStack(
        state,
        player,
        amount,
        effect.destination,
        effect.effectId,
        source,
        services
      );
    },
  };

function countPlayerDiscardCardsMatchingType(
  state: GameState,
  player: PlayerState,
  cardType: string,
  source: EffectSourceContext,
  effectId: RuntimeEffectId,
  services: EffectRuntimeServices
): number {
  return player.discard.filter((card) =>
    cardCountsAsTypeAtDeadWizardTokenResolution(
      state,
      player,
      card,
      cardType,
      source,
      effectId,
      services
    )
  ).length;
}

function cardCountsAsTypeAtDeadWizardTokenResolution(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
  cardType: string,
  source: EffectSourceContext,
  effectId: RuntimeEffectId,
  services: EffectRuntimeServices
): boolean {
  const definition = state.cardDefinitions.get(card.definitionId);
  if (definition === undefined) return false;
  if (
    definition.engine.cardTypes.includes(cardType) ||
    definition.engine.tags?.includes("counts_as_every_card_type") === true
  ) {
    return true;
  }
  if (
    !getCardEffectiveTypeOptions(state, player.playerId, card).includes(
      cardType
    )
  ) {
    return false;
  }

  const choice = services.chooseEffectChoice(state, player, source, effectId, [
    {
      choiceKind: "cardTarget",
      choiceId: `count_as_${cardType}_${card.instanceId}`,
      cards: [card],
      amount: 1,
    },
    { choiceKind: "option", choiceId: "decline" },
  ]);
  return (
    choice?.choiceKind === "cardTarget" &&
    choice.cards.length === 1 &&
    choice.cards[0]?.instanceId === card.instanceId
  );
}

function applyOwnerlessDamage(
  state: GameState,
  player: PlayerState,
  amount: number,
  effectId: RuntimeEffectId,
  source: EffectSourceContext,
  services: EffectRuntimeServices
): EffectExecutionResult {
  const result = services.dealDamage(
    state,
    player,
    player,
    amount,
    effectId,
    source,
    { kind: "ownerless" }
  );
  return "damageDealt" in result ? { ok: true as const } : result;
}

const damageEqualChipsHandler: EffectRuntimeHandler<DeadWizardTokenDamageEqualChipsRuntimeEffect> =
  {
    effectId: "dead_wizard_token_damage_equal_chips",
    execute(state, player, effect, source, services) {
      return applyOwnerlessDamage(
        state,
        player,
        player.chips,
        effect.effectId,
        source,
        services
      );
    },
  };

const damagePerDiscardLegendHandler: EffectRuntimeHandler<DeadWizardTokenDamagePerDiscardLegendRuntimeEffect> =
  {
    effectId: "dead_wizard_token_damage_per_discard_legend",
    execute(state, player, effect, source, services) {
      const legendCount = countPlayerDiscardCardsMatchingType(
        state,
        player,
        effect.countedCardType,
        source,
        effect.effectId,
        services
      );
      return applyOwnerlessDamage(
        state,
        player,
        legendCount * effect.damagePerCard,
        effect.effectId,
        source,
        services
      );
    },
  };

const exchangeLifeHandler: EffectRuntimeHandler<DeadWizardTokenExchangeLifeRuntimeEffect> =
  {
    effectId: "dead_wizard_token_exchange_life",
    execute(state, player, effect, source, services) {
      const targetResult = services.resolveTargetChoice(
        state,
        player,
        effect,
        source
      );
      if (!targetResult.ok) return targetResult;
      if (targetResult.choice === undefined) {
        return {
          ok: false,
          error: "DWT life exchange requires another player",
        };
      }
      if (targetResult.choice.choiceType !== "player") {
        return {
          ok: false,
          error: "DWT life exchange requires a player target",
        };
      }
      services.exchangePlayerLifeTotals(
        state,
        player,
        targetResult.choice.player,
        effect.effectId,
        source
      );
      return { ok: true };
    },
  };

const damageEqualHighestHandCostHandler: EffectRuntimeHandler<DeadWizardTokenDamageEqualHighestHandCostRuntimeEffect> =
  {
    effectId: "dead_wizard_token_damage_equal_highest_hand_cost",
    execute(state, player, effect, source, services) {
      let highestCost = 0;
      for (const card of player.hand) {
        const definition = state.cardDefinitions.get(card.definitionId);
        if (definition === undefined) {
          return {
            ok: false,
            error: `Missing hand card definition ${card.definitionId}`,
          };
        }
        recordGameEvent(state, {
          type: "effectCardRevealed",
          playerId: player.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          targetCardInstanceId: card.instanceId,
          targetDefinitionId: card.definitionId,
          effectId: effect.effectId,
          sourceType: source.sourceType,
        });
        highestCost = Math.max(
          highestCost,
          calculateEffectiveCardCost(state, player.playerId, definition, card)
        );
      }
      return applyOwnerlessDamage(
        state,
        player,
        highestCost,
        effect.effectId,
        source,
        services
      );
    },
  };

const gainChipsHandler: EffectRuntimeHandler<DeadWizardTokenGainChipsRuntimeEffect> =
  {
    effectId: "dead_wizard_token_gain_chips",
    execute(state, player, effect, source) {
      changePlayerChips(state, player, effect.amount, source, effect.effectId);
      return { ok: true };
    },
  };

const eachFoeGainChipsHandler: EffectRuntimeHandler<DeadWizardTokenEachFoeGainChipsRuntimeEffect> =
  {
    effectId: "dead_wizard_token_each_foe_gain_chips",
    execute(state, player, effect, source, services) {
      for (const foe of services.getOpponentsInSeatingOrder(state, player)) {
        changePlayerChips(state, foe, effect.amount, source, effect.effectId);
      }
      return { ok: true };
    },
  };

const randomDiscardToChosenFoeHandler: EffectRuntimeHandler<DeadWizardTokenRandomDiscardToChosenFoeRuntimeEffect> =
  {
    effectId: "dead_wizard_token_random_discard_to_chosen_foe",
    execute(state, player, effect, source, services) {
      const targetResult = services.resolveTargetChoice(
        state,
        player,
        effect,
        source
      );
      if (!targetResult.ok) return targetResult;
      if (targetResult.choice === undefined) return { ok: true };
      if (targetResult.choice.choiceType !== "player") {
        return {
          ok: false,
          error: "Random discard transfer requires a foe target",
        };
      }

      const targetPlayer = targetResult.choice.player;
      if (player.discard.length === 0) {
        return { ok: true };
      }
      const card = player.discard[state.rng.nextInt(player.discard.length)];
      if (card === undefined) return { ok: true };

      const gained = services.moveGainedCardToPlayerDestination(
        state,
        targetPlayer,
        card,
        "discard"
      );
      if (!gained.ok) return gained;
      recordGameEvent(state, {
        type: "effectCardGained",
        playerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        targetCardInstanceId: card.instanceId,
        targetDefinitionId: card.definitionId,
        effectId: effect.effectId,
        destination: gained.destination,
        sourceType: source.sourceType,
      });
      return { ok: true };
    },
  };

const eachFoeOptionalTransferSignHandler: EffectRuntimeHandler<DeadWizardTokenEachFoeOptionalTransferSignRuntimeEffect> =
  {
    effectId: "dead_wizard_token_each_foe_optional_transfer_sign",
    execute(state, player, effect, source, services) {
      for (const foe of services.getOpponentsInSeatingOrder(state, player)) {
        const eligibleCards = [...foe.hand, ...foe.discard].filter(
          (card) => card.definitionId === "esw2_dbg__starter_001"
        );
        if (eligibleCards.length === 0) continue;

        const choice = services.chooseEffectChoice(
          state,
          foe,
          source,
          effect.effectId,
          [
            { choiceKind: "option", choiceId: "decline" },
            ...eligibleCards.map((card) => ({
              choiceKind: "cardTarget" as const,
              choiceId: card.instanceId,
              cards: [card],
              amount: 1,
            })),
          ]
        );
        if (choice?.choiceKind !== "cardTarget") continue;

        const selectedCard = eligibleCards.find(
          (card) => card.instanceId === choice.cards[0]?.instanceId
        );
        if (
          selectedCard === undefined ||
          (!foe.hand.includes(selectedCard) &&
            !foe.discard.includes(selectedCard))
        ) {
          return {
            ok: false,
            error: "Selected Sign disappeared before transfer",
          };
        }

        const moved = services.moveCardToPlayerZone(
          state,
          selectedCard,
          player,
          `${player.playerId}.hand`,
          effect.effectId,
          source
        );
        if (!moved) {
          return {
            ok: false,
            error: `Cannot transfer Sign ${selectedCard.instanceId}`,
          };
        }
        recordGameEvent(state, {
          type: "effectCardGained",
          playerId: player.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          targetCardInstanceId: selectedCard.instanceId,
          targetDefinitionId: selectedCard.definitionId,
          effectId: effect.effectId,
          destination: "hand",
          sourceType: source.sourceType,
        });
      }
      return { ok: true };
    },
  };

const shuffleHandLegendsHandler: EffectRuntimeHandler<DeadWizardTokenShuffleHandLegendsRuntimeEffect> =
  {
    effectId: "dead_wizard_token_shuffle_hand_legends",
    execute(state, player, effect, source, services) {
      const hand = [...player.hand];
      const cardsToMove = hand.filter((card) =>
        cardCountsAsTypeAtDeadWizardTokenResolution(
          state,
          player,
          card,
          "legend",
          source,
          effect.effectId,
          services
        )
      );
      if (cardsToMove.length === 0) return { ok: true };

      for (const card of cardsToMove) {
        const moved = services.moveCardToPlayerZone(
          state,
          card,
          player,
          `${player.playerId}.deck`,
          effect.effectId,
          source
        );
        if (!moved) {
          return {
            ok: false,
            error: `Cannot move legend card ${card.instanceId} to deck`,
          };
        }
      }
      getPhysicalCardLedger(state).shuffleZone(
        `${player.playerId}.deck`,
        state.rng
      );
      return { ok: true };
    },
  };

const shuffleOwnedPermanentsHandler: EffectRuntimeHandler<DeadWizardTokenShuffleOwnedPermanentsRuntimeEffect> =
  {
    effectId: "dead_wizard_token_shuffle_owned_permanents",
    execute(state, player, effect, source, services) {
      const ownedPermanents = getControlledCards(state, player).filter(
        (card) =>
          card.ownerId === player.playerId &&
          getPhysicalCardLedger(state).locateCard(card)?.zoneName ===
            `${player.playerId}.permanents`
      );
      if (ownedPermanents.length === 0) return { ok: true };

      for (const card of ownedPermanents) {
        const moved = services.moveCardToZonePreservingOwner(
          state,
          player,
          card,
          `${player.playerId}.deck`,
          effect.effectId,
          source
        );
        if (!moved) {
          return {
            ok: false,
            error: `Cannot move permanent ${card.instanceId} to deck`,
          };
        }
        removeTemporaryCardControl(state, card);
      }
      getPhysicalCardLedger(state).shuffleZone(
        `${player.playerId}.deck`,
        state.rng
      );
      return { ok: true };
    },
  };

const eachFoeOptionalDiscardHandler: EffectRuntimeHandler<DeadWizardTokenEachFoeOptionalDiscardRuntimeEffect> =
  {
    effectId: "dead_wizard_token_each_foe_optional_discard",
    execute(state, player, effect, source, services) {
      let yesCount = 0;
      for (const foe of services.getOpponentsInSeatingOrder(state, player)) {
        const choice = services.chooseEffectChoice(
          state,
          foe,
          source,
          effect.effectId,
          [
            { choiceKind: "option", choiceId: "apply" },
            { choiceKind: "option", choiceId: "decline" },
          ]
        );
        if (choice?.choiceId === "apply") yesCount += 1;
      }

      const amount = Math.min(yesCount, player.hand.length);
      if (amount === 0) return { ok: true };

      const cardChoices = chooseCardCombinations(player.hand, amount).map(
        (cards) => ({
          choiceKind: "cardTarget" as const,
          choiceId: `discard_${amount}_${cards
            .map((card) => card.instanceId)
            .join("_")}`,
          cards,
          amount,
        })
      );
      const choice = services.chooseEffectChoice(
        state,
        player,
        source,
        effect.effectId,
        cardChoices
      );
      if (
        choice?.choiceKind !== "cardTarget" ||
        choice.cards.length !== amount
      ) {
        return {
          ok: false,
          error: `Must discard exactly ${amount} cards`,
        };
      }

      for (const card of choice.cards) {
        if (!player.hand.includes(card)) {
          return {
            ok: false,
            error: `Selected hand card ${card.instanceId} is no longer available`,
          };
        }
        const moved = services.moveCardToPlayerZone(
          state,
          card,
          player,
          `${player.playerId}.discard`,
          effect.effectId,
          source
        );
        if (!moved) {
          return {
            ok: false,
            error: `Cannot discard hand card ${card.instanceId}`,
          };
        }
        recordGameEvent(state, {
          type: "effectCardDiscarded",
          playerId: player.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          targetCardInstanceId: card.instanceId,
          targetDefinitionId: card.definitionId,
          effectId: effect.effectId,
          sourceType: source.sourceType,
        });
      }
      return { ok: true };
    },
  };

const revealAndOptionalDestroyHandler: EffectRuntimeHandler<DeadWizardTokenRevealAndOptionalDestroyRuntimeEffect> =
  {
    effectId: "dead_wizard_token_reveal_and_optional_destroy",
    execute(state, player, effect, source, services) {
      const choice = chooseRevealedTopCardForDestruction(
        state,
        player,
        source,
        effect.effectId,
        services
      );
      if (!choice.ok || choice.card === undefined || !choice.shouldDestroy) {
        return choice.ok ? { ok: true } : choice;
      }
      return destroyOwnedCard(
        state,
        player,
        choice.card,
        effect.effectId,
        source,
        services
      );
    },
  };

function revealCardAndMaybeGainDeadWizardToken(
  state: GameState,
  player: PlayerState,
  card: CardInstance | undefined,
  effectId: RuntimeEffectId,
  source: EffectSourceContext,
  shouldGain: (definition: CardDefinition, card: CardInstance) => boolean,
  services: EffectRuntimeServices
): EffectExecutionResult {
  if (card === undefined) {
    recordGameEvent(state, {
      type: "effectRevealSkipped",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId,
      sourceType: source.sourceType,
    });
    return { ok: true };
  }

  recordGameEvent(state, {
    type: "effectCardRevealed",
    playerId: player.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    targetCardInstanceId: card.instanceId,
    targetDefinitionId: card.definitionId,
    effectId,
    sourceType: source.sourceType,
  });

  const definition = state.cardDefinitions.get(card.definitionId);
  if (definition === undefined) {
    return {
      ok: false,
      error: `Missing revealed card definition ${card.definitionId}`,
    };
  }
  return shouldGain(definition, card)
    ? services.gainDeadWizardToken(state, player)
    : { ok: true };
}

const revealMainDeckGainIfMayhemHandler: EffectRuntimeHandler<DeadWizardTokenRevealMainDeckGainIfMayhemRuntimeEffect> =
  {
    effectId: "dead_wizard_token_reveal_main_deck_gain_if_mayhem",
    execute(state, player, effect, source, services) {
      return revealCardAndMaybeGainDeadWizardToken(
        state,
        player,
        state.common.mainDeck[0],
        effect.effectId,
        source,
        (definition) => definition.engine.cardKind === "mayhem",
        services
      );
    },
  };

const revealPlayerDeckGainIfLegendHandler: EffectRuntimeHandler<DeadWizardTokenRevealPlayerDeckGainIfLegendRuntimeEffect> =
  {
    effectId: "dead_wizard_token_reveal_player_deck_gain_if_legend",
    execute(state, player, effect, source, services) {
      const card = services.peekTopDeckCard(player, state);
      return revealCardAndMaybeGainDeadWizardToken(
        state,
        player,
        card,
        effect.effectId,
        source,
        (_definition, revealedCard) =>
          cardCountsAsTypeAtDeadWizardTokenResolution(
            state,
            player,
            revealedCard,
            "legend",
            source,
            effect.effectId,
            services
          ),
        services
      );
    },
  };

const loseHalfChipsHandler: EffectRuntimeHandler<DeadWizardTokenLoseHalfChipsRuntimeEffect> =
  {
    effectId: "dead_wizard_token_lose_half_chips",
    execute(state, player, effect, source) {
      changePlayerChips(
        state,
        player,
        -(effect.rounding === "up"
          ? Math.ceil(player.chips / 2)
          : Math.floor(player.chips / 2)),
        source,
        effect.effectId
      );
      return { ok: true };
    },
  };

const rewardKillerChipsHandler: EffectRuntimeHandler<DeadWizardTokenRewardKillerChipsRuntimeEffect> =
  {
    effectId: "dead_wizard_token_reward_killer_chips",
    execute(state, _player, effect, source) {
      const killerPlayerId = source.deadWizardTokenDeathKillerPlayerId;
      const killer = state.players.find(
        (candidate) => candidate.playerId === killerPlayerId
      );
      if (killer !== undefined) {
        changePlayerChips(
          state,
          killer,
          effect.amount,
          source,
          effect.effectId
        );
      }
      return { ok: true };
    },
  };

const selfDestroyForChipsHandler: EffectRuntimeHandler<DeadWizardTokenSelfDestroyForChipsRuntimeEffect> =
  {
    effectId: "dead_wizard_token_self_destroy_for_chips",
    execute(state, player, effect, source) {
      if (source.sourceType !== "deadWizardToken") {
        return {
          ok: false,
          error:
            "dead_wizard_token_self_destroy_for_chips requires a DWT source",
        };
      }
      if (source.tokenInstanceId === undefined) {
        return {
          ok: false,
          error:
            "dead_wizard_token_self_destroy_for_chips requires a token instance",
        };
      }
      const token = player.deadWizardTokens.find(
        (candidate) =>
          candidate.instanceId === source.tokenInstanceId &&
          candidate.definitionId === source.tokenDefinitionId &&
          candidate.ownerId === player.playerId
      );
      if (token === undefined) {
        return {
          ok: false,
          error: "Dead wizard token is not controlled by the active player",
        };
      }
      if (player.chips < effect.chipCost) {
        return {
          ok: false,
          error: `Dead wizard token requires ${effect.chipCost} chips`,
        };
      }

      const removedToken = removeDeadWizardToken(
        player,
        source.tokenInstanceId
      );
      if (removedToken === undefined) {
        return {
          ok: false,
          error: "Dead wizard token disappeared before destruction",
        };
      }

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
      recordGameEvent(state, {
        type: "deadWizardTokenDestroyed",
        playerId: player.playerId,
        tokenInstanceId: removedToken.instanceId,
        tokenDefinitionId: removedToken.definitionId,
        effectId: effect.effectId,
        sourceType: source.sourceType,
      });
      return { ok: true };
    },
  };

const killerOptionalRemoveDinglerHandler: EffectRuntimeHandler<DeadWizardTokenKillerOptionalRemoveDinglerRuntimeEffect> =
  {
    effectId: "dead_wizard_token_killer_optional_remove_dingler",
    execute(state, _player, effect, source, services) {
      const killer = state.players.find(
        (candidate) =>
          candidate.playerId === source.deadWizardTokenDeathKillerPlayerId
      );
      if (killer === undefined || !services.hasDinglerStatus(killer)) {
        return { ok: true };
      }
      const choice = services.chooseEffectChoice(
        state,
        killer,
        source,
        effect.effectId,
        [
          { choiceKind: "option", choiceId: "apply" },
          { choiceKind: "option", choiceId: "decline" },
        ]
      );
      if (choice?.choiceId !== "apply") {
        return { ok: true };
      }
      return services.removeDinglerStatus(
        state,
        killer,
        effect.effectId,
        source
      );
    },
  };

const gainStatusOrDrawFaceHandler: EffectRuntimeHandler<DeadWizardTokenGainStatusOrDrawFaceRuntimeEffect> =
  {
    effectId: "dead_wizard_token_gain_status_or_draw_face",
    execute(state, player, effect, source, services) {
      if (services.hasDinglerStatus(player)) {
        return services.gainDeadWizardToken(state, player);
      }
      return services.gainDinglerStatus(state, player, effect.effectId, source);
    },
    projectDeadWizardTokenFace(effect, context) {
      if (
        effect.statusId !== "dingler" ||
        context.deadWizardTokenWasDinglerAtGain
      ) {
        return { status: "notApplicable" };
      }
      return {
        status: "resolved",
        result: context.services.gainDinglerStatus(
          context.state,
          context.player,
          effect.effectId,
          context.source
        ),
      };
    },
  };

const gainLimpWandToDeckTopHandler: EffectRuntimeHandler<DeadWizardTokenGainLimpWandToDeckTopRuntimeEffect> =
  {
    effectId: "dead_wizard_token_gain_limp_wand_to_deck_top",
    execute(state, player, effect, source, services) {
      return gainLimpWandsFromCommonStack(
        state,
        player,
        effect.amount,
        effect.destination,
        effect.effectId,
        source,
        services
      );
    },
  };

const gainLimpWandsToDeckBottomHandler: EffectRuntimeHandler<DeadWizardTokenGainLimpWandsToDeckBottomRuntimeEffect> =
  {
    effectId: "dead_wizard_token_gain_limp_wands_to_deck_bottom",
    execute(state, player, effect, source, services) {
      return gainLimpWandsFromCommonStack(
        state,
        player,
        effect.amount,
        effect.destination,
        effect.effectId,
        source,
        services
      );
    },
  };

const suppressBasicTrophyChipPayoutHandler: EffectRuntimeHandler<DeadWizardTokenSuppressBasicTrophyChipPayoutRuntimeEffect> =
  {
    effectId: "suppress_basic_trophy_chip_payout",
    execute() {
      return {
        ok: false,
        error:
          "suppress_basic_trophy_chip_payout is a passive dead wizard token effect",
      };
    },
    evaluateBasicTrophyChipPayoutSuppression() {
      return { status: "resolved", result: true };
    },
  };

type DeadWizardTokenEffectDefinitionFor<Id extends DeadWizardTokenEffectId> = {
  readonly effectId: Id;
  readonly decoder: RuntimeEffectDecoder<Id>;
  readonly supportedTimings: EffectRuntimeSupportedTimings;
  readonly supportedModes: EffectRuntimeSupportedModes;
  readonly supportedSourceKinds: EffectRuntimeSupportedSourceKinds;
  readonly handler: EffectRuntimeHandler<RuntimeEffectForId<Id>>;
};

type DeadWizardTokenEffectDefinition = {
  [Id in DeadWizardTokenEffectId]: DeadWizardTokenEffectDefinitionFor<Id>;
}[DeadWizardTokenEffectId];

export interface DeadWizardTokenCatalogTools {
  bindRuntimeEffectDecoder<Id extends DeadWizardTokenEffectId>(
    effectId: Id
  ): RuntimeEffectDecoder<Id>;
}

export function createDeadWizardTokenEffectDefinitions(
  tools: DeadWizardTokenCatalogTools
): readonly DeadWizardTokenEffectDefinition[] {
  const { bindRuntimeEffectDecoder } = tools;
  const supportedTimings = [
    "onDeadWizardTokenFace",
  ] as const satisfies EffectRuntimeSupportedTimings;
  const activationTimings = [
    "activation",
  ] as const satisfies EffectRuntimeSupportedTimings;
  const suppressionTimings = [
    "whileControlled",
  ] as const satisfies EffectRuntimeSupportedTimings;
  const supportedModes = ["combat", "fixture"] as const;
  const supportedSourceKinds = ["deadWizardToken"] as const;
  return [
    {
      effectId: "dead_wizard_token_each_foe_gain_chips",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_each_foe_gain_chips"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: eachFoeGainChipsHandler,
    },
    {
      effectId: "dead_wizard_token_random_discard_to_chosen_foe",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_random_discard_to_chosen_foe"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: randomDiscardToChosenFoeHandler,
    },
    {
      effectId: "dead_wizard_token_each_foe_optional_transfer_sign",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_each_foe_optional_transfer_sign"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: eachFoeOptionalTransferSignHandler,
    },
    {
      effectId: "dead_wizard_token_shuffle_hand_legends",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_shuffle_hand_legends"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: shuffleHandLegendsHandler,
    },
    {
      effectId: "dead_wizard_token_shuffle_owned_permanents",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_shuffle_owned_permanents"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: shuffleOwnedPermanentsHandler,
    },
    {
      effectId: "dead_wizard_token_each_foe_optional_discard",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_each_foe_optional_discard"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: eachFoeOptionalDiscardHandler,
    },
    {
      effectId: "dead_wizard_token_reveal_and_optional_destroy",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_reveal_and_optional_destroy"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: revealAndOptionalDestroyHandler,
    },
    {
      effectId: "dead_wizard_token_damage_equal_chips",
      decoder: bindRuntimeEffectDecoder("dead_wizard_token_damage_equal_chips"),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: damageEqualChipsHandler,
    },
    {
      effectId: "dead_wizard_token_damage_equal_highest_hand_cost",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_damage_equal_highest_hand_cost"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: damageEqualHighestHandCostHandler,
    },
    {
      effectId: "dead_wizard_token_gain_chips",
      decoder: bindRuntimeEffectDecoder("dead_wizard_token_gain_chips"),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: gainChipsHandler,
    },
    {
      effectId: "dead_wizard_token_lose_half_chips",
      decoder: bindRuntimeEffectDecoder("dead_wizard_token_lose_half_chips"),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: loseHalfChipsHandler,
    },
    {
      effectId: "dead_wizard_token_damage_per_discard_legend",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_damage_per_discard_legend"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: damagePerDiscardLegendHandler,
    },
    {
      effectId: "dead_wizard_token_exchange_life",
      decoder: bindRuntimeEffectDecoder("dead_wizard_token_exchange_life"),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: exchangeLifeHandler,
    },
    {
      effectId: "dead_wizard_token_reveal_main_deck_gain_if_mayhem",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_reveal_main_deck_gain_if_mayhem"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: revealMainDeckGainIfMayhemHandler,
    },
    {
      effectId: "dead_wizard_token_reveal_player_deck_gain_if_legend",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_reveal_player_deck_gain_if_legend"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: revealPlayerDeckGainIfLegendHandler,
    },
    {
      effectId: "dead_wizard_token_reward_killer_chips",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_reward_killer_chips"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: rewardKillerChipsHandler,
    },
    {
      effectId: "dead_wizard_token_self_destroy_for_chips",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_self_destroy_for_chips"
      ),
      supportedTimings: activationTimings,
      supportedModes,
      supportedSourceKinds,
      handler: selfDestroyForChipsHandler,
    },
    {
      effectId: "dead_wizard_token_killer_optional_remove_dingler",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_killer_optional_remove_dingler"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: killerOptionalRemoveDinglerHandler,
    },
    {
      effectId: "dead_wizard_token_gain_status_or_draw_face",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_gain_status_or_draw_face"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: gainStatusOrDrawFaceHandler,
    },
    {
      effectId: "dead_wizard_token_gain_limp_wands_per_discard_legend",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_gain_limp_wands_per_discard_legend"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: gainLimpWandsPerDiscardLegendHandler,
    },
    {
      effectId: "dead_wizard_token_gain_limp_wand_to_deck_top",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_gain_limp_wand_to_deck_top"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: gainLimpWandToDeckTopHandler,
    },
    {
      effectId: "dead_wizard_token_gain_limp_wands_to_deck_bottom",
      decoder: bindRuntimeEffectDecoder(
        "dead_wizard_token_gain_limp_wands_to_deck_bottom"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: gainLimpWandsToDeckBottomHandler,
    },
    {
      effectId: "suppress_basic_trophy_chip_payout",
      decoder: bindRuntimeEffectDecoder("suppress_basic_trophy_chip_payout"),
      supportedTimings: suppressionTimings,
      supportedModes,
      supportedSourceKinds,
      handler: suppressBasicTrophyChipPayoutHandler,
    },
  ];
}
