import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  initializeGame,
  listLegalActions,
  scoreGame,
  type CardDefinition,
  type GameState,
  type StatusInstance,
} from "../src/index.js";

const rootDir = process.cwd();

test("active player can play a card from hand through the action loop", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);

  const playableCard = activePlayer.hand.find((card) => card.definitionId === "esw2_dbg__ocr_022");
  assert.ok(playableCard);

  const legalActions = listLegalActions(state);
  assert.ok(
    legalActions.some((action) => action.type === "playCard" && action.cardInstanceId === playableCard.instanceId),
  );

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: playableCard.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.hand.includes(playableCard), false);
  assert.equal(activePlayer.playedThisTurn.includes(playableCard), true);
  assert.equal(state.turn.power, 1);
  assert.equal(state.eventLog.at(-1)?.type, "cardPlayed");
});

test("playing an add-power card records an immediate effect consequence", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);

  const playableCard = activePlayer.hand.find((card) => card.definitionId === "esw2_dbg__ocr_022");
  assert.ok(playableCard);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: playableCard.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 1);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectAddPowerApplied" &&
        event.playerId === activePlayer.playerId &&
        event.cardInstanceId === playableCard.instanceId &&
        event.definitionId === playableCard.definitionId
      );
    }),
  );
});

test("illegal actions are rejected without changing game state", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const before = snapshotActionState(state);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: "missing-card-instance",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(snapshotActionState(state), before);
});

test("active player can buy an affordable market card into discard", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);

  for (const card of [...activePlayer.hand]) {
    applyAction(state, {
      type: "playCard",
      cardInstanceId: card.instanceId,
    });
  }

  const buyAction = listLegalActions(state).find((action) => action.type === "buyMarketCard");
  assert.ok(buyAction);

  const marketCard = state.common.market.find((card) => card.instanceId === buyAction.cardInstanceId);
  assert.ok(marketCard);
  const powerBeforeBuy = state.turn.power;
  const cost = state.cardDefinitions.get(marketCard.definitionId)?.engine.cost;
  assert.equal(typeof cost, "number");
  assert.ok(cost !== undefined);

  const result = applyAction(state, buyAction);

  assert.equal(result.ok, true);
  assert.equal(state.common.market.includes(marketCard), false);
  assert.equal(activePlayer.discard.includes(marketCard), true);
  assert.equal(marketCard.ownerId, activePlayer.playerId);
  assert.equal(state.turn.power, powerBeforeBuy - cost);
  assert.equal(state.eventLog.at(-1)?.type, "cardBought");
});

test("active player can buy wild magic from its stack into discard", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);

  for (const card of [...activePlayer.hand]) {
    applyAction(state, {
      type: "playCard",
      cardInstanceId: card.instanceId,
    });
  }

  const wildMagicAction = listLegalActions(state).find((action) => {
    return action.type === "buyMarketCard" && action.source === "wildMagicStack";
  });
  assert.ok(wildMagicAction);

  const wildMagicCard = state.common.wildMagicStack.at(0);
  assert.ok(wildMagicCard);
  const result = applyAction(state, wildMagicAction);

  assert.equal(result.ok, true);
  assert.equal(activePlayer.discard.includes(wildMagicCard), true);
  assert.equal(wildMagicCard.ownerId, activePlayer.playerId);
});

