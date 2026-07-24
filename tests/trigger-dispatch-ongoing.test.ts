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
import { grantTemporaryControl } from "../src/engine/control-ledger.js";
import {
  executeControlledCardOnPlayCardEffects,
  executeEffect,
} from "../src/engine/effect-runtime.js";
import type { EffectSourceContext } from "../src/engine/effect-runtime-registry.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../src/domain/types.js";

const rootDir = process.cwd();

test("onPlayCard executes only controlled ongoing card triggers", () => {
  assert.equal(runOnPlayCardScenario(false), 0);
  assert.equal(runOnPlayCardScenario(true), 1);
});

test("after-attack dispatch executes only controlled ongoing card triggers", () => {
  assert.equal(runAfterAttackScenario(false), 0);
  assert.equal(runAfterAttackScenario(true), 2);
});

function runOnPlayCardScenario(isOngoing: boolean): number {
  const state = initializeGame({ rootDir, seed: isOngoing ? 47101 : 47100 });
  state.runtimeMode = "fixture";
  const controller = mustGetPlayer(state, 0);
  controller.permanents = [];
  controller.playedThisTurn = [];
  state.turn.temporaryCardControls = [];
  state.turn.power = 0;

  const trigger = registerCard(
    state,
    controller,
    isOngoing,
    `on-play-trigger-${String(isOngoing)}`,
    [
      {
        effectId: "ongoing_add_power_when_playing_wand",
        timing: "onPlayCard",
        amount: 1,
        cardTags: ["wandCard"],
      },
    ]
  );
  if (!isOngoing) {
    grantTemporaryControl(state, trigger.instanceId, controller.playerId);
  }
  const playedWand = registerCard(
    state,
    controller,
    false,
    `played-wand-${String(isOngoing)}`,
    [],
    ["wandCard"]
  );

  const result = executeControlledCardOnPlayCardEffects(
    state,
    controller,
    playedWand
  );

  assert.deepEqual(result, { ok: true });
  return state.turn.power;
}

function runAfterAttackScenario(isOngoing: boolean): number {
  const state = initializeGame({ rootDir, seed: isOngoing ? 47103 : 47102 });
  state.runtimeMode = "fixture";
  const attacker = mustGetPlayer(state, 0);
  const target = mustGetPlayer(state, 1);
  state.activePlayerId = attacker.playerId;
  state.turn.power = 0;
  state.turn.controlledPowerBonus = 0;
  state.turn.damagingAttackPlayerIds = [];
  state.turn.temporaryCardControls = [];
  attacker.permanents = [];
  attacker.playedThisTurn = [];
  attacker.wizardProperties = [];
  target.hand = [];
  target.wizardProperties = [];
  target.life.current = 20;

  const trigger = registerCard(
    state,
    attacker,
    isOngoing,
    `after-attack-trigger-${String(isOngoing)}`,
    [
      {
        effectId: "ongoing_first_attack_damage_add_power",
        timing: "afterFirstAttackDamageEachTurn",
        amount: "totalDamageDealtByThatAttack",
      },
    ]
  );
  if (!isOngoing) {
    grantTemporaryControl(state, trigger.instanceId, attacker.playerId);
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
    fixtureSource(attacker, `after-attack-${String(isOngoing)}`)
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(target.life.current, 18);
  return state.turn.power;
}

function registerCard(
  state: GameState,
  player: PlayerState,
  isOngoing: boolean,
  suffix: string,
  effects: RuntimeEffect[],
  tags: string[] = []
): CardInstance {
  const cardId = `fixture-trigger-ongoing-${suffix}`;
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
  if (isOngoing) {
    player.permanents.push(card);
  } else {
    player.playedThisTurn.push(card);
  }
  return card;
}

function fixtureSource(
  player: PlayerState,
  suffix: string
): EffectSourceContext {
  return {
    sourceType: "card",
    runtimeMode: "fixture",
    playerId: player.playerId,
    cardInstanceId: `fixture-trigger-source-${suffix}`,
    definitionId: `fixture-trigger-source-${suffix}`,
  };
}

function mustGetPlayer(state: GameState, index: number): PlayerState {
  const player = state.players[index];
  assert.ok(player);
  return player;
}
