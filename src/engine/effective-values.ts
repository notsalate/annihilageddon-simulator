import type { CardDefinition, TokenDefinition } from "./data.js";
import type {
  CardInstance,
  GameState,
  PlayerId,
  TokenInstance,
} from "./setup.js";
import {
  buildControlledObjectView,
  listOwnedScoringCards,
  type ControlledCardObject,
  type ControlledObjectView,
} from "./control-ledger.js";
import {
  type EffectiveValueKind,
  type EffectiveValueModifierCatalogDispatcher,
  type EffectiveValueModifierEffect,
  type EffectiveValueModifierOperation,
  type EffectiveValueModifierOperationResult,
  type EffectiveValueModifierOperationContext,
  type EffectiveValueModifierSource,
} from "./effective-value-catalog.js";
import {
  isRuntimeEffectTarget,
  type RuntimeEffect,
  type RuntimeEffectTarget,
} from "./runtime-effect.js";

type EffectiveValueTarget =
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

type EffectiveValueSource = EffectiveValueModifierSource;

export function applyDecodedEffectiveValueModifier<Result>(
  effect: EffectiveValueModifierEffect,
  context: EffectiveValueModifierOperationContext<Result>
): EffectiveValueModifierOperationResult<Result> {
  if (
    effect.valueKind !== context.valueKind ||
    !context.targetMatches(effect)
  ) {
    return { status: "notApplicable" };
  }

  const apply: EffectiveValueModifierOperation =
    effect.operation === "invertNegative"
      ? (value) => (value < 0 ? Math.abs(value) : value)
      : (value) =>
          value +
          (effect.amount ??
            (effect.amountPerOwnedCard ?? 0) *
              context.countOwnedScoringCards(effect.countedCardTypes ?? []));
  return context.evaluate(apply);
}

export function calculateEffectiveCardCost(
  state: GameState,
  playerId: PlayerId,
  definition: CardDefinition,
  dispatcher: EffectiveValueModifierCatalogDispatcher
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
    dispatcher,
  });
}

export function calculateEffectiveCardVictoryPoints(
  state: GameState,
  playerId: PlayerId,
  definition: CardDefinition,
  card: CardInstance | undefined,
  dispatcher: EffectiveValueModifierCatalogDispatcher
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
    dispatcher,
  });
}

export function calculateEffectiveTokenVictoryPoints(
  state: GameState,
  playerId: PlayerId,
  definition: TokenDefinition,
  dispatcher: EffectiveValueModifierCatalogDispatcher
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
    dispatcher,
  });
}

export function calculateEffectivePlayerVictoryPoints(
  state: GameState,
  playerId: PlayerId,
  baseValue: number,
  dispatcher: EffectiveValueModifierCatalogDispatcher
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
    dispatcher,
  });
}

export function calculateEffectivePlayerMaxLife(
  state: GameState,
  playerId: PlayerId,
  dispatcher: EffectiveValueModifierCatalogDispatcher
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
    dispatcher,
  });
}

function calculateEffectiveValue(options: {
  state: GameState;
  playerId: PlayerId;
  valueKind: EffectiveValueKind;
  target: EffectiveValueTarget;
  baseValue: number;
  dispatcher: EffectiveValueModifierCatalogDispatcher;
  scoringCards?: readonly ControlledCardObject[];
  scoredCard?: CardInstance;
}): number {
  let value = options.baseValue;
  const view = buildControlledObjectView(options.state, options.playerId);

  for (const { effect, source, timing } of [
    ...getControlledObjectEffects(options.state, options.playerId, view),
    ...getScoringCardEffects(
      options.state,
      options.playerId,
      options.scoringCards ?? []
    ),
  ]) {
    const dispatched = options.dispatcher(effect, source, {
      timing,
      valueKind: options.valueKind,
      targetMatches: (modifier) => {
        if (!matchesTarget(options.state, modifier.target, options.target)) {
          return false;
        }
        if (
          options.target.targetType !== "card" ||
          options.scoredCard === undefined ||
          modifier.timing !== "whileScoring" ||
          !isSelfScoringCardEffectTarget(modifier.target, source.definitionId)
        ) {
          return true;
        }
        return source.cardInstanceId === options.scoredCard.instanceId;
      },
      countOwnedScoringCards: (countedCardTypes) =>
        countOwnedScoringCards(
          options.state,
          options.playerId,
          countedCardTypes
        ),
      evaluate: (apply) => {
        value = apply(value);
        return { status: "resolved", result: undefined };
      },
    });
    if (dispatched.status === "error") {
      throw new Error(dispatched.error);
    }
    if (dispatched.status === "notApplicable") {
      continue;
    }
  }

  return value;
}

