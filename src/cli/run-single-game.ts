import { readFileSync } from "node:fs";

import {
  createLoadedDataPackFromSimulationFailureReport,
  runSingleGame,
  type SimulationFailureReport,
} from "../engine/simulation.js";

interface CliOptions {
  seed: number;
  maxTurns: number;
  playerCount?: number;
  dataPackPath?: string;
  replayReport?: string;
}

const options = parseArgs(process.argv.slice(2));
const replayRuntimeData =
  options.replayReport === undefined
    ? undefined
    : readSimulationFailureRuntimeData(options.replayReport);
const dataSource =
  replayRuntimeData === undefined
    ? options.dataPackPath === undefined
      ? {}
      : { dataPackPath: options.dataPackPath }
    : {
        dataPack:
          createLoadedDataPackFromSimulationFailureReport(replayRuntimeData),
      };
const result = runSingleGame({
  rootDir: process.cwd(),
  seed: options.seed,
  maxTurns: options.maxTurns,
  ...(options.playerCount === undefined
    ? {}
    : { playerCount: options.playerCount }),
  ...dataSource,
});

console.log(
  JSON.stringify(
    {
      seed: result.seed,
      endReason: result.endReason,
      isGameEnd: result.isGameEnd,
      turnsElapsed: result.turnsElapsed,
      winnerIds: result.winnerIds,
      isTie: result.isTie,
      players: result.players,
    },
    null,
    2
  )
);

function parseArgs(args: string[]): CliOptions {
  const playerCount = readOptionalNumberOption(args, "--playerCount");
  const dataPackPath = readOptionalStringOption(args, "--dataPackPath");
  const replayReport = readOptionalStringOption(args, "--replayReport");
  if (dataPackPath !== undefined && replayReport !== undefined) {
    throw new Error(
      "--dataPackPath and --replayReport cannot be used together"
    );
  }
  return {
    seed: readNumberOption(args, "--seed", 60615),
    maxTurns: readNumberOption(args, "--maxTurns", 200),
    ...(playerCount === undefined ? {} : { playerCount }),
    ...(dataPackPath === undefined ? {} : { dataPackPath }),
    ...(replayReport === undefined ? {} : { replayReport }),
  };
}

function readSimulationFailureRuntimeData(
  reportPath: string
): SimulationFailureReport["runtimeData"] {
  const reportText = readFileSync(reportPath, "utf8");
  const value: unknown = JSON.parse(readJsonSection(reportText, "runtimeData"));
  if (!isSimulationFailureRuntimeData(value)) {
    throw new Error("Report runtimeData has an invalid shape");
  }
  return value;
}

function readJsonSection(reportText: string, section: string): string {
  const codeFence = "`".repeat(3);
  const marker = `${section}:\n${codeFence}json\n`;
  const start = reportText.indexOf(marker);
  if (start < 0) {
    throw new Error(`Report does not contain ${section}`);
  }
  const contentStart = start + marker.length;
  const contentEnd = reportText.indexOf(`\n${codeFence}`, contentStart);
  if (contentEnd < 0) {
    throw new Error(`Report section ${section} is not closed`);
  }
  return reportText.slice(contentStart, contentEnd);
}

function isSimulationFailureRuntimeData(
  value: unknown
): value is SimulationFailureReport["runtimeData"] {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    "manifest" in record &&
    "cardDefinitions" in record &&
    "tokenDefinitions" in record &&
    "decks" in record &&
    "tokenStacks" in record
  );
}

function readOptionalNumberOption(
  args: string[],
  optionName: string
): number | undefined {
  const optionIndex = args.indexOf(optionName);
  if (optionIndex < 0) {
    return undefined;
  }

  const value = args[optionIndex + 1];
  if (value === undefined) {
    throw new Error(`Missing value for ${optionName}`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${optionName} must be a positive safe integer`);
  }

  return parsed;
}

function readOptionalStringOption(
  args: string[],
  optionName: string
): string | undefined {
  const optionIndex = args.indexOf(optionName);
  if (optionIndex < 0) {
    return undefined;
  }

  const value = args[optionIndex + 1];
  if (value === undefined || value === "") {
    throw new Error(`Missing value for ${optionName}`);
  }

  return value;
}

function readNumberOption(
  args: string[],
  optionName: string,
  fallback: number
): number {
  const optionIndex = args.indexOf(optionName);
  if (optionIndex < 0) {
    return fallback;
  }

  const value = args[optionIndex + 1];
  if (value === undefined) {
    throw new Error(`Missing value for ${optionName}`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${optionName} must be a positive safe integer`);
  }

  return parsed;
}
