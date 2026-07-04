import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import {
  formatMassSimulationSummary,
  formatSingleGameSummary,
  runSimulationMenu,
  type MassSimulationResult,
  type SingleGameResult,
} from "../src/index.js";

test("single-game menu summary is Russian and includes seed, result, and scores", () => {
  const result: SingleGameResult = {
    seed: 12345,
    endReason: "mainDeckExhausted",
    isGameEnd: true,
    turnsElapsed: 42,
    winnerIds: ["player-1"],
    isTie: false,
    players: [
      {
        playerId: "player-1",
        victoryPoints: 31,
        legendCount: 2,
        deadWizardTokenCount: 1,
      },
      {
        playerId: "player-2",
        victoryPoints: 24,
        legendCount: 0,
        deadWizardTokenCount: 3,
      },
    ],
    eventLog: [],
  };

  assert.equal(
    formatSingleGameSummary(result),
    [
      "Одна партия завершена",
      "Seed: 12345",
      "Ходов: 42",
      "Причина завершения: закончилась основная колода",
      "Победитель: player-1",
      "Счет:",
      "- player-1: 31 ПО, Легенды: 2, ЖДК: 1",
      "- player-2: 24 ПО, Легенды: 0, ЖДК: 3",
    ].join("\n")
  );
});

test("simulation menu handles invalid input and uses a generated seed for empty single-game seed", async () => {
  const prompts: string[] = [];
  const output: string[] = [];
  const inputs = ["x", "1", "", "", "0"];
  const usedSeeds: number[] = [];

  await runSimulationMenu({
    rootDir: process.cwd(),
    maxTurns: 200,
    ask(prompt) {
      prompts.push(prompt);
      return Promise.resolve(inputs.shift() ?? "0");
    },
    write(message) {
      output.push(message);
    },
    nowMs() {
      return 0;
    },
    createSeed() {
      return 777;
    },
    runSingleGame(options) {
      usedSeeds.push(options.seed);
      return {
        seed: options.seed,
        endReason: "mainDeckExhausted",
        isGameEnd: true,
        turnsElapsed: 1,
        winnerIds: ["player-1"],
        isTie: false,
        players: [
          {
            playerId: "player-1",
            victoryPoints: 1,
            legendCount: 0,
            deadWizardTokenCount: 0,
          },
          {
            playerId: "player-2",
            victoryPoints: 0,
            legendCount: 0,
            deadWizardTokenCount: 0,
          },
        ],
        eventLog: [],
      };
    },
    runMassSimulation() {
      throw new Error("mass path should not run");
    },
  });

  assert.deepEqual(usedSeeds, [777]);
  assert.ok(
    prompts.some((prompt) => prompt.includes("Крутагидон 2: симулятор"))
  );
  assert.ok(prompts.includes("Seed партии [Enter = случайный]: "));
  assert.ok(prompts.includes("Нажмите Enter, чтобы вернуться в меню"));
  assert.ok(output.includes("Неверный пункт меню. Попробуйте еще раз."));
  assert.ok(output.some((message) => message.includes("Seed: 777")));
});

test("simulation menu repeats invalid mass count input and runs numeric count with generated seed", async () => {
  const output: string[] = [];
  const inputs = ["2", "bad", "3", "", "0"];
  const massRuns: Array<{ firstSeed: number; gameCount: number }> = [];

  await runSimulationMenu({
    rootDir: process.cwd(),
    maxTurns: 200,
    ask() {
      return Promise.resolve(inputs.shift() ?? "0");
    },
    write(message) {
      output.push(message);
    },
    nowMs() {
      return massRuns.length === 0 ? 0 : 1200;
    },
    createSeed() {
      return 900;
    },
    runSingleGame() {
      throw new Error("single path should not run");
    },
    runMassSimulation(options) {
      massRuns.push({
        firstSeed: options.firstSeed,
        gameCount: options.gameCount,
      });
      return {
        firstSeed: options.firstSeed,
        gameCount: options.gameCount,
        games: [],
        aggregate: {
          totalGames: options.gameCount,
          winCounts: {},
          winRates: {},
          tieCount: 0,
          tieRate: 0,
          endReasonCounts: {
            deadWizardTokensExhausted: 0,
            mainDeckExhausted: 0,
            legendDeckExhausted: 0,
            maxTurnsReached: 0,
          },
          averageTurnsElapsed: 0,
          totalPurchases: 0,
          averagePurchasesPerGame: 0,
        },
      };
    },
  });

  assert.deepEqual(massRuns, [{ firstSeed: 900, gameCount: 3 }]);
  assert.ok(output.includes("Введите положительное целое число."));
  assert.ok(output.some((message) => message.includes("Seed: 900-902")));
});