export function getOwnedScoringCards(
  state: GameState,
  playerId: PlayerId
): ControlledCardObject[] {
  return listOwnedScoringCards(state, playerId);
}

interface EffectiveValueEffect {
  readonly effect: RuntimeEffect;
  readonly source: EffectiveValueSource;
  readonly timing: "whileControlled" | "whileScoring";
}

function getControlledObjectEffects(
  state: GameState,
  playerId: PlayerId,
  view: ControlledObjectView
): EffectiveValueEffect[] {
  return [
    ...view.cards.flatMap((object) =>
      toEffectiveValueEffects(
        object.definition.engine.effects,
        cardEffectSource(
          state,
          playerId,
          object.card.instanceId,
          object.definition.cardId
        )
      )
    ),
    ...view.tokens.flatMap((object) => {
      const effects =
        object.definition.kind === "deadWizardToken"
          ? object.definition.effects
          : (object.definition.engine?.effects ?? []);
      return toEffectiveValueEffects(
        effects,
        deadWizardTokenEffectSource(
          state,
          playerId,
          object.token.instanceId,
          object.definition.tokenId
        )
      );
    }),
    ...view.wizardProperties.flatMap((object) =>
      toEffectiveValueEffects(
        getWizardPropertyEffects(object.definition),
        wizardPropertyEffectSource(
          state,
          playerId,
          object.token.instanceId,
          object.definition.tokenId
        )
      )
    ),
    ...view.statuses.flatMap((status) =>
      toEffectiveValueEffects(
        status.effects,
        cardEffectSource(state, playerId, status.instanceId, status.statusId)
      )
    ),
    ...view.trophyLikeObjects.flatMap((trophy) =>
      toEffectiveValueEffects(
        trophy.effects,
        cardEffectSource(state, playerId, trophy.instanceId, trophy.trophyId)
      )
    ),
  ];
}

function getScoringCardEffects(
  state: GameState,
  playerId: PlayerId,
  scoringCards: readonly ControlledCardObject[]
): EffectiveValueEffect[] {
  return scoringCards.flatMap((object) => {
    return toEffectiveValueEffects(
      object.definition.engine.effects,
      cardEffectSource(
        state,
        playerId,
        object.card.instanceId,
        object.definition.cardId
      ),
      "whileScoring"
    );
  });
}

function toEffectiveValueEffects(
  effects: readonly RuntimeEffect[],
  source: EffectiveValueSource,
  timing: "whileControlled" | "whileScoring" = "whileControlled"
): EffectiveValueEffect[] {
  return effects.map((effect) => ({ effect, source, timing }));
}

function cardEffectSource(
  state: GameState,
  playerId: PlayerId,
  cardInstanceId: string,
  definitionId: string
): EffectiveValueSource {
  return {
    sourceType: "card",
    runtimeMode: state.runtimeMode,
    playerId,
    cardInstanceId,
    definitionId,
  };
}

function wizardPropertyEffectSource(
  state: GameState,
  playerId: PlayerId,
  tokenInstanceId: TokenInstance["instanceId"],
  tokenDefinitionId: string
): EffectiveValueSource {
  return {
    sourceType: "wizardProperty",
    runtimeMode: state.runtimeMode,
    playerId,
    cardInstanceId: tokenInstanceId,
    definitionId: tokenDefinitionId,
    tokenInstanceId,
    tokenDefinitionId,
  };
}

function deadWizardTokenEffectSource(
  state: GameState,
  playerId: PlayerId,
  tokenInstanceId: TokenInstance["instanceId"],
  tokenDefinitionId: string
): EffectiveValueSource {
  return {
    sourceType: "deadWizardToken",
    runtimeMode: state.runtimeMode,
    playerId,
    cardInstanceId: tokenInstanceId,
    definitionId: tokenDefinitionId,
    tokenInstanceId,
    tokenDefinitionId,
  };
}

function isSelfScoringCardEffectTarget(
  effectTarget: RuntimeEffectTarget | undefined,
  sourceDefinitionId: string
): boolean {
  return (
    effectTarget !== undefined &&
    "targetType" in effectTarget &&
    effectTarget.targetType === "card" &&
    effectTarget.definitionId === sourceDefinitionId
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

function countOwnedScoringCards(
  state: GameState,
  playerId: PlayerId,
  countedCardTypes: readonly string[] | undefined
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
