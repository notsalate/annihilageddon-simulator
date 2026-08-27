import { readFileSync } from "node:fs";

import {
  createLoadedDataPackFromSimulationFailureReport,
  parseSimulationFailureReplayReport,
  runSingleGame,
} from "../engine/simulation.js";

interface CliOptions {
  seed: number;
  maxTurns: number;
  playerCount?: number;
  deadWizardTokenCount?: number;
  dataPackPath?: string;
  replayReport?: string;
}

const options = parseArgs(process.argv.slice(2));
const replayData =
  options.replayReport === undefined
    ? undefined
    : parseSimulationFailureReplayReport(
        readFileSync(options.replayReport, "utf8")
      );
const playerCount = options.playerCount ?? replayData?.playerCount;
const deadWizardTokenCount =
  options.deadWizardTokenCount ?? replayData?.deadWizardTokenCount;
const dataSource =
  replayData === undefined
    ? options.dataPackPath === undefined
      ? {}
      : { dataPackPath: options.dataPackPath }
    : {
        dataPack: createLoadedDataPackFromSimulationFailureReport(
          replayData.runtimeData
        ),
        replay: replayData.replay,
      };
const result = runSingleGame({
  rootDir: process.cwd(),
  seed: options.seed,
  maxTurns: options.maxTurns,
  ...(playerCount === undefined ? {} : { playerCount }),
  ...(deadWizardTokenCount === undefined ? {} : { deadWizardTokenCount }),
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
  const deadWizardTokenCount = readOptionalNonNegativeSafeInteger(
    args,
    "--deadWizardTokenCount"
  );
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
    ...(deadWizardTokenCount === undefined ? {} : { deadWizardTokenCount }),
    ...(dataPackPath === undefined ? {} : { dataPackPath }),
    ...(replayReport === undefined ? {} : { replayReport }),
  };
}

function readOptionalNonNegativeSafeInteger(
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
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${optionName} must be a non-negative safe integer`);
  }

  return parsed;
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
