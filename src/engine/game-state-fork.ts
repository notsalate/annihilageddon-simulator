import {
  clonePhysicalCardZoneDescriptorFactories,
  clonePhysicalCardZones,
  clonePhysicalCardZoneState,
  cloneTemporaryControls,
} from "./control-ledger.js";
import { installGameEventLog } from "./game-events.js";
import type { GameState } from "./setup.js";

/** Create an isolated analysis state at the exact current RNG position. */
export function forkGameState(source: GameState): GameState {
  const cardZoneState = clonePhysicalCardZoneState(source);
  const fork: GameState = {
    seed: source.seed,
    runtimeMode: source.runtimeMode,
    rng: source.rng.fork(),
    activePlayerId: source.activePlayerId,
    turn: {
      number: source.turn.number,
      power: source.turn.power,
      controlledPowerBonus: source.turn.controlledPowerBonus,
      activatedCardIds: [...source.turn.activatedCardIds],
      gainedCardDefinitionIds: [...source.turn.gainedCardDefinitionIds],
      damagingAttackPlayerIds: [...source.turn.damagingAttackPlayerIds],
      temporaryCardControls: cloneTemporaryControls(
        source.turn.temporaryCardControls
      ),
    },
    players: cardZoneState.players,
    common: cardZoneState.common,
    cardDefinitions: source.cardDefinitions,
    tokenDefinitions: source.tokenDefinitions,
    eventLog: structuredClone([...source.eventLog]),
    ...(source.effectChoiceStrategy === undefined
      ? {}
      : { effectChoiceStrategy: source.effectChoiceStrategy }),
  };

  clonePhysicalCardZoneDescriptorFactories(source, fork);
  clonePhysicalCardZones(source, fork, (card) => structuredClone(card));

  installGameEventLog(fork);
  return fork;
}
