import assert from "node:assert/strict";
import test from "node:test";

import {
  enumerateTurnLines,
  enumerateImmediateActionBranches,
  initializeGame,
  rankTurnLines,
  type CardDefinition,
  type AnalysisLimits,
  type DeckComposition,
  type GameState,
  type LoadedDataPack,
  type RuntimeEffect,
  type TokenDefinition,
  type TurnLineEvaluationContext,
} from "../src/index.js";
import { victoryPointsPolicy } from "../src/engine/best-move-policies.js";
import { verifiedTestRuntimeEffect } from "./helpers/verified-runtime-effect.js";
import { addFixtureDefinitionToActiveHand } from "./helpers/fixture-cards.js";
import { withTemporaryEffectRuntimeOperations } from "./helpers/with-temporary-effect-runtime-operations.js";

const rootDir = process.cwd();

function analysisLimits(overrides: Partial<AnalysisLimits> = {}) {
  return {
    maxChoiceDepth: 32,
    maxBranchesPerAction: 32,
    maxActionsPerLine: 8,
    maxTurnLines: 100,
    ...overrides,
  };
}

function rankingFixture(): {
  state: GameState;
  lines: ReturnType<typeof enumerateTurnLines>;
} {
  const state = initializeGame({ rootDir, seed: 127 });
  state.common.market = [];
  state.common.legendMarket = [];
  state.common.wildMagicStack = [];
  state.common.mainDeck = [];
  state.common.legendDeck = [];
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];
  activePlayer.permanents = [];
  activePlayer.wizardProperties = [];
  activePlayer.statuses = [];
  activePlayer.trophyLikeObjects = [];
  activePlayer.unboughtFamiliar = undefined;
  activePlayer.deck = [];
  activePlayer.discard = [];
  addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-simple")
  );
  addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-simple-2")
  );
  return {
    state,
    lines: enumerateTurnLines(state, {
      maxChoiceDepth: 32,
      maxBranchesPerAction: 32,
      maxActionsPerLine: 3,
      maxTurnLines: 100,
    }),
  };
}

function fixtureDefinition(
  cardId: string,
  effects: RuntimeEffect[] = []
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
      cardKind: "normal",
      cardTypes: [],
      markers: [],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind: "normal",
      cardTypes: [],
      cost: 0,
      victoryPoints: 0,
      isOngoing: false,
      marketChipMarker: false,
      effects: effects.map((effect) => verifiedTestRuntimeEffect(effect)),
      unsupportedMechanics: [],
    },
  };
}

function fixtureDefinitionWithVictoryPoints(
  cardId: string,
  victoryPoints: number
): CardDefinition {
  const definition = fixtureDefinition(cardId);
  return {
    ...definition,
    visible: { ...definition.visible, victoryPoints },
    engine: { ...definition.engine, victoryPoints },
  };
}

function analysisFixtureDataPack(): LoadedDataPack {
  const starter = fixtureDefinition("fixture-analysis-starter");
  const main = cardDefinitionWithKind("fixture-analysis-main", "normal");
  const legend = cardDefinitionWithKind("fixture-analysis-legend", "legend");
  const familiar = cardDefinitionWithKind(
    "fixture-analysis-familiar",
    "familiar"
  );
  const property = tokenDefinition("fixture-analysis-property");
  return {
    manifest: {
      schemaVersion: 1,
      packId: "fixture-analysis",
      runtimeSchema: "krutagidon.dataPack.v0",
      mappingStatus: "fixture",
      cardDefinitionPaths: [],
      tokenDefinitionPaths: [],
    },
    cardDefinitions: new Map([
      [starter.cardId, starter],
      [main.cardId, main],
      [legend.cardId, legend],
      [familiar.cardId, familiar],
    ]),
    tokenDefinitions: new Map([[property.tokenId, property]]),
    decks: {
      starterDeck: fixtureDeck("fixture-analysis-starter-deck", "starterDeck", [
        { cardId: starter.cardId, count: 10 },
      ]),
      mainDeck: fixtureDeck("fixture-analysis-main-deck", "mainDeck", [
        { cardId: main.cardId, count: 5 },
      ]),
      legendDeck: fixtureDeck("fixture-analysis-legend-deck", "legendDeck", [
        { cardId: legend.cardId, count: 3 },
      ]),
      wildMagicStack: fixtureDeck(
        "fixture-analysis-wild-magic",
        "wildMagicStack",
        []
      ),
      limpWandStack: fixtureDeck(
        "fixture-analysis-limp-wand",
        "limpWandStack",
        []
      ),
      familiarPool: fixtureDeck(
        "fixture-analysis-familiar-pool",
        "familiarPool",
        [{ cardId: familiar.cardId, count: 4 }]
      ),
    },
    tokenStacks: {
      deadWizardTokens: undefined,
      wizardProperties: {
        schemaVersion: 1,
        stackId: "fixture-analysis-properties",
        runtimeSchema: "krutagidon.tokenStack.v0",
        role: "wizardProperties",
        mappingStatus: "fixture",
        entries: [{ tokenId: property.tokenId, count: 4 }],
      },
    },
  };
}

