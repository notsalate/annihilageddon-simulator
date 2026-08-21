import assert from "node:assert/strict";
import test from "node:test";

import {
  determineWinnerIds,
  type PlayerScore,
} from "../src/engine/adjudication.js";
import { markPlayerId } from "../src/domain/types.js";

function score(
  playerId: `player-${number}`,
  victoryPoints: number,
  legendCount: number,
  deadWizardTokenCount: number
): PlayerScore {
  return {
    playerId: markPlayerId(playerId),
    victoryPoints,
    legendCount,
    deadWizardTokenCount,
  };
}

test("adjudication chooses the highest victory-point score", () => {
  assert.deepEqual(
    determineWinnerIds([
      score("player-1", 8, 0, 0),
      score("player-2", 7, 10, 0),
    ]),
    ["player-1"]
  );
});

test("adjudication uses legend count as the first tie-break", () => {
  assert.deepEqual(
    determineWinnerIds([
      score("player-1", 8, 1, 0),
      score("player-2", 8, 2, 3),
    ]),
    ["player-2"]
  );
});

test("adjudication uses fewer dead wizard tokens as the second tie-break", () => {
  assert.deepEqual(
    determineWinnerIds([
      score("player-1", 8, 2, 1),
      score("player-2", 8, 2, 0),
    ]),
    ["player-2"]
  );
});

test("adjudication returns every player in a complete tie", () => {
  assert.deepEqual(
    determineWinnerIds([
      score("player-1", 8, 2, 0),
      score("player-2", 8, 2, 0),
    ]),
    ["player-1", "player-2"]
  );
});
