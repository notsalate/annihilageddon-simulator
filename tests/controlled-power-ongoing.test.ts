import assert from "node:assert/strict";
import test from "node:test";

import {
  initializeGame,
  type CardDefinition,
  type CardInstance,
  type GameState,
  type PlayerState,
} from "../src/index.js";
import { grantTemporaryControl } from "../src/engine/control-ledger.js";
import { reconcileActivePlayerControlledPower } from "../src/engine/controlled-power.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../src/domain/types.js";

const rootDir = process.cwd();

test("passive controlled power uses only controlled ongoing cards", () => {
  assert.equal(reconcilePowerScenario(false), 0);
  assert.equal(reconcilePowerScenario(true), 3);
});

function reconcilePowerScenario(isOngoing: boolean): number {
  const state = initializeGame({ rootDir, seed: isOngoing ? 47301 : 47300 });
  const controller = mustGetPlayer(state, 0);
  state.activePlayerId = controller.playerId;
  state.turn.power = 0;
  state.turn.controlledPowerBonus = 0;
  state.turn.temporaryCardControls = [];
  controller.permanents = [];
  controller.playedThisTurn = [];

  const cardId = `fixture-controlled-power-${String(isOngoing)}`;
  const definition: CardDefinition = {
    schemaVersion: 1,
    cardId,
    source: { image: `assets/cards/fixtures/${cardId}.png` },
    visible: {
      nameRu: `Fixture controlled power ${String(isOngoing)}`,
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
      cost: 0,
      victoryPoints: 0,
      isOngoing,
      marketChipMarker: false,
      effects: [
        {
          effectId: "ongoing_add_power",
          timing: "whileControlled",
          amount: 3,
        },
      ],
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
    ownerId: controller.playerId,
    marketChips: 0,
  };
  if (isOngoing) {
    controller.permanents.push(card);
  } else {
    controller.playedThisTurn.push(card);
    grantTemporaryControl(state, card.instanceId, controller.playerId);
  }

  reconcileActivePlayerControlledPower(state);
  return state.turn.power;
}

function mustGetPlayer(state: GameState, index: number): PlayerState {
  const player = state.players[index];
  assert.ok(player);
  return player;
}
