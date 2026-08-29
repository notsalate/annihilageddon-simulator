import assert from "node:assert/strict";
import test from "node:test";

import {
  createAnalyzerDiagnostics,
  enumerateTurnLines,
  forkGameState,
  initializeGame,
  rankTurnLines,
  runAnalyzerBenchmark,
  runAnalyzerDiagnostic,
  intakeRuntimeData,
  type AnalysisLimits,
  type CardDefinition,
  type GameState,
  type RuntimeEffect,
  type TurnLineEvaluationPolicy,
} from "../src/index.js";
import { victoryPointsPolicy } from "../src/engine/best-move-policies.js";
import { addFixtureDefinitionToActiveHand } from "./helpers/fixture-cards.js";
import { verifiedTestRuntimeEffect } from "./helpers/verified-runtime-effect.js";

const rootDir = process.cwd();
const limits: AnalysisLimits = {
  maxChoiceDepth: 8,
  maxBranchesPerAction: 32,
  maxActionsPerLine: 2,
  maxTurnLines: 16,
};

function emptyTurnState(): GameState {
  const state = initializeGame({ rootDir, seed: 377 });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.hand = [];
  activePlayer.permanents = [];
  activePlayer.wizardProperties = [];
  activePlayer.statuses = [];
  activePlayer.trophyLikeObjects = [];
  activePlayer.unboughtFamiliars = [];
  activePlayer.deck = [];
  activePlayer.discard = [];
  state.common.market = [];
  state.common.legendMarket = [];
  state.common.mainDeck = [];
  state.common.legendDeck = [];
  state.common.wildMagicStack = [];
  return state;
}

function lineSignature(lines: ReturnType<typeof enumerateTurnLines>) {
  return lines.map((line) => ({
    terminalReason: line.terminalReason,
    steps: line.steps.map((step) => step.action),
    winnerPlayerId: line.winnerPlayerId,
  }));
}

function choiceCardDefinition(): CardDefinition {
  const effect: RuntimeEffect = {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 1,
    targetSelector: "chosenPlayer",
  };
  return {
    schemaVersion: 1,
    cardId: "fixture-analyzer-choice-card",
    source: { image: "assets/cards/fixtures/fixture-analyzer-choice-card.png" },
    visible: {
      nameRu: "fixture-analyzer-choice-card",
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
      effects: [verifiedTestRuntimeEffect(effect)],
      unsupportedMechanics: [],
    },
  };
}

test("diagnostic session counts enumeration and ranking work without changing lines", () => {
  const state = emptyTurnState();
  const plainLines = enumerateTurnLines(state, limits);
  const diagnostics = createAnalyzerDiagnostics();
  const instrumentedLines = enumerateTurnLines(state, limits, diagnostics);
  const ranked = rankTurnLines(
    state,
    instrumentedLines,
    victoryPointsPolicy,
    state.activePlayerId,
    diagnostics
  );
  const report = diagnostics.snapshot();

  assert.deepEqual(lineSignature(instrumentedLines), lineSignature(plainLines));
  assert.equal(ranked.rankedLines.length, instrumentedLines.length);
  assert.equal(report.total.actionApplications, 1);
  assert.equal(report.total.gameStateClones, 1);
  assert.equal(report.total.choicePathReplays, 0);
  assert.equal(report.total.intermediateStates, 0);
  assert.equal(report.total.terminalStates, 1);
  assert.equal(report.phases.enumeration.terminalStates, 1);
  assert.equal(report.phases.ranking.gameStateClones, 0);
  assert.equal(report.phases.evaluationPolicy.invocations, 1);
  assert.equal(report.phases.evaluationPolicy.operations.gameStateClones, 0);
  assert.ok(report.total.pathItemsCopied > 0);
  assert.equal(report.phases.enumeration.eventLogCopyOperations, 0);
  assert.equal(report.phases.enumeration.eventLogEntriesCopied, 0);
});

test("diagnostic instrumentation does not remain on analyzer states", () => {
  const state = emptyTurnState();
  const diagnostics = createAnalyzerDiagnostics();

  const lines = enumerateTurnLines(state, limits, diagnostics);
  rankTurnLines(
    state,
    lines,
    victoryPointsPolicy,
    state.activePlayerId,
    diagnostics
  );

  assert.equal(state.physicalCardDiagnostics, undefined);
  for (const line of lines) {
    assert.equal(line.terminalState.physicalCardDiagnostics, undefined);
  }
});

