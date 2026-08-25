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
import { verifiedTestRuntimeEffect } from "./helpers/verified-runtime-effect.js";

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
        verifiedTestRuntimeEffect({
          effectId: "ongoing_hand_refill_bonus",
          timing: "endTurn",
          amount: 1,
        }),
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
        verifiedTestRuntimeEffect({
          effectId: "fixture_add_power_equal_to_target_cost",
          timing: "onPlay",
          target: { selector: "mainMarketCard" },
        }),
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

  const malformed = validateRuntimeEffectCatalogPayload(
    "Wild Magic",
    "wild_magic_choice",
    {
      effectId: "wild_magic_choice",
      timing: "onPlay",
      options: [{ effectId: "add_power", amount: "bad" }],
    },
    "fixture",
    "card"
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
        verifiedTestRuntimeEffect({
          effectId: "wild_magic_choice",
          timing: "onPlay",
          options: [{ effectId: "add_power", amount: 2 }],
        }),
        source,
        throwingRuntimeServices()
      )
  );

  assert.deepEqual(valid, { ok: true });
  assert.equal(handlerCalled, true);
});

test("catalog execute rejects unsupported source and timing pairs before calling the handler", () => {
  const scenario = createGameScenario({ rootDir, seed: 23023 });
  const subject = scenario.activePlayer;

  for (const [sourceType, timing] of [
    ["card", "activation"],
    ["wizardProperty", "onPlay"],
  ] as const) {
    let handlerCalled = false;
    const result = withTemporaryEffectRuntimeOperations(
      "play_top_card_from_foe_deck",
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
          verifiedTestRuntimeEffect({
            effectId: "play_top_card_from_foe_deck",
            timing,
            targetSelector: "chosenFoe",
          }),
          catalogSource(subject, sourceType, "combat"),
          throwingRuntimeServices()
        )
    );

    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.match(result.error, /unsupported timing .* for source/);
    assert.equal(handlerCalled, false);
  }
});

test("catalog execute rejects conflicting attack and status targets before calling handlers", () => {
  const scenario = createGameScenario({ rootDir, seed: 23022 });
  const subject = scenario.activePlayer;
  const source = catalogSource(subject, "card", "combat");
  const cases = [
    {
      effectId: "attack_damage",
      payload: {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 2,
        target: { selector: "opponentPlayer" },
        targetSelector: "eachFoe",
      },
    },
    {
      effectId: "gain_status",
      payload: {
        effectId: "gain_status",
        timing: "onPlay",
        statusId: "dingler",
        target: { selector: "opponentPlayer" },
        targetSelector: "eachPlayerClockwiseFromActive",
      },
    },
  ] as const;
  const results = cases.map(({ effectId, payload }) =>
    validateRuntimeEffectCatalogPayload(
      `Conflicting ${effectId}`,
      effectId,
      payload,
      source.runtimeMode,
      source.sourceType
    )
  );

  assert.equal(
    results.every((result) => !result.ok),
    true
  );
  assert.match(
    results[0]?.ok ? "" : (results[0]?.errors[0] ?? ""),
    /target and targetSelector cannot both be provided/
  );
  assert.match(
    results[1]?.ok ? "" : (results[1]?.errors[0] ?? ""),
    /target and targetSelector cannot both be provided/
  );
});

test("catalog rejects unsupported timing at the decoder boundary before its handler", () => {
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
});

test("resource and life/status family decoders reject malformed payloads before handlers", () => {
  const scenario = createGameScenario({ rootDir, seed: 23023 });
  const subject = scenario.activePlayer;
  const source = catalogSource(subject, "card", "combat");
  const cases = [
    {
      effectId: "gain_chips" as const,
      payload: { effectId: "gain_chips", timing: "onPlay", amount: 0 },
    },
    {
      effectId: "draw_cards" as const,
      payload: { effectId: "draw_cards", timing: "onDefense", amount: 0 },
    },
    {
      effectId: "heal" as const,
      payload: {
        effectId: "heal",
        timing: "onPlay",
        amount: 0,
        targetSelector: "activePlayer",
      },
    },
    {
      effectId: "gain_status" as const,
      payload: {
        effectId: "gain_status",
        timing: "onPlay",
        statusId: "wizard",
        targetSelector: "activePlayer",
      },
    },
  ] as const;

  for (const { effectId, payload } of cases) {
    const result = validateRuntimeEffectCatalogPayload(
      `Malformed ${effectId}`,
      effectId,
      payload,
      source.runtimeMode,
      source.sourceType
    );

    assert.equal(result.ok, false);
  }
});

