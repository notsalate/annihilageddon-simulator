import type { TokenDefinition } from "./data.js";
import {
  calculateEffectiveCardVictoryPoints,
  calculateEffectivePlayerVictoryPoints,
  calculateEffectiveTokenVictoryPoints,
  getOwnedScoringCards,
} from "./effective-values.js";
import type { GameState, PlayerId, TokenInstance } from "./setup.js";

export interface PlayerScore {
  playerId: PlayerId;
  victoryPoints: number;
  legendCount: number;
  deadWizardTokenCount: number;
}

export interface AdjudicationResult {
  players: PlayerScore[];
  winnerIds: PlayerId[];
  isTie: boolean;
}

export function adjudicateGame(state: GameState): AdjudicationResult {
  const players = scoreGame(state);
  const winnerIds = determineWinnerIds(players);
  return {
    players,
    winnerIds,
    isTie: winnerIds.length > 1,
  };
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

export function determineWinnerIds(
  players: readonly PlayerScore[]
): PlayerId[] {
  const sorted = [...players].sort(comparePlayerScores);
  const best = sorted[0];
  if (best === undefined) {
    return [];
  }

  return sorted
    .filter((player) => comparePlayerScores(player, best) === 0)
    .map((player) => player.playerId);
}

function comparePlayerScores(left: PlayerScore, right: PlayerScore): number {
  return (
    right.victoryPoints - left.victoryPoints ||
    right.legendCount - left.legendCount ||
    left.deadWizardTokenCount - right.deadWizardTokenCount
  );
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
