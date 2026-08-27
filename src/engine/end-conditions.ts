import type { GameState } from "./setup.js";

export const DEAD_WIZARD_TOKENS_EXHAUSTED_REASON =
  "deadWizardTokensExhausted" as const;

export type DeadWizardTokenExhaustionReason =
  typeof DEAD_WIZARD_TOKENS_EXHAUSTED_REASON;

export function isDeadWizardTokenStackExhausted(state: GameState): boolean {
  return (
    state.common.deadWizardTokens.status === "available" &&
    state.common.deadWizardTokens.drawStack.length === 0
  );
}
