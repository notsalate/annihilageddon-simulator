import type { CardDefinition, TokenDefinition } from "./data.js";
import type {
  CardInstance,
  GameState,
  PlayerId,
  PlayerState,
  StatusInstance,
  TokenInstance,
  TrophyLikeInstance,
} from "./setup.js";
import {
  isRuntimeEffectTarget,
  type RuntimeEffect,
  type RuntimeEffectTarget,
} from "./runtime-effect.js";

export type EffectiveValueKind =
  | "cardCost"
  | "cardVictoryPoints"
  | "tokenVictoryPoints"
  | "playerVictoryPoints"
  | "playerMaxLife";

export type EffectiveValueTarget =
  | {
      targetType: "card";
      definitionId: CardDefinition["cardId"];
    }
  | {
      targetType: "token";
      definitionId: TokenDefinition["tokenId"];
    }
  | {
      targetType: "player";
    };

export interface ControlledObjectView {
  playerId: PlayerId;
  cards: readonly ControlledCardObject[];
  tokens: readonly ControlledTokenObject[];
  wizardProperties: readonly ControlledTokenObject[];
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

export function buildControlledObjectView(
  state: GameState,
  playerId: PlayerId
): ControlledObjectView {
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId
  );
  if (player === undefined) {
    throw new Error(`Missing player ${playerId}`);
  }

  return {
    playerId,
    cards: getControlledCards(state, player).map((card) => ({
      sourceType: "controlledCard" as const,
      card,
      definition: mustGetCardDefinition(state, card.definitionId),
    })),
    tokens: player.deadWizardTokens.map((token) => ({
      sourceType: "controlledToken" as const,
      token,
      definition: mustGetTokenDefinition(state, token.definitionId),
    })),
    wizardProperties: player.wizardProperties.map((token) => ({
      sourceType: "controlledToken" as const,
      token,
      definition: mustGetTokenDefinition(state, token.definitionId),
    })),
    statuses: [...player.statuses],
    trophyLikeObjects: [...player.trophyLikeObjects],
  };
}

export function getControlledCards(
  state: GameState,
  player: PlayerState
): CardInstance[] {
  const permanentIds = new Set(
    player.permanents.map((card) => card.instanceId)
  );
  const temporarilyControlled = state.turn.temporaryCardControls
    .filter((control) => control.controllerId === player.playerId)
    .map((control) => findCardInstance(state, control.cardInstanceId))
    .filter((card): card is CardInstance => card !== undefined)
    .filter((card) => !permanentIds.has(card.instanceId));
  return [...player.permanents, ...temporarilyControlled];
}

function findCardInstance(
  state: GameState,
  cardInstanceId: CardInstance["instanceId"]
): CardInstance | undefined {
  for (const player of state.players) {
    const card = [
      ...player.deck,
      ...player.hand,
      ...player.discard,
      ...player.playedThisTurn,
      ...player.permanents,
    ].find((candidate) => candidate.instanceId === cardInstanceId);
    if (card !== undefined) {
      return card;
    }
  }
  return undefined;
}

export function calculateEffectiveCardCost(
  state: GameState,
  playerId: PlayerId,
  definition: CardDefinition
): number {
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
  card?: CardInstance
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
    scoringCards: getOwnedScoringCards(state, playerId),
    ...(card === undefined ? {} : { scoredCard: card }),
  });
}

export function calculateEffectiveTokenVictoryPoints(
  state: GameState,
  playerId: PlayerId,
  definition: TokenDefinition
): number {
  if (definition.kind !== "deadWizardToken") {
    throw new Error(`Token ${definition.tokenId} does not have victory points`);
  }

  return calculateEffectiveValue({
    state,
    playerId,
    valueKind: "tokenVictoryPoints",
    target: {
      targetType: "token",
      definitionId: definition.tokenId,
    },
    baseValue: definition.victoryPoints,
    scoringCards: getOwnedScoringCards(state, playerId),
  });
}

