import assert from "node:assert/strict";
import test from "node:test";

import { initializeGame } from "../src/index.js";
import { executeEffect } from "../src/engine/effect-runtime.js";
import type { EffectSourceContext } from "../src/engine/effect-runtime-registry.js";
import type { GameState, PlayerState } from "../src/engine/setup.js";
import { addFixtureDefenseCardToHand } from "./helpers/defense-fixtures.js";

const rootDir = process.cwd();

test("a player can decline a legal optional defense", () => {
  const { state, attacker, defender } = createAttackScenario();
  defender.chips = 5;
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    costs: [
      { costId: "spend_chips", amount: 2 },
      { costId: "pay_life", amount: 3 },
    ],
  });
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId === "attack_damage") {
      return choices.find((choice) => choice.choiceId === defender.playerId);
    }
    if (effectId === "avoid_attack") {
      return choices.find((choice) => choice.choiceId === "decline");
    }
    return undefined;
  };
  const lifeBefore = defender.life.current;
  const chipsBefore = defender.chips;

  const result = executeEffect(
    state,
    attacker,
    {
      effectId: "attack_damage",
      amount: 2,
      targetSelector: "chosenFoe",
    },
    attackSource(attacker)
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(defender.life.current, lifeBefore - 2);
  assert.equal(defender.chips, chipsBefore);
  assert.equal(defender.hand.includes(defense), true);
  assert.equal(defender.discard.includes(defense), false);
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseChoiceSelected"),
    false
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseCostPaid"),
    false
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseCardMoved"),
    false
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.effectId === "avoid_attack" &&
        event.choiceId === "decline"
    ),
    true
  );
});

test("a player can select an exact defense instead of the first card", () => {
  const { state, attacker, defender } = createAttackScenario();
  const firstDefense = addFixtureDefenseCardToHand(
    state,
    defender,
    "discardSelf"
  );
  const secondDefense = addFixtureDefenseCardToHand(
    state,
    defender,
    "discardSelf"
  );
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId === "attack_damage") {
      return choices.find((choice) => choice.choiceId === defender.playerId);
    }
    if (effectId === "avoid_attack") {
      return choices.find(
        (choice) => choice.choiceId === secondDefense.instanceId
      );
    }
    return undefined;
  };
  const lifeBefore = defender.life.current;

  const result = executeEffect(
    state,
    attacker,
    {
      effectId: "attack_damage",
      amount: 2,
      targetSelector: "chosenFoe",
    },
    attackSource(attacker)
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(defender.life.current, lifeBefore);
  assert.equal(defender.hand.includes(firstDefense), true);
  assert.equal(defender.hand.includes(secondDefense), false);
  assert.equal(defender.discard.includes(secondDefense), true);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "defenseChoiceSelected" &&
        event.cardInstanceId === secondDefense.instanceId
    ),
    true
  );
});

test("a forged defense choice cannot select an unapproved card identity", () => {
  const { state, attacker, defender } = createAttackScenario();
  const firstDefense = addFixtureDefenseCardToHand(
    state,
    defender,
    "discardSelf"
  );
  const secondDefense = addFixtureDefenseCardToHand(
    state,
    defender,
    "discardSelf"
  );
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId === "attack_damage") {
      return choices.find((choice) => choice.choiceId === defender.playerId);
    }
    if (effectId === "avoid_attack") {
      const legitimate = choices.find(
        (choice) => choice.choiceId === secondDefense.instanceId
      );
      if (legitimate?.choiceKind !== "defense") {
        return undefined;
      }
      return {
        ...legitimate,
        card: { ...secondDefense },
      };
    }
    return undefined;
  };
  const lifeBefore = defender.life.current;

  const result = executeEffect(
    state,
    attacker,
    {
      effectId: "attack_damage",
      amount: 2,
      targetSelector: "chosenFoe",
    },
    attackSource(attacker)
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(defender.life.current, lifeBefore - 2);
  assert.equal(defender.hand.includes(firstDefense), true);
  assert.equal(defender.hand.includes(secondDefense), true);
  assert.equal(defender.discard.includes(firstDefense), false);
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseChoiceSelected"),
    false
  );
});

function createAttackScenario(): {
  state: GameState;
  attacker: PlayerState;
  defender: PlayerState;
} {
  const state = initializeGame({ rootDir, seed: 13701 });
  const attacker = state.players[0];
  const defender = state.players[1];
  assert.ok(attacker);
  assert.ok(defender);
  state.activePlayerId = attacker.playerId;
  attacker.hand = [];
  defender.hand = [];
  defender.discard = [];
  attacker.wizardProperties = [];
  defender.wizardProperties = [];
  defender.life.current = 20;
  return { state, attacker, defender };
}

function attackSource(player: PlayerState): EffectSourceContext {
  return {
    sourceType: "card",
    runtimeMode: "fixture",
    playerId: player.playerId,
    cardInstanceId: "fixture-defense-choice-attack",
    definitionId: "fixture-defense-choice-attack",
  };
}
