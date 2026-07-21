import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseEffect,
  createGameScenario,
  endTurn,
  givenRuntimeCard,
  play,
} from "./game-scenario.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

test("game scenario setup and generated card identities are deterministic", () => {
  const first = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 24001,
  });
  const second = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 24001,
  });

  assert.equal(first.activePlayer.playerId, second.activePlayer.playerId);
  assert.deepEqual(
    first.activePlayer.hand.map((card) => card.definitionId),
    second.activePlayer.hand.map((card) => card.definitionId)
  );

  const firstCard = givenRuntimeCard(first, {
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 2 }],
  });
  const secondCard = givenRuntimeCard(second, {
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 2 }],
  });

  assert.equal(firstCard.instanceId, secondCard.instanceId);
  assert.equal(firstCard.definitionId, secondCard.definitionId);

  chooseEffect(first, () => undefined);
  assert.ok(first.state.effectChoiceStrategy);
  assert.equal(play(first, firstCard).ok, true);
  assert.equal(first.state.turn.power, 2);

  const activePlayerId = first.activePlayer.playerId;
  assert.equal(endTurn(first).ok, true);
  assert.notEqual(first.activePlayer.playerId, activePlayerId);
});
