import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  type GameAction,
  type GameState,
  type RuntimeEffect,
  type TokenDefinition,
} from "../src/index.js";
import { runActionTransaction } from "../src/engine/action-transaction.js";
import { recordGameEvent } from "../src/engine/event-recorder.js";
import { markTokenDefinitionId } from "../src/domain/types.js";
import {
  createGameScenario,
  givenRuntimeCard,
} from "./helpers/game-scenario.js";
import {
  addFixtureDefenseCardToHand,
  selectFirstFixtureDefense,
} from "./helpers/defense-fixtures.js";
import { replacePostSetupWizardPropertyFixture } from "./helpers/fixture-tokens.js";
import { withTemporaryEffectRuntimeOperations } from "./helpers/with-temporary-effect-runtime-operations.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

test("action transaction rolls back engine state, identities, events, and RNG", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 18301,
  });
  const { state } = scenario;
  const player = scenario.activePlayer;
  const card = givenRuntimeCard(scenario, { effects: [] });
  const players = state.players;
  const common = state.common;
  const turn = state.turn;
  const eventLog = state.eventLog;
  const hand = player.hand;
  const discard = player.discard;
  const expectedNextRandom = state.rng.fork().next();
  const powerBefore = state.turn.power;
  const chipsBefore = player.chips;

  const result = runActionTransaction(state, () => {
    state.turn.power += 11;
    player.chips += 3;
    player.hand.splice(player.hand.indexOf(card), 1);
    player.discard.push(card);
    card.ownerId = scenario.foes[0]?.playerId ?? player.playerId;
    state.turn.activatedCardIds.push(card.instanceId);
    state.rng.next();
    recordGameEvent(state, {
      type: "turnEnded",
      playerId: player.playerId,
    });
    return { ok: false as const, error: "forced rollback" };
  });

  assert.deepEqual(result, { ok: false, error: "forced rollback" });
  assert.equal(state.players, players);
  assert.equal(state.common, common);
  assert.equal(state.turn, turn);
  assert.equal(state.eventLog, eventLog);
  assert.equal(player.hand, hand);
  assert.equal(player.discard, discard);
  assert.equal(player.hand.includes(card), true);
  assert.equal(player.discard.includes(card), false);
  assert.equal(card.ownerId, player.playerId);
  assert.equal(state.turn.power, powerBefore);
  assert.equal(player.chips, chipsBefore);
  assert.deepEqual(state.turn.activatedCardIds, []);
  assert.equal(state.eventLog.length, eventLog.length);
  assert.equal(state.rng.next(), expectedNextRandom);
});

test("action transaction rolls back before rethrowing technical errors", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 18302,
  });
  const { state } = scenario;
  const player = scenario.activePlayer;
  const turn = state.turn;
  const eventLog = state.eventLog;
  const powerBefore = state.turn.power;

  assert.throws(
    () =>
      runActionTransaction(state, () => {
        state.turn.power = 0;
        state.eventLog = [];
        throw new Error("technical failure");
      }),
    /technical failure/
  );

  assert.equal(state.turn, turn);
  assert.equal(state.turn.power, powerBefore);
  assert.equal(state.eventLog, eventLog);
  assert.equal(player, scenario.activePlayer);
});

test("action transaction wraps non-Error exceptions after rollback", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 18306,
  });
  const { state } = scenario;
  const turn = state.turn;

  let thrown: unknown;
  try {
    runActionTransaction(state, () => {
      state.turn.power = 0;
      throw "non-Error failure";
    });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof Error);
  assert.equal(
    thrown.message,
    "Action transaction operation threw a non-Error exception"
  );
  assert.equal(
    Object.getOwnPropertyDescriptor(thrown, "cause")?.value,
    "non-Error failure"
  );
  assert.equal(state.turn, turn);
  assert.equal(state.turn.power, 0);
});

test("successful terminal action commits its mutations", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 18303,
  });
  const { state } = scenario;
  const player = scenario.activePlayer;

  const result = runActionTransaction(state, () => {
    state.turn.power = 7;
    player.chips += 1;
    return {
      ok: true as const,
      gameEndReason: "playerDefeated" as const,
      winnerPlayerId: player.playerId,
    };
  });

  assert.deepEqual(result, {
    ok: true,
    gameEndReason: "playerDefeated",
    winnerPlayerId: player.playerId,
  });
  assert.equal(state.turn.power, 7);
  assert.equal(player.chips, 1);
});

test("choice callback exceptions roll back the action and preserve callback state", () => {
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
  assert.equal(player.hand.includes(card), true);
  assert.equal(player.playedThisTurn.includes(card), false);
  assert.equal(state.eventLog.length, eventLogLength);
});

