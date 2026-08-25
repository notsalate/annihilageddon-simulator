import { clearFaceUpStates, drawDeckCards } from "./deck-lifecycle.js";
import {
  recordDeckReshuffle,
  recordGameEvent,
  recordTurnPowerChanged,
} from "./event-recorder.js";
import {
  findPlayerPlayedThisTurnCard,
  listLegendMarketCards,
  movePhysicalCard,
} from "./control-ledger.js";
import type { CardDefinition, CardKind } from "./data.js";
import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";
import type {
  EffectChoice,
  EffectExecutionResult,
  EffectRuntimeServices,
  EffectSourceContext,
} from "./effect-runtime-registry.js";
import type { RuntimeEffectDecoder } from "./runtime-effect-decoder.js";
import type {
  EffectTiming,
  RuntimeEffectCondition,
  RuntimeEffectForId,
  RuntimeEffectId,
  RuntimeEffectTarget,
  RuntimeEffectTargetSelector,
} from "./runtime-effect.js";
import {
  allEffectRuntimeModes,
  immediateEffectTimings,
} from "./effect-runtime-catalog-shared.js";
import { createUnsupportedEffectHandler } from "./effect-runtime-family-support.js";
import { gainLimpWandsFromCommonStack } from "./effect-runtime-special-card-stack.js";
import type {
  ObjectFields,
  OptionalField,
  RequiredField,
  ValueDecoder,
} from "./effect-runtime-family-support.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";
import { calculateEffectiveCardCost } from "./effective-values.js";
import { cardMatchesTypeForPlayer } from "./card-type-runtime.js";

type EffectWithOptionalTiming<Id extends string> = {
  effectId: Id;
  timing?: EffectTiming;
};

type PositiveAmount = { amount: number };
type Targetable = {
  target?: RuntimeEffectTarget;
  targetSelector?: RuntimeEffectTargetSelector;
};
type Conditioned = {
  condition?: RuntimeEffectCondition;
};

export type GainCardRuntimeEffect = EffectWithOptionalTiming<"gain_card"> &
  Targetable & { destination: "discard" };
export type DiscardCardRuntimeEffect =
  EffectWithOptionalTiming<"discard_card"> &
    Targetable & { emptyChoice?: "fail" };
export type DiscardRandomHandCardsRuntimeEffect =
  EffectWithOptionalTiming<"discard_random_hand_cards"> & {
    amount: number;
    targetSelector: "chosenFoe";
    rng: "seeded";
  };
export type DiscardSelfRuntimeEffect = EffectWithOptionalTiming<"discard_self">;
export type DiscardHandThenDrawCardsRuntimeEffect =
  EffectWithOptionalTiming<"discard_hand_then_draw_cards"> & {
    drawAmount: number;
    firstCardOfTurn?: true;
  };
export type DestroyCardRuntimeEffect =
  EffectWithOptionalTiming<"destroy_card"> & Targetable;
export type DestroyOwnCardsRuntimeEffect =
  EffectWithOptionalTiming<"destroy_own_cards"> & {
    amount?: number;
    sourceZones?: "hand" | "discard" | ("hand" | "discard")[];
    chooser?: "controller" | "defendingPlayer";
    repeatUntilDeclined?: true;
  };
export type DestroyRandomLegendMarketCardRuntimeEffect = {
  effectId: "destroy_random_legend_market_card";
  timing: "onPlay";
  rememberAs: "destroyedLegend";
  sourceZone: "legendMarket";
  rng: "seeded";
};
export type ReturnDiscardToHandRuntimeEffect =
  EffectWithOptionalTiming<"return_discard_to_hand"> &
    PositiveAmount & {
      cardTypes?: string[];
      excludeSource?: true;
      required?: true;
      allMatching?: true;
    };
export type RevealTopCardRuntimeEffect =
  EffectWithOptionalTiming<"reveal_top_card"> & {
    source: "activePlayerDeck" | "mainDeck";
    optionalTakeToHand?: true;
    excludeCardKind?: Extract<CardKind, "mayhem">;
  };
export type RevealTopCardChooseDestroyOrPowerRuntimeEffect =
  EffectWithOptionalTiming<"reveal_top_card_choose_destroy_or_power"> & {
    source: "activePlayerDeck";
  };
export type RevealTopCardChooseDestroyOrAttackEqualCostRuntimeEffect =
  EffectWithOptionalTiming<"reveal_top_card_choose_destroy_or_attack_equal_cost"> & {
    source: "activePlayerDeck";
    targetSelector: "chosenFoe";
  };
export type PlayTopCardRuntimeEffect =
  EffectWithOptionalTiming<"play_top_card"> & {
    source: "activePlayerDeck";
    destination: "play";
  };
export type PlayTopCardFromFoeDeckRuntimeEffect =
  EffectWithOptionalTiming<"play_top_card_from_foe_deck"> &
    Conditioned & {
      targetSelector: "chosenFoe";
      nonOngoingCleanupDestination?: "ownerDiscard";
      ongoingOwnership?: "controller";
      ongoingCleanupDestination?: "ownerDiscard";
    };
export type WildMagicOption =
  | { effectId: "add_power"; amount: number }
  | {
      effectId: "play_top_card_from_foe_deck";
      targetSelector: "chosenFoe";
      nonOngoingCleanupDestination?: "ownerDiscard";
      ongoingOwnership?: "controller";
    };
export type WildMagicChoiceRuntimeEffect = {
  effectId: "wild_magic_choice";
  timing: "onPlay";
  options: WildMagicOption[];
};
export type TopdeckGainedCardRuntimeEffect = {
  effectId: "topdeck_gained_card";
  timing: "onGainCard";
  optional?: boolean;
  destination?: "deckTop";
  cardTypes?: string[];
  isOngoing?: true;
};
export type OptionalGainMarketCardsToHandThisTurnRuntimeEffect = {
  effectId: "optional_gain_market_cards_to_hand_this_turn";
  timing: "onPlay";
  appliesTo: "cardsGainedFromMainMarket";
  chooser: "controller";
  destinationOverride: "hand";
};
export type OnGainSelfGainLimpWandsRuntimeEffect = {
  effectId: "on_gain_self_gain_limp_wands";
  timing: "onGain";
  destination: "gainingPlayerDiscard";
  amount: number;
};

