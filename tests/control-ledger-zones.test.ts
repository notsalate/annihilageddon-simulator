import assert from "node:assert/strict";
import test from "node:test";

import {
  forkGameState,
  initializeGame,
  type CardInstance,
} from "../src/index.js";
import {
  findCardLocation,
  listPhysicalCardLocations,
  listPhysicalCardZoneDescriptors,
  removeCardFromLocation,
  registerPhysicalCardZoneDescriptorFactory,
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

test("Ledger rejects a side-effectful duplicate extension descriptor before changing state", () => {
  const state = initializeGame({ rootDir, seed: 47602 });
  const player = state.players[0]!;
  const cardsBefore = [...player.hand];
  const duplicateFactory = Object.assign(
    (candidate: Pick<typeof state, "players" | "common">) => {
      candidate.players[0]!.hand = [];
      return {
        zoneName: `${candidate.players[0]!.playerId}.hand`,
        cardinality: "many" as const,
        scoringEligible: false,
        read: () => candidate.players[0]!.hand,
        replace: (cards: readonly CardInstance[]) => {
          candidate.players[0]!.hand = [...cards];
        },
      };
    },
    {
      identity: "fixture.duplicate-hand",
      zoneName: `${player.playerId}.hand`,
    }
  );

  assert.throws(
    () => registerPhysicalCardZoneDescriptorFactory(state, duplicateFactory),
    /Duplicate physical card zone descriptor/
  );
  assert.deepEqual(player.hand, cardsBefore);

  const fork = forkGameState(state);
  assert.deepEqual(fork.players[0]!.hand, cardsBefore);
  assert.notEqual(fork.players[0]!.hand, player.hand);
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
