import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  baselineBot,
  determineWinnerIds,
  formatSingleGameDebugTrace,
  getGameEndReason,
  initializeGame,
  runMarketFlow,
  runMassSimulation,
  runSingleGame,
  scoreGame,
} from "../src/index.js";
import { decodeCurrentRuntimeDataPack } from "../src/engine/data.js";
import {
  markPlayerId,
  markTokenDefinitionId,
  markTokenInstanceId,
  type PlayerId,
} from "../src/domain/types.js";
import type { BotStrategy } from "../src/engine/simulation.js";
import type { PlayerDecisionView } from "../src/engine/setup.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

type TestRuntimeManifest = {
  cardDefinitionPaths: string[];
  tokenDefinitionPaths: string[];
  decks: Record<string, string>;
  cardStacks: Record<string, string>;
  tokenStacks: Record<string, string>;
  pools: Record<string, string>;
};

test("single-game simulation ignores differing source.image metadata", () => {
  const firstRootDir = createRuntimePackWithStarterImage(
    "assets/cards/starter/esw2_dbg__starter_001.png"
  );
  const secondRootDir = createRuntimePackWithStarterImage(
    "assets/cards/starter/presentation-only-alternate.png"
  );
  const firstDataPack = decodeCurrentRuntimeDataPack(
    firstRootDir,
    "manifest.json"
  );
  const secondDataPack = decodeCurrentRuntimeDataPack(
    secondRootDir,
    "manifest.json"
  );
  assert.equal(firstDataPack.ok, true);
  assert.equal(secondDataPack.ok, true);
  if (!firstDataPack.ok || !secondDataPack.ok) return;

  const firstImage = firstDataPack.value.cardDefinitions.get(
    "esw2_dbg__starter_001"
  )?.source.image;
  const secondImage = secondDataPack.value.cardDefinitions.get(
    "esw2_dbg__starter_001"
  )?.source.image;
  assert.notEqual(firstImage, secondImage);
  assert.equal(existsSync(path.join(firstRootDir, firstImage ?? "")), false);
  assert.equal(existsSync(path.join(secondRootDir, secondImage ?? "")), false);

  const options = { seed: 80809, maxTurns: 8, dataPackPath: "manifest.json" };
  const first = runSingleGame({ ...options, rootDir: firstRootDir });
  const second = runSingleGame({ ...options, rootDir: secondRootDir });

  const firstResult = projectGameResult(first);
  const secondResult = projectGameResult(second);
  assert.deepEqual(firstResult, secondResult);
  assert.equal(firstResult.endReason, "maxTurnsReached");
  assert.equal(firstResult.isGameEnd, false);
  assert.equal(firstResult.turnsElapsed, 8);
});

test("single-game simulation can stop at maxTurns as a non-game termination", () => {
  const result = runSingleGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    maxTurns: 1,
  });

  assert.equal(result.endReason, "maxTurnsReached");
  assert.equal(result.isGameEnd, false);
  assert.equal(result.turnsElapsed, 1);
  assert.equal(result.players.length, 2);
  assert.ok(
    result.eventLog.some((event) => event.type === "botActionSelected")
  );
});

test("bot action selection records turn number and safe action identity for debug trace", () => {
  const result = runSingleGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    maxTurns: 1,
    botFactory() {
      return {
        chooseAction() {
          return { type: "endTurn" };
        },
      };
    },
  });

  const event = result.eventLog.find(
    (candidate) => candidate.type === "botActionSelected"
  );
  assert.ok(event);
  assert.match(event.playerId, /^player-[12]$/);
  assert.equal(event.turnNumber, 1);
  assert.equal(event.actionIdentity, "endTurn");
  assert.equal(event.actionSequence, 1);

  const trace = formatSingleGameDebugTrace(result);
  assert.match(
    trace,
    new RegExp(`Turn 1, Action 1 - ${event.playerId} \\(endTurn\\)`)
  );
  assert.match(trace, /- Bot selected endTurn\./);
  assert.doesNotMatch(trace, /Turn \? - player-[12]/);
});

