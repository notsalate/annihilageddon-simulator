import type { CardDefinition } from "./data.js";
import { executeOnPlayEffects } from "./effect-runtime.js";
import { calculateEffectiveCardCost } from "./effective-values.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";

export type LegalAction = PlayCardAction | BuyMarketCardAction | EndTurnAction;
export type GameAction = LegalAction;

export interface PlayCardAction {
  type: "playCard";
  cardInstanceId: string;
}

export interface BuyMarketCardAction {
  type: "buyMarketCard";
  cardInstanceId: string;
  source: BuySource;
}

export type BuySource = "mainMarket" | "legendMarket" | "wildMagicStack";

export interface EndTurnAction {
  type: "endTurn";
}

export type ActionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

export function listLegalActions(state: GameState): LegalAction[] {
  const activePlayer = mustGetActivePlayer(state);
  return [
    ...activePlayer.hand.map((card) => ({
      type: "playCard" as const,
      cardInstanceId: card.instanceId,
    })),
    ...state.common.market
      .filter((card) => canAfford(state, activePlayer, card))
      .map((card) => ({
        type: "buyMarketCard" as const,
        cardInstanceId: card.instanceId,
        source: "mainMarket" as const,
      })),
    ...state.common.legendMarket
      .filter((card) => canAffordWithChips(state, activePlayer, card))
      .map((card) => ({
        type: "buyMarketCard" as const,
        cardInstanceId: card.instanceId,
        source: "legendMarket" as const,
      })),
    ...getWildMagicBuyAction(state),
    {
      type: "endTurn",
    },
  ];
}

export function applyAction(state: GameState, action: GameAction): ActionResult {
  switch (action.type) {
    case "playCard":
      return playCard(state, action.cardInstanceId);
    case "buyMarketCard":
      return buyMarketCard(state, action);
    case "endTurn":
      return endTurn(state);
  }
}

function endTurn(state: GameState): ActionResult {
  const activePlayer = mustGetActivePlayer(state);
  activePlayer.discard.push(...activePlayer.hand.splice(0));
  activePlayer.discard.push(...activePlayer.playedThisTurn.splice(0));
  state.turn.power = 0;
  state.eventLog.push({
    type: "turnEnded",
    playerId: activePlayer.playerId,
  });

  drawCards(activePlayer, 5, state);
  state.turn.number += 1;
  state.activePlayerId = getNextPlayer(state, activePlayer).playerId;
  refillMarkets(state);
  state.eventLog.push({
    type: "turnStarted",
    playerId: state.activePlayerId,
  });

  return { ok: true };
}

function buyMarketCard(state: GameState, action: BuyMarketCardAction): ActionResult {
  const activePlayer = mustGetActivePlayer(state);
  const sourceZone = getBuySourceZone(state, action.source);
  const cardIndex = sourceZone.findIndex((card) => card.instanceId === action.cardInstanceId);
  if (cardIndex < 0) {
    return {
      ok: false,
      error: `Card is not in ${action.source}`,
    };
  }

  const card = sourceZone[cardIndex];
  if (card === undefined) {
    return {
      ok: false,
      error: `Card is not in ${action.source}`,
    };
  }

  const definition = mustGetDefinition(state, card.definitionId);
  const cost = calculateEffectiveCardCost(state, activePlayer.playerId, definition);
  const payment = calculatePayment(state, activePlayer, cost, action.source);
  if (payment === undefined) {
    return {
      ok: false,
      error: "Not enough power to buy card",
    };
  }

  sourceZone.splice(cardIndex, 1);
  state.turn.power = payment.remainingPower;
  activePlayer.chips = payment.remainingChips;
  card.ownerId = activePlayer.playerId;
  activePlayer.discard.push(card);
  state.eventLog.push({
    type: "cardBought",
    playerId: activePlayer.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
  });

  return { ok: true };
}

function playCard(state: GameState, cardInstanceId: string): ActionResult {
  const activePlayer = mustGetActivePlayer(state);
  const cardIndex = activePlayer.hand.findIndex((card) => card.instanceId === cardInstanceId);
  if (cardIndex < 0) {
    return {
      ok: false,
      error: "Card is not in the active player's hand",
    };
  }

  const card = activePlayer.hand[cardIndex];
  if (card === undefined) {
    return {
      ok: false,
      error: "Card is not in the active player's hand",
    };
  }

  activePlayer.hand.splice(cardIndex, 1);
  const definition = mustGetDefinition(state, card.definitionId);
  if (definition.engine.isOngoing) {
    activePlayer.permanents.push(card);
  } else {
    activePlayer.playedThisTurn.push(card);
  }

  const effectResult = executeOnPlayEffects(state, activePlayer, definition, {
    sourceType: "card",
    playerId: activePlayer.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
  });
  if (!effectResult.ok) {
    return effectResult;
  }

  state.eventLog.push({
    type: "cardPlayed",
    playerId: activePlayer.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
  });

  return { ok: true };
}

function canAfford(state: GameState, player: PlayerState, card: CardInstance): boolean {
  const definition = mustGetDefinition(state, card.definitionId);
  return calculateEffectiveCardCost(state, player.playerId, definition) <= state.turn.power;
}

