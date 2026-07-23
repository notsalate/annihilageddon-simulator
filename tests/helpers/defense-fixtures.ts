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

type DefenseChoiceRequest = Parameters<
  NonNullable<GameState["effectChoiceStrategy"]>
>[0];
type DefenseChoiceResult = ReturnType<
  NonNullable<GameState["effectChoiceStrategy"]>
>;

export function selectFirstFixtureDefense(
  request: DefenseChoiceRequest
): DefenseChoiceResult {
  if (request.effectId !== "avoid_attack") {
    return undefined;
  }
  return request.choices.find(isFixtureDefenseChoice);
}

export function selectFixtureDefenseByInstanceId(
  instanceId: CardInstance["instanceId"]
): NonNullable<GameState["effectChoiceStrategy"]> {
  return (request) => {
    if (request.effectId !== "avoid_attack") {
      return undefined;
    }
    return request.choices.find(
      (choice) =>
        isFixtureDefenseChoice(choice) &&
        choice.card.instanceId === instanceId
    );
  };
}

export function addFixtureDefenseCardToHand(
  state: GameState,
  player: PlayerState,
  destination: "discardSelf" | "topdeckSelf",
  options: FixtureDefenseOptions = {}
): CardInstance {
  const sequence = getNextFixtureDefenseSequence(state);
  const definition: CardDefinition = {
    schemaVersion: 1,
    cardId: `fixture-defense-${state.seed}-${sequence}-${player.playerId}-${destination}`,
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
      `fixture-defense-card-${state.seed}-${sequence}`
    ),
    definitionId: markCardDefinitionId(definition.cardId),
    ownerId: player.playerId,
    marketChips: 0,
  };
  player.hand.push(card);
  return card;
}

function isFixtureDefenseChoice(
  choice: DefenseChoiceRequest["choices"][number]
): choice is Extract<
  DefenseChoiceRequest["choices"][number],
  { choiceKind: "defense"; card: CardInstance }
> {
  return (
    choice.choiceKind === "defense" &&
    choice.card !== undefined &&
    choice.card.definitionId.startsWith("fixture-defense-")
  );
}

function getNextFixtureDefenseSequence(state: GameState): number {
  const prefix = `fixture-defense-${state.seed}-`;
  let nextSequence = 1;
  for (const definitionId of state.cardDefinitions.keys()) {
    if (!definitionId.startsWith(prefix)) {
      continue;
    }
    const sequenceText = definitionId
      .slice(prefix.length)
      .split("-", 1)[0];
    const sequence = Number(sequenceText);
    if (Number.isSafeInteger(sequence) && sequence >= nextSequence) {
      nextSequence = sequence + 1;
    }
  }
  return nextSequence;
}
