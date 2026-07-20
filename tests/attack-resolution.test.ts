import assert from "node:assert/strict";
import test from "node:test";

import { initializeGame, type CardInstance } from "../src/index.js";
import {
  createAttackAmountState,
  resolveAttackAmount,
} from "../src/engine/attack-resolution.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
  markPlayerId,
} from "../src/domain/types.js";

const rootDir = process.cwd();

test("attack amount combines base and source-owner bonus", () => {
  const state = initializeGame({ rootDir, seed: 42001 });
  const attacker = mustGetPlayer(state, "player-1");
  const target = mustGetPlayer(state, "player-2");
  attacker.permanents = [];

  const resolved = resolveAttackAmount(
    state,
    attacker,
    target,
    createAttackAmountState(3, 2)
  );

  assert.equal(resolved.total, 5);
  assert.deepEqual(resolved.components, {
    unresolvedBaseAmount: 3,
    sourceOwnerModifierAmount: 2,
    currentAttackerTargetModifierAmount: 0,
  });
});

test("Chipsychosis Arena doubles the current attacker's amount against a foe", () => {
  const state = initializeGame({ rootDir, seed: 42002 });
  const attacker = mustGetPlayer(state, "player-1");
  const target = mustGetPlayer(state, "player-2");
  attacker.permanents.push(createArena(attacker.playerId));

  const resolved = resolveAttackAmount(
    state,
    attacker,
    target,
    createAttackAmountState(3, 2)
  );

  assert.equal(resolved.total, 10);
  assert.equal(resolved.components.currentAttackerTargetModifierAmount, 5);
});

test("Chipsychosis Arena does not double a self-targeted attack", () => {
  const state = initializeGame({ rootDir, seed: 42003 });
  const attacker = mustGetPlayer(state, "player-1");
  attacker.permanents.push(createArena(attacker.playerId));

  const resolved = resolveAttackAmount(
    state,
    attacker,
    attacker,
    createAttackAmountState(3, 2)
  );

  assert.equal(resolved.total, 5);
  assert.equal(resolved.components.currentAttackerTargetModifierAmount, 0);
});

test("redirect recalculates only the current-attacker modifier", () => {
  const state = initializeGame({ rootDir, seed: 42004 });
  const originalAttacker = mustGetPlayer(state, "player-1");
  const redirectingAttacker = mustGetPlayer(state, "player-2");
  redirectingAttacker.permanents.push(
    createArena(redirectingAttacker.playerId)
  );
  const carriedAmount = createAttackAmountState(2, 1);

  const resolved = resolveAttackAmount(
    state,
    redirectingAttacker,
    originalAttacker,
    carriedAmount
  );

  assert.equal(resolved.total, 6);
  assert.deepEqual(resolved.components, {
    unresolvedBaseAmount: 2,
    sourceOwnerModifierAmount: 1,
    currentAttackerTargetModifierAmount: 3,
  });
});

function mustGetPlayer(
  state: ReturnType<typeof initializeGame>,
  playerId: "player-1" | "player-2"
) {
  const player = state.players.find(
    (candidate) => candidate.playerId === markPlayerId(playerId)
  );
  assert.ok(player);
  return player;
}

function createArena(ownerId: CardInstance["ownerId"]): CardInstance {
  return {
    instanceId: markCardInstanceId(`fixture-arena-${ownerId}`),
    definitionId: markCardDefinitionId("esw2_dbg__legend_008"),
    ownerId,
    marketChips: 0,
  };
}
