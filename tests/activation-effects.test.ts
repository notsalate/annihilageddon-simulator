import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  listLegalActions,
  type CardInstance,
} from "../src/index.js";
import {
  addFixtureDefenseCardToHand,
  selectFirstFixtureDefense,
} from "./helpers/defense-fixtures.js";
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

test("activation-effects #265 doubles the accumulated power at activation time", () => {
  const scenario = createGameScenario({ rootDir, seed: 265005 });
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_005",
  });

  assert.equal(play(scenario, source).ok, true);
  scenario.state.turn.power = 7;
  assert.ok(findActivation(scenario, source));
  assert.equal(
    applyAction(scenario.state, {
      type: "activatePermanent",
      cardInstanceId: source.instanceId,
    }).ok,
    true
  );
  assert.equal(scenario.state.turn.power, 14);
  assert.equal(findActivation(scenario, source), undefined);
});

test("activation-effects #265 counts the source and effective creatures for power", () => {
  const scenario = createGameScenario({ rootDir, seed: 265055 });
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_055",
  });
  givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__familiar_005",
    zone: "permanents",
  });

  assert.equal(play(scenario, source).ok, true);
  assert.equal(
    applyAction(scenario.state, {
      type: "activatePermanent",
      cardInstanceId: source.instanceId,
    }).ok,
    true
  );
  assert.equal(scenario.state.turn.power, 6);
});

test("activation-effects #265 attacks every foe for each controlled effective creature", () => {
  const scenario = createGameScenario({ rootDir, seed: 265048 });
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_048",
  });
  givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__familiar_005",
    zone: "permanents",
  });
  for (const foe of scenario.foes) {
    foe.life.current = 20;
    foe.hand = [];
    foe.permanents = [];
  }

  assert.equal(play(scenario, source).ok, true);
  assert.equal(
    applyAction(scenario.state, {
      type: "activatePermanent",
      cardInstanceId: source.instanceId,
    }).ok,
    true
  );
  for (const foe of scenario.foes) {
    assert.equal(foe.life.current, 14);
  }
  assert.equal(
    scenario.state.eventLog.filter(
      (event) =>
        event.type === "attackCreated" &&
        event.cardInstanceId === source.instanceId &&
        event.amount === 6
    ).length,
    scenario.foes.length
  );
});

test("activation-effects #266 destroys the source before choosing up to two hand cards", () => {
  const scenario = createGameScenario({ rootDir, seed: 266033 });
  scenario.activePlayer.hand = [];
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_033",
  });
  const firstTarget = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_012",
  });
  const secondTarget = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_014",
  });
  const untouchedTarget = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_034",
  });

  assert.equal(play(scenario, source).ok, true);
  scenario.state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId !== "activation_destroy_self_then_destroy_own_cards") {
      return undefined;
    }
    const amountChoice = choices.find(
      (choice) => choice.choiceId === "amount_2"
    );
    if (amountChoice !== undefined) {
      return { choiceId: amountChoice.choiceId };
    }
    const target = [firstTarget, secondTarget].find((candidate) =>
      choices.some(
        (choice) =>
          choice.choiceKind === "cardTarget" &&
          choice.targetCardInstanceIds.includes(candidate.instanceId)
      )
    );
    const targetChoice = choices.find(
      (choice) =>
        choice.choiceKind === "cardTarget" &&
        target !== undefined &&
        choice.targetCardInstanceIds.includes(target.instanceId)
    );
    return targetChoice === undefined
      ? undefined
      : { choiceId: targetChoice.choiceId };
  };

  assert.equal(
    applyAction(scenario.state, {
      type: "activatePermanent",
      cardInstanceId: source.instanceId,
    }).ok,
    true
  );
  assert.equal(scenario.state.common.destroyedPile.includes(source), true);
  assert.equal(scenario.state.common.destroyedPile.includes(firstTarget), true);
  assert.equal(
    scenario.state.common.destroyedPile.includes(secondTarget),
    true
  );
  assert.equal(scenario.activePlayer.hand.includes(untouchedTarget), true);
  assert.equal(findActivation(scenario, source), undefined);
  assert.equal(
    applyAction(scenario.state, {
      type: "activatePermanent",
      cardInstanceId: source.instanceId,
    }).ok,
    false
  );
});