test("ending a turn cleans up non-permanents, draws a new hand, and advances active player", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const startingActivePlayerId = state.activePlayerId;
  const activePlayer = state.players.find((player) => player.playerId === startingActivePlayerId);
  assert.ok(activePlayer);

  const playedCard = activePlayer.hand.find((card) => card.definitionId === "esw2_dbg__ocr_022");
  assert.ok(playedCard);
  const unplayedCardIds = activePlayer.hand
    .filter((card) => card.instanceId !== playedCard.instanceId)
    .map((card) => card.instanceId);

  applyAction(state, {
    type: "playCard",
    cardInstanceId: playedCard.instanceId,
  });

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.hand.length, 5);
  assert.equal(activePlayer.playedThisTurn.length, 0);
  assert.equal(activePlayer.discard.some((card) => card.instanceId === playedCard.instanceId), true);
  for (const cardId of unplayedCardIds) {
    assert.equal(activePlayer.discard.some((card) => card.instanceId === cardId), true);
  }
  assert.equal(state.turn.power, 0);
  assert.equal(state.turn.number, 2);
  assert.notEqual(state.activePlayerId, startingActivePlayerId);
  assert.equal(state.eventLog.at(-1)?.type, "turnStarted");
});

test("played permanents stay in the controlled permanent zone after cleanup", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);

  const ongoingMarketCardIndex = state.common.market.findIndex((card) => {
    return state.cardDefinitions.get(card.definitionId)?.engine.isOngoing === true;
  });
  assert.notEqual(ongoingMarketCardIndex, -1);
  const ongoingCard = state.common.market.splice(ongoingMarketCardIndex, 1).at(0);
  assert.ok(ongoingCard);
  ongoingCard.ownerId = activePlayer.playerId;
  activePlayer.hand.push(ongoingCard);

  const playResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: ongoingCard.instanceId,
  });
  assert.equal(playResult.ok, true);
  assert.equal(activePlayer.permanents.includes(ongoingCard), true);

  const endTurnResult = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(endTurnResult.ok, true);
  assert.equal(activePlayer.permanents.includes(ongoingCard), true);
  assert.equal(activePlayer.discard.includes(ongoingCard), false);
});

test("playing a v0 draw card draws from the active player's deck", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);

  const drawCardIndex = state.common.market.findIndex((card) => card.definitionId === "esw2_dbg__ocr_017");
  assert.notEqual(drawCardIndex, -1);
  const drawCard = state.common.market.splice(drawCardIndex, 1).at(0);
  assert.ok(drawCard);
  drawCard.ownerId = activePlayer.playerId;
  activePlayer.hand.push(drawCard);

  const deckSizeBefore = activePlayer.deck.length;
  const handSizeBefore = activePlayer.hand.length;
  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: drawCard.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.deck.length, deckSizeBefore - 1);
  assert.equal(activePlayer.hand.length, handSizeBefore);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectDrawCardsApplied" &&
        event.playerId === activePlayer.playerId &&
        event.cardInstanceId === drawCard.instanceId &&
        event.definitionId === drawCard.definitionId &&
        event.amount === 1
      );
    }),
  );
});

test("targeted fixture effect chooses the first legal market target deterministically", () => {
  const first = playTargetedFixtureEffect(60615, {
    effectId: "fixture_add_power_equal_to_target_cost",
    timing: "onPlay",
    target: {
      selector: "mainMarketCard",
    },
  });
  const second = playTargetedFixtureEffect(60615, {
    effectId: "fixture_add_power_equal_to_target_cost",
    timing: "onPlay",
    target: {
      selector: "mainMarketCard",
    },
  });

  assert.equal(first.result.ok, true);
  assert.equal(second.result.ok, true);
  assert.equal(first.selectedTargetId, first.firstMarketCard.instanceId);
  assert.equal(second.selectedTargetId, second.firstMarketCard.instanceId);
  assert.equal(first.selectedTargetId, second.selectedTargetId);
  assert.equal(first.state.turn.power, first.firstMarketCardCost);
  assert.equal(second.state.turn.power, second.firstMarketCardCost);
});

test("fixture gain effect moves the first legal market card into the active player's discard", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const gainedCard = state.common.market[0];
  assert.ok(gainedCard);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "fixture_gain_card",
    timing: "onPlay",
    target: {
      selector: "mainMarketCard",
    },
    destination: "discard",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.common.market.includes(gainedCard), false);
  assert.equal(activePlayer.discard.includes(gainedCard), true);
  assert.equal(gainedCard.ownerId, activePlayer.playerId);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectCardGained" &&
        event.playerId === activePlayer.playerId &&
        event.targetCardInstanceId === gainedCard.instanceId &&
        event.targetDefinitionId === gainedCard.definitionId
      );
    }),
  );
});

