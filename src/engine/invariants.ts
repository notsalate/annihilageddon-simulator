import type {
  CardInstance,
  CommonOwner,
  GameState,
  PlayerId,
  PlayerState,
  StatusInstance,
  TokenInstance,
  TrophyLikeInstance,
} from "./setup.js";

type CardZoneEntry = {
  card: CardInstance;
  zoneName: string;
  expectedOwnerId?: PlayerId | CommonOwner;
};

type TokenZoneEntry = {
  expectedOwnerId: PlayerId | CommonOwner;
  token: TokenInstance;
  zoneName: string;
};

type OwnedEntry = StatusInstance | TrophyLikeInstance;

export function assertGameStateInvariants(state: GameState): void {
  assertSafeInteger(state.seed, "seed");
  assertSafeInteger(state.turn.number, "turn.number");
  assertTrue(state.turn.number >= 1, "turn.number must be >= 1");
  assertSafeInteger(state.turn.power, "turn.power");
  assertTrue(state.turn.power >= 0, "turn.power must be >= 0");
  assertSafeInteger(
    state.turn.controlledPowerBonus,
    "turn.controlledPowerBonus"
  );
  assertUniqueStrings(
    state.turn.activatedCardIds,
    "turn.activatedCardIds contains duplicate card ids"
  );
  assertUniqueStrings(
    state.turn.gainedCardDefinitionIds,
    "turn.gainedCardDefinitionIds contains duplicate definition ids"
  );

  const activePlayerExists = state.players.some(
    (player) => player.playerId === state.activePlayerId
  );
  assertTrue(
    activePlayerExists,
    `activePlayerId ${state.activePlayerId} does not exist`
  );

  const cardLocations = new Map<string, string[]>();
  const tokenLocations = new Map<string, string[]>();

  for (const player of state.players) {
    assertPlayerInvariants(player);
    registerCardZones(cardLocations, getPlayerCardZones(player));
    registerTokenZones(tokenLocations, getPlayerTokenZones(player));
    assertOwnedEntries(
      player.statuses,
      player.playerId,
      `${player.playerId}.statuses`
    );
    assertOwnedEntries(
      player.trophyLikeObjects,
      player.playerId,
      `${player.playerId}.trophyLikeObjects`
    );
  }

  registerCardZones(cardLocations, getCommonCardZones(state));
  registerTokenZones(tokenLocations, getCommonTokenZones(state));

  assertSingleZoneMembership(cardLocations, "card");
  assertSingleZoneMembership(tokenLocations, "token");
}

function assertPlayerInvariants(player: PlayerState): void {
  assertSafeInteger(player.chips, `${player.playerId}.chips`);
  assertTrue(player.chips >= 0, `${player.playerId}.chips must be >= 0`);
  assertSafeInteger(player.life.current, `${player.playerId}.life.current`);
  assertSafeInteger(player.life.max, `${player.playerId}.life.max`);
  assertTrue(player.life.max >= 1, `${player.playerId}.life.max must be >= 1`);
  assertTrue(
    player.life.current >= 0,
    `${player.playerId}.life.current must be >= 0`
  );
  assertTrue(
    player.life.current <= player.life.max,
    `${player.playerId}.life.current must be <= life.max`
  );
}

function getPlayerCardZones(player: PlayerState): CardZoneEntry[] {
  const zones: CardZoneEntry[] = [];
  for (const [zoneName, zone] of [
    [`${player.playerId}.deck`, player.deck],
    [`${player.playerId}.hand`, player.hand],
    [`${player.playerId}.discard`, player.discard],
    [`${player.playerId}.playedThisTurn`, player.playedThisTurn],
    [`${player.playerId}.permanents`, player.permanents],
  ] as const) {
    for (const card of zone) {
      zones.push({ card, zoneName });
    }
  }

  if (player.unboughtFamiliar !== undefined) {
    zones.push({
      card: player.unboughtFamiliar,
      zoneName: `${player.playerId}.unboughtFamiliar`,
      expectedOwnerId: player.playerId,
    });
  }

  for (const card of [...player.deck, ...player.hand, ...player.discard]) {
    assertTrue(
      card.ownerId === player.playerId,
      `${card.instanceId} in ${player.playerId} hidden zones must be owned by ${player.playerId}`
    );
    assertNonNegativeMarketChips(card, `${player.playerId} hidden zone`);
  }

  for (const card of [...player.playedThisTurn, ...player.permanents]) {
    assertNonNegativeMarketChips(card, `${player.playerId} controlled zone`);
  }

  return zones;
}

