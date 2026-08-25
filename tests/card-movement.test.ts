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

test("card movement: legend_020 destroys a chosen prefix of discard cards without combinations", () => {
  const scenario = createGameScenario({ rootDir, seed: 281020 });
  scenario.state.turn.power = 0;
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_020",
  });
  const first = givenRuntimeCard(scenario, {
    zone: "discard",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  const second = givenRuntimeCard(scenario, {
    zone: "discard",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  const retained = givenRuntimeCard(scenario, {
    zone: "discard",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  const selections = [first, second];
  chooseEffect(scenario, (request) => {
    if (request.effectId !== "destroy_own_cards") return undefined;
    const selected = selections.shift();
    return selected === undefined
      ? { choiceId: "decline" }
      : { choiceId: `destroy_${selected.instanceId}` };
  });

  assert.deepEqual(play(scenario, source), { ok: true });
  assert.equal(scenario.state.common.destroyedPile.includes(first), true);
  assert.equal(scenario.state.common.destroyedPile.includes(second), true);
  assert.equal(scenario.activePlayer.discard.includes(retained), true);
  assert.equal(scenario.state.turn.power, 6);
});

test("card movement: main_037 attacks every foe even when discard destruction is declined", () => {
  const scenario = createGameScenario({ rootDir, seed: 281037 });
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_037",
  });
  givenRuntimeCard(scenario, {
    zone: "discard",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  for (const foe of scenario.foes) foe.life.current = 10;
  chooseEffect(scenario, (request) =>
    request.effectId === "destroy_own_cards"
      ? { choiceId: "decline" }
      : undefined
  );

  assert.deepEqual(play(scenario, source), { ok: true });
  assert.ok(scenario.foes.every((foe) => foe.life.current === 5));
});

test("card movement: main_057 pays one chip only with a valid hand or discard destruction", () => {
  const scenario = createGameScenario({ rootDir, seed: 281057 });
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_057",
  });
  const target = givenRuntimeCard(scenario, {
    zone: "discard",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  scenario.activePlayer.chips = 1;
  chooseEffect(scenario, (request) =>
    request.effectId === "optional_spend_chip_destroy_own_cards"
      ? { choiceId: `destroy_${target.instanceId}` }
      : undefined
  );

  assert.deepEqual(play(scenario, source), { ok: true });
  assert.equal(scenario.activePlayer.chips, 0);
  assert.equal(scenario.state.common.destroyedPile.includes(target), true);

  const noChipScenario = createGameScenario({ rootDir, seed: 281058 });
  const noChipSource = givenRuntimeCard(noChipScenario, {
    definitionId: "esw2_dbg__main_057",
  });
  const retained = givenRuntimeCard(noChipScenario, {
    zone: "discard",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  noChipScenario.activePlayer.chips = 0;
  assert.deepEqual(play(noChipScenario, noChipSource), { ok: true });
  assert.equal(noChipScenario.activePlayer.discard.includes(retained), true);
});
