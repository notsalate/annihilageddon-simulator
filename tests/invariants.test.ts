import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  assertGameStateInvariants,
  initializeGame,
  listLegalActions,
  runSingleGame,
} from "../src/index.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
  markPlayerId,
} from "../src/domain/types.js";

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

test("game state invariants accept repeated gained card definition ids", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });

  state.turn.gainedCards.push(
    {
      playerId: markPlayerId("player-1"),
      definitionId: markCardDefinitionId("repeated-definition-id"),
      cardInstanceId: markCardInstanceId("repeated-instance-1"),
    },
    {
      playerId: markPlayerId("player-1"),
      definitionId: markCardDefinitionId("repeated-definition-id"),
      cardInstanceId: markCardInstanceId("repeated-instance-2"),
    }
  );

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

test("game state invariants use descriptor owner metadata for player and common zones", () => {
  const playerState = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60616,
  });
  const player = playerState.players[0];
  assert.ok(player);
  const familiar = player.hand.shift();
  assert.ok(familiar);
  familiar.ownerId = "common";
  player.unboughtFamiliars = [familiar];

  assert.throws(
    () => assertGameStateInvariants(playerState),
    new RegExp(
      `${familiar.instanceId} in ${player.playerId}\\.unboughtFamiliars must be owned by ${player.playerId}`
    )
  );

  const commonState = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60617,
  });
  const commonPlayer = commonState.players[0];
  const mainDeckCard = commonState.common.mainDeck[0];
  assert.ok(commonPlayer);
  assert.ok(mainDeckCard);
  mainDeckCard.ownerId = commonPlayer.playerId;

  assert.throws(
    () => assertGameStateInvariants(commonState),
    new RegExp(`${mainDeckCard.instanceId} in mainDeck must be owned by common`)
  );
});

test("game state invariants validate market chips in destroyed card zones", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60618,
  });
  const card = state.common.market.shift();
  assert.ok(card);
  card.marketChips = -1;
  state.common.destroyedMayhem.push(card);

  assert.throws(
    () => assertGameStateInvariants(state),
    new RegExp(
      `${card.instanceId} in destroyedMayhem must have marketChips >= 0`
    )
  );
});

test("game state invariants detect duplicates across singleton, destroyed, and array zones", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60619,
  });
  const player = state.players[0];
  const card = player?.hand[0];
  assert.ok(player);
  assert.ok(card);

  player.unboughtFamiliars = [card];
  state.common.destroyedMegaMayhem.push(card);

  assert.throws(
    () => assertGameStateInvariants(state),
    new RegExp(
      `card ${card.instanceId} appears in multiple zones: ` +
        `${player.playerId}\\.hand, ${player.playerId}\\.unboughtFamiliars, destroyedMegaMayhem`
    )
  );
});

test("game state invariants reject a missing active player", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });

  state.activePlayerId = markPlayerId("player-99");

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

test("game state invariants reject stale temporary-control card references", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const controller = state.players[0];
  assert.ok(controller);

  state.turn.temporaryCardControls.push({
    cardInstanceId: markCardInstanceId("missing-controlled-card"),
    controllerId: controller.playerId,
  });

  assert.throws(
    () => assertGameStateInvariants(state),
    /temporary control references missing card missing-controlled-card/
  );
});

test("game state invariants reject temporary control by a missing player", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const card = state.players[0]?.hand[0];
  assert.ok(card);

  state.turn.temporaryCardControls.push({
    cardInstanceId: card.instanceId,
    controllerId: markPlayerId("player-99"),
  });

  assert.throws(
    () => assertGameStateInvariants(state),
    /temporary control references missing controller player-99/
  );
});

test("game state invariants reject duplicate temporary-control entries", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const controller = state.players[0];
  const card = controller?.hand[0];
  assert.ok(controller);
  assert.ok(card);

  state.turn.temporaryCardControls.push(
    { cardInstanceId: card.instanceId, controllerId: controller.playerId },
    { cardInstanceId: card.instanceId, controllerId: controller.playerId }
  );

  assert.throws(
    () => assertGameStateInvariants(state),
    /duplicate temporary control for/
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