test("single-game simulation gives each player an isolated stateful bot lifecycle", () => {
  const factoryCalls: PlayerId[] = [];

  const options: Parameters<typeof runSingleGame>[0] & {
    botFactory: (playerId: PlayerId) => BotStrategy;
  } = {
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    maxTurns: 2,
    botFactory(playerId) {
      factoryCalls.push(playerId);
      let playerView: PlayerDecisionView | undefined;
      return {
        chooseAction({ player }) {
          assert.equal(player.playerId, playerId);
          assert.equal(playerView?.playerId ?? playerId, playerId);
          playerView = player;
          return { type: "endTurn" };
        },
      };
    },
  };

  runSingleGame(options);

  assert.deepEqual([...factoryCalls].sort(), [
    markPlayerId("player-1"),
    markPlayerId("player-2"),
  ]);
});

test("bot factory rejects one strategy object with replaced callbacks", () => {
  const sharedStrategy: BotStrategy = {
    chooseAction() {
      return { type: "endTurn" };
    },
  };

  assert.throws(
    () =>
      runSingleGame({
        rootDir,
        dataPackPath: playableRuntimeDataPackPath,
        seed: 60615,
        maxTurns: 2,
        botFactory(playerId) {
          sharedStrategy.chooseAction = ({ player }) => {
            assert.equal(player.playerId, playerId);
            return { type: "endTurn" };
          };
          return sharedStrategy;
        },
      }),
    /BotStrategy object is already assigned to player-[12]/
  );
});

test("bot factory rejects different strategy objects that share a stateful action callback", () => {
  let retainedView: PlayerDecisionView | undefined;
  const sharedChooseAction: BotStrategy["chooseAction"] = ({ player }) => {
    if (
      retainedView !== undefined &&
      retainedView.playerId !== player.playerId
    ) {
      assert.fail(
        `Shared chooseAction retained ${retainedView.playerId}'s private hand (${retainedView.hand.length} cards) while choosing for ${player.playerId}`
      );
    }
    retainedView = player;
    return { type: "endTurn" };
  };

  assert.throws(
    () =>
      runSingleGame({
        rootDir,
        dataPackPath: playableRuntimeDataPackPath,
        seed: 60615,
        maxTurns: 2,
        botFactory() {
          return { chooseAction: sharedChooseAction };
        },
      }),
    /chooseAction callback is already assigned to player-[12]/
  );
});

test("bot factory rejects different strategy objects that share an effect-choice callback", () => {
  const sharedChooseEffectChoice: NonNullable<
    BotStrategy["chooseEffectChoice"]
  > = () => undefined;

  assert.throws(
    () =>
      runSingleGame({
        rootDir,
        dataPackPath: playableRuntimeDataPackPath,
        seed: 60615,
        maxTurns: 2,
        botFactory() {
          return {
            chooseAction() {
              return { type: "endTurn" };
            },
            chooseEffectChoice: sharedChooseEffectChoice,
          };
        },
      }),
    /chooseEffectChoice callback is already assigned to player-[12]/
  );
});

test("bot factory invokes the action callback captured during ownership validation", () => {
  const readsByPlayer = new Map<PlayerId, number>();
  let uncheckedCallbackInvoked = false;
  const uncheckedChooseAction: BotStrategy["chooseAction"] = () => {
    uncheckedCallbackInvoked = true;
    return { type: "endTurn" };
  };

  runSingleGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    maxTurns: 2,
    botFactory(playerId) {
      const capturedChooseAction: BotStrategy["chooseAction"] = ({
        player,
      }) => {
        assert.equal(player.playerId, playerId);
        return { type: "endTurn" };
      };
      return {
        get chooseAction() {
          const readCount = (readsByPlayer.get(playerId) ?? 0) + 1;
          readsByPlayer.set(playerId, readCount);
          return readCount === 1 ? capturedChooseAction : uncheckedChooseAction;
        },
      };
    },
  });

  assert.deepEqual([...readsByPlayer.values()], [1, 1]);
  assert.equal(uncheckedCallbackInvoked, false);
});