test("card ownership and choice family decoders reject malformed payloads at intake", () => {
  const scenario = createGameScenario({ rootDir, seed: 23024 });
  const subject = scenario.activePlayer;
  const source = catalogSource(subject, "card", "combat");
  const cases = [
    {
      effectId: "reveal_top_card" as const,
      payload: {
        effectId: "reveal_top_card",
        timing: "onPlay",
        source: "unsupportedDeck",
      },
    },
    {
      effectId: "play_top_card" as const,
      payload: {
        effectId: "play_top_card",
        timing: "onPlay",
        source: "activePlayerDeck",
        destination: "unsupportedDestination",
      },
    },
    {
      effectId: "play_top_card_from_foe_deck" as const,
      payload: {
        effectId: "play_top_card_from_foe_deck",
        timing: "onPlay",
        targetSelector: "unsupportedFoe",
      },
    },
    {
      effectId: "wild_magic_choice" as const,
      payload: {
        effectId: "wild_magic_choice",
        timing: "onPlay",
        options: [{ effectId: "add_power", amount: "bad" }],
      },
    },
  ] as const;

  for (const { effectId, payload } of cases) {
    const result = validateRuntimeEffectCatalogPayload(
      `Malformed ${effectId}`,
      effectId,
      payload,
      source.runtimeMode,
      source.sourceType
    );

    assert.equal(result.ok, false);
  }
});

test("Mayhem family rejects malformed payloads at intake", () => {
  const scenario = createGameScenario({ rootDir, seed: 23026 });
  const subject = scenario.activePlayer;
  const cases = [
    {
      effectId: "mayhem_attack" as const,
      payload: {
        effectId: "mayhem_attack",
        timing: "onPlay",
        amount: 4,
        targetSelector: "allPlayers",
      },
    },
    {
      effectId: "mayhem_each_player_vote_dingler" as const,
      payload: {
        effectId: "mayhem_each_player_vote_dingler",
        timing: "onPlay",
        targetSelector: "eachPlayerClockwiseFromActive",
        chooser: "affectedPlayer",
        voteTargetSelector: "anyPlayer",
        statusId: "dingler",
      },
    },
    {
      effectId: "mega_mayhem_set_life" as const,
      payload: {
        effectId: "mega_mayhem_set_life",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        lifeTotal: -1,
      },
    },
  ] as const;

  for (const { effectId, payload } of cases) {
    const result = validateRuntimeEffectCatalogPayload(
      `Malformed ${effectId}`,
      effectId,
      payload,
      "combat",
      "card"
    );

    assert.equal(result.ok, false);
  }

  let handlerCalled = false;
  const unsupportedSource = withTemporaryEffectRuntimeOperations(
    "mega_mayhem_set_life",
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
        verifiedTestRuntimeEffect({
          effectId: "mega_mayhem_set_life",
          timing: "onMayhemResolve",
          targetSelector: "eachPlayerClockwiseFromActive",
          lifeTotal: 5,
        }),
        catalogSource(subject, "deadWizardToken", "combat"),
        throwingRuntimeServices()
      )
  );

  assert.equal(unsupportedSource.ok, false);
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
      allowed: ["card", "wizardProperty"],
    },
    {
      effect: {
        effectId: "modify_effective_value",
        timing: "whileControlled",
        valueKind: "tokenVictoryPoints",
        operation: "add",
        amount: 1,
        target: {
          targetType: "token",
          definitionId: "fixture-token",
        },
      },
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
    verifiedTestRuntimeEffect({
      effectId: "activation_destroy_self_then_destroy_own_cards",
      timing: "activation",
      chooser: "controller",
      activationLimit: "oncePerTurnWhileControlled",
      sourceZones: "hand",
      minAmount: 0,
      maxAmount: 2,
      destroySelf: true,
    }),
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

test("activation and ongoing families reject unsupported calls before handlers", () => {
  const scenario = createGameScenario({ rootDir, seed: 23025 });
  const subject = scenario.activePlayer;
  const cases = [
    {
      effectId: "optional_spend_chip_destroy_own_cards" as const,
      payload: {
        effectId: "optional_spend_chip_destroy_own_cards" as const,
        timing: "onPlay" as const,
        chipCost: 1,
        amount: 1,
        sourceZones: ["hand"] as Array<"hand" | "discard">,
        chooser: "controller" as const,
      },
    },
  ];

  for (const { effectId, payload } of cases) {
    let handlerCalled = false;
    const result = withTemporaryEffectRuntimeOperations(
      effectId,
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
          verifiedTestRuntimeEffect(payload),
          catalogSource(subject, "card", "combat"),
          throwingRuntimeServices()
        )
    );

    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.match(result.error, /uses unsupported effect/);
    assert.equal(handlerCalled, false);
  }
});

