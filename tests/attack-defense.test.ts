import assert from "node:assert/strict";
import test from "node:test";

import { initializeGame } from "../src/index.js";
import {
  buildDefensePaymentPlan,
  resolveDefenseWindow,
  type AttackDefenseServices,
} from "../src/engine/attack-defense.js";
import {
  createAttackAmountState,
  type RedirectedAttackIntent,
} from "../src/engine/attack-resolution.js";
import {
  createAttackDefenseUsage,
  type AttackResolution,
  type DefenseAttackContext,
  type EffectChoice,
  type EffectSourceContext,
} from "../src/engine/effect-runtime-registry.js";
import type {
  CardInstance,
  GameState,
  PlayerState,
} from "../src/engine/setup.js";
import { markPlayerId } from "../src/domain/types.js";
import { addFixtureDefenseCardToHand } from "./helpers/defense-fixtures.js";

const rootDir = process.cwd();

test("defense payment plan builds mixed cumulative steps in cost order", () => {
  const { state, defender } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf");
  const [firstCard, secondCard] = moveDeckCardsToHand(defender, 2);
  assert.ok(firstCard);
  assert.ok(secondCard);
  defender.chips = 8;
  defender.life.current = 10;

  const result = buildDefensePaymentPlan(defender, defense, [
    { costId: "spend_chips", amount: 2 },
    { costId: "pay_life", amount: 3 },
    { costId: "discard_other_hand_card", amount: 1 },
    { costId: "spend_chips", amount: 4 },
    { costId: "pay_life", amount: 2 },
    { costId: "discard_other_hand_card", amount: 1 },
  ]);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.plan, {
    playerId: defender.playerId,
    defenseCardInstanceId: defense.instanceId,
    startingChips: 8,
    startingLife: 10,
    steps: [
      { kind: "spendChips", amount: 2, chipsBefore: 8, chipsAfter: 6 },
      { kind: "payLife", amount: 3, lifeBefore: 10, lifeAfter: 7 },
      { kind: "discardOtherHandCard", cardInstanceId: firstCard.instanceId },
      { kind: "spendChips", amount: 4, chipsBefore: 6, chipsAfter: 2 },
      { kind: "payLife", amount: 2, lifeBefore: 7, lifeAfter: 5 },
      { kind: "discardOtherHandCard", cardInstanceId: secondCard.instanceId },
    ],
  });
  assert.equal(Object.isFrozen(result.plan), true);
  assert.equal(Object.isFrozen(result.plan.steps), true);
  assert.equal(
    result.plan.steps.every((step) => Object.isFrozen(step)),
    true
  );
});

test("defense payment plan reserves duplicate discard costs in hand order", () => {
  const { state, defender } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf");
  const [firstCard, secondCard] = moveDeckCardsToHand(defender, 2);
  assert.ok(firstCard);
  assert.ok(secondCard);

  const result = buildDefensePaymentPlan(defender, defense, [
    { costId: "discard_other_hand_card", amount: 1 },
    { costId: "discard_other_hand_card", amount: 1 },
  ]);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.plan.steps, [
    { kind: "discardOtherHandCard", cardInstanceId: firstCard.instanceId },
    { kind: "discardOtherHandCard", cardInstanceId: secondCard.instanceId },
  ]);
});

test("defense payment plan rejects cumulatively insufficient chips", () => {
  const { state, defender } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf");
  defender.chips = 5;

  const result = buildDefensePaymentPlan(defender, defense, [
    { costId: "spend_chips", amount: 3 },
    { costId: "spend_chips", amount: 3 },
  ]);

  assert.equal(result.ok, false);
});

test("defense payment plan rejects cumulatively lethal life payment", () => {
  const { state, defender } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf");
  defender.life.current = 5;

  const result = buildDefensePaymentPlan(defender, defense, [
    { costId: "pay_life", amount: 2 },
    { costId: "pay_life", amount: 3 },
  ]);

  assert.equal(result.ok, false);
});

test("defense payment plan rejects unavailable other hand cards", () => {
  const { state, defender } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf");
  moveDeckCardsToHand(defender, 1);

  const result = buildDefensePaymentPlan(defender, defense, [
    { costId: "discard_other_hand_card", amount: 1 },
    { costId: "discard_other_hand_card", amount: 1 },
  ]);

  assert.equal(result.ok, false);
});

