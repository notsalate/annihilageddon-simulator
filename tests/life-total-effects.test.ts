import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  initializeGame,
  type PlayerState,
  type StatusInstance,
  type TokenInstance,
} from "../src/index.js";
import { loadCurrentRuntimeDataPack } from "../src/engine/data.js";
import { gainDeadWizardToken } from "../src/engine/effect-runtime.js";
import {
  markCardInstanceId,
  markTokenDefinitionId,
  markTokenInstanceId,
} from "../src/domain/types.js";
import {
  choosePlayerTargetForEffect,
  chooseEffect,
  createGameScenario,
  givenRuntimeCard,
} from "./helpers/game-scenario.js";
import { verifiedTestRuntimeEffect } from "./helpers/verified-runtime-effect.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

test("wizard property 010 sets setup life/trophy/turn and caps resurrection for Dingler", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const wizardProperties = dataPack.tokenStacks.wizardProperties;
  assert.ok(wizardProperties);
  const state = initializeGame({
    dataPack: {
      ...dataPack,
      tokenStacks: {
        ...dataPack.tokenStacks,
        wizardProperties: {
          ...wizardProperties,
          entries: [{ tokenId: "esw2_dbg__wizard_property_010", count: 4 }],
        },
      },
    },
    seed: 30101,
  });
  const scenario = createGameScenario({ state, seed: 30101 });

  const propertyOwner = state.players.find((player) =>
    player.wizardProperties.some(
      (property) => property.definitionId === "esw2_dbg__wizard_property_010"
    )
  );
  assert.ok(propertyOwner);
  assert.equal(state.activePlayerId, state.players[0]?.playerId);
  assert.equal(propertyOwner.life.current, 25);
  assert.ok(
    propertyOwner.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    )
  );

  propertyOwner.statuses = [createDinglerStatus(propertyOwner)];
  propertyOwner.life.current = 1;
  state.activePlayerId = propertyOwner.playerId;
  state.common.deadWizardTokens.drawStack = [
    createToken(
      "esw2_dbg__dead_wizard_token_neutral",
      "fixture-property-010-neutral"
    ),
  ];
  const damageCard = givenRuntimeCard(scenario, {
    player: propertyOwner,
    cardId: "property-010-damage",
    effects: [
      {
        effectId: "deal_damage",
        timing: "onPlay",
        amount: 1,
        target: { selector: "activePlayer" },
      },
    ],
    instanceId: "property-010-damage-instance",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: damageCard.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(propertyOwner.life.current, 15);
  const resurrection = state.eventLog.find(
    (event) =>
      event.type === "playerResurrected" &&
      event.playerId === propertyOwner.playerId
  );
  assert.equal(resurrection?.amount, 15);
});

test("DWT 013 applies ownerless chipsin damage and starts a recursive DWT cycle", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 30102,
  });
  const { state, activePlayer: player } = scenario;
  player.life.current = 20;
  player.chips = 30;
  state.common.deadWizardTokens.drawStack = [
    createToken("esw2_dbg__dead_wizard_token_013", "fixture-dwt-013-first"),
    createToken("esw2_dbg__dead_wizard_token_013", "fixture-dwt-013-second"),
  ];

  const result = gainDeadWizardToken(state, player);

  assert.equal(result.ok, true);
  assert.equal(player.life.current, 20);
  assert.equal(player.deadWizardTokens.length, 2);
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "effectDamageDealt" &&
        event.effectId === "dead_wizard_token_damage_equal_chips"
    ).length,
    2
  );
  assert.equal(
    state.eventLog.filter((event) => event.type === "playerDied").length,
    2
  );
  assert.equal(
    state.eventLog.filter((event) => event.type === "trophyControlChanged")
      .length,
    0
  );
});

test("DWT 014 counts selected effective Familiar types in discard", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 30103,
  });
  const { state, activePlayer: player } = scenario;
  player.life.current = 25;
  player.wizardProperties = [
    {
      instanceId: markTokenInstanceId("fixture-wizard-property-003"),
      definitionId: markTokenDefinitionId("esw2_dbg__wizard_property_003"),
      ownerId: player.playerId,
    },
  ];
  const realLegend = givenRuntimeCard(scenario, {
    player,
    zone: "discard",
    cardKind: "legend",
    cardTypes: ["legend"],
    effects: [],
  });
  const selectedFamiliar = givenRuntimeCard(scenario, {
    player,
    zone: "discard",
    cardKind: "familiar",
    cardTypes: ["familiar"],
    effects: [],
  });
  givenRuntimeCard(scenario, {
    player,
    zone: "discard",
    cardKind: "familiar",
    cardTypes: ["familiar"],
    effects: [],
  });

  const typeResult = applyAction(state, {
    type: "setCardEffectiveType",
    cardInstanceId: selectedFamiliar.instanceId,
    cardType: "legend",
    enabled: true,
  });
  assert.equal(typeResult.ok, true);
  assert.ok(player.discard.includes(realLegend));
  state.common.deadWizardTokens.drawStack = [
    createToken("esw2_dbg__dead_wizard_token_014", "fixture-dwt-014"),
  ];

  const result = gainDeadWizardToken(state, player);

  assert.equal(result.ok, true);
  assert.equal(player.life.current, 17);
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "effectDamageDealt" &&
        event.effectId === "dead_wizard_token_damage_per_discard_legend"
    ).length,
    1
  );
  const damage = state.eventLog.find(
    (event) =>
      event.type === "effectDamageDealt" &&
      event.effectId === "dead_wizard_token_damage_per_discard_legend"
  );
  assert.equal(damage?.amount, 8);
});

