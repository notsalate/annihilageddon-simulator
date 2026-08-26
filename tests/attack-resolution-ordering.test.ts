import assert from "node:assert/strict";
import test from "node:test";

import {
  initializeGame,
  type GameState,
  type PlayerState,
} from "../src/index.js";
import {
  resolvePlayerControlledAttack,
  type PlayerControlledAttackAdapters,
  type PlayerControlledAttackIntent,
} from "../src/engine/attack-resolution.js";
import type { EffectSourceContext } from "../src/engine/effect-runtime-registry.js";

import {
  choosePlayerTargetForEffect,
  createGameScenario,
  givenRuntimeCard,
  play,
} from "./helpers/game-scenario.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

test("runtime target choice is recorded before attack creation", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 43008,
  });
  const target = scenario.foes[0];
  assert.ok(target);
  target.hand = [];
  choosePlayerTargetForEffect(scenario, "attack_damage", target);
  const attack = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 2,
        targetSelector: "chosenFoe",
      },
    ],
  });

  assert.equal(play(scenario, attack).ok, true);

  const choiceIndex = scenario.state.eventLog.findIndex(
    (event) =>
      event.type === "effectChoiceSelected" &&
      event.effectId === "attack_damage" &&
      event.choiceKind === "playerTarget"
  );
  const attackCreatedIndex = scenario.state.eventLog.findIndex(
    (event) =>
      event.type === "attackCreated" && event.effectId === "attack_damage"
  );
  assert.notEqual(choiceIndex, -1);
  assert.notEqual(attackCreatedIndex, -1);
  assert.ok(choiceIndex < attackCreatedIndex);
  const attackCreated = scenario.state.eventLog[attackCreatedIndex];
  assert.ok(attackCreated?.type === "attackCreated");
  assert.equal(attackCreated.targetPlayerId, target.playerId);
});

test("an attack with no resolved targets does not create attack instrumentation", () => {
  const { state, attacker } = createAttackHarness(43009);
  const result = resolvePlayerControlledAttack(
    createRuntimeSelectedAttackIntent(state, attacker),
    createEarlyExitAdapters(() => ({ ok: true, players: [] }))
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(
    state.eventLog.some((event) => event.type === "attackCreated"),
    false
  );
});

test("a target-resolution error does not leave a phantom attack event", () => {
  const { state, attacker } = createAttackHarness(43010);
  const result = resolvePlayerControlledAttack(
    createRuntimeSelectedAttackIntent(state, attacker),
    createEarlyExitAdapters(() => ({
      ok: false,
      error: "fixture target resolution failed",
    }))
  );

  assert.deepEqual(result, {
    ok: false,
    error: "fixture target resolution failed",
  });
  assert.equal(
    state.eventLog.some((event) => event.type === "attackCreated"),
    false
  );
});

function createAttackHarness(seed: number): {
  state: GameState;
  attacker: PlayerState;
} {
  const state = initializeGame({ rootDir, seed, playerCount: 2 });
  state.eventLog.length = 0;
  const attacker = state.players[0];
  assert.ok(attacker);
  return { state, attacker };
}

function createRuntimeSelectedAttackIntent(
  state: GameState,
  attacker: PlayerState
): PlayerControlledAttackIntent {
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: state.runtimeMode,
    playerId: attacker.playerId,
    cardInstanceId: "fixture-attack-ordering-source",
    definitionId: "fixture-attack-ordering-source",
  };
  return {
    state,
    attackingPlayer: attacker,
    source,
    effectId: "attack_damage",
    unavoidable: false,
    targetPlan: {
      kind: "runtimeSelector",
      effect: {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 2,
        targetSelector: "chosenFoe",
      },
    },
    impact: {
      kind: "damage",
      baseAmount: 2,
      sourceOwnerModifierAmount: 0,
      onDamageDealt: [],
      onKill: [],
    },
  };
}

function createEarlyExitAdapters(
  resolveTargets: PlayerControlledAttackAdapters["resolveTargets"]
): PlayerControlledAttackAdapters {
  return {
    resolveTargets,
    resolveDefenseWindow() {
      return unreachable("resolveDefenseWindow");
    },
    dealAttackDamage() {
      return unreachable("dealAttackDamage");
    },
    executeOnHitEffect() {
      return unreachable("executeOnHitEffect");
    },
    executeOutcomeBranch() {
      return unreachable("executeOutcomeBranch");
    },
    applyAfterAttackDamage() {
      return unreachable("applyAfterAttackDamage");
    },
  };
}

function unreachable(operation: string): never {
  throw new Error(`${operation} must not run before targets are resolved`);
}
