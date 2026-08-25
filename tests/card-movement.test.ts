import assert from "node:assert/strict";
import test from "node:test";

import { getControlledCards } from "../src/engine/control-ledger.js";
import {
  createGameScenario,
  givenRuntimeCard,
  givenTemporaryControl,
  play,
  chooseEffect,
  putOnCommonDeck,
  resolveMayhemThroughMarket,
} from "./helpers/game-scenario.js";
import { addFixtureDefenseCardToHand } from "./helpers/defense-fixtures.js";

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
    assert.equal(
      request.choices.some(
        (choice) => choice.choiceId === scenario.activePlayer.playerId
      ),
      false
    );
    return { choiceId: foe.playerId };
  });

  assert.deepEqual(play(scenario, source), { ok: true });
  assert.equal(scenario.activePlayer.hand.includes(activeDraw), true);
  assert.equal(foe.hand.includes(foeDraw), true);

  const reshuffleScenario = createGameScenario({
    rootDir,
    seed: 280020,
    playerCount: 2,
  });
  const reshuffleFoe = reshuffleScenario.foes[0];
  assert.ok(reshuffleFoe);
  reshuffleScenario.activePlayer.hand.splice(0);
  reshuffleFoe.hand.splice(0);
  reshuffleScenario.activePlayer.deck.splice(0);
  reshuffleFoe.deck.splice(0);
  reshuffleScenario.activePlayer.discard.splice(0);
  reshuffleFoe.discard.splice(0);
  const reshuffleSource = givenRuntimeCard(reshuffleScenario, {
    definitionId: "esw2_dbg__main_019",
  });
  const activeDiscardDraw = givenRuntimeCard(reshuffleScenario, {
    zone: "discard",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  const foeDiscardDraw = givenRuntimeCard(reshuffleScenario, {
    player: reshuffleFoe,
    zone: "discard",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  chooseEffect(reshuffleScenario, (request) =>
    request.effectId === "draw_cards_for_self_and_chosen_foe"
      ? { choiceId: reshuffleFoe.playerId }
      : undefined
  );

  assert.deepEqual(play(reshuffleScenario, reshuffleSource), { ok: true });
  assert.equal(
    reshuffleScenario.activePlayer.hand.includes(activeDiscardDraw),
    true
  );
  assert.equal(reshuffleFoe.hand.includes(foeDiscardDraw), true);

  const emptyScenario = createGameScenario({
    rootDir,
    seed: 280021,
    playerCount: 2,
  });
  const emptyFoe = emptyScenario.foes[0];
  assert.ok(emptyFoe);
  emptyScenario.activePlayer.hand.splice(0);
  emptyFoe.hand.splice(0);
  emptyScenario.activePlayer.deck.splice(0);
  emptyFoe.deck.splice(0);
  emptyScenario.activePlayer.discard.splice(0);
  emptyFoe.discard.splice(0);
  const emptySource = givenRuntimeCard(emptyScenario, {
    definitionId: "esw2_dbg__main_019",
  });
  chooseEffect(emptyScenario, (request) =>
    request.effectId === "draw_cards_for_self_and_chosen_foe"
      ? { choiceId: emptyFoe.playerId }
      : undefined
  );

  assert.deepEqual(play(emptyScenario, emptySource), { ok: true });
  assert.equal(emptyScenario.activePlayer.hand.length, 0);
  assert.equal(emptyFoe.hand.length, 0);
  assert.deepEqual(
    emptyScenario.state.eventLog
      .filter((event) => event.type === "effectDrawCardsApplied")
      .map((event) => event.amount),
    [0, 0]
  );
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

  const declinedScenario = createGameScenario({ rootDir, seed: 280057 });
  declinedScenario.state.turn.power = 100;
  const declinedSource = givenRuntimeCard(declinedScenario, {
    definitionId: "esw2_dbg__main_058",
  });
  const declinedRetained = givenRuntimeCard(declinedScenario, {
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  chooseEffect(declinedScenario, (request) =>
    request.effectId === "discard_hand_then_draw_cards"
      ? { choiceId: "decline" }
      : undefined
  );

  assert.deepEqual(play(declinedScenario, declinedSource), { ok: true });
  assert.equal(
    declinedScenario.activePlayer.hand.includes(declinedRetained),
    true
  );

  const laterScenario = createGameScenario({ rootDir, seed: 280059 });
  laterScenario.state.turn.power = 100;
  const firstCard = givenRuntimeCard(laterScenario, {
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  const laterSource = givenRuntimeCard(laterScenario, {
    definitionId: "esw2_dbg__main_058",
  });
  const laterRetained = givenRuntimeCard(laterScenario, {
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  for (let index = 0; index < 4; index += 1) {
    givenRuntimeCard(laterScenario, {
      zone: "deck",
      effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
    });
  }
  let laterChoiceRequests = 0;
  chooseEffect(laterScenario, (request) => {
    if (request.effectId !== "discard_hand_then_draw_cards") {
      return undefined;
    }
    laterChoiceRequests += 1;
    return { choiceId: "apply" };
  });

  assert.deepEqual(play(laterScenario, firstCard), { ok: true });
  assert.deepEqual(play(laterScenario, laterSource), { ok: true });
  assert.equal(laterScenario.activePlayer.hand.includes(laterRetained), true);
  assert.equal(laterChoiceRequests, 0);
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

  const handScenario = createGameScenario({ rootDir, seed: 281059 });
  const handSource = givenRuntimeCard(handScenario, {
    definitionId: "esw2_dbg__main_057",
  });
  const handTarget = givenRuntimeCard(handScenario, {
    zone: "hand",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  handScenario.activePlayer.chips = 1;
  chooseEffect(handScenario, (request) =>
    request.effectId === "optional_spend_chip_destroy_own_cards"
      ? { choiceId: `destroy_${handTarget.instanceId}` }
      : undefined
  );

  assert.deepEqual(play(handScenario, handSource), { ok: true });
  assert.equal(handScenario.activePlayer.chips, 0);
  assert.equal(
    handScenario.state.common.destroyedPile.includes(handTarget),
    true
  );

  const controlScenario = createGameScenario({
    rootDir,
    seed: 281060,
    playerCount: 2,
  });
  const controlController = controlScenario.foes[0];
  assert.ok(controlController);
  const controlSource = givenRuntimeCard(controlScenario, {
    definitionId: "esw2_dbg__main_057",
  });
  const controlledCard = givenRuntimeCard(controlScenario, {
    zone: "discard",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  controlScenario.activePlayer.chips = 1;
  givenTemporaryControl(controlScenario, controlledCard, controlController);
  assert.equal(
    getControlledCards(controlScenario.state, controlController).includes(
      controlledCard
    ),
    true
  );
  chooseEffect(controlScenario, (request) =>
    request.effectId === "optional_spend_chip_destroy_own_cards"
      ? { choiceId: `destroy_${controlledCard.instanceId}` }
      : undefined
  );

  assert.deepEqual(play(controlScenario, controlSource), { ok: true });
  assert.equal(
    getControlledCards(controlScenario.state, controlController).includes(
      controlledCard
    ),
    false
  );
  assert.equal(
    controlScenario.state.turn.temporaryCardControls.some(
      (control) => control.cardInstanceId === controlledCard.instanceId
    ),
    false
  );
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

  const declined = createGameScenario({ rootDir, seed: 282069 });
  const declinedSource = givenRuntimeCard(declined, {
    definitionId: "esw2_dbg__main_067",
  });
  const declinedTarget = givenRuntimeCard(declined, {
    zone: "discard",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  declined.activePlayer.statuses.push({
    instanceId: `fixture-dingler-${declined.activePlayer.playerId}`,
    statusId: "dingler",
    ownerId: declined.activePlayer.playerId,
    effects: [],
  });
  declined.activePlayer.life.current = 4;
  chooseEffect(declined, (request) =>
    request.effectId === "mayhem_each_player_optional_destroy_own_card"
      ? { choiceId: "decline" }
      : undefined
  );

  assert.equal(
    resolveMayhemThroughMarket(declined, declinedSource, "mainDeck").ok,
    true
  );
  assert.equal(declined.activePlayer.discard.includes(declinedTarget), true);
  assert.equal(declined.activePlayer.life.current, 4);

  const empty = createGameScenario({ rootDir, seed: 282070 });
  for (const player of empty.state.players) {
    player.hand.splice(0);
    player.discard.splice(0);
  }
  const emptySource = givenRuntimeCard(empty, {
    definitionId: "esw2_dbg__main_067",
  });
  empty.activePlayer.statuses.push({
    instanceId: `fixture-dingler-${empty.activePlayer.playerId}`,
    statusId: "dingler",
    ownerId: empty.activePlayer.playerId,
    effects: [],
  });
  empty.activePlayer.life.current = 4;
  let emptyChoiceRequests = 0;
  chooseEffect(empty, (request) => {
    if (request.effectId === "mayhem_each_player_optional_destroy_own_card") {
      emptyChoiceRequests += 1;
    }
    return undefined;
  });

  assert.equal(
    resolveMayhemThroughMarket(empty, emptySource, "mainDeck").ok,
    true
  );
  assert.equal(empty.activePlayer.life.current, 4);
  assert.equal(emptyChoiceRequests, 0);
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
    cards
      .slice(1)
      .every((card) => scenario.state.common.destroyedPile.includes(card))
  );
  assert.equal(scenario.activePlayer.discard.includes(cards[0]!), true);
  assert.equal(
    scenario.state.eventLog.filter(
      (event) =>
        event.type === "effectCostPaid" &&
        event.effectId ===
          "mayhem_each_player_optional_destroy_own_card_for_half_chips"
    ).length,
    1
  );

  const declined = createGameScenario({ rootDir, seed: 282077 });
  const declinedSource = givenRuntimeCard(declined, {
    definitionId: "esw2_dbg__main_076",
  });
  const declinedTarget = givenRuntimeCard(declined, {
    zone: "discard",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  declined.activePlayer.chips = 4;
  chooseEffect(declined, (request) =>
    request.effectId ===
    "mayhem_each_player_optional_destroy_own_card_for_half_chips"
      ? { choiceId: "decline" }
      : undefined
  );

  assert.equal(
    resolveMayhemThroughMarket(declined, declinedSource, "mainDeck").ok,
    true
  );
  assert.equal(declined.activePlayer.chips, 4);
  assert.equal(declined.activePlayer.discard.includes(declinedTarget), true);

  const empty = createGameScenario({ rootDir, seed: 282078 });
  for (const player of empty.state.players) {
    player.hand.splice(0);
    player.discard.splice(0);
  }
  const emptySource = givenRuntimeCard(empty, {
    definitionId: "esw2_dbg__main_076",
  });
  empty.activePlayer.chips = 4;
  let emptyChoiceRequests = 0;
  chooseEffect(empty, (request) => {
    if (
      request.effectId ===
      "mayhem_each_player_optional_destroy_own_card_for_half_chips"
    ) {
      emptyChoiceRequests += 1;
    }
    return undefined;
  });

  assert.equal(
    resolveMayhemThroughMarket(empty, emptySource, "mainDeck").ok,
    true
  );
  assert.equal(empty.activePlayer.chips, 4);
  assert.equal(emptyChoiceRequests, 0);
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

  const declined = createGameScenario({
    rootDir,
    seed: 282008,
    playerCount: 2,
  });
  const declinedFoe = declined.foes[0];
  assert.ok(declinedFoe);
  const declinedSource = givenRuntimeCard(declined, {
    definitionId: "esw2_dbg__mega_mayhem_007",
  });
  const declinedHand = givenRuntimeCard(declined, {
    zone: "hand",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  const declinedDiscard = givenRuntimeCard(declined, {
    player: declinedFoe,
    zone: "discard",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  chooseEffect(declined, (request) =>
    request.effectId === "mega_mayhem_each_player_optional_destroy_own_cards"
      ? { choiceId: "decline" }
      : undefined
  );

  assert.equal(
    resolveMayhemThroughMarket(declined, declinedSource, "legendDeck").ok,
    true
  );
  assert.equal(declined.activePlayer.hand.includes(declinedHand), true);
  assert.equal(declinedFoe.discard.includes(declinedDiscard), true);

  const empty = createGameScenario({
    rootDir,
    seed: 282009,
    playerCount: 2,
  });
  for (const player of empty.state.players) {
    player.hand.splice(0);
    player.discard.splice(0);
  }
  const emptySource = givenRuntimeCard(empty, {
    definitionId: "esw2_dbg__mega_mayhem_007",
  });
  let emptyChoiceRequests = 0;
  chooseEffect(empty, (request) => {
    if (
      request.effectId === "mega_mayhem_each_player_optional_destroy_own_cards"
    ) {
      emptyChoiceRequests += 1;
    }
    return undefined;
  });

  assert.equal(
    resolveMayhemThroughMarket(empty, emptySource, "legendDeck").ok,
    true
  );
  assert.equal(empty.state.common.destroyedPile.length, 0);
  assert.equal(emptyChoiceRequests, 0);
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

  const zeroCostScenario = createGameScenario({
    rootDir,
    seed: 2830081,
  });
  const zeroCostFoe = zeroCostScenario.foes[0];
  assert.ok(zeroCostFoe);
  zeroCostFoe.life.current = 10;
  zeroCostScenario.activePlayer.deck.splice(0);
  zeroCostScenario.activePlayer.discard.splice(0);
  const zeroCostSource = givenRuntimeCard(zeroCostScenario, {
    definitionId: "esw2_dbg__main_007",
  });
  givenRuntimeCard(zeroCostScenario, {
    zone: "deck",
    cost: 0,
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  let zeroCostTargetChoices = 0;
  chooseEffect(zeroCostScenario, (request) => {
    if (
      request.effectId !== "reveal_top_card_choose_destroy_or_attack_equal_cost"
    ) {
      return undefined;
    }
    zeroCostTargetChoices += 1;
    return { choiceId: zeroCostFoe.playerId };
  });

  assert.equal(play(zeroCostScenario, zeroCostSource).ok, true);
  assert.ok(zeroCostTargetChoices > 0);
  assert.equal(zeroCostFoe.life.current, 10);
  assert.equal(
    zeroCostScenario.state.eventLog.some(
      (event) =>
        event.type === "attackCreated" &&
        event.targetPlayerId === zeroCostFoe.playerId &&
        event.amount === 0
    ),
    true
  );

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

test("card movement: main_010 destroys up to three main cards and can resolve a found Mayhem", () => {
  const scenario = createGameScenario({
    rootDir,
    seed: 284010,
    playerCount: 2,
  });
  const foe = scenario.foes[0];
  assert.ok(foe);
  foe.life.current = 1;
  scenario.state.turn.power = 0;
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_010",
  });
  const normalA = givenRuntimeCard(scenario, {
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  const mayhem = givenRuntimeCard(scenario, {
    cardId: "fixture-main-010-mayhem",
    cardKind: "mayhem",
    effects: [
      {
        effectId: "mayhem_attack",
        timing: "onMayhemResolve",
        amount: 2,
        target: { selector: "allPlayers" },
      },
    ],
  });
  const normalB = givenRuntimeCard(scenario, {
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  for (const card of [normalB, mayhem, normalA]) {
    putOnCommonDeck(scenario, card, "mainDeck");
  }
  chooseEffect(scenario, (request) =>
    request.effectId === "destroy_top_main_deck_cards_then_optional_play_mayhem"
      ? { choiceId: mayhem.instanceId }
      : undefined
  );

  assert.deepEqual(play(scenario, source), { ok: true });
  assert.equal(scenario.state.turn.power, 6);
  assert.equal(scenario.state.common.destroyedMayhem.includes(mayhem), true);
  assert.equal(scenario.state.common.destroyedPile.includes(normalA), true);
  assert.equal(scenario.state.common.destroyedPile.includes(normalB), true);
  assert.equal(
    scenario.state.eventLog.some(
      (event) =>
        event.type === "trophyControlChanged" &&
        event.playerId === scenario.activePlayer.playerId &&
        event.effectId === "mayhem_attack"
    ),
    true
  );
  assert.equal(
    scenario.state.eventLog.some(
      (event) =>
        event.type === "marketEventCardOpened" &&
        event.cardInstanceId === mayhem.instanceId
    ),
    false
  );
});

test("card movement: main_010 does not grant the optional Mayhem bonus when declined", () => {
  const scenario = createGameScenario({ rootDir, seed: 284011 });
  scenario.state.turn.power = 0;
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_010",
  });
  const mayhem = givenRuntimeCard(scenario, {
    cardId: "fixture-main-010-declined-mayhem",
    cardKind: "mayhem",
    effects: [],
  });
  putOnCommonDeck(scenario, mayhem, "mainDeck");
  chooseEffect(scenario, (request) =>
    request.effectId === "destroy_top_main_deck_cards_then_optional_play_mayhem"
      ? { choiceId: "decline" }
      : undefined
  );

  assert.deepEqual(play(scenario, source), { ok: true });
  assert.equal(scenario.state.turn.power, 3);
  assert.equal(scenario.state.common.destroyedMayhem.includes(mayhem), true);
});

test("card movement: main_010 handles multiple Mayhem cards and an empty main deck", () => {
  const scenario = createGameScenario({
    rootDir,
    seed: 284012,
    playerCount: 2,
  });
  scenario.state.turn.power = 0;
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_010",
  });
  const selectedMayhem = givenRuntimeCard(scenario, {
    cardId: "fixture-main-010-selected-mayhem",
    cardKind: "mayhem",
    effects: [
      {
        effectId: "mayhem_attack",
        timing: "onMayhemResolve",
        amount: 1,
        target: { selector: "allPlayers" },
      },
    ],
  });
  const unselectedMayhem = givenRuntimeCard(scenario, {
    cardId: "fixture-main-010-unselected-mayhem",
    cardKind: "mayhem",
    effects: [],
  });
  const normal = givenRuntimeCard(scenario, {
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  for (const card of [normal, unselectedMayhem, selectedMayhem]) {
    putOnCommonDeck(scenario, card, "mainDeck");
  }
  chooseEffect(scenario, (request) =>
    request.effectId === "destroy_top_main_deck_cards_then_optional_play_mayhem"
      ? { choiceId: selectedMayhem.instanceId }
      : undefined
  );

  assert.deepEqual(play(scenario, source), { ok: true });
  assert.equal(scenario.state.turn.power, 6);
  assert.equal(
    scenario.state.common.destroyedMayhem.includes(selectedMayhem),
    true
  );
  assert.equal(
    scenario.state.common.destroyedMayhem.includes(unselectedMayhem),
    true
  );
  assert.deepEqual(
    scenario.state.eventLog
      .filter((event) => event.type === "mayhemResolved")
      .map((event) => event.cardInstanceId),
    [selectedMayhem.instanceId]
  );

  const emptyScenario = createGameScenario({ rootDir, seed: 284013 });
  emptyScenario.state.turn.power = 0;
  emptyScenario.state.common.mainDeck.splice(0);
  const emptySource = givenRuntimeCard(emptyScenario, {
    definitionId: "esw2_dbg__main_010",
  });
  let emptyChoiceRequests = 0;
  chooseEffect(emptyScenario, (request) => {
    if (
      request.effectId ===
      "destroy_top_main_deck_cards_then_optional_play_mayhem"
    ) {
      emptyChoiceRequests += 1;
    }
    return undefined;
  });

  assert.deepEqual(play(emptyScenario, emptySource), { ok: true });
  assert.equal(emptyScenario.state.turn.power, 3);
  assert.equal(emptyChoiceRequests, 0);
});

test("card movement: main_022 destroys the legend top only after a successful defense window", () => {
  const scenario = createGameScenario({ rootDir, seed: 284022 });
  const foe = scenario.foes[0];
  assert.ok(foe);
  foe.life.current = 10;
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_022",
  });
  const legend = givenRuntimeCard(scenario, {
    cost: 4,
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  putOnCommonDeck(scenario, legend, "legendDeck");
  chooseEffect(scenario, (request) => {
    if (
      request.effectId ===
      "attack_destroy_top_legend_deck_then_damage_equal_cost"
    ) {
      return { choiceId: foe.playerId };
    }
    return undefined;
  });

  assert.equal(play(scenario, source).ok, true);
  assert.equal(foe.life.current, 6);
  assert.equal(scenario.state.common.destroyedPile.includes(legend), true);

  const defendedScenario = createGameScenario({
    rootDir,
    seed: 284023,
  });
  const defendedFoe = defendedScenario.foes[0];
  assert.ok(defendedFoe);
  defendedFoe.life.current = 10;
  const defendedSource = givenRuntimeCard(defendedScenario, {
    definitionId: "esw2_dbg__main_022",
  });
  const defendedLegend = givenRuntimeCard(defendedScenario, {
    cost: 4,
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  putOnCommonDeck(defendedScenario, defendedLegend, "legendDeck");
  const defense = addFixtureDefenseCardToHand(
    defendedScenario.state,
    defendedFoe,
    "discardSelf"
  );
  chooseEffect(defendedScenario, (request) => {
    if (
      request.effectId ===
      "attack_destroy_top_legend_deck_then_damage_equal_cost"
    ) {
      return { choiceId: defendedFoe.playerId };
    }
    return request.effectId === "avoid_attack"
      ? { choiceId: defense.instanceId }
      : undefined;
  });

  assert.equal(play(defendedScenario, defendedSource).ok, true);
  assert.equal(defendedFoe.life.current, 10);
  assert.equal(
    defendedScenario.state.common.legendDeck.includes(defendedLegend),
    true
  );
});

test("card movement: main_022 destroys Mega Mayhem for zero damage", () => {
  const scenario = createGameScenario({ rootDir, seed: 284024 });
  const foe = scenario.foes[0];
  assert.ok(foe);
  foe.life.current = 10;
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_022",
  });
  const megaMayhem = givenRuntimeCard(scenario, {
    cardKind: "megaMayhem",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  putOnCommonDeck(scenario, megaMayhem, "legendDeck");
  chooseEffect(scenario, (request) =>
    request.effectId === "attack_destroy_top_legend_deck_then_damage_equal_cost"
      ? { choiceId: foe.playerId }
      : undefined
  );

  assert.equal(play(scenario, source).ok, true);
  assert.equal(foe.life.current, 10);
  assert.equal(
    scenario.state.common.destroyedMegaMayhem.includes(megaMayhem),
    true
  );

  const emptyScenario = createGameScenario({
    rootDir,
    seed: 284025,
  });
  const emptyFoe = emptyScenario.foes[0];
  assert.ok(emptyFoe);
  emptyFoe.life.current = 10;
  emptyScenario.state.common.legendDeck.splice(0);
  const emptySource = givenRuntimeCard(emptyScenario, {
    definitionId: "esw2_dbg__main_022",
  });
  let emptyTargetChoices = 0;
  chooseEffect(emptyScenario, (request) => {
    if (
      request.effectId ===
      "attack_destroy_top_legend_deck_then_damage_equal_cost"
    ) {
      emptyTargetChoices += 1;
    }
    return request.effectId ===
      "attack_destroy_top_legend_deck_then_damage_equal_cost"
      ? { choiceId: emptyFoe.playerId }
      : undefined;
  });

  assert.deepEqual(play(emptyScenario, emptySource), { ok: true });
  assert.equal(emptyFoe.life.current, 10);
  assert.equal(emptyTargetChoices, 1);
});

test("card movement: mega_mayhem_006 defends each wizard before destroying in stable order", () => {
  const scenario = createGameScenario({
    rootDir,
    seed: 284006,
    playerCount: 4,
  });
  const activeIndex = scenario.state.players.findIndex(
    (player) => player.playerId === scenario.state.activePlayerId
  );
  const orderedPlayers = Array.from(
    { length: scenario.state.players.length },
    (_, offset) =>
      scenario.state.players[
        (activeIndex + offset) % scenario.state.players.length
      ]
  );
  const [active, firstFoe, secondFoe, lastFoe] = orderedPlayers;
  assert.ok(active);
  assert.ok(firstFoe);
  assert.ok(secondFoe);
  assert.ok(lastFoe);
  const source = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__mega_mayhem_006",
  });
  const mayhem = givenRuntimeCard(scenario, {
    cardId: "fixture-mega-006-mayhem",
    cardKind: "mayhem",
    effects: [],
  });
  const mayhemAfterDefense = givenRuntimeCard(scenario, {
    cardId: "fixture-mega-006-mayhem-after-defense",
    cardKind: "mayhem",
    effects: [],
  });
  const normalLast = givenRuntimeCard(scenario, {
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 0 }],
  });
  for (const card of [normalLast, mayhemAfterDefense, mayhem]) {
    putOnCommonDeck(scenario, card, "mainDeck");
  }
  const defense = addFixtureDefenseCardToHand(
    scenario.state,
    firstFoe,
    "discardSelf"
  );
  chooseEffect(scenario, (request) => {
    if (request.effectId !== "avoid_attack") return undefined;
    return request.player.playerId === firstFoe.playerId
      ? { choiceId: defense.instanceId }
      : undefined;
  });

  assert.equal(
    resolveMayhemThroughMarket(scenario, source, "legendDeck").ok,
    true
  );
  assert.deepEqual(
    scenario.state.eventLog
      .filter(
        (event) =>
          event.type === "mayhemDecisionStarted" ||
          event.type === "effectTopMainDeckCardDestroyed"
      )
      .map((event) =>
        event.type === "mayhemDecisionStarted"
          ? ["decision", event.targetPlayerId]
          : ["destroy", event.playerId]
      ),
    [
      ["decision", active.playerId],
      ["destroy", active.playerId],
      ["decision", firstFoe.playerId],
      ["decision", secondFoe.playerId],
      ["destroy", secondFoe.playerId],
      ["decision", lastFoe.playerId],
      ["destroy", lastFoe.playerId],
    ]
  );
  assert.deepEqual(
    scenario.state.eventLog
      .filter((event) => event.type === "mayhemDecisionStarted")
      .map((event) => event.targetPlayerId),
    [active.playerId, firstFoe.playerId, secondFoe.playerId, lastFoe.playerId]
  );
  assert.equal(scenario.state.common.destroyedMayhem.includes(mayhem), true);
  assert.equal(
    scenario.state.common.destroyedMayhem.includes(mayhemAfterDefense),
    true
  );
  assert.equal(scenario.state.common.destroyedPile.includes(normalLast), true);
  assert.equal(firstFoe.discard.includes(defense), true);
  assert.deepEqual(
    scenario.state.eventLog
      .filter((event) => event.type === "effectTopMainDeckCardDestroyed")
      .map((event) => event.playerId),
    [active.playerId, secondFoe.playerId, lastFoe.playerId]
  );
  assert.equal(
    scenario.state.eventLog.some(
      (event) =>
        event.type === "playerDied" && event.playerId === active.playerId
    ),
    true
  );
  assert.equal(
    scenario.state.eventLog.some(
      (event) =>
        event.type === "playerDied" && event.playerId === secondFoe.playerId
    ),
    true
  );

  const emptyScenario = createGameScenario({
    rootDir,
    seed: 284007,
    playerCount: 3,
  });
  emptyScenario.state.common.mainDeck.splice(0);
  const emptySource = givenRuntimeCard(emptyScenario, {
    definitionId: "esw2_dbg__mega_mayhem_006",
  });

  assert.equal(
    resolveMayhemThroughMarket(emptyScenario, emptySource, "legendDeck").ok,
    true
  );
  assert.equal(emptyScenario.state.common.destroyedPile.length, 0);
  assert.equal(
    emptyScenario.state.eventLog.some((event) => event.type === "playerDied"),
    false
  );
});
