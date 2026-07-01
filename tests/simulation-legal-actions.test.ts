import assert from "node:assert/strict";
import test from "node:test";

import {
  runSingleGame,
  type CardDefinition,
  type GameState,
  type TokenDefinition,
} from "../src/index.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

const fixturePermanentDefinition = {
  schemaVersion: 1,
  cardId: "fixture-activation-permanent",
  visible: {
    nameRu: "Fixture Activation Permanent",
    cost: 0,
    victoryPoints: 0,
    typeRu: "Заклинание",
    cardKind: "normal",
    cardTypes: ["spell"],
    markers: ["ongoing", "activate"],
  },
  engine: {
    runtimeSchema: "krutagidon.cardDefinition.v0",
    mappingStatus: "fixture",
    playableInV0: true,
    cardKind: "normal",
    cardTypes: ["spell"],
    cost: 0,
    victoryPoints: 0,
    isOngoing: true,
    marketChipMarker: false,
    effects: [
      {
        effectId: "add_power",
        timing: "activation",
        amount: 1,
      },
    ],
    unsupportedMechanics: [],
  },
} satisfies CardDefinition;

const fixtureWizardPropertyDefinition = {
  schemaVersion: 1,
  tokenId: "fixture-activation-wizard-property",
  runtimeSchema: "krutagidon.tokenDefinition.v0",
  kind: "wizardProperty",
  visible: {
    textRu: "☼: +1 мощь.",
    sourceLabel: "Fixture Activation Property",
  },
  engine: {
    mappingStatus: "fixture",
    playableInV0: true,
    effects: [
      {
        effectId: "add_power",
        timing: "activation",
        amount: 1,
      },
    ],
    unsupportedMechanics: [],
  },
} satisfies TokenDefinition;

const permanentInstanceId = "fixture-activation-permanent-instance";
const wizardPropertyInstanceId = "fixture-activation-wizard-property-instance";

test("single-game simulation accepts activation actions selected by a bot", () => {
  let prepared = false;

  const result = runSingleGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    maxTurns: 3,
    bot: {
      chooseAction({ state, legalActions }) {
        if (!prepared) {
          addActivationFixturesToActivePlayer(state);
          prepared = true;
          return { type: "endTurn" };
        }

        const permanentActivation = legalActions.find(
          (action) => action.type === "activatePermanent"
        );
        if (permanentActivation !== undefined) {
          return permanentActivation;
        }

        const wizardPropertyActivation = legalActions.find(
          (action) => action.type === "activateWizardProperty"
        );
        if (wizardPropertyActivation !== undefined) {
          return wizardPropertyActivation;
        }

        return { type: "endTurn" };
      },
    },
  });

  assert.ok(
    result.eventLog.some((event) => {
      return (
        event.type === "cardActivated" &&
        event.cardInstanceId === permanentInstanceId
      );
    })
  );
  assert.ok(
    result.eventLog.some((event) => {
      return (
        event.type === "wizardPropertyActivated" &&
        event.tokenInstanceId === wizardPropertyInstanceId
      );
    })
  );
});

function addActivationFixturesToActivePlayer(state: GameState): void {
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);

  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [fixturePermanentDefinition.cardId, fixturePermanentDefinition],
  ]);
  state.tokenDefinitions = new Map([
    ...state.tokenDefinitions,
    [fixtureWizardPropertyDefinition.tokenId, fixtureWizardPropertyDefinition],
  ]);
  activePlayer.permanents.push({
    instanceId: permanentInstanceId,
    definitionId: fixturePermanentDefinition.cardId,
    ownerId: activePlayer.playerId,
    marketChips: 0,
  });
  activePlayer.wizardProperties.push({
    instanceId: wizardPropertyInstanceId,
    definitionId: fixtureWizardPropertyDefinition.tokenId,
    ownerId: activePlayer.playerId,
  });
}
