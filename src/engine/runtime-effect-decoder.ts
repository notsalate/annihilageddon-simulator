import {
  effectTimings,
  knownRuntimeEffectIds,
  type AttackOutcomeBranch,
  type EffectTiming,
  type MayhemHandRedrawOption,
  type RuntimeEffect,
  type RuntimeEffectCondition,
  type RuntimeEffectCost,
  type RuntimeEffectForId,
  type RuntimeEffectId,
  type RuntimeEffectTarget,
  type RuntimeEffectTargetSelector,
  type WildMagicOption,
} from "./runtime-effect.js";
import { createActivationEffectDecoders } from "./effect-runtime-activation.js";
import { createCardOwnershipChoiceEffectDecoders } from "./effect-runtime-cards-ownership-choice.js";
import { createCardTypeEffectDecoders } from "./effect-runtime-card-type.js";
import { createEffectiveValueModifierEffectDecoders } from "./effect-runtime-effective-value-modifier.js";
import { createOngoingEffectDecoders } from "./effect-runtime-ongoing.js";
import { createResourceDrawEffectDecoders } from "./effect-runtime-resources-draw.js";
import { createCombatAttackEffectDecoders } from "./effect-runtime-combat-attack.js";
import { createCombatDefenseEffectDecoders } from "./effect-runtime-combat-defense.js";
import { createCombatReplacementEffectDecoders } from "./effect-runtime-combat-replacement.js";
import { createMayhemEffectDecoders } from "./effect-runtime-mayhem.js";
import { createSetupEffectDecoders } from "./effect-runtime-setup.js";
import { createWildMagicEffectDecoders } from "./effect-runtime-wild-magic.js";
import type {
  ObjectFields,
  OptionalField,
  RequiredField,
  ValueDecoder,
} from "./effect-runtime-family-support.js";

export type DecodeResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export interface RuntimeEffectDecoder<Id extends RuntimeEffectId> {
  effectId: Id;
  decode(subjectId: string, raw: unknown): DecodeResult<RuntimeEffectForId<Id>>;
}

function required<T>(decode: ValueDecoder<T>): RequiredField<T> {
  return { optional: false, decode };
}

function optional<T>(decode: ValueDecoder<T>): OptionalField<T> {
  return { optional: true, decode };
}

function success<T>(value: T): DecodeResult<T> {
  return { ok: true, value };
}

function failure(message: string): DecodeResult<never> {
  return { ok: false, errors: [message] };
}

function decodeObject<T extends object>(
  label: string,
  raw: unknown,
  fields: ObjectFields<T>
): DecodeResult<T> {
  if (!isPlainRecord(raw)) {
    return failure(`${label} must be an object`);
  }

  const allowedFields = new Set(Object.keys(fields));
  const errors = Object.keys(raw)
    .filter((key) => !allowedFields.has(key))
    .map((key) => `${label} uses unsupported field ${key}`);
  const decoded: Record<string, unknown> = {};

  for (const key in fields) {
    const definition = fields[key];
    const value = raw[key];
    if (value === undefined && definition.optional) {
      continue;
    }
    if (value === undefined) {
      errors.push(`${label}.${key} is required`);
      continue;
    }
    const result = definition.decode(`${label}.${key}`, value);
    if (!result.ok) {
      errors.push(...result.errors);
      continue;
    }
    decoded[key] = result.value;
  }

  return errors.length > 0 ? { ok: false, errors } : success(decoded as T);
}

function literal<const Value extends string | number | boolean>(
  expected: Value
): ValueDecoder<Value> {
  return (label, raw) =>
    raw === expected
      ? success(expected)
      : failure(`${label} must be ${String(expected)}`);
}

function oneOf<const Values extends readonly (string | number | boolean)[]>(
  values: Values
): ValueDecoder<Values[number]> {
  return (label, raw) =>
    values.includes(raw as Values[number])
      ? success(raw as Values[number])
      : failure(`${label} must be one of ${values.join(", ")}`);
}

const booleanValue: ValueDecoder<boolean> = (label, raw) =>
  typeof raw === "boolean" ? success(raw) : failure(`${label} must be boolean`);

const nonEmptyString: ValueDecoder<string> = (label, raw) =>
  typeof raw === "string" && raw.length > 0
    ? success(raw)
    : failure(`${label} must be a non-empty string`);

