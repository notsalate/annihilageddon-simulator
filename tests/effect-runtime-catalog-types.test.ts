import assert from "node:assert/strict";
import test from "node:test";

import {
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
    assert.match(decoded.errors.join("\n"), new RegExp(`unsupported field ${fieldName}`));
  }
});
