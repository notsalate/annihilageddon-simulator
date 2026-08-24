import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  defineEffectRuntimeCatalogGroupsForTesting,
  defineEffectRuntimeFamilyForTesting,
  validateRuntimeEffectCatalogPayload,
  type EffectRuntimeCatalogOperationOverridesForTesting,
} from "../src/engine/effect-runtime-registry.js";
import { activationEffectIds } from "../src/engine/effect-runtime-activation.js";
import { cardOwnershipChoiceEffectIds } from "../src/engine/effect-runtime-cards-ownership-choice.js";
import { ongoingEffectIds } from "../src/engine/effect-runtime-ongoing.js";
import { effectiveValueModifierEffectIds } from "../src/engine/effect-runtime-effective-value-modifier.js";
import { cardTypeEffectIds } from "../src/engine/effect-runtime-card-type.js";
import { resourceDrawEffectIds } from "../src/engine/effect-runtime-resources-draw.js";
import { combatAttackEffectIds } from "../src/engine/effect-runtime-combat-attack.js";
import { combatDefenseEffectIds } from "../src/engine/effect-runtime-combat-defense.js";
import { combatReplacementEffectIds } from "../src/engine/effect-runtime-combat-replacement.js";
import { mayhemEffectIds } from "../src/engine/effect-runtime-mayhem.js";
import { setupEffectIds } from "../src/engine/effect-runtime-setup.js";
import { wildMagicEffectIds } from "../src/engine/effect-runtime-wild-magic.js";
import type { RuntimeEffectForId } from "../src/engine/runtime-effect.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

type AddPowerHasNoDefenseDestination = Expect<
  Equal<
    "destination" extends keyof RuntimeEffectForId<"add_power"> ? true : false,
    false
  >
>;

const addPowerOperations: EffectRuntimeCatalogOperationOverridesForTesting<"add_power"> =
  {
    execute(_state, _player, effect) {
      const amount: number = effect.amount;
      void amount;
      return { ok: true };
    },
  };

const negativeContracts: [AddPowerHasNoDefenseDestination] = [true];
void negativeContracts;
void addPowerOperations;

test("gameplay Catalog operations expose only the verified effect boundary", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src", "engine", "effect-runtime-registry.ts"),
    "utf8"
  );
  const gameplayBoundary = source.slice(
    source.indexOf("export function executeRuntimeEffect(")
  );

  assert.doesNotMatch(gameplayBoundary, /effect: unknown/);
  assert.doesNotMatch(gameplayBoundary, /rawEffect/);
  assert.match(source, /executeVerified\(/);
});

const testFamilyDefinition = {
  effectId: "force_starting_player" as const,
  decoder: {
    effectId: "force_starting_player" as const,
    decode() {
      return { ok: false as const, errors: ["fixture decoder error"] };
    },
  },
  supportedTimings: ["setup"] as const,
  supportedModes: ["combat"] as const,
  supportedSourceKinds: ["wizardProperty"] as const,
  handler: {
    effectId: "force_starting_player" as const,
    execute() {
      return { ok: true as const };
    },
    executeSetup() {
      return { ok: true as const };
    },
  },
} as const;

test("effect runtime family registration returns its concrete effect IDs", () => {
  assert.deepEqual(
    defineEffectRuntimeFamilyForTesting("fixture-family", [
      testFamilyDefinition,
    ]),
    ["force_starting_player"]
  );
});

test("effect runtime family registration rejects duplicate effect IDs", () => {
  assert.throws(
    () =>
      defineEffectRuntimeFamilyForTesting("fixture-family", [
        testFamilyDefinition,
        testFamilyDefinition,
      ]),
    /registers duplicate effect ID force_starting_player/
  );
});

test("effect runtime catalog rejects duplicate IDs across registered families", () => {
  assert.throws(
    () =>
      defineEffectRuntimeCatalogGroupsForTesting([
        { familyId: "fixture-family-a", definitions: [testFamilyDefinition] },
        { familyId: "fixture-family-b", definitions: [testFamilyDefinition] },
      ]),
    /registers duplicate effect ID force_starting_player/
  );
});