test("bot factory captures each optional effect-choice callback once", () => {
  const readsByPlayer = new Map<PlayerId, number>();
  const uncheckedChooseEffectChoice: NonNullable<
    BotStrategy["chooseEffectChoice"]
  > = () => undefined;

  runSingleGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    maxTurns: 2,
    botFactory(playerId) {
      const capturedChooseEffectChoice: NonNullable<
        BotStrategy["chooseEffectChoice"]
      > = () => undefined;
      return {
        chooseAction() {
          return { type: "endTurn" };
        },
        get chooseEffectChoice() {
          const readCount = (readsByPlayer.get(playerId) ?? 0) + 1;
          readsByPlayer.set(playerId, readCount);
          return readCount === 1
            ? capturedChooseEffectChoice
            : uncheckedChooseEffectChoice;
        },
      };
    },
  });

  assert.deepEqual([...readsByPlayer.values()], [1, 1]);
});

test("explicit baseline bot preserves implicit baseline results", () => {
  const options = {
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 80809,
    maxTurns: 8,
  };

  const implicitBaselineResult = runSingleGame(options);
  const explicitBaselineResult = runSingleGame({
    ...options,
    bot: baselineBot,
  });

  assert.deepEqual(explicitBaselineResult, implicitBaselineResult);
});

test("explicit baseline bot defers to botFactory when both are provided", () => {
  const options = {
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    maxTurns: 2,
  };
  const createEndTurnBot = (): BotStrategy => ({
    chooseAction() {
      return { type: "endTurn" };
    },
  });

  const factoryOnlyResult = runSingleGame({
    ...options,
    botFactory: createEndTurnBot,
  });
  const explicitBaselineResult = runSingleGame({
    ...options,
    bot: baselineBot,
    botFactory: createEndTurnBot,
  });

  assert.deepEqual(explicitBaselineResult, factoryOnlyResult);
});

test("custom legacy bot fails before botFactory and strategy execution", () => {
  let chooseActionCalled = false;
  let botFactoryCalled = false;

  assert.throws(
    () =>
      runSingleGame({
        rootDir,
        dataPackPath: playableRuntimeDataPackPath,
        seed: 60615,
        maxTurns: 1,
        playerCount: 2,
        bot: {
          chooseAction() {
            chooseActionCalled = true;
            return { type: "endTurn" };
          },
        },
        botFactory() {
          botFactoryCalled = true;
          return {
            chooseAction() {
              return { type: "endTurn" };
            },
          };
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Custom multiplayer bot must use botFactory");
      return true;
    }
  );
  assert.equal(chooseActionCalled, false);
  assert.equal(botFactoryCalled, false);
});

test("game end reason is dead wizard token exhaustion when the DWT stack is empty", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  state.common.deadWizardTokens = {
    status: "available",
    drawStack: [],
  };

  assert.equal(getGameEndReason(state), "deadWizardTokensExhausted");
});

test("game end reason does not infer market exhaustion outside Market Flow", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });

  state.common.market.pop();
  state.common.mainDeck.splice(0);
  assert.equal(getGameEndReason(state), undefined);

  state.common.market.push(state.common.legendMarket[0]!);
  state.common.legendMarket.pop();
  state.common.legendDeck.splice(0);
  assert.equal(getGameEndReason(state), undefined);
});

test("Market Flow reports main deck exhaustion directly", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  state.common.market.splice(0, 1);
  state.common.mainDeck.splice(0);
  const result = runMarketFlow(state, { mode: "setup" });

  assert.equal(result.ok, true);
  assert.equal(result.gameEndReason, "mainDeckExhausted");
  assert.equal(state.eventLog.at(-1)?.type, "marketFlowFailed");
  assert.equal(
    state.eventLog.some((event) => event.type === "turnStarted"),
    false
  );
});

test("Market Flow reports legend deck exhaustion directly", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  state.common.legendMarket.splice(0, 1);
  state.common.legendDeck.splice(0);
  const result = runMarketFlow(state, { mode: "setup" });

  assert.equal(result.ok, true);
  assert.equal(result.gameEndReason, "legendDeckExhausted");
  assert.equal(state.eventLog.at(-1)?.type, "marketFlowFailed");
  assert.equal(
    state.eventLog.some((event) => event.type === "turnStarted"),
    false
  );
});

