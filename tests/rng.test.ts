import assert from "node:assert/strict";
import test from "node:test";

import { createSeededRng } from "../src/index.js";

test("seeded RNG produces repeatable sequences", () => {
  const firstRun = createSeededRng(20260615);
  const secondRun = createSeededRng(20260615);

  const firstSequence = Array.from({ length: 8 }, () => firstRun.nextInt(1000));
  const secondSequence = Array.from({ length: 8 }, () => secondRun.nextInt(1000));

  assert.deepEqual(firstSequence, secondSequence);
});

test("different seeds produce different sequences", () => {
  const firstRun = createSeededRng(1);
  const secondRun = createSeededRng(2);

  const firstSequence = Array.from({ length: 8 }, () => firstRun.nextInt(1000));
  const secondSequence = Array.from({ length: 8 }, () => secondRun.nextInt(1000));

  assert.notDeepEqual(firstSequence, secondSequence);
});