function cardDefinitionWithKind(
  cardId: string,
  cardKind: CardDefinition["engine"]["cardKind"]
): CardDefinition {
  const definition = fixtureDefinition(cardId);
  return {
    ...definition,
    visible: { ...definition.visible, cardKind },
    engine: { ...definition.engine, cardKind },
  };
}

function tokenDefinition(tokenId: string): TokenDefinition {
  return {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    source: { image: `fixture/${tokenId}.png` },
    visible: { textRu: tokenId },
    engine: {
      mappingStatus: "fixture",
      playableInV0: true,
      effects: [],
      unsupportedMechanics: [],
    },
  };
}

function fixtureDeck(
  deckId: string,
  role: DeckComposition["role"],
  entries: DeckComposition["entries"]
): DeckComposition {
  return {
    schemaVersion: 1,
    deckId,
    runtimeSchema: "krutagidon.deckComposition.v0",
    role,
    mappingStatus: "fixture",
    entries,
  };
}

function analysisFixtureState(seed: number): GameState {
  const state = initializeGame({ dataPack: analysisFixtureDataPack(), seed });
  state.common.market = [];
  state.common.legendMarket = [];
  state.common.mainDeck = [];
  state.common.legendDeck = [];
  state.common.wildMagicStack = [];
  state.common.limpWandStack = [];
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  if (activePlayer !== undefined) {
    activePlayer.unboughtFamiliar = undefined;
  }
  return state;
}

test("enumerates simple actions into independent completed branches", () => {
  const state = analysisFixtureState(125);
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];
  const card = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-simple")
  );
  const secondCard = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-simple-2")
  );
  const sourceTurn = state.turn.number;
  const sourceStrategy = () => undefined;
  state.effectChoiceStrategy = sourceStrategy;
  const sourceSnapshot = structuredClone({
    activePlayerId: state.activePlayerId,
    turn: state.turn,
    players: state.players,
    common: state.common,
    cardDefinitions: [...state.cardDefinitions.entries()],
    tokenDefinitions: [...state.tokenDefinitions.entries()],
    eventLog: state.eventLog,
  });
  const sourceRngProbe = state.rng.fork();
  const expectedSourceRngValue = sourceRngProbe.nextInt(1_000);

  const result = enumerateImmediateActionBranches(state);
  const repeatedResult = enumerateImmediateActionBranches(state);

  assert.equal(result.length, 3);
  assert.equal(result[0]?.legalAction.type, "playCard");
  const firstBranchPlayer = result[0]?.resultingState.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(firstBranchPlayer);
  assert.equal(
    firstBranchPlayer.hand.some(
      (candidate) => candidate.instanceId === card.instanceId
    ),
    false
  );
  assert.equal(
    firstBranchPlayer.hand.some(
      (candidate) => candidate.instanceId === secondCard.instanceId
    ),
    true
  );
  const secondBranchPlayer = result[1]?.resultingState.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(secondBranchPlayer);
  assert.notEqual(firstBranchPlayer, secondBranchPlayer);
  assert.equal(result[2]?.legalAction.type, "endTurn");
  assert.equal(result[2]?.resultingState.turn.number, sourceTurn + 1);
  assert.equal(state.turn.number, sourceTurn);
  assert.deepEqual(
    result.map(
      ({
        legalAction,
        legalActionIndex,
        selectedChoices,
        result: actionResult,
      }) => ({
        legalAction,
        legalActionIndex,
        selectedChoices,
        actionResult,
      })
    ),
    repeatedResult.map(
      ({
        legalAction,
        legalActionIndex,
        selectedChoices,
        result: actionResult,
      }) => ({
        legalAction,
        legalActionIndex,
        selectedChoices,
        actionResult,
      })
    )
  );
  assert.deepEqual(
    structuredClone({
      activePlayerId: state.activePlayerId,
      turn: state.turn,
      players: state.players,
      common: state.common,
      cardDefinitions: [...state.cardDefinitions.entries()],
      tokenDefinitions: [...state.tokenDefinitions.entries()],
      eventLog: state.eventLog,
    }),
    sourceSnapshot
  );
  assert.equal(state.rng.fork().nextInt(1_000), expectedSourceRngValue);
  assert.equal(state.effectChoiceStrategy, sourceStrategy);
});

