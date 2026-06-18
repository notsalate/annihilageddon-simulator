import type { CardDefinition } from "./data.js";
import {
  executeActivationEffects,
  executeMayhemEffects,
  executeOnPlayEffects,
  executeWizardPropertyOnPlayCardEffects,
  executeWizardPropertyActivationEffects,
  calculateEndTurnDrawCount,
  hasExecutableWizardPropertyActivation,
  moveGainedCardToPlayerDestination,
} from "./effect-runtime.js";
import { calculateEffectiveCardCost } from "./effective-values.js";
import type { CardInstance, GameState, PlayerState, TokenInstance } from "./setup.js";

export type LegalAction =
  | PlayCardAction
  | BuyMarketCardAction
  | ActivatePermanentAction
  | ActivateWizardPropertyAction
  | EndTurnAction;
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

export type BuySource = "mainMarket" | "legendMarket" | "wildMagicStack" | "familiar";

export interface ActivatePermanentAction {
  type: "activatePermanent";
  cardInstanceId: string;
}

export interface ActivateWizardPropertyAction {
  type: "activateWizardProperty";
  tokenInstanceId: string;
}

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
    ...getFamiliarBuyAction(state, activePlayer),
    ...activePlayer.permanents
      .filter((card) => canActivatePermanent(state, activePlayer, card))
      .map((card) => ({
        type: "activatePermanent" as const,
        cardInstanceId: card.instanceId,
      })),
    ...activePlayer.wizardProperties
      .filter((token) => canActivateWizardProperty(state, activePlayer, token))
      .map((token) => ({
        type: "activateWizardProperty" as const,
        tokenInstanceId: token.instanceId,
      })),
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
    case "activatePermanent":
      return activatePermanent(state, action.cardInstanceId);
    case "activateWizardProperty":
      return activateWizardProperty(state, action.tokenInstanceId);
    case "endTurn":
      return endTurn(state);
  }
}

function endTurn(state: GameState): ActionResult {
  const activePlayer = mustGetActivePlayer(state);
  grantBasicTrophyChipAtEndOfTurn(state, activePlayer);
  activePlayer.discard.push(...activePlayer.hand.splice(0));
  cleanupPlayedCards(state, activePlayer);
  state.turn.power = 0;
  state.turn.activatedCardIds = [];
  state.eventLog.push({
    type: "turnEnded",
    playerId: activePlayer.playerId,
  });

  const drawCount = calculateEndTurnDrawCount(state, activePlayer);
  drawCards(activePlayer, drawCount, state);
  state.turn.gainedCardDefinitionIds = [];
  state.turn.number += 1;
  state.activePlayerId = getNextPlayer(state, activePlayer).playerId;
  const refillResult = refillMarkets(state);
  if (!refillResult.ok) {
    return refillResult;
  }
  state.eventLog.push({
    type: "turnStarted",
    playerId: state.activePlayerId,
  });

  return { ok: true };
}

function activatePermanent(state: GameState, cardInstanceId: string): ActionResult {
  const activePlayer = mustGetActivePlayer(state);
  const card = activePlayer.permanents.find((card) => card.instanceId === cardInstanceId);
  if (card === undefined) {
    return {
      ok: false,
      error: "Card is not a controlled permanent",
    };
  }

  if (!canActivatePermanent(state, activePlayer, card)) {
    return {
      ok: false,
      error: "Permanent cannot be activated",
    };
  }

  const definition = mustGetDefinition(state, card.definitionId);
  const effectResult = executeActivationEffects(state, activePlayer, definition, {
    sourceType: "card",
    playerId: activePlayer.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
  });
  if (!effectResult.ok) {
    return effectResult;
  }

  state.turn.activatedCardIds.push(card.instanceId);
  state.eventLog.push({
    type: "cardActivated",
    playerId: activePlayer.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
  });

  return { ok: true };
}

function activateWizardProperty(state: GameState, tokenInstanceId: string): ActionResult {
  const activePlayer = mustGetActivePlayer(state);
  const token = activePlayer.wizardProperties.find((token) => token.instanceId === tokenInstanceId);
  if (token === undefined) {
    return {
      ok: false,
      error: "Token is not a controlled wizard property",
    };
  }

  if (!canActivateWizardProperty(state, activePlayer, token)) {
    return {
      ok: false,
      error: "Wizard property cannot be activated",
    };
  }

  const definition = state.tokenDefinitions.get(token.definitionId);
  if (definition === undefined) {
    return {
      ok: false,
      error: `Missing token definition ${token.definitionId}`,
    };
  }

  const effectResult = executeWizardPropertyActivationEffects(state, activePlayer, definition, {
    sourceType: "wizardProperty",
    playerId: activePlayer.playerId,
    cardInstanceId: token.instanceId,
    definitionId: token.definitionId,
    tokenInstanceId: token.instanceId,
    tokenDefinitionId: token.definitionId,
  });
  if (!effectResult.ok) {
    return effectResult;
  }

  state.turn.activatedCardIds.push(token.instanceId);
  state.eventLog.push({
    type: "wizardPropertyActivated",
    playerId: activePlayer.playerId,
    tokenInstanceId: token.instanceId,
    tokenDefinitionId: token.definitionId,
  });

  return { ok: true };
}

function grantBasicTrophyChipAtEndOfTurn(state: GameState, activePlayer: PlayerState): void {
  if (!activePlayer.trophyLikeObjects.some((trophy) => trophy.trophyId === "basicTrophy")) {
    return;
  }

  activePlayer.chips += 1;
  state.eventLog.push({
    type: "trophyChipGranted",
    playerId: activePlayer.playerId,
    effectId: "basicTrophy",
    amount: 1,
  });
}

