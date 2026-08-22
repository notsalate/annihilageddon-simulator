import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  formatSingleGameDebugTrace,
  initializeGame,
  runMarketFlow,
  runSingleGame,
  type CardDefinition,
  type CardInstance,
  type GameState,
  type RuntimeEffect,
  type SingleGameResult,
} from "../src/index.js";
import {
  loadCurrentRuntimeDataPack,
  validateExecutableDataPack,
} from "../src/engine/data.js";
import { executeOnPlayEffects } from "../src/engine/effect-runtime.js";
import {
  resolveResurrectionLifeTotal,
  validateRuntimeEffectCatalogPayload,
  type EffectRuntimeCatalogOperationOverridesForTesting,
  type EffectSourceContext,
} from "../src/engine/effect-runtime-registry.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
  markPlayerId,
  markTokenDefinitionId,
  markTokenInstanceId,
} from "../src/domain/types.js";
import {
  addFixtureDefenseCardToHand,
  selectFirstFixtureDefense,
} from "./helpers/defense-fixtures.js";
import { withTemporaryEffectRuntimeOperations } from "./helpers/with-temporary-effect-runtime-operations.js";
import { verifiedTestRuntimeEffect } from "./helpers/verified-runtime-effect.js";
import { markRuntimeEffectTreeVerified } from "../src/engine/runtime-effect-verification.js";

const rootDir = process.cwd();
const fixturePlayerDefeatEffectId = "fixture_add_power_equal_to_target_cost";
const fixturePlayerDefeatHandler: EffectRuntimeCatalogOperationOverridesForTesting<"fixture_add_power_equal_to_target_cost"> =
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