test("raises an analysis error when a legal action cannot be applied", () => {
  const state = analysisFixtureState(131);
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const card = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-mismatch")
  );
  let handMapCalls = 0;
  const sourceHand = [card];
  activePlayer.hand = new Proxy(sourceHand, {
    get(target, property, receiver) {
      if (property === "map") {
        handMapCalls += 1;
        return handMapCalls === 1 ? target.map.bind(target) : () => [];
      }
      return Reflect.get(target, property, receiver) as never;
    },
  });

  assert.throws(
    () => enumerateImmediateActionBranches(state),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.name, "AnalysisError");
      assert.match(error.message, /Analysis failed for action/);
      assert.match(error.message, /playCard/);
      assert.match(error.message, /Card is not in the active player's hand/);
      return true;
    }
  );
});

test("enumerates every current-turn action history through endTurn", () => {
  const state = initializeGame({ rootDir, seed: 127 });
  state.common.market = [];
  state.common.legendMarket = [];
  state.common.wildMagicStack = [];
  state.common.mainDeck = [];
  state.common.legendDeck = [];
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];
  activePlayer.permanents = [];
  activePlayer.wizardProperties = [];
  activePlayer.statuses = [];
  activePlayer.trophyLikeObjects = [];
  activePlayer.unboughtFamiliar = undefined;
  activePlayer.deck = [];
  activePlayer.discard = [];
  addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-simple")
  );
  addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-simple-2")
  );

  const lines = enumerateTurnLines(state, {
    maxChoiceDepth: 32,
    maxBranchesPerAction: 32,
    maxActionsPerLine: 3,
    maxTurnLines: 100,
  });
  const histories = lines.map((line) =>
    line.steps
      .map((step) =>
        step.action.type === "playCard"
          ? step.action.cardInstanceId.replace("-instance-", "-")
          : step.action.type
      )
      .join(">")
  );

  assert.deepEqual(histories, [
    "fixture-analysis-simple-1>fixture-analysis-simple-2-2>endTurn",
    "fixture-analysis-simple-1>endTurn",
    "fixture-analysis-simple-2-2>fixture-analysis-simple-1>endTurn",
    "fixture-analysis-simple-2-2>endTurn",
    "endTurn",
  ]);
  assert.ok(lines.every((line) => line.terminalReason === "endTurn"));
  assert.ok(
    lines.every((line) =>
      line.steps.every(
        (step) => step.action.type !== "endTurn" || step === line.steps.at(-1)
      )
    )
  );
});

test("enumerates current-turn lines in stable depth-first order", () => {
  const state = analysisFixtureState(127);
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];
  addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-stable-order-a")
  );
  addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-stable-order-b")
  );

  const enumerateHistories = () =>
    enumerateTurnLines(state, analysisLimits({ maxActionsPerLine: 3 })).map(
      (line) =>
        line.steps
          .map((step) =>
            step.action.type === "playCard"
              ? step.action.cardInstanceId
              : step.action.type
          )
          .join(">")
    );

  assert.deepEqual(enumerateHistories(), [
    "fixture-analysis-stable-order-a-instance-1>fixture-analysis-stable-order-b-instance-2>endTurn",
    "fixture-analysis-stable-order-a-instance-1>endTurn",
    "fixture-analysis-stable-order-b-instance-2>fixture-analysis-stable-order-a-instance-1>endTurn",
    "fixture-analysis-stable-order-b-instance-2>endTurn",
    "endTurn",
  ]);
  assert.deepEqual(enumerateHistories(), enumerateHistories());
});

