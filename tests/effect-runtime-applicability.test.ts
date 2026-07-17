import assert from "node:assert/strict";
import test from "node:test";

import { initializeGame } from "../src/index.js";
import { executeEffect } from "../src/engine/effect-runtime.js";
import type { EffectSourceContext } from "../src/engine/effect-runtime-registry.js";
import type { RuntimeEffectPayload } from "../src/engine/runtime-effect.js";

test("executeEffect applies add_power through the catalog resolver", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 11601 });
  const player = state.players[0];
  assert.ok(player);
  const effect = { effectId: "add_power", amount: 2 } as RuntimeEffectPayload;
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: "combat",
    playerId: player.playerId,
    cardInstanceId: "fixture-source",
    definitionId: "fixture-source",
  };

  const result = executeEffect(state, player, effect, source);

  assert.deepEqual(result, { ok: true });
  assert.equal(state.turn.power, 2);
});

function fixtureSource(
  playerId: string,
  runtimeMode: EffectSourceContext["runtimeMode"],
  sourceType: EffectSourceContext["sourceType"] = "card"
): EffectSourceContext {
  return {
    sourceType,
    runtimeMode,
    playerId: playerId as EffectSourceContext["playerId"],
    cardInstanceId: "fixture-source",
    definitionId: "fixture-source",
  };
}

test("fixture-only effect is rejected in combat before its handler", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 11602 });
  const player = state.players[0];
  assert.ok(player);
  const result = executeEffect(
    state,
    player,
    {
      effectId: "fixture_add_power_equal_to_target_cost",
      target: { selector: "mainMarketCard" },
    } as unknown as RuntimeEffectPayload,
    fixtureSource(player.playerId, "combat")
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /fixture effect id/);
  assert.equal(state.turn.power, 0);
});

test("fixture-only effect reaches its handler in fixture mode", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 11603 });
  const player = state.players[0];
  assert.ok(player);
  const result = executeEffect(
    state,
    player,
    {
      effectId: "fixture_add_power_equal_to_target_cost",
      target: { selector: "mainMarketCard" },
    } as unknown as RuntimeEffectPayload,
    fixtureSource(player.playerId, "fixture")
  );
  assert.deepEqual(result, { ok: true });
});

test("wizard-property-only effect is rejected for a card source", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 11604 });
  const player = state.players[0];
  assert.ok(player);
  const result = executeEffect(
    state,
    player,
    {
      effectId: "temporary_hand_limit_by_gained_card_type",
      timing: "endTurn",
      amount: 1,
      cardTypes: ["spell"],
    },
    fixtureSource(player.playerId, "combat", "card")
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /token-only effect id/);
});

test("known effect with invalid shape is rejected before execution", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 11605 });
  const player = state.players[0];
  assert.ok(player);
  const result = executeEffect(
    state,
    player,
    { effectId: "add_power", amount: 0 },
    fixtureSource(player.playerId, "combat")
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /invalid power amount/);
  assert.equal(state.turn.power, 0);
});
