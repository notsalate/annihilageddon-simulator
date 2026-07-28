import assert from "node:assert/strict";
import test from "node:test";

import {
  initializeGame,
  runMarketFlow,
  type CardDefinition,
  type CardInstance,
  type RuntimeEffect,
} from "../src/index.js";
import type { EffectRuntimeCatalogOperationOverridesForTesting } from "../src/engine/effect-runtime-registry.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../src/domain/types.js";
import { withTemporaryEffectRuntimeOperations } from "./helpers/with-temporary-effect-runtime-operations.js";

const rootDir = process.cwd();
const terminalEffectId = "fixture_add_power_equal_to_target_cost";
const terminalHandler: EffectRuntimeCatalogOperationOverridesForTesting<
  "fixture_add_power_equal_to_target_cost"
> = {
  execute(_state, player) {
    return {
      ok: true,
      gameEnd: {
        reason: "playerDefeated",
        winnerPlayerId: player.playerId,
      },
    };
  },
};

test("terminal Mayhem is destroyed before Market Flow returns game end", () => {
  runTerminalEventScenario("mayhem");
});

test("terminal Mega Mayhem is destroyed before Market Flow returns game end", () => {
  runTerminalEventScenario("megaMayhem");
});

function runTerminalEventScenario(
  eventKind: "mayhem" | "megaMayhem"
): void {
  const state = initializeGame({
    rootDir,
    seed: eventKind === "mayhem" ? 47700 : 47701,
    playerCount: 2,
  });
  state.runtimeMode = "fixture";
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);

  const eventDefinition = createFixtureDefinition(
    `fixture-terminal-${eventKind}`,
    eventKind,
    [
      {
        effectId: terminalEffectId,
        timing: "onMayhemResolve",
        target: { selector: "mainMarketCard" },
      },
    ]
  );
  const fillerDefinition = createFixtureDefinition(
    `fixture-after-terminal-${eventKind}`,
    "normal",
    []
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [eventDefinition.cardId, eventDefinition],
    [fillerDefinition.cardId, fillerDefinition],
  ]);
  const eventCard = createCard(
    `fixture-terminal-${eventKind}-instance`,
    eventDefinition.cardId
  );
  const fillerCard = createCard(
    `fixture-after-terminal-${eventKind}-instance`,
    fillerDefinition.cardId
  );

  const sourceDeck =
    eventKind === "mayhem"
      ? state.common.mainDeck
      : state.common.legendDeck;
  const market =
    eventKind === "mayhem"
      ? state.common.market
      : state.common.legendMarket;
  const destroyed =
    eventKind === "mayhem"
      ? state.common.destroyedMayhem
      : state.common.destroyedMegaMayhem;
  market.splice(0, 1);
  sourceDeck.splice(0, sourceDeck.length, eventCard, fillerCard);

  const result = withTemporaryEffectRuntimeOperations(
    terminalEffectId,
    terminalHandler,
    () => runMarketFlow(state, { mode: "turn" })
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.gameEnd, {
    reason: "playerDefeated",
    winnerPlayerId: activePlayer.playerId,
  });
  assert.equal(destroyed.includes(eventCard), true);
  assert.equal(sourceDeck.includes(eventCard), false);
  assert.equal(sourceDeck[0], fillerCard);
  assert.equal(market.includes(fillerCard), false);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "mayhemResolved" &&
        event.cardInstanceId === eventCard.instanceId
    ),
    false
  );
}

function createFixtureDefinition(
  cardId: string,
  cardKind: CardDefinition["engine"]["cardKind"],
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
      cardKind,
      cardTypes: [],
      markers: [],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind,
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

function createCard(instanceId: string, definitionId: string): CardInstance {
  return {
    instanceId: markCardInstanceId(instanceId),
    definitionId: markCardDefinitionId(definitionId),
    ownerId: "common",
    marketChips: 0,
  };
}