test("diagnostic session classifies every physical card point search", () => {
  const diagnostics = createAnalyzerDiagnostics();

  diagnostics.recordPointLocationSearch("temporaryControl");
  diagnostics.recordPointLocationSearch("knownCard");
  diagnostics.recordPointLocationSearch("effectiveTypeSelection");
  diagnostics.recordPointLocationSearch("gainedCardRecord");
  diagnostics.recordPointLocationSearch("effectSource");
  diagnostics.recordPointLocationSearch("unclassifiedId");
  diagnostics.recordPointLocationSearch("removeById");
  diagnostics.recordPointLocationSearch("reorderById");
  diagnostics.recordPointLocationSearch("moveById");

  const total = diagnostics.snapshot().total;
  assert.equal(total.pointLocationSearches, 9);
  assert.equal(total.temporaryControlLocationSearches, 1);
  assert.equal(total.knownCardLocationSearches, 1);
  assert.equal(total.effectiveTypeSelectionLocationSearches, 1);
  assert.equal(total.gainedCardRecordLocationSearches, 1);
  assert.equal(total.effectSourceLocationSearches, 1);
  assert.equal(total.unclassifiedIdLocationSearches, 1);
  assert.equal(total.physicalCardRemovalSearches, 1);
  assert.equal(total.physicalCardReorderSearches, 1);
  assert.equal(total.physicalCardMoveSearches, 1);
  assert.equal(
    total.temporaryControlLocationSearches +
      total.knownCardLocationSearches +
      total.effectiveTypeSelectionLocationSearches +
      total.gainedCardRecordLocationSearches +
      total.effectSourceLocationSearches +
      total.unclassifiedIdLocationSearches +
      total.physicalCardRemovalSearches +
      total.physicalCardReorderSearches +
      total.physicalCardMoveSearches,
    total.pointLocationSearches
  );
});

test("diagnostic session counts physical changes made by evaluation policy", () => {
  const state = emptyTurnState();
  state.runtimeMode = "fixture";
  addFixtureDefinitionToActiveHand(state, choiceCardDefinition());
  const diagnostics = createAnalyzerDiagnostics();
  const lines = enumerateTurnLines(state, limits, diagnostics);
  const mutatingPolicy: TurnLineEvaluationPolicy = {
    id: "fixture-mutating-policy",
    evaluate: ({ sourceState }) => {
      const player = sourceState.players.find(
        (candidate) => candidate.playerId === sourceState.activePlayerId
      );
      const card = player?.hand[0];
      if (player !== undefined && card !== undefined) {
        player.hand = player.hand.slice(1);
        player.discard = [...player.discard, card];
      }
      return { score: 0 };
    },
  };

  rankTurnLines(
    state,
    lines,
    mutatingPolicy,
    state.activePlayerId,
    diagnostics
  );

  assert.ok(
    diagnostics.snapshot().phases.evaluationPolicy.operations
      .physicalLocationChanges > 0
  );
});

test("diagnostic session counts choice-path replays and generated branches", () => {
  const state = emptyTurnState();
  state.runtimeMode = "fixture";
  addFixtureDefinitionToActiveHand(state, choiceCardDefinition());
  const diagnostics = createAnalyzerDiagnostics();

  const branches = enumerateTurnLines(state, limits, diagnostics);
  const report = diagnostics.snapshot();

  assert.ok(branches.length > 1);
  assert.equal(report.total.choicePathExpansions, 1);
  assert.equal(report.total.choiceBranchesGenerated, 2);
  assert.equal(report.total.choicePathReplays, 2);
  assert.equal(report.total.intermediateStates, 2);
  assert.equal(report.total.terminalStates, 3);
});

