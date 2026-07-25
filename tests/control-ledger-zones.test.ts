import assert from "node:assert/strict";
import test from "node:test";

import { initializeGame, type CardInstance } from "../src/index.js";
import {
  findCardLocation,
  listPhysicalCardLocations,
  listPhysicalCardZoneDescriptors,
  removeCardFromLocation,
} from "../src/engine/control-ledger.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../src/domain/types.js";

const rootDir = process.cwd();
const playerZoneSuffixes = [
  "deck",
  "hand",
  "discard",
  "playedThisTurn",
  "permanents",
  "unboughtFamiliar",
] as const;
const commonZoneNames = [
  "mainMarket",
  "legendMarket",
  "mainDeck",
  "legendDeck",
  "wildMagicStack",
  "limpWandStack",
  "destroyedPile",
  "destroyedMayhem",
  "destroyedMegaMayhem",
] as const;
const commonOwnedZoneNames = new Set<string>(commonZoneNames.slice(0, 6));

const createCard = (
  suffix: string,
  ownerId: CardInstance["ownerId"]
): CardInstance => ({
  instanceId: markCardInstanceId(`fixture-physical-zone-${suffix}`),
  definitionId: markCardDefinitionId("esw2_dbg__starter_001"),
  ownerId,
  marketChips: 0,
});

test("Control Ledger describes every physical card zone in deterministic order", () => {
  const state = initializeGame({ rootDir, seed: 47600 });
  const firstPlayer = state.players[0];
  assert.ok(firstPlayer);

  const descriptors = listPhysicalCardZoneDescriptors(state);
  const expectedZoneNames = [
    ...state.players.flatMap((player) =>
      playerZoneSuffixes.map((suffix) => `${player.playerId}.${suffix}`)
    ),
    ...commonZoneNames,
  ];

  assert.equal(descriptors.length, state.players.length * 6 + 9);
  assert.deepEqual(
    descriptors.map((descriptor) => descriptor.zoneName),
    expectedZoneNames
  );

  for (const descriptor of descriptors) {
    const player = state.players.find((candidate) =>
      descriptor.zoneName.startsWith(`${candidate.playerId}.`)
    );
    const expectedOwnerId =
      player !== undefined &&
      ["deck", "hand", "discard", "unboughtFamiliar"].some((suffix) =>
        descriptor.zoneName.endsWith(`.${suffix}`)
      )
        ? player.playerId
        : commonOwnedZoneNames.has(descriptor.zoneName)
          ? "common"
          : undefined;

    assert.equal(
      descriptor.cardinality,
      descriptor.zoneName.endsWith(".unboughtFamiliar")
        ? "zeroOrOne"
        : "many"
    );
    assert.equal(descriptor.expectedOwnerId, expectedOwnerId);
    descriptor.replace([]);
  }

  const cardsByZone = new Map<string, CardInstance>();
  for (const [index, descriptor] of descriptors.entries()) {
    const card = createCard(
      String(index),
      descriptor.expectedOwnerId ?? firstPlayer.playerId
    );
    descriptor.replace([card]);
    assert.deepEqual(readStoredZone(state, descriptor.zoneName), [card]);
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
    (candidate) =>
      candidate.zoneName === `${player.playerId}.unboughtFamiliar`
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

function readStoredZone(
  state: ReturnType<typeof initializeGame>,
  zoneName: string
): readonly CardInstance[] {
  for (const player of state.players) {
    if (zoneName === `${player.playerId}.deck`) return player.deck;
    if (zoneName === `${player.playerId}.hand`) return player.hand;
    if (zoneName === `${player.playerId}.discard`) return player.discard;
    if (zoneName === `${player.playerId}.playedThisTurn`)
      return player.playedThisTurn;
    if (zoneName === `${player.playerId}.permanents`) return player.permanents;
    if (zoneName === `${player.playerId}.unboughtFamiliar`)
      return player.unboughtFamiliar === undefined
        ? []
        : [player.unboughtFamiliar];
  }

  switch (zoneName) {
    case "mainMarket":
      return state.common.market;
    case "legendMarket":
      return state.common.legendMarket;
    case "mainDeck":
      return state.common.mainDeck;
    case "legendDeck":
      return state.common.legendDeck;
    case "wildMagicStack":
      return state.common.wildMagicStack;
    case "limpWandStack":
      return state.common.limpWandStack;
    case "destroyedPile":
      return state.common.destroyedPile;
    case "destroyedMayhem":
      return state.common.destroyedMayhem;
    case "destroyedMegaMayhem":
      return state.common.destroyedMegaMayhem;
    default:
      throw new Error(`Unknown expected physical card zone ${zoneName}`);
  }
}