test("fixture discard effect moves the first legal hand card into the active player's discard", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const discardedCard = activePlayer.hand[0];
  assert.ok(discardedCard);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "fixture_discard_card",
    timing: "onPlay",
    target: {
      selector: "activePlayerHandCard",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.hand.includes(discardedCard), false);
  assert.equal(activePlayer.discard.includes(discardedCard), true);
  assert.equal(discardedCard.ownerId, activePlayer.playerId);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectCardDiscarded" &&
        event.playerId === activePlayer.playerId &&
        event.targetCardInstanceId === discardedCard.instanceId &&
        event.targetDefinitionId === discardedCard.definitionId
      );
    }),
  );
});

test("fixture destroy effect moves a chosen card to the destroyed zone and preserves ownership", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const destroyedCard = activePlayer.hand[0];
  assert.ok(destroyedCard);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "fixture_destroy_card",
    timing: "onPlay",
    target: {
      selector: "activePlayerHandCard",
    },
    destination: "destroyedMayhem",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.hand.includes(destroyedCard), false);
  assert.equal(activePlayer.discard.includes(destroyedCard), false);
  assert.equal(state.common.destroyedMayhem.includes(destroyedCard), true);
  assert.equal(destroyedCard.ownerId, activePlayer.playerId);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectCardDestroyed" &&
        event.playerId === activePlayer.playerId &&
        event.targetCardInstanceId === destroyedCard.instanceId &&
        event.targetDefinitionId === destroyedCard.definitionId
      );
    }),
  );
});

test("fixture movement effects skip by default when no legal card choice exists", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  state.common.market.splice(0);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "fixture_gain_card",
    timing: "onPlay",
    target: {
      selector: "mainMarketCard",
    },
    destination: "discard",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.common.market.length, 0);
  assert.ok(state.eventLog.some((event) => event.type === "effectChoiceSkipped"));
  assert.equal(state.eventLog.some((event) => event.type === "effectCardGained"), false);
});

test("fixture reveal effect reveals the active player's top deck card without moving it", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const topCard = activePlayer.deck[0];
  assert.ok(topCard);
  const deckSizeBefore = activePlayer.deck.length;
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "fixture_reveal_top_card",
    timing: "onPlay",
    source: "activePlayerDeck",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.deck.length, deckSizeBefore);
  assert.equal(activePlayer.deck[0], topCard);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectCardRevealed" &&
        event.playerId === activePlayer.playerId &&
        event.targetCardInstanceId === topCard.instanceId &&
        event.targetDefinitionId === topCard.definitionId
      );
    }),
  );
});

test("fixture reveal effect shuffles discard into an empty deck before revealing", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const revealedCard = activePlayer.deck[0];
  assert.ok(revealedCard);
  activePlayer.deck.splice(0);
  activePlayer.discard.push(revealedCard);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "fixture_reveal_top_card",
    timing: "onPlay",
    source: "activePlayerDeck",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.discard.includes(revealedCard), false);
  assert.equal(activePlayer.deck[0], revealedCard);
  assert.ok(state.eventLog.some((event) => event.type === "discardShuffledIntoDeck"));
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "effectCardRevealed" && event.targetCardInstanceId === revealedCard.instanceId;
    }),
  );
});

