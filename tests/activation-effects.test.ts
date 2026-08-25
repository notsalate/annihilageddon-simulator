import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  listLegalActions,
  scoreGame,
  type CardInstance,
  type TokenInstance,
} from "../src/index.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
  markTokenDefinitionId,
  markTokenInstanceId,
} from "../src/domain/types.js";
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

function givenLegendDeckCard(
  scenario: ReturnType<typeof createGameScenario>,
  definitionId: string,
  sequence: number
): CardInstance {
  const card: CardInstance = {
    instanceId: markCardInstanceId(
      `fixture-activation-legend-${scenario.seed}-${sequence}`
    ),
    definitionId: markCardDefinitionId(definitionId),
    ownerId: "common",
    marketChips: 0,
  };
  scenario.state.common.legendDeck.push(card);
  return card;
}

function givenWizardProperty(
  scenario: ReturnType<typeof createGameScenario>,
  definitionId: string,
  sequence: number
): TokenInstance {
  const token: TokenInstance = {
    instanceId: markTokenInstanceId(
      `fixture-activation-token-${scenario.seed}-${sequence}`
    ),
    definitionId: markTokenDefinitionId(definitionId),
    ownerId: scenario.activePlayer.playerId,
  };
  scenario.activePlayer.wizardProperties.push(token);
  return token;
}

function givenDeadWizardToken(
  scenario: ReturnType<typeof createGameScenario>,
  definitionId: string,
  sequence: number,
  player = scenario.activePlayer
): TokenInstance {
  const token: TokenInstance = {
    instanceId: markTokenInstanceId(
      `fixture-activation-dwt-${scenario.seed}-${sequence}`
    ),
    definitionId: markTokenDefinitionId(definitionId),
    ownerId: player.playerId,
  };
  player.deadWizardTokens.push(token);
  return token;
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

test("activation-effects #267 checks the unified controlled-card threshold", () => {
  const scenario = createGameScenario({ rootDir, seed: 267018 });
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_018",
  });
  for (let index = 0; index < 9; index += 1) {
    givenRuntimeCard(scenario, {
      definitionId: "esw2_dbg__main_012",
      zone: "permanents",
    });
  }

  assert.equal(play(scenario, source).ok, true);
  assert.equal(findActivation(scenario, source), undefined);

  givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_012",
    zone: "permanents",
  });
  assert.ok(findActivation(scenario, source));
});

test("activation-effects #267 selects one legend and returns the rest in chosen order", () => {
  const scenario = createGameScenario({ rootDir, seed: 267019 });
  scenario.activePlayer.deck = [];
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_018",
  });
  for (let index = 0; index < 10; index += 1) {
    givenRuntimeCard(scenario, {
      definitionId: "esw2_dbg__main_012",
      zone: "permanents",
    });
  }
  scenario.state.common.legendDeck.splice(
    0,
    scenario.state.common.legendDeck.length
  );
  const lookedCards = [
    givenLegendDeckCard(scenario, "esw2_dbg__legend_001", 1),
    givenLegendDeckCard(scenario, "esw2_dbg__legend_002", 2),
    givenLegendDeckCard(scenario, "esw2_dbg__legend_004", 3),
    givenLegendDeckCard(scenario, "esw2_dbg__legend_005", 4),
    givenLegendDeckCard(scenario, "esw2_dbg__legend_014", 5),
  ];
  const tailCard = givenLegendDeckCard(scenario, "esw2_dbg__legend_021", 6);
  const selected = lookedCards[2];
  assert.ok(selected);
  const returnedOrder = [
    lookedCards[4],
    lookedCards[0],
    lookedCards[3],
    lookedCards[1],
  ];

  assert.equal(play(scenario, source).ok, true);
  let choiceIndex = 0;
  scenario.state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId !== "activation_look_choose_reorder_legend_deck") {
      return undefined;
    }
    const target = [selected, ...returnedOrder][choiceIndex];
    choiceIndex += 1;
    if (target === undefined) return undefined;
    const choice = choices.find(
      (candidate) =>
        candidate.choiceKind === "cardTarget" &&
        candidate.targetCardInstanceIds.includes(target.instanceId)
    );
    return choice === undefined ? undefined : { choiceId: choice.choiceId };
  };

  assert.equal(
    applyAction(scenario.state, {
      type: "activatePermanent",
      cardInstanceId: source.instanceId,
    }).ok,
    true
  );
  assert.equal(scenario.activePlayer.deck[0], selected);
  assert.deepEqual(scenario.state.common.legendDeck, [
    ...returnedOrder,
    tailCard,
  ]);
  assert.equal(new Set(scenario.activePlayer.deck).size, 1);
  assert.equal(findActivation(scenario, source), undefined);
});