const safeInteger: ValueDecoder<number> = (label, raw) =>
  typeof raw === "number" && Number.isSafeInteger(raw)
    ? success(raw)
    : failure(`${label} must be a safe integer`);

const positiveInteger: ValueDecoder<number> = (label, raw) =>
  typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0
    ? success(raw)
    : failure(`${label} must be a positive integer`);

const nonNegativeInteger: ValueDecoder<number> = (label, raw) =>
  typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0
    ? success(raw)
    : failure(`${label} must be a non-negative integer`);

const effectTiming: ValueDecoder<EffectTiming> = oneOf(effectTimings);

function arrayOf<T>(decoder: ValueDecoder<T>): ValueDecoder<T[]> {
  return (label, raw) => {
    if (!Array.isArray(raw)) return failure(`${label} must be an array`);
    const values: T[] = [];
    const errors: string[] = [];
    for (const [index, value] of raw.entries()) {
      const result = decoder(`${label}[${index}]`, value);
      if (result.ok) values.push(result.value);
      else errors.push(...result.errors);
    }
    return errors.length > 0 ? { ok: false, errors } : success(values);
  };
}

function nonEmptyArrayOf<T>(decoder: ValueDecoder<T>): ValueDecoder<T[]> {
  return (label, raw) => {
    const result = arrayOf(decoder)(label, raw);
    if (!result.ok) return result;
    return result.value.length > 0
      ? result
      : failure(`${label} must not be empty`);
  };
}

const nonEmptyStringArray = nonEmptyArrayOf(nonEmptyString);
const handOrDiscardZone = oneOf(["hand", "discard"] as const);
const handOrDiscardZones = nonEmptyArrayOf(handOrDiscardZone);
const destroyOwnCardsSourceZones: ValueDecoder<
  "hand" | ("hand" | "discard")[]
> = (label, raw) =>
  raw === "hand" ? success("hand") : handOrDiscardZones(label, raw);

const targetSelector: ValueDecoder<RuntimeEffectTargetSelector> = oneOf([
  "activePlayer",
  "activePlayerHandCard",
  "allPlayers",
  "anyPlayer",
  "mainMarketCard",
  "opponentPlayer",
  "opponentPlayers",
  "chosenFoe",
  "chosenLeftOrRightFoe",
  "chosenPlayer",
  "eachFoe",
  "eachPlayerClockwiseFromActive",
  "leftOrRightFoe",
  "sameAsPreviousAttackTarget",
] as const);

const runtimeTarget: ValueDecoder<RuntimeEffectTarget> = (label, raw) => {
  if (!isPlainRecord(raw)) return failure(`${label} must be an object`);
  if ("selector" in raw) {
    return decodeObject(label, raw, {
      selector: required(
        oneOf([
          "activePlayer",
          "activePlayerHandCard",
          "allPlayers",
          "anyPlayer",
          "mainMarketCard",
          "opponentPlayer",
          "opponentPlayers",
        ] as const)
      ),
    });
  }
  if (raw["targetType"] === "card") {
    return decodeObject<Extract<RuntimeEffectTarget, { targetType: "card" }>>(
      label,
      raw,
      {
        targetType: required(literal("card")),
        definitionId: optional(nonEmptyString),
        cardTypes: optional(nonEmptyStringArray),
      }
    );
  }
  if (raw["targetType"] === "token") {
    return decodeObject<Extract<RuntimeEffectTarget, { targetType: "token" }>>(
      label,
      raw,
      {
        targetType: required(literal("token")),
        definitionId: optional(nonEmptyString),
        tokenKind: optional(
          oneOf(["deadWizardToken", "wizardProperty"] as const)
        ),
      }
    );
  }
  if (raw["targetType"] === "player") {
    return decodeObject(label, raw, {
      targetType: required(literal("player")),
    });
  }
  return failure(`${label}.targetType is unsupported`);
};

function selectorTarget<Selector extends RuntimeEffectTargetSelector>(
  expectedSelector: Selector
): ValueDecoder<{ selector: Selector }> {
  return (label, raw) => {
    const decoded = runtimeTarget(label, raw);
    if (!decoded.ok) return decoded;
    if (
      "selector" in decoded.value &&
      decoded.value.selector === expectedSelector
    ) {
      return success({ selector: expectedSelector });
    }
    return failure(`${label} must use selector ${expectedSelector}`);
  };
}

