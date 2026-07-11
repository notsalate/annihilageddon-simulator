import {
  createCardInstanceId,
  createPlayerId,
  createTokenInstanceId,
  markCardDefinitionId,
  markTokenInstanceId,
  markTokenDefinitionId,
  type CardDefinitionId,
  type CardInstanceId,
  type PlayerId,
  type TokenDefinitionId,
  type TokenInstanceId,
} from "../domain/types.js";
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
import { installGameEventLog } from "./game-events.js";
import { runMarketFlow } from "./market-flow.js";
import { createSeededRng, type RandomSource } from "./rng.js";
import type { RuntimeEffect, RuntimeEffectId } from "./runtime-effect.js";

export type { PlayerId } from "../domain/types.js";
export type CommonOwner = "common";

export interface CardInstance {
  instanceId: CardInstanceId;
  definitionId: CardDefinitionId;
  ownerId: PlayerId | CommonOwner;
  marketChips: number;
}

export interface TokenInstance {
  instanceId: TokenInstanceId;
  definitionId: TokenDefinitionId;
  ownerId: PlayerId | CommonOwner;
}

export interface StatusInstance {
  instanceId: string;
  statusId: string;
  ownerId: PlayerId;
  effects: RuntimeEffect[];
}

export interface TrophyLikeInstance {
  instanceId: string;
  trophyId: string;
  ownerId: PlayerId;
  effects: RuntimeEffect[];
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

export interface RuntimeEffectChoiceOption {
  choiceKind: "option";
  choiceId: string;
}

export interface RuntimeEffectChoicePlayerTarget {
  choiceKind: "playerTarget";
  choiceId: string;
  players: readonly PlayerState[];
}

export interface RuntimeEffectChoiceCardTarget {
  choiceKind: "cardTarget";
  choiceId: string;
  cards: readonly CardInstance[];
  amount: number;
}

export interface RuntimeEffectChoiceDirectionalPlayerTarget {
  choiceKind: "directionalPlayerTarget";
  choiceId: string;
  direction: "left" | "right";
  players: readonly PlayerState[];
}

export type RuntimeEffectChoice =
  | RuntimeEffectChoiceOption
  | RuntimeEffectChoicePlayerTarget
  | RuntimeEffectChoiceCardTarget
  | RuntimeEffectChoiceDirectionalPlayerTarget;

export interface RuntimeEffectChoiceRequest {
  player: PlayerState;
  effectId: RuntimeEffectId;
  sourceType: "card" | "wizardProperty";
  cardInstanceId: string;
  definitionId: string;
  choices: readonly RuntimeEffectChoice[];
}

export type RuntimeEffectChoiceStrategy = (
  request: RuntimeEffectChoiceRequest
) => RuntimeEffectChoice | undefined;

export interface GameState {
  seed: number;
  rng: RandomSource;
  activePlayerId: PlayerId;
  turn: {
    number: number;
    power: number;
    controlledPowerBonus: number;
    activatedCardIds: string[];
    gainedCardDefinitionIds: string[];
  };
  players: PlayerState[];
  common: CommonState;
  cardDefinitions: ReadonlyMap<string, CardDefinition>;
  tokenDefinitions: ReadonlyMap<string, TokenDefinition>;
  eventLog: GameEvent[];
  effectChoiceStrategy?: RuntimeEffectChoiceStrategy;
}

export type GameEventType =
  | "activatePermanent"
  | "activateWizardProperty"
  | "attackAvoided"
  | "attackCreated"
  | "attackTargetStarted"
  | "botActionSelected"
  | "buyMarketCard"
  | "cardActivated"
  | "cardBought"
  | "cardMoved"
  | "cardPlayed"
  | "deadWizardTokenGained"
  | "defenseCardMoved"
  | "defenseChoiceSelected"
  | "defenseCostPaid"
  | "dinglerStatusGained"
  | "dinglerStatusRemoved"
  | "discardShuffledIntoDeck"
  | "effectAddPowerApplied"
  | "effectCardDestroyed"
  | "effectCardDiscarded"
  | "effectCardGained"
  | "effectCardPlayedFromDeck"
  | "effectCardRevealed"
  | "effectCardsReturnedToHand"
  | "effectChipsChanged"
  | "effectChipsGained"
  | "effectChoiceSelected"
  | "effectChoiceSkipped"
  | "effectCostPaid"
  | "effectDamageDealt"
  | "effectDestroyTopMainDeckSkipped"
  | "effectDrawCardsApplied"
  | "effectFixtureTargetCostPowerApplied"
  | "effectFoeDeckCardPlayed"
  | "effectLifeExchanged"
  | "effectLifeHealed"
  | "effectLifeSet"
  | "effectPlayTopFoeDeckSkipped"
  | "effectPlayTopSkipped"
  | "effectRevealSkipped"
  | "effectTopMainDeckCardDestroyed"
  | "endTurn"
  | "endTurnCleanupMoved"
  | "gameInitialized"
  | "handDrawn"
  | "marketChipAdded"
  | "marketChipsGained"
  | "marketEventCardOpened"
  | "marketFlowCardAdded"
  | "marketFlowFailed"
  | "mayhemBattleParticipationSelected"
  | "mayhemBattleResolved"
  | "mayhemDecisionPhaseStarted"
  | "mayhemDecisionStarted"
  | "mayhemDeckDiscardedThenDiscardCardDestroyed"
  | "mayhemDiscardedTopDeckCardsDestroyed"
  | "mayhemHandDiscardedAndRedrawn"
  | "mayhemResolutionPhaseStarted"
  | "mayhemResolved"
  | "mayhemTargetSkipped"
  | "mayhemVoteRecorded"
  | "mayhemVoteResolved"
  | "megaMayhemDestroyed"
  | "mayhemDestroyed"
  | "playCard"
  | "playerDied"
  | "playerLifeClamped"
  | "playerResurrected"
  | "setupChoiceSelected"
  | "trophyChipGranted"
  | "trophyControlChanged"
  | "turnEnded"
  | "turnStarted"
  | "wildMagicChoiceSelected"
  | "wildMagicChoiceSkipped"
  | "wizardPropertyActivated";

interface GameEventMetadata {
  eventSequence?: number;
  turnNumber?: number;
  actionSequence?: number;
  actionIdentity?: string;
}

interface GameEventPayload {
  playerId?: PlayerId;
  targetPlayerId?: PlayerId;
  targetPlayerIds?: PlayerId[];
  powerBefore?: number;
  powerAfter?: number;
  chipsBefore?: number;
  chipsAfter?: number;
  lifeBefore?: number;
  lifeAfter?: number;
  targetLifeBefore?: number;
  targetLifeAfter?: number;
  sourceZone?: string;
  destinationZone?: string;
  ownerBefore?: PlayerId | CommonOwner;
  ownerAfter?: PlayerId | CommonOwner;
  cardInstanceId?: string;
  definitionId?: string;
  targetCardInstanceId?: string;
  targetDefinitionId?: string;
  tokenInstanceId?: string;
  tokenDefinitionId?: string;
  effectId?: string;
  costId?: string;
  choiceId?: string;
  choiceIds?: string[];
  direction?: string;
  legalChoiceCount?: number;
  amount?: number;
  destination?: string;
  targetCardInstanceIds?: string[];
  targetDefinitionIds?: string[];
  participantPlayerIds?: PlayerId[];
  winnerPlayerIds?: PlayerId[];
  sourceType?: string;
  setupChoiceKind?: "familiar" | "wizardProperty";
  policyId?: string;
  candidateDefinitionIds?: string[];
  chosenDefinitionId?: string;
}

type GameEventOf<
  TType extends GameEventType,
  TFields extends keyof GameEventPayload = never,
> = GameEventMetadata & { type: TType } & Required<
    Pick<GameEventPayload, TFields>
  >;

type CardEffectEvent = GameEventOf<
  | "attackAvoided"
  | "attackCreated"
  | "attackTargetStarted"
  | "dinglerStatusGained"
  | "dinglerStatusRemoved"
  | "effectAddPowerApplied"
  | "effectCardDestroyed"
  | "effectCardDiscarded"
  | "effectCardGained"
  | "effectCardPlayedFromDeck"
  | "effectCardRevealed"
  | "effectCardsReturnedToHand"
  | "effectChipsChanged"
  | "effectChipsGained"
  | "effectChoiceSelected"
  | "effectChoiceSkipped"
  | "effectCostPaid"
  | "effectDamageDealt"
  | "effectDestroyTopMainDeckSkipped"
  | "effectDrawCardsApplied"
  | "effectFixtureTargetCostPowerApplied"
  | "effectFoeDeckCardPlayed"
  | "effectLifeExchanged"
  | "effectLifeHealed"
  | "effectLifeSet"
  | "effectPlayTopFoeDeckSkipped"
  | "effectPlayTopSkipped"
  | "effectRevealSkipped"
  | "effectTopMainDeckCardDestroyed"
  | "mayhemBattleParticipationSelected"
  | "mayhemBattleResolved"
  | "mayhemDecisionPhaseStarted"
  | "mayhemDecisionStarted"
  | "mayhemDeckDiscardedThenDiscardCardDestroyed"
  | "mayhemDiscardedTopDeckCardsDestroyed"
  | "mayhemHandDiscardedAndRedrawn"
  | "mayhemResolutionPhaseStarted"
  | "mayhemTargetSkipped"
  | "mayhemVoteRecorded"
  | "mayhemVoteResolved"
  | "trophyControlChanged"
  | "wildMagicChoiceSelected"
  | "wildMagicChoiceSkipped",
  "playerId" | "cardInstanceId" | "definitionId" | "effectId" | "sourceType"
>;

type TargetedCardEffectEvent = GameEventOf<
  | "attackAvoided"
  | "attackCreated"
  | "attackTargetStarted"
  | "effectDamageDealt"
  | "effectFoeDeckCardPlayed"
  | "effectLifeExchanged"
  | "effectLifeHealed"
  | "effectLifeSet"
  | "mayhemDecisionStarted"
  | "mayhemTargetSkipped"
  | "mayhemVoteRecorded"
  | "trophyControlChanged",
  | "playerId"
  | "targetPlayerId"
  | "cardInstanceId"
  | "definitionId"
  | "effectId"
  | "sourceType"
>;

type CardTargetEffectEvent = GameEventOf<
  | "effectCardDestroyed"
  | "effectCardDiscarded"
  | "effectCardGained"
  | "effectCardPlayedFromDeck"
  | "effectCardRevealed"
  | "effectFixtureTargetCostPowerApplied"
  | "effectFoeDeckCardPlayed"
  | "effectTopMainDeckCardDestroyed",
  | "playerId"
  | "cardInstanceId"
  | "definitionId"
  | "targetCardInstanceId"
  | "targetDefinitionId"
  | "effectId"
  | "sourceType"
>;

type AmountCardEffectEvent = GameEventOf<
  | "attackCreated"
  | "attackTargetStarted"
  | "effectAddPowerApplied"
  | "effectCardsReturnedToHand"
  | "effectDrawCardsApplied"
  | "effectFixtureTargetCostPowerApplied"
  | "effectDamageDealt"
  | "effectLifeHealed"
  | "effectLifeSet"
  | "mayhemBattleParticipationSelected"
  | "mayhemBattleResolved"
  | "mayhemDecisionPhaseStarted"
  | "mayhemDecisionStarted"
  | "mayhemDeckDiscardedThenDiscardCardDestroyed"
  | "mayhemDiscardedTopDeckCardsDestroyed"
  | "mayhemHandDiscardedAndRedrawn"
  | "mayhemResolutionPhaseStarted"
  | "mayhemVoteResolved",
  | "playerId"
  | "cardInstanceId"
  | "definitionId"
  | "effectId"
  | "amount"
  | "sourceType"
>;

type GameEventPayloadUnion =
  | GameEventOf<"gameInitialized">
  | GameEventOf<"botActionSelected", "playerId">
  | GameEventOf<
      "turnStarted" | "turnEnded" | "discardShuffledIntoDeck",
      "playerId"
    >
  | GameEventOf<
      "cardActivated" | "cardPlayed",
      "playerId" | "cardInstanceId" | "definitionId"
    >
  | GameEventOf<
      "cardMoved",
      | "playerId"
      | "cardInstanceId"
      | "definitionId"
      | "sourceZone"
      | "destinationZone"
      | "ownerBefore"
      | "ownerAfter"
    >
  | GameEventOf<
      "cardBought",
      "playerId" | "cardInstanceId" | "definitionId" | "destination"
    >
  | GameEventOf<
      "deadWizardTokenGained" | "wizardPropertyActivated",
      "playerId" | "tokenInstanceId" | "tokenDefinitionId"
    >
  | GameEventOf<
      "defenseChoiceSelected",
      "playerId" | "cardInstanceId" | "definitionId" | "effectId"
    >
  | GameEventOf<
      "defenseCardMoved",
      "playerId" | "cardInstanceId" | "definitionId" | "destination"
    >
  | GameEventOf<
      "defenseCostPaid",
      "playerId" | "cardInstanceId" | "definitionId" | "effectId"
    >
  | GameEventOf<
      "endTurnCleanupMoved",
      | "playerId"
      | "amount"
      | "sourceZone"
      | "destinationZone"
      | "targetCardInstanceIds"
      | "targetDefinitionIds"
    >
  | GameEventOf<
      "handDrawn",
      | "playerId"
      | "amount"
      | "legalChoiceCount"
      | "choiceId"
      | "destinationZone"
      | "targetCardInstanceIds"
      | "targetDefinitionIds"
    >
  | GameEventOf<
      "marketChipAdded",
      "playerId" | "sourceType" | "cardInstanceId" | "definitionId" | "amount"
    >
  | GameEventOf<
      "marketChipsGained",
      | "playerId"
      | "cardInstanceId"
      | "definitionId"
      | "amount"
      | "chipsBefore"
      | "chipsAfter"
    >
  | GameEventOf<
      | "marketEventCardOpened"
      | "marketFlowCardAdded"
      | "mayhemDestroyed"
      | "megaMayhemDestroyed",
      | "playerId"
      | "sourceType"
      | "destinationZone"
      | "cardInstanceId"
      | "definitionId"
    >
  | GameEventOf<
      "marketFlowFailed",
      "playerId" | "sourceType" | "destinationZone"
    >
  | GameEventOf<
      "mayhemResolved",
      "playerId" | "cardInstanceId" | "definitionId"
    >
  | GameEventOf<"playerDied", "playerId" | "lifeAfter">
  | GameEventOf<"playerLifeClamped", "playerId" | "amount">
  | GameEventOf<
      "playerResurrected",
      "playerId" | "amount" | "lifeBefore" | "lifeAfter"
    >
  | GameEventOf<
      "setupChoiceSelected",
      | "playerId"
      | "setupChoiceKind"
      | "policyId"
      | "candidateDefinitionIds"
      | "chosenDefinitionId"
    >
  | GameEventOf<"trophyChipGranted", "playerId" | "effectId" | "amount">
  | CardEffectEvent
  | TargetedCardEffectEvent
  | CardTargetEffectEvent
  | AmountCardEffectEvent
  | GameEventOf<"activatePermanent", "playerId" | "cardInstanceId">
  | GameEventOf<"activateWizardProperty", "playerId" | "tokenInstanceId">
  | GameEventOf<"buyMarketCard", "playerId" | "cardInstanceId" | "sourceZone">
  | GameEventOf<"endTurn" | "playCard", "playerId">;

export type GameEvent = GameEventPayloadUnion & GameEventPayload;
export type GameEventForTrace = GameEvent & Partial<GameEventPayload>;

interface InitializeGameBaseOptions {
  seed: number;
  playerCount?: number;
  effectChoiceStrategy?: RuntimeEffectChoiceStrategy;
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
  create(
    definitionId: CardDefinitionId,
    ownerId: PlayerId | CommonOwner
  ): CardInstance;
}

interface TokenInstanceFactory {
  create(
    definitionId: TokenDefinitionId,
    ownerId: PlayerId | CommonOwner
  ): TokenInstance;
}

interface SetupCandidate<TDefinitionId extends string> {
  definitionId: TDefinitionId;
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
  const setupEvents: GameEvent[] = [];

