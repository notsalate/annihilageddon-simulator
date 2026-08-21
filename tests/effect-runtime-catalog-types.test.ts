import assert from "node:assert/strict";
import test from "node:test";

import {
  defineEffectRuntimeCatalogGroupsForTesting,
  defineEffectRuntimeFamilyForTesting,
  validateRuntimeEffectCatalogPayload,
  type EffectRuntimeCatalogOperationOverridesForTesting,
} from "../src/engine/effect-runtime-registry.js";
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
