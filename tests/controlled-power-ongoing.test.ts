import assert from "node:assert/strict";
import test from "node:test";

import { reconcileActivePlayerControlledPower } from "../src/engine/controlled-power.js";

import {
  createGameScenario,
  givenRuntimeCard,
  givenTemporaryControl,
} from "./helpers/game-scenario.js";

const rootDir = process.cwd();

test("passive controlled power uses only controlled ongoing cards", () => {
  assert.equal(reconcilePowerScenario(false), 0);
  assert.equal(reconcilePowerScenario(true), 3);
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

  reconcileActivePlayerControlledPower(scenario.state);
  return scenario.state.turn.power;
}