test("resurrection catalog intake rejects malformed replacement instead of falling back to 20", () => {
  const result = validateRuntimeEffectCatalogPayload(
    "Malformed resurrection replacement",
    "set_resurrection_life_total",
    {
      effectId: "set_resurrection_life_total",
      timing: "replacement",
      lifeTotal: "invalid",
    },
    "combat",
    "wizardProperty"
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(
    result.errors.join("\n"),
    /lifeTotal must be a positive integer/
  );
});

test("resurrection catalog operation resolves the decoded life total", () => {
  const result = resolveResurrectionLifeTotal(
    verifiedTestRuntimeEffect({
      effectId: "set_resurrection_life_total",
      timing: "replacement",
      lifeTotal: 25,
    }),
    resurrectionSource(),
    []
  );

  assert.deepEqual(result, { status: "resolved", result: 25 });
});

test("resurrection catalog operation skips a replacement blocked by its status", () => {
  const result = resolveResurrectionLifeTotal(
    verifiedTestRuntimeEffect({
      effectId: "set_resurrection_life_total",
      timing: "replacement",
      lifeTotal: 25,
      unlessStatusId: "loser",
    }),
    resurrectionSource(),
    [{ statusId: "loser" }]
  );

  assert.deepEqual(result, { status: "notApplicable" });
});

test("playCard propagates a fixture effect's player-defeat game end", () => {
  const state = initializeGame({ rootDir, seed: 99118 });
  state.runtimeMode = "fixture";
  const activePlayer = mustGetActivePlayer(state);
  const runScenario = () => {
    const card = addFixtureCardToActiveHand(
      state,
      createFixtureCardDefinition("fixture-player-defeat", "normal", [
        {
          effectId: fixturePlayerDefeatEffectId,
          timing: "onPlay",
          target: { selector: "mainMarketCard" },
        },
      ])
    );

    const result = applyAction(state, {
      type: "playCard",
      cardInstanceId: card.instanceId,
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.gameEndReason, "playerDefeated");
    assert.equal(result.winnerPlayerId, activePlayer.playerId);
  };

  withTemporaryEffectRuntimeOperations(
    fixturePlayerDefeatEffectId,
    fixturePlayerDefeatHandler,
    runScenario
  );
});

test("play_top_card propagates game end from the nested card", () => {
  const state = initializeGame({ rootDir, seed: 99119 });
  state.runtimeMode = "fixture";
  const activePlayer = mustGetActivePlayer(state);
  const runScenario = () => {
    const nestedDefinition = createFixtureCardDefinition(
      "fixture-nested-player-defeat",
      "normal",
      [
        {
          effectId: fixturePlayerDefeatEffectId,
          timing: "onPlay",
          target: { selector: "mainMarketCard" },
        },
      ]
    );
    state.cardDefinitions = new Map([
      ...state.cardDefinitions,
      [nestedDefinition.cardId, nestedDefinition],
    ]);
    activePlayer.deck.unshift(
      createCardInstance(
        "fixture-nested-player-defeat-instance",
        nestedDefinition.cardId,
        activePlayer.playerId
      )
    );
    const outerCard = addFixtureCardToActiveHand(
      state,
      createFixtureCardDefinition("fixture-play-top-player-defeat", "normal", [
        {
          effectId: "play_top_card",
          timing: "onPlay",
          source: "activePlayerDeck",
          destination: "play",
        },
      ])
    );

    const result = applyAction(state, {
      type: "playCard",
      cardInstanceId: outerCard.instanceId,
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.gameEndReason, "playerDefeated");
    assert.equal(result.winnerPlayerId, activePlayer.playerId);
  };

  withTemporaryEffectRuntimeOperations(
    fixturePlayerDefeatEffectId,
    fixturePlayerDefeatHandler,
    runScenario
  );
});

test("play_top_card_from_foe_deck propagates game end from the nested card", () => {
  const state = initializeGame({ rootDir, seed: 99120, playerCount: 2 });
  state.runtimeMode = "fixture";
  const activePlayer = mustGetActivePlayer(state);
  const foe = state.players.find(
    (candidate) => candidate.playerId !== activePlayer.playerId
  );
  assert.ok(foe);
  const runScenario = () => {
    const nestedDefinition = createFixtureCardDefinition(
      "fixture-foe-nested-player-defeat",
      "normal",
      [
        {
          effectId: fixturePlayerDefeatEffectId,
          timing: "onPlay",
          target: { selector: "mainMarketCard" },
        },
      ]
    );
    state.cardDefinitions = new Map([
      ...state.cardDefinitions,
      [nestedDefinition.cardId, nestedDefinition],
    ]);
    foe.deck.unshift(
      createCardInstance(
        "fixture-foe-nested-player-defeat-instance",
        nestedDefinition.cardId,
        foe.playerId
      )
    );
    const outerCard = addFixtureCardToActiveHand(
      state,
      createFixtureCardDefinition(
        "fixture-play-foe-top-player-defeat",
        "normal",
        [
          {
            effectId: "play_top_card_from_foe_deck",
            timing: "onPlay",
            targetSelector: "chosenFoe",
          },
        ]
      )
    );

    const result = applyAction(state, {
      type: "playCard",
      cardInstanceId: outerCard.instanceId,
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.gameEndReason, "playerDefeated");
    assert.equal(result.winnerPlayerId, activePlayer.playerId);
  };

  withTemporaryEffectRuntimeOperations(
    fixturePlayerDefeatEffectId,
    fixturePlayerDefeatHandler,
    runScenario
  );
});

test("endTurn propagates a Mayhem defense branch game end without starting the next turn", () => {
  const state = initializeGame({ rootDir, seed: 99121, playerCount: 2 });
  state.runtimeMode = "fixture";
  const endingPlayer = mustGetActivePlayer(state);
  const defendingPlayer = state.players.find(
    (player) => player.playerId !== endingPlayer.playerId
  );
  assert.ok(defendingPlayer);

  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-mayhem-defense-player-defeat",
    "mayhem",
    [
      {
        effectId: "mayhem_attack",
        timing: "onMayhemResolve",
        amount: 1,
        target: { selector: "allPlayers" },
      },
    ]
  );
  const normalDefinition = createFixtureCardDefinition(
    "fixture-after-terminal-mayhem",
    "normal",
    []
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [mayhemDefinition.cardId, mayhemDefinition],
    [normalDefinition.cardId, normalDefinition],
  ]);
  const mayhemCard = createCardInstance(
    "fixture-mayhem-defense-player-defeat-instance",
    mayhemDefinition.cardId
  );
  const normalCard = createCardInstance(
    "fixture-after-terminal-mayhem-instance",
    normalDefinition.cardId
  );
  state.common.market.splice(0, 1);
  state.common.mainDeck.splice(
    0,
    state.common.mainDeck.length,
    mayhemCard,
    normalCard
  );
  addFixtureDefenseCardToHand(state, defendingPlayer, "discardSelf", {
    branchEffects: [
      {
        effectId: fixturePlayerDefeatEffectId,
        timing: "onDefense",
        target: { selector: "mainMarketCard" },
      },
    ],
  });
  state.effectChoiceStrategy = selectFirstFixtureDefense;

  const runScenario = () => {
    const result = applyAction(state, { type: "endTurn" });

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.gameEndReason, "playerDefeated");
    assert.equal(result.winnerPlayerId, defendingPlayer.playerId);
    assert.equal(
      state.eventLog.some(
        (event) =>
          event.type === "mayhemResolved" &&
          event.cardInstanceId === mayhemCard.instanceId
      ),
      false
    );
    assert.equal(
      state.eventLog.some(
        (event) =>
          event.type === "mayhemDestroyed" &&
          event.cardInstanceId === mayhemCard.instanceId
      ),
      false
    );
    assert.equal(state.common.market.includes(normalCard), false);
    assert.equal(
      state.eventLog.some((event) => event.type === "turnStarted"),
      false
    );
  };

  withTemporaryEffectRuntimeOperations(
    fixturePlayerDefeatEffectId,
    fixturePlayerDefeatHandler,
    runScenario
  );
});

test("optional effect records a typed option choice payload", () => {
  const state = initializeGame({ rootDir, seed: 99117, playerCount: 2 });
  const player = state.players[0];
  assert.ok(player);
  const definition = createFixtureCardDefinition(
    "fixture-optional-choice",
    "normal",
    [
      {
        effectId: "exchange_life_and_dingler_status",
        timing: "onPlay",
        targetSelector: "opponentPlayer",
        optional: true,
      },
    ]
  );
  state.effectChoiceStrategy = (request) => {
    const choice = request.choices.find(
      (candidate) =>
        candidate.choiceKind === "option" && candidate.choiceId === "pass"
    );
    return choice === undefined ? undefined : { choiceId: choice.choiceId };
  };
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: "fixture",
    playerId: player.playerId,
    cardInstanceId: "fixture-source",
    definitionId: definition.cardId,
  };

  const result = executeOnPlayEffects(state, player, definition, source);
  assert.equal(result.ok, true);
  const event = state.eventLog.find(
    (candidate) => candidate.type === "effectChoiceSelected"
  );
  assert.ok(event);
  assert.equal(event.choiceKind, "option");
  assert.equal(event.choiceId, "pass");
  assert.deepEqual(event.choiceIds, [
    "pass",
    "exchange_life_only",
    "exchange_dingler_status_only",
    "exchange_life_and_dingler_status",
  ]);
  assert.equal(event.legalChoiceCount, 4);
});

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
    assert.equal(
      countDefinition(ownedStarterCards, "esw2_dbg__starter_001"),
      6
    );
    assert.equal(
      countDefinition(ownedStarterCards, "esw2_dbg__starter_002"),
      3
    );
    assert.equal(
      countDefinition(ownedStarterCards, "esw2_dbg__starter_003"),
      1
    );
  }
});

