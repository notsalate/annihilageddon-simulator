import assert from "node:assert/strict";
import test from "node:test";

import { runMarketFlow } from "../src/index.js";
import {
  createGameScenario,
  givenRuntimeCard,
  play,
} from "./helpers/game-scenario.js";
import { chooseEffect } from "./helpers/game-scenario.js";

const rootDir = process.cwd();

function resolveMayhemThroughMarket(
  scenario: ReturnType<typeof createGameScenario>,
  source: ReturnType<typeof givenRuntimeCard>,
  deck: "mainDeck" | "legendDeck"
) {
  const sourceIndex = scenario.activePlayer.hand.indexOf(source);
  assert.ok(sourceIndex >= 0);
  scenario.activePlayer.hand.splice(sourceIndex, 1);
  source.ownerId = "common";
  const sourceDeck = scenario.state.common[deck];
  sourceDeck.splice(0, sourceDeck.length, source);
  const market =
    deck === "mainDeck"
      ? scenario.state.common.market
      : scenario.state.common.legendMarket;
  market.splice(0);
  return runMarketFlow(scenario.state, { mode: "turn" });
}

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

test("card movement: main_067 destroys one card clockwise and charges Dingler life", () => {
  const scenario = createGameScenario({
    rootDir,
    seed: 282067,
    playerCount: 3,
  });
  const players = [scenario.activePlayer, ...scenario.foes];
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_067",
  });
  const cards = players.map((player, index) =>
    givenRuntimeCard(scenario, {
      player,
      zone: "discard",
      instanceId: `fixture-282067-target-${index}`,
      effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
    })
  );
  scenario.activePlayer.statuses.push({
    instanceId: `fixture-dingler-${scenario.activePlayer.playerId}`,
    statusId: "dingler",
    ownerId: scenario.activePlayer.playerId,
    effects: [],
  });
  scenario.activePlayer.life.current = 4;
  const choiceOrder: string[] = [];
  chooseEffect(scenario, (request) => {
    if (request.effectId !== "mayhem_each_player_optional_destroy_own_card") {
      return undefined;
    }
    choiceOrder.push(request.player.playerId);
    const target = cards.find(
      (card) => card.ownerId === request.player.playerId
    );
    return target === undefined
      ? { choiceId: "decline" }
      : { choiceId: `destroy_${target.instanceId}` };
  });

  assert.equal(
    resolveMayhemThroughMarket(scenario, source, "mainDeck").ok,
    true
  );
  assert.deepEqual(
    choiceOrder,
    scenario.state.players
      .slice(
        scenario.state.players.findIndex(
          (player) => player.playerId === scenario.state.activePlayerId
        )
      )
      .concat(
        scenario.state.players.slice(
          0,
          scenario.state.players.findIndex(
            (player) => player.playerId === scenario.state.activePlayerId
          )
        )
      )
      .map((player) => player.playerId)
  );
  assert.equal(scenario.activePlayer.life.current, 1);
  assert.ok(
    cards.every((card) => scenario.state.common.destroyedPile.includes(card))
  );
  assert.deepEqual(
    scenario.state.eventLog
      .filter(
        (event) =>
          event.type === "effectCostPaid" &&
          event.effectId === "mayhem_each_player_optional_destroy_own_card"
      )
      .map((event) => ({ playerId: event.playerId, amount: event.amount })),
    [{ playerId: scenario.activePlayer.playerId, amount: 3 }]
  );

  const unaffordable = createGameScenario({ rootDir, seed: 282068 });
  const unaffordableSource = givenRuntimeCard(unaffordable, {
    definitionId: "esw2_dbg__main_067",
  });
  const retained = givenRuntimeCard(unaffordable, {
    zone: "discard",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  unaffordable.activePlayer.statuses.push({
    instanceId: `fixture-dingler-${unaffordable.activePlayer.playerId}`,
    statusId: "dingler",
    ownerId: unaffordable.activePlayer.playerId,
    effects: [],
  });
  unaffordable.activePlayer.life.current = 3;
  chooseEffect(unaffordable, (request) =>
    request.effectId === "mayhem_each_player_optional_destroy_own_card"
      ? { choiceId: `destroy_${retained.instanceId}` }
      : undefined
  );

  assert.equal(
    resolveMayhemThroughMarket(unaffordable, unaffordableSource, "mainDeck").ok,
    true
  );
  assert.equal(unaffordable.activePlayer.discard.includes(retained), true);
  assert.equal(unaffordable.activePlayer.life.current, 3);
});

