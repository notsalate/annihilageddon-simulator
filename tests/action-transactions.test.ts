import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  type GameAction,
  type GameState,
  type RuntimeEffect,
  type TokenDefinition,
} from "../src/index.js";
import {
  markCardInstanceId,
  markTokenDefinitionId,
} from "../src/domain/types.js";
import {
  createGameScenario,
  givenRuntimeCard,
  play,
} from "./helpers/game-scenario.js";
import {
  addFixtureDefenseCardToHand,
  selectFirstFixtureDefense,
} from "./helpers/defense-fixtures.js";
import { replacePostSetupWizardPropertyFixture } from "./helpers/fixture-tokens.js";
import { withTemporaryEffectRuntimeOperations } from "./helpers/with-temporary-effect-runtime-operations.js";
import { verifiedTestRuntimeEffect } from "./helpers/verified-runtime-effect.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

test("choice callback exceptions abort the action after its first mutation", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 18304,
  });
  const { state } = scenario;
  state.runtimeMode = "fixture";
  const player = scenario.activePlayer;
  const card = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "fixture_add_power_equal_to_target_cost",
        timing: "onPlay",
        target: { selector: "mainMarketCard" },
      },
    ],
  });
  const turn = state.turn;
  const eventLog = state.eventLog;
  const eventLogLength = eventLog.length;
  let callbackCalls = 0;
  state.effectChoiceStrategy = (request) => {
    callbackCalls += 1;
    assert.equal(request.effectId, "fixture_add_power_equal_to_target_cost");
    throw new Error("choice callback failure");
  };

  assert.throws(
    () =>
      applyAction(state, {
        type: "playCard",
        cardInstanceId: card.instanceId,
      }),
    /choice callback failure/
  );

  assert.equal(callbackCalls, 1);
  assert.equal(state.turn, turn);
  assert.equal(state.eventLog, eventLog);
  assert.equal(player.hand.includes(card), false);
  assert.equal(player.playedThisTurn.includes(card), true);
  assert.ok(state.eventLog.length > eventLogLength);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "cardMoved" && event.cardInstanceId === card.instanceId
    ),
    true
  );
});

test("public action keeps the nested Defense savepoint while failing fast", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 18305,
  });
  const { state } = scenario;
  const attacker = scenario.activePlayer;
  const defender = scenario.foes[0];
  assert.ok(defender);
  defender.hand = [];
  defender.discard = [];
  defender.chips = 1;
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    costs: [{ costId: "spend_chips", amount: 1 }],
    branchEffects: [
      {
        effectId: "add_power",
        timing: "onDefense",
        amount: 2,
      },
    ],
  });
  state.effectChoiceStrategy = selectFirstFixtureDefense;
  const attack = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 4,
        target: { selector: "opponentPlayer" },
      },
    ],
  });
  const expectedNextRandom = state.rng.fork().next();

  assert.throws(
    () =>
      withTemporaryEffectRuntimeOperations(
        "add_power",
        {
          execute(mutatedState, player) {
            mutatedState.turn.power += 9;
            player.chips += 8;
            mutatedState.rng.next();
            return { ok: false, error: "nested defense failure" };
          },
        },
        () =>
          applyAction(state, {
            type: "playCard",
            cardInstanceId: attack.instanceId,
          })
      ),
    /nested defense failure/
  );
  assert.equal(state.turn.power, 0);
  assert.equal(attacker.hand.includes(attack), false);
  assert.equal(attacker.playedThisTurn.includes(attack), true);
  assert.equal(defender.hand.includes(defense), true);
  assert.equal(defender.discard.includes(defense), false);
  assert.equal(defender.chips, 1);
  assert.equal(state.rng.next(), expectedNextRandom);
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseCostPaid"),
    false
  );
});

