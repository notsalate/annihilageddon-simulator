import { randomInt } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  runMassSimulation,
  type MassSimulationResult,
  type RunMassSimulationOptions,
} from "../engine/mass-simulation.js";
import {
  runSingleGame,
  type GameEndReason,
  type PlayerScore,
  type RunSingleGameOptions,
  type SingleGameResult,
} from "../engine/simulation.js";
import type { PlayerId } from "../engine/setup.js";

export interface SimulationMenuOptions {
  rootDir: string;
  maxTurns: number;
  ask(prompt: string): Promise<string>;
  write(message: string): void;
  errorReportDir?: string;
  nowMs?: () => number;
  createSeed?: () => number;
  runSingleGame?: (options: RunSingleGameOptions) => SingleGameResult;
  runMassSimulation?: (
    options: RunMassSimulationOptions
  ) => MassSimulationResult;
}

export async function runSimulationMenu(
  options: SimulationMenuOptions
): Promise<void> {
  const createSeed = options.createSeed ?? createRandomPositiveSafeInteger;
  const singleRunner = options.runSingleGame ?? runSingleGame;
  const massRunner = options.runMassSimulation ?? runMassSimulation;
  const nowMs = options.nowMs ?? Date.now;

  while (true) {
    const menuChoice = (
      await options.ask(
        [
          "Крутагидон 2: симулятор",
          "1. Одна партия",
          "2. Массовый прогон",
          "0. Выход",
          "> ",
        ].join("\n")
      )
    ).trim();

    if (menuChoice === "0") {
      return;
    }

    if (menuChoice === "1") {
      const seed = await askPositiveSafeInteger(
        options,
        "Seed партии [Enter = случайный]: ",
        createSeed
      );
      try {
        const result = singleRunner({
          rootDir: options.rootDir,
          seed,
          maxTurns: options.maxTurns,
        });
        options.write(formatSingleGameSummary(result));
      } catch (error) {
        const reportPath = await writeErrorReport(options, error, {
          mode: "single-game",
          seed,
          maxTurns: options.maxTurns,
        });
        options.write(
          `Симуляция остановлена из-за ошибки. Технический отчет сохранен: ${reportPath}`
        );
      }
      await options.ask("Нажмите Enter, чтобы вернуться в меню");
      continue;
    }

    if (menuChoice === "2") {
      const gameCount = await askPositiveSafeInteger(
        options,
        "Количество партий [Enter = 10000]: ",
        () => 10000
      );
      const firstSeed = createSeed();
      const startedAt = nowMs();
      try {
        const result = massRunner({
          rootDir: options.rootDir,
          firstSeed,
          gameCount,
          maxTurns: options.maxTurns,
        });
        const elapsedSeconds = (nowMs() - startedAt) / 1000;
        options.write(formatMassSimulationSummary(result, elapsedSeconds));
      } catch (error) {
        const reportPath = await writeErrorReport(options, error, {
          mode: "mass-simulation",
          seedRange: `${firstSeed}-${firstSeed + gameCount - 1}`,
          gameCount,
          maxTurns: options.maxTurns,
        });
        options.write(
          `Симуляция остановлена из-за ошибки. Технический отчет сохранен: ${reportPath}`
        );
      }
      await options.ask("Нажмите Enter, чтобы вернуться в меню");
      continue;
    }

    options.write("Неверный пункт меню. Попробуйте еще раз.");
  }
}

export function formatSingleGameSummary(result: SingleGameResult): string {
  const winnerLine = result.isTie
    ? `Ничья: ${result.winnerIds.join(", ")}`
    : `Победитель: ${result.winnerIds[0] ?? "нет"}`;

  return [
    "Одна партия завершена",
    `Seed: ${result.seed}`,
    `Ходов: ${result.turnsElapsed}`,
    `Причина завершения: ${formatEndReason(result.endReason)}`,
    winnerLine,
    "Счет:",
    ...result.players.map((player) => {
      return `- ${player.playerId}: ${player.victoryPoints} ПО, Легенды: ${player.legendCount}, ЖДК: ${player.deadWizardTokenCount}`;
    }),
  ].join("\n");
}