test("card movement: main_076 charges floor-half chips, including zero and one", () => {
  const scenario = createGameScenario({
    rootDir,
    seed: 282076,
    playerCount: 3,
  });
  const players = [scenario.activePlayer, ...scenario.foes];
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_076",
  });
  const cards = players.map((player, index) =>
    givenRuntimeCard(scenario, {
      player,
      zone: "discard",
      instanceId: `fixture-282076-target-${index}`,
      effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
    })
  );
  players.forEach((player, index) => {
    player.chips = [0, 1, 3][index] ?? 0;
  });
  chooseEffect(scenario, (request) => {
    if (
      request.effectId !==
      "mayhem_each_player_optional_destroy_own_card_for_half_chips"
    ) {
      return undefined;
    }
    const target = cards.find(
      (card) => card.ownerId === request.player.playerId
    );
    return target === undefined
      ? { choiceId: "decline" }
      : { choiceId: `destroy_${target.instanceId}` };
  });

  assert.equal(
    resolveMayhemThroughMarket(scenario, source, "mainDeck").ok,
    true
  );
  assert.deepEqual(
    players.map((player) => player.chips),
    [0, 1, 2]
  );
  assert.ok(
    cards.every((card) => scenario.state.common.destroyedPile.includes(card))
  );
  assert.equal(
    scenario.state.eventLog.filter(
      (event) =>
        event.type === "effectCostPaid" &&
        event.effectId ===
          "mayhem_each_player_optional_destroy_own_card_for_half_chips"
    ).length,
    1
  );
});

