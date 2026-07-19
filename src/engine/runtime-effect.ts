const effectTimings = [
  "activation",
  "afterControllerPlaysCard",
  "afterDamageDealt",
  "afterFirstAttackDamageEachTurn",
  "attackReplacement",
  "defense",
  "endTurn",
  "onDefense",
  "onGain",
  "onGainCard",
  "onMayhemResolve",
  "onPlay",
  "onPlayCard",
  "replacement",
  "scoring",
  "setup",
  "startOfControllerTurn",
  "untilEndOfTurn",
  "whileControlled",
  "whileScoring",
] as const;

export type EffectTiming = (typeof effectTimings)[number];

export type TargetSelector =
  | "activePlayer"
  | "activePlayerHandCard"
  | "allPlayers"
  | "anyPlayer"
  | "mainMarketCard"
  | "opponentPlayer"
  | "opponentPlayers";

export interface RuntimeEffectSelectorTarget {
  selector: TargetSelector;
}

export type RuntimeEffectTokenKind = "deadWizardToken" | "wizardProperty";

export type RuntimeEffectTarget =
  | RuntimeEffectSelectorTarget
  | {
      targetType: "card";
      definitionId?: string;
      cardTypes?: string[];
    }
  | {
      targetType: "token";
      definitionId?: string;
      tokenKind?: RuntimeEffectTokenKind;
    }
  | {
      targetType: "player";
    };

export function isRuntimeEffectTarget(
  value: unknown
): value is RuntimeEffectTarget {
  if (!isRuntimeEffectTargetRecord(value)) {
    return false;
  }

  if ("selector" in value) {
    return isRuntimeEffectSelectorTarget(value);
  }

  if (value["targetType"] === "card") {
    return (
      isOptionalString(value["definitionId"]) &&
      isOptionalStringArray(value["cardTypes"])
    );
  }

  if (value["targetType"] === "token") {
    return (
      isOptionalString(value["definitionId"]) &&
      (value["tokenKind"] === undefined ||
        value["tokenKind"] === "deadWizardToken" ||
        value["tokenKind"] === "wizardProperty")
    );
  }

  return value["targetType"] === "player";
}

export function isRuntimeEffectSelectorTarget(
  value: unknown
): value is RuntimeEffectSelectorTarget {
  return (
    isRuntimeEffectTargetRecord(value) && isTargetSelector(value["selector"])
  );
}

export function isRuntimeEffectTargetSelector(
  value: unknown
): value is RuntimeEffectTargetSelector {
  return (
    isTargetSelector(value) ||
    value === "chosenFoe" ||
    value === "chosenLeftOrRightFoe" ||
    value === "chosenPlayer" ||
    value === "eachFoe" ||
    value === "eachPlayerClockwiseFromActive" ||
    value === "leftOrRightFoe" ||
    value === "sameAsPreviousAttackTarget"
  );
}

export type RuntimeEffectTargetSelector =
  | TargetSelector
  | "chosenFoe"
  | "chosenLeftOrRightFoe"
  | "chosenPlayer"
  | "eachFoe"
  | "eachPlayerClockwiseFromActive"
  | "leftOrRightFoe"
  | "sameAsPreviousAttackTarget";

export interface ControlCountEffectCondition {
  conditionId: "control_count";
  cardTypes: string[];
  minimumCount: number;
}

interface LegacyControlsOtherCardTypeEffectCondition {
  effectId: "controls_other_card_type";
  minimum: number;
  cardType: string;
}

export type RuntimeEffectCondition =
  | ControlCountEffectCondition
  | LegacyControlsOtherCardTypeEffectCondition;

export interface DiscardOtherHandCardRuntimeEffectCost {
  costId: "discard_other_hand_card";
}

export interface SpendChipsRuntimeEffectCost {
  costId: "spend_chips";
  amount: number;
}

export interface PayLifeRuntimeEffectCost {
  costId: "pay_life";
  amount: number;
}

export type RuntimeEffectCost =
  | DiscardOtherHandCardRuntimeEffectCost
  | SpendChipsRuntimeEffectCost
  | PayLifeRuntimeEffectCost;

