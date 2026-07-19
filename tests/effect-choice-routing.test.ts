import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  initializeGame,
  type CardDefinition,
  type RuntimeEffect,
} from "../src/index.js";
import { executeEffect } from "../src/engine/effect-runtime.js";
import type { EffectSourceContext } from "../src/engine/effect-runtime-registry.js";
import { addFixtureDefinitionToActiveHand } from "./helpers/fixture-cards.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../src/domain/types.js";

const rootDir = process.cwd();

function fixtureDefinition(
  cardId: string,
  effects: RuntimeEffect[]
): CardDefinition {
  return {
    schemaVersion: 1,
    cardId,
    source: { image: `assets/cards/fixtures/${cardId}.png` },
    visible: {
      nameRu: cardId,
      cost: 0,
      victoryPoints: 0,
      typeRu: null,
      cardKind: "normal",
      cardTypes: [],
      markers: [],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind: "normal",
      cardTypes: [],
      cost: 0,
      victoryPoints: 0,
      isOngoing: false,
      marketChipMarker: false,
      effects,
      unsupportedMechanics: [],
    },
  };
}

test("chosenFoe without a callback keeps the first opponent baseline", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const source = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-choice-chosen-foe-baseline", [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 5,
        targetSelector: "chosenFoe",
      },
    ])
  );
  const activePlayer = state.players.find(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const [firstFoe, ...otherFoes] = state.players.filter(
    (candidate) => candidate.playerId !== activePlayer.playerId
  );
  assert.ok(firstFoe);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: source.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(firstFoe.life.current, 15);
  assert.ok(otherFoes.every((candidate) => candidate.life.current === 20));
  const choiceEvents = state.eventLog.filter(
    (event) =>
      event.type === "effectChoiceSelected" &&
      event.effectId === "attack_damage"
  );
  assert.equal(choiceEvents.length, 1);
  assert.equal(choiceEvents[0]?.choiceId, firstFoe.playerId);
  const allChoiceEvents = state.eventLog.filter(
    (event) =>
      (event.type === "effectChoiceSelected" ||
        event.type === "effectChoiceSkipped") &&
      event.effectId === "attack_damage" &&
      event.cardInstanceId === source.instanceId
  );
  assert.equal(allChoiceEvents.length, 1);
});

