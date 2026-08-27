import type { GameState, PlayerId } from "./setup.js";

export type MarketFlowEndReason = "mainDeckExhausted" | "legendDeckExhausted";

export const DEAD_WIZARD_TOKENS_EXHAUSTED_REASON =
  "deadWizardTokensExhausted" as const;

export type DeadWizardTokenExhaustionReason =
  typeof DEAD_WIZARD_TOKENS_EXHAUSTED_REASON;

export type EndOfTurnGameEndReason =
  | MarketFlowEndReason
  | DeadWizardTokenExhaustionReason
  | "playerDefeated";

export interface EndOfTurnCheckpoint {
  gameEndReason: EndOfTurnGameEndReason;
  gameEndReasons: readonly EndOfTurnGameEndReason[];
  winnerPlayerId?: PlayerId;
}

export function isDeadWizardTokenStackExhausted(state: GameState): boolean {
  return (
    state.common.deadWizardTokens.status === "available" &&
    state.common.deadWizardTokens.drawStack.length === 0
  );
}

export function getEndOfTurnCheckpoint(
  state: GameState
): EndOfTurnCheckpoint | undefined {
  const ordinaryEndReasons: EndOfTurnGameEndReason[] = [
    ...state.turn.pendingMarketFlowEndReasons,
  ];
  if (isDeadWizardTokenStackExhausted(state)) {
    ordinaryEndReasons.push(DEAD_WIZARD_TOKENS_EXHAUSTED_REASON);
  }

  const specialWinnerPlayerId = state.turn.pendingSpecialWinnerPlayerId;
  if (specialWinnerPlayerId !== undefined) {
    return {
      gameEndReason: "playerDefeated",
      gameEndReasons: ["playerDefeated", ...ordinaryEndReasons],
      winnerPlayerId: specialWinnerPlayerId,
    };
  }

  const gameEndReason = ordinaryEndReasons[0];
  return gameEndReason === undefined
    ? undefined
    : { gameEndReason, gameEndReasons: ordinaryEndReasons };
}
