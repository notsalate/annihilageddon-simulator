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
import { dispatchControlledCardEffects } from "../src/engine/trigger-dispatch.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../src/domain/types.js";

const rootDir = process.cwd();

test("controlled trigger dispatch preserves Control Ledger order and card source attribution", () => {
  const state = initializeGame({ rootDir, seed: 23001 });
  const controller = mustGetPlayer(state, 0);
  const owner = mustGetPlayer(state, 1);
  controller.permanents = [];

  const permanent = addControlledTriggerCard(
    state,
    controller,
    controller,
    "permanent",
    controller.permanents,
    1
  );
  const temporary = addControlledTriggerCard(
    state,
    controller,
    owner,
    "temporary",
    owner.discard,
    2
  );
  grantTemporaryControl(state, temporary.instanceId, controller.playerId);

  const calls: Array<{
    amount: number;
    sourceType: string;
    playerId: string;
    cardInstanceId: string;
    definitionId: string;
    runtimeMode: string;
  }> = [];
  const result = dispatchControlledCardEffects({
    state,
    player: controller,
    timing: "onPlayCard",
    predicate: (effect) => effect.effectId === "add_power",
    execute(effect, source) {
      calls.push({
        amount: typeof effect.amount === "number" ? effect.amount : -1,
        sourceType: source.sourceType,
        playerId: source.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        runtimeMode: source.runtimeMode,
      });
      return { ok: true };
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [
    {
      amount: 1,
      sourceType: "card",
      playerId: controller.playerId,
      cardInstanceId: permanent.instanceId,
      definitionId: permanent.definitionId,
      runtimeMode: "fixture",
    },
    {
      amount: 2,
      sourceType: "card",
      playerId: controller.playerId,
      cardInstanceId: temporary.instanceId,
      definitionId: temporary.definitionId,
      runtimeMode: "fixture",
    },
  ]);
});

test("controlled trigger dispatch stops after the first execution error", () => {
  const state = initializeGame({ rootDir, seed: 23002 });
  const controller = mustGetPlayer(state, 0);
  controller.permanents = [];
  addControlledTriggerCard(
    state,
    controller,
    controller,
    "first-error",
    controller.permanents,
    1
  );
  addControlledTriggerCard(
    state,
    controller,
    controller,
    "second-skipped",
    controller.permanents,
    2
  );

  const executedDefinitionIds: string[] = [];
  const result = dispatchControlledCardEffects({
    state,
    player: controller,
    timing: "onPlayCard",
    predicate: (effect) => effect.effectId === "add_power",
    execute(_effect, source) {
      executedDefinitionIds.push(source.definitionId);
      return { ok: false, error: "fixture trigger failure" };
    },
  });

  assert.deepEqual(result, { ok: false, error: "fixture trigger failure" });
  assert.deepEqual(executedDefinitionIds, [
    "fixture-trigger-dispatch-first-error",
  ]);
});

function addControlledTriggerCard(
  state: GameState,
  controller: PlayerState,
  owner: PlayerState,
  suffix: string,
  zone: CardInstance[],
  amount: number
): CardInstance {
  const cardId = `fixture-trigger-dispatch-${suffix}`;
  const definition: CardDefinition = {
    schemaVersion: 1,
    cardId,
    source: { image: `assets/cards/fixtures/${cardId}.png` },
    visible: {
      nameRu: `Fixture trigger ${suffix}`,
      cost: 0,
      victoryPoints: 0,
      typeRu: null,
      cardKind: "normal",
      cardTypes: [],
      markers: ["ongoing"],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind: "normal",
      cardTypes: [],
      cost: 0,
      victoryPoints: 0,
      isOngoing: true,
      marketChipMarker: false,
      effects: [{ effectId: "add_power", timing: "onPlayCard", amount }],
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
    ownerId: owner.playerId,
    marketChips: 0,
  };
  zone.push(card);
  if (owner.playerId !== controller.playerId) {
    assert.equal(card.ownerId, owner.playerId);
  }
  return card;
}

function mustGetPlayer(state: GameState, index: number): PlayerState {
  const player = state.players[index];
  assert.ok(player);
  return player;
}