test("DWT 019 exchanges life with a different player without a pass option", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 30104,
  });
  const { state, activePlayer: player, foes } = scenario;
  const foe = foes[0];
  assert.ok(foe);
  player.life.current = 25;
  player.statuses = [createDinglerStatus(player)];
  foe.life.current = 25;
  chooseEffect(scenario, (request) => {
    if (
      request.requestKind !== "effect" ||
      String(request.effectId) !== "dead_wizard_token_exchange_life"
    ) {
      return undefined;
    }
    assert.equal(
      request.choices.some((choice) => choice.choiceId === player.playerId),
      false
    );
    const choice = request.choices.find(
      (candidate) => candidate.choiceId === foe.playerId
    );
    return choice === undefined ? undefined : { choiceId: choice.choiceId };
  });
  state.common.deadWizardTokens.drawStack = [
    createToken("esw2_dbg__dead_wizard_token_019", "fixture-dwt-019"),
  ];

  const result = gainDeadWizardToken(state, player);

  assert.equal(result.ok, true);
  assert.equal(player.life.current, 15);
  assert.equal(foe.life.current, 25);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectLifeExchanged" &&
        event.effectId === "dead_wizard_token_exchange_life" &&
        event.targetPlayerId === foe.playerId
    )
  );
});

test("DWT 025 reveals the hand and damages by the highest effective cost, with empty hand as zero", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 30105,
  });
  const { state, activePlayer: player } = scenario;
  player.wizardProperties = [
    {
      instanceId: markTokenInstanceId("fixture-wizard-property-004"),
      definitionId: markTokenDefinitionId("esw2_dbg__wizard_property_004"),
      ownerId: player.playerId,
    },
  ];
  player.life.current = 25;
  player.hand = [];
  givenRuntimeCard(scenario, {
    player,
    zone: "hand",
    cardTypes: ["treasure"],
    cost: 9,
    effects: [],
  });
  givenRuntimeCard(scenario, {
    player,
    zone: "hand",
    cardTypes: ["treasure"],
    cost: 4,
    effects: [],
  });
  state.common.deadWizardTokens.drawStack = [
    createToken("esw2_dbg__dead_wizard_token_025", "fixture-dwt-025"),
  ];

  const result = gainDeadWizardToken(state, player);

  assert.equal(result.ok, true);
  assert.equal(player.life.current, 17);
  assert.equal(
    state.eventLog.filter((event) => event.type === "effectCardRevealed")
      .length,
    2
  );
  const damage = state.eventLog.find(
    (event) =>
      event.type === "effectDamageDealt" &&
      event.effectId === "dead_wizard_token_damage_equal_highest_hand_cost"
  );
  assert.equal(damage?.amount, 8);

  const emptyScenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 30106,
  });
  emptyScenario.activePlayer.hand = [];
  emptyScenario.activePlayer.life.current = 20;
  emptyScenario.state.common.deadWizardTokens.drawStack = [
    createToken("esw2_dbg__dead_wizard_token_025", "fixture-dwt-025-empty"),
  ];

  const emptyResult = gainDeadWizardToken(
    emptyScenario.state,
    emptyScenario.activePlayer
  );

  assert.equal(emptyResult.ok, true);
  assert.equal(emptyScenario.activePlayer.life.current, 20);
  assert.equal(
    emptyScenario.state.eventLog.find(
      (event) =>
        event.type === "effectDamageDealt" &&
        event.effectId === "dead_wizard_token_damage_equal_highest_hand_cost"
    )?.amount,
    0
  );
});

test("DWT face resolves before the next effect of the causing card", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    playerCount: 2,
    seed: 30107,
  });
  const { state, activePlayer: player } = scenario;
  const foe = scenario.foes[0];
  assert.ok(foe);
  for (const candidate of state.players) {
    candidate.wizardProperties = [];
  }
  foe.life.current = 1;
  state.common.deadWizardTokens.drawStack = [
    createToken("esw2_dbg__dead_wizard_token_neutral", "fixture-dwt-order"),
  ];
  const card = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "deal_damage",
        timing: "onPlay",
        amount: 1,
        target: { selector: "opponentPlayer" },
      },
      {
        effectId: "set_life",
        timing: "onPlay",
        lifeTotal: 9,
        target: { selector: "activePlayer" },
      },
    ],
  });

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: card.instanceId }),
    { ok: true }
  );

  const faceResolvedIndex = state.eventLog.findIndex(
    (event) =>
      event.type === "deadWizardTokenFaceResolved" &&
      event.playerId === foe.playerId
  );
  const nextEffectIndex = state.eventLog.findIndex(
    (event) =>
      event.type === "effectLifeSet" && event.definitionId === card.definitionId
  );
  assert.ok(faceResolvedIndex >= 0);
  assert.ok(nextEffectIndex >= 0);
  assert.ok(faceResolvedIndex < nextEffectIndex);
  assert.equal(player.life.current, 9);
});