const knownRuntimeEffectIds = [
  "activation_destroy_self_then_destroy_own_cards",
  "add_power",
  "add_power_if_player_has_status",
  "add_power_per_controlled_object",
  "add_power_per_controlled_permanent",
  "add_power_per_player_with_status",
  "attack_damage",
  "attack_damage_equal_remembered_card_cost",
  "attack_damage_equal_to_controlled_card_cost",
  "attack_destroy_top_legend_deck_then_damage_equal_cost",
  "attack_discard_cards",
  "attack_gain_limp_wand",
  "attack_gain_status",
  "avoid_attack",
  "conditional_activation_attack_damage",
  "conditional_activation_destroy_own_cards",
  "conditional_activation_gain_chips",
  "controls_other_card_type",
  "deal_damage",
  "defense_discard_self_avoid_attack_then_optional_destroy_hand_card",
  "destroy_card",
  "destroy_own_cards",
  "destroy_random_legend_market_card",
  "destroyed_card_kind_is",
  "directional_chain_attack",
  "discard_card",
  "discard_hand_then_draw_cards",
  "discard_self",
  "draw_cards",
  "endgame_limp_wands_score_positive",
  "endgame_vp_per_owned_legend",
  "exchange_life_and_dingler_status",
  "fixture_add_power_equal_to_target_cost",
  "fixture_modify_effective_value",
  "force_starting_player",
  "gain_card",
  "gain_chips",
  "gain_chips_equal_damage_dealt",
  "gain_chips_per_player_with_status",
  "gain_status",
  "heal",
  "heal_equal_damage_dealt",
  "heal_equal_damage_dealt_on_own_turn",
  "increase_hand_limit_at_max_life",
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
  "modify_effective_value",
  "modify_owned_wand_attack_damage",
  "multi_target_attack",
  "on_gain_self_gain_limp_wands",
  "ongoing_add_power",
  "ongoing_add_power_when_playing_wand",
  "ongoing_add_power_per_dead_wizard_token",
  "ongoing_add_power_when_playing_limp_wand",
  "ongoing_first_attack_damage_add_power",
  "ongoing_hand_refill_bonus",
  "ongoing_start_turn_optional_gain_limp_wand_to_hand",
  "optional_gain_market_cards_to_hand_this_turn",
  "optional_spend_chip_attack_damage",
  "optional_spend_chip_destroy_own_cards",
  "play_top_card",
  "play_top_card_from_foe_deck",
  "prevent_defense_against_owned_wand_attacks",
  "remove_status",
  "replace_starting_card",
  "return_discard_to_hand",
  "reveal_top_card",
  "set_life",
  "set_resurrection_life_total",
  "set_starting_life_total",
  "start_with_basic_trophy",
  "temporary_hand_limit_by_gained_card_type",
  "toggle_status",
  "topdeck_gained_card",
  "wild_magic_choice",
] as const;

type KnownRuntimeEffectId = (typeof knownRuntimeEffectIds)[number];

/** Known payload fields shared by the runtime handlers.  Deliberately no
 * index signature: typoed effect["..."] access must be rejected by TypeScript. */
export interface RuntimeEffectFields {
  condition?: RuntimeEffectCondition;
  costs?: RuntimeEffectCost[];
  allowDinglerStatusExchange?: unknown;
  allowLifeExchange?: unknown;
  amount?: unknown;
  amountPerOwnedCard?: unknown;
  amountPerPlayer?: unknown;
  branchEffects?: RuntimeEffect[];
  cardDefinitionIds?: unknown;
  cardKind?: unknown;
  cardTags?: unknown;
  cardTypes?: unknown;
  chipAmount?: unknown;
  chipCost?: unknown;
  chooser?: unknown;
  costMode?: unknown;
  countedCardTypes?: unknown;
  destination?: unknown;
  emptyChoice?: unknown;
  excludeSource?: unknown;
  fromDefinitionId?: unknown;
  isOngoing?: unknown;
  lifeCost?: unknown;
  lifeTotal?: unknown;
  onDamageDealt?: AttackOutcomeBranch[];
  onKill?: AttackOutcomeBranch[];
  operation?: unknown;
  optional?: unknown;
  options?: unknown;
  redirectAttack?: unknown;
  source?: unknown;
  status?: unknown;
  statusId?: unknown;
  target?: RuntimeEffectTarget;
  targetSelector?: RuntimeEffectTargetSelector;
  timing?: EffectTiming;
  toDefinitionId?: unknown;
  unlessStatusId?: unknown;
  valueKind?: unknown;
  voteTargetSelector?: unknown;
  winnerDrawAmount?: unknown;
}

export interface OngoingAddPowerPerDeadWizardTokenRuntimeEffect {
  effectId: "ongoing_add_power_per_dead_wizard_token";
  timing: "whileControlled";
  amount: number;
}

export type AttackOutcomeBranch =
  | { effectId: "gain_chips"; amount: number }
  | { effectId: "gain_chips_equal_damage_dealt" }
  | { effectId: "heal_equal_damage_dealt" }
  | { effectId: "return_discard_to_hand"; amount: number }
  | { effectId: "gain_status"; statusId: "dingler"; target?: "damagedPlayer" };

