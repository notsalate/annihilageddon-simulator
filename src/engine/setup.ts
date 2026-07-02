import {
  isIncompleteFullOnlyDataPack,
  loadCurrentRuntimeDataPack,
  validateExecutableDataPack,
  type CardDefinition,
  type DeckComposition,
  type LoadedDataPack,
  type TokenStackComposition,
  type TokenDefinition,
} from "./data.js";
import type { GameEvent as StrictGameEvent } from "./events.js";
import { runMarketFlow } from "./market-flow.js";
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
  unboughtFamiliar: CardInstance | undefined;
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
  destroyedPile: CardInstance[];
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

export interface GameEvent extends StrictGameEvent {}

interface InitializeGameBaseOptions {
  seed: number;
  playerCount?: number;
}

export type InitializeGameOptions =
  | InitializeGameFilesystemOptions
  | InitializeGameLoadedDataPackOptions;

export interface InitializeGameFilesystemOptions extends InitializeGameBaseOptions {
  rootDir: string;
  dataPackPath?: string;
  dataPack?: never;
}

export interface InitializeGameLoadedDataPackOptions extends InitializeGameBaseOptions {
  dataPack: LoadedDataPack;
  rootDir?: never;
  dataPackPath?: never;
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
  const dataPack =
    "dataPack" in options
      ? options.dataPack
      : loadCurrentRuntimeDataPack(options.rootDir, options.dataPackPath);
  if (dataPack.manifest.mappingStatus !== "fixture") {
    const validation = validateExecutableDataPack(dataPack);
    if (!validation.ok) {
      throw new Error(
        `Cannot initialize game with invalid data pack:\n${validation.errors.join("\n")}`
      );
    }
  }
  const factory = createInstanceFactory();
  const tokenFactory = createTokenInstanceFactory();

  const players = createPlayers(playerCount, dataPack, factory, rng);
  assignStartingFamiliars(
    players,
    dataPack,
    factory,
    createSeededRng(options.seed + 7919)
  );
  assignStartingWizardProperties(players, dataPack, tokenFactory, rng);
  applyWizardPropertySetupEffects(players, dataPack, factory);
  const mainDeck = instantiateDeck(
    dataPack.decks.mainDeck,
    dataPack,
    factory,
    "common"
  );
  const legendDeck = instantiateDeck(
    dataPack.decks.legendDeck,
    dataPack,
    factory,
    "common"
  );
  shuffleInPlace(mainDeck, rng);
  shuffleInPlace(legendDeck, rng);

  const common: CommonState = {
    market: [],
    legendMarket: [],
    mainDeck,
    legendDeck,
    wildMagicStack: instantiateDeck(
      dataPack.decks.wildMagicStack,
      dataPack,
      factory,
      "common"
    ),
    limpWandStack: instantiateDeck(
      dataPack.decks.limpWandStack,
      dataPack,
      factory,
      "common"
    ),
    destroyedPile: [],
    destroyedMayhem: [],
    destroyedMegaMayhem: [],
    deadWizardTokens: instantiateDeadWizardTokens(
      dataPack,
      tokenFactory,
      rng,
      playerCount
    ),
  };

  const randomActivePlayer = players[rng.nextInt(players.length)];
  if (randomActivePlayer === undefined) {
    throw new Error("Cannot select active player from an empty player list");
  }
  const activePlayer =
    getForcedStartingPlayer(players, dataPack) ?? randomActivePlayer;

  const state: GameState = {
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
    eventLog: [],
  };

  const marketFlowResult = runMarketFlow(state, { mode: "setup" });
  if (!marketFlowResult.ok) {
    throw new Error(marketFlowResult.error);
  }
  if (marketFlowResult.gameEndReason !== undefined) {
    if (!isIncompleteFullOnlyDataPack(dataPack)) {
      throw new Error(
        `Cannot initialize game: ${marketFlowResult.gameEndReason}`
      );
    }
  }

  state.eventLog.push({
    type: "gameInitialized",
  });

  return state;
}

function instantiateDeadWizardTokens(
  dataPack: LoadedDataPack,
  factory: TokenInstanceFactory,
  rng: RandomSource,
  playerCount: number
): DeadWizardTokenState {
  const tokenStack = dataPack.tokenStacks.deadWizardTokens;
  if (tokenStack === undefined) {
    return {
      status: "notInDataPack",
      drawStack: [],
    };
  }

  const drawStackSize = 4 * playerCount;
  const setupPool = instantiateTokenStack(
    tokenStack,
    dataPack,
    factory,
    "common"
  );

  shuffleInPlace(setupPool, rng);

  return {
    status: "available",
    drawStack: setupPool.slice(0, drawStackSize),
  };
}

