import assert from "node:assert/strict";
import test from "node:test";

import { runMarketFlow } from "../src/index.js";
import { executeControlledCardOnPlayCardEffects } from "../src/engine/effect-runtime.js";

import {
  choosePlayerTargetForEffect,
  createGameScenario,
  givenRuntimeCard,
  givenTemporaryControl,
  play,
} from "./helpers/game-scenario.js";
import { withTemporaryEffectRuntimeOperations } from "./helpers/with-temporary-effect-runtime-operations.js";

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

test("attack returns an afterDamageDealt catalog error and stops later triggers", () => {
  const scenario = createGameScenario({ rootDir, seed: 47106 });
  const state = scenario.state;
  state.runtimeMode = "fixture";
  const attacker = scenario.activePlayer;
  const target = scenario.foes[0];
  assert.ok(target);
  attacker.permanents = [];
  attacker.life.current = 10;
  target.life.current = 20;

  givenRuntimeCard(scenario, {
    player: attacker,
    zone: "permanents",
    cardId: "fixture-after-damage-first",
    isOngoing: true,
    effects: [
      {
        effectId: "heal_equal_damage_dealt_on_own_turn",
        timing: "afterDamageDealt",
      },
    ],
  });
  givenRuntimeCard(scenario, {
    player: attacker,
    zone: "permanents",
    cardId: "fixture-after-damage-error",
    isOngoing: true,
    effects: [
      {
        effectId: "heal_equal_damage_dealt_on_own_turn",
        timing: "afterDamageDealt",
      },
    ],
  });
  givenRuntimeCard(scenario, {
    player: attacker,
    zone: "permanents",
    cardId: "fixture-after-damage-skipped",
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

  const executedDefinitionIds: string[] = [];
  const result = withTemporaryEffectRuntimeOperations(
    "heal_equal_damage_dealt_on_own_turn",
    {
      applyAfterDamageDealt(_effect, context) {
        executedDefinitionIds.push(context.source.definitionId);
        return context.source.definitionId === "fixture-after-damage-error"
          ? {
              status: "resolved",
              result: { ok: false, error: "after-damage failure" },
            }
          : { status: "resolved", result: { ok: true } };
      },
    },
    () => play(scenario, attack)
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /after-damage failure/);
  assert.equal(target.life.current, 18);
  assert.deepEqual(executedDefinitionIds, [
    "fixture-after-damage-first",
    "fixture-after-damage-error",
  ]);
});

test("attack returns an afterDamageDealt game end and stops later triggers", () => {
  const scenario = createGameScenario({ rootDir, seed: 47107 });
  const state = scenario.state;
  state.runtimeMode = "fixture";
  const attacker = scenario.activePlayer;
  const target = scenario.foes[0];
  assert.ok(target);
  attacker.permanents = [];
  target.life.current = 20;

  for (const cardId of [
    "fixture-after-damage-first",
    "fixture-after-damage-game-end",
    "fixture-after-damage-skipped",
  ]) {
    givenRuntimeCard(scenario, {
      player: attacker,
      zone: "permanents",
      cardId,
      isOngoing: true,
      effects: [
        {
          effectId: "heal_equal_damage_dealt_on_own_turn",
          timing: "afterDamageDealt",
        },
      ],
    });
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

  const executedDefinitionIds: string[] = [];
  const result = withTemporaryEffectRuntimeOperations(
    "heal_equal_damage_dealt_on_own_turn",
    {
      applyAfterDamageDealt(_effect, context) {
        executedDefinitionIds.push(context.source.definitionId);
        return {
          status: "resolved",
          result:
            context.source.definitionId === "fixture-after-damage-game-end"
              ? {
                  ok: true,
                  gameEnd: {
                    reason: "playerDefeated",
                    winnerPlayerId: attacker.playerId,
                  },
                }
              : { ok: true },
        };
      },
    },
    () => play(scenario, attack)
  );

  assert.deepEqual(result, {
    ok: true,
    gameEndReason: "playerDefeated",
    winnerPlayerId: attacker.playerId,
  });
  assert.equal(target.life.current, 18);
  assert.deepEqual(executedDefinitionIds, [
    "fixture-after-damage-first",
    "fixture-after-damage-game-end",
  ]);
});

test("deal_damage returns an afterDamageDealt error and stops later triggers", () => {
  const scenario = createGameScenario({ rootDir, seed: 47108 });
  const state = scenario.state;
  state.runtimeMode = "fixture";
  const attacker = scenario.activePlayer;
  const target = scenario.foes[0];
  assert.ok(target);
  attacker.permanents = [];
  target.life.current = 20;

  for (const cardId of [
    "fixture-deal-damage-first",
    "fixture-deal-damage-error",
    "fixture-deal-damage-skipped",
  ]) {
    givenRuntimeCard(scenario, {
      player: attacker,
      zone: "permanents",
      cardId,
      isOngoing: true,
      effects: [
        {
          effectId: "heal_equal_damage_dealt_on_own_turn",
          timing: "afterDamageDealt",
        },
      ],
    });
  }
  const damage = givenRuntimeCard(scenario, {
    player: attacker,
    effects: [
      {
        effectId: "deal_damage",
        timing: "onPlay",
        amount: 2,
        target: { selector: "opponentPlayer" },
      },
    ],
  });

  const executedDefinitionIds: string[] = [];
  const result = withTemporaryEffectRuntimeOperations(
    "heal_equal_damage_dealt_on_own_turn",
    {
      applyAfterDamageDealt(_effect, context) {
        executedDefinitionIds.push(context.source.definitionId);
        return {
          status: "resolved",
          result:
            context.source.definitionId === "fixture-deal-damage-error"
              ? { ok: false, error: "deal-damage after-damage failure" }
              : { ok: true },
        };
      },
    },
    () => play(scenario, damage)
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /deal-damage after-damage failure/);
  assert.equal(target.life.current, 18);
  assert.deepEqual(executedDefinitionIds, [
    "fixture-deal-damage-first",
    "fixture-deal-damage-error",
  ]);
});

test("Mayhem returns an afterDamageDealt game end and stops later targets", () => {
  const scenario = createGameScenario({
    rootDir,
    seed: 47109,
    playerCount: 3,
  });
  const state = scenario.state;
  state.runtimeMode = "fixture";
  const attacker = scenario.activePlayer;
  const [firstFoe, secondFoe] = scenario.foes;
  assert.ok(firstFoe);
  assert.ok(secondFoe);
  attacker.permanents = [];
  firstFoe.life.current = 20;
  secondFoe.life.current = 20;

  for (const cardId of [
    "fixture-mayhem-first",
    "fixture-mayhem-game-end",
    "fixture-mayhem-skipped",
  ]) {
    givenRuntimeCard(scenario, {
      player: attacker,
      zone: "permanents",
      cardId,
      isOngoing: true,
      effects: [
        {
          effectId: "heal_equal_damage_dealt_on_own_turn",
          timing: "afterDamageDealt",
        },
      ],
    });
  }
  const mayhem = givenRuntimeCard(scenario, {
    player: attacker,
    cardKind: "mayhem",
    effects: [
      {
        effectId: "mayhem_attack",
        timing: "onMayhemResolve",
        amount: 2,
        target: { selector: "allPlayers" },
      },
    ],
  });
  attacker.hand.splice(attacker.hand.indexOf(mayhem), 1);
  state.common.market.splice(
    0,
    state.common.market.length,
    ...state.common.market.slice(0, 4)
  );
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const executedDefinitionIds: string[] = [];
  const result = withTemporaryEffectRuntimeOperations(
    "heal_equal_damage_dealt_on_own_turn",
    {
      applyAfterDamageDealt(_effect, context) {
        executedDefinitionIds.push(context.source.definitionId);
        return {
          status: "resolved",
          result:
            context.source.definitionId === "fixture-mayhem-game-end"
              ? {
                  ok: true,
                  gameEnd: {
                    reason: "playerDefeated",
                    winnerPlayerId: attacker.playerId,
                  },
                }
              : { ok: true },
        };
      },
    },
    () => runMarketFlow(state, { mode: "turn" })
  );

  assert.deepEqual(result, {
    ok: true,
    gameEnd: {
      reason: "playerDefeated",
      winnerPlayerId: attacker.playerId,
    },
  });
  assert.equal(firstFoe.life.current, 18);
  assert.equal(secondFoe.life.current, 20);
  assert.deepEqual(executedDefinitionIds, [
    "fixture-mayhem-first",
    "fixture-mayhem-game-end",
  ]);
  assert.equal(
    state.eventLog.filter((event) => event.type === "effectDamageDealt").length,
    2
  );
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
