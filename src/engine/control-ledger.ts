import type { CardDefinition, TokenDefinition } from "./data.js";
import type {
  CardInstance,
  GameState,
  PlayerId,
  PlayerState,
  StatusInstance,
  TokenInstance,
  TemporaryCardControl,
  TrophyLikeInstance,
} from "./setup.js";

export interface ControlledObjectView {
  playerId: PlayerId;
  cards: readonly ControlledCardObject[];
  tokens: readonly ControlledTokenObject[];
  wizardProperties: readonly ControlledTokenObject[];
  statuses: readonly StatusInstance[];
  trophyLikeObjects: readonly TrophyLikeInstance[];
}

export interface ControlledCardObject {
  sourceType: "controlledCard";
  card: CardInstance;
  definition: CardDefinition;
}

export interface ControlledTokenObject {
  sourceType: "controlledToken";
  token: TokenInstance;
  definition: TokenDefinition;
}

export interface CardLocation {
  card: CardInstance;
  zoneName: string;
}

export type PhysicalCardZoneCardinality = "many" | "zeroOrOne";

export interface PhysicalCardZoneDescriptor {
  readonly zoneName: string;
  readonly cardinality: PhysicalCardZoneCardinality;
  readonly scoringEligible: boolean;
  readonly expectedOwnerId?: CardInstance["ownerId"];
  read(): readonly CardInstance[];
  replace(cards: readonly CardInstance[]): void;
}

export type PhysicalCardZoneDescriptorFactory = ((
  state: Pick<GameState, "players" | "common">
) => Omit<PhysicalCardZoneDescriptor, "zoneName"> & {
  readonly zoneName?: never;
}) & {
  readonly identity: string;
  readonly zoneName: string;
};

interface RegisteredPhysicalCardZoneDescriptorFactory {
  readonly factory: PhysicalCardZoneDescriptorFactory;
  readonly identity: string;
  readonly zoneName: string;
}

const additionalPhysicalCardZoneFactories = new WeakMap<
  object,
  readonly RegisteredPhysicalCardZoneDescriptorFactory[]
>();

/** Registers an extension zone with the Ledger-owned physical inventory. */
export function registerPhysicalCardZoneDescriptorFactory(
  state: Pick<GameState, "players" | "common">,
  factory: PhysicalCardZoneDescriptorFactory
): void {
  const existing = additionalPhysicalCardZoneFactories.get(state) ?? [];
  const registeredFactory = Object.freeze({
    factory,
    identity: factory.identity,
    zoneName: factory.zoneName,
  });
  const hasDuplicateZoneName =
    listBuiltinPhysicalCardZoneDescriptors(state).some(
      (descriptor) => descriptor.zoneName === registeredFactory.zoneName
    ) ||
    existing.some(
      (candidate) => candidate.zoneName === registeredFactory.zoneName
    );
  if (hasDuplicateZoneName) {
    throw new Error(
      `Duplicate physical card zone descriptor ${registeredFactory.zoneName}`
    );
  }
  if (
    existing.some(
      (candidate) => candidate.identity === registeredFactory.identity
    )
  ) {
    throw new Error(
      `Duplicate physical card zone descriptor identity ${registeredFactory.identity}`
    );
  }
  additionalPhysicalCardZoneFactories.set(state, [
    ...existing,
    registeredFactory,
  ]);
}

export function clonePhysicalCardZoneDescriptorFactories(
  source: Pick<GameState, "players" | "common">,
  target: Pick<GameState, "players" | "common">
): void {
  const factories = additionalPhysicalCardZoneFactories.get(source);
  if (factories !== undefined)
    additionalPhysicalCardZoneFactories.set(target, factories);
}

export interface PhysicalCardLocation {
  readonly card: CardInstance;
  readonly zoneName: string;
  readonly index: number;
  readonly expectedOwnerId?: CardInstance["ownerId"];
}

export interface PhysicalCardMove {
  readonly card: CardInstance;
  readonly sourceZoneName: string;
  readonly destinationZoneName: string;
}

export type PhysicalCardMoveResult =
  | { readonly ok: true; readonly move: PhysicalCardMove }
  | { readonly ok: false; readonly reason: string };

interface PhysicalCardZoneMoveSnapshot {
  readonly descriptor: PhysicalCardZoneDescriptor;
  readonly cards: readonly CardInstance[];
  readonly recoveryStorage?: CardInstance[];
}

