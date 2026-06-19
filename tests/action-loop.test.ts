import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  initializeGame,
  listLegalActions,
  scoreGame,
  type CardInstance,
  type CardDefinition,
  type GameState,
  type PlayerState,
  type StatusInstance,
  type TokenDefinition,
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

test("market chip marker adds chips to every marked card in that market during Market Flow", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const markedInMarket: CardInstance = {
    instanceId: "fixture-marked-in-market",
    definitionId: "esw2_dbg__ocr_012",
    ownerId: "common",
    marketChips: 0,
  };
  const markedMarketFlowCard: CardInstance = {
    instanceId: "fixture-marked-market-flow",
    definitionId: "esw2_dbg__ocr_012",
    ownerId: "common",
    marketChips: 0,
  };
  const fillerCards = state.common.market
    .filter((card) => state.cardDefinitions.get(card.definitionId)?.engine.marketChipMarker !== true)
    .slice(0, 3);
  assert.equal(fillerCards.length, 3);
  state.common.market.splice(0, state.common.market.length, markedInMarket, ...fillerCards);
  state.common.mainDeck.splice(0, state.common.mainDeck.length, markedMarketFlowCard);

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, true);
  assert.equal(state.common.market.includes(markedMarketFlowCard), true);
  assert.equal(markedInMarket.marketChips, 1);
  assert.equal(markedMarketFlowCard.marketChips, 1);
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "marketChipAdded" && event.cardInstanceId === markedInMarket.instanceId && event.amount === 1;
    }),
  );
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "marketChipAdded" && event.cardInstanceId === markedMarketFlowCard.instanceId && event.amount === 1;
    }),
  );
});

test("turn-start Market Flow adds a normal main-deck card to the main market", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const marketFlowCard = state.common.market.find((card) => {
    return state.cardDefinitions.get(card.definitionId)?.engine.cardKind === "normal";
  });
  assert.ok(marketFlowCard);
  state.common.market.splice(0, 1);
  state.common.mainDeck.splice(0, state.common.mainDeck.length, marketFlowCard);

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, true);
  assert.equal(state.common.market.includes(marketFlowCard), true);
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "marketFlowCardAdded" && event.cardInstanceId === marketFlowCard.instanceId;
    }),
  );
});

test("megaMayhem revealed during Market Flow executes its mapped onMayhemResolve effect", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  for (const player of state.players) {
    player.life.current = 20;
  }
  const megaMayhem: CardInstance = {
    instanceId: "fixture-mega-mayhem-set-life",
    definitionId: "esw2_dbg__ocr_027",
    ownerId: "common",
    marketChips: 0,
  };
  const legendFiller = state.common.legendMarket[0];
  assert.ok(legendFiller);
  state.common.legendMarket.splice(0, state.common.legendMarket.length, ...state.common.legendMarket.slice(0, 2));
  state.common.legendDeck.splice(0, state.common.legendDeck.length, megaMayhem, legendFiller);

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, true);
  assert.equal(state.common.destroyedMegaMayhem.includes(megaMayhem), true);
  assert.equal(state.players.every((player) => player.life.current === 5), true);
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "mayhemResolved" && event.cardInstanceId === megaMayhem.instanceId;
    }),
  );
});

test("mayhem revealed during Market Flow resolves and Market Flow continues with the next normal card", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-market-flow-mayhem-add-power",
    [{ effectId: "add_power", timing: "onMayhemResolve", amount: 2 }],
    { cardKind: "mayhem" },
  );
  const normalDefinition = createFixtureCardDefinition("fixture-market-flow-normal-card", []);
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [mayhemDefinition.cardId, mayhemDefinition],
    [normalDefinition.cardId, normalDefinition],
  ]);
  const mayhem: CardInstance = {
    instanceId: "fixture-market-flow-mayhem-instance",
    definitionId: mayhemDefinition.cardId,
    ownerId: "common",
    marketChips: 0,
  };
  const normalCard: CardInstance = {
    instanceId: "fixture-market-flow-normal-instance",
    definitionId: normalDefinition.cardId,
    ownerId: "common",
    marketChips: 0,
  };
  state.common.market.splice(0, state.common.market.length, ...state.common.market.slice(0, 4));
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem, normalCard);

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 2);
  assert.equal(state.common.market.includes(mayhem), false);
  assert.equal(state.common.market.includes(normalCard), true);
  assert.equal(state.common.destroyedMayhem.at(-1), mayhem);
  assertEventOrder(state, [
    (event) => event.type === "mayhemResolved" && event.cardInstanceId === mayhem.instanceId,
    (event) => event.type === "mayhemDestroyed" && event.cardInstanceId === mayhem.instanceId,
    (event) => event.type === "marketFlowCardAdded" && event.cardInstanceId === normalCard.instanceId,
  ]);
});

test("Market Flow reports main deck exhaustion without starting the next turn", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  state.common.market.splice(0, 1);
  state.common.mainDeck.splice(0);

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, true);
  assert.equal(result.gameEndReason, "mainDeckExhausted");
  assert.equal(state.eventLog.at(-1)?.type, "marketFlowFailed");
  assert.equal(state.eventLog.some((event) => event.type === "turnStarted"), false);
});

test("Market Flow reports legend deck exhaustion without starting the next turn", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  state.common.legendMarket.splice(0, 1);
  state.common.legendDeck.splice(0);

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, true);
  assert.equal(result.gameEndReason, "legendDeckExhausted");
  assert.equal(state.eventLog.at(-1)?.type, "marketFlowFailed");
  assert.equal(state.eventLog.some((event) => event.type === "turnStarted"), false);
});

test("unsupported Mayhem effect fails during Market Flow instead of becoming a silent no-op", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const unsupportedMayhemDefinition: CardDefinition = {
    schemaVersion: 1,
    cardId: "fixture-unsupported-mayhem",
    visible: {
      nameRu: "Unsupported Mayhem",
      cost: 0,
      victoryPoints: 0,
      typeRu: null,
      cardKind: "mayhem",
      cardTypes: [],
      markers: [],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind: "mayhem",
      cardTypes: [],
      cost: 0,
      victoryPoints: 0,
      isOngoing: false,
      marketChipMarker: false,
      effects: [
        {
          effectId: "unsupported_mayhem_runtime_effect",
          timing: "onMayhemResolve",
        },
      ],
      unsupportedMechanics: [],
    },
  };
  state.cardDefinitions = new Map([...state.cardDefinitions, [unsupportedMayhemDefinition.cardId, unsupportedMayhemDefinition]]);
  const unsupportedMayhem: CardInstance = {
    instanceId: "fixture-unsupported-mayhem-instance",
    definitionId: unsupportedMayhemDefinition.cardId,
    ownerId: "common",
    marketChips: 0,
  };
  state.common.market.splice(0, 1);
  state.common.mainDeck.splice(0, state.common.mainDeck.length, unsupportedMayhem);

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /Unsupported Mayhem effect id unsupported_mayhem_runtime_effect/);
  assert.equal(state.common.destroyedMayhem.includes(unsupportedMayhem), false);
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

test("active player can buy and play their setup familiar", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  const foe = state.players.find((player) => player.playerId !== state.activePlayerId);
  assert.ok(activePlayer);
  assert.ok(foe);
  const familiar = activePlayer.unboughtFamiliar;
  assert.ok(familiar);

  assert.equal(familiar.definitionId, "v0_placeholder_familiar");
  assert.equal(familiar.ownerId, activePlayer.playerId);
  assert.equal(findOwnedCard(activePlayer, familiar.definitionId), undefined);
  assert.equal(foe.unboughtFamiliar?.instanceId === familiar.instanceId, false);
  assert.equal(scoreGame(state).find((score) => score.playerId === activePlayer.playerId)?.victoryPoints, 0);

  state.turn.power = 5;
  assert.equal(
    listLegalActions(state).some((action) => action.type === "buyMarketCard" && action.source === "familiar"),
    false,
  );

  state.turn.power = 6;
  const buyAction = listLegalActions(state).find((action) => {
    return action.type === "buyMarketCard" && action.source === "familiar" && action.cardInstanceId === familiar.instanceId;
  });
  assert.ok(buyAction);

  const buyResult = applyAction(state, buyAction);
  assert.equal(buyResult.ok, true);
  assert.equal(activePlayer.unboughtFamiliar, undefined);
  assert.equal(activePlayer.discard.includes(familiar), true);
  assert.equal(scoreGame(state).find((score) => score.playerId === activePlayer.playerId)?.victoryPoints, 2);

  moveCardToHand(activePlayer, familiar);
  state.turn.power = 0;
  const playResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: familiar.instanceId,
  });

  assert.equal(playResult.ok, true);
  assert.equal(state.turn.power, 3);
});

