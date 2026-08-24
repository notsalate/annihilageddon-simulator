import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import test from "node:test";

import { withTemporaryEffectRuntimeOperations } from "./helpers/with-temporary-effect-runtime-operations.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
  markTokenDefinitionId,
  markTokenInstanceId,
} from "../src/domain/types.js";
import {
  tryExecuteSetupEffect as executeVerifiedSetupEffect,
  validateRuntimeEffectCatalogPayload,
  type EffectRuntimeSetupServices,
  type SetupEffectSourceContext,
} from "../src/engine/effect-runtime-registry.js";
import { isRuntimeEffectId } from "../src/engine/runtime-effect.js";
import { verifiedTestRuntimeEffect } from "./helpers/verified-runtime-effect.js";
import type { PlayerState } from "../src/engine/setup.js";
import {
  initializeGame,
  type CardDefinition,
  type DeckComposition,
  type LoadedDataPack,
  type RuntimeEffect,
  type TokenDefinition,
} from "../src/index.js";

function tryExecuteSetupEffect(
  subject: PlayerState,
  effect: unknown,
  source: SetupEffectSourceContext,
  setupServices: EffectRuntimeSetupServices
): ReturnType<typeof executeVerifiedSetupEffect> {
  if (
    typeof effect !== "object" ||
    effect === null ||
    !("effectId" in effect) ||
    typeof effect.effectId !== "string" ||
    !isRuntimeEffectId(effect.effectId)
  ) {
    return {
      status: "error",
      error: `Unsupported setup effect id ${String(
        typeof effect === "object" && effect !== null && "effectId" in effect
          ? effect.effectId
          : undefined
      )}`,
    };
  }

  const validation = validateRuntimeEffectCatalogPayload(
    "Test setup effect",
    effect.effectId,
    effect,
    source.runtimeMode,
    source.sourceType
  );
  if (!validation.ok) {
    return {
      status: "error",
      error: validation.errors[0] ?? "Invalid setup effect",
    };
  }

  return executeVerifiedSetupEffect(
    subject,
    verifiedTestRuntimeEffect(validation.value as RuntimeEffect),
    source,
    setupServices
  );
}

