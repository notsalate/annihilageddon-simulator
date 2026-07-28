import assert from "node:assert/strict";
import test from "node:test";

import { initializeGame, type CardInstance } from "../src/index.js";
import {
  executeEffect,
  executeMayhemEffects,
  getEffectExecutionError,
} from "../src/engine/effect-runtime.js";
import type { CardDefinition } from "../src/engine/data.js";
import {
  getEffectRuntimeHandler,
  replaceEffectRuntimeHandlerForTesting,
  resolveEffectRuntimeCatalogEntry,
} from "../src/engine/effect-runtime-registry.js";
import type {
  AttackIntent,
  EffectSourceContext,
} from "../src/engine/effect-runtime-registry.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../src/domain/types.js";

test("executeEffect applies add_power through the catalog resolver", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 11601 });
  const player = state.players[0];
  assert.ok(player);
  const effect = { effectId: "add_power", amount: 2 } as const;
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

test("attack intent keeps lifecycle context in one typed value", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 11610 });
  const attackingPlayer = state.players[0];
  const targetPlayer = state.players[1];
  assert.ok(attackingPlayer);
  assert.ok(targetPlayer);
  const source = fixtureSource(attackingPlayer.playerId, "combat");

  const intent: AttackIntent = {
    attackingPlayer,
    targetPlayer,
    amount: 3,
    effectId: "attack_damage",
    source,
  };

  assert.equal(intent.attackingPlayer, attackingPlayer);
  assert.equal(intent.targetPlayer, targetPlayer);
  assert.equal(intent.amount, 3);
});

test("attack profile uses its initiator instead of the active player or source owner", () => {
  const state = initializeGame({
    rootDir: process.cwd(),
    seed: 11609,
    playerCount: 3,
  });
  const inactiveInitiator = state.players[1];
  const sourceOwner = state.players[2];
  const activePlayer = state.players[0];
  assert.ok(inactiveInitiator);
  assert.ok(sourceOwner);
  assert.ok(activePlayer);
  state.activePlayerId = activePlayer.playerId;
  for (const player of state.players) {
    player.hand = [];
    player.wizardProperties = [];
  }
  const arena: CardInstance = {
    instanceId: markCardInstanceId("fixture-inactive-initiator-arena"),
    definitionId: markCardDefinitionId("esw2_dbg__legend_008"),
    ownerId: inactiveInitiator.playerId,
    marketChips: 0,
  };
  const foreignSourceCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-foreign-attack-source"),
    definitionId: markCardDefinitionId("esw2_dbg__starter_001"),
    ownerId: sourceOwner.playerId,
    marketChips: 0,
  };
  inactiveInitiator.permanents.push(arena);
  sourceOwner.deck.push(foreignSourceCard);
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId !== "attack_damage") {
      return undefined;
    }
    return choices.find((choice) => choice.choiceId === sourceOwner.playerId);
  };

  const result = executeEffect(
    state,
    inactiveInitiator,
    {
      effectId: "attack_damage",
      amount: 2,
      targetSelector: "chosenFoe",
    },
    {
      sourceType: "card",
      runtimeMode: "combat",
      playerId: inactiveInitiator.playerId,
      cardInstanceId: foreignSourceCard.instanceId,
      definitionId: foreignSourceCard.definitionId,
    }
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(sourceOwner.life.current, 16);
});

test("empty catalog diagnostics use the explicit execution error", () => {
  assert.equal(
    getEffectExecutionError([]),
    "Effect resolution failed without diagnostic"
  );
});

test("executeEffect validates a payload once before invoking its handler", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 11608 });
  const player = state.players[0];
  assert.ok(player);
  const originalHandler = getEffectRuntimeHandler("add_power");
  let validationCount = 0;
  const restore = replaceEffectRuntimeHandlerForTesting("add_power", {
    ...originalHandler,
    validateShape(subjectId, effect) {
      validationCount += 1;
      return originalHandler.validateShape(subjectId, effect);
    },
  });

  try {
    const result = executeEffect(
      state,
      player,
      { effectId: "add_power", amount: 2 },
      fixtureSource(player.playerId, "combat")
    );

    assert.deepEqual(result, { ok: true });
    assert.equal(validationCount, 1);
  } finally {
    restore();
  }
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
    },
    fixtureSource(player.playerId, "combat")
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /unavailable in combat mode/);
  assert.equal(state.turn.power, 0);
});

test("general execution decodes before runtime-mode applicability", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 11611 });
  const player = state.players[0];
  assert.ok(player);

  const result = executeEffect(
    state,
    player,
    {
      effectId: "fixture_add_power_equal_to_target_cost",
      unexpected: true,
    },
    fixtureSource(player.playerId, "combat")
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /unsupported field unexpected/);
});

