import { readFileSync } from "node:fs";

import {
  createLoadedDataPackFromSimulationFailureReport,
  runSingleGame,
  type SimulationFailureReport,
  type SimulationFailureReplay,
  type SimulationFailureReplayChoice,
} from "../engine/simulation.js";
import type { GameAction } from "../engine/actions.js";

interface CliOptions {
  seed: number;
  maxTurns: number;
  playerCount?: number;
  dataPackPath?: string;
  replayReport?: string;
}

const options = parseArgs(process.argv.slice(2));
const replayData =
  options.replayReport === undefined
    ? undefined
    : readSimulationFailureReplayData(options.replayReport);
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

function readSimulationFailureReplayData(reportPath: string): {
  runtimeData: SimulationFailureReport["runtimeData"];
  replay: SimulationFailureReplay;
} {
  const reportText = readFileSync(reportPath, "utf8");
  const runtimeDataValue: unknown = JSON.parse(
    readJsonSection(reportText, "runtimeData")
  );
  if (!isSimulationFailureRuntimeData(runtimeDataValue)) {
    throw new Error("Report runtimeData has an invalid shape");
  }
  const actionsValue: unknown = JSON.parse(
    readJsonSection(reportText, "actions")
  );
  if (!isGameActionArray(actionsValue)) {
    throw new Error("Report actions have an invalid shape");
  }
  const choicesValue: unknown = JSON.parse(
    readJsonSection(reportText, "choices")
  );
  return {
    runtimeData: runtimeDataValue,
    replay: {
      actions: actionsValue,
      choices: readReplayChoices(choicesValue),
    },
  };
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
    "tokenStacks" in record &&
    Array.isArray(record["cardDefinitions"]) &&
    Array.isArray(record["tokenDefinitions"])
  );
}

function isGameActionArray(value: unknown): value is GameAction[] {
  return Array.isArray(value) && value.every(isGameAction);
}

function isGameAction(value: unknown): value is GameAction {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  switch (record["type"]) {
    case "endTurn":
      return true;
    case "playCard":
    case "activatePermanent":
      return typeof record["cardInstanceId"] === "string";
    case "activateWizardProperty":
      return typeof record["tokenInstanceId"] === "string";
    case "buyMarketCard":
      return (
        typeof record["cardInstanceId"] === "string" &&
        (record["source"] === "mainMarket" ||
          record["source"] === "legendMarket" ||
          record["source"] === "wildMagicStack" ||
          record["source"] === "familiar")
      );
    default:
      return false;
  }
}

function readReplayChoices(value: unknown): SimulationFailureReplay["choices"] {
  if (!Array.isArray(value)) {
    throw new Error("Report choices have an invalid shape");
  }

  const choices: SimulationFailureReplayChoice[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Report choice has an invalid shape");
    }
    const record = entry as Record<string, unknown>;
    if (
      record["type"] !== "effectChoiceSelected" &&
      record["type"] !== "effectChoiceSkipped"
    ) {
      continue;
    }
    if (
      typeof record["playerId"] !== "string" ||
      typeof record["effectId"] !== "string"
    ) {
      throw new Error("Report effect choice has an invalid shape");
    }
    if (record["type"] === "effectChoiceSkipped") {
      choices.push({
        type: "effectChoiceSkipped",
        playerId: record["playerId"],
        effectId: record["effectId"],
      });
      continue;
    }
    if (typeof record["choiceId"] !== "string") {
      throw new Error("Report selected effect choice has no choiceId");
    }
    choices.push({
      type: "effectChoiceSelected",
      playerId: record["playerId"],
      effectId: record["effectId"],
      choiceId: record["choiceId"],
    });
  }
  return choices;
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