test("public catalog validation preserves the concrete payload variant", () => {
  const decoded = validateRuntimeEffectCatalogPayload(
    "Fixture add power",
    "add_power",
    { effectId: "add_power", timing: "onPlay", amount: 2 },
    "combat",
    "card"
  );

  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  const amount: number = decoded.value.amount;
  assert.equal(amount, 2);
});

test("general effects reject timings outside their Catalog policy", () => {
  const decoded = validateRuntimeEffectCatalogPayload(
    "Passive add power",
    "add_power",
    { effectId: "add_power", timing: "whileControlled", amount: 2 },
    "combat",
    "card"
  );

  assert.equal(decoded.ok, false);
  if (!decoded.ok) {
    assert.match(decoded.errors.join("\n"), /unsupported timing/);
  }
});

test("resource and draw effects use the interactive Catalog timing policy", () => {
  const validCases = [
    {
      effectId: "gain_chips",
      payload: { effectId: "gain_chips", timing: "onGainCard", amount: 1 },
      sourceKind: "wizardProperty",
    },
    {
      effectId: "gain_chips_per_player_with_status",
      payload: {
        effectId: "gain_chips_per_player_with_status",
        timing: "onPlay",
        amountPerPlayer: 1,
        status: "dingler",
      },
      sourceKind: "card",
    },
    {
      effectId: "draw_cards",
      payload: { effectId: "draw_cards", timing: "onDefense", amount: 1 },
      sourceKind: "card",
    },
  ] as const;

  for (const { effectId, payload, sourceKind } of validCases) {
    assert.equal(
      validateRuntimeEffectCatalogPayload(
        `Valid ${effectId}`,
        effectId,
        payload,
        "combat",
        sourceKind
      ).ok,
      true
    );
  }

  const passiveGain = validateRuntimeEffectCatalogPayload(
    "Passive chip gain",
    "gain_chips",
    { effectId: "gain_chips", timing: "whileControlled", amount: 1 },
    "combat",
    "card"
  );

  assert.equal(passiveGain.ok, false);
  if (!passiveGain.ok) {
    assert.match(passiveGain.errors.join("\n"), /unsupported timing/);
  }
});

test("resource and draw IDs belong to one family module", () => {
  assert.deepEqual(resourceDrawEffectIds, [
    "gain_chips",
    "gain_chips_per_player_with_status",
    "draw_cards",
  ]);
});

test("remaining Catalog families expose one local ID inventory each", () => {
  assert.deepEqual(combatAttackEffectIds, [
    "attack_damage",
    "attack_damage_equal_remembered_card_cost",
    "attack_damage_equal_to_controlled_card_cost",
    "attack_destroy_top_legend_deck_then_damage_equal_cost",
    "attack_discard_cards",
    "attack_gain_limp_wand",
    "attack_gain_status",
    "conditional_activation_attack_damage",
    "directional_chain_attack",
    "multi_target_attack",
    "optional_spend_chip_attack_damage",
  ]);
  assert.deepEqual(combatDefenseEffectIds, [
    "avoid_attack",
    "defense_discard_self_avoid_attack_then_optional_destroy_hand_card",
  ]);
  assert.deepEqual(combatReplacementEffectIds, [
    "modify_owned_wand_attack_damage",
    "double_owned_attack_damage",
    "prevent_defense_against_owned_wand_attacks",
  ]);
  assert.deepEqual(mayhemEffectIds, [
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
    "mega_mayhem_each_player_toggle_dingler",
    "mega_mayhem_set_life",
  ]);
  assert.deepEqual(setupEffectIds, [
    "force_starting_player",
    "replace_starting_card",
    "start_with_basic_trophy",
    "set_starting_life_total",
    "set_resurrection_life_total",
    "increase_hand_limit_at_max_life",
    "temporary_hand_limit_by_gained_card_type",
    "endgame_fixed_token_victory_points",
    "endgame_remove_matching_dead_wizard_tokens",
    "endgame_limp_wands_score_positive",
    "endgame_vp_per_owned_legend",
    "controls_other_card_type",
    "destroyed_card_kind_is",
  ]);
  assert.deepEqual(wildMagicEffectIds, ["wild_magic_choice"]);
});

