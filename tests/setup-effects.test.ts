import assert from "node:assert/strict";
import test from "node:test";

import {
  tryExecuteSetupEffect,
  type EffectRuntimeSetupServices,
  type SetupEffectSourceContext,
} from "../src/engine/effect-runtime-registry.js";
import type { PlayerState } from "../src/engine/setup.js";

function services(
  definitions: string[] = ["target"]
): EffectRuntimeSetupServices {
  let nextId = 1;
  return {
    hasCardDefinition: (definitionId) => definitions.includes(definitionId),
    createCardInstance: (definitionId, ownerId) => ({
      instanceId: `factory-${nextId++}` as never,
      definitionId: definitionId as never,
      ownerId,
      marketChips: 0,
    }),
    allowsMissingData: false,
  };
}

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
    source,
    services()
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
    source,
    services()
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
      source,
      services()
    );

    assert.equal(result.status, "error");
    assert.equal(subject.life.current, 20);
    assert.equal(subject.life.max, 25);
  }
});

test("replace_starting_card replaces first matching card in zone order", () => {
  const subject = player();
  subject.hand.push({ instanceId: "hand-a" as never, definitionId: "a" as never, ownerId: subject.playerId, marketChips: 0 });
  subject.deck.push({ instanceId: "deck-a" as never, definitionId: "a" as never, ownerId: subject.playerId, marketChips: 0 });
  const result = tryExecuteSetupEffect(subject, { effectId: "replace_starting_card", timing: "setup", fromDefinitionId: "a", toDefinitionId: "target" }, source, services());
  assert.deepEqual(result, { status: "executed" });
  assert.equal(subject.hand.length, 1);
  assert.equal(subject.hand[0]?.definitionId, "target");
  assert.equal(subject.hand[0]?.instanceId, "factory-1");
  assert.equal(subject.deck[0]?.instanceId, "deck-a");
});

test("replace_starting_card missing data is tolerated only by incomplete pack", () => {
  const subject = player();
  subject.hand.push({ instanceId: "hand-a" as never, definitionId: "a" as never, ownerId: subject.playerId, marketChips: 0 });
  const full = tryExecuteSetupEffect(subject, { effectId: "replace_starting_card", timing: "setup", fromDefinitionId: "a", toDefinitionId: "missing" }, source, services());
  assert.equal(full.status, "error");
  const incomplete = tryExecuteSetupEffect(subject, { effectId: "replace_starting_card", timing: "setup", fromDefinitionId: "a", toDefinitionId: "missing" }, source, { ...services(), allowsMissingData: true });
  assert.deepEqual(incomplete, { status: "executed" });
  assert.equal(subject.hand[0]?.definitionId, "a");
});

test("start_with_basic_trophy is idempotent", () => {
  const subject = player();
  const effect = { effectId: "start_with_basic_trophy", timing: "setup" } as const;
  assert.deepEqual(tryExecuteSetupEffect(subject, effect, source, services()), { status: "executed" });
  assert.deepEqual(tryExecuteSetupEffect(subject, effect, source, services()), { status: "executed" });
  assert.equal(subject.trophyLikeObjects.length, 1);
  assert.equal(subject.trophyLikeObjects[0]?.instanceId, "setup-basic-trophy-player-1");
});

test("setup executor accepts fixture runtime mode explicitly", () => {
  const result = tryExecuteSetupEffect(
    player(),
    { effectId: "set_starting_life_total", timing: "setup", lifeTotal: 30 },
    { ...source, runtimeMode: "fixture" },
    services()
  );

  assert.deepEqual(result, { status: "executed" });
});