test("Loshashlyk grants three power and no chips without Dinglers", () => {
  const state = initializeGame({ rootDir, seed: 36001 });
  const activePlayer = mustGetActivePlayer(state);
  const loshashlyk = createCardInstance(
    "runtime-loshashlyk-no-dinglers",
    "esw2_dbg__main_036",
    activePlayer.playerId
  );
  activePlayer.hand.push(loshashlyk);
  activePlayer.chips = 0;
  state.turn.power = 0;

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: loshashlyk.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 3);
  assert.equal(activePlayer.chips, 0);
});

test("Loshashlyk gains one chip per Dingler including its owner", () => {
  const state = initializeGame({ rootDir, seed: 36002, playerCount: 3 });
  const activePlayer = mustGetActivePlayer(state);
  const dinglerFoe = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(dinglerFoe);
  activePlayer.statuses.push({
    instanceId: markCardInstanceId("runtime-active-dingler"),
    statusId: "dingler",
    ownerId: activePlayer.playerId,
    effects: [],
  });
  dinglerFoe.statuses.push({
    instanceId: markCardInstanceId("runtime-foe-dingler"),
    statusId: "dingler",
    ownerId: dinglerFoe.playerId,
    effects: [],
  });
  const loshashlyk = createCardInstance(
    "runtime-loshashlyk-two-dinglers",
    "esw2_dbg__main_036",
    activePlayer.playerId
  );
  activePlayer.hand.push(loshashlyk);
  activePlayer.chips = 0;
  state.turn.power = 0;

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: loshashlyk.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 3);
  assert.equal(activePlayer.chips, 2);
});