export interface PhysicalCardZoneStateSnapshot {
  readonly zones: readonly PhysicalCardZoneMoveSnapshot[];
}

export type PhysicalCardZoneStateSnapshotResult =
  | { readonly ok: true; readonly snapshot: PhysicalCardZoneStateSnapshot }
  | { readonly ok: false; readonly reason: string };

export type PhysicalCardZoneStateRestoreResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export function buildControlledObjectView(
  state: GameState,
  playerId: PlayerId
): ControlledObjectView {
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId
  );
  if (player === undefined) {
    throw new Error(`Missing player ${playerId}`);
  }

  return {
    playerId,
    cards: getControlledCards(state, player).map((card) => ({
      sourceType: "controlledCard" as const,
      card,
      definition: mustGetCardDefinition(state, card.definitionId),
    })),
    tokens: player.deadWizardTokens.map((token) => ({
      sourceType: "controlledToken" as const,
      token,
      definition: mustGetTokenDefinition(state, token.definitionId),
    })),
    wizardProperties: player.wizardProperties.map((token) => ({
      sourceType: "controlledToken" as const,
      token,
      definition: mustGetTokenDefinition(state, token.definitionId),
    })),
    statuses: [...player.statuses],
    trophyLikeObjects: [...player.trophyLikeObjects],
  };
}

export function grantTemporaryControl(
  state: GameState,
  cardInstanceId: CardInstance["instanceId"],
  controllerId: PlayerId
): void {
  const existing = state.turn.temporaryCardControls.find(
    (control) => control.cardInstanceId === cardInstanceId
  );
  if (existing !== undefined) {
    existing.controllerId = controllerId;
    return;
  }

  state.turn.temporaryCardControls.push({ cardInstanceId, controllerId });
}

export function releaseTemporaryControls(state: GameState): void {
  state.turn.temporaryCardControls = [];
}

export function cloneTemporaryControls(
  controls: readonly TemporaryCardControl[]
): TemporaryCardControl[] {
  return controls.map((control) => ({ ...control }));
}

export function getControlledCards(
  state: GameState,
  player: PlayerState
): CardInstance[] {
  const controlledCards = [...player.permanents];
  const controlledIds = new Set(controlledCards.map((card) => card.instanceId));

  for (const control of state.turn.temporaryCardControls) {
    if (
      control.controllerId !== player.playerId ||
      controlledIds.has(control.cardInstanceId)
    ) {
      continue;
    }

    const location = findCardLocation(state, control.cardInstanceId);
    if (location === undefined) {
      continue;
    }

    controlledCards.push(location.card);
    controlledIds.add(location.card.instanceId);
  }

  return controlledCards;
}

export function getControlledOngoingCards(
  state: GameState,
  player: PlayerState
): CardInstance[] {
  return getControlledCards(state, player).filter((card) => {
    const definition = state.cardDefinitions.get(card.definitionId);
    return (
      definition?.engine.playableInV0 === true && definition.engine.isOngoing
    );
  });
}

export function replaceOwnedCardDefinitionInPlayerZones(
  player: PlayerState,
  fromDefinitionId: CardInstance["definitionId"],
  createReplacement: () => CardInstance
): boolean {
  const descriptors = listPlayerPhysicalCardZoneDescriptors(player);
  const replacementPriority = (
    descriptor: PhysicalCardZoneDescriptor
  ): number =>
    descriptor.zoneName === `${player.playerId}.hand`
      ? 0
      : descriptor.zoneName === `${player.playerId}.deck`
        ? 1
        : 2;
  const descriptorsInReplacementOrder = [...descriptors].sort(
    (left, right) => replacementPriority(left) - replacementPriority(right)
  );

  for (const descriptor of descriptorsInReplacementOrder) {
    const cards = descriptor.read();
    const index = cards.findIndex(
      (card) =>
        card.ownerId === player.playerId &&
        card.definitionId === fromDefinitionId
    );
    if (index < 0) {
      continue;
    }

    descriptor.replace([
      ...cards.slice(0, index),
      createReplacement(),
      ...cards.slice(index + 1),
    ]);
    return true;
  }

  return false;
}

