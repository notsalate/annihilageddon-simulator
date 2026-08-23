import {
  executeActivationEffects,
  executeControlledCardOnPlayCardEffects,
  executeOnPlayEffects,
  executeWizardPropertyOnPlayCardEffects,
  executeWizardPropertyActivationEffects,
  calculateEndTurnDrawCount,
  getWizardPropertyActivationAvailability,
  hasExecutableWizardPropertyActivation,
  moveGainedCardToPlayerDestination,
  validateActivationEffects,
  validateGainedCardEffects,
  validateOnPlayEffects,
  validateWizardPropertyOnPlayCardEffects,
} from "./effect-runtime.js";
import { resolveCardPlay } from "./card-play-resolution.js";
import type { EffectGameEnd } from "./effect-runtime-registry.js";
import { assertNever } from "../common.js";
import {
  getControlledCards,
  releaseTemporaryControls,
} from "./control-ledger.js";
import { calculateEffectiveCardCost } from "./effective-value-runtime.js";
import { drawDeckCards } from "./deck-lifecycle.js";
import { recordDeckReshuffle, recordGameEvent } from "./event-recorder.js";
import {
  runMarketFlow,
  validateMarketFlow,
  type MarketFlowEndReason,
} from "./market-flow.js";
import { runControlledPowerMutation } from "./trigger-dispatch.js";
import type {
  CardInstance,
  GameState,
  PlayerState,
  TokenInstance,
} from "./setup.js";

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

export type BuySource =
  | "mainMarket"
  | "legendMarket"
  | "wildMagicStack"
  | "familiar";

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
      gameEndReason?: MarketFlowEndReason | EffectGameEnd["reason"];
      /** Present only when the action itself established a winner. */
      winnerPlayerId?: PlayerState["playerId"];
    }
  | {
      ok: false;
      error: string;
    };

interface PaymentResult {
  remainingPower: number;
  remainingChips: number;
  payableCost: number;
}

interface CleanupMoveRecord {
  card: CardInstance;
  sourceZone: string;
  destinationZone: string;
}

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
    ...getControlledCards(state, activePlayer)
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

/**
 * Validates action inputs and all read-only action-boundary calculations before
 * the mutating implementation is entered.
 */
