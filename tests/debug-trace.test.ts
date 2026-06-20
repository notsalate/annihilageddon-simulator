import assert from "node:assert/strict";
import test from "node:test";

import { formatSingleGameDebugTrace, type SingleGameResult } from "../src/index.js";

test("single-game debug trace summarizes card play and effect resolution in game terms", () => {
  const result: SingleGameResult = {
    seed: 60615,
    endReason: "maxTurnsReached",
    isGameEnd: false,
    turnsElapsed: 1,
    players: [],
    winnerIds: [],
    isTie: false,
    eventLog: [
      { type: "gameInitialized" },
      { type: "botActionSelected", playerId: "player-1" },
      {
        type: "effectAddPowerApplied",
        playerId: "player-1",
        cardInstanceId: "card-7",
        definitionId: "fixture-power-card",
        effectId: "add_power",
        amount: 2,
        sourceType: "card",
      },
      {
        type: "cardPlayed",
        playerId: "player-1",
        cardInstanceId: "card-7",
        definitionId: "fixture-power-card",
      },
    ],
  };

  assert.equal(
    formatSingleGameDebugTrace(result, {
      cardNames: new Map([["fixture-power-card", "Мощный тестовый посох"]]),
    }),
    [
      "Game seed 60615: maxTurnsReached after 1 turn (technical stop)",
      "",
      "Setup",
      "- Game initialized.",
      "",
      "Turn ? - player-1",
      "- Bot selected an action.",
      "- Effect add_power from Мощный тестовый посох (card-7): player-1 gains +2 power.",
      "- Played Мощный тестовый посох (card-7).",
      "",
      "Missing instrumentation",
      "- turn number for each event",
      "- before/after hand, played, discard, deck, market and destroyed zones",
      "- before/after life, power and chip totals for state-changing effects",
    ].join("\n"),
  );
});

test("single-game debug trace summarizes targeting, zone movement, defense, death, DWT, and Trophy events", () => {
  const result: SingleGameResult = {
    seed: 707,
    endReason: "deadWizardTokensExhausted",
    isGameEnd: true,
    turnsElapsed: 4,
    players: [],
    winnerIds: [],
    isTie: false,
    eventLog: [
      { type: "gameInitialized" },
      {
        type: "cardBought",
        playerId: "player-1",
        cardInstanceId: "card-21",
        definitionId: "fixture-market-card",
        destination: "discard",
      },
      {
        type: "effectCardGained",
        playerId: "player-1",
        cardInstanceId: "card-7",
        definitionId: "fixture-gain-card",
        targetCardInstanceId: "card-22",
        targetDefinitionId: "fixture-target-card",
        effectId: "gain_card",
        destination: "deckTop",
        sourceType: "card",
      },
      {
        type: "defenseChoiceSelected",
        playerId: "player-2",
        cardInstanceId: "card-9",
        definitionId: "fixture-defense-card",
        effectId: "avoid_attack",
      },
      {
        type: "defenseCardMoved",
        playerId: "player-2",
        cardInstanceId: "card-9",
        definitionId: "fixture-defense-card",
        destination: "discard",
      },
      {
        type: "effectDamageDealt",
        playerId: "player-2",
        targetPlayerId: "player-1",
        cardInstanceId: "card-9",
        definitionId: "fixture-defense-card",
        effectId: "deal_damage",
        amount: 3,
        sourceType: "card",
      },
      { type: "playerDefeated", playerId: "player-1" },
      {
        type: "trophyControlChanged",
        playerId: "player-2",
        targetPlayerId: "player-1",
        cardInstanceId: "card-9",
        definitionId: "fixture-defense-card",
        effectId: "deal_damage",
        sourceType: "card",
      },
      {
        type: "deadWizardTokenGained",
        playerId: "player-1",
        tokenInstanceId: "token-4",
        tokenDefinitionId: "fixture-dwt",
      },
      { type: "playerResurrected", playerId: "player-1", amount: 20 },
    ],
  };

  assert.equal(
    formatSingleGameDebugTrace(result, {
      cardNames: new Map([
        ["fixture-market-card", "Рыночная карта"],
        ["fixture-gain-card", "Карта получения"],
        ["fixture-target-card", "Целевая карта"],
        ["fixture-defense-card", "Защитная карта"],
      ]),
      tokenNames: new Map([["fixture-dwt", "Жетон мертвого волшебника"]]),
    }),
    [
      "Game seed 707: deadWizardTokensExhausted after 4 turns (game end)",
      "",
      "Setup",
      "- Game initialized.",
      "",
      "Turn ? - player-1",
      "- Bought Рыночная карта (card-21) -> discard.",
      "- Effect gain_card from Карта получения (card-7): player-1 chooses Целевая карта (card-22) -> deckTop.",
      "",
      "Turn ? - player-2",
      "- Defense: player-2 chooses Защитная карта (card-9) for avoid_attack.",
      "- Zone move: Защитная карта (card-9) -> discard.",
      "- Damage: player-2 deals 3 to player-1 with Защитная карта (card-9) via deal_damage.",
      "",
      "Turn ? - player-1",
      "- Death: player-1 is defeated.",
      "",
      "Turn ? - player-2",
      "- Trophy: Basic Trophy moves to player-2 after defeating player-1 with Защитная карта (card-9).",
      "",
      "Turn ? - player-1",
      "- DWT: player-1 gains Жетон мертвого волшебника (token-4).",
      "- Resurrection: player-1 returns at 20 life.",
      "",
      "Missing instrumentation",
      "- turn number for each event",
      "- before/after hand, played, discard, deck, market and destroyed zones",
      "- before/after life, power and chip totals for state-changing effects",
    ].join("\n"),
  );
});
