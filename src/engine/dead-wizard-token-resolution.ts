import type { TokenInstance } from "./setup.js";
import type { GameState, PlayerState } from "./setup.js";

export function beginDeadWizardTokenResolutionBoundary(state: GameState): void {
  state.deadWizardTokenResolution.boundaryDepth += 1;
}

export function endDeadWizardTokenResolutionBoundary(
  state: GameState
): boolean {
  state.deadWizardTokenResolution.boundaryDepth -= 1;
  if (state.deadWizardTokenResolution.boundaryDepth < 0) {
    throw new Error("Dead wizard token resolution boundary underflow");
  }
  return state.deadWizardTokenResolution.boundaryDepth === 0;
}

export function enqueueDeadWizardTokenFace(
  state: GameState,
  player: PlayerState,
  token: TokenInstance,
  deathKillerPlayerId?: PlayerState["playerId"]
): void {
  state.deadWizardTokenResolution.pendingFaces.push({
    playerId: player.playerId,
    tokenInstanceId: token.instanceId,
    tokenDefinitionId: token.definitionId,
    ...(deathKillerPlayerId === undefined ? {} : { deathKillerPlayerId }),
  });
}

export function dequeueDeadWizardTokenFace(state: GameState):
  | {
      playerId: PlayerState["playerId"];
      tokenInstanceId: TokenInstance["instanceId"];
      tokenDefinitionId: TokenInstance["definitionId"];
      deathKillerPlayerId?: PlayerState["playerId"];
    }
  | undefined {
  return state.deadWizardTokenResolution.pendingFaces.shift();
}
