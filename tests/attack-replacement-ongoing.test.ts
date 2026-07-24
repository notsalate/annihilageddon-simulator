import assert from "node:assert/strict";
import test from "node:test";

import {
  initializeGame,
  type CardDefinition,
  type CardInstance,
  type GameState,
  type PlayerState,
  type RuntimeEffect,
} from "../src/index.js";
import {
  createAttackAmountState,
  resolveAttackAmount,
} from "../src/engine/attack-resolution.js";
import { grantTemporaryControl } from "../src/engine/control-ledger.js";
import { executeEffect } from "../src/engine/effect-runtime.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../src/domain/types.js";

const rootDir = process.cwd();

test("attack amount replacements use only controlled ongoing cards", () => {
  assert.equal(resolveDoubleAttackScenario(false), 2);
  assert.equal(resolveDoubleAttackScenario(true), 4);
});

test("owned Wand attack profile modifiers use only controlled ongoing cards", () => {
  assert.equal(resolveOwnedWandAttackScenario(false), 2);
  assert.equal(resolveOwnedWandAttackScenario(true), 4);
});

function resolveDoubleAttackScenario(isOngoing: boolean): number {
  const state = initializeGame({ rootDir, seed: isOngoing ? 47201 : 47200 });
  const attacker = mustGetPlayer(state, 0);
  const target = mustGetPlayer(state, 1);
  attacker.permanents = [];
  attacker.playedThisTurn = [];
  state.turn.temporaryCardControls = [];

  const modifier = registerCard(
    state,
    attacker,
    isOngoing,
    `double-${String(isOngoing)}`,
    [
      {
        effectId: "double_owned_attack_damage",
        timing: "attackReplacement",
      },
    ]
  );
  if (!isOngoing) {
    grantTemporaryControl(state, modifier.instanceId, attacker.playerId);
  }

  return resolveAttackAmount(
    state,
    attacker,
    target,
    createAttackAmountState(2)
  ).total;
}

function resolveOwnedWandAttackScenario(isOngoing: boolean): number {
  const state = initializeGame({ rootDir, seed: isOngoing ? 47203 : 47202 });
  state.runtimeMode = "fixture";
  const attacker = mustGetPlayer(state, 0);
  const target = mustGetPlayer(state, 1);
  state.activePlayerId = attacker.playerId;
  state.turn.temporaryCardControls = [];
  attacker.permanents = [];
  attacker.playedThisTurn = [];
  attacker.wizardProperties = [];
  target.hand = [];
  target.wizardProperties = [];
  target.life.current = 20;

  const sourceCard = registerCard(
    state,
    attacker,
    false,
    `wand-source-${String(isOngoing)}`,
    [],
    ["wandAttackCard"],
    attacker.hand
  );
  const modifier = registerCard(
    state,
    attacker,
    isOngoing,
    `wand-modifier-${String(isOngoing)}`,
    [
      {
        effectId: "modify_owned_wand_attack_damage",
        timing: "attackReplacement",
        cardTags: ["wandAttackCard"],
        amount: 2,
      },
    ]
  );
  if (!isOngoing) {
    grantTemporaryControl(state, modifier.instanceId, attacker.playerId);
  }
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? choices.find((choice) => choice.choiceId === target.playerId)
      : undefined;

  const result = executeEffect(
    state,
    attacker,
    {
      effectId: "attack_damage",
      amount: 2,
      targetSelector: "chosenFoe",
    },
    {
      sourceType: "card",
      runtimeMode: "fixture",
      playerId: attacker.playerId,
      cardInstanceId: sourceCard.instanceId,
      definitionId: sourceCard.definitionId,
    }
  );

  assert.deepEqual(result, { ok: true });
  return 20 - target.life.current;
}

function registerCard(
  state: GameState,
  player: PlayerState,
  isOngoing: boolean,
  suffix: string,
  effects: RuntimeEffect[],
  tags: string[] = [],
  zone: CardInstance[] = isOngoing
    ? player.permanents
    : player.playedThisTurn
): CardInstance {
  const cardId = `fixture-attack-ongoing-${suffix}`;
  const definition: CardDefinition = {
    schemaVersion: 1,
    cardId,
    source: { image: `assets/cards/fixtures/${cardId}.png` },
    visible: {
      nameRu: `Fixture ${suffix}`,
      cost: 0,
      victoryPoints: 0,
      typeRu: null,
      cardKind: "normal",
      cardTypes: [],
      markers: isOngoing ? ["ongoing"] : [],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind: "normal",
      cardTypes: [],
      tags,
      cost: 0,
      victoryPoints: 0,
      isOngoing,
      marketChipMarker: false,
      effects,
      unsupportedMechanics: [],
    },
  };
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const card: CardInstance = {
    instanceId: markCardInstanceId(`${cardId}-instance`),
    definitionId: markCardDefinitionId(cardId),
    ownerId: player.playerId,
    marketChips: 0,
  };
  zone.push(card);
  return card;
}

function mustGetPlayer(state: GameState, index: number): PlayerState {
  const player = state.players[index];
  assert.ok(player);
  return player;
}
