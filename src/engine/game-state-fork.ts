import { clonePhysicalCardLedger } from "./control-ledger.js";
import { installGameEventLog } from "./game-events.js";
import type { GameState } from "./setup.js";

/** Create an isolated analysis state at the exact current RNG position. */
export function forkGameState(source: GameState): GameState {
  const ledger = clonePhysicalCardLedger(source);
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
      mainMarketCardHandReplacementSourceCardIds: [
        ...source.turn.mainMarketCardHandReplacementSourceCardIds,
      ],
      rememberedDestroyedLegendCost: source.turn.rememberedDestroyedLegendCost,
      damagingAttackPlayerIds: [...source.turn.damagingAttackPlayerIds],
      temporaryCardControls: ledger.temporaryCardControls,
    },
    players: ledger.players,
    common: ledger.common,
    cardDefinitions: source.cardDefinitions,
    tokenDefinitions: source.tokenDefinitions,
    eventLog: structuredClone([...source.eventLog]),
    ...(source.effectChoiceStrategy === undefined
      ? {}
      : { effectChoiceStrategy: source.effectChoiceStrategy }),
  };

  installGameEventLog(fork);
  return fork;
}