function buyMarketCard(state: GameState, action: BuyMarketCardAction): ActionResult {
  const activePlayer = mustGetActivePlayer(state);
  const card = getBuyCard(state, activePlayer, action);
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

  state.turn.power = payment.remainingPower;
  activePlayer.chips = payment.remainingChips;
  const gainResult = moveGainedCardToPlayerDestination(state, activePlayer, card);
  if (!gainResult.ok) {
    return gainResult;
  }
  state.eventLog.push({
    type: "cardBought",
    playerId: activePlayer.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
    destination: gainResult.destination,
  });

  return { ok: true };
}

function cleanupPlayedCards(state: GameState, activePlayer: PlayerState): void {
  for (const card of activePlayer.playedThisTurn.splice(0)) {
    const owner = state.players.find((player) => player.playerId === card.ownerId);
    (owner ?? activePlayer).discard.push(card);
  }
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

  const wizardPropertyResult = executeWizardPropertyOnPlayCardEffects(state, activePlayer, definition);
  if (!wizardPropertyResult.ok) {
    return wizardPropertyResult;
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

function canActivatePermanent(state: GameState, _player: PlayerState, card: CardInstance): boolean {
  if (state.turn.activatedCardIds.includes(card.instanceId)) {
    return false;
  }

  const definition = mustGetDefinition(state, card.definitionId);
  return definition.engine.effects.some((effect) => {
    return isEffectRecord(effect) && effect["timing"] === "activation";
  });
}

function canActivateWizardProperty(state: GameState, player: PlayerState, token: TokenInstance): boolean {
  if (state.turn.activatedCardIds.includes(token.instanceId)) {
    return false;
  }

  const definition = state.tokenDefinitions.get(token.definitionId);
  if (definition === undefined) {
    return false;
  }

  return hasExecutableWizardPropertyActivation(state, player, definition);
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

function getFamiliarBuyAction(state: GameState, player: PlayerState): BuyMarketCardAction[] {
  const familiar = player.unboughtFamiliar;
  if (familiar === undefined || !canAfford(state, player, familiar)) {
    return [];
  }

  return [
    {
      type: "buyMarketCard",
      cardInstanceId: familiar.instanceId,
      source: "familiar",
    },
  ];
}

function getBuyCard(state: GameState, activePlayer: PlayerState, action: BuyMarketCardAction): CardInstance | undefined {
  if (action.source === "familiar") {
    const familiar = activePlayer.unboughtFamiliar;
    return familiar?.instanceId === action.cardInstanceId ? familiar : undefined;
  }

  return getBuySourceZone(state, action.source).find((card) => card.instanceId === action.cardInstanceId);
}

function getBuySourceZone(state: GameState, source: BuySource): CardInstance[] {
  switch (source) {
    case "mainMarket":
      return state.common.market;
    case "legendMarket":
      return state.common.legendMarket;
    case "wildMagicStack":
      return state.common.wildMagicStack;
    case "familiar":
      return [];
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

function refillMarkets(state: GameState): ActionResult {
  const legendResult = fillMarket(state, {
    sourceDeck: state.common.legendDeck,
    market: state.common.legendMarket,
    destroyedEvents: state.common.destroyedMegaMayhem,
    targetSize: 3,
    eventKind: "megaMayhem",
    eventLogType: "megaMayhemDestroyed",
  });
  if (!legendResult.ok) {
    return legendResult;
  }

  const mainResult = fillMarket(state, {
    sourceDeck: state.common.mainDeck,
    market: state.common.market,
    destroyedEvents: state.common.destroyedMayhem,
    targetSize: 5,
    eventKind: "mayhem",
    eventLogType: "mayhemDestroyed",
  });
  if (!mainResult.ok) {
    return mainResult;
  }

  return { ok: true };
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
): ActionResult {
  while (options.market.length < options.targetSize) {
    const card = options.sourceDeck.shift();
    if (card === undefined) {
      state.eventLog.push({
        type: "marketRefillFailed",
      });
      return { ok: true };
    }

    const definition = mustGetDefinition(state, card.definitionId);
    if (definition.engine.cardKind === options.eventKind) {
      const mayhemResult = executeMayhemCard(state, card, definition);
      if (!mayhemResult.ok) {
        return mayhemResult;
      }

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
    applyMarketChipMarker(state, options.market, definition);
  }

  return { ok: true };
}

function executeMayhemCard(state: GameState, card: CardInstance, definition: CardDefinition): ActionResult {
  const activePlayer = mustGetActivePlayer(state);
  const effectResult = executeMayhemEffects(state, activePlayer, definition, {
    sourceType: "card",
    playerId: activePlayer.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
  });
  if (!effectResult.ok) {
    return effectResult;
  }

  state.eventLog.push({
    type: "mayhemResolved",
    playerId: activePlayer.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
  });
  return { ok: true };
}

function applyMarketChipMarker(state: GameState, market: CardInstance[], addedDefinition: CardDefinition): void {
  if (!addedDefinition.engine.marketChipMarker) {
    return;
  }

  for (const card of market) {
    const definition = mustGetDefinition(state, card.definitionId);
    if (!definition.engine.marketChipMarker) {
      continue;
    }

    card.marketChips += 1;
    state.eventLog.push({
      type: "marketChipAdded",
      cardInstanceId: card.instanceId,
      definitionId: card.definitionId,
      amount: 1,
    });
  }
}

function gainMarketChipsFromCard(state: GameState, player: PlayerState, card: CardInstance): void {
  if (card.marketChips <= 0) {
    return;
  }

  const amount = card.marketChips;
  player.chips += amount;
  card.marketChips = 0;
  state.eventLog.push({
    type: "marketChipsGained",
    playerId: player.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
    amount,
  });
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

function isEffectRecord(effect: unknown): effect is Record<string, unknown> {
  return typeof effect === "object" && effect !== null;
}