const runtimeCondition: ValueDecoder<RuntimeEffectCondition> = (label, raw) => {
  if (!isPlainRecord(raw)) return failure(`${label} must be an object`);
  if (raw["conditionId"] === "control_count") {
    return decodeObject(label, raw, {
      conditionId: required(literal("control_count")),
      cardTypes: required(nonEmptyStringArray),
      minimumCount: required(nonNegativeInteger),
    });
  }
  if (raw["effectId"] === "controls_other_card_type") {
    return decodeObject(label, raw, {
      effectId: required(literal("controls_other_card_type")),
      minimum: required(nonNegativeInteger),
      cardType: required(nonEmptyString),
    });
  }
  return failure(`${label} uses an unsupported condition shape`);
};

const runtimeCost: ValueDecoder<RuntimeEffectCost> = (label, raw) => {
  if (!isPlainRecord(raw)) return failure(`${label} must be an object`);
  if (raw["costId"] === "discard_other_hand_card") {
    return decodeObject(label, raw, {
      costId: required(literal("discard_other_hand_card")),
      amount: required(literal(1)),
    });
  }
  if (raw["costId"] === "spend_chips") {
    return decodeObject(label, raw, {
      costId: required(literal("spend_chips")),
      amount: required(positiveInteger),
    });
  }
  if (raw["costId"] === "pay_life") {
    return decodeObject(label, raw, {
      costId: required(literal("pay_life")),
      amount: required(positiveInteger),
    });
  }
  return failure(`${label}.costId is unsupported`);
};

const runtimeCosts = arrayOf(runtimeCost);

const attackOutcomeBranch: ValueDecoder<AttackOutcomeBranch> = (label, raw) => {
  if (!isPlainRecord(raw)) return failure(`${label} must be an object`);
  switch (raw["effectId"]) {
    case "gain_chips":
      return decodeObject(label, raw, {
        effectId: required(literal("gain_chips")),
        amount: required(positiveInteger),
      });
    case "gain_chips_equal_damage_dealt":
      return decodeObject(label, raw, {
        effectId: required(literal("gain_chips_equal_damage_dealt")),
      });
    case "heal_equal_damage_dealt":
      return decodeObject(label, raw, {
        effectId: required(literal("heal_equal_damage_dealt")),
      });
    case "return_discard_to_hand":
      return decodeObject(label, raw, {
        effectId: required(literal("return_discard_to_hand")),
        amount: required(positiveInteger),
      });
    case "gain_status":
      return decodeObject<
        Extract<AttackOutcomeBranch, { effectId: "gain_status" }>
      >(label, raw, {
        effectId: required(literal("gain_status")),
        statusId: required(literal("dingler")),
        target: optional(literal("damagedPlayer")),
      });
    default:
      return failure(`${label}.effectId is not a supported attack outcome`);
  }
};

const attackBranches = arrayOf(attackOutcomeBranch);

const wildMagicOption: ValueDecoder<WildMagicOption> = (label, raw) => {
  if (!isPlainRecord(raw)) return failure(`${label} must be an object`);
  if (raw["effectId"] === "add_power") {
    return decodeObject(label, raw, {
      effectId: required(literal("add_power")),
      amount: required(positiveInteger),
    });
  }
  if (raw["effectId"] === "play_top_card_from_foe_deck") {
    return decodeObject<
      Extract<WildMagicOption, { effectId: "play_top_card_from_foe_deck" }>
    >(label, raw, {
      effectId: required(literal("play_top_card_from_foe_deck")),
      targetSelector: required(literal("chosenFoe")),
      nonOngoingCleanupDestination: optional(literal("ownerDiscard")),
      ongoingOwnership: optional(literal("controller")),
    });
  }
  return failure(`${label}.effectId is not a supported Wild Magic option`);
};

const mayhemRedrawOption: ValueDecoder<MayhemHandRedrawOption> = (
  label,
  raw
) => {
  if (!isPlainRecord(raw)) return failure(`${label} must be an object`);
  if (raw["effectId"] === "discard_hand_then_draw_cards") {
    return decodeObject(label, raw, {
      effectId: required(literal("discard_hand_then_draw_cards")),
      drawAmount: required(literal(5)),
    });
  }
  if (raw["effectId"] === "take_damage") {
    return decodeObject(label, raw, {
      effectId: required(literal("take_damage")),
      amount: required(literal(5)),
    });
  }
  return failure(`${label}.effectId is not a supported Mayhem option`);
};

