import assert from "node:assert/strict";
import test from "node:test";

import {
  getEffectRuntimeCatalogEntry,
  type EffectSourceContext,
} from "../src/engine/effect-runtime-registry.js";
import { createGameScenario } from "./helpers/game-scenario.js";

const rootDir = process.cwd();

test("catalog end-turn operation reports decoder errors directly", () => {
  const scenario = createGameScenario({ rootDir, seed: 23014 });
  const controller = scenario.activePlayer;
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: scenario.state.runtimeMode,
    playerId: controller.playerId,
    cardInstanceId: "fixture-catalog-end-turn-error",
    definitionId: "fixture-catalog-end-turn-error",
  };

  const result = getEffectRuntimeCatalogEntry(
    "ongoing_hand_refill_bonus"
  ).evaluateEndTurnDrawModifier(
    "Effect ongoing_hand_refill_bonus",
    {
      effectId: "ongoing_hand_refill_bonus",
      timing: "endTurn",
      amount: "invalid",
    },
    {
      state: scenario.state,
      controller,
      source,
      currentDrawCount: 5,
    }
  );

  if (result.status !== "error") {
    assert.fail(`Expected catalog error, received ${result.status}`);
  }
  assert.match(result.error, /amount must be a positive integer/);
});