test("Creator's Hand remains controlled and raises its controller's end-turn hand limit", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  assert.ok(dataPack.cardDefinitions.has("esw2_dbg__main_047"));

  const state = initializeGame({ rootDir, seed: 47001 });
  const activePlayer = mustGetActivePlayer(state);
  const creatorsHand = createCardInstance(
    "runtime-creators-hand",
    "esw2_dbg__main_047",
    activePlayer.playerId
  );
  activePlayer.hand.push(creatorsHand);

  const playResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: creatorsHand.instanceId,
  });
  assert.equal(playResult.ok, true);
  assert.equal(activePlayer.permanents.includes(creatorsHand), true);

  const endTurnResult = applyAction(state, { type: "endTurn" });
  assert.equal(endTurnResult.ok, true);
  assert.equal(activePlayer.hand.length, 6);
  assert.equal(activePlayer.permanents.includes(creatorsHand), true);

  const nextPlayerEndTurn = applyAction(state, { type: "endTurn" });
  assert.equal(nextPlayerEndTurn.ok, true);
  const repeatedEndTurn = applyAction(state, { type: "endTurn" });
  assert.equal(repeatedEndTurn.ok, true);
  assert.equal(activePlayer.hand.length, 6);
});

test("Creator's Hand rejects an invalid passive hand-limit amount at intake", () => {
  const state = initializeGame({ rootDir, seed: 47002 });
  const definition = state.cardDefinitions.get("esw2_dbg__main_047");
  assert.ok(definition);
  const effect = definition.engine.effects[0];
  assert.ok(effect);

  const result = validateRuntimeEffectCatalogPayload(
    "Creator's Hand invalid effect",
    effect.effectId,
    { ...effect, amount: -1 },
    state.runtimeMode,
    "card"
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join("\n"), /amount must be a positive integer/);
});

