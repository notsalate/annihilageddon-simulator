import type { TokenDefinition } from "./data.js";
import { cardMatchesTypeForPlayer } from "./card-type-runtime.js";
import {
  calculateEffectiveCardVictoryPoints,
  calculateEffectivePlayerVictoryPoints,
  calculateEffectiveTokenVictoryPoints,
  getOwnedScoringCards,
} from "./effective-value-runtime.js";
import type { GameState, PlayerId, TokenInstance } from "./setup.js";
import { requireVerifiedRuntimeEffect } from "./runtime-effect-verification.js";

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
  const removedDeadWizardTokenInstanceIds =
    getRemovedDeadWizardTokenInstanceIdsForScoring(state);
  return state.players.map((player) => {
    const scoringCards = getOwnedScoringCards(state, player.playerId);
    const scoringDeadWizardTokens = player.deadWizardTokens.filter(
      (token) => !removedDeadWizardTokenInstanceIds.has(token.instanceId)
    );
    const deadWizardTokenDefinitions = scoringDeadWizardTokens.map((token) =>
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
              object.card,
              scoringCards
            )
          );
        }, 0) +
        deadWizardTokenDefinitions.reduce((total, definition) => {
          return (
            total +
            calculateEffectiveTokenVictoryPoints(
              state,
              player.playerId,
              definition,
              scoringCards
            )
          );
        }, 0) +
        calculateEffectivePlayerVictoryPoints(
          state,
          player.playerId,
          0,
          scoringCards
        ),
      legendCount: scoringCards.filter((object) =>
        cardMatchesTypeForPlayer(
          state,
          player.playerId,
          object.definition,
          "legend",
          object.card
        )
      ).length,
      deadWizardTokenCount: scoringDeadWizardTokens.length,
    };
  });
}

function getRemovedDeadWizardTokenInstanceIdsForScoring(
  state: GameState
): ReadonlySet<TokenInstance["instanceId"]> {
  const tokenEntries = state.players.flatMap((player) =>
    player.deadWizardTokens.map((token) => ({
      token,
      definition: mustGetTokenDefinition(state, token),
    }))
  );
  const removed = new Set<TokenInstance["instanceId"]>();

  for (const { token, definition } of tokenEntries) {
    if (
      definition.kind !== "deadWizardToken" ||
      !definition.effects.some((effect) => {
        const verifiedEffect = requireVerifiedRuntimeEffect(effect);
        return (
          verifiedEffect.effectId ===
            "endgame_remove_matching_dead_wizard_tokens" &&
          verifiedEffect.timing === "scoring" &&
          verifiedEffect.matching === "sameDefinition" &&
          verifiedEffect.minimumCount === 2
        );
      })
    ) {
      continue;
    }

    const matchingTokens = tokenEntries.filter(
      (candidate) => candidate.token.definitionId === token.definitionId
    );
    if (matchingTokens.length >= 2) {
      for (const matchingToken of matchingTokens) {
        removed.add(matchingToken.token.instanceId);
      }
    }
  }

  return removed;
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