const runtimeEffectArray: ValueDecoder<RuntimeEffect[]> = (label, raw) => {
  if (!Array.isArray(raw)) return failure(`${label} must be an array`);
  const effects: RuntimeEffect[] = [];
  const errors: string[] = [];
  for (const [index, value] of raw.entries()) {
    const result = decodeTimedRuntimeEffect(`${label}[${index}]`, value);
    if (result.ok) effects.push(result.value);
    else errors.push(...result.errors);
  }
  return errors.length > 0 ? { ok: false, errors } : success(effects);
};

type DecodedPayloadValidator<Id extends RuntimeEffectId> = (
  subjectId: string,
  effect: RuntimeEffectForId<Id>
) => string[];

function defineDecoder<Id extends RuntimeEffectId>(
  effectId: Id,
  fields: ObjectFields<RuntimeEffectForId<Id>>,
  validateDecodedPayload?: DecodedPayloadValidator<Id>
): RuntimeEffectDecoder<Id> {
  return {
    effectId,
    decode(subjectId, raw) {
      const decoded = decodeObject(subjectId, raw, fields);
      if (!decoded.ok || validateDecodedPayload === undefined) {
        return decoded;
      }
      const errors = validateDecodedPayload(subjectId, decoded.value);
      return errors.length === 0 ? decoded : { ok: false, errors };
    },
  };
}

function requireTargetSelector(
  effectLabel: string,
  allowedSelectors: readonly RuntimeEffectTargetSelector[]
): DecodedPayloadValidator<RuntimeEffectId> {
  return (subjectId, effect) => {
    const target = "target" in effect ? effect.target : undefined;
    const nestedSelector =
      typeof target === "object" && target !== null && "selector" in target
        ? target.selector
        : undefined;
    const directSelector =
      "targetSelector" in effect ? effect.targetSelector : undefined;
    if (target !== undefined && directSelector !== undefined) {
      return [`${subjectId} target and targetSelector cannot both be provided`];
    }
    const selector = nestedSelector ?? directSelector;
    return allowedSelectors.some(
      (allowedSelector) => allowedSelector === selector
    )
      ? []
      : [
          `${subjectId} uses unsupported ${effectLabel} target ${String(selector)}`,
        ];
  };
}

function requireNestedTargetSelector(
  effectLabel: string,
  expectedSelector: RuntimeEffectTargetSelector
): DecodedPayloadValidator<RuntimeEffectId> {
  return (subjectId, effect) => {
    const target = "target" in effect ? effect.target : undefined;
    const selector =
      typeof target === "object" && target !== null && "selector" in target
        ? target.selector
        : undefined;
    return selector === expectedSelector
      ? []
      : [
          `${subjectId} uses unsupported ${effectLabel} target ${String(selector)}`,
        ];
  };
}

const optionalTiming = optional(effectTiming);
const optionalTarget = optional(runtimeTarget);
const optionalTargetSelector = optional(targetSelector);
const optionalCondition = optional(runtimeCondition);
const optionalCosts = optional(runtimeCosts);
const optionalAttackBranches = optional(attackBranches);

const resourceDrawEffectDecoders = createResourceDrawEffectDecoders({
  defineDecoder,
  required,
  optional,
  literal,
  positiveInteger,
  nonEmptyStringArray,
  optionalCondition,
  optionalTiming,
});

const cardOwnershipChoiceEffectDecoders =
  createCardOwnershipChoiceEffectDecoders({
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
  });

const activationEffectDecoders = createActivationEffectDecoders({
  defineDecoder,
  required,
  optional,
  literal,
  positiveInteger,
  optionalCondition,
  handOrDiscardZones,
  optionalTiming,
});

const oneWandCardTag: ValueDecoder<["wandCard"]> = (label, raw) => {
  const result = arrayOf(literal("wandCard"))(label, raw);
  return result.ok && result.value.length === 1
    ? success(["wandCard"] as ["wandCard"])
    : result.ok
      ? failure(`${label} must contain exactly wandCard`)
      : result;
};

const ongoingEffectDecoders = createOngoingEffectDecoders({
  defineDecoder,
  required,
  literal,
  positiveInteger,
  oneWandCardTag,
});

const effectiveValueModifierEffectDecoders =
  createEffectiveValueModifierEffectDecoders({
    defineDecoder,
    required,
    optional,
    literal,
    safeInteger,
    nonEmptyStringArray,
    runtimeTarget,
  });

const cardTypeEffectDecoders = createCardTypeEffectDecoders({
  defineDecoder,
  required,
  literal,
  nonEmptyStringArray,
});