test("bought familiar can discard another hand card to avoid an attack", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  const targetPlayer = state.players.find((player) => player.playerId !== state.activePlayerId);
  assert.ok(activePlayer);
  assert.ok(targetPlayer);
  const familiar = targetPlayer.unboughtFamiliar;
  assert.ok(familiar);
  const paidDiscard = targetPlayer.hand[0];
  assert.ok(paidDiscard);
  targetPlayer.unboughtFamiliar = undefined;
  familiar.ownerId = targetPlayer.playerId;
  targetPlayer.hand.push(familiar);
  targetPlayer.life.current = 1;
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 1);
  assert.equal(targetPlayer.deadWizardTokens.length, 0);
  assert.equal(targetPlayer.hand.includes(familiar), false);
  assert.equal(targetPlayer.discard.includes(familiar), true);
  assert.equal(targetPlayer.hand.includes(paidDiscard), false);
  assert.equal(targetPlayer.discard.includes(paidDiscard), true);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "defenseChoiceSelected" &&
        event.playerId === targetPlayer.playerId &&
        event.cardInstanceId === familiar.instanceId &&
        event.definitionId === familiar.definitionId
      );
    }),
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "defenseCostPaid" &&
        event.playerId === targetPlayer.playerId &&
        event.cardInstanceId === familiar.instanceId &&
        event.targetCardInstanceId === paidDiscard.instanceId &&
        event.effectId === "discard_other_hand_card"
      );
    }),
  );
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "attackAvoided" && event.targetPlayerId === targetPlayer.playerId;
    }),
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "effectDamageDealt" && event.targetPlayerId === targetPlayer.playerId),
    false,
  );
});

test("bought familiar cannot defend when no other hand card can pay its discard cost", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  const targetPlayer = state.players.find((player) => player.playerId !== state.activePlayerId);
  assert.ok(activePlayer);
  assert.ok(targetPlayer);
  const familiar = targetPlayer.unboughtFamiliar;
  assert.ok(familiar);
  targetPlayer.hand.splice(0);
  targetPlayer.unboughtFamiliar = undefined;
  familiar.ownerId = targetPlayer.playerId;
  targetPlayer.hand.push(familiar);
  targetPlayer.life.current = 10;
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 6);
  assert.equal(targetPlayer.hand.includes(familiar), true);
  assert.equal(targetPlayer.discard.includes(familiar), false);
  assert.equal(state.eventLog.some((event) => event.type === "defenseChoiceSelected"), false);
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "effectDamageDealt" && event.targetPlayerId === targetPlayer.playerId;
    }),
  );
});

test("playing wild magic uses the first legal choice and gains 2 power", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const wildMagic = state.common.wildMagicStack.shift();
  assert.ok(wildMagic);
  wildMagic.ownerId = activePlayer.playerId;
  activePlayer.hand.push(wildMagic);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wildMagic.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 2);
  assert.equal(activePlayer.playedThisTurn.includes(wildMagic), true);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "wildMagicChoiceSelected" &&
        event.playerId === activePlayer.playerId &&
        event.cardInstanceId === wildMagic.instanceId &&
        event.effectId === "add_power"
      );
    }),
  );
});

test("wild magic can choose to play the top card of a foe deck when that option is first legal", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  const foe = state.players.find((player) => player.playerId !== state.activePlayerId);
  assert.ok(activePlayer);
  assert.ok(foe);
  const foeTopCardDefinition = createFixtureCardDefinition("fixture-foe-top-add-power", [
    {
      effectId: "add_power",
      timing: "onPlay",
      amount: 1,
    },
  ]);
  const wildMagicDefinition = createFixtureCardDefinition("fixture-wild-magic-foe-first", [
    {
      effectId: "wild_magic_choice",
      timing: "onPlay",
      options: [
        {
          targetSelector: "chosenFoe",
          effectId: "play_top_card_from_foe_deck",
          nonOngoingCleanupDestination: "ownerDiscard",
          ongoingOwnership: "controller",
        },
        {
          effectId: "add_power",
          amount: 2,
        },
      ],
    },
  ]);
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [foeTopCardDefinition.cardId, foeTopCardDefinition],
    [wildMagicDefinition.cardId, wildMagicDefinition],
  ]);
  const foeTopCard: CardInstance = {
    instanceId: "fixture-foe-top-card",
    definitionId: foeTopCardDefinition.cardId,
    ownerId: foe.playerId,
    marketChips: 0,
  };
  const wildMagic: CardInstance = {
    instanceId: "fixture-wild-magic-card",
    definitionId: wildMagicDefinition.cardId,
    ownerId: activePlayer.playerId,
    marketChips: 0,
  };
  foe.deck.unshift(foeTopCard);
  activePlayer.hand.push(wildMagic);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wildMagic.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 1);
  assert.equal(foe.deck.includes(foeTopCard), false);
  assert.equal(activePlayer.playedThisTurn.includes(foeTopCard), true);
  assert.equal(foeTopCard.ownerId, foe.playerId);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "wildMagicChoiceSelected" &&
        event.cardInstanceId === wildMagic.instanceId &&
        event.effectId === "play_top_card_from_foe_deck"
      );
    }),
  );

  const endTurnResult = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(endTurnResult.ok, true);
  assert.equal(activePlayer.playedThisTurn.includes(foeTopCard), false);
  assert.equal(activePlayer.discard.includes(foeTopCard), false);
  assert.equal(foe.discard.includes(foeTopCard), true);
});

test("wild magic foe-deck play triggers wizard property on-play effects for non-ongoing cards", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  const foe = state.players.find((player) => player.playerId !== state.activePlayerId);
  assert.ok(activePlayer);
  assert.ok(foe);
  replaceFirstWizardProperty(state, activePlayer, createOnPlayTypeChipWizardProperty("fixture-wild-magic-spell-property", ["spell"]));
  const foeTopCardDefinition = createFixtureCardDefinition(
    "fixture-wild-magic-foe-spell",
    [{ effectId: "add_power", timing: "onPlay", amount: 1 }],
    { cardTypes: ["spell"] },
  );
  const wildMagicDefinition = createFixtureCardDefinition("fixture-wild-magic-foe-spell-first", [
    {
      effectId: "wild_magic_choice",
      timing: "onPlay",
      options: [
        {
          targetSelector: "chosenFoe",
          effectId: "play_top_card_from_foe_deck",
          nonOngoingCleanupDestination: "ownerDiscard",
          ongoingOwnership: "controller",
        },
      ],
    },
  ]);
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [foeTopCardDefinition.cardId, foeTopCardDefinition],
    [wildMagicDefinition.cardId, wildMagicDefinition],
  ]);
  const foeTopCard: CardInstance = {
    instanceId: "fixture-wild-magic-foe-spell-card",
    definitionId: foeTopCardDefinition.cardId,
    ownerId: foe.playerId,
    marketChips: 0,
  };
  const wildMagic: CardInstance = {
    instanceId: "fixture-wild-magic-foe-spell-card-source",
    definitionId: wildMagicDefinition.cardId,
    ownerId: activePlayer.playerId,
    marketChips: 0,
  };
  foe.deck.unshift(foeTopCard);
  activePlayer.hand.push(wildMagic);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wildMagic.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 1);
  assert.equal(activePlayer.chips, 1);
  assert.equal(activePlayer.playedThisTurn.includes(foeTopCard), true);
  assert.equal(foeTopCard.ownerId, foe.playerId);

  const endTurnResult = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(endTurnResult.ok, true);
  assert.equal(foe.discard.includes(foeTopCard), true);
});

