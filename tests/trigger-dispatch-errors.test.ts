import assert from "node:assert/strict";
import test from "node:test";

import { validateRuntimeEffectCatalogPayload } from "../src/engine/effect-runtime-registry.js";

test("Runtime Data Intake rejects malformed ongoing refill payload", () => {
  const result = validateRuntimeEffectCatalogPayload(
    "Malformed ongoing refill",
    "ongoing_hand_refill_bonus",
    {
      effectId: "ongoing_hand_refill_bonus",
      timing: "endTurn",
      amount: "invalid",
    },
    "combat",
    "card"
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join("\n"), /amount must be a positive integer/);
});

test("Runtime Data Intake rejects the first malformed modifier before later execution", () => {
  const malformed = validateRuntimeEffectCatalogPayload(
    "Malformed max-life modifier",
    "increase_hand_limit_at_max_life",
    {
      effectId: "increase_hand_limit_at_max_life",
      timing: "endTurn",
      amount: "invalid",
    },
    "combat",
    "card"
  );
  const valid = validateRuntimeEffectCatalogPayload(
    "Valid refill modifier",
    "ongoing_hand_refill_bonus",
    {
      effectId: "ongoing_hand_refill_bonus",
      timing: "endTurn",
      amount: 2,
    },
    "combat",
    "card"
  );

  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.match(
      malformed.errors.join("\n"),
      /amount must be a positive integer/
    );
  }
  assert.equal(valid.ok, true);
});

test("Runtime Data Intake rejects malformed afterDamageDealt timing before Control Ledger dispatch", () => {
  const result = validateRuntimeEffectCatalogPayload(
    "Malformed damage trigger",
    "heal_equal_damage_dealt_on_own_turn",
    {
      effectId: "heal_equal_damage_dealt_on_own_turn",
      timing: "invalid",
    },
    "combat",
    "card"
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join("\n"), /timing must be afterDamageDealt/);
});

test("Runtime Data Intake rejects malformed controlled modifiers before draw calculation", () => {
  const result = validateRuntimeEffectCatalogPayload(
    "Malformed controlled modifier",
    "ongoing_hand_refill_bonus",
    {
      effectId: "ongoing_hand_refill_bonus",
      timing: "endTurn",
      amount: "invalid",
    },
    "combat",
    "card"
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join("\n"), /amount must be a positive integer/);
});

test("Runtime Data Intake rejects malformed end-turn modifiers before action mutation", () => {
  const result = validateRuntimeEffectCatalogPayload(
    "Malformed end-turn modifier",
    "ongoing_hand_refill_bonus",
    {
      effectId: "ongoing_hand_refill_bonus",
      timing: "endTurn",
      amount: "invalid",
    },
    "combat",
    "card"
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join("\n"), /amount must be a positive integer/);
});
