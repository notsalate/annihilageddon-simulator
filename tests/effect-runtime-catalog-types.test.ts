import assert from "node:assert/strict";
import test from "node:test";

import {
  effectRuntimeCatalog,
  runtimeEffectDecoders,
  defineEffectRuntimeEntry,
  type EffectRuntimeCatalogDefinition,
  type EffectRuntimeHandler,
  type RuntimeEffectDecoder,
} from "../src/engine/effect-runtime-registry.js";
import {
  knownRuntimeEffectIds,
  type RuntimeEffectForId,
  type RuntimeEffectId,
} from "../src/engine/runtime-effect.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() =>
    Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

type CatalogIds = keyof EffectRuntimeCatalogDefinition;
type CatalogIsExhaustive = Expect<Equal<CatalogIds, RuntimeEffectId>>;
const catalogIsExhaustive: CatalogIsExhaustive = true;
void catalogIsExhaustive;

const addPowerHandler: EffectRuntimeHandler<RuntimeEffectForId<"add_power">> = {
  effectId: "add_power",
  validateShape() {
    return [];
  },
  execute(_state, _player, effect) {
    const amount: number = effect.amount;
    void amount;
    return { ok: true };
  },
};

const avoidAttackHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"avoid_attack">
> = {
  effectId: "avoid_attack",
  validateShape() {
    return [];
  },
  execute(_state, _player, effect) {
    const destination: "discardSelf" | "topdeckSelf" = effect.destination;
    const costs = effect.costs;
    void destination;
    void costs;
    return { ok: true };
  },
};

const addPowerDecoder: RuntimeEffectDecoder<"add_power"> =
  runtimeEffectDecoders.add_power;
const gainChipsHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"gain_chips">
> = {
  effectId: "gain_chips",
  validateShape() {
    return [];
  },
  execute() {
    return { ok: true };
  },
};

void defineEffectRuntimeEntry({
  effectId: "add_power",
  decoder: addPowerDecoder,
  handler: addPowerHandler,
  supportedModes: ["combat"],
  supportedSourceKinds: ["card"],
});

type AddPowerHasNoDefenseDestination = Expect<
  Equal<
    "destination" extends keyof RuntimeEffectForId<"add_power"> ? true : false,
    false
  >
>;
type GainChipsEntryConfig = Parameters<
  typeof defineEffectRuntimeEntry<"gain_chips">
>[0];
type AddPowerDecoderCannotRegisterAsGainChips = Expect<
  Equal<
    typeof addPowerDecoder extends GainChipsEntryConfig["decoder"]
      ? true
      : false,
    false
  >
>;
type AddPowerHandlerCannotRegisterAsGainChips = Expect<
  Equal<
    typeof addPowerHandler extends GainChipsEntryConfig["handler"]
      ? true
      : false,
    false
  >
>;

const negativeContracts: [
  AddPowerHasNoDefenseDestination,
  AddPowerDecoderCannotRegisterAsGainChips,
  AddPowerHandlerCannotRegisterAsGainChips,
] = [true, true, true];
void negativeContracts;
void gainChipsHandler;
void avoidAttackHandler;

test("runtime effect catalog and decoder source are exhaustive", () => {
  const expected = new Set<RuntimeEffectId>(knownRuntimeEffectIds);
  assert.deepEqual(new Set(effectRuntimeCatalog.keys()), expected);
  assert.deepEqual(new Set(Object.keys(runtimeEffectDecoders)), expected);
});
