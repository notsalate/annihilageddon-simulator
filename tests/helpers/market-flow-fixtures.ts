import type {
  CardDefinition,
  CardInstance,
  GameState,
  RuntimeEffect,
} from "../../src/index.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../../src/domain/types.js";
import { verifiedTestRuntimeEffect } from "./verified-runtime-effect.js";

export interface CreateTerminalMarketEventFixtureOptions {
  state: GameState;
  eventKind: "mayhem" | "megaMayhem";
  effects: RuntimeEffect[];
}

export interface TerminalMarketEventFixture {
  eventCard: CardInstance;
  fillerCard: CardInstance;
}

export function createTerminalMarketEventFixture({
  state,
  eventKind,
  effects,
}: CreateTerminalMarketEventFixtureOptions): TerminalMarketEventFixture {
  const fixtureId = nextFixtureId(state, eventKind);
  const eventDefinition = createFixtureDefinition(
    `${fixtureId}-event`,
    eventKind,
    effects
  );
  const fillerDefinition = createFixtureDefinition(
    `${fixtureId}-filler`,
    "normal",
    []
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [eventDefinition.cardId, eventDefinition],
    [fillerDefinition.cardId, fillerDefinition],
  ]);

  return {
    eventCard: createCard(
      `${fixtureId}-event-instance`,
      eventDefinition.cardId
    ),
    fillerCard: createCard(
      `${fixtureId}-filler-instance`,
      fillerDefinition.cardId
    ),
  };
}

function nextFixtureId(
  state: GameState,
  eventKind: CreateTerminalMarketEventFixtureOptions["eventKind"]
): string {
  const baseId = `fixture-terminal-market-${eventKind}`;
  let sequence = 1;
  while (state.cardDefinitions.has(`${baseId}-${sequence}-event`)) {
    sequence += 1;
  }
  return `${baseId}-${sequence}`;
}

function createFixtureDefinition(
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
      effects: effects.map((effect) => verifiedTestRuntimeEffect(effect)),
      unsupportedMechanics: [],
    },
  };
}

function createCard(instanceId: string, definitionId: string): CardInstance {
  return {
    instanceId: markCardInstanceId(instanceId),
    definitionId: markCardDefinitionId(definitionId),
    ownerId: "common",
    marketChips: 0,
  };
}
