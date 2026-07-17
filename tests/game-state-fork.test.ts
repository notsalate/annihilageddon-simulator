import assert from "node:assert/strict";
import test from "node:test";

import { applyAction, forkGameState, initializeGame } from "../src/index.js";

const rootDir = process.cwd();

test("forkGameState isolates mutable state and preserves shared definitions", () => {
  const choiceStrategy = () => undefined;
  const source = initializeGame({
    rootDir,
    seed: 124,
    effectChoiceStrategy: choiceStrategy,
  });
  const fork = forkGameState(source);
  const sourcePlayer = source.players[0];
  const forkPlayer = fork.players[0];
  assert.ok(sourcePlayer);
  assert.ok(forkPlayer);

  fork.turn.activatedCardIds.push("fork-only");
  forkPlayer.chips += 3;
  forkPlayer.life.current -= 1;
  forkPlayer.hand.push({ ...forkPlayer.hand[0]! });
  fork.common.market[0]!.marketChips += 1;

  assert.equal(source.turn.activatedCardIds.includes("fork-only"), false);
  assert.notEqual(sourcePlayer.chips, forkPlayer.chips);
  assert.notEqual(sourcePlayer.life.current, forkPlayer.life.current);
  assert.equal(sourcePlayer.hand.length + 1, forkPlayer.hand.length);
  assert.notEqual(
    source.common.market[0]!.marketChips,
    fork.common.market[0]!.marketChips
  );
  assert.equal(fork.cardDefinitions, source.cardDefinitions);
  assert.equal(fork.tokenDefinitions, source.tokenDefinitions);
  assert.equal(fork.effectChoiceStrategy, choiceStrategy);
  assert.notEqual(fork.eventLog, source.eventLog);
});

test("fork keeps event sequences unique when applying an action", () => {
  const source = initializeGame({ rootDir, seed: 126 });
  const fork = forkGameState(source);
  const before = fork.eventLog.length;
  const result = applyAction(fork, { type: "endTurn" });

  assert.equal(result.ok, true);
  assert.ok(fork.eventLog.length > before);
  const sequences = fork.eventLog
    .map((event) => event.eventSequence)
    .filter((sequence): sequence is number => sequence !== undefined);
  assert.equal(new Set(sequences).size, sequences.length);
});
