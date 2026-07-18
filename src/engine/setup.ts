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
import {
  recordGameEvent,
  recordSetupChoiceSelected,
} from "./event-recorder.js";
import {
  tryExecuteSetupEffect,
  type EffectRuntimeSetupServices,
  type SetupDirective,
  type SetupEffectSourceContext,
} from "./effect-runtime-registry.js";
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

export type GameEventSourceType = "card" | "wizardProperty" | "setup" | "turn";

export type GameEventDestination =
  | "discard"
  | "deckTop"
  | "discardSelf"
  | "topdeckSelf";
export type SetupChoicePolicyId = "alwaysPickFirst";

export interface GameEventMetadata {
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
  choiceKind?: RuntimeEffectChoice["choiceKind"];
  choiceIds?: string[];
  direction?: "left" | "right";
  legalChoiceCount?: number;
  amount?: number;
  destination?: GameEventDestination;
  targetCardInstanceIds?: string[];
  targetDefinitionIds?: string[];
  participantPlayerIds?: PlayerId[];
  winnerPlayerIds?: PlayerId[];
  sourceType?: GameEventSourceType;
  setupChoiceKind?: "familiar" | "wizardProperty";
  policyId?: SetupChoicePolicyId;
  candidateDefinitionIds?: string[];
  chosenDefinitionId?: string;
}

type GameEventOptionalFields<TType extends GameEventType> = TType extends
  | "attackCreated"
  | "attackTargetStarted"
  ? "targetPlayerId" | "amount"
  : TType extends "cardBought"
    ?
        | "sourceZone"
        | "powerBefore"
        | "powerAfter"
        | "chipsBefore"
        | "chipsAfter"
        | "amount"
    : TType extends "cardMoved"
      ? "effectId" | "sourceType"
      : TType extends "defenseCostPaid"
        ?
            | "targetCardInstanceId"
            | "targetDefinitionId"
            | "amount"
            | "chipsBefore"
            | "chipsAfter"
            | "lifeBefore"
            | "lifeAfter"
        : TType extends "effectAddPowerApplied"
          ? "powerBefore" | "powerAfter"
          : TType extends "effectCardGained"
            ? "destination"
            : TType extends "effectChipsChanged"
              ? "targetPlayerId" | "amount" | "chipsBefore" | "chipsAfter"
              : TType extends "effectChipsGained"
                ?
                    | "tokenInstanceId"
                    | "tokenDefinitionId"
                    | "amount"
                    | "chipsBefore"
                    | "chipsAfter"
                : TType extends "effectChoiceSkipped"
                  ? "legalChoiceCount"
                  : TType extends "effectCostPaid"
                    ? "costId" | "amount"
                    : TType extends
                          | "effectLifeSet"
                          | "effectLifeHealed"
                          | "effectDamageDealt"
                      ? "targetLifeBefore" | "targetLifeAfter"
                      : TType extends "effectPlayTopFoeDeckSkipped"
                        ? "targetPlayerId"
                        : TType extends "mayhemBattleParticipationSelected"
                          ? "participantPlayerIds"
                          : TType extends "mayhemBattleResolved"
                            ? "participantPlayerIds" | "winnerPlayerIds"
                            : TType extends "mayhemDecisionPhaseStarted"
                              ? "choiceKind" | "amount"
                              : TType extends "mayhemDecisionStarted"
                                ? "targetPlayerId" | "amount"
                                : TType extends "mayhemResolutionPhaseStarted"
                                  ? "amount"
                                  : TType extends "mayhemVoteResolved"
                                    ? "winnerPlayerIds"
                                    : TType extends "mayhemDeckDiscardedThenDiscardCardDestroyed"
                                      ?
                                          | "targetCardInstanceId"
                                          | "targetDefinitionId"
                                      : never;

type GameEventShape<
  TType extends GameEventType,
  TRequiredFields extends keyof GameEventPayload = never,
  TOptionalFields extends keyof GameEventPayload = never,
> = GameEventMetadata & { type: TType } & Required<
    Pick<GameEventPayload, TRequiredFields>
  > &
  Partial<Pick<GameEventPayload, TOptionalFields>> & {
    [K in Exclude<
      keyof GameEventPayload,
      TRequiredFields | TOptionalFields
    >]?: never;
  };

type GameEventOf<
  TType extends GameEventType,
  TRequiredFields extends keyof GameEventPayload = never,
> = TType extends GameEventType
  ? GameEventShape<TType, TRequiredFields, GameEventOptionalFields<TType>>
  : never;

