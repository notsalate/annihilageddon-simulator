import {
  capturePhysicalCardZoneState,
  listPhysicalCardLocations,
  restorePhysicalCardZoneState,
  type PhysicalCardZoneStateSnapshot,
} from "./control-ledger.js";
import { installGameEventLog } from "./game-events.js";
import type {
  CardInstance,
  GameEvent,
  GameState,
  PlayerState,
  StatusInstance,
  TokenInstance,
  TemporaryCardControl,
  TrophyLikeInstance,
} from "./setup.js";

interface ArraySnapshot<Value> {
  readonly values: readonly Value[];
  readonly restore: () => void;
}

interface ObjectSnapshot {
  readonly object: object;
  readonly value: object;
}

interface PlayerSnapshot {
  readonly player: PlayerState;
  readonly chips: number;
  readonly life: {
    readonly object: PlayerState["life"];
    readonly value: PlayerState["life"];
  };
  readonly unboughtFamiliar: CardInstance | undefined;
  readonly nonCardArrays: readonly ArraySnapshot<
    TokenInstance | StatusInstance | TrophyLikeInstance
  >[];
}

interface TurnSnapshot {
  readonly object: GameState["turn"];
  readonly value: GameState["turn"];
  readonly arrays: readonly ArraySnapshot<string | TemporaryCardControl>[];
}

interface EventLogSnapshot {
  readonly array: GameEvent[];
  readonly entries: readonly {
    readonly object: GameEvent;
    readonly value: GameEvent;
  }[];
}

interface ActionTransactionSnapshot {
  readonly seed: number;
  readonly runtimeMode: GameState["runtimeMode"];
  readonly activePlayerId: GameState["activePlayerId"];
  readonly playersArray: GameState["players"];
  readonly players: readonly PlayerState[];
  readonly common: GameState["common"];
  readonly turn: TurnSnapshot;
  readonly physicalCardZones: PhysicalCardZoneStateSnapshot;
  readonly playerSnapshots: readonly PlayerSnapshot[];
  readonly deadWizardTokens: {
    readonly object: GameState["common"]["deadWizardTokens"];
    readonly value: GameState["common"]["deadWizardTokens"];
    readonly drawStack: ArraySnapshot<TokenInstance>;
  };
  readonly mutableObjects: readonly ObjectSnapshot[];
  readonly rng: GameState["rng"];
  readonly eventLog: EventLogSnapshot;
}

/**
 * Runs one public action as an atomic mutation boundary.
 *
 * A returned failure and a thrown error roll back engine-owned state. A
 * successful result, including a terminal game end, is committed. Choice
 * callbacks remain outside the engine snapshot; their private state is their
 * own responsibility.
 */
export function runActionTransaction<Result extends { readonly ok: boolean }>(
  state: GameState,
  operation: () => Result
): Result {
  const snapshot = createActionTransactionSnapshot(state);

  let result: Result;
  try {
    result = operation();
  } catch (error) {
    try {
      restoreOrThrow(state, snapshot);
    } catch (rollbackError) {
      if (error instanceof Error) {
        attachCause(error, rollbackError);
      } else {
        throw createNonErrorRollbackFailure(error, rollbackError);
      }
    }
    if (error instanceof Error) {
      throw error;
    }
    throw createNonErrorActionFailure(error);
  }

  if (result.ok) {
    return result;
  }

  restoreOrThrow(state, snapshot, result);
  return result;
}

function createActionTransactionSnapshot(
  state: GameState
): ActionTransactionSnapshot {
  const physicalCardZoneResult = capturePhysicalCardZoneState(state);
  if (!physicalCardZoneResult.ok) {
    throw new Error(
      `Cannot snapshot action card zones: ${physicalCardZoneResult.reason}`
    );
  }

  const playerSnapshots = state.players.map((player) => ({
    player,
    chips: player.chips,
    life: {
      object: player.life,
      value: structuredClone(player.life),
    },
    unboughtFamiliar: player.unboughtFamiliar,
    nonCardArrays: [
      captureArray(player.deadWizardTokens, (array) => {
        player.deadWizardTokens = array;
      }),
      captureArray(player.wizardProperties, (array) => {
        player.wizardProperties = array;
      }),
      captureArray(player.statuses, (array) => {
        player.statuses = array;
      }),
      captureArray(player.trophyLikeObjects, (array) => {
        player.trophyLikeObjects = array;
      }),
    ],
  }));
  const deadWizardTokens = {
    object: state.common.deadWizardTokens,
    value: structuredClone(state.common.deadWizardTokens),
    drawStack: captureArray(
      state.common.deadWizardTokens.drawStack,
      (array) => {
        if (state.common.deadWizardTokens.status === "available") {
          state.common.deadWizardTokens.drawStack = array;
        }
      }
    ),
  };

  const turn: TurnSnapshot = {
    object: state.turn,
    value: structuredClone(state.turn),
    arrays: [
      captureArray(state.turn.activatedCardIds, (array) => {
        state.turn.activatedCardIds = array;
      }),
      captureArray(state.turn.gainedCardDefinitionIds, (array) => {
        state.turn.gainedCardDefinitionIds = array;
      }),
      captureArray(state.turn.damagingAttackPlayerIds, (array) => {
        state.turn.damagingAttackPlayerIds = array;
      }),
      captureArray(state.turn.temporaryCardControls, (array) => {
        state.turn.temporaryCardControls = array;
      }),
    ],
  };

  const mutableObjects = collectMutableObjects(
    state,
    playerSnapshots,
    deadWizardTokens.drawStack
  ).map((object) => ({ object, value: structuredClone(object) }));

  return {
    seed: state.seed,
    runtimeMode: state.runtimeMode,
    activePlayerId: state.activePlayerId,
    playersArray: state.players,
    players: [...state.players],
    common: state.common,
    turn,
    physicalCardZones: physicalCardZoneResult.snapshot,
    playerSnapshots,
    deadWizardTokens,
    mutableObjects,
    rng: state.rng.fork(),
    eventLog: {
      array: state.eventLog,
      entries: state.eventLog.map((event) => ({
        object: event,
        value: structuredClone(event),
      })),
    },
  };
}

