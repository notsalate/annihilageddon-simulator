import assert from "node:assert/strict";
import test from "node:test";

import {
  tryExecuteSetupEffect,
  type EffectRuntimeSetupServices,
  type SetupEffectSourceContext,
} from "../src/engine/effect-runtime-registry.js";
import type { PlayerState } from "../src/engine/setup.js";
import {
  initializeGame,
  loadCurrentRuntimeDataPack,
  type LoadedDataPack,
  type RuntimeEffect,
} from "../src/index.js";

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

test("force starting player returns a typed setup directive", () => {
  const result = tryExecuteSetupEffect(
    player(),
    { effectId: "force_starting_player", timing: "setup" },
    source,
    services()
  );

  assert.deepEqual(result, {
    status: "executed",
    directive: { kind: "forceStartingPlayer", playerId: source.playerId },
  });
});

test("force starting player rejects an invalid target selector before execution", () => {
  const result = tryExecuteSetupEffect(
    player(),
    {
      effectId: "force_starting_player",
      timing: "setup",
      targetSelector: "opponentPlayer",
    },
    source,
    services()
  );

  assert.equal(result.status, "error");
  if (result.status === "error") {
    assert.match(result.error, /unsupported force-starting-player target/);
  }
});

test("the first force directive wins in player order", () => {
  const players = [player(), { ...player(), playerId: "player-2" as never }];
  const directives = players.map((subject) => {
    const result = tryExecuteSetupEffect(
      subject,
      { effectId: "force_starting_player", timing: "setup" },
      { ...source, playerId: subject.playerId },
      services()
    );
    assert.equal(result.status, "executed");
    if (result.status !== "executed") throw new Error("force directive failed");
    return result.directive;
  });

  const forcedPlayerId = directives.find(
    (directive) => directive?.kind === "forceStartingPlayer"
  )?.playerId;
  assert.equal(forcedPlayerId, players[0]?.playerId);
});

test("setup without force directive leaves the active player choice unforced", () => {
  const result = tryExecuteSetupEffect(
    player(),
    { effectId: "set_starting_life_total", timing: "setup", lifeTotal: 30 },
    source,
    services()
  );

  assert.deepEqual(result, { status: "executed" });
});

test("forced setup consumes the same random-player draw as unforced setup", () => {
  const forced = initializeGame({ dataPack: setupDataPack(true), seed: 119 });
  const unforced = initializeGame({
    dataPack: setupDataPack(false),
    seed: 119,
  });
  assert.equal(forced.rng.nextInt(1000), unforced.rng.nextInt(1000));
});

test("two forced properties choose the first player in players order", () => {
  const state = initializeGame({ dataPack: setupDataPack(true), seed: 119 });
  assert.equal(state.activePlayerId, state.players[0]?.playerId);
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
  subject.hand.push({
    instanceId: "hand-a" as never,
    definitionId: "a" as never,
    ownerId: subject.playerId,
    marketChips: 0,
  });
  subject.deck.push({
    instanceId: "deck-a" as never,
    definitionId: "a" as never,
    ownerId: subject.playerId,
    marketChips: 0,
  });
  const result = tryExecuteSetupEffect(
    subject,
    {
      effectId: "replace_starting_card",
      timing: "setup",
      fromDefinitionId: "a",
      toDefinitionId: "target",
    },
    source,
    services()
  );
  assert.deepEqual(result, { status: "executed" });
  assert.equal(subject.hand.length, 1);
  assert.equal(subject.hand[0]?.definitionId, "target");
  assert.equal(subject.hand[0]?.instanceId, "factory-1");
  assert.equal(subject.deck[0]?.instanceId, "deck-a");
});

test("replace_starting_card missing data is tolerated only by incomplete pack", () => {
  const subject = player();
  subject.hand.push({
    instanceId: "hand-a" as never,
    definitionId: "a" as never,
    ownerId: subject.playerId,
    marketChips: 0,
  });
  const full = tryExecuteSetupEffect(
    subject,
    {
      effectId: "replace_starting_card",
      timing: "setup",
      fromDefinitionId: "a",
      toDefinitionId: "missing",
    },
    source,
    services()
  );
  assert.equal(full.status, "error");
  const incomplete = tryExecuteSetupEffect(
    subject,
    {
      effectId: "replace_starting_card",
      timing: "setup",
      fromDefinitionId: "a",
      toDefinitionId: "missing",
    },
    source,
    { ...services(), allowsMissingData: true }
  );
  assert.deepEqual(incomplete, { status: "executed" });
  assert.equal(subject.hand[0]?.definitionId, "a");
});

test("start_with_basic_trophy is idempotent", () => {
  const subject = player();
  const effect = {
    effectId: "start_with_basic_trophy",
    timing: "setup",
  } as const;
  assert.deepEqual(tryExecuteSetupEffect(subject, effect, source, services()), {
    status: "executed",
  });
  assert.deepEqual(tryExecuteSetupEffect(subject, effect, source, services()), {
    status: "executed",
  });
  assert.equal(subject.trophyLikeObjects.length, 1);
  assert.equal(
    subject.trophyLikeObjects[0]?.instanceId,
    "setup-basic-trophy-player-1"
  );
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

function setupDataPack(includeForce: boolean): LoadedDataPack {
  const dataPack = loadCurrentRuntimeDataPack(process.cwd());
  const sourceProperty = dataPack.tokenDefinitions.get(
    "esw2_dbg__wizard_property_001"
  );
  const wizardPropertyStack = dataPack.tokenStacks.wizardProperties;
  if (
    sourceProperty?.kind !== "wizardProperty" ||
    sourceProperty.engine === undefined ||
    wizardPropertyStack === undefined
  ) {
    throw new Error("Current runtime data is missing setup test fixtures");
  }

  const effects: RuntimeEffect[] = [
    { effectId: "set_starting_life_total", timing: "setup", lifeTotal: 27 },
    ...(includeForce
      ? ([
          { effectId: "force_starting_player", timing: "setup" },
        ] as RuntimeEffect[])
      : []),
  ];
  const property = {
    ...sourceProperty,
    tokenId: includeForce
      ? "fixture-force-property"
      : "fixture-unforced-property",
    engine: {
      ...sourceProperty.engine,
      mappingStatus: "fixture" as const,
      playableInV0: true,
      effects,
    },
  };
  return {
    ...dataPack,
    tokenDefinitions: new Map([
      ...dataPack.tokenDefinitions,
      [property.tokenId, property],
    ]),
    tokenStacks: {
      ...dataPack.tokenStacks,
      wizardProperties: {
        ...wizardPropertyStack,
        entries: [{ tokenId: property.tokenId, count: 4 }],
      },
    },
  };
}