function services(
  definitions: string[] = ["target"]
): EffectRuntimeSetupServices {
  let nextId = 1;
  return {
    hasCardDefinition: (definitionId) => definitions.includes(definitionId),
    createCardInstance: (definitionId, ownerId) => ({
      instanceId: `factory-${nextId++}` as never,
      definitionId,
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
    unboughtFamiliars: [],
    effectiveCardTypeSelections: [],
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
  tokenInstanceId: markTokenInstanceId("token-1"),
  tokenDefinitionId: markTokenDefinitionId("property-1"),
};

class TokenDefinitionsWithoutPostSetupLookup extends Map<
  string,
  TokenDefinition
> {
  setupEffectListReads = 0;

  constructor(private readonly expectedSetupEffectListReads: number) {
    super();
  }

  recordSetupEffectListRead(): void {
    this.setupEffectListReads += 1;
  }

  override get(key: string): TokenDefinition | undefined {
    if (this.setupEffectListReads >= this.expectedSetupEffectListReads) {
      throw new Error(`Unexpected post-setup token definition lookup: ${key}`);
    }

    return super.get(key);
  }
}

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

test("setup catalog decodes before runtime-mode applicability", () => {
  const result = tryExecuteSetupEffect(
    player(),
    {
      effectId: "fixture_add_power_equal_to_target_cost",
      unexpected: true,
    },
    source,
    services()
  );

  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.match(result.error, /unsupported field unexpected/);
});

test("setup catalog applies source and timing policies before its executor", () => {
  let handlerCalled = false;
  const result = withTemporaryEffectRuntimeOperations(
    "play_top_card_from_foe_deck",
    {
      executeSetup() {
        handlerCalled = true;
        return { ok: true };
      },
    },
    () =>
      tryExecuteSetupEffect(
        player(),
        {
          effectId: "play_top_card_from_foe_deck",
          timing: "onPlay",
          targetSelector: "chosenFoe",
        },
        source,
        services()
      )
  );

  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.match(result.error, /unsupported timing .* for source/);
  assert.equal(handlerCalled, false);
});

test("setup catalog keeps the wizard-property source matrix explicit", () => {
  const setupEffects = [
    { effectId: "force_starting_player", timing: "setup" },
    {
      effectId: "replace_starting_card",
      timing: "setup",
      fromDefinitionId: "esw2_dbg__starter_001",
      toDefinitionId: "esw2_dbg__starter_004",
    },
    { effectId: "start_with_basic_trophy", timing: "setup" },
    {
      effectId: "set_starting_life_total",
      timing: "setup",
      lifeTotal: 25,
    },
    {
      effectId: "set_resurrection_life_total",
      timing: "replacement",
      lifeTotal: 25,
    },
  ] as const;

  for (const effect of setupEffects) {
    for (const runtimeMode of ["combat", "fixture"] as const) {
      assert.equal(
        validateRuntimeEffectCatalogPayload(
          `Wizard property ${effect.effectId}`,
          effect.effectId,
          effect,
          runtimeMode,
          "wizardProperty"
        ).ok,
        true
      );
    }

    for (const sourceKind of ["card", "deadWizardToken"] as const) {
      const result = validateRuntimeEffectCatalogPayload(
        `${sourceKind} ${effect.effectId}`,
        effect.effectId,
        effect,
        "combat",
        sourceKind
      );
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.match(
          result.errors[0] ?? "",
          sourceKind === "deadWizardToken"
            ? /deadWizardToken does not support effect id/
            : /token-only effect id/
        );
      }
    }
  }
});

test("setup catalog decodes malformed payload before source-kind rejection", () => {
  const cardSource = {
    ...source,
    sourceType: "card",
  } as unknown as SetupEffectSourceContext;

  const result = tryExecuteSetupEffect(
    player(),
    {
      effectId: "set_starting_life_total",
      timing: "setup",
      lifeTotal: 0,
    },
    cardSource,
    services()
  );

  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.match(result.error, /lifeTotal must be a positive integer/);
});

test("setup catalog passes a concrete starting-life payload to its executor", () => {
  const observedLifeTotals: number[] = [];
  const subject = player();

  const result = withTemporaryEffectRuntimeOperations(
    "set_starting_life_total",
    {
      executeSetup(playerState, effect) {
        observedLifeTotals.push(effect.lifeTotal);
        playerState.life.current = effect.lifeTotal;
        playerState.life.max = Math.max(playerState.life.max, effect.lifeTotal);
        return { ok: true };
      },
    },
    () =>
      tryExecuteSetupEffect(
        subject,
        { effectId: "set_starting_life_total", timing: "setup", lifeTotal: 30 },
        source,
        services()
      )
  );

  assert.deepEqual(result, { status: "executed" });
  assert.deepEqual(observedLifeTotals, [30]);
  assert.equal(subject.life.current, 30);
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
    assert.match(result.error, /targetSelector must be activePlayer/);
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

test("setup fixture does not depend on the current working directory", () => {
  const originalCwd = process.cwd();
  try {
    process.chdir(tmpdir());
    const state = initializeGame({
      dataPack: setupDataPack(false),
      seed: 119,
    });
    assert.deepEqual(
      state.players.map((subject) => subject.life.current),
      [27, 27]
    );
  } finally {
    process.chdir(originalCwd);
  }
});

test("initializeGame validates and snapshots wizard-property setup effects before applying them", () => {
  const tokenDefinitions = new TokenDefinitionsWithoutPostSetupLookup(2);
  const state = initializeGame({
    dataPack: setupDataPack(true, "fixture", tokenDefinitions, () =>
      tokenDefinitions.recordSetupEffectListRead()
    ),
    seed: 119,
  });

  assert.equal(state.activePlayerId, state.players[0]?.playerId);
  assert.equal(tokenDefinitions.setupEffectListReads, 2);
});

test("initializeGame passes combat runtime mode to the setup executor", () => {
  let observedRuntimeMode: SetupEffectSourceContext["runtimeMode"] | undefined;

  const state = withTemporaryEffectRuntimeOperations(
    "set_starting_life_total",
    {
      executeSetup(playerState, effect, setupSource) {
        observedRuntimeMode = setupSource.runtimeMode;
        playerState.life.current = effect.lifeTotal;
        playerState.life.max = Math.max(playerState.life.max, effect.lifeTotal);
        return { ok: true };
      },
    },
    () =>
      initializeGame({
        dataPack: setupDataPack(false, "supported"),
        seed: 119,
      })
  );

  assert.deepEqual(
    state.players.map((subject) => subject.life.current),
    [27, 27]
  );
  assert.equal(observedRuntimeMode, "combat");
});

test("initializeGame executes setup effects in fixture runtime mode", () => {
  const state = initializeGame({
    dataPack: setupDataPack(false, "fixture"),
    seed: 119,
  });

  assert.deepEqual(
    state.players.map((subject) => subject.life.current),
    [27, 27]
  );
});

test("initializeGame maps fixture mappingStatus to fixture setup runtime mode", () => {
  assert.throws(
    () =>
      initializeGame({
        dataPack: setupDataPackWithFixtureOnlySetupEffect("fixture"),
        seed: 119,
      }),
    /Setup effect executor missing for fixture_add_power_equal_to_target_cost/
  );
});

test("initializeGame maps supported mappingStatus to combat setup runtime mode", () => {
  assert.throws(
    () =>
      initializeGame({
        dataPack: setupDataPackWithFixtureOnlySetupEffect("supported"),
        seed: 119,
      }),
    /uses fixture effect id fixture_add_power_equal_to_target_cost in combat data/
  );
});

test("initializeGame orchestrates catalog setup handlers without legacy fallback", () => {
  const state = initializeGame({
    dataPack: setupDataPackWithCatalogHandlers("supported"),
    seed: 119,
  });

  assert.equal(
    state.players.every((subject) => subject.life.current === 27),
    true
  );
  assert.equal(
    state.players.every(
      (subject) =>
        subject.trophyLikeObjects.length === 1 &&
        subject.trophyLikeObjects[0]?.trophyId === "basicTrophy"
    ),
    true
  );
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
      },
      source,
      services()
    );

    assert.equal(result.status, "error");
    assert.equal(subject.life.current, 20);
    assert.equal(subject.life.max, 25);
  }
});

test("replace_starting_card rejects blank or untrimmed definition IDs", () => {
  const invalidEffects = [
    { fromDefinitionId: "", toDefinitionId: "target" },
    { fromDefinitionId: "source", toDefinitionId: "" },
    { fromDefinitionId: " ", toDefinitionId: "target" },
    { fromDefinitionId: "source", toDefinitionId: "target " },
    { fromDefinitionId: " source", toDefinitionId: "target" },
  ];
  for (const { fromDefinitionId, toDefinitionId } of invalidEffects) {
    const subject = player();
    subject.hand.push({
      instanceId: "hand-a" as never,
      definitionId: "source" as never,
      ownerId: subject.playerId,
      marketChips: 0,
    });

    const result = tryExecuteSetupEffect(
      subject,
      {
        effectId: "replace_starting_card",
        timing: "setup",
        fromDefinitionId,
        toDefinitionId,
      },
      source,
      { ...services(), allowsMissingData: true }
    );

    assert.equal(result.status, "error");
    assert.equal(subject.hand[0]?.definitionId, "source");
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

test("replace_starting_card replaces a matching unbought familiar", () => {
  const subject = player();
  subject.unboughtFamiliars = [
    {
      instanceId: markCardInstanceId("fixture-familiar-source"),
      definitionId: markCardDefinitionId("source"),
      ownerId: subject.playerId,
      marketChips: 0,
    },
  ];

  const result = tryExecuteSetupEffect(
    subject,
    {
      effectId: "replace_starting_card",
      timing: "setup",
      fromDefinitionId: "source",
      toDefinitionId: "target",
    },
    source,
    services()
  );

  assert.deepEqual(result, { status: "executed" });
  assert.equal(subject.unboughtFamiliars[0]?.definitionId, "target");
});

test("replace_starting_card preserves the matching card owner", () => {
  const subject = player();
  const opponentId = "player-2" as PlayerState["playerId"];
  subject.hand.push({
    instanceId: "opponent-source" as never,
    definitionId: "source" as never,
    ownerId: opponentId,
    marketChips: 0,
  });
  subject.deck.push({
    instanceId: "player-source" as never,
    definitionId: "source" as never,
    ownerId: subject.playerId,
    marketChips: 0,
  });

  const result = tryExecuteSetupEffect(
    subject,
    {
      effectId: "replace_starting_card",
      timing: "setup",
      fromDefinitionId: "source",
      toDefinitionId: "target",
    },
    source,
    services()
  );

  assert.deepEqual(result, { status: "executed" });
  assert.equal(subject.hand[0]?.instanceId, "opponent-source");
  assert.equal(subject.hand[0]?.ownerId, opponentId);
  assert.equal(subject.deck[0]?.instanceId, "factory-1");
  assert.equal(subject.deck[0]?.definitionId, "target");
  assert.equal(subject.deck[0]?.ownerId, subject.playerId);
});

test("replace_starting_card reports a missing source card for full packs", () => {
  const subject = player();
  const effect = {
    effectId: "replace_starting_card",
    timing: "setup",
    fromDefinitionId: "source",
    toDefinitionId: "target",
  } as const;

  const full = tryExecuteSetupEffect(subject, effect, source, services());
  assert.equal(full.status, "error");
  if (full.status === "error") {
    assert.match(full.error, /missing starting card source/);
  }
  assert.equal(subject.hand.length, 0);
  assert.equal(subject.deck.length, 0);

  const incomplete = tryExecuteSetupEffect(subject, effect, source, {
    ...services(),
    allowsMissingData: true,
  });
  assert.deepEqual(incomplete, { status: "executed" });
  assert.equal(subject.hand.length, 0);
  assert.equal(subject.deck.length, 0);
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

test("start_with_basic_trophy preserves other trophy-like objects", () => {
  const subject = player();
  subject.trophyLikeObjects.push({
    instanceId: "other-trophy",
    trophyId: "otherTrophy",
    ownerId: subject.playerId,
    effects: [],
  });
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
  assert.deepEqual(subject.trophyLikeObjects, [
    {
      instanceId: "other-trophy",
      trophyId: "otherTrophy",
      ownerId: subject.playerId,
      effects: [],
    },
    {
      instanceId: "setup-basic-trophy-player-1",
      trophyId: "basicTrophy",
      ownerId: subject.playerId,
      effects: [],
    },
  ]);
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

function setupDataPack(
  includeForce: boolean,
  manifestMappingStatus?: "supported" | "fixture",
  tokenDefinitions?: Map<string, TokenDefinition>,
  onSetupEffectListRead?: () => void
): LoadedDataPack {
  const effectiveMappingStatus =
    manifestMappingStatus ?? "incomplete-full-only";
  const starterDefinitions = [
    cardDefinition("esw2_dbg__starter_001", "starter", effectiveMappingStatus),
    cardDefinition("esw2_dbg__starter_002", "starter", effectiveMappingStatus),
    cardDefinition("esw2_dbg__starter_003", "starter", effectiveMappingStatus),
  ];
  const mainDefinition = cardDefinition(
    "fixture-main-card",
    "normal",
    effectiveMappingStatus
  );
  const legendDefinition = cardDefinition(
    "fixture-legend-card",
    "legend",
    effectiveMappingStatus
  );
  const familiarDefinitions = [
    "fixture-familiar-001",
    "fixture-familiar-002",
    "fixture-familiar-003",
    "fixture-familiar-004",
  ].map((cardId) => cardDefinition(cardId, "familiar", effectiveMappingStatus));
  const effects: RuntimeEffect[] = [
    { effectId: "set_starting_life_total", timing: "setup", lifeTotal: 27 },
    ...(includeForce
      ? ([
          { effectId: "force_starting_player", timing: "setup" },
        ] as RuntimeEffect[])
      : []),
  ];
  const engine = {
    mappingStatus: effectiveMappingStatus,
    playableInV0: true,
    effects,
    unsupportedMechanics: [],
  };
  if (onSetupEffectListRead !== undefined) {
    Object.defineProperty(engine, "effects", {
      enumerable: true,
      get: () => {
        onSetupEffectListRead();
        return effects;
      },
    });
  }
  const property: TokenDefinition = {
    schemaVersion: 1,
    tokenId: includeForce
      ? "fixture-force-property"
      : "fixture-unforced-property",
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    source: { image: "fixture/setup-property.png" },
    visible: { textRu: "Тестовое свойство" },
    engine,
  };
  const definitions = tokenDefinitions ?? new Map<string, TokenDefinition>();
  definitions.set(property.tokenId, property);

  return {
    manifest: {
      schemaVersion: 1,
      packId: "fixture-setup-effects",
      runtimeSchema: "krutagidon.dataPack.v0",
      mappingStatus: effectiveMappingStatus,
      cardDefinitionPaths: [],
      tokenDefinitionPaths: [],
    },
    cardDefinitions: new Map([
      ...starterDefinitions.map(
        (definition) => [definition.cardId, definition] as const
      ),
      [mainDefinition.cardId, mainDefinition],
      [legendDefinition.cardId, legendDefinition],
      ...familiarDefinitions.map(
        (definition) => [definition.cardId, definition] as const
      ),
    ]),
    tokenDefinitions: definitions,
    decks: {
      starterDeck: deck("fixture-starter", "starterDeck", [
        { cardId: "esw2_dbg__starter_001", count: 6 },
        { cardId: "esw2_dbg__starter_002", count: 3 },
        { cardId: "esw2_dbg__starter_003", count: 1 },
      ]),
      mainDeck: deck("fixture-main", "mainDeck", [
        { cardId: mainDefinition.cardId, count: 5 },
      ]),
      legendDeck: deck("fixture-legend", "legendDeck", [
        { cardId: legendDefinition.cardId, count: 3 },
      ]),
      wildMagicStack: deck("fixture-wild-magic", "wildMagicStack", []),
      limpWandStack: deck("fixture-limp-wand", "limpWandStack", []),
      familiarPool:
        effectiveMappingStatus === "incomplete-full-only"
          ? undefined
          : deck(
              "fixture-familiar-pool",
              "familiarPool",
              familiarDefinitions.map((definition) => ({
                cardId: definition.cardId,
                count: 1,
              }))
            ),
    },
    tokenStacks: {
      deadWizardTokens: undefined,
      wizardProperties: {
        schemaVersion: 1,
        stackId: "fixture-wizard-properties",
        runtimeSchema: "krutagidon.tokenStack.v0",
        role: "wizardProperties",
        mappingStatus: effectiveMappingStatus,
        entries: [{ tokenId: property.tokenId, count: 4 }],
      },
    },
  };
}

function setupDataPackWithCatalogHandlers(
  mappingStatus: "supported" | "fixture"
): LoadedDataPack {
  const dataPack = setupDataPack(false, mappingStatus);
  const sourceProperty = dataPack.tokenDefinitions.get(
    "fixture-unforced-property"
  );
  if (
    sourceProperty?.kind !== "wizardProperty" ||
    sourceProperty.engine === undefined
  ) {
    throw new Error("Setup test fixture property is missing");
  }

  const sourceCard = dataPack.decks.starterDeck.entries[0]?.cardId;
  const targetCard = dataPack.decks.starterDeck.entries[1]?.cardId;
  if (sourceCard === undefined || targetCard === undefined) {
    throw new Error("Setup test fixture starter deck has too few cards");
  }

  const property = {
    ...sourceProperty,
    engine: {
      ...sourceProperty.engine,
      effects: [
        {
          effectId: "set_starting_life_total",
          timing: "setup",
          lifeTotal: 27,
        },
        {
          effectId: "start_with_basic_trophy",
          timing: "setup",
        },
        {
          effectId: "replace_starting_card",
          timing: "setup",
          fromDefinitionId: sourceCard,
          toDefinitionId: targetCard,
        },
        { effectId: "force_starting_player", timing: "setup" },
      ] as RuntimeEffect[],
    },
  };

  return {
    ...dataPack,
    tokenDefinitions: new Map(dataPack.tokenDefinitions).set(
      property.tokenId,
      property
    ),
  };
}

function setupDataPackWithFixtureOnlySetupEffect(
  mappingStatus: "supported" | "fixture"
): LoadedDataPack {
  const dataPack = setupDataPack(false, mappingStatus);
  const sourceProperty = dataPack.tokenDefinitions.get(
    "fixture-unforced-property"
  );
  if (
    sourceProperty?.kind !== "wizardProperty" ||
    sourceProperty.engine === undefined
  ) {
    throw new Error("Setup test fixture property is missing");
  }

  return {
    ...dataPack,
    tokenDefinitions: new Map(dataPack.tokenDefinitions).set(
      sourceProperty.tokenId,
      {
        ...sourceProperty,
        engine: {
          ...sourceProperty.engine,
          effects: [
            {
              effectId: "fixture_add_power_equal_to_target_cost",
              timing: "setup",
              target: { selector: "mainMarketCard" },
            },
          ],
        },
      }
    ),
  };
}

function cardDefinition(
  cardId: string,
  cardKind: CardDefinition["engine"]["cardKind"],
  mappingStatus: string
): CardDefinition {
  return {
    schemaVersion: 1,
    cardId,
    source: { image: `fixture/${cardId}.png` },
    visible: {
      nameRu: cardId,
      cost: 0,
      victoryPoints: 0,
      typeRu: null,
      cardKind,
      cardTypes: [],
      markers: [],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus,
      playableInV0: true,
      cardKind,
      cardTypes: [],
      cost: 0,
      victoryPoints: 0,
      isOngoing: false,
      marketChipMarker: false,
      effects: [],
      unsupportedMechanics: [],
    },
  };
}

function deck(
  deckId: string,
  role: string,
  entries: DeckComposition["entries"]
): DeckComposition {
  return {
    schemaVersion: 1,
    deckId,
    runtimeSchema: "krutagidon.deckComposition.v0",
    role,
    mappingStatus: "fixture",
    entries,
  };
}
