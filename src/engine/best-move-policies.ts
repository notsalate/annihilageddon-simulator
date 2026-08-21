import { adjudicateGame } from "./adjudication.js";
import type { TurnLineEvaluationPolicy } from "./best-move-analysis.js";

/** Исследовательский критерий, а не универсальное определение лучшего хода. */
export const victoryPointsPolicy: TurnLineEvaluationPolicy = {
  id: "victory-points",
  evaluate: ({ line, perspectivePlayerId }) => {
    const player = adjudicateGame(line.terminalState).players.find(
      (candidate) => candidate.playerId === perspectivePlayerId
    );
    if (player === undefined)
      throw new Error(`Missing perspective player ${perspectivePlayerId}`);
    return {
      score: player.victoryPoints,
      components: { victoryPoints: player.victoryPoints },
    };
  },
};

export const BEST_MOVE_POLICIES = {
  "victory-points": victoryPointsPolicy,
} as const;
export type BestMoveCriterionId = keyof typeof BEST_MOVE_POLICIES;
export function getBestMovePolicy(id: string): TurnLineEvaluationPolicy {
  const policy = BEST_MOVE_POLICIES[id as BestMoveCriterionId];
  if (policy === undefined)
    throw new Error(
      `Unknown criterion "${id}". Available criteria: ${Object.keys(BEST_MOVE_POLICIES).join(", ")}`
    );
  return policy;
}