function listPlayerPhysicalCardZoneDescriptors(
  player: PlayerState
): readonly PhysicalCardZoneDescriptor[] {
  return [
    createArrayCardZoneDescriptor(
      `${player.playerId}.deck`,
      () => player.deck,
      (cards) => {
        player.deck = cards;
      },
      player.playerId,
      true
    ),
    createArrayCardZoneDescriptor(
      `${player.playerId}.hand`,
      () => player.hand,
      (cards) => {
        player.hand = cards;
      },
      player.playerId,
      true
    ),
    createArrayCardZoneDescriptor(
      `${player.playerId}.discard`,
      () => player.discard,
      (cards) => {
        player.discard = cards;
      },
      player.playerId,
      true
    ),
    createArrayCardZoneDescriptor(
      `${player.playerId}.playedThisTurn`,
      () => player.playedThisTurn,
      (cards) => {
        player.playedThisTurn = cards;
      },
      undefined,
      true
    ),
    createArrayCardZoneDescriptor(
      `${player.playerId}.permanents`,
      () => player.permanents,
      (cards) => {
        player.permanents = cards;
      },
      undefined,
      true
    ),
    createSingletonCardZoneDescriptor(
      `${player.playerId}.unboughtFamiliar`,
      () => player.unboughtFamiliar,
      (card) => {
        player.unboughtFamiliar = card;
      },
      player.playerId
    ),
  ];
}

export function listPhysicalCardZoneDescriptors(
  state: Pick<GameState, "players" | "common">
): readonly PhysicalCardZoneDescriptor[] {
  return [
    ...listBuiltinPhysicalCardZoneDescriptors(state),
    ...(additionalPhysicalCardZoneFactories
      .get(state)
      ?.map(({ factory, zoneName }) => {
        const descriptor = factory(state);
        return {
          zoneName,
          cardinality: descriptor.cardinality,
          scoringEligible: descriptor.scoringEligible,
          ...(descriptor.expectedOwnerId === undefined
            ? {}
            : { expectedOwnerId: descriptor.expectedOwnerId }),
          read: () => descriptor.read(),
          replace: (cards: readonly CardInstance[]) =>
            descriptor.replace(cards),
        };
      }) ?? []),
  ];
}

function listBuiltinPhysicalCardZoneDescriptors(
  state: Pick<GameState, "players" | "common">
): readonly PhysicalCardZoneDescriptor[] {
  return [
    ...state.players.flatMap(listPlayerPhysicalCardZoneDescriptors),
    createArrayCardZoneDescriptor(
      "mainMarket",
      () => state.common.market,
      (cards) => {
        state.common.market = cards;
      },
      "common"
    ),
    createArrayCardZoneDescriptor(
      "legendMarket",
      () => state.common.legendMarket,
      (cards) => {
        state.common.legendMarket = cards;
      },
      "common"
    ),
    createArrayCardZoneDescriptor(
      "mainDeck",
      () => state.common.mainDeck,
      (cards) => {
        state.common.mainDeck = cards;
      },
      "common"
    ),
    createArrayCardZoneDescriptor(
      "legendDeck",
      () => state.common.legendDeck,
      (cards) => {
        state.common.legendDeck = cards;
      },
      "common"
    ),
    createArrayCardZoneDescriptor(
      "wildMagicStack",
      () => state.common.wildMagicStack,
      (cards) => {
        state.common.wildMagicStack = cards;
      },
      "common"
    ),
    createArrayCardZoneDescriptor(
      "limpWandStack",
      () => state.common.limpWandStack,
      (cards) => {
        state.common.limpWandStack = cards;
      },
      "common"
    ),
    createArrayCardZoneDescriptor(
      "destroyedPile",
      () => state.common.destroyedPile,
      (cards) => {
        state.common.destroyedPile = cards;
      }
    ),
    createArrayCardZoneDescriptor(
      "destroyedMayhem",
      () => state.common.destroyedMayhem,
      (cards) => {
        state.common.destroyedMayhem = cards;
      }
    ),
    createArrayCardZoneDescriptor(
      "destroyedMegaMayhem",
      () => state.common.destroyedMegaMayhem,
      (cards) => {
        state.common.destroyedMegaMayhem = cards;
      }
    ),
  ];
}

