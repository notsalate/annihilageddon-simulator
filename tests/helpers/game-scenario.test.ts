import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { listPhysicalCardLocations } from "../../src/engine/control-ledger.js";
import {
  chooseEffect,
  choosePlayerTargetForEffect,
  createGameScenario,
  endTurn,
  givenRuntimeCard,
  givenTemporaryControl,
  play,
} from "./game-scenario.js";
import { createChoicePlayerView } from "../../src/engine/strategy-decision-view.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

test("game scenario setup and generated card identities are deterministic and state-wide unique", () => {
  const first = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 24001,
  });
  const second = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 24001,
  });

  assert.equal(first.activePlayer.playerId, second.activePlayer.playerId);
  assert.deepEqual(
    first.activePlayer.hand.map((card) => card.definitionId),
    second.activePlayer.hand.map((card) => card.definitionId)
  );

  const firstCard = givenRuntimeCard(first, {
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 2 }],
  });
  const secondCard = givenRuntimeCard(second, {
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 2 }],
  });
  const additionalCard = givenRuntimeCard(first, {
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 1 }],
  });

  assert.equal(firstCard.instanceId, secondCard.instanceId);
  assert.equal(firstCard.definitionId, secondCard.definitionId);
  assert.notEqual(additionalCard.instanceId, firstCard.instanceId);
  assert.notEqual(additionalCard.definitionId, firstCard.definitionId);

  const stateWideInstanceIds = listPhysicalCardLocations(first.state).map(
    (location) => location.card.instanceId
  );
  assert.equal(new Set(stateWideInstanceIds).size, stateWideInstanceIds.length);

  chooseEffect(first, () => undefined);
  assert.ok(first.state.effectChoiceStrategy);
  assert.equal(play(first, firstCard).ok, true);
  assert.equal(first.state.turn.power, 2);

  const activePlayerId = first.activePlayer.playerId;
  assert.equal(endTurn(first).ok, true);
  assert.notEqual(first.activePlayer.playerId, activePlayerId);
});

test("generated runtime definitions preserve tags by value and order", () => {
  const scenario = createGameScenario({ rootDir, seed: 24002 });
  const tags = ["wandCard", "attackTag"];
  const card = givenRuntimeCard(scenario, {
    effects: [],
    tags,
  });
  const definition = scenario.state.cardDefinitions.get(card.definitionId);
  assert.ok(definition);

  assert.deepEqual(definition.engine.tags, ["wandCard", "attackTag"]);
  tags[0] = "mutated";
  tags.push("lateTag");
  assert.deepEqual(definition.engine.tags, ["wandCard", "attackTag"]);
});

test("temporary control preserves ownership and physical location", () => {
  const scenario = createGameScenario({ rootDir, seed: 24003 });
  const controller = scenario.activePlayer;
  const owner = scenario.foes[0];
  assert.ok(owner);
  owner.discard = [];

  const card = givenRuntimeCard(scenario, {
    player: owner,
    zone: "discard",
    effects: [],
    isOngoing: true,
  });

  assert.equal(givenTemporaryControl(scenario, card, controller), card);
  assert.equal(card.ownerId, owner.playerId);
  assert.ok(owner.discard.includes(card));
  assert.deepEqual(scenario.state.turn.temporaryCardControls, [
    {
      cardInstanceId: card.instanceId,
      controllerId: controller.playerId,
    },
  ]);
});

test("player target choice adapter handles only the requested effect", () => {
  const scenario = createGameScenario({ rootDir, seed: 24004 });
  const target = scenario.foes[0];
  assert.ok(target);
  choosePlayerTargetForEffect(scenario, "attack_damage", target);
  const strategy = scenario.state.effectChoiceStrategy;
  assert.ok(strategy);
  const choices = [
    {
      choiceKind: "playerTarget" as const,
      choiceId: scenario.activePlayer.playerId,
      targetPlayerIds: [scenario.activePlayer.playerId],
    },
    {
      choiceKind: "playerTarget" as const,
      choiceId: target.playerId,
      targetPlayerIds: [target.playerId],
    },
  ];
  const request = {
    player: createChoicePlayerView(scenario.activePlayer),
    sourceType: "card" as const,
    cardInstanceId: "fixture-choice-source",
    definitionId: "fixture-choice-source",
    choices,
  };

  assert.equal(
    strategy({ ...request, effectId: "attack_damage" })?.choiceId,
    target.playerId
  );
  assert.equal(strategy({ ...request, effectId: "add_power" }), undefined);
});

test("focused scenario suites do not redeclare runtime-card builders", () => {
  const suitePaths = [
    "tests/controlled-power-ongoing.test.ts",
    "tests/attack-replacement-ongoing.test.ts",
    "tests/trigger-dispatch-ongoing.test.ts",
    "tests/trigger-dispatch.test.ts",
  ];
  const forbiddenConstructs = [
    {
      description: "a local CardDefinition literal",
      pattern: /\bconst\s+\w+\s*:\s*CardDefinition\s*=\s*\{/u,
    },
    {
      description: "a local CardInstance literal",
      pattern: /\bconst\s+\w+\s*:\s*CardInstance\s*=\s*\{/u,
    },
    {
      description: "manual runtime-card ID branding",
      pattern: /\bmarkCard(?:Definition|Instance)Id\b/u,
    },
    {
      description: "a parallel runtime-card builder",
      pattern:
        /\b(?:registerCard|addControlledEffectCard|addControlledTriggerCard)\b/u,
    },
  ];

  for (const suitePath of suitePaths) {
    const source = readFileSync(suitePath, "utf8");
    for (const { description, pattern } of forbiddenConstructs) {
      assert.equal(
        pattern.test(source),
        false,
        `${suitePath} must not contain ${description}`
      );
    }
  }
});
