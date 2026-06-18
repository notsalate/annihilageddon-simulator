import {
  loadV0DataPack,
  type CardDefinition,
  type DeckComposition,
  type LoadedDataPack,
  type TokenStackComposition,
  type TokenDefinition,
} from "./data.js";
import { createSeededRng, type RandomSource } from "./rng.js";

export type PlayerId = `player-${number}`;
export type CommonOwner = "common";

export interface CardInstance {
  instanceId: string;
  definitionId: string;
  ownerId: PlayerId | CommonOwner;
  marketChips: number;
}

export interface TokenInstance {
  instanceId: string;
  definitionId: string;
  ownerId: PlayerId | CommonOwner;
}

export interface StatusInstance {
  instanceId: string;
  statusId: string;
  ownerId: PlayerId;
  effects: unknown[];
}

export interface TrophyLikeInstance {
  instanceId: string;
  trophyId: string;
  ownerId: PlayerId;
  effects: unknown[];
}

export interface PlayerState {
  playerId: PlayerId;
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  playedThisTurn: CardInstance[];
  permanents: CardInstance[];
  deadWizardTokens: TokenInstance[];
  wizardProperties: TokenInstance[];
  statuses: StatusInstance[];
  trophyLikeObjects: TrophyLikeInstance[];
  chips: number;
  life: {
    current: number;
    max: number;
  };
}

export interface CommonState {
  market: CardInstance[];
  legendMarket: CardInstance[];
  mainDeck: CardInstance[];
  legendDeck: CardInstance[];
  wildMagicStack: CardInstance[];
  limpWandStack: CardInstance[];
  destroyedMayhem: CardInstance[];
  destroyedMegaMayhem: CardInstance[];
  deadWizardTokens: DeadWizardTokenState;
}

export type DeadWizardTokenState =
  | {
      status: "notInDataPack";
      drawStack: [];
    }
  | {
      status: "available";
      drawStack: TokenInstance[];
    };

export interface GameState {
  seed: number;
  rng: RandomSource;
  activePlayerId: PlayerId;
  turn: {
    number: number;
    power: number;
    activatedCardIds: string[];
    gainedCardDefinitionIds: string[];
  };
  players: PlayerState[];
  common: CommonState;
  cardDefinitions: ReadonlyMap<string, CardDefinition>;
  tokenDefinitions: ReadonlyMap<string, TokenDefinition>;
  eventLog: GameEvent[];
}

export interface GameEvent {
  type: string;
  playerId?: PlayerId;
  targetPlayerId?: PlayerId;
  cardInstanceId?: string;
  definitionId?: string;
  targetCardInstanceId?: string;
  targetDefinitionId?: string;
  tokenInstanceId?: string;
  tokenDefinitionId?: string;
  effectId?: string;
  amount?: number;
  destination?: string;
  sourceType?: string;
}

export interface InitializeGameOptions {
  rootDir: string;
  seed: number;
  playerCount?: number;
  dataPackPath?: string;
}

interface InstanceFactory {
  create(definitionId: string, ownerId: PlayerId | CommonOwner): CardInstance;
}

interface TokenInstanceFactory {
  create(definitionId: string, ownerId: PlayerId | CommonOwner): TokenInstance;
}

