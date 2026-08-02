import assert from "node:assert/strict";

import {
  applyAction,
  initializeGame,
  type ActionResult,
  type CardDefinition,
  type CardInstance,
  type GameState,
  type PlayerState,
  type RuntimeEffect,
  type RuntimeEffectChoiceStrategy,
  type RuntimeEffectId,
} from "../../src/index.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../../src/domain/types.js";
import { grantTemporaryControl } from "../../src/engine/control-ledger.js";

export interface CreateGameScenarioOptions {
  rootDir: string;
  seed: number;
  dataPackPath?: string;
  playerCount?: number;
}

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

export function createGameScenario(
  options: CreateGameScenarioOptions
): GameScenario {
  const state = initializeGame({
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
  const player = options.player ?? scenario.activePlayer;
  const sequence = scenario.nextFixtureSequence;
  scenario.nextFixtureSequence += 1;

  const definitionId =
    "definitionId" in options && options.definitionId !== undefined
      ? options.definitionId
      : registerFixtureDefinition(scenario, options, sequence);
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
  grantTemporaryControl(
    scenario.state,
    card.instanceId,
    controller.playerId
  );
  return card;
}

export function choosePlayerTargetForEffect(
  scenario: GameScenario,
  effectId: RuntimeEffectId,
  target: PlayerState
): void {
  chooseEffect(scenario, ({ effectId: requestedEffectId, choices }) =>
    requestedEffectId === effectId
      ? choices.find((choice) => choice.choiceId === target.playerId)
      : undefined
  );
}

export function chooseEffect(
  scenario: GameScenario,
  selector: RuntimeEffectChoiceStrategy
): void {
  scenario.state.effectChoiceStrategy = selector;
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
  options: Extract<GivenRuntimeCardOptions, { effects: RuntimeEffect[] }>,
  sequence: number
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
      effects: options.effects,
      unsupportedMechanics: [],
    },
  };
  scenario.state.cardDefinitions = new Map([
    ...scenario.state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  return definition.cardId;
}
