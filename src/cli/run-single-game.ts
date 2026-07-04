import { runSingleGame } from "../engine/simulation.js";

interface CliOptions {
  seed: number;
  maxTurns: number;
}

const options = parseArgs(process.argv.slice(2));
const result = runSingleGame({
  rootDir: process.cwd(),
  seed: options.seed,
  maxTurns: options.maxTurns,
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
  return {
    seed: readNumberOption(args, "--seed", 60615),
    maxTurns: readNumberOption(args, "--maxTurns", 200),
  };
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