test("scoring sums owned cards from scoring zones and applies DWT penalty", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const player = state.players[0]!;
  const legend = state.common.legendMarket.shift();
  assert.ok(legend);
  legend.ownerId = player.playerId;
  player.permanents.push(legend);
  assert.equal(state.common.deadWizardTokens.status, "available");
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-simulation-scoring-dwt-1"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_015"),
      ownerId: "common",
    },
    {
      instanceId: markTokenInstanceId("fixture-simulation-scoring-dwt-2"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_015"),
      ownerId: "common",
    },
  ];
  const firstDwt = state.common.deadWizardTokens.drawStack.shift();
  const secondDwt = state.common.deadWizardTokens.drawStack.shift();
  assert.ok(firstDwt);
  assert.ok(secondDwt);
  firstDwt.ownerId = player.playerId;
  secondDwt.ownerId = player.playerId;
  player.deadWizardTokens.push(firstDwt, secondDwt);
  const expectedCardScore = [
    ...player.hand,
    ...player.deck,
    ...player.discard,
    legend,
  ].reduce((total, card) => {
    return (
      total + state.cardDefinitions.get(card.definitionId)!.engine.victoryPoints
    );
  }, 0);

  const score = scoreGame(state).find(
    (candidate) => candidate.playerId === player.playerId
  );

  assert.ok(score);
  assert.equal(score.legendCount, 1);
  assert.equal(score.deadWizardTokenCount, 2);
  assert.equal(score.victoryPoints, expectedCardScore - 6);
});

test("scoring applies DWT victory points from token definitions", () => {
  const state = initializeGame({
    rootDir,
    seed: 60615,
    dataPackPath: "tests/fixtures/token-data-pack.json",
  });
  const player = state.players[0]!;
  assert.equal(state.common.deadWizardTokens.status, "available");
  const dwt = state.common.deadWizardTokens.drawStack.shift();
  assert.ok(dwt);
  dwt.ownerId = player.playerId;
  player.deadWizardTokens.push(dwt);

  const expectedCardScore = [
    ...player.hand,
    ...player.deck,
    ...player.discard,
  ].reduce((total, card) => {
    return (
      total + state.cardDefinitions.get(card.definitionId)!.engine.victoryPoints
    );
  }, 0);

  const score = scoreGame(state).find(
    (candidate) => candidate.playerId === player.playerId
  );

  assert.ok(score);
  const fixtureDeadWizardToken = state.tokenDefinitions.get(
    "fixture-dead-wizard-token"
  );
  assert.equal(fixtureDeadWizardToken?.kind, "deadWizardToken");
  assert.equal(fixtureDeadWizardToken.victoryPoints, -5);
  assert.equal(score.victoryPoints, expectedCardScore - 5);
});

test("winner determination applies VP, legend count, fewer DWT, then true tie", () => {
  assert.deepEqual(
    determineWinnerIds([
      {
        playerId: markPlayerId("player-1"),
        victoryPoints: 8,
        legendCount: 0,
        deadWizardTokenCount: 0,
      },
      {
        playerId: markPlayerId("player-2"),
        victoryPoints: 7,
        legendCount: 10,
        deadWizardTokenCount: 0,
      },
    ]),
    ["player-1"]
  );
  assert.deepEqual(
    determineWinnerIds([
      {
        playerId: markPlayerId("player-1"),
        victoryPoints: 8,
        legendCount: 1,
        deadWizardTokenCount: 0,
      },
      {
        playerId: markPlayerId("player-2"),
        victoryPoints: 8,
        legendCount: 2,
        deadWizardTokenCount: 3,
      },
    ]),
    ["player-2"]
  );
  assert.deepEqual(
    determineWinnerIds([
      {
        playerId: markPlayerId("player-1"),
        victoryPoints: 8,
        legendCount: 2,
        deadWizardTokenCount: 1,
      },
      {
        playerId: markPlayerId("player-2"),
        victoryPoints: 8,
        legendCount: 2,
        deadWizardTokenCount: 0,
      },
    ]),
    ["player-2"]
  );
  assert.deepEqual(
    determineWinnerIds([
      {
        playerId: markPlayerId("player-1"),
        victoryPoints: 8,
        legendCount: 2,
        deadWizardTokenCount: 0,
      },
      {
        playerId: markPlayerId("player-2"),
        victoryPoints: 8,
        legendCount: 2,
        deadWizardTokenCount: 0,
      },
    ]),
    ["player-1", "player-2"]
  );
});