test("fixture play-top effect plays the active player's top deck card through on-play effects", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const topPlayedCardIndex = activePlayer.hand.findIndex((card) => card.definitionId === "esw2_dbg__ocr_022");
  assert.notEqual(topPlayedCardIndex, -1);
  const topPlayedCard = activePlayer.hand.splice(topPlayedCardIndex, 1).at(0);
  assert.ok(topPlayedCard);
  activePlayer.deck.unshift(topPlayedCard);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "fixture_play_top_card",
    timing: "onPlay",
    source: "activePlayerDeck",
    destination: "play",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.deck.includes(topPlayedCard), false);
  assert.equal(activePlayer.playedThisTurn.includes(topPlayedCard), true);
  assert.equal(topPlayedCard.ownerId, activePlayer.playerId);
  assert.equal(state.turn.power, 1);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectCardPlayedFromDeck" &&
        event.playerId === activePlayer.playerId &&
        event.targetCardInstanceId === topPlayedCard.instanceId &&
        event.targetDefinitionId === topPlayedCard.definitionId
      );
    }),
  );
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "effectAddPowerApplied" && event.cardInstanceId === topPlayedCard.instanceId;
    }),
  );
});

test("targeted fixture damage can kill an opponent, give a neutral DWT, resurrect, and affect scoring", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const targetPlayer = state.players.find((player) => player.playerId !== activePlayer.playerId);
  assert.ok(targetPlayer);
  assert.equal(state.common.deadWizardTokens.status, "available");
  const neutralDwt = state.common.deadWizardTokens.drawStack[0];
  assert.ok(neutralDwt);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "fixture_deal_damage",
    timing: "onPlay",
    amount: 999,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 20);
  assert.equal(targetPlayer.deadWizardTokens.length, 1);
  assert.equal(targetPlayer.deadWizardTokens[0], neutralDwt);
  assert.equal(neutralDwt.ownerId, targetPlayer.playerId);
  assert.equal(state.common.deadWizardTokens.drawStack.includes(neutralDwt), false);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectDamageDealt" &&
        event.playerId === activePlayer.playerId &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.amount === 999
      );
    }),
  );
  assert.ok(state.eventLog.some((event) => event.type === "playerDied" && event.playerId === targetPlayer.playerId));
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "deadWizardTokenGained" &&
        event.playerId === targetPlayer.playerId &&
        event.tokenInstanceId === neutralDwt.instanceId &&
        event.tokenDefinitionId === neutralDwt.definitionId
      );
    }),
  );
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "playerResurrected" && event.playerId === targetPlayer.playerId && event.amount === 20;
    }),
  );

  const targetScore = scoreGame(state).find((score) => score.playerId === targetPlayer.playerId);
  const expectedCardScore = [...targetPlayer.hand, ...targetPlayer.deck, ...targetPlayer.discard].reduce((total, card) => {
    return total + state.cardDefinitions.get(card.definitionId)!.engine.victoryPoints;
  }, 0);
  const expectedTokenScore = state.tokenDefinitions.get(neutralDwt.definitionId)!.victoryPoints;
  assert.ok(targetScore);
  assert.equal(targetScore.deadWizardTokenCount, 1);
  assert.equal(targetScore.victoryPoints, expectedCardScore + expectedTokenScore);
});

test("fixture healing uses effective max life and logs clamping without mutating base max life", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  activePlayer.life.current = 10;
  const baseMaxLife = activePlayer.life.max;
  activePlayer.statuses.push(createMaxLifeModifierStatus(activePlayer.playerId, -8));
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "fixture_heal",
    timing: "onPlay",
    amount: 20,
    target: {
      selector: "activePlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.life.max, baseMaxLife);
  assert.equal(activePlayer.life.current, 17);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectLifeHealed" &&
        event.playerId === activePlayer.playerId &&
        event.targetPlayerId === activePlayer.playerId &&
        event.amount === 7
      );
    }),
  );
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "playerLifeClamped" && event.playerId === activePlayer.playerId && event.amount === 17;
    }),
  );
});

test("fixture healing below effective max life does not clamp", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  activePlayer.life.current = 10;
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "fixture_heal",
    timing: "onPlay",
    amount: 3,
    target: {
      selector: "activePlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.life.current, 13);
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "effectLifeHealed" && event.playerId === activePlayer.playerId && event.amount === 3;
    }),
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "playerLifeClamped" && event.playerId === activePlayer.playerId),
    false,
  );
});