  const players = createPlayers(playerCount, dataPack, factory, rng);
  assignStartingFamiliars(
    players,
    dataPack,
    factory,
    createSeededRng(options.seed + 7919),
    setupEvents
  );
  assignStartingWizardProperties(
    players,
    dataPack,
    tokenFactory,
    rng,
    setupEvents
  );
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
      controlledPowerBonus: 0,
      activatedCardIds: [],
      gainedCardDefinitionIds: [],
    },
    players,
    common,
    cardDefinitions: dataPack.cardDefinitions,
    tokenDefinitions: dataPack.tokenDefinitions,
    eventLog: [...setupEvents],
    ...(options.effectChoiceStrategy === undefined
      ? {}
      : { effectChoiceStrategy: options.effectChoiceStrategy }),
  };
  installGameEventLog(state);

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
  assertSetupPoolSize(
    setupPool.length,
    drawStackSize,
    "Dead wizard token",
    playerCount
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
  rng: RandomSource,
  eventLog: GameEvent[]
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
  assertSetupPoolSize(
    setupPool.length,
    players.length * 2,
    "Wizard property setup pool",
    players.length
  );

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

    const selectedCandidate = alwaysPickFirstSetupChoice(
      player,
      "wizardProperty",
      [firstCandidate, secondCandidate],
      eventLog
    );

    player.wizardProperties.push({
      ...selectedCandidate,
      instanceId: markTokenInstanceId(
        `starting-${selectedCandidate.instanceId}-player-${index + 1}`
      ),
      ownerId: player.playerId,
    });
  }
}