test("wild magic foe-deck play takes ownership of ongoing cards and keeps them controlled", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  const foe = state.players.find((player) => player.playerId !== state.activePlayerId);
  assert.ok(activePlayer);
  assert.ok(foe);
  replaceFirstWizardProperty(state, activePlayer, createOnPlayOngoingChipWizardProperty("fixture-wild-magic-ongoing-property"));
  const foeTopCardDefinition = createFixtureCardDefinition(
    "fixture-wild-magic-foe-ongoing",
    [{ effectId: "add_power", timing: "onPlay", amount: 1 }],
    { isOngoing: true },
  );
  const wildMagicDefinition = createFixtureCardDefinition("fixture-wild-magic-foe-ongoing-first", [
    {
      effectId: "wild_magic_choice",
      timing: "onPlay",
      options: [
        {
          targetSelector: "chosenFoe",
          effectId: "play_top_card_from_foe_deck",
          nonOngoingCleanupDestination: "ownerDiscard",
          ongoingOwnership: "controller",
        },
      ],
    },
  ]);
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [foeTopCardDefinition.cardId, foeTopCardDefinition],
    [wildMagicDefinition.cardId, wildMagicDefinition],
  ]);
  const foeTopCard: CardInstance = {
    instanceId: "fixture-wild-magic-foe-ongoing-card",
    definitionId: foeTopCardDefinition.cardId,
    ownerId: foe.playerId,
    marketChips: 0,
  };
  const wildMagic: CardInstance = {
    instanceId: "fixture-wild-magic-foe-ongoing-card-source",
    definitionId: wildMagicDefinition.cardId,
    ownerId: activePlayer.playerId,
    marketChips: 0,
  };
  foe.deck.unshift(foeTopCard);
  activePlayer.hand.push(wildMagic);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wildMagic.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 1);
  assert.equal(activePlayer.chips, 1);
  assert.equal(foeTopCard.ownerId, activePlayer.playerId);
  assert.equal(activePlayer.permanents.includes(foeTopCard), true);
  assert.equal(foe.permanents.includes(foeTopCard), false);

  const endTurnResult = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(endTurnResult.ok, true);
  assert.equal(activePlayer.permanents.includes(foeTopCard), true);
  assert.equal(activePlayer.discard.includes(foeTopCard), false);
  assert.equal(foe.discard.includes(foeTopCard), false);
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

test("Basic Trophy grants a chip at the end of its controller's turn", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  activePlayer.trophyLikeObjects.push(createBasicTrophy(activePlayer.playerId));

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.chips, 1);
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "trophyChipGranted" && event.playerId === activePlayer.playerId && event.effectId === "basicTrophy";
    }),
  );
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

test("active player can activate a controlled permanent once per turn", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const permanent = addFixtureCardToActiveHand(
    state,
    {
      effectId: "add_power",
      timing: "activation",
      amount: 2,
      activationLimit: "oncePerTurnWhileControlled",
    },
    { isOngoing: true },
  );

  const playResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: permanent,
  });
  assert.equal(playResult.ok, true);
  assert.ok(listLegalActions(state).some((action) => action.type === "activatePermanent" && action.cardInstanceId === permanent));

  const activationResult = applyAction(state, {
    type: "activatePermanent",
    cardInstanceId: permanent,
  });

  assert.equal(activationResult.ok, true);
  assert.equal(state.turn.power, 2);
  assert.equal(
    listLegalActions(state).some((action) => action.type === "activatePermanent" && action.cardInstanceId === permanent),
    false,
  );
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "cardActivated" && event.playerId === activePlayer.playerId && event.cardInstanceId === permanent;
    }),
  );
});

test("active player can activate a wizard property only when its control-count condition is met", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const property = replaceFirstWizardProperty(
    state,
    activePlayer,
    createChipActivationWizardProperty("fixture-chip-property", ["treasure", "creature"], 2),
  );
  assert.equal(
    listLegalActions(state).some((action) => action.type === "activateWizardProperty" && action.tokenInstanceId === property.instanceId),
    false,
  );
  addControlledFixturePermanent(state, activePlayer, "fixture-controlled-treasure", ["treasure"]);
  addControlledFixturePermanent(state, activePlayer, "fixture-controlled-creature", ["creature"]);

  assert.ok(
    listLegalActions(state).some((action) => action.type === "activateWizardProperty" && action.tokenInstanceId === property.instanceId),
  );
  const result = applyAction(state, {
    type: "activateWizardProperty",
    tokenInstanceId: property.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.chips, 1);
  assert.equal(
    listLegalActions(state).some((action) => action.type === "activateWizardProperty" && action.tokenInstanceId === property.instanceId),
    false,
  );
});

test("wizard property on-play trigger grants chips only for matching ongoing cards", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  replaceFirstWizardProperty(state, activePlayer, createOnPlayOngoingChipWizardProperty("fixture-ongoing-play-property"));
  const ongoingCardId = addFixtureCardToActiveHand(state, { effectId: "add_power", timing: "onPlay", amount: 0 }, {
    isOngoing: true,
  });
  const normalCardId = addFixtureCardToActiveHand(state, { effectId: "add_power", timing: "onPlay", amount: 0 });

  assert.equal(applyAction(state, { type: "playCard", cardInstanceId: normalCardId }).ok, true);
  assert.equal(activePlayer.chips, 0);
  assert.equal(applyAction(state, { type: "playCard", cardInstanceId: ongoingCardId }).ok, true);
  assert.equal(activePlayer.chips, 1);
});

test("wizard property optional topdeck for gained cards runs before normal discard", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  replaceFirstWizardProperty(state, activePlayer, createTopdeckOnGainWizardProperty("fixture-topdeck-creature-property", ["creature"]));
  const creature = addFixtureMarketCard(state, "fixture-gained-creature", ["creature"], 0);
  const spell = addFixtureMarketCard(state, "fixture-gained-spell", ["spell"], 0);

  assert.equal(applyAction(state, { type: "buyMarketCard", cardInstanceId: creature.instanceId, source: "mainMarket" }).ok, true);
  assert.equal(activePlayer.deck[0], creature);
  assert.equal(activePlayer.discard.includes(creature), false);

  assert.equal(applyAction(state, { type: "buyMarketCard", cardInstanceId: spell.instanceId, source: "mainMarket" }).ok, true);
  assert.equal(activePlayer.discard.includes(spell), true);
});

test("temporary hand limit modifier counts cards gained this turn and resets after drawing", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  replaceFirstWizardProperty(state, activePlayer, createTemporaryHandLimitWizardProperty("fixture-spell-hand-limit-property", ["spell"]));
  activePlayer.hand.splice(0);
  activePlayer.deck.splice(0, activePlayer.deck.length, ...createFixtureCardInstances("fixture-filler", activePlayer.playerId, 7));
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [createFixtureCardDefinition("fixture-filler", []).cardId, createFixtureCardDefinition("fixture-filler", [])],
  ]);
  const firstSpell = addFixtureMarketCard(state, "fixture-gained-spell-1", ["spell"], 0);
  const secondSpell = addFixtureMarketCard(state, "fixture-gained-spell-2", ["spell"], 0);
  const creature = addFixtureMarketCard(state, "fixture-gained-creature-1", ["creature"], 0);

  assert.equal(applyAction(state, { type: "buyMarketCard", cardInstanceId: firstSpell.instanceId, source: "mainMarket" }).ok, true);
  assert.equal(applyAction(state, { type: "buyMarketCard", cardInstanceId: secondSpell.instanceId, source: "mainMarket" }).ok, true);
  assert.equal(applyAction(state, { type: "buyMarketCard", cardInstanceId: creature.instanceId, source: "mainMarket" }).ok, true);
  assert.equal(applyAction(state, { type: "endTurn" }).ok, true);

  assert.equal(activePlayer.hand.length, 7);
  assert.deepEqual(state.turn.gainedCardDefinitionIds, []);
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

test("gain_card moves the first legal market card into the active player's discard", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const gainedCard = state.common.market[0];
  assert.ok(gainedCard);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "gain_card",
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
        event.effectId === "gain_card" &&
        event.targetCardInstanceId === gainedCard.instanceId &&
        event.targetDefinitionId === gainedCard.definitionId
      );
    }),
  );
});

