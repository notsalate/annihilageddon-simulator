import {
  clonePhysicalCardZones,
  cloneTemporaryControls,
} from "./control-ledger.js";
import { installGameEventLog } from "./game-events.js";
import type {
  CardInstance,
  CommonState,
  DeadWizardTokenState,
  GameState,
  PlayerState,
  StatusInstance,
  TokenInstance,
  TrophyLikeInstance,
} from "./setup.js";

/** Create an isolated analysis state at the exact current RNG position. */
export function forkGameState(source: GameState): GameState {
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
    players: source.players.map(clonePlayer),
    common: cloneCommon(source.common),
    cardDefinitions: source.cardDefinitions,
    tokenDefinitions: source.tokenDefinitions,
    eventLog: structuredClone([...source.eventLog]),
    ...(source.effectChoiceStrategy === undefined
      ? {}
      : { effectChoiceStrategy: source.effectChoiceStrategy }),
  };

  clonePhysicalCardZones(source, fork, cloneCard);
  installGameEventLog(fork);
  return fork;
}

function clonePlayer(source: PlayerState): PlayerState {
  return {
    playerId: source.playerId,
    deck: [],
    hand: [],
    discard: [],
    playedThisTurn: [],
    permanents: [],
    unboughtFamiliar: undefined,
    deadWizardTokens: source.deadWizardTokens.map(cloneToken),
    wizardProperties: source.wizardProperties.map(cloneToken),
    statuses: source.statuses.map(cloneStatus),
    trophyLikeObjects: source.trophyLikeObjects.map(cloneTrophy),
    chips: source.chips,
    life: { ...source.life },
  };
}

function cloneCommon(source: CommonState): CommonState {
  return {
    market: [],
    legendMarket: [],
    mainDeck: [],
    legendDeck: [],
    wildMagicStack: [],
    limpWandStack: [],
    destroyedPile: [],
    destroyedMayhem: [],
    destroyedMegaMayhem: [],
    deadWizardTokens: cloneDeadWizardTokens(source.deadWizardTokens),
  };
}

function cloneDeadWizardTokens(
  source: DeadWizardTokenState
): DeadWizardTokenState {
  return source.status === "notInDataPack"
    ? { status: source.status, drawStack: [] }
    : { status: source.status, drawStack: source.drawStack.map(cloneToken) };
}

function cloneCard(source: CardInstance): CardInstance {
  return { ...source };
}

function cloneToken(source: TokenInstance): TokenInstance {
  return { ...source };
}

function cloneStatus(source: StatusInstance): StatusInstance {
  return { ...source, effects: structuredClone(source.effects) };
}

function cloneTrophy(source: TrophyLikeInstance): TrophyLikeInstance {
  return { ...source, effects: structuredClone(source.effects) };
}