test("card, activation, ongoing and modifier IDs belong to family modules", () => {
  assert.deepEqual(cardOwnershipChoiceEffectIds, [
    "gain_card",
    "discard_card",
    "discard_self",
    "discard_hand_then_draw_cards",
    "destroy_card",
    "destroy_own_cards",
    "destroy_random_legend_market_card",
    "return_discard_to_hand",
    "reveal_top_card",
    "play_top_card",
    "play_top_card_from_foe_deck",
    "topdeck_gained_card",
    "optional_gain_market_cards_to_hand_this_turn",
    "on_gain_self_gain_limp_wands",
  ]);
  assert.deepEqual(activationEffectIds, [
    "activation_destroy_self_then_destroy_own_cards",
    "conditional_activation_destroy_own_cards",
    "conditional_activation_gain_chips",
    "optional_spend_chip_destroy_own_cards",
  ]);
  assert.deepEqual(ongoingEffectIds, [
    "ongoing_add_power",
    "ongoing_add_power_when_playing_wand",
    "ongoing_add_power_per_dead_wizard_token",
    "ongoing_add_power_when_playing_limp_wand",
    "ongoing_first_attack_damage_add_power",
    "ongoing_hand_refill_bonus",
    "ongoing_start_turn_optional_gain_limp_wand_to_hand",
  ]);
  assert.deepEqual(effectiveValueModifierEffectIds, [
    "modify_effective_value",
    "fixture_modify_effective_value",
  ]);
  assert.deepEqual(cardTypeEffectIds, ["owned_cards_count_as_card_type"]);
});

test("life and Dingler status effects use typed family payloads and policies", () => {
  const validCases = [
    {
      effectId: "heal",
      payload: {
        effectId: "heal",
        timing: "onPlay",
        amount: 2,
        targetSelector: "activePlayer",
      },
    },
    {
      effectId: "set_life",
      payload: {
        effectId: "set_life",
        timing: "onMayhemResolve",
        lifeTotal: 15,
        targetSelector: "activePlayer",
      },
    },
    {
      effectId: "gain_status",
      payload: {
        effectId: "gain_status",
        timing: "onPlay",
        statusId: "dingler",
        targetSelector: "activePlayer",
      },
    },
    {
      effectId: "remove_status",
      payload: {
        effectId: "remove_status",
        timing: "onPlay",
        statusId: "dingler",
        targetSelector: "activePlayer",
      },
    },
    {
      effectId: "toggle_status",
      payload: {
        effectId: "toggle_status",
        timing: "onPlay",
        statusId: "dingler",
        targetSelector: "activePlayer",
      },
    },
  ] as const;

  for (const { effectId, payload } of validCases) {
    assert.equal(
      validateRuntimeEffectCatalogPayload(
        `Valid ${effectId}`,
        effectId,
        payload,
        "combat",
        "card"
      ).ok,
      true
    );
  }

  const invalidStatus = validateRuntimeEffectCatalogPayload(
    "Invalid status",
    "gain_status",
    {
      effectId: "gain_status",
      timing: "onPlay",
      statusId: "wizard",
      targetSelector: "activePlayer",
    },
    "combat",
    "card"
  );

  assert.equal(invalidStatus.ok, false);
  if (!invalidStatus.ok) {
    assert.match(invalidStatus.errors.join("\n"), /statusId must be dingler/);
  }
});

