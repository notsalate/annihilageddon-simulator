import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  type GameState,
  type RuntimeEffect,
} from "../src/index.js";
import { calculateEndTurnDrawCount } from "../src/engine/effect-runtime.js";
import { dispatchControlledCardOperation } from "../src/engine/trigger-dispatch.js";

import {
  createGameScenario,
  givenRuntimeCard,
} from "./helpers/game-scenario.js";

const rootDir = process.cwd();

test("malformed ongoing refill is reported as a catalog error", () => {
  const scenario = createGameScenario({ rootDir, seed: 23010 });
  const controller = scenario.activePlayer;
  controller.permanents = [];
  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_hand_refill_bonus",
        timing: "endTurn",
        amount: "invalid",
      } as unknown as RuntimeEffect,
    ],
  });
  const turnBefore = structuredClone(scenario.state.turn);
  const eventCountBefore = scenario.state.eventLog.length;

  const result = dispatchControlledCardOperation(scenario.state, controller, {
    kind: "collectEndTurnDrawModifier",
    currentBaseDrawCount: 5,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /amount must be a positive integer/);
  assert.deepEqual(scenario.state.turn, turnBefore);
  assert.equal(scenario.state.eventLog.length, eventCountBefore);
});

test("end-turn dispatch stops on the first malformed modifier", () => {
  const scenario = createGameScenario({ rootDir, seed: 23011 });
  const controller = scenario.activePlayer;
  controller.permanents = [];
  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "increase_hand_limit_at_max_life",
        timing: "endTurn",
        amount: "invalid",
      } as unknown as RuntimeEffect,
    ],
  });
  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_hand_refill_bonus",
        timing: "endTurn",
        amount: 2,
      },
    ],
  });

  const result = dispatchControlledCardOperation(scenario.state, controller, {
    kind: "collectEndTurnDrawModifier",
    currentBaseDrawCount: 5,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /amount must be a positive integer/);
});

test("calculateEndTurnDrawCount propagates malformed controlled modifiers", () => {
  const scenario = createGameScenario({ rootDir, seed: 23012 });
  const controller = scenario.activePlayer;
  controller.permanents = [];
  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_hand_refill_bonus",
        timing: "endTurn",
        amount: "invalid",
      } as unknown as RuntimeEffect,
    ],
  });

  assert.throws(
    () => calculateEndTurnDrawCount(scenario.state, controller),
    /amount must be a positive integer/
  );
});

test("public endTurn action rejects malformed modifiers before any mutation", () => {
  const scenario = createGameScenario({ rootDir, seed: 23013 });
  const controller = scenario.activePlayer;
  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_hand_refill_bonus",
        timing: "endTurn",
        amount: "invalid",
      } as unknown as RuntimeEffect,
    ],
  });
  const before = snapshotEndTurnState(scenario.state);

  const result = applyAction(scenario.state, { type: "endTurn" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /amount must be a positive integer/);
  assert.deepEqual(snapshotEndTurnState(scenario.state), before);
});

function snapshotEndTurnState(state: GameState): object {
  const cardIds = (cards: readonly { instanceId: string }[]): string[] =>
    cards.map((card) => card.instanceId);
  const tokenIds = (tokens: readonly { instanceId: string }[]): string[] =>
    tokens.map((token) => token.instanceId);

  return {
    activePlayerId: state.activePlayerId,
    turn: structuredClone(state.turn),
    players: state.players.map((player) => ({
      playerId: player.playerId,
      chips: player.chips,
      life: { ...player.life },
      deck: cardIds(player.deck),
      hand: cardIds(player.hand),
      discard: cardIds(player.discard),
      playedThisTurn: cardIds(player.playedThisTurn),
      permanents: cardIds(player.permanents),
      unboughtFamiliar: player.unboughtFamiliar?.instanceId,
      deadWizardTokens: tokenIds(player.deadWizardTokens),
      wizardProperties: tokenIds(player.wizardProperties),
      statuses: structuredClone(player.statuses),
      trophyLikeObjects: structuredClone(player.trophyLikeObjects),
    })),
    common: {
      market: cardIds(state.common.market),
      legendMarket: cardIds(state.common.legendMarket),
      mainDeck: cardIds(state.common.mainDeck),
      legendDeck: cardIds(state.common.legendDeck),
      wildMagicStack: cardIds(state.common.wildMagicStack),
      limpWandStack: cardIds(state.common.limpWandStack),
      destroyedPile: cardIds(state.common.destroyedPile),
      destroyedMayhem: cardIds(state.common.destroyedMayhem),
      destroyedMegaMayhem: cardIds(state.common.destroyedMegaMayhem),
      deadWizardTokens: {
        status: state.common.deadWizardTokens.status,
        drawStack: tokenIds(state.common.deadWizardTokens.drawStack),
      },
    },
    eventLog: structuredClone(state.eventLog),
    nextRandomValue: state.rng.fork().nextInt(1_000_000),
  };
}
