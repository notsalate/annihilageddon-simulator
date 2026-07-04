import { createInterface } from "node:readline";

import { runSimulationMenu } from "./simulation-menu.js";

const readline = createInterface({
  input: process.stdin,
  output: process.stdout,
});
const inputLines = readline[Symbol.asyncIterator]();

try {
  await runSimulationMenu({
    rootDir: process.cwd(),
    maxTurns: readNumberOption(process.argv.slice(2), "--maxTurns", 200),
    async ask(prompt) {
      process.stdout.write(prompt);
      const next = await inputLines.next();
      return next.done ? "0" : next.value;
    },
    write(message) {
      console.log(message);
    },
  });
} finally {
  readline.close();
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