export function preflightAction(
  state: GameState,
  action: GameAction
): ActionResult | undefined {
  let activePlayer: PlayerState;
  try {
    activePlayer = mustGetActivePlayer(state);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    switch (action.type) {
      case "playCard": {
        const card = activePlayer.hand.find(
          (candidate) => candidate.instanceId === action.cardInstanceId
        );
        if (card === undefined) {
          return {
            ok: false,
            error: "Card is not in the active player's hand",
          };
        }
        const definition = mustGetDefinition(state, card.definitionId);
        const source = createCardSource(state, activePlayer, card);
        const effectValidation = validateOnPlayEffects(
          state,
          activePlayer,
          definition,
          source,
          card.instanceId
        );
        if (!effectValidation.ok) {
          return effectValidation;
        }
        const wizardPropertyValidation =
          validateWizardPropertyOnPlayCardEffects(
            state,
            activePlayer,
            definition,
            card.instanceId
          );
        if (!wizardPropertyValidation.ok) {
          return wizardPropertyValidation;
        }
        return undefined;
      }
      case "buyMarketCard": {
        const card = getBuyCard(state, activePlayer, action);
        if (card === undefined) {
          return {
            ok: false,
            error: `Card is not in ${action.source}`,
          };
        }
        const definition = mustGetDefinition(state, card.definitionId);
        const gainValidation = validateGainedCardEffects(
          state,
          activePlayer,
          definition
        );
        if (!gainValidation.ok) {
          return gainValidation;
        }
        const cost = calculateEffectiveCardCost(
          state,
          activePlayer.playerId,
          definition
        );
        if (
          calculatePayment(state, activePlayer, cost, action.source) ===
          undefined
        ) {
          return {
            ok: false,
            error: "Not enough power to buy card",
          };
        }
        return undefined;
      }
      case "activatePermanent": {
        const card = getControlledCards(state, activePlayer).find(
          (candidate) => candidate.instanceId === action.cardInstanceId
        );
        if (card === undefined) {
          return {
            ok: false,
            error: "Card is not controlled by the active player",
          };
        }
        if (!canActivatePermanent(state, activePlayer, card)) {
          return {
            ok: false,
            error: "Permanent cannot be activated",
          };
        }
        const definition = mustGetDefinition(state, card.definitionId);
        const source = createCardSource(state, activePlayer, card);
        const effectValidation = validateActivationEffects(
          state,
          activePlayer,
          definition,
          source
        );
        if (!effectValidation.ok) {
          return effectValidation;
        }
        return undefined;
      }
      case "activateWizardProperty": {
        const token = activePlayer.wizardProperties.find(
          (candidate) => candidate.instanceId === action.tokenInstanceId
        );
        if (token === undefined) {
          return {
            ok: false,
            error: "Token is not a controlled wizard property",
          };
        }
        if (state.turn.activatedCardIds.includes(token.instanceId)) {
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
        const availability = getWizardPropertyActivationAvailability(
          state,
          activePlayer,
          definition,
          createWizardPropertySource(state, activePlayer, token)
        );
        if (!availability.ok) {
          return availability;
        }
        if (!availability.executable) {
          return {
            ok: false,
            error: "Wizard property cannot be activated",
          };
        }
        return undefined;
      }
      case "endTurn": {
        calculateEndTurnDrawCount(state, activePlayer);
        const marketValidation = validateMarketFlow(state, { mode: "turn" });
        if (!marketValidation.ok) {
          return marketValidation;
        }
        return undefined;
      }
      default:
        return assertNever(action);
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function applyAction(
  state: GameState,
  action: GameAction
): ActionResult {
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
    default:
      return assertNever(action);
  }
}

function endTurn(state: GameState): ActionResult {
  const activePlayer = mustGetActivePlayer(state);
  grantBasicTrophyChipAtEndOfTurn(state, activePlayer);

  const cleanedHandCards = activePlayer.hand.splice(0);
  activePlayer.discard.push(...cleanedHandCards);
  recordEndTurnCleanup(
    state,
    activePlayer,
    cleanedHandCards.map((card) => ({
      card,
      sourceZone: `${activePlayer.playerId}.hand`,
      destinationZone: `${activePlayer.playerId}.discard`,
    }))
  );

  const cleanedPlayedCards = cleanupPlayedCards(state, activePlayer);
  recordEndTurnCleanup(state, activePlayer, cleanedPlayedCards);

  state.turn.power = 0;
  state.turn.controlledPowerBonus = 0;
  state.turn.activatedCardIds = [];
  recordGameEvent(state, {
    type: "turnEnded",
    playerId: activePlayer.playerId,
  });

  const drawCount = calculateEndTurnDrawCount(state, activePlayer);
  const drawResult = drawDeckCards(
    activePlayer.deck,
    activePlayer.discard,
    drawCount,
    state.rng,
    () => recordDeckReshuffle(state, activePlayer.playerId)
  );
  activePlayer.hand.push(...drawResult.cards);
  recordGameEvent(state, {
    type: "handDrawn",
    playerId: activePlayer.playerId,
    amount: drawCount,
    legalChoiceCount: drawResult.cards.length,
    choiceId: String(activePlayer.hand.length),
    destinationZone: `${activePlayer.playerId}.hand`,
    targetCardInstanceIds: drawResult.cards.map((card) => card.instanceId),
    targetDefinitionIds: drawResult.cards.map((card) => card.definitionId),
  });

  releaseTemporaryControls(state);
  state.turn.gainedCardDefinitionIds = [];
  state.turn.mainMarketCardHandReplacementSourceCardIds = [];
  state.turn.rememberedDestroyedLegendCost = undefined;
  state.turn.damagingAttackPlayerIds = [];
  state.turn.number += 1;
  const nextActivePlayer = getNextPlayer(state, activePlayer);
  const transitionResult = runControlledPowerMutation(
    state,
    () => state.activePlayerId,
    () => {
      state.activePlayerId = nextActivePlayer.playerId;
      return runMarketFlow(state, { mode: "turn" });
    },
    (marketFlowResult) =>
      marketFlowResult.ok &&
      marketFlowResult.gameEnd === undefined &&
      marketFlowResult.gameEndReason === undefined
  );
  if (!transitionResult.ok) {
    return transitionResult;
  }
  const marketFlowResult = transitionResult.value;
  if (!marketFlowResult.ok) {
    return marketFlowResult;
  }
  if (marketFlowResult.gameEnd !== undefined) {
    return gameEndActionResult(marketFlowResult.gameEnd);
  }
  if (marketFlowResult.gameEndReason !== undefined) {
    return marketFlowResult;
  }
  recordGameEvent(state, {
    type: "turnStarted",
    playerId: state.activePlayerId,
  });

  return { ok: true };
}

function activatePermanent(
  state: GameState,
  cardInstanceId: string
): ActionResult {
  const activePlayer = mustGetActivePlayer(state);
  const card = getControlledCards(state, activePlayer).find(
    (card) => card.instanceId === cardInstanceId
  );
  if (card === undefined) {
    return {
      ok: false,
      error: "Card is not controlled by the active player",
    };
  }

  if (!canActivatePermanent(state, activePlayer, card)) {
    return {
      ok: false,
      error: "Permanent cannot be activated",
    };
  }

  const definition = mustGetDefinition(state, card.definitionId);
  const effectResult = executeActivationEffects(
    state,
    activePlayer,
    definition,
    {
      sourceType: "card",
      runtimeMode: state.runtimeMode,
      playerId: activePlayer.playerId,
      cardInstanceId: card.instanceId,
      definitionId: card.definitionId,
    }
  );
  if (!effectResult.ok) {
    return effectResult;
  }
  if (effectResult.gameEnd !== undefined) {
    return gameEndActionResult(effectResult.gameEnd);
  }

  state.turn.activatedCardIds.push(card.instanceId);
  recordGameEvent(state, {
    type: "cardActivated",
    playerId: activePlayer.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
  });

  return { ok: true };
}

function activateWizardProperty(
  state: GameState,
  tokenInstanceId: string
): ActionResult {
  const activePlayer = mustGetActivePlayer(state);
  const token = activePlayer.wizardProperties.find(
    (token) => token.instanceId === tokenInstanceId
  );
  if (token === undefined) {
    return {
      ok: false,
      error: "Token is not a controlled wizard property",
    };
  }

  if (state.turn.activatedCardIds.includes(token.instanceId)) {
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

  const source = createWizardPropertySource(state, activePlayer, token);
  const availability = getWizardPropertyActivationAvailability(
    state,
    activePlayer,
    definition,
    source
  );
  if (!availability.ok) {
    return availability;
  }
  if (!availability.executable) {
    return {
      ok: false,
      error: "Wizard property cannot be activated",
    };
  }

  const effectResult = executeWizardPropertyActivationEffects(
    state,
    activePlayer,
    definition,
    source
  );
  if (!effectResult.ok) {
    return effectResult;
  }
  if (effectResult.gameEnd !== undefined) {
    return gameEndActionResult(effectResult.gameEnd);
  }

  state.turn.activatedCardIds.push(token.instanceId);
  recordGameEvent(state, {
    type: "wizardPropertyActivated",
    playerId: activePlayer.playerId,
    tokenInstanceId: token.instanceId,
    tokenDefinitionId: token.definitionId,
  });

  return { ok: true };
}

function grantBasicTrophyChipAtEndOfTurn(
  state: GameState,
  activePlayer: PlayerState
): void {
  if (
    !activePlayer.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    )
  ) {
    return;
  }

  activePlayer.chips += 1;
  recordGameEvent(state, {
    type: "trophyChipGranted",
    playerId: activePlayer.playerId,
    effectId: "basicTrophy",
    amount: 1,
  });
}

function buyMarketCard(
  state: GameState,
  action: BuyMarketCardAction
): ActionResult {
  const activePlayer = mustGetActivePlayer(state);
  const card = getBuyCard(state, activePlayer, action);
  if (card === undefined) {
    return {
      ok: false,
      error: `Card is not in ${action.source}`,
    };
  }

  const definition = mustGetDefinition(state, card.definitionId);
  const cost = calculateEffectiveCardCost(
    state,
    activePlayer.playerId,
    definition
  );
  const powerBefore = state.turn.power;
  const chipsBefore = activePlayer.chips;
  const payment = calculatePayment(state, activePlayer, cost, action.source);
  if (payment === undefined) {
    return {
      ok: false,
      error: "Not enough power to buy card",
    };
  }

  state.turn.power = payment.remainingPower;
  activePlayer.chips = payment.remainingChips;
  const gainResult = moveGainedCardToPlayerDestination(
    state,
    activePlayer,
    card
  );
  if (!gainResult.ok) {
    return gainResult;
  }
  recordGameEvent(state, {
    type: "cardBought",
    playerId: activePlayer.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
    destination: gainResult.destination,
    sourceZone: action.source,
    amount: payment.payableCost,
    powerBefore,
    powerAfter: payment.remainingPower,
    chipsBefore,
    chipsAfter: payment.remainingChips,
  });

  return { ok: true };
}

function cleanupPlayedCards(
  state: GameState,
  activePlayer: PlayerState
): CleanupMoveRecord[] {
  const cleanedCards: CleanupMoveRecord[] = [];
  for (const card of activePlayer.playedThisTurn.splice(0)) {
    const owner = state.players.find(
      (player) => player.playerId === card.ownerId
    );
    const destinationPlayer = owner ?? activePlayer;
    destinationPlayer.discard.push(card);
    cleanedCards.push({
      card,
      sourceZone: `${activePlayer.playerId}.playedThisTurn`,
      destinationZone: `${destinationPlayer.playerId}.discard`,
    });
  }

  return cleanedCards;
}

function recordEndTurnCleanup(
  state: GameState,
  activePlayer: PlayerState,
  moves: readonly CleanupMoveRecord[]
): void {
  if (moves.length === 0) {
    return;
  }

  const groups = new Map<string, CleanupMoveRecord[]>();
  for (const move of moves) {
    const key = `${move.sourceZone}->${move.destinationZone}`;
    groups.set(key, [...(groups.get(key) ?? []), move]);
  }

  for (const group of groups.values()) {
    const firstMove = group[0];
    if (firstMove === undefined) {
      continue;
    }

    recordGameEvent(state, {
      type: "endTurnCleanupMoved",
      playerId: activePlayer.playerId,
      amount: group.length,
      sourceZone: firstMove.sourceZone,
      destinationZone: firstMove.destinationZone,
      targetCardInstanceIds: group.map((move) => move.card.instanceId),
      targetDefinitionIds: group.map((move) => move.card.definitionId),
    });
  }
}

function playCard(state: GameState, cardInstanceId: string): ActionResult {
  const activePlayer = mustGetActivePlayer(state);
  const cardIndex = activePlayer.hand.findIndex(
    (card) => card.instanceId === cardInstanceId
  );
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
  const ownerBefore = card.ownerId;
  const effectResult = resolveCardPlay(
    state,
    activePlayer,
    card,
    {
      executeOnPlayEffects,
      executeWizardPropertyOnPlayCardEffects,
      executeControlledCardOnPlayCardEffects,
    },
    {
      sourceZone: `${activePlayer.playerId}.hand`,
      ownerBefore,
    }
  );
  if (!effectResult.ok) {
    return effectResult;
  }
  if (effectResult.gameEnd !== undefined) {
    return gameEndActionResult(effectResult.gameEnd);
  }

  recordGameEvent(state, {
    type: "cardPlayed",
    playerId: activePlayer.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
  });

  return { ok: true };
}

function gameEndActionResult(gameEnd: EffectGameEnd): ActionResult {
  return {
    ok: true,
    gameEndReason: gameEnd.reason,
    winnerPlayerId: gameEnd.winnerPlayerId,
  };
}

function canAfford(
  state: GameState,
  player: PlayerState,
  card: CardInstance
): boolean {
  const definition = mustGetDefinition(state, card.definitionId);
  return (
    calculateEffectiveCardCost(state, player.playerId, definition) <=
    state.turn.power
  );
}

function canAffordWithChips(
  state: GameState,
  player: PlayerState,
  card: CardInstance
): boolean {
  const definition = mustGetDefinition(state, card.definitionId);
  return (
    calculateEffectiveCardCost(state, player.playerId, definition) <=
    state.turn.power + player.chips
  );
}

function canActivatePermanent(
  state: GameState,
  _player: PlayerState,
  card: CardInstance
): boolean {
  if (state.turn.activatedCardIds.includes(card.instanceId)) {
    return false;
  }

  const definition = mustGetDefinition(state, card.definitionId);
  return definition.engine.effects.some((effect) => {
    return effect.timing === "activation";
  });
}

function canActivateWizardProperty(
  state: GameState,
  player: PlayerState,
  token: TokenInstance
): boolean {
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

function getFamiliarBuyAction(
  state: GameState,
  player: PlayerState
): BuyMarketCardAction[] {
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

function getBuyCard(
  state: GameState,
  activePlayer: PlayerState,
  action: BuyMarketCardAction
): CardInstance | undefined {
  if (action.source === "familiar") {
    const familiar = activePlayer.unboughtFamiliar;
    return familiar?.instanceId === action.cardInstanceId
      ? familiar
      : undefined;
  }

  return getBuySourceZone(state, action.source).find(
    (card) => card.instanceId === action.cardInstanceId
  );
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
    default:
      return assertNever(source);
  }
}

function calculatePayment(
  state: GameState,
  player: PlayerState,
  cost: number,
  source: BuySource
): PaymentResult | undefined {
  const payableCost = source === "wildMagicStack" ? 3 : cost;
  if (source !== "legendMarket") {
    if (payableCost > state.turn.power) {
      return undefined;
    }

    return {
      payableCost,
      remainingPower: state.turn.power - payableCost,
      remainingChips: player.chips,
    };
  }

  if (payableCost > state.turn.power + player.chips) {
    return undefined;
  }

  const powerSpent = Math.min(state.turn.power, payableCost);
  return {
    payableCost,
    remainingPower: state.turn.power - powerSpent,
    remainingChips: player.chips - (payableCost - powerSpent),
  };
}

function getNextPlayer(state: GameState, player: PlayerState): PlayerState {
  const playerIndex = state.players.findIndex(
    (candidate) => candidate.playerId === player.playerId
  );
  const nextPlayer = state.players[(playerIndex + 1) % state.players.length];
  if (nextPlayer === undefined) {
    throw new Error(`Cannot advance turn from player ${player.playerId}`);
  }

  return nextPlayer;
}

function mustGetActivePlayer(state: GameState): PlayerState {
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  if (activePlayer === undefined) {
    throw new Error(`Missing active player ${state.activePlayerId}`);
  }

  return activePlayer;
}

function mustGetDefinition(state: GameState, definitionId: string) {
  const definition = state.cardDefinitions.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Missing card definition ${definitionId}`);
  }

  return definition;
}

function createWizardPropertySource(
  state: GameState,
  player: PlayerState,
  token: TokenInstance
) {
  return {
    sourceType: "wizardProperty" as const,
    runtimeMode: state.runtimeMode,
    playerId: player.playerId,
    cardInstanceId: token.instanceId,
    definitionId: token.definitionId,
    tokenInstanceId: token.instanceId,
    tokenDefinitionId: token.definitionId,
  };
}

function createCardSource(
  state: GameState,
  player: PlayerState,
  card: CardInstance
) {
  return {
    sourceType: "card" as const,
    runtimeMode: state.runtimeMode,
    playerId: player.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
  };
}
