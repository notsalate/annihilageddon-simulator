import assert from "node:assert/strict";
import test from "node:test";
import { formatBestMoveAnalysis, parseBestMoveArgs } from "../src/cli/run-best-move-analysis.js";

test("parser applies defaults and accepts every option", () => {
  assert.deepEqual(parseBestMoveArgs(["--seed", "7", "--playerCount", "3", "--criterion", "victory-points", "--maxChoiceDepth", "4", "--maxBranchesPerAction", "5", "--maxActionsPerLine", "6", "--maxTurnLines", "7", "--top", "3"]), {
    seed: 7, playerCount: 3, criterion: "victory-points", maxChoiceDepth: 4,
    maxBranchesPerAction: 5, maxActionsPerLine: 6, maxTurnLines: 7, top: 3,
  });
  assert.deepEqual(parseBestMoveArgs([]), { seed: 60615, playerCount: 2, criterion: "victory-points", maxChoiceDepth: 32, maxBranchesPerAction: 4096, maxActionsPerLine: 128, maxTurnLines: 100000, top: 10 });
});

test("parser rejects invalid numeric values and unknown criterion", () => {
  for (const value of ["0", "-1", "1.5", "9007199254740992"]) {
    assert.throws(() => parseBestMoveArgs(["--top", value]), /positive safe integer/);
  }
  assert.throws(() => parseBestMoveArgs(["--criterion", "nope"]), /victory-points/);
  assert.throws(() => parseBestMoveArgs(["--seed"]), /requires a value/);
});

test("formatter reports best as rank one and only serializable DTO fields", () => {
  const dto = formatBestMoveAnalysis({ seed: 1, playerCount: 2, initialPlayerId: "p1", initialTurnNumber: 1, criterionId: "victory-points", limits: { maxChoiceDepth: 1, maxBranchesPerAction: 1, maxActionsPerLine: 1, maxTurnLines: 1 }, rankedLines: [{ rank: 1, score: 2, components: { victoryPoints: 2 }, terminalReason: "endTurn", steps: [{ action: { type: "endTurn" }, selectedChoices: [] }] }] });
  assert.equal(dto.best?.rank, 1);
  assert.equal(dto.alternatives.length, 1);
  assert.equal(JSON.stringify(dto).includes("GameState"), false);
});
