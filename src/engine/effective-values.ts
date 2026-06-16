import type { CardDefinition, TokenDefinition } from "./data.js";
import type { CardInstance, GameState, PlayerId, StatusInstance, TokenInstance, TrophyLikeInstance } from "./setup.js";

export type EffectiveValueKind = "cardCost" | "cardVictoryPoints" | "tokenVictoryPoints";

export type EffectiveValueTarget =
  | {
      targetType: "card";
      definitionId: CardDefinition["cardId"];
    }
  | {
      targetType: "token";
      definitionId: TokenDefinition["tokenId"];
    };

export interface ControlledObjectView {
  playerId: PlayerId;
  cards: readonly ControlledCardObject[];
  tokens: readonly ControlledTokenObject[];
  statuses: readonly StatusInstance[];
  trophyLikeObjects: readonly TrophyLikeInstance[];
}

export interface ControlledCardObject {
  sourceType: "controlledCard";
  card: CardInstance;
  definition: CardDefinition;
}

export interface ControlledTokenObject {
  sourceType: "controlledToken";
  token: TokenInstance;
  definition: TokenDefinition;
}

export function buildControlledObjectView(state: GameState, playerId: PlayerId): ControlledObjectView {
  const player = state.players.find((candidate) => candidate.playerId === playerId);
  if (player === undefined) {
    throw new Error(`Missing player ${playerId}`);
  }

  return {
    playerId,
    cards: player.permanents.map((card) => ({
      sourceType: "controlledCard" as const,
      card,
      definition: mustGetCardDefinition(state, card.definitionId),
    })),
    tokens: player.deadWizardTokens.map((token) => ({
      sourceType: "controlledToken" as const,
      token,
      definition: mustGetTokenDefinition(state, token.definitionId),
    })),
    statuses: [...player.statuses],
    trophyLikeObjects: [...player.trophyLikeObjects],
  };
}

export function calculateEffectiveCardCost(state: GameState, playerId: PlayerId, definition: CardDefinition): number {
  return calculateEffectiveValue({
    state,
    playerId,
    valueKind: "cardCost",
    target: {
      targetType: "card",
      definitionId: definition.cardId,
    },
    baseValue: definition.engine.cost,
  });
}

export function calculateEffectiveCardVictoryPoints(
  state: GameState,
  playerId: PlayerId,
  definition: CardDefinition,
): number {
  return calculateEffectiveValue({
    state,
    playerId,
    valueKind: "cardVictoryPoints",
    target: {
      targetType: "card",
      definitionId: definition.cardId,
    },
    baseValue: definition.engine.victoryPoints,
  });
}

export function calculateEffectiveTokenVictoryPoints(
  state: GameState,
  playerId: PlayerId,
  definition: TokenDefinition,
): number {
  return calculateEffectiveValue({
    state,
    playerId,
    valueKind: "tokenVictoryPoints",
    target: {
      targetType: "token",
      definitionId: definition.tokenId,
    },
    baseValue: definition.victoryPoints,
  });
}

export function calculateEffectiveValue(options: {
  state: GameState;
  playerId: PlayerId;
  valueKind: EffectiveValueKind;
  target: EffectiveValueTarget;
  baseValue: number;
}): number {
  let value = options.baseValue;
  const view = buildControlledObjectView(options.state, options.playerId);

  for (const effect of getControlledObjectEffects(view)) {
    if (!isModifierEffect(effect, options.valueKind, options.target)) {
      continue;
    }

    if (effect["operation"] === "add") {
      value += effect["amount"];
    }
  }

  return value;
}

function getControlledObjectEffects(view: ControlledObjectView): unknown[] {
  return [
    ...view.cards.flatMap((object) => object.definition.engine.effects),
    ...view.tokens.flatMap((object) => object.definition.effects),
    ...view.statuses.flatMap((status) => status.effects),
    ...view.trophyLikeObjects.flatMap((trophy) => trophy.effects),
  ];
}

function isModifierEffect(
  effect: unknown,
  valueKind: EffectiveValueKind,
  target: EffectiveValueTarget,
): effect is Record<string, unknown> & { amount: number } {
  if (!isRecord(effect)) {
    return false;
  }

  return (
    effect["effectId"] === "fixture_modify_effective_value" &&
    effect["timing"] === "whileControlled" &&
    effect["valueKind"] === valueKind &&
    typeof effect["amount"] === "number" &&
    matchesTarget(effect["target"], target)
  );
}

function matchesTarget(effectTarget: unknown, target: EffectiveValueTarget): boolean {
  if (!isRecord(effectTarget)) {
    return false;
  }

  return effectTarget["targetType"] === target.targetType && effectTarget["definitionId"] === target.definitionId;
}

function mustGetCardDefinition(state: GameState, definitionId: string): CardDefinition {
  const definition = state.cardDefinitions.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Missing card definition ${definitionId}`);
  }

  return definition;
}

function mustGetTokenDefinition(state: GameState, definitionId: string): TokenDefinition {
  const definition = state.tokenDefinitions.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Missing token definition ${definitionId}`);
  }

  return definition;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