test("card movement: mega_007 gives Dingler one choice and normal wizards two zone choices", () => {
  const scenario = createGameScenario({
    rootDir,
    seed: 282007,
    playerCount: 2,
  });
  const foe = scenario.foes[0];
  assert.ok(foe);
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__mega_mayhem_007",
  });
  const activeHand = givenRuntimeCard(scenario, {
    zone: "hand",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  const activeDiscard = givenRuntimeCard(scenario, {
    zone: "discard",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  const foeHand = givenRuntimeCard(scenario, {
    player: foe,
    zone: "hand",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  const foeDiscard = givenRuntimeCard(scenario, {
    player: foe,
    zone: "discard",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  scenario.activePlayer.statuses.push({
    instanceId: `fixture-dingler-${scenario.activePlayer.playerId}`,
    statusId: "dingler",
    ownerId: scenario.activePlayer.playerId,
    effects: [],
  });
  const requests = new Map<string, number>();
  chooseEffect(scenario, (request) => {
    if (
      request.effectId !== "mega_mayhem_each_player_optional_destroy_own_cards"
    ) {
      return undefined;
    }
    const requestNumber = requests.get(request.player.playerId) ?? 0;
    requests.set(request.player.playerId, requestNumber + 1);
    const target =
      request.player.playerId === scenario.activePlayer.playerId
        ? activeHand
        : requestNumber === 0
          ? foeHand
          : foeDiscard;
    return { choiceId: `destroy_${target.instanceId}` };
  });

  assert.equal(
    resolveMayhemThroughMarket(scenario, source, "legendDeck").ok,
    true
  );
  assert.equal(scenario.state.common.destroyedPile.includes(activeHand), true);
  assert.equal(scenario.activePlayer.discard.includes(activeDiscard), true);
  assert.equal(scenario.state.common.destroyedPile.includes(foeHand), true);
  assert.equal(scenario.state.common.destroyedPile.includes(foeDiscard), true);
  assert.deepEqual(
    [...requests.entries()],
    [
      [scenario.activePlayer.playerId, 1],
      [foe.playerId, 2],
    ]
  );
});

test("card movement: main_001 keeps the revealed card or adds its effective cost", () => {
  const powerScenario = createGameScenario({ rootDir, seed: 283001 });
  powerScenario.state.turn.power = 0;
  powerScenario.activePlayer.deck.splice(0);
  powerScenario.activePlayer.discard.splice(0);
  const powerSource = givenRuntimeCard(powerScenario, {
    definitionId: "esw2_dbg__main_001",
  });
  const powerTarget = givenRuntimeCard(powerScenario, {
    zone: "deck",
    cost: 4,
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  let powerChoiceRequests = 0;
  chooseEffect(powerScenario, (request) => {
    if (request.effectId !== "reveal_top_card_choose_destroy_or_power") {
      return undefined;
    }
    powerChoiceRequests += 1;
    return { choiceId: "decline" };
  });

  assert.deepEqual(play(powerScenario, powerSource), { ok: true });
  assert.equal(powerScenario.state.turn.power, 4);
  assert.equal(powerScenario.activePlayer.deck[0], powerTarget);
  assert.equal(powerChoiceRequests, 1);

  const destroyScenario = createGameScenario({ rootDir, seed: 283002 });
  destroyScenario.state.turn.power = 0;
  destroyScenario.activePlayer.deck.splice(0);
  destroyScenario.activePlayer.discard.splice(0);
  const destroySource = givenRuntimeCard(destroyScenario, {
    definitionId: "esw2_dbg__main_001",
  });
  const destroyTarget = givenRuntimeCard(destroyScenario, {
    zone: "deck",
    cost: 2,
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  chooseEffect(destroyScenario, (request) =>
    request.effectId === "reveal_top_card_choose_destroy_or_power"
      ? { choiceId: `destroy_${destroyTarget.instanceId}` }
      : undefined
  );

  assert.deepEqual(play(destroyScenario, destroySource), { ok: true });
  assert.equal(destroyScenario.state.turn.power, 0);
  assert.equal(
    destroyScenario.state.common.destroyedPile.includes(destroyTarget),
    true
  );
  assert.equal(
    destroyScenario.activePlayer.deck.includes(destroyTarget),
    false
  );

  const emptyScenario = createGameScenario({ rootDir, seed: 283003 });
  emptyScenario.state.turn.power = 0;
  emptyScenario.activePlayer.deck.splice(0);
  emptyScenario.activePlayer.discard.splice(0);
  const emptySource = givenRuntimeCard(emptyScenario, {
    definitionId: "esw2_dbg__main_001",
  });
  let emptyChoiceRequests = 0;
  chooseEffect(emptyScenario, (request) => {
    if (request.effectId === "reveal_top_card_choose_destroy_or_power") {
      emptyChoiceRequests += 1;
    }
    return undefined;
  });

  assert.deepEqual(play(emptyScenario, emptySource), { ok: true });
  assert.equal(emptyScenario.state.turn.power, 0);
  assert.equal(emptyChoiceRequests, 0);
});

test("card movement: main_007 attacks for the revealed cost or destroys it", () => {
  const attackScenario = createGameScenario({ rootDir, seed: 283007 });
  const attackFoe = attackScenario.foes[0];
  assert.ok(attackFoe);
  attackScenario.state.turn.power = 0;
  attackScenario.activePlayer.deck.splice(0);
  attackScenario.activePlayer.discard.splice(0);
  attackFoe.life.current = 3;
  const attackSource = givenRuntimeCard(attackScenario, {
    definitionId: "esw2_dbg__main_007",
  });
  const attackTarget = givenRuntimeCard(attackScenario, {
    zone: "deck",
    cost: 3,
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  chooseEffect(attackScenario, (request) => {
    if (
      request.effectId !== "reveal_top_card_choose_destroy_or_attack_equal_cost"
    ) {
      return undefined;
    }
    return request.choices.some(
      (choice) => choice.choiceId === attackFoe.playerId
    )
      ? { choiceId: attackFoe.playerId }
      : { choiceId: "decline" };
  });

  const attackResult = play(attackScenario, attackSource);
  assert.equal(attackResult.ok, true);
  assert.equal(attackScenario.state.turn.power, 1);
  assert.equal(
    attackScenario.state.eventLog.some(
      (event) =>
        event.type === "playerDied" && event.playerId === attackFoe.playerId
    ),
    true
  );
  assert.equal(attackScenario.activePlayer.deck[0], attackTarget);

  const differentCostScenario = createGameScenario({
    rootDir,
    seed: 283008,
  });
  const differentCostFoe = differentCostScenario.foes[0];
  assert.ok(differentCostFoe);
  differentCostFoe.life.current = 10;
  differentCostScenario.activePlayer.deck.splice(0);
  differentCostScenario.activePlayer.discard.splice(0);
  const differentCostSource = givenRuntimeCard(differentCostScenario, {
    definitionId: "esw2_dbg__main_007",
  });
  givenRuntimeCard(differentCostScenario, {
    zone: "deck",
    cost: 5,
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  chooseEffect(differentCostScenario, (request) => {
    if (
      request.effectId !== "reveal_top_card_choose_destroy_or_attack_equal_cost"
    ) {
      return undefined;
    }
    return request.choices.some(
      (choice) => choice.choiceId === differentCostFoe.playerId
    )
      ? { choiceId: differentCostFoe.playerId }
      : { choiceId: "decline" };
  });

  assert.equal(play(differentCostScenario, differentCostSource).ok, true);
  assert.equal(differentCostFoe.life.current, 5);

  const destroyScenario = createGameScenario({ rootDir, seed: 283009 });
  const destroyFoe = destroyScenario.foes[0];
  assert.ok(destroyFoe);
  destroyFoe.life.current = 10;
  destroyScenario.activePlayer.deck.splice(0);
  destroyScenario.activePlayer.discard.splice(0);
  const destroySource = givenRuntimeCard(destroyScenario, {
    definitionId: "esw2_dbg__main_007",
  });
  const destroyTarget = givenRuntimeCard(destroyScenario, {
    zone: "deck",
    cost: 5,
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  chooseEffect(destroyScenario, (request) =>
    request.effectId === "reveal_top_card_choose_destroy_or_attack_equal_cost"
      ? { choiceId: `destroy_${destroyTarget.instanceId}` }
      : undefined
  );

  assert.equal(play(destroyScenario, destroySource).ok, true);
  assert.equal(destroyScenario.state.turn.power, 1);
  assert.equal(destroyFoe.life.current, 10);
  assert.equal(
    destroyScenario.state.common.destroyedPile.includes(destroyTarget),
    true
  );

  const emptyScenario = createGameScenario({ rootDir, seed: 283010 });
  emptyScenario.activePlayer.deck.splice(0);
  emptyScenario.activePlayer.discard.splice(0);
  const emptySource = givenRuntimeCard(emptyScenario, {
    definitionId: "esw2_dbg__main_007",
  });
  let emptyTargetChoices = 0;
  chooseEffect(emptyScenario, (request) => {
    if (
      request.effectId === "reveal_top_card_choose_destroy_or_attack_equal_cost"
    ) {
      emptyTargetChoices += 1;
    }
    return undefined;
  });

  assert.equal(play(emptyScenario, emptySource).ok, true);
  assert.equal(emptyScenario.state.turn.power, 1);
  assert.equal(emptyTargetChoices, 0);
});
