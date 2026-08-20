import {
  applyAction,
  listLegalActions,
  type GameAction,
  type LegalAction,
} from "./actions.js";
import { assertNever } from "../common.js";
import type {
  CardDefinition,
  LoadedDataPack,
  TokenDefinition,
} from "./data.js";
import {
  calculateEffectiveCardCost,
  calculateEffectiveCardVictoryPoints,
  calculateEffectivePlayerVictoryPoints,
  calculateEffectiveTokenVictoryPoints,
  getOwnedScoringCards,
} from "./effective-values.js";
import { recordBotActionSelected } from "./event-recorder.js";
import {
  initializeGame,
  type CardInstance,
  type GameEvent,
  type GameState,
  type PlayerId,
  type PlayerDecisionView,
  type PlayerState,
  type RuntimeEffectDecisionChoice,
  type RuntimeEffectChoiceRequest,
  type TokenInstance,
} from "./setup.js";
import { assertGameStateInvariants } from "./invariants.js";
import { createPlayerDecisionView } from "./strategy-decision-view.js";

export type GameEndReason =
  | "deadWizardTokensExhausted"
  | "mainDeckExhausted"
  | "legendDeckExhausted"
  | "playerDefeated"
  | "maxTurnsReached";

export interface RunSingleGameOptions {
  rootDir: string;
  seed: number;
  maxTurns: number;
  playerCount?: number;
  dataPackPath?: string;
  dataPack?: LoadedDataPack;
  bot?: BotStrategy;
  botFactory?: (playerId: PlayerId) => BotStrategy;
  validateInvariants?: boolean;
}

export interface BotDecisionContext {
  player: PlayerDecisionView;
  legalActions: readonly BotDecisionAction[];
}

export type BotDecisionAction =
  | Exclude<LegalAction, { type: "buyMarketCard" }>
  | (Extract<LegalAction, { type: "buyMarketCard" }> & {
      readonly cost: number;
    });

export interface BotStrategy {
  chooseAction(context: BotDecisionContext): GameAction;
  chooseEffectChoice?(
    request: RuntimeEffectChoiceRequest
  ): RuntimeEffectDecisionChoice | undefined;
}

interface PlayerBotBinding {
  readonly strategy: BotStrategy;
  readonly chooseAction: BotStrategy["chooseAction"];
  readonly chooseEffectChoice: BotStrategy["chooseEffectChoice"];
}

export interface SetupCardSnapshot {
  instanceId: string;
  definitionId: string;
  marketChips: number;
}

export interface SetupTokenSnapshot {
  instanceId: string;
  definitionId: string;
}

export interface SetupPlayerSnapshot {
  playerId: PlayerId;
  handSize: number;
  deckSize: number;
  life: number;
  maxLife: number;
  chips: number;
  hand: SetupCardSnapshot[];
  wizardProperties: SetupTokenSnapshot[];
  statuses: string[];
  unboughtFamiliar?: SetupCardSnapshot;
}

export interface SetupStateSnapshot {
  players: SetupPlayerSnapshot[];
  mainMarket: SetupCardSnapshot[];
  legendMarket: SetupCardSnapshot[];
  mainDeckSize: number;
  legendDeckSize: number;
  wildMagicStackSize: number;
  limpWandStackSize: number;
  deadWizardTokenStackSize: number;
}

export interface SingleGameResult {
  seed: number;
  endReason: GameEndReason;
  isGameEnd: boolean;
  turnsElapsed: number;
  players: PlayerScore[];
  winnerIds: PlayerId[];
  isTie: boolean;
  eventLog: GameEvent[];
  setupState?: SetupStateSnapshot;
}

export interface PlayerScore {
  playerId: PlayerId;
  victoryPoints: number;
  legendCount: number;
  deadWizardTokenCount: number;
}

export const baselineBot: BotStrategy = {
  chooseAction({ legalActions }: BotDecisionContext): GameAction {
    const playAction = legalActions.find(
      (action) => action.type === "playCard"
    );
    if (playAction !== undefined) {
      return playAction;
    }

    const buyActions = legalActions
      .filter(
        (
          action
        ): action is Extract<BotDecisionAction, { type: "buyMarketCard" }> => {
          return action.type === "buyMarketCard";
        }
      )
      .sort((left, right) => right.cost - left.cost);
    const buyAction = buyActions[0];
    if (buyAction !== undefined) {
      return buyAction;
    }

    return { type: "endTurn" };
  },
};

