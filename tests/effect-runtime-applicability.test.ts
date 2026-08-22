import assert from "node:assert/strict";
import test from "node:test";

import { withTemporaryEffectRuntimeOperations } from "./helpers/with-temporary-effect-runtime-operations.js";
import { initializeGame, type CardInstance } from "../src/index.js";
import {
  executeEffect,
  executeMayhemEffects,
  getEffectExecutionError,
} from "../src/engine/effect-runtime.js";
import { isVerifiedRuntimeEffect } from "../src/engine/runtime-effect-verification.js";
import type { CardDefinition } from "../src/engine/data.js";
import { validateRuntimeEffectCatalogPayload } from "../src/engine/effect-runtime-registry.js";
import { verifiedTestRuntimeEffect } from "./helpers/verified-runtime-effect.js";
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
  const effect = verifiedTestRuntimeEffect({
    effectId: "add_power",
    timing: "onPlay",
    amount: 2,
  });
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

test("Runtime Data Intake marks resource effects as verified runtime effects", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 11600 });
  const resourceEffect = [
    ...[...state.cardDefinitions.values()].flatMap(
      (definition) => definition.engine.effects
    ),
    ...[...state.tokenDefinitions.values()].flatMap((definition) =>
      definition.kind === "deadWizardToken"
        ? definition.effects
        : (definition.engine?.effects ?? [])
    ),
  ].find((effect) => effect.effectId === "gain_chips");

  assert.ok(resourceEffect);
  assert.equal(isVerifiedRuntimeEffect(resourceEffect), true);
});

test("Runtime Data Intake marks non-resource families as verified runtime effects", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 11613 });
  const combatEffect = [...state.cardDefinitions.values()]
    .flatMap((definition) => definition.engine.effects)
    .find(
      (effect) =>
        effect.effectId === "add_power" || effect.effectId === "attack_damage"
    );

  assert.ok(combatEffect);
  assert.equal(isVerifiedRuntimeEffect(combatEffect), true);
});

test("typed resource Catalog keeps the verified payload identity", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 11607 });
  const player = state.players[0];
  assert.ok(player);
  const resourceEffect = [...state.tokenDefinitions.values()]
    .flatMap((definition) =>
      definition.kind === "deadWizardToken"
        ? definition.effects
        : (definition.engine?.effects ?? [])
    )
    .find((effect) => effect.effectId === "gain_chips");
  assert.ok(resourceEffect);

  let observedEffect: unknown;
  const result = withTemporaryEffectRuntimeOperations(
    "gain_chips",
    {
      execute(_state, _player, effect) {
        observedEffect = effect;
        return { ok: true };
      },
    },
    () =>
      executeEffect(state, player, resourceEffect, {
        sourceType: "wizardProperty",
        runtimeMode: state.runtimeMode,
        playerId: player.playerId,
        cardInstanceId: "fixture-resource-source",
        definitionId: "fixture-resource-source",
      })
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(observedEffect, resourceEffect);
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
    const choice = choices.find(
      (candidate) => candidate.choiceId === sourceOwner.playerId
    );
    return choice === undefined ? undefined : { choiceId: choice.choiceId };
  };

  const result = executeEffect(
    state,
    inactiveInitiator,
    verifiedTestRuntimeEffect({
      effectId: "attack_damage",
      timing: "onPlay",
      amount: 2,
      targetSelector: "chosenFoe",
    }),
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

test("executeEffect passes one concrete decoded payload to its handler", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 11608 });
  const player = state.players[0];
  assert.ok(player);
  const observedAmounts: number[] = [];

  const result = withTemporaryEffectRuntimeOperations(
    "add_power",
    {
      execute(_state, _player, effect) {
        observedAmounts.push(effect.amount);
        return { ok: true };
      },
    },
    () =>
      executeEffect(
        state,
        player,
        verifiedTestRuntimeEffect({
          effectId: "add_power",
          timing: "onPlay",
          amount: 2,
        }),
        fixtureSource(player.playerId, "combat")
      )
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(observedAmounts, [2]);
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
    verifiedTestRuntimeEffect({
      effectId: "fixture_add_power_equal_to_target_cost",
      timing: "onPlay",
      target: { selector: "mainMarketCard" },
    }),
    fixtureSource(player.playerId, "combat")
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /unavailable in combat mode/);
  assert.equal(state.turn.power, 0);
});

test("runtime-mode applicability uses the intake validation boundary", () => {
  const result = validateRuntimeEffectCatalogPayload(
    "Fixture effect",
    "fixture_add_power_equal_to_target_cost",
    {
      effectId: "fixture_add_power_equal_to_target_cost",
      unexpected: true,
    },
    "combat",
    "card"
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join("\n"), /unsupported field unexpected/);
});