function getCommonCardZones(state: GameState): CardZoneEntry[] {
  const zones: CardZoneEntry[] = [];
  for (const [zoneName, zone] of [
    ["mainMarket", state.common.market],
    ["legendMarket", state.common.legendMarket],
    ["mainDeck", state.common.mainDeck],
    ["legendDeck", state.common.legendDeck],
    ["wildMagicStack", state.common.wildMagicStack],
    ["limpWandStack", state.common.limpWandStack],
    ["destroyedPile", state.common.destroyedPile],
    ["destroyedMayhem", state.common.destroyedMayhem],
    ["destroyedMegaMayhem", state.common.destroyedMegaMayhem],
  ] as const) {
    for (const card of zone) {
      const expectedOwnerId =
        zoneName === "destroyedPile" ||
        zoneName === "destroyedMayhem" ||
        zoneName === "destroyedMegaMayhem"
          ? undefined
          : "common";
      if (expectedOwnerId === undefined) {
        zones.push({ card, zoneName });
      } else {
        zones.push({ card, zoneName, expectedOwnerId });
      }
      if (expectedOwnerId !== undefined) {
        assertTrue(
          card.ownerId === "common",
          `${card.instanceId} in ${zoneName} must be owned by common`
        );
      }
      assertNonNegativeMarketChips(card, zoneName);
    }
  }

  return zones;
}

function getPlayerTokenZones(player: PlayerState): TokenZoneEntry[] {
  return [
    ...player.deadWizardTokens.map((token) => ({
      token,
      zoneName: `${player.playerId}.deadWizardTokens`,
      expectedOwnerId: player.playerId,
    })),
    ...player.wizardProperties.map((token) => ({
      token,
      zoneName: `${player.playerId}.wizardProperties`,
      expectedOwnerId: player.playerId,
    })),
  ];
}

function getCommonTokenZones(state: GameState): TokenZoneEntry[] {
  if (state.common.deadWizardTokens.status !== "available") {
    return [];
  }

  return state.common.deadWizardTokens.drawStack.map((token) => ({
    token,
    zoneName: "common.deadWizardTokens.drawStack",
    expectedOwnerId: "common",
  }));
}

function assertOwnedEntries(
  entries: OwnedEntry[],
  expectedOwnerId: PlayerId,
  zoneName: string
): void {
  const seenIds = new Set<string>();
  for (const entry of entries) {
    assertTrue(
      entry.ownerId === expectedOwnerId,
      `${entry.instanceId} in ${zoneName} must be owned by ${expectedOwnerId}`
    );
    assertTrue(
      !seenIds.has(entry.instanceId),
      `${entry.instanceId} is duplicated in ${zoneName}`
    );
    seenIds.add(entry.instanceId);
  }
}

function registerCardZones(
  cardLocations: Map<string, string[]>,
  entries: CardZoneEntry[]
): void {
  for (const entry of entries) {
    if (entry.expectedOwnerId !== undefined) {
      assertTrue(
        entry.card.ownerId === entry.expectedOwnerId,
        `${entry.card.instanceId} in ${entry.zoneName} must be owned by ${entry.expectedOwnerId}`
      );
    }

    const locations = cardLocations.get(entry.card.instanceId) ?? [];
    locations.push(entry.zoneName);
    cardLocations.set(entry.card.instanceId, locations);
  }
}

function registerTokenZones(
  tokenLocations: Map<string, string[]>,
  entries: TokenZoneEntry[]
): void {
  for (const entry of entries) {
    assertTrue(
      entry.token.ownerId === entry.expectedOwnerId,
      `${entry.token.instanceId} in ${entry.zoneName} must be owned by ${entry.expectedOwnerId}`
    );
    const locations = tokenLocations.get(entry.token.instanceId) ?? [];
    locations.push(entry.zoneName);
    tokenLocations.set(entry.token.instanceId, locations);
  }
}

function assertSingleZoneMembership(
  locationsByInstanceId: Map<string, string[]>,
  label: "card" | "token"
): void {
  for (const [instanceId, locations] of locationsByInstanceId) {
    assertTrue(
      locations.length === 1,
      `${label} ${instanceId} appears in multiple zones: ${locations.join(", ")}`
    );
  }
}

function assertNonNegativeMarketChips(
  card: CardInstance,
  zoneName: string
): void {
  assertSafeInteger(card.marketChips, `${card.instanceId}.marketChips`);
  assertTrue(
    card.marketChips >= 0,
    `${card.instanceId} in ${zoneName} must have marketChips >= 0`
  );
}

function assertUniqueStrings(values: readonly string[], message: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    assertTrue(!seen.has(value), message);
    seen.add(value);
  }
}

function assertSafeInteger(value: number, fieldName: string): void {
  assertTrue(
    Number.isSafeInteger(value),
    `${fieldName} must be a safe integer`
  );
}

function assertTrue(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
