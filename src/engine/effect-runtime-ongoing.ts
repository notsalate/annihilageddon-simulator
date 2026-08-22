import { recordTurnPowerChanged } from "./event-recorder.js";
import type {
  EffectExecutionResult,
  EffectSourceContext,
} from "./effect-runtime-registry.js";
import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";
import type { RuntimeEffectDecoder } from "./runtime-effect-decoder.js";
import type { EffectTiming, RuntimeEffectForId } from "./runtime-effect.js";
import {
  allEffectRuntimeModes,
  type EffectRuntimeSupportedModes,
  type EffectRuntimeSupportedSourceKinds,
  type EffectRuntimeSupportedTimings,
} from "./effect-runtime-catalog-shared.js";
import { createUnsupportedEffectHandler } from "./effect-runtime-family-support.js";
import type {
  ObjectFields,
  RequiredField,
  ValueDecoder,
} from "./effect-runtime-family-support.js";
import type { GameState, PlayerState } from "./setup.js";

type TimedEffect<Id extends string, Timing extends EffectTiming> = {
  effectId: Id;
  timing: Timing;
};
type PositiveAmount = { amount: number };

export interface AddPowerIfPlayerHasStatusRuntimeEffect
  extends
    TimedEffect<"add_power_if_player_has_status", "whileControlled">,
    PositiveAmount {
  statusId: "dingler";
}

export interface OngoingAddPowerRuntimeEffect
  extends TimedEffect<"ongoing_add_power", "whileControlled">, PositiveAmount {}
export interface OngoingAddPowerWhenPlayingWandRuntimeEffect
  extends
    TimedEffect<"ongoing_add_power_when_playing_wand", "onPlayCard">,
    PositiveAmount {
  cardTags: ["wandCard"];
}
export interface OngoingAddPowerPerDeadWizardTokenRuntimeEffect
  extends
    TimedEffect<"ongoing_add_power_per_dead_wizard_token", "whileControlled">,
    PositiveAmount {}
export interface OngoingAddPowerWhenPlayingLimpWandRuntimeEffect
  extends
    TimedEffect<
      "ongoing_add_power_when_playing_limp_wand",
      "afterControllerPlaysCard"
    >,
    PositiveAmount {
  cardKind: "limpWand";
}
export interface OngoingFirstAttackDamageAddPowerRuntimeEffect extends TimedEffect<
  "ongoing_first_attack_damage_add_power",
  "afterFirstAttackDamageEachTurn"
> {
  amount: "totalDamageDealtByThatAttack";
}
export interface OngoingHandRefillBonusRuntimeEffect
  extends TimedEffect<"ongoing_hand_refill_bonus", "endTurn">, PositiveAmount {}
export type OngoingStartTurnOptionalGainLimpWandToHandRuntimeEffect =
  TimedEffect<
    "ongoing_start_turn_optional_gain_limp_wand_to_hand",
    "startOfControllerTurn"
  > & {
    destination: "hand";
    amount: number;
    chooser: "controller";
  };

export interface OngoingEffectPayloadMap {
  ongoing_add_power: OngoingAddPowerRuntimeEffect;
  ongoing_add_power_when_playing_wand: OngoingAddPowerWhenPlayingWandRuntimeEffect;
  ongoing_add_power_per_dead_wizard_token: OngoingAddPowerPerDeadWizardTokenRuntimeEffect;
  ongoing_add_power_when_playing_limp_wand: OngoingAddPowerWhenPlayingLimpWandRuntimeEffect;
  ongoing_first_attack_damage_add_power: OngoingFirstAttackDamageAddPowerRuntimeEffect;
  ongoing_hand_refill_bonus: OngoingHandRefillBonusRuntimeEffect;
  ongoing_start_turn_optional_gain_limp_wand_to_hand: OngoingStartTurnOptionalGainLimpWandToHandRuntimeEffect;
}

