import assert from "node:assert/strict";
import test from "node:test";

import { initializeGame, type CardInstance } from "../src/index.js";
import {
  findCardLocation,
  removeCardFromLocation,
} from "../src/engine/control-ledger.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../src/domain/types.js";

const rootDir = process.cwd();

test("Control Ledger owns lookup and removal for player, common, and familiar zones", () => {
  const state = initializeGame({ rootDir, seed: 47600 });
  const player = state.players[0];
  assert.ok(player);

  const handCard = player.hand[0];
  assert.ok(handCard);
  const handLocation = removeCardFromLocation(state, handCard.instanceId);
  assert.ok(handLocation);
  assert.equal(handLocation.card, handCard);
  assert.equal(handLocation.zoneName, `${player.playerId}.hand`);
  assert.equal(findCardLocation(state, handCard.instanceId), undefined);

  const marketCard = state.common.market[0];
  assert.ok(marketCard);
  const marketLocation = removeCardFromLocation(state, marketCard.instanceId);
  assert.ok(marketLocation);
  assert.equal(marketLocation.card, marketCard);
  assert.equal(marketLocation.zoneName, "mainMarket");
  assert.equal(findCardLocation(state, marketCard.instanceId), undefined);

  const familiar: CardInstance = {
    instanceId: markCardInstanceId("fixture-control-ledger-familiar"),
    definitionId: markCardDefinitionId("esw2_dbg__starter_001"),
    ownerId: player.playerId,
    marketChips: 0,
  };
  player.unboughtFamiliar = familiar;
  const familiarLocation = removeCardFromLocation(state, familiar.instanceId);
  assert.ok(familiarLocation);
  assert.equal(familiarLocation.card, familiar);
  assert.equal(
    familiarLocation.zoneName,
    `${player.playerId}.unboughtFamiliar`
  );
  assert.equal(player.unboughtFamiliar, undefined);
  assert.equal(findCardLocation(state, familiar.instanceId), undefined);

  assert.equal(removeCardFromLocation(state, "missing-card"), undefined);
});