test("keeps sibling game-ending ordinary actions and stops each winning line", () => {
  const state = analysisFixtureState(128);
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];
  const lowerScoreCard = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-game-ending-action-low", [
      {
        effectId: "fixture_add_power_equal_to_target_cost",
        timing: "onPlay",
        target: { selector: "mainMarketCard" },
      },
    ])
  );
  const higherScoreCard = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-game-ending-action-high", [
      {
        effectId: "fixture_add_power_equal_to_target_cost",
        timing: "onPlay",
        target: { selector: "mainMarketCard" },
      },
    ])
  );
  const lines = withTemporaryEffectRuntimeOperations(
    "fixture_add_power_equal_to_target_cost",
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
    },
    () => enumerateTurnLines(state, analysisLimits())
  ).filter((line) => line.terminalReason === "gameEnd");

  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => line.gameEndReason === "playerDefeated"));
  assert.ok(lines.every((line) => line.steps.length === 1));
  assert.deepEqual(
    lines.map((line) => line.steps[0]?.action),
    [
      { type: "playCard", cardInstanceId: lowerScoreCard.instanceId },
      { type: "playCard", cardInstanceId: higherScoreCard.instanceId },
    ]
  );

  const ranking = rankTurnLines(
    state,
    lines,
    {
      id: "fixture-game-end-score",
      evaluate({ line }) {
        return {
          score:
            line.steps[0]?.action.type === "playCard" &&
            line.steps[0].action.cardInstanceId === higherScoreCard.instanceId
              ? 10
              : 1,
        };
      },
    },
    state.activePlayerId
  );
  assert.equal(
    ranking.best?.line.steps[0]?.action.type === "playCard"
      ? ranking.best.line.steps[0].action.cardInstanceId
      : undefined,
    higherScoreCard.instanceId
  );
});

test("victory-points policy ranks by score even when a lower-scoring line has a winner", () => {
  const state = analysisFixtureState(133);
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];
  const winningDefinition = fixtureDefinitionWithVictoryPoints(
    "fixture-winning-low-score",
    1
  );
  addFixtureDefinitionToActiveHand(state, {
    ...winningDefinition,
    engine: {
      ...winningDefinition.engine,
      effects: [
        verifiedTestRuntimeEffect({
          effectId: "fixture_add_power_equal_to_target_cost",
          timing: "onPlay",
          target: { selector: "mainMarketCard" },
        }),
      ],
    },
  });
  const bonusCard = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinitionWithVictoryPoints("fixture-non-winning-high-score", 100)
  );
  state.common.mainDeck = [];
  state.common.legendDeck = [];
  state.common.wildMagicStack = [];

  const lines = withTemporaryEffectRuntimeOperations(
    "fixture_add_power_equal_to_target_cost",
    {
      execute(_state, player) {
        player.hand = player.hand.filter(
          (card) => card.instanceId !== bonusCard.instanceId
        );
        return {
          ok: true,
          gameEnd: {
            reason: "playerDefeated",
            winnerPlayerId: player.playerId,
          },
        };
      },
    },
    () => enumerateTurnLines(state, analysisLimits({ maxActionsPerLine: 2 }))
  );
  const oneStepLines = lines.filter((line) => line.steps.length === 1);
  const ranking = rankTurnLines(
    state,
    oneStepLines,
    victoryPointsPolicy,
    state.activePlayerId
  );

  assert.ok(
    oneStepLines.some((line) => line.winnerPlayerId === state.activePlayerId)
  );
  assert.equal(ranking.best?.line.winnerPlayerId, undefined);
  assert.equal(ranking.best?.score, 101);
});

test("does not treat endTurn deck exhaustion as a perspective win", () => {
  const state = analysisFixtureState(132);
  state.common.market = [];
  state.common.legendMarket = [];
  state.common.mainDeck = [];
  state.common.legendDeck = [];
  state.common.wildMagicStack = [];
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];

  const lines = enumerateTurnLines(
    state,
    analysisLimits({ maxActionsPerLine: 1 })
  );
  const ranking = rankTurnLines(
    state,
    lines,
    victoryPointsPolicy,
    state.activePlayerId
  );

  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.terminalReason, "endTurn");
  assert.equal(lines[0]?.gameEndReason, "legendDeckExhausted");
  assert.equal(lines[0]?.winnerPlayerId, undefined);
  assert.equal(
    ranking.best?.components?.["victoryPoints"],
    ranking.best?.score
  );
});

test("rejects a non-end action that changes the root player and turn", () => {
  const state = analysisFixtureState(129);
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];
  addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-invalid-turn-transition", [
      {
        effectId: "fixture_add_power_equal_to_target_cost",
        timing: "onPlay",
        target: { selector: "mainMarketCard" },
      },
    ])
  );

  withTemporaryEffectRuntimeOperations(
    "fixture_add_power_equal_to_target_cost",
    {
      execute(mutatedState, player) {
        const nextPlayer = mutatedState.players.find(
          (candidate) => candidate.playerId !== player.playerId
        );
        assert.ok(nextPlayer);
        mutatedState.activePlayerId = nextPlayer.playerId;
        mutatedState.turn.number += 1;
        return { ok: true };
      },
    },
    () =>
      assert.throws(
        () => enumerateTurnLines(state, analysisLimits()),
        (error: unknown) =>
          error instanceof Error &&
          error.name === "AnalysisError" &&
          /active player or turn changed/.test(error.message)
      )
  );
});

