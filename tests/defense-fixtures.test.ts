import assert from "node:assert/strict";
import test from "node:test";

import {
  initializeGame,
  type CardInstance,
  type GameState,
  type PlayerState,
} from "../src/index.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../src/domain/types.js";
import {
  addFixtureDefenseCardToHand,
  selectFirstFixtureDefense,
  selectFixtureDefenseByInstanceId,
} from "./helpers/defense-fixtures.js";
import { createChoicePlayerView } from "../src/engine/strategy-decision-view.js";

const rootDir = process.cwd();

test("fixture defense selectors skip production cards and select an exact fixture", () => {
  const state = initializeGame({ rootDir, seed: 47400 });
  const defender = mustGetPlayer(state, 1);
  defender.hand = [];

  const productionDefense: CardInstance = {
    instanceId: markCardInstanceId("production-defense-instance"),
    definitionId: markCardDefinitionId("esw2_dbg__production-defense"),
    ownerId: defender.playerId,
    marketChips: 0,
  };
  const firstFixture = addFixtureDefenseCardToHand(
    state,
    defender,
    "discardSelf"
  );
  const secondFixture = addFixtureDefenseCardToHand(
    state,
    defender,
    "discardSelf"
  );
  const choices = [
    { choiceKind: "defense" as const, choiceId: "decline" },
    {
      choiceKind: "defense" as const,
      choiceId: productionDefense.instanceId,
      targetCardInstanceId: productionDefense.instanceId,
    },
    {
      choiceKind: "defense" as const,
      choiceId: firstFixture.instanceId,
      targetCardInstanceId: firstFixture.instanceId,
    },
    {
      choiceKind: "defense" as const,
      choiceId: secondFixture.instanceId,
      targetCardInstanceId: secondFixture.instanceId,
    },
  ];
  const request = {
    player: createChoicePlayerView(defender),
    effectId: "avoid_attack" as const,
    sourceType: "card" as const,
    cardInstanceId: "fixture-selector-source",
    definitionId: "fixture-selector-source",
    choices,
  };

  assert.equal(
    selectFirstFixtureDefense(request)?.choiceId,
    firstFixture.instanceId
  );
  assert.equal(
    selectFixtureDefenseByInstanceId(secondFixture.instanceId)(request)
      ?.choiceId,
    secondFixture.instanceId
  );
});

test("defense fixture ids remain unique after an earlier fixture leaves hand", () => {
  const state = initializeGame({ rootDir, seed: 47401 });
  const defender = mustGetPlayer(state, 1);
  defender.hand = [];
  defender.discard = [];

  const first = addFixtureDefenseCardToHand(state, defender, "discardSelf");
  defender.hand.splice(defender.hand.indexOf(first), 1);
  defender.discard.push(first);
  const second = addFixtureDefenseCardToHand(state, defender, "discardSelf");

  assert.notEqual(first.instanceId, second.instanceId);
  assert.notEqual(first.definitionId, second.definitionId);
});

function mustGetPlayer(state: GameState, index: number): PlayerState {
  const player = state.players[index];
  assert.ok(player);
  return player;
}
