import assert from "node:assert/strict";
import test from "node:test";

import {
  createGameScenario,
  givenRuntimeCard,
  play,
} from "./helpers/game-scenario.js";
import { chooseEffect } from "./helpers/game-scenario.js";

const rootDir = process.cwd();

test("card movement: main_019 lets the active player and another wizard draw", () => {
  const scenario = createGameScenario({
    rootDir,
    seed: 280019,
    playerCount: 3,
  });
  const foe = scenario.foes[0];
  assert.ok(foe);
  scenario.state.turn.power = 100;
  scenario.activePlayer.deck.splice(0);
  scenario.activePlayer.discard.splice(0);
  foe.deck.splice(0);
  foe.discard.splice(0);
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_019",
  });
  const activeDraw = givenRuntimeCard(scenario, {
    player: scenario.activePlayer,
    zone: "deck",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  const foeDraw = givenRuntimeCard(scenario, {
    player: foe,
    zone: "deck",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  chooseEffect(scenario, (request) => {
    if (String(request.effectId) !== "draw_cards_for_self_and_chosen_foe") {
      return undefined;
    }
    return { choiceId: foe.playerId };
  });

  assert.deepEqual(play(scenario, source), { ok: true });
  assert.equal(scenario.activePlayer.hand.includes(activeDraw), true);
  assert.equal(foe.hand.includes(foeDraw), true);
});

test("card movement: main_058 resets the hand only when played first", () => {
  const scenario = createGameScenario({ rootDir, seed: 280058 });
  scenario.state.turn.power = 100;
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_058",
  });
  const retained = givenRuntimeCard(scenario, {
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  for (let index = 0; index < 4; index += 1) {
    givenRuntimeCard(scenario, {
      zone: "deck",
      effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
    });
  }
  chooseEffect(scenario, (request) =>
    request.effectId === "discard_hand_then_draw_cards"
      ? { choiceId: "apply" }
      : undefined
  );

  assert.deepEqual(play(scenario, source), { ok: true });
  assert.equal(scenario.activePlayer.hand.includes(retained), false);
  assert.equal(scenario.activePlayer.hand.length, 4);
});

test("card movement: familiar_008 discards itself and can return every Wand", () => {
  const scenario = createGameScenario({ rootDir, seed: 280008 });
  const foe = scenario.foes[0];
  assert.ok(foe);
  scenario.state.turn.power = 100;
  const familiar = givenRuntimeCard(scenario, {
    player: foe,
    definitionId: "esw2_dbg__familiar_008",
  });
  const wandA = givenRuntimeCard(scenario, {
    player: foe,
    zone: "discard",
    definitionId: "esw2_dbg__limp_wand",
  });
  const wandB = givenRuntimeCard(scenario, {
    player: foe,
    zone: "discard",
    definitionId: "esw2_dbg__limp_wand",
  });
  const attack = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 1,
        targetSelector: "chosenFoe",
      },
    ],
  });
  chooseEffect(scenario, (request) => {
    if (request.effectId === "avoid_attack") {
      return { choiceId: familiar.instanceId };
    }
    if (request.effectId === "return_discard_to_hand") {
      return { choiceId: "apply" };
    }
    return undefined;
  });

  assert.deepEqual(play(scenario, attack), { ok: true });
  assert.equal(foe.discard.includes(familiar), true);
  assert.equal(foe.hand.includes(wandA), true);
  assert.equal(foe.hand.includes(wandB), true);
});
