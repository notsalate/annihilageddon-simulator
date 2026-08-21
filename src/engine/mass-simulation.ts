import type { AdjudicationResult } from "./adjudication.js";
import {
  runSingleGame,
  type GameEndReason,
  type RunSingleGameOptions,
} from "./simulation.js";
import {
  intakeRuntimeData,
  type RuntimeDataSource,
} from "./runtime-data-intake.js";
import type { LoadedDataPack } from "./data.js";
import type { PlayerId } from "./setup.js";

export interface RunMassSimulationOptions {
  rootDir: string;
  firstSeed: number;
  gameCount: number;
  maxTurns: number;
  playerCount?: number;
  dataPackPath?: string;
  dataPack?: LoadedDataPack;
}

export interface CompactGameSummary extends Pick<
  AdjudicationResult,
  "players" | "winnerIds" | "isTie"
> {
  seed: number;
  endReason: GameEndReason;
  isGameEnd: boolean;
  turnsElapsed: number;
  totalPurchases: number;
  purchasesByPlayer: Record<PlayerId, number>;
}

export interface MassSimulationResult {
  firstSeed: number;
  gameCount: number;
  games: CompactGameSummary[];
  aggregate: MassSimulationAggregate;
}

export interface MassSimulationAggregate {
  totalGames: number;
  winCounts: Partial<Record<PlayerId, number>>;
  winRates: Partial<Record<PlayerId, number>>;
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

  if (options.dataPack !== undefined && options.dataPackPath !== undefined) {
    throw new Error("dataPack and dataPackPath cannot be used together");
  }

  const dataSource: RuntimeDataSource =
    options.dataPack === undefined
      ? {
          rootDir: options.rootDir,
          ...(options.dataPackPath === undefined
            ? {}
            : { dataPackPath: options.dataPackPath }),
        }
      : { dataPack: options.dataPack };
  const dataPack = intakeRuntimeData(dataSource);

  const games = Array.from({ length: options.gameCount }, (_, index) => {
    return toCompactSummary(
      runSingleGame({
        ...toSingleGameOptions(options),
        dataPack,
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
  const winCounts = new Map<PlayerId, number>();
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
      winCounts.set(winnerId, (winCounts.get(winnerId) ?? 0) + 1);
    }
  }

  return {
    totalGames: games.length,
    winCounts: toPlayerStatRecord(winCounts),
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
  counts: ReadonlyMap<PlayerId, number>,
  totalGames: number
): Partial<Record<PlayerId, number>> {
  const rates: Partial<Record<PlayerId, number>> = {};
  for (const [playerId, count] of counts) {
    rates[playerId] = count / totalGames;
  }

  return rates;
}

function toPlayerStatRecord(
  counts: ReadonlyMap<PlayerId, number>
): Partial<Record<PlayerId, number>> {
  const record: Partial<Record<PlayerId, number>> = {};
  for (const [playerId, count] of counts) {
    record[playerId] = count;
  }

  return record;
}

function createZeroedPlayerRecord(
  playerIds: readonly PlayerId[]
): Record<PlayerId, number> {
  return Object.fromEntries(playerIds.map((playerId) => [playerId, 0]));
}

function createZeroedEndReasonCounts(): Record<GameEndReason, number> {
  return {
    deadWizardTokensExhausted: 0,
    mainDeckExhausted: 0,
    legendDeckExhausted: 0,
    playerDefeated: 0,
    maxTurnsReached: 0,
  };
}