test("late after-attack errors stop the action after combat mutations", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 18901,
  });
  const { state } = scenario;
  const attacker = scenario.activePlayer;
  const defender = scenario.foes[0];
  assert.ok(defender);
  defender.hand.splice(0);
  attacker.permanents.splice(0);
  const afterAttackPermanent = givenRuntimeCard(scenario, {
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_first_attack_damage_add_power",
        timing: "afterFirstAttackDamageEachTurn",
        amount: "totalDamageDealtByThatAttack",
      },
    ],
  });
  const attack = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 4,
        target: { selector: "opponentPlayer" },
      },
    ],
  });
  defender.life.current = 1;
  defender.trophyLikeObjects.push({
    instanceId: markCardInstanceId("fixture-transaction-attack-trophy"),
    trophyId: "basicTrophy",
    ownerId: defender.playerId,
    effects: [],
  });

  const turnBefore = structuredClone(state.turn);
  const eventLogLength = state.eventLog.length;

  assert.throws(
    () =>
      withTemporaryEffectRuntimeOperations(
        "ongoing_first_attack_damage_add_power",
        {
          applyAfterPlayerAttackDamage(_effect, context) {
            context.state.turn.power += 13;
            context.controller.chips += 8;
            context.state.rng.next();
            return {
              status: "resolved",
              result: { ok: false, error: "late after-attack failure" },
            };
          },
        },
        () => play(scenario, attack)
      ),
    /late after-attack failure/
  );
  assert.equal(attacker.hand.includes(attack), false);
  assert.equal(attacker.playedThisTurn.includes(attack), true);
  assert.equal(attacker.permanents.includes(afterAttackPermanent), true);
  assert.notEqual(defender.life.current, 1);
  assert.notDeepEqual(state.turn, turnBefore);
  assert.ok(state.eventLog.length > eventLogLength);
});

test("late outer attack errors preserve a committed Defense savepoint", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 19001,
  });
  const { state } = scenario;
  const attacker = scenario.activePlayer;
  const defender = scenario.foes[0];
  assert.ok(defender);
  defender.hand.splice(0);
  defender.discard.splice(0);
  defender.chips = 1;
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    costs: [{ costId: "spend_chips", amount: 1 }],
    branchEffects: [
      {
        effectId: "add_power",
        timing: "onDefense",
        amount: 2,
      },
    ],
  });
  state.effectChoiceStrategy = selectFirstFixtureDefense;
  const attack = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 4,
        target: { selector: "opponentPlayer" },
      },
      {
        effectId: "gain_chips",
        timing: "onPlay",
        amount: 1,
      },
    ],
  });

  let gainChipsCalls = 0;

  assert.throws(
    () =>
      withTemporaryEffectRuntimeOperations(
        "gain_chips",
        {
          execute(mutatedState, player) {
            gainChipsCalls += 1;
            mutatedState.turn.power += 9;
            player.chips += 8;
            mutatedState.rng.next();
            return { ok: false, error: "outer late failure after Defense" };
          },
        },
        () => play(scenario, attack)
      ),
    /outer late failure after Defense/
  );
  assert.equal(gainChipsCalls, 1);
  assert.equal(attacker.hand.includes(attack), false);
  assert.equal(attacker.playedThisTurn.includes(attack), true);
  assert.equal(defender.hand.includes(defense), false);
  assert.equal(defender.discard.includes(defense), true);
  assert.equal(defender.chips, 0);
  assert.equal(state.turn.power, 11);
  assert.equal(attacker.chips, 8);
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseChoiceSelected"),
    true
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseCostPaid"),
    true
  );
});

test("late on-gain errors stop buying after payment and ownership mutations", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 18401,
  });
  const { state } = scenario;
  const player = scenario.activePlayer;
  const propertyDefinition = createWizardPropertyDefinition(
    "fixture-transaction-on-gain",
    [
      {
        effectId: "gain_chips",
        timing: "onGainCard",
        amount: 1,
        cardTypes: ["creature"],
      },
    ]
  );
  replacePostSetupWizardPropertyFixture(state, player, propertyDefinition);
  player.wizardProperties.splice(1);

  const card = givenRuntimeCard(scenario, {
    effects: [],
    cardTypes: ["creature"],
  });
  player.hand.splice(player.hand.indexOf(card), 1);
  card.ownerId = "common";
  state.common.market.splice(0, state.common.market.length, card);
  state.turn.power = 10;
  const discard = player.discard;

  assert.throws(
    () =>
      withTemporaryEffectRuntimeOperations(
        "gain_chips",
        {
          execute(state, targetPlayer) {
            targetPlayer.chips += 9;
            state.turn.power -= 2;
            return { ok: false, error: "late on-gain failure" };
          },
        },
        () =>
          applyAction(state, {
            type: "buyMarketCard",
            cardInstanceId: card.instanceId,
            source: "mainMarket",
          })
      ),
    /late on-gain failure/
  );
  assert.equal(player.discard, discard);
  assert.equal(state.common.market.includes(card), false);
  assert.equal(player.discard.includes(card), false);
  assert.equal(card.ownerId, player.playerId);
  assert.equal(state.turn.power, 8);
  assert.equal(player.chips, 9);
  assert.deepEqual(
    state.turn.gainedCards.map((record) => record.definitionId),
    [card.definitionId]
  );
});