test("target choice strategy can select a non-first chosenPlayer target", () => {
  const state = initializeGame({
    rootDir,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.wizardProperties = [];
  const definition = state.cardDefinitions.get("esw2_dbg__main_030");
  assert.ok(definition);
  const card = {
    instanceId: markCardInstanceId("fixture-choice-routing-source"),
    definitionId: markCardDefinitionId(definition.cardId),
    ownerId: activePlayer.playerId,
    marketChips: 0,
  };
  activePlayer.hand.push(card);
  state.turn.power = 10;
  for (const player of state.players) player.life.current = 20;

  let seenRequest:
    | Parameters<NonNullable<typeof state.effectChoiceStrategy>>[0]
    | undefined;
  state.effectChoiceStrategy = (request) => {
    if (request.effectId !== "attack_damage") return undefined;
    seenRequest = request;
    return request.choices[1];
  };

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.ok, true);
  assert.ok(seenRequest);
  assert.equal(seenRequest.choices.length, state.players.length);
  const selectedTarget = state.players[1];
  assert.ok(selectedTarget);
  assert.equal(selectedTarget.life.current, 15);
  const firstTarget = state.players[0];
  assert.ok(firstTarget);
  assert.equal(firstTarget.life.current, 20);

  const choiceEvents = state.eventLog.filter(
    (event) =>
      event.type === "effectChoiceSelected" &&
      event.effectId === "attack_damage"
  );
  assert.equal(choiceEvents.length, 1);
  const choiceEvent = choiceEvents[0];
  assert.ok(choiceEvent);
  assert.equal(choiceEvent.choiceKind, "playerTarget");
  assert.equal(choiceEvent.choiceId, selectedTarget.playerId);
  assert.deepEqual(
    choiceEvent.choiceIds,
    state.players.map((candidate) => candidate.playerId)
  );
  assert.equal(choiceEvent.legalChoiceCount, state.players.length);
  assert.deepEqual(choiceEvent.targetPlayerIds, [selectedTarget.playerId]);
  assert.equal(choiceEvent.targetPlayerId, selectedTarget.playerId);
});

test("target choice strategy routes a non-first market card to its handler", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const source = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-choice-market-source", [
      {
        effectId: "fixture_add_power_equal_to_target_cost",
        timing: "onPlay",
        target: { selector: "mainMarketCard" },
      },
    ])
  );
  const firstMarketCard = state.common.market[0];
  const secondMarketCard = state.common.market[1];
  assert.ok(firstMarketCard);
  assert.ok(secondMarketCard);
  const firstCost = state.cardDefinitions.get(firstMarketCard.definitionId)
    ?.engine.cost;
  const secondCost = state.cardDefinitions.get(secondMarketCard.definitionId)
    ?.engine.cost;
  assert.ok(firstCost !== undefined);
  assert.ok(secondCost !== undefined);
  let seenRequest:
    | Parameters<NonNullable<typeof state.effectChoiceStrategy>>[0]
    | undefined;
  state.effectChoiceStrategy = (request) => {
    if (request.effectId !== "fixture_add_power_equal_to_target_cost") {
      return undefined;
    }
    seenRequest = request;
    return request.choices[1];
  };

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: source.instanceId,
  });

  assert.equal(result.ok, true);
  assert.ok(seenRequest);
  assert.deepEqual(
    seenRequest.choices.map((choice) => [choice.choiceKind, choice.choiceId]),
    state.common.market.map((marketCard) => [
      "cardTarget",
      marketCard.instanceId,
    ])
  );
  assert.equal(state.turn.power, secondCost);
  const choiceEvents = state.eventLog.filter(
    (event) =>
      event.type === "effectChoiceSelected" &&
      event.effectId === "fixture_add_power_equal_to_target_cost"
  );
  assert.equal(choiceEvents.length, 1);
  const choiceEvent = choiceEvents[0];
  assert.ok(choiceEvent);
  assert.equal(choiceEvent.choiceKind, "cardTarget");
  assert.equal(choiceEvent.choiceId, secondMarketCard.instanceId);
  assert.deepEqual(
    choiceEvent.choiceIds,
    state.common.market.map((marketCard) => marketCard.instanceId)
  );
  assert.equal(choiceEvent.legalChoiceCount, state.common.market.length);
  assert.deepEqual(choiceEvent.targetCardInstanceIds, [
    secondMarketCard.instanceId,
  ]);
  assert.deepEqual(choiceEvent.targetDefinitionIds, [
    secondMarketCard.definitionId,
  ]);
  assert.equal(choiceEvent.targetCardInstanceId, secondMarketCard.instanceId);
  assert.equal(choiceEvent.targetDefinitionId, secondMarketCard.definitionId);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectFixtureTargetCostPowerApplied" &&
        event.targetCardInstanceId === secondMarketCard.instanceId
    )
  );
});

test("reconstructed target choice falls back to the first legal choice", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const source = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-choice-identity-source", [
      {
        effectId: "fixture_add_power_equal_to_target_cost",
        timing: "onPlay",
        target: { selector: "mainMarketCard" },
      },
    ])
  );
  const firstMarketCard = state.common.market[0];
  const secondMarketCard = state.common.market[1];
  assert.ok(firstMarketCard);
  assert.ok(secondMarketCard);
  const firstCost = state.cardDefinitions.get(firstMarketCard.definitionId)
    ?.engine.cost;
  const secondCost = state.cardDefinitions.get(secondMarketCard.definitionId)
    ?.engine.cost;
  assert.ok(firstCost !== undefined);
  assert.ok(secondCost !== undefined);
  state.effectChoiceStrategy = (request) => {
    if (request.effectId !== "fixture_add_power_equal_to_target_cost")
      return undefined;
    const choice = request.choices[1];
    assert.ok(choice);
    return { ...choice };
  };

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: source.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, firstCost);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectFixtureTargetCostPowerApplied" &&
        event.targetCardInstanceId === firstMarketCard.instanceId
    )
  );
});

