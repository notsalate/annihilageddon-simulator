import assert from "node:assert/strict";
import test from "node:test";

import {
  executeRuntimeEffect,
  applyRuntimeEffectAfterPlayerAttackDamage,
  evaluateRuntimeEffectAtTiming,
  evaluateRuntimeEffectEndTurnDrawModifier,
  executeRuntimeEffectOnPlayCard,
  validateRuntimeEffectCatalogPayload,
  type EffectRuntimeServices,
  type EffectSourceContext,
  type EffectRuntimeSourceKind,
} from "../src/engine/effect-runtime-registry.js";
import {
  createGameScenario,
  givenRuntimeCard,
} from "./helpers/game-scenario.js";
import { withTemporaryEffectRuntimeOperations } from "./helpers/with-temporary-effect-runtime-operations.js";

const rootDir = process.cwd();

test("catalog execute rejects an unsupported source kind before calling its handler", () => {
  const scenario = createGameScenario({ rootDir, seed: 23018 });
  const subject = scenario.activePlayer;
  let handlerCalled = false;

  const result = withTemporaryEffectRuntimeOperations(
    "ongoing_hand_refill_bonus",
    {
      execute() {
        handlerCalled = true;
        return { ok: true };
      },
    },
    () =>
      executeRuntimeEffect(
        scenario.state,
        subject,
        {
          effectId: "ongoing_hand_refill_bonus",
          timing: "endTurn",
          amount: 1,
        },
        catalogSource(subject, "wizardProperty", "combat"),
        throwingRuntimeServices()
      )
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /unsupported source kind/);
  assert.equal(handlerCalled, false);
});

test("catalog execute rejects an unavailable runtime mode before calling its handler", () => {
  const scenario = createGameScenario({ rootDir, seed: 23019 });
  const subject = scenario.activePlayer;
  let handlerCalled = false;

  const result = withTemporaryEffectRuntimeOperations(
    "fixture_add_power_equal_to_target_cost",
    {
      execute() {
        handlerCalled = true;
        return { ok: true };
      },
    },
    () =>
      executeRuntimeEffect(
        scenario.state,
        subject,
        {
          effectId: "fixture_add_power_equal_to_target_cost",
          target: { selector: "mainMarketCard" },
        },
        catalogSource(subject, "card", "combat"),
        throwingRuntimeServices()
      )
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /unavailable in combat mode/);
  assert.equal(handlerCalled, false);
});

test("catalog decodes Wild Magic options before handing typed options to its handler", () => {
  const scenario = createGameScenario({ rootDir, seed: 23021 });
  const subject = scenario.activePlayer;
  const source = catalogSource(subject, "card", "fixture");
  let handlerCalled = false;

  const malformed = withTemporaryEffectRuntimeOperations(
    "wild_magic_choice",
    {
      execute() {
        handlerCalled = true;
        return { ok: true };
      },
    },
    () =>
      executeRuntimeEffect(
        scenario.state,
        subject,
        {
          effectId: "wild_magic_choice",
          timing: "onPlay",
          options: [{ effectId: "add_power", amount: "bad" }],
        },
        source,
        throwingRuntimeServices()
      )
  );

  assert.equal(malformed.ok, false);
  assert.equal(handlerCalled, false);

  const valid = withTemporaryEffectRuntimeOperations(
    "wild_magic_choice",
    {
      execute(_state, _player, effect) {
        handlerCalled = true;
        assert.deepEqual(effect.options, [
          { effectId: "add_power", amount: 2 },
        ]);
        return { ok: true };
      },
    },
    () =>
      executeRuntimeEffect(
        scenario.state,
        subject,
        {
          effectId: "wild_magic_choice",
          timing: "onPlay",
          options: [{ effectId: "add_power", amount: 2 }],
        },
        source,
        throwingRuntimeServices()
      )
  );

  assert.deepEqual(valid, { ok: true });
  assert.equal(handlerCalled, true);
});

test("catalog rejects unsupported timing at the decoder boundary before its handler", () => {
  const scenario = createGameScenario({ rootDir, seed: 23020 });
  const subject = scenario.activePlayer;
  let handlerCalled = false;
  const effect = {
    effectId: "ongoing_hand_refill_bonus",
    timing: "whileControlled",
    amount: 1,
  } as const;

  const result = validateRuntimeEffectCatalogPayload(
    "Controlled refill",
    effect.effectId,
    effect,
    "fixture",
    "card"
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join("\n"), /timing must be endTurn/);

  const execution = withTemporaryEffectRuntimeOperations(
    effect.effectId,
    {
      execute() {
        handlerCalled = true;
        return { ok: true };
      },
    },
    () =>
      executeRuntimeEffect(
        scenario.state,
        subject,
        effect,
        catalogSource(subject, "card", "fixture"),
        throwingRuntimeServices()
      )
  );

  assert.equal(execution.ok, false);
  assert.equal(handlerCalled, false);
});

test("setup effects accept only wizard-property sources", () => {
  const effect = {
    effectId: "set_starting_life_total",
    timing: "setup",
    lifeTotal: 30,
  } as const;

  assert.equal(
    validateRuntimeEffectCatalogPayload(
      "Wizard property",
      effect.effectId,
      effect,
      "combat",
      "wizardProperty"
    ).ok,
    true
  );
  for (const sourceKind of ["card", "deadWizardToken"] as const) {
    assert.equal(
      validateRuntimeEffectCatalogPayload(
        `Invalid ${sourceKind}`,
        effect.effectId,
        effect,
        "combat",
        sourceKind
      ).ok,
      false
    );
  }
});

test("catalog keeps card, wizard-property, and Dead Wizard Token policies distinct", () => {
  const cases = [
    {
      effect: { effectId: "add_power", timing: "onPlay", amount: 1 },
      allowed: ["card", "wizardProperty", "deadWizardToken"],
    },
    {
      effect: {
        effectId: "ongoing_hand_refill_bonus",
        timing: "endTurn",
        amount: 1,
      },
      allowed: ["card"],
    },
    {
      effect: {
        effectId: "temporary_hand_limit_by_gained_card_type",
        timing: "endTurn",
        amount: 1,
        cardTypes: ["spell"],
      },
      allowed: ["wizardProperty"],
    },
  ] as const;

  for (const { effect, allowed } of cases) {
    for (const sourceKind of [
      "card",
      "wizardProperty",
      "deadWizardToken",
    ] as const) {
      assert.equal(
        validateRuntimeEffectCatalogPayload(
          `${effect.effectId} from ${sourceKind}`,
          effect.effectId,
          effect,
          "combat",
          sourceKind
        ).ok,
        (allowed as readonly EffectRuntimeSourceKind[]).includes(sourceKind)
      );
    }
  }
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

function catalogSource(
  player: { readonly playerId: EffectSourceContext["playerId"] },
  sourceType: EffectSourceContext["sourceType"],
  runtimeMode: EffectSourceContext["runtimeMode"]
): EffectSourceContext {
  return {
    sourceType,
    runtimeMode,
    playerId: player.playerId,
    cardInstanceId: "fixture-catalog-source",
    definitionId: "fixture-catalog-source",
  };
}

function throwingRuntimeServices(): EffectRuntimeServices {
  return new Proxy({} as EffectRuntimeServices, {
    get() {
      throw new Error("Handler must not run before catalog policy validation");
    },
  });
}
