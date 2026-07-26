import assert from "node:assert/strict";
import test from "node:test";

import type { RuntimeEffect } from "../src/index.js";
import { calculateEndTurnDrawCount } from "../src/engine/effect-runtime.js";
import { dispatchControlledCardOperation } from "../src/engine/trigger-dispatch.js";

import {
  createGameScenario,
  givenRuntimeCard,
} from "./helpers/game-scenario.js";

const rootDir = process.cwd();

test("malformed ongoing refill is reported as a catalog error", () => {
  const scenario = createGameScenario({ rootDir, seed: 23010 });
  const controller = scenario.activePlayer;
  controller.permanents = [];
  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_hand_refill_bonus",
        timing: "endTurn",
        amount: "invalid",
      } as unknown as RuntimeEffect,
    ],
  });
  const turnBefore = structuredClone(scenario.state.turn);
  const eventCountBefore = scenario.state.eventLog.length;

  const result = dispatchControlledCardOperation(scenario.state, controller, {
    kind: "collectEndTurnDrawModifier",
    currentBaseDrawCount: 5,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /amount must be a positive integer/);
  assert.deepEqual(scenario.state.turn, turnBefore);
  assert.equal(scenario.state.eventLog.length, eventCountBefore);
});

test("end-turn dispatch stops on the first malformed modifier", () => {
  const scenario = createGameScenario({ rootDir, seed: 23011 });
  const controller = scenario.activePlayer;
  controller.permanents = [];
  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "increase_hand_limit_at_max_life",
        timing: "endTurn",
        amount: "invalid",
      } as unknown as RuntimeEffect,
    ],
  });
  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_hand_refill_bonus",
        timing: "endTurn",
        amount: 2,
      },
    ],
  });

  const result = dispatchControlledCardOperation(scenario.state, controller, {
    kind: "collectEndTurnDrawModifier",
    currentBaseDrawCount: 5,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /amount must be a positive integer/);
});

test("calculateEndTurnDrawCount propagates malformed controlled modifiers", () => {
  const scenario = createGameScenario({ rootDir, seed: 23012 });
  const controller = scenario.activePlayer;
  controller.permanents = [];
  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_hand_refill_bonus",
        timing: "endTurn",
        amount: "invalid",
      } as unknown as RuntimeEffect,
    ],
  });

  assert.throws(
    () => calculateEndTurnDrawCount(scenario.state, controller),
    /amount must be a positive integer/
  );
});
