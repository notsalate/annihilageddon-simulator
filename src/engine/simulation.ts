import {
  applyAction,
  listLegalActions,
  type GameAction,
  type LegalAction,
} from "./actions.js";
import { assertNever } from "../common.js";
import type { CardDefinition, TokenDefinition } from "./data.js";
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
  type RuntimeEffectChoice,
  type RuntimeEffectChoiceRequest,
  type TokenInstance,
} from "./setup.js";
import { assertGameStateInvariants } from "./invariants.js";

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
  validateInvariants?: boolean;
}

export interface BotDecisionContext {
  state: GameState;
  legalActions: readonly LegalAction[];
}

export interface BotStrategy {
  chooseAction(context: BotDecisionContext): GameAction;
  chooseEffectChoice?(
    request: RuntimeEffectChoiceRequest
  ): RuntimeEffectChoice | undefined;
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
  chooseAction({ state, legalActions }: BotDecisionContext): GameAction {
    const playAction = legalActions.find(
      (action) => action.type === "playCard"
    );
    if (playAction !== undefined) {
      return playAction;
    }

    const buyActions = legalActions
      .filter(
        (action): action is Extract<LegalAction, { type: "buyMarketCard" }> => {
          return action.type === "buyMarketCard";
        }
      )
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
  const bot = options.bot ?? baselineBot;
  const state = initializeGame({
    ...options,
    ...(bot.chooseEffectChoice === undefined
      ? {}
      : { effectChoiceStrategy: bot.chooseEffectChoice }),
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
    if (options.validateInvariants) {
      assertGameStateInvariants(state);
    }
    if (result.gameEndReason !== undefined) {
      return summarizeGame(state, result.gameEndReason, true, setupState);
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
  setupState: SetupStateSnapshot
): SingleGameResult {
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

function getBuyActionCost(
  state: GameState,
  action: Extract<LegalAction, { type: "buyMarketCard" }>
): number {
  if (action.source === "wildMagicStack") {
    return 3;
  }

  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  const card = [
    ...state.common.market,
    ...state.common.legendMarket,
    activePlayer?.unboughtFamiliar,
  ].find((candidate) => {
    return (
      candidate !== undefined && candidate.instanceId === action.cardInstanceId
    );
  });
  if (card === undefined) {
    return 0;
  }

  return calculateEffectiveCardCost(
    state,
    state.activePlayerId,
    mustGetDefinition(state, card)
  );
}

function mustGetDefinition(
  state: GameState,
  card: CardInstance
): CardDefinition {
  const definition = state.cardDefinitions.get(card.definitionId);
  if (definition === undefined) {
    throw new Error(`Missing card definition ${card.definitionId}`);
  }

  return definition;
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
