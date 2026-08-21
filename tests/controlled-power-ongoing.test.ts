import assert from "node:assert/strict";
import test from "node:test";

import { dispatchControlledCardOperation } from "../src/engine/trigger-dispatch.js";
import type { RuntimeEffect } from "../src/engine/runtime-effect.js";

import {
  createGameScenario,
  endTurn,
  givenRuntimeCard,
  givenTemporaryControl,
  play,
} from "./helpers/game-scenario.js";
import { withTemporaryEffectRuntimeOperations } from "./helpers/with-temporary-effect-runtime-operations.js";

const rootDir = process.cwd();

test("passive controlled power uses only controlled ongoing cards", () => {
  assert.equal(reconcilePowerScenario(false), 0);
  assert.equal(reconcilePowerScenario(true), 3);
});

test("status-controlled power uses the controller's Dingler status", () => {
  assert.equal(statusPowerScenario(false), 0);
  assert.equal(statusPowerScenario(true), 4);
});

test("DWT-controlled power uses the controller's token count", () => {
  const scenario = createGameScenario({ rootDir, seed: 47302 });
  const controller = scenario.activePlayer;
  scenario.state.turn.power = 0;
  scenario.state.turn.controlledPowerBonus = 0;
  controller.permanents = [];

  const tokenStack = scenario.state.common.deadWizardTokens;
  assert.equal(tokenStack.status, "available");
  const firstToken = tokenStack.drawStack.shift();
  const secondToken = tokenStack.drawStack.shift();
  assert.ok(firstToken);
  assert.ok(secondToken);
  controller.deadWizardTokens.push(firstToken, secondToken);
  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_add_power_per_dead_wizard_token",
        timing: "whileControlled",
        amount: 2,
      },
    ],
  });

  const result = dispatchControlledCardOperation(scenario.state, controller, {
    kind: "recalculateControlledPower",
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(scenario.state.turn.power, 4);
  assert.equal(scenario.state.turn.controlledPowerBonus, 4);
});

test("controlled-power dispatch is idempotent and rejects malformed payloads", () => {
  const scenario = createGameScenario({ rootDir, seed: 47303 });
  const controller = scenario.activePlayer;
  scenario.state.turn.power = 7;
  scenario.state.turn.controlledPowerBonus = 0;
  controller.permanents = [];
  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_add_power",
        timing: "whileControlled",
        amount: 3,
      },
    ],
  });

  assert.deepEqual(
    dispatchControlledCardOperation(scenario.state, controller, {
      kind: "recalculateControlledPower",
    }),
    { ok: true }
  );
  assert.deepEqual(
    dispatchControlledCardOperation(scenario.state, controller, {
      kind: "recalculateControlledPower",
    }),
    { ok: true }
  );
  assert.equal(scenario.state.turn.power, 10);
  assert.equal(scenario.state.turn.controlledPowerBonus, 3);

  controller.permanents = [];
  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_add_power",
        timing: "whileControlled",
        amount: "invalid",
      } as unknown as RuntimeEffect,
    ],
  });
  const powerBeforeMalformedDispatch = scenario.state.turn.power;
  const bonusBeforeMalformedDispatch = scenario.state.turn.controlledPowerBonus;
  const malformedResult = dispatchControlledCardOperation(
    scenario.state,
    controller,
    { kind: "recalculateControlledPower" }
  );

  assert.equal(malformedResult.ok, false);
  assert.equal(scenario.state.turn.power, powerBeforeMalformedDispatch);
  assert.equal(
    scenario.state.turn.controlledPowerBonus,
    bonusBeforeMalformedDispatch
  );
});

