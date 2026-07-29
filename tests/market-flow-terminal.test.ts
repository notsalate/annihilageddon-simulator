import assert from "node:assert/strict";
import test from "node:test";

import { initializeGame, runMarketFlow } from "../src/index.js";
import type { EffectRuntimeCatalogOperationOverridesForTesting } from "../src/engine/effect-runtime-registry.js";
import { createTerminalMarketEventFixture } from "./helpers/market-flow-fixtures.js";
import { withTemporaryEffectRuntimeOperations } from "./helpers/with-temporary-effect-runtime-operations.js";

const rootDir = process.cwd();
const terminalEffectId = "fixture_add_power_equal_to_target_cost";
const terminalHandler: EffectRuntimeCatalogOperationOverridesForTesting<"fixture_add_power_equal_to_target_cost"> =
  {
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

test("terminal event fixture assigns unique IDs when reused in one state", () => {
  const state = initializeGame({
    rootDir,
    seed: 47702,
    playerCount: 2,
  });
  const firstFixture = createTerminalMarketEventFixture({
    state,
    eventKind: "mayhem",
    effects: [],
  });
  const secondFixture = createTerminalMarketEventFixture({
    state,
    eventKind: "mayhem",
    effects: [],
  });

  assert.notEqual(
    firstFixture.eventCard.definitionId,
    secondFixture.eventCard.definitionId
  );
  assert.notEqual(
    firstFixture.eventCard.instanceId,
    secondFixture.eventCard.instanceId
  );
  assert.notEqual(
    firstFixture.fillerCard.definitionId,
    secondFixture.fillerCard.definitionId
  );
  assert.notEqual(
    firstFixture.fillerCard.instanceId,
    secondFixture.fillerCard.instanceId
  );
});

function runTerminalEventScenario(eventKind: "mayhem" | "megaMayhem"): void {
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

  const { eventCard, fillerCard } = createTerminalMarketEventFixture({
    state,
    eventKind,
    effects: [
      {
        effectId: terminalEffectId,
        timing: "onMayhemResolve",
        target: { selector: "mainMarketCard" },
      },
    ],
  });

  const sourceDeck =
    eventKind === "mayhem" ? state.common.mainDeck : state.common.legendDeck;
  const market =
    eventKind === "mayhem" ? state.common.market : state.common.legendMarket;
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
