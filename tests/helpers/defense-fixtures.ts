import type {
  CardDefinition,
  CardInstance,
  GameState,
  PlayerState,
  RuntimeEffect,
  RuntimeEffectForId,
} from "../../src/index.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../../src/domain/types.js";
import { markRuntimeEffectTreeVerified } from "../../src/engine/runtime-effect-verification.js";

export interface FixtureDefenseOptions {
  costs?: Exclude<RuntimeEffectForId<"avoid_attack">["costs"], undefined>;
  branchEffects?: RuntimeEffect[];
  redirectAttack?: boolean;
}

type DefenseChoiceRequest = Parameters<
  NonNullable<GameState["effectChoiceStrategy"]>
>[0];
type DefenseChoiceResult = ReturnType<
  NonNullable<GameState["effectChoiceStrategy"]>
>;
type FixtureDefenseChoice = Extract<
  DefenseChoiceRequest["choices"][number],
  { choiceKind: "defense" }
>;

export function selectFirstFixtureDefense(
  request: DefenseChoiceRequest
): DefenseChoiceResult {
  if (request.effectId !== "avoid_attack") {
    return undefined;
  }
  const choice = request.choices.find(isFixtureDefenseChoice);
  return choice === undefined ? undefined : { choiceId: choice.choiceId };
}

export function selectFixtureDefenseByInstanceId(
  instanceId: CardInstance["instanceId"]
): NonNullable<GameState["effectChoiceStrategy"]> {
  return (request) => {
    if (request.effectId !== "avoid_attack") {
      return undefined;
    }
    const choice = request.choices.find(
      (choice) =>
        isFixtureDefenseChoice(choice) &&
        choice.targetCardInstanceId === instanceId
    );
    return choice === undefined ? undefined : { choiceId: choice.choiceId };
  };
}

export function addFixtureDefenseCardToHand(
  state: GameState,
  player: PlayerState,
  destination: "discardSelf" | "topdeckSelf",
  options: FixtureDefenseOptions = {}
): CardInstance {
  const sequence = getNextFixtureDefenseSequence(state);
  const defenseEffect = markRuntimeEffectTreeVerified({
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
  });
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
      effects: [defenseEffect],
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
): choice is FixtureDefenseChoice {
  return (
    choice.choiceKind === "defense" &&
    choice.targetCardInstanceId?.startsWith("fixture-defense-card-") === true
  );
}

function getNextFixtureDefenseSequence(state: GameState): number {
  const prefix = `fixture-defense-${state.seed}-`;
  let nextSequence = 1;
  for (const definitionId of state.cardDefinitions.keys()) {
    if (!definitionId.startsWith(prefix)) {
      continue;
    }
    const sequenceText = definitionId.slice(prefix.length).split("-", 1)[0];
    const sequence = Number(sequenceText);
    if (Number.isSafeInteger(sequence) && sequence >= nextSequence) {
      nextSequence = sequence + 1;
    }
  }
  return nextSequence;
}