test("Creator's Hand combines with the maximum-life hand-limit modifier", () => {
  const state = initializeGame({ rootDir, seed: 47003 });
  const activePlayer = mustGetActivePlayer(state);
  const park = createCardInstance(
    "runtime-park-vurdalaktionov",
    "esw2_dbg__legend_010",
    activePlayer.playerId
  );
  const creatorsHand = createCardInstance(
    "runtime-creators-hand-with-park",
    "esw2_dbg__main_047",
    activePlayer.playerId
  );
  activePlayer.hand.push(park, creatorsHand);
  activePlayer.deck = Array.from({ length: 8 }, (_, index) =>
    createCardInstance(
      `runtime-hand-limit-draw-${index + 1}`,
      "esw2_dbg__starter_001",
      activePlayer.playerId
    )
  );

  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: park.instanceId })
      .ok,
    true
  );
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: creatorsHand.instanceId,
    }).ok,
    true
  );
  activePlayer.life.current = 100;

  const result = applyAction(state, { type: "endTurn" });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.hand.length, 8);
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
      result.errors.some(
        (error) =>
          error.includes("Raw starter template") &&
          error.includes("esw2_dbg__starter_003")
      )
    );
    assert.ok(
      result.errors.some(
        (error) =>
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
          playerId: markPlayerId("player-1"),
          handSize: 2,
          deckSize: 8,
          life: 20,
          maxLife: 25,
          chips: 1,
          hand: [
            {
              instanceId: markCardInstanceId("card-start-a"),
              definitionId: markCardDefinitionId("hand-a"),
              marketChips: 0,
            },
            {
              instanceId: markCardInstanceId("card-start-b"),
              definitionId: markCardDefinitionId("hand-b"),
              marketChips: 0,
            },
          ],
          wizardProperties: [
            {
              instanceId: markCardInstanceId("token-prop-a"),
              definitionId: markCardDefinitionId("prop-a"),
            },
          ],
          statuses: ["Dingler"],
        },
      ],
      mainMarket: [
        {
          instanceId: markCardInstanceId("card-buy"),
          definitionId: markCardDefinitionId("buy-card"),
          marketChips: 0,
        },
      ],
      legendMarket: [
        {
          instanceId: markCardInstanceId("card-legend"),
          definitionId: markCardDefinitionId("legend-card"),
          marketChips: 0,
        },
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
        playerId: markPlayerId("player-1"),
        setupChoiceKind: "wizardProperty",
        policyId: "alwaysPickFirst",
        candidateDefinitionIds: ["prop-a", "prop-b"],
        chosenDefinitionId: "prop-a",
      },
      {
        type: "marketFlowCardAdded",
        playerId: markPlayerId("player-1"),
        sourceType: "setup",
        destinationZone: "legendMarket",
        cardInstanceId: "card-legend",
        definitionId: markCardDefinitionId("legend-card"),
      },
      {
        type: "marketEventCardOpened",
        playerId: markPlayerId("player-2"),
        turnNumber: 2,
        actionSequence: 5,
        actionIdentity: "endTurn",
        sourceType: "turn",
        destinationZone: "mainMarket",
        cardInstanceId: "card-mayhem",
        definitionId: markCardDefinitionId("mayhem-card"),
      },
      {
        type: "effectLifeSet",
        playerId: markPlayerId("player-2"),
        targetPlayerId: markPlayerId("player-1"),
        turnNumber: 2,
        actionSequence: 5,
        actionIdentity: "endTurn",
        cardInstanceId: "card-mayhem",
        definitionId: markCardDefinitionId("mayhem-card"),
        effectId: "set_life",
        amount: 15,
        targetLifeBefore: 4,
        targetLifeAfter: 15,
        sourceType: "card",
      },
      {
        type: "mayhemResolved",
        playerId: markPlayerId("player-2"),
        turnNumber: 2,
        actionSequence: 5,
        actionIdentity: "endTurn",
        cardInstanceId: "card-mayhem",
        definitionId: markCardDefinitionId("mayhem-card"),
      },
      {
        type: "cardBought",
        playerId: markPlayerId("player-1"),
        turnNumber: 2,
        actionSequence: 6,
        actionIdentity: "buyMarketCard:mainMarket",
        cardInstanceId: "card-buy",
        definitionId: markCardDefinitionId("buy-card"),
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
        playerId: markPlayerId("player-1"),
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
        playerId: markPlayerId("player-1"),
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
      ["mayhem-card", "Атака:\nсамый хилый колдун становится лошарой."],
    ]),
    tokenNames: new Map([
      ["prop-a", "Свойство А"],
      ["prop-b", "Свойство Б"],
    ]),
    tokenTexts: new Map([["prop-a", "Получив волшебника, получи 1 чипсину."]]),
  });

  const openedIndex = trace.indexOf("opened event card 2F");
  const effectIndex = trace.indexOf("Life set: player-2 sets player-1");
  const resolvedIndex = trace.indexOf("Mayhem: 2F");

  assert.ok(openedIndex >= 0);
  assert.ok(effectIndex > openedIndex);
  assert.ok(resolvedIndex > effectIndex);
  assert.match(trace, /Post-setup state:/);
  assert.match(
    trace,
    /player-1: life 20\/25, chips 1, hand 2 \[Знак \(card-start-a\), Пшик \(card-start-b\)\], deck 8, wizard properties \[Свойство А \(token-prop-a\)\], statuses \[Dingler\]/
  );
  assert.match(trace, /main market \(1\): Приунывший орк \(card-buy\)/);
  assert.match(trace, /legend market \(1\): Легенда \(card-legend\)/);
  assert.match(
    trace,
    /stacks: main deck 42, legend deck 12, wild magic 16, limp wand 8, DWT 8/
  );
  assert.match(
    trace,
    /Setup choice \(wizardProperty\): player-1 candidates \[Свойство А, Свойство Б\] -> Свойство А via alwaysPickFirst\.\n {2}Text: Получив волшебника, получи 1 чипсину\./
  );
  assert.match(
    trace,
    /Setup Market Flow: added Легенда \(card-legend\) to legend market/
  );
  assert.match(trace, /Turn 2 — before player-2 actions/);
  assert.match(
    trace,
    /opened event card 2F \(card-mayhem\).*Text:\n {4}Атака:\n {4}самый хилый колдун становится лошарой\./s
  );
  assert.match(trace, /Life set: player-2 sets player-1 to 15.*Life 4 -> 15/);
  assert.match(
    trace,
    /Bought Приунывший орк \(card-buy\) -> discard.*power 5 -> 2.*effective cost 3.*source main market/
  );
  assert.match(
    trace,
    /End turn cleanup: player-1 moves 2 card\(s\).*Знак \(card-a\), Пшик \(card-b\)/
  );
  assert.match(
    trace,
    /New hand: player-1 drew 4\/5 card\(s\); hand size 4.*Карта А \(card-c\).*Карта Г \(card-f\)/
  );
});