test("card ownership and choice effects use exact family policies", () => {
  const validCases = [
    {
      effectId: "reveal_top_card",
      payload: {
        effectId: "reveal_top_card",
        timing: "onPlay",
        source: "activePlayerDeck",
      },
      sourceKind: "card",
    },
    {
      effectId: "play_top_card",
      payload: {
        effectId: "play_top_card",
        timing: "onPlay",
        source: "activePlayerDeck",
        destination: "play",
      },
      sourceKind: "card",
    },
    {
      effectId: "play_top_card_from_foe_deck",
      payload: {
        effectId: "play_top_card_from_foe_deck",
        timing: "activation",
        targetSelector: "chosenFoe",
        nonOngoingCleanupDestination: "ownerDiscard",
        ongoingOwnership: "controller",
      },
      sourceKind: "wizardProperty",
    },
    {
      effectId: "play_top_card_from_foe_deck",
      payload: {
        effectId: "play_top_card_from_foe_deck",
        timing: "onPlay",
        targetSelector: "chosenFoe",
      },
      sourceKind: "card",
    },
    {
      effectId: "wild_magic_choice",
      payload: {
        effectId: "wild_magic_choice",
        timing: "onPlay",
        options: [
          { effectId: "add_power", amount: 2 },
          {
            effectId: "play_top_card_from_foe_deck",
            targetSelector: "chosenFoe",
          },
        ],
      },
      sourceKind: "card",
    },
  ] as const;

  for (const { effectId, payload, sourceKind } of validCases) {
    assert.equal(
      validateRuntimeEffectCatalogPayload(
        `Valid ${effectId}`,
        effectId,
        payload,
        "combat",
        sourceKind
      ).ok,
      true
    );
  }

  const unsupportedTiming = validateRuntimeEffectCatalogPayload(
    "Passive top-deck play",
    "play_top_card",
    {
      effectId: "play_top_card",
      timing: "whileControlled",
      source: "activePlayerDeck",
      destination: "play",
    },
    "combat",
    "card"
  );
  assert.equal(unsupportedTiming.ok, false);
  if (!unsupportedTiming.ok) {
    assert.match(unsupportedTiming.errors.join("\n"), /unsupported timing/);
  }

  const unsupportedSource = validateRuntimeEffectCatalogPayload(
    "Wizard-property reveal",
    "reveal_top_card",
    {
      effectId: "reveal_top_card",
      timing: "onPlay",
      source: "activePlayerDeck",
    },
    "combat",
    "wizardProperty"
  );
  assert.equal(unsupportedSource.ok, false);

  for (const [sourceKind, timing] of [
    ["card", "activation"],
    ["wizardProperty", "onPlay"],
  ] as const) {
    const unsupportedSourceTiming = validateRuntimeEffectCatalogPayload(
      `Unsupported ${sourceKind} and timing pair`,
      "play_top_card_from_foe_deck",
      {
        effectId: "play_top_card_from_foe_deck",
        timing,
        targetSelector: "chosenFoe",
      },
      "combat",
      sourceKind
    );

    assert.equal(unsupportedSourceTiming.ok, false);
    if (unsupportedSourceTiming.ok) continue;
    assert.match(
      unsupportedSourceTiming.errors.join("\n"),
      /unsupported timing .* for source/
    );
  }
});

