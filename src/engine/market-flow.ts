import type { CardDefinition } from "./data.js";
import { executeMayhemEffects } from "./effect-runtime.js";
import type { EffectGameEnd } from "./effect-runtime-registry.js";
import { recordGameEvent } from "./event-recorder.js";
import type {
  CardInstance,
  GameEventType,
  GameState,
  PlayerState,
} from "./setup.js";

export type MarketFlowMode = "setup" | "turn";
export type MarketFlowEndReason = "mainDeckExhausted" | "legendDeckExhausted";

export type MarketFlowResult =
  | {
      ok: true;
      gameEndReason?: undefined;
      gameEnd?: undefined;
    }
  | {
      ok: true;
      gameEndReason: MarketFlowEndReason;
      gameEnd?: undefined;
    }
  | {
      ok: true;
      gameEndReason?: undefined;
      gameEnd: EffectGameEnd;
    }
  | {
      ok: false;
      error: string;
    };

export interface RunMarketFlowOptions {
  mode: MarketFlowMode;
}

export function runMarketFlow(
  state: GameState,
  options: RunMarketFlowOptions
): MarketFlowResult {
  const legendResult = fillMarket(state, {
    sourceDeck: state.common.legendDeck,
    market: state.common.legendMarket,
    marketName: "legendMarket",
    destroyedEvents: state.common.destroyedMegaMayhem,
    targetSize: 3,
    eventKind: "megaMayhem",
    eventLogType: "megaMayhemDestroyed",
    endReason: "legendDeckExhausted",
    mode: options.mode,
  });
  if (
    !legendResult.ok ||
    legendResult.gameEndReason !== undefined ||
    legendResult.gameEnd !== undefined
  ) {
    return legendResult;
  }

  const mainResult = fillMarket(state, {
    sourceDeck: state.common.mainDeck,
    market: state.common.market,
    marketName: "mainMarket",
    destroyedEvents: state.common.destroyedMayhem,
    targetSize: 5,
    eventKind: "mayhem",
    eventLogType: "mayhemDestroyed",
    endReason: "mainDeckExhausted",
    mode: options.mode,
  });
  if (
    !mainResult.ok ||
    mainResult.gameEndReason !== undefined ||
    mainResult.gameEnd !== undefined
  ) {
    return mainResult;
  }

  return { ok: true };
}

function fillMarket(
  state: GameState,
  options: {
    sourceDeck: CardInstance[];
    market: CardInstance[];
    marketName: "mainMarket" | "legendMarket";
    destroyedEvents: CardInstance[];
    targetSize: number;
    eventKind: CardDefinition["engine"]["cardKind"];
    eventLogType: Extract<
      GameEventType,
      "megaMayhemDestroyed" | "mayhemDestroyed"
    >;
    endReason: MarketFlowEndReason;
    mode: MarketFlowMode;
  }
): MarketFlowResult {
  while (options.market.length < options.targetSize) {
    const card = options.sourceDeck.shift();
    if (card === undefined) {
      recordGameEvent(state, {
        type: "marketFlowFailed",
        playerId: state.activePlayerId,
        sourceType: options.mode,
        destinationZone: options.marketName,
      });
      return { ok: true, gameEndReason: options.endReason };
    }

    const definition = mustGetDefinition(state, card.definitionId);
    if (definition.engine.cardKind === options.eventKind) {
      recordGameEvent(state, {
        type: "marketEventCardOpened",
        playerId: state.activePlayerId,
        sourceType: options.mode,
        destinationZone: options.marketName,
        cardInstanceId: card.instanceId,
        definitionId: card.definitionId,
      });

      let gameEnd: EffectGameEnd | undefined;
      if (options.mode === "turn") {
        const mayhemResult = executeMayhemCard(state, card, definition);
        if (!mayhemResult.ok) {
          return mayhemResult;
        }
        gameEnd = mayhemResult.gameEnd;
      }

      options.destroyedEvents.push(card);
      if (gameEnd !== undefined) {
        return { ok: true, gameEnd };
      }

      const destructionEvent = {
        playerId: state.activePlayerId,
        sourceType: options.mode,
        destinationZone: options.marketName,
        cardInstanceId: card.instanceId,
        definitionId: card.definitionId,
      };
      if (options.eventLogType === "mayhemDestroyed") {
        recordGameEvent(state, {
          type: "mayhemDestroyed",
          ...destructionEvent,
        });
      } else {
        recordGameEvent(state, {
          type: "megaMayhemDestroyed",
          ...destructionEvent,
        });
      }
      continue;
    }

    options.market.push(card);
    recordGameEvent(state, {
      type: "marketFlowCardAdded",
      playerId: state.activePlayerId,
      sourceType: options.mode,
      destinationZone: options.marketName,
      cardInstanceId: card.instanceId,
      definitionId: card.definitionId,
    });
    applyMarketChipMarker(state, options.market, definition, options.mode);
  }

  return { ok: true };
}

function executeMayhemCard(
  state: GameState,
  card: CardInstance,
  definition: CardDefinition
): MarketFlowResult {
  const activePlayer = mustGetActivePlayer(state);
  const effectResult = executeMayhemEffects(state, activePlayer, definition, {
    sourceType: "card",
    runtimeMode: state.runtimeMode,
    playerId: activePlayer.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
  });
  if (!effectResult.ok) {
    return effectResult;
  }
  if (effectResult.gameEnd !== undefined) {
    return { ok: true, gameEnd: effectResult.gameEnd };
  }

  recordGameEvent(state, {
    type: "mayhemResolved",
    playerId: activePlayer.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
  });
  return { ok: true };
}

function applyMarketChipMarker(
  state: GameState,
  market: CardInstance[],
  addedDefinition: CardDefinition,
  mode: MarketFlowMode
): void {
  if (!addedDefinition.engine.marketChipMarker) {
    return;
  }

  for (const card of market) {
    const definition = mustGetDefinition(state, card.definitionId);
    if (!definition.engine.marketChipMarker) {
      continue;
    }

    card.marketChips += 1;
    recordGameEvent(state, {
      type: "marketChipAdded",
      playerId: state.activePlayerId,
      sourceType: mode,
      cardInstanceId: card.instanceId,
      definitionId: card.definitionId,
      amount: 1,
    });
  }
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

function mustGetDefinition(
  state: GameState,
  definitionId: string
): CardDefinition {
  const definition = state.cardDefinitions.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Missing card definition ${definitionId}`);
  }

  return definition;
}
