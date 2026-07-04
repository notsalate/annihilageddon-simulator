import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  assertGameStateInvariants,
  initializeGame,
  listLegalActions,
  runSingleGame,
} from "../src/index.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

test("game state invariants accept setup state and a legal action transition", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });

  assert.doesNotThrow(() => assertGameStateInvariants(state));

  const action =
    listLegalActions(state).find(
      (candidate) => candidate.type === "playCard"
    ) ?? listLegalActions(state)[0];
  assert.ok(action);

  const result = applyAction(state, action);
  assert.equal(result.ok, true);
  assert.doesNotThrow(() => assertGameStateInvariants(state));
});

test("game state invariants reject duplicate card instance ids", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const player = state.players[0];
  assert.ok(player);
  const card = player.hand[0];
  assert.ok(card);

  player.discard.push({
    ...card,
  });

  assert.throws(
    () => assertGameStateInvariants(state),
    /appears in multiple zones/
  );
});

test("game state invariants reject the same card instance in two zones", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const player = state.players[0];
  assert.ok(player);
  const card = player.hand[0];
  assert.ok(card);

  player.discard.push(card);

  assert.throws(
    () => assertGameStateInvariants(state),
    /appears in multiple zones/
  );
});

test("game state invariants reject a missing active player", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });

  state.activePlayerId = "player-99";

  assert.throws(
    () => assertGameStateInvariants(state),
    /activePlayerId player-99 does not exist/
  );
});

test("game state invariants reject duplicate token presence across owners and zones", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const player = state.players[0];
  assert.ok(player);
  assert.equal(state.common.deadWizardTokens.status, "available");
  const token = state.common.deadWizardTokens.drawStack[0];
  assert.ok(token);

  token.ownerId = player.playerId;
  player.deadWizardTokens.push(token);

  assert.throws(
    () => assertGameStateInvariants(state),
    /must be owned by common|appears in multiple zones/
  );
});

test("single-game simulation can run invariant validation in opt-in mode", () => {
  assert.doesNotThrow(() =>
    runSingleGame({
      rootDir,
      dataPackPath: playableRuntimeDataPackPath,
      seed: 80809,
      maxTurns: 1,
      validateInvariants: true,
    })
  );
});
