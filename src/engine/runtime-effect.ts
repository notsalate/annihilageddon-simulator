import type { ResourceDrawEffectPayloadMap } from "./effect-runtime-resources-draw.js";
import type {
  CardOwnershipChoiceEffectPayloadMap,
  WildMagicOption,
} from "./effect-runtime-cards-ownership-choice.js";
import type { ActivationEffectPayloadMap } from "./effect-runtime-activation.js";
import type {
  AddPowerIfPlayerHasStatusRuntimeEffect,
  OngoingEffectPayloadMap,
} from "./effect-runtime-ongoing.js";
import type { EffectiveValueModifierEffectPayloadMap } from "./effect-runtime-effective-value-modifier.js";
import type { CardTypeEffectPayloadMap } from "./effect-runtime-card-type.js";
import type { DeadWizardTokenEffectPayloadMap } from "./effect-runtime-dead-wizard-token.js";

export type {
  ResourceDrawEffectPayloadMap,
  GainChipsRuntimeEffect,
  GainChipsPerPlayerWithStatusRuntimeEffect,
  DrawCardsRuntimeEffect,
} from "./effect-runtime-resources-draw.js";
export type {
  CardOwnershipChoiceEffectPayloadMap,
  DiscardCardRuntimeEffect,
  DiscardHandThenDrawCardsRuntimeEffect,
  DiscardSelfRuntimeEffect,
  DestroyCardRuntimeEffect,
  DestroyOwnCardsRuntimeEffect,
  DestroyRandomLegendMarketCardRuntimeEffect,
  GainCardRuntimeEffect,
  OnGainSelfGainLimpWandsRuntimeEffect,
  OptionalGainMarketCardsToHandThisTurnRuntimeEffect,
  PlayTopCardFromFoeDeckRuntimeEffect,
  PlayTopCardRuntimeEffect,
  ReturnDiscardToHandRuntimeEffect,
  RevealTopCardRuntimeEffect,
  TopdeckGainedCardRuntimeEffect,
  WildMagicChoiceRuntimeEffect,
  WildMagicOption,
} from "./effect-runtime-cards-ownership-choice.js";
export type {
  ActivationDestroySelfThenDestroyOwnCardsRuntimeEffect,
  ActivationEffectPayloadMap,
  ConditionalActivationDestroyOwnCardsRuntimeEffect,
  ConditionalActivationGainChipsRuntimeEffect,
  OptionalSpendChipDestroyOwnCardsRuntimeEffect,
} from "./effect-runtime-activation.js";
export type {
  AddPowerIfPlayerHasStatusRuntimeEffect,
  OngoingAddPowerPerDeadWizardTokenRuntimeEffect,
  OngoingAddPowerRuntimeEffect,
  OngoingAddPowerWhenPlayingLimpWandRuntimeEffect,
  OngoingAddPowerWhenPlayingWandRuntimeEffect,
  OngoingEffectPayloadMap,
  OngoingFirstAttackDamageAddPowerRuntimeEffect,
  OngoingHandRefillBonusRuntimeEffect,
  OngoingStartTurnOptionalGainLimpWandToHandRuntimeEffect,
} from "./effect-runtime-ongoing.js";
export type {
  EffectiveValueKind,
  EffectiveValueModifierEffectPayloadMap,
  EffectiveValueOperation,
  ModifyEffectiveValueRuntimeEffect,
} from "./effect-runtime-effective-value-modifier.js";
export type {
  CardTypeEffectPayloadMap,
  OwnedCardsCountAsCardTypeRuntimeEffect,
} from "./effect-runtime-card-type.js";
export type {
  DeadWizardTokenEffectPayloadMap,
  DeadWizardTokenEachFoeGainChipsRuntimeEffect,
  DeadWizardTokenGainChipsRuntimeEffect,
  DeadWizardTokenGainLimpWandToDeckTopRuntimeEffect,
  DeadWizardTokenGainLimpWandsPerDiscardLegendRuntimeEffect,
  DeadWizardTokenGainStatusOrDrawFaceRuntimeEffect,
  DeadWizardTokenKillerOptionalRemoveDinglerRuntimeEffect,
  DeadWizardTokenLoseHalfChipsRuntimeEffect,
  DeadWizardTokenRewardKillerChipsRuntimeEffect,
  DeadWizardTokenSuppressBasicTrophyChipPayoutRuntimeEffect,
} from "./effect-runtime-dead-wizard-token.js";