test("single-game run is reproducible for the same seed and baseline bot", () => {
  const first = runSingleGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 80809,
    maxTurns: 8,
  });
  const second = runSingleGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 80809,
    maxTurns: 8,
  });

  assert.deepEqual(
    projectMeaningfulEventLog(first.eventLog),
    projectMeaningfulEventLog(second.eventLog)
  );
});

test("single-game run keeps a compact golden event projection for stable seeds", () => {
  const projections = [80809, 80810].map((seed) => {
    const result = runSingleGame({
      rootDir,
      dataPackPath: playableRuntimeDataPackPath,
      seed,
      maxTurns: 1,
    });

    return {
      seed,
      endReason: result.endReason,
      turnsElapsed: result.turnsElapsed,
      eventLog: projectMeaningfulEventLog(result.eventLog),
    };
  });

  assert.deepEqual(
    projections.map((projection) => ({
      seed: projection.seed,
      endReason: projection.endReason,
      turnsElapsed: projection.turnsElapsed,
    })),
    [
      { seed: 80809, endReason: "maxTurnsReached", turnsElapsed: 1 },
      { seed: 80810, endReason: "maxTurnsReached", turnsElapsed: 1 },
    ]
  );

  for (const projection of projections) {
    const eventTypes = projection.eventLog.map((event) => event["type"]);

    assert.deepEqual(eventTypes.slice(0, 5), [
      "setupChoiceSelected",
      "setupChoiceSelected",
      "setupChoiceSelected",
      "setupChoiceSelected",
      "gameInitialized",
    ]);
    assert.ok(eventTypes.includes("botActionSelected"));
    assert.ok(eventTypes.includes("cardMoved"));
    assert.ok(eventTypes.includes("cardPlayed"));
    assert.ok(eventTypes.includes("cardBought"));
    assert.deepEqual(eventTypes.slice(-3), [
      "turnEnded",
      "marketFlowCardAdded",
      "turnStarted",
    ]);
    assert.equal(eventTypes.at(-1), "turnStarted");

    const initialized = projection.eventLog.find(
      (event) => event["type"] === "gameInitialized"
    );
    assert.equal(initialized?.["eventSequence"], 1);
    assert.equal(initialized?.["turnNumber"], 1);

    const bought = projection.eventLog.find(
      (event) => event["type"] === "cardBought"
    );
    assert.equal(bought?.["destination"], "discard");
    assert.equal(bought?.["sourceZone"], undefined);
    assert.equal(bought?.["powerBefore"], undefined);
    assert.equal(bought?.["chipsBefore"], undefined);
  }
});

test("mass simulation uses reproducible seed sequence and compact summaries", () => {
  const first = runMassSimulation({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    firstSeed: 9000,
    gameCount: 3,
    maxTurns: 40,
  });
  const second = runMassSimulation({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    firstSeed: 9000,
    gameCount: 3,
    maxTurns: 40,
  });

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.games.map((game) => game.seed),
    [9000, 9001, 9002]
  );
  assert.equal(first.games.length, 3);
  assert.equal(first.aggregate.totalGames, 3);
  assert.equal(
    first.aggregate.tieCount,
    first.games.filter((game) => game.isTie).length
  );
  assert.equal(
    first.aggregate.tieRate,
    first.aggregate.tieCount / first.aggregate.totalGames
  );
  assert.equal(
    first.games.some((game) => "eventLog" in game),
    false
  );
});

