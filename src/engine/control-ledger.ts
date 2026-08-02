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

export type PhysicalCardZoneDescriptorFactory = (
  (
    state: Pick<GameState, "players" | "common">
  ) => Omit<PhysicalCardZoneDescriptor, "zoneName"> & {
    readonly zoneName?: never;
  }
) & {
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
  const hasDuplicateZoneName = listBuiltinPhysicalCardZoneDescriptors(state).some(
    (descriptor) => descriptor.zoneName === registeredFactory.zoneName
  ) || existing.some((candidate) => candidate.zoneName === registeredFactory.zoneName);
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
  additionalPhysicalCardZoneFactories.set(state, [...existing, registeredFactory]);
}

export function clonePhysicalCardZoneDescriptorFactories(
  source: Pick<GameState, "players" | "common">,
  target: Pick<GameState, "players" | "common">
): void {
  const factories = additionalPhysicalCardZoneFactories.get(source);
  if (factories !== undefined) additionalPhysicalCardZoneFactories.set(target, factories);
}

export interface PhysicalCardLocation {
  readonly card: CardInstance;
  readonly zoneName: string;
  readonly index: number;
  readonly expectedOwnerId?: CardInstance["ownerId"];
}

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
          replace: (cards: readonly CardInstance[]) => descriptor.replace(cards),
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

function cloneLedgerValue<T>(
  value: T,
  physicalCards: ReadonlySet<object>,
  clones = new Map<object, unknown>()
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
  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    clones.set(value, clone);
    for (const child of value) {
      clone.push(cloneLedgerValue(child, physicalCards, clones));
    }
    return clone as T;
  }
  if (value instanceof Map) {
    const clone = new Map<unknown, unknown>();
    clones.set(value, clone);
    for (const [key, child] of value) {
      clone.set(
        cloneLedgerValue(key, physicalCards, clones),
        cloneLedgerValue(child, physicalCards, clones)
      );
    }
    return clone as T;
  }
  if (value instanceof Set) {
    const clone = new Set<unknown>();
    clones.set(value, clone);
    for (const child of value) {
      clone.add(cloneLedgerValue(child, physicalCards, clones));
    }
    return clone as T;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    const clone = structuredClone(value);
    clones.set(value, clone);
    return clone;
  }

  const clone: Record<string, unknown> = {};
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