export function initializeGame(options: InitializeGameOptions): GameState {
  const playerCount = options.playerCount ?? 2;
  if (!Number.isSafeInteger(playerCount) || playerCount < 2) {
    throw new RangeError("playerCount must be a safe integer >= 2");
  }

  const rng = createSeededRng(options.seed);
  const dataPack = loadV0DataPack(options.rootDir, options.dataPackPath);
  const factory = createInstanceFactory();
  const tokenFactory = createTokenInstanceFactory();

  const players = createPlayers(playerCount, dataPack, factory, rng);
  assignStartingWizardProperties(players, dataPack, tokenFactory);
  const mainDeck = instantiateDeck(dataPack.decks.mainDeck, dataPack, factory, "common");
  const legendDeck = instantiateDeck(dataPack.decks.legendDeck, dataPack, factory, "common");
  shuffleInPlace(mainDeck, rng);
  shuffleInPlace(legendDeck, rng);

  const common: CommonState = {
    market: [],
    legendMarket: [],
    mainDeck,
    legendDeck,
    wildMagicStack: instantiateDeck(dataPack.decks.wildMagicStack, dataPack, factory, "common"),
    limpWandStack: instantiateDeck(dataPack.decks.limpWandStack, dataPack, factory, "common"),
    destroyedMayhem: [],
    destroyedMegaMayhem: [],
    deadWizardTokens: instantiateDeadWizardTokens(dataPack, tokenFactory),
  };

  fillMarket({
    sourceDeck: common.mainDeck,
    market: common.market,
    destroyedEvents: common.destroyedMayhem,
    targetSize: 5,
    eventKind: "mayhem",
    dataPack,
  });
  fillMarket({
    sourceDeck: common.legendDeck,
    market: common.legendMarket,
    destroyedEvents: common.destroyedMegaMayhem,
    targetSize: 3,
    eventKind: "megaMayhem",
    dataPack,
  });

  const activePlayer = players[rng.nextInt(players.length)];
  if (activePlayer === undefined) {
    throw new Error("Cannot select active player from an empty player list");
  }

  return {
    seed: options.seed,
    rng,
    activePlayerId: activePlayer.playerId,
    turn: {
      number: 1,
      power: 0,
      activatedCardIds: [],
      gainedCardDefinitionIds: [],
    },
    players,
    common,
    cardDefinitions: dataPack.cardDefinitions,
    tokenDefinitions: dataPack.tokenDefinitions,
    eventLog: [
      {
        type: "gameInitialized",
      },
    ],
  };
}

function instantiateDeadWizardTokens(
  dataPack: LoadedDataPack,
  factory: TokenInstanceFactory,
): DeadWizardTokenState {
  const tokenStack = dataPack.tokenStacks.deadWizardTokens;
  if (tokenStack === undefined) {
    return {
      status: "notInDataPack",
      drawStack: [],
    };
  }

  return {
    status: "available",
    drawStack: instantiateTokenStack(tokenStack, dataPack, factory, "common"),
  };
}

function assignStartingWizardProperties(
  players: PlayerState[],
  dataPack: LoadedDataPack,
  factory: TokenInstanceFactory,
): void {
  const tokenStack = dataPack.tokenStacks.wizardProperties;
  if (tokenStack === undefined) {
    return;
  }

  const setupPool = instantiateTokenStack(tokenStack, dataPack, factory, "common");
  if (setupPool.length === 0) {
    throw new Error(`Token stack ${tokenStack.stackId} must include at least one wizard property`);
  }

  for (let index = 0; index < players.length; index += 1) {
    const player = players[index];
    const token = setupPool[index % setupPool.length];
    if (player === undefined || token === undefined) {
      throw new Error("Unexpected sparse array during wizard property setup");
    }

    player.wizardProperties.push({
      ...token,
      instanceId: `starting-${token.instanceId}-player-${index + 1}`,
      ownerId: player.playerId,
    });
  }
}

function createPlayers(
  playerCount: number,
  dataPack: LoadedDataPack,
  factory: InstanceFactory,
  rng: RandomSource,
): PlayerState[] {
  return Array.from({ length: playerCount }, (_, index) => {
    const playerId = `player-${index + 1}` as PlayerId;
    const deck = instantiateDeck(dataPack.decks.starterDeck, dataPack, factory, playerId);
    shuffleInPlace(deck, rng);

    const player: PlayerState = {
      playerId,
      deck,
      hand: [],
      discard: [],
      playedThisTurn: [],
      permanents: [],
      deadWizardTokens: [],
      wizardProperties: [],
      statuses: [],
      trophyLikeObjects: [],
      chips: 0,
      life: {
        current: 20,
        max: 25,
      },
    };

    drawCards(player, 5);
    return player;
  });
}

