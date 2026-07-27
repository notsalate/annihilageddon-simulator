import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  markCardDefinitionId,
  markCardInstanceId,
  markPlayerId,
  markTokenDefinitionId,
  markTokenInstanceId,
} from "../src/domain/types.js";
import {
  getEffectRuntimeCatalogEntry,
  getEffectRuntimeHandler,
  replaceEffectRuntimeHandlerForTesting,
  tryExecuteSetupEffect,
  type EffectRuntimeServices,
  type EffectRuntimeSetupServices,
  type EffectSourceContext,
  type SetupEffectSourceContext,
} from "../src/engine/effect-runtime-registry.js";
import type { PlayerState } from "../src/engine/setup.js";

const rootDir = process.cwd();

const setupSource: SetupEffectSourceContext = {
  sourceType: "wizardProperty",
  runtimeMode: "combat",
  playerId: markPlayerId("player-1"),
  tokenInstanceId: markTokenInstanceId("fixture-property-instance"),
  tokenDefinitionId: markTokenDefinitionId("fixture-property-definition"),
};

test("catalog entry execute owns source-kind validation", () => {
  const subject = createPlayer();
  const originalHandler = getEffectRuntimeHandler("ongoing_hand_refill_bonus");
  const restore = replaceEffectRuntimeHandlerForTesting(
    "ongoing_hand_refill_bonus",
    {
      ...originalHandler,
      execute() {
        return { ok: true };
      },
    }
  );

  try {
    const result = getEffectRuntimeCatalogEntry(
      "ongoing_hand_refill_bonus"
    ).execute(
      "Effect ongoing_hand_refill_bonus",
      {
        effectId: "ongoing_hand_refill_bonus",
        timing: "endTurn",
        amount: 1,
      },
      createMinimalState(subject),
      subject,
      effectSource(subject, "wizardProperty", "combat"),
      throwingRuntimeServices()
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /unsupported source kind/);
  } finally {
    restore();
  }
});

test("catalog entry execute owns runtime-mode validation", () => {
  const subject = createPlayer();
  const originalHandler = getEffectRuntimeHandler(
    "fixture_add_power_equal_to_target_cost"
  );
  const restore = replaceEffectRuntimeHandlerForTesting(
    "fixture_add_power_equal_to_target_cost",
    {
      ...originalHandler,
      execute() {
        return { ok: true };
      },
    }
  );

  try {
    const result = getEffectRuntimeCatalogEntry(
      "fixture_add_power_equal_to_target_cost"
    ).execute(
      "Effect fixture_add_power_equal_to_target_cost",
      {
        effectId: "fixture_add_power_equal_to_target_cost",
        target: { selector: "mainMarketCard" },
      },
      createMinimalState(subject),
      subject,
      effectSource(subject, "card", "combat"),
      throwingRuntimeServices()
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /unavailable in combat mode/);
  } finally {
    restore();
  }
});

test("replace_starting_card traverses the Control Ledger singleton zone", () => {
  const subject = createPlayer();
  subject.unboughtFamiliar = {
    instanceId: markCardInstanceId("fixture-familiar-source"),
    definitionId: markCardDefinitionId("source"),
    ownerId: subject.playerId,
    marketChips: 0,
  };

  const result = tryExecuteSetupEffect(
    subject,
    {
      effectId: "replace_starting_card",
      timing: "setup",
      fromDefinitionId: "source",
      toDefinitionId: "target",
    },
    setupSource,
    setupServices()
  );

  assert.deepEqual(result, { status: "executed" });
  assert.equal(
    subject.unboughtFamiliar?.definitionId,
    markCardDefinitionId("target")
  );
});

test("effect runtime delegates ID, source, and mode policy to the catalog", () => {
  const source = readFileSync(
    `${rootDir}/src/engine/effect-runtime.ts`,
    "utf8"
  );
  const executeEffect = extractSection(
    source,
    "export function executeEffect(",
    "export function getEffectExecutionError"
  );

  assert.match(executeEffect, /executeRuntimeEffect/u);
  assert.doesNotMatch(executeEffect, /isRuntimeEffectId/u);
  assert.doesNotMatch(executeEffect, /getEffectRuntimeCatalogEntry/u);
  assert.doesNotMatch(executeEffect, /supportedSourceKinds/u);
  assert.doesNotMatch(executeEffect, /supportedModes/u);
});

test("setup replacement does not enumerate physical player zones outside Control Ledger", () => {
  const source = readFileSync(
    `${rootDir}/src/engine/effect-runtime-registry.ts`,
    "utf8"
  );
  const handler = extractSection(
    source,
    "const replaceStartingCardHandler",
    "const startWithBasicTrophyHandler"
  );

  assert.match(handler, /replaceOwnedCardDefinitionInPlayerZones/u);
  for (const zone of [
    "player.hand",
    "player.deck",
    "player.discard",
    "player.playedThisTurn",
    "player.permanents",
  ]) {
    assert.doesNotMatch(handler, new RegExp(zone.replace(".", "\\."), "u"));
  }
});

test("Mayhem redraw handler keeps its decoded tuple type", () => {
  const source = readFileSync(
    `${rootDir}/src/engine/effect-runtime-registry.ts`,
    "utf8"
  );
  const handler = extractSection(
    source,
    "const mayhemEachPlayerHandRedrawChoiceHandler",
    "const mayhemEachPlayerDiscardTopDeckHandler"
  );

  assert.doesNotMatch(handler, /:\s*unknown/u);
  assert.doesNotMatch(handler, /(?:redraw|damage)Option\["/u);
  assert.doesNotMatch(source, /function validateMayhemHandRedrawOptions/u);
});

function createPlayer(): PlayerState {
  return {
    playerId: markPlayerId("player-1"),
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

function createMinimalState(player: PlayerState) {
  return {
    runtimeMode: "combat",
    turn: { power: 0 },
    players: [player],
  } as never;
}

function effectSource(
  player: PlayerState,
  sourceType: EffectSourceContext["sourceType"],
  runtimeMode: EffectSourceContext["runtimeMode"]
): EffectSourceContext {
  return {
    sourceType,
    runtimeMode,
    playerId: player.playerId,
    cardInstanceId: "fixture-source",
    definitionId: "fixture-source",
  };
}

function throwingRuntimeServices(): EffectRuntimeServices {
  return new Proxy({} as EffectRuntimeServices, {
    get() {
      throw new Error("Handler must not run before catalog policy validation");
    },
  });
}

function setupServices(): EffectRuntimeSetupServices {
  let nextId = 1;
  return {
    hasCardDefinition: (definitionId) => definitionId === "target",
    createCardInstance: (definitionId, ownerId) => ({
      instanceId: markCardInstanceId(`fixture-replacement-${nextId++}`),
      definitionId,
      ownerId,
      marketChips: 0,
    }),
    allowsMissingData: false,
  };
}

function extractSection(
  source: string,
  startMarker: string,
  endMarker: string
): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `Missing source marker ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker ${endMarker}`);
  return source.slice(start, end);
}
