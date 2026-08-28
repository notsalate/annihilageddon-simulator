import { clonePhysicalCardLedger } from "./control-ledger.js";
import { freezeGameEvent } from "./event-recorder.js";
import { installGameEventLog } from "./game-events.js";
import type { GameState } from "./setup.js";

/** Create an isolated analysis state at the exact current RNG position. */
export function forkGameState(source: GameState): GameState {
  return createFork(source, "clone");
}

/**
 * Create an Analyzer branch that shares the append-only event-log prefix.
 * Existing events are immutable; event-recorder updates replace an entry.
 */
export function forkGameStateForAnalyzer(source: GameState): GameState {
  return createFork(source, "shared");
}

function createFork(
  source: GameState,
  eventLogMode: "clone" | "shared"
): GameState {
  const ledger = clonePhysicalCardLedger(source);
  const fork: GameState = {
    seed: source.seed,
    runtimeMode: source.runtimeMode,
    rng: source.rng.fork(),
    nextAttackId: source.nextAttackId,
    activePlayerId: source.activePlayerId,
    turn: {
      number: source.turn.number,
      power: source.turn.power,
      controlledPowerBonus: source.turn.controlledPowerBonus,
      activatedCardIds: [...source.turn.activatedCardIds],
      gainedCards: source.turn.gainedCards.map((record) => ({ ...record })),
      mainMarketCardHandReplacementSourceCardIds: [
        ...source.turn.mainMarketCardHandReplacementSourceCardIds,
      ],
      pendingMarketFlowEndReasons: [...source.turn.pendingMarketFlowEndReasons],
      pendingSpecialWinnerPlayerId: source.turn.pendingSpecialWinnerPlayerId,
      rememberedDestroyedLegendCost: source.turn.rememberedDestroyedLegendCost,
      damagingAttackPlayerIds: [...source.turn.damagingAttackPlayerIds],
      nextAttackUnavoidablePlayerId: source.turn.nextAttackUnavoidablePlayerId,
      defenseDisabledPlayerIds: [...source.turn.defenseDisabledPlayerIds],
      deadWizardTokenKillReplacement:
        source.turn.deadWizardTokenKillReplacement === undefined
          ? undefined
          : { ...source.turn.deadWizardTokenKillReplacement },
      temporaryCardControls: ledger.temporaryCardControls,
    },
    players: ledger.players,
    common: ledger.common,
    cardDefinitions: source.cardDefinitions,
    tokenDefinitions: source.tokenDefinitions,
    deadWizardTokenResolution: {
      attackQueues: source.deadWizardTokenResolution.attackQueues.map(
        (queue) => ({
          attackId: queue.attackId,
          faces: queue.faces.map((face) => ({
            ...face,
            ...(face.deadWizardTokenProjectionEffectIds === undefined
              ? {}
              : {
                  deadWizardTokenProjectionEffectIds: [
                    ...face.deadWizardTokenProjectionEffectIds,
                  ],
                }),
          })),
        })
      ),
    },
    eventLog:
      eventLogMode === "shared"
        ? source.eventLog.map((event) => freezeGameEvent(event))
        : structuredClone([...source.eventLog]),
    ...(source.effectChoiceStrategy === undefined
      ? {}
      : { effectChoiceStrategy: source.effectChoiceStrategy }),
  };

  installGameEventLog(fork);
  return fork;
}