type RuntimeEffectPayloadVariant<EffectId extends KnownRuntimeEffectId> = {
  effectId: EffectId;
  condition?: RuntimeEffectCondition;
  costs?: RuntimeEffectCost[];
  target?: RuntimeEffectTarget;
  targetSelector?: RuntimeEffectTargetSelector;
} & RuntimeEffectFields &
  (EffectId extends "wild_magic_choice"
    ? { options?: WildMagicOption[] }
    : EffectId extends "ongoing_hand_refill_bonus"
      ? { amount: number }
      : EffectId extends "ongoing_add_power_per_dead_wizard_token"
        ? OngoingAddPowerPerDeadWizardTokenRuntimeEffect
        : unknown);

export type RuntimeEffectPayload = {
  [EffectId in KnownRuntimeEffectId]: RuntimeEffectPayloadVariant<EffectId>;
}[KnownRuntimeEffectId];

export type RuntimeEffect = RuntimeEffectPayload & {
  timing: EffectTiming;
};

export type AvoidAttackRuntimeEffect = RuntimeEffect & {
  effectId: "avoid_attack";
  timing: "onDefense";
  destination: "discardSelf" | "topdeckSelf";
  redirectAttack?: boolean;
};

export function isAvoidAttackRuntimeEffect(
  effect: RuntimeEffect
): effect is AvoidAttackRuntimeEffect {
  return (
    effect.effectId === "avoid_attack" &&
    effect.timing === "onDefense" &&
    (effect.destination === "discardSelf" || effect.destination === "topdeckSelf") &&
    (effect.redirectAttack === undefined ||
      typeof effect.redirectAttack === "boolean")
  );
}

export type WildMagicOption =
  | (Omit<RuntimeEffectFields, "options"> & {
      effectId: "add_power";
      amount: number;
    })
  | (Omit<RuntimeEffectFields, "options"> & {
      effectId: "play_top_card_from_foe_deck";
      targetSelector: "chosenFoe";
    });

export function isWildMagicOption(value: unknown): value is WildMagicOption {
  if (!isRuntimeEffectTargetRecord(value)) {
    return false;
  }

  if (value["effectId"] === "add_power") {
    return (
      typeof value["amount"] === "number" &&
      Number.isSafeInteger(value["amount"]) &&
      value["amount"] > 0
    );
  }

  return (
    value["effectId"] === "play_top_card_from_foe_deck" &&
    value["targetSelector"] === "chosenFoe"
  );
}

export type RuntimeEffectId = RuntimeEffectPayload["effectId"];

export function isEffectTiming(value: unknown): value is EffectTiming {
  return (
    typeof value === "string" && effectTimings.includes(value as EffectTiming)
  );
}

export function isRuntimeEffectCondition(
  value: unknown
): value is RuntimeEffectCondition {
  if (!isRuntimeEffectTargetRecord(value)) {
    return false;
  }

  if (value["conditionId"] === "control_count") {
    return (
      Array.isArray(value["cardTypes"]) &&
      value["cardTypes"].every(isString) &&
      typeof value["minimumCount"] === "number" &&
      Number.isSafeInteger(value["minimumCount"])
    );
  }

  return (
    value["effectId"] === "controls_other_card_type" &&
    typeof value["cardType"] === "string" &&
    typeof value["minimum"] === "number" &&
    Number.isSafeInteger(value["minimum"])
  );
}

export function isRuntimeEffectCost(
  value: unknown
): value is RuntimeEffectCost {
  if (!isRuntimeEffectTargetRecord(value)) {
    return false;
  }

  if (value["costId"] === "discard_other_hand_card") {
    return true;
  }

  return (
    (value["costId"] === "spend_chips" || value["costId"] === "pay_life") &&
    typeof value["amount"] === "number" &&
    Number.isSafeInteger(value["amount"]) &&
    value["amount"] > 0
  );
}

function isTargetSelector(value: unknown): value is TargetSelector {
  return (
    value === "activePlayer" ||
    value === "activePlayerHandCard" ||
    value === "allPlayers" ||
    value === "anyPlayer" ||
    value === "mainMarketCard" ||
    value === "opponentPlayer" ||
    value === "opponentPlayers"
  );
}

function isRuntimeEffectTargetRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isString));
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isRuntimeEffectId(value: unknown): value is RuntimeEffectId {
  return (
    typeof value === "string" &&
    knownRuntimeEffectIds.includes(value as RuntimeEffectId)
  );
}
