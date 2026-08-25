import { removeDeadWizardToken } from "./control-ledger.js";
import { markCardDefinitionId, markCardInstanceId } from "../domain/types.js";
import {
  getControlledDeadWizardTokenCount,
  getControlledDeadWizardTokenLikeCards,
  getDeadWizardTokenChoiceId,
  getDeadWizardTokenLikeCardChoiceId,
} from "./dead-wizard-token-like.js";
import { recordGameEvent, recordTurnPowerChanged } from "./event-recorder.js";
import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";
import type { EffectChoice } from "./effect-runtime-registry.js";
import type { RuntimeEffectDecoder } from "./runtime-effect-decoder.js";
import type { RuntimeEffectForId } from "./runtime-effect.js";
import {
  allEffectRuntimeModes,
  type EffectRuntimeSupportedModes,
  type EffectRuntimeSupportedSourceKinds,
  type EffectRuntimeSupportedTimings,
} from "./effect-runtime-catalog-shared.js";
import type {
  ObjectFields,
  RequiredField,
  ValueDecoder,
} from "./effect-runtime-family-support.js";

type TimedEffect<Id extends string, Timing extends "onPlay"> = {
  effectId: Id;
  timing: Timing;
};

type PositiveAmount = { amount: number };

export type AddPowerPerControlledDeadWizardTokenRuntimeEffect = TimedEffect<
  "add_power_per_controlled_dead_wizard_token",
  "onPlay"
> & {
  amountPerDeadWizardToken: number;
};

export type AddPowerIfNoControlledDeadWizardTokenRuntimeEffect = TimedEffect<
  "add_power_if_no_controlled_dead_wizard_token",
  "onPlay"
> &
  PositiveAmount;

export type OptionalDestroyControlledDeadWizardTokenRuntimeEffect = TimedEffect<
  "optional_destroy_controlled_dead_wizard_token",
  "onPlay"
> & {
  optional: true;
};

export type ArmDeadWizardTokenKillReplacementRuntimeEffect = TimedEffect<
  "arm_dead_wizard_token_kill_replacement",
  "onPlay"
>;

export interface DwtInteractionEffectPayloadMap {
  add_power_per_controlled_dead_wizard_token: AddPowerPerControlledDeadWizardTokenRuntimeEffect;
  add_power_if_no_controlled_dead_wizard_token: AddPowerIfNoControlledDeadWizardTokenRuntimeEffect;
  optional_destroy_controlled_dead_wizard_token: OptionalDestroyControlledDeadWizardTokenRuntimeEffect;
  arm_dead_wizard_token_kill_replacement: ArmDeadWizardTokenKillReplacementRuntimeEffect;
}

export type DwtInteractionEffectId = keyof DwtInteractionEffectPayloadMap;

export const dwtInteractionEffectIds = [
  "add_power_per_controlled_dead_wizard_token",
  "add_power_if_no_controlled_dead_wizard_token",
  "optional_destroy_controlled_dead_wizard_token",
  "arm_dead_wizard_token_kill_replacement",
] as const satisfies readonly DwtInteractionEffectId[];

export interface DwtInteractionDecoderTools {
  defineDecoder<Id extends DwtInteractionEffectId>(
    effectId: Id,
    fields: ObjectFields<RuntimeEffectForId<Id>>
  ): RuntimeEffectDecoder<Id>;
  required<T>(decode: ValueDecoder<T>): RequiredField<T>;
  literal<const Value extends string | number | boolean>(
    expected: Value
  ): ValueDecoder<Value>;
  positiveInteger: ValueDecoder<number>;
}

export type DwtInteractionEffectDecoders = {
  [Id in DwtInteractionEffectId]: RuntimeEffectDecoder<Id>;
};

