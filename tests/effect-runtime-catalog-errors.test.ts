import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRuntimeEffectAfterPlayerAttackDamage,
  evaluateRuntimeEffectAtTiming,
  evaluateRuntimeEffectEndTurnDrawModifier,
  executeRuntimeEffectOnPlayCard,
  validateRuntimeEffectCatalogPayload,
  type EffectSourceContext,
} from "../src/engine/effect-runtime-registry.js";
import {
  createGameScenario,
  givenRuntimeCard,
} from "./helpers/game-scenario.js";

const rootDir = process.cwd();

test("catalog names executable timing constraints separately from payload decoding", () => {
  const result = validateRuntimeEffectCatalogPayload(
    "Controlled refill",
    "ongoing_hand_refill_bonus",
    {
      effectId: "ongoing_hand_refill_bonus",
      timing: "whileControlled",
      amount: 1,
    },
    "fixture",
    "card"
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join("\n"), /requires endTurn timing/);
});

test("catalog applies unsupported policy only after operation timing matches", () => {
  const scenario = createGameScenario({ rootDir, seed: 23017 });
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: "fixture",
    playerId: scenario.activePlayer.playerId,
    cardInstanceId: "fixture-unsupported-activation",
    definitionId: "fixture-unsupported-activation",
  };
  let evaluated = false;

  const result = evaluateRuntimeEffectAtTiming(
    {
      effectId: "activation_destroy_self_then_destroy_own_cards",
      timing: "activation",
      chooser: "controller",
      activationLimit: "oncePerTurnWhileControlled",
      sourceZones: "hand",
      minAmount: 0,
      maxAmount: 2,
      destroySelf: true,
    },
    source,
    "onPlay",
    () => {
      evaluated = true;
      return { status: "resolved", result: undefined };
    }
  );

  assert.deepEqual(result, { status: "notApplicable" });
  assert.equal(evaluated, false);
});

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

  const result = evaluateRuntimeEffectEndTurnDrawModifier(
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
  const context = {
    state: scenario.state,
    controller,
    source,
    currentDrawCount: 5,
  };

  const malformed = evaluateRuntimeEffectEndTurnDrawModifier(
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
    evaluateRuntimeEffectEndTurnDrawModifier(
      { effectId: "add_power", timing: "endTurn", amount: 1 },
      context
    ),
    { status: "notApplicable" }
  );
});

test("catalog validates a payload before declaring an on-play hook not applicable", () => {
  const scenario = createGameScenario({ rootDir, seed: 23016 });
  const controller = scenario.activePlayer;
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
    cardInstanceId: sourceCard.instanceId,
    definitionId: sourceCard.definitionId,
  };
  const context = {
    state: scenario.state,
    controller,
    source,
    sourceDefinition,
    playedCard,
    playedDefinition,
  };

  const malformed = executeRuntimeEffectOnPlayCard(
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
    executeRuntimeEffectOnPlayCard(
      { effectId: "add_power", timing: "onPlayCard", amount: 1 },
      context
    ),
    { status: "notApplicable" }
  );
});

test("catalog validates a payload before declaring an after-attack hook not applicable", () => {
  const scenario = createGameScenario({ rootDir, seed: 23017 });
  const controller = scenario.activePlayer;
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
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: scenario.state.runtimeMode,
    playerId: controller.playerId,
    cardInstanceId: sourceCard.instanceId,
    definitionId: sourceCard.definitionId,
  };
  const context = {
    state: scenario.state,
    controller,
    source,
    sourceDefinition,
    totalDamageDealt: 2,
    attackSource: source,
  };

  const malformed = applyRuntimeEffectAfterPlayerAttackDamage(
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
    applyRuntimeEffectAfterPlayerAttackDamage(
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