function createBaselineBot(): BotStrategy {
  return {
    chooseAction(context) {
      return baselineBot.chooseAction(context);
    },
  };
}

function mustGetActivePlayer(state: GameState): PlayerState {
  const player = state.players.find(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  if (player === undefined) {
    throw new Error(`Active player ${state.activePlayerId} is missing`);
  }
  return player;
}

function createBotDecisionActions(
  state: GameState,
  legalActions: readonly LegalAction[]
): BotDecisionAction[] {
  const activePlayer = mustGetActivePlayer(state);
  return legalActions.map((action) =>
    action.type === "buyMarketCard"
      ? { ...action, cost: getBuyActionCost(state, activePlayer, action) }
      : action
  );
}

function getBuyActionCost(
  state: GameState,
  activePlayer: PlayerState,
  action: Extract<LegalAction, { type: "buyMarketCard" }>
): number {
  if (action.source === "wildMagicStack") {
    return 3;
  }
  const card = [
    ...state.common.market,
    ...state.common.legendMarket,
    activePlayer.unboughtFamiliar,
  ].find((candidate) => candidate?.instanceId === action.cardInstanceId);
  if (card === undefined) {
    throw new Error(`Legal buy target ${action.cardInstanceId} is missing`);
  }
  return calculateEffectiveCardCost(
    state,
    activePlayer.playerId,
    mustGetCardDefinition(state, card)
  );
}

function mustGetCardDefinition(
  state: GameState,
  card: CardInstance
): CardDefinition {
  const definition = state.cardDefinitions.get(card.definitionId);
  if (definition === undefined) {
    throw new Error(`Missing card definition ${card.definitionId}`);
  }
  return definition;
}

export function runSingleGame(options: RunSingleGameOptions): SingleGameResult {
  const { bot, botFactory, dataPack, ...initializeGameOptions } = options;
  if (dataPack !== undefined && options.dataPackPath !== undefined) {
    throw new Error("dataPack and dataPackPath cannot be used together");
  }
  if (bot !== undefined && bot !== baselineBot) {
    throw new Error("Custom multiplayer bot must use botFactory");
  }
  const strategyFactory =
    botFactory ??
    (bot === undefined || bot === baselineBot
      ? () => createBaselineBot()
      : () => bot);
  const botBindingsByPlayerId = new Map<PlayerId, PlayerBotBinding>();
  const playerIdByStrategy = new WeakMap<BotStrategy, PlayerId>();
  const playerIdByCallback = new Map<
    | BotStrategy["chooseAction"]
    | NonNullable<BotStrategy["chooseEffectChoice"]>,
    PlayerId
  >();

  function getBotBindingForPlayer(playerId: PlayerId): PlayerBotBinding {
    const existingBinding = botBindingsByPlayerId.get(playerId);
    if (existingBinding !== undefined) {
      return existingBinding;
    }

    const strategy = strategyFactory(playerId);
    const assignedStrategyPlayerId = playerIdByStrategy.get(strategy);
    if (
      assignedStrategyPlayerId !== undefined &&
      assignedStrategyPlayerId !== playerId
    ) {
      throw new Error(
        `BotStrategy object is already assigned to ${assignedStrategyPlayerId}; create a separate strategy for ${playerId}`
      );
    }
    const chooseAction = strategy.chooseAction;
    const chooseEffectChoice = strategy.chooseEffectChoice;
    const callbacks: ReadonlyArray<
      readonly [
        "chooseAction" | "chooseEffectChoice",
        (
          | BotStrategy["chooseAction"]
          | NonNullable<BotStrategy["chooseEffectChoice"]>
        ),
      ]
    > = [
      ["chooseAction", chooseAction],
      ...(chooseEffectChoice === undefined
        ? []
        : ([["chooseEffectChoice", chooseEffectChoice]] as const)),
    ];
    for (const [callbackName, callback] of callbacks) {
      const assignedPlayerId = playerIdByCallback.get(callback);
      if (assignedPlayerId !== undefined && assignedPlayerId !== playerId) {
        throw new Error(
          `${callbackName} callback is already assigned to ${assignedPlayerId}; create a separate callback for ${playerId}`
        );
      }
    }
    for (const [, callback] of callbacks) {
      playerIdByCallback.set(callback, playerId);
    }
    playerIdByStrategy.set(strategy, playerId);
    const binding = { strategy, chooseAction, chooseEffectChoice };
    botBindingsByPlayerId.set(playerId, binding);
    return binding;
  }

  const effectChoiceStrategy = (request: RuntimeEffectChoiceRequest) => {
    const binding = getBotBindingForPlayer(request.player.playerId);
    return binding.chooseEffectChoice?.call(binding.strategy, request);
  };
  const state =
    dataPack === undefined
      ? initializeGame({ ...initializeGameOptions, effectChoiceStrategy })
      : initializeGame({
          dataPack,
          seed: options.seed,
          ...(options.playerCount === undefined
            ? {}
            : { playerCount: options.playerCount }),
          effectChoiceStrategy,
        });
  const setupState = snapshotSetupState(state);
  if (options.validateInvariants) {
    assertGameStateInvariants(state);
  }
  const actionLimit = options.maxTurns * 200;
  let actionsApplied = 0;

  while (true) {
    if (options.validateInvariants) {
      assertGameStateInvariants(state);
    }
    const endReason = getGameEndReason(state);
    if (endReason !== undefined) {
      return summarizeGame(state, endReason, true, setupState);
    }

    if (state.turn.number > options.maxTurns) {
      return summarizeGame(state, "maxTurnsReached", false, setupState);
    }

    if (actionsApplied >= actionLimit) {
      throw new Error(`Bot exceeded ${actionLimit} actions before maxTurns`);
    }

    const activePlayer = mustGetActivePlayer(state);
    const legalActions = listLegalActions(state);
    const binding = getBotBindingForPlayer(activePlayer.playerId);
    const selectedAction = binding.chooseAction.call(binding.strategy, {
      player: createPlayerDecisionView(activePlayer),
      legalActions: createBotDecisionActions(state, legalActions),
    });
    if (!isLegalAction(selectedAction, legalActions)) {
      throw new Error(`Bot selected illegal action ${selectedAction.type}`);
    }

    recordBotActionSelected(state, selectedAction);
    const result = applyAction(state, selectedAction);
    if (!result.ok) {
      throw new Error(`Legal action failed: ${result.error}`);
    }
    if (options.validateInvariants) {
      assertGameStateInvariants(state);
    }
    if (result.gameEndReason !== undefined) {
      return summarizeGame(
        state,
        result.gameEndReason,
        true,
        setupState,
        result.winnerPlayerId
      );
    }
    actionsApplied += 1;
  }
}

export function scoreGame(state: GameState): PlayerScore[] {
  return state.players.map((player) => {
    const scoringCards = getOwnedScoringCards(state, player.playerId);
    const cardDefinitions = scoringCards.map((object) => object.definition);
    const deadWizardTokenDefinitions = player.deadWizardTokens.map((token) =>
      mustGetTokenDefinition(state, token)
    );

    return {
      playerId: player.playerId,
      victoryPoints:
        scoringCards.reduce((total, object) => {
          return (
            total +
            calculateEffectiveCardVictoryPoints(
              state,
              player.playerId,
              object.definition,
              object.card
            )
          );
        }, 0) +
        deadWizardTokenDefinitions.reduce((total, definition) => {
          return (
            total +
            calculateEffectiveTokenVictoryPoints(
              state,
              player.playerId,
              definition
            )
          );
        }, 0) +
        calculateEffectivePlayerVictoryPoints(state, player.playerId, 0),
      legendCount: cardDefinitions.filter(
        (definition) => definition.engine.cardKind === "legend"
      ).length,
      deadWizardTokenCount: player.deadWizardTokens.length,
    };
  });
}

function summarizeGame(
  state: GameState,
  endReason: GameEndReason,
  isGameEnd: boolean,
  setupState: SetupStateSnapshot,
  winnerPlayerId?: PlayerId
): SingleGameResult {
  const players = scoreGame(state);
  const winnerIds =
    winnerPlayerId === undefined
      ? determineWinnerIds(players)
      : [winnerPlayerId];

  return {
    seed: state.seed,
    endReason,
    isGameEnd,
    turnsElapsed: state.turn.number - 1,
    players,
    winnerIds,
    isTie: winnerIds.length > 1,
    eventLog: [...state.eventLog],
    setupState,
  };
}

function snapshotSetupState(state: GameState): SetupStateSnapshot {
  return {
    players: state.players.map((player) => {
      const familiar = snapshotOptionalCard(player.unboughtFamiliar);
      return {
        playerId: player.playerId,
        handSize: player.hand.length,
        deckSize: player.deck.length,
        life: player.life.current,
        maxLife: player.life.max,
        chips: player.chips,
        hand: player.hand.map(snapshotCard),
        wizardProperties: player.wizardProperties.map(snapshotToken),
        statuses: player.statuses.map((status) => status.statusId),
        ...(familiar === undefined ? {} : { unboughtFamiliar: familiar }),
      };
    }),
    mainMarket: state.common.market.map(snapshotCard),
    legendMarket: state.common.legendMarket.map(snapshotCard),
    mainDeckSize: state.common.mainDeck.length,
    legendDeckSize: state.common.legendDeck.length,
    wildMagicStackSize: state.common.wildMagicStack.length,
    limpWandStackSize: state.common.limpWandStack.length,
    deadWizardTokenStackSize: state.common.deadWizardTokens.drawStack.length,
  };
}

function snapshotOptionalCard(
  card: CardInstance | undefined
): SetupCardSnapshot | undefined {
  return card === undefined ? undefined : snapshotCard(card);
}

function snapshotCard(card: CardInstance): SetupCardSnapshot {
  return {
    instanceId: card.instanceId,
    definitionId: card.definitionId,
    marketChips: card.marketChips,
  };
}

function snapshotToken(token: TokenInstance): SetupTokenSnapshot {
  return {
    instanceId: token.instanceId,
    definitionId: token.definitionId,
  };
}

export function getGameEndReason(state: GameState): GameEndReason | undefined {
  if (
    state.common.deadWizardTokens.status === "available" &&
    state.common.deadWizardTokens.drawStack.length === 0
  ) {
    return "deadWizardTokensExhausted";
  }

  return undefined;
}

export function determineWinnerIds(
  players: readonly PlayerScore[]
): PlayerId[] {
  const sorted = [...players].sort(compareScores);
  const best = sorted[0];
  if (best === undefined) {
    return [];
  }

  return sorted
    .filter((player) => compareScores(player, best) === 0)
    .map((player) => player.playerId);
}

function compareScores(left: PlayerScore, right: PlayerScore): number {
  return (
    right.victoryPoints - left.victoryPoints ||
    right.legendCount - left.legendCount ||
    left.deadWizardTokenCount - right.deadWizardTokenCount
  );
}

function isLegalAction(
  action: GameAction,
  legalActions: readonly LegalAction[]
): boolean {
  return legalActions.some((legalAction) => {
    switch (action.type) {
      case "playCard":
        return (
          legalAction.type === "playCard" &&
          legalAction.cardInstanceId === action.cardInstanceId
        );
      case "buyMarketCard":
        return (
          legalAction.type === "buyMarketCard" &&
          legalAction.cardInstanceId === action.cardInstanceId &&
          legalAction.source === action.source
        );
      case "activatePermanent":
        return (
          legalAction.type === "activatePermanent" &&
          legalAction.cardInstanceId === action.cardInstanceId
        );
      case "activateWizardProperty":
        return (
          legalAction.type === "activateWizardProperty" &&
          legalAction.tokenInstanceId === action.tokenInstanceId
        );
      case "endTurn":
        return legalAction.type === "endTurn";
      default:
        return assertNever(action);
    }
  });
}

function mustGetTokenDefinition(
  state: GameState,
  token: TokenInstance
): TokenDefinition {
  const definition = state.tokenDefinitions.get(token.definitionId);
  if (definition === undefined) {
    throw new Error(`Missing token definition ${token.definitionId}`);
  }

  return definition;
}