const setupEffectDecoders = createSetupEffectDecoders({
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
});

const wildMagicEffectDecoders = createWildMagicEffectDecoders({
  defineDecoder,
  required,
  literal,
  wildMagicOption,
  arrayOf,
});

const combatAttackEffectDecoders = createCombatAttackEffectDecoders({
  defineDecoder,
  required,
  optional,
  literal,
  booleanValue,
  positiveInteger,
  optionalCondition,
  optionalTiming,
  optionalTarget,
  optionalTargetSelector,
  optionalCosts,
  optionalAttackBranches,
  selectorTarget,
  requireTargetSelector,
  oneOf,
});

const combatDefenseEffectDecoders = createCombatDefenseEffectDecoders({
  defineDecoder,
  required,
  optional,
  literal,
  booleanValue,
  optionalCosts,
  optionalRuntimeEffectArray: optional(runtimeEffectArray),
  oneOf,
  positiveInteger,
  decodeObject,
});

const combatReplacementEffectDecoders = createCombatReplacementEffectDecoders({
  defineDecoder,
  required,
  optional,
  literal,
  positiveInteger,
  nonEmptyStringArray,
});

const mayhemEffectDecoders = createMayhemEffectDecoders({
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
});

const runtimeEffectDecoders: {
  [Id in RuntimeEffectId]: RuntimeEffectDecoder<Id>;
} = {
  ...setupEffectDecoders,
  ...effectiveValueModifierEffectDecoders,

  add_power: defineDecoder("add_power", {
    effectId: required(literal("add_power")),
    timing: optionalTiming,
    amount: required(positiveInteger),
    condition: optionalCondition,
    activationLimit: optional(literal("oncePerTurnWhileControlled")),
  }),
  add_power_per_controlled_object: defineDecoder(
    "add_power_per_controlled_object",
    {
      effectId: required(literal("add_power_per_controlled_object")),
      timing: required(literal("onPlay")),
      amount: required(positiveInteger),
    }
  ),
  add_power_per_controlled_permanent: defineDecoder(
    "add_power_per_controlled_permanent",
    {
      effectId: required(literal("add_power_per_controlled_permanent")),
      timing: required(literal("onPlay")),
      amountPerPermanent: required(positiveInteger),
    }
  ),
  add_power_per_player_with_status: defineDecoder(
    "add_power_per_player_with_status",
    {
      effectId: required(literal("add_power_per_player_with_status")),
      timing: optionalTiming,
      statusId: required(literal("dingler")),
      amountPerPlayer: required(positiveInteger),
    }
  ),
  ...resourceDrawEffectDecoders,
  gain_chips_equal_damage_dealt: defineDecoder(
    "gain_chips_equal_damage_dealt",
    {
      effectId: required(literal("gain_chips_equal_damage_dealt")),
      timing: optionalTiming,
    }
  ),
  heal: defineDecoder(
    "heal",
    {
      effectId: required(literal("heal")),
      timing: optionalTiming,
      amount: required(positiveInteger),
      target: optionalTarget,
      targetSelector: optionalTargetSelector,
    },
    requireTargetSelector("healing", ["activePlayer"])
  ),
  heal_equal_damage_dealt: defineDecoder("heal_equal_damage_dealt", {
    effectId: required(literal("heal_equal_damage_dealt")),
    timing: optionalTiming,
  }),
  heal_equal_damage_dealt_on_own_turn: defineDecoder(
    "heal_equal_damage_dealt_on_own_turn",
    {
      effectId: required(literal("heal_equal_damage_dealt_on_own_turn")),
      timing: required(literal("afterDamageDealt")),
    }
  ),
  set_life: defineDecoder(
    "set_life",
    {
      effectId: required(literal("set_life")),
      timing: optionalTiming,
      lifeTotal: required(positiveInteger),
      target: optionalTarget,
      targetSelector: optionalTargetSelector,
    },
    requireTargetSelector("set-life", ["activePlayer"])
  ),
  gain_status: defineDecoder(
    "gain_status",
    {
      effectId: required(literal("gain_status")),
      timing: optionalTiming,
      statusId: required(literal("dingler")),
      target: optional<RuntimeEffectTarget | "damagedPlayer">((label, raw) =>
        raw === "damagedPlayer"
          ? success<"damagedPlayer">("damagedPlayer")
          : runtimeTarget(label, raw)
      ),
      targetSelector: optionalTargetSelector,
    },
    requireTargetSelector("gain-status", [
      "activePlayer",
      "opponentPlayer",
      "anyPlayer",
      "eachPlayerClockwiseFromActive",
    ])
  ),
  remove_status: defineDecoder(
    "remove_status",
    {
      effectId: required(literal("remove_status")),
      timing: optionalTiming,
      statusId: required(literal("dingler")),
      target: optionalTarget,
      targetSelector: optionalTargetSelector,
    },
    requireTargetSelector("remove-status", [
      "activePlayer",
      "opponentPlayer",
      "anyPlayer",
      "eachPlayerClockwiseFromActive",
    ])
  ),
  toggle_status: defineDecoder(
    "toggle_status",
    {
      effectId: required(literal("toggle_status")),
      timing: optionalTiming,
      statusId: required(literal("dingler")),
      target: optionalTarget,
      targetSelector: optionalTargetSelector,
    },
    requireTargetSelector("toggle-status", [
      "activePlayer",
      "opponentPlayer",
      "anyPlayer",
      "eachPlayerClockwiseFromActive",
    ])
  ),
  exchange_life_and_dingler_status: defineDecoder(
    "exchange_life_and_dingler_status",
    {
      effectId: required(literal("exchange_life_and_dingler_status")),
      timing: optionalTiming,
      target: optionalTarget,
      targetSelector: optionalTargetSelector,
      optional: optional(booleanValue),
      allowLifeExchange: optional(booleanValue),
      allowDinglerStatusExchange: optional(booleanValue),
    },
    requireTargetSelector("life exchange", ["opponentPlayer", "chosenFoe"])
  ),
  deal_damage: defineDecoder(
    "deal_damage",
    {
      effectId: required(literal("deal_damage")),
      timing: optionalTiming,
      amount: required(positiveInteger),
      target: optionalTarget,
      targetSelector: optionalTargetSelector,
    },
    requireTargetSelector("damage", ["opponentPlayer", "activePlayer"])
  ),
  ...cardOwnershipChoiceEffectDecoders,
  ...cardTypeEffectDecoders,
  fixture_add_power_equal_to_target_cost: defineDecoder(
    "fixture_add_power_equal_to_target_cost",
    {
      effectId: required(literal("fixture_add_power_equal_to_target_cost")),
      timing: optionalTiming,
      target: optionalTarget,
      targetSelector: optionalTargetSelector,
      emptyChoice: optional(literal("fail")),
    },
    requireNestedTargetSelector("fixture target-cost power", "mainMarketCard")
  ),

  ...activationEffectDecoders,
  ...ongoingEffectDecoders,

  ...setupEffectDecoders,
  ...wildMagicEffectDecoders,
  ...combatAttackEffectDecoders,
  ...combatDefenseEffectDecoders,
  ...combatReplacementEffectDecoders,
  ...mayhemEffectDecoders,
};