test("buying and gain_card share gained-card movement guarantees", () => {
  const buyState = initializeGame({ rootDir, seed: 60615 });
  const gainState = initializeGame({ rootDir, seed: 60615 });
  const bought = prepareGainedMovementFixture(buyState, "fixture-shared-buy-card");
  const gained = prepareGainedMovementFixture(gainState, "fixture-shared-gain-card");

  const buyResult = applyAction(buyState, {
    type: "buyMarketCard",
    source: "mainMarket",
    cardInstanceId: bought.card.instanceId,
  });
  const gainCardId = addFixtureCardToActiveHand(gainState, {
    effectId: "gain_card",
    timing: "onPlay",
    target: {
      selector: "mainMarketCard",
    },
    destination: "discard",
  });
  const gainResult = applyAction(gainState, {
    type: "playCard",
    cardInstanceId: gainCardId,
  });

  assert.equal(buyResult.ok, true);
  assert.equal(gainResult.ok, true);
  assertGainedMovementGuarantees(buyState, bought.player, bought.card, "cardBought");
  assertGainedMovementGuarantees(gainState, gained.player, gained.card, "effectCardGained");
});

test("discard_card moves the first legal hand card into the active player's discard", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const discardedCard = activePlayer.hand[0];
  assert.ok(discardedCard);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "discard_card",
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
        event.effectId === "discard_card" &&
        event.targetCardInstanceId === discardedCard.instanceId &&
        event.targetDefinitionId === discardedCard.definitionId
      );
    }),
  );
});

test("destroy_card moves a normal card to the destroyed zone and preserves ownership", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const destroyedCard = activePlayer.hand[0];
  assert.ok(destroyedCard);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "destroy_card",
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
  assert.equal(activePlayer.hand.includes(destroyedCard), false);
  assert.equal(activePlayer.discard.includes(destroyedCard), false);
  assert.equal(state.common.destroyedPile.includes(destroyedCard), true);
  assert.equal(state.common.destroyedMayhem.includes(destroyedCard), false);
  assert.equal(state.common.destroyedMegaMayhem.includes(destroyedCard), false);
  assert.equal(destroyedCard.ownerId, activePlayer.playerId);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectCardDestroyed" &&
        event.playerId === activePlayer.playerId &&
        event.effectId === "destroy_card" &&
        event.targetCardInstanceId === destroyedCard.instanceId &&
        event.targetDefinitionId === destroyedCard.definitionId
      );
    }),
  );
});

test("destroy_card routes wild magic and limp wand cards back to their stacks", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const wildMagic = state.common.wildMagicStack.shift();
  const limpWand = state.common.limpWandStack.shift();
  assert.ok(wildMagic);
  assert.ok(limpWand);
  wildMagic.ownerId = activePlayer.playerId;
  limpWand.ownerId = activePlayer.playerId;
  activePlayer.hand.unshift(wildMagic, limpWand);
  const wildMagicStackSize = state.common.wildMagicStack.length;
  const limpWandStackSize = state.common.limpWandStack.length;
  const destroyWildMagicCardId = addFixtureCardToActiveHand(state, {
    effectId: "destroy_card",
    timing: "onPlay",
    target: {
      selector: "activePlayerHandCard",
    },
  });

  const wildMagicResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: destroyWildMagicCardId,
  });

  assert.equal(wildMagicResult.ok, true);
  assert.equal(activePlayer.hand.includes(wildMagic), false);
  assert.equal(state.common.wildMagicStack.includes(wildMagic), true);
  assert.equal(state.common.wildMagicStack.length, wildMagicStackSize + 1);
  assert.equal(state.common.limpWandStack.length, limpWandStackSize);
  assert.equal(state.common.destroyedPile.includes(wildMagic), false);
  assert.equal(state.common.destroyedMayhem.includes(wildMagic), false);
  assert.equal(state.common.destroyedMegaMayhem.includes(wildMagic), false);
  const destroyLimpWandCardId = addFixtureCardToActiveHand(state, {
    effectId: "destroy_card",
    timing: "onPlay",
    target: {
      selector: "activePlayerHandCard",
    },
  });

  const limpWandResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: destroyLimpWandCardId,
  });

  assert.equal(limpWandResult.ok, true);
  assert.equal(activePlayer.hand.includes(limpWand), false);
  assert.equal(state.common.limpWandStack.includes(limpWand), true);
  assert.equal(state.common.limpWandStack.length, limpWandStackSize + 1);
  assert.equal(state.common.destroyedPile.includes(limpWand), false);
  assert.equal(state.common.destroyedMayhem.includes(limpWand), false);
  assert.equal(state.common.destroyedMegaMayhem.includes(limpWand), false);
});

test("destroy_card keeps mayhem and megaMayhem cards in ordered event piles", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const existingMayhem = state.common.destroyedMayhem.at(-1);
  const existingMegaMayhem = state.common.destroyedMegaMayhem.at(-1);
  const mayhem = addFixtureCardToActiveHand(
    state,
    {
      effectId: "add_power",
      timing: "onMayhemResolve",
      amount: 0,
    },
    { cardKind: "mayhem" },
  );
  moveHandCardToFront(activePlayer, mayhem);
  const destroyMayhemCardId = addFixtureCardToActiveHand(state, {
    effectId: "destroy_card",
    timing: "onPlay",
    target: {
      selector: "activePlayerHandCard",
    },
  });

  const mayhemResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: destroyMayhemCardId,
  });

  assert.equal(mayhemResult.ok, true);
  assert.equal(state.common.destroyedMayhem.at(-1)?.instanceId, mayhem);
  assert.equal(existingMayhem === undefined || state.common.destroyedMayhem.includes(existingMayhem), true);
  assert.equal(state.common.destroyedPile.some((card) => card.instanceId === mayhem), false);

  const megaMayhem = addFixtureCardToActiveHand(
    state,
    {
      effectId: "add_power",
      timing: "onMayhemResolve",
      amount: 0,
    },
    { cardKind: "megaMayhem" },
  );
  moveHandCardToFront(activePlayer, megaMayhem);
  const destroyMegaMayhemCardId = addFixtureCardToActiveHand(state, {
    effectId: "destroy_card",
    timing: "onPlay",
    target: {
      selector: "activePlayerHandCard",
    },
  });

  const megaMayhemResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: destroyMegaMayhemCardId,
  });

  assert.equal(megaMayhemResult.ok, true);
  assert.equal(state.common.destroyedMegaMayhem.at(-1)?.instanceId, megaMayhem);
  assert.equal(existingMegaMayhem === undefined || state.common.destroyedMegaMayhem.includes(existingMegaMayhem), true);
  assert.equal(state.common.destroyedPile.some((card) => card.instanceId === megaMayhem), false);
});

test("card movement effects skip by default when no legal card choice exists", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  state.common.market.splice(0);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "gain_card",
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

test("reveal_top_card reveals the active player's top deck card without moving it", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const topCard = activePlayer.deck[0];
  assert.ok(topCard);
  const deckSizeBefore = activePlayer.deck.length;
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "reveal_top_card",
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
        event.effectId === "reveal_top_card" &&
        event.targetCardInstanceId === topCard.instanceId &&
        event.targetDefinitionId === topCard.definitionId
      );
    }),
  );
});

test("reveal_top_card shuffles discard into an empty deck before revealing", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const revealedCard = activePlayer.deck[0];
  assert.ok(revealedCard);
  activePlayer.deck.splice(0);
  activePlayer.discard.push(revealedCard);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "reveal_top_card",
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

test("play_top_card plays the active player's top deck card through on-play effects", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const topPlayedCardIndex = activePlayer.hand.findIndex((card) => card.definitionId === "esw2_dbg__ocr_022");
  assert.notEqual(topPlayedCardIndex, -1);
  const topPlayedCard = activePlayer.hand.splice(topPlayedCardIndex, 1).at(0);
  assert.ok(topPlayedCard);
  activePlayer.deck.unshift(topPlayedCard);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "play_top_card",
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
        event.effectId === "play_top_card" &&
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

test("play_top_card triggers wizard property on-play effects and cleans up to owner discard", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  replaceFirstWizardProperty(state, activePlayer, createOnPlayTypeChipWizardProperty("fixture-play-top-property", ["spell"]));
  const topPlayedDefinition = createFixtureCardDefinition(
    "fixture-play-top-spell",
    [{ effectId: "add_power", timing: "onPlay", amount: 1 }],
    { cardTypes: ["spell"] },
  );
  state.cardDefinitions = new Map([...state.cardDefinitions, [topPlayedDefinition.cardId, topPlayedDefinition]]);
  const topPlayedCard: CardInstance = {
    instanceId: "fixture-play-top-spell-instance",
    definitionId: topPlayedDefinition.cardId,
    ownerId: activePlayer.playerId,
    marketChips: 0,
  };
  activePlayer.deck.unshift(topPlayedCard);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "play_top_card",
    timing: "onPlay",
    source: "activePlayerDeck",
    destination: "play",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.chips, 1);
  assert.equal(activePlayer.playedThisTurn.includes(topPlayedCard), true);

  const endTurnResult = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(endTurnResult.ok, true);
  assert.equal(activePlayer.playedThisTurn.includes(topPlayedCard), false);
  assert.equal(activePlayer.discard.includes(topPlayedCard), true);
});

