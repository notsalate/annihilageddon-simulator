import assert from "node:assert/strict";
import test from "node:test";

import {
  dispatchControlledCardOperation,
  runControlledPowerMutation,
} from "../src/engine/trigger-dispatch.js";
import { ActionExecutionError } from "../src/engine/action-errors.js";
import { releaseTemporaryControls } from "../src/engine/control-ledger.js";
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

test("controlled-state mutation seam recalculates after control changes", () => {
  const scenario = createGameScenario({ rootDir, seed: 47309 });
  const controller = scenario.activePlayer;
  const owner = scenario.foes[0];
  assert.ok(owner);
  controller.permanents = [];
  scenario.state.turn.power = 0;
  scenario.state.turn.controlledPowerBonus = 0;

  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_add_power",
        timing: "whileControlled",
        amount: 1,
      },
    ],
  });

  const controlledCard = givenRuntimeCard(scenario, {
    player: owner,
    zone: "discard",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_add_power",
        timing: "whileControlled",
        amount: 3,
      },
    ],
  });

  let dispatchCount = 0;
  const result = withTemporaryEffectRuntimeOperations(
    "ongoing_add_power",
    {
      evaluateControlledPower(effect) {
        dispatchCount += 1;
        return { status: "resolved", result: effect.amount };
      },
    },
    () =>
      runControlledPowerMutation(scenario.state, controller.playerId, () => {
        givenTemporaryControl(scenario, controlledCard, controller);
        return "control-updated";
      })
  );

  assert.deepEqual(result, { ok: true, value: "control-updated" });
  assert.equal(dispatchCount, 2);
  assert.equal(scenario.state.turn.power, 4);
  assert.equal(scenario.state.turn.controlledPowerBonus, 4);

  const releaseResult = withTemporaryEffectRuntimeOperations(
    "ongoing_add_power",
    {
      evaluateControlledPower(effect) {
        dispatchCount += 1;
        return { status: "resolved", result: effect.amount };
      },
    },
    () =>
      runControlledPowerMutation(scenario.state, controller.playerId, () => {
        releaseTemporaryControls(scenario.state);
        return "control-released";
      })
  );

  assert.deepEqual(releaseResult, { ok: true, value: "control-released" });
  assert.equal(dispatchCount, 3);
  assert.equal(scenario.state.turn.power, 1);
  assert.equal(scenario.state.turn.controlledPowerBonus, 1);
});

test("controlled-state mutation seam does not recalculate after an expected failure", () => {
  const scenario = createGameScenario({ rootDir, seed: 47310 });
  const controller = scenario.activePlayer;
  scenario.state.turn.power = 7;
  scenario.state.turn.controlledPowerBonus = 2;
  const powerBeforeFailure = scenario.state.turn.power;
  const bonusBeforeFailure = scenario.state.turn.controlledPowerBonus;

  assert.throws(
    () =>
      runControlledPowerMutation(scenario.state, controller.playerId, () => {
        throw new Error("expected mutation failure");
      }),
    /expected mutation failure/
  );
  assert.equal(scenario.state.turn.power, powerBeforeFailure);
  assert.equal(scenario.state.turn.controlledPowerBonus, bonusBeforeFailure);
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
  givenUnverifiedOngoingCard(scenario, {
    effectId: "ongoing_add_power",
    timing: "whileControlled",
    amount: "invalid",
  } as unknown as RuntimeEffect);
  const powerBeforeMalformedDispatch = scenario.state.turn.power;
  const bonusBeforeMalformedDispatch = scenario.state.turn.controlledPowerBonus;
  assert.throws(
    () =>
      dispatchControlledCardOperation(scenario.state, controller, {
        kind: "recalculateControlledPower",
      }),
    /Runtime Effect ongoing_add_power must pass Runtime Data Intake/
  );
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

test("status mutation dispatches controlled power once and preserves late failure state", () => {
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
  const malformedControlledCard = givenUnverifiedOngoingCard(scenario, {
    effectId: "ongoing_add_power",
    timing: "whileControlled",
    amount: "invalid",
  } as unknown as RuntimeEffect);
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
  const handBeforeFailure = [...controller.hand];
  assert.throws(
    () => play(scenario, secondGainCard),
    (error: unknown) =>
      error instanceof ActionExecutionError &&
      error.message.includes(
        "Runtime Effect ongoing_add_power must pass Runtime Data Intake"
      )
  );

  assert.equal(controller.statuses.length, 1);
  assert.equal(controller.hand.length, handBeforeFailure.length - 1);
  assert.equal(controller.hand.includes(secondGainCard), false);
  assert.equal(scenario.state.turn.power, 5);
  assert.equal(scenario.state.turn.controlledPowerBonus, 5);
  assert.equal(controller.permanents.includes(malformedControlledCard), true);
  assert.equal(controller.playedThisTurn.includes(secondGainCard), true);
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

function givenUnverifiedOngoingCard(
  scenario: ReturnType<typeof createGameScenario>,
  effect: RuntimeEffect
) {
  const template = scenario.state.cardDefinitions.values().next().value;
  assert.ok(template);
  const cardId = `fixture-unverified-ongoing-${scenario.nextFixtureSequence}`;
  const definition = {
    ...template,
    cardId,
    visible: {
      ...template.visible,
      nameRu: cardId,
      markers: ["ongoing"],
    },
    engine: {
      ...template.engine,
      isOngoing: true,
      effects: [effect],
    },
  };
  scenario.state.cardDefinitions = new Map([
    ...scenario.state.cardDefinitions,
    [cardId, definition],
  ]);
  return givenRuntimeCard(scenario, {
    player: scenario.activePlayer,
    zone: "permanents",
    definitionId: cardId,
  });
}

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
