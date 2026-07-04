import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  formatSingleGameDebugTrace,
  initializeGame,
  loadCurrentRuntimeDataPack,
  runSingleGame,
  validateExecutableDataPack,
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
  for (const player of state.players) {
    const ownedStarterCards = [
      ...player.hand,
      ...player.deck,
      ...player.discard,
      ...player.playedThisTurn,
      ...player.permanents,
    ];
    assert.equal(ownedStarterCards.length, 10);
    assert.equal(countDefinition(ownedStarterCards, "esw2_dbg__starter_001"), 6);
    assert.equal(countDefinition(ownedStarterCards, "esw2_dbg__starter_002"), 3);
    assert.equal(countDefinition(ownedStarterCards, "esw2_dbg__starter_003"), 1);
  }
});

test("executable validation rejects non-canonical raw starter templates before setup modifiers", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const result = validateExecutableDataPack({
    ...dataPack,
    decks: {
      ...dataPack.decks,
      starterDeck: {
        ...dataPack.decks.starterDeck,
        entries: [
          { cardId: "esw2_dbg__starter_001", count: 30 },
          { cardId: "esw2_dbg__starter_002", count: 15 },
        ],
      },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.errors.some((error) =>
        error.includes("Raw starter template") &&
        error.includes("esw2_dbg__starter_003")
      )
    );
    assert.ok(
      result.errors.some((error) =>
        error.includes("Raw starter template") && error.includes("45")
      )
    );
  }
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
    setupState: {
      players: [
        {
          playerId: "player-1",
          handSize: 2,
          deckSize: 8,
          life: 20,
          maxLife: 25,
          chips: 1,
          hand: [
            { instanceId: "card-start-a", definitionId: "hand-a", marketChips: 0 },
            { instanceId: "card-start-b", definitionId: "hand-b", marketChips: 0 },
          ],
          wizardProperties: [
            { instanceId: "token-prop-a", definitionId: "prop-a" },
          ],
          statuses: ["Dingler"],
        },
      ],
      mainMarket: [
        { instanceId: "card-buy", definitionId: "buy-card", marketChips: 0 },
      ],
      legendMarket: [
        { instanceId: "card-legend", definitionId: "legend-card", marketChips: 0 },
      ],
      mainDeckSize: 42,
      legendDeckSize: 12,
      wildMagicStackSize: 16,
      limpWandStackSize: 8,
      deadWizardTokenStackSize: 8,
    },
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
        type: "mayhemResolved",
        playerId: "player-2",
        turnNumber: 2,
        actionSequence: 5,
        actionIdentity: "endTurn",
        cardInstanceId: "card-mayhem",
        definitionId: "mayhem-card",
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
        requestedCount: 5,
        drawnCount: 4,
        handSizeAfter: 4,
        destinationZone: "player-1.hand",
        targetCardInstanceIds: ["card-c", "card-d", "card-e", "card-f"],
        targetDefinitionIds: ["draw-a", "draw-b", "draw-c", "draw-d"],
      } as SingleGameResult["eventLog"][number],
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

  const openedIndex = trace.indexOf("opened event card 2F");
  const effectIndex = trace.indexOf("Life set: player-2 sets player-1");
  const resolvedIndex = trace.indexOf("Mayhem: 2F");

  assert.ok(openedIndex >= 0);
  assert.ok(effectIndex > openedIndex);
  assert.ok(resolvedIndex > effectIndex);
  assert.match(trace, /Setup state:/);
  assert.match(trace, /player-1: life 20\/25, chips 1, hand 2 \[Знак \(card-start-a\), Пшик \(card-start-b\)\], deck 8, wizard properties \[Свойство А \(token-prop-a\)\], statuses \[Dingler\]/);
  assert.match(trace, /main market \(1\): Приунывший орк \(card-buy\)/);
  assert.match(trace, /legend market \(1\): Легенда \(card-legend\)/);
  assert.match(trace, /stacks: main deck 42, legend deck 12, wild magic 16, limp wand 8, DWT 8/);
  assert.match(trace, /Setup choice \(wizardProperty\): player-1 candidates \[Свойство А, Свойство Б\] -> Свойство А via alwaysPickFirst/);
  assert.match(trace, /Setup Market Flow: added Легенда \(card-legend\) to legend market/);
  assert.match(trace, /Turn 2 — before player-2 actions/);
  assert.match(trace, /opened event card 2F \(card-mayhem\).*Text: Атака: самый хилый колдун становится лошарой\./s);
  assert.match(trace, /Life set: player-2 sets player-1 to 15.*Life 4 -> 15/);
  assert.match(trace, /Bought Приунывший орк \(card-buy\) -> discard.*power 5 -> 2.*effective cost 3.*source main market/);
  assert.match(trace, /End turn cleanup: player-1 moves 2 card\(s\).*Знак \(card-a\), Пшик \(card-b\)/);
  assert.match(trace, /New hand: player-1 drew 4\/5 card\(s\); hand size 4.*Карта А \(card-c\).*Карта Г \(card-f\)/);
});

