import { recordGameEvent } from "./event-recorder.js";
import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";
import type { RuntimeEffectDecoder } from "./runtime-effect-decoder.js";
import type {
  EffectTiming,
  RuntimeEffectCondition,
  RuntimeEffectForId,
  RuntimeEffectTarget,
  RuntimeEffectTargetSelector,
} from "./runtime-effect.js";
import {
  allEffectRuntimeModes,
  immediateEffectTimings,
} from "./effect-runtime-catalog-shared.js";
import { createUnsupportedEffectHandler } from "./effect-runtime-family-support.js";
import type {
  ObjectFields,
  OptionalField,
  RequiredField,
  ValueDecoder,
} from "./effect-runtime-family-support.js";

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
export type DiscardSelfRuntimeEffect = EffectWithOptionalTiming<"discard_self">;
export type DiscardHandThenDrawCardsRuntimeEffect =
  EffectWithOptionalTiming<"discard_hand_then_draw_cards"> & {
    drawAmount: number;
  };
export type DestroyCardRuntimeEffect =
  EffectWithOptionalTiming<"destroy_card"> & Targetable;
export type DestroyOwnCardsRuntimeEffect =
  EffectWithOptionalTiming<"destroy_own_cards"> & {
    amount?: number;
    sourceZones?: "hand" | ("hand" | "discard")[];
    chooser?: "controller" | "defendingPlayer";
  };
export type DestroyRandomLegendMarketCardRuntimeEffect = {
  effectId: "destroy_random_legend_market_card";
  timing: "onPlay";
  rememberAs: "destroyedLegend";
  sourceZone: "legendMarket";
  rng: "seeded";
};
export type ReturnDiscardToHandRuntimeEffect =
  EffectWithOptionalTiming<"return_discard_to_hand"> & PositiveAmount;
export type RevealTopCardRuntimeEffect =
  EffectWithOptionalTiming<"reveal_top_card"> & {
    source: "activePlayerDeck";
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
  timing: "untilEndOfTurn";
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
  discard_self: DiscardSelfRuntimeEffect;
  discard_hand_then_draw_cards: DiscardHandThenDrawCardsRuntimeEffect;
  destroy_card: DestroyCardRuntimeEffect;
  destroy_own_cards: DestroyOwnCardsRuntimeEffect;
  destroy_random_legend_market_card: DestroyRandomLegendMarketCardRuntimeEffect;
  return_discard_to_hand: ReturnDiscardToHandRuntimeEffect;
  reveal_top_card: RevealTopCardRuntimeEffect;
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
  | "discard_self"
  | "discard_hand_then_draw_cards"
  | "destroy_card"
  | "destroy_own_cards"
  | "destroy_random_legend_market_card"
  | "return_discard_to_hand"
  | "reveal_top_card"
  | "play_top_card"
  | "play_top_card_from_foe_deck"
  | "topdeck_gained_card"
  | "optional_gain_market_cards_to_hand_this_turn"
  | "on_gain_self_gain_limp_wands";

export const cardOwnershipChoiceEffectIds = [
  "gain_card",
  "discard_card",
  "discard_self",
  "discard_hand_then_draw_cards",
  "destroy_card",
  "destroy_own_cards",
  "destroy_random_legend_market_card",
  "return_discard_to_hand",
  "reveal_top_card",
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
  destroyOwnCardsSourceZones: ValueDecoder<"hand" | ("hand" | "discard")[]>;
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
    }),
    reveal_top_card: defineDecoder("reveal_top_card", {
      effectId: required(literal("reveal_top_card")),
      timing: optionalTiming,
      source: required(literal("activePlayerDeck")),
    }),
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
        timing: required(literal("untilEndOfTurn")),
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
    if (state.common.legendMarket.length === 0) {
      return { ok: true };
    }
    const targetIndex = state.rng.nextInt(state.common.legendMarket.length);
    const targetCard = state.common.legendMarket.splice(targetIndex, 1)[0];
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
    destination.zone.push(targetCard);
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
  execute() {
    return {
      ok: false,
      error:
        "optional_gain_market_cards_to_hand_this_turn is a gained-card replacement effect",
    };
  },
};

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
      choice.card
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

const revealTopCardHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"reveal_top_card">
> = {
  effectId: "reveal_top_card",
  execute(state, player, effect, source, services) {
    const card = services.peekTopDeckCard(player, state);
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
    return { ok: true };
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
    const foe = services
      .getOpponentsInSeatingOrder(state, player)
      .find(
        (candidate) => candidate.deck.length > 0 || candidate.discard.length > 0
      );
    if (foe === undefined) {
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

    const playedResult = services.playResolvedCard(state, player, card, {
      nonOngoingDestination: {
        zone: "ownerDiscardAfterResolution",
        ownerId: foe.playerId,
      },
      ongoingOwnerId: player.playerId,
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
      supportedSourceKinds: ["card", "wizardProperty"],
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
      handler: createUnsupportedEffectHandler("discard_hand_then_draw_cards"),
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
      handler: createUnsupportedEffectHandler("destroy_own_cards"),
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
      handler: createUnsupportedEffectHandler("return_discard_to_hand"),
    },
    {
      effectId: "reveal_top_card",
      decoder: bindRuntimeEffectDecoder("reveal_top_card"),
      supportedTimings: ["onPlay"] as const,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card"],
      handler: revealTopCardHandler,
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
      supportedTimings: ["untilEndOfTurn"] as const,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      handler: optionalGainMarketCardsToHandThisTurnHandler,
    },
    {
      effectId: "on_gain_self_gain_limp_wands",
      decoder: bindRuntimeEffectDecoder("on_gain_self_gain_limp_wands"),
      supportedTimings: ["onGain"] as const,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      handler: createUnsupportedEffectHandler("on_gain_self_gain_limp_wands"),
    },
  ] as const;
}