export interface CardOwnershipChoiceEffectPayloadMap {
  gain_card: GainCardRuntimeEffect;
  discard_card: DiscardCardRuntimeEffect;
  discard_random_hand_cards: DiscardRandomHandCardsRuntimeEffect;
  discard_self: DiscardSelfRuntimeEffect;
  discard_hand_then_draw_cards: DiscardHandThenDrawCardsRuntimeEffect;
  destroy_card: DestroyCardRuntimeEffect;
  destroy_own_cards: DestroyOwnCardsRuntimeEffect;
  destroy_random_legend_market_card: DestroyRandomLegendMarketCardRuntimeEffect;
  return_discard_to_hand: ReturnDiscardToHandRuntimeEffect;
  reveal_top_card: RevealTopCardRuntimeEffect;
  reveal_top_card_choose_destroy_or_power: RevealTopCardChooseDestroyOrPowerRuntimeEffect;
  reveal_top_card_choose_destroy_or_attack_equal_cost: RevealTopCardChooseDestroyOrAttackEqualCostRuntimeEffect;
  play_top_card: PlayTopCardRuntimeEffect;
  play_top_card_from_foe_deck: PlayTopCardFromFoeDeckRuntimeEffect;
  wild_magic_choice: WildMagicChoiceRuntimeEffect;
  topdeck_gained_card: TopdeckGainedCardRuntimeEffect;
  optional_gain_market_cards_to_hand_this_turn: OptionalGainMarketCardsToHandThisTurnRuntimeEffect;
  on_gain_self_gain_limp_wands: OnGainSelfGainLimpWandsRuntimeEffect;
}

export type CardOwnershipChoiceEffectId =
  | "gain_card"
  | "discard_card"
  | "discard_random_hand_cards"
  | "discard_self"
  | "discard_hand_then_draw_cards"
  | "destroy_card"
  | "destroy_own_cards"
  | "destroy_random_legend_market_card"
  | "return_discard_to_hand"
  | "reveal_top_card"
  | "reveal_top_card_choose_destroy_or_power"
  | "reveal_top_card_choose_destroy_or_attack_equal_cost"
  | "play_top_card"
  | "play_top_card_from_foe_deck"
  | "topdeck_gained_card"
  | "optional_gain_market_cards_to_hand_this_turn"
  | "on_gain_self_gain_limp_wands";

export const cardOwnershipChoiceEffectIds = [
  "gain_card",
  "discard_card",
  "discard_random_hand_cards",
  "discard_self",
  "discard_hand_then_draw_cards",
  "destroy_card",
  "destroy_own_cards",
  "destroy_random_legend_market_card",
  "return_discard_to_hand",
  "reveal_top_card",
  "reveal_top_card_choose_destroy_or_power",
  "reveal_top_card_choose_destroy_or_attack_equal_cost",
  "play_top_card",
  "play_top_card_from_foe_deck",
  "topdeck_gained_card",
  "optional_gain_market_cards_to_hand_this_turn",
  "on_gain_self_gain_limp_wands",
] as const satisfies readonly CardOwnershipChoiceEffectId[];

