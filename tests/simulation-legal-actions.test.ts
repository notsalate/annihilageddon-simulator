import assert from "node:assert/strict";
import test from "node:test";

import { baselineBot, initializeGame, runSingleGame } from "../src/index.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

test("BotStrategy receives an isolated public decision view and applies its chosen action", () => {
  let receivedContext = false;
  const result = runSingleGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    maxTurns: 1,
    bot: {
      chooseAction({ player, legalActions }) {
        receivedContext = true;
        assert.equal("deck" in player, false);
        assert.equal("players" in player, false);
        assert.ok(
          legalActions.every(
            (action) =>
              !("definitionId" in action) && !("targetDefinitionIds" in action)
          )
        );

        const mutablePlayer = player as unknown as {
          chips: number;
          hand: unknown[];
        };
        mutablePlayer.chips = 99;
        mutablePlayer.hand.length = 0;

        return { type: "endTurn" };
      },
    },
  });

  assert.equal(receivedContext, true);
  assert.equal(result.endReason, "maxTurnsReached");
  assert.ok(
    result.eventLog.some(
      (event) => event.type === "endTurnCleanupMoved" && event.amount > 0
    )
  );
});

test("baseline bot chooses the most expensive accessible market purchase", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const { deck: _deck, ...player } = activePlayer;
  const cheapMainMarketCardId = "fixture-cheap-main-market-card";
  const expensiveLegendMarketCardId = "fixture-expensive-legend-market-card";

  const selected = baselineBot.chooseAction({
    player,
    legalActions: [
      {
        type: "buyMarketCard",
        cardInstanceId: cheapMainMarketCardId,
        source: "mainMarket",
        cost: 1,
      },
      {
        type: "buyMarketCard",
        cardInstanceId: expensiveLegendMarketCardId,
        source: "legendMarket",
        cost: 5,
      },
      { type: "endTurn" },
    ],
  });

  assert.deepEqual(selected, {
    type: "buyMarketCard",
    cardInstanceId: expensiveLegendMarketCardId,
    source: "legendMarket",
    cost: 5,
  });
});