test("activation-effects #267 preserves all legend cards when fewer than five are available", () => {
  for (const availableCount of [0, 4]) {
    const scenario = createGameScenario({
      rootDir,
      seed: 267020 + availableCount,
    });
    scenario.activePlayer.deck = [];
    const source = givenRuntimeCard(scenario, {
      definitionId: "esw2_dbg__legend_018",
    });
    for (let index = 0; index < 10; index += 1) {
      givenRuntimeCard(scenario, {
        definitionId: "esw2_dbg__main_012",
        zone: "permanents",
      });
    }
    scenario.state.common.legendDeck.splice(
      0,
      scenario.state.common.legendDeck.length
    );
    const available = Array.from({ length: availableCount }, (_, index) =>
      givenLegendDeckCard(scenario, "esw2_dbg__legend_001", index + 1)
    );

    assert.equal(play(scenario, source).ok, true);
    assert.equal(
      applyAction(scenario.state, {
        type: "activatePermanent",
        cardInstanceId: source.instanceId,
      }).ok,
      true
    );
    const movedCards = [
      ...scenario.activePlayer.deck,
      ...scenario.state.common.legendDeck,
    ].filter((card) => available.includes(card));
    assert.deepEqual(
      movedCards.sort((left, right) =>
        left.instanceId.localeCompare(right.instanceId)
      ),
      [...available].sort((left, right) =>
        left.instanceId.localeCompare(right.instanceId)
      )
    );
  }
});

test("activation-effects #311 activates wizard property 005 for mixed effective types once per turn", () => {
  const scenario = createGameScenario({ rootDir, seed: 311005 });
  const property = givenWizardProperty(
    scenario,
    "esw2_dbg__wizard_property_005",
    1
  );
  givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_015",
    zone: "permanents",
  });
  givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_014",
    zone: "permanents",
  });

  const activation = listLegalActions(scenario.state).find(
    (action) =>
      action.type === "activateWizardProperty" &&
      action.tokenInstanceId === property.instanceId
  );
  assert.ok(activation);
  assert.equal(scenario.activePlayer.chips, 0);
  assert.equal(applyAction(scenario.state, activation).ok, true);
  assert.equal(scenario.activePlayer.chips, 1);
  assert.equal(
    listLegalActions(scenario.state).some(
      (action) =>
        action.type === "activateWizardProperty" &&
        action.tokenInstanceId === property.instanceId
    ),
    false
  );
});

test("activation-effects #311 exposes DWT 005 as an atomic five-chip self-destroy action", () => {
  const scenario = createGameScenario({ rootDir, seed: 311006 });
  const token = givenDeadWizardToken(
    scenario,
    "esw2_dbg__dead_wizard_token_005",
    1
  );
  scenario.activePlayer.chips = 4;
  const scoreBefore = scoreGame(scenario.state).find(
    (score) => score.playerId === scenario.activePlayer.playerId
  );
  assert.equal(scoreBefore?.victoryPoints, -8);
  assert.equal(
    listLegalActions(scenario.state).some(
      (action) =>
        action.type === "activateDeadWizardToken" &&
        action.tokenInstanceId === token.instanceId
    ),
    false
  );
  assert.equal(
    applyAction(scenario.state, {
      type: "activateDeadWizardToken",
      tokenInstanceId: token.instanceId,
    }).ok,
    false
  );
  assert.equal(scenario.activePlayer.chips, 4);
  assert.equal(scenario.activePlayer.deadWizardTokens.includes(token), true);

  scenario.activePlayer.chips = 5;
  assert.equal(
    listLegalActions(scenario.state).some(
      (action) =>
        action.type === "activateDeadWizardToken" &&
        action.tokenInstanceId === token.instanceId
    ),
    true
  );
  assert.equal(
    applyAction(scenario.state, {
      type: "activateDeadWizardToken",
      tokenInstanceId: token.instanceId,
    }).ok,
    true
  );
  assert.equal(scenario.activePlayer.chips, 0);
  assert.equal(scenario.activePlayer.deadWizardTokens.includes(token), false);
  assert.equal(token.ownerId, "common");
  assert.equal(
    listLegalActions(scenario.state).some(
      (action) =>
        action.type === "activateDeadWizardToken" &&
        action.tokenInstanceId === token.instanceId
    ),
    false
  );
  const scoreAfter = scoreGame(scenario.state).find(
    (score) => score.playerId === scenario.activePlayer.playerId
  );
  assert.equal(scoreAfter?.victoryPoints, 0);
  assert.equal(scoreAfter?.deadWizardTokenCount, 0);
});

test("activation-effects #311 keeps a DWT action unavailable for a foreign controller", () => {
  const scenario = createGameScenario({ rootDir, seed: 311007 });
  const foe = scenario.foes[0];
  assert.ok(foe);
  const token = givenDeadWizardToken(
    scenario,
    "esw2_dbg__dead_wizard_token_005",
    1,
    foe
  );
  scenario.activePlayer.chips = 5;

  assert.equal(
    listLegalActions(scenario.state).some(
      (action) =>
        action.type === "activateDeadWizardToken" &&
        action.tokenInstanceId === token.instanceId
    ),
    false
  );
  assert.equal(
    applyAction(scenario.state, {
      type: "activateDeadWizardToken",
      tokenInstanceId: token.instanceId,
    }).ok,
    false
  );
  assert.equal(scenario.activePlayer.chips, 5);
  assert.equal(foe.deadWizardTokens.includes(token), true);
});