export function createDwtInteractionEffectDecoders(
  tools: DwtInteractionDecoderTools
): DwtInteractionEffectDecoders {
  const { defineDecoder, required, literal, positiveInteger } = tools;
  return {
    add_power_per_controlled_dead_wizard_token: defineDecoder(
      "add_power_per_controlled_dead_wizard_token",
      {
        effectId: required(
          literal("add_power_per_controlled_dead_wizard_token")
        ),
        timing: required(literal("onPlay")),
        amountPerDeadWizardToken: required(positiveInteger),
      }
    ),
    add_power_if_no_controlled_dead_wizard_token: defineDecoder(
      "add_power_if_no_controlled_dead_wizard_token",
      {
        effectId: required(
          literal("add_power_if_no_controlled_dead_wizard_token")
        ),
        timing: required(literal("onPlay")),
        amount: required(positiveInteger),
      }
    ),
    optional_destroy_controlled_dead_wizard_token: defineDecoder(
      "optional_destroy_controlled_dead_wizard_token",
      {
        effectId: required(
          literal("optional_destroy_controlled_dead_wizard_token")
        ),
        timing: required(literal("onPlay")),
        optional: required(literal(true)),
      }
    ),
    arm_dead_wizard_token_kill_replacement: defineDecoder(
      "arm_dead_wizard_token_kill_replacement",
      {
        effectId: required(literal("arm_dead_wizard_token_kill_replacement")),
        timing: required(literal("onPlay")),
      }
    ),
  };
}