test("deal_damage can kill an opponent, give a neutral DWT, resurrect, and affect scoring", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const targetPlayer = state.players.find((player) => player.playerId !== activePlayer.playerId);
  assert.ok(targetPlayer);
  assert.equal(state.common.deadWizardTokens.status, "available");
  const neutralDwt = state.common.deadWizardTokens.drawStack[0];
  assert.ok(neutralDwt);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "deal_damage",
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
        event.effectId === "deal_damage" &&
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
  const neutralDwtDefinition = state.tokenDefinitions.get(neutralDwt.definitionId);
  assert.equal(neutralDwtDefinition?.kind, "deadWizardToken");
  const expectedTokenScore = neutralDwtDefinition.victoryPoints;
  assert.ok(targetScore);
  assert.equal(targetScore.deadWizardTokenCount, 1);
  assert.equal(targetScore.victoryPoints, expectedCardScore + expectedTokenScore);
});

test("wizard property resurrection life override respects loser-status exception", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const propertyOwner = state.players.find((player) => player.playerId !== activePlayer.playerId);
  assert.ok(propertyOwner);
  propertyOwner.wizardProperties = [
    {
      instanceId: "fixture-wizard-property-010",
      definitionId: "esw2_dbg__wizard_property_010",
      ownerId: propertyOwner.playerId,
    },
  ];
  propertyOwner.life.current = 1;
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "deal_damage",
    timing: "onPlay",
    amount: 1,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(propertyOwner.life.current, 25);

  propertyOwner.statuses.push({
    instanceId: "fixture-loser-status",
    statusId: "loser",
    ownerId: propertyOwner.playerId,
    effects: [],
  });
  propertyOwner.life.current = 1;
  const secondFixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "deal_damage",
    timing: "onPlay",
    amount: 1,
    target: {
      selector: "opponentPlayer",
    },
  });

  const secondResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: secondFixtureCardId,
  });

  assert.equal(secondResult.ok, true);
  assert.equal(propertyOwner.life.current, 20);
});

test("heal uses effective max life and logs clamping without mutating base max life", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  activePlayer.life.current = 10;
  const baseMaxLife = activePlayer.life.max;
  activePlayer.statuses.push(createMaxLifeModifierStatus(activePlayer.playerId, -8));
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "heal",
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
        event.effectId === "heal" &&
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

test("heal below effective max life does not clamp", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  activePlayer.life.current = 10;
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "heal",
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
      return (
        event.type === "effectLifeHealed" &&
        event.playerId === activePlayer.playerId &&
        event.effectId === "heal" &&
        event.amount === 3
      );
    }),
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "playerLifeClamped" && event.playerId === activePlayer.playerId),
    false,
  );
});

test("set_life sets the target player's current life without using healing clamp", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  activePlayer.life.current = 10;
  const baseMaxLife = activePlayer.life.max;
  activePlayer.statuses.push(createMaxLifeModifierStatus(activePlayer.playerId, -8));
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "set_life",
    timing: "onPlay",
    lifeTotal: 30,
    target: {
      selector: "activePlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.life.current, 30);
  assert.equal(activePlayer.life.max, baseMaxLife);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectLifeSet" &&
        event.playerId === activePlayer.playerId &&
        event.targetPlayerId === activePlayer.playerId &&
        event.effectId === "set_life" &&
        event.amount === 30
      );
    }),
  );
  assert.equal(state.eventLog.some((event) => event.type === "effectLifeHealed"), false);
  assert.equal(state.eventLog.some((event) => event.type === "playerLifeClamped"), false);
});

test("attack_damage damages the first opponent when no defense is available", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const targetPlayer = state.players.find((player) => player.playerId !== activePlayer.playerId);
  assert.ok(targetPlayer);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 16);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "attackCreated" &&
        event.playerId === activePlayer.playerId &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.amount === 4
      );
    }),
  );
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "effectDamageDealt" && event.targetPlayerId === targetPlayer.playerId && event.amount === 4;
    }),
  );
});

test("wizard property owned wand attacks gain damage and cannot be avoided", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 9 });
  const propertyOwner = state.players.find((player) => {
    return player.wizardProperties.some((property) => property.definitionId === "esw2_dbg__wizard_property_009");
  });
  assert.ok(propertyOwner);
  const targetPlayer = state.players.find((player) => player.playerId !== propertyOwner.playerId);
  assert.ok(targetPlayer);
  state.activePlayerId = propertyOwner.playerId;
  const wand = findOwnedCard(propertyOwner, "krutagidon_wizard_property_009_hrenalocka_wand");
  assert.ok(wand);
  moveCardToHand(propertyOwner, wand);
  const defenseCard = addFixtureDefenseCardToHand(state, targetPlayer, "discardSelf");

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 18);
  assert.equal(targetPlayer.hand.includes(defenseCard), true);
  assert.equal(state.eventLog.some((event) => event.type === "defenseChoiceSelected"), false);
});

test("wizard property does not affect borrowed wands or non-wand attacks", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 9 });
  const propertyOwner = state.players.find((player) => {
    return player.wizardProperties.some((property) => property.definitionId === "esw2_dbg__wizard_property_009");
  });
  assert.ok(propertyOwner);
  const targetPlayer = state.players.find((player) => player.playerId !== propertyOwner.playerId);
  assert.ok(targetPlayer);
  state.activePlayerId = propertyOwner.playerId;
  const borrowedWand = findOwnedCard(propertyOwner, "krutagidon_wizard_property_009_hrenalocka_wand");
  assert.ok(borrowedWand);
  borrowedWand.ownerId = targetPlayer.playerId;
  moveCardToHand(propertyOwner, borrowedWand);
  const borrowedWandDefense = addFixtureDefenseCardToHand(state, targetPlayer, "discardSelf");

  const borrowedWandResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: borrowedWand.instanceId,
  });

  assert.equal(borrowedWandResult.ok, true);
  assert.equal(targetPlayer.life.current, 20);
  assert.equal(targetPlayer.discard.includes(borrowedWandDefense), true);

  state.activePlayerId = propertyOwner.playerId;
  targetPlayer.life.current = 20;
  const nonWandCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 1,
    targetSelector: "chosenFoe",
  });
  const nonWandDefense = addFixtureDefenseCardToHand(state, targetPlayer, "discardSelf");

  const nonWandResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: nonWandCardId,
  });

  assert.equal(nonWandResult.ok, true);
  assert.equal(targetPlayer.life.current, 20);
  assert.equal(targetPlayer.discard.includes(nonWandDefense), true);
});

test("attack_damage kill awards Basic Trophy to the attacker", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const targetPlayer = state.players.find((player) => player.playerId !== activePlayer.playerId);
  assert.ok(targetPlayer);
  targetPlayer.life.current = 1;
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.ok(activePlayer.trophyLikeObjects.some((trophy) => trophy.trophyId === "basicTrophy"));
  assert.equal(targetPlayer.trophyLikeObjects.some((trophy) => trophy.trophyId === "basicTrophy"), false);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "trophyControlChanged" &&
        event.playerId === activePlayer.playerId &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.effectId === "attack_damage"
      );
    }),
  );
});

