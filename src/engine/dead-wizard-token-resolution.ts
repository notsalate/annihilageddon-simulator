import type { AttackId } from "../domain/types.js";
import type { TokenInstance } from "./setup.js";
import type { GameState, PlayerState } from "./setup.js";

export interface DeadWizardTokenFace {
  playerId: PlayerState["playerId"];
  tokenInstanceId: TokenInstance["instanceId"];
  tokenDefinitionId: TokenInstance["definitionId"];
  attackId?: AttackId;
  deathKillerPlayerId?: PlayerState["playerId"];
  deadWizardTokenWasDinglerAtGain?: boolean;
  deadWizardTokenProjectionEffectIds?: readonly string[];
}

export interface DeadWizardTokenAttackQueue {
  attackId: AttackId;
  faces: DeadWizardTokenFace[];
}

export function registerDeadWizardTokenAttackInstance(
  state: GameState,
  attackId: AttackId
): void {
  if (
    state.deadWizardTokenResolution.attackQueues.some(
      (queue) => queue.attackId === attackId
    )
  ) {
    throw new Error(
      `Dead wizard token attack queue ${attackId} already exists`
    );
  }
  state.deadWizardTokenResolution.attackQueues.push({
    attackId,
    faces: [],
  });
}

export function enqueueDeadWizardTokenFace(
  state: GameState,
  attackId: AttackId,
  face: DeadWizardTokenFace
): void {
  const queue = state.deadWizardTokenResolution.attackQueues.find(
    (candidate) => candidate.attackId === attackId
  );
  if (queue === undefined) {
    throw new Error(`Missing dead wizard token attack queue ${attackId}`);
  }
  queue.faces.push({ ...face, attackId });
}

export function takeDeadWizardTokenAttackFaces(
  state: GameState,
  attackId: AttackId
): DeadWizardTokenFace[] {
  const queueIndex = state.deadWizardTokenResolution.attackQueues.findIndex(
    (candidate) => candidate.attackId === attackId
  );
  if (queueIndex < 0) {
    return [];
  }
  const [queue] = state.deadWizardTokenResolution.attackQueues.splice(
    queueIndex,
    1
  );
  return queue?.faces ?? [];
}