test("runtime emits raw cardBought payment payload", () => {
  const state = initializeGame({ rootDir, seed: 80809 });
  const activePlayer = mustGetActivePlayer(state);
  const boughtCard = state.common.market[0];
  assert.ok(boughtCard);
  state.turn.power = 100;
  const result = applyAction(state, {
    type: "buyMarketCard",
    cardInstanceId: boughtCard.instanceId,
    source: "mainMarket",
  });

  assert.equal(result.ok, true);
  const bought = state.eventLog.find((event) => {
    return (
      event.type === "cardBought" &&
      event.cardInstanceId === boughtCard.instanceId
    );
  });

  assert.ok(bought);
  assert.equal(bought.playerId, activePlayer.playerId);
  assert.equal(bought.sourceZone, "mainMarket");
  assertNumber(bought.amount);
  assert.equal(bought.powerBefore, 100);
  assertNumber(bought.powerAfter);
  assert.equal(bought.chipsBefore, 0);
  assert.equal(bought.chipsAfter, 0);
  assert.equal(bought.powerBefore - bought.powerAfter, bought.amount);
});

test("runtime emits real effectLifeSet before/after payload", () => {
  const state = initializeGame({ rootDir, seed: 12345 });
  const activePlayer = mustGetActivePlayer(state);
  activePlayer.life.current = 4;
  const fixtureCard = addFixtureCardToActiveHand(
    state,
    createFixtureCardDefinition("fixture-set-life-card", "normal", [
      {
        effectId: "set_life",
        timing: "onPlay",
        lifeTotal: 15,
        target: {
          selector: "activePlayer",
        },
      },
    ])
  );

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCard.instanceId,
  });

  assert.equal(result.ok, true);
  const lifeSet = state.eventLog.find((event) => {
    return (
      event.type === "effectLifeSet" &&
      event.cardInstanceId === fixtureCard.instanceId
    );
  });
  assert.ok(lifeSet);
  assert.equal(lifeSet.playerId, activePlayer.playerId);
  assert.equal(lifeSet.targetPlayerId, activePlayer.playerId);
  assert.equal(lifeSet.amount, 15);
  assert.equal(lifeSet.targetLifeBefore, 4);
  assert.equal(lifeSet.targetLifeAfter, 15);
});

test("runtime opens event cards before resolving and destroying them", () => {
  const state = initializeGame({ rootDir, seed: 12345 });
  const activePlayer = mustGetActivePlayer(state);
  activePlayer.life.current = 4;
  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-mayhem-set-life-card",
    "mayhem",
    [
      {
        effectId: "set_life",
        timing: "onMayhemResolve",
        lifeTotal: 15,
        target: {
          selector: "activePlayer",
        },
      },
    ]
  );
  const fillerDefinition = createFixtureCardDefinition(
    "fixture-market-filler-card",
    "normal",
    []
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [mayhemDefinition.cardId, mayhemDefinition],
    [fillerDefinition.cardId, fillerDefinition],
  ]);
  state.common.market.splice(0);
  state.common.mainDeck.splice(
    0,
    state.common.mainDeck.length,
    createCardInstance("fixture-mayhem-instance", mayhemDefinition.cardId),
    ...Array.from({ length: 5 }, (_, index) =>
      createCardInstance(
        `fixture-market-filler-${index + 1}`,
        fillerDefinition.cardId
      )
    )
  );

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  const openedIndex = state.eventLog.findIndex(
    (event) =>
      event.type === "marketEventCardOpened" &&
      event.cardInstanceId === "fixture-mayhem-instance"
  );
  const lifeSetIndex = state.eventLog.findIndex(
    (event) =>
      event.type === "effectLifeSet" &&
      event.cardInstanceId === "fixture-mayhem-instance"
  );
  const resolvedIndex = state.eventLog.findIndex(
    (event) =>
      event.type === "mayhemResolved" &&
      event.cardInstanceId === "fixture-mayhem-instance"
  );
  const destroyedIndex = state.eventLog.findIndex(
    (event) =>
      event.type === "mayhemDestroyed" &&
      event.cardInstanceId === "fixture-mayhem-instance"
  );

  assert.ok(openedIndex >= 0);
  assert.ok(lifeSetIndex > openedIndex);
  assert.ok(resolvedIndex > lifeSetIndex);
  assert.ok(destroyedIndex > resolvedIndex);
});

