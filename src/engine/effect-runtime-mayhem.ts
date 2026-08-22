import { drawDeckCards } from "./deck-lifecycle.js";
import { createAttackDefenseUsage } from "./attack-resolution.js";
import { recordDeckReshuffle, recordGameEvent } from "./event-recorder.js";
import { recordEffectChipsChanged } from "./effect-runtime-resources-draw.js";
import type {
  EffectChoice,
  EffectGameEnd,
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
  RuntimeEffectTargetSelector,
} from "./runtime-effect.js";
import {
  allEffectRuntimeModes,
  type EffectRuntimeSupportedModes,
  type EffectRuntimeSupportedSourceKinds,
  type EffectRuntimeSupportedTimings,
} from "./effect-runtime-catalog-shared.js";
import type { GameState, PlayerState } from "./setup.js";

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

export type MayhemEffectId =
  | "mayhem_attack"
  | "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status"
  | "mayhem_each_player_choose_foe_gain_chips"
  | "mayhem_each_non_dingler_gain_chips"
  | "mayhem_each_player_battle_highest_hand_cost"
  | "mayhem_each_player_choose_discard_hand_draw_or_take_damage"
  | "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none"
  | "mayhem_each_player_discard_deck_then_destroy_from_discard"
  | "mayhem_each_player_gain_chips_then_attack_for_current_chips"
  | "mayhem_each_player_reduce_life_to_gain_chips"
  | "mayhem_each_player_vote_dingler"
  | "mayhem_lowest_life_players_gain_dingler_and_set_to_max_life"
  | "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem"
  | "mega_mayhem_each_player_toggle_dingler"
  | "mega_mayhem_set_life";

export const mayhemEffectIds = [
  "mayhem_attack",
  "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status",
  "mayhem_each_player_choose_foe_gain_chips",
  "mayhem_each_non_dingler_gain_chips",
  "mayhem_each_player_battle_highest_hand_cost",
  "mayhem_each_player_choose_discard_hand_draw_or_take_damage",
  "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none",
  "mayhem_each_player_discard_deck_then_destroy_from_discard",
  "mayhem_each_player_gain_chips_then_attack_for_current_chips",
  "mayhem_each_player_reduce_life_to_gain_chips",
  "mayhem_each_player_vote_dingler",
  "mayhem_lowest_life_players_gain_dingler_and_set_to_max_life",
  "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem",
  "mega_mayhem_each_player_toggle_dingler",
  "mega_mayhem_set_life",
] as const satisfies readonly MayhemEffectId[];

export interface MayhemEffectDecoderTools {
  defineDecoder<Id extends MayhemEffectId>(
    effectId: Id,
    fields: ObjectFields<RuntimeEffectForId<Id>>
  ): RuntimeEffectDecoder<Id>;
  required<T>(decode: ValueDecoder<T>): RequiredField<T>;
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
      lifeTotal: required(positiveInteger),
    }),
  };
}

function sumHandCost(state: GameState, player: PlayerState): number {
  return player.hand.reduce((total, card) => {
    const cost = state.cardDefinitions.get(card.definitionId)?.engine.cost;
    return total + (typeof cost === "number" ? cost : 0);
  }, 0);
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
      gameEnd?: never;
    }
  | { ok: true; gameEnd: EffectGameEnd; decisions?: never }
  | { ok: false; error: string } {
  const decisions: Array<{ player: PlayerState; avoided: boolean }> = [];
  recordGameEvent(state, {
    type: "mayhemDecisionPhaseStarted",
    playerId: source.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    sourceType: source.sourceType,
  });

  for (const targetPlayer of targets) {
    recordGameEvent(state, {
      type: "mayhemDecisionStarted",
      playerId: source.playerId,
      targetPlayerId: targetPlayer.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId,
      sourceType: source.sourceType,
    });
    const defenseResult = services.resolveDefenseWindow(state, targetPlayer, {
      kind: "nonredirectable",
      source,
      defenseUsage: createAttackDefenseUsage(),
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
        targetPlayerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        sourceType: source.sourceType,
      });
    }
    decisions.push({ player: targetPlayer, avoided });
  }

  recordGameEvent(state, {
    type: "mayhemResolutionPhaseStarted",
    playerId: source.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    sourceType: source.sourceType,
  });
  return { ok: true, decisions };
}

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
    for (const { player: targetPlayer, avoided } of decisionResult.decisions) {
      if (avoided) continue;
      const result = services.hasDinglerStatus(targetPlayer)
        ? services.removeDinglerStatus(
            state,
            targetPlayer,
            effect.effectId,
            source
          )
        : services.gainDinglerStatus(
            state,
            targetPlayer,
            effect.effectId,
            source
          );
      if (!result.ok) return result;
    }
    return { ok: true };
  },
};