test("life-total DWT faces resolve through the public death lifecycle", () => {
  const chipsin = createLethalDwtScenario(
    30108,
    "esw2_dbg__dead_wizard_token_013"
  );
  chipsin.foe.chips = 3;
  assert.deepEqual(
    applyAction(chipsin.scenario.state, {
      type: "playCard",
      cardInstanceId: chipsin.card.instanceId,
    }),
    { ok: true }
  );
  assert.equal(chipsin.foe.life.current, 17);
  assert.ok(
    chipsin.scenario.state.eventLog.some(
      (event) =>
        event.type === "effectDamageDealt" &&
        event.effectId === "dead_wizard_token_damage_equal_chips" &&
        event.targetPlayerId === chipsin.foe.playerId
    )
  );

  const discardLegend = createLethalDwtScenario(
    30109,
    "esw2_dbg__dead_wizard_token_014"
  );
  givenRuntimeCard(discardLegend.scenario, {
    player: discardLegend.foe,
    zone: "discard",
    cardKind: "legend",
    cardTypes: ["legend"],
    effects: [],
  });
  assert.deepEqual(
    applyAction(discardLegend.scenario.state, {
      type: "playCard",
      cardInstanceId: discardLegend.card.instanceId,
    }),
    { ok: true }
  );
  assert.equal(discardLegend.foe.life.current, 16);

  const exchange = createLethalDwtScenario(
    30110,
    "esw2_dbg__dead_wizard_token_019"
  );
  exchange.scenario.activePlayer.life.current = 11;
  choosePlayerTargetForEffect(
    exchange.scenario,
    "dead_wizard_token_exchange_life",
    exchange.scenario.activePlayer
  );
  assert.deepEqual(
    applyAction(exchange.scenario.state, {
      type: "playCard",
      cardInstanceId: exchange.card.instanceId,
    }),
    { ok: true }
  );
  assert.equal(exchange.foe.life.current, 11);
  assert.equal(exchange.scenario.activePlayer.life.current, 20);

  const handCost = createLethalDwtScenario(
    30111,
    "esw2_dbg__dead_wizard_token_025"
  );
  handCost.foe.hand = [];
  givenRuntimeCard(handCost.scenario, {
    player: handCost.foe,
    zone: "hand",
    cost: 7,
    effects: [],
  });
  givenRuntimeCard(handCost.scenario, {
    player: handCost.foe,
    zone: "hand",
    cost: 2,
    effects: [],
  });
  assert.deepEqual(
    applyAction(handCost.scenario.state, {
      type: "playCard",
      cardInstanceId: handCost.card.instanceId,
    }),
    { ok: true }
  );
  assert.equal(handCost.foe.life.current, 13);
  assert.equal(
    handCost.scenario.state.eventLog.filter(
      (event) =>
        event.type === "effectCardRevealed" &&
        event.effectId === "dead_wizard_token_damage_equal_highest_hand_cost"
    ).length,
    2
  );
});

function createToken(definitionId: string, instanceId: string): TokenInstance {
  return {
    instanceId: markTokenInstanceId(instanceId),
    definitionId: markTokenDefinitionId(definitionId),
    ownerId: "common",
  };
}

function createDinglerStatus(player: PlayerState): StatusInstance {
  return {
    instanceId: markCardInstanceId(`fixture-dingler-${player.playerId}`),
    statusId: "dingler",
    ownerId: player.playerId,
    effects: [
      verifiedTestRuntimeEffect({
        effectId: "modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerMaxLife",
        operation: "add",
        amount: -10,
        target: { targetType: "player" },
      }),
    ],
  };
}

function createLethalDwtScenario(seed: number, tokenDefinitionId: string) {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    playerCount: 2,
    seed,
  });
  const foe = scenario.foes[0];
  assert.ok(foe);
  for (const player of scenario.state.players) {
    player.wizardProperties = [];
  }
  foe.life.current = 1;
  scenario.state.common.deadWizardTokens.drawStack = [
    createToken(tokenDefinitionId, `fixture-public-dwt-${seed}`),
  ];
  const card = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "deal_damage",
        timing: "onPlay",
        amount: 1,
        target: { selector: "opponentPlayer" },
      },
    ],
  });
  return { scenario, foe, card };
}