test("continues every choice branch to its own endTurn line", () => {
  const state = initializeGame({ rootDir, seed: 128 });
  state.common.market = state.common.market.slice(0, 2);
  state.common.legendMarket = [];
  state.common.wildMagicStack = [];
  state.common.mainDeck = [];
  state.common.legendDeck = [];
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];
  const card = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-line-choice", [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 1,
        targetSelector: "chosenPlayer",
      },
    ])
  );

  const lines = enumerateTurnLines(
    state,
    analysisLimits({ maxActionsPerLine: 2 })
  );
  const choiceLines = lines.filter(
    (line) =>
      line.steps[0]?.action.type === "playCard" &&
      line.steps[0].action.cardInstanceId === card.instanceId
  );

  assert.deepEqual(
    choiceLines.map((line) =>
      line.steps[0]?.selectedChoices.map((choice) => choice.choiceIndex)
    ),
    [[0], [1]]
  );
  assert.ok(choiceLines.every((line) => line.terminalReason === "endTurn"));
  assert.ok(
    choiceLines.every((line) => line.steps.at(-1)?.action.type === "endTurn")
  );
});

test("preserves the root player and turn while exposing endTurn game-end metadata", () => {
  const state = initializeGame({ rootDir, seed: 129 });
  state.common.market = [];
  state.common.legendMarket = [];
  state.common.mainDeck = [];
  state.common.legendDeck = [];
  state.common.wildMagicStack = [];
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];
  const initialPlayerId = state.activePlayerId;
  const initialTurnNumber = state.turn.number;

  const lines = enumerateTurnLines(
    state,
    analysisLimits({ maxActionsPerLine: 1 })
  );

  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.terminalReason, "endTurn");
  assert.equal(lines[0]?.gameEndReason, "legendDeckExhausted");
  assert.equal(lines[0]?.initialPlayerId, initialPlayerId);
  assert.equal(lines[0]?.initialTurnNumber, initialTurnNumber);
  assert.notEqual(lines[0]?.terminalState.activePlayerId, initialPlayerId);
  assert.equal(lines[0]?.terminalState.turn.number, initialTurnNumber + 1);
  assert.equal(state.activePlayerId, initialPlayerId);
  assert.equal(state.turn.number, initialTurnNumber);
});

test("keeps sibling turn lines isolated and replays RNG from the same fork", () => {
  const state = initializeGame({ rootDir, seed: 130 });
  state.common.market = [];
  state.common.legendMarket = [];
  state.common.wildMagicStack = [];
  state.common.mainDeck = [];
  state.common.legendDeck = [];
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];
  activePlayer.deck = [];
  activePlayer.discard = [];
  const drawDefinition = fixtureDefinition("fixture-analysis-random", [
    { effectId: "draw_cards", timing: "onPlay", amount: 1 },
  ]);
  const first = addFixtureDefinitionToActiveHand(state, drawDefinition);
  const second = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-random-2", [
      { effectId: "draw_cards", timing: "onPlay", amount: 1 },
    ])
  );
  const drawn = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-random-drawn")
  );
  const otherDrawn = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-random-drawn-2")
  );
  activePlayer.hand = [first, second];
  activePlayer.discard = [drawn, otherDrawn];

  const lines = enumerateTurnLines(
    state,
    analysisLimits({ maxActionsPerLine: 8, maxTurnLines: 10_000 })
  );
  const firstOnly = lines.find(
    (line) =>
      line.steps
        .map((step) =>
          step.action.type === "playCard"
            ? step.action.cardInstanceId
            : step.action.type
        )
        .join(">") === `${first.instanceId}>endTurn`
  );
  const secondOnly = lines.find(
    (line) =>
      line.steps
        .map((step) =>
          step.action.type === "playCard"
            ? step.action.cardInstanceId
            : step.action.type
        )
        .join(">") === `${second.instanceId}>endTurn`
  );
  assert.ok(firstOnly);
  assert.ok(secondOnly);
  const firstProbe = firstOnly.terminalState.rng.nextInt(1_000);
  const secondProbe = secondOnly.terminalState.rng.nextInt(1_000);
  assert.equal(firstProbe, secondProbe);
  assert.notEqual(firstOnly.terminalState, secondOnly.terminalState);
  firstOnly.terminalState.turn.activatedCardIds.push("mutated-sibling");
  assert.equal(
    secondOnly.terminalState.turn.activatedCardIds.includes("mutated-sibling"),
    false
  );
  assert.deepEqual(
    activePlayer.discard.map((card) => card.instanceId),
    [drawn.instanceId, otherDrawn.instanceId]
  );
});