type CardEffectEvent = GameEventOf<
  | "dinglerStatusGained"
  | "dinglerStatusRemoved"
  | "attackCreated"
  | "attackTargetStarted"
  | "effectChipsChanged"
  | "effectChipsGained"
  | "effectChoiceSkipped"
  | "effectCostPaid"
  | "effectDestroyTopMainDeckSkipped"
  | "effectPlayTopFoeDeckSkipped"
  | "effectPlayTopSkipped"
  | "effectRevealSkipped"
  | "mayhemDecisionPhaseStarted"
  | "mayhemDecisionStarted"
  | "mayhemResolutionPhaseStarted"
  | "mayhemVoteResolved"
  | "wildMagicChoiceSelected"
  | "wildMagicChoiceSkipped",
  "playerId" | "cardInstanceId" | "definitionId" | "effectId" | "sourceType"
>;

type EffectChoiceSelectedTarget =
  | {
      choiceKind: "playerTarget";
      targetPlayerId: PlayerId;
      choiceId?: never;
      choiceIds?: never;
      legalChoiceCount?: never;
      targetPlayerIds?: never;
      targetCardInstanceId?: never;
      targetDefinitionId?: never;
      targetCardInstanceIds?: never;
      targetDefinitionIds?: never;
      amount?: never;
      direction?: never;
    }
  | {
      choiceKind: "cardTarget";
      targetCardInstanceId: string;
      targetDefinitionId: string;
      choiceId?: never;
      choiceIds?: never;
      legalChoiceCount?: never;
      targetPlayerId?: never;
      targetPlayerIds?: never;
      targetCardInstanceIds?: never;
      targetDefinitionIds?: never;
      amount?: never;
      direction?: never;
    }
  | {
      choiceKind: "option";
      choiceId: string;
      choiceIds: string[];
      legalChoiceCount: number;
      targetPlayerId?: never;
      targetPlayerIds?: never;
      targetCardInstanceId?: never;
      targetDefinitionId?: never;
      targetCardInstanceIds?: never;
      targetDefinitionIds?: never;
      amount?: never;
      direction?: never;
    }
  | {
      choiceKind: "playerTarget";
      choiceId: string;
      choiceIds: string[];
      legalChoiceCount: number;
      targetPlayerIds: PlayerId[];
      targetPlayerId?: PlayerId;
      targetCardInstanceId?: never;
      targetDefinitionId?: never;
      targetCardInstanceIds?: never;
      targetDefinitionIds?: never;
      amount?: never;
      direction?: never;
    }
  | {
      choiceKind: "cardTarget";
      choiceId: string;
      choiceIds: string[];
      legalChoiceCount: number;
      targetCardInstanceIds: string[];
      targetDefinitionIds: string[];
      amount: number;
      targetPlayerId?: never;
      targetPlayerIds?: never;
      targetCardInstanceId?: string;
      targetDefinitionId?: string;
      direction?: never;
    }
  | {
      choiceKind: "directionalPlayerTarget";
      choiceId: string;
      choiceIds: string[];
      legalChoiceCount: number;
      direction: "left" | "right";
      targetPlayerIds: PlayerId[];
      targetPlayerId?: never;
      targetCardInstanceId?: never;
      targetDefinitionId?: never;
      targetCardInstanceIds?: never;
      targetDefinitionIds?: never;
      amount?: never;
    };

type EffectChoiceSelectedEvent = GameEventShape<
  "effectChoiceSelected",
  "playerId" | "cardInstanceId" | "definitionId" | "effectId" | "sourceType",
  | "targetPlayerId"
  | "targetCardInstanceId"
  | "targetDefinitionId"
  | "choiceKind"
  | "choiceId"
  | "choiceIds"
  | "legalChoiceCount"
  | "targetPlayerIds"
  | "targetCardInstanceIds"
  | "targetDefinitionIds"
  | "amount"
  | "direction"
  | "tokenInstanceId"
  | "tokenDefinitionId"
> &
  EffectChoiceSelectedTarget;

type TargetedCardEffectEvent = GameEventOf<
  | "attackAvoided"
  | "effectLifeExchanged"
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

type TargetedAmountCardEffectEvent = GameEventOf<
  "effectDamageDealt" | "effectLifeHealed" | "effectLifeSet",
  | "playerId"
  | "targetPlayerId"
  | "cardInstanceId"
  | "definitionId"
  | "effectId"
  | "amount"
  | "sourceType"
>;

