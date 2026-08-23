import assert from "node:assert/strict";
import test from "node:test";

import { initializeGame, type CardInstance } from "../src/index.js";
import {
  findCardLocation,
  listDefenseCardLocations,
  listPhysicalCardLocations,
  listPhysicalCardZoneDescriptors,
  movePhysicalCard,
  removeCardFromLocation,
} from "../src/engine/control-ledger.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../src/domain/types.js";

const rootDir = process.cwd();

const createCard = (
  suffix: string,
  ownerId: CardInstance["ownerId"]
): CardInstance => ({
  instanceId: markCardInstanceId(`fixture-physical-zone-${suffix}`),
  definitionId: markCardDefinitionId("esw2_dbg__starter_001"),
  ownerId,
  marketChips: 0,
});

test("Control Ledger describes its physical card inventory in deterministic order", () => {
  const state = initializeGame({ rootDir, seed: 47600 });
  const firstPlayer = state.players[0];
  assert.ok(firstPlayer);

  const descriptors = listPhysicalCardZoneDescriptors(state);
  assert.ok(descriptors.length > 0);
  assert.deepEqual(
    descriptors.map((descriptor) => descriptor.zoneName),
    listPhysicalCardZoneDescriptors(state).map(
      (descriptor) => descriptor.zoneName
    )
  );
  assert.equal(
    new Set(descriptors.map((descriptor) => descriptor.zoneName)).size,
    descriptors.length
  );

  for (const descriptor of descriptors) {
    assert.equal(
      descriptor.expectedOwnerId === undefined ||
        descriptor.expectedOwnerId === "common" ||
        state.players.some(
          (player) => player.playerId === descriptor.expectedOwnerId
        ),
      true
    );
    descriptor.replace([]);
  }

  const cardsByZone = new Map<string, CardInstance>();
  for (const [index, descriptor] of descriptors.entries()) {
    const card = createCard(
      String(index),
      descriptor.expectedOwnerId ?? firstPlayer.playerId
    );
    descriptor.replace([card]);
    assert.deepEqual(descriptor.read(), [card]);
    cardsByZone.set(descriptor.zoneName, card);
  }

  assert.deepEqual(
    listPhysicalCardLocations(state).map((location) => ({
      zoneName: location.zoneName,
      index: location.index,
      expectedOwnerId: location.expectedOwnerId,
      instanceId: location.card.instanceId,
    })),
    descriptors.map((descriptor) => ({
      zoneName: descriptor.zoneName,
      index: 0,
      expectedOwnerId: descriptor.expectedOwnerId,
      instanceId: cardsByZone.get(descriptor.zoneName)?.instanceId,
    }))
  );

  for (const descriptor of descriptors) {
    const card = cardsByZone.get(descriptor.zoneName);
    assert.ok(card);
    assert.deepEqual(findCardLocation(state, card.instanceId), {
      card,
      zoneName: descriptor.zoneName,
    });

    const before = snapshotZoneMembership(state);
    const removed = removeCardFromLocation(state, card.instanceId);
    assert.deepEqual(removed, { card, zoneName: descriptor.zoneName });
    assert.equal(findCardLocation(state, card.instanceId), undefined);

    const after = snapshotZoneMembership(state);
    for (const [zoneName, instanceIds] of before) {
      assert.deepEqual(
        after.get(zoneName),
        zoneName === descriptor.zoneName
          ? instanceIds.filter((instanceId) => instanceId !== card.instanceId)
          : instanceIds
      );
    }
  }

  assert.equal(removeCardFromLocation(state, "missing-card"), undefined);
});

test("singleton physical card descriptor enforces zero-or-one storage", () => {
  const state = initializeGame({ rootDir, seed: 47601 });
  const player = state.players[0];
  assert.ok(player);
  const descriptor = listPhysicalCardZoneDescriptors(state).find(
    (candidate) => candidate.zoneName === `${player.playerId}.unboughtFamiliar`
  );
  assert.ok(descriptor);
  assert.equal(descriptor.cardinality, "zeroOrOne");

  const first = createCard("singleton-first", player.playerId);
  const second = createCard("singleton-second", player.playerId);

  descriptor.replace([]);
  assert.equal(player.unboughtFamiliar, undefined);
  assert.deepEqual(descriptor.read(), []);

  descriptor.replace([first]);
  assert.equal(player.unboughtFamiliar, first);
  assert.deepEqual(descriptor.read(), [first]);

  assert.throws(
    () => descriptor.replace([first, second]),
    /accepts at most one card, received 2/
  );
  assert.equal(player.unboughtFamiliar, first);

  descriptor.replace([]);
  assert.equal(player.unboughtFamiliar, undefined);
  descriptor.replace([second]);
  assert.equal(player.unboughtFamiliar, second);
});

test("Ledger exposes only the built-in hand as a voluntary Defense source", () => {
  const state = initializeGame({ rootDir, seed: 47605 });
  const player = state.players[0]!;
  const handCard = createCard("defense-hand", player.playerId);
  const deckCard = createCard("defense-deck", player.playerId);
  const discardCard = createCard("defense-discard", player.playerId);
  player.hand = [handCard];
  player.deck = [deckCard];
  player.discard = [discardCard];

  assert.deepEqual(listDefenseCardLocations(state, player.playerId), [
    { card: handCard, zoneName: `${player.playerId}.hand` },
  ]);
});

test("built-in card movement rejects an occupied singleton before mutation", () => {
  const state = initializeGame({ rootDir, seed: 47608 });
  const player = state.players[0]!;
  const sourceCard = createCard("move-source", player.playerId);
  const destinationCard = createCard("move-destination", player.playerId);
  player.hand = [sourceCard];
  player.unboughtFamiliar = destinationCard;

  const result = movePhysicalCard(
    state,
    sourceCard.instanceId,
    `${player.playerId}.unboughtFamiliar`,
    "back"
  );

  assert.deepEqual(result, {
    ok: false,
    reason: `Destination zone ${player.playerId}.unboughtFamiliar is already occupied`,
  });
  assert.deepEqual(player.hand, [sourceCard]);
  assert.equal(player.unboughtFamiliar, destinationCard);
});

function snapshotZoneMembership(
  state: ReturnType<typeof initializeGame>
): ReadonlyMap<string, readonly CardInstance["instanceId"][]> {
  return new Map(
    listPhysicalCardZoneDescriptors(state).map((descriptor) => [
      descriptor.zoneName,
      descriptor.read().map((card) => card.instanceId),
    ])
  );
}
