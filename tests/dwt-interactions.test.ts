import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  initializeGame,
  runMarketFlow,
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

test("Некрошест считает физический ЖДК и контролируемого Дохляка", () => {
  const state = initializeGame({ rootDir, seed: 275001 });
  const player = getActivePlayer(state);
  player.hand = [];
  player.permanents = [createDohlakPermanent(player)];
  player.deadWizardTokens = [createDeadWizardToken(player)];
  state.turn.power = 1;

  const card = addCardToHand(state, player, "esw2_dbg__main_039");
  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 5);
});

test("Некроманка Гнилюся наносит урон каждому врагу по числу ЖДК", () => {
  const state = initializeGame({ rootDir, seed: 275002 });
  const player = getActivePlayer(state);
  const foe = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(foe);
  player.hand = [];
  player.permanents = [createDohlakPermanent(player)];
  player.deadWizardTokens = [createDeadWizardToken(player)];
  player.life.current = 20;
  foe.life.current = 20;
  foe.hand = [];
  state.turn.power = 9;

  const card = addCardToHand(state, player, "esw2_dbg__legend_033");
  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(foe.life.current, 12);
});

test("МегаБеспредел MC выдаёт чипсины каждому за его ЖДК", () => {
  const state = initializeGame({ rootDir, seed: 275003, playerCount: 3 });
  const orderedPlayers = getPlayersInActiveOrder(state);
  const [activePlayer, secondPlayer, thirdPlayer] = orderedPlayers;
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);
  for (const player of orderedPlayers) {
    player.chips = 0;
    player.deadWizardTokens = [];
    player.permanents = [];
  }
  activePlayer.deadWizardTokens = [createDeadWizardToken(activePlayer)];
  secondPlayer.deadWizardTokens = [
    createDeadWizardToken(secondPlayer),
    createDeadWizardToken(secondPlayer, "second"),
  ];

  const megaMayhem = createCommonCard(
    "esw2_dbg__mega_mayhem_003",
    "mega-mayhem-003"
  );
  const legendFiller = state.common.legendMarket[0];
  assert.ok(legendFiller);
  state.common.legendMarket.splice(
    0,
    state.common.legendMarket.length,
    ...state.common.legendMarket.slice(0, 2)
  );
  state.common.legendDeck.splice(
    0,
    state.common.legendDeck.length,
    megaMayhem,
    legendFiller
  );

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.chips, 1);
  assert.equal(secondPlayer.chips, 2);
  assert.equal(thirdPlayer.chips, 0);
  assert.equal(state.common.destroyedMegaMayhem.includes(megaMayhem), true);
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

function createDeadWizardToken(
  player: PlayerState,
  suffix = "default"
): TokenInstance {
  return createDeadWizardTokenWithSuffix(player, suffix);
}

function createDeadWizardTokenWithSuffix(
  player: PlayerState,
  suffix: string
): TokenInstance {
  return {
    instanceId: markTokenInstanceId(`dwt-interactions-physical-token-${suffix}`),
    definitionId: markTokenDefinitionId(
      "esw2_dbg__dead_wizard_token_001"
    ),
    ownerId: player.playerId,
  };
}

function createDohlakPermanent(player: PlayerState): CardInstance {
  return {
    instanceId: markCardInstanceId(
      `dwt-interactions-dohlak-${player.playerId}`
    ),
    definitionId: markCardDefinitionId("esw2_dbg__main_049"),
    ownerId: player.playerId,
    marketChips: 0,
  };
}

function createCommonCard(definitionId: string, suffix: string): CardInstance {
  return {
    instanceId: markCardInstanceId(`dwt-interactions-${suffix}`),
    definitionId: markCardDefinitionId(definitionId),
    ownerId: "common",
    marketChips: 0,
  };
}

function getPlayersInActiveOrder(state: GameState): PlayerState[] {
  const activeIndex = state.players.findIndex(
    (player) => player.playerId === state.activePlayerId
  );
  assert.notEqual(activeIndex, -1);
  return Array.from({ length: state.players.length }, (_, offset) => {
    return state.players[(activeIndex + offset) % state.players.length];
  }).filter((player): player is PlayerState => player !== undefined);
}
