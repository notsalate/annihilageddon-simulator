import assert from "node:assert/strict";
import test from "node:test";

import {
  forkGameState,
  initializeGame,
  type CardInstance,
} from "../src/index.js";
import {
  clonePhysicalCardLedger,
  getPhysicalCardLedger,
  listDefenseCardLocations,
  listPhysicalCardLocations,
  listPhysicalCardZoneDescriptors,
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
  const ledger = getPhysicalCardLedger(state);

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
    ledger.replaceZone(descriptor.zoneName, []);
  }

  const cardsByZone = new Map<string, CardInstance>();
  for (const [index, descriptor] of descriptors.entries()) {
    const card = createCard(
      String(index),
      descriptor.expectedOwnerId ?? firstPlayer.playerId
    );
    ledger.replaceZone(descriptor.zoneName, [card]);
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
    assert.deepEqual(ledger.locateCard(card), {
      card,
      zoneName: descriptor.zoneName,
    });

    const before = snapshotZoneMembership(state);
    const removed = ledger.removeCard(card, descriptor.zoneName);
    assert.deepEqual(removed, {
      ok: true,
      card,
      sourceZoneName: descriptor.zoneName,
    });
    assert.equal(ledger.locateCard(card), undefined);

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

  assert.equal(ledger.resolveCardLocation("missing-card"), undefined);
});

test("familiar physical card descriptor supports multiple cards", () => {
  const state = initializeGame({ rootDir, seed: 47601 });
  const player = state.players[0];
  assert.ok(player);
  const descriptor = listPhysicalCardZoneDescriptors(state).find(
    (candidate) => candidate.zoneName === `${player.playerId}.unboughtFamiliars`
  );
  assert.ok(descriptor);
  assert.equal(descriptor.cardinality, "many");
  const ledger = getPhysicalCardLedger(state);

  const first = createCard("singleton-first", player.playerId);
  const second = createCard("singleton-second", player.playerId);

  ledger.replaceZone(descriptor.zoneName, []);
  assert.deepEqual(player.unboughtFamiliars, []);
  assert.deepEqual(descriptor.read(), []);

  ledger.replaceZone(descriptor.zoneName, [first]);
  assert.deepEqual(player.unboughtFamiliars, [first]);
  assert.deepEqual(descriptor.read(), [first]);

  ledger.replaceZone(descriptor.zoneName, [first, second]);
  assert.deepEqual(player.unboughtFamiliars, [first, second]);

  ledger.replaceZone(descriptor.zoneName, []);
  assert.deepEqual(player.unboughtFamiliars, []);
  ledger.replaceZone(descriptor.zoneName, [second]);
  assert.deepEqual(player.unboughtFamiliars, [second]);
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

test("built-in card movement appends to the multi-card familiar zone", () => {
  const state = initializeGame({ rootDir, seed: 47608 });
  const player = state.players[0]!;
  const sourceCard = createCard("move-source", player.playerId);
  const destinationCard = createCard("move-destination", player.playerId);
  player.hand = [sourceCard];
  player.unboughtFamiliars = [destinationCard];

  const result = getPhysicalCardLedger(state).moveCard(
    sourceCard,
    `${player.playerId}.unboughtFamiliars`,
    "back"
  );

  assert.deepEqual(result, {
    ok: true,
    move: {
      card: sourceCard,
      sourceZoneName: `${player.playerId}.hand`,
      destinationZoneName: `${player.playerId}.unboughtFamiliars`,
    },
  });
  assert.deepEqual(player.hand, []);
  assert.deepEqual(player.unboughtFamiliars, [destinationCard, sourceCard]);
});

test("Ledger rejects duplicate objects and preserves the source on wrong-zone removal", () => {
  const state = initializeGame({ rootDir, seed: 47609 });
  const player = state.players[0]!;
  const ledger = getPhysicalCardLedger(state);
  const handZone = `${player.playerId}.hand`;
  const discardZone = `${player.playerId}.discard`;
  const card = ledger.readZone(handZone)[0];
  assert.ok(card);
  const handBefore = [...ledger.readZone(handZone)];

  assert.throws(
    () => ledger.replaceZone(handZone, [card, card]),
    /Duplicate physical card object/
  );
  assert.deepEqual(ledger.readZone(handZone), handBefore);

  const removed = ledger.removeCard(card, discardZone);
  assert.deepEqual(removed, {
    ok: false,
    reason: `Missing card ${card.instanceId} in ${discardZone}`,
  });
  assert.deepEqual(ledger.readZone(handZone), handBefore);
});

test("Ledger rejects adding a card already registered in another zone", () => {
  const state = initializeGame({ rootDir, seed: 47612 });
  const player = state.players[0]!;
  const ledger = getPhysicalCardLedger(state);
  const handZone = `${player.playerId}.hand`;
  const discardZone = `${player.playerId}.discard`;
  const card = ledger.readZone(handZone)[0];
  assert.ok(card);
  const discardBefore = [...ledger.readZone(discardZone)];

  assert.throws(
    () => ledger.addCards(discardZone, [card]),
    /already belongs to .*hand/
  );
  assert.deepEqual(ledger.readZone(discardZone), discardBefore);
  assert.equal(ledger.locateCard(card)?.zoneName, handZone);
});

test("Ledger prevents a card from crossing into another fork", () => {
  const state = initializeGame({ rootDir, seed: 47610 });
  const player = state.players[0]!;
  const card = getPhysicalCardLedger(state).readZone(
    `${player.playerId}.hand`
  )[0];
  assert.ok(card);

  const fork = forkGameState(state);
  assert.throws(
    () =>
      getPhysicalCardLedger(fork).insertDetachedCard(
        card,
        `${fork.players[0]!.playerId}.hand`,
        "back"
      ),
    /belongs to another Ledger branch/
  );
});

test("Ledger clone carries membership metadata for eager fork installation", () => {
  const state = initializeGame({ rootDir, seed: 47611 });
  const clone = clonePhysicalCardLedger(state);
  const physicalCards = listPhysicalCardLocations(state).map(
    (location) => location.card
  );

  assert.equal(clone.physicalCards.length, physicalCards.length);
  assert.deepEqual(
    clone.physicalCardZoneNames,
    listPhysicalCardLocations(state).map((location) => location.zoneName)
  );
  assert.ok(
    clone.physicalCards.every((clonedCard) =>
      physicalCards.some(
        (sourceCard) =>
          sourceCard !== clonedCard &&
          sourceCard.instanceId === clonedCard.instanceId
      )
    )
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