test("simulation menu writes a local technical report for unexpected single-game failures", async () => {
  const errorReportDir = await mkdtemp(
    join(tmpdir(), "krutagidon-menu-errors-")
  );
  const output: string[] = [];
  const inputs = ["1", "123", "", "0"];

  await runSimulationMenu({
    rootDir: process.cwd(),
    maxTurns: 200,
    errorReportDir,
    ask() {
      return Promise.resolve(inputs.shift() ?? "0");
    },
    write(message) {
      output.push(message);
    },
    nowMs() {
      return 1_234_567_890_000;
    },
    runSingleGame() {
      throw new Error("fixture failure");
    },
    runMassSimulation() {
      throw new Error("mass path should not run");
    },
  });

  const files = await readdir(errorReportDir);
  assert.equal(files.length, 1);
  const reportPath = join(errorReportDir, files[0]!);
  const report = await readFile(reportPath, "utf8");

  assert.ok(
    output.some((message) =>
      message.includes("Симуляция остановлена из-за ошибки.")
    )
  );
  assert.ok(output.some((message) => message.includes(reportPath)));
  assert.match(report, /mode: single-game/);
  assert.match(report, /seed: 123/);
  assert.match(report, /maxTurns: 200/);
  assert.match(report, /message: fixture failure/);
  assert.match(report, /stack:/);
});

test("simulation menu writes seed range and game count for unexpected mass failures", async () => {
  const errorReportDir = await mkdtemp(
    join(tmpdir(), "krutagidon-menu-errors-")
  );
  const output: string[] = [];
  const inputs = ["2", "", "", "0"];

  await runSimulationMenu({
    rootDir: process.cwd(),
    maxTurns: 200,
    errorReportDir,
    ask() {
      return Promise.resolve(inputs.shift() ?? "0");
    },
    write(message) {
      output.push(message);
    },
    nowMs() {
      return 1_234_567_890_000;
    },
    createSeed() {
      return 500;
    },
    runSingleGame() {
      throw new Error("single path should not run");
    },
    runMassSimulation() {
      throw new Error("mass fixture failure");
    },
  });

  const files = await readdir(errorReportDir);
  assert.equal(files.length, 1);
  const reportPath = join(errorReportDir, files[0]!);
  const report = await readFile(reportPath, "utf8");

  assert.ok(
    output.some((message) =>
      message.includes("Симуляция остановлена из-за ошибки.")
    )
  );
  assert.ok(output.some((message) => message.includes(reportPath)));
  assert.match(report, /mode: mass-simulation/);
  assert.match(report, /seedRange: 500-10499/);
  assert.match(report, /gameCount: 10000/);
  assert.match(report, /message: mass fixture failure/);
});

test("mass simulation menu summary includes Russian aggregate metrics and turn-limit warning", () => {
  const result: MassSimulationResult = {
    firstSeed: 100,
    gameCount: 2,
    games: [
      {
        seed: 100,
        winnerIds: ["player-1"],
        isTie: false,
        endReason: "mainDeckExhausted",
        isGameEnd: true,
        turnsElapsed: 10,
        totalPurchases: 4,
        purchasesByPlayer: { "player-1": 2, "player-2": 2 },
        players: [
          {
            playerId: "player-1",
            victoryPoints: 20,
            legendCount: 1,
            deadWizardTokenCount: 0,
          },
          {
            playerId: "player-2",
            victoryPoints: 15,
            legendCount: 0,
            deadWizardTokenCount: 1,
          },
        ],
      },
      {
        seed: 101,
        winnerIds: ["player-1", "player-2"],
        isTie: true,
        endReason: "maxTurnsReached",
        isGameEnd: false,
        turnsElapsed: 20,
        totalPurchases: 6,
        purchasesByPlayer: { "player-1": 3, "player-2": 3 },
        players: [
          {
            playerId: "player-1",
            victoryPoints: 18,
            legendCount: 0,
            deadWizardTokenCount: 2,
          },
          {
            playerId: "player-2",
            victoryPoints: 18,
            legendCount: 0,
            deadWizardTokenCount: 2,
          },
        ],
      },
    ],
    aggregate: {
      totalGames: 2,
      winCounts: { "player-1": 1 },
      winRates: { "player-1": 0.5 },
      tieCount: 1,
      tieRate: 0.5,
      endReasonCounts: {
        deadWizardTokensExhausted: 0,
        mainDeckExhausted: 1,
        legendDeckExhausted: 0,
        maxTurnsReached: 1,
      },
      averageTurnsElapsed: 15,
      totalPurchases: 10,
      averagePurchasesPerGame: 5,
    },
  };

  assert.equal(
    formatMassSimulationSummary(result, 1.234),
    [
      "Массовый прогон завершен",
      "Партий: 2",
      "Seed: 100-101",
      "Победы:",
      "- player-1: 50.0%",
      "- Ничья: 50.0%",
      "Средние значения:",
      "- Ходы: 15.0",
      "- player-1: 19.0 ПО, 1.0 ЖДК",
      "- player-2: 16.5 ПО, 1.5 ЖДК",
      "Причины завершения:",
      "- закончилась основная колода: 1",
      "- достигнут технический лимит ходов: 1",
      "Время: 1.2 сек.",
      "Внимание: 1 партий достигли технического лимита ходов.",
    ].join("\n")
  );
});
