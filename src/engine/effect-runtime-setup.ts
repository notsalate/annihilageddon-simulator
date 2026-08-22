import { markCardDefinitionId } from "../domain/types.js";
import { replaceOwnedCardDefinitionInPlayerZones } from "./control-ledger.js";
import type { EffectRuntimeEndTurnDrawModifierOperationContext } from "./effect-runtime-registry.js";
import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";
import {
  createUnsupportedEffectHandler,
  setupOnlyExecutionError,
} from "./effect-runtime-family-support.js";
import type { RuntimeEffectDecoder } from "./runtime-effect-decoder.js";
import type { EffectTiming, RuntimeEffectForId } from "./runtime-effect.js";
import {
  allEffectRuntimeModes,
  immediateEffectTimings,
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
type DecodedPayloadValidator<Id extends SetupEffectId> = (
  subjectId: string,
  effect: RuntimeEffectForId<Id>
) => string[];

export type SetupEffectId =
  | "force_starting_player"
  | "replace_starting_card"
  | "start_with_basic_trophy"
  | "set_starting_life_total"
  | "set_resurrection_life_total"
  | "increase_hand_limit_at_max_life"
  | "temporary_hand_limit_by_gained_card_type"
  | "endgame_limp_wands_score_positive"
  | "endgame_vp_per_owned_legend"
  | "controls_other_card_type"
  | "destroyed_card_kind_is";

export const setupEffectIds = [
  "force_starting_player",
  "replace_starting_card",
  "start_with_basic_trophy",
  "set_starting_life_total",
  "set_resurrection_life_total",
  "increase_hand_limit_at_max_life",
  "temporary_hand_limit_by_gained_card_type",
  "endgame_limp_wands_score_positive",
  "endgame_vp_per_owned_legend",
  "controls_other_card_type",
  "destroyed_card_kind_is",
] as const satisfies readonly SetupEffectId[];

export interface SetupEffectDecoderTools {
  defineDecoder<Id extends SetupEffectId>(
    effectId: Id,
    fields: ObjectFields<RuntimeEffectForId<Id>>,
    validateDecodedPayload?: DecodedPayloadValidator<Id>
  ): RuntimeEffectDecoder<Id>;
  required<T>(decode: ValueDecoder<T>): RequiredField<T>;
  optional<T>(decode: ValueDecoder<T>): OptionalField<T>;
  literal<const Value extends string | number | boolean>(
    expected: Value
  ): ValueDecoder<Value>;
  positiveInteger: ValueDecoder<number>;
  safeInteger: ValueDecoder<number>;
  nonNegativeInteger: ValueDecoder<number>;
  nonEmptyString: ValueDecoder<string>;
  nonEmptyStringArray: ValueDecoder<string[]>;
  optionalTiming: OptionalField<EffectTiming>;
}

export type SetupEffectDecoders = {
  [Id in SetupEffectId]: RuntimeEffectDecoder<Id>;
};

export function createSetupEffectDecoders(
  tools: SetupEffectDecoderTools
): SetupEffectDecoders {
  const {
    defineDecoder,
    required,
    optional,
    literal,
    positiveInteger,
    safeInteger,
    nonNegativeInteger,
    nonEmptyString,
    nonEmptyStringArray,
    optionalTiming,
  } = tools;

  return {
    force_starting_player: defineDecoder("force_starting_player", {
      effectId: required(literal("force_starting_player")),
      timing: required(literal("setup")),
      targetSelector: optional(literal("activePlayer")),
    }),
    replace_starting_card: defineDecoder("replace_starting_card", {
      effectId: required(literal("replace_starting_card")),
      timing: required(literal("setup")),
      fromDefinitionId: required((label, raw) =>
        typeof raw === "string" && raw.length > 0 && raw.trim() === raw
          ? { ok: true, value: raw }
          : {
              ok: false,
              errors: [`${label} must be a stable non-empty string`],
            }
      ),
      toDefinitionId: required((label, raw) =>
        typeof raw === "string" && raw.length > 0 && raw.trim() === raw
          ? { ok: true, value: raw }
          : {
              ok: false,
              errors: [`${label} must be a stable non-empty string`],
            }
      ),
    }),
    start_with_basic_trophy: defineDecoder("start_with_basic_trophy", {
      effectId: required(literal("start_with_basic_trophy")),
      timing: required(literal("setup")),
    }),
    set_starting_life_total: defineDecoder("set_starting_life_total", {
      effectId: required(literal("set_starting_life_total")),
      timing: required(literal("setup")),
      lifeTotal: required(positiveInteger),
    }),
    set_resurrection_life_total: defineDecoder("set_resurrection_life_total", {
      effectId: required(literal("set_resurrection_life_total")),
      timing: required(literal("replacement")),
      lifeTotal: required(positiveInteger),
      unlessStatusId: optional(nonEmptyString),
    }),
    increase_hand_limit_at_max_life: defineDecoder(
      "increase_hand_limit_at_max_life",
      {
        effectId: required(literal("increase_hand_limit_at_max_life")),
        timing: required(literal("endTurn")),
        amount: required(positiveInteger),
      }
    ),
    temporary_hand_limit_by_gained_card_type: defineDecoder(
      "temporary_hand_limit_by_gained_card_type",
      {
        effectId: required(literal("temporary_hand_limit_by_gained_card_type")),
        timing: required(literal("endTurn")),
        amount: required(positiveInteger),
        cardTypes: required(nonEmptyStringArray),
      },
      validateTemporaryHandLimitCardTypes
    ),
    endgame_limp_wands_score_positive: defineDecoder(
      "endgame_limp_wands_score_positive",
      {
        effectId: required(literal("endgame_limp_wands_score_positive")),
        timing: required(literal("scoring")),
        scoreMode: required(literal("absolutePositiveVictoryPoints")),
        appliesToOwnedCardKind: required(literal("limpWand")),
      }
    ),
    endgame_vp_per_owned_legend: defineDecoder("endgame_vp_per_owned_legend", {
      effectId: required(literal("endgame_vp_per_owned_legend")),
      timing: required(literal("scoring")),
      amountPerOwnedLegend: required(safeInteger),
    }),
    controls_other_card_type: defineDecoder("controls_other_card_type", {
      effectId: required(literal("controls_other_card_type")),
      timing: optionalTiming,
      minimum: required(nonNegativeInteger),
      cardType: required(nonEmptyString),
    }),
    destroyed_card_kind_is: defineDecoder("destroyed_card_kind_is", {
      effectId: required(literal("destroyed_card_kind_is")),
      timing: optionalTiming,
      cardKind: required(nonEmptyString),
    }),
  };
}

const runtimeCardTypes = new Set([
  "wizardCard",
  "spell",
  "treasure",
  "creature",
]);

function validateTemporaryHandLimitCardTypes(
  subjectId: string,
  effect: RuntimeEffectForId<"temporary_hand_limit_by_gained_card_type">
): string[] {
  const unknownCardType = effect.cardTypes.find(
    (cardType) => !runtimeCardTypes.has(cardType)
  );
  return unknownCardType === undefined
    ? []
    : [
        `${subjectId} uses unknown temporary-hand-limit card type ${unknownCardType}`,
      ];
}

const forceStartingPlayerHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"force_starting_player">
> = {
  effectId: "force_starting_player",
  execute() {
    return setupOnlyExecutionError("force_starting_player");
  },
  executeSetup(_player, _effect, source) {
    return {
      ok: true,
      directive: { kind: "forceStartingPlayer", playerId: source.playerId },
    };
  },
};

const replaceStartingCardHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"replace_starting_card">
> = {
  effectId: "replace_starting_card",
  execute() {
    return setupOnlyExecutionError("replace_starting_card");
  },
  executeSetup(player, effect, _source, services) {
    const fromDefinitionId = markCardDefinitionId(effect.fromDefinitionId);
    const toDefinitionId = markCardDefinitionId(effect.toDefinitionId);
    if (!services.hasCardDefinition(toDefinitionId)) {
      if (services.allowsMissingData) return { ok: true };
      return {
        ok: false,
        error: `Cannot replace with missing target card ${toDefinitionId}`,
      };
    }
    if (
      replaceOwnedCardDefinitionInPlayerZones(player, fromDefinitionId, () =>
        services.createCardInstance(toDefinitionId, player.playerId)
      )
    ) {
      return { ok: true };
    }
    if (services.allowsMissingData) return { ok: true };
    return {
      ok: false,
      error: `Cannot replace missing starting card ${fromDefinitionId} for ${player.playerId}`,
    };
  },
};

const startWithBasicTrophyHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"start_with_basic_trophy">
> = {
  effectId: "start_with_basic_trophy",
  execute() {
    return setupOnlyExecutionError("start_with_basic_trophy");
  },
  executeSetup(player) {
    if (
      !player.trophyLikeObjects.some(
        (trophy) => trophy.trophyId === "basicTrophy"
      )
    ) {
      player.trophyLikeObjects.push({
        instanceId: `setup-basic-trophy-${player.playerId}`,
        trophyId: "basicTrophy",
        ownerId: player.playerId,
        effects: [],
      });
    }
    return { ok: true };
  },
};

const setStartingLifeTotalHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"set_starting_life_total">
> = {
  effectId: "set_starting_life_total",
  execute() {
    return setupOnlyExecutionError("set_starting_life_total");
  },
  executeSetup(player, effect) {
    player.life.current = effect.lifeTotal;
    player.life.max = Math.max(player.life.max, effect.lifeTotal);
    return { ok: true };
  },
};

const setResurrectionLifeTotalHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"set_resurrection_life_total">
> = {
  effectId: "set_resurrection_life_total",
  execute() {
    return setupOnlyExecutionError("set_resurrection_life_total");
  },
};

function evaluateIncreaseHandLimitAtMaxLife(
  effect: RuntimeEffectForId<"increase_hand_limit_at_max_life">,
  context: EffectRuntimeEndTurnDrawModifierOperationContext,
  tools: SetupCatalogTools
) {
  const maxLife = tools.calculateEffectivePlayerMaxLife(
    context.state,
    context.controller.playerId
  );
  if (context.controller.life.current < maxLife) {
    return { status: "notApplicable" as const };
  }
  return {
    status: "resolved" as const,
    result: context.currentDrawCount + effect.amount,
  };
}

const temporaryHandLimitByGainedCardTypeHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"temporary_hand_limit_by_gained_card_type">
> = {
  effectId: "temporary_hand_limit_by_gained_card_type",
  execute() {
    return {
      ok: false,
      error:
        "temporary_hand_limit_by_gained_card_type is an end-turn hand-limit effect",
    };
  },
};

export interface SetupCatalogTools {
  bindRuntimeEffectDecoder<Id extends SetupEffectId>(
    effectId: Id
  ): RuntimeEffectDecoder<Id>;
  calculateEffectivePlayerMaxLife(
    state: GameState,
    playerId: PlayerState["playerId"]
  ): number;
}

type SetupEffectDefinition<Id extends SetupEffectId> = {
  readonly effectId: Id;
  readonly decoder: RuntimeEffectDecoder<Id>;
  readonly supportedTimings: EffectRuntimeSupportedTimings;
  readonly supportedModes: EffectRuntimeSupportedModes;
  readonly supportedSourceKinds: EffectRuntimeSupportedSourceKinds;
  readonly handler: EffectRuntimeHandler<RuntimeEffectForId<Id>>;
};
type AnySetupEffectDefinition = {
  [Id in SetupEffectId]: SetupEffectDefinition<Id>;
}[SetupEffectId];

export function createSetupEffectDefinitions(
  tools: SetupCatalogTools
): readonly AnySetupEffectDefinition[] {
  const { bindRuntimeEffectDecoder } = tools;
  const setupTiming = [
    "setup",
  ] as const satisfies EffectRuntimeSupportedTimings;
  const replacementTiming = [
    "replacement",
  ] as const satisfies EffectRuntimeSupportedTimings;
  const endTurnTiming = [
    "endTurn",
  ] as const satisfies EffectRuntimeSupportedTimings;
  const scoringTiming = [
    "scoring",
  ] as const satisfies EffectRuntimeSupportedTimings;
  return [
    {
      effectId: "force_starting_player",
      decoder: bindRuntimeEffectDecoder("force_starting_player"),
      supportedTimings: setupTiming,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["wizardProperty"],
      handler: forceStartingPlayerHandler,
    },
    {
      effectId: "replace_starting_card",
      decoder: bindRuntimeEffectDecoder("replace_starting_card"),
      supportedTimings: setupTiming,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["wizardProperty"],
      handler: replaceStartingCardHandler,
    },
    {
      effectId: "start_with_basic_trophy",
      decoder: bindRuntimeEffectDecoder("start_with_basic_trophy"),
      supportedTimings: setupTiming,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["wizardProperty"],
      handler: startWithBasicTrophyHandler,
    },
    {
      effectId: "set_starting_life_total",
      decoder: bindRuntimeEffectDecoder("set_starting_life_total"),
      supportedTimings: setupTiming,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["wizardProperty"],
      handler: setStartingLifeTotalHandler,
    },
    {
      effectId: "set_resurrection_life_total",
      decoder: bindRuntimeEffectDecoder("set_resurrection_life_total"),
      supportedTimings: replacementTiming,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["wizardProperty"],
      handler: setResurrectionLifeTotalHandler,
    },
    {
      effectId: "increase_hand_limit_at_max_life",
      decoder: bindRuntimeEffectDecoder("increase_hand_limit_at_max_life"),
      supportedTimings: endTurnTiming,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      handler: {
        effectId: "increase_hand_limit_at_max_life",
        execute() {
          return { ok: true };
        },
        evaluateEndTurnDrawModifier(effect, context) {
          return evaluateIncreaseHandLimitAtMaxLife(effect, context, tools);
        },
      },
    },
    {
      effectId: "temporary_hand_limit_by_gained_card_type",
      decoder: bindRuntimeEffectDecoder(
        "temporary_hand_limit_by_gained_card_type"
      ),
      supportedTimings: endTurnTiming,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["wizardProperty"],
      handler: temporaryHandLimitByGainedCardTypeHandler,
    },
    {
      effectId: "endgame_limp_wands_score_positive",
      decoder: bindRuntimeEffectDecoder("endgame_limp_wands_score_positive"),
      supportedTimings: scoringTiming,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      handler: createUnsupportedEffectHandler(
        "endgame_limp_wands_score_positive"
      ),
    },
    {
      effectId: "endgame_vp_per_owned_legend",
      decoder: bindRuntimeEffectDecoder("endgame_vp_per_owned_legend"),
      supportedTimings: scoringTiming,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      handler: createUnsupportedEffectHandler("endgame_vp_per_owned_legend"),
    },
    {
      effectId: "controls_other_card_type",
      decoder: bindRuntimeEffectDecoder("controls_other_card_type"),
      supportedTimings: immediateEffectTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      handler: createUnsupportedEffectHandler("controls_other_card_type"),
    },
    {
      effectId: "destroyed_card_kind_is",
      decoder: bindRuntimeEffectDecoder("destroyed_card_kind_is"),
      supportedTimings: immediateEffectTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds: ["card", "wizardProperty"],
      handler: createUnsupportedEffectHandler("destroyed_card_kind_is"),
    },
  ];
}