test("defense payment preflight does not mutate state, events, or RNG", () => {
  const { state, defender } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf");
  moveDeckCardsToHand(defender, 1);
  defender.chips = 4;
  defender.life.current = 6;
  const handBefore = [...defender.hand];
  const discardBefore = [...defender.discard];
  const eventLogBefore = structuredClone(state.eventLog);
  const expectedRng = state.rng.fork();

  const result = buildDefensePaymentPlan(defender, defense, [
    { costId: "discard_other_hand_card", amount: 1 },
    { costId: "spend_chips", amount: 2 },
    { costId: "pay_life", amount: 3 },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(defender.hand, handBefore);
  assert.deepEqual(defender.discard, discardBefore);
  assert.equal(defender.chips, 4);
  assert.equal(defender.life.current, 6);
  assert.deepEqual(state.eventLog, eventLogBefore);
  assert.equal(state.rng.next(), expectedRng.next());
});

test("defense payment plan treats missing and empty costs as an empty plan", () => {
  const { state, defender } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf");

  const missing = buildDefensePaymentPlan(defender, defense, undefined);
  const empty = buildDefensePaymentPlan(defender, defense, []);

  assert.equal(missing.ok, true);
  assert.equal(empty.ok, true);
  if (!missing.ok || !empty.ok) return;
  assert.deepEqual(missing.plan.steps, []);
  assert.deepEqual(empty.plan.steps, []);
});

test("defense module preserves an explicit decline without mutations", () => {
  const { state, attacker, defender, source } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    costs: [{ costId: "spend_chips", amount: 2 }],
  });
  defender.chips = 3;
  const services = createServices((choices) =>
    choices.find((choice) => choice.choiceId === "decline")
  );

  const result = resolveDefenseWindow(
    state,
    defender,
    redirectableAttack(attacker, source),
    services
  );

  assert.deepEqual(result, { ok: true, avoided: false });
  assert.equal(defender.chips, 3);
  assert.equal(defender.hand.includes(defense), true);
  assert.equal(defender.discard.includes(defense), false);
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseCostPaid"),
    false
  );
});

test("defense module excludes defenses whose cumulative chip costs are unaffordable", () => {
  const { state, attacker, defender, source } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    costs: [
      { costId: "spend_chips", amount: 3 },
      { costId: "spend_chips", amount: 3 },
    ],
  });
  defender.chips = 5;
  let choiceCalls = 0;
  const services = createServices((choices) => {
    choiceCalls += 1;
    return choices.find((choice) => choice.choiceId === defense.instanceId);
  });

  const result = resolveDefenseWindow(
    state,
    defender,
    redirectableAttack(attacker, source),
    services
  );

  assert.deepEqual(result, { ok: true, avoided: false });
  assert.equal(choiceCalls, 0);
  assert.equal(defender.chips, 5);
  assert.equal(defender.hand.includes(defense), true);
});

test("defense module excludes defenses whose cumulative life costs are lethal", () => {
  const { state, attacker, defender, source } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    costs: [
      { costId: "pay_life", amount: 2 },
      { costId: "pay_life", amount: 3 },
    ],
  });
  defender.life.current = 5;
  let choiceCalls = 0;
  const services = createServices((choices) => {
    choiceCalls += 1;
    return choices.find((choice) => choice.choiceId === defense.instanceId);
  });

  const result = resolveDefenseWindow(
    state,
    defender,
    redirectableAttack(attacker, source),
    services
  );

  assert.deepEqual(result, { ok: true, avoided: false });
  assert.equal(choiceCalls, 0);
  assert.equal(defender.life.current, 5);
  assert.equal(defender.hand.includes(defense), true);
});

test("defense module excludes defenses requiring more other cards than are available", () => {
  const { state, attacker, defender, source } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    costs: [
      { costId: "discard_other_hand_card", amount: 1 },
      { costId: "discard_other_hand_card", amount: 1 },
    ],
  });
  const otherCard = defender.deck.shift();
  assert.ok(otherCard);
  defender.hand.push(otherCard);
  let choiceCalls = 0;
  const services = createServices((choices) => {
    choiceCalls += 1;
    return choices.find((choice) => choice.choiceId === defense.instanceId);
  });

  const result = resolveDefenseWindow(
    state,
    defender,
    redirectableAttack(attacker, source),
    services
  );

  assert.deepEqual(result, { ok: true, avoided: false });
  assert.equal(choiceCalls, 0);
  assert.deepEqual(defender.hand, [defense, otherCard]);
});