function canAffordWithChips(state: GameState, player: PlayerState, card: CardInstance): boolean {
  const definition = mustGetDefinition(state, card.definitionId);
  return calculateEffectiveCardCost(state, player.playerId, definition) <= state.turn.power + player.chips;
}

function getWildMagicBuyAction(state: GameState): BuyMarketCardAction[] {
  const topCard = state.common.wildMagicStack[0];
  if (topCard === undefined || state.turn.power < 3) {
    return [];
  }

  return [
    {
      type: "buyMarketCard",
      cardInstanceId: topCard.instanceId,
      source: "wildMagicStack",
    },
  ];
}

function getBuySourceZone(state: GameState, source: BuySource): CardInstance[] {
  switch (source) {
    case "mainMarket":
      return state.common.market;
    case "legendMarket":
      return state.common.legendMarket;
    case "wildMagicStack":
      return state.common.wildMagicStack;
  }
}

function calculatePayment(
  state: GameState,
  player: PlayerState,
  cost: number,
  source: BuySource,
): { remainingPower: number; remainingChips: number } | undefined {
  const payableCost = source === "wildMagicStack" ? 3 : cost;
  if (source !== "legendMarket") {
    if (payableCost > state.turn.power) {
      return undefined;
    }

    return {
      remainingPower: state.turn.power - payableCost,
      remainingChips: player.chips,
    };
  }

  if (payableCost > state.turn.power + player.chips) {
    return undefined;
  }

  const powerSpent = Math.min(state.turn.power, payableCost);
  return {
    remainingPower: state.turn.power - powerSpent,
    remainingChips: player.chips - (payableCost - powerSpent),
  };
}

function drawCards(player: PlayerState, count: number, state: GameState): void {
  for (let index = 0; index < count; index += 1) {
    if (player.deck.length === 0 && player.discard.length > 0) {
      player.deck.push(...player.discard.splice(0));
      shuffleInPlace(player.deck, state);
      state.eventLog.push({
        type: "discardShuffledIntoDeck",
        playerId: player.playerId,
      });
    }

    const card = player.deck.shift();
    if (card === undefined) {
      return;
    }

    player.hand.push(card);
  }
}

function refillMarkets(state: GameState): void {
  fillMarket(state, {
    sourceDeck: state.common.legendDeck,
    market: state.common.legendMarket,
    destroyedEvents: state.common.destroyedMegaMayhem,
    targetSize: 3,
    eventKind: "megaMayhem",
    eventLogType: "megaMayhemDestroyed",
  });
  fillMarket(state, {
    sourceDeck: state.common.mainDeck,
    market: state.common.market,
    destroyedEvents: state.common.destroyedMayhem,
    targetSize: 5,
    eventKind: "mayhem",
    eventLogType: "mayhemDestroyed",
  });
}

function fillMarket(
  state: GameState,
  options: {
    sourceDeck: CardInstance[];
    market: CardInstance[];
    destroyedEvents: CardInstance[];
    targetSize: number;
    eventKind: CardDefinition["engine"]["cardKind"];
    eventLogType: string;
  },
): void {
  while (options.market.length < options.targetSize) {
    const card = options.sourceDeck.shift();
    if (card === undefined) {
      state.eventLog.push({
        type: "marketRefillFailed",
      });
      return;
    }

    const definition = mustGetDefinition(state, card.definitionId);
    if (definition.engine.cardKind === options.eventKind) {
      options.destroyedEvents.push(card);
      state.eventLog.push({
        type: options.eventLogType,
        cardInstanceId: card.instanceId,
        definitionId: card.definitionId,
      });
      continue;
    }

    options.market.push(card);
    state.eventLog.push({
      type: "marketCardAdded",
      cardInstanceId: card.instanceId,
      definitionId: card.definitionId,
    });
  }
}

function getNextPlayer(state: GameState, player: PlayerState): PlayerState {
  const playerIndex = state.players.findIndex((candidate) => candidate.playerId === player.playerId);
  const nextPlayer = state.players[(playerIndex + 1) % state.players.length];
  if (nextPlayer === undefined) {
    throw new Error(`Cannot advance turn from player ${player.playerId}`);
  }

  return nextPlayer;
}

function shuffleInPlace<T>(items: T[], state: GameState): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = state.rng.nextInt(index + 1);
    const item = items[index];
    const swapItem = items[swapIndex];
    if (item === undefined || swapItem === undefined) {
      throw new Error("Unexpected sparse array during shuffle");
    }

    items[index] = swapItem;
    items[swapIndex] = item;
  }
}

function mustGetActivePlayer(state: GameState): PlayerState {
  const activePlayer = state.players.find((player) => player.playerId === state.activePlayerId);
  if (activePlayer === undefined) {
    throw new Error(`Missing active player ${state.activePlayerId}`);
  }

  return activePlayer;
}

function mustGetDefinition(state: GameState, definitionId: string): CardDefinition {
  const definition = state.cardDefinitions.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Missing card definition ${definitionId}`);
  }

  return definition;
}