test("attack_damage kill transfers Basic Trophy from its previous controller", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const targetPlayer = state.players.find((player) => player.playerId !== activePlayer.playerId);
  assert.ok(targetPlayer);
  targetPlayer.life.current = 1;
  targetPlayer.trophyLikeObjects.push(createBasicTrophy(targetPlayer.playerId));
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.trophyLikeObjects.filter((trophy) => trophy.trophyId === "basicTrophy").length, 1);
  assert.equal(targetPlayer.trophyLikeObjects.some((trophy) => trophy.trophyId === "basicTrophy"), false);
});

test("deal_damage self-kill does not move Basic Trophy", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const trophyController = state.players.find((player) => player.playerId !== activePlayer.playerId);
  assert.ok(trophyController);
  activePlayer.life.current = 1;
  trophyController.trophyLikeObjects.push(createBasicTrophy(trophyController.playerId));
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "deal_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "activePlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.trophyLikeObjects.some((trophy) => trophy.trophyId === "basicTrophy"), false);
  assert.equal(trophyController.trophyLikeObjects.some((trophy) => trophy.trophyId === "basicTrophy"), true);
  assert.equal(state.eventLog.some((event) => event.type === "trophyControlChanged"), false);
});

test("deal_damage kill does not move Basic Trophy", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const targetPlayer = state.players.find((player) => player.playerId !== activePlayer.playerId);
  assert.ok(targetPlayer);
  targetPlayer.life.current = 1;
  targetPlayer.trophyLikeObjects.push(createBasicTrophy(targetPlayer.playerId));
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "deal_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.trophyLikeObjects.some((trophy) => trophy.trophyId === "basicTrophy"), false);
  assert.equal(targetPlayer.trophyLikeObjects.some((trophy) => trophy.trophyId === "basicTrophy"), true);
  assert.equal(state.eventLog.some((event) => event.type === "trophyControlChanged"), false);
});

test("attack_damage can be avoided by the first discard-self defense card in hand", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const targetPlayer = state.players.find((player) => player.playerId !== activePlayer.playerId);
  assert.ok(targetPlayer);
  targetPlayer.life.current = 1;
  const defenseCard = addFixtureDefenseCardToHand(state, targetPlayer, "discardSelf");
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 1);
  assert.equal(targetPlayer.deadWizardTokens.length, 0);
  assert.equal(targetPlayer.hand.includes(defenseCard), false);
  assert.equal(targetPlayer.discard.includes(defenseCard), true);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "defenseChoiceSelected" &&
        event.playerId === targetPlayer.playerId &&
        event.cardInstanceId === defenseCard.instanceId &&
        event.definitionId === defenseCard.definitionId
      );
    }),
  );
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "defenseCardMoved" && event.cardInstanceId === defenseCard.instanceId && event.destination === "discard";
    }),
  );
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "attackAvoided" && event.playerId === targetPlayer.playerId;
    }),
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "effectDamageDealt" && event.targetPlayerId === targetPlayer.playerId),
    false,
  );
});

test("attack_damage can be avoided by a topdeck-self defense card in hand", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const targetPlayer = state.players.find((player) => player.playerId !== activePlayer.playerId);
  assert.ok(targetPlayer);
  targetPlayer.life.current = 1;
  const previousTopDeckCard = targetPlayer.deck[0];
  assert.ok(previousTopDeckCard);
  const defenseCard = addFixtureDefenseCardToHand(state, targetPlayer, "topdeckSelf");
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 1);
  assert.equal(targetPlayer.deadWizardTokens.length, 0);
  assert.equal(targetPlayer.hand.includes(defenseCard), false);
  assert.equal(targetPlayer.deck[0], defenseCard);
  assert.equal(targetPlayer.deck[1], previousTopDeckCard);
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "defenseCardMoved" && event.cardInstanceId === defenseCard.instanceId && event.destination === "deckTop";
    }),
  );
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "attackAvoided" && event.playerId === targetPlayer.playerId;
    }),
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "effectDamageDealt" && event.targetPlayerId === targetPlayer.playerId),
    false,
  );
});

test("avoid_attack defense with an unpayable discard-other-card cost is not legal", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const targetPlayer = state.players.find((player) => player.playerId !== activePlayer.playerId);
  assert.ok(targetPlayer);
  targetPlayer.hand.splice(0);
  addFixtureDefenseCardToHand(state, targetPlayer, "discardSelf", {
    costs: [{ costId: "discard_other_hand_card" }],
  });
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 16);
  assert.equal(state.eventLog.some((event) => event.type === "defenseChoiceSelected"), false);
});

test("avoid_attack defense pays discard, chip, and nonlethal life costs before avoiding an attack", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const targetPlayer = state.players.find((player) => player.playerId !== activePlayer.playerId);
  assert.ok(targetPlayer);
  targetPlayer.chips = 3;
  targetPlayer.life.current = 5;
  const paidDiscard = targetPlayer.hand[0];
  assert.ok(paidDiscard);
  const defenseCard = addFixtureDefenseCardToHand(state, targetPlayer, "discardSelf", {
    costs: [{ costId: "discard_other_hand_card" }, { costId: "spend_chips", amount: 2 }, { costId: "pay_life", amount: 4 }],
  });
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 1);
  assert.equal(targetPlayer.chips, 1);
  assert.equal(targetPlayer.hand.includes(paidDiscard), false);
  assert.equal(targetPlayer.discard.includes(paidDiscard), true);
  assert.equal(targetPlayer.discard.includes(defenseCard), true);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "defenseCostPaid" &&
        event.playerId === targetPlayer.playerId &&
        event.cardInstanceId === defenseCard.instanceId &&
        event.targetCardInstanceId === paidDiscard.instanceId &&
        event.effectId === "discard_other_hand_card"
      );
    }),
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "defenseCostPaid" &&
        event.playerId === targetPlayer.playerId &&
        event.cardInstanceId === defenseCard.instanceId &&
        event.effectId === "spend_chips" &&
        event.amount === 2
      );
    }),
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "defenseCostPaid" &&
        event.playerId === targetPlayer.playerId &&
        event.cardInstanceId === defenseCard.instanceId &&
        event.effectId === "pay_life" &&
        event.amount === 4
      );
    }),
  );
  assert.ok(state.eventLog.some((event) => event.type === "attackAvoided"));
});

test("avoid_attack defense with a lethal life cost is skipped for the next legal defense option", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const targetPlayer = state.players.find((player) => player.playerId !== activePlayer.playerId);
  assert.ok(targetPlayer);
  targetPlayer.life.current = 5;
  addFixtureDefenseCardToHand(state, targetPlayer, "discardSelf", {
    costs: [{ costId: "pay_life", amount: 5 }],
  });
  const legalDefense = addFixtureDefenseCardToHand(state, targetPlayer, "discardSelf");
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 5);
  assert.equal(targetPlayer.discard.includes(legalDefense), true);
  assert.ok(
    state.eventLog.some((event) => {
      return event.type === "defenseChoiceSelected" && event.cardInstanceId === legalDefense.instanceId;
    }),
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseCostPaid" && event.effectId === "pay_life"),
    false,
  );
});

test("avoid_attack defense runs supported branch effects through the shared effect runtime after costs are paid", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const targetPlayer = state.players.find((player) => player.playerId !== activePlayer.playerId);
  assert.ok(targetPlayer);
  targetPlayer.chips = 1;
  const defenseCard = addFixtureDefenseCardToHand(state, targetPlayer, "discardSelf", {
    costs: [{ costId: "spend_chips", amount: 1 }],
    branchEffects: [
      {
        effectId: "add_power",
        timing: "onDefense",
        amount: 2,
      },
    ],
  });
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.chips, 0);
  assert.equal(state.turn.power, 2);
  const costEventIndex = state.eventLog.findIndex((event) => {
    return event.type === "defenseCostPaid" && event.cardInstanceId === defenseCard.instanceId;
  });
  const branchEventIndex = state.eventLog.findIndex((event) => {
    return (
      event.type === "effectAddPowerApplied" &&
      event.playerId === targetPlayer.playerId &&
      event.cardInstanceId === defenseCard.instanceId &&
      event.definitionId === defenseCard.definitionId &&
      event.effectId === "add_power" &&
      event.amount === 2
    );
  });
  assert.ok(costEventIndex >= 0);
  assert.ok(branchEventIndex > costEventIndex);
});