const addPowerPerControlledDeadWizardTokenHandler: EffectRuntimeHandler<AddPowerPerControlledDeadWizardTokenRuntimeEffect> =
  {
    effectId: "add_power_per_controlled_dead_wizard_token",
    execute(state, player, effect, source) {
      const amount =
        getControlledDeadWizardTokenCount(state, player) *
        effect.amountPerDeadWizardToken;
      if (amount === 0) {
        return { ok: true };
      }

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

const addPowerIfNoControlledDeadWizardTokenHandler: EffectRuntimeHandler<AddPowerIfNoControlledDeadWizardTokenRuntimeEffect> =
  {
    effectId: "add_power_if_no_controlled_dead_wizard_token",
    execute(state, player, effect, source) {
      if (getControlledDeadWizardTokenCount(state, player) > 0) {
        return { ok: true };
      }

      const powerBefore = state.turn.power;
      state.turn.power += effect.amount;
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

const optionalDestroyControlledDeadWizardTokenHandler: EffectRuntimeHandler<OptionalDestroyControlledDeadWizardTokenRuntimeEffect> =
  {
    effectId: "optional_destroy_controlled_dead_wizard_token",
    execute(state, player, effect, source, services) {
      const cards = getControlledDeadWizardTokenLikeCards(state, player);
      const choices: EffectChoice[] = [
        { choiceKind: "option", choiceId: "decline" },
        ...player.deadWizardTokens.map((token) => ({
          choiceKind: "option" as const,
          choiceId: getDeadWizardTokenChoiceId(token.instanceId),
        })),
        ...cards.map((card) => ({
          choiceKind: "cardTarget" as const,
          choiceId: getDeadWizardTokenLikeCardChoiceId(card.instanceId),
          cards: [card],
          amount: 1,
        })),
      ];
      const choice = services.chooseEffectChoice(
        state,
        player,
        source,
        effect.effectId,
        choices
      );
      if (choice === undefined || choice.choiceId === "decline") {
        return { ok: true };
      }

      if (choice.choiceKind === "option") {
        const tokenInstanceId = choice.choiceId.startsWith("token:")
          ? choice.choiceId.slice("token:".length)
          : undefined;
        if (tokenInstanceId === undefined) {
          return { ok: false, error: "Invalid dead wizard token choice" };
        }
        const mutationResult = services.runControlledPowerMutation(
          state,
          () => state.activePlayerId,
          () => {
            const tokenBeforeRemoval = player.deadWizardTokens.find(
              (candidate) => candidate.instanceId === tokenInstanceId
            );
            if (tokenBeforeRemoval === undefined) {
              return {
                ok: false as const,
                error: `Dead wizard token ${tokenInstanceId} disappeared before destruction`,
              };
            }
            const token = removeDeadWizardToken(
              player,
              tokenBeforeRemoval.instanceId
            );
            if (token === undefined) {
              return {
                ok: false as const,
                error: `Dead wizard token ${tokenInstanceId} disappeared before destruction`,
              };
            }
            recordGameEvent(state, {
              type: "deadWizardTokenDestroyed",
              playerId: player.playerId,
              tokenInstanceId: token.instanceId,
              tokenDefinitionId: token.definitionId,
              effectId: effect.effectId,
              sourceType: source.sourceType,
            });
            return { ok: true as const };
          },
          (value) => value.ok
        );
        if (!mutationResult.ok) {
          return mutationResult;
        }
        if (!mutationResult.value.ok) {
          return mutationResult.value;
        }
        return mutationResult.gameEnd === undefined
          ? { ok: true }
          : { ok: true, gameEnd: mutationResult.gameEnd };
      }

      if (choice.choiceKind !== "cardTarget") {
        return { ok: false, error: "Invalid dead wizard token choice kind" };
      }
      const card = cards.find(
        (candidate) => candidate.instanceId === choice.cards[0]?.instanceId
      );
      if (card === undefined) {
        return {
          ok: false,
          error:
            "Controlled dead wizard token-like card disappeared before destruction",
        };
      }
      const destination = services.getDestroyDestination(state, card);
      if (!destination.ok) return destination;
      const mutationResult = services.runControlledPowerMutation(
        state,
        () => state.activePlayerId,
        () => {
          const moved = services.moveCardToZonePreservingOwner(
            state,
            player,
            card,
            destination.zone,
            destination.zoneName,
            effect.effectId,
            source
          );
          if (!moved) {
            return {
              ok: false as const,
              error: `Cannot destroy controlled dead wizard token-like card ${card.instanceId}`,
            };
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
          return { ok: true as const };
        },
        (value) => value.ok
      );
      if (!mutationResult.ok) {
        return mutationResult;
      }
      if (!mutationResult.value.ok) {
        return mutationResult.value;
      }
      return mutationResult.gameEnd === undefined
        ? { ok: true }
        : { ok: true, gameEnd: mutationResult.gameEnd };
    },
  };

const armDeadWizardTokenKillReplacementHandler: EffectRuntimeHandler<ArmDeadWizardTokenKillReplacementRuntimeEffect> =
  {
    effectId: "arm_dead_wizard_token_kill_replacement",
    execute(state, player, _effect, source) {
      state.turn.deadWizardTokenKillReplacement = {
        playerId: player.playerId,
        cardInstanceId: markCardInstanceId(source.cardInstanceId),
        definitionId: markCardDefinitionId(source.definitionId),
      };
      return { ok: true };
    },
  };

export interface DwtInteractionCatalogTools {
  bindRuntimeEffectDecoder<Id extends DwtInteractionEffectId>(
    effectId: Id
  ): RuntimeEffectDecoder<Id>;
}

export function createDwtInteractionEffectDefinitions(
  tools: DwtInteractionCatalogTools
) {
  const { bindRuntimeEffectDecoder } = tools;
  const supportedModes =
    allEffectRuntimeModes satisfies EffectRuntimeSupportedModes;
  const cardAndWizardPropertySources = [
    "card",
    "wizardProperty",
  ] as const satisfies EffectRuntimeSupportedSourceKinds;
  const cardSources = [
    "card",
  ] as const satisfies EffectRuntimeSupportedSourceKinds;
  const onPlay = ["onPlay"] as const satisfies EffectRuntimeSupportedTimings;
  return [
    {
      effectId: "add_power_per_controlled_dead_wizard_token",
      decoder: bindRuntimeEffectDecoder(
        "add_power_per_controlled_dead_wizard_token"
      ),
      supportedTimings: onPlay,
      supportedModes,
      supportedSourceKinds: cardAndWizardPropertySources,
      handler: addPowerPerControlledDeadWizardTokenHandler,
    },
    {
      effectId: "add_power_if_no_controlled_dead_wizard_token",
      decoder: bindRuntimeEffectDecoder(
        "add_power_if_no_controlled_dead_wizard_token"
      ),
      supportedTimings: onPlay,
      supportedModes,
      supportedSourceKinds: cardAndWizardPropertySources,
      handler: addPowerIfNoControlledDeadWizardTokenHandler,
    },
    {
      effectId: "optional_destroy_controlled_dead_wizard_token",
      decoder: bindRuntimeEffectDecoder(
        "optional_destroy_controlled_dead_wizard_token"
      ),
      supportedTimings: onPlay,
      supportedModes,
      supportedSourceKinds: cardAndWizardPropertySources,
      handler: optionalDestroyControlledDeadWizardTokenHandler,
    },
    {
      effectId: "arm_dead_wizard_token_kill_replacement",
      decoder: bindRuntimeEffectDecoder(
        "arm_dead_wizard_token_kill_replacement"
      ),
      supportedTimings: onPlay,
      supportedModes,
      supportedSourceKinds: cardSources,
      handler: armDeadWizardTokenKillReplacementHandler,
    },
  ] as const;
}
