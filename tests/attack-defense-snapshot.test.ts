import assert from "node:assert/strict";
import test from "node:test";

import { initializeGame, type GameState, type PlayerState } from "../src/index.js";
import {
  resolveDefenseWindow,
  type AttackDefenseServices,
} from "../src/engine/attack-defense.js";
import { createAttackAmountState } from "../src/engine/attack-resolution.js";
import {
  createAttackDefenseUsage,
  type DefenseAttackContext,
  type EffectSourceContext,
} from "../src/engine/effect-runtime-registry.js";
import { addFixtureDefenseCardToHand } from "./helpers/defense-fixtures.js";

const rootDir = process.cwd();

test("declining defense avoids rollback snapshot and preserves observable state and RNG", () => {
  const state = createScenario(47500);
  const control = createScenario(47500);
  const attacker = mustGetPlayer(state, 0);
  const defender = mustGetPlayer(state, 1);

  const originalFork = state.rng.fork.bind(state.rng);
  let forkCalls = 0;
  state.rng.fork = () => {
    forkCalls += 1;
    return originalFork();
  };
  let defenseEffectCalls = 0;
  let redirectCalls = 0;
  const services: AttackDefenseServices = {
    chooseEffectChoice(_state, _player, _source, _effectId, choices) {
      return choices.find((choice) => choice.choiceId === "decline");
    },
    executeDefenseEffects() {
      defenseEffectCalls += 1;
      return { ok: true };
    },
    resolveRedirectedAttack() {
      redirectCalls += 1;
      throw new Error("decline must not redirect");
    },
  };

  const result = resolveDefenseWindow(
    state,
    defender,
    redirectableAttack(attacker),
    services
  );

  assert.deepEqual(result, { ok: true, avoided: false });
  assert.equal(forkCalls, 0);
  assert.equal(defenseEffectCalls, 0);
  assert.equal(redirectCalls, 0);
  assert.equal(state.activePlayerId, control.activePlayerId);
  assert.deepEqual(state.turn, control.turn);
  assert.deepEqual(state.players, control.players);
  assert.deepEqual(state.common, control.common);
  assert.deepEqual(state.eventLog, control.eventLog);
  assert.deepEqual(state.cardDefinitions, control.cardDefinitions);
  assert.equal(state.rng.next(), control.rng.next());
});

function createScenario(seed: number): GameState {
  const state = initializeGame({ rootDir, seed });
  const attacker = mustGetPlayer(state, 0);
  const defender = mustGetPlayer(state, 1);
  state.activePlayerId = attacker.playerId;
  attacker.hand = [];
  defender.hand = [];
  defender.discard = [];
  attacker.wizardProperties = [];
  defender.wizardProperties = [];
  addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    costs: [{ costId: "spend_chips", amount: 1 }],
  });
  defender.chips = 3;
  return state;
}

function redirectableAttack(attacker: PlayerState): DefenseAttackContext {
  const source = fixtureSource(attacker);
  return {
    kind: "redirectable",
    attackingPlayer: attacker,
    amountComponents: createAttackAmountState(2),
    effectId: "attack_damage",
    source,
    originalSource: source,
    defenseUsage: createAttackDefenseUsage(),
  };
}

function fixtureSource(player: PlayerState): EffectSourceContext {
  return {
    sourceType: "card",
    runtimeMode: "fixture",
    playerId: player.playerId,
    cardInstanceId: "fixture-decline-snapshot-source",
    definitionId: "fixture-decline-snapshot-source",
  };
}

function mustGetPlayer(state: GameState, index: number): PlayerState {
  const player = state.players[index];
  assert.ok(player);
  return player;
}