test("fails without a partial result when action or line limits are reached", () => {
  const state = rankingFixture().state;
  assert.throws(
    () => enumerateTurnLines(state, analysisLimits({ maxActionsPerLine: 1 })),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "AnalysisLimitError" &&
      /action limit exceeded 1/.test(error.message)
  );
  assert.throws(
    () => enumerateTurnLines(state, analysisLimits({ maxTurnLines: 1 })),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "AnalysisLimitError" &&
      /turn-line limit exceeded 1/.test(error.message)
  );
});

test("enumerates each card target as a completed branch", () => {
  const state = initializeGame({ rootDir, seed: 126 });
  state.runtimeMode = "fixture";
  const target = state.common.market[0];
  const secondTarget = state.common.mainDeck[0];
  assert.ok(target);
  assert.ok(secondTarget);
  state.common.market = [target, secondTarget];
  state.common.legendMarket = [];
  state.common.wildMagicStack = [];
  state.turn.power = 0;
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];
  const source = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-choice", [
      {
        effectId: "fixture_add_power_equal_to_target_cost",
        timing: "onPlay",
        target: { selector: "mainMarketCard" },
      },
    ])
  );
  const originalStrategy = state.effectChoiceStrategy;
  const result = enumerateImmediateActionBranches(state);
  const branches = result.filter(
    (branch) => branch.legalAction.type === "playCard"
  );
  assert.equal(branches.length, 2);
  assert.equal(
    branches[0]?.selectedChoices[0]?.effectId,
    "fixture_add_power_equal_to_target_cost"
  );
  assert.equal(branches[0]?.selectedChoices[0]?.sourceType, "card");
  assert.equal(
    branches[0]?.selectedChoices[0]?.cardInstanceId,
    source.instanceId
  );
  assert.equal(branches[0]?.selectedChoices[0]?.choiceIndex, 0);
  assert.equal(branches[0]?.selectedChoices[0]?.choiceId, target.instanceId);
  assert.equal(branches[1]?.selectedChoices[0]?.choiceIndex, 1);
  assert.equal(
    branches[1]?.selectedChoices[0]?.choiceId,
    secondTarget.instanceId
  );
  assert.equal(branches[0]?.selectedChoices[0]?.choiceKind, "cardTarget");
  assert.equal(state.effectChoiceStrategy, originalStrategy);
  assert.equal(
    JSON.stringify(branches[0]?.selectedChoices).includes("players"),
    false
  );
});

test("limits the total generated branches across sequential choices", () => {
  const state = initializeGame({ rootDir, seed: 126 });
  state.runtimeMode = "fixture";
  const target = state.common.market[0];
  const secondTarget = state.common.mainDeck[0];
  assert.ok(target);
  assert.ok(secondTarget);
  state.common.market = [target, secondTarget];
  state.common.legendMarket = [];
  state.common.wildMagicStack = [];
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];
  const card = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-sequential-choice", [
      {
        effectId: "fixture_add_power_equal_to_target_cost",
        timing: "onPlay",
        target: { selector: "mainMarketCard" },
      },
      {
        effectId: "fixture_add_power_equal_to_target_cost",
        timing: "onPlay",
        target: { selector: "mainMarketCard" },
      },
    ])
  );

  assert.throws(
    () =>
      enumerateImmediateActionBranches(state, {
        maxChoiceDepth: 32,
        maxBranchesPerAction: 3,
        maxActionsPerLine: 128,
        maxTurnLines: 100_000,
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.name, "AnalysisLimitError");
      assert.match(error.message, /branch limit exceeded 3/);
      assert.match(error.message, new RegExp(card.instanceId));
      return true;
    }
  );
});

test("enumerates the Cartesian product of sequential choices", () => {
  const state = initializeGame({ rootDir, seed: 126 });
  state.runtimeMode = "fixture";
  const target = state.common.market[0];
  const secondTarget = state.common.mainDeck[0];
  assert.ok(target);
  assert.ok(secondTarget);
  state.common.market = [target, secondTarget];
  state.common.legendMarket = [];
  state.common.wildMagicStack = [];
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];
  addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-cartesian-choice", [
      {
        effectId: "fixture_add_power_equal_to_target_cost",
        timing: "onPlay",
        target: { selector: "mainMarketCard" },
      },
      {
        effectId: "fixture_add_power_equal_to_target_cost",
        timing: "onPlay",
        target: { selector: "mainMarketCard" },
      },
    ])
  );

  const branches = enumerateImmediateActionBranches(state).filter(
    (branch) => branch.legalAction.type === "playCard"
  );
  assert.equal(branches.length, 4);
  assert.deepEqual(
    branches.map((branch) =>
      branch.selectedChoices.map((choice) => choice.choiceIndex)
    ),
    [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]
  );
});