function projectMeaningfulEventLog(
  eventLog: ReturnType<typeof runSingleGame>["eventLog"]
): Array<Record<string, string | number>> {
  const compactEvents = eventLog.filter((event) => {
    if (
      event.type === "marketFlowCardAdded" ||
      event.type === "marketEventCardOpened" ||
      event.type === "mayhemDestroyed" ||
      event.type === "megaMayhemDestroyed" ||
      event.type === "marketChipAdded"
    ) {
      return event.actionSequence !== undefined;
    }

    return event.type !== "endTurnCleanupMoved" && event.type !== "handDrawn";
  });

  let compactEventSequence = 0;

  return compactEvents.map((event) => {
    const eventSequence =
      event.eventSequence === undefined ? undefined : ++compactEventSequence;

    const projected = {
      type: event.type,
      eventSequence,
      turnNumber: event.turnNumber,
      actionSequence: event.actionSequence,
      actionIdentity: event.actionIdentity,
      playerId:
        event.type === "marketFlowCardAdded" ? undefined : event.playerId,
      targetPlayerId: event.targetPlayerId,
      cardInstanceId: event.cardInstanceId,
      definitionId: event.definitionId,
      targetCardInstanceId: event.targetCardInstanceId,
      targetDefinitionId: event.targetDefinitionId,
      tokenInstanceId: event.tokenInstanceId,
      tokenDefinitionId: event.tokenDefinitionId,
      effectId: event.effectId,
      amount: event.type === "effectAddPowerApplied" ? event.amount : undefined,
      sourceZone: event.type === "cardMoved" ? event.sourceZone : undefined,
      destinationZone:
        event.type === "cardMoved" ? event.destinationZone : undefined,
      ownerBefore: event.ownerBefore,
      ownerAfter: event.ownerAfter,
      destination: event.destination,
      powerBefore:
        event.type === "effectAddPowerApplied" ? event.powerBefore : undefined,
      powerAfter:
        event.type === "effectAddPowerApplied" ? event.powerAfter : undefined,
      lifeBefore: event.lifeBefore,
      lifeAfter: event.lifeAfter,
      targetLifeBefore: event.targetLifeBefore,
      targetLifeAfter: event.targetLifeAfter,
    };

    return Object.fromEntries(
      Object.entries(projected).filter(([, value]) => value !== undefined)
    ) as Record<string, string | number>;
  });
}

function createRuntimePackWithStarterImage(sourceImage: string): string {
  const packRoot = mkdtempSync(path.join(os.tmpdir(), "simulation-image-"));
  const starterPath = path.join(
    packRoot,
    "starter",
    "esw2_dbg__starter_001.json"
  );
  const starter = JSON.parse(
    readFileSync(
      path.join(
        rootDir,
        "tests/fixtures/runtime-cards/starter/esw2_dbg__starter_001.json"
      ),
      "utf8"
    )
  ) as {
    source: { image: string };
  };
  starter.source.image = sourceImage;
  mkdirSync(path.dirname(starterPath), { recursive: true });
  writeFileSync(starterPath, JSON.stringify(starter), "utf8");
  for (const cardId of ["esw2_dbg__starter_002", "esw2_dbg__starter_003"]) {
    copyFileSync(
      path.join(
        rootDir,
        "tests/fixtures/runtime-cards/starter",
        `${cardId}.json`
      ),
      path.join(packRoot, "starter", `${cardId}.json`)
    );
  }
  const manifest = JSON.parse(
    readFileSync(path.join(rootDir, playableRuntimeDataPackPath), "utf8")
  ) as TestRuntimeManifest;
  manifest.cardDefinitionPaths = manifest.cardDefinitionPaths.map((entry) =>
    entry.endsWith("/starter")
      ? path.join(packRoot, "starter")
      : path.join(rootDir, entry)
  );
  manifest.tokenDefinitionPaths = manifest.tokenDefinitionPaths.map((entry) =>
    path.join(rootDir, entry)
  );
  for (const section of [
    manifest.decks,
    manifest.cardStacks,
    manifest.tokenStacks,
    manifest.pools,
  ]) {
    for (const [name, entry] of Object.entries(section)) {
      section[name] = path.join(rootDir, entry);
    }
  }
  writeFileSync(
    path.join(packRoot, "manifest.json"),
    JSON.stringify(manifest),
    "utf8"
  );
  return packRoot;
}

function projectGameResult(result: ReturnType<typeof runSingleGame>): {
  endReason: string;
  isGameEnd: boolean;
  turnsElapsed: number;
  winnerIds: string[];
  players: Array<{
    playerId: string;
    victoryPoints: number;
    legendCount: number;
    deadWizardTokenCount: number;
  }>;
} {
  return {
    endReason: result.endReason,
    isGameEnd: result.isGameEnd,
    turnsElapsed: result.turnsElapsed,
    winnerIds: result.winnerIds,
    players: result.players.map(
      ({ playerId, victoryPoints, legendCount, deadWizardTokenCount }) => ({
        playerId,
        victoryPoints,
        legendCount,
        deadWizardTokenCount,
      })
    ),
  };
}
