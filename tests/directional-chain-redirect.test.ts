import assert from "node:assert/strict";
import test from "node:test";

import { addFixtureDefenseCardToHand } from "./helpers/defense-fixtures.js";
import {
  createGameScenario,
  givenRuntimeCard,
  play,
} from "./helpers/game-scenario.js";

const rootDir = process.cwd();

test("directional chain stops when the requested target redirects and survives", () => {
  const scenario = createGameScenario({ rootDir, seed: 43011, playerCount: 3 });
  const state = scenario.state;
  const firstPlayer = state.players[0];
  assert.ok(firstPlayer);
  state.activePlayerId = firstPlayer.playerId;

  const attacker = scenario.activePlayer;
  const [firstTarget, secondTarget] = scenario.foes;
  assert.ok(firstTarget);
  assert.ok(secondTarget);

  for (const player of state.players) {
    player.hand = [];
    player.wizardProperties = [];
  }
  attacker.life.current = 1;
  firstTarget.life.current = firstTarget.life.max;
  secondTarget.life.current = secondTarget.life.max;

  const redirectDefense = addFixtureDefenseCardToHand(
    state,
    firstTarget,
    "discardSelf",
    { redirectAttack: true }
  );
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId === "directional_chain_attack") {
      return choices.find(
        (choice) =>
          choice.choiceKind === "directionalPlayerTarget" &&
          choice.choiceId === "left"
      );
    }
    if (effectId === "avoid_attack") {
      return choices.find(
        (choice) =>
          choice.choiceKind === "defense" &&
          choice.targetCardInstanceId === redirectDefense.instanceId
      );
    }
    return undefined;
  };

  const attack = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "directional_chain_attack",
        timing: "onPlay",
        amount: 2,
        targetSelector: "leftOrRightFoe",
      },
    ],
  });
  const secondTargetLifeBefore = secondTarget.life.current;
  state.eventLog.length = 0;

  const result = play(scenario, attack);

  assert.deepEqual(result, { ok: true });
  assert.equal(firstTarget.life.current, firstTarget.life.max);
  assert.equal(secondTarget.life.current, secondTargetLifeBefore);
  assert.deepEqual(
    state.eventLog
      .filter(
        (event) =>
          event.type === "attackTargetStarted" &&
          event.effectId === "directional_chain_attack"
      )
      .map((event) => event.targetPlayerId),
    [firstTarget.playerId, attacker.playerId]
  );
});