test("general execution decodes before source-kind applicability", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 11612 });
  const player = state.players[0];
  assert.ok(player);

  const result = executeEffect(
    state,
    player,
    {
      effectId: "temporary_hand_limit_by_gained_card_type",
      timing: "activation",
      amount: 1,
      cardTypes: ["spell"],
    },
    fixtureSource(player.playerId, "combat", "card")
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /timing must be endTurn/);
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
    },
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
  assert.match(result.error, /unsupported source kind/);
});

test("ongoing controlled power is limited to card sources", () => {
  const effect = {
    effectId: "ongoing_add_power",
    timing: "whileControlled",
    amount: 1,
  } as const;

  assert.equal(
    resolveEffectRuntimeCatalogEntry(
      "Fixture card",
      effect.effectId,
      effect,
      "combat",
      "card"
    ).ok,
    true
  );

  for (const sourceKind of ["wizardProperty", "deadWizardToken"] as const) {
    const result = resolveEffectRuntimeCatalogEntry(
      `Fixture ${sourceKind}`,
      effect.effectId,
      effect,
      "combat",
      sourceKind
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.errors[0] ?? "", /token-only effect id/);
    }
  }
});

test("DWT-count ongoing power is limited to card sources", () => {
  const effect = {
    effectId: "ongoing_add_power_per_dead_wizard_token",
    timing: "whileControlled",
    amount: 1,
  } as const;

  assert.equal(
    resolveEffectRuntimeCatalogEntry(
      "Fixture card",
      effect.effectId,
      effect,
      "combat",
      "card"
    ).ok,
    true
  );

  for (const sourceKind of ["wizardProperty", "deadWizardToken"] as const) {
    const result = resolveEffectRuntimeCatalogEntry(
      `Fixture ${sourceKind}`,
      effect.effectId,
      effect,
      "combat",
      sourceKind
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.errors[0] ?? "", /token-only effect id/);
    }
  }
});

test("ongoing hand refill bonus is limited to card sources", () => {
  const effect = {
    effectId: "ongoing_hand_refill_bonus",
    timing: "endTurn",
    amount: 1,
  } as const;

  assert.equal(
    resolveEffectRuntimeCatalogEntry(
      "Fixture card",
      effect.effectId,
      effect,
      "combat",
      "card"
    ).ok,
    true
  );

  for (const sourceKind of ["wizardProperty", "deadWizardToken"] as const) {
    const result = resolveEffectRuntimeCatalogEntry(
      `Fixture ${sourceKind}`,
      effect.effectId,
      effect,
      "combat",
      sourceKind
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.errors[0] ?? "", /token-only effect id/);
    }
  }
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
  assert.match(result.error, /amount must be a positive integer/);
  assert.equal(state.turn.power, 0);
});

test("timed effect with invalid shape is rejected before its handler", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 11606 });
  const player = state.players[0];
  assert.ok(player);
  const originalHandler = getEffectRuntimeHandler(
    "fixture_modify_effective_value"
  );
  let handlerCalled = false;
  const restore = replaceEffectRuntimeHandlerForTesting(
    "fixture_modify_effective_value",
    {
      ...originalHandler,
      execute(...args) {
        handlerCalled = true;
        return originalHandler.execute(...args);
      },
    }
  );

  try {
    const result = executeEffect(
      state,
      player,
      {
        effectId: "fixture_modify_effective_value",
        timing: "onPlay",
        valueKind: "unknown",
        operation: "add",
        amount: "invalid",
        target: { targetType: "player" },
      },
      fixtureSource(player.playerId, "fixture")
    );

    assert.equal(result.ok, false);
    assert.match(result.error, /timing must be one of whileControlled, whileScoring/);
    assert.equal(handlerCalled, false);
  } finally {
    restore();
  }
});

test("public Mayhem execution resolves a timed effect deterministically", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 11607 });
  const player = state.players[0];
  assert.ok(player);
  const definition: CardDefinition = {
    schemaVersion: 1,
    cardId: "fixture-mayhem-runtime",
    source: { image: "assets/cards/fixtures/fixture-mayhem-runtime.png" },
    visible: {
      nameRu: "Fixture Mayhem",
      cost: 0,
      victoryPoints: 0,
      typeRu: null,
      cardKind: "mayhem",
      cardTypes: [],
      markers: [],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind: "mayhem",
      cardTypes: [],
      cost: 0,
      victoryPoints: 0,
      isOngoing: false,
      marketChipMarker: false,
      effects: [
        { effectId: "add_power", timing: "onMayhemResolve", amount: 2 },
      ],
      unsupportedMechanics: [],
    },
  };

  const result = executeMayhemEffects(
    state,
    player,
    definition,
    fixtureSource(player.playerId, "combat")
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(state.turn.power, 2);
});
