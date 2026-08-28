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
  assert.equal(report.total.gameStateClones, 3);
  assert.equal(report.total.choicePathReplays, 0);
  assert.equal(report.total.intermediateStates, 0);
  assert.equal(report.total.terminalStates, 1);
  assert.equal(report.phases.enumeration.terminalStates, 1);
  assert.equal(report.phases.ranking.gameStateClones, 2);
  assert.equal(report.phases.evaluationPolicy.invocations, 1);
  assert.ok(report.total.pathItemsCopied > 0);
  assert.ok(report.total.eventLogEntriesCopied > 0);
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