/** Lists player-owned cards in zones that count toward victory scoring. */
export function listOwnedScoringCards(
  state: GameState,
  playerId: PlayerId
): ControlledCardObject[] {
  return listPhysicalCardZoneDescriptors(state)
    .filter((descriptor) => descriptor.scoringEligible)
    .flatMap((descriptor) => descriptor.read())
    .filter((card) => card.ownerId === playerId)
    .map((card) => ({
      sourceType: "controlledCard" as const,
      card,
      definition: mustGetCardDefinition(state, card.definitionId),
    }));
}

export function clonePhysicalCardZones(
  source: Pick<GameState, "players" | "common">,
  target: Pick<GameState, "players" | "common">,
  cloneCard: (card: CardInstance) => CardInstance
): void {
  const targetDescriptors = new Map(
    listPhysicalCardZoneDescriptors(target).map((descriptor) => [
      descriptor.zoneName,
      descriptor,
    ])
  );

  for (const sourceDescriptor of listPhysicalCardZoneDescriptors(source)) {
    const targetDescriptor = targetDescriptors.get(sourceDescriptor.zoneName);
    if (targetDescriptor === undefined) {
      throw new Error(
        `Missing physical card zone ${sourceDescriptor.zoneName} in clone target`
      );
    }
    targetDescriptor.replace(sourceDescriptor.read().map(cloneCard));
  }
}

/** Creates an isolated clone of all physical card storage and player-owned state. */
export function clonePhysicalCardZoneState(
  source: GameState
): Pick<GameState, "players" | "common"> {
  const physicalCards = new Set(
    listPhysicalCardZoneDescriptors(source).flatMap((descriptor) =>
      descriptor.read()
    )
  );
  return cloneLedgerValue(
    { players: source.players, common: source.common },
    physicalCards
  );
}

type LedgerCloneValue =
  | object
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined;

interface LedgerCloneObject {
  [key: string]: LedgerCloneValue;
}

function isLedgerCloneArray(value: object): value is LedgerCloneValue[] {
  return Array.isArray(value);
}

function isLedgerCloneMap(
  value: object
): value is Map<LedgerCloneValue, LedgerCloneValue> {
  return value instanceof Map;
}

function isLedgerCloneSet(value: object): value is Set<LedgerCloneValue> {
  return value instanceof Set;
}

function isLedgerCloneObject(value: object): value is LedgerCloneObject {
  return Object.getPrototypeOf(value) === Object.prototype;
}

function cloneLedgerValue<T extends LedgerCloneValue>(
  value: T,
  physicalCards: ReadonlySet<object>,
  clones = new Map<object, object>()
): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (physicalCards.has(value)) {
    return value;
  }
  const existing = clones.get(value);
  if (existing !== undefined) {
    return existing as T;
  }
  if (isLedgerCloneArray(value)) {
    const clone: LedgerCloneValue[] = [];
    clones.set(value, clone);
    for (const child of value) {
      clone.push(cloneLedgerValue(child, physicalCards, clones));
    }
    return clone as T;
  }
  if (isLedgerCloneMap(value)) {
    const clone = new Map<LedgerCloneValue, LedgerCloneValue>();
    clones.set(value, clone);
    for (const [key, child] of value) {
      clone.set(
        cloneLedgerValue(key, physicalCards, clones),
        cloneLedgerValue(child, physicalCards, clones)
      );
    }
    return clone as T;
  }
  if (isLedgerCloneSet(value)) {
    const clone = new Set<LedgerCloneValue>();
    clones.set(value, clone);
    for (const child of value) {
      clone.add(cloneLedgerValue(child, physicalCards, clones));
    }
    return clone as T;
  }
  if (!isLedgerCloneObject(value)) {
    const clone = structuredClone(value);
    clones.set(value, clone);
    return clone;
  }

  const clone: LedgerCloneObject = {};
  clones.set(value, clone);
  for (const [key, child] of Object.entries(value)) {
    clone[key] = cloneLedgerValue(child, physicalCards, clones);
  }
  return clone as T;
}

export function listPhysicalCardLocations(
  state: GameState
): readonly PhysicalCardLocation[] {
  return listPhysicalCardZoneDescriptors(state).flatMap((descriptor) =>
    descriptor.read().map((card, index) =>
      descriptor.expectedOwnerId === undefined
        ? { card, zoneName: descriptor.zoneName, index }
        : {
            card,
            zoneName: descriptor.zoneName,
            index,
            expectedOwnerId: descriptor.expectedOwnerId,
          }
    )
  );
}