test("same seed without a callback keeps target choice deterministic", () => {
  const run = () => {
    const state = initializeGame({ rootDir, seed: 60615 });
    const source = addFixtureDefinitionToActiveHand(
      state,
      fixtureDefinition("fixture-choice-deterministic-source", [
        {
          effectId: "fixture_add_power_equal_to_target_cost",
          timing: "onPlay",
          target: { selector: "mainMarketCard" },
        },
      ])
    );
    const result = applyAction(state, {
      type: "playCard",
      cardInstanceId: source.instanceId,
    });
    assert.equal(result.ok, true);
    return {
      power: state.turn.power,
      market: state.common.market,
      eventLog: state.eventLog,
    };
  };

  assert.deepEqual(run(), run());
});

test("empty card targets preserve skip and fail semantics", () => {
  const run = (emptyChoice: "skip" | "fail") => {
    const state = initializeGame({ rootDir, seed: 60615 });
    const source = addFixtureDefinitionToActiveHand(
      state,
      fixtureDefinition(`fixture-choice-empty-${emptyChoice}`, [
        {
          effectId: "discard_card",
          timing: "onPlay",
          target: { selector: "activePlayerHandCard" },
          ...(emptyChoice === "fail" ? { emptyChoice: "fail" as const } : {}),
        },
      ])
    );
    const activePlayer = state.players.find(
      (candidate) => candidate.playerId === state.activePlayerId
    );
    assert.ok(activePlayer);
    activePlayer.hand = activePlayer.hand.filter(
      (card) => card.instanceId === source.instanceId
    );
    let seenEmptyRequest:
      | Parameters<NonNullable<typeof state.effectChoiceStrategy>>[0]
      | undefined;
    state.effectChoiceStrategy = (request) => {
      if (request.effectId === "discard_card") {
        seenEmptyRequest = request;
      }
      return undefined;
    };
    const result = applyAction(state, {
      type: "playCard",
      cardInstanceId: source.instanceId,
    });
    return { result, state, source, seenEmptyRequest };
  };

  const skipped = run("skip");
  assert.equal(skipped.result.ok, true);
  assert.ok(skipped.seenEmptyRequest);
  assert.deepEqual(skipped.seenEmptyRequest.choices, []);
  const skippedChoiceEvents = skipped.state.eventLog.filter(
    (event) =>
      (event.type === "effectChoiceSkipped" ||
        event.type === "effectChoiceSelected") &&
      event.effectId === "discard_card"
  );
  assert.equal(skippedChoiceEvents.length, 1);
  assert.equal(skippedChoiceEvents[0]?.type, "effectChoiceSkipped");

  const failed = run("fail");
  assert.equal(failed.result.ok, false);
  assert.ok(failed.seenEmptyRequest);
  assert.deepEqual(failed.seenEmptyRequest.choices, []);
  const failedChoiceEvents = failed.state.eventLog.filter(
    (event) =>
      (event.type === "effectChoiceSkipped" ||
        event.type === "effectChoiceSelected") &&
      event.effectId === "discard_card"
  );
  assert.equal(failedChoiceEvents.length, 1);
  assert.equal(failedChoiceEvents[0]?.type, "effectChoiceSkipped");
  if (!failed.result.ok) {
    assert.match(
      failed.result.error,
      /No legal choices for effect discard_card/
    );
  }
});

test("non-target option choices keep their ordered option identities", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  for (const candidate of state.players) {
    candidate.life.current = 20;
    candidate.chips = 0;
  }

  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: "fixture",
    playerId: activePlayer.playerId,
    cardInstanceId: "fixture-choice-option-source",
    definitionId: "fixture-choice-option-source",
  };
  const effect: RuntimeEffect = {
    effectId: "mayhem_each_player_reduce_life_to_gain_chips",
    timing: "onMayhemResolve",
    targetSelector: "eachPlayerClockwiseFromActive",
    chooser: "affectedPlayer",
    lifeTotal: 10,
    chipAmount: 2,
  };
  const requests: Array<
    Parameters<NonNullable<typeof state.effectChoiceStrategy>>[0]
  > = [];
  state.effectChoiceStrategy = (request) => {
    if (request.effectId !== effect.effectId) {
      return undefined;
    }
    requests.push(request);
    return request.choices[1];
  };

  const result = executeEffect(state, activePlayer, effect, source);

  assert.equal(result.ok, true);
  assert.equal(requests.length, state.players.length);
  for (const request of requests) {
    assert.deepEqual(
      request.choices.map((choice) => [choice.choiceKind, choice.choiceId]),
      [
        ["option", "reduce_life_gain_chips"],
        ["option", "pass"],
      ]
    );
  }
  assert.ok(state.players.every((candidate) => candidate.life.current === 20));
  assert.ok(state.players.every((candidate) => candidate.chips === 0));
  const choiceEvents = state.eventLog.filter(
    (event) =>
      event.type === "effectChoiceSelected" &&
      event.effectId === effect.effectId
  );
  assert.equal(choiceEvents.length, state.players.length);
  assert.ok(
    choiceEvents.every(
      (event) =>
        event.choiceKind === "option" &&
        event.choiceId === "pass" &&
        event.choiceIds?.join(",") === "reduce_life_gain_chips,pass" &&
        event.legalChoiceCount === 2
    )
  );
});

