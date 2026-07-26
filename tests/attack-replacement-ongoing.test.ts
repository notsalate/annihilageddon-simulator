import assert from "node:assert/strict";
import test from "node:test";

import {
  createAttackAmountState,
  resolveAttackAmount,
} from "../src/engine/attack-resolution.js";
import { executeEffect } from "../src/engine/effect-runtime.js";

import {
  choosePlayerTargetForEffect,
  createGameScenario,
  givenRuntimeCard,
  givenTemporaryControl,
} from "./helpers/game-scenario.js";

const rootDir = process.cwd();

test("attack amount replacements use only controlled ongoing cards", () => {
  assert.equal(resolveDoubleAttackScenario(false), 2);
  assert.equal(resolveDoubleAttackScenario(true), 4);
});

test("owned Wand attack profile modifiers use only controlled ongoing cards", () => {
  assert.equal(resolveOwnedWandAttackScenario(false), 2);
  assert.equal(resolveOwnedWandAttackScenario(true), 4);
});

function resolveDoubleAttackScenario(isOngoing: boolean): number {
  const scenario = createGameScenario({
    rootDir,
    seed: isOngoing ? 47201 : 47200,
  });
  const attacker = scenario.activePlayer;
  const target = scenario.foes[0];
  assert.ok(target);
  attacker.permanents = [];
  attacker.playedThisTurn = [];
  scenario.state.turn.temporaryCardControls = [];

  const modifier = givenRuntimeCard(scenario, {
    player: attacker,
    zone: isOngoing ? "permanents" : "playedThisTurn",
    isOngoing,
    effects: [
      {
        effectId: "double_owned_attack_damage",
        timing: "attackReplacement",
      },
    ],
  });
  if (!isOngoing) {
    givenTemporaryControl(scenario, modifier, attacker);
  }

  return resolveAttackAmount(
    scenario.state,
    attacker,
    target,
    createAttackAmountState(2)
  ).total;
}

function resolveOwnedWandAttackScenario(isOngoing: boolean): number {
  const scenario = createGameScenario({
    rootDir,
    seed: isOngoing ? 47203 : 47202,
  });
  const state = scenario.state;
  state.runtimeMode = "fixture";
  const attacker = scenario.activePlayer;
  const target = scenario.foes[0];
  assert.ok(target);
  state.activePlayerId = attacker.playerId;
  state.turn.temporaryCardControls = [];
  attacker.permanents = [];
  attacker.playedThisTurn = [];
  attacker.wizardProperties = [];
  target.hand = [];
  target.wizardProperties = [];
  target.life.current = 20;

  const sourceCard = givenRuntimeCard(scenario, {
    player: attacker,
    zone: "hand",
    effects: [],
    isOngoing: false,
    tags: ["wandAttackCard"],
  });
  const modifier = givenRuntimeCard(scenario, {
    player: attacker,
    zone: isOngoing ? "permanents" : "playedThisTurn",
    isOngoing,
    effects: [
      {
        effectId: "modify_owned_wand_attack_damage",
        timing: "attackReplacement",
        cardTags: ["wandAttackCard"],
        amount: 2,
      },
    ],
  });
  if (!isOngoing) {
    givenTemporaryControl(scenario, modifier, attacker);
  }
  choosePlayerTargetForEffect(scenario, "attack_damage", target);

  const result = executeEffect(
    state,
    attacker,
    {
      effectId: "attack_damage",
      amount: 2,
      targetSelector: "chosenFoe",
    },
    {
      sourceType: "card",
      runtimeMode: "fixture",
      playerId: attacker.playerId,
      cardInstanceId: sourceCard.instanceId,
      definitionId: sourceCard.definitionId,
    }
  );

  assert.deepEqual(result, { ok: true });
  return 20 - target.life.current;
}