function assignStartingFamiliars(
  players: PlayerState[],
  dataPack: LoadedDataPack,
  factory: InstanceFactory,
  rng: RandomSource,
  eventLog: GameEvent[]
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
  assertSetupPoolSize(
    setupPool.length,
    players.length * 2,
    "Familiar setup pool",
    players.length
  );

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

    const selectedCandidate = alwaysPickFirstSetupChoice(
      player,
      "familiar",
      [firstCandidate, secondCandidate],
      eventLog
    );

    player.unboughtFamiliar = factory.create(
      selectedCandidate.definitionId,
      player.playerId
    );
  }
}

function alwaysPickFirstSetupChoice<TCandidate extends SetupCandidate<string>>(
  player: PlayerState,
  setupChoiceKind: "familiar" | "wizardProperty",
  candidates: readonly [TCandidate, TCandidate],
  eventLog: GameEvent[]
): TCandidate {
  const chosenCandidate = candidates[0];
  eventLog.push({
    type: "setupChoiceSelected",
    playerId: player.playerId,
    setupChoiceKind,
    policyId: "alwaysPickFirst",
    candidateDefinitionIds: candidates.map(
      (candidate) => candidate.definitionId
    ),
    chosenDefinitionId: chosenCandidate.definitionId,
  });
  return chosenCandidate;
}