test("attack, defense and replacement effects use exact family policies", () => {
  const validCases = [
    {
      effectId: "attack_damage",
      payload: {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 2,
        targetSelector: "chosenPlayer",
      },
      sourceKind: "card",
    },
    {
      effectId: "attack_gain_status",
      payload: {
        effectId: "attack_gain_status",
        timing: "onPlay",
        statusId: "dingler",
        targetSelector: "anyPlayer",
      },
      sourceKind: "card",
    },
    {
      effectId: "avoid_attack",
      payload: {
        effectId: "avoid_attack",
        timing: "onDefense",
        destination: "discardSelf",
      },
      sourceKind: "card",
    },
    {
      effectId: "modify_owned_wand_attack_damage",
      payload: {
        effectId: "modify_owned_wand_attack_damage",
        timing: "attackReplacement",
        amount: 1,
        cardTags: ["wandAttackCard"],
      },
      sourceKind: "wizardProperty",
    },
    {
      effectId: "double_owned_attack_damage",
      payload: {
        effectId: "double_owned_attack_damage",
        timing: "attackReplacement",
      },
      sourceKind: "card",
    },
    {
      effectId: "prevent_defense_against_owned_wand_attacks",
      payload: {
        effectId: "prevent_defense_against_owned_wand_attacks",
        timing: "attackReplacement",
        cardTags: ["wandAttackCard"],
      },
      sourceKind: "wizardProperty",
    },
  ] as const;

  for (const { effectId, payload, sourceKind } of validCases) {
    assert.equal(
      validateRuntimeEffectCatalogPayload(
        `Valid ${effectId}`,
        effectId,
        payload,
        "combat",
        sourceKind
      ).ok,
      true
    );
  }

  const invalidCases = [
    {
      effectId: "attack_damage",
      payload: {
        effectId: "attack_damage",
        timing: "whileControlled",
        amount: 2,
        targetSelector: "chosenPlayer",
      },
      sourceKind: "card",
    },
    {
      effectId: "avoid_attack",
      payload: {
        effectId: "avoid_attack",
        timing: "onDefense",
        destination: "discardSelf",
      },
      sourceKind: "wizardProperty",
    },
    {
      effectId: "prevent_defense_against_owned_wand_attacks",
      payload: {
        effectId: "prevent_defense_against_owned_wand_attacks",
        timing: "attackReplacement",
        cardTags: ["wandAttackCard"],
      },
      sourceKind: "card",
    },
    {
      effectId: "modify_owned_wand_attack_damage",
      payload: {
        effectId: "modify_owned_wand_attack_damage",
        timing: "attackReplacement",
        amount: 0,
        cardTags: ["wandAttackCard"],
      },
      sourceKind: "wizardProperty",
    },
  ] as const;

  for (const { effectId, payload, sourceKind } of invalidCases) {
    assert.equal(
      validateRuntimeEffectCatalogPayload(
        `Invalid ${effectId}`,
        effectId,
        payload,
        "combat",
        sourceKind
      ).ok,
      false
    );
  }
});

