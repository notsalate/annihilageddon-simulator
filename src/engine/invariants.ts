import { listPhysicalCardLocations } from "./control-ledger.js";
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
  const playerIds = new Set(state.players.map((player) => player.playerId));

  for (const player of state.players) {
    assertPlayerInvariants(player);
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

  for (const location of listPhysicalCardLocations(state)) {
    assertTrue(
      location.card.ownerId === "common" ||
        playerIds.has(location.card.ownerId),
      `${location.card.instanceId} in ${location.zoneName} must be owned by a player or common`
    );
    if (location.expectedOwnerId !== undefined) {
      assertTrue(
        location.card.ownerId === location.expectedOwnerId,
        `${location.card.instanceId} in ${location.zoneName} must be owned by ${location.expectedOwnerId}`
      );
    }
    assertNonNegativeMarketChips(location.card, location.zoneName);

    const locations = cardLocations.get(location.card.instanceId) ?? [];
    locations.push(location.zoneName);
    cardLocations.set(location.card.instanceId, locations);
  }

  registerTokenZones(tokenLocations, getCommonTokenZones(state));

  assertSingleZoneMembership(cardLocations, "card");
  assertSingleZoneMembership(tokenLocations, "token");
  assertTemporaryCardControls(state, cardLocations);
}

function assertTemporaryCardControls(
  state: GameState,
  cardLocations: ReadonlyMap<string, readonly string[]>
): void {
  const playerIds = new Set(state.players.map((player) => player.playerId));
  const controlledCardIds = new Set<string>();

  for (const control of state.turn.temporaryCardControls) {
    assertTrue(
      playerIds.has(control.controllerId),
      `temporary control references missing controller ${control.controllerId}`
    );
    assertTrue(
      !controlledCardIds.has(control.cardInstanceId),
      `duplicate temporary control for ${control.cardInstanceId}`
    );
    controlledCardIds.add(control.cardInstanceId);

    const locations = cardLocations.get(control.cardInstanceId);
    assertTrue(
      locations !== undefined && locations.length === 1,
      `temporary control references missing card ${control.cardInstanceId}`
    );
  }
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