test("multi_target_attack resolves each opponent in seating order before moving to the next target", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const targets = getOpponentsInSeatingOrder(state, activePlayer);
  assert.equal(targets.length, 2);
  const [firstTarget, secondTarget] = targets;
  assert.ok(firstTarget);
  assert.ok(secondTarget);
  firstTarget.life.current = 1;
  secondTarget.life.current = 1;
  state.common.deadWizardTokens.drawStack.splice(1);
  const onlyDwt = state.common.deadWizardTokens.drawStack[0];
  assert.ok(onlyDwt);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "multi_target_attack",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayers",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(firstTarget.life.current, 20);
  assert.equal(secondTarget.life.current, 20);
  assert.equal(firstTarget.deadWizardTokens.length, 1);
  assert.equal(firstTarget.deadWizardTokens[0], onlyDwt);
  assert.equal(secondTarget.deadWizardTokens.length, 0);
  assertEventOrder(state, [
    (event) => event.type === "attackTargetStarted" && event.targetPlayerId === firstTarget.playerId,
    (event) => event.type === "effectDamageDealt" && event.targetPlayerId === firstTarget.playerId,
    (event) => event.type === "playerDied" && event.playerId === firstTarget.playerId,
    (event) => event.type === "playerResurrected" && event.playerId === firstTarget.playerId,
    (event) => event.type === "attackTargetStarted" && event.targetPlayerId === secondTarget.playerId,
    (event) => event.type === "effectDamageDealt" && event.targetPlayerId === secondTarget.playerId,
    (event) => event.type === "playerDied" && event.playerId === secondTarget.playerId,
  ]);
});

test("multi_target_attack opens a separate defense window for each target", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const [firstTarget, secondTarget] = getOpponentsInSeatingOrder(state, activePlayer);
  assert.ok(firstTarget);
  assert.ok(secondTarget);
  firstTarget.life.current = 1;
  secondTarget.life.current = 10;
  const defenseCard = addFixtureDefenseCardToHand(state, firstTarget, "discardSelf");
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "multi_target_attack",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayers",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(firstTarget.life.current, 1);
  assert.equal(firstTarget.deadWizardTokens.length, 0);
  assert.equal(firstTarget.discard.includes(defenseCard), true);
  assert.equal(secondTarget.life.current, 6);
  assertEventOrder(state, [
    (event) => event.type === "attackTargetStarted" && event.targetPlayerId === firstTarget.playerId,
    (event) => event.type === "defenseChoiceSelected" && event.playerId === firstTarget.playerId,
    (event) => event.type === "attackAvoided" && event.targetPlayerId === firstTarget.playerId,
    (event) => event.type === "attackTargetStarted" && event.targetPlayerId === secondTarget.playerId,
    (event) => event.type === "effectDamageDealt" && event.targetPlayerId === secondTarget.playerId,
  ]);
});

test("mayhem_attack collects decisions for all players before resolving damage in active-player order", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const orderedPlayers = getPlayersInActiveOrder(state);
  assert.equal(orderedPlayers[0], activePlayer);
  const secondPlayer = orderedPlayers[1];
  const thirdPlayer = orderedPlayers[2];
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);
  activePlayer.life.current = 10;
  secondPlayer.life.current = 1;
  thirdPlayer.life.current = 1;
  const defenseCard = addFixtureDefenseCardToHand(state, secondPlayer, "discardSelf");
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "mayhem_attack",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "allPlayers",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.life.current, 6);
  assert.equal(secondPlayer.life.current, 1);
  assert.equal(thirdPlayer.life.current, 20);
  assert.equal(secondPlayer.discard.includes(defenseCard), true);
  assertEventOrder(state, [
    (event) => event.type === "mayhemDecisionPhaseStarted",
    (event) => event.type === "mayhemDecisionStarted" && event.targetPlayerId === activePlayer.playerId,
    (event) => event.type === "mayhemDecisionStarted" && event.targetPlayerId === secondPlayer.playerId,
    (event) => event.type === "defenseChoiceSelected" && event.playerId === secondPlayer.playerId,
    (event) => event.type === "mayhemDecisionStarted" && event.targetPlayerId === thirdPlayer.playerId,
    (event) => event.type === "mayhemResolutionPhaseStarted",
    (event) => event.type === "attackTargetStarted" && event.targetPlayerId === activePlayer.playerId,
    (event) => event.type === "effectDamageDealt" && event.targetPlayerId === activePlayer.playerId,
    (event) => event.type === "mayhemTargetSkipped" && event.targetPlayerId === secondPlayer.playerId,
    (event) => event.type === "attackTargetStarted" && event.targetPlayerId === thirdPlayer.playerId,
    (event) => event.type === "playerDied" && event.playerId === thirdPlayer.playerId,
  ]);
});

test("mayhem_attack kill does not move Basic Trophy", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const orderedPlayers = getPlayersInActiveOrder(state);
  const targetPlayer = orderedPlayers[2];
  assert.ok(targetPlayer);
  targetPlayer.life.current = 1;
  targetPlayer.trophyLikeObjects.push(createBasicTrophy(targetPlayer.playerId));
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "mayhem_attack",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "allPlayers",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.trophyLikeObjects.some((trophy) => trophy.trophyId === "basicTrophy"), false);
  assert.equal(targetPlayer.trophyLikeObjects.some((trophy) => trophy.trophyId === "basicTrophy"), true);
  assert.equal(state.eventLog.some((event) => event.type === "trophyControlChanged"), false);
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

function prepareGainedMovementFixture(
  state: GameState,
  cardId: string,
): {
  player: PlayerState;
  card: CardInstance;
} {
  const player = state.players.find((candidate) => candidate.playerId === state.activePlayerId);
  assert.ok(player);
  replaceFirstWizardProperty(state, player, createTopdeckOnGainWizardProperty(`${cardId}-property`, ["treasure"]));
  const definition = createFixtureCardDefinition(cardId, [], {
    cardTypes: ["treasure"],
  });
  state.cardDefinitions = new Map([...state.cardDefinitions, [definition.cardId, definition]]);
  const card: CardInstance = {
    instanceId: `${cardId}-instance`,
    definitionId: definition.cardId,
    ownerId: "common",
    marketChips: 2,
  };
  state.common.market.splice(0, state.common.market.length, card);
  return {
    player,
    card,
  };
}

function assertGainedMovementGuarantees(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
  completionEventType: "cardBought" | "effectCardGained",
): void {
  assert.equal(state.common.market.includes(card), false);
  assert.equal(player.deck[0], card);
  assert.equal(player.discard.includes(card), false);
  assert.equal(card.ownerId, player.playerId);
  assert.equal(card.marketChips, 0);
  assert.equal(player.chips, 2);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "marketChipsGained" &&
        event.playerId === player.playerId &&
        event.cardInstanceId === card.instanceId &&
        event.amount === 2
      );
    }),
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectChoiceSelected" &&
        event.playerId === player.playerId &&
        event.targetCardInstanceId === card.instanceId &&
        event.effectId === "topdeck_gained_card"
      );
    }),
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === completionEventType &&
        event.playerId === player.playerId &&
        (event.cardInstanceId === card.instanceId || event.targetCardInstanceId === card.instanceId) &&
        event.destination === "deckTop"
      );
    }),
  );
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

function getOpponentsInSeatingOrder(state: GameState, player: PlayerState): PlayerState[] {
  const playerIndex = state.players.findIndex((candidate) => candidate.playerId === player.playerId);
  assert.notEqual(playerIndex, -1);
  return Array.from({ length: state.players.length - 1 }, (_, offset) => {
    return state.players[(playerIndex + offset + 1) % state.players.length];
  }).filter((candidate): candidate is PlayerState => candidate !== undefined);
}

function getPlayersInActiveOrder(state: GameState): PlayerState[] {
  const activePlayerIndex = state.players.findIndex((candidate) => candidate.playerId === state.activePlayerId);
  assert.notEqual(activePlayerIndex, -1);
  return Array.from({ length: state.players.length }, (_, offset) => {
    return state.players[(activePlayerIndex + offset) % state.players.length];
  }).filter((candidate): candidate is PlayerState => candidate !== undefined);
}