test("runtime emits raw cardBought payment payload", () => {
  const result = runSingleGame({
    rootDir,
    seed: 80809,
    maxTurns: 1,
  });
  const bought = result.eventLog.find((event) => event.type === "cardBought");

  assert.ok(bought);
  assert.ok(
    ["mainMarket", "legendMarket", "wildMagicStack", "familiar"].includes(
      bought.sourceZone ?? ""
    )
  );
  assertNumber(bought.amount);
  assertNumber(bought.powerBefore);
  assertNumber(bought.powerAfter);
  assertNumber(bought.chipsBefore);
  assertNumber(bought.chipsAfter);
  assert.equal(
    bought.powerBefore - bought.powerAfter + bought.chipsBefore - bought.chipsAfter,
    bought.amount
  );
});

test("runtime emits explicit handDrawn payload without choice-field overload", () => {
  const result = runSingleGame({
    rootDir,
    seed: 80809,
    maxTurns: 1,
  });
  const handDrawn = result.eventLog.find(
    (event) => event.type === "handDrawn"
  ) as Record<string, unknown> | undefined;

  assert.ok(handDrawn);
  assert.equal(handDrawn["requestedCount"], 5);
  assert.equal(handDrawn["drawnCount"], 5);
  assert.equal(handDrawn["handSizeAfter"], 5);
  assert.equal(handDrawn["choiceId"], undefined);
  assert.equal(handDrawn["legalChoiceCount"], undefined);
  assert.deepEqual(
    (handDrawn["targetCardInstanceIds"] as readonly unknown[]).length,
    handDrawn["drawnCount"]
  );
});

test("end-turn cleanup records actual owner discard destination for non-owned played cards", () => {
  const state = initializeGame({ rootDir, seed: 12345 });
  const activePlayer = state.players.find((player) => player.playerId === "player-1");
  const ownerPlayer = state.players.find((player) => player.playerId === "player-2");
  assert.ok(activePlayer);
  assert.ok(ownerPlayer);

  state.activePlayerId = activePlayer.playerId;
  activePlayer.hand.splice(0);
  const borrowedCard = ownerPlayer.deck.pop();
  assert.ok(borrowedCard);
  activePlayer.playedThisTurn.push(borrowedCard);

  const actionResult = applyAction(state, { type: "endTurn" });

  assert.equal(actionResult.ok, true);
  assert.ok(
    ownerPlayer.discard.some(
      (card) => card.instanceId === borrowedCard.instanceId
    )
  );
  const cleanupEvent = state.eventLog.find((event) => {
    return (
      event.type === "endTurnCleanupMoved" &&
      event.targetCardInstanceIds?.includes(borrowedCard.instanceId)
    );
  });
  assert.ok(cleanupEvent);
  assert.equal(cleanupEvent.sourceZone, "player-1.playedThisTurn");
  assert.equal(cleanupEvent.destinationZone, "player-2.discard");
});

test("single-game trace renders compact setup state for a stable seed", () => {
  const result = runSingleGame({
    rootDir,
    seed: 12345,
    maxTurns: 1,
  });
  const trace = formatSingleGameDebugTrace(result);

  assert.ok(result.setupState);
  assert.match(trace, /Setup state:/);
  assert.match(trace, /player-1: life \d+\/\d+, chips \d+, hand \d+ \[[^\]]+\], deck \d+, wizard properties \[[^\]]+\]/);
  assert.match(trace, /player-2: life \d+\/\d+, chips \d+, hand \d+ \[[^\]]+\], deck \d+, wizard properties \[[^\]]+\]/);
  assert.match(trace, /main market \(\d+\): [^.]+\./);
  assert.match(trace, /legend market \(\d+\): [^.]+\./);
  assert.match(trace, /stacks: main deck \d+, legend deck \d+, wild magic \d+, limp wand \d+, DWT \d+\./);
});

function countDefinition(
  cards: ReadonlyArray<{ definitionId: string }>,
  definitionId: string
): number {
  return cards.filter((card) => card.definitionId === definitionId).length;
}

function assertNumber(value: unknown): asserts value is number {
  assert.equal(typeof value, "number");
}
