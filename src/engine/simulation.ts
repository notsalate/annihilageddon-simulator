import { applyAction, listLegalActions, type GameAction, type LegalAction } from "./actions.js";
import type { CardDefinition, TokenDefinition } from "./data.js";
import {
  calculateEffectiveCardCost,
  calculateEffectiveCardVictoryPoints,
  calculateEffectivePlayerVictoryPoints,
  calculateEffectiveTokenVictoryPoints,
} from "./effective-values.js";
import { recordBotActionSelected } from "./event-recorder.js";
import { initializeGame, type CardInstance, type GameEvent, type GameState, type PlayerId, type TokenInstance } from "./setup.js";

export type GameEndReason =
  | "deadWizardTokensExhausted"
  | "mainDeckExhausted"
  | "legendDeckExhausted"
  | "maxTurnsReached";

export interface RunSingleGameOptions {
  rootDir: string;
  seed: number;
  maxTurns: number;
  playerCount?: number;
  dataPackPath?: string;
  bot?: BotStrategy;
}

export interface BotDecisionContext {
  state: GameState;
  legalActions: readonly LegalAction[];
}

export interface BotStrategy {
  chooseAction(context: BotDecisionContext): GameAction;
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
}

export interface PlayerScore {
  playerId: PlayerId;
  victoryPoints: number;
  legendCount: number;
  deadWizardTokenCount: number;
}

export const baselineBot: BotStrategy = {
  chooseAction({ state, legalActions }: BotDecisionContext): GameAction {
    const playAction = legalActions.find((action) => action.type === "playCard");
    if (playAction !== undefined) {
      return playAction;
    }

    const buyActions = legalActions
      .filter((action): action is Extract<LegalAction, { type: "buyMarketCard" }> => {
        return action.type === "buyMarketCard";
      })
      .sort((left, right) => {
        return getBuyActionCost(state, right) - getBuyActionCost(state, left);
      });
    const buyAction = buyActions[0];
    if (buyAction !== undefined) {
      return buyAction;
    }

    return { type: "endTurn" };
  },
};

export function runSingleGame(options: RunSingleGameOptions): SingleGameResult {
  const state = initializeGame(options);
  const bot = options.bot ?? baselineBot;
  const actionLimit = options.maxTurns * 200;
  let actionsApplied = 0;

  while (true) {
    const endReason = getGameEndReason(state);
    if (endReason !== undefined) {
      return summarizeGame(state, endReason, true);
    }

    if (state.turn.number > options.maxTurns) {
      return summarizeGame(state, "maxTurnsReached", false);
    }

    if (actionsApplied >= actionLimit) {
      throw new Error(`Bot exceeded ${actionLimit} actions before maxTurns`);
    }

    const legalActions = listLegalActions(state);
    const selectedAction = bot.chooseAction({ state, legalActions });
    if (!isLegalAction(selectedAction, legalActions)) {
      throw new Error(`Bot selected illegal action ${selectedAction.type}`);
    }

    recordBotActionSelected(state, selectedAction);
    const result = applyAction(state, selectedAction);
    if (!result.ok) {
      throw new Error(`Legal action failed: ${result.error}`);
    }
    if (result.gameEndReason !== undefined) {
      return summarizeGame(state, result.gameEndReason, true);
    }
    actionsApplied += 1;
  }
}

export function scoreGame(state: GameState): PlayerScore[] {
  return state.players.map((player) => {
    const cards = [
      ...player.hand,
      ...player.deck,
      ...player.discard,
      ...player.playedThisTurn,
      ...player.permanents.filter((card) => card.ownerId === player.playerId),
    ];
    const cardDefinitions = cards.map((card) => mustGetDefinition(state, card));
    const deadWizardTokenDefinitions = player.deadWizardTokens.map((token) => mustGetTokenDefinition(state, token));

    return {
      playerId: player.playerId,
      victoryPoints:
        cardDefinitions.reduce((total, definition) => {
          return total + calculateEffectiveCardVictoryPoints(state, player.playerId, definition);
        }, 0) +
        deadWizardTokenDefinitions.reduce((total, definition) => {
          return total + calculateEffectiveTokenVictoryPoints(state, player.playerId, definition);
        }, 0) +
        calculateEffectivePlayerVictoryPoints(state, player.playerId, 0),
      legendCount: cardDefinitions.filter((definition) => definition.engine.cardKind === "legend").length,
      deadWizardTokenCount: player.deadWizardTokens.length,
    };
  });
}

function summarizeGame(state: GameState, endReason: GameEndReason, isGameEnd: boolean): SingleGameResult {
  const players = scoreGame(state);
  const winnerIds = determineWinnerIds(players);

  return {
    seed: state.seed,
    endReason,
    isGameEnd,
    turnsElapsed: state.turn.number - 1,
    players,
    winnerIds,
    isTie: winnerIds.length > 1,
    eventLog: [...state.eventLog],
  };
}

export function getGameEndReason(state: GameState): GameEndReason | undefined {
  if (state.common.deadWizardTokens.status === "available" && state.common.deadWizardTokens.drawStack.length === 0) {
    return "deadWizardTokensExhausted";
  }

  return undefined;
}

export function determineWinnerIds(players: readonly PlayerScore[]): PlayerId[] {
  const sorted = [...players].sort(compareScores);
  const best = sorted[0];
  if (best === undefined) {
    return [];
  }

  return sorted.filter((player) => compareScores(player, best) === 0).map((player) => player.playerId);
}

function compareScores(left: PlayerScore, right: PlayerScore): number {
  return (
    right.victoryPoints - left.victoryPoints ||
    right.legendCount - left.legendCount ||
    left.deadWizardTokenCount - right.deadWizardTokenCount
  );
}

function isLegalAction(action: GameAction, legalActions: readonly LegalAction[]): boolean {
  return legalActions.some((legalAction) => {
    switch (action.type) {
      case "playCard":
        return legalAction.type === "playCard" && legalAction.cardInstanceId === action.cardInstanceId;
      case "buyMarketCard":
        return (
          legalAction.type === "buyMarketCard" &&
          legalAction.cardInstanceId === action.cardInstanceId &&
          legalAction.source === action.source
        );
      case "activatePermanent":
        return legalAction.type === "activatePermanent" && legalAction.cardInstanceId === action.cardInstanceId;
      case "activateWizardProperty":
        return legalAction.type === "activateWizardProperty" && legalAction.tokenInstanceId === action.tokenInstanceId;
      case "endTurn":
        return legalAction.type === "endTurn";
    }
  });
}

function getBuyActionCost(state: GameState, action: Extract<LegalAction, { type: "buyMarketCard" }>): number {
  if (action.source === "wildMagicStack") {
    return 3;
  }

  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  const card = [...state.common.market, ...state.common.legendMarket, activePlayer?.unboughtFamiliar].find((candidate) => {
    return candidate !== undefined && candidate.instanceId === action.cardInstanceId;
  });
  if (card === undefined) {
    return 0;
  }

  return calculateEffectiveCardCost(state, state.activePlayerId, mustGetDefinition(state, card));
}

function mustGetDefinition(state: GameState, card: CardInstance): CardDefinition {
  const definition = state.cardDefinitions.get(card.definitionId);
  if (definition === undefined) {
    throw new Error(`Missing card definition ${card.definitionId}`);
  }

  return definition;
}

function mustGetTokenDefinition(state: GameState, token: TokenInstance): TokenDefinition {
  const definition = state.tokenDefinitions.get(token.definitionId);
  if (definition === undefined) {
    throw new Error(`Missing token definition ${token.definitionId}`);
  }

  return definition;
}