test("activation and ongoing families use exact timing and card-source policies", () => {
  const validCases = [
    {
      effectId: "activation_destroy_self_then_destroy_own_cards",
      payload: {
        effectId: "activation_destroy_self_then_destroy_own_cards",
        timing: "activation",
        chooser: "controller",
        activationLimit: "oncePerTurnWhileControlled",
        sourceZones: "hand",
        minAmount: 0,
        maxAmount: 2,
        destroySelf: true,
      },
    },
    {
      effectId: "conditional_activation_destroy_own_cards",
      payload: {
        effectId: "conditional_activation_destroy_own_cards",
        timing: "activation",
        chooser: "controller",
        activationLimit: "oncePerTurnWhileControlled",
        sourceZones: ["hand", "discard"],
        amount: 1,
      },
    },
    {
      effectId: "conditional_activation_gain_chips",
      payload: {
        effectId: "conditional_activation_gain_chips",
        timing: "activation",
        activationLimit: "oncePerTurnWhileControlled",
        amount: 1,
      },
    },
    {
      effectId: "optional_spend_chip_destroy_own_cards",
      payload: {
        effectId: "optional_spend_chip_destroy_own_cards",
        timing: "onPlay",
        chipCost: 1,
        amount: 1,
        sourceZones: ["hand", "discard"],
        chooser: "controller",
      },
    },
    {
      effectId: "ongoing_add_power_when_playing_wand",
      payload: {
        effectId: "ongoing_add_power_when_playing_wand",
        timing: "onPlayCard",
        amount: 1,
        cardTags: ["wandCard"],
      },
    },
    {
      effectId: "ongoing_add_power_when_playing_limp_wand",
      payload: {
        effectId: "ongoing_add_power_when_playing_limp_wand",
        timing: "afterControllerPlaysCard",
        amount: 1,
        cardKind: "limpWand",
      },
    },
    {
      effectId: "ongoing_first_attack_damage_add_power",
      payload: {
        effectId: "ongoing_first_attack_damage_add_power",
        timing: "afterFirstAttackDamageEachTurn",
        amount: "totalDamageDealtByThatAttack",
      },
    },
    {
      effectId: "ongoing_hand_refill_bonus",
      payload: {
        effectId: "ongoing_hand_refill_bonus",
        timing: "endTurn",
        amount: 1,
      },
    },
    {
      effectId: "ongoing_start_turn_optional_gain_limp_wand_to_hand",
      payload: {
        effectId: "ongoing_start_turn_optional_gain_limp_wand_to_hand",
        timing: "startOfControllerTurn",
        destination: "hand",
        amount: 1,
        chooser: "controller",
      },
    },
  ] as const;
  const supportedEffectIds = [
    "ongoing_add_power_when_playing_wand",
    "ongoing_first_attack_damage_add_power",
    "ongoing_hand_refill_bonus",
  ] as const;

  for (const { effectId, payload } of validCases) {
    const decoded = validateRuntimeEffectCatalogPayload(
      `Valid ${effectId}`,
      effectId,
      payload,
      "combat",
      "card"
    );
    assert.equal(
      decoded.ok,
      supportedEffectIds.includes(
        effectId as (typeof supportedEffectIds)[number]
      )
    );
    if (
      !decoded.ok &&
      !supportedEffectIds.includes(
        effectId as (typeof supportedEffectIds)[number]
      )
    ) {
      assert.match(decoded.errors.join("\n"), /uses unsupported effect/);
    }
  }

  const invalidSource = validateRuntimeEffectCatalogPayload(
    "Wizard-property ongoing effect",
    "ongoing_hand_refill_bonus",
    validCases[7].payload,
    "combat",
    "wizardProperty"
  );
  assert.equal(invalidSource.ok, false);

  const invalidTiming = validateRuntimeEffectCatalogPayload(
    "Wrong ongoing timing",
    "ongoing_hand_refill_bonus",
    {
      effectId: "ongoing_hand_refill_bonus",
      timing: "whileControlled",
      amount: 1,
    },
    "combat",
    "card"
  );
  assert.equal(invalidTiming.ok, false);
  if (!invalidTiming.ok) {
    assert.match(invalidTiming.errors.join("\n"), /timing must be endTurn/);
  }
});