test("controlled-power dispatch ignores malformed non-ongoing controlled cards", () => {
  const scenario = createGameScenario({ rootDir, seed: 47308 });
  const controller = scenario.activePlayer;
  scenario.state.turn.power = 6;
  scenario.state.turn.controlledPowerBonus = 0;
  controller.permanents = [];
  controller.playedThisTurn = [];
  const nonOngoingCard = givenRuntimeCard(scenario, {
    player: controller,
    zone: "playedThisTurn",
    isOngoing: false,
    effects: [
      {
        effectId: "ongoing_add_power",
        timing: "whileControlled",
        amount: "invalid",
      } as unknown as RuntimeEffect,
    ],
  });
  givenTemporaryControl(scenario, nonOngoingCard, controller);

  const result = dispatchControlledCardOperation(scenario.state, controller, {
    kind: "recalculateControlledPower",
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(scenario.state.turn.power, 6);
  assert.equal(scenario.state.turn.controlledPowerBonus, 0);
});

test("status mutation dispatches controlled power once and preserves rollback", () => {
  const scenario = createGameScenario({ rootDir, seed: 47304 });
  const controller = scenario.activePlayer;
  controller.permanents = [];
  controller.hand = [];
  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "add_power_if_player_has_status",
        timing: "whileControlled",
        statusId: "dingler",
        amount: 5,
      },
    ],
  });
  const gainStatusCard = givenRuntimeCard(scenario, {
    player: controller,
    effects: [
      {
        effectId: "gain_status",
        timing: "onPlay",
        statusId: "dingler",
        target: { selector: "activePlayer" },
      },
    ],
  });

  let dispatchCount = 0;
  const success = withTemporaryEffectRuntimeOperations(
    "add_power_if_player_has_status",
    {
      evaluateControlledPower(effect) {
        dispatchCount += 1;
        return { status: "resolved", result: effect.amount };
      },
    },
    () => play(scenario, gainStatusCard)
  );
  assert.deepEqual(success, { ok: true });
  assert.equal(dispatchCount, 1);
  assert.equal(scenario.state.turn.power, 5);
  assert.equal(scenario.state.turn.controlledPowerBonus, 5);

  controller.permanents = [];
  controller.statuses = [];
  const malformedControlledCard = givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_add_power",
        timing: "whileControlled",
        amount: "invalid",
      } as unknown as RuntimeEffect,
    ],
  });
  const secondGainCard = givenRuntimeCard(scenario, {
    player: controller,
    effects: [
      {
        effectId: "gain_status",
        timing: "onPlay",
        statusId: "dingler",
        target: { selector: "activePlayer" },
      },
    ],
  });
  const handBeforeRollback = [...controller.hand];
  const rollbackResult = play(scenario, secondGainCard);

  assert.equal(rollbackResult.ok, false);
  assert.equal(controller.statuses.length, 0);
  assert.deepEqual(controller.hand, handBeforeRollback);
  assert.equal(scenario.state.turn.power, 5);
  assert.equal(scenario.state.turn.controlledPowerBonus, 5);
  assert.equal(controller.permanents.includes(malformedControlledCard), true);
});

test("turn transition recalculates the next active player's controlled power", () => {
  const scenario = createGameScenario({ rootDir, seed: 47305 });
  const currentPlayer = scenario.activePlayer;
  const nextPlayer = scenario.state.players.find(
    (player) => player.playerId !== currentPlayer.playerId
  );
  assert.ok(nextPlayer);
  currentPlayer.permanents = [];
  nextPlayer.permanents = [];
  givenRuntimeCard(scenario, {
    player: nextPlayer,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_add_power",
        timing: "whileControlled",
        amount: 2,
      },
    ],
  });

  const result = endTurn(scenario);

  assert.deepEqual(result, { ok: true });
  assert.equal(scenario.state.activePlayerId, nextPlayer.playerId);
  assert.equal(scenario.state.turn.power, 2);
  assert.equal(scenario.state.turn.controlledPowerBonus, 2);
});

function reconcilePowerScenario(isOngoing: boolean): number {
  const scenario = createGameScenario({
    rootDir,
    seed: isOngoing ? 47301 : 47300,
  });
  const controller = scenario.activePlayer;
  scenario.state.activePlayerId = controller.playerId;
  scenario.state.turn.power = 0;
  scenario.state.turn.controlledPowerBonus = 0;
  scenario.state.turn.temporaryCardControls = [];
  controller.permanents = [];
  controller.playedThisTurn = [];

  const card = givenRuntimeCard(scenario, {
    player: controller,
    zone: isOngoing ? "permanents" : "playedThisTurn",
    isOngoing,
    effects: [
      {
        effectId: "ongoing_add_power",
        timing: "whileControlled",
        amount: 3,
      },
    ],
  });
  if (!isOngoing) {
    givenTemporaryControl(scenario, card, controller);
  }

  const result = dispatchControlledCardOperation(scenario.state, controller, {
    kind: "recalculateControlledPower",
  });
  assert.deepEqual(result, { ok: true });
  return scenario.state.turn.power;
}

function statusPowerScenario(hasDingler: boolean): number {
  const scenario = createGameScenario({
    rootDir,
    seed: hasDingler ? 47307 : 47306,
  });
  const controller = scenario.activePlayer;
  scenario.state.turn.power = 0;
  scenario.state.turn.controlledPowerBonus = 0;
  controller.permanents = [];
  controller.statuses = [];
  if (hasDingler) {
    controller.statuses.push({
      instanceId: "fixture-dingler-status",
      statusId: "dingler",
      ownerId: controller.playerId,
      effects: [],
    });
  }
  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "add_power_if_player_has_status",
        timing: "whileControlled",
        statusId: "dingler",
        amount: 4,
      },
    ],
  });

  const result = dispatchControlledCardOperation(scenario.state, controller, {
    kind: "recalculateControlledPower",
  });
  assert.deepEqual(result, { ok: true });
  return scenario.state.turn.power;
}