function captureArray<Value>(
  array: Value[],
  assign: (array: Value[]) => void
): ArraySnapshot<Value> {
  return {
    values: [...array],
    restore() {
      array.splice(0, array.length, ...this.values);
      assign(array);
    },
  };
}

function collectMutableObjects(
  state: GameState,
  playerSnapshots: readonly PlayerSnapshot[],
  deadWizardTokenDrawStack: ArraySnapshot<TokenInstance>
): object[] {
  const objects = new Set<object>();
  const add = (values: readonly object[]): void => {
    for (const value of values) {
      objects.add(value);
    }
  };

  add(listPhysicalCardLocations(state).map((location) => location.card));
  for (const snapshot of playerSnapshots) {
    for (const array of snapshot.nonCardArrays) {
      add(array.values);
    }
  }
  add(deadWizardTokenDrawStack.values);
  add(state.turn.temporaryCardControls);
  return [...objects];
}

function restoreOrThrow(
  state: GameState,
  snapshot: ActionTransactionSnapshot,
  originalResult?: { readonly ok: boolean }
): void {
  let errors: string[];
  try {
    errors = restoreActionTransactionSnapshot(state, snapshot);
  } catch (error) {
    const rollbackError = toRollbackError(error);
    if (originalResult !== undefined) {
      attachCause(rollbackError, originalResult);
    }
    throw rollbackError;
  }
  if (errors.length > 0) {
    const rollbackError = new Error(
      `Action transaction rollback failed: ${errors.join("; ")}`
    );
    if (originalResult !== undefined) {
      attachCause(rollbackError, originalResult);
    }
    throw rollbackError;
  }
}

function toRollbackError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error(`Action transaction rollback threw: ${String(error)}`);
}

function attachCause(error: Error, cause: unknown): void {
  Object.defineProperty(error, "cause", {
    configurable: true,
    enumerable: false,
    value: cause,
    writable: true,
  });
}

function createNonErrorRollbackFailure(
  originalError: unknown,
  rollbackError: unknown
): Error {
  const failure = new Error(
    "Action transaction rollback failed while handling a non-Error exception"
  );
  attachCause(failure, { originalError, rollbackError });
  return failure;
}

function createNonErrorActionFailure(originalError: unknown): Error {
  const failure = new Error(
    "Action transaction operation threw a non-Error exception"
  );
  attachCause(failure, originalError);
  return failure;
}

function restoreActionTransactionSnapshot(
  state: GameState,
  snapshot: ActionTransactionSnapshot
): string[] {
  const errors: string[] = [];

  state.seed = snapshot.seed;
  state.runtimeMode = snapshot.runtimeMode;
  state.activePlayerId = snapshot.activePlayerId;
  state.players = snapshot.playersArray;
  state.players.splice(0, state.players.length, ...snapshot.players);
  state.common = snapshot.common;
  state.turn = snapshot.turn.object;
  Object.assign(state.turn, structuredClone(snapshot.turn.value));
  for (const array of snapshot.turn.arrays) {
    array.restore();
  }

  for (const mutableObject of snapshot.mutableObjects) {
    Object.assign(mutableObject.object, structuredClone(mutableObject.value));
  }
  for (const playerSnapshot of snapshot.playerSnapshots) {
    const { player } = playerSnapshot;
    player.chips = playerSnapshot.chips;
    player.life = playerSnapshot.life.object;
    Object.assign(player.life, structuredClone(playerSnapshot.life.value));
    player.unboughtFamiliar = playerSnapshot.unboughtFamiliar;
    for (const array of playerSnapshot.nonCardArrays) {
      array.restore();
    }
  }

  const physicalCardZoneResult = restorePhysicalCardZoneState(
    state,
    snapshot.physicalCardZones
  );
  if (!physicalCardZoneResult.ok) {
    errors.push(`card zones: ${physicalCardZoneResult.reason}`);
  }
  state.common.deadWizardTokens = snapshot.deadWizardTokens.object;
  Object.assign(
    state.common.deadWizardTokens,
    structuredClone(snapshot.deadWizardTokens.value)
  );
  snapshot.deadWizardTokens.drawStack.restore();

  restoreEventLog(state, snapshot.eventLog);
  state.rng = snapshot.rng;
  installGameEventLog(state);
  return errors;
}

function restoreEventLog(state: GameState, snapshot: EventLogSnapshot): void {
  state.eventLog = snapshot.array;
  for (const entry of snapshot.entries) {
    Object.assign(entry.object, structuredClone(entry.value));
  }
  state.eventLog.splice(
    0,
    state.eventLog.length,
    ...snapshot.entries.map((entry) => entry.object)
  );
}