test("catalog reports malformed end-turn payloads at intake", () => {
  const result = validateRuntimeEffectCatalogPayload(
    "Malformed end-turn effect",
    "ongoing_hand_refill_bonus",
    {
      effectId: "ongoing_hand_refill_bonus",
      timing: "endTurn",
      amount: "invalid",
    },
    "combat",
    "card"
  );

  if (result.ok) {
    assert.fail("Expected catalog error");
  }
  assert.match(result.errors.join("\n"), /amount must be a positive integer/);
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

  const malformed = validateRuntimeEffectCatalogPayload(
    "Malformed end-turn effect",
    "add_power",
    {
      effectId: "add_power",
      timing: "endTurn",
      amount: "invalid",
    },
    scenario.state.runtimeMode,
    source.sourceType
  );
  if (malformed.ok) {
    assert.fail("Expected catalog error");
  }
  assert.match(
    malformed.errors.join("\n"),
    /amount must be a positive integer/
  );

  assert.deepEqual(
    evaluateRuntimeEffectEndTurnDrawModifier(
      verifiedTestRuntimeEffect({
        effectId: "add_power",
        timing: "onPlay",
        amount: 1,
      }),
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

  const malformed = validateRuntimeEffectCatalogPayload(
    "Malformed on-play hook",
    "add_power",
    {
      effectId: "add_power",
      timing: "onPlayCard",
      amount: "invalid",
    },
    scenario.state.runtimeMode,
    source.sourceType
  );
  if (malformed.ok) {
    assert.fail("Expected catalog error");
  }
  assert.match(
    malformed.errors.join("\n"),
    /amount must be a positive integer/
  );

  assert.deepEqual(
    executeRuntimeEffectOnPlayCard(
      verifiedTestRuntimeEffect({
        effectId: "add_power",
        timing: "onPlayCard",
        amount: 1,
      }),
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

  const malformed = validateRuntimeEffectCatalogPayload(
    "Malformed after-attack hook",
    "add_power",
    {
      effectId: "add_power",
      timing: "afterFirstAttackDamageEachTurn",
      amount: "invalid",
    },
    scenario.state.runtimeMode,
    source.sourceType
  );
  if (malformed.ok) {
    assert.fail("Expected catalog error");
  }
  assert.match(
    malformed.errors.join("\n"),
    /amount must be a positive integer/
  );

  assert.deepEqual(
    applyRuntimeEffectAfterPlayerAttackDamage(
      verifiedTestRuntimeEffect({
        effectId: "add_power",
        timing: "onPlay",
        amount: 1,
      }),
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