type CardTargetEffectEvent = GameEventOf<
  | "effectCardDestroyed"
  | "effectCardDiscarded"
  | "effectCardGained"
  | "effectCardPlayedFromDeck"
  | "effectCardRevealed"
  | "effectTopMainDeckCardDestroyed",
  | "playerId"
  | "cardInstanceId"
  | "definitionId"
  | "targetCardInstanceId"
  | "targetDefinitionId"
  | "effectId"
  | "sourceType"
>;

type FoeDeckCardPlayedEffectEvent = GameEventOf<
  "effectFoeDeckCardPlayed",
  | "playerId"
  | "targetPlayerId"
  | "cardInstanceId"
  | "definitionId"
  | "targetCardInstanceId"
  | "targetDefinitionId"
  | "effectId"
  | "sourceType"
>;

type CardTargetAmountEffectEvent = GameEventOf<
  "effectFixtureTargetCostPowerApplied",
  | "playerId"
  | "cardInstanceId"
  | "definitionId"
  | "targetCardInstanceId"
  | "targetDefinitionId"
  | "effectId"
  | "amount"
  | "sourceType"
>;

type AmountCardEffectEvent = GameEventOf<
  | "effectAddPowerApplied"
  | "effectCardsReturnedToHand"
  | "effectDrawCardsApplied"
  | "mayhemBattleParticipationSelected"
  | "mayhemBattleResolved"
  | "mayhemDeckDiscardedThenDiscardCardDestroyed"
  | "mayhemDiscardedTopDeckCardsDestroyed"
  | "mayhemHandDiscardedAndRedrawn"
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
  | EffectChoiceSelectedEvent
  | TargetedCardEffectEvent
  | CardTargetEffectEvent
  | FoeDeckCardPlayedEffectEvent
  | AmountCardEffectEvent
  | TargetedAmountCardEffectEvent
  | CardTargetAmountEffectEvent
  | GameEventOf<"activatePermanent", "playerId" | "cardInstanceId">
  | GameEventOf<"activateWizardProperty", "playerId" | "tokenInstanceId">
  | GameEventOf<"buyMarketCard", "playerId" | "cardInstanceId" | "sourceZone">
  | GameEventOf<"endTurn" | "playCard", "playerId">;

export type GameEvent = GameEventPayloadUnion;
export type GameEventForTrace = GameEvent;

type WithoutGameEventMetadata<TEvent extends GameEvent> =
  TEvent extends GameEvent
    ? Omit<TEvent, keyof GameEventMetadata> & {
        [TKey in keyof GameEventMetadata]?: never;
      }
    : never;

export type GameEventDraft = WithoutGameEventMetadata<GameEvent>;
export type GameEventDraftFor<TType extends GameEventType> = Extract<
  GameEventDraft,
  { type: TType }
>;

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
  const forcedStartingPlayerId = applyWizardPropertySetupEffects(
    players,
    dataPack,
    dataPack.manifest.mappingStatus === "fixture" ? "fixture" : "combat",
    {
      hasCardDefinition: (definitionId) => dataPack.cardDefinitions.has(definitionId),
      createCardInstance: (definitionId, ownerId) =>
        factory.create(markCardDefinitionId(definitionId), ownerId),
      allowsMissingData: isIncompleteFullOnlyDataPack(dataPack),
    }
  );
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
    forcedStartingPlayerId === undefined
      ? randomActivePlayer
      : players.find((player) => player.playerId === forcedStartingPlayerId);
  if (activePlayer === undefined) {
    throw new Error(
      `Forced starting player ${String(forcedStartingPlayerId)} is missing from players`
    );
  }

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

  recordGameEvent(state, { type: "gameInitialized" });

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
  recordSetupChoiceSelected(eventLog, {
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
  runtimeMode: "combat" | "fixture",
  services: EffectRuntimeSetupServices
): PlayerId | undefined {
  let forcedStartingPlayer: PlayerId | undefined;
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

        const source: SetupEffectSourceContext = {
          sourceType: "wizardProperty",
          runtimeMode,
          playerId: player.playerId,
          tokenInstanceId: property.instanceId,
          tokenDefinitionId: property.definitionId,
        };
        const execution = tryExecuteSetupEffect(player, effect, source, services);
        if (execution.status === "executed") {
          const directive: SetupDirective | undefined = execution.directive;
          if (
            forcedStartingPlayer === undefined &&
            directive?.kind === "forceStartingPlayer"
          ) {
            forcedStartingPlayer = directive.playerId;
          }
          continue;
        }
        if (execution.status === "error") {
          throw new Error(execution.error);
        }
        throw new Error(`Unexpected setup effect execution status`);
      }
    }
  }
  return forcedStartingPlayer;
}

function isSetupEffect(effect: RuntimeEffect): boolean {
  return effect.timing === "setup";
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