test("targeted fixture effect skips when there are no legal choices by default", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  state.common.market.splice(0);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "fixture_add_power_equal_to_target_cost",
    timing: "onPlay",
    target: {
      selector: "mainMarketCard",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 0);
  assert.ok(state.eventLog.some((event) => event.type === "effectChoiceSkipped"));
});

test("targeted fixture effect can fail when legal choices are empty", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  state.common.market.splice(0);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "fixture_add_power_equal_to_target_cost",
    timing: "onPlay",
    emptyChoice: "fail",
    target: {
      selector: "mainMarketCard",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /No legal choices/);
});

test("targeted fixture effect surfaces unsupported selectors explicitly", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "fixture_add_power_equal_to_target_cost",
    timing: "onPlay",
    target: {
      selector: "unsupportedFixtureSelector",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /Unsupported target selector unsupportedFixtureSelector/);
});

function snapshotActionState(state: ReturnType<typeof initializeGame>): unknown {
  return {
    activePlayerId: state.activePlayerId,
    turn: state.turn,
    players: state.players.map((player) => ({
      playerId: player.playerId,
      deck: player.deck.map((card) => card.instanceId),
      hand: player.hand.map((card) => card.instanceId),
      discard: player.discard.map((card) => card.instanceId),
      playedThisTurn: player.playedThisTurn.map((card) => card.instanceId),
      permanents: player.permanents.map((card) => card.instanceId),
    })),
    common: {
      market: state.common.market.map((card) => card.instanceId),
      legendMarket: state.common.legendMarket.map((card) => card.instanceId),
      wildMagicStack: state.common.wildMagicStack.map((card) => card.instanceId),
    },
    eventLog: state.eventLog,
  };
}

function playTargetedFixtureEffect(seed: number, effect: unknown): {
  result: ReturnType<typeof applyAction>;
  state: GameState;
  firstMarketCard: NonNullable<GameState["common"]["market"][number]>;
  firstMarketCardCost: number;
  selectedTargetId: string | undefined;
} {
  const state = initializeGame({ rootDir, seed });
  const firstMarketCard = state.common.market[0];
  assert.ok(firstMarketCard);
  const firstMarketCardCost = state.cardDefinitions.get(firstMarketCard.definitionId)?.engine.cost;
  assert.ok(firstMarketCardCost !== undefined);
  const fixtureCardId = addFixtureCardToActiveHand(state, effect);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  const selectedTargetId = state.eventLog.find((event) => event.type === "effectChoiceSelected")?.targetCardInstanceId;

  return {
    result,
    state,
    firstMarketCard,
    firstMarketCardCost,
    selectedTargetId,
  };
}

function addFixtureCardToActiveHand(state: GameState, effect: unknown): string {
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const definition: CardDefinition = {
    schemaVersion: 1,
    cardId: "fixture-targeted-effect-card",
    visible: {
      nameRu: "Fixture targeted effect",
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
      effects: [effect],
      unsupportedMechanics: [],
    },
  };
  state.cardDefinitions = new Map([...state.cardDefinitions, [definition.cardId, definition]]);

  const cardInstanceId = `fixture-card-${activePlayer.hand.length + 1}`;
  activePlayer.hand.push({
    instanceId: cardInstanceId,
    definitionId: definition.cardId,
    ownerId: activePlayer.playerId,
  });

  return cardInstanceId;
}

function createMaxLifeModifierStatus(playerId: StatusInstance["ownerId"], amount: number): StatusInstance {
  return {
    instanceId: "fixture-max-life-status",
    statusId: "fixture-max-life-status",
    ownerId: playerId,
    effects: [
      {
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerMaxLife",
        operation: "add",
        amount,
        target: {
          targetType: "player",
        },
      },
    ],
  };
}
