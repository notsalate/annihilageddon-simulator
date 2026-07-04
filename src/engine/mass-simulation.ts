import {
  runSingleGame,
  type GameEndReason,
  type PlayerScore,
  type RunSingleGameOptions,
} from "./simulation.js";
import type { PlayerId } from "./setup.js";

export interface RunMassSimulationOptions {
  rootDir: string;
  firstSeed: number;
  gameCount: number;
  maxTurns: number;
  playerCount?: number;
  dataPackPath?: string;
}

export interface CompactGameSummary {
  seed: number;
  winnerIds: PlayerId[];
  isTie: boolean;
  endReason: GameEndReason;
  isGameEnd: boolean;
  turnsElapsed: number;
  totalPurchases: number;
  purchasesByPlayer: Record<PlayerId, number>;
  players: PlayerScore[];
}

export interface MassSimulationResult {
  firstSeed: number;
  gameCount: number;
  games: CompactGameSummary[];
  aggregate: MassSimulationAggregate;
}

export interface MassSimulationAggregate {
  totalGames: number;
  winCounts: Record<PlayerId, number>;
  winRates: Record<PlayerId, number>;
  tieCount: number;
  tieRate: number;
  endReasonCounts: Record<GameEndReason, number>;
  averageTurnsElapsed: number;
  totalPurchases: number;
  averagePurchasesPerGame: number;
}

export function runMassSimulation(
  options: RunMassSimulationOptions
): MassSimulationResult {
  if (!Number.isSafeInteger(options.gameCount) || options.gameCount < 1) {
    throw new RangeError("gameCount must be a positive safe integer");
  }

  const games = Array.from({ length: options.gameCount }, (_, index) => {
    return toCompactSummary(
      runSingleGame({
        ...toSingleGameOptions(options),
        seed: options.firstSeed + index,
      })
    );
  });

  return {
    firstSeed: options.firstSeed,
    gameCount: options.gameCount,
    games,
    aggregate: aggregateMassSimulation(games),
  };
}

function toSingleGameOptions(
  options: RunMassSimulationOptions
): Omit<RunSingleGameOptions, "seed"> {
  return {
    rootDir: options.rootDir,
    maxTurns: options.maxTurns,
    ...(options.playerCount === undefined
      ? {}
      : { playerCount: options.playerCount }),
    ...(options.dataPackPath === undefined
      ? {}
      : { dataPackPath: options.dataPackPath }),
  };
}

function toCompactSummary(
  result: ReturnType<typeof runSingleGame>
): CompactGameSummary {
  const purchasesByPlayer = createZeroedPlayerRecord(
    result.players.map((player) => player.playerId)
  );
  let totalPurchases = 0;

  for (const event of result.eventLog) {
    if (event.type !== "cardBought" || event.playerId === undefined) {
      continue;
    }

    purchasesByPlayer[event.playerId] =
      (purchasesByPlayer[event.playerId] ?? 0) + 1;
    totalPurchases += 1;
  }

  return {
    seed: result.seed,
    winnerIds: result.winnerIds,
    isTie: result.isTie,
    endReason: result.endReason,
    isGameEnd: result.isGameEnd,
    turnsElapsed: result.turnsElapsed,
    totalPurchases,
    purchasesByPlayer,
    players: result.players,
  };
}

function aggregateMassSimulation(
  games: readonly CompactGameSummary[]
): MassSimulationAggregate {
  const winCounts: Record<PlayerId, number> = {};
  const endReasonCounts = createZeroedEndReasonCounts();
  let tieCount = 0;
  let totalTurnsElapsed = 0;
  let totalPurchases = 0;

  for (const game of games) {
    endReasonCounts[game.endReason] += 1;
    totalTurnsElapsed += game.turnsElapsed;
    totalPurchases += game.totalPurchases;

    if (game.isTie) {
      tieCount += 1;
      continue;
    }

    const winnerId = game.winnerIds[0];
    if (winnerId !== undefined) {
      winCounts[winnerId] = (winCounts[winnerId] ?? 0) + 1;
    }
  }

  return {
    totalGames: games.length,
    winCounts,
    winRates: toRates(winCounts, games.length),
    tieCount,
    tieRate: tieCount / games.length,
    endReasonCounts,
    averageTurnsElapsed: totalTurnsElapsed / games.length,
    totalPurchases,
    averagePurchasesPerGame: totalPurchases / games.length,
  };
}

function toRates(
  counts: Record<PlayerId, number>,
  totalGames: number
): Record<PlayerId, number> {
  const rates: Record<PlayerId, number> = {};
  for (const [playerId, count] of Object.entries(counts) as Array<
    [PlayerId, number]
  >) {
    rates[playerId] = count / totalGames;
  }

  return rates;
}

function createZeroedPlayerRecord(
  playerIds: readonly PlayerId[]
): Record<PlayerId, number> {
  const record: Record<PlayerId, number> = {};
  for (const playerId of playerIds) {
    record[playerId] = 0;
  }

  return record;
}

function createZeroedEndReasonCounts(): Record<GameEndReason, number> {
  return {
    deadWizardTokensExhausted: 0,
    mainDeckExhausted: 0,
    legendDeckExhausted: 0,
    maxTurnsReached: 0,
  };
}