test("Mayhem and Mega Mayhem effects use exact family timing and source policies", () => {
  const validCases = [
    {
      effectId: "mayhem_attack",
      payload: {
        effectId: "mayhem_attack",
        timing: "onPlay",
        amount: 4,
        target: { selector: "allPlayers" },
      },
    },
    {
      effectId: "mayhem_add_chips_to_main_market",
      payload: {
        effectId: "mayhem_add_chips_to_main_market",
        timing: "onMayhemResolve",
        market: "mainMarket",
        amount: 1,
      },
    },
    {
      effectId: "mayhem_attack",
      payload: {
        effectId: "mayhem_attack",
        timing: "onMayhemResolve",
        amount: 4,
        target: { selector: "allPlayers" },
      },
    },
    {
      effectId: "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status",
      payload: {
        effectId:
          "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chooser: "affectedPlayer",
        statusId: "dingler",
        lifeCost: 1,
        chipCost: 1,
      },
    },
    {
      effectId: "mayhem_each_player_choose_foe_gain_chips",
      payload: {
        effectId: "mayhem_each_player_choose_foe_gain_chips",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chipAmount: 1,
      },
    },
    {
      effectId: "mayhem_each_non_dingler_gain_chips",
      payload: {
        effectId: "mayhem_each_non_dingler_gain_chips",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chipAmount: 1,
      },
    },
    {
      effectId: "mayhem_each_player_gain_chips",
      payload: {
        effectId: "mayhem_each_player_gain_chips",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chipAmount: 1,
      },
    },
    {
      effectId: "mayhem_refresh_legend_market",
      payload: {
        effectId: "mayhem_refresh_legend_market",
        timing: "onMayhemResolve",
        targetSize: 3,
        destroyMegaMayhem: true,
      },
    },
    {
      effectId: "mayhem_each_player_battle_highest_hand_cost",
      payload: {
        effectId: "mayhem_each_player_battle_highest_hand_cost",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chooser: "affectedPlayer",
        winnerDrawAmount: 2,
      },
    },
    {
      effectId: "mayhem_each_player_choose_discard_hand_draw_or_take_damage",
      payload: {
        effectId: "mayhem_each_player_choose_discard_hand_draw_or_take_damage",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chooser: "affectedPlayer",
        options: [
          { effectId: "discard_hand_then_draw_cards", drawAmount: 5 },
          { effectId: "take_damage", amount: 5 },
        ],
      },
    },
    {
      effectId:
        "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none",
      payload: {
        effectId:
          "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chooser: "affectedPlayer",
        choice: "destroyBothOrDestroyNone",
        amount: 2,
        sourceZone: "deck",
      },
    },
    {
      effectId: "mayhem_each_player_discard_deck_then_destroy_from_discard",
      payload: {
        effectId: "mayhem_each_player_discard_deck_then_destroy_from_discard",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chooser: "affectedPlayer",
        destroyAmount: 1,
        destroySourceZone: "discard",
        discardSourceZone: "deck",
      },
    },
    {
      effectId: "mayhem_each_player_gain_chips_then_attack_for_current_chips",
      payload: {
        effectId: "mayhem_each_player_gain_chips_then_attack_for_current_chips",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chipAmount: 1,
      },
    },
    {
      effectId: "mayhem_each_player_reduce_life_to_gain_chips",
      payload: {
        effectId: "mayhem_each_player_reduce_life_to_gain_chips",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chooser: "affectedPlayer",
        lifeTotal: 10,
        chipAmount: 1,
      },
    },
    {
      effectId: "mayhem_each_player_vote_dingler",
      payload: {
        effectId: "mayhem_each_player_vote_dingler",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chooser: "affectedPlayer",
        voteTargetSelector: "anyPlayer",
        statusId: "dingler",
      },
    },
    {
      effectId: "mayhem_lowest_life_players_gain_dingler_and_set_to_max_life",
      payload: {
        effectId: "mayhem_lowest_life_players_gain_dingler_and_set_to_max_life",
        timing: "onMayhemResolve",
        statusId: "dingler",
      },
    },
    {
      effectId: "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem",
      payload: {
        effectId:
          "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        deathCondition: {
          effectId: "destroyed_card_kind_is",
          cardKind: "mayhem",
        },
        destroyedCardSource: "mainDeck",
      },
    },
    {
      effectId: "mega_mayhem_each_player_toggle_dingler",
      payload: {
        effectId: "mega_mayhem_each_player_toggle_dingler",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
      },
    },
    {
      effectId: "mega_mayhem_set_life",
      payload: {
        effectId: "mega_mayhem_set_life",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        lifeTotal: 5,
      },
    },
  ] as const;

  for (const { effectId, payload } of validCases) {
    assert.equal(
      validateRuntimeEffectCatalogPayload(
        `Valid ${effectId}`,
        effectId,
        payload,
        "combat",
        "card"
      ).ok,
      true
    );
  }

  assert.equal(
    validateRuntimeEffectCatalogPayload(
      "Wizard-property Mayhem attack",
      "mayhem_attack",
      validCases[2].payload,
      "combat",
      "wizardProperty"
    ).ok,
    true
  );

  const unsupportedTiming = validateRuntimeEffectCatalogPayload(
    "Immediate Mayhem choice",
    "mayhem_each_player_vote_dingler",
    {
      ...validCases[14].payload,
      timing: "onPlay",
    },
    "combat",
    "card"
  );
  assert.equal(unsupportedTiming.ok, false);

  const unsupportedSource = validateRuntimeEffectCatalogPayload(
    "Dead Wizard Token Mayhem",
    "mega_mayhem_set_life",
    validCases[18].payload,
    "combat",
    "deadWizardToken"
  );
  assert.equal(unsupportedSource.ok, false);
});