export interface CardOwnershipChoiceEffectDecoderTools {
  defineDecoder<Id extends CardOwnershipChoiceEffectId>(
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
  positiveInteger: ValueDecoder<number>;
  nonNegativeInteger: ValueDecoder<number>;
  nonEmptyStringArray: ValueDecoder<string[]>;
  optionalCondition: OptionalField<
    NonNullable<RuntimeEffectForId<"play_top_card_from_foe_deck">["condition"]>
  >;
  optionalTiming: OptionalField<EffectTiming>;
  optionalTarget: OptionalField<
    NonNullable<RuntimeEffectForId<"gain_card">["target"]>
  >;
  optionalTargetSelector: OptionalField<
    NonNullable<RuntimeEffectForId<"gain_card">["targetSelector"]>
  >;
  booleanValue: ValueDecoder<boolean>;
  destroyOwnCardsSourceZones: ValueDecoder<
    "hand" | "discard" | ("hand" | "discard")[]
  >;
  requireNestedTargetSelector(
    label: string,
    selector: "mainMarketCard" | "activePlayerHandCard"
  ): (
    subjectId: string,
    effect: RuntimeEffectForId<CardOwnershipChoiceEffectId>
  ) => string[];
}

export type CardOwnershipChoiceEffectDecoders = {
  [Id in CardOwnershipChoiceEffectId]: RuntimeEffectDecoder<Id>;
};

export function createCardOwnershipChoiceEffectDecoders(
  tools: CardOwnershipChoiceEffectDecoderTools
): CardOwnershipChoiceEffectDecoders {
  const {
    defineDecoder,
    required,
    optional,
    literal,
    positiveInteger,
    nonNegativeInteger,
    nonEmptyStringArray,
    optionalCondition,
    optionalTiming,
    optionalTarget,
    optionalTargetSelector,
    booleanValue,
    destroyOwnCardsSourceZones,
    requireNestedTargetSelector,
  } = tools;

  return {
    gain_card: defineDecoder(
      "gain_card",
      {
        effectId: required(literal("gain_card")),
        timing: optionalTiming,
        target: optionalTarget,
        targetSelector: optionalTargetSelector,
        destination: required(literal("discard")),
      },
      requireNestedTargetSelector("gain", "mainMarketCard")
    ),
    discard_card: defineDecoder(
      "discard_card",
      {
        effectId: required(literal("discard_card")),
        timing: optionalTiming,
        target: optionalTarget,
        targetSelector: optionalTargetSelector,
        emptyChoice: optional(literal("fail")),
      },
      requireNestedTargetSelector("discard", "activePlayerHandCard")
    ),
    discard_random_hand_cards: defineDecoder("discard_random_hand_cards", {
      effectId: required(literal("discard_random_hand_cards")),
      timing: optionalTiming,
      amount: required(positiveInteger),
      targetSelector: required(literal("chosenFoe")),
      rng: required(literal("seeded")),
    }),
    discard_self: defineDecoder("discard_self", {
      effectId: required(literal("discard_self")),
      timing: optionalTiming,
    }),
    discard_hand_then_draw_cards: defineDecoder(
      "discard_hand_then_draw_cards",
      {
        effectId: required(literal("discard_hand_then_draw_cards")),
        timing: optionalTiming,
        drawAmount: required(positiveInteger),
        firstCardOfTurn: optional(literal(true)),
      }
    ),
    destroy_card: defineDecoder(
      "destroy_card",
      {
        effectId: required(literal("destroy_card")),
        timing: optionalTiming,
        target: optionalTarget,
        targetSelector: optionalTargetSelector,
      },
      requireNestedTargetSelector("destroy", "activePlayerHandCard")
    ),
    destroy_own_cards: defineDecoder("destroy_own_cards", {
      effectId: required(literal("destroy_own_cards")),
      timing: optionalTiming,
      amount: optional(nonNegativeInteger),
      sourceZones: optional(destroyOwnCardsSourceZones),
      chooser: optional(oneOfTools(["controller", "defendingPlayer"] as const)),
      repeatUntilDeclined: optional(literal(true)),
    }),
    destroy_random_legend_market_card: defineDecoder(
      "destroy_random_legend_market_card",
      {
        effectId: required(literal("destroy_random_legend_market_card")),
        timing: required(literal("onPlay")),
        rememberAs: required(literal("destroyedLegend")),
        sourceZone: required(literal("legendMarket")),
        rng: required(literal("seeded")),
      }
    ),
    return_discard_to_hand: defineDecoder("return_discard_to_hand", {
      effectId: required(literal("return_discard_to_hand")),
      timing: optionalTiming,
      amount: required(positiveInteger),
      cardTypes: optional(nonEmptyStringArray),
      excludeSource: optional(literal(true)),
      required: optional(literal(true)),
      allMatching: optional(literal(true)),
    }),
    reveal_top_card: defineDecoder("reveal_top_card", {
      effectId: required(literal("reveal_top_card")),
      timing: optionalTiming,
      source: required(oneOfTools(["activePlayerDeck", "mainDeck"] as const)),
      optionalTakeToHand: optional(literal(true)),
      excludeCardKind: optional(literal("mayhem")),
    }),
    reveal_top_card_choose_destroy_or_power: defineDecoder(
      "reveal_top_card_choose_destroy_or_power",
      {
        effectId: required(literal("reveal_top_card_choose_destroy_or_power")),
        timing: optionalTiming,
        source: required(literal("activePlayerDeck")),
      }
    ),
    reveal_top_card_choose_destroy_or_attack_equal_cost: defineDecoder(
      "reveal_top_card_choose_destroy_or_attack_equal_cost",
      {
        effectId: required(
          literal("reveal_top_card_choose_destroy_or_attack_equal_cost")
        ),
        timing: optionalTiming,
        source: required(literal("activePlayerDeck")),
        targetSelector: required(literal("chosenFoe")),
      }
    ),
    play_top_card: defineDecoder("play_top_card", {
      effectId: required(literal("play_top_card")),
      timing: optionalTiming,
      source: required(literal("activePlayerDeck")),
      destination: required(literal("play")),
    }),
    play_top_card_from_foe_deck: defineDecoder("play_top_card_from_foe_deck", {
      effectId: required(literal("play_top_card_from_foe_deck")),
      timing: optionalTiming,
      condition: optionalCondition,
      targetSelector: required(literal("chosenFoe")),
      nonOngoingCleanupDestination: optional(literal("ownerDiscard")),
      ongoingOwnership: optional(literal("controller")),
      ongoingCleanupDestination: optional(literal("ownerDiscard")),
    }),
    topdeck_gained_card: defineDecoder("topdeck_gained_card", {
      effectId: required(literal("topdeck_gained_card")),
      timing: required(literal("onGainCard")),
      optional: optional(booleanValue),
      destination: optional(literal("deckTop")),
      cardTypes: optional(nonEmptyStringArray),
      isOngoing: optional(literal(true)),
    }),
    optional_gain_market_cards_to_hand_this_turn: defineDecoder(
      "optional_gain_market_cards_to_hand_this_turn",
      {
        effectId: required(
          literal("optional_gain_market_cards_to_hand_this_turn")
        ),
        timing: required(literal("onPlay")),
        appliesTo: required(literal("cardsGainedFromMainMarket")),
        chooser: required(literal("controller")),
        destinationOverride: required(literal("hand")),
      }
    ),
    on_gain_self_gain_limp_wands: defineDecoder(
      "on_gain_self_gain_limp_wands",
      {
        effectId: required(literal("on_gain_self_gain_limp_wands")),
        timing: required(literal("onGain")),
        destination: required(literal("gainingPlayerDiscard")),
        amount: required(positiveInteger),
      }
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

const topdeckGainedCardHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"topdeck_gained_card">
> = {
  effectId: "topdeck_gained_card",
  execute() {
    return {
      ok: false,
      error: "topdeck_gained_card is a gained-card replacement effect",
    };
  },
};

const destroyRandomLegendMarketCardHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"destroy_random_legend_market_card">
> = {
  effectId: "destroy_random_legend_market_card",
  execute(state, player, effect, source, services) {
    state.turn.rememberedDestroyedLegendCost = undefined;
    const legendMarketCards = listLegendMarketCards(state);
    if (legendMarketCards.length === 0) {
      return { ok: true };
    }
    const targetIndex = state.rng.nextInt(legendMarketCards.length);
    const targetCard = legendMarketCards[targetIndex];
    if (targetCard === undefined) {
      return { ok: true };
    }
    const targetDefinition = state.cardDefinitions.get(targetCard.definitionId);
    if (targetDefinition === undefined) {
      return {
        ok: false,
        error: `Missing destroyed legend definition ${targetCard.definitionId}`,
      };
    }
    const destination = services.getDestroyDestination(state, targetCard);
    if (!destination.ok) return destination;
    const moved = movePhysicalCard(
      state,
      targetCard.instanceId,
      destination.zoneName,
      "back",
      "legendMarket"
    );
    if (!moved.ok) {
      return { ok: false, error: moved.reason };
    }
    state.turn.rememberedDestroyedLegendCost = targetDefinition.engine.cost;
    recordGameEvent(state, {
      type: "effectCardDestroyed",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: targetCard.instanceId,
      targetDefinitionId: targetCard.definitionId,
      effectId: effect.effectId,
      sourceType: source.sourceType,
    });
    return { ok: true };
  },
};

const optionalGainMarketCardsToHandThisTurnHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"optional_gain_market_cards_to_hand_this_turn">
> = {
  effectId: "optional_gain_market_cards_to_hand_this_turn",
  execute(state, _player, _effect, source) {
    if (
      !state.turn.mainMarketCardHandReplacementSourceCardIds.includes(
        source.cardInstanceId
      )
    ) {
      state.turn.mainMarketCardHandReplacementSourceCardIds.push(
        source.cardInstanceId
      );
    }
    return { ok: true };
  },
};

const onGainSelfGainLimpWandsHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"on_gain_self_gain_limp_wands">
> = {
  effectId: "on_gain_self_gain_limp_wands",
  execute(state, player, effect, source, services) {
    return gainLimpWandsFromCommonStack(
      state,
      player,
      effect.amount,
      "discard",
      effect.effectId,
      source,
      services
    );
  },
};

export function resolveMainMarketGainDestination(
  state: GameState,
  player: PlayerState,
  sourceZone: string,
  initialDestination: "discard" | "deckTop",
  services: Pick<EffectRuntimeServices, "chooseEffectChoice">
):
  | { ok: true; destination: "discard" | "deckTop" | "hand" }
  | { ok: false; error: string } {
  if (sourceZone !== "mainMarket") {
    return { ok: true, destination: initialDestination };
  }

  let destination: "discard" | "deckTop" | "hand" = initialDestination;
  for (const sourceCardInstanceId of state.turn
    .mainMarketCardHandReplacementSourceCardIds) {
    const playedCard = findPlayerPlayedThisTurnCard(
      player,
      sourceCardInstanceId
    );
    if (playedCard === undefined) {
      continue;
    }
    const playedDefinition = state.cardDefinitions.get(playedCard.definitionId);
    if (playedDefinition === undefined) {
      return {
        ok: false,
        error: `Missing played card definition ${playedCard.definitionId}`,
      };
    }
    const source: EffectSourceContext = {
      sourceType: "card",
      runtimeMode: state.runtimeMode,
      playerId: player.playerId,
      cardInstanceId: playedCard.instanceId,
      definitionId: playedDefinition.cardId,
    };
    const choice = services.chooseEffectChoice(
      state,
      player,
      source,
      "optional_gain_market_cards_to_hand_this_turn",
      [
        { choiceKind: "option", choiceId: "apply" },
        { choiceKind: "option", choiceId: "decline" },
      ]
    );
    if (choice?.choiceId === "apply") {
      destination = "hand";
    }
  }

  return { ok: true, destination };
}

const gainCardHandler: EffectRuntimeHandler<RuntimeEffectForId<"gain_card">> = {
  effectId: "gain_card",
  execute(state, player, effect, source, services) {
    const targetResult = services.resolveTargetChoice(
      state,
      player,
      effect,
      source
    );
    if (!targetResult.ok) return targetResult;
    if (targetResult.choice === undefined) return { ok: true };

    const choice = services.requireCardChoice(
      targetResult.choice,
      effect.effectId
    );
    if (!choice.ok) return choice;
    const moved = services.moveGainedCardToPlayerDestination(
      state,
      player,
      choice.card,
      effect.destination
    );
    if (!moved.ok) return moved;

    recordGameEvent(state, {
      type: "effectCardGained",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: choice.card.instanceId,
      targetDefinitionId: choice.card.definitionId,
      effectId: effect.effectId,
      destination: moved.destination,
      sourceType: source.sourceType,
    });
    return { ok: true };
  },
};

const discardCardHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"discard_card">
> = {
  effectId: "discard_card",
  execute(state, player, effect, source, services) {
    const targetResult = services.resolveTargetChoice(
      state,
      player,
      effect,
      source
    );
    if (!targetResult.ok) return targetResult;
    if (targetResult.choice === undefined) return { ok: true };

    const choice = services.requireCardChoice(
      targetResult.choice,
      effect.effectId
    );
    if (!choice.ok) return choice;
    const moved = services.moveCardToPlayerZone(
      state,
      choice.card,
      player,
      player.discard,
      `${player.playerId}.discard`,
      effect.effectId,
      source
    );
    if (!moved) {
      return {
        ok: false,
        error: `Cannot move card ${choice.card.instanceId}`,
      };
    }

    recordGameEvent(state, {
      type: "effectCardDiscarded",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: choice.card.instanceId,
      targetDefinitionId: choice.card.definitionId,
      effectId: effect.effectId,
      sourceType: source.sourceType,
    });
    return { ok: true };
  },
};

const discardRandomHandCardsHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"discard_random_hand_cards">
> = {
  effectId: "discard_random_hand_cards",
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
        error: "Random hand discard requires a player target",
      };
    }

    const targetPlayer = targetResult.choice.player;
    for (let index = 0; index < effect.amount; index += 1) {
      if (targetPlayer.hand.length === 0) break;
      const card =
        targetPlayer.hand[state.rng.nextInt(targetPlayer.hand.length)];
      if (card === undefined) break;
      const moved = services.moveCardToPlayerZone(
        state,
        card,
        targetPlayer,
        targetPlayer.discard,
        `${targetPlayer.playerId}.discard`,
        effect.effectId,
        source
      );
      if (!moved) {
        return {
          ok: false,
          error: `Cannot move card ${card.instanceId}`,
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

const discardHandThenDrawCardsHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"discard_hand_then_draw_cards">
> = {
  effectId: "discard_hand_then_draw_cards",
  execute(state, player, effect, source, services) {
    if (
      effect.firstCardOfTurn === true &&
      player.playedThisTurn[0]?.instanceId !== source.cardInstanceId
    ) {
      return { ok: true };
    }

    const choice = services.chooseEffectChoice(
      state,
      player,
      source,
      effect.effectId,
      [
        { choiceKind: "option", choiceId: "apply" },
        { choiceKind: "option", choiceId: "decline" },
      ]
    );
    if (choice?.choiceId !== "apply") return { ok: true };

    const discardedCards = player.hand.splice(0);
    clearFaceUpStates(discardedCards);
    player.discard.push(...discardedCards);
    const drawResult = drawDeckCards(
      player.deck,
      player.discard,
      effect.drawAmount,
      state.rng,
      () => recordDeckReshuffle(state, player.playerId)
    );
    player.hand.push(...drawResult.cards);
    recordGameEvent(state, {
      type: "effectDrawCardsApplied",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: effect.effectId,
      amount: drawResult.cards.length,
      sourceType: source.sourceType,
    });
    return { ok: true };
  },
};

const destroyCardHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"destroy_card">
> = {
  effectId: "destroy_card",
  execute(state, player, effect, source, services) {
    const targetResult = services.resolveTargetChoice(
      state,
      player,
      effect,
      source
    );
    if (!targetResult.ok) return targetResult;
    if (targetResult.choice === undefined) return { ok: true };

    const choice = services.requireCardChoice(
      targetResult.choice,
      effect.effectId
    );
    if (!choice.ok) return choice;
    const destination = services.getDestroyDestination(state, choice.card);
    if (!destination.ok) return destination;
    const moved = services.moveCardToZonePreservingOwner(
      state,
      player,
      choice.card,
      destination.zone,
      destination.zoneName,
      effect.effectId,
      source
    );
    if (!moved) {
      return {
        ok: false,
        error: `Cannot move card ${choice.card.instanceId}`,
      };
    }

    recordGameEvent(state, {
      type: "effectCardDestroyed",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: choice.card.instanceId,
      targetDefinitionId: choice.card.definitionId,
      effectId: effect.effectId,
      sourceType: source.sourceType,
    });
    return { ok: true };
  },
};

export function executeReturnDiscardToHand(
  state: GameState,
  player: PlayerState,
  amount: number,
  source: EffectSourceContext,
  services: EffectRuntimeServices,
  options: {
    cardTypes?: readonly string[];
    excludeSource?: boolean;
    required?: boolean;
    allMatching?: boolean;
  } = {}
): EffectExecutionResult {
  const eligibleCards = player.discard.filter((card) => {
    if (options.excludeSource && card.instanceId === source.cardInstanceId) {
      return false;
    }
    if (options.cardTypes === undefined) return true;
    const definition = state.cardDefinitions.get(card.definitionId);
    return (
      definition !== undefined &&
      options.cardTypes.some(
        (cardType) =>
          definition.engine.cardTypes.includes(cardType) ||
          (cardType === "wand" && definition.engine.cardKind === "limpWand")
      )
    );
  });
  if (options.allMatching === true) {
    if (eligibleCards.length === 0) return { ok: true };
    const choice = services.chooseEffectChoice(
      state,
      player,
      source,
      "return_discard_to_hand",
      [
        { choiceKind: "option", choiceId: "apply" },
        { choiceKind: "option", choiceId: "decline" },
      ]
    );
    if (choice?.choiceId !== "apply") return { ok: true };
    for (const card of eligibleCards) {
      const moved = services.moveCardToPlayerZone(
        state,
        card,
        player,
        player.hand,
        `${player.playerId}.hand`,
        "return_discard_to_hand",
        source
      );
      if (!moved) {
        return {
          ok: false,
          error: `Cannot return discard card ${card.instanceId} to hand`,
        };
      }
    }
    recordGameEvent(state, {
      type: "effectCardsReturnedToHand",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: "return_discard_to_hand",
      amount: eligibleCards.length,
      sourceType: source.sourceType,
    });
    return { ok: true };
  }
  const choice = services.chooseEffectChoice(
    state,
    player,
    source,
    "return_discard_to_hand",
    buildDiscardReturnChoices(
      eligibleCards,
      amount,
      options.required === true ? 1 : 0
    )
  );
  const returned =
    choice?.choiceKind === "cardTarget" ? choice.cards : readonlyEmptyCards;
  for (const card of returned) {
    if (!eligibleCards.includes(card) || !player.discard.includes(card)) {
      return {
        ok: false,
        error: `Selected discard card ${card.instanceId} is no longer available`,
      };
    }
    const moved = services.moveCardToPlayerZone(
      state,
      card,
      player,
      player.hand,
      `${player.playerId}.hand`,
      "return_discard_to_hand",
      source
    );
    if (!moved) {
      return {
        ok: false,
        error: `Cannot return discard card ${card.instanceId} to hand`,
      };
    }
  }
  recordGameEvent(state, {
    type: "effectCardsReturnedToHand",
    playerId: player.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId: "return_discard_to_hand",
    amount: returned.length,
    sourceType: source.sourceType,
  });
  return { ok: true };
}

const readonlyEmptyCards: readonly CardInstance[] = [];

function buildDiscardReturnChoices(
  discard: readonly CardInstance[],
  maxAmount: number,
  minimumAmount = 0
): EffectChoice[] {
  const cappedAmount = Math.min(maxAmount, discard.length);
  const choices: EffectChoice[] = [];
  for (
    let amount = cappedAmount;
    amount >= Math.max(1, minimumAmount);
    amount -= 1
  ) {
    for (const cards of chooseCardCombinations(discard, amount)) {
      choices.push({
        choiceKind: "cardTarget",
        choiceId: `return_${amount}_${cards
          .map((card) => card.instanceId)
          .join("_")}`,
        amount,
        cards,
      });
    }
  }
  if (minimumAmount === 0) {
    choices.push({
      choiceKind: "cardTarget",
      choiceId: "return_0",
      amount: 0,
      cards: [],
    });
  }
  return choices;
}

function chooseCardCombinations(
  cards: readonly CardInstance[],
  amount: number,
  startIndex = 0
): CardInstance[][] {
  if (amount === 0) return [[]];
  const combinations: CardInstance[][] = [];
  for (let index = startIndex; index <= cards.length - amount; index += 1) {
    const card = cards[index];
    if (card === undefined) continue;
    for (const tail of chooseCardCombinations(cards, amount - 1, index + 1)) {
      combinations.push([card, ...tail]);
    }
  }
  return combinations;
}

export function destroyOwnedCard(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
  effectId: RuntimeEffectId,
  source: EffectSourceContext,
  services: EffectRuntimeServices
): EffectExecutionResult {
  const destination = services.getDestroyDestination(state, card);
  if (!destination.ok) return destination;
  const moved = services.moveCardToZonePreservingOwner(
    state,
    player,
    card,
    destination.zone,
    destination.zoneName,
    effectId,
    source
  );
  if (!moved) {
    return {
      ok: false,
      error: `Cannot destroy card ${card.instanceId}`,
    };
  }
  recordGameEvent(state, {
    type: "effectCardDestroyed",
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

const destroyOwnCardsHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"destroy_own_cards">
> = {
  effectId: "destroy_own_cards",
  execute(state, player, effect, source, services) {
    const sourceZones =
      effect.sourceZones === undefined
        ? ["hand" as const]
        : Array.isArray(effect.sourceZones)
          ? effect.sourceZones
          : [effect.sourceZones];
    const candidates = sourceZones.flatMap((zone) =>
      zone === "hand" ? player.hand : player.discard
    );
    if (effect.repeatUntilDeclined) {
      let available = [...candidates];
      while (available.length > 0) {
        const choices: EffectChoice[] = [
          { choiceKind: "option", choiceId: "decline" },
          ...available.map(
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
        const card = choice.cards[0];
        if (card === undefined || !available.includes(card)) {
          return {
            ok: false,
            error: "Selected card is no longer available for destruction",
          };
        }
        const destroyed = destroyOwnedCard(
          state,
          player,
          card,
          effect.effectId,
          source,
          services
        );
        if (!destroyed.ok) return destroyed;
        available = available.filter(
          (candidate) => candidate.instanceId !== card.instanceId
        );
      }
      return { ok: true };
    }

    const amount = Math.min(effect.amount ?? 1, candidates.length);
    const choices: EffectChoice[] = [
      { choiceKind: "option", choiceId: "decline" },
    ];
    for (let choiceAmount = amount; choiceAmount >= 1; choiceAmount -= 1) {
      for (const cards of chooseCardCombinations(candidates, choiceAmount)) {
        choices.push({
          choiceKind: "cardTarget",
          choiceId:
            choiceAmount === 1
              ? `destroy_${cards[0]?.instanceId ?? ""}`
              : `destroy_${choiceAmount}_${cards
                  .map((card) => card.instanceId)
                  .join("_")}`,
          cards,
          amount: choiceAmount,
        });
      }
    }
    const choice = services.chooseEffectChoice(
      state,
      player,
      source,
      effect.effectId,
      choices
    );
    if (choice?.choiceKind !== "cardTarget") return { ok: true };

    for (const card of choice.cards) {
      if (!candidates.includes(card)) {
        return {
          ok: false,
          error: `Selected card ${card.instanceId} is no longer available for destruction`,
        };
      }
      const destroyed = destroyOwnedCard(
        state,
        player,
        card,
        effect.effectId,
        source,
        services
      );
      if (!destroyed.ok) return destroyed;
    }
    return { ok: true };
  },
};

const revealTopCardHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"reveal_top_card">
> = {
  effectId: "reveal_top_card",
  execute(state, player, effect, source, services) {
    const card =
      effect.source === "mainDeck"
        ? state.common.mainDeck[0]
        : services.peekTopDeckCard(player, state);
    if (card === undefined) {
      recordGameEvent(state, {
        type: "effectRevealSkipped",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: effect.effectId,
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
      effectId: effect.effectId,
      sourceType: source.sourceType,
    });
    if (effect.optionalTakeToHand !== true) {
      return { ok: true };
    }

    const definition = state.cardDefinitions.get(card.definitionId);
    if (definition === undefined) {
      return {
        ok: false,
        error: `Missing revealed card definition ${card.definitionId}`,
      };
    }
    const canTake =
      effect.excludeCardKind === undefined ||
      definition.engine.cardKind !== effect.excludeCardKind;
    const choices: EffectChoice[] = [
      ...(canTake ? [{ choiceKind: "option" as const, choiceId: "take" }] : []),
      { choiceKind: "option", choiceId: "decline" },
    ];
    const choice = services.chooseEffectChoice(
      state,
      player,
      source,
      effect.effectId,
      choices
    );
    if (choice?.choiceId !== "take") return { ok: true };

    const moved = services.moveCardToPlayerZone(
      state,
      card,
      player,
      player.hand,
      `${player.playerId}.hand`,
      effect.effectId,
      source
    );
    if (!moved) {
      return {
        ok: false,
        error: `Cannot take revealed card ${card.instanceId} to hand`,
      };
    }
    recordGameEvent(state, {
      type: "effectCardGained",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: card.instanceId,
      targetDefinitionId: card.definitionId,
      effectId: effect.effectId,
      destination: "hand",
      sourceType: source.sourceType,
    });
    return { ok: true };
  },
};

type RevealedTopCardDestructionChoice =
  | { ok: true; card: undefined }
  | {
      ok: true;
      card: CardInstance;
      definition: CardDefinition;
      shouldDestroy: boolean;
    }
  | { ok: false; error: string };

export function chooseRevealedTopCardForDestruction(
  state: GameState,
  player: PlayerState,
  source: EffectSourceContext,
  effectId: RuntimeEffectId,
  services: EffectRuntimeServices
): RevealedTopCardDestructionChoice {
  const card = services.peekTopDeckCard(player, state);
  if (card === undefined) {
    recordGameEvent(state, {
      type: "effectRevealSkipped",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId,
      sourceType: source.sourceType,
    });
    return { ok: true, card: undefined };
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

  const choice = services.chooseEffectChoice(state, player, source, effectId, [
    { choiceKind: "option", choiceId: "decline" },
    {
      choiceKind: "cardTarget",
      choiceId: `destroy_${card.instanceId}`,
      cards: [card],
      amount: 1,
    },
  ]);

  return {
    ok: true,
    card,
    definition,
    shouldDestroy: choice?.choiceId === `destroy_${card.instanceId}`,
  };
}

const revealTopCardChooseDestroyOrPowerHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"reveal_top_card_choose_destroy_or_power">
> = {
  effectId: "reveal_top_card_choose_destroy_or_power",
  execute(state, player, _effect, source, services) {
    const choice = chooseRevealedTopCardForDestruction(
      state,
      player,
      source,
      "reveal_top_card_choose_destroy_or_power",
      services
    );
    if (!choice.ok) return choice;
    if (choice.card === undefined) return { ok: true };
    if (choice.shouldDestroy) {
      return destroyOwnedCard(
        state,
        player,
        choice.card,
        "reveal_top_card_choose_destroy_or_power",
        source,
        services
      );
    }

    const powerBefore = state.turn.power;
    state.turn.power += calculateEffectiveCardCost(
      state,
      player.playerId,
      choice.definition,
      choice.card,
      cardMatchesTypeForPlayer
    );
    recordTurnPowerChanged(
      state,
      player,
      source,
      "reveal_top_card_choose_destroy_or_power",
      powerBefore,
      state.turn.power
    );
    return { ok: true };
  },
};

const revealTopCardChooseDestroyOrAttackEqualCostHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"reveal_top_card_choose_destroy_or_attack_equal_cost">
> = {
  effectId: "reveal_top_card_choose_destroy_or_attack_equal_cost",
  execute(state, player, effect, source, services) {
    const choice = chooseRevealedTopCardForDestruction(
      state,
      player,
      source,
      "reveal_top_card_choose_destroy_or_attack_equal_cost",
      services
    );
    if (!choice.ok) return choice;
    if (choice.card === undefined) return { ok: true };
    if (choice.shouldDestroy) {
      return destroyOwnedCard(
        state,
        player,
        choice.card,
        "reveal_top_card_choose_destroy_or_attack_equal_cost",
        source,
        services
      );
    }

    const amount = calculateEffectiveCardCost(
      state,
      player.playerId,
      choice.definition,
      choice.card,
      cardMatchesTypeForPlayer
    );
    if (amount <= 0) return { ok: true };

    const attackProfileResult = services.collectAttackReplacementProfile(
      state,
      player,
      source
    );
    if (attackProfileResult.status !== "resolved") {
      return {
        ok: false,
        error:
          attackProfileResult.status === "error"
            ? attackProfileResult.error
            : "Attack replacement profile was not applicable",
      };
    }

    return services.resolvePlayerControlledAttack({
      state,
      attackingPlayer: player,
      source,
      effectId: effect.effectId,
      unavoidable: attackProfileResult.result.unavoidable,
      attackProfile: attackProfileResult.result,
      targetPlan: { kind: "runtimeSelector", effect },
      impact: {
        kind: "damage",
        baseAmount: amount,
        sourceOwnerModifierAmount: attackProfileResult.result.damageBonus,
        onDamageDealt: [],
        onKill: [],
      },
    });
  },
};

const playTopCardHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"play_top_card">
> = {
  effectId: "play_top_card",
  execute(state, player, effect, source, services) {
    const card = services.drawTopDeckCard(player, state);
    if (card === undefined) {
      recordGameEvent(state, {
        type: "effectPlayTopSkipped",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: effect.effectId,
        sourceType: source.sourceType,
      });
      return { ok: true };
    }
    const playedResult = services.playResolvedCard(state, player, card);
    if (!playedResult.ok || playedResult.gameEnd !== undefined) {
      return playedResult;
    }
    recordGameEvent(state, {
      type: "effectCardPlayedFromDeck",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: card.instanceId,
      targetDefinitionId: card.definitionId,
      effectId: effect.effectId,
      sourceType: source.sourceType,
    });
    return { ok: true };
  },
};

const playTopCardFromFoeDeckHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"play_top_card_from_foe_deck">
> = {
  effectId: "play_top_card_from_foe_deck",
  execute(state, player, effect, source, services) {
    const targetResult = services.resolveTargetChoice(
      state,
      player,
      effect,
      source
    );
    if (!targetResult.ok) {
      return targetResult;
    }
    if (targetResult.choice?.choiceType !== "player") {
      recordGameEvent(state, {
        type: "effectPlayTopFoeDeckSkipped",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: effect.effectId,
        sourceType: source.sourceType,
      });
      return { ok: true };
    }
    const foe = targetResult.choice.player;

    const card = services.drawTopDeckCard(foe, state);
    if (card === undefined) {
      recordGameEvent(state, {
        type: "effectPlayTopFoeDeckSkipped",
        playerId: player.playerId,
        targetPlayerId: foe.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: effect.effectId,
        sourceType: source.sourceType,
      });
      return { ok: true };
    }

    const ownerDiscardDestination = {
      zone: "ownerDiscardAfterResolution" as const,
      ownerId: foe.playerId,
    };
    const playedResult = services.playResolvedCard(state, player, card, {
      nonOngoingDestination: ownerDiscardDestination,
      ...(effect.ongoingCleanupDestination === "ownerDiscard"
        ? { forceOngoingDiscard: ownerDiscardDestination }
        : { ongoingOwnerId: player.playerId }),
    });
    if (!playedResult.ok || playedResult.gameEnd !== undefined) {
      return playedResult;
    }
    recordGameEvent(state, {
      type: "effectFoeDeckCardPlayed",
      playerId: player.playerId,
      targetPlayerId: foe.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: card.instanceId,
      targetDefinitionId: card.definitionId,
      effectId: effect.effectId,
      sourceType: source.sourceType,
    });
    return { ok: true };
  },
};

const returnDiscardToHandHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"return_discard_to_hand">
> = {
  effectId: "return_discard_to_hand",
  execute(state, player, effect, source, services) {
    return executeReturnDiscardToHand(
      state,
      player,
      effect.amount,
      source,
      services,
      {
        ...(effect.cardTypes === undefined
          ? {}
          : { cardTypes: effect.cardTypes }),
        excludeSource: effect.excludeSource === true,
        required: effect.required === true,
        allMatching: effect.allMatching === true,
      }
    );
  },
};

export interface CardOwnershipChoiceCatalogTools {
  bindRuntimeEffectDecoder<Id extends CardOwnershipChoiceEffectId>(
    effectId: Id
  ): RuntimeEffectDecoder<Id>;
}

export function createCardOwnershipChoiceEffectDefinitions(
  tools: CardOwnershipChoiceCatalogTools
) {
  const { bindRuntimeEffectDecoder } = tools;
  return [
    {
      effectId: "gain_card",
      decoder: bindRuntimeEffectDecoder("gain_card"),
      supportedTimings: immediateEffectTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card"],
      handler: gainCardHandler,
    },
    {
      effectId: "discard_card",
      decoder: bindRuntimeEffectDecoder("discard_card"),
      supportedTimings: immediateEffectTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      handler: discardCardHandler,
    },
    {
      effectId: "discard_random_hand_cards",
      decoder: bindRuntimeEffectDecoder("discard_random_hand_cards"),
      supportedTimings: ["onPlay"] as const,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card"],
      handler: discardRandomHandCardsHandler,
    },
    {
      effectId: "discard_self",
      decoder: bindRuntimeEffectDecoder("discard_self"),
      supportedTimings: immediateEffectTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      handler: createUnsupportedEffectHandler("discard_self"),
    },
    {
      effectId: "discard_hand_then_draw_cards",
      decoder: bindRuntimeEffectDecoder("discard_hand_then_draw_cards"),
      supportedTimings: immediateEffectTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      handler: discardHandThenDrawCardsHandler,
    },
    {
      effectId: "destroy_card",
      decoder: bindRuntimeEffectDecoder("destroy_card"),
      supportedTimings: immediateEffectTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      handler: destroyCardHandler,
    },
    {
      effectId: "destroy_own_cards",
      decoder: bindRuntimeEffectDecoder("destroy_own_cards"),
      supportedTimings: immediateEffectTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      handler: destroyOwnCardsHandler,
    },
    {
      effectId: "destroy_random_legend_market_card",
      decoder: bindRuntimeEffectDecoder("destroy_random_legend_market_card"),
      supportedTimings: ["onPlay"] as const,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      handler: destroyRandomLegendMarketCardHandler,
    },
    {
      effectId: "return_discard_to_hand",
      decoder: bindRuntimeEffectDecoder("return_discard_to_hand"),
      supportedTimings: immediateEffectTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      handler: returnDiscardToHandHandler,
    },
    {
      effectId: "reveal_top_card",
      decoder: bindRuntimeEffectDecoder("reveal_top_card"),
      supportedTimings: ["onDefense", "onPlay"] as const,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card"],
      handler: revealTopCardHandler,
    },
    {
      effectId: "reveal_top_card_choose_destroy_or_power",
      decoder: bindRuntimeEffectDecoder(
        "reveal_top_card_choose_destroy_or_power"
      ),
      supportedTimings: ["onPlay"] as const,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card"],
      handler: revealTopCardChooseDestroyOrPowerHandler,
    },
    {
      effectId: "reveal_top_card_choose_destroy_or_attack_equal_cost",
      decoder: bindRuntimeEffectDecoder(
        "reveal_top_card_choose_destroy_or_attack_equal_cost"
      ),
      supportedTimings: ["onPlay"] as const,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card"],
      handler: revealTopCardChooseDestroyOrAttackEqualCostHandler,
    },
    {
      effectId: "play_top_card",
      decoder: bindRuntimeEffectDecoder("play_top_card"),
      supportedTimings: ["onPlay"] as const,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card"],
      handler: playTopCardHandler,
    },
    {
      effectId: "play_top_card_from_foe_deck",
      decoder: bindRuntimeEffectDecoder("play_top_card_from_foe_deck"),
      supportedTimings: ["activation", "onPlay"] as const,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      supportedSourceTimingPolicies: [
        { sourceKind: "card", timings: ["onPlay"] as const },
        { sourceKind: "wizardProperty", timings: ["activation"] as const },
      ] as const,
      handler: playTopCardFromFoeDeckHandler,
    },
    {
      effectId: "topdeck_gained_card",
      decoder: bindRuntimeEffectDecoder("topdeck_gained_card"),
      supportedTimings: ["onGainCard"] as const,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      handler: topdeckGainedCardHandler,
    },
    {
      effectId: "optional_gain_market_cards_to_hand_this_turn",
      decoder: bindRuntimeEffectDecoder(
        "optional_gain_market_cards_to_hand_this_turn"
      ),
      supportedTimings: ["onPlay"] as const,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card"],
      handler: optionalGainMarketCardsToHandThisTurnHandler,
    },
    {
      effectId: "on_gain_self_gain_limp_wands",
      decoder: bindRuntimeEffectDecoder("on_gain_self_gain_limp_wands"),
      supportedTimings: ["onGain"] as const,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      handler: onGainSelfGainLimpWandsHandler,
    },
  ] as const;
}
