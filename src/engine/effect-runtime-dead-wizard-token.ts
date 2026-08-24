import { cardMatchesTypeForPlayer } from "./card-type-runtime.js";
import { changePlayerChips } from "./effect-runtime-resources-draw.js";
import { gainLimpWandsFromCommonStack } from "./effect-runtime-special-card-stack.js";
import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";
import type { RuntimeEffectDecoder } from "./runtime-effect-decoder.js";
import type { RuntimeEffectForId } from "./runtime-effect.js";
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
  "dead_wizard_token_gain_chips",
  "dead_wizard_token_gain_limp_wands_per_discard_legend",
  "dead_wizard_token_gain_limp_wand_to_deck_top",
  "dead_wizard_token_lose_half_chips",
  "dead_wizard_token_reward_killer_chips",
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

export type DeadWizardTokenLoseHalfChipsRuntimeEffect = {
  effectId: "dead_wizard_token_lose_half_chips";
  timing: "onDeadWizardTokenFace";
  loss: "half";
  rounding: "up";
};

export type DeadWizardTokenRewardKillerChipsRuntimeEffect = {
  effectId: "dead_wizard_token_reward_killer_chips";
  timing: "onDeadWizardTokenFace";
  amount: 2;
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

export interface DeadWizardTokenEffectPayloadMap {
  dead_wizard_token_each_foe_gain_chips: DeadWizardTokenEachFoeGainChipsRuntimeEffect;
  dead_wizard_token_gain_chips: DeadWizardTokenGainChipsRuntimeEffect;
  dead_wizard_token_gain_limp_wands_per_discard_legend: DeadWizardTokenGainLimpWandsPerDiscardLegendRuntimeEffect;
  dead_wizard_token_gain_limp_wand_to_deck_top: DeadWizardTokenGainLimpWandToDeckTopRuntimeEffect;
  dead_wizard_token_lose_half_chips: DeadWizardTokenLoseHalfChipsRuntimeEffect;
  dead_wizard_token_reward_killer_chips: DeadWizardTokenRewardKillerChipsRuntimeEffect;
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
}

export function createDeadWizardTokenEffectDecoders(
  tools: DeadWizardTokenDecoderTools
): { [Id in DeadWizardTokenEffectId]: RuntimeEffectDecoder<Id> } {
  const { defineDecoder, required, literal } = tools;
  return {
    dead_wizard_token_each_foe_gain_chips: defineDecoder(
      "dead_wizard_token_each_foe_gain_chips",
      {
        effectId: required(literal("dead_wizard_token_each_foe_gain_chips")),
        timing: required(literal("onDeadWizardTokenFace")),
        amount: required(literal(1)),
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
    dead_wizard_token_reward_killer_chips: defineDecoder(
      "dead_wizard_token_reward_killer_chips",
      {
        effectId: required(literal("dead_wizard_token_reward_killer_chips")),
        timing: required(literal("onDeadWizardTokenFace")),
        amount: required(literal(2)),
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
  };
}

const gainLimpWandsPerDiscardLegendHandler: EffectRuntimeHandler<DeadWizardTokenGainLimpWandsPerDiscardLegendRuntimeEffect> =
  {
    effectId: "dead_wizard_token_gain_limp_wands_per_discard_legend",
    execute(state, player, effect, source, services) {
      const amount = player.discard.filter((card) => {
        const definition = state.cardDefinitions.get(card.definitionId);
        return (
          definition !== undefined &&
          cardMatchesTypeForPlayer(
            state,
            player.playerId,
            definition,
            effect.countedCardType
          )
        );
      }).length;
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
  ];
}