const megaMayhemEachPlayerDestroyTopMainDeckHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem">
> = {
  effectId: "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem",
  execute(state, _player, effect, source, services) {
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      const destroyedCard = state.common.mainDeck.shift();
      if (destroyedCard === undefined) {
        recordGameEvent(state, {
          type: "effectDestroyTopMainDeckSkipped",
          playerId: targetPlayer.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          effectId: effect.effectId,
          sourceType: source.sourceType,
        });
        continue;
      }
      const destination = services.getDestroyDestination(state, destroyedCard);
      if (!destination.ok) return destination;
      destination.zone.push(destroyedCard);
      recordGameEvent(state, {
        type: "effectTopMainDeckCardDestroyed",
        playerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        targetCardInstanceId: destroyedCard.instanceId,
        targetDefinitionId: destroyedCard.definitionId,
        effectId: effect.effectId,
        sourceType: source.sourceType,
      });
      const destroyedDefinition = state.cardDefinitions.get(
        destroyedCard.definitionId
      );
      if (destroyedDefinition?.engine.cardKind === "mayhem") {
        const deathResult = services.resolvePlayerDeath(state, targetPlayer);
        if (!deathResult.ok) return deathResult;
      }
    }
    return { ok: true };
  },
};

const mayhemEachPlayerDiscardTopDeckDestroyHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none">
> = {
  effectId:
    "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none",
  execute(state, _player, effect, source, services) {
    const choices: readonly EffectChoice[] = [
      { choiceKind: "option", choiceId: "destroy_both" },
      { choiceKind: "option", choiceId: "destroy_none" },
    ];
    const decisions: Array<{
      targetPlayer: PlayerState;
      choice: EffectChoice;
    }> = [];
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      const resolution = services.prepareEffectChoice(
        state,
        targetPlayer,
        source,
        effect.effectId,
        choices
      );
      if (resolution.status !== "selected") {
        return {
          ok: false,
          error: `Invalid effect choice for ${effect.effectId}`,
        };
      }
      decisions.push({ targetPlayer, choice: resolution.choice });
    }
    for (const { targetPlayer, choice } of decisions) {
      services.recordEffectChoiceSelected(
        state,
        targetPlayer,
        source,
        effect.effectId,
        choices,
        choice
      );
      const discardedCards = services.discardTopDeckCards(
        state,
        targetPlayer,
        effect.amount
      );
      if (choice.choiceId === "destroy_none") continue;
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
      targetPlayer.discard.push(...targetPlayer.deck.splice(0));
      const destroyTarget = targetPlayer.discard[0];
      if (destroyTarget !== undefined) {
        const destination = services.getDestroyDestination(
          state,
          destroyTarget
        );
        if (!destination.ok) return destination;
        if (
          !services.moveCardToZonePreservingOwner(
            state,
            targetPlayer,
            destroyTarget,
            destination.zone,
            destination.zoneName,
            effect.effectId,
            source
          )
        ) {
          return {
            ok: false,
            error: `Cannot destroy discarded card ${destroyTarget.instanceId}`,
          };
        }
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
      for (const {
        player: targetPlayer,
        avoided,
      } of decisionResult.decisions) {
        if (avoided) continue;
        const statusResult = services.gainDinglerStatus(
          state,
          targetPlayer,
          effect.effectId,
          source
        );
        if (!statusResult.ok) return statusResult;
        const maxLife = calculateEffectivePlayerMaxLife(
          state,
          targetPlayer.playerId
        );
        services.setPlayerLife(state, targetPlayer, maxLife);
        recordGameEvent(state, {
          type: "effectLifeSet",
          playerId: source.playerId,
          targetPlayerId: targetPlayer.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          effectId: effect.effectId,
          amount: maxLife,
          sourceType: source.sourceType,
        });
      }
      return { ok: true };
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

export interface MayhemCatalogTools {
  bindRuntimeEffectDecoder<Id extends MayhemEffectId>(
    effectId: Id
  ): RuntimeEffectDecoder<Id>;
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