function assignStartingWizardProperties(
  players: PlayerState[],
  dataPack: LoadedDataPack,
  factory: TokenInstanceFactory,
  rng: RandomSource
): void {
  const tokenStack = dataPack.tokenStacks.wizardProperties;
  if (tokenStack === undefined) {
    if (!isIncompleteFullOnlyDataPack(dataPack)) {
      throw new Error(
        "Data pack manifest must define wizard property stack outside incomplete-full-only"
      );
    }
    return;
  }

  const setupPool = instantiateTokenStack(
    tokenStack,
    dataPack,
    factory,
    "common"
  );
  if (setupPool.length === 0) {
    if (isIncompleteFullOnlyDataPack(dataPack)) {
      return;
    }
    throw new Error(
      `Token stack ${tokenStack.stackId} must include at least one wizard property`
    );
  }

  shuffleInPlace(setupPool, rng);

  for (let index = 0; index < players.length; index += 1) {
    const player = players[index];
    const candidateOffset =
      players.length * 2 <= setupPool.length ? index * 2 : index;
    const firstCandidate = setupPool[candidateOffset % setupPool.length];
    const secondCandidate = setupPool[(candidateOffset + 1) % setupPool.length];
    if (
      player === undefined ||
      firstCandidate === undefined ||
      secondCandidate === undefined
    ) {
      throw new Error("Unexpected sparse array during wizard property setup");
    }

    const firstDefinition = dataPack.tokenDefinitions.get(
      firstCandidate.definitionId
    );
    const secondDefinition = dataPack.tokenDefinitions.get(
      secondCandidate.definitionId
    );
    if (
      firstDefinition?.kind !== "wizardProperty" ||
      secondDefinition?.kind !== "wizardProperty"
    ) {
      throw new Error(
        `Token stack ${tokenStack.stackId} must contain only wizard property tokens`
      );
    }

    player.wizardProperties.push({
      ...firstCandidate,
      instanceId: `starting-${firstCandidate.instanceId}-player-${index + 1}`,
      ownerId: player.playerId,
    });
  }
}

function assignStartingFamiliars(
  players: PlayerState[],
  dataPack: LoadedDataPack,
  factory: InstanceFactory,
  rng: RandomSource
): void {
  const familiarPool = dataPack.decks.familiarPool;
  if (familiarPool === undefined) {
    if (!isIncompleteFullOnlyDataPack(dataPack)) {
      throw new Error(
        "Data pack manifest must define familiar pool outside incomplete-full-only"
      );
    }
    return;
  }

  const setupPool = instantiateDeck(familiarPool, dataPack, factory, "common");
  if (setupPool.length < 2) {
    if (isIncompleteFullOnlyDataPack(dataPack)) {
      return;
    }
    throw new Error(
      `Deck ${familiarPool.deckId} must include at least two familiar setup candidates`
    );
  }

  shuffleInPlace(setupPool, rng);

  for (let index = 0; index < players.length; index += 1) {
    const player = players[index];
    const firstCandidate = setupPool[(index * 2) % setupPool.length];
    const secondCandidate = setupPool[(index * 2 + 1) % setupPool.length];
    if (
      player === undefined ||
      firstCandidate === undefined ||
      secondCandidate === undefined
    ) {
      throw new Error("Unexpected sparse array during familiar setup");
    }

    const firstDefinition = mustGetDefinition(
      dataPack,
      firstCandidate.definitionId
    );
    const secondDefinition = mustGetDefinition(
      dataPack,
      secondCandidate.definitionId
    );
    if (
      firstDefinition.engine.cardKind !== "familiar" ||
      secondDefinition.engine.cardKind !== "familiar"
    ) {
      throw new Error(
        `Deck ${familiarPool.deckId} must contain only familiar cards`
      );
    }

    player.unboughtFamiliar = factory.create(
      firstCandidate.definitionId,
      player.playerId
    );
  }
}

function applyWizardPropertySetupEffects(
  players: PlayerState[],
  dataPack: LoadedDataPack,
  factory: InstanceFactory
): void {
  for (const player of players) {
    for (const property of player.wizardProperties) {
      const definition = dataPack.tokenDefinitions.get(property.definitionId);
      if (
        definition?.kind !== "wizardProperty" ||
        definition.engine === undefined ||
        !definition.engine.playableInV0
      ) {
        continue;
      }

      for (const effect of definition.engine.effects) {
        if (!isSetupEffect(effect)) {
          continue;
        }

        applyWizardPropertySetupEffect(player, dataPack, factory, effect);
      }
    }
  }
}

function isSetupEffect(effect: unknown): effect is Record<string, unknown> {
  if (typeof effect !== "object" || effect === null || Array.isArray(effect)) {
    return false;
  }

  const record = effect as Record<string, unknown>;
  return record["timing"] === "setup";
}

function applyWizardPropertySetupEffect(
  player: PlayerState,
  dataPack: LoadedDataPack,
  factory: InstanceFactory,
  effect: Record<string, unknown>
): void {
  if (effect["effectId"] === "replace_starting_card") {
    replaceStartingCard(player, dataPack, factory, effect);
    return;
  }

  if (effect["effectId"] === "start_with_basic_trophy") {
    if (
      !player.trophyLikeObjects.some(
        (trophy) => trophy.trophyId === "basicTrophy"
      )
    ) {
      player.trophyLikeObjects.push({
        instanceId: `setup-basic-trophy-${player.playerId}`,
        trophyId: "basicTrophy",
        ownerId: player.playerId,
        effects: [],
      });
    }
    return;
  }

  if (effect["effectId"] === "set_starting_life_total") {
    const lifeTotal = effect["lifeTotal"];
    if (
      typeof lifeTotal !== "number" ||
      !Number.isSafeInteger(lifeTotal) ||
      lifeTotal < 1
    ) {
      throw new Error(`Invalid setup life total ${String(lifeTotal)}`);
    }

    player.life.current = lifeTotal;
    player.life.max = Math.max(player.life.max, lifeTotal);
  }
}