export type OngoingEffectId =
  | "add_power_if_player_has_status"
  | "ongoing_add_power"
  | "ongoing_add_power_when_playing_wand"
  | "ongoing_add_power_per_dead_wizard_token"
  | "ongoing_add_power_when_playing_limp_wand"
  | "ongoing_first_attack_damage_add_power"
  | "ongoing_hand_refill_bonus"
  | "ongoing_start_turn_optional_gain_limp_wand_to_hand";

export const ongoingEffectIds = [
  "ongoing_add_power",
  "ongoing_add_power_when_playing_wand",
  "ongoing_add_power_per_dead_wizard_token",
  "ongoing_add_power_when_playing_limp_wand",
  "ongoing_first_attack_damage_add_power",
  "ongoing_hand_refill_bonus",
  "ongoing_start_turn_optional_gain_limp_wand_to_hand",
] as const satisfies readonly OngoingEffectId[];

export interface OngoingEffectDecoderTools {
  defineDecoder<Id extends OngoingEffectId>(
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
  oneWandCardTag: ValueDecoder<["wandCard"]>;
}

export type OngoingEffectDecoders = {
  [Id in OngoingEffectId]: RuntimeEffectDecoder<Id>;
};

export function createOngoingEffectDecoders(
  tools: OngoingEffectDecoderTools
): OngoingEffectDecoders {
  const { defineDecoder, required, literal, positiveInteger, oneWandCardTag } =
    tools;
  return {
    add_power_if_player_has_status: defineDecoder(
      "add_power_if_player_has_status",
      {
        effectId: required(literal("add_power_if_player_has_status")),
        timing: required(literal("whileControlled")),
        amount: required(positiveInteger),
        statusId: required(literal("dingler")),
      }
    ),
    ongoing_add_power: defineDecoder("ongoing_add_power", {
      effectId: required(literal("ongoing_add_power")),
      timing: required(literal("whileControlled")),
      amount: required(positiveInteger),
    }),
    ongoing_add_power_when_playing_wand: defineDecoder(
      "ongoing_add_power_when_playing_wand",
      {
        effectId: required(literal("ongoing_add_power_when_playing_wand")),
        timing: required(literal("onPlayCard")),
        amount: required(positiveInteger),
        cardTags: required(oneWandCardTag),
      }
    ),
    ongoing_add_power_per_dead_wizard_token: defineDecoder(
      "ongoing_add_power_per_dead_wizard_token",
      {
        effectId: required(literal("ongoing_add_power_per_dead_wizard_token")),
        timing: required(literal("whileControlled")),
        amount: required(positiveInteger),
      }
    ),
    ongoing_add_power_when_playing_limp_wand: defineDecoder(
      "ongoing_add_power_when_playing_limp_wand",
      {
        effectId: required(literal("ongoing_add_power_when_playing_limp_wand")),
        timing: required(literal("afterControllerPlaysCard")),
        amount: required(positiveInteger),
        cardKind: required(literal("limpWand")),
      }
    ),
    ongoing_first_attack_damage_add_power: defineDecoder(
      "ongoing_first_attack_damage_add_power",
      {
        effectId: required(literal("ongoing_first_attack_damage_add_power")),
        timing: required(literal("afterFirstAttackDamageEachTurn")),
        amount: required(literal("totalDamageDealtByThatAttack")),
      }
    ),
    ongoing_hand_refill_bonus: defineDecoder("ongoing_hand_refill_bonus", {
      effectId: required(literal("ongoing_hand_refill_bonus")),
      timing: required(literal("endTurn")),
      amount: required(positiveInteger),
    }),
    ongoing_start_turn_optional_gain_limp_wand_to_hand: defineDecoder(
      "ongoing_start_turn_optional_gain_limp_wand_to_hand",
      {
        effectId: required(
          literal("ongoing_start_turn_optional_gain_limp_wand_to_hand")
        ),
        timing: required(literal("startOfControllerTurn")),
        destination: required(literal("hand")),
        amount: required(positiveInteger),
        chooser: required(literal("controller")),
      }
    ),
  };
}

const addPowerIfPlayerHasStatusHandler: EffectRuntimeHandler<AddPowerIfPlayerHasStatusRuntimeEffect> =
  {
    effectId: "add_power_if_player_has_status",
    execute() {
      return {
        ok: false,
        error: "add_power_if_player_has_status is a passive controlled effect",
      };
    },
    evaluateControlledPower(effect, context) {
      return {
        status: "resolved",
        result: context.controller.statuses.some(
          (status) => status.statusId === effect.statusId
        )
          ? effect.amount
          : 0,
      };
    },
  };

const ongoingAddPowerHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"ongoing_add_power">
> = {
  effectId: "ongoing_add_power",
  execute() {
    return {
      ok: false,
      error: "ongoing_add_power is a passive controlled effect",
    };
  },
  evaluateControlledPower(effect) {
    return { status: "resolved", result: effect.amount };
  },
};

const ongoingFirstAttackDamageAddPowerHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"ongoing_first_attack_damage_add_power">
> = {
  effectId: "ongoing_first_attack_damage_add_power",
  execute() {
    return {
      ok: false,
      error:
        "ongoing_first_attack_damage_add_power is a triggered controlled effect",
    };
  },
  applyAfterPlayerAttackDamage(_effect, context) {
    const { state, controller, source, totalDamageDealt } = context;
    const powerBefore = state.turn.power;
    state.turn.power += totalDamageDealt;
    recordTurnPowerChanged(
      state,
      controller,
      source,
      "ongoing_first_attack_damage_add_power",
      powerBefore,
      state.turn.power
    );
    return { status: "resolved", result: { ok: true } };
  },
};

function applyOngoingWandPower(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffectForId<"ongoing_add_power_when_playing_wand">,
  source: EffectSourceContext
): EffectExecutionResult {
  const powerBefore = state.turn.power;
  state.turn.power += effect.amount;
  recordTurnPowerChanged(
    state,
    player,
    source,
    "ongoing_add_power_when_playing_wand",
    powerBefore,
    state.turn.power
  );
  return { ok: true };
}

const ongoingAddPowerWhenPlayingWandHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"ongoing_add_power_when_playing_wand">
> = {
  effectId: "ongoing_add_power_when_playing_wand",
  execute(state, player, effect, source) {
    return applyOngoingWandPower(state, player, effect, source);
  },
  executeOnPlayCard(effect, context) {
    const matchesPlayedCard = effect.cardTags.some(
      (cardTag) =>
        context.playedDefinition.engine.tags?.includes(cardTag) === true
    );
    if (!matchesPlayedCard) return { status: "notApplicable" };
    return {
      status: "resolved",
      result: applyOngoingWandPower(
        context.state,
        context.controller,
        effect,
        context.source
      ),
    };
  },
};

const ongoingAddPowerPerDeadWizardTokenHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"ongoing_add_power_per_dead_wizard_token">
> = {
  effectId: "ongoing_add_power_per_dead_wizard_token",
  execute() {
    return {
      ok: false,
      error:
        "ongoing_add_power_per_dead_wizard_token is a passive controlled effect",
    };
  },
  evaluateControlledPower(effect, context) {
    return {
      status: "resolved",
      result: context.controller.deadWizardTokens.length * effect.amount,
    };
  },
};

const ongoingHandRefillBonusHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"ongoing_hand_refill_bonus">
> = {
  effectId: "ongoing_hand_refill_bonus",
  execute() {
    return {
      ok: false,
      error: "ongoing_hand_refill_bonus is an end-turn hand-limit effect",
    };
  },
  evaluateEndTurnDrawModifier(effect, context) {
    return {
      status: "resolved",
      result: context.currentDrawCount + effect.amount,
    };
  },
};

export interface OngoingCatalogTools {
  bindRuntimeEffectDecoder<Id extends OngoingEffectId>(
    effectId: Id
  ): RuntimeEffectDecoder<Id>;
}

export function createControlledPowerEffectDefinitions(
  tools: OngoingCatalogTools
) {
  const { bindRuntimeEffectDecoder } = tools;
  const supportedModes =
    allEffectRuntimeModes satisfies EffectRuntimeSupportedModes;
  const supportedSourceKinds = [
    "card",
  ] as const satisfies EffectRuntimeSupportedSourceKinds;
  return [
    {
      effectId: "add_power_if_player_has_status",
      decoder: bindRuntimeEffectDecoder("add_power_if_player_has_status"),
      supportedTimings: [
        "whileControlled",
      ] as const satisfies EffectRuntimeSupportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: addPowerIfPlayerHasStatusHandler,
    },
    {
      effectId: "ongoing_add_power",
      decoder: bindRuntimeEffectDecoder("ongoing_add_power"),
      supportedTimings: [
        "whileControlled",
      ] as const satisfies EffectRuntimeSupportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: ongoingAddPowerHandler,
    },
    {
      effectId: "ongoing_add_power_per_dead_wizard_token",
      decoder: bindRuntimeEffectDecoder(
        "ongoing_add_power_per_dead_wizard_token"
      ),
      supportedTimings: [
        "whileControlled",
      ] as const satisfies EffectRuntimeSupportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: ongoingAddPowerPerDeadWizardTokenHandler,
    },
  ] as const;
}

export function createOngoingEffectDefinitions(tools: OngoingCatalogTools) {
  const { bindRuntimeEffectDecoder } = tools;
  const supportedModes =
    allEffectRuntimeModes satisfies EffectRuntimeSupportedModes;
  const supportedSourceKinds = [
    "card",
  ] as const satisfies EffectRuntimeSupportedSourceKinds;
  return [
    {
      effectId: "ongoing_add_power_when_playing_wand",
      decoder: bindRuntimeEffectDecoder("ongoing_add_power_when_playing_wand"),
      supportedTimings: ["onPlayCard"] as const,
      supportedModes,
      supportedSourceKinds,
      handler: ongoingAddPowerWhenPlayingWandHandler,
    },
    {
      effectId: "ongoing_add_power_when_playing_limp_wand",
      decoder: bindRuntimeEffectDecoder(
        "ongoing_add_power_when_playing_limp_wand"
      ),
      supportedTimings: ["afterControllerPlaysCard"] as const,
      supportedModes,
      supportedSourceKinds,
      handler: createUnsupportedEffectHandler(
        "ongoing_add_power_when_playing_limp_wand"
      ),
    },
    {
      effectId: "ongoing_first_attack_damage_add_power",
      decoder: bindRuntimeEffectDecoder(
        "ongoing_first_attack_damage_add_power"
      ),
      supportedTimings: ["afterFirstAttackDamageEachTurn"] as const,
      supportedModes,
      supportedSourceKinds,
      handler: ongoingFirstAttackDamageAddPowerHandler,
    },
    {
      effectId: "ongoing_hand_refill_bonus",
      decoder: bindRuntimeEffectDecoder("ongoing_hand_refill_bonus"),
      supportedTimings: ["endTurn"] as const,
      supportedModes,
      supportedSourceKinds,
      handler: ongoingHandRefillBonusHandler,
    },
    {
      effectId: "ongoing_start_turn_optional_gain_limp_wand_to_hand",
      decoder: bindRuntimeEffectDecoder(
        "ongoing_start_turn_optional_gain_limp_wand_to_hand"
      ),
      supportedTimings: ["startOfControllerTurn"] as const,
      supportedModes,
      supportedSourceKinds,
      handler: createUnsupportedEffectHandler(
        "ongoing_start_turn_optional_gain_limp_wand_to_hand"
      ),
    },
  ] as const;
}