test("diagnostic session reports physical location work for every branch attempt", () => {
  const state = emptyTurnState();
  state.runtimeMode = "fixture";
  addFixtureDefinitionToActiveHand(state, choiceCardDefinition());
  const diagnostics = createAnalyzerDiagnostics();

  const lines = enumerateTurnLines(state, limits, diagnostics);
  const report = diagnostics.snapshot();
  const distribution = report.branchSearchDistribution;

  assert.ok(lines.length > 1);
  assert.deepEqual(report.total, {
    actionApplications: 6,
    gameStateClones: 6,
    choicePathReplays: 2,
    choicePathExpansions: 1,
    choiceBranchesGenerated: 2,
    intermediateStates: 2,
    terminalStates: 3,
    pathCopyOperations: 6,
    pathItemsCopied: 9,
    eventLogCopyOperations: 0,
    eventLogEntriesCopied: 0,
    pointLocationSearches: 0,
    temporaryControlLocationSearches: 0,
    knownCardLocationSearches: 0,
    effectiveTypeSelectionLocationSearches: 0,
    gainedCardRecordLocationSearches: 0,
    effectSourceLocationSearches: 0,
    unclassifiedIdLocationSearches: 0,
    physicalCardRemovalSearches: 0,
    physicalCardReorderSearches: 0,
    physicalCardMoveSearches: 0,
    physicalZonePasses: 42,
    physicalCardsViewed: 58,
    fullLocationListsBuilt: 2,
    locationRecordsCreated: 58,
    physicalLocationChanges: 5,
  });
  assert.equal(distribution.branchAttempts, report.total.actionApplications);
  assert.ok(
    distribution.totalPointLocationSearches <=
      report.total.pointLocationSearches
  );
  assert.deepEqual(distribution, {
    branchAttempts: 6,
    totalPointLocationSearches: 0,
    averagePointLocationSearches: 0,
    buckets: {
      zero: 6,
      one: 0,
      twoToThree: 0,
      fourToSeven: 0,
      eightOrMore: 0,
    },
  });
  assert.equal(
    distribution.buckets.zero +
      distribution.buckets.one +
      distribution.buckets.twoToThree +
      distribution.buckets.fourToSeven +
      distribution.buckets.eightOrMore,
    distribution.branchAttempts
  );
  assert.equal(
    distribution.averagePointLocationSearches,
    distribution.branchAttempts === 0
      ? 0
      : distribution.totalPointLocationSearches / distribution.branchAttempts
  );
  for (const metric of [
    "actionApplications",
    "gameStateClones",
    "choicePathReplays",
    "choicePathExpansions",
    "choiceBranchesGenerated",
    "intermediateStates",
    "terminalStates",
    "pathCopyOperations",
    "pathItemsCopied",
    "eventLogCopyOperations",
    "eventLogEntriesCopied",
    "pointLocationSearches",
    "temporaryControlLocationSearches",
    "knownCardLocationSearches",
    "effectiveTypeSelectionLocationSearches",
    "gainedCardRecordLocationSearches",
    "effectSourceLocationSearches",
    "unclassifiedIdLocationSearches",
    "physicalCardRemovalSearches",
    "physicalCardReorderSearches",
    "physicalCardMoveSearches",
    "physicalZonePasses",
    "physicalCardsViewed",
    "fullLocationListsBuilt",
    "locationRecordsCreated",
    "physicalLocationChanges",
  ] as const) {
    assert.equal(report.phases.enumeration[metric], report.total[metric]);
    assert.equal(report.phases.ranking[metric], 0);
    assert.equal(report.phases.evaluationPolicy.operations[metric], 0);
  }
});

test("diagnostic workload preserves the clean Analyzer result fingerprint", () => {
  const template = emptyTurnState();
  const dependencies = {
    intakeDataPack: (dataRootDir: string, dataPackPath: string) =>
      intakeRuntimeData({
        rootDir: dataRootDir,
        dataPackPath,
      }),
    initialize: () => forkGameState(template),
  };
  const clean = runAnalyzerBenchmark({
    rootDir,
    role: "current",
    profile: "light",
    dependencies,
  });
  const diagnostic = runAnalyzerDiagnostic({
    rootDir,
    role: "current",
    profile: "light",
    dependencies,
  });

  assert.equal(diagnostic.workloadFingerprint, clean.workloadFingerprint);
  assert.equal(
    diagnostic.workloadVolumeFingerprint,
    clean.workloadVolumeFingerprint
  );
  assert.equal(diagnostic.resultFingerprint, clean.resultFingerprint);
  assert.ok(diagnostic.counters.total.actionApplications > 0);
  assert.ok(diagnostic.counters.total.gameStateClones > 0);
  assert.ok(diagnostic.counters.total.choicePathReplays >= 0);
  assert.ok(diagnostic.timings.enumerationMs >= 0);
  assert.ok(diagnostic.timings.rankingMs >= 0);
  assert.ok(diagnostic.timings.evaluationPolicyMs >= 0);
});
