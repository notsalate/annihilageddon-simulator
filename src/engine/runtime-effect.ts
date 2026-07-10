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
  "mayhem_each_player_battle_highest_hand_cost",
  "mayhem_each_player_choose_discard_hand_draw_or_take_damage",
  "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none",
  "mayhem_each_player_discard_deck_then_destroy_from_discard",
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

type RuntimeEffectVariant<EffectId extends KnownRuntimeEffectId> = {
  effectId: EffectId;
  timing: EffectTiming;
} & Record<string, unknown>;

export type RuntimeEffect = {
  [EffectId in KnownRuntimeEffectId]: RuntimeEffectVariant<EffectId>;
}[KnownRuntimeEffectId];

export type RuntimeEffectId = RuntimeEffect["effectId"];

export function isEffectTiming(value: unknown): value is EffectTiming {
  return (
    typeof value === "string" && effectTimings.includes(value as EffectTiming)
  );
}

export function isRuntimeEffectId(value: unknown): value is RuntimeEffectId {
  return (
    typeof value === "string" &&
    knownRuntimeEffectIds.includes(value as RuntimeEffectId)
  );
}
