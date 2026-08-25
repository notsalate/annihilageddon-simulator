import { cardMatchesTypeForPlayer } from "./card-type-runtime.js";
import { removeDeadWizardToken } from "./control-ledger.js";
import { changePlayerChips } from "./effect-runtime-resources-draw.js";
import { gainLimpWandsFromCommonStack } from "./effect-runtime-special-card-stack.js";
import { calculateEffectiveCardCost } from "./effective-value-runtime.js";
import { recordGameEvent } from "./event-recorder.js";
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
import type { GameState, PlayerState } from "./setup.js";
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
  "dead_wizard_token_damage_equal_chips",
  "dead_wizard_token_damage_equal_highest_hand_cost",
  "dead_wizard_token_gain_chips",
  "dead_wizard_token_gain_limp_wands_per_discard_legend",
  "dead_wizard_token_gain_limp_wand_to_deck_top",
  "dead_wizard_token_gain_status_or_draw_face",
  "dead_wizard_token_killer_optional_remove_dingler",
  "dead_wizard_token_lose_half_chips",
  "dead_wizard_token_damage_per_discard_legend",
  "dead_wizard_token_exchange_life",
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

export type DeadWizardTokenSuppressBasicTrophyChipPayoutRuntimeEffect = {
  effectId: "suppress_basic_trophy_chip_payout";
  timing: "whileControlled";
};

export interface DeadWizardTokenEffectPayloadMap {
  dead_wizard_token_each_foe_gain_chips: DeadWizardTokenEachFoeGainChipsRuntimeEffect;
  dead_wizard_token_damage_equal_chips: DeadWizardTokenDamageEqualChipsRuntimeEffect;
  dead_wizard_token_damage_equal_highest_hand_cost: DeadWizardTokenDamageEqualHighestHandCostRuntimeEffect;
  dead_wizard_token_gain_chips: DeadWizardTokenGainChipsRuntimeEffect;
  dead_wizard_token_gain_limp_wands_per_discard_legend: DeadWizardTokenGainLimpWandsPerDiscardLegendRuntimeEffect;
  dead_wizard_token_gain_limp_wand_to_deck_top: DeadWizardTokenGainLimpWandToDeckTopRuntimeEffect;
  dead_wizard_token_killer_optional_remove_dingler: DeadWizardTokenKillerOptionalRemoveDinglerRuntimeEffect;
  dead_wizard_token_gain_status_or_draw_face: DeadWizardTokenGainStatusOrDrawFaceRuntimeEffect;
  dead_wizard_token_lose_half_chips: DeadWizardTokenLoseHalfChipsRuntimeEffect;
  dead_wizard_token_damage_per_discard_legend: DeadWizardTokenDamagePerDiscardLegendRuntimeEffect;
  dead_wizard_token_exchange_life: DeadWizardTokenExchangeLifeRuntimeEffect;
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
        effect.countedCardType
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
  cardType: string
): number {
  return player.discard.filter((card) => {
    const definition = state.cardDefinitions.get(card.definitionId);
    return (
      definition !== undefined &&
      cardMatchesTypeForPlayer(
        state,
        player.playerId,
        definition,
        cardType,
        card
      )
    );
  }).length;
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
        effect.countedCardType
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
      effectId: "suppress_basic_trophy_chip_payout",
      decoder: bindRuntimeEffectDecoder("suppress_basic_trophy_chip_payout"),
      supportedTimings: suppressionTimings,
      supportedModes,
      supportedSourceKinds,
      handler: suppressBasicTrophyChipPayoutHandler,
    },
  ];
}
