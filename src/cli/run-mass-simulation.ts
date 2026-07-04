import { runMassSimulation } from "../engine/mass-simulation.js";

interface CliOptions {
  firstSeed: number;
  gameCount: number;
  maxTurns: number;
}

const options = parseArgs(process.argv.slice(2));
const result = runMassSimulation({
  rootDir: process.cwd(),
  firstSeed: options.firstSeed,
  gameCount: options.gameCount,
  maxTurns: options.maxTurns,
});

console.log(JSON.stringify(result, null, 2));

function parseArgs(args: string[]): CliOptions {
  return {
    firstSeed: readNumberOption(args, "--firstSeed", 60615),
    gameCount: readNumberOption(args, "--games", 10),
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