/** Lists locations that can supply a voluntary Defense for one player. */
export function listDefenseCardLocations(
  state: GameState,
  playerId: PlayerId
): readonly CardLocation[] {
  const extensionZoneNames = new Set(
    additionalPhysicalCardZoneFactories
      .get(state)
      ?.map((factory) => factory.zoneName) ?? []
  );
  return listPhysicalCardLocations(state)
    .filter(
      (location) =>
        location.card.ownerId === playerId &&
        (location.zoneName === `${playerId}.hand` ||
          extensionZoneNames.has(location.zoneName))
    )
    .map(({ card, zoneName }) => ({ card, zoneName }));
}

export function findCardLocation(
  state: GameState,
  cardInstanceId: string
): CardLocation | undefined {
  const location = listPhysicalCardLocations(state).find(
    (candidate) => candidate.card.instanceId === cardInstanceId
  );
  if (location === undefined) {
    return undefined;
  }
  return { card: location.card, zoneName: location.zoneName };
}

export function removeCardFromLocation(
  state: GameState,
  cardInstanceId: string
): CardLocation | undefined {
  for (const descriptor of listPhysicalCardZoneDescriptors(state)) {
    const cards = descriptor.read();
    const index = cards.findIndex(
      (candidate) => candidate.instanceId === cardInstanceId
    );
    if (index < 0) {
      continue;
    }
    const card = cards[index];
    if (card === undefined) {
      continue;
    }
    descriptor.replace([...cards.slice(0, index), ...cards.slice(index + 1)]);
    return { card, zoneName: descriptor.zoneName };
  }

  return undefined;
}

/** Moves one physical card through descriptor-owned source and destination zones. */
export function movePhysicalCard(
  state: GameState,
  cardInstanceId: CardInstance["instanceId"],
  destinationZoneName: string,
  placement: "front" | "back",
  expectedSourceZoneName?: string
): PhysicalCardMoveResult {
  const descriptors = listPhysicalCardZoneDescriptors(state);
  const destination = descriptors.find(
    (descriptor) => descriptor.zoneName === destinationZoneName
  );
  if (destination === undefined) {
    return {
      ok: false,
      reason: `Missing destination zone ${destinationZoneName}`,
    };
  }

  let source:
    | {
        descriptor: PhysicalCardZoneDescriptor;
        cards: readonly CardInstance[];
      }
    | undefined;
  for (const descriptor of descriptors) {
    if (
      expectedSourceZoneName !== undefined &&
      descriptor.zoneName !== expectedSourceZoneName
    ) {
      continue;
    }
    let cards: readonly CardInstance[];
    try {
      cards = descriptor.read();
    } catch (error) {
      return {
        ok: false,
        reason: describePhysicalCardMoveError(error),
      };
    }
    if (cards.some((card) => card.instanceId === cardInstanceId)) {
      source = { descriptor, cards };
      break;
    }
  }
  if (source === undefined) {
    return {
      ok: false,
      reason:
        expectedSourceZoneName === undefined
          ? `Missing card ${cardInstanceId}`
          : `Missing card ${cardInstanceId} in ${expectedSourceZoneName}`,
    };
  }
  if (source.descriptor.zoneName === destination.zoneName) {
    return {
      ok: false,
      reason: `Card ${cardInstanceId} already belongs to ${destinationZoneName}`,
    };
  }

  const cardIndex = source.cards.findIndex(
    (card) => card.instanceId === cardInstanceId
  );
  const card = source.cards[cardIndex];
  if (card === undefined) {
    return { ok: false, reason: `Missing card ${cardInstanceId}` };
  }
  const sourceSnapshotResult = createPhysicalCardZoneMoveSnapshot(
    state,
    source.descriptor,
    source.cards
  );
  if (!sourceSnapshotResult.ok) {
    return sourceSnapshotResult;
  }
  const destinationSnapshotResult = createPhysicalCardZoneMoveSnapshot(
    state,
    destination
  );
  if (!destinationSnapshotResult.ok) {
    return destinationSnapshotResult;
  }
  const sourceSnapshot = sourceSnapshotResult.snapshot;
  const destinationSnapshot = destinationSnapshotResult.snapshot;
  const destinationCards = destinationSnapshot.cards;
  if (destination.cardinality === "zeroOrOne" && destinationCards.length > 0) {
    return {
      ok: false,
      reason: `Destination zone ${destinationZoneName} is already occupied`,
    };
  }

  const sourceAfter = [
    ...source.cards.slice(0, cardIndex),
    ...source.cards.slice(cardIndex + 1),
  ];
  const destinationAfter =
    placement === "front"
      ? [card, ...destinationCards]
      : [...destinationCards, card];
  try {
    source.descriptor.replace(sourceAfter);
    destination.replace(destinationAfter);
  } catch (error) {
    const rollbackErrors = [
      restorePhysicalCardZoneMoveSnapshot(destinationSnapshot),
      restorePhysicalCardZoneMoveSnapshot(sourceSnapshot),
    ].filter(
      (rollbackError): rollbackError is string => rollbackError !== undefined
    );
    return {
      ok: false,
      reason:
        rollbackErrors.length === 0
          ? describePhysicalCardMoveError(error)
          : `${describePhysicalCardMoveError(error)}; rollback failed: ${rollbackErrors.join("; ")}`,
    };
  }

  return {
    ok: true,
    move: {
      card,
      sourceZoneName: source.descriptor.zoneName,
      destinationZoneName,
    },
  };
}