test("directional choices keep their selected direction and ordered targets", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: "fixture",
    playerId: activePlayer.playerId,
    cardInstanceId: "fixture-choice-directional-source",
    definitionId: "fixture-choice-directional-source",
  };
  const effect: RuntimeEffect = {
    effectId: "directional_chain_attack",
    timing: "onPlay",
    amount: 1,
    targetSelector: "leftOrRightFoe",
  };
  let seenRequest:
    | Parameters<NonNullable<typeof state.effectChoiceStrategy>>[0]
    | undefined;
  state.effectChoiceStrategy = (request) => {
    if (request.effectId !== "directional_chain_attack") return undefined;
    seenRequest = request;
    return request.choices[1];
  };

  const result = executeEffect(state, activePlayer, effect, source);

  assert.equal(result.ok, true);
  assert.ok(seenRequest);
  assert.deepEqual(
    seenRequest.choices.map((choice) => [choice.choiceKind, choice.choiceId]),
    [
      ["directionalPlayerTarget", "left"],
      ["directionalPlayerTarget", "right"],
    ]
  );
  const choiceEvent = state.eventLog.find(
    (event) =>
      event.type === "effectChoiceSelected" &&
      event.effectId === "directional_chain_attack"
  );
  assert.ok(choiceEvent);
  assert.equal(choiceEvent.choiceKind, "directionalPlayerTarget");
  assert.equal(choiceEvent.choiceId, "right");
  assert.equal(choiceEvent.direction, "right");
  assert.deepEqual(
    choiceEvent.targetPlayerIds,
    state.players
      .filter((candidate) => candidate.playerId !== activePlayer.playerId)
      .map((candidate) => candidate.playerId)
      .reverse()
  );
});

test("multi-card choices preserve the selected card group", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const discardedCards = activePlayer.hand.splice(0, 2);
  assert.equal(discardedCards.length, 2);
  activePlayer.discard.push(...discardedCards);
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: "fixture",
    playerId: activePlayer.playerId,
    cardInstanceId: "fixture-choice-multi-card-source",
    definitionId: "fixture-choice-multi-card-source",
  };
  const effect: RuntimeEffect = {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 1,
    targetSelector: "chosenFoe",
    onDamageDealt: [{ effectId: "return_discard_to_hand", amount: 2 }],
  };
  state.effectChoiceStrategy = (request) => {
    if (request.effectId !== "return_discard_to_hand") return undefined;
    return request.choices[0];
  };

  const result = executeEffect(state, activePlayer, effect, source);

  assert.equal(result.ok, true);
  assert.ok(discardedCards.every((card) => activePlayer.hand.includes(card)));
  const choiceEvent = state.eventLog.find(
    (event) =>
      event.type === "effectChoiceSelected" &&
      event.effectId === "return_discard_to_hand"
  );
  assert.ok(choiceEvent);
  assert.equal(choiceEvent.choiceKind, "cardTarget");
  assert.equal(choiceEvent.choiceId, "return_2");
  assert.equal(choiceEvent.amount, 2);
  assert.deepEqual(
    choiceEvent.targetCardInstanceIds,
    discardedCards.map((card) => card.instanceId)
  );
  assert.equal(choiceEvent.targetCardInstanceId, undefined);
});
