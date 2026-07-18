import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import {
  formatBestMoveAnalysis,
  parseBestMoveArgs,
} from "../src/cli/run-best-move-analysis.js";

test("parser applies defaults and accepts every option", () => {
  assert.deepEqual(
    parseBestMoveArgs([
      "--seed",
      "7",
      "--playerCount",
      "3",
      "--criterion",
      "victory-points",
      "--maxChoiceDepth",
      "4",
      "--maxBranchesPerAction",
      "5",
      "--maxActionsPerLine",
      "6",
      "--maxTurnLines",
      "7",
      "--top",
      "3",
    ]),
    {
      seed: 7,
      playerCount: 3,
      criterion: "victory-points",
      maxChoiceDepth: 4,
      maxBranchesPerAction: 5,
      maxActionsPerLine: 6,
      maxTurnLines: 7,
      top: 3,
    }
  );
  assert.deepEqual(parseBestMoveArgs([]), {
    seed: 60615,
    playerCount: 2,
    criterion: "victory-points",
    maxChoiceDepth: 32,
    maxBranchesPerAction: 4096,
    maxActionsPerLine: 128,
    maxTurnLines: 100000,
    top: 10,
  });
});

test("parser rejects invalid numeric values and unknown criterion", () => {
  for (const value of ["0", "-1", "1.5", "9007199254740992"]) {
    assert.throws(
      () => parseBestMoveArgs(["--top", value]),
      /positive safe integer/
    );
  }
  assert.throws(
    () => parseBestMoveArgs(["--criterion", "nope"]),
    /victory-points/
  );
  assert.throws(() => parseBestMoveArgs(["--seed"]), /requires a value/);
  assert.throws(
    () => parseBestMoveArgs(["--unknown", "1"]),
    /Unsupported argument: --unknown/
  );
});

test("formatter reports best separately and limits alternatives with --top", () => {
  const rankedLines = [1, 2, 3, 4, 5].map((rank) => ({
    rank,
    score: 10 - rank,
    components: { victoryPoints: 10 - rank },
    terminalReason: "endTurn" as const,
    steps: [{ action: { type: "endTurn" as const }, selectedChoices: [] }],
  }));
  const dto = formatBestMoveAnalysis({
    seed: 1,
    playerCount: 2,
    initialPlayerId: "p1",
    initialTurnNumber: 1,
    criterionId: "victory-points",
    limits: {
      maxChoiceDepth: 1,
      maxBranchesPerAction: 1,
      maxActionsPerLine: 1,
      maxTurnLines: 1,
    },
    top: 3,
    rankedLines,
  });
  assert.equal(dto.best?.rank, 1);
  assert.deepEqual(
    dto.alternatives.map((line) => line.rank),
    [2, 3, 4]
  );
  assert.equal(
    dto.alternatives.some((line) => line.rank === dto.best?.rank),
    false
  );
  assert.equal(dto.totalLineCount, 5);
  assert.equal(dto.reportedLineCount, 4);
  assert.equal(JSON.stringify(dto).includes("GameState"), false);
});

test("formatter keeps selected choice indexes and stable IDs in the DTO", () => {
  const dto = formatBestMoveAnalysis({
    seed: 1,
    playerCount: 2,
    initialPlayerId: "p1",
    initialTurnNumber: 1,
    criterionId: "victory-points",
    limits: {
      maxChoiceDepth: 1,
      maxBranchesPerAction: 1,
      maxActionsPerLine: 1,
      maxTurnLines: 1,
    },
    rankedLines: [
      {
        rank: 1,
        score: 1,
        terminalReason: "endTurn",
        steps: [
          {
            action: { type: "playCard", cardInstanceId: "card-1" },
            selectedChoices: [
              {
                requestIndex: 2,
                effectId: "choose_target",
                choiceIndex: 1,
                choiceId: "player-2",
                choiceKind: "playerTarget",
              },
            ],
          },
        ],
      },
    ],
  });

  assert.deepEqual(dto.best?.steps[0], {
    action: { type: "playCard", cardInstanceId: "card-1" },
    selectedChoices: [
      {
        requestIndex: 2,
        effectId: "choose_target",
        choiceIndex: 1,
        choiceId: "player-2",
        choiceKind: "playerTarget",
      },
    ],
  });
});

test("formatter serializes equal analysis input byte-stably", () => {
  const input = {
    seed: 1,
    playerCount: 2,
    initialPlayerId: "p1",
    initialTurnNumber: 1,
    criterionId: "victory-points",
    limits: {
      maxChoiceDepth: 1,
      maxBranchesPerAction: 1,
      maxActionsPerLine: 1,
      maxTurnLines: 1,
    },
    rankedLines: [
      {
        rank: 1,
        score: 1,
        terminalReason: "endTurn" as const,
        steps: [{ action: { type: "endTurn" as const }, selectedChoices: [] }],
      },
    ],
  };

  assert.equal(
    JSON.stringify(formatBestMoveAnalysis(input), null, 2),
    JSON.stringify(formatBestMoveAnalysis(input), null, 2)
  );
});

test("CLI exits with an error instead of printing a partial report on analysis limits", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(
        process.cwd(),
        "dist",
        "src",
        "cli",
        "run-best-move-analysis.js"
      ),
      "--seed",
      "60615",
      "--maxActionsPerLine",
      "1",
    ],
    { cwd: process.cwd(), encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /action limit exceeded 1/);
});

test("single-game CLI remains an independent baseline simulation command", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "dist", "src", "cli", "run-single-game.js"),
      "--seed",
      "60615",
      "--maxTurns",
      "1",
    ],
    { cwd: process.cwd(), encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as {
    seed: number;
    turnsElapsed: number;
  };
  assert.equal(output.seed, 60615);
  assert.equal(output.turnsElapsed, 1);
});