export function formatMassSimulationSummary(
  result: MassSimulationResult,
  elapsedSeconds: number
): string {
  const playerIds = getPlayerIds(result);
  const endReasonLines = Object.entries(result.aggregate.endReasonCounts)
    .filter(([, count]) => count > 0)
    .map(
      ([reason, count]) =>
        `- ${formatEndReason(reason as GameEndReason)}: ${count}`
    );
  const turnLimitCount = result.aggregate.endReasonCounts.maxTurnsReached;
  const lines = [
    "Массовый прогон завершен",
    `Партий: ${result.gameCount}`,
    `Seed: ${result.firstSeed}-${result.firstSeed + result.gameCount - 1}`,
    "Победы:",
    ...playerIds
      .filter((playerId) => (result.aggregate.winCounts[playerId] ?? 0) > 0)
      .map(
        (playerId) =>
          `- ${playerId}: ${formatPercent(result.aggregate.winRates[playerId] ?? 0)}`
      ),
    `- Ничья: ${formatPercent(result.aggregate.tieRate)}`,
    "Средние значения:",
    `- Ходы: ${formatNumber(result.aggregate.averageTurnsElapsed)}`,
    ...playerIds.map((playerId) => {
      const average = averagePlayerScore(result, playerId);
      return `- ${playerId}: ${formatNumber(average.victoryPoints)} ПО, ${formatNumber(average.deadWizardTokenCount)} ЖДК`;
    }),
    "Причины завершения:",
    ...endReasonLines,
    `Время: ${formatNumber(elapsedSeconds)} сек.`,
  ];

  if (turnLimitCount > 0) {
    lines.push(
      `Внимание: ${turnLimitCount} партий достигли технического лимита ходов.`
    );
  }

  return lines.join("\n");
}

export function formatEndReason(reason: GameEndReason): string {
  switch (reason) {
    case "deadWizardTokensExhausted":
      return "закончились ЖДК";
    case "mainDeckExhausted":
      return "закончилась основная колода";
    case "legendDeckExhausted":
      return "закончилась колода Легенд";
    case "playerDefeated":
      return "игрок побеждён";
    case "maxTurnsReached":
      return "достигнут технический лимит ходов";
  }
}

function getPlayerIds(result: MassSimulationResult): PlayerId[] {
  const firstGame = result.games[0];
  if (firstGame === undefined) {
    return [];
  }

  return firstGame.players.map((player) => player.playerId);
}

function averagePlayerScore(
  result: MassSimulationResult,
  playerId: PlayerId
): Pick<PlayerScore, "victoryPoints" | "deadWizardTokenCount"> {
  let totalVictoryPoints = 0;
  let totalDeadWizardTokens = 0;

  for (const game of result.games) {
    const player = game.players.find(
      (candidate) => candidate.playerId === playerId
    );
    if (player === undefined) {
      continue;
    }
    totalVictoryPoints += player.victoryPoints;
    totalDeadWizardTokens += player.deadWizardTokenCount;
  }

  return {
    victoryPoints: totalVictoryPoints / result.games.length,
    deadWizardTokenCount: totalDeadWizardTokens / result.games.length,
  };
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatNumber(value: number): string {
  return value.toFixed(1);
}

async function askPositiveSafeInteger(
  options: Pick<SimulationMenuOptions, "ask" | "write">,
  prompt: string,
  createDefault: () => number
): Promise<number> {
  while (true) {
    const input = (await options.ask(prompt)).trim();
    if (input === "") {
      return createDefault();
    }

    const parsed = Number(input);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }

    options.write("Введите положительное целое число.");
  }
}

function createRandomPositiveSafeInteger(): number {
  return randomInt(1, 281_474_976_710_655);
}

async function writeErrorReport(
  options: Pick<SimulationMenuOptions, "rootDir" | "errorReportDir" | "nowMs">,
  error: unknown,
  context: Record<string, string | number>
): Promise<string> {
  const timestamp = new Date((options.nowMs ?? Date.now)()).toISOString();
  const reportDir =
    options.errorReportDir ??
    join(options.rootDir, ".scratch", "runs", "errors");
  await mkdir(reportDir, { recursive: true });
  const reportPath = join(
    reportDir,
    `simulation-menu-error-${timestamp.replace(/[:.]/g, "-")}.md`
  );
  await writeFile(
    reportPath,
    formatErrorReport(timestamp, error, context),
    "utf8"
  );
  return reportPath;
}

function formatErrorReport(
  timestamp: string,
  error: unknown,
  context: Record<string, string | number>
): string {
  const normalizedError = normalizeError(error);
  return [
    "# Simulation Menu Error",
    "",
    `timestamp: ${timestamp}`,
    ...Object.entries(context).map(([key, value]) => `${key}: ${value}`),
    "",
    `message: ${normalizedError.message}`,
    "",
    "stack:",
    "```",
    normalizedError.stack,
    "```",
    "",
  ].join("\n");
}

function normalizeError(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack ?? "",
    };
  }

  return {
    message: String(error),
    stack: "",
  };
}