/** Captures every physical zone with Ledger-owned recovery metadata. */
export function capturePhysicalCardZoneState(
  state: GameState
): PhysicalCardZoneStateSnapshotResult {
  let descriptors: readonly PhysicalCardZoneDescriptor[];
  try {
    descriptors = listPhysicalCardZoneDescriptors(state);
  } catch (error) {
    return { ok: false, reason: describePhysicalCardMoveError(error) };
  }
  if (
    new Set(descriptors.map((descriptor) => descriptor.zoneName)).size !==
    descriptors.length
  ) {
    return {
      ok: false,
      reason: "Physical card zone snapshot found duplicate descriptors",
    };
  }

  const zones: PhysicalCardZoneMoveSnapshot[] = [];
  for (const descriptor of descriptors) {
    const snapshotResult = createPhysicalCardZoneMoveSnapshot(
      state,
      descriptor
    );
    if (!snapshotResult.ok) {
      return snapshotResult;
    }
    zones.push(snapshotResult.snapshot);
  }
  return { ok: true, snapshot: { zones } };
}

/** Restores every captured physical zone and reports failures without throwing. */
export function restorePhysicalCardZoneState(
  state: GameState,
  snapshot: PhysicalCardZoneStateSnapshot
): PhysicalCardZoneStateRestoreResult {
  let descriptors: readonly PhysicalCardZoneDescriptor[];
  try {
    descriptors = listPhysicalCardZoneDescriptors(state);
  } catch (error) {
    return { ok: false, reason: describePhysicalCardMoveError(error) };
  }
  const descriptorsByName = new Map(
    descriptors.map((descriptor) => [descriptor.zoneName, descriptor])
  );
  const snapshotsByName = new Map(
    snapshot.zones.map((zone) => [zone.descriptor.zoneName, zone])
  );
  if (descriptorsByName.size !== descriptors.length) {
    return {
      ok: false,
      reason: "Physical card zone restore found duplicate descriptors",
    };
  }
  if (snapshotsByName.size !== snapshot.zones.length) {
    return {
      ok: false,
      reason: "Physical card zone restore found duplicate snapshots",
    };
  }
  for (const descriptor of descriptors) {
    if (!snapshotsByName.has(descriptor.zoneName)) {
      return {
        ok: false,
        reason: `Physical card zone restore found unknown zone ${descriptor.zoneName}`,
      };
    }
  }
  for (const zone of snapshot.zones) {
    const descriptor = descriptorsByName.get(zone.descriptor.zoneName);
    if (descriptor === undefined) {
      return {
        ok: false,
        reason: `Physical card zone restore is missing zone ${zone.descriptor.zoneName}`,
      };
    }
    if (descriptor.cardinality === "zeroOrOne" && zone.cards.length > 1) {
      return {
        ok: false,
        reason: `Physical card zone restore violates singleton zone ${descriptor.zoneName}`,
      };
    }
  }

  const errors = snapshot.zones
    .map(restorePhysicalCardZoneMoveSnapshot)
    .filter((error): error is string => error !== undefined);
  return errors.length === 0
    ? { ok: true }
    : { ok: false, reason: errors.join("; ") };
}