test("public action composes with the nested Defense savepoint", () => {
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
  const turn = state.turn;
  const eventLog = state.eventLog;
  const expectedNextRandom = state.rng.fork().next();

  const result = withTemporaryEffectRuntimeOperations(
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
  );

  assert.deepEqual(result, { ok: false, error: "nested defense failure" });
  assert.equal(state.turn, turn);
  assert.equal(state.eventLog, eventLog);
  assert.equal(attacker.hand.includes(attack), true);
  assert.equal(defender.hand.includes(defense), true);
  assert.equal(defender.discard.includes(defense), false);
  assert.equal(defender.chips, 1);
  assert.equal(state.turn.power, 0);
  assert.equal(state.rng.next(), expectedNextRandom);
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseCostPaid"),
    false
  );
});

test("buy rolls back payment, ownership, zones, gain ledger, events, and RNG after a late on-gain error", () => {
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
  const powerBefore = state.turn.power;
  const chipsBefore = player.chips;
  const market = state.common.market;
  const discard = player.discard;
  const eventLog = state.eventLog;
  const expectedNextRandom = state.rng.fork().next();

  const result = withTemporaryEffectRuntimeOperations(
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
  );

  assert.deepEqual(result, { ok: false, error: "late on-gain failure" });
  assert.equal(state.common.market, market);
  assert.equal(player.discard, discard);
  assert.equal(state.eventLog, eventLog);
  assert.equal(state.common.market.includes(card), true);
  assert.equal(player.discard.includes(card), false);
  assert.equal(card.ownerId, "common");
  assert.equal(state.turn.power, powerBefore);
  assert.equal(player.chips, chipsBefore);
  assert.deepEqual(state.turn.gainedCardDefinitionIds, []);
  assert.equal(state.rng.next(), expectedNextRandom);
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
  assert.deepEqual(state.turn.gainedCardDefinitionIds, [card.definitionId]);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "cardBought" && event.cardInstanceId === card.instanceId
    ),
    true
  );
});

test("play rolls back after an on-play effect error", () => {
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

  const result = withTemporaryEffectRuntimeOperations(
    "add_power",
    {
      execute(state, player) {
        state.turn.power += 9;
        player.chips += 4;
        return { ok: false, error: "late on-play failure" };
      },
    },
    () => applyAction(scenario.state, action)
  );

  assertFailedActionRollback(
    scenario.state,
    scenario.activePlayer,
    card,
    result
  );
});

test("play rolls back after a wizard property on-play error", () => {
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

  const result = withTemporaryEffectRuntimeOperations(
    "gain_chips",
    {
      execute(state, targetPlayer) {
        targetPlayer.chips += 8;
        state.turn.power += 3;
        return { ok: false, error: "wizard property on-play failure" };
      },
    },
    () =>
      applyAction(state, { type: "playCard", cardInstanceId: card.instanceId })
  );

  assertFailedActionRollback(
    state,
    player,
    card,
    result,
    "wizard property on-play failure"
  );
});

test("play rolls back after a controlled-card on-play error", () => {
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

  const result = withTemporaryEffectRuntimeOperations(
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
      applyAction(state, { type: "playCard", cardInstanceId: card.instanceId })
  );

  assertFailedActionRollback(
    state,
    player,
    card,
    result,
    "controlled-card on-play failure"
  );
});

test("permanent activation rolls back before recording its activation marker", () => {
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
  const result = withTemporaryEffectRuntimeOperations(
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
  );

  assert.deepEqual(result, {
    ok: false,
    error: "permanent activation failure",
  });
  assert.deepEqual(scenario.state.turn.activatedCardIds, []);
  assert.equal(scenario.state.turn.power, 0);
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

test("Wizard Property activation rolls back before recording its activation marker", () => {
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

  const result = withTemporaryEffectRuntimeOperations(
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
  );

  assert.deepEqual(result, {
    ok: false,
    error: "wizard property activation failure",
  });
  assert.deepEqual(state.turn.activatedCardIds, []);
  assert.equal(state.turn.power, 0);
  assert.equal(player.chips, 0);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "wizardPropertyActivated" &&
        event.tokenInstanceId === property.instanceId
    ),
    false
  );
});

function assertFailedActionRollback(
  state: GameState,
  player: GameState["players"][number],
  card: GameState["players"][number]["hand"][number],
  result: { readonly ok: boolean; readonly error?: string },
  expectedError = "late on-play failure"
): void {
  assert.deepEqual(result, { ok: false, error: expectedError });
  assert.equal(player.hand.includes(card), true);
  assert.equal(player.playedThisTurn.includes(card), false);
  assert.equal(player.permanents.includes(card), false);
  assert.deepEqual(state.turn.temporaryCardControls, []);
  assert.equal(state.turn.power, 0);
  assert.equal(player.chips, 0);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "cardMoved" && event.cardInstanceId === card.instanceId
    ),
    false
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
      effects,
      unsupportedMechanics: [],
    },
  };
}