function assertEventOrder(state: GameState, predicates: Array<(event: GameState["eventLog"][number]) => boolean>): void {
  let searchFrom = 0;
  for (const predicate of predicates) {
    const eventIndex = state.eventLog.findIndex((event, index) => index >= searchFrom && predicate(event));
    assert.notEqual(eventIndex, -1);
    searchFrom = eventIndex + 1;
  }
}

function addFixtureCardToActiveHand(
  state: GameState,
  effect: unknown,
  options: {
    isOngoing?: boolean;
    cardTypes?: string[];
    cardKind?: CardDefinition["engine"]["cardKind"];
  } = {},
): string {
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  assert.ok(activePlayer);
  const definition = createFixtureCardDefinition(`fixture-targeted-effect-card-${activePlayer.hand.length + 1}`, [effect], options);
  state.cardDefinitions = new Map([...state.cardDefinitions, [definition.cardId, definition]]);

  const cardInstanceId = `fixture-card-${activePlayer.hand.length + 1}`;
  activePlayer.hand.push({
    instanceId: cardInstanceId,
    definitionId: definition.cardId,
    ownerId: activePlayer.playerId,
    marketChips: 0,
  });

  return cardInstanceId;
}

function findOwnedCard(player: PlayerState, definitionId: string): CardInstance | undefined {
  return [...player.hand, ...player.deck, ...player.discard, ...player.playedThisTurn, ...player.permanents].find((card) => {
    return card.definitionId === definitionId;
  });
}

function moveCardToHand(player: PlayerState, card: CardInstance): void {
  for (const zone of [player.hand, player.deck, player.discard, player.playedThisTurn, player.permanents]) {
    const cardIndex = zone.findIndex((candidate) => candidate.instanceId === card.instanceId);
    if (cardIndex >= 0) {
      zone.splice(cardIndex, 1);
    }
  }

  player.hand.push(card);
}

function moveHandCardToFront(player: PlayerState, cardInstanceId: string): void {
  const cardIndex = player.hand.findIndex((card) => card.instanceId === cardInstanceId);
  assert.notEqual(cardIndex, -1);
  const [card] = player.hand.splice(cardIndex, 1);
  assert.ok(card);
  player.hand.unshift(card);
}

function createFixtureCardDefinition(
  cardId: string,
  effects: unknown[],
  options: {
    isOngoing?: boolean;
    cardTypes?: string[];
    cardKind?: CardDefinition["engine"]["cardKind"];
  } = {},
): CardDefinition {
  const cardKind = options.cardKind ?? "normal";
  return {
    schemaVersion: 1,
    cardId,
    visible: {
      nameRu: cardId,
      cost: 0,
      victoryPoints: 0,
      typeRu: null,
      cardKind,
      cardTypes: options.cardTypes ?? [],
      markers: [],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind,
      cardTypes: options.cardTypes ?? [],
      cost: 0,
      victoryPoints: 0,
      isOngoing: options.isOngoing ?? false,
      marketChipMarker: false,
      effects,
      unsupportedMechanics: [],
    },
  };
}

function addControlledFixturePermanent(
  state: GameState,
  player: PlayerState,
  cardId: string,
  cardTypes: string[],
): CardInstance {
  const definition = createFixtureCardDefinition(cardId, [], {
    isOngoing: true,
    cardTypes,
  });
  state.cardDefinitions = new Map([...state.cardDefinitions, [definition.cardId, definition]]);
  const card: CardInstance = {
    instanceId: `${cardId}-instance`,
    definitionId: definition.cardId,
    ownerId: player.playerId,
    marketChips: 0,
  };
  player.permanents.push(card);
  return card;
}

function addFixtureMarketCard(state: GameState, cardId: string, cardTypes: string[], cost: number): CardInstance {
  const definition = createFixtureCardDefinition(cardId, [], {
    cardTypes,
  });
  definition.engine.cost = cost;
  definition.visible.cost = cost;
  state.cardDefinitions = new Map([...state.cardDefinitions, [definition.cardId, definition]]);
  const card: CardInstance = {
    instanceId: `${cardId}-instance`,
    definitionId: definition.cardId,
    ownerId: "common",
    marketChips: 0,
  };
  state.common.market.push(card);
  return card;
}

function createFixtureCardInstances(
  definitionId: string,
  ownerId: PlayerState["playerId"],
  count: number,
): CardInstance[] {
  return Array.from({ length: count }, (_, index) => ({
    instanceId: `${definitionId}-${index + 1}`,
    definitionId,
    ownerId,
    marketChips: 0,
  }));
}

function replaceFirstWizardProperty(
  state: GameState,
  player: PlayerState,
  definition: TokenDefinition,
): PlayerState["wizardProperties"][number] {
  const property = player.wizardProperties[0];
  assert.ok(property);
  state.tokenDefinitions = new Map([...state.tokenDefinitions, [definition.tokenId, definition]]);
  property.definitionId = definition.tokenId;
  return property;
}

function createChipActivationWizardProperty(tokenId: string, cardTypes: string[], minimumCount: number): TokenDefinition {
  return {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    engine: {
      mappingStatus: "fixture",
      playableInV0: true,
      effects: [
        {
          effectId: "gain_chips",
          timing: "activation",
          amount: 1,
          condition: {
            conditionId: "control_count",
            cardTypes,
            minimumCount,
          },
        },
      ],
      unsupportedMechanics: [],
    },
  };
}

function createOnPlayOngoingChipWizardProperty(tokenId: string): TokenDefinition {
  return {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    engine: {
      mappingStatus: "fixture",
      playableInV0: true,
      effects: [
        {
          effectId: "gain_chips",
          timing: "onPlayCard",
          isOngoing: true,
          amount: 1,
        },
      ],
      unsupportedMechanics: [],
    },
  };
}

function createOnPlayTypeChipWizardProperty(tokenId: string, cardTypes: string[]): TokenDefinition {
  return {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    engine: {
      mappingStatus: "fixture",
      playableInV0: true,
      effects: [
        {
          effectId: "gain_chips",
          timing: "onPlayCard",
          cardTypes,
          amount: 1,
        },
      ],
      unsupportedMechanics: [],
    },
  };
}

function createTopdeckOnGainWizardProperty(tokenId: string, cardTypes: string[]): TokenDefinition {
  return {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    engine: {
      mappingStatus: "fixture",
      playableInV0: true,
      effects: [
        {
          effectId: "topdeck_gained_card",
          timing: "onGainCard",
          optional: true,
          cardTypes,
        },
      ],
      unsupportedMechanics: [],
    },
  };
}

function createTemporaryHandLimitWizardProperty(tokenId: string, cardTypes: string[]): TokenDefinition {
  return {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    engine: {
      mappingStatus: "fixture",
      playableInV0: true,
      effects: [
        {
          effectId: "temporary_hand_limit_by_gained_card_type",
          timing: "endTurn",
          amount: 1,
          cardTypes,
        },
      ],
      unsupportedMechanics: [],
    },
  };
}

function addFixtureDefenseCardToHand(
  state: GameState,
  player: PlayerState,
  destination: "discardSelf" | "topdeckSelf",
  options: {
    costs?: unknown[];
    branchEffects?: unknown[];
  } = {},
): CardInstance {
  const definition: CardDefinition = {
    schemaVersion: 1,
    cardId: `fixture-defense-${destination}-${player.hand.length + 1}`,
    visible: {
      nameRu: `Fixture defense ${destination}`,
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
      effects: [
        {
          effectId: "avoid_attack",
          timing: "onDefense",
          destination,
          costs: options.costs,
          branchEffects: options.branchEffects,
        },
      ],
      unsupportedMechanics: [],
    },
  };
  state.cardDefinitions = new Map([...state.cardDefinitions, [definition.cardId, definition]]);

  const card: CardInstance = {
    instanceId: `fixture-defense-card-${player.hand.length + 1}`,
    definitionId: definition.cardId,
    ownerId: player.playerId,
    marketChips: 0,
  };
  player.hand.push(card);
  return card;
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

function createBasicTrophy(ownerId: PlayerState["playerId"]): PlayerState["trophyLikeObjects"][number] {
  return {
    instanceId: "basic-trophy",
    trophyId: "basicTrophy",
    ownerId,
    effects: [],
  };
}
