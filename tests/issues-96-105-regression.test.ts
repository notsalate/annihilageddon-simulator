import assert from "node:assert/strict";
import test from "node:test";

import {
  formatSingleGameDebugTrace,
  initializeGame,
  loadCurrentRuntimeDataPack,
  type SingleGameResult,
} from "../src/index.js";

const rootDir = process.cwd();

test("current runtime setup uses the canonical 10-card starter template", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);

  assert.deepEqual(dataPack.decks.starterDeck.entries, [
    { cardId: "esw2_dbg__starter_001", count: 6 },
    { cardId: "esw2_dbg__starter_002", count: 3 },
    { cardId: "esw2_dbg__starter_003", count: 1 },
  ]);
  assert.equal(
    dataPack.cardDefinitions.get("esw2_dbg__starter_003")?.visible.nameRu,
    "Сырная палочка"
  );

  const state = initializeGame({ rootDir, seed: 12345 });
  const allStarterCards = state.players.flatMap((player) => [
    ...player.hand,
    ...player.deck,
    ...player.discard,
    ...player.playedThisTurn,
    ...player.permanents,
  ]);

  assert.equal(allStarterCards.length, 20);
});

test("readable trace renders setup choices, setup market, card text, payment, cleanup, draw, and life set context", () => {
  const result: SingleGameResult = {
    seed: 100105,
    endReason: "maxTurnsReached",
    isGameEnd: false,
    turnsElapsed: 2,
    players: [],
    winnerIds: [],
    isTie: false,
    eventLog: [
      {
        type: "setupChoiceSelected",
        playerId: "player-1",
        setupChoiceKind: "wizardProperty",
        policyId: "alwaysPickFirst",
        candidateDefinitionIds: ["prop-a", "prop-b"],
        chosenDefinitionId: "prop-a",
      },
      {
        type: "marketFlowCardAdded",
        sourceType: "setup",
        destinationZone: "legendMarket",
        cardInstanceId: "card-legend",
        definitionId: "legend-card",
      },
      {
        type: "marketEventCardOpened",
        playerId: "player-2",
        turnNumber: 2,
        actionSequence: 5,
        actionIdentity: "endTurn",
        sourceType: "turn",
        destinationZone: "mainMarket",
        cardInstanceId: "card-mayhem",
        definitionId: "mayhem-card",
      },
      {
        type: "effectLifeSet",
        playerId: "player-2",
        targetPlayerId: "player-1",
        turnNumber: 2,
        actionSequence: 5,
        actionIdentity: "endTurn",
        cardInstanceId: "card-mayhem",
        definitionId: "mayhem-card",
        effectId: "set_life",
        amount: 15,
        targetLifeBefore: 4,
        targetLifeAfter: 15,
      },
      {
        type: "cardBought",
        playerId: "player-1",
        turnNumber: 2,
        actionSequence: 6,
        actionIdentity: "buyMarketCard:mainMarket",
        cardInstanceId: "card-buy",
        definitionId: "buy-card",
        destination: "discard",
        sourceZone: "mainMarket",
        amount: 3,
        powerBefore: 5,
        powerAfter: 2,
        chipsBefore: 1,
        chipsAfter: 1,
      },
      {
        type: "endTurnCleanupMoved",
        playerId: "player-1",
        turnNumber: 2,
        actionSequence: 7,
        actionIdentity: "endTurn",
        sourceZone: "player-1.hand",
        destinationZone: "player-1.discard",
        amount: 2,
        targetCardInstanceIds: ["card-a", "card-b"],
        targetDefinitionIds: ["hand-a", "hand-b"],
      },
      {
        type: "handDrawn",
        playerId: "player-1",
        turnNumber: 2,
        actionSequence: 7,
        actionIdentity: "endTurn",
        amount: 5,
        legalChoiceCount: 4,
        choiceId: "4",
        destinationZone: "player-1.hand",
        targetCardInstanceIds: ["card-c", "card-d", "card-e", "card-f"],
        targetDefinitionIds: ["draw-a", "draw-b", "draw-c", "draw-d"],
      },
    ],
  };

  const trace = formatSingleGameDebugTrace(result, {
    cardNames: new Map([
      ["legend-card", "Легенда"],
      ["mayhem-card", "2F"],
      ["buy-card", "Приунывший орк"],
      ["hand-a", "Знак"],
      ["hand-b", "Пшик"],
      ["draw-a", "Карта А"],
      ["draw-b", "Карта Б"],
      ["draw-c", "Карта В"],
      ["draw-d", "Карта Г"],
    ]),
    cardTexts: new Map([
      ["mayhem-card", "Атака: самый хилый колдун становится лошарой."],
    ]),
    tokenNames: new Map([
      ["prop-a", "Свойство А"],
      ["prop-b", "Свойство Б"],
    ]),
  });

  assert.match(trace, /Setup choice \(wizardProperty\): player-1 candidates \[Свойство А, Свойство Б\] -> Свойство А via alwaysPickFirst/);
  assert.match(trace, /Setup Market Flow: added Легенда \(card-legend\) to legend market/);
  assert.match(trace, /Turn 2 — before player-2 actions/);
  assert.match(trace, /opened event card 2F \(card-mayhem\).*Text: Атака: самый хилый колдун становится лошарой\./s);
  assert.match(trace, /Life set: player-2 sets player-1 to 15.*Life 4 -> 15/);
  assert.match(trace, /Bought Приунывший орк \(card-buy\) -> discard.*power 5 -> 2.*effective cost 3.*source main market/);
  assert.match(trace, /End turn cleanup: player-1 moves 2 card\(s\).*Знак \(card-a\), Пшик \(card-b\)/);
  assert.match(trace, /New hand: player-1 drew 4\/5 card\(s\); hand size 4.*Карта А \(card-c\).*Карта Г \(card-f\)/);
});
