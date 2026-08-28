import assert from "node:assert/strict";

import {
  applyAction,
  initializeGame,
  runMarketFlow,
  type ActionResult,
  type CardDefinition,
  type CardInstance,
  type ChoicePolicy,
  type GameState,
  type PlayerState,
  type RuntimeEffect,
  type RuntimeEffectId,
} from "../../src/index.js";
import type { LoadedDataPack } from "../../src/engine/data.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../../src/domain/types.js";
import {
  findCardLocation,
  grantTemporaryControl,
  listPhysicalCardLocations,
  movePhysicalCard,
  removeCardFromLocation,
  setCardOwner,
} from "../../src/engine/control-ledger.js";
import { verifiedTestRuntimeEffect } from "./verified-runtime-effect.js";

export type CreateGameScenarioOptions = {
  seed: number;
  playerCount?: number;
} & (
  | {
      rootDir: string;
      dataPackPath?: string;
      dataPack?: never;
    }
  | {
      rootDir?: never;
      dataPackPath?: never;
      dataPack: LoadedDataPack;
    }
  | {
      rootDir?: never;
      dataPackPath?: never;
      dataPack?: never;
      state: GameState;
    }
);

export interface GameScenario {
  readonly state: GameState;
  readonly seed: number;
  readonly activePlayer: PlayerState;
  readonly foes: readonly PlayerState[];
  nextFixtureSequence: number;
}

type PlayerCardZoneName =
  | "deck"
  | "hand"
  | "discard"
  | "playedThisTurn"
  | "permanents";

interface GivenRuntimeCardCommonOptions {
  player?: PlayerState;
  zone?: PlayerCardZoneName;
  instanceId?: string;
}

export type GivenRuntimeCardOptions = GivenRuntimeCardCommonOptions &
  (
    | {
        definitionId: string;
        effects?: never;
        cardId?: never;
        cost?: never;
        isOngoing?: never;
        cardKind?: never;
        cardTypes?: never;
        markers?: never;
        tags?: never;
      }
    | {
        definitionId?: never;
        effects: RuntimeEffect[];
        cardId?: string;
        cost?: number;
        isOngoing?: boolean;
        cardKind?: CardDefinition["visible"]["cardKind"];
        cardTypes?: string[];
        markers?: string[];
        tags?: string[];
      }
  );

type GivenRuntimeCardWithEffects = Extract<
  GivenRuntimeCardOptions,
  { effects: RuntimeEffect[] }
>;

export function createGameScenario(
  options: CreateGameScenarioOptions
): GameScenario {
  const state =
    "state" in options
      ? options.state
      : "dataPack" in options
        ? initializeGame({
            dataPack: options.dataPack,
            seed: options.seed,
            ...(options.playerCount === undefined
              ? {}
              : { playerCount: options.playerCount }),
          })
        : initializeGame({
            rootDir: options.rootDir,
            seed: options.seed,
            ...(options.dataPackPath === undefined
              ? {}
              : { dataPackPath: options.dataPackPath }),
            ...(options.playerCount === undefined
              ? {}
              : { playerCount: options.playerCount }),
          });

  return {
    state,
    seed: options.seed,
    get activePlayer() {
      const player = state.players.find(
        (candidate) => candidate.playerId === state.activePlayerId
      );
      assert.ok(player);
      return player;
    },
    get foes() {
      return state.players.filter(
        (player) => player.playerId !== state.activePlayerId
      );
    },
    nextFixtureSequence: 1,
  };
}

export function givenRuntimeCard(
  scenario: GameScenario,
  options: GivenRuntimeCardOptions
): CardInstance {
  return givenRuntimeCardInternal(scenario, options, true);
}

export function givenUnverifiedRuntimeCard(
  scenario: GameScenario,
  options: GivenRuntimeCardWithEffects
): CardInstance {
  return givenRuntimeCardInternal(scenario, options, false);
}

function givenRuntimeCardInternal(
  scenario: GameScenario,
  options: GivenRuntimeCardOptions,
  verifyEffects: boolean
): CardInstance {
  const player = options.player ?? scenario.activePlayer;
  const sequence = scenario.nextFixtureSequence;
  scenario.nextFixtureSequence += 1;

  const definitionId =
    "definitionId" in options && options.definitionId !== undefined
      ? options.definitionId
      : registerFixtureDefinition(scenario, options, sequence, verifyEffects);
  assert.ok(scenario.state.cardDefinitions.has(definitionId));

  const card: CardInstance = {
    instanceId: markCardInstanceId(
      options.instanceId ?? `fixture-scenario-${scenario.seed}-${sequence}`
    ),
    definitionId: markCardDefinitionId(definitionId),
    ownerId: player.playerId,
    marketChips: 0,
  };
  player[options.zone ?? "hand"].push(card);
  return card;
}