test("defense module commits exact planned cards and costs in event order", () => {
  const { state, attacker, defender, source } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    costs: [
      { costId: "spend_chips", amount: 2 },
      { costId: "discard_other_hand_card", amount: 1 },
      { costId: "pay_life", amount: 3 },
      { costId: "spend_chips", amount: 1 },
      { costId: "discard_other_hand_card", amount: 1 },
    ],
  });
  const [firstCard, secondCard, untouchedCard] = moveDeckCardsToHand(
    defender,
    3
  );
  assert.ok(firstCard);
  assert.ok(secondCard);
  assert.ok(untouchedCard);
  defender.chips = 5;
  defender.life.current = 9;
  const services = createServices((choices) =>
    choices.find((choice) => choice.choiceId === defense.instanceId)
  );

  const result = resolveDefenseWindow(
    state,
    defender,
    redirectableAttack(attacker, source),
    services
  );

  assert.equal(result.ok, true);
  assert.equal(defender.chips, 2);
  assert.equal(defender.life.current, 6);
  assert.deepEqual(
    defender.hand.map((card) => card.instanceId),
    [untouchedCard.instanceId]
  );
  assert.deepEqual(
    defender.discard.map((card) => card.instanceId),
    [firstCard.instanceId, secondCard.instanceId, defense.instanceId]
  );
  const costEvents = state.eventLog.filter(
    (event) => event.type === "defenseCostPaid"
  );
  assert.deepEqual(
    costEvents.map((event) => event.effectId),
    [
      "spend_chips",
      "discard_other_hand_card",
      "pay_life",
      "spend_chips",
      "discard_other_hand_card",
    ]
  );
  assert.deepEqual(
    costEvents
      .filter((event) => event.effectId === "discard_other_hand_card")
      .map((event) => event.targetCardInstanceId),
    [firstCard.instanceId, secondCard.instanceId]
  );
});

test("Defense payment moves its hand card through Ledger without direct array splice", () => {
  const { state, attacker, defender, source } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    costs: [{ costId: "discard_other_hand_card", amount: 1 }],
  });
  const [paymentCard] = moveDeckCardsToHand(defender, 1);
  assert.ok(paymentCard);
  Object.defineProperty(defender.hand, "splice", {
    value() {
      throw new Error("Defense payment bypassed Control Ledger");
    },
    configurable: true,
  });
  const services = createServices((choices) =>
    choices.find((choice) => choice.choiceId === defense.instanceId)
  );

  const result = resolveDefenseWindow(
    state,
    defender,
    redirectableAttack(attacker, source),
    services
  );

  assert.equal(result.ok, true);
  assert.deepEqual(defender.hand, []);
  assert.deepEqual(defender.discard, [paymentCard, defense]);
});

test("Defense payment rejects a planned card moved out of hand before commit", () => {
  const { state, attacker, defender, source } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    costs: [{ costId: "discard_other_hand_card", amount: 1 }],
  });
  const [paymentCard] = moveDeckCardsToHand(defender, 1);
  assert.ok(paymentCard);
  const services = createServices((choices) => {
    defender.hand = defender.hand.filter(
      (card) => card.instanceId !== paymentCard.instanceId
    );
    defender.deck.unshift(paymentCard);
    return choices.find((choice) => choice.choiceId === defense.instanceId);
  });

  const result = resolveDefenseWindow(
    state,
    defender,
    redirectableAttack(attacker, source),
    services
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /not uniquely present in hand/);
  assert.equal(defender.deck.includes(paymentCard), true);
  assert.equal(defender.discard.includes(paymentCard), false);
  assert.equal(defender.hand.includes(defense), true);
});

test("defense module rejects a stale payment plan before partial commit", () => {
  const { state, attacker, defender, source } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    costs: [
      { costId: "spend_chips", amount: 2 },
      { costId: "pay_life", amount: 2 },
    ],
  });
  defender.chips = 5;
  defender.life.current = 8;
  const eventLogBefore = structuredClone(state.eventLog);
  const services = createServices((choices) => {
    defender.chips = 4;
    return choices.find((choice) => choice.choiceId === defense.instanceId);
  });

  const result = resolveDefenseWindow(
    state,
    defender,
    redirectableAttack(attacker, source),
    services
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /expected 5 chips, found 4/);
  assert.equal(defender.chips, 4);
  assert.equal(defender.life.current, 8);
  assert.equal(defender.hand.includes(defense), true);
  assert.equal(defender.discard.includes(defense), false);
  assert.deepEqual(state.eventLog, eventLogBefore);
});

