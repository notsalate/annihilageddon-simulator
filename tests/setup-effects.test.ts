import assert from "node:assert/strict";
import test from "node:test";

import {
  tryExecuteSetupEffect,
  type SetupEffectSourceContext,
} from "../src/engine/effect-runtime-registry.js";
import type { PlayerState } from "../src/engine/setup.js";

function player(): PlayerState {
  return {
    playerId: "player-1" as PlayerState["playerId"],
    deck: [],
    hand: [],
    discard: [],
    playedThisTurn: [],
    permanents: [],
    unboughtFamiliar: undefined,
    deadWizardTokens: [],
    wizardProperties: [],
    statuses: [],
    trophyLikeObjects: [],
    chips: 0,
    life: { current: 20, max: 25 },
  };
}

const source: SetupEffectSourceContext = {
  sourceType: "wizardProperty",
  runtimeMode: "combat",
  playerId: "player-1" as PlayerState["playerId"],
  tokenInstanceId: "token-1",
  tokenDefinitionId: "property-1",
};

test("setup catalog executor sets starting life total", () => {
  const subject = player();

  const result = tryExecuteSetupEffect(
    subject,
    { effectId: "set_starting_life_total", timing: "setup", lifeTotal: 30 },
    source
  );

  assert.deepEqual(result, { status: "executed" });
  assert.equal(subject.life.current, 30);
  assert.equal(subject.life.max, 30);
});

test("setup life total does not reduce previous maximum", () => {
  const subject = player();
  subject.life.max = 40;

  const result = tryExecuteSetupEffect(
    subject,
    { effectId: "set_starting_life_total", timing: "setup", lifeTotal: 30 },
    source
  );

  assert.deepEqual(result, { status: "executed" });
  assert.equal(subject.life.current, 30);
  assert.equal(subject.life.max, 40);
});

test("setup resolver rejects invalid life totals before execution", () => {
  for (const lifeTotal of [0, -1, 1.5, "30"]) {
    const subject = player();
    const result = tryExecuteSetupEffect(
      subject,
      {
        effectId: "set_starting_life_total",
        timing: "setup",
        lifeTotal,
      } as never,
      source
    );

    assert.equal(result.status, "error");
    assert.equal(subject.life.current, 20);
    assert.equal(subject.life.max, 25);
  }
});

test("known setup effect without executor is reported as not implemented", () => {
  const result = tryExecuteSetupEffect(
    player(),
    { effectId: "replace_starting_card", timing: "setup", fromDefinitionId: "a", toDefinitionId: "b" },
    source
  );

  assert.deepEqual(result, { status: "notImplemented" });
});

test("setup executor accepts fixture runtime mode explicitly", () => {
  const result = tryExecuteSetupEffect(
    player(),
    { effectId: "set_starting_life_total", timing: "setup", lifeTotal: 30 },
    { ...source, runtimeMode: "fixture" }
  );

  assert.deepEqual(result, { status: "executed" });
});
