import { cardMatchesTypeForPlayer } from "./card-type-runtime.js";
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
  "dead_wizard_token_gain_limp_wands_per_discard_legend",
  "dead_wizard_token_gain_limp_wand_to_deck_top",
] as const;

export type DeadWizardTokenEffectId = (typeof deadWizardTokenEffectIds)[number];

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
  dead_wizard_token_gain_limp_wands_per_discard_legend: DeadWizardTokenGainLimpWandsPerDiscardLegendRuntimeEffect;
  dead_wizard_token_gain_limp_wand_to_deck_top: DeadWizardTokenGainLimpWandToDeckTopRuntimeEffect;
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