test("buy preflight failure preserves payment, market, identities, and events", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 18402,
  });
  const { state } = scenario;
  const player = scenario.activePlayer;
  const card = givenRuntimeCard(scenario, {
    effects: [],
    cost: 2,
    cardTypes: ["creature"],
  });
  player.hand.splice(player.hand.indexOf(card), 1);
  card.ownerId = "common";
  state.common.market.push(card);
  state.turn.power = 0;
  player.chips = 0;
  const turn = state.turn;
  const market = state.common.market;
  const eventLog = state.eventLog;

  const result = applyAction(state, {
    type: "buyMarketCard",
    cardInstanceId: card.instanceId,
    source: "mainMarket",
  });

  assert.deepEqual(result, {
    ok: false,
    error: "Not enough power to buy card",
  });
  assert.equal(state.turn, turn);
  assert.equal(state.common.market, market);
  assert.equal(state.eventLog, eventLog);
  assert.equal(state.common.market.includes(card), true);
  assert.equal(card.ownerId, "common");
  assert.equal(state.turn.power, 0);
  assert.equal(player.chips, 0);
  assert.equal(player.discard.includes(card), false);
});

test("successful buy commits payment, ownership, destination, gain ledger, and event", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 18403,
  });
  const { state } = scenario;
  const player = scenario.activePlayer;
  const card = givenRuntimeCard(scenario, {
    effects: [],
    cost: 2,
    cardTypes: ["creature"],
  });
  player.hand.splice(player.hand.indexOf(card), 1);
  card.ownerId = "common";
  state.common.market.push(card);
  state.turn.power = 5;
  const discard = player.discard;
  const eventLog = state.eventLog;

  const result = applyAction(state, {
    type: "buyMarketCard",
    cardInstanceId: card.instanceId,
    source: "mainMarket",
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(player.discard, discard);
  assert.equal(state.eventLog, eventLog);
  assert.equal(state.common.market.includes(card), false);
  assert.equal(player.discard.includes(card), true);
  assert.equal(card.ownerId, player.playerId);
  assert.equal(state.turn.power, 3);
  assert.deepEqual(
    state.turn.gainedCards.map((record) => record.definitionId),
    [card.definitionId]
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "cardBought" && event.cardInstanceId === card.instanceId
    ),
    true
  );
});

test("late on-play effect errors stop playing after card placement", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 18501,
  });
  const card = givenRuntimeCard(scenario, {
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 2 }],
  });
  const action: GameAction = {
    type: "playCard",
    cardInstanceId: card.instanceId,
  };

  assert.throws(
    () =>
      withTemporaryEffectRuntimeOperations(
        "add_power",
        {
          execute(state, player) {
            state.turn.power += 9;
            player.chips += 4;
            return { ok: false, error: "late on-play failure" };
          },
        },
        () => applyAction(scenario.state, action)
      ),
    /late on-play failure/
  );
  assertFailedActionIsFatal(scenario.state, scenario.activePlayer, card, 9, 4);
});

test("late wizard property on-play errors stop playing after card placement", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 18502,
  });
  const state = scenario.state;
  const player = scenario.activePlayer;
  const propertyDefinition = createWizardPropertyDefinition(
    "fixture-transaction-on-play-property",
    [
      {
        effectId: "gain_chips",
        timing: "onPlayCard",
        amount: 1,
        cardTypes: ["creature"],
      },
    ]
  );
  replacePostSetupWizardPropertyFixture(state, player, propertyDefinition);
  player.wizardProperties.splice(1);
  const card = givenRuntimeCard(scenario, {
    effects: [],
    cardTypes: ["creature"],
  });

  assert.throws(
    () =>
      withTemporaryEffectRuntimeOperations(
        "gain_chips",
        {
          execute(state, targetPlayer) {
            targetPlayer.chips += 8;
            state.turn.power += 3;
            return { ok: false, error: "wizard property on-play failure" };
          },
        },
        () =>
          applyAction(state, {
            type: "playCard",
            cardInstanceId: card.instanceId,
          })
      ),
    /wizard property on-play failure/
  );
  assertFailedActionIsFatal(state, player, card, 3, 8);
});

