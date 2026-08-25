import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  initializeGame,
  type CardInstance,
  type GameState,
  type PlayerState,
  type TokenInstance,
} from "../src/index.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
  markTokenDefinitionId,
  markTokenInstanceId,
} from "../src/domain/types.js";

const rootDir = process.cwd();

test("ЖДК-дохляки считают себя ЖДК при розыгрыше", () => {
  for (const definitionId of [
    "esw2_dbg__main_049",
    "esw2_dbg__main_050",
    "esw2_dbg__main_051",
    "esw2_dbg__main_052",
    "esw2_dbg__main_053",
  ]) {
    const state = initializeGame({ rootDir, seed: 274001 });
    const player = getActivePlayer(state);
    player.hand = [];
    player.chips = 0;
    state.turn.power = 1;

    const card = addCardToHand(state, player, definitionId);
    const result = applyAction(state, {
      type: "playCard",
      cardInstanceId: card.instanceId,
    });

    assert.equal(result.ok, true);
    assert.equal(player.chips, 1);
    assert.equal(
      player.permanents.some(
        (permanent) => permanent.instanceId === card.instanceId
      ),
      true
    );
  }
});

test("ЖДК-дохляк получает чипсину за физический ЖДК и за себя", () => {
  const state = initializeGame({ rootDir, seed: 274002 });
  const player = getActivePlayer(state);
  player.hand = [];
  player.deadWizardTokens = [createDeadWizardToken(player)];
  player.chips = 0;
  state.turn.power = 1;

  const card = addCardToHand(state, player, "esw2_dbg__main_049");
  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(player.chips, 2);
});

function getActivePlayer(state: GameState): PlayerState {
  const player = state.players.find(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  assert.ok(player);
  return player;
}

function addCardToHand(
  state: GameState,
  player: PlayerState,
  definitionId: string
): CardInstance {
  assert.ok(state.cardDefinitions.has(definitionId));
  const card: CardInstance = {
    instanceId: markCardInstanceId(`dwt-interactions-${definitionId}`),
    definitionId: markCardDefinitionId(definitionId),
    ownerId: player.playerId,
    marketChips: 0,
  };
  player.hand.push(card);
  return card;
}

function createDeadWizardToken(player: PlayerState): TokenInstance {
  return {
    instanceId: markTokenInstanceId("dwt-interactions-physical-token"),
    definitionId: markTokenDefinitionId(
      "esw2_dbg__dead_wizard_token_001"
    ),
    ownerId: player.playerId,
  };
}
