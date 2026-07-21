import assert from "node:assert/strict";
import test from "node:test";

import { forkGameState, initializeGame } from "../src/index.js";
import {
  buildControlledObjectView,
  cloneTemporaryControls,
  findCardLocation,
  getControlledCards,
  grantTemporaryControl,
  releaseTemporaryControls,
} from "../src/engine/control-ledger.js";
import { markCardInstanceId } from "../src/domain/types.js";

const rootDir = process.cwd();

test("Control Ledger resolves controlled cards across permanent, played, and owner discard zones", () => {
  const state = initializeGame({ rootDir, seed: 22001 });
  const controller = state.players[0];
  const owner = state.players[1];
  assert.ok(controller);
  assert.ok(owner);

  const permanent = controller.hand.shift();
  const played = controller.hand.shift();
  const ownerDiscard = owner.hand.shift();
  assert.ok(permanent);
  assert.ok(played);
  assert.ok(ownerDiscard);

  controller.permanents.push(permanent);
  controller.playedThisTurn.push(played);
  owner.discard.push(ownerDiscard);
  state.turn.temporaryCardControls.push(
    {
      cardInstanceId: played.instanceId,
      controllerId: controller.playerId,
    },
    {
      cardInstanceId: ownerDiscard.instanceId,
      controllerId: controller.playerId,
    },
    {
      cardInstanceId: markCardInstanceId("stale-control-reference"),
      controllerId: controller.playerId,
    }
  );

  assert.deepEqual(
    getControlledCards(state, controller).map((card) => card.instanceId),
    [permanent.instanceId, played.instanceId, ownerDiscard.instanceId]
  );
  assert.equal(
    findCardLocation(state, permanent.instanceId)?.zoneName,
    `${controller.playerId}.permanents`
  );
  assert.equal(
    findCardLocation(state, played.instanceId)?.zoneName,
    `${controller.playerId}.playedThisTurn`
  );
  assert.equal(
    findCardLocation(state, ownerDiscard.instanceId)?.zoneName,
    `${owner.playerId}.discard`
  );
  assert.equal(
    findCardLocation(state, markCardInstanceId("missing-card")),
    undefined
  );

  const view = buildControlledObjectView(state, controller.playerId);
  assert.deepEqual(
    view.cards.map(({ card }) => card.instanceId),
    [permanent.instanceId, played.instanceId, ownerDiscard.instanceId]
  );
  assert.deepEqual(
    view.cards.map(({ definition }) => definition.cardId),
    [permanent.definitionId, played.definitionId, ownerDiscard.definitionId]
  );
});

test("Control Ledger locates player singleton and common card zones", () => {
  const state = initializeGame({ rootDir, seed: 22002 });
  const player = state.players[0];
  assert.ok(player);
  const familiar = player.hand.shift();
  const marketCard = state.common.market[0];
  assert.ok(familiar);
  player.unboughtFamiliar = familiar;
  assert.ok(marketCard);

  assert.equal(
    findCardLocation(state, familiar.instanceId)?.zoneName,
    `${player.playerId}.unboughtFamiliar`
  );
  assert.equal(
    findCardLocation(state, marketCard.instanceId)?.zoneName,
    "mainMarket"
  );
});

test("temporary control lifecycle is idempotent, transferable, releasable, and fork-safe", () => {
  const state = initializeGame({ rootDir, seed: 22003 });
  const firstController = state.players[0];
  const secondController = state.players[1];
  assert.ok(firstController);
  assert.ok(secondController);
  const card = firstController.hand.shift();
  assert.ok(card);
  firstController.playedThisTurn.push(card);

  grantTemporaryControl(state, card.instanceId, firstController.playerId);
  grantTemporaryControl(state, card.instanceId, firstController.playerId);
  assert.deepEqual(state.turn.temporaryCardControls, [
    {
      cardInstanceId: card.instanceId,
      controllerId: firstController.playerId,
    },
  ]);

  grantTemporaryControl(state, card.instanceId, secondController.playerId);
  assert.deepEqual(state.turn.temporaryCardControls, [
    {
      cardInstanceId: card.instanceId,
      controllerId: secondController.playerId,
    },
  ]);
  assert.equal(
    getControlledCards(state, firstController).includes(card),
    false
  );
  assert.equal(
    getControlledCards(state, secondController).includes(card),
    true
  );

  const clonedControls = cloneTemporaryControls(
    state.turn.temporaryCardControls
  );
  clonedControls[0]!.controllerId = firstController.playerId;
  assert.equal(
    state.turn.temporaryCardControls[0]!.controllerId,
    secondController.playerId
  );

  const fork = forkGameState(state);
  releaseTemporaryControls(fork);
  assert.equal(fork.turn.temporaryCardControls.length, 0);
  assert.equal(state.turn.temporaryCardControls.length, 1);

  releaseTemporaryControls(state);
  assert.equal(state.turn.temporaryCardControls.length, 0);
  assert.equal(
    getControlledCards(state, secondController).includes(card),
    false
  );
});