test("late controlled-card on-play errors stop playing after card placement", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 18503,
  });
  const state = scenario.state;
  const player = scenario.activePlayer;
  player.wizardProperties.splice(0);
  givenRuntimeCard(scenario, {
    zone: "permanents",
    isOngoing: true,
    cardTypes: ["creature"],
    effects: [
      {
        effectId: "gain_chips",
        timing: "onPlayCard",
        amount: 1,
        cardTypes: ["creature"],
      },
    ],
  });
  const card = givenRuntimeCard(scenario, {
    effects: [],
    cardTypes: ["creature"],
  });

  assert.throws(
    () =>
      withTemporaryEffectRuntimeOperations(
        "gain_chips",
        {
          executeOnPlayCard(_effect, context) {
            context.controller.chips += 6;
            context.state.turn.power += 4;
            return {
              status: "resolved",
              result: { ok: false, error: "controlled-card on-play failure" },
            };
          },
        },
        () =>
          applyAction(state, {
            type: "playCard",
            cardInstanceId: card.instanceId,
          })
      ),
    /controlled-card on-play failure/
  );
  assertFailedActionIsFatal(state, player, card, 4, 6);
});

test("late permanent activation errors stop without an activation marker", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 18601,
  });
  const card = givenRuntimeCard(scenario, {
    zone: "permanents",
    isOngoing: true,
    effects: [{ effectId: "add_power", timing: "activation", amount: 2 }],
  });
  assert.throws(
    () =>
      withTemporaryEffectRuntimeOperations(
        "add_power",
        {
          execute(state, player) {
            state.turn.power += 10;
            player.chips += 2;
            return { ok: false, error: "permanent activation failure" };
          },
        },
        () =>
          applyAction(scenario.state, {
            type: "activatePermanent",
            cardInstanceId: card.instanceId,
          })
      ),
    /permanent activation failure/
  );
  assert.deepEqual(scenario.state.turn.activatedCardIds, []);
  assert.equal(scenario.state.turn.power, 10);
  assert.equal(scenario.activePlayer.chips, 2);
  assert.equal(scenario.activePlayer.permanents.includes(card), true);
  assert.equal(
    scenario.state.eventLog.some(
      (event) =>
        event.type === "cardActivated" &&
        event.cardInstanceId === card.instanceId
    ),
    false
  );
});

test("late Wizard Property activation errors stop without an activation marker", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 18602,
  });
  const state = scenario.state;
  const player = scenario.activePlayer;
  const propertyDefinition = createWizardPropertyDefinition(
    "fixture-transaction-activation-property",
    [{ effectId: "gain_chips", timing: "activation", amount: 1 }]
  );
  const property = replacePostSetupWizardPropertyFixture(
    state,
    player,
    propertyDefinition
  );
  player.wizardProperties.splice(1);

  assert.throws(
    () =>
      withTemporaryEffectRuntimeOperations(
        "gain_chips",
        {
          execute(state, targetPlayer) {
            targetPlayer.chips += 7;
            state.turn.power += 5;
            return { ok: false, error: "wizard property activation failure" };
          },
        },
        () =>
          applyAction(state, {
            type: "activateWizardProperty",
            tokenInstanceId: property.instanceId,
          })
      ),
    /wizard property activation failure/
  );
  assert.deepEqual(state.turn.activatedCardIds, []);
  assert.equal(state.turn.power, 5);
  assert.equal(player.chips, 7);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "wizardPropertyActivated" &&
        event.tokenInstanceId === property.instanceId
    ),
    false
  );
});

function assertFailedActionIsFatal(
  state: GameState,
  player: GameState["players"][number],
  card: GameState["players"][number]["hand"][number],
  power: number,
  chips: number
): void {
  assert.equal(player.hand.includes(card), false);
  assert.equal(player.playedThisTurn.includes(card), true);
  assert.equal(player.permanents.includes(card), false);
  assert.equal(state.turn.power, power);
  assert.equal(player.chips, chips);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "cardMoved" && event.cardInstanceId === card.instanceId
    ),
    true
  );
}

function createWizardPropertyDefinition(
  tokenId: string,
  effects: RuntimeEffect[]
): TokenDefinition {
  return {
    schemaVersion: 1,
    tokenId: markTokenDefinitionId(tokenId),
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    source: { image: `assets/wizard-property/${tokenId}.png` },
    engine: {
      mappingStatus: "fixture",
      playableInV0: true,
      effects: effects.map((effect) => verifiedTestRuntimeEffect(effect)),
      unsupportedMechanics: [],
    },
  };
}
