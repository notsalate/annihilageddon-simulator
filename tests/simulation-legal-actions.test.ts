import assert from "node:assert/strict";
import test from "node:test";

import { runSingleGame } from "../src/index.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

test("single-game simulation accepts an action selected from the legal action list", () => {
  const result = runSingleGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    maxTurns: 1,
    bot: {
      chooseAction({ legalActions }) {
        return legalActions[0] ?? { type: "endTurn" };
      },
    },
  });

  assert.equal(result.endReason, "maxTurnsReached");
  assert.ok(
    result.eventLog.some((event) => event.type === "botActionSelected")
  );
});