test("terminal defense branch keeps committed payment plan", () => {
  const { state, attacker, defender, source } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    costs: [
      { costId: "spend_chips", amount: 2 },
      { costId: "pay_life", amount: 3 },
    ],
    branchEffects: [{ effectId: "draw_cards", timing: "onDefense", amount: 1 }],
  });
  defender.chips = 5;
  defender.life.current = 10;
  const gameEnd = {
    reason: "playerDefeated" as const,
    winnerPlayerId: defender.playerId,
  };
  const services = createServices(
    (choices) =>
      choices.find((choice) => choice.choiceId === defense.instanceId),
    {
      executeDefenseEffects() {
        return { ok: true, gameEnd };
      },
    }
  );

  const result = resolveDefenseWindow(
    state,
    defender,
    redirectableAttack(attacker, source),
    services
  );

  assert.deepEqual(result, { ok: true, avoided: true, gameEnd });
  assert.equal(defender.chips, 3);
  assert.equal(defender.life.current, 7);
  assert.equal(defender.hand.includes(defense), false);
  assert.equal(defender.discard.includes(defense), true);
  assert.deepEqual(
    state.eventLog
      .filter((event) => event.type === "defenseCostPaid")
      .map((event) => event.effectId),
    ["spend_chips", "pay_life"]
  );
});
test("defense module applies the exact selected defense", () => {
  const { state, attacker, defender, source } = createScenario();
  const first = addFixtureDefenseCardToHand(state, defender, "discardSelf");
  const second = addFixtureDefenseCardToHand(state, defender, "discardSelf");
  const services = createServices((choices) =>
    choices.find((choice) => choice.choiceId === second.instanceId)
  );

  const result = resolveDefenseWindow(
    state,
    defender,
    redirectableAttack(attacker, source),
    services
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.avoided, true);
  assert.equal(defender.hand.includes(first), true);
  assert.equal(defender.hand.includes(second), false);
  assert.equal(defender.discard.includes(second), true);
});

test("defense module transfers current attacker through redirect", () => {
  const { state, attacker, defender, source } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    redirectAttack: true,
  });
  let redirectedIntent: RedirectedAttackIntent | undefined;
  const services = createServices((choices) =>
    choices.find((choice) => choice.choiceId === defense.instanceId)
  );

  const result = resolveDefenseWindow(
    state,
    defender,
    redirectableAttack(attacker, source),
    services,
    (intent) => {
      redirectedIntent = intent;
      return {
        ok: true,
        resolution: fakeResolution(
          intent.attackingPlayer,
          intent.targetPlayer,
          intent.source,
          intent.originalSource
        ),
      };
    }
  );

  assert.equal(result.ok, true);
  assert.ok(redirectedIntent);
  assert.equal(redirectedIntent.attackingPlayer, defender);
  assert.equal(redirectedIntent.targetPlayer, attacker);
  assert.equal(redirectedIntent.controlEpoch, 1);
  assert.equal(redirectedIntent.carriedAmount, 3);
  assert.equal(redirectedIntent.source.playerId, defender.playerId);
  assert.equal(redirectedIntent.originalSource, source);
});

test("defense module rolls back costs, movement, branches, events, and usage on failure", () => {
  const { state, attacker, defender, source } = createScenario();
  const defenseUsage = createAttackDefenseUsage();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    costs: [
      { costId: "spend_chips", amount: 2 },
      { costId: "pay_life", amount: 3 },
    ],
    branchEffects: [{ effectId: "draw_cards", timing: "onDefense", amount: 1 }],
  });
  defender.chips = 5;
  const lifeBefore = defender.life.current;
  const eventCountBefore = state.eventLog.length;
  const services = createServices(
    (choices) =>
      choices.find((choice) => choice.choiceId === defense.instanceId),
    {
      executeDefenseEffects(_state, player) {
        player.chips += 7;
        player.life.current -= 4;
        player.hand.push(...player.deck.splice(0, 1));
        return { ok: false, error: "fixture branch failure" };
      },
    }
  );

  const result = resolveDefenseWindow(
    state,
    defender,
    redirectableAttack(attacker, source, defenseUsage),
    services
  );

  assert.deepEqual(result, { ok: false, error: "fixture branch failure" });
  assert.equal(defender.chips, 5);
  assert.equal(defender.life.current, lifeBefore);
  assert.equal(defender.hand.includes(defense), true);
  assert.equal(defender.discard.includes(defense), false);
  assert.equal(state.eventLog.length, eventCountBefore);
  assert.deepEqual([...defenseUsage.defendedPlayerIds], []);
  assert.deepEqual([...defenseUsage.usedDefenseCardInstanceIds], []);
});