test("activation-effects #266 heals after declined status removal and caps at effective max life", () => {
  const declinedScenario = createGameScenario({ rootDir, seed: 266006 });
  declinedScenario.activePlayer.hand = [];
  const declinedSource = givenRuntimeCard(declinedScenario, {
    definitionId: "esw2_dbg__main_006",
  });
  declinedScenario.activePlayer.statuses.push({
    instanceId: "fixture-dingler-declined",
    statusId: "dingler",
    ownerId: declinedScenario.activePlayer.playerId,
    effects: [],
  });
  declinedScenario.activePlayer.life.current = 10;
  assert.equal(play(declinedScenario, declinedSource).ok, true);
  declinedScenario.state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "remove_status"
      ? {
          choiceId:
            choices.find((choice) => choice.choiceId === "decline")?.choiceId ??
            "",
        }
      : undefined;
  assert.equal(
    applyAction(declinedScenario.state, {
      type: "activatePermanent",
      cardInstanceId: declinedSource.instanceId,
    }).ok,
    true
  );
  assert.equal(declinedScenario.activePlayer.life.current, 17);
  assert.equal(declinedScenario.activePlayer.statuses.length, 1);

  const cappedScenario = createGameScenario({ rootDir, seed: 266007 });
  cappedScenario.activePlayer.hand = [];
  const cappedSource = givenRuntimeCard(cappedScenario, {
    definitionId: "esw2_dbg__main_006",
  });
  cappedScenario.activePlayer.statuses.push({
    instanceId: "fixture-dingler-applied",
    statusId: "dingler",
    ownerId: cappedScenario.activePlayer.playerId,
    effects: [],
  });
  cappedScenario.activePlayer.life.max = 20;
  cappedScenario.activePlayer.life.current = 18;
  assert.equal(play(cappedScenario, cappedSource).ok, true);
  cappedScenario.state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "remove_status"
      ? {
          choiceId:
            choices.find((choice) => choice.choiceId === "apply")?.choiceId ??
            "",
        }
      : undefined;
  assert.equal(
    applyAction(cappedScenario.state, {
      type: "activatePermanent",
      cardInstanceId: cappedSource.instanceId,
    }).ok,
    true
  );
  assert.equal(cappedScenario.activePlayer.life.current, 20);
  assert.equal(cappedScenario.activePlayer.statuses.length, 0);
});

test("activation-effects #266 applies Dingler only after an unavoided attack and allows the active wizard", () => {
  const selfTargetScenario = createGameScenario({ rootDir, seed: 266031 });
  selfTargetScenario.activePlayer.hand = [];
  selfTargetScenario.activePlayer.permanents = [];
  const selfTargetSource = givenRuntimeCard(selfTargetScenario, {
    definitionId: "esw2_dbg__main_031",
  });
  assert.equal(play(selfTargetScenario, selfTargetSource).ok, true);
  selfTargetScenario.state.effectChoiceStrategy = ({ effectId }) =>
    effectId === "attack_gain_status"
      ? { choiceId: selfTargetScenario.activePlayer.playerId }
      : undefined;
  assert.equal(
    applyAction(selfTargetScenario.state, {
      type: "activatePermanent",
      cardInstanceId: selfTargetSource.instanceId,
    }).ok,
    true
  );
  assert.equal(selfTargetScenario.activePlayer.statuses.length, 1);
  assert.equal(
    selfTargetScenario.state.common.destroyedPile.includes(selfTargetSource),
    true
  );

  const avoidedScenario = createGameScenario({ rootDir, seed: 266032 });
  avoidedScenario.activePlayer.hand = [];
  const avoidedSource = givenRuntimeCard(avoidedScenario, {
    definitionId: "esw2_dbg__main_031",
  });
  const target = avoidedScenario.foes[0];
  assert.ok(target);
  target.hand = [];
  target.permanents = [];
  addFixtureDefenseCardToHand(avoidedScenario.state, target, "discardSelf");
  assert.equal(play(avoidedScenario, avoidedSource).ok, true);
  avoidedScenario.state.effectChoiceStrategy = (request) => {
    if (request.effectId === "attack_gain_status") {
      return { choiceId: target.playerId };
    }
    if (request.effectId === "avoid_attack") {
      return selectFirstFixtureDefense(request);
    }
    return undefined;
  };
  assert.equal(
    applyAction(avoidedScenario.state, {
      type: "activatePermanent",
      cardInstanceId: avoidedSource.instanceId,
    }).ok,
    true
  );
  assert.equal(target.statuses.length, 0);
  assert.equal(
    avoidedScenario.state.common.destroyedPile.includes(avoidedSource),
    true
  );
});