test("readable trace can render multiline card text for a real runtime event", () => {
  const state = initializeGame({ rootDir, seed: 12345 });
  const fixtureCard = addFixtureCardToActiveHand(
    state,
    createFixtureCardDefinition("fixture-card-text-card", "normal", [
      {
        effectId: "add_power",
        timing: "onPlay",
        amount: 1,
      },
    ])
  );
  const playResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCard.instanceId,
  });
  assert.equal(playResult.ok, true);

  const result: SingleGameResult = {
    seed: state.seed,
    endReason: "maxTurnsReached",
    isGameEnd: false,
    turnsElapsed: 1,
    players: [],
    winnerIds: [],
    isTie: false,
    eventLog: state.eventLog,
  };
  const trace = formatSingleGameDebugTrace(result, {
    cardNames: new Map([[fixtureCard.definitionId, "Fixture text card"]]),
    cardTexts: new Map([
      [fixtureCard.definitionId, "+1 мощь\nАтака: нанеси 1 урон."],
    ]),
  });

  assert.match(
    trace,
    /Played Fixture text card \(fixture-card-text-card-instance\)\.\n {2}Text:\n {4}\+1 мощь\n {4}Атака: нанеси 1 урон\./
  );
});

test("end-turn cleanup records actual owner discard destination for non-owned played cards", () => {
  const state = initializeGame({ rootDir, seed: 12345 });
  const activePlayer = state.players.find(
    (player) => player.playerId === markPlayerId("player-1")
  );
  const ownerPlayer = state.players.find(
    (player) => player.playerId === markPlayerId("player-2")
  );
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

test("single-game trace renders compact post-setup state for a stable seed", () => {
  const result = runSingleGame({
    rootDir,
    seed: 12345,
    maxTurns: 1,
  });
  const trace = formatSingleGameDebugTrace(result);

  assert.ok(result.setupState);
  assert.match(trace, /Post-setup state:/);
  assert.match(
    trace,
    /player-1: life \d+\/\d+, chips \d+, hand \d+ \[[^\]]+\], deck \d+, wizard properties \[[^\]]+\]/
  );
  assert.match(
    trace,
    /player-2: life \d+\/\d+, chips \d+, hand \d+ \[[^\]]+\], deck \d+, wizard properties \[[^\]]+\]/
  );
  assert.match(trace, /main market \(\d+\): [^.]+\./);
  assert.match(trace, /legend market \(\d+\): [^.]+\./);
  assert.match(
    trace,
    /stacks: main deck \d+, legend deck \d+, wild magic \d+, limp wand \d+, DWT \d+\./
  );
});

function countDefinition(
  cards: ReadonlyArray<{ definitionId: string }>,
  definitionId: string
): number {
  return cards.filter((card) => card.definitionId === definitionId).length;
}

function resurrectionSource(): EffectSourceContext {
  return {
    sourceType: "wizardProperty",
    runtimeMode: "combat",
    playerId: markPlayerId("player-1"),
    cardInstanceId: "wizard-property-instance",
    definitionId: "wizard-property-definition",
    tokenInstanceId: markTokenInstanceId("wizard-property-instance"),
    tokenDefinitionId: markTokenDefinitionId("wizard-property-definition"),
  };
}

function assertNumber(value: unknown): asserts value is number {
  assert.equal(typeof value, "number");
}

function mustGetActivePlayer(state: GameState): GameState["players"][number] {
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  return activePlayer;
}

function addFixtureCardToActiveHand(
  state: GameState,
  definition: CardDefinition
): CardInstance {
  const activePlayer = mustGetActivePlayer(state);
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const card = createCardInstance(
    `${definition.cardId}-instance`,
    definition.cardId,
    activePlayer.playerId
  );
  activePlayer.hand.push(card);
  return card;
}

function createCardInstance(
  instanceId: string,
  definitionId: string,
  ownerId: CardInstance["ownerId"] = "common"
): CardInstance {
  return {
    instanceId: markCardInstanceId(instanceId),
    definitionId: markCardDefinitionId(definitionId),
    ownerId,
    marketChips: 0,
  };
}

function createFixtureCardDefinition(
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
      effects: effects.map((effect) => markRuntimeEffectTreeVerified(effect)),
      unsupportedMechanics: [],
    },
  };
}
