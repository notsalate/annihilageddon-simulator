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
      return selectChoiceById(choices, defender.playerId);
    }
    if (effectId === "avoid_attack") {
      return selectChoiceById(choices, "decline");
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
      return selectChoiceById(choices, defender.playerId);
    }
    if (effectId === "avoid_attack") {
      return selectChoiceById(choices, secondDefense.instanceId);
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

test("a defense choice rejects a live-object strategy result", () => {
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
      return selectChoiceById(choices, defender.playerId);
    }
    if (effectId === "avoid_attack") {
      const legitimate = choices.find(
        (choice) => choice.choiceId === secondDefense.instanceId
      );
      if (legitimate?.choiceKind !== "defense") {
        return undefined;
      }
      (legitimate as unknown as { card: typeof secondDefense }).card = {
        ...secondDefense,
      };
      return legitimate;
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
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.effectId === "avoid_attack" &&
        event.choiceId === "decline"
    ),
    true
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "defenseChoiceSelected" &&
        event.cardInstanceId === secondDefense.instanceId
    ),
    false
  );
});

test("a defense choice accepts a reconstructed option by stable identifier", () => {
  const { state, attacker, defender } = createAttackScenario();
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf");
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId === "attack_damage") {
      return selectChoiceById(choices, defender.playerId);
    }
    if (effectId === "avoid_attack") {
      const legitimate = choices.find(
        (choice) => choice.choiceId === defense.instanceId
      );
      return legitimate === undefined
        ? undefined
        : { choiceId: legitimate.choiceId };
    }
    return undefined;
  };

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
  assert.equal(defender.life.current, 20);
  assert.equal(defender.hand.includes(defense), false);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "defenseChoiceSelected" &&
        event.cardInstanceId === defense.instanceId
    ),
    true
  );
});

test("a defense choice falls back to the first legal option when identifiers disagree", () => {
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
      return selectChoiceById(choices, defender.playerId);
    }
    if (effectId === "avoid_attack") {
      return { choiceId: "forged-defense-choice" };
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
    state.eventLog.some(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.effectId === "avoid_attack" &&
        event.choiceId === "decline"
    ),
    true
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseChoiceSelected"),
    false
  );
});

test("a defense choice ignores a strategy-mutated option card", () => {
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
      return selectChoiceById(choices, defender.playerId);
    }
    if (effectId === "avoid_attack") {
      const selected = choices.find(
        (choice) => choice.choiceId === secondDefense.instanceId
      );
      if (selected?.choiceKind !== "defense") {
        return undefined;
      }
      (selected as unknown as { card: typeof firstDefense }).card =
        firstDefense;
      return selected;
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
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.effectId === "avoid_attack" &&
        event.choiceId === "decline"
    ),
    true
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "defenseChoiceSelected" &&
        event.cardInstanceId === secondDefense.instanceId
    ),
    false
  );
});

function selectChoiceById(
  choices: readonly { readonly choiceId: string }[],
  choiceId: string
): { readonly choiceId: string } | undefined {
  const choice = choices.find((candidate) => candidate.choiceId === choiceId);
  return choice === undefined ? undefined : { choiceId: choice.choiceId };
}

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
