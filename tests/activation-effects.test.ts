import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  listLegalActions,
  type CardInstance,
} from "../src/index.js";
import {
  createGameScenario,
  givenRuntimeCard,
  play,
} from "./helpers/game-scenario.js";

const rootDir = process.cwd();

function findActivation(
  scenario: ReturnType<typeof createGameScenario>,
  card: CardInstance
) {
  return listLegalActions(scenario.state).find(
    (action) =>
      action.type === "activatePermanent" &&
      action.cardInstanceId === card.instanceId
  );
}

test("activation-effects #264 excludes the source and counts an effective creature", () => {
  const scenario = createGameScenario({ rootDir, seed: 264012 });
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_012",
  });

  assert.equal(play(scenario, source).ok, true);
  assert.equal(findActivation(scenario, source), undefined);

  const effectiveCreature = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__familiar_005",
    zone: "permanents",
  });
  assert.ok(findActivation(scenario, source));

  assert.equal(
    applyAction(scenario.state, {
      type: "activatePermanent",
      cardInstanceId: source.instanceId,
    }).ok,
    true
  );
  assert.equal(scenario.activePlayer.chips, 1);
  assert.equal(findActivation(scenario, source), undefined);
  assert.equal(
    scenario.activePlayer.permanents.includes(effectiveCreature),
    true
  );
});

test("activation-effects #264 lets the controller decline or destroy one allowed card", () => {
  const scenario = createGameScenario({ rootDir, seed: 264014 });
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_014",
  });
  givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__familiar_005",
    zone: "permanents",
  });
  const target = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_012",
  });

  assert.equal(play(scenario, source).ok, true);
  scenario.state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "conditional_activation_destroy_own_cards"
      ? {
          choiceId:
            choices.find((choice) => choice.choiceId === "decline")?.choiceId ??
            "",
        }
      : undefined;
  assert.equal(
    applyAction(scenario.state, {
      type: "activatePermanent",
      cardInstanceId: source.instanceId,
    }).ok,
    true
  );
  assert.equal(scenario.activePlayer.hand.includes(target), true);

  const secondScenario = createGameScenario({ rootDir, seed: 264015 });
  const secondSource = givenRuntimeCard(secondScenario, {
    definitionId: "esw2_dbg__main_014",
  });
  givenRuntimeCard(secondScenario, {
    definitionId: "esw2_dbg__familiar_005",
    zone: "permanents",
  });
  const secondTarget = givenRuntimeCard(secondScenario, {
    definitionId: "esw2_dbg__main_012",
  });
  assert.equal(play(secondScenario, secondSource).ok, true);
  secondScenario.state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "conditional_activation_destroy_own_cards"
      ? {
          choiceId:
            choices.find(
              (choice) =>
                choice.choiceKind === "cardTarget" &&
                choice.targetCardInstanceIds.includes(secondTarget.instanceId)
            )?.choiceId ?? "",
        }
      : undefined;

  assert.equal(
    applyAction(secondScenario.state, {
      type: "activatePermanent",
      cardInstanceId: secondSource.instanceId,
    }).ok,
    true
  );
  assert.equal(secondScenario.activePlayer.hand.includes(secondTarget), false);
  assert.equal(
    secondScenario.state.common.destroyedPile.includes(secondTarget),
    true
  );
  assert.equal(secondTarget.ownerId, secondScenario.activePlayer.playerId);
});

test("activation-effects #264 resolves the selected attack through normal defense and damage", () => {
  const scenario = createGameScenario({ rootDir, seed: 264034 });
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_034",
  });
  givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__familiar_005",
    zone: "permanents",
  });
  const target = scenario.foes[0];
  assert.ok(target);
  target.life.current = 20;
  target.hand = [];
  target.permanents = [];

  assert.equal(play(scenario, source).ok, true);
  scenario.state.effectChoiceStrategy = ({ effectId }) =>
    effectId === "conditional_activation_attack_damage"
      ? { choiceId: target.playerId }
      : undefined;
  assert.equal(
    applyAction(scenario.state, {
      type: "activatePermanent",
      cardInstanceId: source.instanceId,
    }).ok,
    true
  );
  assert.equal(target.life.current, 11);
  assert.ok(
    scenario.state.eventLog.some(
      (event) =>
        event.type === "attackCreated" &&
        event.cardInstanceId === source.instanceId &&
        event.amount === 9
    )
  );
});
