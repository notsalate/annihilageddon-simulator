import type {
  CardDefinition,
  CardInstance,
  GameState,
  PlayerState,
  RuntimeEffect,
} from "../../src/index.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../../src/domain/types.js";

export interface FixtureDefenseOptions {
  costs?: Exclude<RuntimeEffect["costs"], undefined>;
  branchEffects?: RuntimeEffect[];
  redirectAttack?: boolean;
}

export function selectFirstFixtureDefense(
  request: Parameters<NonNullable<GameState["effectChoiceStrategy"]>>[0]
): ReturnType<NonNullable<GameState["effectChoiceStrategy"]>> {
  if (request.effectId !== "avoid_attack") {
    return undefined;
  }
  return request.choices.find(
    (choice) => choice.choiceKind === "defense" && choice.card !== undefined
  );
}

export function addFixtureDefenseCardToHand(
  state: GameState,
  player: PlayerState,
  destination: "discardSelf" | "topdeckSelf",
  options: FixtureDefenseOptions = {}
): CardInstance {
  const definition: CardDefinition = {
    schemaVersion: 1,
    cardId: `fixture-defense-${player.playerId}-${destination}-${player.hand.length + 1}`,
    source: { image: "assets/cards/fixtures/fixture-defense.png" },
    visible: {
      nameRu: `Fixture defense ${destination}`,
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
      effects: [
        {
          effectId: "avoid_attack",
          timing: "onDefense",
          destination,
          ...(options.redirectAttack === undefined
            ? {}
            : { redirectAttack: options.redirectAttack }),
          ...(options.costs === undefined ? {} : { costs: options.costs }),
          ...(options.branchEffects === undefined
            ? {}
            : { branchEffects: options.branchEffects }),
        },
      ],
      unsupportedMechanics: [],
    },
  };
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);

  const card: CardInstance = {
    instanceId: markCardInstanceId(
      `fixture-defense-card-${player.playerId}-${player.hand.length + 1}`
    ),
    definitionId: markCardDefinitionId(definition.cardId),
    ownerId: player.playerId,
    marketChips: 0,
  };
  player.hand.push(card);
  return card;
}