test("public catalog validation rejects an ongoing refill payload with unsupported timing", () => {
  const decoded = validateRuntimeEffectCatalogPayload(
    "Controlled refill",
    "ongoing_hand_refill_bonus",
    {
      effectId: "ongoing_hand_refill_bonus",
      timing: "whileControlled",
      amount: 1,
    },
    "combat",
    "card"
  );

  assert.equal(decoded.ok, false);
  if (decoded.ok) return;
  assert.match(decoded.errors.join("\n"), /timing must be endTurn/);
});

test("public catalog validation rejects fields owned by another payload", () => {
  const decoded = validateRuntimeEffectCatalogPayload(
    "Fixture add power",
    "add_power",
    {
      effectId: "add_power",
      timing: "onPlay",
      amount: 2,
      destination: "discardSelf",
    },
    "combat",
    "card"
  );

  assert.equal(decoded.ok, false);
  if (decoded.ok) return;
  assert.match(decoded.errors.join("\n"), /unsupported field destination/);
});

test("public catalog validation rejects a life payment for an optional chip attack", () => {
  const decoded = validateRuntimeEffectCatalogPayload(
    "Fixture optional chip attack",
    "optional_spend_chip_attack_damage",
    {
      effectId: "optional_spend_chip_attack_damage",
      timing: "onPlay",
      amount: 10,
      targetSelector: "chosenPlayer",
      chipCost: 1,
      costs: [{ costId: "pay_life", amount: 1 }],
    },
    "combat",
    "card"
  );

  assert.equal(decoded.ok, false);
});

test("public catalog validation accepts the canonical optional chip attack payload", () => {
  const decoded = validateRuntimeEffectCatalogPayload(
    "Fixture optional chip attack",
    "optional_spend_chip_attack_damage",
    {
      effectId: "optional_spend_chip_attack_damage",
      timing: "onPlay",
      amount: 10,
      targetSelector: "chosenPlayer",
      chipCost: 1,
    },
    "combat",
    "card"
  );

  assert.equal(decoded.ok, true);
});

test("public catalog validation rejects ignored optional chip attack fields", () => {
  const baseEffect = {
    effectId: "optional_spend_chip_attack_damage",
    timing: "onPlay",
    amount: 10,
    targetSelector: "chosenPlayer",
    chipCost: 1,
  } as const;
  const unsupportedFields = [
    {
      fieldName: "costs",
      fields: { costs: [{ costId: "discard_other_hand_card", amount: 1 }] },
    },
    {
      fieldName: "costs",
      fields: {
        costs: [
          { costId: "spend_chips", amount: 1 },
          { costId: "pay_life", amount: 1 },
        ],
      },
    },
    { fieldName: "optional", fields: { optional: false } },
  ];

  for (const { fieldName, fields } of unsupportedFields) {
    const decoded = validateRuntimeEffectCatalogPayload(
      "Fixture optional chip attack",
      "optional_spend_chip_attack_damage",
      { ...baseEffect, ...fields },
      "combat",
      "card"
    );

    assert.equal(decoded.ok, false);
    if (decoded.ok) continue;
    assert.match(
      decoded.errors.join("\n"),
      new RegExp(`unsupported field ${fieldName}`)
    );
  }
});
