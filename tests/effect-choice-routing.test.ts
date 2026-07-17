import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  initializeGame,
  type CardDefinition,
  type RuntimeEffect,
} from "../src/index.js";
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

test("target choice strategy can select a non-first chosenPlayer target", () => {
  const state = initializeGame({
    rootDir,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
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
  state.effectChoiceStrategy = (request) =>
    request.effectId === "fixture_add_power_equal_to_target_cost"
      ? request.choices[1]
      : undefined;

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: source.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, secondCost);
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
    const result = applyAction(state, {
      type: "playCard",
      cardInstanceId: source.instanceId,
    });
    return { result, state, source };
  };

  const skipped = run("skip");
  assert.equal(skipped.result.ok, true);
  assert.ok(
    skipped.state.eventLog.some((event) => event.type === "effectChoiceSkipped")
  );

  const failed = run("fail");
  assert.equal(failed.result.ok, false);
  if (!failed.result.ok) {
    assert.match(
      failed.result.error,
      /No legal choices for effect discard_card/
    );
  }
});
