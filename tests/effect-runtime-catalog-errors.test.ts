import assert from "node:assert/strict";
import test from "node:test";

import {
  getEffectRuntimeCatalogEntry,
  type EffectSourceContext,
} from "../src/engine/effect-runtime-registry.js";
import {
  createGameScenario,
  givenRuntimeCard,
} from "./helpers/game-scenario.js";

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

test("catalog validates a payload before declaring an end-turn operation not applicable", () => {
  const scenario = createGameScenario({ rootDir, seed: 23015 });
  const controller = scenario.activePlayer;
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: scenario.state.runtimeMode,
    playerId: controller.playerId,
    cardInstanceId: "fixture-catalog-non-end-turn-error",
    definitionId: "fixture-catalog-non-end-turn-error",
  };
  const entry = getEffectRuntimeCatalogEntry("add_power");
  const context = {
    state: scenario.state,
    controller,
    source,
    currentDrawCount: 5,
  };

  const malformed = entry.evaluateEndTurnDrawModifier(
    "Effect add_power",
    {
      effectId: "add_power",
      timing: "endTurn",
      amount: "invalid",
    },
    context
  );
  if (malformed.status !== "error") {
    assert.fail(`Expected catalog error, received ${malformed.status}`);
  }
  assert.match(malformed.error, /amount must be a positive integer/);

  assert.deepEqual(
    entry.evaluateEndTurnDrawModifier(
      "Effect add_power",
      { effectId: "add_power", timing: "endTurn", amount: 1 },
      context
    ),
    { status: "notApplicable" }
  );
});

test("catalog validates a payload before declaring an on-play hook not applicable", () => {
  const scenario = createGameScenario({ rootDir, seed: 23016 });
  const controller = scenario.activePlayer;
  const playedCard = givenRuntimeCard(scenario, {
    player: controller,
    zone: "playedThisTurn",
    effects: [],
  });
  const playedDefinition = scenario.state.cardDefinitions.get(
    playedCard.definitionId
  );
  assert.ok(playedDefinition);
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: scenario.state.runtimeMode,
    playerId: controller.playerId,
    cardInstanceId: "fixture-catalog-on-play-no-hook",
    definitionId: "fixture-catalog-on-play-no-hook",
  };
  const entry = getEffectRuntimeCatalogEntry("add_power");
  const context = {
    state: scenario.state,
    controller,
    source,
    sourceDefinition: playedDefinition,
    playedCard,
    playedDefinition,
  };

  const malformed = entry.executeOnPlayCard(
    "Effect add_power",
    {
      effectId: "add_power",
      timing: "onPlayCard",
      amount: "invalid",
    },
    context
  );
  if (malformed.status !== "error") {
    assert.fail(`Expected catalog error, received ${malformed.status}`);
  }
  assert.match(malformed.error, /amount must be a positive integer/);

  assert.deepEqual(
    entry.executeOnPlayCard(
      "Effect add_power",
      { effectId: "add_power", timing: "onPlayCard", amount: 1 },
      context
    ),
    { status: "notApplicable" }
  );
});

test("catalog validates a payload before declaring an after-attack hook not applicable", () => {
  const scenario = createGameScenario({ rootDir, seed: 23017 });
  const controller = scenario.activePlayer;
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: scenario.state.runtimeMode,
    playerId: controller.playerId,
    cardInstanceId: "fixture-catalog-after-attack-no-hook",
    definitionId: "fixture-catalog-after-attack-no-hook",
  };
  const sourceCard = givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    isOngoing: true,
    effects: [],
  });
  const sourceDefinition = scenario.state.cardDefinitions.get(
    sourceCard.definitionId
  );
  assert.ok(sourceDefinition);
  const entry = getEffectRuntimeCatalogEntry("add_power");
  const context = {
    state: scenario.state,
    controller,
    source,
    sourceDefinition,
    totalDamageDealt: 2,
    attackSource: source,
  };

  const malformed = entry.applyAfterPlayerAttackDamage(
    "Effect add_power",
    {
      effectId: "add_power",
      timing: "afterFirstAttackDamageEachTurn",
      amount: "invalid",
    },
    context
  );
  if (malformed.status !== "error") {
    assert.fail(`Expected catalog error, received ${malformed.status}`);
  }
  assert.match(malformed.error, /amount must be a positive integer/);

  assert.deepEqual(
    entry.applyAfterPlayerAttackDamage(
      "Effect add_power",
      {
        effectId: "add_power",
        timing: "afterFirstAttackDamageEachTurn",
        amount: 1,
      },
      context
    ),
    { status: "notApplicable" }
  );
});
