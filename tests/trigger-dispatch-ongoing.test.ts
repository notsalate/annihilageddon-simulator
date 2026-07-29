import assert from "node:assert/strict";
import test from "node:test";

import { executeControlledCardOnPlayCardEffects } from "../src/engine/effect-runtime.js";

import {
  choosePlayerTargetForEffect,
  createGameScenario,
  givenRuntimeCard,
  givenTemporaryControl,
  play,
} from "./helpers/game-scenario.js";

const rootDir = process.cwd();

test("onPlayCard executes only controlled ongoing card triggers", () => {
  assert.equal(runOnPlayCardScenario(false), 0);
  assert.equal(runOnPlayCardScenario(true), 1);
});

test("after-attack dispatch executes only controlled ongoing card triggers", () => {
  assert.equal(runAfterAttackScenario(false), 0);
  assert.equal(runAfterAttackScenario(true), 2);
});

test("afterDamageDealt ignores a controlled non-ongoing trigger", () => {
  const scenario = createGameScenario({ rootDir, seed: 47104 });
  const state = scenario.state;
  state.runtimeMode = "fixture";
  const attacker = scenario.activePlayer;
  const target = scenario.foes[0];
  assert.ok(target);
  attacker.permanents = [];
  attacker.playedThisTurn = [];
  attacker.wizardProperties = [];
  state.turn.temporaryCardControls = [];
  state.turn.damagingAttackPlayerIds = [];
  attacker.life.current = 10;
  target.life.current = 20;

  const trigger = givenRuntimeCard(scenario, {
    player: attacker,
    zone: "playedThisTurn",
    isOngoing: false,
    effects: [
      {
        effectId: "heal_equal_damage_dealt_on_own_turn",
        timing: "afterDamageDealt",
      },
    ],
  });
  givenTemporaryControl(scenario, trigger, attacker);
  choosePlayerTargetForEffect(scenario, "attack_damage", target);
  const attack = givenRuntimeCard(scenario, {
    player: attacker,
    effects: [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 2,
        targetSelector: "chosenFoe",
      },
    ],
  });

  assert.deepEqual(play(scenario, attack), { ok: true });
  assert.equal(target.life.current, 18);
  assert.equal(attacker.life.current, 10);
});

test("afterDamageDealt executes a controlled ongoing trigger", () => {
  const scenario = createGameScenario({ rootDir, seed: 47105 });
  const state = scenario.state;
  state.runtimeMode = "fixture";
  const attacker = scenario.activePlayer;
  const target = scenario.foes[0];
  assert.ok(target);
  attacker.permanents = [];
  attacker.playedThisTurn = [];
  attacker.wizardProperties = [];
  state.turn.temporaryCardControls = [];
  state.turn.damagingAttackPlayerIds = [];
  attacker.life.current = 10;
  target.life.current = 20;

  givenRuntimeCard(scenario, {
    player: attacker,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "heal_equal_damage_dealt_on_own_turn",
        timing: "afterDamageDealt",
      },
    ],
  });
  choosePlayerTargetForEffect(scenario, "attack_damage", target);
  const attack = givenRuntimeCard(scenario, {
    player: attacker,
    effects: [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 2,
        targetSelector: "chosenFoe",
      },
    ],
  });

  assert.deepEqual(play(scenario, attack), { ok: true });
  assert.equal(target.life.current, 18);
  assert.equal(attacker.life.current, 12);
});

function runOnPlayCardScenario(isOngoing: boolean): number {
  const scenario = createGameScenario({
    rootDir,
    seed: isOngoing ? 47101 : 47100,
  });
  const state = scenario.state;
  state.runtimeMode = "fixture";
  const controller = scenario.activePlayer;
  controller.permanents = [];
  controller.playedThisTurn = [];
  state.turn.temporaryCardControls = [];
  state.turn.power = 0;

  const trigger = givenRuntimeCard(scenario, {
    player: controller,
    zone: isOngoing ? "permanents" : "playedThisTurn",
    isOngoing,
    effects: [
      {
        effectId: "ongoing_add_power_when_playing_wand",
        timing: "onPlayCard",
        amount: 1,
        cardTags: ["wandCard"],
      },
    ],
  });
  if (!isOngoing) {
    givenTemporaryControl(scenario, trigger, controller);
  }
  const playedWand = givenRuntimeCard(scenario, {
    player: controller,
    zone: "playedThisTurn",
    effects: [],
    isOngoing: false,
    tags: ["wandCard"],
  });

  const result = executeControlledCardOnPlayCardEffects(
    state,
    controller,
    playedWand
  );

  assert.deepEqual(result, { ok: true });
  return state.turn.power;
}

function runAfterAttackScenario(isOngoing: boolean): number {
  const scenario = createGameScenario({
    rootDir,
    seed: isOngoing ? 47103 : 47102,
  });
  const state = scenario.state;
  state.runtimeMode = "fixture";
  const attacker = scenario.activePlayer;
  const target = scenario.foes[0];
  assert.ok(target);
  state.activePlayerId = attacker.playerId;
  state.turn.power = 0;
  state.turn.controlledPowerBonus = 0;
  state.turn.damagingAttackPlayerIds = [];
  state.turn.temporaryCardControls = [];
  attacker.permanents = [];
  attacker.playedThisTurn = [];
  attacker.wizardProperties = [];
  target.hand = [];
  target.wizardProperties = [];
  target.life.current = 20;

  const trigger = givenRuntimeCard(scenario, {
    player: attacker,
    zone: isOngoing ? "permanents" : "playedThisTurn",
    isOngoing,
    effects: [
      {
        effectId: "ongoing_first_attack_damage_add_power",
        timing: "afterFirstAttackDamageEachTurn",
        amount: "totalDamageDealtByThatAttack",
      },
    ],
  });
  if (!isOngoing) {
    givenTemporaryControl(scenario, trigger, attacker);
  }
  choosePlayerTargetForEffect(scenario, "attack_damage", target);
  const attack = givenRuntimeCard(scenario, {
    player: attacker,
    effects: [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 2,
        targetSelector: "chosenFoe",
      },
    ],
  });

  const result = play(scenario, attack);

  assert.equal(result.ok, true);
  assert.equal(target.life.current, 18);
  return state.turn.power;
}
