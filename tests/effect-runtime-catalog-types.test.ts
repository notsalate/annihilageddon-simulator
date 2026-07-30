import assert from "node:assert/strict";
import test from "node:test";

import {
  validateRuntimeEffectCatalogPayload,
  type EffectRuntimeCatalogOperationOverridesForTesting,
} from "../src/engine/effect-runtime-registry.js";
import type { RuntimeEffectForId } from "../src/engine/runtime-effect.js";

// @ts-expect-error Catalog handlers must remain internal to prevent raw-payload execution.
import type { EffectRuntimeHandler } from "../src/engine/effect-runtime-registry.js";
// @ts-expect-error The decoder map must remain private to its decoding module.
import type { runtimeEffectDecoders } from "../src/engine/runtime-effect-decoder.js";

void (null as unknown as EffectRuntimeHandler);
void (null as unknown as typeof runtimeEffectDecoders);

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() =>
    Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

type AddPowerHasNoDefenseDestination = Expect<
  Equal<
    "destination" extends keyof RuntimeEffectForId<"add_power"> ? true : false,
    false
  >
>;

const addPowerOperations: EffectRuntimeCatalogOperationOverridesForTesting<"add_power"> = {
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
