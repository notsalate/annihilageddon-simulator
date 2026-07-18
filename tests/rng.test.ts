import assert from "node:assert/strict";
import test from "node:test";

import { createSeededRng } from "../src/index.js";

test("seeded RNG produces repeatable sequences", () => {
  const firstRun = createSeededRng(20260615);
  const secondRun = createSeededRng(20260615);

  const firstSequence = Array.from({ length: 8 }, () => firstRun.nextInt(1000));
  const secondSequence = Array.from({ length: 8 }, () =>
    secondRun.nextInt(1000)
  );

  assert.deepEqual(firstSequence, secondSequence);
});

test("different seeds produce different sequences", () => {
  const firstRun = createSeededRng(1);
  const secondRun = createSeededRng(2);

  const firstSequence = Array.from({ length: 8 }, () => firstRun.nextInt(1000));
  const secondSequence = Array.from({ length: 8 }, () =>
    secondRun.nextInt(1000)
  );

  assert.notDeepEqual(firstSequence, secondSequence);
});

test("fork preserves the current RNG position without consuming the source", () => {
  const source = createSeededRng(42);
  source.next();
  source.nextInt(100);

  const fork = source.fork();

  assert.equal(source.next(), fork.next());
});

test("forks remain independent after advancing either branch", () => {
  const source = createSeededRng(43);
  const fork = source.fork();
  const expected = createSeededRng(43);

  assert.equal(source.nextInt(1000), fork.nextInt(1000));
  expected.nextInt(1000);
  source.nextInt(1000);
  assert.equal(fork.nextInt(1000), expected.nextInt(1000));
});

test("fork after mixed draws continues the current sequence", () => {
  const source = createSeededRng(44);
  source.next();
  source.nextInt(17);
  source.next();
  const fork = source.fork();
  const expected = [source.nextInt(100), source.nextInt(100), source.next()];
  const actual = [fork.nextInt(100), fork.nextInt(100), fork.next()];

  assert.deepEqual(actual, expected);
});