export function decodeRuntimeEffectForId<Id extends RuntimeEffectId>(
  subjectId: string,
  effectId: Id,
  raw: unknown
): DecodeResult<RuntimeEffectForId<Id>> {
  return runtimeEffectDecoders[effectId].decode(subjectId, raw);
}

export function decodeRuntimeEffect(
  subjectId: string,
  raw: unknown
): DecodeResult<RuntimeEffectForId<RuntimeEffectId>> {
  if (!isPlainRecord(raw)) return failure(`${subjectId} must be an object`);
  const effectId = raw["effectId"];
  if (typeof effectId !== "string" || !isKnownRuntimeEffectId(effectId)) {
    return failure(
      `${subjectId} uses unsupported effect id ${String(effectId)}`
    );
  }
  return runtimeEffectDecoders[effectId].decode(subjectId, raw);
}

export function decodeTimedRuntimeEffect(
  subjectId: string,
  raw: unknown
): DecodeResult<RuntimeEffect> {
  const result = decodeRuntimeEffect(subjectId, raw);
  if (!result.ok) return result;
  return hasRuntimeEffectTiming(result.value)
    ? success(result.value)
    : failure(`${subjectId}.timing is required`);
}

function hasRuntimeEffectTiming(
  effect: RuntimeEffectForId<RuntimeEffectId>
): effect is RuntimeEffect {
  return effect.timing !== undefined;
}

function isKnownRuntimeEffectId(value: string): value is RuntimeEffectId {
  return knownRuntimeEffectIds.some((effectId) => effectId === value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