export function givenTemporaryControl(
  scenario: GameScenario,
  card: CardInstance,
  controller: PlayerState
): CardInstance {
  grantTemporaryControl(scenario.state, card.instanceId, controller.playerId);
  return card;
}

export function choosePlayerTargetForEffect(
  scenario: GameScenario,
  effectId: RuntimeEffectId,
  target: PlayerState
): void {
  chooseEffect(scenario, ({ effectId: requestedEffectId, choices }) => {
    if (requestedEffectId !== effectId) {
      return undefined;
    }
    const choice = choices.find(
      (candidate) => candidate.choiceId === target.playerId
    );
    return choice === undefined ? undefined : { choiceId: choice.choiceId };
  });
}

export function toChoiceSelection(
  choice: { readonly choiceId: string } | undefined
): { readonly choiceId: string } | undefined {
  return choice === undefined ? undefined : { choiceId: choice.choiceId };
}

export function chooseEffect(
  scenario: GameScenario,
  selector: ChoicePolicy
): void {
  scenario.state.effectChoiceStrategy = selector;
}

export function resolveMayhemThroughMarket(
  scenario: GameScenario,
  source: CardInstance,
  deck: "mainDeck" | "legendDeck"
) {
  const sourceLocation = findCardLocation(scenario.state, source.instanceId);
  assert.ok(sourceLocation);
  clearPhysicalCardZone(scenario, deck);
  const moved = movePhysicalCard(
    scenario.state,
    source.instanceId,
    deck,
    "front",
    sourceLocation.zoneName
  );
  assert.deepEqual(moved.ok, true);
  clearPhysicalCardZone(
    scenario,
    deck === "mainDeck" ? "mainMarket" : "legendMarket"
  );
  setCardOwner(source, "common");
  return runMarketFlow(scenario.state, { mode: "turn" });
}

export function putOnCommonDeck(
  scenario: GameScenario,
  card: CardInstance,
  deck: "mainDeck" | "legendDeck"
): void {
  const sourceLocation = findCardLocation(scenario.state, card.instanceId);
  assert.ok(sourceLocation);
  const moved = movePhysicalCard(
    scenario.state,
    card.instanceId,
    deck,
    "front",
    sourceLocation.zoneName
  );
  assert.deepEqual(moved.ok, true);
  setCardOwner(card, "common");
}

export function clearPhysicalCardZone(
  scenario: GameScenario,
  zoneName: string
): void {
  const cards = listPhysicalCardLocations(scenario.state)
    .filter((location) => location.zoneName === zoneName)
    .map((location) => location.card);
  for (const card of cards) {
    assert.ok(removeCardFromLocation(scenario.state, card.instanceId));
  }
}

export function play(
  scenario: GameScenario,
  card: CardInstance | CardInstance["instanceId"]
): ActionResult {
  return applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: typeof card === "string" ? card : card.instanceId,
  });
}

export function endTurn(scenario: GameScenario): ActionResult {
  return applyAction(scenario.state, { type: "endTurn" });
}

function registerFixtureDefinition(
  scenario: GameScenario,
  options: GivenRuntimeCardWithEffects,
  sequence: number,
  verifyEffects: boolean
): string {
  const cardId =
    options.cardId ??
    `fixture-scenario-definition-${scenario.seed}-${sequence}`;
  const cardTypes = options.cardTypes ?? [];
  const isOngoing = options.isOngoing ?? false;
  const definition: CardDefinition = {
    schemaVersion: 1,
    cardId,
    source: { image: `assets/cards/fixtures/${cardId}.png` },
    visible: {
      nameRu: `Fixture scenario ${sequence}`,
      cost: options.cost ?? 0,
      victoryPoints: 0,
      typeRu: null,
      cardKind: options.cardKind ?? "normal",
      cardTypes,
      markers: options.markers ?? (isOngoing ? ["ongoing"] : []),
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind: options.cardKind ?? "normal",
      cardTypes,
      ...(options.tags === undefined ? {} : { tags: [...options.tags] }),
      cost: options.cost ?? 0,
      victoryPoints: 0,
      isOngoing,
      marketChipMarker: false,
      effects: options.effects.map((effect) =>
        verifyEffects ? verifiedTestRuntimeEffect(effect) : effect
      ),
      unsupportedMechanics: [],
    },
  };
  scenario.state.cardDefinitions = new Map([
    ...scenario.state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  return definition.cardId;
}