function createPhysicalCardZoneMoveSnapshot(
  state: GameState,
  descriptor: PhysicalCardZoneDescriptor,
  existingCards?: readonly CardInstance[]
):
  | { readonly ok: true; readonly snapshot: PhysicalCardZoneMoveSnapshot }
  | { readonly ok: false; readonly reason: string } {
  let cards: readonly CardInstance[];
  try {
    cards = existingCards ?? descriptor.read();
  } catch (error) {
    return { ok: false, reason: describePhysicalCardMoveError(error) };
  }
  const isExtensionZone =
    additionalPhysicalCardZoneFactories
      .get(state)
      ?.some((factory) => factory.zoneName === descriptor.zoneName) === true;
  if (!isExtensionZone) {
    return {
      ok: true,
      snapshot: { descriptor, cards: [...cards] },
    };
  }

  const recoveryStorage =
    Array.isArray(cards) && !Object.isFrozen(cards)
      ? (cards as CardInstance[])
      : undefined;
  return {
    ok: true,
    snapshot: {
      descriptor,
      cards: [...cards],
      ...(recoveryStorage === undefined ? {} : { recoveryStorage }),
    },
  };
}

function restorePhysicalCardZoneMoveSnapshot(
  snapshot: PhysicalCardZoneMoveSnapshot
): string | undefined {
  try {
    try {
      snapshot.descriptor.replace(snapshot.cards);
    } catch (error) {
      if (snapshot.recoveryStorage === undefined) {
        throw error;
      }
      snapshot.recoveryStorage.splice(
        0,
        snapshot.recoveryStorage.length,
        ...snapshot.cards
      );
    }
    const restoredCards = snapshot.descriptor.read();
    if (
      restoredCards.length !== snapshot.cards.length ||
      restoredCards.some((card, index) => card !== snapshot.cards[index])
    ) {
      return `Cannot restore physical card zone ${snapshot.descriptor.zoneName}`;
    }
    return undefined;
  } catch (error) {
    return `${snapshot.descriptor.zoneName}: ${describePhysicalCardMoveError(error)}`;
  }
}

function describePhysicalCardMoveError(error: unknown): string {
  return error instanceof Error ? error.message : "Cannot move physical card";
}

function createArrayCardZoneDescriptor(
  zoneName: string,
  readStorage: () => readonly CardInstance[],
  replaceStorage: (cards: CardInstance[]) => void,
  expectedOwnerId?: CardInstance["ownerId"],
  scoringEligible = false
): PhysicalCardZoneDescriptor {
  return {
    zoneName,
    cardinality: "many",
    scoringEligible,
    ...(expectedOwnerId === undefined ? {} : { expectedOwnerId }),
    read() {
      return readStorage().map((card) => card);
    },
    replace(cards) {
      replaceStorage([...cards]);
    },
  };
}

function createSingletonCardZoneDescriptor(
  zoneName: string,
  readStorage: () => CardInstance | undefined,
  replaceStorage: (card: CardInstance | undefined) => void,
  expectedOwnerId?: CardInstance["ownerId"],
  scoringEligible = false
): PhysicalCardZoneDescriptor {
  return {
    zoneName,
    cardinality: "zeroOrOne",
    scoringEligible,
    ...(expectedOwnerId === undefined ? {} : { expectedOwnerId }),
    read() {
      const card = readStorage();
      return card === undefined ? [] : [card];
    },
    replace(cards) {
      if (cards.length > 1) {
        throw new Error(
          `Physical card zone ${zoneName} accepts at most one card, received ${cards.length}`
        );
      }
      replaceStorage(cards[0]);
    },
  };
}

function mustGetCardDefinition(
  state: GameState,
  definitionId: CardInstance["definitionId"]
): CardDefinition {
  const definition = state.cardDefinitions.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Missing card definition ${definitionId}`);
  }
  return definition;
}

function mustGetTokenDefinition(
  state: GameState,
  definitionId: TokenInstance["definitionId"]
): TokenDefinition {
  const definition = state.tokenDefinitions.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Missing token definition ${definitionId}`);
  }
  return definition;
}