function assertSetupPoolSize(
  actualSize: number,
  requiredSize: number,
  label: string,
  playerCount: number
): void {
  if (actualSize < requiredSize) {
    throw new Error(
      `${label} requires at least ${requiredSize} entries for playerCount ${playerCount}; got ${actualSize}`
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

function isSetupEffect(effect: RuntimeEffect): boolean {
  return effect.timing === "setup";
}

function applyWizardPropertySetupEffect(
  player: PlayerState,
  dataPack: LoadedDataPack,
  factory: InstanceFactory,
  effect: RuntimeEffect
): void {
  if (effect.effectId === "replace_starting_card") {
    replaceStartingCard(player, dataPack, factory, effect);
    return;
  }

  if (effect.effectId === "start_with_basic_trophy") {
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

  if (effect.effectId === "set_starting_life_total") {
    const lifeTotal = effect.lifeTotal;
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
  effect: Extract<RuntimeEffect, { effectId: "replace_starting_card" }>
): void {
  const fromDefinitionId = effect.fromDefinitionId;
  const toDefinitionId = effect.toDefinitionId;
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

    zone.splice(
      cardIndex,
      1,
      factory.create(markCardDefinitionId(toDefinitionId), player.playerId)
    );
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
    const playerId: PlayerId = createPlayerId(index + 1);
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
      instances.push(
        factory.create(markCardDefinitionId(definition.cardId), ownerId)
      );
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
      instances.push(
        factory.create(markTokenDefinitionId(definition.tokenId), ownerId)
      );
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
      definitionId: CardDefinitionId,
      ownerId: PlayerId | CommonOwner
    ): CardInstance {
      const instance: CardInstance = {
        instanceId: createCardInstanceId(nextId),
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
      definitionId: TokenDefinitionId,
      ownerId: PlayerId | CommonOwner
    ): TokenInstance {
      const instance: TokenInstance = {
        instanceId: createTokenInstanceId(nextId),
        definitionId,
        ownerId,
      };
      nextId += 1;
      return instance;
    },
  };
}