function replaceStartingCard(
  player: PlayerState,
  dataPack: LoadedDataPack,
  factory: InstanceFactory,
  effect: Record<string, unknown>
): void {
  const fromDefinitionId = effect["fromDefinitionId"];
  const toDefinitionId = effect["toDefinitionId"];
  if (
    typeof fromDefinitionId !== "string" ||
    typeof toDefinitionId !== "string"
  ) {
    throw new Error(
      "replace_starting_card requires stable fromDefinitionId and toDefinitionId"
    );
  }

  if (!dataPack.cardDefinitions.has(toDefinitionId)) {
    if (isIncompleteFullOnlyDataPack(dataPack)) {
      return;
    }
    mustGetDefinition(dataPack, toDefinitionId);
  }

  const zones = [
    player.hand,
    player.deck,
    player.discard,
    player.playedThisTurn,
    player.permanents,
  ];
  for (const zone of zones) {
    const cardIndex = zone.findIndex(
      (card) =>
        card.ownerId === player.playerId &&
        card.definitionId === fromDefinitionId
    );
    if (cardIndex < 0) {
      continue;
    }

    zone.splice(cardIndex, 1, factory.create(toDefinitionId, player.playerId));
    return;
  }

  if (isIncompleteFullOnlyDataPack(dataPack)) {
    return;
  }

  throw new Error(
    `Cannot replace missing starting card ${fromDefinitionId} for ${player.playerId}`
  );
}

function getForcedStartingPlayer(
  players: PlayerState[],
  dataPack: LoadedDataPack
): PlayerState | undefined {
  return players.find((player) => {
    return player.wizardProperties.some((property) => {
      const definition = dataPack.tokenDefinitions.get(property.definitionId);
      if (
        definition?.kind !== "wizardProperty" ||
        definition.engine === undefined ||
        !definition.engine.playableInV0
      ) {
        return false;
      }

      return definition.engine.effects.some((effect) => {
        return (
          isSetupEffect(effect) &&
          effect["effectId"] === "force_starting_player"
        );
      });
    });
  });
}

function createPlayers(
  playerCount: number,
  dataPack: LoadedDataPack,
  factory: InstanceFactory,
  rng: RandomSource
): PlayerState[] {
  return Array.from({ length: playerCount }, (_, index) => {
    const playerId = `player-${index + 1}` as PlayerId;
    const deck = instantiateDeck(
      dataPack.decks.starterDeck,
      dataPack,
      factory,
      playerId
    );
    shuffleInPlace(deck, rng);

    const player: PlayerState = {
      playerId,
      deck,
      hand: [],
      discard: [],
      playedThisTurn: [],
      permanents: [],
      unboughtFamiliar: undefined,
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
  ownerId: PlayerId | CommonOwner
): CardInstance[] {
  const instances: CardInstance[] = [];

  for (const entry of deck.entries) {
    if (!Number.isSafeInteger(entry.count) || entry.count < 0) {
      throw new RangeError(
        `Invalid count for ${entry.cardId} in ${deck.deckId}`
      );
    }

    const definition = dataPack.cardDefinitions.get(entry.cardId);
    if (definition === undefined) {
      throw new Error(
        `Deck ${deck.deckId} references missing card definition ${entry.cardId}`
      );
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
  ownerId: PlayerId | CommonOwner
): TokenInstance[] {
  const instances: TokenInstance[] = [];

  for (const entry of stack.entries) {
    if (!Number.isSafeInteger(entry.count) || entry.count < 0) {
      throw new RangeError(
        `Invalid count for ${entry.tokenId} in ${stack.stackId}`
      );
    }

    const definition = dataPack.tokenDefinitions.get(entry.tokenId);
    if (definition === undefined) {
      throw new Error(
        `Token stack ${stack.stackId} references missing token definition ${entry.tokenId}`
      );
    }

    for (let copy = 0; copy < entry.count; copy += 1) {
      instances.push(factory.create(definition.tokenId, ownerId));
    }
  }

  return instances;
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

function mustGetDefinition(
  dataPack: LoadedDataPack,
  definitionId: string
): CardDefinition {
  const definition = dataPack.cardDefinitions.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Missing card definition ${definitionId}`);
  }

  return definition;
}

function createInstanceFactory(): InstanceFactory {
  let nextId = 1;

  return {
    create(
      definitionId: string,
      ownerId: PlayerId | CommonOwner
    ): CardInstance {
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
    create(
      definitionId: string,
      ownerId: PlayerId | CommonOwner
    ): TokenInstance {
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
