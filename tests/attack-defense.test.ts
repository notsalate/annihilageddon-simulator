import assert from "node:assert/strict";
import test from "node:test";

import { initializeGame } from "../src/index.js";
import {
  resolveDefenseWindow,
  type AttackDefenseServices,
} from "../src/engine/attack-defense.js";
import { createAttackAmountState } from "../src/engine/attack-resolution.js";
import {
  createAttackDefenseUsage,
  type AttackResolution,
  type DefenseAttackContext,
  type EffectChoice,
  type EffectSourceContext,
} from "../src/engine/effect-runtime-registry.js";
import type { GameState, PlayerState } from "../src/engine/setup.js";
import { markPlayerId } from "../src/domain/types.js";
import { addFixtureDefenseCardToHand } from "./helpers/defense-fixtures.js";

const rootDir = process.cwd();

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
      { costId: "discard_other_hand_card" },
      { costId: "discard_other_hand_card" },
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
  let redirectedIntent:
    | Parameters<AttackDefenseServices["resolveRedirectedAttack"]>[1]
    | undefined;
  const services = createServices(
    (choices) =>
      choices.find((choice) => choice.choiceId === defense.instanceId),
    {
      resolveRedirectedAttack(_state, intent) {
        redirectedIntent = intent;
        return {
          ok: true,
          resolution: fakeResolution(
            intent.attackingPlayer,
            intent.targetPlayer,
            intent.source,
            intent.originalSource ?? intent.source
          ),
        };
      },
    }
  );

  const result = resolveDefenseWindow(
    state,
    defender,
    redirectableAttack(attacker, source),
    services
  );

  assert.equal(result.ok, true);
  assert.ok(redirectedIntent);
  assert.equal(redirectedIntent.attackingPlayer, defender);
  assert.equal(redirectedIntent.targetPlayer, attacker);
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
      resolveRedirectedAttack() {
        redirectCalls += 1;
        throw new Error("terminal defense branch must stop redirect");
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
  const services = createServices(
    (choices) =>
      choices.find((choice) => choice.choiceId === defense.instanceId),
    {
      resolveRedirectedAttack() {
        redirectCalls += 1;
        throw new Error("ownerless attack must not redirect");
      },
    }
  );
  const context: DefenseAttackContext = {
    kind: "nonredirectable",
    source,
    defenseUsage: createAttackDefenseUsage(),
  };

  const result = resolveDefenseWindow(state, defender, context, services);

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
    resolveRedirectedAttack(_state, intent) {
      return {
        ok: true,
        resolution: fakeResolution(
          intent.attackingPlayer,
          intent.targetPlayer,
          intent.source,
          intent.originalSource ?? intent.source
        ),
      };
    },
    getCardEffectRuntimeMode() {
      return "fixture";
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
    amountComponents: createAttackAmountState(2, 1),
    attackingPlayer: attacker,
    currentAttackerId: attacker.playerId,
    targetPlayer: target,
    source,
    originalSource,
  };
}