test("replays card-target choices by stable IDs and preserves combinations", () => {
  const state = initializeGame({ rootDir, seed: 126 });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  activePlayer.hand = [];
  activePlayer.discard = [];
  activePlayer.wizardProperties = [];
  targetPlayer.hand = [];
  targetPlayer.wizardProperties = [];
  targetPlayer.life.current = 1;
  const firstDiscard = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-return-first")
  );
  const secondDiscard = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-return-second")
  );
  activePlayer.hand = [];
  activePlayer.discard.push(firstDiscard, secondDiscard);
  const attackCard = addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-duplicate-choice", [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 1,
        targetSelector: "chosenPlayer",
        onKill: [{ effectId: "return_discard_to_hand", amount: 1 }],
      },
    ])
  );

  const branches = enumerateImmediateActionBranches(state).filter(
    (branch) =>
      branch.legalAction.type === "playCard" &&
      branch.legalAction.cardInstanceId === attackCard.instanceId
  );
  assert.equal(branches.length, 4);
  const combinationBranches = branches.filter((branch) =>
    branch.selectedChoices[1]?.choiceId.startsWith("return_1_")
  );
  assert.equal(combinationBranches.length, 2);
  assert.equal(
    new Set(
      combinationBranches.map((branch) => branch.selectedChoices[1]?.choiceId)
    ).size,
    2
  );
  assert.deepEqual(
    combinationBranches.map((branch) => branch.selectedChoices[1]?.choiceIndex),
    [0, 1]
  );
  assert.deepEqual(
    combinationBranches.map(
      (branch) =>
        [...branch.resultingState.eventLog]
          .reverse()
          .find(
            (event) =>
              event.type === "effectChoiceSelected" &&
              event.effectId === "return_discard_to_hand"
          )?.targetCardInstanceIds
    ),
    [[firstDiscard.instanceId], [secondDiscard.instanceId]]
  );
});

test("fails explicitly when replay choice metadata drifts", () => {
  const state = initializeGame({ rootDir, seed: 126 });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];
  activePlayer.wizardProperties = [];
  let targetSelectorReads = 0;
  const driftingEffect: RuntimeEffect = {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 1,
    get targetSelector() {
      targetSelectorReads += 1;
      return targetSelectorReads <= 2 ? "chosenPlayer" : "chosenFoe";
    },
  };
  addFixtureDefinitionToActiveHand(
    state,
    fixtureDefinition("fixture-analysis-replay-drift", [driftingEffect])
  );

  assert.throws(
    () => enumerateImmediateActionBranches(state),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Analysis replay failed/);
      assert.match(
        error.message,
        /choice (metadata changed|index .*out of range)/
      );
      return true;
    }
  );
});

test("ranks turn lines by a caller-supplied policy with stable ties", () => {
  const { state, lines } = rankingFixture();
  const originalLines = [...lines];
  const result = rankTurnLines(
    state,
    lines,
    {
      id: "shorter-line",
      evaluate: ({ line, perspectivePlayerId }) => ({
        score: -line.steps.length,
        components: {
          steps: line.steps.length,
          perspective: perspectivePlayerId === state.activePlayerId ? 1 : 0,
        },
      }),
    },
    state.activePlayerId
  );

  assert.equal(result.criterionId, "shorter-line");
  assert.equal(result.perspectivePlayerId, state.activePlayerId);
  assert.equal(result.rankedLines.length, lines.length);
  assert.equal(result.best, result.rankedLines[0]);
  assert.deepEqual(lines, originalLines);
  assert.deepEqual(
    result.rankedLines.map((entry) => entry.rank),
    [1, 2, 3, 4, 5]
  );
  assert.deepEqual(
    result.rankedLines.map((entry) => entry.enumerationIndex),
    [4, 1, 3, 0, 2]
  );
  assert.equal(result.rankedLines[0]?.components?.["steps"], 1);
});