function instantiateDeck(
  deck: DeckComposition,
  dataPack: LoadedDataPack,
  factory: InstanceFactory,
  ownerId: PlayerId | CommonOwner,
): CardInstance[] {
  const instances: CardInstance[] = [];

  for (const entry of deck.entries) {
    if (!Number.isSafeInteger(entry.count) || entry.count < 0) {
      throw new RangeError(`Invalid count for ${entry.cardId} in ${deck.deckId}`);
    }

    const definition = dataPack.cardDefinitions.get(entry.cardId);
    if (definition === undefined) {
      throw new Error(`Deck ${deck.deckId} references missing card definition ${entry.cardId}`);
    }

    for (let copy = 0; copy < entry.count; copy += 1) {
      instances.push(factory.create(definition.cardId, ownerId));
    }
  }

  return instances;
}

function instantiateTokenStack(
  stack: TokenStackComposition,
  dataPack: LoadedDataPack,
  factory: TokenInstanceFactory,
  ownerId: PlayerId | CommonOwner,
): TokenInstance[] {
  const instances: TokenInstance[] = [];

  for (const entry of stack.entries) {
    if (!Number.isSafeInteger(entry.count) || entry.count < 0) {
      throw new RangeError(`Invalid count for ${entry.tokenId} in ${stack.stackId}`);
    }

    const definition = dataPack.tokenDefinitions.get(entry.tokenId);
    if (definition === undefined) {
      throw new Error(`Token stack ${stack.stackId} references missing token definition ${entry.tokenId}`);
    }

    for (let copy = 0; copy < entry.count; copy += 1) {
      instances.push(factory.create(definition.tokenId, ownerId));
    }
  }

  return instances;
}

function fillMarket(options: {
  sourceDeck: CardInstance[];
  market: CardInstance[];
  destroyedEvents: CardInstance[];
  targetSize: number;
  eventKind: CardDefinition["engine"]["cardKind"];
  dataPack: LoadedDataPack;
}): void {
  while (options.market.length < options.targetSize) {
    const card = drawFromTop(options.sourceDeck);
    if (card === undefined) {
      throw new Error(`Cannot fill market to ${options.targetSize}; source deck is empty`);
    }

    const definition = mustGetDefinition(options.dataPack, card.definitionId);
    if (definition.engine.cardKind === options.eventKind) {
      options.destroyedEvents.push(card);
      continue;
    }

    options.market.push(card);
    applyMarketChipMarker(options.dataPack, options.market, definition);
  }
}

function applyMarketChipMarker(
  dataPack: LoadedDataPack,
  market: CardInstance[],
  addedDefinition: CardDefinition,
): void {
  if (!addedDefinition.engine.marketChipMarker) {
    return;
  }

  for (const card of market) {
    const definition = mustGetDefinition(dataPack, card.definitionId);
    if (definition.engine.marketChipMarker) {
      card.marketChips += 1;
    }
  }
}

function drawCards(player: PlayerState, count: number): void {
  for (let index = 0; index < count; index += 1) {
    const card = drawFromTop(player.deck);
    if (card === undefined) {
      return;
    }

    player.hand.push(card);
  }
}

function drawFromTop(deck: CardInstance[]): CardInstance | undefined {
  return deck.shift();
}

function shuffleInPlace<T>(items: T[], rng: RandomSource): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.nextInt(index + 1);
    const item = items[index];
    const swapItem = items[swapIndex];
    if (item === undefined || swapItem === undefined) {
      throw new Error("Unexpected sparse array during shuffle");
    }

    items[index] = swapItem;
    items[swapIndex] = item;
  }
}

function mustGetDefinition(dataPack: LoadedDataPack, definitionId: string): CardDefinition {
  const definition = dataPack.cardDefinitions.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Missing card definition ${definitionId}`);
  }

  return definition;
}

function createInstanceFactory(): InstanceFactory {
  let nextId = 1;

  return {
    create(definitionId: string, ownerId: PlayerId | CommonOwner): CardInstance {
      const instance: CardInstance = {
        instanceId: `card-${nextId}`,
        definitionId,
        ownerId,
        marketChips: 0,
      };
      nextId += 1;
      return instance;
    },
  };
}

function createTokenInstanceFactory(): TokenInstanceFactory {
  let nextId = 1;

  return {
    create(definitionId: string, ownerId: PlayerId | CommonOwner): TokenInstance {
      const instance: TokenInstance = {
        instanceId: `token-${nextId}`,
        definitionId,
        ownerId,
      };
      nextId += 1;
      return instance;
    },
  };
}