export const effectTimings = [
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
  "onDeadWizardTokenFace",
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

export interface ControlsOtherCardTypeEffectCondition {
  effectId: "controls_other_card_type";
  minimum: number;
  cardType: string;
}

export type RuntimeEffectCondition =
  | ControlCountEffectCondition
  | ControlsOtherCardTypeEffectCondition;

export interface DiscardOtherHandCardRuntimeEffectCost {
  costId: "discard_other_hand_card";
  amount: 1;
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

export type AttackOutcomeBranch =
  | { effectId: "gain_chips"; amount: number }
  | { effectId: "gain_chips_equal_damage_dealt" }
  | { effectId: "heal_equal_damage_dealt" }
  | { effectId: "return_discard_to_hand"; amount: number }
  | { effectId: "transfer_limp_wands_to_killed_target"; amount: number }
  | {
      effectId: "gain_status";
      statusId: "dingler";
      target?: "damagedPlayer";
    };

export type MayhemHandRedrawOption =
  | {
      effectId: "discard_hand_then_draw_cards";
      drawAmount: 5;
    }
  | { effectId: "take_damage"; amount: 5 };

export const knownRuntimeEffectIds = [
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
  "dead_wizard_token_each_foe_gain_chips",
  "dead_wizard_token_gain_chips",
  "dead_wizard_token_gain_limp_wand_to_deck_top",
  "dead_wizard_token_gain_limp_wands_per_discard_legend",
  "dead_wizard_token_gain_status_or_draw_face",
  "dead_wizard_token_killer_optional_remove_dingler",
  "dead_wizard_token_lose_half_chips",
  "dead_wizard_token_reward_killer_chips",
  "double_owned_attack_damage",
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
  "endgame_fixed_token_victory_points",
  "endgame_remove_matching_dead_wizard_tokens",
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
  "mayhem_add_chips_to_main_market",
  "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status",
  "mayhem_each_player_choose_foe_gain_chips",
  "mayhem_each_non_dingler_gain_chips",
  "mayhem_each_player_gain_chips",
  "mayhem_refresh_legend_market",
  "mayhem_each_player_battle_highest_hand_cost",
  "mayhem_each_player_choose_discard_hand_draw_or_take_damage",
  "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none",
  "mayhem_each_player_discard_deck_then_destroy_from_discard",
  "mayhem_each_player_gain_chips_then_attack_for_current_chips",
  "mayhem_each_player_reduce_life_to_gain_chips",
  "mayhem_each_player_vote_dingler",
  "mayhem_lowest_life_players_gain_dingler_and_set_to_max_life",
  "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem",
  "mega_mayhem_each_player_gain_limp_wands_to_hand",
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
  "suppress_basic_trophy_chip_payout",
  "ongoing_start_turn_optional_gain_limp_wand_to_hand",
  "optional_gain_market_cards_to_hand_this_turn",
  "owned_cards_count_as_card_type",
  "optional_spend_chip_attack_damage",
  "optional_spend_chip_destroy_own_cards",
  "play_top_card",
  "play_top_card_from_foe_deck",
  "prevent_defense_against_owned_wand_attacks",
  "remove_status",
  "replace_starting_card",
  "setup_retain_and_choose_third_familiar",
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

export type KnownRuntimeEffectId = (typeof knownRuntimeEffectIds)[number];
export type UnknownRuntimeEffect = Readonly<Record<string, unknown>>;

type EffectWithOptionalTiming<Id extends string> = {
  effectId: Id;
  timing?: EffectTiming;
};

type TimedEffect<Id extends string, Timing extends EffectTiming> = {
  effectId: Id;
  timing: Timing;
};

type PositiveAmount = { amount: number };
type Targetable = {
  target?: RuntimeEffectTarget;
  targetSelector?: RuntimeEffectTargetSelector;
};
type Conditioned = { condition?: RuntimeEffectCondition };
type Costed = {
  costs?: RuntimeEffectCost[];
  optional?: boolean;
};
type AttackBranches = {
  onDamageDealt?: AttackOutcomeBranch[];
  onKill?: AttackOutcomeBranch[];
};

export type ForceStartingPlayerRuntimeEffect = TimedEffect<
  "force_starting_player",
  "setup"
> & { targetSelector?: "activePlayer" };

export type ReplaceStartingCardRuntimeEffect = TimedEffect<
  "replace_starting_card",
  "setup"
> & {
  fromDefinitionId: string;
  toDefinitionId: string;
};

export type SetupRetainAndChooseThirdFamiliarRuntimeEffect = TimedEffect<
  "setup_retain_and_choose_third_familiar",
  "setup"
>;

export type StartWithBasicTrophyRuntimeEffect = TimedEffect<
  "start_with_basic_trophy",
  "setup"
>;

export type SetStartingLifeTotalRuntimeEffect = TimedEffect<
  "set_starting_life_total",
  "setup"
> & { lifeTotal: number };

export type SetResurrectionLifeTotalRuntimeEffect = TimedEffect<
  "set_resurrection_life_total",
  "replacement"
> & {
  lifeTotal: number;
  unlessStatusId?: string;
};

export type IncreaseHandLimitAtMaxLifeRuntimeEffect = TimedEffect<
  "increase_hand_limit_at_max_life",
  "endTurn"
> &
  PositiveAmount;

export type TemporaryHandLimitByGainedCardTypeRuntimeEffect = TimedEffect<
  "temporary_hand_limit_by_gained_card_type",
  "endTurn"
> &
  PositiveAmount & { cardTypes: string[] };

export type EndgameLimpWandsScorePositiveRuntimeEffect = TimedEffect<
  "endgame_limp_wands_score_positive",
  "scoring"
> & {
  scoreMode: "absolutePositiveVictoryPoints";
  appliesToOwnedCardKind: "limpWand";
};

export type EndgameFixedTokenVictoryPointsRuntimeEffect = TimedEffect<
  "endgame_fixed_token_victory_points",
  "scoring"
> & { victoryPoints: number };

export type EndgameRemoveMatchingDeadWizardTokensRuntimeEffect = TimedEffect<
  "endgame_remove_matching_dead_wizard_tokens",
  "scoring"
> & {
  matching: "sameDefinition";
  minimumCount: 2;
};

export type EndgameVpPerOwnedLegendRuntimeEffect = TimedEffect<
  "endgame_vp_per_owned_legend",
  "scoring"
> & { amountPerOwnedLegend: number };

export type ControlsOtherCardTypeRuntimeEffect =
  EffectWithOptionalTiming<"controls_other_card_type"> & {
    minimum: number;
    cardType: string;
  };

export type DestroyedCardKindIsRuntimeEffect =
  EffectWithOptionalTiming<"destroyed_card_kind_is"> & {
    cardKind: string;
  };

export interface SetupEffectPayloadMap extends EffectiveValueModifierEffectPayloadMap {
  force_starting_player: ForceStartingPlayerRuntimeEffect;
  replace_starting_card: ReplaceStartingCardRuntimeEffect;
  setup_retain_and_choose_third_familiar: SetupRetainAndChooseThirdFamiliarRuntimeEffect;
  start_with_basic_trophy: StartWithBasicTrophyRuntimeEffect;
  set_starting_life_total: SetStartingLifeTotalRuntimeEffect;
  set_resurrection_life_total: SetResurrectionLifeTotalRuntimeEffect;
  increase_hand_limit_at_max_life: IncreaseHandLimitAtMaxLifeRuntimeEffect;
  temporary_hand_limit_by_gained_card_type: TemporaryHandLimitByGainedCardTypeRuntimeEffect;
  endgame_fixed_token_victory_points: EndgameFixedTokenVictoryPointsRuntimeEffect;
  endgame_remove_matching_dead_wizard_tokens: EndgameRemoveMatchingDeadWizardTokensRuntimeEffect;
  endgame_limp_wands_score_positive: EndgameLimpWandsScorePositiveRuntimeEffect;
  endgame_vp_per_owned_legend: EndgameVpPerOwnedLegendRuntimeEffect;
  controls_other_card_type: ControlsOtherCardTypeRuntimeEffect;
  destroyed_card_kind_is: DestroyedCardKindIsRuntimeEffect;
}

export type AddPowerRuntimeEffect = EffectWithOptionalTiming<"add_power"> &
  PositiveAmount &
  Conditioned & {
    activationLimit?: "oncePerTurnWhileControlled";
  };

export type AddPowerPerControlledObjectRuntimeEffect = TimedEffect<
  "add_power_per_controlled_object",
  "onPlay"
> &
  PositiveAmount;

export type AddPowerPerControlledPermanentRuntimeEffect = TimedEffect<
  "add_power_per_controlled_permanent",
  "onPlay"
> & { amountPerPermanent: number };

export type AddPowerPerPlayerWithStatusRuntimeEffect =
  EffectWithOptionalTiming<"add_power_per_player_with_status"> & {
    statusId: "dingler";
    amountPerPlayer: number;
  };

export type GainChipsEqualDamageDealtRuntimeEffect =
  EffectWithOptionalTiming<"gain_chips_equal_damage_dealt">;
export type HealRuntimeEffect = EffectWithOptionalTiming<"heal"> &
  PositiveAmount &
  Targetable;
export type HealEqualDamageDealtRuntimeEffect =
  EffectWithOptionalTiming<"heal_equal_damage_dealt">;
export type HealEqualDamageDealtOnOwnTurnRuntimeEffect = TimedEffect<
  "heal_equal_damage_dealt_on_own_turn",
  "afterDamageDealt"
>;
export type SetLifeRuntimeEffect = EffectWithOptionalTiming<"set_life"> & {
  lifeTotal: number;
} & Targetable;
export type GainStatusRuntimeEffect =
  EffectWithOptionalTiming<"gain_status"> & {
    statusId: "dingler";
    target?: RuntimeEffectTarget | "damagedPlayer";
    targetSelector?: RuntimeEffectTargetSelector;
  };
export type RemoveStatusRuntimeEffect =
  EffectWithOptionalTiming<"remove_status"> & {
    statusId: "dingler";
    optional?: boolean;
    cardTypes?: string[];
  } & Targetable;
export type ToggleStatusRuntimeEffect =
  EffectWithOptionalTiming<"toggle_status"> & {
    statusId: "dingler";
  } & Targetable;
export type ExchangeLifeAndDinglerStatusRuntimeEffect =
  EffectWithOptionalTiming<"exchange_life_and_dingler_status"> &
    Targetable & {
      optional?: boolean;
      allowLifeExchange?: boolean;
      allowDinglerStatusExchange?: boolean;
    };
export type DealDamageRuntimeEffect = EffectWithOptionalTiming<"deal_damage"> &
  PositiveAmount &
  Targetable;
export type FixtureAddPowerEqualToTargetCostRuntimeEffect =
  EffectWithOptionalTiming<"fixture_add_power_equal_to_target_cost"> &
    Targetable & { emptyChoice?: "fail" };

export interface ImmediateEffectPayloadMap
  extends ResourceDrawEffectPayloadMap, CardOwnershipChoiceEffectPayloadMap {
  add_power: AddPowerRuntimeEffect;
  add_power_if_player_has_status: AddPowerIfPlayerHasStatusRuntimeEffect;
  add_power_per_controlled_object: AddPowerPerControlledObjectRuntimeEffect;
  add_power_per_controlled_permanent: AddPowerPerControlledPermanentRuntimeEffect;
  add_power_per_player_with_status: AddPowerPerPlayerWithStatusRuntimeEffect;
  gain_chips_equal_damage_dealt: GainChipsEqualDamageDealtRuntimeEffect;
  heal: HealRuntimeEffect;
  heal_equal_damage_dealt: HealEqualDamageDealtRuntimeEffect;
  heal_equal_damage_dealt_on_own_turn: HealEqualDamageDealtOnOwnTurnRuntimeEffect;
  set_life: SetLifeRuntimeEffect;
  gain_status: GainStatusRuntimeEffect;
  remove_status: RemoveStatusRuntimeEffect;
  toggle_status: ToggleStatusRuntimeEffect;
  exchange_life_and_dingler_status: ExchangeLifeAndDinglerStatusRuntimeEffect;
  deal_damage: DealDamageRuntimeEffect;
  fixture_add_power_equal_to_target_cost: FixtureAddPowerEqualToTargetCostRuntimeEffect;
}

export type AttackDamageRuntimeEffect =
  EffectWithOptionalTiming<"attack_damage"> &
    PositiveAmount &
    Targetable &
    Costed &
    AttackBranches;
export type AttackDamageEqualRememberedCardCostRuntimeEffect =
  EffectWithOptionalTiming<"attack_damage_equal_remembered_card_cost"> &
    Targetable &
    AttackBranches & { rememberedCard: "destroyedLegend" };
export type AttackDamageEqualToControlledCardCostRuntimeEffect =
  EffectWithOptionalTiming<"attack_damage_equal_to_controlled_card_cost"> &
    Targetable &
    AttackBranches & {
      costMode: "highest" | "chosen";
      excludeSource?: boolean;
    };
export type AttackDestroyTopLegendDeckThenDamageEqualCostRuntimeEffect =
  EffectWithOptionalTiming<"attack_destroy_top_legend_deck_then_damage_equal_cost"> &
    Targetable &
    AttackBranches & {
      damageUsesDestroyedCardCost: true;
      destroyedCardSource: "legendDeck";
    };
export type AttackDiscardCardsRuntimeEffect =
  EffectWithOptionalTiming<"attack_discard_cards"> &
    Targetable & {
      amount: number;
      chooser: "target";
      sourceZone: "hand";
    };
export type AttackGainLimpWandRuntimeEffect =
  EffectWithOptionalTiming<"attack_gain_limp_wand"> &
    Targetable & {
      destination: "targetDiscard";
      amount: number;
    };
export type AttackGainStatusRuntimeEffect = TimedEffect<
  "attack_gain_status",
  "onPlay"
> &
  Targetable & { statusId: "dingler" };
export interface AvoidAttackRuntimeEffect extends TimedEffect<
  "avoid_attack",
  "onDefense"
> {
  destination: "discardSelf" | "topdeckSelf";
  redirectAttack?: boolean;
  costs?: RuntimeEffectCost[];
  branchEffects?: RuntimeEffect[];
}
export type ConditionalActivationAttackDamageRuntimeEffect =
  EffectWithOptionalTiming<"conditional_activation_attack_damage"> &
    PositiveAmount &
    Targetable &
    Conditioned;
export type DirectionalChainAttackRuntimeEffect =
  EffectWithOptionalTiming<"directional_chain_attack"> &
    PositiveAmount &
    Targetable &
    AttackBranches;
export type MultiTargetAttackRuntimeEffect =
  EffectWithOptionalTiming<"multi_target_attack"> &
    PositiveAmount &
    AttackBranches & {
      target: RuntimeEffectSelectorTarget & { selector: "opponentPlayers" };
    };
export type OptionalSpendChipAttackDamageRuntimeEffect =
  EffectWithOptionalTiming<"optional_spend_chip_attack_damage"> &
    PositiveAmount &
    Targetable &
    AttackBranches & {
      chipCost: number;
    };
export type DefenseDiscardSelfAvoidAttackThenOptionalDestroyHandCardRuntimeEffect =
  TimedEffect<
    "defense_discard_self_avoid_attack_then_optional_destroy_hand_card",
    "defense"
  > & {
    defenseCost: { effectId: "discard_self" };
    avoids: "attack";
    optionalFollowup: {
      effectId: "destroy_own_cards";
      sourceZones: "hand";
      amount: number;
      chooser: "defendingPlayer";
    };
  };
export interface ModifyOwnedWandAttackDamageRuntimeEffect
  extends
    TimedEffect<"modify_owned_wand_attack_damage", "attackReplacement">,
    PositiveAmount {
  cardDefinitionIds?: string[];
  cardTags?: string[];
}
export interface DoubleOwnedAttackDamageRuntimeEffect extends TimedEffect<
  "double_owned_attack_damage",
  "attackReplacement"
> {}
export interface PreventDefenseAgainstOwnedWandAttacksRuntimeEffect extends TimedEffect<
  "prevent_defense_against_owned_wand_attacks",
  "attackReplacement"
> {
  cardDefinitionIds?: string[];
  cardTags?: string[];
}

export interface PlayerControlledAttackEffectPayloadMap {
  attack_damage: AttackDamageRuntimeEffect;
  attack_damage_equal_remembered_card_cost: AttackDamageEqualRememberedCardCostRuntimeEffect;
  attack_damage_equal_to_controlled_card_cost: AttackDamageEqualToControlledCardCostRuntimeEffect;
  attack_destroy_top_legend_deck_then_damage_equal_cost: AttackDestroyTopLegendDeckThenDamageEqualCostRuntimeEffect;
  attack_discard_cards: AttackDiscardCardsRuntimeEffect;
  attack_gain_limp_wand: AttackGainLimpWandRuntimeEffect;
  attack_gain_status: AttackGainStatusRuntimeEffect;
  avoid_attack: AvoidAttackRuntimeEffect;
  conditional_activation_attack_damage: ConditionalActivationAttackDamageRuntimeEffect;
  directional_chain_attack: DirectionalChainAttackRuntimeEffect;
  multi_target_attack: MultiTargetAttackRuntimeEffect;
  optional_spend_chip_attack_damage: OptionalSpendChipAttackDamageRuntimeEffect;
  defense_discard_self_avoid_attack_then_optional_destroy_hand_card: DefenseDiscardSelfAvoidAttackThenOptionalDestroyHandCardRuntimeEffect;
  modify_owned_wand_attack_damage: ModifyOwnedWandAttackDamageRuntimeEffect;
  double_owned_attack_damage: DoubleOwnedAttackDamageRuntimeEffect;
  prevent_defense_against_owned_wand_attacks: PreventDefenseAgainstOwnedWandAttacksRuntimeEffect;
}

export type MayhemAttackRuntimeEffect =
  EffectWithOptionalTiming<"mayhem_attack"> &
    PositiveAmount & {
      target: RuntimeEffectSelectorTarget & { selector: "allPlayers" };
    };
export type MayhemAddChipsToMainMarketRuntimeEffect = TimedEffect<
  "mayhem_add_chips_to_main_market",
  "onMayhemResolve"
> & {
  market: "mainMarket";
  amount: number;
};
export type MayhemEachDinglerChoosePayLifeOrChipToRemoveStatusRuntimeEffect =
  TimedEffect<
    "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status",
    "onMayhemResolve"
  > & {
    targetSelector: "eachPlayerClockwiseFromActive";
    chooser: "affectedPlayer";
    statusId: "dingler";
    lifeCost: number;
    chipCost: number;
  };
export type MayhemEachPlayerChooseFoeGainChipsRuntimeEffect = TimedEffect<
  "mayhem_each_player_choose_foe_gain_chips",
  "onMayhemResolve"
> & {
  targetSelector: "eachPlayerClockwiseFromActive";
  chipAmount: number;
};
export type MayhemEachNonDinglerGainChipsRuntimeEffect = TimedEffect<
  "mayhem_each_non_dingler_gain_chips",
  "onMayhemResolve"
> & {
  targetSelector: "eachPlayerClockwiseFromActive";
  chipAmount: number;
};
export type MayhemEachPlayerGainChipsRuntimeEffect = TimedEffect<
  "mayhem_each_player_gain_chips",
  "onMayhemResolve"
> & {
  targetSelector: "eachPlayerClockwiseFromActive";
  chipAmount: number;
};
export type MayhemRefreshLegendMarketRuntimeEffect = TimedEffect<
  "mayhem_refresh_legend_market",
  "onMayhemResolve"
> & {
  targetSize: number;
  destroyMegaMayhem?: true;
};
export type MayhemEachPlayerBattleHighestHandCostRuntimeEffect = TimedEffect<
  "mayhem_each_player_battle_highest_hand_cost",
  "onMayhemResolve"
> & {
  targetSelector: "eachPlayerClockwiseFromActive";
  chooser: "affectedPlayer";
  winnerDrawAmount: number;
};
export type MayhemEachPlayerChooseDiscardHandDrawOrTakeDamageRuntimeEffect =
  TimedEffect<
    "mayhem_each_player_choose_discard_hand_draw_or_take_damage",
    "onMayhemResolve"
  > & {
    targetSelector: "eachPlayerClockwiseFromActive";
    chooser: "affectedPlayer";
    options: [
      Extract<
        MayhemHandRedrawOption,
        { effectId: "discard_hand_then_draw_cards" }
      >,
      Extract<MayhemHandRedrawOption, { effectId: "take_damage" }>,
    ];
  };
export type MayhemEachPlayerDiscardTopDeckCardsChooseDestroyAllOrNoneRuntimeEffect =
  TimedEffect<
    "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none",
    "onMayhemResolve"
  > & {
    targetSelector: "eachPlayerClockwiseFromActive";
    chooser: "affectedPlayer";
    choice: "destroyBothOrDestroyNone";
    amount: number;
    sourceZone: "deck";
  };
export type MayhemEachPlayerDiscardDeckThenDestroyFromDiscardRuntimeEffect =
  TimedEffect<
    "mayhem_each_player_discard_deck_then_destroy_from_discard",
    "onMayhemResolve"
  > & {
    targetSelector: "eachPlayerClockwiseFromActive";
    chooser: "affectedPlayer";
    destroyAmount: number;
    destroySourceZone: "discard";
    discardSourceZone: "deck";
  };
export type MayhemEachPlayerGainChipsThenAttackForCurrentChipsRuntimeEffect =
  TimedEffect<
    "mayhem_each_player_gain_chips_then_attack_for_current_chips",
    "onMayhemResolve"
  > & {
    targetSelector: "eachPlayerClockwiseFromActive";
    chipAmount: number;
  };
export type MayhemEachPlayerReduceLifeToGainChipsRuntimeEffect = TimedEffect<
  "mayhem_each_player_reduce_life_to_gain_chips",
  "onMayhemResolve"
> & {
  targetSelector: "eachPlayerClockwiseFromActive";
  chooser: "affectedPlayer";
  lifeTotal: number;
  chipAmount: number;
};
export type MayhemEachPlayerVoteDinglerRuntimeEffect = TimedEffect<
  "mayhem_each_player_vote_dingler",
  "onMayhemResolve"
> & {
  targetSelector: "eachPlayerClockwiseFromActive";
  chooser: "affectedPlayer";
  voteTargetSelector: "anyPlayer";
  statusId: "dingler";
};
export type MayhemLowestLifePlayersGainDinglerAndSetToMaxLifeRuntimeEffect =
  TimedEffect<
    "mayhem_lowest_life_players_gain_dingler_and_set_to_max_life",
    "onMayhemResolve"
  > & { statusId: "dingler" };
export type MegaMayhemEachPlayerDestroyTopMainDeckDeathIfMayhemRuntimeEffect =
  TimedEffect<
    "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem",
    "onMayhemResolve"
  > & {
    targetSelector: "eachPlayerClockwiseFromActive";
    deathCondition: {
      effectId: "destroyed_card_kind_is";
      cardKind: "mayhem";
    };
    destroyedCardSource: "mainDeck";
  };
export type MegaMayhemEachPlayerGainLimpWandsToHandRuntimeEffect = TimedEffect<
  "mega_mayhem_each_player_gain_limp_wands_to_hand",
  "onMayhemResolve"
> & {
  targetSelector: "eachPlayerClockwiseFromActive";
  destination: "hand";
  amount: number;
};
export type MegaMayhemEachPlayerToggleDinglerRuntimeEffect = TimedEffect<
  "mega_mayhem_each_player_toggle_dingler",
  "onMayhemResolve"
> & { targetSelector: "eachPlayerClockwiseFromActive" };
export type MegaMayhemSetLifeRuntimeEffect = TimedEffect<
  "mega_mayhem_set_life",
  "onMayhemResolve"
> & {
  targetSelector: "eachPlayerClockwiseFromActive";
  lifeTotal: number;
};

export interface MayhemEffectPayloadMap {
  mayhem_attack: MayhemAttackRuntimeEffect;
  mayhem_add_chips_to_main_market: MayhemAddChipsToMainMarketRuntimeEffect;
  mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status: MayhemEachDinglerChoosePayLifeOrChipToRemoveStatusRuntimeEffect;
  mayhem_each_player_choose_foe_gain_chips: MayhemEachPlayerChooseFoeGainChipsRuntimeEffect;
  mayhem_each_non_dingler_gain_chips: MayhemEachNonDinglerGainChipsRuntimeEffect;
  mayhem_each_player_gain_chips: MayhemEachPlayerGainChipsRuntimeEffect;
  mayhem_refresh_legend_market: MayhemRefreshLegendMarketRuntimeEffect;
  mayhem_each_player_battle_highest_hand_cost: MayhemEachPlayerBattleHighestHandCostRuntimeEffect;
  mayhem_each_player_choose_discard_hand_draw_or_take_damage: MayhemEachPlayerChooseDiscardHandDrawOrTakeDamageRuntimeEffect;
  mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none: MayhemEachPlayerDiscardTopDeckCardsChooseDestroyAllOrNoneRuntimeEffect;
  mayhem_each_player_discard_deck_then_destroy_from_discard: MayhemEachPlayerDiscardDeckThenDestroyFromDiscardRuntimeEffect;
  mayhem_each_player_gain_chips_then_attack_for_current_chips: MayhemEachPlayerGainChipsThenAttackForCurrentChipsRuntimeEffect;
  mayhem_each_player_reduce_life_to_gain_chips: MayhemEachPlayerReduceLifeToGainChipsRuntimeEffect;
  mayhem_each_player_vote_dingler: MayhemEachPlayerVoteDinglerRuntimeEffect;
  mayhem_lowest_life_players_gain_dingler_and_set_to_max_life: MayhemLowestLifePlayersGainDinglerAndSetToMaxLifeRuntimeEffect;
  mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem: MegaMayhemEachPlayerDestroyTopMainDeckDeathIfMayhemRuntimeEffect;
  mega_mayhem_each_player_gain_limp_wands_to_hand: MegaMayhemEachPlayerGainLimpWandsToHandRuntimeEffect;
  mega_mayhem_each_player_toggle_dingler: MegaMayhemEachPlayerToggleDinglerRuntimeEffect;
  mega_mayhem_set_life: MegaMayhemSetLifeRuntimeEffect;
}

export type RuntimeEffectPayloadMap = SetupEffectPayloadMap &
  ImmediateEffectPayloadMap &
  PlayerControlledAttackEffectPayloadMap &
  ActivationEffectPayloadMap &
  OngoingEffectPayloadMap &
  MayhemEffectPayloadMap &
  CardTypeEffectPayloadMap &
  DeadWizardTokenEffectPayloadMap;

export type RuntimeEffectId = keyof RuntimeEffectPayloadMap;
export type RuntimeEffectForId<Id extends RuntimeEffectId> =
  RuntimeEffectPayloadMap[Id];
export type RuntimeEffectPayload = RuntimeEffectPayloadMap[RuntimeEffectId];
export type RuntimeEffect = {
  [Id in RuntimeEffectId]: Omit<RuntimeEffectForId<Id>, "timing"> & {
    timing: RuntimeEffectForId<Id> extends { timing: infer Timing }
      ? Timing
      : EffectTiming;
  };
}[RuntimeEffectId];

const payloadMapIdsAreKnown: Exclude<
  RuntimeEffectId,
  KnownRuntimeEffectId
> extends never
  ? true
  : never = true;
const knownIdsAreInPayloadMap: Exclude<
  KnownRuntimeEffectId,
  RuntimeEffectId
> extends never
  ? true
  : never = true;
void payloadMapIdsAreKnown;
void knownIdsAreInPayloadMap;

export function isAvoidAttackRuntimeEffect(
  effect: RuntimeEffectPayload
): effect is AvoidAttackRuntimeEffect {
  return (
    effect.effectId === "avoid_attack" &&
    effect.timing === "onDefense" &&
    (effect.destination === "discardSelf" ||
      effect.destination === "topdeckSelf") &&
    (effect.redirectAttack === undefined ||
      typeof effect.redirectAttack === "boolean")
  );
}

export function isRuntimeEffectTarget(
  value: unknown
): value is RuntimeEffectTarget {
  if (!isRuntimeEffectTargetRecord(value)) return false;
  if ("selector" in value) return isRuntimeEffectSelectorTarget(value);
  if (value["targetType"] === "card") {
    return (
      hasExactKeys(value, ["targetType", "definitionId", "cardTypes"]) &&
      isOptionalString(value["definitionId"]) &&
      isOptionalStringArray(value["cardTypes"])
    );
  }
  if (value["targetType"] === "token") {
    return (
      hasExactKeys(value, ["targetType", "definitionId", "tokenKind"]) &&
      isOptionalString(value["definitionId"]) &&
      (value["tokenKind"] === undefined ||
        value["tokenKind"] === "deadWizardToken" ||
        value["tokenKind"] === "wizardProperty")
    );
  }
  return (
    value["targetType"] === "player" && hasExactKeys(value, ["targetType"])
  );
}

export function isRuntimeEffectSelectorTarget(
  value: unknown
): value is RuntimeEffectSelectorTarget {
  return (
    isRuntimeEffectTargetRecord(value) &&
    hasExactKeys(value, ["selector"]) &&
    isTargetSelector(value["selector"])
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

export function isWildMagicOption(value: unknown): value is WildMagicOption {
  if (!isRuntimeEffectTargetRecord(value)) return false;
  if (value["effectId"] === "add_power") {
    return (
      hasExactKeys(value, ["effectId", "amount"]) &&
      isPositiveSafeInteger(value["amount"])
    );
  }
  return (
    value["effectId"] === "play_top_card_from_foe_deck" &&
    hasExactKeys(value, [
      "effectId",
      "targetSelector",
      "nonOngoingCleanupDestination",
      "ongoingOwnership",
    ]) &&
    value["targetSelector"] === "chosenFoe" &&
    (value["nonOngoingCleanupDestination"] === undefined ||
      value["nonOngoingCleanupDestination"] === "ownerDiscard") &&
    (value["ongoingOwnership"] === undefined ||
      value["ongoingOwnership"] === "controller")
  );
}

export function isEffectTiming(value: unknown): value is EffectTiming {
  return (
    typeof value === "string" && effectTimings.includes(value as EffectTiming)
  );
}

export function isRuntimeEffectCondition(
  value: unknown
): value is RuntimeEffectCondition {
  if (!isRuntimeEffectTargetRecord(value)) return false;
  if (value["conditionId"] === "control_count") {
    return (
      hasExactKeys(value, ["conditionId", "cardTypes", "minimumCount"]) &&
      Array.isArray(value["cardTypes"]) &&
      value["cardTypes"].every(isString) &&
      isNonNegativeSafeInteger(value["minimumCount"])
    );
  }
  return (
    value["effectId"] === "controls_other_card_type" &&
    hasExactKeys(value, ["effectId", "minimum", "cardType"]) &&
    isNonNegativeSafeInteger(value["minimum"]) &&
    typeof value["cardType"] === "string"
  );
}

export function isRuntimeEffectCost(
  value: unknown
): value is RuntimeEffectCost {
  if (!isRuntimeEffectTargetRecord(value)) return false;
  if (value["costId"] === "discard_other_hand_card") {
    return hasExactKeys(value, ["costId", "amount"]) && value["amount"] === 1;
  }
  return (
    (value["costId"] === "spend_chips" || value["costId"] === "pay_life") &&
    hasExactKeys(value, ["costId", "amount"]) &&
    isPositiveSafeInteger(value["amount"])
  );
}

export function isRuntimeEffectId(value: unknown): value is RuntimeEffectId {
  return (
    typeof value === "string" &&
    knownRuntimeEffectIds.includes(value as RuntimeEffectId)
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

function hasExactKeys(
  value: Record<string, unknown>,
  allowedKeys: string[]
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
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

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