test("timing applicability uses the intake validation boundary", () => {
  const result = validateRuntimeEffectCatalogPayload(
    "Temporary hand limit",
    "temporary_hand_limit_by_gained_card_type",
    {
      effectId: "temporary_hand_limit_by_gained_card_type",
      timing: "activation",
      amount: 1,
      cardTypes: ["spell"],
    },
    "combat",
    "card"
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join("\n"), /timing must be endTurn/);
});

test("fixture-only effect reaches its handler in fixture mode", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 11603 });
  const player = state.players[0];
  assert.ok(player);
  const result = executeEffect(
    state,
    player,
    verifiedTestRuntimeEffect({
      effectId: "fixture_add_power_equal_to_target_cost",
      timing: "onPlay",
      target: { selector: "mainMarketCard" },
    }),
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
    verifiedTestRuntimeEffect({
      effectId: "temporary_hand_limit_by_gained_card_type",
      timing: "endTurn",
      amount: 1,
      cardTypes: ["spell"],
    }),
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
    validateRuntimeEffectCatalogPayload(
      "Fixture card",
      effect.effectId,
      effect,
      "combat",
      "card"
    ).ok,
    true
  );

  for (const sourceKind of ["wizardProperty", "deadWizardToken"] as const) {
    const result = validateRuntimeEffectCatalogPayload(
      `Fixture ${sourceKind}`,
      effect.effectId,
      effect,
      "combat",
      sourceKind
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(
        result.errors[0] ?? "",
        sourceKind === "deadWizardToken"
          ? /deadWizardToken does not support effect id/
          : /token-only effect id/
      );
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
    validateRuntimeEffectCatalogPayload(
      "Fixture card",
      effect.effectId,
      effect,
      "combat",
      "card"
    ).ok,
    true
  );

  for (const sourceKind of ["wizardProperty", "deadWizardToken"] as const) {
    const result = validateRuntimeEffectCatalogPayload(
      `Fixture ${sourceKind}`,
      effect.effectId,
      effect,
      "combat",
      sourceKind
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(
        result.errors[0] ?? "",
        sourceKind === "deadWizardToken"
          ? /deadWizardToken does not support effect id/
          : /token-only effect id/
      );
    }
  }
});

test("dead wizard token validation rejects attack replacement effects without a consumer", () => {
  const effect = {
    effectId: "double_owned_attack_damage",
    timing: "attackReplacement",
  } as const;

  const result = validateRuntimeEffectCatalogPayload(
    "Fixture dead wizard token",
    effect.effectId,
    effect,
    "combat",
    "deadWizardToken"
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(
      result.errors[0] ?? "",
      /deadWizardToken does not support effect id double_owned_attack_damage/
    );
  }
});

test("ongoing hand refill bonus is limited to card sources", () => {
  const effect = {
    effectId: "ongoing_hand_refill_bonus",
    timing: "endTurn",
    amount: 1,
  } as const;

  assert.equal(
    validateRuntimeEffectCatalogPayload(
      "Fixture card",
      effect.effectId,
      effect,
      "combat",
      "card"
    ).ok,
    true
  );

  for (const sourceKind of ["wizardProperty", "deadWizardToken"] as const) {
    const result = validateRuntimeEffectCatalogPayload(
      `Fixture ${sourceKind}`,
      effect.effectId,
      effect,
      "combat",
      sourceKind
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(
        result.errors[0] ?? "",
        sourceKind === "deadWizardToken"
          ? /deadWizardToken does not support effect id/
          : /token-only effect id/
      );
    }
  }
});

test("known effect with invalid shape is rejected at intake", () => {
  const result = validateRuntimeEffectCatalogPayload(
    "Malformed add power",
    "add_power",
    { effectId: "add_power", amount: 0 },
    "combat",
    "card"
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join("\n"), /amount must be a positive integer/);
});

test("timed effect with invalid shape is rejected at intake", () => {
  const result = validateRuntimeEffectCatalogPayload(
    "Malformed effective value",
    "fixture_modify_effective_value",
    {
      effectId: "fixture_modify_effective_value",
      timing: "onPlay",
      valueKind: "unknown",
      operation: "add",
      amount: "invalid",
      target: { targetType: "player" },
    },
    "fixture",
    "card"
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(
    result.errors.join("\n"),
    /timing must be one of whileControlled, whileScoring/
  );
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
        verifiedTestRuntimeEffect({
          effectId: "add_power",
          timing: "onMayhemResolve",
          amount: 2,
        }),
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