test("preserves negative scores and rejects non-finite evaluations", () => {
  const { state, lines } = rankingFixture();
  const policy = (score: number) => ({
    id: `score-${score}`,
    evaluate: () => ({ score }),
  });
  assert.equal(
    rankTurnLines(state, lines, policy(-1), state.activePlayerId).best?.score,
    -1
  );
  for (const score of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    assert.throws(
      () => rankTurnLines(state, lines, policy(score), state.activePlayerId),
      new RegExp(`score-${String(score)}.*enumeration index 0`)
    );
  }
  assert.throws(
    () =>
      rankTurnLines(
        state,
        lines,
        {
          id: "bad-component",
          evaluate: () => ({ score: 0, components: { detail: Number.NaN } }),
        },
        state.activePlayerId
      ),
    /bad-component.*component detail.*enumeration index 0/
  );
});

test("allows different policies to choose different winners", () => {
  const { state, lines } = rankingFixture();
  const shortest = rankTurnLines(
    state,
    lines,
    {
      id: "shortest",
      evaluate: ({ line }) => ({ score: -line.steps.length }),
    },
    state.activePlayerId
  );
  const longest = rankTurnLines(
    state,
    lines,
    {
      id: "longest",
      evaluate: ({ line }) => ({ score: line.steps.length }),
    },
    state.activePlayerId
  );
  assert.notEqual(
    shortest.best?.enumerationIndex,
    longest.best?.enumerationIndex
  );
});

test("returns an empty result and evaluates each line exactly once", () => {
  const { state, lines } = rankingFixture();
  let calls = 0;
  const result = rankTurnLines(
    state,
    [],
    {
      id: "empty",
      evaluate: () => {
        calls += 1;
        return { score: 0 };
      },
    },
    state.activePlayerId
  );
  assert.deepEqual(result.rankedLines, []);
  assert.equal(result.best, undefined);
  rankTurnLines(
    state,
    lines,
    {
      id: "count",
      evaluate: () => {
        calls += 1;
        return { score: 0 };
      },
    },
    state.activePlayerId
  );
  assert.equal(calls, lines.length);
});

test("victory-points policy evaluates the perspective player in terminal state", () => {
  const { state, lines } = rankingFixture();
  const result = rankTurnLines(
    state,
    lines,
    victoryPointsPolicy,
    state.activePlayerId
  );
  assert.equal(result.criterionId, "victory-points");
  assert.equal(result.best?.components?.["victoryPoints"], result.best?.score);
  assert.equal(result.perspectivePlayerId, state.activePlayerId);
});

test("isolates policy mutations from source state and analyzed lines", () => {
  const { state, lines } = rankingFixture();
  const sourceBefore = {
    turn: structuredClone(state.turn),
    playerLives: state.players.map((player) => ({ ...player.life })),
  };
  const linesBefore = lines.map((line) => ({
    steps: structuredClone(line.steps),
    terminalTurn: structuredClone(line.terminalState.turn),
    terminalPlayerLives: line.terminalState.players.map((player) => ({
      ...player.life,
    })),
  }));
  const mutatingPolicy = {
    id: "mutating-policy",
    evaluate: ({ sourceState, line }: TurnLineEvaluationContext) => {
      sourceState.turn.activatedCardIds.push("policy-source-mutation");
      const sourcePlayer = sourceState.players[0];
      if (sourcePlayer !== undefined) {
        sourcePlayer.life.current = -999;
      }
      line.steps.push({
        legalActionIndex: -1,
        action: { type: "endTurn" },
        selectedChoices: [],
      });
      line.terminalState.turn.activatedCardIds.push("policy-line-mutation");
      const terminalPlayer = line.terminalState.players[0];
      if (terminalPlayer !== undefined) {
        terminalPlayer.life.current = -999;
      }
      return { score: line.steps.length };
    },
  };

  const first = rankTurnLines(
    state,
    lines,
    mutatingPolicy,
    state.activePlayerId
  );
  const second = rankTurnLines(
    state,
    lines,
    mutatingPolicy,
    state.activePlayerId
  );

  assert.deepEqual(
    first.rankedLines.map(({ enumerationIndex, score, rank }) => ({
      enumerationIndex,
      score,
      rank,
    })),
    second.rankedLines.map(({ enumerationIndex, score, rank }) => ({
      enumerationIndex,
      score,
      rank,
    }))
  );
  assert.deepEqual(
    {
      turn: state.turn,
      playerLives: state.players.map((player) => ({ ...player.life })),
    },
    sourceBefore
  );
  assert.deepEqual(
    lines.map((line) => ({
      steps: line.steps,
      terminalTurn: line.terminalState.turn,
      terminalPlayerLives: line.terminalState.players.map((player) => ({
        ...player.life,
      })),
    })),
    linesBefore
  );
});