export function calculateEffectivePlayerVictoryPoints(
  state: GameState,
  playerId: PlayerId,
  baseValue: number
): number {
  return calculateEffectiveValue({
    state,
    playerId,
    valueKind: "playerVictoryPoints",
    target: {
      targetType: "player",
    },
    baseValue,
    scoringCards: getOwnedScoringCards(state, playerId),
  });
}

export function calculateEffectivePlayerMaxLife(
  state: GameState,
  playerId: PlayerId
): number {
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId
  );
  if (player === undefined) {
    throw new Error(`Missing player ${playerId}`);
  }

  return calculateEffectiveValue({
    state,
    playerId,
    valueKind: "playerMaxLife",
    target: {
      targetType: "player",
    },
    baseValue: player.life.max,
  });
}

export function calculateEffectiveValue(options: {
  state: GameState;
  playerId: PlayerId;
  valueKind: EffectiveValueKind;
  target: EffectiveValueTarget;
  baseValue: number;
  scoringCards?: readonly ControlledCardObject[];
  scoredCard?: CardInstance;
}): number {
  let value = options.baseValue;
  const view = buildControlledObjectView(options.state, options.playerId);

  for (const effect of [
    ...getControlledObjectEffects(view),
    ...getScoringCardEffects(
      options.scoringCards ?? [],
      options.target,
      options.scoredCard
    ),
  ]) {
    if (
      !isModifierEffect(
        options.state,
        effect,
        options.valueKind,
        options.target
      )
    ) {
      continue;
    }

    if (effect["operation"] === "add") {
      value += resolveAdditiveModifierAmount(
        options.state,
        options.playerId,
        effect
      );
    } else if (effect["operation"] === "invertNegative" && value < 0) {
      value = Math.abs(value);
    }
  }

  return value;
}

export function getOwnedScoringCards(
  state: GameState,
  playerId: PlayerId
): ControlledCardObject[] {
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId
  );
  if (player === undefined) {
    throw new Error(`Missing player ${playerId}`);
  }

  return [
    ...player.hand,
    ...player.deck,
    ...player.discard,
    ...player.playedThisTurn,
    ...player.permanents.filter((card) => card.ownerId === player.playerId),
  ].map((card) => ({
    sourceType: "controlledCard" as const,
    card,
    definition: mustGetCardDefinition(state, card.definitionId),
  }));
}

function getControlledObjectEffects(
  view: ControlledObjectView
): RuntimeEffect[] {
  return [
    ...view.cards.flatMap((object) => object.definition.engine.effects),
    ...view.tokens.flatMap((object) => {
      return object.definition.kind === "deadWizardToken"
        ? object.definition.effects
        : (object.definition.engine?.effects ?? []);
    }),
    ...view.wizardProperties.flatMap((object) =>
      getWizardPropertyEffects(object.definition)
    ),
    ...view.statuses.flatMap((status) => status.effects),
    ...view.trophyLikeObjects.flatMap((trophy) => trophy.effects),
  ];
}

function getScoringCardEffects(
  scoringCards: readonly ControlledCardObject[],
  target: EffectiveValueTarget,
  scoredCard: CardInstance | undefined
): RuntimeEffect[] {
  return scoringCards.flatMap((object) => {
    return object.definition.engine.effects.filter((effect) => {
      if (effect.timing !== "whileScoring") {
        return false;
      }

      if (
        target.targetType === "card" &&
        scoredCard !== undefined &&
        isSelfScoringCardEffect(effect, object.definition.cardId)
      ) {
        return object.card.instanceId === scoredCard.instanceId;
      }

      return true;
    });
  });
}

function isSelfScoringCardEffect(
  effect: RuntimeEffect,
  sourceDefinitionId: string
): boolean {
  const target = effect.target;
  return (
    target !== undefined &&
    "targetType" in target &&
    target.targetType === "card" &&
    target.definitionId === sourceDefinitionId
  );
}

