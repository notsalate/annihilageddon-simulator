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
  type PhysicalCardZoneDescriptorFactory,
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

test("Ledger rejects duplicate extension metadata before calling factories or changing its registry", () => {
  const state = initializeGame({ rootDir, seed: 47602 });
  const player = state.players[0]!;
  const cardsBefore = [...player.hand];
  let factoryCalls = 0;
  const extensionCards: CardInstance[] = [];
  const registeredFactory = Object.assign(
    () => {
      factoryCalls += 1;
      return {
        cardinality: "many" as const,
        scoringEligible: false,
        read: () => extensionCards,
        replace: (cards: readonly CardInstance[]) => {
          extensionCards.splice(0, extensionCards.length, ...cards);
        },
      };
    },
    {
      identity: "fixture.registered-extension",
      zoneName: "fixture.extension",
    }
  );
  registerPhysicalCardZoneDescriptorFactory(state, registeredFactory);

  const duplicateZoneNameFactory = Object.assign(
    () => {
      factoryCalls += 1;
      player.hand = [];
      return {
        cardinality: "many" as const,
        scoringEligible: false,
        read: () => [],
        replace: () => undefined,
      };
    },
    { identity: "fixture.duplicate-zone", zoneName: "fixture.extension" }
  );
  const duplicateIdentityFactory = Object.assign(
    () => {
      factoryCalls += 1;
      player.hand = [];
      return {
        cardinality: "many" as const,
        scoringEligible: false,
        read: () => [],
        replace: () => undefined,
      };
    },
    { identity: "fixture.registered-extension", zoneName: "fixture.other-zone" }
  );

  assert.throws(
    () => registerPhysicalCardZoneDescriptorFactory(state, duplicateZoneNameFactory),
    /Duplicate physical card zone descriptor/
  );
  assert.throws(
    () => registerPhysicalCardZoneDescriptorFactory(state, duplicateIdentityFactory),
    /Duplicate physical card zone descriptor identity/
  );
  assert.equal(factoryCalls, 0);
  assert.deepEqual(player.hand, cardsBefore);
  assert.deepEqual(
    listPhysicalCardZoneDescriptors(state)
      .filter((descriptor) => descriptor.zoneName.startsWith("fixture."))
      .map((descriptor) => descriptor.zoneName),
    ["fixture.extension"]
  );
});

test("Ledger injects extension zone metadata instead of trusting a factory descriptor name", () => {
  const state = initializeGame({ rootDir, seed: 47603 });
  const player = state.players[0]!;
  const extensionCards: CardInstance[] = [];
  const factory: PhysicalCardZoneDescriptorFactory = Object.assign(
    () => {
      const descriptor = {
        cardinality: "many" as const,
        scoringEligible: false,
        read: () => extensionCards,
        replace: (cards: readonly CardInstance[]) => {
          extensionCards.splice(0, extensionCards.length, ...cards);
        },
      };
      Object.defineProperty(descriptor, "zoneName", {
        value: "malicious.runtime-zone",
      });
      return descriptor;
    },
    { identity: "fixture.malicious-name", zoneName: "fixture.safe-zone" }
  );
  registerPhysicalCardZoneDescriptorFactory(state, factory);

  const descriptor = listPhysicalCardZoneDescriptors(state).find(
    (candidate) => candidate.zoneName === "fixture.safe-zone"
  );
  assert.ok(descriptor);
  assert.equal(descriptor.zoneName, "fixture.safe-zone");
  descriptor.replace([createCard("safe-zone", player.playerId)]);
  assert.deepEqual(descriptor.read(), [createCard("safe-zone", player.playerId)]);
});

test("Ledger keeps registered extension metadata after factory properties change", () => {
  const state = initializeGame({ rootDir, seed: 47604 });
  const extensionCards: CardInstance[] = [];
  const factory: PhysicalCardZoneDescriptorFactory = Object.assign(
    () => ({
      cardinality: "many" as const,
      scoringEligible: false,
      read: () => extensionCards,
      replace: (cards: readonly CardInstance[]) => {
        extensionCards.splice(0, extensionCards.length, ...cards);
      },
    }),
    { identity: "fixture.original-identity", zoneName: "fixture.original-zone" }
  );
  registerPhysicalCardZoneDescriptorFactory(state, factory);
  Object.assign(factory, {
    identity: "fixture.changed-identity",
    zoneName: "fixture.changed-zone",
  });

  const duplicateIdentityFactory: PhysicalCardZoneDescriptorFactory = Object.assign(
    () => ({
      cardinality: "many" as const,
      scoringEligible: false,
      read: () => [],
      replace: () => undefined,
    }),
    { identity: "fixture.original-identity", zoneName: "fixture.other-zone" }
  );
  const duplicateZoneFactory: PhysicalCardZoneDescriptorFactory = Object.assign(
    () => ({
      cardinality: "many" as const,
      scoringEligible: false,
      read: () => [],
      replace: () => undefined,
    }),
    { identity: "fixture.other-identity", zoneName: "fixture.original-zone" }
  );

  assert.throws(
    () => registerPhysicalCardZoneDescriptorFactory(state, duplicateIdentityFactory),
    /Duplicate physical card zone descriptor identity fixture.original-identity/
  );
  assert.throws(
    () => registerPhysicalCardZoneDescriptorFactory(state, duplicateZoneFactory),
    /Duplicate physical card zone descriptor fixture.original-zone/
  );
  assert.deepEqual(
    listPhysicalCardZoneDescriptors(state)
      .filter((descriptor) => descriptor.zoneName.startsWith("fixture."))
      .map((descriptor) => descriptor.zoneName),
    ["fixture.original-zone"]
  );
  assert.deepEqual(
    listPhysicalCardZoneDescriptors(forkGameState(state))
      .filter((descriptor) => descriptor.zoneName.startsWith("fixture."))
      .map((descriptor) => descriptor.zoneName),
    ["fixture.original-zone"]
  );
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