test("defense branch game end stops redirect and propagates the terminal result", () => {
  const { state, attacker, defender, source } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    redirectAttack: true,
    branchEffects: [{ effectId: "draw_cards", timing: "onDefense", amount: 1 }],
  });
  const gameEnd = {
    reason: "playerDefeated" as const,
    winnerPlayerId: defender.playerId,
  };
  let redirectCalls = 0;
  const services = createServices(
    (choices) =>
      choices.find((choice) => choice.choiceId === defense.instanceId),
    {
      executeDefenseEffects() {
        return { ok: true, gameEnd };
      },
    }
  );

  const result = resolveDefenseWindow(
    state,
    defender,
    redirectableAttack(attacker, source),
    services,
    () => {
      redirectCalls += 1;
      throw new Error("terminal defense branch must stop redirect");
    }
  );

  assert.deepEqual(result, { ok: true, avoided: true, gameEnd });
  assert.equal(redirectCalls, 0);
  assert.equal(defender.hand.includes(defense), false);
  assert.equal(defender.discard.includes(defense), true);
});

test("ownerless redirect defense avoids without inventing an attacker", () => {
  const { state, defender, source } = createScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    redirectAttack: true,
  });
  let redirectCalls = 0;
  const services = createServices((choices) =>
    choices.find((choice) => choice.choiceId === defense.instanceId)
  );
  const context: DefenseAttackContext = {
    kind: "nonredirectable",
    source,
    defenseUsage: createAttackDefenseUsage(),
  };

  const result = resolveDefenseWindow(
    state,
    defender,
    context,
    services,
    () => {
      redirectCalls += 1;
      throw new Error("ownerless attack must not redirect");
    }
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.avoided, true);
  assert.equal(result.resolution, undefined);
  assert.equal(redirectCalls, 0);
  assert.equal(defender.discard.includes(defense), true);
});

function createScenario(): {
  state: GameState;
  attacker: PlayerState;
  defender: PlayerState;
  source: EffectSourceContext;
} {
  const state = initializeGame({ rootDir, seed: 43001 });
  const attacker = mustGetPlayer(state, "player-1");
  const defender = mustGetPlayer(state, "player-2");
  state.activePlayerId = attacker.playerId;
  attacker.hand = [];
  defender.hand = [];
  defender.discard = [];
  attacker.wizardProperties = [];
  defender.wizardProperties = [];
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: "fixture",
    playerId: attacker.playerId,
    cardInstanceId: "fixture-attack-source",
    definitionId: "fixture-attack-source",
  };
  return { state, attacker, defender, source };
}

function moveDeckCardsToHand(
  player: PlayerState,
  count: number
): CardInstance[] {
  const cards = player.deck.splice(0, count);
  assert.equal(cards.length, count);
  player.hand.push(...cards);
  return cards;
}

function mustGetPlayer(
  state: GameState,
  playerId: "player-1" | "player-2"
): PlayerState {
  const player = state.players.find(
    (candidate) => candidate.playerId === markPlayerId(playerId)
  );
  assert.ok(player);
  return player;
}

function redirectableAttack(
  attacker: PlayerState,
  source: EffectSourceContext,
  defenseUsage = createAttackDefenseUsage()
): DefenseAttackContext {
  return {
    kind: "redirectable",
    attackingPlayer: attacker,
    amountComponents: createAttackAmountState(2, 1),
    carriedAmount: 3,
    controlEpoch: 0,
    effectId: "attack_damage",
    source,
    originalSource: source,
    defenseUsage,
  };
}

function createServices(
  select: (choices: readonly EffectChoice[]) => EffectChoice | undefined,
  overrides: Partial<AttackDefenseServices> = {}
): AttackDefenseServices {
  return {
    chooseEffectChoice(_state, _player, _source, _effectId, choices) {
      return select(choices);
    },
    executeDefenseEffects() {
      return { ok: true };
    },
    ...overrides,
  };
}

function fakeResolution(
  attacker: PlayerState,
  target: PlayerState,
  source: EffectSourceContext,
  originalSource: EffectSourceContext
): AttackResolution {
  return {
    damageDealt: 0,
    killed: false,
    avoided: true,
    controlEpoch: 0,
    amountComponents: createAttackAmountState(2, 1),
    attackingPlayer: attacker,
    currentAttackerId: attacker.playerId,
    targetPlayer: target,
    source,
    originalSource,
  };
}