function getWizardPropertyEffects(
  definition: TokenDefinition
): RuntimeEffect[] {
  if (definition.kind !== "wizardProperty" || definition.engine === undefined) {
    return [];
  }

  if (!definition.engine.playableInV0 && definition.engine.effects.length > 0) {
    throw new Error(
      `Cannot execute non-playable wizard property ${definition.tokenId}`
    );
  }

  return definition.engine.effects;
}

function isModifierEffect(
  state: GameState,
  effect: RuntimeEffect,
  valueKind: EffectiveValueKind,
  target: EffectiveValueTarget
): effect is RuntimeEffect {
  return (
    (effect.effectId === "fixture_modify_effective_value" ||
      effect.effectId === "modify_effective_value") &&
    (effect.timing === "whileControlled" || effect.timing === "whileScoring") &&
    effect.valueKind === valueKind &&
    hasModifierAmount(effect) &&
    matchesTarget(state, effect.target, target)
  );
}

function hasModifierAmount(effect: RuntimeEffect): boolean {
  if (effect["operation"] === "invertNegative") {
    return true;
  }

  return (
    typeof effect["amount"] === "number" ||
    typeof effect["amountPerOwnedCard"] === "number"
  );
}

function resolveAdditiveModifierAmount(
  state: GameState,
  playerId: PlayerId,
  effect: RuntimeEffect
): number {
  const amount = effect["amount"];
  if (typeof amount === "number") {
    return amount;
  }

  const amountPerOwnedCard = effect["amountPerOwnedCard"];
  if (typeof amountPerOwnedCard !== "number") {
    return 0;
  }

  return (
    amountPerOwnedCard *
    countOwnedScoringCards(state, playerId, effect["countedCardTypes"])
  );
}

function countOwnedScoringCards(
  state: GameState,
  playerId: PlayerId,
  countedCardTypes: unknown
): number {
  if (!Array.isArray(countedCardTypes)) {
    return 0;
  }

  return getOwnedScoringCards(state, playerId).filter((object) => {
    return countedCardTypes.some((cardType) => {
      return (
        typeof cardType === "string" &&
        object.definition.engine.cardTypes.includes(cardType)
      );
    });
  }).length;
}

function matchesTarget(
  state: GameState,
  effectTarget: RuntimeEffectTarget | undefined,
  target: EffectiveValueTarget
): boolean {
  if (effectTarget === undefined || !isRuntimeEffectTarget(effectTarget)) {
    return false;
  }

  if (!("targetType" in effectTarget)) {
    return false;
  }

  if (target.targetType === "player") {
    return effectTarget.targetType === target.targetType;
  }

  if (effectTarget.targetType !== target.targetType) {
    return false;
  }

  if (effectTarget.definitionId === target.definitionId) {
    return true;
  }

  if (
    target.targetType === "token" &&
    effectTarget.targetType === "token" &&
    effectTarget.tokenKind === "deadWizardToken"
  ) {
    const definition = mustGetTokenDefinition(state, target.definitionId);
    return definition.kind === "deadWizardToken";
  }

  if (
    target.targetType === "card" &&
    effectTarget.targetType === "card" &&
    Array.isArray(effectTarget.cardTypes)
  ) {
    const definition = mustGetCardDefinition(state, target.definitionId);
    return effectTarget.cardTypes.some((cardType) => {
      return (
        typeof cardType === "string" &&
        definition.engine.cardTypes.includes(cardType)
      );
    });
  }

  return false;
}

function mustGetCardDefinition(
  state: GameState,
  definitionId: string
): CardDefinition {
  const definition = state.cardDefinitions.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Missing card definition ${definitionId}`);
  }

  return definition;
}

function mustGetTokenDefinition(
  state: GameState,
  definitionId: string
): TokenDefinition {
  const definition = state.tokenDefinitions.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Missing token definition ${definitionId}`);
  }

  return definition;
}
