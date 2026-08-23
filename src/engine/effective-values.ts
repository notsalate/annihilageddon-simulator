import type { CardDefinition, TokenDefinition } from "./data.js";
import type {
  CardInstance,
  GameState,
  PlayerId,
  TokenInstance,
} from "./setup.js";
import {
  buildControlledObjectView,
  listPlayerPlayedThisTurnCards,
  listOwnedScoringCards,
  type ControlledCardObject,
  type ControlledObjectView,
} from "./control-ledger.js";
import {
  type EffectiveValueKind,
  type EffectiveValueModifierEffect,
  type EffectiveValueModifierSource,
  isEffectiveValueModifierEffect,
} from "./effective-value-catalog.js";
import {
  isRuntimeEffectTarget,
  type RuntimeEffect,
  type RuntimeEffectTarget,
} from "./runtime-effect.js";
import {
  requireVerifiedRuntimeEffect,
  type VerifiedRuntimeEffect,
} from "./runtime-effect-verification.js";
import { cardMatchesTypeForPlayer } from "./card-type-runtime.js";
import { isOwnedCardsCountAsCardTypeRuntimeEffect } from "./effect-runtime-card-type.js";

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

const effectiveValueEffectCache = new WeakMap<
  object,
  readonly (VerifiedRuntimeEffect & EffectiveValueModifierEffect)[]
>();

interface EffectiveValueModifierEvaluationContext {
  readonly timing: "whileControlled" | "whileScoring";
  readonly valueKind: EffectiveValueKind;
  readonly targetMatches: (effect: EffectiveValueModifierEffect) => boolean;
  readonly countOwnedScoringCards: (
    countedCardTypes: readonly string[]
  ) => number;
}

type EffectiveValueModifierApplicationResult =
  | { readonly status: "notApplicable" }
  | { readonly status: "resolved"; readonly value: number };

function applyEffectiveValueModifier(
  effect: EffectiveValueModifierEffect,
  context: EffectiveValueModifierEvaluationContext,
  value: number
): EffectiveValueModifierApplicationResult {
  if (
    effect.timing !== context.timing ||
    effect.valueKind !== context.valueKind ||
    !context.targetMatches(effect)
  ) {
    return { status: "notApplicable" };
  }

  if (effect.operation === "invertNegative") {
    return {
      status: "resolved",
      value: value < 0 ? Math.abs(value) : value,
    };
  }

  const amount =
    effect.amount ??
    (effect.amountPerOwnedCard === undefined
      ? undefined
      : effect.amountPerOwnedCard *
        context.countOwnedScoringCards(effect.countedCardTypes ?? []));
  if (amount === undefined || !Number.isSafeInteger(amount)) {
    throw new Error(`${effect.effectId}.amount must be a safe integer`);
  }

  return { status: "resolved", value: value + amount };
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
  card: CardInstance | undefined
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

function calculateEffectiveValue(options: {
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
  let scoringCardTypeIndex:
    | ReadonlyMap<string, ReadonlySet<ControlledCardObject>>
    | undefined;
  const getScoringCardTypeIndex = () => {
    if (scoringCardTypeIndex === undefined) {
      const scoringCards =
        options.scoringCards ??
        getOwnedScoringCards(options.state, options.playerId);
      scoringCardTypeIndex = buildScoringCardTypeIndex(scoringCards);
    }
    return scoringCardTypeIndex;
  };

  for (const { effect, source, timing } of [
    ...getControlledObjectEffects(options.state, options.playerId, view),
    ...getScoringCardEffects(
      options.state,
      options.playerId,
      options.scoringCards ?? []
    ),
  ]) {
    const applied = applyEffectiveValueModifier(
      effect,
      {
        timing,
        valueKind: options.valueKind,
        targetMatches: (modifier) => {
          if (
            !matchesTarget(
              options.state,
              options.playerId,
              modifier.target,
              options.target
            )
          ) {
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
          countOwnedScoringCards(getScoringCardTypeIndex(), countedCardTypes),
      },
      value
    );
    if (applied.status === "resolved") {
      value = applied.value;
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
  readonly effect: VerifiedRuntimeEffect & EffectiveValueModifierEffect;
  readonly source: EffectiveValueSource;
  readonly timing: "whileControlled" | "whileScoring";
}

function getControlledObjectEffects(
  state: GameState,
  playerId: PlayerId,
  view: ControlledObjectView
): EffectiveValueEffect[] {
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId
  );
  if (player === undefined) {
    throw new Error(`Missing player ${playerId}`);
  }
  const playedThisTurnCards = listPlayerPlayedThisTurnCards(player);
  const playedThisTurnIds = new Set(
    playedThisTurnCards.map((card) => card.instanceId)
  );

  return [
    ...playedThisTurnCards.flatMap((card) => {
      const definition = mustGetCardDefinition(state, card.definitionId);
      return toEffectiveValueEffects(
        definition.engine.effects,
        cardEffectSource(state, playerId, card.instanceId, definition.cardId)
      );
    }),
    ...view.cards
      .filter((object) => !playedThisTurnIds.has(object.card.instanceId))
      .flatMap((object) =>
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
  let effectiveEffects = effectiveValueEffectCache.get(effects);
  if (effectiveEffects === undefined) {
    effectiveEffects = effects.flatMap((effect) => {
      const verifiedEffect = requireVerifiedRuntimeEffect(effect);
      return isEffectiveValueModifierEffect(verifiedEffect)
        ? [verifiedEffect]
        : [];
    });
    if (Object.isFrozen(effects)) {
      effectiveValueEffectCache.set(effects, effectiveEffects);
    }
  }

  return effectiveEffects.map((effect) => ({ effect, source, timing }));
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

  if (!definition.engine.playableInV0) {
    const hasExecutableEffect = definition.engine.effects.some(
      (effect) => !isOwnedCardsCountAsCardTypeRuntimeEffect(effect)
    );
    if (hasExecutableEffect) {
      throw new Error(
        `Cannot execute non-playable wizard property ${definition.tokenId}`
      );
    }
    return [];
  }

  return definition.engine.effects;
}

function buildScoringCardTypeIndex(
  scoringCards: readonly ControlledCardObject[]
): ReadonlyMap<string, ReadonlySet<ControlledCardObject>> {
  const index = new Map<string, Set<ControlledCardObject>>();
  for (const object of scoringCards) {
    for (const cardType of new Set(object.definition.engine.cardTypes)) {
      const cards = index.get(cardType) ?? new Set<ControlledCardObject>();
      cards.add(object);
      index.set(cardType, cards);
    }
  }
  return index;
}

function countOwnedScoringCards(
  index: ReadonlyMap<string, ReadonlySet<ControlledCardObject>>,
  countedCardTypes: readonly string[] | undefined
): number {
  if (!Array.isArray(countedCardTypes)) {
    return 0;
  }

  const matchingCards = new Set<ControlledCardObject>();
  for (const cardType of new Set(countedCardTypes)) {
    if (typeof cardType !== "string") {
      continue;
    }
    for (const card of index.get(cardType) ?? []) {
      matchingCards.add(card);
    }
  }
  return matchingCards.size;
}

function matchesTarget(
  state: GameState,
  playerId: PlayerId,
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
        cardMatchesTypeForPlayer(state, playerId, definition, cardType)
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
