import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  ActionExecutionError,
  applyAction,
  formatSimulationFailureReport,
  intakeRuntimeData,
  initializeGame,
  runSingleGame,
  SimulationExecutionError,
  type SimulationFailureReport,
} from "../src/index.js";
import {
  createGameScenario,
  givenRuntimeCard,
} from "./helpers/game-scenario.js";
import { withTemporaryEffectRuntimeOperations } from "./helpers/with-temporary-effect-runtime-operations.js";
import { parseSimulationFailureReplayReport } from "../src/engine/simulation.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

test("late action failures stop without restoring a partially mutated state", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 24901,
  });
  const card = givenRuntimeCard(scenario, {
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 2 }],
  });

  assert.throws(
    () =>
      withTemporaryEffectRuntimeOperations(
        "add_power",
        {
          execute(state, player) {
            state.turn.power += 9;
            player.chips += 4;
            return { ok: false, error: "late on-play failure" };
          },
        },
        () =>
          applyAction(scenario.state, {
            type: "playCard",
            cardInstanceId: card.instanceId,
          })
      ),
    (error: unknown) => {
      assert.ok(error instanceof ActionExecutionError);
      assert.equal(error.context.action.type, "playCard");
      assert.equal(error.context.action.cardInstanceId, card.instanceId);
      assert.equal(error.context.turnNumber, 1);
      assert.equal(
        error.context.activePlayerId,
        scenario.activePlayer.playerId
      );
      assert.match(error.message, /late on-play failure/);
      return true;
    }
  );

  assert.equal(scenario.state.turn.power, 9);
  assert.equal(scenario.activePlayer.chips, 4);
  assert.equal(scenario.activePlayer.hand.includes(card), false);
  assert.equal(scenario.activePlayer.playedThisTurn.includes(card), true);
});

test("simulation failure report contains deterministic reproduction context", () => {
  assert.throws(
    () =>
      runSingleGame({
        rootDir,
        dataPackPath: playableRuntimeDataPackPath,
        seed: 24902,
        maxTurns: 3,
        deadWizardTokenCount: 3,
        botFactory: () => ({
          chooseAction: () => ({
            type: "playCard" as const,
            cardInstanceId: "missing-card",
          }),
        }),
      }),
    (error: unknown) => {
      assert.ok(error instanceof SimulationExecutionError);
      assert.equal(error.report.seed, 24902);
      assert.equal(error.report.setup.maxTurns, 3);
      assert.equal(error.report.setup.deadWizardTokenCount, 3);
      assert.equal(error.report.turnNumber, 1);
      assert.equal(error.report.actions.length, 1);
      assert.deepEqual(error.report.actions[0], {
        type: "playCard",
        cardInstanceId: "missing-card",
      });
      assert.ok(error.report.runtimeData.cardDefinitions.length > 0);
      assert.ok(error.report.runtimeData.decks.mainDeck.entries.length > 0);
      assert.ok(
        error.report.runtimeData.tokenStacks.deadWizardTokens?.entries.length
      );
      assert.match(error.report.error.message, /illegal action/);
      assert.ok(error.report.error.stack.length > 0);
      assert.match(error.report.reproduction.command, /--seed 24902/);
      assert.match(
        error.report.reproduction.command,
        /--deadWizardTokenCount 3/
      );
      assert.ok(
        error.report.reproduction.args.includes("--deadWizardTokenCount")
      );
      assert.ok(error.report.eventLog.length > 0);
      return true;
    }
  );
});

test("preloaded Runtime Data is embedded in the reproduction source", () => {
  const dataPack = intakeRuntimeData({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
  });

  assert.throws(
    () =>
      runSingleGame({
        rootDir,
        dataPack,
        seed: 24903,
        maxTurns: 3,
        botFactory: () => ({
          chooseAction: () => ({
            type: "playCard" as const,
            cardInstanceId: "missing-card",
          }),
        }),
      }),
    (error: unknown) => {
      assert.ok(error instanceof SimulationExecutionError);
      assert.equal(
        error.report.runtimeData.manifest.packId,
        "playable-runtime-test-data-pack"
      );
      assert.ok(error.report.runtimeData.decks.mainDeck.entries.length > 0);
      assert.ok(
        error.report.runtimeData.tokenStacks.deadWizardTokens?.entries.length
      );
      assert.deepEqual(error.report.reproduction.args.slice(-2), [
        "--replayReport",
        "<report-path>",
      ]);
      return true;
    }
  );
});

test("saved failure report replays its actions and choices through the CLI", () => {
  const dataPack = intakeRuntimeData({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
  });
  const setupState = initializeGame({ dataPack, seed: 24901 });
  const activePlayer = setupState.players.find(
    (player) => player.playerId === setupState.activePlayerId
  );
  assert.ok(activePlayer);
  const targetCard = activePlayer.hand.find(
    (card) => card.definitionId === "esw2_dbg__starter_003"
  );
  assert.ok(targetCard);

  let actionCall = 0;
  let failureReport: SimulationFailureReport | undefined;
  assert.throws(
    () =>
      runSingleGame({
        rootDir,
        dataPack,
        seed: 24901,
        maxTurns: 3,
        botFactory: () => ({
          chooseAction: () => {
            actionCall += 1;
            return actionCall === 1
              ? { type: "playCard", cardInstanceId: targetCard.instanceId }
              : { type: "playCard", cardInstanceId: "missing-card" };
          },
          chooseEffectChoice: (request) => {
            const choice = request.choices[0];
            return choice === undefined
              ? undefined
              : { choiceId: choice.choiceId };
          },
        }),
      }),
    (error: unknown) => {
      assert.ok(error instanceof SimulationExecutionError);
      failureReport = error.report;
      return true;
    }
  );
  assert.ok(failureReport);
  assert.ok(
    failureReport.choices.some((event) => event.type === "effectChoiceSelected")
  );
  assert.ok(
    failureReport.choices.some(
      (event) =>
        event.type === "setupChoiceSelected" &&
        event.setupChoiceKind === "familiar"
    )
  );

  const reportDirectory = mkdtempSync(
    path.join(tmpdir(), "krutagidon-replay-report-")
  );
  const reportPath = path.join(reportDirectory, "failure.md");
  writeFileSync(
    reportPath,
    formatSimulationFailureReport(
      "2026-08-22T00:00:00.000Z",
      failureReport,
      reportPath
    ),
    "utf8"
  );

  const result = spawnSync(
    process.execPath,
    [
      path.join(rootDir, "dist", "src", "cli", "run-single-game.js"),
      "--seed",
      "24901",
      "--maxTurns",
      "3",
      "--replayReport",
      reportPath,
    ],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /illegal action/);
});

test("simulation failure replay accepts setCardEffectiveType actions", () => {
  const action = {
    type: "setCardEffectiveType",
    cardInstanceId: "fixture-familiar",
    cardType: "legend",
    enabled: true,
  } as const;
  const report = [
    "runtimeData:",
    "```json",
    JSON.stringify({
      manifest: {},
      cardDefinitions: [],
      tokenDefinitions: [],
      decks: {},
      tokenStacks: {},
    }),
    "```",
    "setup:",
    "```json",
    JSON.stringify({ deadWizardTokenCount: 6 }),
    "```",
    "actions:",
    "```json",
    JSON.stringify([action]),
    "```",
    "choices:",
    "```json",
    "[]",
    "```",
  ].join("\n");

  const parsed = parseSimulationFailureReplayReport(report);

  assert.deepEqual(parsed.replay.actions, [action]);
  assert.equal(parsed.deadWizardTokenCount, 6);
});
